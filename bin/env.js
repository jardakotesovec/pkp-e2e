#!/usr/bin/env node
/**
 * @file bin/env.js
 *
 * Claim/release the permanent app environments so parallel sessions (git
 * worktrees of this repo) never share a fleet. Environments are the
 * checkouts/ (env 0) and checkouts-s<N>/ sets in the MAIN worktree,
 * provisioned by `fetch-apps --slot N` — see docs/process/harness.md
 * "Environments" and docs/process/MAINTENANCE.md "Session hygiene".
 *
 *   node bin/env.js claim [N] [--app ojs]   claim env N (default: any free),
 *                                           write this worktree's .env
 *   node bin/env.js release [N] [--force]   drop this worktree's claim
 *                                           (--force: drop anyone's)
 *   node bin/env.js status                  list environments and claims
 *
 * A claim is one file, <env-dir>/.claimed, created atomically (O_EXCL) —
 * whoever creates it holds the environment until release. Claiming writes
 * the invoking worktree's .env with absolute <APP>_ROOT paths, which is the
 * only wiring a session needs: ports/DBs/API key are baked into each env's
 * own .env.playwright + config.test.inc.php at provision time.
 */
const path = require('path');
const fs = require('fs');
const {execFileSync} = require('child_process');
const {APPS} = require('./apps.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(REPO_ROOT, '.env');
const MANAGED_MARKER = 'managed by bin/env.js';
const STALE_MS = 24 * 60 * 60 * 1000;

// Environments live in the MAIN worktree (worktree sessions share them).
function mainWorktreeRoot() {
    try {
        const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
        });
        const first = out.split('\n').find((l) => l.startsWith('worktree '));
        if (first) return first.slice('worktree '.length);
    } catch {
        // not a worktree setup — fall through
    }
    return REPO_ROOT;
}

function listEnvs() {
    const root = mainWorktreeRoot();
    return fs
        .readdirSync(root)
        .map((entry) => {
            const m = entry.match(/^checkouts(?:-s(\d+))?$/);
            if (!m) return null;
            const dir = path.join(root, entry);
            if (!fs.statSync(dir).isDirectory()) return null;
            const apps = Object.keys(APPS).filter((name) =>
                fs.existsSync(path.join(dir, name, 'config.TEMPLATE.inc.php'))
            );
            if (!apps.length) return null;
            const n = m[1] ? Number(m[1]) : 0;
            let claim = null;
            const claimFile = path.join(dir, '.claimed');
            try {
                claim = JSON.parse(fs.readFileSync(claimFile, 'utf8'));
            } catch {
                // unclaimed (or unreadable marker — status shows the raw case)
            }
            return {n, dir, claimFile, apps, claim};
        })
        .filter(Boolean)
        .sort((a, b) => a.n - b.n);
}

const isStale = (claim) =>
    claim &&
    (!fs.existsSync(claim.worktree) ||
        Date.now() - Date.parse(claim.created) > STALE_MS);

function describe(env) {
    const ports = env.apps
        .map((a) => `${a} ${APPS[a].basePort + env.n * 1000}`)
        .join(', ');
    const dbs = env.apps
        .map((a) => `${a}_test${env.n ? `_s${env.n}` : ''}`)
        .join(', ');
    return `env ${env.n}  ${env.dir}\n  apps: ${env.apps.join(', ')}  ports: ${ports}\n  DBs: ${dbs}`;
}

function claim(envNumber, appFilter) {
    const envs = listEnvs();
    if (!envs.length) {
        console.error(
            'No environments found — provision with `npm run fetch-apps` ' +
                '(env 0) / `npm run fetch-apps -- --slot N`.'
        );
        process.exit(1);
    }
    const candidates =
        envNumber === null ? envs : envs.filter((e) => e.n === envNumber);
    if (!candidates.length) {
        console.error(`No environment ${envNumber} — have: ${envs.map((e) => e.n).join(', ')}`);
        process.exit(1);
    }
    if (
        fs.existsSync(ENV_FILE) &&
        !fs.readFileSync(ENV_FILE, 'utf8').includes(MANAGED_MARKER)
    ) {
        console.error(
            `${ENV_FILE} exists and is hand-written — move it aside (or point ` +
                'its <APP>_ROOT values at a claimed environment yourself).'
        );
        process.exit(1);
    }
    for (const env of candidates) {
        if (appFilter && !env.apps.includes(appFilter)) continue;
        try {
            fs.writeFileSync(
                env.claimFile,
                JSON.stringify(
                    {worktree: REPO_ROOT, created: new Date().toISOString()},
                    null,
                    4
                ) + '\n',
                {flag: 'wx'}
            );
        } catch {
            continue; // already claimed — try the next one
        }
        fs.writeFileSync(
            ENV_FILE,
            [
                `# ${MANAGED_MARKER} — claimed environment ${env.n} (${env.dir})`,
                ...env.apps.map(
                    (a) => `${a.toUpperCase()}_ROOT=${path.join(env.dir, a)}`
                ),
                '',
            ].join('\n')
        );
        console.log(`claimed ${describe(env)}`);
        console.log(`  wrote ${ENV_FILE}`);
        console.log(
            [
                'Next (per app you touch — plain git/npm, see MAINTENANCE.md):',
                '  1. checkout the ref the task needs (PR ref: `git fetch upstream',
                '     pull/<n>/head && git checkout --detach FETCH_HEAD` — inside',
                '     lib/pkp for pkp-lib PRs), then `git submodule update --init',
                '     --recursive`',
                '  2. composer install (cheap no-op when nothing changed); npm ci +',
                '     npm run build ONLY if the diff touches package-lock.json or',
                '     buildable sources',
                '  3. npm run mount && npm run reset:<app>  (never trust inherited state)',
                'When done: npm run env -- release',
            ].join('\n')
        );
        return;
    }
    console.error(
        appFilter && envNumber === null
            ? `No free environment has ${appFilter} — \`npm run env -- status\`:`
            : 'No free environment — `npm run env -- status`:'
    );
    status();
    process.exit(1);
}

function release(envNumber, force) {
    const envs = listEnvs().filter(
        (e) =>
            (envNumber === null || e.n === envNumber) &&
            e.claim &&
            (force || e.claim.worktree === REPO_ROOT)
    );
    if (!envs.length) {
        console.error(
            envNumber === null
                ? 'Nothing claimed by this worktree (release <N> --force frees a stale claim).'
                : `Environment ${envNumber} is not claimed by this worktree (--force overrides).`
        );
        process.exit(1);
    }
    for (const env of envs) {
        fs.unlinkSync(env.claimFile);
        console.log(`released env ${env.n} (${env.dir})`);
    }
}

function status() {
    for (const env of listEnvs()) {
        console.log(describe(env));
        for (const a of env.apps) {
            try {
                const head = execFileSync(
                    'git',
                    ['log', '-1', '--format=%h %s (%cs)'],
                    {cwd: path.join(env.dir, a), encoding: 'utf8'}
                ).trim();
                console.log(`  ${a} HEAD: ${head}`);
            } catch {
                console.log(`  ${a} HEAD: unreadable`);
            }
        }
        if (env.claim) {
            console.log(
                `  claimed by ${env.claim.worktree} since ${env.claim.created}` +
                    (isStale(env.claim) ? '  ⚠ STALE (worktree gone or >24h)' : '')
            );
        } else if (fs.existsSync(env.claimFile)) {
            console.log(`  ⚠ unreadable ${env.claimFile} — inspect/remove by hand`);
        } else {
            console.log('  free');
        }
    }
}

const argv = process.argv.slice(2);
const command = argv.shift();
const force = argv.includes('--force');
let appFilter = null;
const appIdx = argv.indexOf('--app');
if (appIdx !== -1) {
    appFilter = argv[appIdx + 1];
    if (!APPS[appFilter]) {
        console.error(`--app needs one of: ${Object.keys(APPS).join(', ')}`);
        process.exit(1);
    }
}
const numberArg = argv.find((a) => /^\d+$/.test(a));
const envNumber = numberArg === undefined ? null : Number(numberArg);

if (command === 'claim') claim(envNumber, appFilter);
else if (command === 'release') release(envNumber, force);
else if (command === 'status') status();
else {
    console.error(
        'usage: node bin/env.js <claim [N] [--app ojs|omp|ops] | release [N] [--force] | status>'
    );
    process.exit(1);
}
