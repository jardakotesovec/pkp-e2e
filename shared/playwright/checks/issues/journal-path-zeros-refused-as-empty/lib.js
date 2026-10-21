// Helpers for walk.js (U59 A11). Requiring this file runs nothing.
// saveAndRead, WORDS and fillCreate are copied from the U59 A1 and OPS1 report folders.
const {sql} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Per-app screen words. */
const WORDS = {
    ojs: {noun: 'Journal', hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {noun: 'Press', hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {noun: 'Server', hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};

/**
 * Press a form's "Save" and return what followed: the contexts saves the
 * browser sent and their statuses, the error line and every field's reason.
 * Never throws: a save the browser itself refuses sends nothing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} form
 */
async function saveAndRead(page, form) {
    const sent = [];
    const onResponse = (r) => {
        if (r.request().method() === 'POST' && /\/api\/v1\/contexts(\/\d+)?(\?|$)/.test(r.url())) {
            const q = r.request();
            sent.push({
                status: r.status(),
                url: r.url().replace(/^https?:\/\/[^/]+/, ''),
                override: q.headers()['x-http-method-override'] || null,
            });
        }
    };
    page.on('response', onResponse);
    try {
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        // A refusal draws its reasons; an accepted save shows "Saved" or leaves for the wizard.
        await Promise.race([
            form.locator('.pkpFieldError').first().waitFor({state: 'visible', timeout: T}),
            form.locator('[role="status"]', {hasText: 'Saved'}).waitFor({state: 'visible', timeout: T}),
            page.waitForURL(/\/admin\/wizard\/\d+/, {timeout: T, waitUntil: 'commit'}),
        ]).catch(() => {});
        await page.waitForTimeout(500);
    } finally {
        page.off('response', onResponse);
    }
    const alive = (await form.count()) > 0;
    return {
        sent,
        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
        errorLine: alive ? flat(await form.locator('.pkpFormErrors').innerText().catch(() => null)) : null,
        fieldErrors: alive
            ? await form.locator('.pkpFieldError').evaluateAll((els) =>
                  Object.fromEntries(els.map((e) => [e.id, (e.textContent || '').replace(/\s+/g, ' ').trim()]))
              )
            : null,
        saved: alive ? await form.locator('[role="status"]', {hasText: 'Saved'}).isVisible().catch(() => false) : null,
    };
}

/** The paths of the fleet's contexts, in id order (read from its database). */
function paths(app) {
    const {table, id} = app.contextTables;
    const out = sql(app, `SELECT path FROM ${table} ORDER BY ${id}`);
    return out ? out.split('\n') : [];
}

/**
 * Fill "Create Journal" as the Steps say (everything valid, "Iceland" chosen)
 * with `path` in "Path".
 *
 * @param {object} win a ContextFormWindow (pages/HostedJournalsPages.js)
 * @param {string} noun "Journal" | "Press" | "Server"
 * @param {string} path
 */
async function fillCreate(win, noun, path) {
    await win.type(win.title('en'), `h21w ${noun}`);
    await win.type(win.initials('en'), 'H21W');
    await win.type(win.contactName, 'h21w Contact');
    await win.type(win.contactEmail, 'h21w@mailinator.com');
    await win.country.selectOption({label: 'Iceland'});
    await win.type(win.path, path);
    if (await win.languageBox('en').count()) {
        await win.setBox(win.languageBox('en'), true);
        await win.setBox(win.primaryChoice('en'), true);
    }
}

/** A save's facts: what was sent, where the page went, the error line, the reason under "Path". */
function pathFacts(res) {
    return {
        sent: res.sent,
        url: res.url,
        errorLine: res.errorLine,
        underPath: res.fieldErrors ? res.fieldErrors['context-urlPath-error'] ?? null : null,
        fieldErrors: res.fieldErrors,
        saved: res.saved,
    };
}

/**
 * Open a context's home page by its path, as a reader types the address,
 * and return the answer's status, the page's title and its heading.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path
 */
async function openHome(page, path) {
    const r = await page.goto(`/index.php/${path}`, {waitUntil: 'domcontentloaded'}).catch((e) => ({error: String(e)}));
    if (r && r.error) return {path, error: r.error};
    return {
        path,
        status: r ? r.status() : null,
        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
        title: flat(await page.title().catch(() => null)),
        heading: flat(await page.locator('h1, .pkp_site_name').first().innerText().catch(() => null)),
    };
}

module.exports = {T, flat, WORDS, saveAndRead, paths, fillCreate, pathFacts, openHome};
