// PR review of pkp/pkp-lib#13550: the Comments page with "Enable Public Comments" off (U14 A4). Opens the page
// by its address as dbarnes and records each "Error" dialog it raises: on load and on each tab switch,
// pressing "OK" each time, then what the table reads. Run after walk.js, which leaves comments off.
//   PROBE_FEATURE=pr13539-<side> PROBE_AGENT=off node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13550/comments-off.js
const {forEachApp, launch, signIn, record, shot, idle, sql} = require('../../../probe');

forEachApp(async (app) => {
    const out = {setting: sql(app, `select setting_value from ${app.contextTables.settings} where setting_name = 'enablePublicComments'`).trim()};
    const {page, close} = await launch(app);
    const dialog = page.getByRole('dialog').filter({hasText: 'Error'});
    const read = async (label) => {
        await page.waitForTimeout(1500);
        await idle(page);
        const n = await dialog.count();
        const text = n ? (await dialog.first().innerText()).replace(/\s+/g, ' ').trim() : null;
        if (n) await dialog.first().getByRole('button', {name: 'OK'}).click();
        await idle(page);
        out[label] = {dialogs: n, text, table: (await page.locator('main [role="tabpanel"]:visible tbody').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200)};
        record('off', out);
    };
    try {
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/userComments`));
        await read('load');
        await shot(page, 'after-ok');
        for (const tab of ['Approved', 'Hidden/Needs Approval', 'Reported', 'All']) {
            await page.locator('main [role="tab"]').filter({hasText: new RegExp(`^\\s*${tab.replace('/', '\\/')}\\s*$`)}).click();
            await read(`tab-${tab}`);
        }
    } finally {
        await close();
    }
});
