// PR review of pkp/pkp-lib#13460 round 5 (pkp/ojs#5903; issue pkp/pkp-lib#13447), report
// docs/reports/2026-10-07-pkp-lib-13460.md: on a work whose current version is a published "Published
// Manuscript Under Review", the per-work "Deposit DOIs" marks the DOI of a public review the editor has not
// confirmed "Submitted", while the deposit job's list (getExportableDOIsPeerReviewIds(), confirmed reviews
// only since round 4) leaves it out; once the editor confirms it, "Deposit All" skips the "Submitted" DOI.
//
// OJS only (peer-review DOIs). Seeds its own scratch journal (DOIs on for articles and peer reviews, prefix
// 10.1234, default suffix, "Upon reaching the copyediting stage", reviews public by default, Crossref enabled
// with a depositor but no credentials) and three works, each with one completed public review no editor
// confirmed:
//   A (the finding): at Review, its version set to "Published Manuscript Under Review" 1.0 and published
//     through the publication API the publish panel calls (the publish gives the article and the review their
//     DOIs); DOIs page "Deposit DOIs" on A on screen; "Mark as Complete" on A's review on screen; A's expanded
//     row on the DOIs page; "Deposit All" on screen;
//   B (older than the PR): the same PMUR work, "Mark DOIs Registered" on screen;
//   C (control): a published Version of Record, "Deposit DOIs" on screen: its review DOI stays out of the
//     per-work set (pkp/pkp-lib#13450), consistent with the job.
// The reviews the deposit sends are read the way the job reads them (review-deposit-all.php, read-only CLI).
// Statuses are read from the database. The queued jobs are not run (no Crossref credentials, offline), so
// Crossref's answer, which would mark A's review "Registered" through updateDepositStatus(), is read only.
// At the tips getExportableDOIsPeerReviewIds() has no confirmation condition, so A's review is in the job's
// list and the line reads PASS there.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460r5b node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13460/review-deposit-work.js
// Facts: .reports/sync/pr13460r5b/review-deposit-work-ojs.json with a screenshot
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, shot, idle, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
const L = require('./lib');

const STATUS = {0: 'none', 1: 'Unregistered', 2: 'Submitted', 3: 'Registered', 4: 'Error', 5: 'Needs Sync'};

/** The work's status, its current version's stage and article DOI, and its reviews' DOIs. */
function dois(app, id) {
    const [art] = String(sql(app, `select s.status, coalesce(p.version_stage,''), coalesce(d.doi,'-'), coalesce(d.status,0) from submissions s
        join publications p on p.publication_id=s.current_publication_id left join dois d on d.doi_id=p.doi_id where s.submission_id=${id}`))
        .trim().split('\n').map((l) => l.split('|'));
    const reviews = String(sql(app, `select ra.review_id, coalesce(ra.doi_id,0), coalesce(d.doi,'-'), coalesce(d.status,0),
        (ra.date_considered is not null or ra.date_acknowledged is not null), ra.is_review_publicly_visible
        from review_assignments ra left join dois d on d.doi_id=ra.doi_id where ra.submission_id=${id} order by 1`))
        .split('\n').filter(Boolean).map((l) => {
            const [rid, doiId, doi, st, conf, pub] = l.split('|');
            return {id: Number(rid), doiId: Number(doiId), doi, status: STATUS[st] || st, confirmed: conf === 't', public: pub === 't' || pub === '1'};
        });
    return {submissionStatus: Number(art[0]), stage: art[1], article: {doi: art[2], status: STATUS[art[3]] || art[3]}, reviews};
}

/** DepositSubmission jobs queued for the work. */
const jobsFor = (app, id) => Number(String(sql(app, `select count(*) from jobs where position('DepositSubmission' in payload) > 0
    and payload ~ 'submissionId[^;]{0,3};i:${id};'`)).trim());

/** The lists the deposit reads (review-deposit-all.php, read-only). */
function lists(app, t, ids) {
    const root = path.resolve(process.cwd(), app.root);
    const config = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(process.cwd(), app.configFile);
    const out = execFileSync('php', [path.join(__dirname, 'review-deposit-all.php'), root, t, ...ids.map(String)],
        {env: {...process.env, PKP_CONFIG_FILE: config}, encoding: 'utf8', timeout: 120000});
    return JSON.parse(out.trim().split('\n').pop());
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[review-deposit-work] ${app.name}: skipped (OJS only)`);
        return;
    }
    const t = tag('p13460w');
    const {mgr, au} = await L.scratchContext(app, t, {
        enabledDoiTypes: ['publication', 'peerReview'],
        review: {defaultReviewPublicVisibility: true},
        registrationAgency: 'crossrefplugin', publisherInstitution: 'Public Knowledge Project', onlineIssn: '1234-5679',
        plugins: {crossrefplugin: {enabled: true, settings: {depositorName: 'Public Knowledge Project', depositorEmail: 'doi@mail.test'}}},
        users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}, {username: `${t}rv`, roles: ['externalReviewer']}],
    });
    const reviewRounds = [{reviewers: [{username: `${t}rv`, status: 'completed', comments: 'A public review.'}]}];
    const atReview = async (k) => app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: au, title: `Manuscript under review ${t}${k}`,
        decisions: ['sendExternalReview'], reviewRounds});
    const ra = await atReview('a'), rb = await atReview('b');
    const A = L.sid(ra), B = L.sid(rb);
    const C = L.sid(await app.api.createSubmission({tag: `${t}c`, context: t, submitter: au, title: `Version of record ${t}c`,
        decisions: ['sendExternalReview', 'accept', 'sendToProduction'], reviewRounds, published: true}));
    const out = {tag: t, ids: {A, B, C}};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
        await recordNotices(page);
        await signIn(page, mgr, {contextPath: t});
        const R = require('../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');
        const wf = new WorkflowPage(page, t);
        const dp = new DoisPage(page, t);
        await dp.goto();
        const meta = await page.evaluate(() => ({api: pkp.context.apiBaseUrl, csrf: pkp.currentUser.csrfToken}));
        const h = {headers: {'X-Csrf-Token': meta.csrf, 'Content-Type': 'application/json'}};
        // A and B: "Published Manuscript Under Review" 1.0, published.
        out.pmur = {};
        for (const [k, r] of [['A', ra], ['B', rb]]) {
            const id = L.sid(r);
            const pubId = r.publicationId || Number(String(sql(app, `select current_publication_id from submissions where submission_id=${id}`)).trim());
            const x1 = await page.request.put(`${meta.api}submissions/${id}/publications/${pubId}`, {...h, data: {versionStage: 'PMUR', versionMajor: 1, versionMinor: 0}});
            const x2 = await page.request.put(`${meta.api}submissions/${id}/publications/${pubId}/publish`, h);
            out.pmur[k] = [x1.status(), x2.status()];
        }
        const confirm = async (id) => {
            await wf.gotoEditorial(id);
            await idle(page);
            const link = page.getByRole('link', {name: /Review Round 1|Round 1/}).first();
            if (!(await link.isVisible().catch(() => false))) {
                const rev = page.getByRole('button', {name: /^Review$/}).first();
                if (await rev.isVisible().catch(() => false)) await rev.click();
            }
            await link.click({timeout: 15000});
            await idle(page);
            const modal = await R.openReviewDetails(page, page.getByRole('row').filter({hasText: 'Read Review'}).first());
            await R.markReviewComplete(page, modal);
            await R.closeReviewDetails(page, modal);
        };
        const pageRow = async (id) => {
            await dp.goto();
            const row = dp.row(id);
            await dp.expand(row, id);
            const badges = [];
            for (const type of await dp.doiTypes(row)) badges.push(`${type}: ${(await dp.doiBadge(row, type).innerText()).trim()}`);
            return badges;
        };
        out.before = {A: dois(app, A), B: dois(app, B), C: dois(app, C), pageA: await pageRow(A), lists: lists(app, t, [A, B, C])};

        // "Deposit DOIs" on A, then on C (control).
        await dp.goto();
        out.depositA = (await dp.runBulk('Deposit DOIs', [A])).status();
        await dp.goto();
        out.depositC = (await dp.runBulk('Deposit DOIs', [C])).status();
        out.afterDeposit = {A: dois(app, A), C: dois(app, C), jobs: {A: jobsFor(app, A), C: jobsFor(app, C)}, lists: lists(app, t, [A, C])};

        // "Mark DOIs Registered" on B.
        await dp.goto();
        out.markB = (await dp.runBulk('Mark DOIs Registered', [B])).status();
        out.afterMarkB = dois(app, B);

        // A: the editor confirms the review; its DOIs page row; "Deposit All".
        await confirm(A);
        out.afterConfirmA = {A: dois(app, A), pageA: await pageRow(A), lists: lists(app, t, [A])};
        await shot(page, 'review-deposit-work-after-confirm');
        await dp.goto();
        await dp.depositAllButton().click();
        out.depositAll = (await dp.confirmAction(dp.dialog('Deposit all DOIs'), 'Deposit all DOIs')).status();
        out.afterDepositAll = {A: dois(app, A), jobs: jobsFor(app, A)};
    } finally {
        out.serverLog = log.since(from);
        record('review-deposit-work', out);
        await close();
    }

    const sends = (l) => [...new Set([...(l.exportable.single || []), ...(l.exportable.versioning || [])])];
    const ra0 = out.afterDeposit.A.reviews[0] || {};
    const aDois = out.before.lists.published[A] || [];
    const bug = ra0.doi !== '-' && !ra0.confirmed && ra0.status === 'Submitted' && !sends(out.afterDeposit.lists).includes(ra0.id);
    const raLater = out.afterDepositAll.A.reviews[0] || {};
    const inDepositAll = (out.afterConfirmA.lists.depositable || []).some((r) => r.doiId === raLater.doiId);
    console.log(`[review-deposit-work] ojs: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `A (status ${out.before.A.submissionStatus}, current version ${out.before.A.stage} published ${JSON.stringify(out.pmur.A)}), review ${ra0.id} `
        + `(DOI ${ra0.doi}, public ${ra0.public}, confirmed ${ra0.confirmed}) ${(out.before.A.reviews[0] || {}).status}, DOIs page row ${JSON.stringify(out.before.pageA)}, `
        + `"Deposit DOIs" set ${JSON.stringify(aDois)} (review DOI id ${ra0.doiId}); "Deposit DOIs" ${out.depositA} -> article ${out.afterDeposit.A.article.status}, review ${ra0.status}; `
        + `DepositSubmission jobs for A ${out.afterDeposit.jobs.A}; reviews the job sends: ${JSON.stringify(sends(out.afterDeposit.lists))}; `
        + `after "Mark as Complete": review ${(out.afterConfirmA.A.reviews[0] || {}).status} (confirmed ${(out.afterConfirmA.A.reviews[0] || {}).confirmed}), `
        + `DOIs page row ${JSON.stringify(out.afterConfirmA.pageA)}, reviews the job sends now: ${JSON.stringify(sends(out.afterConfirmA.lists))}, `
        + `in the "Deposit All" set ${inDepositAll}; "Deposit All" ${out.depositAll} -> review ${raLater.status}`);
    const rb0 = out.afterMarkB.reviews[0] || {};
    console.log(`[review-deposit-work] ojs "Mark DOIs Registered" (older than the PR): B (status ${out.before.B.submissionStatus}, ${out.before.B.stage}) `
        + `"Mark DOIs Registered" ${out.markB} -> article ${out.afterMarkB.article.status}, unconfirmed review ${rb0.id} ${rb0.status} (confirmed ${rb0.confirmed})`);
    const rc0 = out.afterDeposit.C.reviews[0] || {};
    console.log(`[review-deposit-work] ojs control: C (status ${out.before.C.submissionStatus}, ${out.before.C.stage}) "Deposit DOIs" ${out.depositC} -> `
        + `article ${out.afterDeposit.C.article.status}, unconfirmed review ${rc0.id} ${rc0.status} (in the "Deposit DOIs" set ${(out.before.lists.published[C] || []).includes(rc0.doiId)}); `
        + `DepositSubmission jobs for C ${out.afterDeposit.jobs.C}`);
});
