#!/usr/bin/env bash
# One side of the PR review of pkp/pkp-lib#13497 (and of its 3.5 twin #13496): puts lib/pkp of the
# three apps at <commit> (and each app at its own commit, when <APP>_AT names one), loads PKP's
# default dataset afresh, and runs the three kept checks of this folder (po-check.js against
# <base>, and against the app's <APP>_BASE when given; render.php; invitation-texts.js). The
# checkouts stay where the side put them.
#
#   [OJS_AT=<sha> OJS_BASE=<sha> OMP_AT=… OMP_BASE=… OPS_AT=… OPS_BASE=…] \
#   shared/playwright/checks/sync/pkp-lib-13497/side.sh <base|head> <commit> <base commit> [stable-3_5_0]
#
# Output: .reports/<feature>/<side>/ (feature sync-12874, or sync-12874-3_5 on the stable line).
set -uo pipefail
side=$1; commit=$2; base=$3; line=${4:-}
here=$(cd "$(dirname "$0")" && pwd); repo=$(cd "$here/../../../../.." && pwd); cd "$repo"
if [ -n "$line" ]; then export PKP_E2E_LINE=$line; feature=sync-12874-3_5; root=checkouts/$line; else feature=sync-12874; root=checkouts; fi
out=.reports/$feature/$side; mkdir -p "$out"
for app in ojs omp ops; do
    at=$(printenv "${app^^}_AT" || true)
    if [ -n "$at" ]; then git -C "$root/$app" checkout -q "$at" || exit 1; fi
    git -C "$root/$app/lib/pkp" checkout -q "$commit" || exit 1
    echo "$app at $(git -C "$root/$app" rev-parse --short=10 HEAD), lib/pkp at $(git -C "$root/$app/lib/pkp" rev-parse --short=10 HEAD)"
done
npm run mount >/dev/null 2>&1
npm run fleet-prep -- --feature "$feature" --dataset 1 --reset 2>&1 | tail -4
for app in ojs omp ops; do
    at=$(printenv "${app^^}_AT" || true); appbase=$(printenv "${app^^}_BASE" || true)
    node "$here/po-check.js" "$root/$app" "$base" "$commit" "$out/po-check-$app.json" ${appbase:+"$appbase" "$at"} > "$out/po-check-$app.txt" 2>&1
    config=$(node -e "console.log(require('./.reports/$feature/fleet.json').apps['$app'].configFile)")
    (cd "$root/$app" && PKP_CONFIG_FILE="$repo/$config" php "$here/render.php") > "$out/render-$app.json" 2> "$out/render-$app.err"
done
PROBE_FEATURE=$feature PROBE_AGENT=p12874 PROBE_RUN=$side node bin/probe.js all "$here/invitation-texts.js" 2>&1 | tail -12
cp .reports/$feature/p12874/*-"$side"-*.json .reports/$feature/p12874/*-"$side"-*.png "$out"/ 2>/dev/null
echo "side $side done: $out"
