#!/bin/bash
# r2.sh <line> <label>: PR review pkp-lib#13591 round 2 on dataset fleets
# freshly loaded: ds1 the A18 walk (Crossref, OJS and OPS, NEIGHBOUR=1), then
# status.js (status lookup) and, on OJS main/ore, citation.sh (reference
# lookup task); ds2 the DOAJ walk (OJS; main and ore only, 3.4's DOAJ has no PR).
# ds3 on 3.4: DataCite (OJS). Run from the slot's clone (or the ore worktree).
set -u
HERE=$(dirname "$(readlink -f "$0")")
LINE=$1; LABEL=$2; OUT=${OUT:-.reports/pr-13591-r2}/$LINE-$LABEL; mkdir -p $OUT
case $LINE in main|ore) L=""; R=checkouts;; *) L="PKP_E2E_LINE=$LINE"; R=checkouts/$LINE;; esac
APPS=${APPS:-ojs,ops}
W=shared/playwright/checks/issues
echo "ROUND $LINE $LABEL start $(date -u +%T)"
for a in ${APPS//,/ }; do echo "$a $(git -C $R/$a rev-parse --short HEAD) crossref $(git -C $R/$a/plugins/generic/crossref rev-parse --short HEAD) doaj-TE $(grep -c TransferException $R/$a/plugins/generic/doaj/DOAJExportPlugin.php 2>/dev/null) datacite-TE $(grep -c TransferException $R/$a/plugins/generic/datacite/DataciteExportPlugin.php 2>/dev/null) crossref-TE $(grep -c TransferException $R/$a/plugins/generic/crossref/CrossrefExportPlugin.php) citation-TE $(grep -c TransferException $R/$a/plugins/generic/crossref/CrossrefCitationDoiHandler.php 2>/dev/null)"; done
F=pr13591r2-$LINE
env $L npm run fleet-prep -- --feature $F-ds1 --dataset 1 --reset --apps $APPS > $OUT/prep-ds1.log 2>&1 || { echo "PREP FAIL ds1"; command tail -n 15 $OUT/prep-ds1.log; exit 1; }
second() {
  if [ "$LINE" = stable-3_4_0 ]; then
    env $L npm run fleet-prep -- --feature $F-ds3 --dataset 3 --reset --apps ojs > $OUT/prep-ds3.log 2>&1 || { echo "PREP FAIL ds3"; return; }
    env $L PROBE_FEATURE=$F-ds3 PROBE_AGENT=pr13591 PROBE_RUN=$LINE-$LABEL-ds3 WALK=datacite NEIGHBOUR=1 node bin/probe.js ojs $W/deposit-unreachable-agency-stays-submitted/walk.js > $OUT/walk-ds3-datacite.log 2>&1; echo "WALK ds3 datacite rc=$?"
  else
    env $L npm run fleet-prep -- --feature $F-ds2 --dataset 2 --reset --apps ojs > $OUT/prep-ds2.log 2>&1 || { echo "PREP FAIL ds2"; return; }
    env $L PROBE_FEATURE=$F-ds2 PROBE_AGENT=pr13591 PROBE_RUN=$LINE-$LABEL-ds2 node bin/probe.js ojs $W/doaj-deposit-unreachable-stays-submitted/walk.js > $OUT/walk-ds2-doaj.log 2>&1; echo "WALK ds2 doaj rc=$?"
  fi
}
first() {
  env $L PROBE_FEATURE=$F-ds1 PROBE_AGENT=pr13591 PROBE_RUN=$LINE-$LABEL-ds1 WALK=crossref NEIGHBOUR=1 node bin/probe.js $APPS $W/deposit-unreachable-agency-stays-submitted/walk.js > $OUT/walk-ds1-crossref.log 2>&1; echo "WALK ds1 crossref rc=$?"
  [ -f shared/playwright/checks/sync/pkp-lib-13591/status.js ] && env $L PROBE_FEATURE=$F-ds1 PROBE_AGENT=pr13591 PROBE_RUN=$LINE-$LABEL-ds1 node bin/probe.js $APPS shared/playwright/checks/sync/pkp-lib-13591/status.js > $OUT/status-ds1.log 2>&1; echo "STATUS rc=$?"; grep '\[fact\]' $OUT/status-ds1.log | cut -c1-500
  if [ "$LINE" != stable-3_4_0 ]; then
    db=$(node -e 'console.log(require(process.argv[1]).apps.ojs.db)' $PWD/.reports/$F-ds1/fleet.json)
    bash "$HERE/citation.sh" $PWD/$R/ojs "$db" $PWD/$R/ojs/config.test.ds1.inc.php
  fi
}
first & second & wait
echo "ROUND $LINE $LABEL done $(date -u +%T)"
