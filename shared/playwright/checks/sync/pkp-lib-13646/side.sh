#!/usr/bin/env bash
# PR review of pkp/pkp-lib#13646: one line at one ref, on dataset fleet DS of this slot.
#   shared/playwright/checks/sync/pkp-lib-13646/side.sh <main|3.5> <base|head> [DS]
# Puts the OMP checkout of the line at the ref (base = the PR's parent, head = the PR head; the
# submodule pointers are the same at both), then per walk: dataset fleet reloaded, the issue walk
# run. Last, the previous line's dataset upgraded at the ref (stored.js, then the U28 OMP2 walk); on 3.5
# also the line's own dataset relabelled 3.5.0.5 and upgraded (the 3.5.0.x block). WALKS_SKIP=upgrade skips
# the walks.
set -u
cd "$(dirname "$0")/../../../../.."
LINE=$1 SIDE=$2 DS=${3:-5}
if [ "$LINE" = 3.5 ]; then
  export PKP_E2E_LINE=stable-3_5_0; DIR=checkouts/stable-3_5_0/omp; PREV=stable-3_4_0
  BASE=eb4c0964998bf3f802430396e82444aeccee9c8d; HEAD=72b39e2d44b5891643cab3968ac4ac69b6002a23
else
  DIR=checkouts/omp; PREV=stable-3_5_0
  BASE=22bc3d8d0894f048bd63fbdaa77f209a87c1e25d; HEAD=8eff1e8c2ccac0e67fab346dac93e606fb040e14
fi
REF=$BASE; [ "$SIDE" = head ] && REF=$HEAD
git -C "$DIR" checkout -q --detach "$REF" || exit 1
echo "== $LINE $SIDE omp $(git -C "$DIR" rev-parse --short=10 HEAD) lib/pkp $(git -C "$DIR/lib/pkp" rev-parse --short=10 HEAD)"
F=pr13646-${LINE/./}-$SIDE
I=shared/playwright/checks/issues
WALKS="series-toggle-asks-about-section series-issn-help-which-identifying press-days-to-decision-text-your-journal press-disable-submissions-help-says-articles press-copyright-notice-label-lowercase"
[ "${WALKS_SKIP:-}" = upgrade ] && WALKS=
for w in $WALKS; do
  npm run -s fleet-prep -- --feature $F --dataset $DS --reset --apps omp > /dev/null 2>&1 || { echo "fleet-prep failed ($w)"; continue; }
  echo "-- $w"
  PROBE_RUN=$SIDE PROBE_FEATURE=$F PROBE_AGENT=$w node bin/probe.js omp $I/$w/walk.js 2>&1 | grep -E "\[fact\]|u58f|Error|error|FAIL|✗" | cut -c1-600
done
echo "-- upgrade from $PREV"
PKP_E2E_DATASET_BRANCH=$PREV npm run -s fleet-prep -- --feature $F-up --dataset $DS --reset --apps omp 2>&1 | grep -i -E "upgrad|error|fail" | cut -c1-300
PROBE_RUN=$SIDE PROBE_FEATURE=$F-up PROBE_AGENT=stored node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-13646/stored.js 2>&1 | grep -v "^\[probe\]" | cut -c1-600
echo "-- press-review-complete-email-recommends-none (upgraded fleet)"
PROBE_RUN=$SIDE PROBE_FEATURE=$F-up PROBE_AGENT=omp2 node bin/probe.js omp $I/press-review-complete-email-recommends-none/walk.js 2>&1 | grep -E "\[fact\]|subject|Error|error" | cut -c1-700
if [ "$LINE" = 3.5 ]; then
  echo "-- upgrade from 3.5.0.5 (the line's dataset relabelled)"
  npm run -s fleet-prep -- --feature $F-patch --dataset $DS --reset --apps omp > /dev/null 2>&1 || { echo "fleet-prep failed (patch)"; exit 1; }
  DB=$(node -e 'console.log(require(process.argv[1]).apps.omp.db)' "$PWD/.reports/$F-patch/fleet.json")
  CFG=$(node -e 'console.log(require(process.argv[1]).apps.omp.configFile)' "$PWD/.reports/$F-patch/fleet.json")
  psql -X -q -d "$DB" -c "update versions set build = 5 where product_type = 'core' and current = 1" || exit 1
  (cd "$DIR" && PKP_CONFIG_FILE="$PWD/../../../$CFG" php tools/upgrade.php upgrade > "../../../.reports/$F-patch/upgrade.log" 2>&1; echo "upgrade exit $?"; grep -i -E "error|exception|I13646|successfully" "../../../.reports/$F-patch/upgrade.log" | head -5)
  PROBE_RUN=$SIDE PROBE_FEATURE=$F-patch PROBE_AGENT=stored node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-13646/stored.js 2>&1 | grep -v "^\[probe\]" | cut -c1-600
fi
