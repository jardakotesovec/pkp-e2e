// Helpers for walk.js (U16 A26: a category with no name in the page's language listed first on
// MySQL and MariaDB). Requiring this file runs nothing.
const {idle} = require('../../../probe');

const T = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Steps' categories: English names, French where the Steps give one. */
const CATEGORIES = [
    {path: 'arts', title: {en: 'Arts', fr_CA: 'Beaux-arts'}},
    {path: 'zoology', title: {en: 'Zoology', fr_CA: 'Animaux'}},
    {
        path: 'science',
        title: {en: 'Science', fr_CA: 'Sciences'},
        children: [
            {path: 'physics', title: {en: 'Physics', fr_CA: 'Physique'}},
            {path: 'botany', title: {en: 'Botany', fr_CA: 'Botanique'}},
            {path: 'topology', title: {en: 'Topology'}},
        ],
    },
    {path: 'mathematics', title: {en: 'Mathematics'}},
];

/**
 * The preconditions: a context in English and French (UI and forms), its manager, and the
 * Steps' categories, made through the campaign's seeding API the way Settings › "Categories" ›
 * "Add Category" › "Save" makes them (no dataset exists for MySQL or MariaDB).
 */
async function seedPreconditions(app, t) {
    const mg = `${t}mg`;
    await app.api.createContext({
        tag: t,
        context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
        users: [{username: mg, givenName: 'Mona', familyName: 'Manager', email: `${mg}@mail.test`, roles: ['manager']}],
        categories: CATEGORIES,
    });
    return mg;
}

/**
 * Steps 1 and 2: "Browse Block" ticked in Website › "Plugins" (left as it is when a new context
 * already has it on, as a new press does), then ticked under Appearance › "Setup" › "Sidebar" and
 * saved. Returns what each did.
 */
async function placeBrowseBlock(page, app, t) {
    const {PluginsTab} = require('../../../pages/CustomContentPages.js');
    const {WebsiteSettings} = require('../../../pages/AppearancePages.js');
    const out = {};
    const plugins = new PluginsTab(page, t);
    await plugins.goto();
    const box = plugins.enabledBox('browseblockplugin');
    out.pluginWasOn = await box.isChecked();
    out.pluginEnable = out.pluginWasOn ? 'already on' : await plugins.enable('browseblockplugin');
    const thumbnailField = {ojs: 'journalThumbnail', omp: 'pressThumbnail', ops: 'serverThumbnail'}[app.name];
    const settings = new WebsiteSettings(page, t, {thumbnailField});
    await settings.goto();
    const setup = await settings.open('appearance-setup');
    const sidebarBox = setup.sidebar.box('Browse Block');
    out.sidebarWasOn = await sidebarBox.isChecked();
    if (!out.sidebarWasOn) await sidebarBox.check();
    await setup.save();
    return out;
}

/**
 * Step 3: Settings › Journal (Press, Server) › "Categories" in a language, its rows' names as
 * drawn (top level: the tab opens closed, Rule 3).
 */
async function readSettingsTab(page, t, locale) {
    const lang = locale ? `/${locale}` : '';
    await page.goto(`/index.php/${t}${lang}/management/settings/context`);
    await idle(page);
    await page.locator('#categories-button').click();
    const table = page.getByRole('table', {name: /^Cat[ée]gories$/});
    await table.locator('tbody tr').first().waitFor({timeout: T});
    await idle(page);
    const names = (await table.locator('tbody tr').filter({visible: true}).locator(':scope > :first-child').allInnerTexts())
        .map((s) => s.replace(/\s+/g, ' ').trim());
    return {tableName: await table.getAttribute('aria-label').catch(() => null), names};
}

/**
 * Open a public page; a page that comes back empty right after a settings save (U16 OMP5, the
 * server's code cache) is opened once more, and the retry is returned so Evidence can say so.
 */
async function openPublic(page, url) {
    let retried = null;
    try {
        await page.goto(url);
    } catch (e) {
        if (!/ERR_EMPTY_RESPONSE|ERR_CONNECTION/.test(String(e.message))) throw e;
        retried = String(e.message).slice(0, 120);
        await sleep(1500);
        await page.goto(url);
    }
    await page.waitForLoadState('load');
    await idle(page).catch(() => {});
    return retried;
}

/**
 * The "Browse" block's categories as drawn. OJS and OPS nest sub-categories under their parent
 * (`[{name, children}]`); a press lists every category in one run under "Categories" (U16 OMP2),
 * returned as a flat list of `{name, children: []}`.
 */
async function readBrowseBlock(page, appName) {
    const block = page.locator('.pkp_structure_sidebar .block_browse');
    if (!(await block.count())) return {present: false, tree: []};
    const tree = await block.first().evaluate((b, omp) => {
        const name = (a) => (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (omp) {
            return [...b.querySelectorAll('li[class*="category_"] > a')].map((a) => ({name: name(a), children: []}));
        }
        const walk = (ul) =>
            [...ul.children]
                .filter((li) => li.tagName === 'LI')
                .map((li) => {
                    const a = li.querySelector(':scope > a');
                    const sub = li.querySelector(':scope > ul');
                    return {name: a ? name(a) : '', children: sub ? walk(sub) : []};
                });
        const list = b.querySelector('.categories_list') || b.querySelector('nav ul');
        return list ? walk(list) : [];
    }, appName === 'omp');
    return {present: true, tree};
}

/** A category page's "Subcategories" links, in order. */
async function readSubcategories(page) {
    const nav = page.locator('nav.subcategories, .subcategories').first();
    if (!(await nav.count())) return [];
    return (await nav.getByRole('link').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
}

module.exports = {CATEGORIES, seedPreconditions, placeBrowseBlock, readSettingsTab, openPublic, readBrowseBlock, readSubcategories};
