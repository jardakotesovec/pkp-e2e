// Helpers for walk.js (issue report docs/issues/U56-A12-french-manage-emails-edit-button-english.md).
// Copied from ../french-manage-emails-raw-keys/lib.js so this folder stands alone. Requiring this
// file runs nothing.
const {idle} = require('../../../probe');

const T = 30_000;
const flat = (t, n = 400) => (t == null ? null : String(t).replace(/\s+/g, ' ').trim().slice(0, n));

/**
 * Open Settings > Workflow in `lang`, its "Emails" tab, and the link to "Manage Emails", as a
 * manager does; wait for the list's first row. Returns how the page was reached (the tab's and
 * the link's words).
 */
async function openManageEmails(app, page, lang) {
    await page.goto(app.url(`/index.php/${app.contextPath}/${lang}/management/settings/workflow`));
    await idle(page);
    const tab = page.getByRole('tab', {name: /^(Emails|Courriels)$/}).first();
    let via = 'tab';
    if (await tab.isVisible().catch(() => false)) {
        via = `tab "${flat(await tab.innerText())}"`;
        await tab.click();
        await idle(page);
    } else {
        via = 'tab not found';
    }
    const link = page.locator('a[href*="manageEmails"]:visible').first();
    if (await link.isVisible().catch(() => false)) {
        via += `, link "${flat(await link.innerText())}"`;
        await link.click();
        await page.waitForURL(/manageEmails/, {timeout: T});
    } else {
        via = `${via}; link not found, address typed`;
        await page.goto(app.url(`/index.php/${app.contextPath}/${lang}/management/settings/manageEmails`));
    }
    await idle(page);
    await page.locator('.manageEmails__listPanel .listPanel__item').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return via;
}

/** The list's rows: name, the row button's shown text and its accessible text (screen-reader span included). */
async function listRows(page) {
    const panel = page.locator('.manageEmails__listPanel').first();
    return panel.locator('.listPanel__item').evaluateAll((lis) => lis.map((li) => {
        const t = (sel) => {
            const el = li.querySelector(sel);
            return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
        };
        const btn = li.querySelector('.listPanel__itemActions button');
        return {
            name: t('.listPanel__itemTitle'),
            buttonShown: btn ? btn.innerText.replace(/\s+/g, ' ').trim() : null,
            buttonHidden: btn ? [...btn.querySelectorAll('[aria-hidden="true"]')].map((e) => e.textContent.trim()).join(' ') : null,
            buttonScreenReader: btn ? [...btn.querySelectorAll('.-screenReader')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' ') : null,
        };
    }));
}

/** Count rows by the button's visible word (the aria-hidden span; innerText also carries the clipped screen-reader text). */
function tally(rows) {
    const out = {};
    for (const r of rows) out[r.buttonHidden] = (out[r.buttonHidden] || 0) + 1;
    return out;
}

module.exports = {T, flat, openManageEmails, listRows, tally};
