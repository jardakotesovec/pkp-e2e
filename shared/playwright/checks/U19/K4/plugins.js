// U19 claim check K4, follow-up: the Reference table's plugin rows — which category of Settings › Website ›
// "Plugins" › "Installed Plugins" lists each OAI-related plugin, read as the manager of K4's untouched context Q.
// Read only. Needs k4.js's state (PHASES=seed) for the context.
//   PROBE_FEATURE=U19 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U19/K4/plugins.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, record, idle, outDir} = require('../../../probe');

forEachApp(async (app) => {
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), `k4-state-${app.name}.json`), 'utf8'));
    const {page, close} = await launch(app);
    try {
        await signIn(page, S.Q.u.mg, {contextPath: S.Q.path});
        await page.goto(app.url(`/index.php/${S.Q.path}/management/settings/website`)); await idle(page).catch(() => {});
        await page.locator('#plugins-button').first().click(); await idle(page).catch(() => {});
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: 30_000});
        const cats = await page.locator('#pluginGridContainer tbody').evaluateAll((tbs) => tbs.map((tb) => {
            const head = tb.querySelector('tr.category, tr[class*=category]');
            return {head: head ? head.innerText.replace(/\s+/g, ' ').trim() : tb.id.replace(/^.*-category-/, ''),
                rows: [...tb.querySelectorAll('tr.gridRow')].map((tr) => { const b = tr.querySelector('input[type=checkbox]'); return `${tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 60)}${b ? ` [${b.checked ? 'ticked' : 'unticked'}${b.disabled ? ', disabled' : ''}]` : ''}`; })
                    .filter((r) => /OAI|DC Metadata|MARC|JATS Metadata|DRIVER|Dublin Core/i.test(r))};
        }).filter((c) => c.rows.length));
        record('pl-01-installed-plugins', {...(await screen(page)), cats});
        console.log(app.name, JSON.stringify(cats));
    } finally {
        await close();
    }
});
