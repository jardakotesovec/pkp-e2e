#!/usr/bin/env bash
# Kept walk for pkp/pubmedCentral#9 (driver.php says what each step does). From the repo root:
#   shared/playwright/checks/sync/pubmedCentral-9/walk.sh <plugin clone> <ref> [trial-fix.diff]
# Drops the plugin at <ref> (plus the diff, if given) into the OJS checkout with bin/try-fix.js,
# resets dataset fleet 1, runs the three cases and takes the plugin out again.
set -euo pipefail
K=$(cd "$(dirname "$0")" && pwd); ROOT=$(pwd); CLONE=$1; REF=$2; FIX=${3:-}
OUT=$ROOT/.reports/pr-review/pubmedCentral-9; mkdir -p "$OUT"
PLUGIN_DIFF=$(mktemp "$OUT/walk-plugin-XXXX.diff")
rm -rf "$OUT/wt"; git -C "$CLONE" worktree prune; git -C "$CLONE" worktree add -q --detach "$OUT/wt" "$REF"
if [ -n "$FIX" ]; then git -C "$OUT/wt" apply "$(cd "$(dirname "$FIX")" && pwd)/$(basename "$FIX")"; fi
git -C "$OUT/wt" diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904 \
  --src-prefix=a/plugins/generic/pubmedCentral/ --dst-prefix=b/plugins/generic/pubmedCentral/ -- . ':!cypress' ':!.github' > "$PLUGIN_DIFF"
git -C "$CLONE" worktree remove --force "$OUT/wt"
node bin/try-fix.js apply "$PLUGIN_DIFF" ojs | cut -c1-80
trap 'node "$ROOT/bin/try-fix.js" revert "$PLUGIN_DIFF" ojs' EXIT
npm run reset:ojs -- --dataset 1 | tail -1
cd checkouts/ojs; export PKP_CONFIG_FILE=$PWD/config.test.ds1.inc.php; D="php $K/driver.php"
$D setup
echo "## D. before the import: a history row with the DOI in capitals (dry run)"
printf 'doi,package_prefix,version,last_revision,file_stem,in_pmc\n10.9999/PMC9.1,jpk-1-jpk.1-17,1,0,jpk-1-1001,Y\n' > "$OUT/upper.csv"
php tools/importExport.php PubmedCentralExportPlugin importHistory publicknowledge "$OUT/upper.csv" --dry-run | tail -4
php tools/importExport.php PubmedCentralExportPlugin importHistory publicknowledge "$K/history.csv" | tail -1
echo "## A. the imported 1.0 (pub 18) deposited over SFTP, twice"; for i in 1 2; do $D deposit 18 >/dev/null; $D job 18 | grep "job:\|pub 18 "; done
echo "## B. the new 2.0 (pub 22) delivered by hand and marked registered, then deposited over SFTP"
$D mark 22 | grep "pub 22 "; $D deposit 22 >/dev/null; $D job 22 | grep "job:\|pub 22 "
echo "## C. 2.0 delivered by hand twice more, each marked registered"; $D mark 22 | grep "pub 22 "; $D mark 22 | grep "pub 22 "
