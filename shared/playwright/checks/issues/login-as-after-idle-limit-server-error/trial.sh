#!/usr/bin/env bash
# Fix trial for the U01 A8 issue report, on `main`. Since pkp-lib 3407fc5bc0 the app does not read
# the "Keep me logged in" cookie, so fix.diff alone changes nothing a screen shows. The trial
# therefore runs the walk over a stand-in for a repair that reads the cookie again:
#   fix.diff                    by itself on today's code: the steps (PROBE_RUN=fix-alone), which
#                               must read as they do without it
#   trial-cookie-read.diff      the three files of 3407fc5bc0 as they were before it (the cookie is
#                               read through Laravel's guard): the steps (PROBE_RUN=cr) and the
#                               neighbour check with the fix out (nb-out)
#   trial-cookie-read-fix.diff  the same plus fix.diff: the steps (fix) and the neighbour check (nb-in)
# TRIAL_ONLY=alone|read|fix runs one of the three stages; the default is all three in that order.
# TRIAL_SESSION_COOKIE=gone walks every stage with the session cookie removed at the idle limit.
# Run it as ONE command under the session's exclusive lock on the three checkouts, in the background:
#   TRIAL_FEATURE=<feature> TRIAL_DATASET=<n> TRIAL_AGENT=<id> bash shared/playwright/checks/issues/login-as-after-idle-limit-server-error/trial.sh
# Both diffs change user resolution. Each is checked after the apply for the one call cycle this
# code can form (PKPRequest::getUser() through Auth::user() while PKPUserProvider::retrieveById()
# calls getUser()), and a watchdog ends the trial if a PHP server of this clone grows past 3 GB.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../../../.." && pwd)
cd "$root"
feature=${TRIAL_FEATURE:?feature of the dataset fleet}; n=${TRIAL_DATASET:?dataset fleet number}; agent=${TRIAL_AGENT:?agent id}
apps="ojs omp ops"
walk=shared/playwright/checks/issues/login-as-after-idle-limit-server-error/walk.js
revert_all() {
    for d in fix trial-cookie-read trial-cookie-read-fix; do node bin/try-fix.js revert "$here/$d.diff" $apps 2>&1 | sed 's/^/[revert] /'; done
    [ -n "${dog:-}" ] && kill "$dog" 2>/dev/null
    node bin/try-fix.js status $apps && echo "[trial] status clean" || echo "[trial] STATUS NOT CLEAN"
}
trap revert_all EXIT
trap 'echo "[trial] stopped"; exit 3' TERM INT
node bin/try-fix.js status $apps || { echo "[trial] a fix is applied; not started"; trap - EXIT; exit 1; }
( while sleep 2; do
    ps -eo rss=,pid=,args= | awk -v r="$root/checkouts/" '$3 ~ /php/ && index($0, r) && $1 > 3000000 {print $2}' | while read -r pid; do
        echo "[watchdog] php $pid past 3 GB: killed, trial stopped" >&2; kill -9 "$pid"; kill -TERM $$
    done
  done ) & dog=$!
no_cycle() {
    for a in $apps; do
        if grep -q 'Auth::user()' "checkouts/$a/lib/pkp/classes/core/PKPRequest.php" && grep -q 'getRequest()->getUser()' "checkouts/$a/lib/pkp/classes/core/PKPUserProvider.php"; then
            echo "[trial] $a: getUser() and retrieveById() would call each other; stopped"; return 1
        fi
    done
}
reset() { npm run --silent fleet-prep -- --feature "$feature" --dataset "$n" --reset >/dev/null 2>&1 || { echo "[trial] fleet reset failed"; return 1; }; }
cookie=${TRIAL_SESSION_COOKIE:-kept}   # gone: the browser's session cookie is removed at the idle limit, as a real wait leaves it
[ "$cookie" = gone ] && sfx=-gone arg=gone || sfx= arg=
run() { echo "[trial] walk $1$sfx ${2:-steps} $arg"; PROBE_FEATURE=$feature PROBE_AGENT=$agent PROBE_RUN=$1$sfx node bin/probe.js all $walk ${2:-steps} $arg; }

stage_alone() {   # fix.diff by itself on today's code: the steps must read as without it
    node bin/try-fix.js apply "$here/fix.diff" $apps || return 1
    reset && run fix-alone
    node bin/try-fix.js revert "$here/fix.diff" $apps
}
stage_read() {    # the cookie read put back, the fix out
    node bin/try-fix.js apply "$here/trial-cookie-read.diff" $apps || return 1
    no_cycle || return 1
    reset && run cr
    reset && run nb-out nb
    node bin/try-fix.js revert "$here/trial-cookie-read.diff" $apps
}
stage_fix() {     # the cookie read put back, the fix in
    node bin/try-fix.js apply "$here/trial-cookie-read-fix.diff" $apps || return 1
    no_cycle || return 1
    reset && run fix
    reset && run nb-in nb
}
case "${TRIAL_ONLY:-all}" in
    alone) stage_alone ;;
    read) stage_read ;;
    fix) stage_fix ;;
    all) stage_alone && stage_read && stage_fix ;;
    *) echo "[trial] TRIAL_ONLY is alone, read, fix or all"; exit 1 ;;
esac || exit 1
echo "[trial] done"
