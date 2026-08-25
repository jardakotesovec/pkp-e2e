/**
 * @file configs/ops.config.js
 *
 * The ops fleet, run from the pkp-e2e repo against the checkout named by
 * OPS_ROOT in .env. All harness mechanics live in the shared factory.
 */
const {resolveApp} = require('../bin/apps.js');
const {definePkpConfig} = require('../shared/playwright/config-factory.js');

const app = resolveApp('ops');
module.exports = definePkpConfig({
    appName: app.name,
    appRoot: app.root,
    suiteDir: app.suiteDir,
    basePort: app.basePort,
});
