#!/bin/bash
# round.sh <line: main|stable-3_5_0> <label: base|head>
# Three dataset fleets, each freshly loaded: ds1 Crossref (OJS, OPS), ds2
# DataCite (OJS), ds3 Crossref with [proxy] at an unresolvable host (curl 5,
# a RequestException without response), all with the undeposited neighbour.
set -u
cd /home/e2e/pkp-e2e
LINE=$1; LABEL=$2; OUT=.reports/pr-13591/$LINE-$LABEL; mkdir -p $OUT
if [ "$LINE" = main ]; then L=""; else L="PKP_E2E_LINE=$LINE"; fi
echo "ROUND $LINE $LABEL start $(date -u +%T)"
for n in 1 2 3; do
  apps=ojs,ops; [ $n = 2 ] && apps=ojs
  env $L npm run fleet-prep -- --feature pr13591-$LINE-ds$n --dataset $n --reset --apps $apps > $OUT/prep-ds$n.log 2>&1 || { echo "PREP FAIL ds$n"; command tail -n 20 $OUT/prep-ds$n.log; exit 1; }
done
root() { if [ "$LINE" = main ]; then echo checkouts/$1; else echo checkouts/$LINE/$1; fi; }
for a in ojs ops; do sed -i 's|"http://127.0.0.1:9"|"http://proxy.invalid:9"|g' $(root $a)/config.test.ds3.inc.php; grep -c proxy.invalid $(root $a)/config.test.ds3.inc.php | sed "s/^/ds3 $a proxy.invalid lines: /"; done
for a in ojs ops; do echo "$a $(git -C $(root $a) rev-parse --short HEAD) crossref $(git -C $(root $a)/plugins/generic/crossref rev-parse --short HEAD) lib/pkp $(git -C $(root $a)/lib/pkp rev-parse --short HEAD) datacite-catch: $(grep -c 'TransferException' $(root $a)/plugins/generic/datacite/DataciteExportPlugin.php 2>/dev/null) crossref-catch: $(grep -c 'catch (TransferException' $(root $a)/plugins/generic/crossref/CrossrefExportPlugin.php)"; done
run() { env $L PROBE_FEATURE=pr13591-$LINE-ds$1 PROBE_AGENT=pr13591 PROBE_RUN=$LINE-$LABEL-ds$1 WALK=$2 NEIGHBOUR=1 node bin/probe.js all shared/playwright/checks/issues/deposit-unreachable-agency-stays-submitted/walk.js > $OUT/walk-ds$1-$2.log 2>&1; echo "WALK ds$1 $2 rc=$?"; }
run 1 crossref & run 2 datacite & run 3 crossref & wait
echo "ROUND $LINE $LABEL done $(date -u +%T)"
