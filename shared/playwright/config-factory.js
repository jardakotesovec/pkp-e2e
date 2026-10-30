/**
 * @file lib/pkp/playwright/config-factory.js
 *
 * One Playwright config for all three apps. Each app's
 * playwright/playwright.config.js is a three-line call:
 *
 *   const {definePkpConfig} = require('../lib/pkp/playwright/config-factory.js');
 *   module.exports = definePkpConfig({appName: 'ojs', appRoot: ..., basePort: 8000});
 *
 * Because `php -S` serves one request at a time, every parallel worker gets its
 * own PHP server at basePort + parallelIndex (one shared DB and files dir
 * behind them). The per-worker baseURL override lives in support/base-test.js.
 *
 * Projects: setup → {shared, <app>} → <app>-serial. A Playwright project has
 * one testDir, so the shared lib/pkp specs are a sibling project of the app
 * suite; the serial project runs alone at the end (globally-scanning specs).
 *
 * Two extra, fixed servers per fleet, the config variants, serve the same
 * install through a second config file each, derived here from the default
 * one (PRINCIPLES.md D9): the validation variant at basePort +
 * VALIDATION_PORT_OFFSET (config.test.validation.inc.php: email validation
 * and the ALTCHA spam check on) and the reauth variant at basePort +
 * REAUTH_PORT_OFFSET (config.test.reauth.inc.php: the Site Administrator's
 * Confirm Access gate on, a one-minute window). Tests reach them through
 * the `variants.validation` and `variants.reauth` fixtures.
 */
const {execSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {defineConfig, devices} = require('@playwright/test');
const {loadEnv} = require('./support/env.js');
const {patchIni} = require('./ini.js');
const {phpServerCommand, phpServerEnv, phpServerReadyUrl} = require('./php-server.js');

/**
 * Worker auto-detect. The workload is wait-bound (single-threaded php -S +
 * browser waits), and the measured knee on a 10-core (8P+2E) Mac was exactly
 * the performance-core count — the efficiency cores only add overhead. So:
 * performance cores where the OS can tell them apart (Apple Silicon sysctl,
 * Intel hybrid sysfs), every core on homogeneous machines: the 8-core VM
 * (2026-09-23) flattened at 8 (OPS and OJS slower at 6, OPS no faster and
 * redder at 10 and 12), as a 4-vcpu CI runner measured best at 4. CI pins
 * PLAYWRIGHT_WORKERS explicitly.
 */
function detectWorkers() {
    try {
        if (process.platform === 'darwin') {
            const pCores = parseInt(
                execSync('sysctl -n hw.perflevel0.logicalcpu', {
                    stdio: ['ignore', 'pipe', 'ignore'],
                })
                    .toString()
                    .trim(),
                10,
            );
            if (pCores >= 2) {
                return pCores;
            }
        } else if (process.platform === 'linux') {
            // Intel hybrid exposes the P-core cpu list, e.g. "0-11".
            const list = fs
                .readFileSync('/sys/devices/cpu_core/cpus', 'utf8')
                .trim();
            const pCores = list
                .split(',')
                .reduce((n, range) => {
                    const [lo, hi] = range.split('-').map(Number);
                    return n + (hi >= lo ? hi - lo + 1 : 1);
                }, 0);
            if (pCores >= 2) {
                return pCores;
            }
        }
    } catch {
        // Fall through: no P/E split detectable on this machine.
    }
    return Math.max(2, os.cpus().length);
}

/**
 * The config variants: a second config file next to the default one per
 * variant, with config-only switches that have no per-entity scenario key
 * flipped on, served at a fixed port per fleet (workers +0…+19, the probe
 * +50 and the dataset fleets +61…+69 never reach +90 or +91). base_url must
 * name the variant's own server: the app builds absolute links from it (the
 * activation link in the validation email; the Confirm Access form's action
 * and its return address), and a link to worker 0's server lands on a config
 * where the switch is off.
 *
 * - validation (+90): email validation and the ALTCHA check on registration.
 * - reauth (+91): `[security] password_timeout = 1`, so a Site
 *   Administrator re-enters their password ("Confirm Access") before
 *   Administration and the confirmed window lapses after one minute.
 */
/** This clone's root, and the private matrix folder beside it (see projects). */
const REPO_DIR = path.resolve(__dirname, '../..');
const API_MATRIX_DIR = path.resolve(REPO_DIR, '../pkp-e2e-sec/api-matrix');
// Named on the command line (`--project=api-matrix`): set for the workers
// too, which read this config without the runner's arguments.
if (process.argv.some((arg) => arg.includes('api-matrix'))) {
    process.env.PKP_API_MATRIX = '1';
}

const VALIDATION_PORT_OFFSET = 90;
const REAUTH_PORT_OFFSET = 91;
const VARIANTS = {
    validation: {
        offset: VALIDATION_PORT_OFFSET,
        file: 'config.test.validation.inc.php',
        patches: (port) => ({
            general: {base_url: `"http://127.0.0.1:${port}"`},
            email: {require_validation: 'On'},
            captcha: {
                altcha: 'on',
                altcha_hmackey: "'e2e-validation-hmac-key'",
                altcha_on_register: 'on',
            },
        }),
    },
    reauth: {
        offset: REAUTH_PORT_OFFSET,
        file: 'config.test.reauth.inc.php',
        patches: (port) => ({
            general: {base_url: `"http://127.0.0.1:${port}"`},
            security: {password_timeout: '1'},
        }),
    },
};

/** The variant config file's path, next to the default config. */
function variantConfigFile(defaultConfigFile, name) {
    if (!VARIANTS[name]) {
        throw new Error(`config-factory: unknown config variant "${name}" (${Object.keys(VARIANTS).join(', ')})`);
    }
    return path.join(path.dirname(defaultConfigFile), VARIANTS[name].file);
}

/**
 * Derive a variant config from the default test config and write it next to
 * it. Always regenerated, so it follows the default config (CI generates
 * that one fresh per run). Playwright loads this config in the runner and
 * again in every worker process, so the write is skipped when the content is
 * current and is otherwise atomic (temp file + rename): a running server
 * never reads a half-written file. Returns the variant's path.
 */
function ensureVariantConfig(defaultConfigFile, name, port) {
    const variantFile = variantConfigFile(defaultConfigFile, name);
    if (!fs.existsSync(defaultConfigFile)) {
        // No default config yet (see harness.md "config.test.inc.php"); the
        // servers cannot serve the install either way.
        return variantFile;
    }
    const content =
        `; Generated by shared/playwright/config-factory.js from ${path.basename(defaultConfigFile)}\n` +
        `; — do not edit; it is rewritten on every Playwright config load.\n` +
        patchIni(fs.readFileSync(defaultConfigFile, 'utf8'), VARIANTS[name].patches(port));
    let current = null;
    try {
        current = fs.readFileSync(variantFile, 'utf8');
    } catch {
        // absent — write it
    }
    if (current !== content) {
        const tmpFile = `${variantFile}.${process.pid}.tmp`;
        fs.writeFileSync(tmpFile, content);
        fs.renameSync(tmpFile, variantFile);
    }
    return variantFile;
}

/**
 * `--no-deps` drops the solo project's wait on the serial one, so a command
 * that selects the solo project beside any other runs the @solo tests next
 * to the serial project's queue drains and site-level saves: exactly what
 * @solo exists to avoid. Every "U08 S8 / U15 S5 red in <app>-solo after the
 * final" sighting (ci-triage, 2026-09-23..26) was such a combined command
 * ("Running 17 tests using 5 workers"). Refuse it at config time; the two
 * projects run as two commands, serial first (harness.md "Running").
 */
function refuseSoloBesideOthersWithoutDeps(appName, argv = process.argv.slice(2)) {
    if (!argv.includes('--no-deps')) {
        return;
    }
    const selected = [];
    argv.forEach((arg, i) => {
        if (arg.startsWith('--project=')) {
            selected.push(arg.slice('--project='.length));
        } else if (arg === '--project' && argv[i + 1]) {
            selected.push(argv[i + 1]);
        }
    });
    const solo = `${appName}-solo`;
    const matches = (pattern, name) =>
        new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(name);
    const selectsSolo = selected.length === 0 || selected.some((p) => matches(p, solo));
    const selectsOther = selected.length === 0 || selected.some((p) => !matches(p, solo) || p.includes('*'));
    if (selectsSolo && selectsOther) {
        throw new Error(
            `--no-deps with ${solo} beside another project runs the @solo tests concurrently with the others. ` +
            `Run two commands: --project=${appName}-serial --no-deps, then --project=${solo} --no-deps.`,
        );
    }
}

function definePkpConfig({appName, appRoot, suiteDir, basePort}) {
    refuseSoloBesideOthersWithoutDeps(appName);
    // One slot's runs at a time on this machine (test-lock.js); a no-op in
    // workers, under test-app/test-final/fleet-prep (they hold it) and on CI.
    require('./test-lock.js').acquire(`playwright ${process.argv.slice(2).join(' ')}`);
    require('./mailpit.js').ensureMailpit();
    loadEnv(appRoot);
    // The suite (tests, POMs, runtime state) lives in the pkp-e2e repo;
    // appRoot is the app checkout the fleet serves and installs into.
    suiteDir = suiteDir || path.join(appRoot, 'playwright');

    // base-test.js and subprocesses (installTest, reset) read these.
    // The private matrix requires the harness from this clone through it.
    process.env.PKP_E2E_DIR = REPO_DIR;
    process.env.PKP_APP_NAME = appName;
    process.env.PKP_APP_ROOT = appRoot;
    process.env.PKP_SUITE_DIR = suiteDir;
    process.env.PKP_CONFIG_FILE =
        process.env.PKP_CONFIG_FILE || path.join(appRoot, 'config.test.inc.php');
    basePort = parseInt(process.env.PLAYWRIGHT_BASE_PORT || String(basePort), 10);
    process.env.PLAYWRIGHT_BASE_PORT = String(basePort);
    // The PHP servers run in UTC; dates the runner and its workers compute
    // (due dates, "today") must sit in the same zone, or a run between
    // local midnight and 00:00 UTC is a day ahead of the app. CI is UTC
    // already; this pins the Mac and the VM.
    process.env.TZ = process.env.TZ || 'UTC';

    // Playwright's own default (50% of cores) can't be used directly because
    // the server fleet below must match the worker count at config time.
    const workers = parseInt(
        process.env.PLAYWRIGHT_WORKERS || String(detectWorkers()),
        10,
    );
    const sharedTestDir = path.join(__dirname, 'tests');
    const appTestDir = path.join(suiteDir, 'tests');

    const serverEnv = phpServerEnv({
        configFile: process.env.PKP_CONFIG_FILE,
        testApiKey: process.env.TEST_API_KEY,
    });
    const variantServers = Object.entries(VARIANTS).map(([name, {offset}]) => {
        const port = basePort + offset;
        return {name, port, configFile: ensureVariantConfig(process.env.PKP_CONFIG_FILE, name, port)};
    });
    const logDir = path.join(suiteDir, '.server-logs');
    fs.mkdirSync(logDir, {recursive: true});
    // Playwright stops its webServers when a run ends, fails or takes a
    // Ctrl-C, through its exit handler, but a SIGTERM to the runner (a
    // stopped background task, a timeout, test-app.js passing one on) killed
    // it without one and left every server serving (2026-10-02, 127 php
    // processes on the VM). Exiting on SIGTERM runs that handler. A SIGKILL
    // still leaves them; bin/slot.js stops a slot's servers on release.
    process.once('SIGTERM', () => process.exit(143));

    // The command and env come from php-server.js, shared with the probe
    // servers (bin/probe-servers.js) so both kinds of server are identical.
    const phpServer = (port, {logName = `server-${port}.log`, env = serverEnv} = {}) => ({
        command: phpServerCommand({appRoot, port, logFile: path.join(logDir, logName), requestLog: true}),
        url: phpServerReadyUrl(port),
        reuseExistingServer: true,
        timeout: 30_000,
        env,
    });

    return defineConfig({
        outputDir: path.join(suiteDir, 'test-results'),
        workers,
        fullyParallel: true,
        // timed-shards.js balances `--shard` by recorded per-test time and
        // records this run's times (CI's shards; a CLI --reporter drops it).
        reporter: [['list'], [require.resolve('./timed-shards.js')]],
        timeout: 60_000,
        expect: {timeout: 10_000},
        use: {
            ...devices['Desktop Chrome'],
            baseURL: `http://127.0.0.1:${basePort}`,
            // 'retain-on-failure' records a full trace per test and discards
            // it on pass — ~12% of suite wall time and half the CPU (2026-08-21
            // perf research). With retries 0 'on-first-retry' never records;
            // flip retries on (or set PWDEBUG traces) when hunting a failure.
            trace: 'on-first-retry',
            // Tests never wait on cosmetic motion; support/motion.js injects
            // the matching CSS override into every context the harness opens.
            reducedMotion: 'reduce',
        },
        projects: [
            {
                name: 'setup',
                testDir: sharedTestDir,
                testMatch: /bootstrap\.setup\.js/,
            },
            {
                name: 'shared',
                testDir: sharedTestDir,
                testIgnore: /bootstrap\.setup\.js/,
                dependencies: ['setup'],
            },
            {
                name: appName,
                testDir: appTestDir,
                testIgnore: /serial[\\/]/,
                dependencies: ['setup'],
            },
            {
                // The serial project's contract is "after the parallel
                // project" (patterns.md parallel lesson 7: a runner drains
                // the shared queue, so nothing may seed while one runs), not
                // "one test at a time": its specs seed their own scratch
                // contexts and the queue's pop is FOR UPDATE SKIP LOCKED, so
                // concurrent runners are safe. At one worker the project was
                // 24% of the OJS wall time for 4% of the work (2026-09-13).
                name: `${appName}-serial`,
                testDir: path.join(appTestDir, 'serial'),
                workers: Math.min(4, workers),
                grepInvert: /@solo/,
                dependencies: ['shared', appName],
            },
            {
                // A test that asserts "not yet, until the jobs run" cannot
                // share the queue with other tests' drains: it runs alone,
                // after the serial project, tagged @solo in its title.
                name: `${appName}-solo`,
                testDir: path.join(appTestDir, 'serial'),
                workers: 1,
                grep: /@solo/,
                dependencies: [`${appName}-serial`],
            },
            // The API permission matrix lives in the private security repo
            // (docs/process/api.md "Permission grids"): the project exists
            // only where that repo sits next to this clone, and only when
            // named (`--project=api-matrix`), so a bare run never includes
            // it; never on CI.
            ...(process.env.PKP_API_MATRIX && fs.existsSync(API_MATRIX_DIR)
                ? [{name: 'api-matrix', testDir: API_MATRIX_DIR, dependencies: ['setup']}]
                : []),
        ],
        // One PHP server per worker; `php -S` is single-threaded. The ready
        // probe is a static file so it answers even before the DB is installed
        // (the setup project handles cold installs itself). The command's
        // logging and restart loop are explained in php-server.js; on
        // teardown Playwright kills the whole process tree, shell included,
        // so the loop can't respawn after a run.
        //
        // The last entries are the config variants: same install, a config
        // file of their own, fixed ports (workers never reach the offsets).
        // Tests navigate to them explicitly through the `variants` fixture.
        webServer: [
            ...Array.from({length: workers}, (_, i) => phpServer(basePort + i)),
            ...variantServers.map(({name, port, configFile}) =>
                phpServer(port, {
                    logName: `server-${port}-${name}.log`,
                    env: {...serverEnv, PKP_CONFIG_FILE: configFile},
                }),
            ),
        ],
    });
}

module.exports = {
    definePkpConfig,
    VALIDATION_PORT_OFFSET,
    REAUTH_PORT_OFFSET,
    VARIANTS,
    variantConfigFile,
    ensureVariantConfig,
    refuseSoloBesideOthersWithoutDeps,
};
