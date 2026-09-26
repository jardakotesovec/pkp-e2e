// U19 claim check K2 — OJS: Settings › Distribution › "DOIs" › "Setup" left with "DOI Versioning" changed and
// unsaved (the tab switch to "Access", then a page leave), then reopened: what asks, what stays. Nothing is saved.
//   PROBE_FEATURE=U19 PROBE_AGENT=ccK2 node bin/probe.js ojs shared/playwright/checks/U19/K2/leave.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, outDir} = require('../../../probe');

const YES = 'Yes, assign a unique DOI to every version of an article.';
const T = 30_000;

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), 'k2-state-ojs.json'), 'utf8'));
    const out = {dialogs: []};
    const {page, close} = await launch(app);
    page.on('dialog', async (d) => { out.dialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    const setup = async () => {
        await page.goto(app.url(`/index.php/${S.C2.path}/management/settings/distribution`)); await idle(page);
        await page.getByRole('tab', {name: 'DOIs', exact: true}).click(); await idle(page);
        const outer = page.getByRole('tabpanel', {name: 'DOIs', exact: true});
        await outer.getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page);
        const p = outer.getByRole('tabpanel', {name: 'Setup', exact: true});
        await p.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
        return p;
    };
    try {
        await signIn(page, S.C2.mg, {contextPath: S.C2.path});
        let p = await setup();
        out.before = await p.getByRole('radio', {name: YES}).isChecked();
        await p.getByRole('radio', {name: YES}).check();
        await page.getByRole('tab', {name: 'Access', exact: true}).click(); await idle(page);
        const s1 = await screen(page); record('lv-01-tab-switch', s1); await shot(page, 'lv-01-tab-switch');
        out.afterTabSwitch = {url: page.url(), dialogs: out.dialogs.length};
        p = await setup();
        out.backOnSetup = await p.getByRole('radio', {name: YES}).isChecked();
        await p.getByRole('radio', {name: YES}).check();
        await page.goto(app.url(`/index.php/${S.C2.path}/management/settings/website`)); await idle(page);
        out.afterLeave = {url: page.url(), dialogs: out.dialogs.length};
        p = await setup();
        out.reopened = await p.getByRole('radio', {name: YES}).isChecked();
        const s2 = await screen(page); record('lv-02-reopened', s2);
    } finally {
        record('lv-facts', out);
        console.log('[k2l]', JSON.stringify(out));
        await close();
    }
});
