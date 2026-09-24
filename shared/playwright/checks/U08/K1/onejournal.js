// U08 claim check K1, the one-journal end of Rule 1b: run FIRST on a fresh
// fleet whose only context is publicknowledge. As `admin`, Administration ›
// "Site Settings": which tabs and side tabs are offered (no "Navigation"
// expected), and the site's navigation address typed directly.
// Run: PROBE_FEATURE=U08 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U08/K1/onejournal.js
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle} = require('../../../probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin');
        await page.goto(app.url('/index.php/index/admin/settings'));
        await idle(page);
        await sleep(800);
        const s = await screen(page);
        const tabs = await page.locator('[role="tab"]').evaluateAll((els) => els.map((e) => ({id: e.id, text: e.innerText.trim(), visible: !!e.offsetParent})));
        record('00-onejournal-site-settings', {...s, tabs});
        await shot(page, '00-onejournal-site-settings');
        // the navigation grid's own address as a direct URL (what the tab would load)
        const r = await page.goto(app.url('/index.php/index/admin/settings#setup/navigationMenus'));
        await idle(page); await sleep(800);
        const s2 = await screen(page);
        const tabs2 = await page.locator('[role="tab"]').evaluateAll((els) => els.map((e) => ({id: e.id, text: e.innerText.trim(), visible: !!e.offsetParent, selected: e.getAttribute('aria-selected')})));
        record('01-onejournal-site-settings-hash', {...s2, tabs: tabs2, status: r && r.status()});
        await signOut(page);
    } finally {
        await close();
    }
});
