#!/usr/bin/env bash
# bin/app-lock.sh <shared|exclusive> <apps, comma separated> -- <command…>
# Holds one lock per named app checkout of this slot for as long as the command runs;
# the lock goes when the command exits, however it exits.
#   shared     a walk or drive that changes no code (any number at once)
#   exclusive  a fix trial: try-fix apply … walks … revert, as ONE command
# Every caller passes one gate first and keeps it until it holds its locks, so a waiting
# fix trial is not overtaken by walks that ask after it (first come, first served).
set -euo pipefail
mode=$1; apps=$2; shift 2; [ "${1:-}" = "--" ] && shift
root=$(cd "$(dirname "$0")/.." && pwd)
dir=${APPLOCK_DIR:-$root/.reports/locks}
mkdir -p "$dir"
flag=-s; [ "$mode" = exclusive ] && flag=-x
echo "[applock] $mode $apps: asked $(date +%T)" >&2
exec 9>>"$dir/gate.lock"; flock -x 9
fds=()
for a in ojs omp ops; do
  case ",$apps," in *",$a,"*) exec {fd}>>"$dir/$a.lock"; flock $flag "$fd"; fds+=("$fd");; esac
done
flock -u 9; exec 9>&-
echo "[applock] $mode $apps: holds $(date +%T)" >&2
# The command runs without the lock descriptors, so a server it starts cannot keep a lock.
( for fd in "${fds[@]}"; do eval "exec $fd>&-"; done; exec "$@" ) && rc=0 || rc=$?
exit $rc
