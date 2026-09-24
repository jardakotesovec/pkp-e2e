// U08 claim check K1, companion (read only): Rule 2's "installed title in the
// visitor's language" at the other end of the language axis — publicknowledge,
// where French is a UI language but not a form language: the public header in
// fr_CA, signed out, and the Navigation tables in fr_CA as manager.maya.
// Run: PROBE_FEATURE=U08 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U08/K1/k1-fr.js
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle} = require('../../../probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
forEachApp(async (app) => {
    const {page, close} = await launch(app);
    try {
        const readHeader = () => page.evaluate(() => [...document.querySelectorAll('#navigationPrimary a, #navigationUser a')].map((a) => a.innerText.trim().split('\n')[0]));
        await page.goto(app.url('/index.php/publicknowledge/fr_CA'));
        await idle(page);
        const out = {headerFr: await readHeader()};
        record('f1-fr-pk-header', {...(await screen(page)), headerFr: out.headerFr});
        await signIn(page, 'manager.maya', {contextPath: 'publicknowledge'});
        await page.goto(app.url('/index.php/publicknowledge/fr_CA/management/settings/website#setup/navigationMenus'));
        await idle(page);
        await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor();
        await sleep(500);
        out.itemsFr = await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"] tr.gridRow').evaluateAll((trs) => trs.map((t) => t.innerText.replace(/^\s*\S+\s*/, '').trim()));
        out.formLocales = await page.evaluate(() => (window.pkp && pkp.context && pkp.context.supportedFormLocales) || null);
        record('f2-fr-pk-tables', {...(await screen(page)), ...out});
        await shot(page, 'f2-fr-pk-tables');
        console.log(`[fr] ${app.name}`, JSON.stringify(out));
        await signOut(page);
    } finally { await close(); }
});
