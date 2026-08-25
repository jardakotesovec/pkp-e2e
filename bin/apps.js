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

/** @returns {{name: string, root: string, suiteDir: string, basePort: number}} */
function resolveApp(name) {
    if (!APPS[name]) {
        console.error(`Unknown app "${name}" — one of: ${Object.keys(APPS).join(', ')}`);
        process.exit(1);
    }
    loadEnv(REPO_ROOT, '.env');
    const root = process.env[`${name.toUpperCase()}_ROOT`];
    if (!root || !fs.existsSync(path.join(root, 'config.TEMPLATE.inc.php'))) {
        console.error(
            `${name.toUpperCase()}_ROOT is not set (or is not an app checkout). ` +
                `Set it in ${path.join(REPO_ROOT, '.env')} — see .env.example.`
        );
        process.exit(1);
    }
    return {
        name,
        root: path.resolve(root),
        suiteDir: path.join(REPO_ROOT, 'apps', name, 'playwright'),
        basePort: APPS[name].basePort,
    };
}

module.exports = {APPS, REPO_ROOT, resolveApp};
