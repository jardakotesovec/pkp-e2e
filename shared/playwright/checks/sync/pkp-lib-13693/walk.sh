#!/usr/bin/env bash
# PR review pkp-lib#13693 (PRs #13696 main, #13703 stable-3_5_0,
# #13704 stable-3_4_0, #13705 stable-3_3_0): lib/pkp/tools/installPluginVersion.php
# on a plugin that ships an email templates file. Removes the plugin's
# default template rows, runs the tool against a dataset fleet's config,
# then prints the PHP warnings/errors the tool emitted, its exit code, the
# site's installed locales and the locales the template's default data was
# written for.
#
# Usage: walk.sh <appRoot> <fleet config> <plugin dir, relative to appRoot> <EMAIL_KEY|-> [php]
# EMAIL_KEY "-" runs the tool on a plugin without email templates (no DB check).
set -u
root=$1 cfg=$2 plugin=$3 key=$4 php=${5:-php}
db=$(sed -n '/^\[database\]/,/^\[/p' "$cfg" | sed -n 's/^name *= *//p' | head -1)
q() { PGPASSWORD=e2e psql -h 127.0.0.1 -U e2e -d "$db" -Atc "$1"; }
has() { [ "$(q "select to_regclass('$1') is not null")" = t ]; }
if [ "$key" != - ]; then
  q "delete from email_templates_default_data where email_key='$key'" >/dev/null
  has email_templates_default && q "delete from email_templates_default where email_key='$key'" >/dev/null
fi
out=$(cd "$root" && PKP_CONFIG_FILE="$cfg" "$php" lib/pkp/tools/installPluginVersion.php "$plugin/version.xml" 2>&1); rc=$?
echo "db=$db plugin=$plugin exit=$rc"
echo "$out" | grep -E -i "warning|notice|deprecated|error|fatal|exception" | sed 's/^/  emitted: /' | head -5
echo "$out" | grep -E -qi "warning|notice|error|fatal|exception" || echo "  emitted: (no warning or error)"
[ "$key" = - ] && exit 0
echo "  site installed_locales: $(q 'select installed_locales from site')"
locs=$(q "select locale from email_templates_default_data where email_key='$key' order by locale" | tr '\n' ' ')
echo "  $key default data: $(echo $locs | wc -w) locale(s): $locs" | cut -c1-400
has email_templates_default && echo "  $key email_templates_default rows: $(q "select count(*) from email_templates_default where email_key='$key'")"
ondisk=$(ls -d "$root/$plugin"/locale/*/ 2>/dev/null | while read d; do [ -f "$d/emails.po" ] && basename "$d"; done | wc -l)
echo "  plugin locales with emails.po on disk: $ondisk"
