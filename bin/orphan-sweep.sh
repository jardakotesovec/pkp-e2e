#!/bin/bash
# bin/orphan-sweep.sh — kill the browsers a session left behind on the VM.
#
#   sudo bin/orphan-sweep.sh --install    # copies itself to /usr/local/sbin and
#                                         # enables the hourly e2e-orphan-sweep.timer
#   bin/orphan-sweep.sh [--dry-run]       # one sweep (the timer's ExecStart)
#
# A browser the harness or an app's own test runner started belongs to a
# shell that waits for it; when that shell dies first (a Bash tool call
# timed out, a session was killed, a Cypress 5.6 crash on its browser path),
# the browser re-parents to pid 1 and nothing stops it: three Chromes and
# two Cypress apps of one 3.3 run lived eight days on the VM, swapped out,
# with 2 % CPU each (2026-10-21). bin/slot.js stops a slot's browsers when
# the slot is released (stopSlotServers); this sweep is the net under it,
# slot or no slot: a `chrome`, `Cypress`, `chrome_crashpad_handler` or
# `Xvfb` of the e2e user whose parent is pid 1 and that is older than
# ORPHAN_MAX_AGE seconds (two hours: a session ends after 10 min idle, a
# final fits in an hour) gets SIGTERM, then SIGKILL after 3 s. Logged to
# the journal as orphan-sweep.
set -u
MAX_AGE=${ORPHAN_MAX_AGE:-7200}
USER_NAME=${ORPHAN_USER:-e2e}

if [ "${1:-}" = "--install" ]; then
    [ "$(id -u)" = 0 ] || { echo "orphan-sweep: --install needs root" >&2; exit 1; }
    install -m 0755 "$0" /usr/local/sbin/e2e-orphan-sweep
    cat > /etc/systemd/system/e2e-orphan-sweep.service <<'EOF'
[Unit]
Description=Kill browsers an e2e session left behind (pkp-e2e bin/orphan-sweep.sh)

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/e2e-orphan-sweep
EOF
    cat > /etc/systemd/system/e2e-orphan-sweep.timer <<'EOF'
[Unit]
Description=Hourly sweep of orphaned e2e browsers

[Timer]
OnCalendar=hourly
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now e2e-orphan-sweep.timer
    systemctl list-timers e2e-orphan-sweep.timer --no-pager
    exit 0
fi

dry=0
[ "${1:-}" = "--dry-run" ] && dry=1

# pid, parent, age in seconds, user, command name (15 chars: chrome_crashpad_handler shows as chrome_crashpad)
mapfile -t victims < <(ps -eo pid=,ppid=,etimes=,user=,comm= | awk -v max="$MAX_AGE" -v u="$USER_NAME" \
    '$2 == 1 && $4 == u && $3 > max && ($5 == "chrome" || $5 == "Cypress" || $5 == "chrome_crashpad" || $5 == "Xvfb") {print $1, $5, $3}')

[ ${#victims[@]} -eq 0 ] && exit 0

for v in "${victims[@]}"; do
    set -- $v
    msg="pid $1 $2 orphaned for $3 s"
    if [ $dry = 1 ]; then echo "would kill $msg"; continue; fi
    kill -TERM "$1" 2>/dev/null && logger -t orphan-sweep "SIGTERM $msg"
done
[ $dry = 1 ] && exit 0
sleep 3
for v in "${victims[@]}"; do
    set -- $v
    kill -0 "$1" 2>/dev/null && kill -KILL "$1" 2>/dev/null && logger -t orphan-sweep "SIGKILL pid $1 $2"
done
exit 0
