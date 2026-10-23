// Helpers of walk.js (issue report docs/issues/U10-A24-site-theme-api-server-error.md).
// Requiring this file runs nothing. Every helper drives the screens a person uses.

const T = 30_000;

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

module.exports = {T, WORDS, createContext};
