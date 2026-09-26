// U19 claim check K4, follow-up: which step of the Hosted Journals "Edit" window raises the page script error
// "Cannot read properties of null (reading 'clientWidth')" seen in k4.js's sweep. Nothing is saved.
// Needs k4.js's state (context Q).
//   PROBE_FEATURE=U19 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U19/K4/hosted-close.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, record, idle, outDir} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
forEachApp(async (app) => {
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), `k4-state-${app.name}.json`), 'utf8'));
    const {page, close} = await launch(app);
    const steps = [];
    const errs = [];
    page.on('pageerror', (e) => errs.push({step: steps.length ? steps[steps.length - 1] : null, msg: e.message.slice(0, 160)}));
    const step = async (s, fn) => { steps.push(s); await fn(); await sleep(1200); };
    try {
        await signIn(page, 'admin');
        const openEdit = async () => {
            const row = page.locator('tr.gridRow').filter({hasText: S.Q.name}).first();
            if (await row.locator('a.show_extras').count()) { await row.locator('a.show_extras').click(); await sleep(300); }
            await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
            await page.getByRole('checkbox', {name: /appear publicly on the site/}).waitFor({timeout: 30_000});
        };
        const closeBtn = () => page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^Close/}).first();
        await step('land Hosted Journals', async () => { await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page).catch(() => {}); });
        await step('open Edit (1)', openEdit);
        await step('Close unchanged', async () => closeBtn().click());
        await step('open Edit (2), same page', openEdit);
        await step('untick the box', async () => page.getByRole('checkbox', {name: /appear publicly on the site/}).uncheck());
        await step('Close with the change', async () => closeBtn().click());
        await step('land Hosted Journals again (goto)', async () => { await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page).catch(() => {}); });
        await step('open Edit (3), after a fresh landing', openEdit);
        await step('untick again, Close, goto at once', async () => { await page.getByRole('checkbox', {name: /appear publicly on the site/}).uncheck(); await closeBtn().click(); await sleep(900); await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page).catch(() => {}); });
        await step('open Edit (4)', openEdit);
        record('hc-01-reopened', await screen(page));
        await step('Close unchanged (3)', async () => closeBtn().click());
        await step('open Create', async () => { await page.getByRole('link', {name: /^Create (Journal|Press|Server)$/}).first().click(); await sleep(800); });
        await step('Close Create', async () => closeBtn().click());
    } finally {
        record('hc-facts', {steps, errs});
        console.log(app.name, JSON.stringify(errs));
        await close();
    }
});
