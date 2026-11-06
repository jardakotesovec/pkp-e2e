#!/bin/bash
# U11 drift sweep SW06 (housekeeping 2026-11-06): the register's kept issue walks
# (shared/playwright/checks/issues/<report>/walk.js, default mode), twice each (PROBE_RUN r1, r2),
# on a dataset fleet reset before every run, one lane per app so the three apps run side by side.
# Every U11 report walk runs here; none starts a server of its own.
#   DS=9 FEATURE=sw06ds bash shared/playwright/checks/U11/SW06/walks.sh [ojs omp ops]
#   WALKS="a3 a9" narrows the list; outputs .reports/$FEATURE/sw06w-<id>/, logs .reports/U11/ccSW06/walks/
# A row is id:report-folder:apps[:script[:ENV=value]] (script default walk.js).
cd "$(dirname "$0")/../../../../.."
DS=${DS:-9}; FEATURE=${FEATURE:-sw06ds}
L=.reports/U11/ccSW06/walks; mkdir -p $L; ST=$L/status.log
LOCK=/tmp/u11sw06-ds$DS-reset.lock
log(){ echo "$(date -u +%H:%M:%S) $*" >> $ST; }
# id:report-folder:apps
ALL="a1:highlights-cancel-ordering-keeps-moved-rows:ojs,omp,ops
a3:highlights-list-title-html-codes:ojs,omp,ops
a5:site-highlights-cannot-be-saved:ojs,omp,ops
a10:highlight-read-on-its-own-fails:ojs,omp,ops"
lane(){
  local app=$1
  echo "$ALL" | while IFS=: read id dir apps script envkv; do
    script=${script:-walk.js}
    [ -n "$WALKS" ] && ! echo " $WALKS " | grep -q " $id " && continue
    echo ",$apps," | grep -q ",$app," || continue
    for r in r1 r2; do
      flock $LOCK npm run fleet-prep -- --feature $FEATURE --dataset $DS --reset --apps $app > $L/reset-$id-$r-$app.log 2>&1
      log "reset $app $id $r $?"
      env $envkv PROBE_FEATURE=$FEATURE PKP_E2E_DATASET=$DS PROBE_NOTES_FEATURE=U11 PROBE_AGENT=sw06w-$id PROBE_RUN=$r \
        timeout 900 node bin/probe.js $app shared/playwright/checks/issues/$dir/$script > $L/$id-$r-$app.log 2>&1
      log "$id $r $app exit=$?"
    done
  done
  log "lane $app done"
}
APPS=${*:-ojs omp ops}
for a in $APPS; do lane $a & done
wait
log "ALL DONE"
