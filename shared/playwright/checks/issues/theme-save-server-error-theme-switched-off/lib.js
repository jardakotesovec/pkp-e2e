// Helpers of walk.js (issue report docs/issues/U10-A26-theme-save-server-error-theme-switched-off.md).
// Requiring this file runs nothing. Every helper drives the screens a person uses.
// createContext and WORDS are copied from the site-theme-api-server-error walk (U10 A24), not required from there.

const T = 30_000;
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Per-app screen words of Administration's context list. */
const WORDS = {
    ojs: {noun: 'Journal', hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {noun: 'Press', hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {noun: 'Server', hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};

/**
 * Administration › Hosted Journals (Presses, Servers) › "Create Journal" (…), filled and saved:
 * name, initials, contact, country Canada, path, English. Returns the save's status.
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
    if (await win.languageBox('en').count()) await win.setBox(win.languageBox('en'), true);
    if (await win.primaryChoice('en').count()) await win.setBox(win.primaryChoice('en'), true);
    const r = await win.pressSave();
    await page.waitForURL(/\/admin\/wizard\/\d+/, {timeout: T}).catch(() => {});
    return r.status();
}

/** The theme form ("Appearance" › "Theme"): the form holding the "Theme" list. */
function themeForm(page) {
    return page.locator('form').filter({has: page.locator('select[name="themePluginPath"]')}).first();
}

/** What the "Theme" tab offers: the list's entries and value, the fields' labels, the "Save" button. */
async function readThemeForm(page) {
    const form = themeForm(page);
    await form.locator('select[name="themePluginPath"]').waitFor({state: 'attached', timeout: T});
    return form.evaluate((f) => {
        const sel = f.querySelector('select[name="themePluginPath"]');
        return {
            options: [...sel.options].map((o) => `${o.textContent.trim()}=${o.value}`),
            selectValue: sel.value,
            fieldNames: [...new Set([...f.querySelectorAll('[name]')].map((i) => i.getAttribute('name')))],
            description: (sel.closest('.pkpFormField')?.querySelector('.pkpFormField__description')?.innerText || '').replace(/\s+/g, ' ').trim(),
            hasSave: [...f.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Save'),
        };
    });
}

/**
 * Press the theme form's "Save": the request it sends (method, override header, body), its answer (status,
 * body), and what the page then shows (the "Saved" status, a field error, the form's error summary, a notice
 * with "unexpected error", any browser dialog).
 */
async function saveTheme(page) {
    const form = themeForm(page);
    const dialogs = [];
    const onDialog = async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.dismiss().catch(() => {}); };
    page.on('dialog', onDialog);
    const o = {};
    try {
        const answered = page.waitForResponse((r) => /\/api\/v1\/(contexts\/\d+|site)\/theme(\?|$)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await answered;
        const req = r.request();
        o.request = {method: req.method(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), override: req.headers()['x-http-method-override'] || null, body: flat(req.postData(), 400)};
        o.status = r.status();
        o.body = flat(await r.text().catch(() => ''), 400);
        await sleep(1500);
        o.saved = await form.locator('.pkpFormPage__status', {hasText: 'Saved'}).count();
        o.fieldErrors = (await form.locator('.pkpFieldError__message').allInnerTexts().catch(() => [])).map((t) => flat(t, 200));
        o.errorSummary = flat(await form.locator('.pkpFormErrors').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 300);
        o.notices = (await page.getByText(/unexpected error|form was not saved/i).allInnerTexts().catch(() => [])).map((t) => flat(t, 200));
        o.dialogs = dialogs;
    } catch (e) {
        o.error = flat(e.message, 300);
    } finally {
        page.off('dialog', onDialog);
    }
    return o;
}

/** Settings › Website (the context), landing on "Appearance" › "Theme". */
async function openContextTheme(page, app) {
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/website`));
    await themeForm(page).waitFor({state: 'visible', timeout: T});
    await sleep(500);
}

/** Administration › "Site Settings" › "Appearance" › "Theme". */
async function openSiteTheme(page) {
    const {SiteSettingsPage} = require('../../../pages/SiteSettingsPages.js');
    const site = new SiteSettingsPage(page);
    await page.goto('about:blank');
    await site.gotoFromAdministration();
    await site.open('Appearance', 'Theme');
    await themeForm(page).waitFor({state: 'visible', timeout: T});
    await sleep(500);
}

module.exports = {T, WORDS, flat, sleep, createContext, themeForm, readThemeForm, saveTheme, openContextTheme, openSiteTheme};
