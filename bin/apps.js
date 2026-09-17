/**
 * @file bin/apps.js
 *
 * The app registry: fleet identity per app plus checkout resolution.
 * Checkout paths come from the repo .env (<APP>_ROOT), e.g.
 *
 *   OJS_ROOT=/home/me/ojs
 */
const path = require('path');
const fs = require('fs');
const {loadEnv} = require('../shared/playwright/support/env.js');

const REPO_ROOT = path.resolve(__dirname, '..');

const APPS = {
    ojs: {basePort: 8000},
    omp: {basePort: 8100},
    ops: {basePort: 8200},
};

// A second set of checkouts on a stable branch, beside the `main` ones
// (harness.md "The fleets"): checkouts/<line>/<app>, ports shifted, DBs
// suffixed, so both lines stay up side by side. PKP_E2E_LINE selects one for
// every script that resolves an app here; unset is `main`.
const LINES = {
    'stable-3_5_0': {branch: 'stable-3_5_0', portShift: 1000, dbSuffix: '_3_5'},
};

/** @returns {{name: string, branch: string, portShift: number, dbSuffix: string}|null} */
function resolveLine(name = process.env.PKP_E2E_LINE) {
    if (!name || name === 'main') {
        return null;
    }
    if (!LINES[name]) {
        console.error(`Unknown line "${name}" — one of: main, ${Object.keys(LINES).join(', ')}`);
        process.exit(1);
    }
    return {name, ...LINES[name]};
}

/** @returns {{name: string, root: string, suiteDir: string, basePort: number, line: string}} */
function resolveApp(name) {
    if (!APPS[name]) {
        console.error(`Unknown app "${name}" — one of: ${Object.keys(APPS).join(', ')}`);
        process.exit(1);
    }
    loadEnv(REPO_ROOT, '.env');
    const line = resolveLine();
    if (line) {
        const root = path.join(REPO_ROOT, 'checkouts', line.name, name);
        if (!fs.existsSync(path.join(root, 'config.TEMPLATE.inc.php'))) {
            console.error(`No ${line.name} checkout of ${name} — npm run fetch-apps -- --line ${line.name} ${name}`);
            process.exit(1);
        }
        return {
            name,
            root,
            suiteDir: path.join(REPO_ROOT, 'apps', name, 'playwright'),
            basePort: APPS[name].basePort + line.portShift,
            line: line.name,
        };
    }
    // Relative <APP>_ROOT values (the self-contained checkouts/<app> default)
    // are anchored to the repo root, not the caller's cwd.
    const raw = process.env[`${name.toUpperCase()}_ROOT`];
    const root = raw && path.resolve(REPO_ROOT, raw);
    if (!root || !fs.existsSync(path.join(root, 'config.TEMPLATE.inc.php'))) {
        console.error(
            `${name.toUpperCase()}_ROOT is not set (or is not an app checkout). ` +
                `Set it in ${path.join(REPO_ROOT, '.env')} — see .env.example.`
        );
        process.exit(1);
    }
    return {
        name,
        root,
        suiteDir: path.join(REPO_ROOT, 'apps', name, 'playwright'),
        basePort: APPS[name].basePort,
        line: 'main',
    };
}

/** The apps whose <APP>_ROOT the repo .env names (on a line: whose checkout exists), in registry order. */
function configuredApps() {
    loadEnv(REPO_ROOT, '.env');
    const line = resolveLine();
    if (line) {
        return Object.keys(APPS).filter((name) =>
            fs.existsSync(path.join(REPO_ROOT, 'checkouts', line.name, name, 'config.TEMPLATE.inc.php')));
    }
    return Object.keys(APPS).filter((name) => !!process.env[`${name.toUpperCase()}_ROOT`]);
}

module.exports = {APPS, LINES, REPO_ROOT, resolveApp, resolveLine, configuredApps};
