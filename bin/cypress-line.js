#!/usr/bin/env node
/**
 * @file bin/cypress-line.js
 *
 * Run an app's own Cypress data suite — the one pkp's CI runs through
 * pkp-github-actions (`run-data-integration-tests.sh`: a fresh install
 * through the installer, then a context, users, issues and submissions
 * through the screens) — on this slot's checkout of the line PKP_E2E_LINE
 * names (`main` unset), on a scratch install of its own:
 *
 *   npm run cypress -- <ojs|omp|ops> [--spec a,b] [--browser electron|<path>]
 *                       [--cft <version|major>] [--label <x>] [--n 0-9]
 *                       [--timeout <min>] [--keep]
 *
 *   PKP_E2E_LINE=stable-3_3_0 npm run cypress -- ojs
 *   PKP_E2E_LINE=stable-3_3_0 npm run cypress -- ojs --spec cypress/tests/data/10-Installation.spec.js
 *   npm run cypress -- ojs --cft 143 --label c143      # Chrome for Testing 143, for a bisect
 *
 * A tool for reading an upstream CI red on a stable branch or a PR that
 * touches those tests (harness.md "The lines' own Cypress suites"), never
 * a standing step. Each run is its own install: a scratch database
 * `<test db>_cy_<label>` on the campaign's role, a `php -S` at basePort +
 * 80 + n serving the checkout with a config derived from
 * config.TEMPLATE.inc.php in the run's dir (the installer writes the
 * database block into it), files, screenshots and downloads there too
 * (.reports/cypress/<line>-<app>-<label>/, cypress.log and server.log
 * beside them). The line's Node and PHP go first on PATH (apps.js). The
 * browser is Cypress's bundled Electron unless --browser names one or
 * --cft fetches a Chrome for Testing build into ~/.cache/cft/ (wrapped so
 * that `--version` prints "Google Chrome N": Cypress 5.6 reads "for
 * Testing" as the version and then drops `--proxy-bypass-list`, and the
 * browser never connects; 2026-10-21).
 *
 * The run ends with its browser's process group, its server and its
 * database stopped and dropped, on a normal end, a signal or --timeout
 * alike — a Cypress 5.6 crash on its browser path left three Chromes alive
 * for eight days on the VM (2026-10-21) — and with the cypress/logs and
 * cypress/screenshots Cypress writes into the checkout removed when the
 * run made them. --keep keeps the database and the server for a look.
 * No test lock: like a probe it has its own port and database, but it
 * shares the cores.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const {spawn, spawnSync, execFileSync} = require('child_process');
const {REPO_ROOT, RUNTIMES_DIR, resolveApp, resolveLine} = require('./apps.js');
const {patchIni} = require('../shared/playwright/ini.js');
const {phpServerCommand, phpServerStatus} = require('../shared/playwright/php-server.js');
const {campaignCredentials, dropDatabase} = require('../shared/playwright/dataset.js');

const PORT_OFFSET = 80; // harness.md "Runtime model", the fleet's port bands
const CFT_DIR = path.join(os.homedir(), '.cache', 'cft');
const CFT_VERSIONS = 'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json';

function usage(message) {
    if (message) console.error(`cypress-line: ${message}`);
    console.error(
        'usage: npm run cypress -- <ojs|omp|ops> [--spec a,b] [--browser electron|<path>] [--cft <version|major>] [--label <x>] [--n 0-9] [--timeout <min>] [--keep]',
    );
    process.exit(2);
}

function parseArgs(argv) {
    const opts = {app: null, spec: null, browser: 'electron', cft: null, label: 'run', n: 0, timeoutMin: 90, keep: false};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            if (i + 1 >= argv.length) usage(`${arg} needs a value`);
            return argv[++i];
        };
        if (arg === '--spec') opts.spec = value();
        else if (arg === '--browser') opts.browser = value();
        else if (arg === '--cft') opts.cft = value();
        else if (arg === '--label') opts.label = value();
        else if (arg === '--n') opts.n = parseInt(value(), 10);
        else if (arg === '--timeout') opts.timeoutMin = parseInt(value(), 10);
        else if (arg === '--keep') opts.keep = true;
        else if (arg.startsWith('-')) usage(`unknown option ${arg}`);
        else if (!opts.app) opts.app = arg;
        else usage(`unexpected argument ${arg}`);
    }
    if (!opts.app) usage();
    if (!Number.isInteger(opts.n) || opts.n < 0 || opts.n > 9) usage('--n takes 0–9');
    if (!Number.isInteger(opts.timeoutMin) || opts.timeoutMin < 1) usage('--timeout takes minutes');
    if (!/^[A-Za-z0-9_-]+$/.test(opts.label)) usage('--label takes letters, digits, - and _');
    return opts;
}

/** The line's Node release first on PATH when fetch-apps downloaded it (the VM); elsewhere the system Node, with a note. */
function useLineNode(line) {
    if (!line || !line.node) return;
    const binDir = path.join(RUNTIMES_DIR, `node-v${line.node}-linux-x64`, 'bin');
    if (fs.existsSync(path.join(binDir, 'node'))) {
        process.env.PATH = [binDir, ...(process.env.PATH || '').split(path.delimiter).filter((d) => d !== binDir)].join(path.delimiter);
    } else {
        console.log(`cypress-line: no ${path.relative(REPO_ROOT, binDir)} — running the line's Cypress on the system Node ${process.version}`);
    }
}

function cypressMajor(appRoot) {
    const pkg = path.join(appRoot, 'node_modules', 'cypress', 'package.json');
    if (!fs.existsSync(pkg)) {
        console.error(`cypress-line: no node_modules/cypress in ${path.relative(REPO_ROOT, appRoot)} — npm ci there (fetch-apps does)`);
        process.exit(1);
    }
    return {version: JSON.parse(fs.readFileSync(pkg, 'utf8')).version, bin: path.join(appRoot, 'node_modules', '.bin', 'cypress')};
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`${url}: HTTP ${res.statusCode}`));
                    return;
                }
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => resolve(JSON.parse(body)));
            })
            .on('error', reject);
    });
}

/** A Chrome for Testing build for `wanted` (a full version, or a major: its last known-good one), downloaded once; returns the wrapper to pass as --browser. */
async function chromeForTesting(wanted) {
    if (process.platform !== 'linux' || process.arch !== 'x64') {
        console.error('cypress-line: --cft fetches linux64 builds only (the VM)');
        process.exit(1);
    }
    let version = wanted;
    if (/^\d+$/.test(wanted)) {
        const known = await fetchJson(CFT_VERSIONS);
        const candidates = known.versions.filter(
            (v) => v.version.split('.')[0] === wanted && (v.downloads.chrome || []).some((d) => d.platform === 'linux64'),
        );
        if (!candidates.length) {
            console.error(`cypress-line: no known-good Chrome for Testing ${wanted}.x with a linux64 build`);
            process.exit(1);
        }
        version = candidates[candidates.length - 1].version;
    }
    const dir = path.join(CFT_DIR, version);
    const binary = path.join(dir, 'chrome-linux64', 'chrome');
    if (!fs.existsSync(binary)) {
        fs.mkdirSync(dir, {recursive: true});
        const zip = path.join(dir, 'chrome-linux64.zip');
        const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/linux64/chrome-linux64.zip`;
        console.log(`cypress-line: fetching Chrome for Testing ${version} into ${dir}`);
        execFileSync('curl', ['-fsSL', '-o', zip, url], {stdio: 'inherit'});
        execFileSync('unzip', ['-q', '-o', zip, '-d', dir], {stdio: 'inherit'});
        fs.rmSync(zip, {force: true});
    }
    const wrapper = path.join(dir, 'chrome');
    fs.writeFileSync(
        wrapper,
        `#!/bin/sh\n# Cypress 5.6 reads "Google Chrome for Testing N" as version "for"; answer as Chrome does.\nif [ "$1" = "--version" ]; then echo "Google Chrome ${version}"; exit 0; fi\nexec "${binary}" "$@"\n`,
        {mode: 0o755},
    );
    return wrapper;
}

/** The run's config: the template with the install switched off and the run's address; the installer writes the rest. */
function writeConfig(app, port, file) {
    const template = fs.readFileSync(path.join(app.root, 'config.TEMPLATE.inc.php'), 'utf8');
    const out =
        `; Generated by bin/cypress-line.js from config.TEMPLATE.inc.php for one Cypress run — do not edit.\n` +
        patchIni(template, {general: {installed: 'Off', base_url: `"http://127.0.0.1:${port}"`}});
    fs.writeFileSync(file, out);
}

function killGroup(child, label) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const target = -child.pid; // the detached spawn made it a group leader
    try {
        process.kill(target, 'SIGTERM');
    } catch {
        return;
    }
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        try {
            process.kill(target, 0);
        } catch {
            return;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    try {
        process.kill(target, 'SIGKILL');
    } catch {
        // gone
    }
    if (label) console.log(`cypress-line: ${label} killed`);
}

/** Cypress's own run summary (the "Tests / Passing / Failing" table), when the log has one. */
function summary(log) {
    const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
    const after = text.slice(text.lastIndexOf('(Run Finished)'));
    const pick = (key) => (after.match(new RegExp(`${key}:\\s+(\\d+)`)) || [])[1];
    const tests = pick('Tests');
    if (tests === undefined) return null;
    return `${tests} tests, ${pick('Passing') || 0} passing, ${pick('Failing') || 0} failing, ${pick('Pending') || 0} pending, ${pick('Skipped') || 0} skipped`;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const app = resolveApp(opts.app);
    const line = resolveLine();
    useLineNode(line);
    const cypress = cypressMajor(app.root);
    const major = parseInt(cypress.version.split('.')[0], 10);
    const browser = opts.cft ? await chromeForTesting(opts.cft) : opts.browser;
    if (browser !== 'electron' && browser.includes('/') && !fs.existsSync(browser)) {
        console.error(`cypress-line: no browser at ${browser}`);
        process.exit(1);
    }

    const port = app.basePort + PORT_OFFSET + opts.n;
    if ((await phpServerStatus(port)) !== null) {
        console.error(`cypress-line: something already serves 127.0.0.1:${port} — another run with --n ${opts.n}? (--n picks the port, +80…+89)`);
        process.exit(1);
    }
    const runDir = path.join(REPO_ROOT, '.reports', 'cypress', `${app.line}-${app.name}-${opts.label}`);
    fs.rmSync(runDir, {recursive: true, force: true});
    for (const d of ['files', 'screenshots', 'downloads']) fs.mkdirSync(path.join(runDir, d), {recursive: true});
    const configFile = path.join(runDir, 'config.inc.php');
    const cypressLog = path.join(runDir, 'cypress.log');
    const serverLog = path.join(runDir, 'server.log');
    const db = `${app.db}_cy_${opts.label}`.toLowerCase();
    const creds = campaignCredentials({campaignConfigFile: path.join(app.root, 'config.test.inc.php')});
    if (!/test/.test(db)) {
        console.error(`cypress-line: database "${db}" does not look like a test DB — refusing`);
        process.exit(1);
    }
    // Cypress writes these into the checkout (both gitignored there); a
    // run that made them removes them, so the checkout stays as found.
    const checkoutDirs = ['cypress/logs', 'cypress/screenshots', 'cypress/downloads']
        .map((d) => path.join(app.root, d))
        .filter((d) => !fs.existsSync(d));

    const pgEnv = {...process.env, ...(creds.password ? {PGPASSWORD: creds.password} : {})};
    const conn = [...(creds.host ? ['-h', creds.host] : []), ...(creds.username ? ['-U', creds.username] : [])];
    dropDatabase(db, creds);
    execFileSync('createdb', [...conn, db], {stdio: 'inherit', env: pgEnv});
    writeConfig(app, port, configFile);

    let server = null;
    let xvfb = null;
    let run = null;
    let done = false;
    const cleanup = (why) => {
        if (done) return;
        done = true;
        killGroup(run, why && 'the Cypress run');
        killGroup(xvfb);
        if (!opts.keep) {
            killGroup(server);
            try {
                dropDatabase(db, creds);
            } catch (e) {
                console.error(`cypress-line: ${e.message}`);
            }
        }
        for (const d of checkoutDirs) fs.rmSync(d, {recursive: true, force: true});
        if (opts.keep) console.log(`cypress-line: kept database ${db} and the server on 127.0.0.1:${port} (pid ${server && server.pid})`);
    };
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(sig, () => {
            cleanup(sig);
            process.exit(130);
        });
    }
    process.on('exit', () => cleanup());

    server = spawn('sh', ['-c', phpServerCommand({appRoot: app.root, port, logFile: serverLog})], {
        detached: true,
        stdio: 'ignore',
        env: {...process.env, PKP_CONFIG_FILE: configFile},
    });
    const deadline = Date.now() + 30_000;
    while ((await phpServerStatus(port)) === null) {
        if (Date.now() > deadline) {
            console.error(`cypress-line: the server on 127.0.0.1:${port} did not come up (${path.relative(REPO_ROOT, serverLog)})`);
            process.exit(1);
        }
        await new Promise((r) => setTimeout(r, 250));
    }

    // Cypress would start an Xvfb on :99 itself, and fail when any other
    // process on the host holds that display's abstract socket (a stale
    // Xvfb in the bot's private tmp did, 2026-10-29); the run's own Xvfb on
    // the display numbered like its port is unique and goes with the run.
    const display = `:${port}`;
    if (process.platform === 'linux') {
        xvfb = spawn('Xvfb', [display, '-screen', '0', '1280x1024x24', '-nolisten', 'tcp'], {detached: true, stdio: 'ignore'});
        const xDeadline = Date.now() + 10_000;
        while (!fs.existsSync(`/tmp/.X11-unix/X${port}`)) {
            if (xvfb.exitCode !== null || Date.now() > xDeadline) {
                console.error(`cypress-line: Xvfb ${display} did not come up (apt install xvfb; /tmp/.X11-unix must exist)`);
                process.exit(1);
            }
            await new Promise((r) => setTimeout(r, 100));
        }
    }

    const baseUrl = `http://127.0.0.1:${port}`;
    const env = [
        'DBTYPE=PostgreSQL',
        `DBHOST=${creds.host || '127.0.0.1'}`,
        `DBNAME=${db}`,
        `DBUSERNAME=${creds.username || ''}`,
        `DBPASSWORD=${creds.password || ''}`,
        `FILESDIR=${path.join(runDir, 'files')}`,
        `baseUrl=${baseUrl}`,
    ].join(',');
    const args = ['run', '--headless', '--browser', browser, '--env', env];
    if (major < 10) {
        // Cypress 5 (3.3): the pre-10 config keys, comma-separated.
        args.push('--config', `integrationFolder=cypress/tests/data,baseUrl=${baseUrl},screenshotsFolder=${path.join(runDir, 'screenshots')},video=false`);
    } else {
        const config = {baseUrl, screenshotsFolder: path.join(runDir, 'screenshots'), downloadsFolder: path.join(runDir, 'downloads'), video: false};
        if (!opts.spec) config.specPattern = ['cypress/tests/data/**/*.cy.js'];
        args.push('--config', JSON.stringify(config));
    }
    if (opts.spec) args.push('--spec', opts.spec);

    console.log(
        `cypress-line: ${app.name} on ${app.line}: Cypress ${cypress.version}, browser ${browser}, ${baseUrl}, database ${db}, ` +
            `${opts.spec ? `specs ${opts.spec}` : 'the data suite'} → ${path.relative(REPO_ROOT, runDir)}`,
    );
    const out = fs.openSync(cypressLog, 'w');
    run = spawn(cypress.bin, args, {
        cwd: app.root,
        detached: true,
        stdio: ['ignore', 'pipe', out],
        // PKP_CONFIG_FILE: the specs' `cy.exec('php lib/pkp/tools/jobs.php run')`
        // and the like run the app's CLI tools from the checkout and must read
        // this run's config, as the server does.
        env: {...process.env, ...(xvfb ? {DISPLAY: display} : {}), PKP_CONFIG_FILE: configFile, TERM: 'dumb', CYPRESS_CRASH_REPORTS: '0', CI: '1'},
    });
    const timer = setTimeout(() => {
        console.error(`cypress-line: --timeout ${opts.timeoutMin} min reached`);
        cleanup('timeout');
        process.exit(124);
    }, opts.timeoutMin * 60_000);
    let pending = '';
    run.stdout.on('data', (chunk) => {
        fs.writeSync(out, chunk);
        pending += chunk.toString();
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const l of lines) {
            if (/Running:|passing|failing|pending \(|Run Finished|All specs passed|✖|Error:|CypressError|never connected/.test(l)) console.log(l.replace(/\s+/g, ' ').trim());
        }
    });
    const code = await new Promise((resolve) => run.on('exit', (c, s) => resolve(c === null ? 128 : c)));
    clearTimeout(timer);
    fs.closeSync(out);
    const total = summary(cypressLog);
    console.log(`cypress-line: Cypress exited ${code}${total ? `: ${total}` : ''}; log ${path.relative(REPO_ROOT, cypressLog)}`);
    cleanup();
    process.exit(code);
}

main().catch((e) => {
    console.error(`cypress-line: ${e.stack || e.message}`);
    process.exit(1);
});
