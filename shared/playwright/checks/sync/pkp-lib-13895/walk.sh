#!/usr/bin/env bash
# PR review pkp-lib#13895 (PRs #13896 main, #13897 stable-3_5_0 + ojs#6127/omp#2596/ops#1529,
# #13898 stable-3_4_0 + ojs#6128/omp#2597/ops#1530): FilterHelper::installFilterGroups()
# updates an installed filter group from filterConfig.xml instead of skipping it.
#
# Usage: walk.sh <line: main|stable-3_5_0|stable-3_4_0> <app> <pr> <older dataset branch> <symbolics, comma-separated> <plugin dir for the tool|-> [<its symbolics>]
# At the PR base (pr-<pr>~1) and then the head (pr-<pr>), checked out in the app's lib/pkp
# (the app stays on its tip; its PR, where there is one, only moves the pointer there):
#   1. reloads dataset fleet 1 from the older branch's dataset, which runs the app's
#      tools/upgrade.php upgrade; compares filter_groups with every filterConfig.xml;
#   2. a trigger counts the UPDATEs on filter_groups; alters the named groups'
#      display name, description and output type (an old schema), runs tools/upgrade.php
#      upgrade at the same version (the Upgrade installer's postInstall), compares;
#   3. runs the upgrade again (nothing should be written);
#   4. alters the tool plugin's groups and runs lib/pkp/tools/installPluginVersion.php on
#      its version.xml, compares ("-": no bundled plugin with filters that the tool can
#      load: it needs <class> in version.xml or an index.php).
# Leaves lib/pkp at the head; the session puts it back.
set -u
line=$1 app=$2 pr=$3 from=$4 syms=$5 plugin=$6 tsyms=${7:-}
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
[ "$line" = main ] && root=$repo/checkouts/$app || root=$repo/checkouts/$line/$app
lib=$root/lib/pkp cfg=$root/config.test.ds1.inc.php
php=php; [ "$line" = stable-3_4_0 ] && php=/usr/bin/php8.2
out=$repo/.reports/sync/pkp-lib-13895/walk; mkdir -p "$out"
le=(); [ "$line" != main ] && le=(PKP_E2E_LINE=$line)
db() { sed -n '/^\[database\]/,/^\[/p' "$cfg" | sed -n 's/^name *= *//p' | head -1; }
q() { PGPASSWORD=e2e psql -h 127.0.0.1 -U e2e -d "$(db)" -Atc "$1"; }
dump() { q "select symbolic, display_name, coalesce(description,'<null>'), input_type, output_type from filter_groups order by symbolic" > "$1"; }
inl() { echo "$1" | sed "s/[^,]*/'&'/g"; }
alter() { q "update filter_groups set display_name='e2e.altered', description='e2e.altered', output_type='xml::schema(https://example.org/old.xsd)' where symbolic in ($(inl "$1"))" ; }
upd() { q "select count(*) from e2e_fg_updates"; }
says() { grep -E -i "Successfully upgraded|Upgrade failed|installed|fatal|exception|error" | grep -v -i "errorlog\|error_log" | head -4 | sed 's/^/    says: /'; }
for ref in base head; do
  [ $ref = base ] && sha=$(git -C "$lib" rev-parse pr-$pr~1) || sha=$(git -C "$lib" rev-parse pr-$pr)
  git -C "$lib" checkout -q --detach "$sha"
  tag=$line-$app-$ref
  echo "### $line/$app $ref: app $(git -C "$root" rev-parse --short=10 HEAD), lib/pkp $(git -C "$lib" rev-parse --short=10 HEAD)"
  echo "  1. dataset $from upgraded to the tip:"
  (cd "$repo" && env "${le[@]}" PKP_E2E_DATASET_BRANCH=$from npm run "reset:$app" -- --dataset 1 > "$out/$tag-reset.log" 2>&1); echo "    reset exit $?"
  grep -E "^dataset:.*(loaded|upgrad|schema|differ)|rror" "$out/$tag-reset.log" | head -5 | sed 's/^/    /'
  dump "$out/$tag-1-upgraded.tsv"; python3 -I "$here/compare.py" "$root" "$out/$tag-1-upgraded.tsv" | sed 's/^/  /'
  q "set client_min_messages=warning; create table if not exists e2e_fg_updates (symbolic text, at timestamp default now());
     create or replace function e2e_fg_upd() returns trigger as \$\$ begin insert into e2e_fg_updates(symbolic) values (new.symbolic); return new; end \$\$ language plpgsql;
     drop trigger if exists e2e_fg_upd on filter_groups; create trigger e2e_fg_upd after update on filter_groups for each row execute function e2e_fg_upd();" >/dev/null
  alter "$syms" >/dev/null; q "truncate e2e_fg_updates" >/dev/null
  echo "  2. altered $syms, then tools/upgrade.php upgrade:"
  (cd "$root" && PKP_CONFIG_FILE="$cfg" $php tools/upgrade.php upgrade > "$out/$tag-2-upgrade.log" 2>&1); echo "    exit $?"; says < "$out/$tag-2-upgrade.log"
  echo "    rows updated: $(upd) ($(q "select string_agg(symbolic, ' ' order by symbolic) from e2e_fg_updates"))"
  dump "$out/$tag-2-altered-upgraded.tsv"; python3 -I "$here/compare.py" "$root" "$out/$tag-2-altered-upgraded.tsv" | sed 's/^/  /'
  q "truncate e2e_fg_updates" >/dev/null
  echo "  3. tools/upgrade.php upgrade again:"
  (cd "$root" && PKP_CONFIG_FILE="$cfg" $php tools/upgrade.php upgrade > "$out/$tag-3-upgrade.log" 2>&1); echo "    exit $?"; says < "$out/$tag-3-upgrade.log"
  echo "    rows updated: $(upd)"
  if [ "$plugin" != - ]; then
  alter "$tsyms" >/dev/null; q "truncate e2e_fg_updates" >/dev/null
  echo "  4. altered $tsyms, then installPluginVersion.php $plugin/version.xml:"
  (cd "$root" && PKP_CONFIG_FILE="$cfg" $php lib/pkp/tools/installPluginVersion.php "$plugin/version.xml" > "$out/$tag-4-tool.log" 2>&1); echo "    exit $?"; says < "$out/$tag-4-tool.log"
  echo "    rows updated: $(upd) ($(q "select string_agg(symbolic, ' ' order by symbolic) from e2e_fg_updates"))"
  dump "$out/$tag-4-tool.tsv"; python3 -I "$here/compare.py" "$root" "$out/$tag-4-tool.tsv" | sed 's/^/  /'
  fi
  q "set client_min_messages=warning; drop trigger if exists e2e_fg_upd on filter_groups; drop function if exists e2e_fg_upd(); drop table if exists e2e_fg_updates" >/dev/null
done
diff <(cut -d'|' -f1- "$out/$line-$app-base-1-upgraded.tsv") "$out/$line-$app-head-1-upgraded.tsv" > "$out/$line-$app-upgrade-base-vs-head.diff" && echo "  dataset upgrade, base vs head filter_groups: identical" || { echo "  dataset upgrade, base vs head filter_groups differ:"; sed 's/^/    /' "$out/$line-$app-upgrade-base-vs-head.diff" | head -20; }
