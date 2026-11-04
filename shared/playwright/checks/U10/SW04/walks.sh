#!/bin/bash
# U10 drift sweep SW04 (housekeeping 2026-11-04): the register's kept issue walks
# (shared/playwright/checks/issues/<report>/walk.js, default mode), twice each (PROBE_RUN r1, r2),
# on a dataset fleet reset before every run, one lane per app so the three apps run side by side.
# The kept check A26 (U10/I23H) is not repeated here. Left out: upload-box-server-refusal-no-message (A16's
# server refusal), whose walk starts a php -S of its own (base port + 77), which a sweep's checker may not do.
#   DS=9 FEATURE=sw04ds bash shared/playwright/checks/U10/SW04/walks.sh [ojs omp ops]
#   WALKS="a3 a9" narrows the list; outputs .reports/$FEATURE/sw04w-<id>/, logs .reports/U10/ccSW04/walks/
# A row is id:report-folder:apps[:script[:ENV=value]] (script default walk.js).
cd "$(dirname "$0")/../../../../.."
DS=${DS:-9}; FEATURE=${FEATURE:-sw04ds}
L=.reports/U10/ccSW04/walks; mkdir -p $L; ST=$L/status.log
LOCK=/tmp/u10sw04-ds$DS-reset.lock
log(){ echo "$(date -u +%H:%M:%S) $*" >> $ST; }
# id:report-folder:apps
ALL="a3:appearance-ordering-arrows-misnamed:ojs,omp,ops
a9:date-short-empty-custom-strips-editorial-dates:ojs,omp,ops
a11:french-masthead-order-text-names-journal:ojs,omp,ops
a1:homepage-image-alt-text-dropped:ojs,omp,ops
ojs5:home-page-parts-all-unticked-come-back:ojs
ojs6:latest-publications-titles-same-heading-level:ojs
a16b:logo-save-refusal-no-message-under-box:ojs,omp,ops
a18:ordinal-ending-dropped-on-discussion-messages:ojs,omp,ops
omp2:press-category-page-no-page-links:omp,ops
a15:refused-file-remove-keeps-save-disabled:ojs,omp,ops
a7:refused-upload-locks-box:ojs,omp,ops
a5:removed-style-sheet-stays-public:ojs,omp,ops
a20:removed-thumbnail-stays-public:ojs,omp,ops
a4:setup-save-refused-disabled-block:ojs,omp,ops
a17:sidebar-arrows-read-html-codes:ojs,omp,ops
a24:site-theme-api-server-error:ojs,omp,ops
a23:theme-api-refusal-raw-placeholder:ojs,omp,ops
a8:time-choice-3-05pm-prints-lower-case:ojs,omp,ops
a12:upload-boxes-drop-text-english:ojs,omp,ops
a16bmix:logo-save-refusal-no-message-under-box:ojs,omp,ops:walk.js:MODE=mixed
a20lang:removed-thumbnail-stays-public:ojs,omp,ops:walk.js:WALK=lang
a22:replaced-picture-other-type-stays-public:ojs,omp,ops
a22site:replaced-picture-other-type-stays-public:ojs,omp,ops:walk.js:WALK=site
a5site:removed-style-sheet-stays-public:ojs,omp,ops:site-walk.js"
lane(){
  local app=$1
  echo "$ALL" | while IFS=: read id dir apps script envkv; do
    script=${script:-walk.js}
    [ -n "$WALKS" ] && ! echo " $WALKS " | grep -q " $id " && continue
    echo ",$apps," | grep -q ",$app," || continue
    for r in r1 r2; do
      flock $LOCK npm run fleet-prep -- --feature $FEATURE --dataset $DS --reset --apps $app > $L/reset-$id-$r-$app.log 2>&1
      log "reset $app $id $r $?"
      env $envkv PROBE_FEATURE=$FEATURE PKP_E2E_DATASET=$DS PROBE_NOTES_FEATURE=U10 PROBE_AGENT=sw04w-$id PROBE_RUN=$r \
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
