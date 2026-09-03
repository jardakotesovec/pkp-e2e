/**
 * @file shared/playwright/probe/index.js
 *
 * The probe kit: what a throwaway spec-verification script needs, as a thin
 * wrapper over the harness modules tests already use (LoginPage, users.js,
 * PkpApi, PkpMail, waitForJQueryIdle, disableMotion, bin/apps.js). It holds
 * no assertions and no test-runner coupling; tests never import it
 * (`npm run lint:probe-imports`). The rules and an example are in
 * docs/process/patterns.md "Probe kit".
 *
 * Every script runs through `bin/probe.js <app|all> <script>` with two
 * environment variables set: PROBE_FEATURE (the spec, e.g. U03) and
 * PROBE_AGENT (a short id for the agent, e.g. g1). Everything the kit
 * writes lands under .reports/<PROBE_FEATURE>/<PROBE_AGENT>/.
 *
 * Ports: a probe talks to the app's detached probe server at basePort + 50
 * (`npm run probe-servers -- --start`), never to a worker's port; the
 * validation variant at basePort + 90 is shared with the runner and reached
 * through `app.variant('validation')`.
 */
const fs = require('fs');
const path = require('path');
const {chromium} = require('@playwright/test');
const {request} = require('@playwright/test');
const {APPS, REPO_ROOT, resolveApp} = require('../../../bin/apps.js');
const {PkpApi} = require('../support/api.js');
const {PkpMail} = require('../support/mail.js');
const {waitForJQueryIdle} = require('../support/legacy.js');
const {disableMotion} = require('../support/motion.js');
const {LoginPage} = require('../pages/LoginPage.js');
const users = require('../data/users.js');
const {VALIDATION_PORT_OFFSET} = require('../config-factory.js');

const PROBE_PORT_OFFSET = 50;
const WORKER_PORT_SPAN = 20; // basePort + 0 … + 19 belong to the runner's workers

// ---------------------------------------------------------------------------
// Where output goes

function requireEnv(name, hint) {
    const value = (process.env[name] || '').trim();
    if (!value) {
        throw new Error(`probe: ${name} is not set — ${hint}`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
        throw new Error(`probe: ${name}="${value}" must be a plain token (letters, digits, _ . -)`);
    }
    return value;
}

let outDirCache = null;
/** `.reports/<PROBE_FEATURE>/<PROBE_AGENT>/`, created on first use. */
function outDir() {
    if (!outDirCache) {
        const feature = requireEnv('PROBE_FEATURE', 'the spec id, e.g. PROBE_FEATURE=U03');
        const agent = requireEnv('PROBE_AGENT', 'a short id for this agent, e.g. PROBE_AGENT=g1');
        outDirCache = path.join(REPO_ROOT, '.reports', feature, agent);
        fs.mkdirSync(outDirCache, {recursive: true});
    }
    return outDirCache;
}

/** File-safe name: keeps letters, digits, `_ - .`; everything else becomes `_`. */
function safeName(name) {
    return String(name).replace(/[^A-Za-z0-9_.-]+/g, '_');
}

// ---------------------------------------------------------------------------
// Apps and their environment

/**
 * The checkout's .env.playwright as a map (the same syntax support/env.js
 * loads into process.env). Read into a map, not process.env, so one process
 * can hold three apps with three keys and three ports. Shell exports win
 * for TEST_API_KEY and MAILPIT_URL only (the runner's rule); the port always
 * comes from the file, else the registry, so `PLAYWRIGHT_BASE_PORT` in the
 * shell cannot shift every app onto one fleet.
 */
function readEnvFile(dir, fileName = '.env.playwright') {
    const map = {};
    const envFile = path.join(dir, fileName);
    if (!fs.existsSync(envFile)) {
        return map;
    }
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq === -1) {
            continue;
        }
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        map[key] = value;
    }
    return map;
}

/**
 * The static part of an app's bag: identity, ports, config, key. No browser,
 * no request context, so bin/probe-servers.js can use it too.
 *
 * @param {string} name ojs | omp | ops
 */
function resolveProbeApp(name) {
    const app = resolveApp(name);
    const env = readEnvFile(app.root);
    const basePort = parseInt(env.PLAYWRIGHT_BASE_PORT || String(app.basePort), 10);
    const port = basePort + PROBE_PORT_OFFSET;
    if (port < basePort + WORKER_PORT_SPAN || port === basePort + VALIDATION_PORT_OFFSET) {
        throw new Error(`probe: port ${port} for ${name} collides with the runner's bands`);
    }
    let testApiKey = env.TEST_API_KEY || '';
    let keySource = path.relative(REPO_ROOT, path.join(app.root, '.env.playwright'));
    if (process.env.TEST_API_KEY) {
        testApiKey = process.env.TEST_API_KEY;
        keySource = 'shell TEST_API_KEY';
    }
    if (!testApiKey) {
        keySource = 'NO KEY (the _test API will answer 404/403)';
    }
    const mailpitUrl = process.env.MAILPIT_URL || env.MAILPIT_URL || 'http://127.0.0.1:8025';
    const configFile = env.PKP_CONFIG_FILE || path.join(app.root, 'config.test.inc.php');
    // The runner generates this one next to the default config on every
    // config load (config-factory.js); the kit only reads its location.
    const validationConfigFile = path.join(path.dirname(configFile), 'config.test.validation.inc.php');
    // eslint-disable-next-line import/no-dynamic-require
    const appContext = require(path.join(app.suiteDir, 'support', 'app.context.js'));
    const baseURL = `http://127.0.0.1:${port}`;
    return {
        app: name,
        name,
        root: app.root,
        suiteDir: app.suiteDir,
        basePort,
        port,
        baseURL,
        configFile,
        validationConfigFile,
        validationPort: basePort + VALIDATION_PORT_OFFSET,
        testApiKey,
        keySource,
        mailpitUrl,
        contextPath: appContext.contextPath,
        appContext,
        /** Absolute URL on the probe server: url('/index.php/publicknowledge/user/register'). */
        url: (pathname) => `${baseURL}${pathname}`,
        /**
         * Base URL of a fixed alternate server that the runner also uses.
         * 'validation' = basePort + 90: email validation and ALTCHA on.
         */
        variant: (kind) => {
            if (kind !== 'validation') {
                throw new Error(`probe: unknown variant "${kind}" (only "validation")`);
            }
            return `http://127.0.0.1:${basePort + VALIDATION_PORT_OFFSET}`;
        },
    };
}

/** The apps this process handles: PROBE_APPS from bin/probe.js, then ONLY=ojs,omp. */
function probeApps() {
    const all = Object.keys(APPS);
    const parse = (value) =>
        String(value)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    let list = process.env.PROBE_APPS ? parse(process.env.PROBE_APPS) : all;
    if (process.env.ONLY) {
        const only = parse(process.env.ONLY);
        list = list.filter((name) => only.includes(name));
    }
    for (const name of list) {
        if (!APPS[name]) {
            throw new Error(`probe: unknown app "${name}" — one of ${all.join(', ')}`);
        }
    }
    return list;
}

// ---------------------------------------------------------------------------
// The run record (per app): responses seen, written at the end

const runs = new Map(); // app name → record
const locatorRows = [];

function runRecord(app) {
    if (!runs.has(app.name)) {
        runs.set(app.name, {
            app: app.name,
            port: app.port,
            keySource: app.keySource,
            startedAt: new Date().toISOString(),
            responses: [],
        });
    }
    return runs.get(app.name);
}

function flush() {
    if (runs.size === 0 && locatorRows.length === 0) {
        return; // nothing ran (a tool merely required the kit)
    }
    try {
        const dir = outDir();
        for (const record of runs.values()) {
            record.endedAt = new Date().toISOString();
            fs.writeFileSync(
                path.join(dir, `run-${record.app}.json`),
                JSON.stringify(record, null, 2),
            );
        }
        if (locatorRows.length) {
            fs.writeFileSync(path.join(dir, 'locators.md'), locatorTable());
        }
    } catch (error) {
        // Never mask the script's own failure with a bookkeeping error.
        console.error(`probe: could not write the run record: ${error.message}`);
    }
}
process.on('exit', flush);

// ---------------------------------------------------------------------------
// withApp / forEachApp

/**
 * Hand `fn` one app's bag: {app, name, root, baseURL, port, api, mail,
 * users, contextPath, url(), variant()}. `api` is a PkpApi on the probe
 * server with that app's own key; `mail` is a PkpMail on the shared Mailpit.
 * Sets the PKP_* process env for the app while `fn` runs (some harness
 * helpers read it).
 *
 * @param {string} name ojs | omp | ops
 * @param {(app: object) => Promise<any>} fn
 */
async function withApp(name, fn) {
    const app = resolveProbeApp(name);
    outDir();
    process.env.PKP_APP_NAME = app.name;
    process.env.PKP_APP_ROOT = app.root;
    process.env.PKP_SUITE_DIR = app.suiteDir;
    process.env.PLAYWRIGHT_BASE_PORT = String(app.basePort);
    const apiContext = await request.newContext({
        baseURL: app.baseURL,
        extraHTTPHeaders: {'X-Test-Key': app.testApiKey},
    });
    app.api = new PkpApi(apiContext);
    app.mail = new PkpMail({url: app.mailpitUrl});
    app.users = users;
    runRecord(app);
    try {
        return await fn(app);
    } finally {
        await app.api.dispose().catch(() => {});
        flush();
    }
}

/**
 * `withApp` for every app this process handles (bin/probe.js's <app|all>,
 * then the ONLY=ojs,omp filter), sequentially. A failure on one app is
 * reported and the next app still runs; the process exits 1 at the end.
 *
 * @param {(app: object) => Promise<any>} fn
 * @returns {Promise<Object<string, any>>} results by app name
 */
async function forEachApp(fn) {
    const results = {};
    let failed = false;
    for (const name of probeApps()) {
        try {
            results[name] = await withApp(name, fn);
        } catch (error) {
            failed = true;
            console.error(`[probe] ${name} FAILED: ${error.stack || error}`);
        }
    }
    if (failed) {
        process.exitCode = 1;
    }
    return results;
}

// ---------------------------------------------------------------------------
// Browser

/**
 * A headless Chromium at 1280×900 with animations off, baseURL on the probe
 * server, and a response listener that records URL, method, status and size
 * (never a body) for `/api/` calls and every status ≥ 400 into the run
 * record. Returns {browser, context, page, close}.
 *
 * @param {object} app the bag from withApp
 * @param {{storageState?: object|string, headless?: boolean}} [options]
 */
async function launch(app, {storageState, headless = true} = {}) {
    if (!app || !app.baseURL) {
        throw new Error('probe: launch(app) needs the bag from withApp');
    }
    const record = runRecord(app);
    const browser = await chromium.launch({headless});
    const context = await browser.newContext({
        baseURL: app.baseURL,
        viewport: {width: 1280, height: 900},
        reducedMotion: 'reduce',
        storageState: storageState || {cookies: [], origins: []},
    });
    await disableMotion(context);
    context.on('response', (response) => {
        const url = response.url();
        const status = response.status();
        if (!url.includes('/api/') && status < 400) {
            return;
        }
        const entry = {
            at: new Date().toISOString(),
            method: response.request().method(),
            url,
            status,
            size: null,
        };
        record.responses.push(entry);
        const length = response.headers()['content-length'];
        if (length !== undefined) {
            entry.size = parseInt(length, 10);
        } else {
            response
                .body()
                .then((body) => {
                    entry.size = body.length;
                })
                .catch(() => {});
        }
    });
    const page = await context.newPage();
    console.log(`[probe] ${app.name}: ${app.baseURL} (key from ${app.keySource})`);
    return {
        browser,
        context,
        page,
        close: async () => {
            await context.close().catch(() => {});
            await browser.close().catch(() => {});
        },
    };
}

/**
 * Sign in through the real login form on the page's own server (the probe
 * server unless `origin` names another, e.g. app.variant('validation')).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} username a roster username (users.md) or a scratch user
 * @param {{password?: string, origin?: string}} [options]
 */
async function signIn(page, username, {password, origin} = {}) {
    const loginPage = new LoginPage(page);
    if (origin) {
        await page.goto(`${origin}/index.php/index/en/login`);
    } else {
        await loginPage.goto();
    }
    await loginPage.signIn(username, password || users.getPassword(username));
}

/**
 * Sign out through the app's own sign-out URL (what the "Logout" link
 * points at) and wait for the redirect to land.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{origin?: string}} [options]
 */
async function signOut(page, {origin = ''} = {}) {
    await page.goto(`${origin}/index.php/index/login/signOut`);
    await page.waitForURL((url) => !url.pathname.endsWith('/signOut'), {
        timeout: 15_000,
        waitUntil: 'commit',
    });
}

// ---------------------------------------------------------------------------
// Reading a screen

async function innerTextOf(locator) {
    try {
        if ((await locator.count()) === 0) {
            return null;
        }
        return await locator.first().innerText();
    } catch {
        return null;
    }
}

/**
 * What the screen shows, as data: {url, title, aria, text}. `aria` is the
 * aria snapshot of the main region (body when the page has no `main`) plus
 * every open dialog; `text` is the verbatim innerText of the header and the
 * main region — aria snapshots normalise punctuation, innerText does not.
 *
 * @param {import('@playwright/test').Page} page
 */
async function screen(page) {
    const main = page.locator('main');
    const hasMain = (await main.count()) > 0;
    const region = hasMain ? main.first() : page.locator('body');
    const aria = {main: await region.ariaSnapshot(), dialogs: []};
    for (const dialog of await page.locator('[role="dialog"]:visible').all()) {
        aria.dialogs.push(await dialog.ariaSnapshot());
    }
    return {
        url: page.url(),
        title: await page.title(),
        aria,
        text: {
            header: await innerTextOf(page.locator('header')),
            main: await innerTextOf(hasMain ? main : page.locator('body')),
        },
    };
}

/**
 * Full-page screenshot as <name>.png in the output dir. Returns the path.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function shot(page, name) {
    const file = path.join(outDir(), `${safeName(name)}.png`);
    await page.screenshot({path: file, fullPage: true});
    return file;
}

/**
 * Write <name>.json in the output dir. Returns the path.
 *
 * @param {string} name
 * @param {any} data
 */
function record(name, data) {
    const file = path.join(outDir(), `${safeName(name)}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
}

/**
 * Note a locator for the test author: how the script found an element,
 * described in words, with the selector and what it matched. The rows
 * become locators.md in the output dir when the process exits.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} description e.g. "the Register button"
 * @param {import('@playwright/test').Locator} locator
 */
async function loc(page, description, locator) {
    let count = null;
    let visible = null;
    try {
        count = await locator.count();
        visible = count > 0 ? await locator.first().isVisible() : false;
    } catch {
        // an invalid selector is still worth a row
    }
    locatorRows.push({
        app: process.env.PKP_APP_NAME || '',
        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
        description,
        locator: String(locator),
        count,
        visible,
    });
    return locator;
}

/** The rows collected by loc() as a Markdown table. */
function locatorTable() {
    const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const lines = [
        '| app | screen | element | locator | matches | visible |',
        '|---|---|---|---|---|---|',
    ];
    for (const row of locatorRows) {
        lines.push(
            `| ${cell(row.app)} | ${cell(row.url)} | ${cell(row.description)} | \`${cell(row.locator)}\` | ${cell(row.count)} | ${cell(row.visible)} |`,
        );
    }
    return `${lines.join('\n')}\n`;
}

/** Wait until jQuery has no in-flight requests (legacy grids, AjaxModals). */
async function idle(page) {
    await waitForJQueryIdle(page);
}

/**
 * A unique scratch tag: `<prefix><agent><random>`, a single lowercase
 * alphanumeric token of at most 32 characters (patterns.md "Tag
 * conventions"), so it works as a context path, a username and a search
 * term.
 *
 * @param {string} prefix e.g. "u03reg"
 */
function tag(prefix) {
    const agent = (process.env.PROBE_AGENT || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const value = `${String(prefix).toLowerCase().replace(/[^a-z0-9]/g, '')}${agent}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    if (value.length > 32) {
        throw new Error(`probe: tag "${value}" exceeds 32 characters — shorten the prefix`);
    }
    return value;
}

module.exports = {
    PROBE_PORT_OFFSET,
    VALIDATION_PORT_OFFSET,
    resolveProbeApp,
    probeApps,
    withApp,
    forEachApp,
    launch,
    signIn,
    signOut,
    screen,
    shot,
    record,
    loc,
    locatorTable,
    idle,
    tag,
    outDir,
    users,
};
