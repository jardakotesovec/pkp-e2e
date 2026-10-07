// PR review of pkp/pkp-lib#13460 (pkp/ojs#5903, pkp/omp#2495; issue pkp/pkp-lib#13447), report
// docs/reports/2026-10-07-pkp-lib-13460.md finding 3: the DOIs page no longer lists a declined
// submission that carries a DOI, under the default "Upon reaching the copyediting stage"; and the new
// filter "In Copyediting, Production or Published" leaves out a submission back at Review that carries
// a DOI, which the page listed before the change.
//
// OJS and OMP (the apps with the filter). Seeds its own scratch context (DOIs on for every kind,
// prefix 10.1234, "Upon reaching the copyediting stage", default suffix) and three submissions:
// "declined" (sent to review, accepted, which gives it its DOI, moved back to review, declined),
// "back" (the same without the decline) and "review" (at review, no DOI). As the manager opens the DOIs
// page, reads its list, then the list request with and without the new filter. Runs unchanged at the
// tips, where the page lists "declined" and "back" (the filter does not exist there).
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460 node bin/probe.js ojs,omp shared/playwright/checks/sync/pkp-lib-13460/doi-page-declined.js
// Facts: .reports/sync/pr13460/doi-page-declined-<app>.json
const {forEachApp, launch, signIn, record, shot, idle, tag, screen} = require('../../../probe');
const L = require('./lib');

forEachApp(async (app) => {
    if (app.name === 'ops') {
        console.log('[doi-page-declined] ops: skipped (no DOIs page list by workflow stage)');
        return;
    }
    const t = tag('p13460c');
    const {mgr, au} = await L.scratchContext(app, t);
    const out = {tag: t, ids: {}};
    const seeds = {
        declined: ['sendExternalReview', 'accept', 'backFromCopyediting', 'decline'],
        back: ['sendExternalReview', 'accept', 'backFromCopyediting'],
        review: ['sendExternalReview'],
    };
    for (const [k, decisions] of Object.entries(seeds)) {
        const r = await app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: au, title: `F3 ${k} ${t}`, decisions});
        out.ids[k] = L.sid(r);
        out[k] = L.pubRows(app, out.ids[k]);
    }
    const {page, close} = await launch(app);
    try {
        await signIn(page, mgr, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/dois`));
        await idle(page);
        await page.waitForTimeout(1500);
        const s = await screen(page);
        out.listed = Object.fromEntries(Object.keys(seeds).map((k) => [k, s.aria.main.includes(`F3 ${k} ${t}`)]));
        await shot(page, 'doi-page-declined');
        out.filterOffered = await page.getByRole('button', {name: 'In Copyediting, Production or Published', exact: true}).count();
        const api = (q) => page.evaluate(async (u) => {
            const r = await fetch(u, {headers: {'X-Csrf-Token': pkp.currentUser.csrfToken}});
            const j = await r.json().catch(() => null);
            return {status: r.status, ids: j && j.items ? j.items.map((i) => i.id) : j};
        }, app.url(`/index.php/${t}/api/v1/submissions?onDoiPage=1&count=50${q}`));
        out.apiList = await api('');
        out.apiFilter = await api('&inEditingOrPublished=1');
    } finally {
        record('doi-page-declined', out);
        await close();
    }
    const doi = (k) => (out[k].publications[0] || '').split('|')[3];
    const name = (ids) => (Array.isArray(ids) ? ids.map((i) => Object.keys(out.ids).find((k) => out.ids[k] === i) || i).join(',') : String(ids));
    const bug = doi('declined') !== '-' && !out.listed.declined;
    const filterGap = out.filterOffered && doi('back') !== '-' && Array.isArray(out.apiFilter.ids) && !out.apiFilter.ids.includes(out.ids.back);
    console.log(`[doi-page-declined] ${app.name}: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `declined submission (DOI ${doi('declined')}, status|stage ${out.declined.submission}) listed: ${out.listed.declined}; `
        + `page lists ${Object.keys(out.listed).filter((k) => out.listed[k]).join(',') || 'none'}; list request [${name(out.apiList.ids)}]; `
        + `filter ${out.filterOffered ? `[${name(out.apiFilter.ids)}]${filterGap ? ` — FILTER GAP: "back" (Review, DOI ${doi('back')}) not in the filter` : ''}` : 'not offered'}`);
});
