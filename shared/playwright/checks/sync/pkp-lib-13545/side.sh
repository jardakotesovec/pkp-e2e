#!/bin/bash
# side.sh <base|head>: PR review pkp/pkp-lib#13543 on PKP's default dataset (OJS), at one side.
# Round 2 (2026-10-21):
#   head: ojs pkp/ojs#5946 37dce66451 (its submodule bumps: lib/pkp pkp-lib#13545 945c3e6cb0,
#         lib/ui-library ui-library#1021 210f63608e), `npm ci` from the PR's lockfile
#   base: ojs main d270741b6b (the PR's base), lib/pkp 45f674d77b and lib/ui-library 9cfb898731 (the shared PRs' bases)
# Round 1 (2026-10-16) ran heads 87b9df9594 / c9cd7d31c4 / 936b915c56 on bases 79c3676d1b / 6ff76591a9 / 9cfb898731.
# then the build and mount, a freshly reset dataset fleet 1 and this folder's walk.js.
# Logs and facts under .reports/pr-13543/.
set -u
side=$1
cd "$(dirname "$0")/../../../../.." || exit 1
R=.reports/pr-13543; S=shared/playwright/checks/sync/pkp-lib-13545; mkdir -p $R
APP=$([ "$side" = base ] && echo d270741b6bbe64d9932d9622e86b4631d8506ef1 || echo 37dce66451f12cab5e46f6d1eccb416652936f84)
PKPLIB=$([ "$side" = base ] && echo 45f674d77b537413e1d0604fde20bf5da449fb9a || echo 945c3e6cb06a5a5b6919b708d7da8b40be5ab9fd)
UI=$([ "$side" = base ] && echo 9cfb898731e5afbfa13932f27056c5d1ac2f6fb2 || echo 210f63608e39168f533414c3782a8a2680e58032)
(cd checkouts/ojs && git checkout -q --detach "$APP" && git submodule update -q lib/pkp lib/ui-library \
  && (git -C lib/pkp cat-file -e $PKPLIB 2>/dev/null || git -C lib/pkp fetch -q origin pull/13545/head) && git -C lib/pkp checkout -q --detach $PKPLIB \
  && (git -C lib/ui-library cat-file -e $UI 2>/dev/null || git -C lib/ui-library fetch -q origin pull/1021/head) && git -C lib/ui-library checkout -q --detach $UI) || { echo "checkout failed"; exit 1; }
echo "$side ojs $(git -C checkouts/ojs rev-parse --short HEAD) lib/pkp $(git -C checkouts/ojs/lib/pkp rev-parse --short HEAD) ui $(git -C checkouts/ojs/lib/ui-library rev-parse --short HEAD)"
(cd checkouts/ojs/lib/pkp && composer install -q --no-interaction) && (cd checkouts/ojs && npm ci --no-audit --no-fund > /dev/null 2>&1 && npm run build > /dev/null 2>&1) || { echo "build failed"; exit 1; }
npm run -s mount > $R/mount-$side.log 2>&1 || { echo "mount failed"; tail -3 $R/mount-$side.log; exit 1; }
npm run -s fleet-prep -- --feature pr-13543 --dataset --reset --apps ojs > $R/prep-$side.log 2>&1 || { echo "prep failed"; tail -5 $R/prep-$side.log; exit 1; }
PROBE_RUN=$side PROBE_FEATURE=pr-13543 PROBE_AGENT=pr node bin/probe.js ojs $S/walk.js > $R/walk-$side.log 2>&1
echo "walk exit $?"
grep '^\[fact\]' $R/walk-$side.log
echo "== $side done"
