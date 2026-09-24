// U08 claim check K1, companion: after k1.js "types" ran, the notice text of
// every item's icons in I's primary menu window (the item types table's last
// column for the types the installed menus lack: Subscriptions, My
// Subscriptions, Current Issue, Catalog, New Releases, Custom Page, Remote URL).
// Run: PROBE_FEATURE=U08 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U08/K1/k1-icons.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, outDir} = require('../../../probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
forEachApp(async (app) => {
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), `k1-state-${app.name}.json`)));
    const {page, close} = await launch(app);
    try {
        await signIn(page, S.I.users.mgr, {contextPath: S.I.path});
        await page.goto(app.url(`/index.php/${S.I.path}/management/settings/website#setup/navigationMenus`));
        await idle(page);
        await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]').first().getByRole('link', {name: 'Primary Navigation Menu', exact: true}).click();
        await page.locator('[data-cy="navigation-menu-editor"] [data-menu-item-title]').first().waitFor();
        await idle(page); await sleep(600);
        const icons = await page.locator('[data-cy="navigation-menu-editor"]').evaluate((root) => [...root.querySelectorAll('[data-menu-item-title]')].map((el) => ({title: el.getAttribute('data-menu-item-title'), icons: [...el.querySelectorAll('button[title]')].map((b) => (b.className.includes('text-negative') ? 'warning: ' : 'eye: ') + b.title)})));
        const s = await screen(page);
        record('f0-icons-primary-window', {...s, icons});
        await shot(page, 'f0-icons-primary-window');
        for (const i of icons.filter((x) => /^(T |U08 )/.test(x.title))) console.log(`[icons] ${app.name} ${i.title} :: ${i.icons.join(' | ') || '—'}`);
    } finally { await close(); }
});
