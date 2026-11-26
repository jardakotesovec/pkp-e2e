#!/usr/bin/env bash
# PR review pkp-lib#13693, round 2 (PRs #13888 main, #13889 stable-3_5_0,
# #13890 stable-3_4_0, #13891 stable-3_3_0, #13892 ore): which locales a
# plugin's default email template data is written for, and the PHP warnings
# emitted, on one install path at a time, against a dataset fleet's config.
#
# Usage: walk.sh <appRoot> <fleet config> <plugin dir, relative to appRoot> <EMAIL_KEY|-> <mode> [php]
#   mode tool          delete the template's default rows, run lib/pkp/tools/installPluginVersion.php
#   mode upgrade       delete them, run tools/upgrade.php upgrade (the Upgrade installer's
#                      postInstall, the path of a site upgrade and a gallery plugin upgrade)
#   mode locale:<code> install a site locale (Locale::installLocale; 3.3 AppLocale::installLocale)
#                      through install-locale.php beside this file; rows are kept
# EMAIL_KEY "-": a plugin without email templates (the tool's run only, no DB check).
set -u
root=$1 cfg=$2 plugin=$3 key=$4 mode=$5 php=${6:-php}
here=$(cd "$(dirname "$0")" && pwd)
db=$(sed -n '/^\[database\]/,/^\[/p' "$cfg" | sed -n 's/^name *= *//p' | head -1)
q() { PGPASSWORD=e2e psql -h 127.0.0.1 -U e2e -d "$db" -Atc "$1"; }
has() { [ "$(q "select to_regclass('$1') is not null")" = t ]; }
if [ "$key" != - ] && [ "${mode%%:*}" != locale ]; then
  q "delete from email_templates_default_data where email_key='$key'" >/dev/null
  has email_templates_default && q "delete from email_templates_default where email_key='$key'" >/dev/null
fi
case $mode in
  tool) out=$(cd "$root" && PKP_CONFIG_FILE="$cfg" "$php" lib/pkp/tools/installPluginVersion.php "$plugin/version.xml" 2>&1) ;;
  upgrade) out=$(cd "$root" && PKP_CONFIG_FILE="$cfg" "$php" tools/upgrade.php upgrade 2>&1) ;;
  locale:*) out=$(cd "$root" && PKP_CONFIG_FILE="$cfg" "$php" "$here/install-locale.php" "${mode#locale:}" 2>&1) ;;
esac
rc=$?
echo "db=$db plugin=$plugin mode=$mode exit=$rc"
echo "$out" | grep -E -i "warning|notice|deprecated|error|fatal|exception" | sed 's/^/  emitted: /' | head -5
echo "$out" | grep -E -qi "warning|notice|error|fatal|exception" || echo "  emitted: (no warning or error)"
echo "$out" | grep -E "Successfully upgraded|Upgrade failed|installed locale" | sed 's/^/  says: /'
[ "$key" = - ] && exit 0
echo "  site installed_locales: $(q 'select installed_locales from site')"
locs=$(q "select distinct locale from email_templates_default_data where email_key='$key' order by locale" | tr '\n' ' ')
echo "  $key default data: $(echo $locs | wc -w) locale(s): $locs" | cut -c1-400
has email_templates_default && echo "  $key email_templates_default rows: $(q "select count(*) from email_templates_default where email_key='$key'")"
ondisk=$(ls -d "$root/$plugin"/locale/*/ 2>/dev/null | while read d; do [ -f "$d/emails.po" ] && basename "$d"; done | wc -l)
echo "  plugin locales with emails.po on disk: $ondisk"
