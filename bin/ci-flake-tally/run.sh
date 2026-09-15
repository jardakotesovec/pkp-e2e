#!/bin/bash
# CI flake tally: which tests fail non-deterministically on CI, ranked.
#
#   bin/ci-flake-tally/run.sh [runs-per-repo, default 60]
#
# Lists the e2e runs of this repo and of the three app hooks (gh, authenticated),
# scrapes each completed run's log once into .reports/ci-tally/logs/, and writes
# .reports/ci-tally/ci-tally.md (the ranking; "flaky" = first attempt red, retry
# green) with ci-tally-compact.md and tally.json beside it. Written for the
# 2026-09-15 flake investigation (docs/reports/2026-09-15-flake-investigation.md);
# rerun it to see whether a fix changed the rate.
set -e
cd "$(dirname "$0")/../.."
LIMIT=${1:-60}
export CI_TALLY_DIR=$PWD/.reports/ci-tally
mkdir -p "$CI_TALLY_DIR/logs"
THIS_REPO=$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')
repo_of() { case $1 in pkp-e2e) echo "$THIS_REPO";; *) echo "pkp/$1";; esac; }
for short in pkp-e2e ojs omp ops; do
    repo=$(repo_of $short)
    gh run list -R "$repo" --workflow e2e --limit "$LIMIT" --json databaseId,conclusion,headSha,headBranch,createdAt,displayTitle,event,status > "$CI_TALLY_DIR/runs-$short.json"
    for id in $(python3 -c "import json,sys; [print(r['databaseId']) for r in json.load(open(sys.argv[1])) if r['status']=='completed' and r['conclusion'] in ('success','failure')]" "$CI_TALLY_DIR/runs-$short.json"); do
        bin/ci-flake-tally/scrape.sh "$repo" "$id"
    done
    echo "$short: $(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$CI_TALLY_DIR/runs-$short.json") runs listed"
done
python3 bin/ci-flake-tally/analyze.py "$CI_TALLY_DIR"
echo "written: $CI_TALLY_DIR/ci-tally.md"
