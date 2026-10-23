// Helpers of walk.js beside this file (issue report on spec U66 A13). Requiring this file runs
// nothing. No helper throws: a failure comes back in `error`, so a step records the state the code
// under test brings (with a fix in or out).
const {idle} = require('../../../probe');

const T = 20_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

/**
 * Type an address of the programming interface into the browser and read the answer: status,
 * the parsed JSON when it is JSON, else the first 300 characters of the body.
 */
async function openApi(page, app, path) {
    const out = {address: path};
    try {
        const r = await page.goto(app.url(path));
        out.status = r ? r.status() : null;
        const text = r ? await r.text().catch(() => '') : '';
        try { out.json = JSON.parse(text); } catch (e) { out.body = flat(text, 300); }
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** Open the Institutions page by its address and wait for the list panel. */
async function openInstitutions(page, app) {
    const out = {};
    try {
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/institutions`));
        await idle(page);
        await page.locator('.institutionsListPanel').first().waitFor({timeout: T});
        await idle(page);
        out.rows = await institutionRows(page);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** The names the Institutions list shows. */
async function institutionRows(page) {
    return page.locator('.institutionsListPanel .listPanel__item span[id^="institution-"]').allInnerTexts()
        .then((a) => a.map((x) => x.trim())).catch(() => null);
}

/** "Add Institution", type `name` in "Name", "Save"; the answer's status and the rows after. */
async function addInstitution(page, name) {
    const out = {};
    try {
        await page.locator('.institutionsListPanel').getByRole('button', {name: 'Add Institution', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Add Institution'});
        await d.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
        await d.locator('input[name="name-en"]').fill(name);
        const resp = page.waitForResponse((r) => /\/api\/v1\/institutions/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        out.status = r ? r.status() : null;
        await d.waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
        await idle(page);
        out.panelOpen = await d.isVisible().catch(() => false);
        out.rows = await institutionRows(page);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/**
 * One request sent from the page's console in the signed-in session, as the browser's own
 * requests are sent: the context's API base and the session's CSRF token, read from the page.
 * The page must be a back-office page of the context.
 */
async function consoleRequest(page, method, route) {
    try {
        return await page.evaluate(async ({method, route}) => {
            const url = `${pkp.context.apiBaseUrl.replace(/\/$/, '')}${route}`;
            const r = await fetch(url, {method, headers: method === 'GET' ? {} : {'X-Csrf-Token': pkp.currentUser.csrfToken}});
            const text = await r.text();
            let json = null;
            try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
            return {method, address: url.replace(/^https?:\/\/[^/]+/, ''), status: r.status, json, body: json ? undefined : text.slice(0, 300)};
        }, {method, route});
    } catch (e) {
        return {method, route, error: flat(e.message)};
    }
}

module.exports = {T, pause, flat, rel, openApi, openInstitutions, institutionRows, addInstitution, consoleRequest};
