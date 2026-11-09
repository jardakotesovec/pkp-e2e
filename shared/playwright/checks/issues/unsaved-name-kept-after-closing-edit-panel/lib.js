// Helpers of highlights.js beside this file (issue report
// docs/issues/U66-A2-unsaved-name-kept-after-closing-edit-panel.md, its Highlights steps).
// Requiring this file runs nothing. Every helper drives the screens a person uses; the reads never
// throw, so a step records the state the code under test brings. createContext() is copied from
// the U64 A1 report's folder (all-dates-error-nothing-published/lib.js) so this folder stands alone.
const {idle} = require('../../../probe');

const T = 20_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Per-app screen words of Administration's context list. */
const WORDS = {
    ojs: {noun: 'Journal', hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {noun: 'Press', hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {noun: 'Server', hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};

/**
 * Administration › Hosted Journals (Presses, Servers) › "Create Journal" (…), filled and saved:
 * name, initials, contact, country Canada, path, English, enabled. Returns the save's status.
 */
async function createContext(page, app, {name, initials, path: urlPath, email}) {
    const {HostedJournalsPage} = require('../../../pages/HostedJournalsPages.js');
    const hosted = new HostedJournalsPage(page, WORDS[app.name]);
    await page.goto(app.url('/index.php/index/en/admin/contexts'));
    await hosted.expectOpen();
    const win = await hosted.openCreate();
    await win.type(win.title('en'), name);
    await win.type(win.initials('en'), initials);
    await win.type(win.contactName, name);
    await win.type(win.contactEmail, email);
    await win.country.selectOption({label: 'Canada'});
    await win.type(win.path, urlPath);
    if (await win.languageBox('en').count()) {
        await win.setBox(win.languageBox('en'), true);
        await win.setBox(win.primaryChoice('en'), true);
    }
    await win.setBox(win.enableBox, true);
    const r = await win.pressSave();
    await page.waitForURL(/\/admin\/wizard\/\d+/, {timeout: T}).catch(() => {});
    return r.status();
}

const panel = (page) => page.locator('.highlightsListPanel').first();
const HTITLE = (loc = 'en') => `iframe[id^="highlight-title-control-${loc}"]`;

/** The list's row titles. */
async function rows(page) {
    return (await panel(page).locator('.listPanel__itemTitle').allInnerTexts().catch(() => [])).map((x) => flat(x, 120));
}

/** A journal's Settings › "Website" › "Setup" › "Highlights" (path `ctx`). */
async function openContextHighlights(page, app, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/en/management/settings/website`));
    await idle(page);
    const setupTab = page.locator('#setup-button').first();
    await setupTab.waitFor({timeout: T});
    if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
    await page.locator('#setup').first().getByRole('tab', {name: 'Highlights', exact: true}).click();
    await panel(page).waitFor({timeout: T});
    await idle(page);
    return rows(page);
}

/** Administration › "Site Settings" › "Site Setup" › "Highlights": the side tabs and the list. */
async function openSiteHighlights(page) {
    const {SiteSettingsPage} = require('../../../pages/SiteSettingsPages.js');
    const site = new SiteSettingsPage(page);
    await site.gotoFromAdministration();
    await site.openTop('Site Setup');
    const sideTabs = (await site.sideTabs('Site Setup').allInnerTexts()).map((x) => flat(x, 40));
    await site.open('Site Setup', 'Highlights');
    await panel(page).waitFor({timeout: T});
    await idle(page);
    return {sideTabs, rows: await rows(page)};
}

/** The TinyMCE body of a dialog's box, once editable. */
async function richBody(page, d, iframeSel) {
    const frame = d.locator(iframeSel).first();
    await frame.waitFor({timeout: T});
    const body = frame.contentFrame().locator('body');
    for (let i = 0; i < 40; i++) {
        if ((await body.getAttribute('contenteditable').catch(() => null)) === 'true') break;
        await pause(250);
    }
    return body;
}

/** The text of a dialog's TinyMCE box (waits up to 5 s for it to fill). */
async function readRich(page, d, iframeSel) {
    const body = await richBody(page, d, iframeSel);
    let v = '';
    for (let i = 0; i < 20; i++) { v = flat(await body.innerText()); if (v) break; await pause(250); }
    return v;
}

/** Replace the text of a dialog's TinyMCE box from the keyboard. */
async function setRich(page, d, iframeSel, text) {
    const body = await richBody(page, d, iframeSel);
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(text, {delay: 30});
    await pause(400);
}

/** Add text at the end of a dialog's TinyMCE box, from the keyboard. */
async function appendRich(page, d, iframeSel, text) {
    const body = await richBody(page, d, iframeSel);
    for (let i = 0; i < 20; i++) { if ((await body.innerText()).trim()) break; await pause(250); }
    await body.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(text, {delay: 40});
    await pause(400);
}

/**
 * Show the French boxes of a dialog's form: its "French" language button pressed when the French
 * "Title" box is there but hidden. Returns whether the French "Title" box is visible.
 */
async function showFrench(page, d) {
    const box = d.locator(L_FR).first();
    if (!(await box.count())) return false;
    if (!(await box.isVisible().catch(() => false))) {
        await d.getByRole('button', {name: 'French', exact: true}).first().click().catch(() => {});
        await box.waitFor({state: 'visible', timeout: 8000}).catch(() => {});
        await pause(400);
    }
    return box.isVisible().catch(() => false);
}
const L_FR = 'iframe[id^="highlight-title-control-fr_CA"]';

/** "Edit" on the row titled `title` (exact); the "Edit Highlight" dialog, or null when no such row. */
async function openEdit(page, title) {
    const row = panel(page).locator('.listPanel__item').filter({has: page.locator('.listPanel__itemTitle', {hasText: new RegExp(`^\\s*${esc(title)}\\s*$`)})});
    if (!(await row.count())) return null;
    await row.first().getByRole('button', {name: 'Edit', exact: true}).click();
    const d = page.getByRole('dialog', {name: 'Edit Highlight'});
    await d.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
    await idle(page); await pause(500);
    return d;
}

/**
 * Close a panel without "Save": `control` (its close button), `escape` (Escape pressed in "URL",
 * clicked first; in a TinyMCE box Escape does nothing) or `outside` (a click on the page left of
 * the panel). Returns whether it closed and any browser dialog's text.
 */
async function closePanel(page, d, how) {
    const dialogs = [];
    const onDlg = (x) => { dialogs.push(x.message()); x.dismiss().catch(() => {}); };
    page.on('dialog', onDlg);
    try {
        if (how === 'control') await d.getByRole('button', {name: 'Close', exact: true}).first().click();
        else if (how === 'escape') { await d.locator('#highlight-url-control').click(); await page.keyboard.press('Escape'); }
        else if (how === 'outside') await page.mouse.click(40, 500);
        await d.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
        await pause(800); // the modal store's slot (patterns pitfall 4)
        return {closed: !(await d.isVisible().catch(() => false)), browserDialogs: dialogs};
    } finally {
        page.off('dialog', onDlg);
    }
}

/** "Save" in a highlight panel: the save's method, status and whether the panel stayed open. */
async function pressSave(page, d) {
    const resp = page.waitForResponse((r) => /\/api\/v1\/highlights/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
    await d.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    await d.waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
    await idle(page); await pause(900);
    let body = null;
    if (r) body = await r.json().then((j) => ({title: j.title, url: j.url})).catch(() => null);
    return {
        method: r ? (r.request().headers()['x-http-method-override'] || r.request().method()) : null,
        status: r ? r.status() : null,
        stored: body,
        panelOpen: await d.isVisible().catch(() => false),
    };
}

/** "Add Highlight", fill Title, URL and Button Label, "Save". */
async function addHighlight(page, {title, url, label}) {
    await panel(page).getByRole('button', {name: 'Add Highlight', exact: true}).click();
    const d = page.getByRole('dialog', {name: 'Add Highlight'});
    await d.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
    await idle(page);
    await setRich(page, d, HTITLE('en'), title);
    await d.locator('#highlight-url-control').fill(url);
    await d.locator('#highlight-urlText-control-en').fill(label);
    const out = await pressSave(page, d);
    if (out.panelOpen) {
        out.panelText = flat(await d.innerText().catch(() => ''), 400);
        await closePanel(page, d, 'control');
    }
    return out;
}

module.exports = {T, pause, flat, rel, WORDS, createContext, panel, HTITLE, rows, openContextHighlights, openSiteHighlights,
    readRich, setRich, appendRich, showFrench, openEdit, closePanel, pressSave, addHighlight};
