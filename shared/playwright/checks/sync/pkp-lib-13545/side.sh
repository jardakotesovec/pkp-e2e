#!/bin/bash
# side.sh <base|head|r5|r4|r3>: PR review pkp/pkp-lib#13543 on PKP's default dataset (OJS), at one side.
# Round 6 (2026-11-07):
#   head: ojs pkp/ojs#5946 969433cad9 (its submodule bumps: lib/pkp pkp-lib#13545 6035a6fed8,
#         lib/ui-library ui-library#1021 e5952751), `npm ci` from the PR's lockfile
#   base: ojs main 61efe12241 (the PR's base), lib/pkp d1f20f891e and lib/ui-library 357a18ea (the shared PRs' bases)
#   r5: round 5's heads 988f0a5163 / 2222768ff7 / 6338cf1ded, the control for round 6's change (preview.js)
# Round 5 (2026-11-03) ran heads 988f0a5163 / 2222768ff7 / 6338cf1ded on bases e7ce037799 / 1ae711024a / eb988214e9:
#   head: ojs pkp/ojs#5946 988f0a5163 (its submodule bumps: lib/pkp pkp-lib#13545 2222768ff7,
#         lib/ui-library ui-library#1021 6338cf1ded), `npm ci` from the PR's lockfile
#   base: ojs main e7ce037799 (the PR's base), lib/pkp 1ae711024a and lib/ui-library eb988214e9 (the shared PRs' bases)
#   r4: round 4's heads 481c4bd776 / beaa4b9b3a / 6338cf1ded, the control for round 5's change (cli.php)
# Round 4 (2026-11-02) ran heads 481c4bd776 / beaa4b9b3a / 6338cf1ded on bases bc4a83e9db / 442148e14e / eb988214e9:
#   head: ojs pkp/ojs#5946 481c4bd776 (its submodule bumps: lib/pkp pkp-lib#13545 beaa4b9b3a,
#         lib/ui-library ui-library#1021 6338cf1ded), `npm ci` from the PR's lockfile
#   base: ojs main bc4a83e9db (the PR's base), lib/pkp 442148e14e and lib/ui-library eb988214e9 (the shared PRs' bases)
# Round 3 (2026-10-23) ran heads 4f4cfe83e4 / 927200b331 / 55e00e3a85 on bases 3cf9aa91a8 / 00ce12be77 / e47a48879a;
# Round 2 (2026-10-21) ran heads 37dce66451 / 945c3e6cb0 / 210f63608e on bases d270741b6b / 45f674d77b / 9cfb898731;
# round 1 (2026-10-16) heads 87b9df9594 / c9cd7d31c4 / 936b915c56 on bases 79c3676d1b / 6ff76591a9 / 9cfb898731.
# then the build and mount, and for each of the given walks (default: walk.js newversion.js figure.js race.js math.js)
# a freshly reset dataset fleet 1 (round 6 adds preview.js; cli.php runs when named).
# Logs and facts under .reports/pr-13543/.
set -u
side=$1; shift; WALKS=${*:-walk.js newversion.js figure.js race.js math.js preview.js}
cd "$(dirname "$0")/../../../../.." || exit 1
R=.reports/pr-13543; S=shared/playwright/checks/sync/pkp-lib-13545; mkdir -p $R
APP=$([ "$side" = base ] && echo 61efe1224186c4605522c58852ff5daf73b88e58 || echo 969433cad94eba2264fc6cd84907aca257961ba8)
PKPLIB=$([ "$side" = base ] && echo d1f20f891ea647bbcc8b6573d80e9afaffd4da16 || echo 6035a6fed866eabc4fb297ea653a83b31035d896)
UI=$([ "$side" = base ] && echo 357a18eabf7ef517d4e0f8232804dec381efae13 || echo e5952751241d04b421d5de393a57a9f5e5893c39)
if [ "$side" = r5 ]; then APP=988f0a516329bf2984a046eee650c7a9cca47268; PKPLIB=2222768ff77c8ecc0119ab9825e6632d2701aa92; UI=6338cf1ded19220ee3f4c94b81eb88928b853dea; fi
# r3: round 3's heads, the control for the reviewers' round-4 points (math.js)
if [ "$side" = r4 ]; then APP=481c4bd776569fbd19d6a79061540e245d933b65; PKPLIB=beaa4b9b3ab87afe443b06428dec1d3de64019cb; fi
if [ "$side" = r3 ]; then APP=4f4cfe83e47001cd6174e76632e45387f539afd0; PKPLIB=927200b33130c201ea5b78b8d6c9e4e15aae0ef5; UI=55e00e3a851d33879005470b74fad8885b975076; fi
(cd checkouts/ojs && git checkout -q --detach "$APP" && git submodule update -q lib/pkp lib/ui-library \
  && (git -C lib/pkp cat-file -e $PKPLIB 2>/dev/null || git -C lib/pkp fetch -q origin pull/13545/head $PKPLIB) && git -C lib/pkp checkout -q --detach $PKPLIB \
  && (git -C lib/ui-library cat-file -e $UI 2>/dev/null || git -C lib/ui-library fetch -q origin pull/1021/head) && git -C lib/ui-library checkout -q --detach $UI) || { echo "checkout failed"; exit 1; }
echo "$side ojs $(git -C checkouts/ojs rev-parse --short HEAD) lib/pkp $(git -C checkouts/ojs/lib/pkp rev-parse --short HEAD) ui $(git -C checkouts/ojs/lib/ui-library rev-parse --short HEAD)"
(cd checkouts/ojs/lib/pkp && composer install -q --no-interaction) && (cd checkouts/ojs && npm ci --no-audit --no-fund > /dev/null 2>&1 && npm run build > /dev/null 2>&1) || { echo "build failed"; exit 1; }
npm run -s mount > $R/mount-$side.log 2>&1 || { echo "mount failed"; tail -3 $R/mount-$side.log; exit 1; }
for w in $WALKS; do
  npm run -s fleet-prep -- --feature pr-13543 --dataset --reset --apps ojs > $R/prep-$side-$(basename $w .js).log 2>&1 || { echo "prep failed"; tail -5 $R/prep-$side-$(basename $w .js).log; exit 1; }
  case $w in /*) F=$w ;; *) F=$S/$w ;; esac
  case $w in
    *.php) PKP_CONFIG_FILE=$(realpath checkouts/ojs)/config.test.ds1.inc.php php $F "$(realpath checkouts/ojs)" > $R/$(basename $w .js)-$side.log 2>&1 ;;
    *) PROBE_RUN=$side PROBE_FEATURE=pr-13543 PROBE_AGENT=pr node bin/probe.js ojs $F > $R/$(basename $w .js)-$side.log 2>&1 ;;
  esac
  echo "$w exit $?"
  grep '^\[fact\]' $R/$(basename $w .js)-$side.log
done
echo "== $side done"
