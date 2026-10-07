// PR review of pkp/pkp-lib#13460 round 4 (pkp/ojs#5903; issue pkp/pkp-lib#13447), report
// docs/reports/2026-10-07-pkp-lib-13460.md: "Deposit All" marks the DOI of a public review the editor
// has not confirmed ("Mark as Complete", or the "Notify Reviewers" email) "Submitted", while round 4's
// getExportableDOIsPeerReviewIds() leaves unconfirmed reviews out of every deposit, so the review is never
// sent; once the editor confirms it, the DOIs page shows it "Submitted" and "Deposit All" never takes it
// up again.
//
// OJS only (peer-review DOIs). Seeds its own scratch journal (DOIs on for articles and peer reviews,
// prefix 10.1234, default suffix, "Upon reaching the copyediting stage", reviews public by default,
// Crossref enabled with a depositor but no credentials) and two published works, each with one completed
// public review that got its DOI at the move to Copyediting and that no editor confirmed (the seeded
// "Accept" sends no "Notify Reviewers" email):
//   A (the finding): DOIs page "Deposit All" on screen, then "Mark as Complete" on A's review on screen,
//     then A's expanded row on the DOIs page;
//   C (a neighbour, older than round 4): "Mark DOIs Registered" on C first (the article's DOI; a published
//     work's review DOIs are not in that set), then "Mark as Complete" on C's review, then the same
//     "Deposit All": C's review DOI is in the "Deposit All" set with no work id, so it is marked
//     "Submitted" with no deposit job queued for C.
// No screen shows which reviews a deposit sends ("Export DOIs" answers 400 here: the Crossref XSD fetch is
// refused offline, and no deposit can be made without Crossref credentials), so that list is read the way
// the jobs read it: review-deposit-all.php, a read-only CLI call of getExportableDOIsPeerReviewIds() and
// getAllDepositableSubmissionIds() on the install. Statuses are read from the database. The queued jobs
// are not run. At the tips getExportableDOIsPeerReviewIds() has no confirmation condition, so A's review is
// in the list and the line reads PASS there.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460r4c node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13460/review-deposit-all.js
// Facts: .reports/sync/pr13460r4c/review-deposit-all-ojs.json with screenshots
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, shot, idle, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
const L = require('./lib');

const STATUS = {0: 'none', 1: 'Unregistered', 2: 'Submitted', 3: 'Registered', 4: 'Error', 5: 'Needs Sync'};

/** The work's article DOI and its reviews' DOIs: {article: {doi, status}, reviews: [{id, doiId, doi, status, confirmed, public}]}. */
function dois(app, id) {
    const [art] = String(sql(app, `select d.doi, d.status from submissions s join publications p on p.publication_id=s.current_publication_id
        join dois d on d.doi_id=p.doi_id where s.submission_id=${id}`)).trim().split('\n').map((l) => l.split('|'));
    const reviews = String(sql(app, `select ra.review_id, coalesce(ra.doi_id,0), coalesce(d.doi,'-'), coalesce(d.status,0),
        (ra.date_considered is not null or ra.date_acknowledged is not null), ra.is_review_publicly_visible
        from review_assignments ra left join dois d on d.doi_id=ra.doi_id where ra.submission_id=${id} order by 1`))
        .split('\n').filter(Boolean).map((l) => {
            const [rid, doiId, doi, st, conf, pub] = l.split('|');
            return {id: Number(rid), doiId: Number(doiId), doi, status: STATUS[st] || st, confirmed: conf === 't', public: pub === 't' || pub === '1'};
        });
    return {article: art ? {doi: art[0], status: STATUS[art[1]] || art[1]} : null, reviews};
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
        console.log(`[review-deposit-all] ${app.name}: skipped (OJS only)`);
        return;
    }
    const t = tag('p13460r');
    const {mgr, au} = await L.scratchContext(app, t, {
        enabledDoiTypes: ['publication', 'peerReview'],
        review: {defaultReviewPublicVisibility: true},
        registrationAgency: 'crossrefplugin', publisherInstitution: 'Public Knowledge Project', onlineIssn: '1234-5679',
        plugins: {crossrefplugin: {enabled: true, settings: {depositorName: 'Public Knowledge Project', depositorEmail: 'doi@mail.test'}}},
        users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}, {username: `${t}rv`, roles: ['externalReviewer']}],
    });
    const seed = async (k) => L.sid(await app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: au, title: `Reviewed work ${t}${k}`,
        decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
        reviewRounds: [{reviewers: [{username: `${t}rv`, status: 'completed', comments: 'A public review.'}]}],
        published: true}));
    const A = await seed('a'), C = await seed('c');
    const out = {tag: t, ids: {A, C}, seeded: {A: dois(app, A), C: dois(app, C)}};
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

        // C (neighbour): the article's DOI marked "Registered", then the review confirmed.
        await dp.goto();
        out.markC = (await dp.runBulk('Mark DOIs Registered', [C])).status();
        await confirm(C);
        out.beforeDeposit = {A: dois(app, A), C: dois(app, C), pageA: await pageRow(A), lists: lists(app, t, [A, C])};

        // "Deposit All" on screen.
        await dp.goto();
        await dp.depositAllButton().click();
        out.depositAll = (await dp.confirmAction(dp.dialog('Deposit all DOIs'), 'Deposit all DOIs')).status();
        out.afterDeposit = {A: dois(app, A), C: dois(app, C), jobs: {A: jobsFor(app, A), C: jobsFor(app, C)}, lists: lists(app, t, [A, C])};

        // A: the editor confirms the review now; its row on the DOIs page.
        await confirm(A);
        out.afterConfirmA = {A: dois(app, A), pageA: await pageRow(A), lists: lists(app, t, [A])};
        await shot(page, 'review-deposit-all-after-confirm');
    } finally {
        out.serverLog = log.since(from);
        record('review-deposit-all', out);
        await close();
    }

    const inList = (l, id) => (l.exportable.single || []).includes(id) || (l.exportable.versioning || []).includes(id);
    const ra = out.afterDeposit.A.reviews[0] || {};
    const raLater = out.afterConfirmA.A.reviews[0] || {};
    const bug = ra.doi !== '-' && !ra.confirmed && ra.status === 'Submitted' && !inList(out.afterDeposit.lists, ra.id);
    console.log(`[review-deposit-all] ojs: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `A's review ${ra.id} (DOI ${ra.doi}, public ${ra.public}, confirmed ${ra.confirmed}) before "Deposit All": ${(out.beforeDeposit.A.reviews[0] || {}).status}, `
        + `DOIs page row ${JSON.stringify(out.beforeDeposit.pageA)}; "Deposit All" ${out.depositAll} -> article ${out.afterDeposit.A.article.status}, review ${ra.status}; `
        + `DepositSubmission jobs for A ${out.afterDeposit.jobs.A}; reviews the deposit sends (A and C): ${JSON.stringify(out.afterDeposit.lists.exportable)}; `
        + `after "Mark as Complete": review ${raLater.status} (confirmed ${raLater.confirmed}), DOIs page row ${JSON.stringify(out.afterConfirmA.pageA)}, `
        + `reviews the deposit sends now: ${JSON.stringify(out.afterConfirmA.lists.exportable)}`);
    const rc = out.afterDeposit.C.reviews[0] || {};
    const cRow = (out.beforeDeposit.lists.depositable || []).find((r) => r.doiId === (out.beforeDeposit.C.reviews[0] || {}).doiId);
    console.log(`[review-deposit-all] ojs neighbour (older than round 4): "Mark DOIs Registered" ${out.markC} -> C's article ${out.beforeDeposit.C.article.status}, `
        + `review ${(out.beforeDeposit.C.reviews[0] || {}).status} (confirmed ${(out.beforeDeposit.C.reviews[0] || {}).confirmed}); in the "Deposit All" set as ${JSON.stringify(cRow || null)}; `
        + `after "Deposit All": review ${rc.status}, DepositSubmission jobs for C ${out.afterDeposit.jobs.C}`);
});
