// Helpers of walk.js beside this file (issue report on spec U11 A10, with U12 A19 and U66 A12).
// Requiring this file runs nothing. Every helper drives the screens a person uses (or types an
// address into the browser) and never throws: a failure comes back in `error`, so a step records
// the state the code under test brings. Self-contained: the panel and context helpers are copies
// of the ones in the U11 A5, U12 A20, U66 A13 and all-dates reports' folders.
const {idle} = require('../../../probe');

const T = 20_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

/** Per-app screen words of Administration's context list. */
const WORDS = {
    ojs: {noun: 'Journal', hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {noun: 'Press', hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {noun: 'Server', hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};

/**
 * Type an address of the programming interface into the browser (absolute, or a path the app
 * serves) and read the answer: status, the parsed JSON when it is JSON, else the first 300
 * characters of the body.
 */
async function openApi(page, app, address) {
    const url = /^https?:/.test(address) ? address : app.url(address);
    const out = {address: rel(url)};
    try {
        const r = await page.goto(url);
        out.status = r ? r.status() : null;
        const text = r ? await r.text().catch(() => '') : '';
        try { out.json = JSON.parse(text); } catch (e) { out.body = flat(text, 300); }
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** The `id`, title or name, and `_href` of each item of a list answer (`{items: [...]}` or an array). */
function hrefs(answer) {
    const j = answer && answer.json;
    const items = Array.isArray(j) ? j : (j && Array.isArray(j.items) ? j.items : null);
    if (!items) return null;
    const txt = (o) => (o && typeof o === 'object' ? (o.en || o.en_US || '') : (o || ''));
    return items.map((i) => ({id: i.id, title: flat(txt(i.title) || txt(i.name), 60), contextId: i.contextId, _href: rel(i._href)}));
}

const hlPanel = (page) => page.locator('.highlightsListPanel').first();

/** The highlights list's row titles and the "No items found." line. */
async function readHighlights(page) {
    const p = hlPanel(page);
    return {
        rows: (await p.locator('.listPanel__itemTitle').allInnerTexts().catch(() => [])).map((x) => flat(x, 120)),
        empty: await p.getByText('No items found.', {exact: true}).isVisible().catch(() => false),
    };
}

/** A journal's Settings › "Website" › "Setup" › a side tab (`Highlights`, `Announcements`). */
async function openWebsiteSetupTab(page, app, name) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/website`));
    await idle(page);
    const setupTab = page.locator('#setup-button').first();
    await setupTab.waitFor({timeout: T});
    if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
    await page.locator('#setup').first().getByRole('tab', {name, exact: true}).click();
}

/** A journal's Settings › "Website" › "Setup" › "Highlights". */
async function openContextHighlights(page, app) {
    const out = {};
    try {
        await openWebsiteSetupTab(page, app, 'Highlights');
        await hlPanel(page).waitFor({timeout: T});
        await idle(page);
        out.list = await readHighlights(page);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** Administration › "Site Settings" › "Site Setup" › "Highlights": the side tabs and the list. */
async function openSiteHighlights(page) {
    const {SiteSettingsPage} = require('../../../pages/SiteSettingsPages.js');
    const site = new SiteSettingsPage(page);
    const out = {};
    try {
        await site.gotoFromAdministration();
        await site.openTop('Site Setup');
        out.sideTabs = (await site.sideTabs('Site Setup').allInnerTexts()).map((x) => flat(x, 40));
        await site.open('Site Setup', 'Highlights');
        await hlPanel(page).waitFor({timeout: T});
        await idle(page);
        out.list = await readHighlights(page);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** Type into a TinyMCE box of the dialog (`iframeSel`), once its body is editable. */
async function setRich(page, d, iframeSel, text) {
    const frame = d.locator(iframeSel).first();
    await frame.waitFor({timeout: T});
    const body = frame.contentFrame().locator('body');
    for (let i = 0; i < 40; i++) {
        if ((await body.getAttribute('contenteditable').catch(() => null)) === 'true') break;
        await pause(250);
    }
    await body.click();
    await page.keyboard.type(text, {delay: 20});
    await pause(300);
}

/**
 * "Add Highlight", fill Title, URL and Button Label, "Save". Returns the save's answer status,
 * whether the panel is still open 3 s later (and its text then), and the list.
 */
async function addHighlight(page, {title, url, label}) {
    const out = {};
    try {
        await hlPanel(page).getByRole('button', {name: 'Add Highlight', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Add Highlight'});
        await d.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
        await idle(page);
        await setRich(page, d, 'iframe[id^="highlight-title-control-en"]', title);
        await d.locator('#highlight-url-control').fill(url);
        await d.locator('#highlight-urlText-control-en').fill(label);
        const resp = page.waitForResponse((r) => /\/api\/v1\/highlights/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        out.status = r ? r.status() : null;
        await d.waitFor({state: 'hidden', timeout: 3000}).catch(() => {});
        await idle(page);
        out.panelOpen = await d.isVisible().catch(() => false);
        if (out.panelOpen) out.panelText = flat(await d.innerText().catch(() => ''), 600);
        out.list = await readHighlights(page);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** "Edit" on the highlights row titled `title`, change "URL" to `url`, "Save". */
async function editHighlightUrl(page, title, url) {
    const out = {};
    try {
        const row = hlPanel(page).getByRole('listitem').filter({hasText: title});
        await row.getByRole('button', {name: 'Edit', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Edit Highlight'});
        await d.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
        await idle(page);
        await pause(500);
        await d.locator('#highlight-url-control').fill(url);
        const resp = page.waitForResponse((r) => /\/api\/v1\/highlights\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        out.status = r ? r.status() : null;
        await d.waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
        out.panelOpen = await d.isVisible().catch(() => false);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** Settings › "Website" › "Setup" › "Announcements": tick "Enable announcements", "Save". */
async function enableAnnouncements(page, app) {
    const out = {};
    try {
        await openWebsiteSetupTab(page, app, 'Announcements');
        const tab = page.locator('#setup').first().locator('[role="tabpanel"]:visible').first();
        const box = tab.getByRole('checkbox', {name: 'Enable announcements', exact: true});
        await box.waitFor({state: 'visible', timeout: T});
        out.tickedBefore = await box.isChecked();
        await box.check();
        await tab.getByRole('button', {name: 'Save', exact: true}).click();
        out.saved = await tab.locator('[role="status"]').filter({hasText: 'Saved'}).first()
            .waitFor({state: 'visible', timeout: T}).then(() => true, () => false);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** The side menu's "Announcements" (its address when no entry is found, and says so). */
async function openAnnouncements(page, app) {
    const out = {};
    try {
        await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
        await idle(page).catch(() => {});
        const nav = page.getByRole('navigation', {name: 'Site Navigation'});
        const entry = nav.locator('[aria-label="Announcements"], a, [role="button"]').filter({hasText: /^\s*Announcements\s*$/}).first();
        out.via = 'side menu';
        if (await entry.isVisible().catch(() => false)) {
            await entry.click();
            await page.waitForURL(/\/management\/settings\/announcements/, {timeout: T, waitUntil: 'commit'});
        } else {
            out.via = 'address (no side menu entry found)';
            await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/announcements`));
        }
        await idle(page).catch(() => {});
        await page.locator('main .listPanel').first().waitFor({state: 'visible', timeout: T});
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** "Add Announcement": type the title, "Save". The save's status and the list's titles after. */
async function addAnnouncement(page, title) {
    const out = {};
    try {
        const list = page.locator('main .listPanel').first();
        await list.getByRole('button', {name: 'Add Announcement', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Add Announcement'});
        const save = d.getByRole('button', {name: 'Save', exact: true});
        await save.waitFor({state: 'visible', timeout: T});
        await d.locator('input[name="title-en"]').fill(title);
        const [r] = await Promise.all([
            page.waitForResponse((x) => /\/api\/v1\/announcements$/.test(new URL(x.url()).pathname) && x.request().method() === 'POST', {timeout: T}).catch(() => null),
            save.click(),
        ]);
        out.status = r ? r.status() : null;
        await d.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page).catch(() => {});
        out.rows = (await list.locator('.listPanel__itemTitle').allInnerTexts().catch(() => [])).map((s) => flat(s, 80));
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/** Settings › "Institutions" by its address, waiting for the list. */
async function openInstitutions(page, app) {
    const out = {};
    try {
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/institutions`));
        await idle(page);
        await page.locator('.institutionsListPanel').first().waitFor({timeout: T});
        await idle(page);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
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
        out.rows = await page.locator('.institutionsListPanel .listPanel__item span[id^="institution-"]').allInnerTexts()
            .then((a) => a.map((x) => x.trim())).catch(() => null);
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

/**
 * Administration › Hosted Journals (Presses, Servers) › "Create Journal" (…), filled and saved:
 * name, initials, contact, country Canada, path, English, enabled. Returns the save's status.
 */
async function createContext(page, app, {name, initials, path: urlPath, email}) {
    const out = {name, path: urlPath};
    try {
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
        out.status = r.status();
        out.landed = rel(page.url());
    } catch (e) {
        out.error = flat(e.message);
    }
    return out;
}

module.exports = {
    T, pause, flat, rel, WORDS, openApi, hrefs, readHighlights, openContextHighlights, openSiteHighlights,
    addHighlight, editHighlightUrl, enableAnnouncements, openAnnouncements, addAnnouncement, openInstitutions,
    addInstitution, createContext,
};
