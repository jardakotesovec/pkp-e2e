// PR review of pkp/pkp-lib#13460 (pkp/ojs#5903, pkp/omp#2495, pkp/ops#1435; issue
// pkp/pkp-lib#13447), report docs/reports/2026-10-07-pkp-lib-13460.md finding 2: with "Immediately,
// when an item is created", "Revert Decline" never assigns again the DOIs the decline deleted,
// although the change means it to ("If the decline is reverted, the DOIs are assigned again").
//
// All three apps (shared code). Seeds its own scratch context (DOIs on for every kind, prefix
// 10.1234, default suffix); as its manager chooses "Immediately" on the DOIs Setup tab, seeds a
// submitted submission (it gets its DOI at submission), records "Decline Submission" on screen at the
// stage it stands in (Submission; Production on a preprint server; the DOI is deleted), then "Revert
// Decline" on screen, reads the publication's DOI after each, and the DOIs page under "Needs DOI".
// At the tips the option does not exist: the script says so and stops.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460 node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13460/revert-decline.js
// Facts: .reports/sync/pr13460/revert-decline-<app>.json
const {forEachApp, launch, signIn, record, shot, idle, screen, tag, serverLog} = require('../../../probe');
const L = require('./lib');

forEachApp(async (app) => {
    const t = tag('p13460b');
    const {mgr, au} = await L.scratchContext(app, t);
    const out = {tag: t};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept());
    try {
        await signIn(page, mgr, {contextPath: t});
        out.setting = await L.chooseImmediately(page, t);
        if (!out.setting.saved) {
            console.log(`[revert-decline] ${app.name}: NOT APPLICABLE — no "Immediately" option (${out.setting.options.join(' / ')})`);
            return;
        }
        const r = await app.api.createSubmission({tag: `${t}a`, context: t, submitter: au, title: `F2 revert ${t}`});
        const id = L.sid(r);
        out.id = id;
        out.submitted = L.pubRows(app, id);
        out.decline = await L.recordDecision(page, t, id, 'Decline Submission');
        out.declined = L.pubRows(app, id);
        out.revert = await L.recordDecision(page, t, id, 'Revert Decline');
        await shot(page, 'revert-decline-after');
        out.reverted = L.pubRows(app, id);
        // The DOIs page, filtered to "Needs DOI": is the reactivated submission there?
        await page.goto(app.url(`/index.php/${t}/dois`));
        await idle(page);
        await page.getByRole('button', {name: 'Needs DOI', exact: true}).first().click();
        await idle(page);
        await page.waitForTimeout(1500);
        out.needsDoiListed = (await screen(page)).aria.main.includes(`F2 revert ${t}`);
        await shot(page, 'revert-decline-needs-doi');
    } finally {
        out.serverLog = log.since(from);
        record('revert-decline', out);
        await close();
    }
    const doi = (rows) => (rows.publications[0] || '').split('|')[3];
    const bug = out.decline.recorded && out.revert.recorded && doi(out.submitted) !== '-'
        && doi(out.declined) === '-' && doi(out.reverted) === '-';
    console.log(`[revert-decline] ${app.name}: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `DOI submitted ${doi(out.submitted)}, after decline ${doi(out.declined)}, after "Revert Decline" ${doi(out.reverted)}; `
        + `submission status|stage ${out.submitted.submission} -> ${out.declined.submission} -> ${out.reverted.submission}; `
        + `recorded decline ${out.decline.recorded}, revert ${out.revert.recorded}; listed under the DOIs page's "Needs DOI": ${out.needsDoiListed}`);
});
