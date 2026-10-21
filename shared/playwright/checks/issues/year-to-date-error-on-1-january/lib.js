// Helpers of walk.js (U65 A15: on 1 January "Year to date" on "Editorial Activity" opens an "Error"
// window instead of figures; docs/issues/U65-A15-year-to-date-error-on-1-january.md).
// readTrends copied from the U65 A1 walk, choosePreset and dismissError adapted from the U64 A14
// walk. Requiring this file runs nothing.
const {idle} = require('../../../probe');

const T = 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/** Statistics › "Editorial Activity" of the context, by its address. Returns the page's status. */
async function openEditorial(page, app) {
    const locale = app.line === 'stable-3_4_0' || app.line === 'stable-3_3_0' ? '' : '/en';
    const r = await page.goto(app.url(`/index.php/${app.contextPath}${locale}/stats/editorial/editorial`));
    await idle(page).catch(() => {});
    await page.locator('.pkpDateRange__current').first().waitFor({timeout: T}).catch(() => {});
    await sleep(800);
    return r ? r.status() : null;
}

/**
 * The "Trends" table as it stands: `{columns, range, rows: {name: [dateRange, total]}}`, each
 * name without its icon label or indent. An error is recorded, never thrown.
 */
async function readTrends(page) {
    const table = page.getByRole('table', {name: 'Trends'}).first();
    try {
        await table.waitFor({state: 'visible', timeout: T});
    } catch (e) {
        return {columns: [], rows: {}, error: flat(e.message, 200)};
    }
    const columns = (await table.getByRole('columnheader').allInnerTexts()).map((t) => flat(t));
    const list = await table.locator('tbody tr').evaluateAll((trs) =>
        trs.map((tr) => {
            const cells = [...tr.querySelectorAll('td, th')];
            const copy = cells[0].cloneNode(true);
            copy.querySelectorAll('.tooltipButton, .-screenReader, .sr-only, [class*="tooltip"]').forEach((e) => e.remove());
            const name = copy.textContent.replace(/ /g, ' ').replace(/Description for .*$/s, '').replace(/\s+/g, ' ').trim();
            return [name, ...cells.slice(1).map((c) => c.textContent.replace(/\s+/g, ' ').trim())];
        })
    );
    const range = flat(await page.locator('.pkpDateRange__current').first().innerText().catch(() => ''));
    return {columns, range, rows: Object.fromEntries(list.map((r) => [r[0], r.slice(1)]))};
}

/**
 * The calendar button ("Change date range"), then a preset of its list. Returns the labels the
 * list offered and the page's own figures request for the range (its dates and its status), or
 * null when none went out.
 */
async function choosePreset(page, label) {
    const list = page.locator('.pkpDateRange__options').first();
    if (!(await list.isVisible().catch(() => false))) await page.locator('.pkpDateRange__button').first().click();
    await list.waitFor({state: 'visible', timeout: T});
    const offered = (await page.locator('.pkpDateRange__option').allInnerTexts()).map((s) => flat(s, 60));
    const answered = page
        .waitForResponse((r) => /\/stats\/editorial\?/.test(r.url()) && r.url().includes('dateStart='), {timeout: 20_000})
        .catch(() => null);
    await page.locator('.pkpDateRange__option').filter({hasText: new RegExp(`^\\s*${label}\\s*$`)}).click();
    const resp = await answered;
    await idle(page).catch(() => {});
    await sleep(1500);
    let request = null;
    if (resp) {
        const u = new URL(resp.url());
        let body = null;
        try {
            body = flat(await resp.text(), 300);
        } catch (e) {
            body = null;
        }
        request = {
            dateStart: u.searchParams.get('dateStart'),
            dateEnd: u.searchParams.get('dateEnd'),
            status: resp.status(),
            body: resp.status() >= 400 ? body : null,
        };
    }
    return {offered, request};
}

/** Every window open over the page: heading, text and buttons. */
async function readWindows(page) {
    return page.evaluate(() => {
        const txt = (e) => (e ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(vis).map((d) => ({
            heading: txt(d.querySelector('h1, h2, h3')),
            text: txt(d).slice(0, 400),
            buttons: [...d.querySelectorAll('button')].filter(vis).map(txt),
        }));
    });
}

/** "OK" on an open window; false when none is open. */
async function dismissError(page) {
    const ok = page.getByRole('dialog').getByRole('button', {name: 'OK', exact: true}).last();
    if (!(await ok.isVisible().catch(() => false))) return false;
    await ok.click();
    await sleep(800);
    return true;
}

module.exports = {T, sleep, flat, openEditorial, readTrends, choosePreset, readWindows, dismissError};
