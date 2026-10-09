// Kept walk for round 1's finding of the PR review of pkp/pkp-lib#13479 (its report, deleted once acted on:
// the second commit 50fb7ad3b2 fixed it): a data citation of type "URI" or "PURL" typed with an http://
// address. The finding's steps as written, on PKP's default test
// dataset (a dataset fleet), as dbarnes, through the screens only:
//   Setup: Settings › Workflow › "Metadata": "Enable data citation metadata" ("Ask the author…"), "Save".
//   OJS 4, OMP 3, OPS 1 › Data: "Add Data Citation" twice ("URI" http://example.org/data, "PURL"
//   http://purl.obolibrary.org/obo/GO_0008150), then a control with an https:// address; the rows read.
// Reads fixed when `uri.saved` and `purl.saved` are the addresses as typed (as on pkp-lib 2ac457888e).
// Run once per side (reset the fleet first: npm run fleet-prep -- --feature <feature> --dataset <n> --reset):
//   SIDE=before|after PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13479/http-address.js
// Writes facts-<side>-<app>.json and <side>-data-citations-<app>.png to .reports/<feature>/<id>/.
const path = require('path');
const {forEachApp, launch, signIn, signOut, record, serverLog, idle, outDir} = require('../../../probe');
const K = require('../../issues/arxiv-id-loses-version/lib.js');

const SIDE = process.env.SIDE || 'after';
const SUBMISSION = {ojs: 4, omp: 3, ops: 1};
const CASES = {
    uri: ['Survey data', 'URI', 'http://example.org/data'],
    purl: ['Ontology term', 'PURL', 'http://purl.obolibrary.org/obo/GO_0008150'],
    control: ['Survey data, secure', 'URI', 'https://example.org/data2'],
};

/** Settings › Workflow › "Metadata": data citations on, "Ask the author…", Save. */
async function enableDataCitations(page, app) {
    await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/workflow`));
    await idle(page);
    const tab = page.locator('#metadata-button');
    if (await tab.count()) { await tab.first().click(); await idle(page); }
    const dc = page.getByRole('checkbox', {name: 'Enable data citation metadata', exact: true});
    await dc.waitFor({state: 'visible', timeout: K.T});
    await dc.check();
    await page.getByRole('group', {name: 'Data Citations', exact: true}).getByRole('radio', {name: /^Ask the author for data citation metadata/}).check();
    const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: K.T}).catch(() => null);
    await page.locator('form').filter({has: dc}).getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    return {saveStatus: r ? r.status() : null, ticked: await dc.isChecked()};
}

forEachApp(async (app) => {
    const facts = {app: app.name, side: SIDE, submission: SUBMISSION[app.name]};
    const log = serverLog(app);
    const from = log.mark();
    const {page} = await launch(app);
    await signIn(page, 'dbarnes');
    facts.settings = await enableDataCitations(page, app);
    await K.gotoWorkflow(page, app, SUBMISSION[app.name]);
    facts.heading = await K.openEntry(page, 'Data');
    const table = page.locator('table[aria-label="Data Citations"]:visible').first();
    await table.waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
    for (const [key, [title, identifierType, identifier]] of Object.entries(CASES)) {
        const {panel, saved} = await K.addDataCitation(page, {title, identifierType, identifier, relationship: K.SUPPORTING});
        if (!saved.closed) await K.closeDataCitation(page, panel);
        facts[key] = {
            typed: identifier, type: identifierType, status: saved.status, errors: saved.errors,
            saved: saved.closed && saved.response ? saved.response.identifier : null,
            row: ((await K.dcRows(page)) || []).find((r) => r.endsWith(title)) || null,
        };
        console.log(`[http-address ${app.name} ${SIDE}] ${key}`, JSON.stringify(facts[key]));
    }
    await table.scrollIntoViewIfNeeded().catch(() => {});
    await table.screenshot({path: path.join(outDir(), `${SIDE}-data-citations-${app.name}.png`)}).catch((e) => { facts.shot = K.flat(e.message, 200); });
    facts.serverLog = log.since(from);
    record(`facts-${SIDE}`, facts);
    await signOut(page).catch(() => {});
});
