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
 * One extra, fixed server per fleet — the validation variant at basePort +
 * VALIDATION_PORT_OFFSET — serves the same install through a second config
 * file (config.test.validation.inc.php, derived here from the default one)
 * with email validation and the ALTCHA spam check switched on. Tests reach
 * it through the `variants.validation` fixture (PRINCIPLES.md D9).
 */
const {execSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {defineConfig, devices} = require('@playwright/test');
const {loadEnv} = require('./support/env.js');

/**
 * Worker auto-detect. The workload is wait-bound (single-threaded php -S +
 * browser waits), and the measured knee on a 10-core (8P+2E) Mac was exactly
 * the performance-core count — the efficiency cores only add overhead. So:
 * performance cores where the OS can tell them apart (Apple Silicon sysctl,
 * Intel hybrid sysfs), cores - 2 on homogeneous machines. CI runners pin
 * PLAYWRIGHT_WORKERS explicitly (a 4-vcpu runner measured best at 4).
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
    return Math.max(2, os.cpus().length - 2);
}

/**
 * The validation variant: a second config file next to the default one with
 * the config-only switches that have no per-entity scenario key flipped on.
 * base_url must name the variant server — the app builds the activation
 * link in the validation email from it, and a link to worker 0's server
 * would validate against a server whose config says validation is off.
 */
const VALIDATION_PORT_OFFSET = 90;
const VALIDATION_CONFIG_NAME = 'config.test.validation.inc.php';
const validationPatches = (port) => ({
    general: {base_url: `"http://127.0.0.1:${port}"`},
    email: {require_validation: 'On'},
    captcha: {
        altcha: 'on',
        altcha_hmackey: "'e2e-validation-hmac-key'",
        altcha_on_register: 'on',
    },
});

/**
 * Rewrite config keys in place inside their section (an active or commented
 * assignment at line start), appending under the section header when the
 * section lacks the key — the same rules make-test-config.js applies to the
 * template. Returns the patched text.
 */
function patchIni(text, patches) {
    const out = [];
    let pending = {};
    let done = new Set();
    const flushPending = () => {
        for (const [key, value] of Object.entries(pending)) {
            out.push(`${key} = ${value}`);
        }
        pending = {};
        done = new Set();
    };
    for (const line of text.split('\n')) {
        const sectionMatch = line.match(/^\[(\w+)\]/);
        if (sectionMatch) {
            flushPending();
            pending = {...(patches[sectionMatch[1]] || {})};
            out.push(line);
            continue;
        }
        const keyMatch = line.match(/^(;?)\s*([a-z_]+)\s*=/);
        if (keyMatch && pending[keyMatch[2]] !== undefined) {
            out.push(`${keyMatch[2]} = ${pending[keyMatch[2]]}`);
            done.add(keyMatch[2]);
            delete pending[keyMatch[2]];
            continue;
        }
        // A later active assignment would win in ini — drop it.
        if (keyMatch && keyMatch[1] === '' && done.has(keyMatch[2])) {
            continue;
        }
        out.push(line);
    }
    flushPending();
    return out.join('\n');
}

/**
 * Derive the validation-variant config from the default test config and
 * write it next to it. Always regenerated, so it follows the default config
 * (CI generates that one fresh per run). Playwright loads this config in the
 * runner and again in every worker process, so the write is skipped when the
 * content is current and is otherwise atomic (temp file + rename): a running
 * server never reads a half-written file. Returns the variant's path.
 */
function ensureValidationConfig(defaultConfigFile, port) {
    const variantFile = path.join(
        path.dirname(defaultConfigFile),
        VALIDATION_CONFIG_NAME,
    );
    if (!fs.existsSync(defaultConfigFile)) {
        // No default config yet (see harness.md "config.test.inc.php"); the
        // servers cannot serve the install either way.
        return variantFile;
    }
    const content =
        `; Generated by shared/playwright/config-factory.js from ${path.basename(defaultConfigFile)}\n` +
        `; — do not edit; it is rewritten on every Playwright config load.\n` +
        patchIni(fs.readFileSync(defaultConfigFile, 'utf8'), validationPatches(port));
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

function definePkpConfig({appName, appRoot, suiteDir, basePort}) {
    loadEnv(appRoot);
    // The suite (tests, POMs, runtime state) lives in the pkp-e2e repo;
    // appRoot is the app checkout the fleet serves and installs into.
    suiteDir = suiteDir || path.join(appRoot, 'playwright');

    // base-test.js and subprocesses (installTest, reset) read these.
    process.env.PKP_APP_NAME = appName;
    process.env.PKP_APP_ROOT = appRoot;
    process.env.PKP_SUITE_DIR = suiteDir;
    process.env.PKP_CONFIG_FILE =
        process.env.PKP_CONFIG_FILE || path.join(appRoot, 'config.test.inc.php');
    basePort = parseInt(process.env.PLAYWRIGHT_BASE_PORT || String(basePort), 10);
    process.env.PLAYWRIGHT_BASE_PORT = String(basePort);

    // Playwright's own default (50% of cores) can't be used directly because
    // the server fleet below must match the worker count at config time.
    const workers = parseInt(
        process.env.PLAYWRIGHT_WORKERS || String(detectWorkers()),
        10,
    );
    const sharedTestDir = path.join(__dirname, 'tests');
    const appTestDir = path.join(suiteDir, 'tests');

    const serverEnv = {
        PKP_CONFIG_FILE: process.env.PKP_CONFIG_FILE,
        TEST_API_KEY: process.env.TEST_API_KEY || '',
    };
    const validationPort = basePort + VALIDATION_PORT_OFFSET;
    const validationConfigFile = ensureValidationConfig(
        process.env.PKP_CONFIG_FILE,
        validationPort,
    );
    const logDir = path.join(suiteDir, '.server-logs');
    fs.mkdirSync(logDir, {recursive: true});
    const phpServer = (port, {logName = `server-${port}.log`, env = serverEnv} = {}) => {
        const logFile = path.join(logDir, logName);
        const serve = `php -d max_execution_time=120 -S 127.0.0.1:${port} -t "${appRoot}" >> "${logFile}" 2>&1`;
        return {
            command: `: > "${logFile}"; n=0; until ${serve}; do s=$?; n=$((n+1)); [ "$n" -ge 20 ] && exit 1; echo "[harness] php -S died (exit $s); restart $n" >> "${logFile}"; sleep 1; done`,
            url: `http://127.0.0.1:${port}/README.md`,
            reuseExistingServer: true,
            timeout: 30_000,
            env,
        };
    };

    return defineConfig({
        outputDir: path.join(suiteDir, 'test-results'),
        workers,
        fullyParallel: true,
        reporter: [['list']],
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
                name: `${appName}-serial`,
                testDir: path.join(appTestDir, 'serial'),
                workers: 1,
                dependencies: ['shared', appName],
            },
        ],
        // One PHP server per worker; `php -S` is single-threaded. The ready
        // probe is a static file so it answers even before the DB is installed
        // (the setup project handles cold installs itself). `php -S` logs every
        // request to stderr, which Playwright pipes into the reporter output by
        // default — redirect it to per-server log files instead. A server kept
        // alive by reuseExistingServer holds its old log open, so the file is
        // only truncated when a server actually (re)starts.
        //
        // The restart loop is crash resilience: a `php -S` process death
        // (observed in CI: segfault; locally: a 30 s execution-limit fatal
        // inside a DB call) otherwise strands its worker — Playwright never
        // restarts a webServer, so every remaining test on that port fails in
        // milliseconds (20–33-test cascades; ci-triage.md "dead-worker
        // cascade"). The loop respawns the server within a second, bounded so
        // a port conflict can't spin forever; on teardown Playwright kills
        // the whole process tree, shell included, so the loop can't respawn
        // after a run. max_execution_time=120 keeps a merely slow request
        // (seeding under load hits the default 30 s ceiling) from becoming a
        // fatal at all; genuinely hung requests are already bounded by the
        // dead-proxy config and the test timeout.
        //
        // The last entry is the validation variant: same install, second
        // config file, fixed port (workers never reach the offset). Tests
        // navigate to it explicitly through the `variants` fixture.
        webServer: [
            ...Array.from({length: workers}, (_, i) => phpServer(basePort + i)),
            phpServer(validationPort, {
                logName: `server-${validationPort}-validation.log`,
                env: {...serverEnv, PKP_CONFIG_FILE: validationConfigFile},
            }),
        ],
    });
}

module.exports = {definePkpConfig, VALIDATION_PORT_OFFSET};
