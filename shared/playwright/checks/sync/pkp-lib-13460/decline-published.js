// PR review of pkp/pkp-lib#13460 (pkp/ojs#5903; issue pkp/pkp-lib#13447), report
// docs/reports/2026-10-07-pkp-lib-13460.md finding 1: with "Immediately, when an item is created",
// declining a submission whose "Published Manuscript Under Review" version is published deletes that
// published version's DOI and its galley's DOI, and the public article page stops showing the DOI.
//
// OJS only (the published-version-under-review workflow). Seeds its own scratch journal (DOIs on for
// articles and galleys, prefix 10.1234, default suffix); as its manager chooses "Immediately" on the
// DOIs Setup tab, seeds a submission at Review with a remote galley, publishes its version as
// "Published Manuscript Under Review 1.0" through the publication API the publish panel calls (in the
// manager's session), reads the public page, records "Decline Submission" on screen and reads the page
// again. At the tips the option does not exist: the script says so and stops (no "before" walk).
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13460/decline-published.js
// Facts: .reports/sync/pr13460/decline-published-ojs.json
const {forEachApp, launch, signIn, record, shot, idle, tag, sql, serverLog} = require('../../../probe');
const L = require('./lib');

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[decline-published] ${app.name}: skipped (OJS only)`);
        return;
    }
    const t = tag('p13460a');
    const {mgr, au} = await L.scratchContext(app, t);
    const out = {tag: t};
    const log = serverLog(app);
    const from = log.mark();
    const doiOnPage = async (page, id) => {
        await page.goto(app.url(`/index.php/${t}/article/view/${id}`));
        await idle(page);
        return (await page.locator('body').innerText()).match(/https:\/\/doi\.org\/\S+/g);
    };
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept());
    try {
        await signIn(page, mgr, {contextPath: t});
        out.setting = await L.chooseImmediately(page, t);
        if (!out.setting.saved) {
            console.log(`[decline-published] ${app.name}: NOT APPLICABLE — no "Immediately" option (${out.setting.options.join(' / ')})`);
            return;
        }
        const r = await app.api.createSubmission({tag: `${t}a`, context: t, submitter: au, title: `F1 PMUR ${t}`,
            decisions: ['sendExternalReview'], galleys: [{label: 'PDF', urlRemote: 'https://example.org/f1.pdf'}]});
        const id = L.sid(r);
        out.id = id;
        out.afterSeed = L.pubRows(app, id);
        await page.goto(app.url(`/index.php/${t}/dois`));
        await idle(page);
        const meta = await page.evaluate(() => ({api: pkp.context.apiBaseUrl, csrf: pkp.currentUser.csrfToken}));
        const pid = r.publicationId;
        const h = {headers: {'X-Csrf-Token': meta.csrf, 'Content-Type': 'application/json'}};
        let x = await page.request.put(`${meta.api}submissions/${id}/publications/${pid}`, {...h, data: {versionStage: 'PMUR', versionMajor: 1, versionMinor: 0}});
        out.putStage = x.status();
        x = await page.request.put(`${meta.api}submissions/${id}/publications/${pid}/publish`, h);
        out.publish = x.status();
        out.afterPublish = L.pubRows(app, id);
        out.galleyDoisBefore = String(sql(app, `select g.galley_id, coalesce(d.doi,'-') from publication_galleys g left join dois d on d.doi_id=g.doi_id where g.publication_id=${pid}`)).trim();
        out.publicBefore = await doiOnPage(page, id);
        out.decline = await L.recordDecision(page, t, id, 'Decline Submission');
        await shot(page, 'decline-published-after-decline');
        out.afterDecline = L.pubRows(app, id);
        out.galleyDoisAfter = String(sql(app, `select g.galley_id, coalesce(d.doi,'-') from publication_galleys g left join dois d on d.doi_id=g.doi_id where g.publication_id=${pid}`)).trim();
        out.publicAfter = await doiOnPage(page, id);
        await shot(page, 'decline-published-public-after');
    } finally {
        out.serverLog = log.since(from);
        record('decline-published', out);
        await close();
    }
    const stillPublished = (out.afterDecline.publications[0] || '').split('|')[1] === '3';
    const bug = out.decline.recorded && stillPublished && !!out.publicBefore && !out.publicAfter;
    console.log(`[decline-published] ${app.name}: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `published version's DOI before decline ${out.publicBefore ? out.publicBefore.join(',') : 'none'}, after ${out.publicAfter ? out.publicAfter.join(',') : 'none'}; `
        + `publication ${out.afterDecline.publications.join(' ; ')}; galley ${out.galleyDoisBefore} -> ${out.galleyDoisAfter}; submission status|stage ${out.afterDecline.submission}`);
});
