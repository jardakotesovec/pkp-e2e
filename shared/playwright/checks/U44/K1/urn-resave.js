// K1 one-off: the Rule 19 context's URN settings window opened and saved unchanged by its manager, then the
// article's "Identifiers" page read again (is the empty page a seed artefact?).
const fs = require('fs'); const path = require('path');
const {forEachApp, launch, signIn, idle, record, outDir, shot, screen} = require('../../../probe');
forEachApp(async (app) => {
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), `k1-state-${app.name}.json`), 'utf8'));
    const {page, close} = await launch(app);
    const got = [];
    page.on('response', async (r) => { if (/_components\/identifier|manage\?|plugin/.test(r.url()) && r.request().method() !== 'GET' || /_components\/identifier/.test(r.url())) got.push({status: r.status(), url: r.url().replace(/^.*index.php/, '').slice(0, 160), body: (await r.text().catch(() => '')).slice(0, 600)}); });
    try {
        await signIn(page, S.uu.mg, {contextPath: S.U}); await idle(page);
        await page.goto(app.url(`/index.php/${S.U}/management/settings/website`)); await idle(page);
        await page.locator('#plugins-button').click();
        const row = page.locator('#pluginGridContainer tr.gridRow[id$="-row-urnpubidplugin"]');
        await row.waitFor({timeout: 30000});
        await row.locator('a.show_extras').first().click(); await page.waitForTimeout(400);
        await page.locator('#pluginGridContainer tr[id$="-row-urnpubidplugin"] + tr').getByRole('link', {name: 'Settings', exact: true}).first().click();
        const form = page.locator('form#urnSettingsForm, form[id*="urn"]').first();
        await form.waitFor({timeout: 30000}); await idle(page); await page.waitForTimeout(500);
        const before = await form.evaluate((f) => [...f.querySelectorAll('input, select')].filter((e) => e.type !== 'hidden').map((e) => `${e.name}=${e.type === 'checkbox' || e.type === 'radio' ? (e.checked ? 'on' : 'off') + ':' + e.value : e.value}`));
        record('resave-window', {...(await screen(page)), before});
        await shot(page, 'resave-window');
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await idle(page); await page.waitForTimeout(1500); await idle(page);
        await page.goto(app.url(`/index.php/${S.U}/dashboard/editorial?workflowSubmissionId=${S.V.id}&workflowMenuKey=publication_${S.V.pub}_identifiers`));
        await idle(page); await page.waitForTimeout(3000); await idle(page);
        await shot(page, 'resave-idpage');
        record('resave', {before, got});
        console.log(JSON.stringify({before, got}).slice(0, 3000));
    } finally { await close(); }
});
