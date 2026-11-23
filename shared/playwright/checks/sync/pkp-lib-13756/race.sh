#!/usr/bin/env bash
# pkp/pkp-lib#13756: two overlapping saves of the same context undo each other.
# usage: race.sh <port> <db> <delay seconds|seq>, against an OJS install with the
# PKP test journal (a `npm run cypress -- ojs --keep` run of 10-Installation and
# 20-CreateContext) served by `PHP_CLI_SERVER_WORKERS=4 php -S` (one worker
# serializes the requests and hides the race). Resets the four locale lists to
# ["en"], signs in as admin, sends the Forms tick (save-language-setting) and,
# <delay> later, Add Language (add-languages), then prints the two lists.
set -u
P=$1; DB=$2; D=$3; B=http://127.0.0.1:$P/index.php/publicknowledge
J=/tmp/race-13756-jar-$P; rm -f $J; C="curl -s -b $J -c $J"
export PGPASSWORD=e2e; PSQL="psql -h 127.0.0.1 -U e2e -d $DB -Atc"
$PSQL "update journal_settings set setting_value='[\"en\"]' where setting_name in ('supportedFormLocales','supportedAddedSubmissionLocales','supportedSubmissionLocales','supportedSubmissionMetadataLocales')" >/dev/null
tok=$($C $B/en/login | grep -o 'name="csrfToken" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"//')
$C -o /dev/null --data-urlencode username=admin --data-urlencode password=admin --data-urlencode csrfToken=$tok $B/en/login/signIn
csrf=$($C $B/en/management/settings/website | grep -o '"csrfToken":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
r1() { $C -o /dev/null -w "r1 %{http_code} %{time_total}s\n" -X POST -d csrfToken=$csrf "$B/\$\$\$call\$\$\$/grid/settings/languages/manage-language-grid/save-language-setting?rowId=fr_CA&setting=supportedFormLocales&value=1"; }
r2() { $C -o /dev/null -w "r2 %{http_code} %{time_total}s\n" -X POST -d csrfToken=$csrf -d 'localesToAdd[]=en' -d 'localesToAdd[]=fr_CA' "$B/\$\$\$call\$\$\$/grid/settings/languages/submission-language-grid/add-languages"; }
if [ "$D" = seq ]; then r1; r2; else r1 & sleep $D; r2; wait; fi
$PSQL "select setting_name||'='||setting_value from journal_settings where setting_name in ('supportedFormLocales','supportedAddedSubmissionLocales') order by 1" | tr '\n' ' '; echo
