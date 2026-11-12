/**
 * @file lib/pkp/playwright/support/auth.js
 *
 * A signed-in storage state for a username, minted per call through
 * `POST /api/v1/_test/session`: the app registers the session server-side
 * and answers with its cookie, one ~40 ms request. Until 2026-09-14 the
 * state was cached on disk and every use re-probed it (a 3-request profile
 * round trip), with a real form login for a new user (a page load plus a
 * bcrypt verify at cost 12, ~400 ms on a runner) — some 190 logins and 470
 * probes per OJS run, about 8% of the summed test time. A fresh session per
 * test also cannot be poisoned by another test's signInAs/signOut, which is
 * what the probe guarded against.
 *
 * The form login stays as the fallback (an app without the test API key,
 * or a user the endpoint refuses), so a failure still reports as the form
 * would.
 */
const {request, devices} = require('@playwright/test');
const {LoginPage} = require('../pages/LoginPage.js');
const {getPassword} = require('../data/users.js');
const {disableMotion} = require('./motion.js');

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} username
 * @param {{baseURL: string}} options
 * @returns {Promise<object>} a storage state for browser.newContext()
 */
async function ensureAuthStateFor(browser, username, {baseURL}) {
    return (
        (await mintSession(username, {baseURL})) ??
        (await signInOverHttp(username, getPassword(username), {baseURL})) ??
        (await signInInBrowser(browser, username, getPassword(username), {baseURL}))
    );
}

/**
 * The test API's session endpoint. The browser's user agent is sent so the
 * session matches the contexts that will use it. Null when the endpoint is
 * not there or refuses (unknown or disabled user), leaving the form to try.
 *
 * @returns {Promise<object|null>} storage state
 */
async function mintSession(username, {baseURL}) {
    const http = await request.newContext({
        baseURL,
        userAgent: devices['Desktop Chrome'].userAgent,
        extraHTTPHeaders: {'X-Test-Key': process.env.TEST_API_KEY || ''},
    });
    try {
        const response = await http.post('/index.php/index/api/v1/_test/session', {
            data: {username},
        });
        if (!response.ok()) {
            return null;
        }
        return await http.storageState();
    } catch {
        return null;
    } finally {
        await http.dispose();
    }
}

/**
 * The login form posted over plain HTTP: the login page for its CSRF token,
 * then signIn, and the resulting cookies as a storage state. Returns null
 * when the app did not sign the user in (the redirect stays on /login).
 *
 * @returns {Promise<object|null>} storage state
 */
async function signInOverHttp(username, password, {baseURL}) {
    const http = await request.newContext({
        baseURL,
        userAgent: devices['Desktop Chrome'].userAgent,
    });
    try {
        const loginPage = await http.get('/index.php/index/en/login');
        const token = (await loginPage.text()).match(/name="csrfToken"[^>]*value="([^"]+)"/);
        if (!loginPage.ok() || !token) {
            return null;
        }
        const signIn = await http.post('/index.php/index/en/login/signIn', {
            form: {csrfToken: token[1], source: '', username, password},
            maxRedirects: 0,
        });
        const location = signIn.headers().location || '';
        if (signIn.status() !== 302 || location.includes('/login')) {
            return null;
        }
        return await http.storageState();
    } catch {
        return null;
    } finally {
        await http.dispose();
    }
}

/** The login form driven in a browser page; the last resort. */
async function signInInBrowser(browser, username, password, {baseURL}) {
    const context = await browser.newContext({
        baseURL,
        storageState: {cookies: [], origins: []},
    });
    await disableMotion(context);
    try {
        const page = await context.newPage();
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.signIn(username, password);
        return await context.storageState();
    } finally {
        await context.close();
    }
}

module.exports = {ensureAuthStateFor};
