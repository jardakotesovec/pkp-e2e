/**
 * @file lines/stable-3_5_0/ojs.config.js
 *
 * The OJS suite of the stable-3_5_0 line (pilot): the tests and page objects
 * under lines/stable-3_5_0/, run against checkouts/stable-3_5_0/ojs.
 *
 *   npx playwright test -c lines/stable-3_5_0/ojs.config.js --project=ojs
 *
 * The harness (config factory, support, seeding, fixtures files) is the
 * common one; only what follows the app's screens lives in this folder.
 */
process.env.PKP_E2E_LINE = 'stable-3_5_0';
const path = require('path');
const {resolveApp} = require('../../bin/apps.js');
const {definePkpConfig} = require('../../shared/playwright/config-factory.js');

const app = resolveApp('ojs');
module.exports = definePkpConfig({
    appName: app.name,
    appRoot: app.root,
    suiteDir: path.join(__dirname, 'apps', app.name, 'playwright'),
    basePort: app.basePort,
});
