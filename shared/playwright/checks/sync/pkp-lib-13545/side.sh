#!/bin/bash
# side.sh <base|head>: PR review pkp/pkp-lib#13543 on PKP's default dataset (OJS), at one side.
# Round 3 (2026-10-23):
#   head: ojs pkp/ojs#5946 4f4cfe83e4 (its submodule bumps: lib/pkp pkp-lib#13545 927200b331,
#         lib/ui-library ui-library#1021 55e00e3a85), `npm ci` from the PR's lockfile
#   base: ojs main 3cf9aa91a8 (the PR's base), lib/pkp 00ce12be77 and lib/ui-library e47a48879a (the shared PRs' bases)
# Round 2 (2026-10-21) ran heads 37dce66451 / 945c3e6cb0 / 210f63608e on bases d270741b6b / 45f674d77b / 9cfb898731;
# round 1 (2026-10-16) heads 87b9df9594 / c9cd7d31c4 / 936b915c56 on bases 79c3676d1b / 6ff76591a9 / 9cfb898731.
# then the build and mount, and for each of the given walks (default: walk.js newversion.js figure.js race.js)
# a freshly reset dataset fleet 1.
# Logs and facts under .reports/pr-13543/.
set -u
side=$1; shift; WALKS=${*:-walk.js newversion.js figure.js race.js}
cd "$(dirname "$0")/../../../../.." || exit 1
R=.reports/pr-13543; S=shared/playwright/checks/sync/pkp-lib-13545; mkdir -p $R
APP=$([ "$side" = base ] && echo 3cf9aa91a8e357f5d95ad9f9bbcad7e7b29424ef || echo 4f4cfe83e47001cd6174e76632e45387f539afd0)
PKPLIB=$([ "$side" = base ] && echo 00ce12be776175920847e3da4910617c47af290c || echo 927200b33130c201ea5b78b8d6c9e4e15aae0ef5)
UI=$([ "$side" = base ] && echo e47a48879a2bc93fda82d7544f8c22a6cc3e2908 || echo 55e00e3a851d33879005470b74fad8885b975076)
(cd checkouts/ojs && git checkout -q --detach "$APP" && git submodule update -q lib/pkp lib/ui-library \
  && (git -C lib/pkp cat-file -e $PKPLIB 2>/dev/null || git -C lib/pkp fetch -q origin pull/13545/head) && git -C lib/pkp checkout -q --detach $PKPLIB \
  && (git -C lib/ui-library cat-file -e $UI 2>/dev/null || git -C lib/ui-library fetch -q origin pull/1021/head) && git -C lib/ui-library checkout -q --detach $UI) || { echo "checkout failed"; exit 1; }
echo "$side ojs $(git -C checkouts/ojs rev-parse --short HEAD) lib/pkp $(git -C checkouts/ojs/lib/pkp rev-parse --short HEAD) ui $(git -C checkouts/ojs/lib/ui-library rev-parse --short HEAD)"
(cd checkouts/ojs/lib/pkp && composer install -q --no-interaction) && (cd checkouts/ojs && npm ci --no-audit --no-fund > /dev/null 2>&1 && npm run build > /dev/null 2>&1) || { echo "build failed"; exit 1; }
npm run -s mount > $R/mount-$side.log 2>&1 || { echo "mount failed"; tail -3 $R/mount-$side.log; exit 1; }
for w in $WALKS; do
  npm run -s fleet-prep -- --feature pr-13543 --dataset --reset --apps ojs > $R/prep-$side-$(basename $w .js).log 2>&1 || { echo "prep failed"; tail -5 $R/prep-$side-$(basename $w .js).log; exit 1; }
  case $w in /*) F=$w ;; *) F=$S/$w ;; esac
  PROBE_RUN=$side PROBE_FEATURE=pr-13543 PROBE_AGENT=pr node bin/probe.js ojs $F > $R/$(basename $w .js)-$side.log 2>&1
  echo "$w exit $?"
  grep '^\[fact\]' $R/$(basename $w .js)-$side.log
done
echo "== $side done"
