#!/bin/bash
# PR review pkp-lib#13591 round 2: the Crossref reference-DOI lookup
# (CrossrefCitationDoiCheckTask → getResolvedRefs) when Crossref cannot be
# reached. Runs on an OJS dataset fleet after the A18 walk (Crossref enabled,
# submission 1 published with a DOI). Seeds the journal's "citations" setting,
# Crossref credentials, a citation without DOI on submission 1's current
# publication and the submission's check flag, then runs the real task:
#   scheduler.php test --name=APP\plugins\generic\crossref\CrossrefCitationDoiCheckTask
# Base: the ConnectException escapes the task. Head: one logged line, the task
# completes, and the flag stays for the next run.
# usage: citation.sh <ojs root> <fleet db> <fleet config file>
set -u
ROOT=$1; DB=$2; CFG=$3
HERE=$(dirname "$(readlink -f "$0")")
q() { psql -X -q -d "$DB" -tA -c "$1"; }
pub=$(q "select current_publication_id from submissions where submission_id=1")
q "delete from journal_settings where journal_id=1 and setting_name='citations'; insert into journal_settings (journal_id, locale, setting_name, setting_value) values (1, '', 'citations', '1')"
# Credentials through the plugin (the password is encrypted, settings are cached); gates.php prints the task's gates.
(cd "$ROOT" && SEED=1 APP_ROOT="$ROOT" PKP_CONFIG_FILE="$CFG" php "$HERE/gates.php" 2>&1 | sed 's/^/[citation] gates: /')
seq=$(q "select coalesce(max(seq),0)+1 from citations where publication_id=$pub")
q "insert into citations (publication_id, raw_citation, seq) values ($pub, 'Kotesovec, J. (2026). A reference with no DOI. Journal of Tests, 1, 1-2.', $seq)"
q "delete from submission_settings where submission_id=1 and setting_name='crossref::checkCitationsDOIs'; insert into submission_settings (submission_id, locale, setting_name, setting_value) values (1, '', 'crossref::checkCitationsDOIs', '1')"
echo "[citation] seeded: publication $pub doi=$(q "select d.doi from publications p join dois d on d.doi_id=p.doi_id where p.publication_id=$pub") status=$(q "select status from publications where publication_id=$pub") citations without doi=$(q "select count(*) from citations c where c.publication_id=$pub and not exists (select 1 from citation_settings s where s.citation_id=c.citation_id and s.setting_name='doi' and s.setting_value<>'')")"
out=$(cd "$ROOT" && PKP_CONFIG_FILE="$CFG" timeout 120 php lib/pkp/tools/scheduler.php test --name='APP\plugins\generic\crossref\CrossrefCitationDoiCheckTask' 2>&1); rc=$?
echo "[citation] task rc=$rc"
echo "$out" | grep -v '^\s*$' | grep -iE 'exception|error|crossref|running|done|fail' | grep -v '^#' | head -4 | cut -c1-300 | sed 's/^/[citation]   /'
echo "[citation] task log: $(cat "$(ls -t "$(awk -F'= *' '/^files_dir *=/{print $2; exit}' "$CFG")"/scheduledTaskLogs/CrossrefCitation* | head -1)" | sed 's/^.*production\.[A-Z]*: //' | tr '\n' ' ')"
echo "[citation] flag after: $(q "select setting_value from submission_settings where submission_id=1 and setting_name='crossref::checkCitationsDOIs'")"
