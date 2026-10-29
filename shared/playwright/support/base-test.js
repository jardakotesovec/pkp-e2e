/**
 * @file lib/pkp/playwright/support/base-test.js
 *
 * The extended `test` all suites build on — start here.
 *
 * Fixtures:
 * - user (option): default logged-in user for the file/describe —
 *   `test.use({user: 'editor.diana'})` wires storageState so `page` starts
 *   authenticated. Omit for anonymous flows.
 * - asUser(username): a second, already-authenticated BrowserContext for
 *   multi-actor tests; auto-closes at teardown.
 * - pkpApi: test-API client (bootstrap, createContext, createSubmission).
 * - pkpMail: Mailpit wrapper (recipient-scoped assertions only).
 * - apiAs(username, {context}): the app's REST API as that user, or
 *   anonymously with null (support/api-client.js; docs/process/api.md).
 * - scratch(spec): a scratch context with named throwaway users and their
 *   API clients, for API checks (support/api-scratch.js).
 * - apiTrafficWatch (auto): with PKP_API_TRAFFIC=1, every API response the
 *   test's contexts receive is logged for the traffic map
 *   (support/api-traffic.js).
 * - appContext: the app's capability map + seeded-actor roster
 *   (playwright/support/app.context.js). Shared code gates on capabilities
 *   (appContext.capabilities.hasReviewStage), never app names, and resolves
 *   personas through appContext.seed.actors (archetype → username-or-null).
 * - baseURL: per-worker — basePort + parallelIndex, one PHP server each.
 * - variants: base URLs of the fleet's fixed alternate servers — same DB,
 *   files dir and Mailpit, a different config file. `variants.validation`
 *   has email validation and the ALTCHA spam check on (harness.md "The
 *   validation-variant server"); `variants.reauth` has the Site
 *   Administrator's Confirm Access gate on with a one-minute window
 *   (harness.md "The reauth-variant server"). Navigate to them explicitly
 *   and sign in through their own Login page; nothing else (storageState,
 *   pkpApi) is redirected there.
 * - serverCrashWatch (auto): a failed test whose worker `php -S` died while
 *   it ran gets a `server-crash` annotation, the log lines around the death
 *   attached and one stderr line (support/server-crash.js).
 * - browser (worker): Playwright's, with `newContext()` wrapped so that every
 *   context a test or page object opens itself (`browser.newContext()`: a
 *   fresh sign-in, an anonymous reader) gets the same treatment as the
 *   fixtures' contexts: motion disabled (motion.js) and the flake-hunting
 *   levers (throttle.js). Before this, such a context ran the app's real
 *   animations, so a press on a side window that had just opened could land
 *   while the window was still sliding in: the button-down on "Close", the
 *   button-up a frame later on what slid under the pointer, no click, the
 *   window left open (OMP U03 S12 on CI, 2026-10-16 and 2026-10-20;
 *   `.reports/flake-2026-10-22/omp-u03s12-contributor-close/diagnosis.md`).
 */
const path = require('path');
const base = require('@playwright/test');
const {VALIDATION_PORT_OFFSET, REAUTH_PORT_OFFSET} = require('../config-factory.js');
const {ensureAuthStateFor} = require('./auth.js');
const {disableMotion} = require('./motion.js');
const {throttleCpu} = require('./throttle.js');
const {PkpApi} = require('./api.js');
const {PkpMail} = require('./mail.js');
const {ApiClient} = require('./api-client.js');
const apiTraffic = require('./api-traffic.js');
const {createScratch} = require('./api-scratch.js');
const {workerLogFile, logOffset, reportServerDeaths, failedOnDroppedConnection, waitForDeathLine} = require('./server-crash.js');

const appRoot = process.env.PKP_APP_ROOT;
if (!appRoot) {
    throw new Error(
        'PKP_APP_ROOT is not set — run tests through the app playwright.config.js (config-factory sets it).'
    );
}
const suiteDir =
    process.env.PKP_SUITE_DIR || path.join(appRoot, 'playwright');
// eslint-disable-next-line import/no-dynamic-require
const appContext = require(path.join(suiteDir, 'support', 'app.context.js'));

/**
 * Disable motion and apply the levers once per context, whoever opened it.
 *
 * @param {import('@playwright/test').BrowserContext} context
 */
const armedContexts = new WeakSet();
async function armContext(context) {
    if (armedContexts.has(context)) {
        return;
    }
    armedContexts.add(context);
    apiTraffic.watchContext(context);
    await disableMotion(context);
    await throttleCpu(context);
}

const test = base.test.extend({
    user: [null, {option: true}],

    // Every context opened through the worker's browser is armed, the
    // fixtures' and a test's own `browser.newContext()` alike (see the
    // file header).
    browser: [
        async ({browser}, use) => {
            if (!browser.__pkpArmedNewContext) {
                const newContext = browser.newContext.bind(browser);
                browser.newContext = async (...args) => {
                    const context = await newContext(...args);
                    await armContext(context);
                    return context;
                };
                browser.__pkpArmedNewContext = true;
            }
            await use(browser);
        },
        {scope: 'worker'},
    ],

    appContext: async ({}, use) => {
        await use(appContext);
    },

    baseURL: async ({}, use, testInfo) => {
        const basePort = parseInt(process.env.PLAYWRIGHT_BASE_PORT || '8000', 10);
        await use(`http://127.0.0.1:${basePort + testInfo.parallelIndex}`);
    },

    serverCrashWatch: [
        async ({}, use, testInfo) => {
            const port = parseInt(process.env.PLAYWRIGHT_BASE_PORT || '8000', 10) + testInfo.parallelIndex;
            const file = workerLogFile(suiteDir, port);
            const offset = logOffset(file);
            const startedAt = Date.now();
            await use();
            if (testInfo.status !== testInfo.expectedStatus) {
                // A drop is seen before the restart loop writes the death
                // line (server-crash.js); give the line its moment.
                if (failedOnDroppedConnection(testInfo)) await waitForDeathLine(file, offset);
                await reportServerDeaths(testInfo, {file, offset, port, startedAt});
            }
        },
        {auto: true},
    ],

    // A scratch context for an API check (support/api-scratch.js):
    // `await scratch({users: {mg: 'manager'}, ...contextKeys})`, a fresh
    // unique tag per call.
    scratch: async ({pkpApi, apiAs}, use, testInfo) => {
        let n = 0;
        await use((spec) => createScratch(pkpApi, apiAs, `ap${testInfo.workerIndex}${Date.now().toString(36)}${n++}`, spec));
    },

    // The traffic recorder (support/api-traffic.js; off unless
    // PKP_API_TRAFFIC=1): attributes this test's API calls to its file.
    apiTrafficWatch: [
        async ({}, use, testInfo) => {
            apiTraffic.setCurrentTest(path.relative(suiteDir, testInfo.file));
            await use();
            apiTraffic.flush(suiteDir);
        },
        {auto: true},
    ],

    variants: async ({}, use) => {
        const basePort = parseInt(process.env.PLAYWRIGHT_BASE_PORT || '8000', 10);
        await use({
            validation: `http://127.0.0.1:${basePort + VALIDATION_PORT_OFFSET}`,
            reauth: `http://127.0.0.1:${basePort + REAUTH_PORT_OFFSET}`,
        });
    },

    // Kill animations in the default context (and thus `page`) — see motion.js.
    context: async ({context, user}, use) => {
        context.__pkpUser = user;
        await armContext(context);
        await use(context);
    },

    storageState: async ({browser, baseURL, user}, use) => {
        if (!user) {
            await use(undefined);
            return;
        }
        await use(await ensureAuthStateFor(browser, user, {baseURL}));
    },

    asUser: async ({browser, baseURL}, use) => {
        const openedContexts = [];
        await use(async (username) => {
            const storageState = await ensureAuthStateFor(browser, username, {baseURL});
            const context = await browser.newContext({baseURL, storageState, reducedMotion: 'reduce'});
            context.__pkpUser = username;
            await armContext(context);
            openedContexts.push(context);
            return context;
        });
        await Promise.all(openedContexts.map((context) => context.close().catch(() => {})));
    },

    pkpApi: async ({baseURL}, use) => {
        const api = await PkpApi.create({baseURL});
        await use(api);
        await api.dispose();
    },

    pkpMail: async ({}, use) => {
        await use(new PkpMail());
    },

    // The REST API as a user (support/api-client.js): `await apiAs(username,
    // {context})`, `apiAs(null)` for nobody signed in. Clients close at
    // teardown.
    apiAs: async ({baseURL}, use) => {
        const clients = [];
        await use(async (username, {context = appContext.contextPath} = {}) => {
            const client = await ApiClient.create({baseURL, contextPath: context, username});
            clients.push(client);
            return client;
        });
        await Promise.all(clients.map((client) => client.dispose().catch(() => {})));
    },
});

module.exports = {test, expect: base.expect};
