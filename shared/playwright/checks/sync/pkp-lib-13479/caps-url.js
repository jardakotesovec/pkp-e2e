// Kept walk for round 2's finding of the PR review of pkp/pkp-lib#13479 (its report, deleted once acted on:
// round 3's head f8c4d3176e fixed it): a reference whose web address is written with a capital scheme. The
// finding's steps as written, on PKP's default test dataset (a dataset fleet), as dbarnes, through the
// screens only:
//   Setup: Settings › Workflow › "Metadata": "Enable references structuring and metadata lookup", "Save".
//   OJS 4, OMP 3, OPS 1 › References: three references added in one "Add" ("…HTTP://example.org/caps",
//   "…Http://example.org/sentence" and the control "…http://example.org/plain"); the page reloaded so the
//   lookup's first job runs; each row's "Edit citation" "URL" box read.
// Reads fixed when `caps.url` and `sentence.url` hold their addresses (as written; pkp-lib 15f9f72323 stores
// "https://example.org/caps" and "https://example.org/sentence").
// Run once per side (reset the fleet first: npm run fleet-prep -- --feature <feature> --dataset <n> --reset):
//   SIDE=before|after PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13479/caps-url.js
// Writes facts-<side>-<app>.json and <side>-edit-citation-<app>.png to .reports/<feature>/<id>/.
const path = require('path');
const {forEachApp, launch, signIn, signOut, record, serverLog, idle, outDir} = require('../../../probe');
const K = require('../../issues/arxiv-id-loses-version/lib.js');

const SIDE = process.env.SIDE || 'after';
const SUBMISSION = {ojs: 4, omp: 3, ops: 1};
const REFS = {
    caps: 'Oscar O. Field notes. HTTP://example.org/caps',
    sentence: 'Quebec Q. Field notes. Available at: Http://example.org/sentence',
    control: 'Papa P. Field notes. http://example.org/plain',
};

/** Settings › Workflow › "Metadata": metadata lookup on, Save. */
async function enableLookup(page, app) {
    await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/workflow`));
    await idle(page);
    const tab = page.locator('#metadata-button');
    if (await tab.count()) { await tab.first().click(); await idle(page); }
    const lookup = page.getByRole('checkbox', {name: 'Enable references structuring and metadata lookup', exact: true});
    await lookup.waitFor({state: 'visible', timeout: K.T});
    await lookup.check();
    const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: K.T}).catch(() => null);
    await page.locator('form').filter({has: lookup}).getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    return {saveStatus: r ? r.status() : null, ticked: await lookup.isChecked()};
}

forEachApp(async (app) => {
    const facts = {app: app.name, side: SIDE, submission: SUBMISSION[app.name]};
    const log = serverLog(app);
    const from = log.mark();
    const {page} = await launch(app);
    const openRefs = async () => { await K.gotoWorkflow(page, app, SUBMISSION[app.name]); return K.openEntry(page, 'References'); };
    await signIn(page, 'dbarnes');
    facts.settings = await enableLookup(page, app);
    facts.heading = await openRefs();
    facts.add = await K.addReference(page, Object.values(REFS).join('\n'));
    // Every page load runs waiting jobs (job_runner = On).
    for (let i = 0; i < 4; i++) { await K.sleep(1500); await openRefs(); }
    for (const [key, text] of Object.entries(REFS)) {
        const rowText = text.slice(0, 20);
        facts[key] = {text, row: K.flat(await K.refRow(page, rowText).innerText().catch(() => null), 300)};
        await K.openEditCitation(page, rowText);
        facts[key].url = await K.editField(page, 'URL').inputValue();
        if (key === 'caps') {
            const box = K.editField(page, 'URL');
            await box.scrollIntoViewIfNeeded().catch(() => {});
            await K.editPanel(page).screenshot({path: path.join(outDir(), `${SIDE}-edit-citation-${app.name}.png`)}).catch((e) => { facts.shot = K.flat(e.message, 200); });
        }
        await K.closeEditCitation(page);
        console.log(`[caps-url ${app.name} ${SIDE}] ${key}`, JSON.stringify(facts[key]));
    }
    facts.serverLog = log.since(from);
    record(`facts-${SIDE}`, facts);
    await signOut(page).catch(() => {});
});
