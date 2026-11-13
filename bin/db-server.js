#!/usr/bin/env node
/**
 * @file bin/db-server.js
 *
 * The MySQL and MariaDB servers of the `mysql` and `mariadb` lines
 * (bin/apps.js DB_SERVERS; harness.md "Other databases and PHP versions"):
 * one container each, on docker or podman, started when a session needs
 * to reproduce something on that database and stopped afterwards (the
 * machine's memory is the reason; the data stays in the stopped container).
 *
 *   npm run db -- start <mysql|mariadb>   start it (created on first use) and wait until it answers
 *   npm run db -- stop [mysql|mariadb] [--force]   stop it (all when none is named); refused while an
 *                                         app is connected (another slot's servers?) unless --force
 *   npm run db -- status
 *   npm run db -- sql <mysql|mariadb> "<statement>" [database]   a statement as root, rows as tab-separated text
 *
 * PKP_E2E_CONTAINER=docker|podman picks the engine; unset takes the first
 * of the two that is installed and answers.
 *
 * Where a systemd unit named like the container exists (the VM: the bot's
 * service may not start containers itself, harness.md "Other databases and
 * PHP versions"), start and stop go through `systemctl` instead and no
 * engine is needed. Statements always go over TCP, through PHP's mysqli.
 */
const {spawnSync} = require('child_process');
const {DB_SERVERS, DB_USER} = require('./apps.js');

const ROOT_PASSWORD = 'root';

/** The systemd unit that runs this server's container, when the machine has one. */
function unit(s) {
    const name = `${s.container}.service`;
    return spawnSync('systemctl', ['cat', name], {encoding: 'utf8'}).status === 0 ? name : null;
}

let chosen;
function engine() {
    if (chosen) return chosen;
    const wanted = process.env.PKP_E2E_CONTAINER ? [process.env.PKP_E2E_CONTAINER] : ['docker', 'podman'];
    for (const name of wanted) {
        const probe = spawnSync(name, ['ps', '-q'], {encoding: 'utf8'});
        if (probe.status === 0) return (chosen = name);
    }
    console.error(`db-server: no container engine answers (${wanted.join(', ')}): install one or start its daemon`);
    process.exit(1);
}

function sh(cmd, args, {quiet = false} = {}) {
    const out = spawnSync(cmd, args, {encoding: 'utf8'});
    if (out.status !== 0 && !quiet) {
        console.error(`db-server: ${cmd} ${args.join(' ')}\n${(out.stderr || '').trim()}`);
    }
    return out;
}

function server(name) {
    if (!DB_SERVERS[name]) {
        console.error(`db-server: "${name}" is not one of ${Object.keys(DB_SERVERS).join(', ')}`);
        process.exit(1);
    }
    const s = {name, ...DB_SERVERS[name]};
    return {...s, unit: unit(s)};
}

/** A statement as root over TCP, rows as tab-separated text. */
function sql(s, statement, database) {
    const code = 'mysqli_report(MYSQLI_REPORT_OFF);'
        + '$c = @mysqli_connect("127.0.0.1", "root", $argv[1], $argv[4] ?: null, (int) $argv[2]);'
        + 'if (!$c) { fwrite(STDERR, mysqli_connect_error() . "\n"); exit(2); }'
        + 'if (!mysqli_multi_query($c, $argv[3])) { fwrite(STDERR, mysqli_error($c) . "\n"); exit(1); }'
        + 'do { if ($r = mysqli_store_result($c)) { while ($row = mysqli_fetch_row($r)) { echo implode("\t", array_map(fn($v) => $v ?? "NULL", $row)), "\n"; } } '
        + 'elseif (mysqli_errno($c)) { fwrite(STDERR, mysqli_error($c) . "\n"); exit(1); } } while (mysqli_more_results($c) && mysqli_next_result($c));'
        + 'if (mysqli_errno($c)) { fwrite(STDERR, mysqli_error($c) . "\n"); exit(1); }';
    return sh('php', ['-r', code, ROOT_PASSWORD, String(s.port), statement, database || ''], {quiet: true});
}

function state(s) {
    if (s.unit) {
        return spawnSync('systemctl', ['is-active', s.unit], {encoding: 'utf8'}).stdout.trim() === 'active' ? 'running' : 'stopped';
    }
    const out = sh(engine(), ['inspect', '-f', '{{.State.Status}}', s.container], {quiet: true});
    return out.status === 0 ? out.stdout.trim() : 'absent';
}

function start(s) {
    const now = state(s);
    if (s.unit) {
        if (now !== 'running' && sh('systemctl', ['start', s.unit]).status !== 0) process.exit(1);
    } else if (now === 'absent') {
        console.log(`db-server: creating ${s.container} (${s.image}) on 127.0.0.1:${s.port}`);
        const created = sh(engine(), [
            'run', '-d', '--name', s.container, '-p', `127.0.0.1:${s.port}:3306`,
            '-e', `MYSQL_ROOT_PASSWORD=${ROOT_PASSWORD}`, s.image,
            // The servers' own defaults otherwise, as on CI; this one only saves memory.
            ...(s.name === 'mysql' ? ['--performance-schema=OFF'] : []),
        ]);
        if (created.status !== 0) process.exit(1);
    } else if (now !== 'running') {
        if (sh(engine(), ['start', s.container]).status !== 0) process.exit(1);
    }
    // The image's first start runs a server without networking before the
    // real one, so the answer that counts is the one over TCP.
    const deadline = Date.now() + 120000;
    for (;;) {
        const ping = sql(s, 'SELECT VERSION()');
        if (ping.status === 0) {
            // The harness's account: every test database is its own.
            const auth = s.name === 'mysql' ? `IDENTIFIED WITH mysql_native_password BY '${DB_USER}'` : `IDENTIFIED BY '${DB_USER}'`;
            const grant = sql(s, `CREATE USER IF NOT EXISTS '${DB_USER}'@'%' ${auth}; GRANT ALL ON *.* TO '${DB_USER}'@'%' WITH GRANT OPTION;`);
            if (grant.status !== 0) {
                console.error(`db-server: could not create the ${DB_USER} account: ${(grant.stderr || '').trim()}`);
                process.exit(1);
            }
            console.log(`db-server: ${s.name} ${ping.stdout.trim()} answers on 127.0.0.1:${s.port} (user ${DB_USER}, password ${DB_USER})`);
            return;
        }
        if (Date.now() > deadline) {
            const log = s.unit ? `journalctl -u ${s.unit} has its log` : sh(engine(), ['logs', '--tail', '30', s.container], {quiet: true}).stderr;
            console.error(`db-server: ${s.container} did not answer within two minutes: ${(ping.stderr || '').trim()}\n${log}`);
            process.exit(1);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
}

const force = process.argv.includes('--force');
const [cmd, name, ...rest] = process.argv.slice(2).filter((a) => a !== '--force');
if (cmd === 'start' && name) {
    start(server(name));
} else if (cmd === 'stop') {
    let refused = false;
    for (const s of name ? [server(name)] : Object.keys(DB_SERVERS).map(server)) {
        if (state(s) !== 'running') continue;
        // The apps connect as DB_USER and keep their connection (persistent = On).
        const held = Number((sql(s, `SELECT COUNT(*) FROM information_schema.processlist WHERE user = '${DB_USER}'`).stdout || '0').trim()) || 0;
        if (held && !force) {
            console.error(`db-server: ${s.container} left running: ${held} app connection(s) open (this slot's servers, or another slot's); stop them first, or --force`);
            refused = true;
            continue;
        }
        if ((s.unit ? sh('systemctl', ['stop', s.unit]) : sh(engine(), ['stop', s.container])).status !== 0) {
            refused = true;
            continue;
        }
        console.log(`db-server: ${s.container} stopped`);
    }
    if (refused) process.exit(1);
} else if (cmd === 'status') {
    for (const s of Object.keys(DB_SERVERS).map(server)) console.log(`${s.name}: ${state(s)} (127.0.0.1:${s.port}, ${s.image})`);
} else if (cmd === 'sql' && name && rest[0]) {
    const out = sql(server(name), rest[0], rest[1]);
    process.stdout.write(out.stdout || '');
    if (out.status !== 0) {
        process.stderr.write(out.stderr || '');
        process.exit(1);
    }
} else {
    console.error('usage: npm run db -- start <mysql|mariadb> | stop [mysql|mariadb] [--force] | status | sql <mysql|mariadb> "<statement>" [database]');
    process.exit(1);
}
