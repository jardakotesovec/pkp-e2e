#!/usr/bin/env node
/**
 * @file bin/with-app.js
 *
 * Run a harness script against one app:
 *
 *   node bin/with-app.js <ojs|omp|ops> <script> [args…]
 *
 * Loads the repo .env, resolves the app checkout from <APP>_ROOT, exports the
 * PKP_* env the harness scripts read, and executes the script.
 */
const path = require('path');
const fs = require('fs');
const {loadEnv} = require('../shared/playwright/support/env.js');
const {resolveApp} = require('./apps.js');

const [appName, script, ...rest] = process.argv.slice(2);
if (!appName || !script) {
    console.error('usage: node bin/with-app.js <ojs|omp|ops> <script> [args…]');
    process.exit(1);
}

const app = resolveApp(appName);
process.env.PKP_APP_NAME = app.name;
process.env.PKP_APP_ROOT = app.root;
process.env.PKP_SUITE_DIR = app.suiteDir;
loadEnv(app.root); // the app checkout's .env.playwright (DB creds, API key)
// Registry default LAST: the checkout's .env.playwright names its own port
// (environments other than env 0 run on shifted ports — see harness.md).
if (!process.env.PLAYWRIGHT_BASE_PORT) {
    process.env.PLAYWRIGHT_BASE_PORT = String(app.basePort);
}

const scriptPath = path.resolve(__dirname, '..', script);
if (!fs.existsSync(scriptPath)) {
    console.error(`with-app: no such script: ${scriptPath}`);
    process.exit(1);
}
process.argv = [process.argv[0], scriptPath, ...rest];
require(scriptPath);
