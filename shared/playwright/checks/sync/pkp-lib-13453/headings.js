// PR review of pkp/pkp-lib#13453 (#11718): the "Installed Plugins" list's category rows, read as the
// Site Administrator on the context the reset seeds: each heading's text and its row's classes, the grid's
// classes and the number of plugin rows under each heading, then the same after a "Search" for "feed". Read only.
//   PROBE_FEATURE=sync-11718 PROBE_AGENT=k1 node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13453/headings.js
const {forEachApp, launch, signIn, record, idle} = require('../../../probe');

const read = (page) => page.locator('#pluginGridContainer .pkp_controllers_grid').first().evaluate((grid) => ({
    gridClass: grid.className,
    heads: [...grid.querySelectorAll('tbody.category_grid_body > tr.gridRow:first-child')].map((tr) => ({
        text: tr.innerText.replace(/\s+/g, ' ').trim(),
        label: (tr.querySelector('.label') || {innerText: ''}).innerText.trim(),
        cls: tr.className,
        rows: tr.parentElement.querySelectorAll('tr.gridRow:not(:first-child)').length,
        weight: getComputedStyle(tr.querySelector('.label') || tr).fontWeight,
    })),
}));

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin', {contextPath: app.contextPath});
        await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/website`)); await idle(page).catch(() => {});
        await page.locator('#plugins-button').first().click(); await idle(page).catch(() => {});
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: 30_000});
        const landing = await read(page);
        const form = page.locator('#pluginGridContainer form.filter').first();
        await page.locator('#pluginGridContainer .header .actions a').filter({hasText: 'Search'}).first().click();
        await form.locator('input[name="pluginName"]').fill('feed');
        await form.getByRole('button', {name: 'Search', exact: true}).click();
        await idle(page).catch(() => {});
        await page.waitForTimeout(1500);
        const searched = await read(page);
        record('h-01-headings', {landing, searched});
        console.log(app.name, JSON.stringify({landing, searched}, null, 1));
    } finally {
        await close();
    }
});
