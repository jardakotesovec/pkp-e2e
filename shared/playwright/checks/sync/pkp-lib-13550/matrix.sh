#!/usr/bin/env bash
# PR review of pkp/pkp-lib#13539 (pkp-lib#13550, ui-library#1024, ojs#5949): the U14 issue walks
# (A17, A18, A19) and the cross-context walk, each on a freshly reset default-dataset fleet.
# Run once with the submodules at the PR base and once at the head:
#   bash shared/playwright/checks/sync/pkp-lib-13550/matrix.sh base|head [only-step…]
# Fleet: npm run fleet-prep -- --feature issues-r13539 --dataset --reset (all three apps).
# On the pkp-e2e `ore` branch (the ore worktree, OJS alone; the port pkp-lib#13632, ui-library#1028,
# ojs#5988): A18 runs on OJS only, the merge check's unapproved-report.js runs too, and the fleet is
# fleet-prep's --apps ojs.
set -u
SIDE=$1; shift
cd "$(dirname "$0")/../../../../.."
I=shared/playwright/checks/issues
S=shared/playwright/checks/sync/pkp-lib-13550
export PROBE_FEATURE=issues-r13539 PROBE_AGENT=$SIDE
run() { # name apps reset-apps script [mode]
  local name=$1 apps=$2 resets=$3 script=$4; shift 4
  if [ -n "${PICK:-}" ] && [[ " $PICK " != *" $name "* ]]; then return; fi
  for a in ${resets//,/ }; do npm run -s reset:$a -- --dataset >/dev/null 2>&1 || echo "reset $a failed"; done
  echo "== $SIDE $name ($(date -u +%H:%M:%S))"
  PROBE_RUN=$name node bin/probe.js $apps $script "$@" 2>&1 | tail -4
}
PICK="$*"; unset ONLY
run a17-walk ojs ojs $I/public-comment-list-exposes-reports/walk.js
run a17-nb ojs ojs $I/public-comment-list-exposes-reports/walk.js neighbour
run a18-walk ojs ojs $I/comment-request-unpublished-submission/walk.js
run a18-nb ojs ojs $I/comment-request-unpublished-submission/walk.js neighbour
run a19-walk ojs ojs $I/delete-all-comment-reports-fails/walk.js
run a19-nb ojs ojs $I/delete-all-comment-reports-fails/walk.js neighbour
run xctx ojs ojs $S/cross-context.js
run extras ojs ojs $S/extras.js
run unapproved ojs ojs $S/unapproved-report.js
echo "== $SIDE done ($(date -u +%H:%M:%S))"
