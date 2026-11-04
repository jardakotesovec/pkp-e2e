// PR review of pkp-lib#13602 (pkp-lib#13712, ui-library#1041; app PRs
// ojs#6025, omp#2549, ops#1480 bump the pointers): an open review's name and
// text stay hidden from the author until an editor confirms the review
// ("Read Review" › "Mark as Complete", review_assignments.date_considered).
// On PKP's default test dataset (a dataset fleet, harness.md "Dataset
// fleets"), `publicknowledge`, as the dataset's own users; the kit builds
// nothing. A preprint server has no review: OPS is not walked.
//
// OJS submission 10 (Aisla McCrae, review 15), OMP submission 16 (Adela
// Gallego, review 21): both reviews completed and not yet confirmed in the
// dataset.
//   1 `dbarnes`: the reviewer's row › "More Actions" › "Edit": "Open", "OK";
//   2 the author (`jnovak` / `mpower`) before the confirm: My Submissions'
//     row (its "Reviewers assigned:" line), the workflow's review round
//     (the "Reviewers" panel, the reviewer's row), the submissions API's
//     record of the review as the author reads it, and the "Read Review"
//     address (author-reviewer-grid read-review) asked directly;
//   3 `dbarnes`: the reviewer's row › "Read Review" › "Mark as Complete";
//   4 the author again, the same four reads.
// The base (the apps' tips) shows the review at 2; the PR head must hide
// it at 2 and show it at 4.
//
// Reset first:  npm run fleet-prep -- --feature i13602 --dataset --reset --apps ojs,omp
// Run:          PROBE_FEATURE=i13602 PROBE_AGENT=<id> PROBE_RUN=<base|head> node bin/probe.js ojs,omp shared/playwright/checks/sync/pkp-lib-13712/walk.js
// Ore (the worktree, OJS only): the same commands from ../pkp-e2e-s1-ore,
//   with PROBE_APPS=ojs and WALK_DB=ojs_test_s5_ds1 in front.
// Facts: .reports/i13602/<id>/walk-<run>-<app>.json
const {forEachApp, launch, signIn, signOut, sql, record, idle} = require('../../../probe');
const L = require('../../issues/author-read-review-no-text/lib.js');

const T = 30_000;
const CASES = {
    ojs: {...L.CASES.ojs, reviewId: 15},
    omp: {...L.CASES.omp, reviewId: 21},
};

// WALK_DB names the dataset fleet's database where the kit's sql() reads the
// campaign one (the ore branch's kit predates dataset fleets in sql()).
function state(app, c) {
    const q = `select review_method||':completed='||(date_completed is not null)||':considered='||coalesce(date_considered::text,'-') from review_assignments where review_id=${c.reviewId}`;
    if (!process.env.WALK_DB) return sql(app, q);
    return require('child_process').execFileSync('psql', ['-X', '-d', process.env.WALK_DB, '-tA', '-c', q], {encoding: 'utf8'}).trim();
}

/** The author's four reads of the review. */
async function authorReads(page, app, c) {
    const out = {};
    // My Submissions: the submission's row.
    const lists = [];
    const onResp = async (r) => {
        if (/\/api\/v1\/_submissions/.test(r.url()) && r.request().method() === 'GET') {
            const j = await r.json().catch(() => null);
            const item = j && Array.isArray(j.items) ? j.items.find((s) => s.id === c.id) : null;
            const ra = item && (item.reviewAssignments || []).find((x) => x.id === c.reviewId);
            if (item) lists.push(ra ? {reviewerFullName: ra.reviewerFullName, reviewerDisplayInitials: ra.reviewerDisplayInitials, statusId: ra.statusId, dateConsidered: ra.dateConsidered, reviewMethod: ra.reviewMethod} : 'no record');
        }
    };
    page.on('response', onResp);
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/mySubmissions`));
    await idle(page);
    const row = page.getByRole('row').filter({hasText: c.title}).first();
    await row.waitFor({timeout: T});
    await L.sleep(800);
    out.listRow = L.flat(await row.innerText(), 400);
    out.listReviewersAssigned = /Reviewers assigned/i.test(out.listRow);
    out.listApi = lists[0] || null;
    page.off('response', onResp);

    // The submissions API as the author.
    const api = await page.request.get(app.url(`/index.php/${app.contextPath}/api/v1/submissions/${c.id}`));
    const j = await api.json().catch(() => null);
    const ra = j && (j.reviewAssignments || []).find((x) => x.id === c.reviewId);
    out.api = {status: api.status(), record: ra ? {reviewerFullName: ra.reviewerFullName, reviewerUserName: ra.reviewerUserName, reviewerId: ra.reviewerId, statusId: ra.statusId, dateCompleted: ra.dateCompleted, dateConsidered: ra.dateConsidered, reviewerRecommendationId: ra.reviewerRecommendationId, reviewerRecommendationType: ra.reviewerRecommendationType} : 'no record'};

    // The workflow's review round.
    await L.openAsAuthor(page, app, c);
    await page.locator('[data-cy="reviewer-manager"]').first().waitFor({timeout: 8000}).catch(() => {});
    out.reviewersPanel = await page.locator('[data-cy="reviewer-manager"]').count();
    const rrow = L.reviewerRow(page, c.reviewer);
    out.reviewerRow = (await rrow.count()) ? L.flat(await rrow.innerText(), 300) : null;
    out.nameOnScreen = await page.getByText(c.reviewer).count();
    out.readReviewButtons = await page.getByRole('button', {name: 'Read Review', exact: true}).count();

    // The "Read Review" address, asked directly.
    const rr = await page.request.get(app.url(`/index.php/${app.contextPath}/$$$call$$$/grid/users/reviewer/author-reviewer-grid/read-review?submissionId=${c.id}&reviewAssignmentId=${c.reviewId}&stageId=3`));
    const txt = await rr.text();
    let body = null;
    try { body = JSON.parse(txt); } catch (_) { /* not json */ }
    out.readReview = {
        status: rr.status(),
        jsonStatus: body ? body.status : null,
        content: body && typeof body.content === 'string' ? L.flat(body.content.replace(/<[^>]+>/g, ' '), 300) : L.flat(txt.replace(/<[^>]+>/g, ' '), 200),
        nameShown: txt.includes(c.reviewer),
        commentShown: txt.includes(c.comment),
    };
    return out;
}

/** The editor's "Read Review" › "Mark as Complete" (OMP's confirmReviewAsEditor, on the page). */
async function confirm(page, c) {
    const row = L.reviewerRow(page, c.reviewer);
    await row.getByRole('button', {name: 'Read Review'}).click();
    const readModal = page.getByRole('dialog', {name: /^Review Details:/});
    await readModal.getByRole('button', {name: 'Modify Review', exact: true}).waitFor({timeout: T});
    await L.sleep(500);
    await readModal.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
    await page.locator('[data-cy="dialog"]').filter({hasText: 'Mark this review as complete?'})
        .getByRole('button', {name: 'Mark as Complete', exact: true}).click();
    const toast = await page.getByText('The review has been marked as complete.').first().waitFor({timeout: T}).then(() => true).catch(() => false);
    await readModal.getByRole('button', {name: 'Cancel', exact: true}).click();
    await readModal.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    return {toast, row: L.flat(await row.innerText().catch(() => ''), 300)};
}

forEachApp(async (app) => {
    const c = CASES[app.name];
    if (!c) { console.log(`[i13602 ${app.name}] no review: not walked`); return; }
    const o = {app: app.name, line: app.line || 'main', run: process.env.PROBE_RUN || '-', submission: c.id, reviewId: c.reviewId, reviewer: c.reviewer};
    const {page, close} = await launch(app);
    const errors = [];
    page.on('pageerror', (e) => errors.push(L.flat(e.message, 200)));
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) { o[key] = {error: L.flat(e.message, 600)}; }
    };
    try {
        o.state0 = state(app, c);
        await signIn(page, 'dbarnes');
        await step('s1', async () => { await L.openEditorial(page, app, c.id); return L.setReviewType(page, c.reviewer, 'Open'); });
        o.state1 = state(app, c);
        await signOut(page);
        await signIn(page, c.author);
        await step('s2', () => authorReads(page, app, c));
        await signOut(page);
        await signIn(page, 'dbarnes');
        await step('s3', async () => { await L.openEditorial(page, app, c.id); return confirm(page, c); });
        o.state3 = state(app, c);
        await signOut(page);
        await signIn(page, c.author);
        await step('s4', () => authorReads(page, app, c));
        o.pageErrors = errors;
    } finally {
        record(`walk-${o.run}`, o);
        await close();
    }
});
