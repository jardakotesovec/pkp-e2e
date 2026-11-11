#!/usr/bin/env bash
# PR review check: pkp/pkp-lib#13779 (pkp-lib#13784 main, #13783 stable-3_5_0, #13782 stable-3_4_0,
# with submodule-only app PRs). The fix is in the 3.4 upgrade migration
# I7191_InstallSubmissionHelpDefaults::getContextName(), which only an upgrade from 3.3 runs, so the
# suites never reach it. This loads PKP's 3.3 CI dataset into dataset fleet 1 of each app (the reset
# runs the checkout's own `php tools/upgrade.php upgrade`) and prints, for every context, its name and
# the start of its beginSubmissionHelp per locale, plus the upgrade log's usort deprecation lines.
# Run it once with lib/pkp at the PR's parent (before) and once at the PR head (after):
#   shared/playwright/checks/sync/pkp-lib-13779/upgrade-from-3_3.sh <label> [apps...]
#   PKP_E2E_LINE=stable-3_5_0 shared/playwright/checks/sync/pkp-lib-13779/upgrade-from-3_3.sh <label>
# Output: .reports/sync/pr13779/<line>-<label>-<app>.txt; no assertions.
# Recorded 2026-11-11 (VM s1), the dataset's en / fr_CA names, on main, stable-3_5_0 and stable-3_4_0 alike:
#   before: en "Thank you for submitting to the Journal de la connaissance du public." and fr_CA
#           "… à la revue Journal of Public Knowledge." (OMP, OPS the same swap)
#   after:  each locale its own name; the upgrade completes, its log's exceptions unchanged.
# The corner cases (an empty name, every name empty, three locales) are context-name-driver.php,
# run from the app root against the upgraded dataset fleet (it rolls back what it plants):
#   (cd checkouts/ojs && PKP_CONFIG_FILE=$PWD/config.test.ds1.inc.php php \
#     ../../shared/playwright/checks/sync/pkp-lib-13779/context-name-driver.php)
set -euo pipefail
cd "$(dirname "$0")/../../../../.."
label=${1:?label}; shift
apps=${*:-ojs omp ops}
line=${PKP_E2E_LINE:-main}
out=.reports/sync/pr13779; mkdir -p "$out"
for app in $apps; do
    f="$out/$line-$label-$app.txt"
    PKP_E2E_DATASET_BRANCH=stable-3_3_0 npm run -s "reset:$app" -- --dataset 1 > "$f.reset.log" 2>&1 || { echo "$app: reset failed, see $f.reset.log"; tail -5 "$f.reset.log"; continue; }
    db="$(node -e "console.log(require('./bin/apps.js').resolveApp('$app').db)")_ds1"
    case $app in ojs) t=journal_settings; c=journal_id;; omp) t=press_settings; c=press_id;; ops) t=server_settings; c=server_id;; esac
    {
        root="$(node -e "console.log(require('./bin/apps.js').resolveApp('$app').root)")"
        echo "== $line $label $app (db $db, app $(git -C "$root" rev-parse --short=10 HEAD), lib/pkp $(git -C "$root/lib/pkp" rev-parse --short=10 HEAD))"
        PGPASSWORD=e2e psql -h 127.0.0.1 -U e2e "$db" -Atq -F ' | ' -c "
            select n.$c, n.locale, n.setting_value,
                   substr(regexp_replace(h.setting_value, '<[^>]+>', '', 'g'), 1, 110)
            from $t n left join $t h on h.$c = n.$c and h.locale = n.locale and h.setting_name = 'beginSubmissionHelp'
            where n.setting_name = 'name' order by n.$c, n.locale"
        echo "-- upgrade log: usort deprecations: $(grep -c 'Returning bool from comparison' .reports/datasets/upgrade-$line-$app-ds1.log 2>/dev/null | paste -sd' ')"
        grep -h -E '^PHP (Fatal|Warning)|^[A-Za-z]*Exception:|Upgrade failed' .reports/datasets/upgrade-$line-$app-ds1.log 2>/dev/null | head -5 || true
    } > "$f"
    cat "$f"
done
