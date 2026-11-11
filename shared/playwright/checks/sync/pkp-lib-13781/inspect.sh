#!/bin/bash
# Kept with run.sh (pkp/pkp-lib#13781 / #13780, issue #13778).
# inspect.sh <db> <app> <out-prefix> [locale=fr] : what the renamed-locale defaults look like after an upgrade
db=$1; app=$2; out=$3; L=${4:-fr}
case $app in ojs) t=journal_settings; id=journal_id;; omp) t=press_settings; id=press_id;; ops) t=server_settings; id=server_id;; esac
q() { psql -X -d "$db" -tA -F $'\t' -c "$1"; }
echo "== $db ($app) locale=$L"
echo "version: $(q "SELECT major||'.'||minor||'.'||revision||'.'||build FROM versions WHERE current=1 AND product_type='core'")"
echo "installed_locales: $(q "SELECT installed_locales FROM site")"
echo "etdd rows en/$L: $(q "SELECT count(*) FILTER (WHERE locale='en') ||' / '|| count(*) FILTER (WHERE locale='$L') FROM email_templates_default_data")"
echo "etdd $L empty subject+body: $(q "SELECT count(*) FROM email_templates_default_data WHERE locale='$L' AND coalesce(subject,'')='' AND coalesce(body,'')=''") [$(q "SELECT string_agg(email_key,',' ORDER BY email_key) FROM email_templates_default_data WHERE locale='$L' AND coalesce(subject,'')='' AND coalesce(body,'')=''")]"
echo "etdd $L name=key: $(q "SELECT count(*) FROM email_templates_default_data WHERE locale='$L' AND name=email_key")"
echo "etdd $L missing (en only): [$(q "SELECT string_agg(e.email_key,',' ORDER BY e.email_key) FROM email_templates_default_data e WHERE e.locale='en' AND NOT EXISTS (SELECT 1 FROM email_templates_default_data f WHERE f.locale='$L' AND f.email_key=e.email_key)")]"
echo "etdd $L identical to en (subject+body): $(q "SELECT count(*) FROM email_templates_default_data f JOIN email_templates_default_data e ON e.email_key=f.email_key AND e.locale='en' WHERE f.locale='$L' AND f.subject=e.subject AND f.body=e.body")"
echo "etdd stray old-code rows: $(q "SELECT string_agg(DISTINCT locale,',') FROM email_templates_default_data WHERE locale LIKE '%\_%' AND locale NOT IN ('en_US') OR locale LIKE '%@%'")"
for s in beginSubmissionHelp contributorsHelp detailsHelp forTheEditorsHelp reviewHelp uploadFilesHelp; do
  echo "$s: $(q "SELECT string_agg($id||':'||CASE WHEN f.setting_value IS NULL THEN 'absent' WHEN f.setting_value=e.setting_value THEN 'SAME-AS-EN' ELSE 'own:'||left(regexp_replace(f.setting_value,'<[^>]+>','','g'),40) END, ' | ' ORDER BY $id) FROM $t e LEFT JOIN $t f USING ($id, setting_name) WHERE e.setting_name='$s' AND e.locale='en' AND (f.locale='$L' OR f.locale IS NULL)")"
done
echo "checklist $L: $(q "SELECT string_agg($id||':'||left(setting_value,90), ' | ' ORDER BY $id) FROM $t WHERE setting_name='submissionChecklist' AND locale='$L'")"
q "SELECT email_key, name, md5(coalesce(subject,'')||'|'||coalesce(body,'')) FROM email_templates_default_data WHERE locale='$L' ORDER BY email_key" > $out.etdd.tsv
q "SELECT $id, setting_name, md5(setting_value) FROM $t WHERE locale='$L' ORDER BY 1,2" > $out.ctx.tsv
q "SELECT $id, setting_name, setting_value FROM $t WHERE locale='$L' AND (setting_name LIKE '%Help' OR setting_name='submissionChecklist') ORDER BY 1,2" > $out.help.tsv
