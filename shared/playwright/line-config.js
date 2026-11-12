/**
 * @file shared/playwright/line-config.js
 *
 * The Playwright config of one app's suite in a stable version's folder
 * (lines/<branch>/<app>.config.js, docs/process/VERSIONS.md). The folder's
 * name selects the version's checkout, ports and database; the suite, its
 * test library and its copy of the shared tests are the folder's own.
 */
const path = require('path');

module.exports = (lineDir, appName) => {
    // Before bin/apps.js resolves anything.
    process.env.PKP_E2E_LINE = path.basename(lineDir);
    const {resolveApp} = require('../../bin/apps.js');
    const {definePkpConfig} = require('./config-factory.js');
    const app = resolveApp(appName);
    return definePkpConfig({
        appName: app.name,
        appRoot: app.root,
        suiteDir: path.join(lineDir, 'apps', app.name, 'playwright'),
        sharedTestDir: path.join(lineDir, 'shared', 'playwright', 'tests'),
        basePort: app.basePort,
    });
};
