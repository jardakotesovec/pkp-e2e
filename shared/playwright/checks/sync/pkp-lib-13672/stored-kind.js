// Kept check of the PR review of pkp/pkp-lib#13530 (pkp-lib#13672, ojs#6013, ui-library#1038), round 4.
// A journal whose stored "Items with DOIs" setting still holds the removed "authorResponse" kind (only
// the settings API could store it before the change: the Setup form's box was commented out from its
// introduction, ojs 30e82d3876): can the manager still save the DOIs "Setup" tab once the PRs are in?
// Run on an OJS dataset fleet (at the PR heads, or at the base for the control):
//   npm run fleet-prep -- --feature <feature> --dataset <n> --apps ojs --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=<a> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13672/stored-kind.js
// Steps, as dbarnes: (db) the journal's enabledDoiTypes set to publication, peerReview, authorResponse;
// Settings › Distribution › DOIs › "Setup": 1 "DOI Prefix" 10.1234 (nothing else changed), "Save"; 2 "Peer Review" unticked,
// "Save"; 3 "Peer Review" ticked again, "Save". Each records the request body, the answer, the
// screen's message and the stored setting.
const {forEachApp, launch, signIn, record, sql, serverLog, idle, shot} = require('../../../probe');
const K = require('../../issues/author-response-doi-reminted/lib.js');

forEachApp(async (app) => {
    if (app.name !== 'ojs') { console.log(`[stored-kind ${app.name}] OJS only`); return; }
    const {DoiSettings} = require('../../../pages/DoisPages.js');
    const log = serverLog(app);
    const from = log.mark();
    const j = K.journal(app);
    sql(app, `update journal_settings set setting_value = '["publication","peerReview","authorResponse"]' where journal_id = ${j.id} and setting_name = 'enabledDoiTypes'`);
    const facts = {before: K.journal(app).enabledDoiTypes, steps: []};
    const {page} = await launch(app);
    await signIn(page, 'dbarnes');
    let body = null;
    page.on('request', (r) => { if (/\/api\/v1\/contexts\/\d+$/.test(r.url()) && r.method() !== 'GET') body = r.postData(); });
    const settings = new DoiSettings(page, app.contextPath);
    await settings.goto('Setup');
    await settings.prefixBox().fill('10.1234');
    const save = async (name) => {
        body = null;
        const response = await settings.pressSave(settings.setup);
        await idle(page);
        await page.waitForTimeout(500);
        await shot(page, `stored-kind-${name.split(' ')[0]}`);
        const shown = await settings.setup.locator('.pkpFieldError, .pkpFormPage__status, .pkpFormErrors, [role="status"], [role="alert"], .pkpNotify').allInnerTexts().catch(() => []);
        facts.steps.push({name, sent: K.flat(body, 300), status: response.status(), shown: shown.map((s) => K.flat(s, 200)).filter(Boolean), stored: K.journal(app).enabledDoiTypes, kinds: await settings.kinds()});
    };
    await save('1 save unchanged');
    await settings.kindBox('Peer Review').uncheck();
    await save('2 Peer Review unticked');
    await settings.kindBox('Peer Review').check();
    await save('3 Peer Review ticked again');
    facts.serverLog = log.since(from);
    record('stored-kind', facts);
    console.log('[stored-kind ojs]', JSON.stringify(facts, null, 1));
});
