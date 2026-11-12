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
 */
const {spawnSync} = require('child_process');
const {DB_SERVERS, DB_USER} = require('./apps.js');

const ROOT_PASSWORD = 'root';

function engine() {
    const wanted = process.env.PKP_E2E_CONTAINER ? [process.env.PKP_E2E_CONTAINER] : ['docker', 'podman'];
    for (const name of wanted) {
        const probe = spawnSync(name, ['ps', '-q'], {encoding: 'utf8'});
        if (probe.status === 0) return name;
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
    return {name, ...DB_SERVERS[name]};
}

/** A statement as root through the client inside the container. */
function sql(eng, s, statement, database) {
    return sh(eng, ['exec', s.container, 'mysql', '-uroot', `-p${ROOT_PASSWORD}`, '-N', '-B', ...(database ? [database] : []), '-e', statement], {quiet: true});
}

function state(eng, s) {
    const out = sh(eng, ['inspect', '-f', '{{.State.Status}}', s.container], {quiet: true});
    return out.status === 0 ? out.stdout.trim() : 'absent';
}

function start(eng, s) {
    const now = state(eng, s);
    if (now === 'absent') {
        console.log(`db-server: creating ${s.container} (${s.image}) on 127.0.0.1:${s.port}`);
        const created = sh(eng, [
            'run', '-d', '--name', s.container, '-p', `127.0.0.1:${s.port}:3306`,
            '-e', `MYSQL_ROOT_PASSWORD=${ROOT_PASSWORD}`, s.image,
            // The servers' own defaults otherwise, as on CI; this one only saves memory.
            ...(s.name === 'mysql' ? ['--performance-schema=OFF'] : []),
        ]);
        if (created.status !== 0) process.exit(1);
    } else if (now !== 'running') {
        if (sh(eng, ['start', s.container]).status !== 0) process.exit(1);
    }
    // The image's first start runs a server without networking before the
    // real one, so the answer that counts is the one over TCP.
    const deadline = Date.now() + 120000;
    for (;;) {
        const ping = sh(eng, ['exec', s.container, 'mysql', '-h', '127.0.0.1', '-uroot', `-p${ROOT_PASSWORD}`, '-N', '-B', '-e', 'SELECT VERSION()'], {quiet: true});
        if (ping.status === 0) {
            // The harness's account: every test database is its own.
            const auth = s.name === 'mysql' ? `IDENTIFIED WITH mysql_native_password BY '${DB_USER}'` : `IDENTIFIED BY '${DB_USER}'`;
            const grant = sql(eng, s, `CREATE USER IF NOT EXISTS '${DB_USER}'@'%' ${auth}; GRANT ALL ON *.* TO '${DB_USER}'@'%' WITH GRANT OPTION;`);
            if (grant.status !== 0) {
                console.error(`db-server: could not create the ${DB_USER} account: ${(grant.stderr || '').trim()}`);
                process.exit(1);
            }
            console.log(`db-server: ${s.name} ${ping.stdout.trim()} answers on 127.0.0.1:${s.port} (user ${DB_USER}, password ${DB_USER})`);
            return;
        }
        if (Date.now() > deadline) {
            console.error(`db-server: ${s.container} did not answer within two minutes:\n${sh(eng, ['logs', '--tail', '30', s.container], {quiet: true}).stderr}`);
            process.exit(1);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
}

const force = process.argv.includes('--force');
const [cmd, name, ...rest] = process.argv.slice(2).filter((a) => a !== '--force');
const eng = engine();
if (cmd === 'start' && name) {
    start(eng, server(name));
} else if (cmd === 'stop') {
    let refused = false;
    for (const s of name ? [server(name)] : Object.keys(DB_SERVERS).map(server)) {
        if (state(eng, s) !== 'running') continue;
        // The apps connect as DB_USER and keep their connection (persistent = On).
        const held = Number((sql(eng, s, `SELECT COUNT(*) FROM information_schema.processlist WHERE user = '${DB_USER}'`).stdout || '0').trim()) || 0;
        if (held && !force) {
            console.error(`db-server: ${s.container} left running: ${held} app connection(s) open (this slot's servers, or another slot's); stop them first, or --force`);
            refused = true;
            continue;
        }
        sh(eng, ['stop', s.container]);
        console.log(`db-server: ${s.container} stopped`);
    }
    if (refused) process.exit(1);
} else if (cmd === 'status') {
    for (const s of Object.keys(DB_SERVERS).map(server)) console.log(`${s.name}: ${state(eng, s)} (127.0.0.1:${s.port}, ${s.image})`);
} else if (cmd === 'sql' && name && rest[0]) {
    const out = sql(eng, server(name), rest[0], rest[1]);
    process.stdout.write(out.stdout || '');
    if (out.status !== 0) {
        process.stderr.write((out.stderr || '').replace(/^.*Using a password.*\n/m, ''));
        process.exit(1);
    }
} else {
    console.error('usage: npm run db -- start <mysql|mariadb> | stop [mysql|mariadb] [--force] | status | sql <mysql|mariadb> "<statement>" [database]');
    process.exit(1);
}
