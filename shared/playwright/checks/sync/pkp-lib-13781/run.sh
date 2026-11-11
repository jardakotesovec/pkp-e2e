#!/bin/bash
# Kept check for pkp/pkp-lib#13781 (main) and #13780 (stable-3_5_0), issue
# pkp/pkp-lib#13778: the default texts of a locale I9707_WeblateUILocales
# renames (fr_FR -> fr) after an upgrade from 3.3 or 3.4, and the repair of
# a database already upgraded without the fix.
#
#   run.sh <app> <line: main|stable-3_5_0> <from: 3_3|3_3en|3_4> <n> [--repair [--proposed]]
#
# Loads PKP's <from> dataset with every fr_CA replaced by fr_FR (3_3en: the
# 3.3 dataset whose config says `locale = en` instead of `en_US`) into
# dataset fleet <n> of this slot, which runs the checkout's upgrade, then
# prints what the fr defaults look like (inspect.sh). --repair then runs
# I13778_RepairRenamedLocaleDefaults on its own (repair-driver.php; with
# --proposed, the report's proposed fix in proposed-fix.php) and prints
# them again. The variant datasets are built under checkouts/datasets/<app>/
# s<slot>-pr13778-<from>-frFR and removed at the end.
#
# Evidence: docs/reports/pr-review/2026-11-11-pkp-lib-13778.md.
set -euo pipefail
app=$1; line=$2; from=$3; n=$4; shift 4
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
cd "$repo"
slot=$(grep -E '^PKP_E2E_SLOT=' .env | cut -d= -f2 || true)
variant="s${slot:-0}-pr13778-$from-frFR"
src="checkouts/datasets/$app/stable-${from%en}_0/pgsql"
dst="checkouts/datasets/$app/$variant/pgsql"
mkdir -p "$dst"
cp -r "$src/files" "$src/public" "$src/config.inc.php" "$dst/"
sed 's/fr_CA/fr_FR/g' "$src/database.sql" > "$dst/database.sql"
[ "$from" = 3_3en ] && sed -i 's/^locale = en_US/locale = en/' "$dst/config.inc.php"
lineEnv=(); root="checkouts/$app"; db="${app}_test"
[ -n "$slot" ] && [ "$slot" != 0 ] && db="${db}_s$slot"
if [ "$line" != main ]; then lineEnv=(PKP_E2E_LINE="$line"); root="checkouts/$line/$app"; db="${db}_3_5"; fi
db="${db}_ds$n"
env "${lineEnv[@]}" PKP_E2E_DATASET_BRANCH="$variant" npm run "reset:$app" -- --dataset "$n" 2>&1 | grep -E 'upgraded|rror'
rm -rf "checkouts/datasets/$app/$variant"
echo "upgrade log: $(ls -t .reports/datasets/upgrade-*-$app-ds$n.log | head -1) ($(grep -c 'Invalid/unsupported locale' "$(ls -t .reports/datasets/upgrade-*-$app-ds$n.log | head -1)") 'Invalid/unsupported locale' warnings)"
mkdir -p .reports/pr-review-13778
"$here/inspect.sh" "$db" "$app" ".reports/pr-review-13778/$app-$line-$from-ds$n-upgraded"
if [ "${1:-}" = --repair ]; then
    (cd "$root" && PKP_CONFIG_FILE="$PWD/config.test.ds$n.inc.php" php "$here/repair-driver.php" "${2:-}" 2>&1 | grep 'ran in')
    "$here/inspect.sh" "$db" "$app" ".reports/pr-review-13778/$app-$line-$from-ds$n-repaired"
fi
