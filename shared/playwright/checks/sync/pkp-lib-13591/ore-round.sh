#!/bin/bash
# ore-round.sh base|head : the three walks in the slot's ore worktree (OJS only)
set -u
cd /home/e2e/pkp-e2e-ore; LABEL=$1; OUT=/home/e2e/pkp-e2e/.reports/pr-13591/ore-$LABEL; mkdir -p $OUT
O=checkouts/ojs
if [ "$LABEL" = head ]; then
  git -C $O apply /home/e2e/pkp-e2e/.reports/pr-13591/datacite-5977.diff && git -C $O/plugins/generic/crossref checkout -q --detach pr-117
fi
npm run mount > $OUT/mount.log 2>&1
for n in 1 2 3; do npm run fleet-prep -- --feature pr13591-ore-ds$n --dataset $n --reset --apps ojs > $OUT/prep-ds$n.log 2>&1 || { echo "PREP FAIL ds$n"; command tail -n 20 $OUT/prep-ds$n.log; }; done
sed -i 's|"http://127.0.0.1:9"|"http://proxy.invalid:9"|g' $O/config.test.ds3.inc.php
echo "ore $(git -C $O rev-parse --short HEAD) crossref $(git -C $O/plugins/generic/crossref rev-parse --short HEAD) lib/pkp $(git -C $O/lib/pkp rev-parse --short HEAD) datacite-TE $(grep -c TransferException $O/plugins/generic/datacite/DataciteExportPlugin.php) crossref-TE $(grep -c 'catch (TransferException' $O/plugins/generic/crossref/CrossrefExportPlugin.php)"
run() { PROBE_FEATURE=pr13591-ore-ds$1 PROBE_AGENT=pr13591 PROBE_RUN=ore-$LABEL-ds$1 WALK=$2 NEIGHBOUR=1 node bin/probe.js ojs shared/playwright/checks/issues/deposit-unreachable-agency-stays-submitted/walk.js > $OUT/walk-ds$1-$2.log 2>&1; echo "WALK ds$1 $2 rc=$?"; }
run 1 crossref & run 2 datacite & run 3 crossref & wait
if [ "$LABEL" = head ]; then
  git -C $O checkout -q -- plugins/generic/datacite/DataciteExportPlugin.php; rm -rf $O/plugins/generic/datacite/tests; git -C $O submodule update -q plugins/generic/crossref; npm run mount > $OUT/mount-back.log 2>&1
  echo "ore restored: $(git -C $O status --short | tr '\n' ' ') crossref $(git -C $O/plugins/generic/crossref rev-parse --short HEAD)"
fi
for f in .reports/pr13591-ore-ds*/pr13591/*$LABEL*facts*.json; do node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));const a=j["7 after the background deposit"]||{};const h=j["8 has error filter"]||{};console.log(process.argv[1].split("/").pop(), "|", a.badge, "| viewError", a.viewErrorCount, "| failed", (a.failedJobs||[]).length, "| hasError", (h.rows||[]).length, "| control", a.neighbourBadge, "|", (((a.errorSettings||[])[0]||"").match(/cURL error \d+/)||[""])[0])' $f; done
echo "ORE $LABEL done"
