#!/bin/bash
# switch.sh <line> head|tip : put OJS and OPS on the merge result of the line
# tip and the app PR (crossref submodule at the plugin PR head), or back.
set -eu
cd /home/e2e/pkp-e2e/checkouts
LINE=$1; TO=$2
if [ "$LINE" = main ]; then P=""; PRS="ojs:5977 ops:1481"; else P="$LINE/"; PRS="ojs:5978 ops:1482"; fi
for d in $PRS; do
  a=$P${d%:*}; n=${d#*:}
  if [ "$TO" = head ]; then
    tip=$(git -C $a rev-parse HEAD); echo "$tip" > /tmp/s0-pr13591-tip-${a//\//_}
    tree=$(git -C $a merge-tree --write-tree HEAD pr-$n)
    m=$(git -C $a commit-tree $tree -p HEAD -p pr-$n -m "local merge result: tip + pr-$n (PR review pkp-lib#13591)")
    git -C $a checkout -q --detach $m
  else
    git -C $a checkout -q --detach $(cat /tmp/s0-pr13591-tip-${a//\//_})
  fi
  git -C $a submodule update -q plugins/generic/crossref
  echo "$a now $(git -C $a rev-parse --short HEAD) crossref $(git -C $a/plugins/generic/crossref rev-parse --short HEAD) datacite-TransferException=$(grep -c TransferException $a/plugins/generic/datacite/DataciteExportPlugin.php 2>/dev/null || true) status: $(git -C $a status --short | tr '\n' ' ')"
done
