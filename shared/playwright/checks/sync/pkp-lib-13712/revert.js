// PR review of pkp-lib#13602, round 3 (pkp-lib#13712 `13d982d9f4`,
// ui-library#1041 `255c839533`): `isConfirmedByEditor()` is false for an
// unconsidered review even when date_acknowledged is still set, which is
// what "Revert Decision" leaves on a thanked review (considered 1,
// date_considered null, date_acknowledged kept).
//
// PKP's `main` dataset: OJS review 20 (Aisla McCrae, submission 13, author
// `lkumiega`) and OMP review 10 (Adela Gallego, submission 11, author
// `jlockehart`) are completed, confirmed and thanked (considered 3, both
// dates set).
//   1 `dbarnes`: the review round, the reviewer's row › "More Actions" ›
//     "Edit": "Open", "OK";
//   2 the author: the submissions API's record, the review round's row, the
//     read-review address;
//   3 `dbarnes`: the API's consider route with `considered: 1` (the
//     row's "More Actions" on main has no "Revert Decision"; its items are
//     recorded);
//   4 the author again, the same reads.
// The round-3 head shows the review at 2 and hides it at 4.
//
// Reset first:  npm run fleet-prep -- --feature i13602 --dataset --reset --apps ojs,omp
// Run:          PROBE_FEATURE=i13602 PROBE_AGENT=<id> PROBE_RUN=<run> node bin/probe.js ojs,omp shared/playwright/checks/sync/pkp-lib-13712/revert.js
// Facts: .reports/i13602/<id>/revert-<run>-<app>.json
const {forEachApp, launch, signIn, signOut, sql, record, idle} = require('../../../probe');
const L = require('../../issues/author-read-review-no-text/lib.js');

const T = 30_000;
const CASES = {
    ojs: {id: 13, reviewId: 20, roundId: 10, author: 'lkumiega', reviewer: 'Aisla McCrae'},
    omp: {id: 11, reviewId: 10, roundId: 11, author: 'jlockehart', reviewer: 'Adela Gallego'},
};

// WALK_DB names the dataset fleet's database where the kit's sql() reads the
// campaign one (the ore branch's kit predates dataset fleets in sql()).
const q = (app, query) => (process.env.WALK_DB
    ? require('child_process').execFileSync('psql', ['-X', '-d', process.env.WALK_DB, '-tA', '-c', query], {encoding: 'utf8'}).trim()
    : sql(app, query));
const state = (app, c) => q(app, `select 'method='||review_method||':considered='||considered||':date_considered='||coalesce(date_considered::text,'-')||':date_acknowledged='||coalesce(date_acknowledged::text,'-') from review_assignments where review_id=${c.reviewId}`);

async function openRound(page, app, c, author) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${c.id}&workflowMenuKey=workflow_3_${c.roundId}`));
    await page.locator('[data-cy="sidemodal-header"]').first().waitFor({timeout: T});
    await idle(page);
    await page.locator('[data-cy="reviewer-manager"]').first().waitFor({timeout: author ? 8000 : T}).catch(() => {});
    await L.sleep(800);
}

async function authorReads(page, app, c) {
    const out = {};
    const api = await page.request.get(app.url(`/index.php/${app.contextPath}/api/v1/submissions/${c.id}`));
    const j = await api.json().catch(() => null);
    const ra = j && (j.reviewAssignments || []).find((x) => x.id === c.reviewId);
    out.api = {status: api.status(), record: ra ? {reviewerFullName: ra.reviewerFullName, reviewerId: ra.reviewerId, isConfirmedByEditor: ra.isConfirmedByEditor, dateConsidered: ra.dateConsidered} : 'no record'};
    await openRound(page, app, c, true);
    const row = L.reviewerRow(page, c.reviewer);
    out.reviewerRow = (await row.count()) ? L.flat(await row.innerText(), 300) : null;
    out.nameOnScreen = await page.getByText(c.reviewer).count();
    const rr = await page.request.get(app.url(`/index.php/${app.contextPath}/$$$call$$$/grid/users/reviewer/author-reviewer-grid/read-review?submissionId=${c.id}&reviewAssignmentId=${c.reviewId}&stageId=3`));
    const txt = await rr.text();
    let body = null;
    try { body = JSON.parse(txt); } catch (_) { /* not json */ }
    out.readReview = {status: rr.status(), jsonStatus: body ? body.status : null, nameShown: txt.includes(c.reviewer)};
    return out;
}

async function revert(page, app, c) {
    // The reviewer row's "More Actions" on main offers no "Revert Decision"
    // (recorded); the API's consider route takes `considered: 1`
    // (REVIEW_ASSIGNMENT_UNCONSIDERED), asked from the editor's page session.
    const row = L.reviewerRow(page, c.reviewer);
    await row.waitFor({timeout: T});
    await row.getByRole('button', {name: 'More Actions'}).click();
    const menu = page.getByRole('menu');
    await menu.getByRole('menuitem').first().waitFor({timeout: T});
    const items = (await menu.getByRole('menuitem').allInnerTexts()).map((t) => L.flat(t, 60));
    await page.keyboard.press('Escape');
    const csrf = await page.evaluate(() => window.pkp && pkp.currentUser && pkp.currentUser.csrfToken);
    const res = await page.request.put(app.url(`/index.php/${app.contextPath}/api/v1/submissions/${c.id}/reviewAssignments/${c.reviewId}/consider`), {
        headers: {'X-Csrf-Token': csrf, 'Content-Type': 'application/json'},
        data: {considered: 1},
    });
    const j = await res.json().catch(() => null);
    return {menu: items, status: res.status(), isConfirmedByEditor: j ? j.isConfirmedByEditor : null, considered: j ? j.considered : null};
}

forEachApp(async (app) => {
    const c = CASES[app.name];
    if (!c) { console.log(`[revert ${app.name}] no case: not walked`); return; }
    const o = {app: app.name, run: process.env.PROBE_RUN || '-', submission: c.id, reviewId: c.reviewId, reviewer: c.reviewer};
    const {page, close} = await launch(app);
    const errors = [];
    page.on('pageerror', (e) => errors.push(L.flat(e.message, 200)));
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) { o[key] = {error: L.flat(e.message, 600)}; }
    };
    try {
        o.state0 = state(app, c);
        await signIn(page, 'dbarnes');
        await step('s1', async () => { await openRound(page, app, c, false); return L.setReviewType(page, c.reviewer, 'Open'); });
        o.state1 = state(app, c);
        await signOut(page);
        await signIn(page, c.author);
        await step('s2', () => authorReads(page, app, c));
        await signOut(page);
        await signIn(page, 'dbarnes');
        await step('s3', async () => { await openRound(page, app, c, false); return revert(page, app, c); });
        o.state3 = state(app, c);
        await signOut(page);
        await signIn(page, c.author);
        await step('s4', () => authorReads(page, app, c));
        o.pageErrors = errors;
    } finally {
        record(`revert-${o.run}`, o);
        await close();
    }
});
