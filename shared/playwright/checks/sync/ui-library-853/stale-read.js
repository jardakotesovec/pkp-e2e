// Pre-merge check for pkp/pkp-lib#13359 (ui-library#853, companion `optimize-table-reloads`): the Review Details
// window's mark-as-read (POST …/reviewAssignments/{id}/consider, sent once the assignment loads) no longer reloads
// the table that opened it; the modal is flagged "changed" only when that POST answers, so a window closed before
// the answer leaves the opener showing the review unread. The POST is held until the window is closed, then released.
//   W  workflow › Reviewers row of a completed review: the row's text after the close and the POST's answer,
//      against the same row after a page reload (the truth); plus the GETs sent after the close
//   D  dashboard › the row's "Review completed" popover: "View unread recommendation" pressed, closed, reopened
//   Fixed when result-ojs.json .W.stale and .D.stale are both false (before: false at ui-library 2034439a).
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/ui-library-853/stale-read.js
const {forEachApp, launch, signIn, record, idle, tag} = require('../../../probe');
const {WorkflowPage, openReviewDetails, reviewDetailsModal, closeReviewDetails} =
    require('../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');
const {EditorialDashboardPage} = require('../../../pages/EditorialDashboardPage.js');
const log = (...a) => console.log(...a);

const CONSIDER = /\/reviewAssignments\/\d+\/consider$/;

/** Hold the consider POST until release(); resolves `seen` when the browser sends it. */
async function holdConsider(page) {
    let release;
    const gate = new Promise((r) => { release = r; });
    let seen;
    const sent = new Promise((r) => { seen = r; });
    await page.route(CONSIDER, async (route) => {
        seen();
        await gate;
        await route.continue();
    });
    return {sent, release, answered: () => page.waitForResponse((r) => CONSIDER.test(r.url()), {timeout: 30_000})};
}

/** Every GET sent from now on, by path; stop() returns them. */
function watchGets(page) {
    const urls = [];
    const on = (req) => {
        if (req.method() === 'GET' && /\/api\/v1\//.test(req.url())) {
            urls.push(new URL(req.url()).pathname.replace(/^.*\/api\/v1/, ''));
        }
    };
    page.on('request', on);
    return () => { page.off('request', on); return urls; };
}

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('u853');
    await app.api.createContext({tag: T, users: [
        {username: `${T}mgr`, roles: ['manager'], givenName: 'Meg', familyName: `Mgr${T}`},
        {username: `${T}rev`, roles: ['externalReviewer'], givenName: 'Rhea', familyName: `Rev${T}`},
        {username: `${T}aut`, roles: ['author'], givenName: 'Au', familyName: `Thor${T}`},
    ]});
    const seed = (s) => app.api.createSubmission({tag: `${T}${s}`, context: T, submitter: `${T}aut`,
        title: `U853 ${s} ${T}`, decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [{username: `${T}rev`, status: 'completed'}]}]});
    const w = await seed('w');
    const d = await seed('d');
    record('seed', {T, w, d});
    const out = {T};

    const {page, close} = await launch(app);
    try {
        await signIn(page, `${T}mgr`, {contextPath: T});

        // ---------- W: the workflow's Reviewers row ----------
        const wf = new WorkflowPage(page, T);
        await wf.gotoEditorial(w.submissionId);
        await idle(page);
        const row = wf.panelRow('Reviewers', `Rev${T}`);
        await row.waitFor({timeout: 30_000});
        out.W = {before: await row.innerText()};
        const hold = await holdConsider(page);
        const modal = await openReviewDetails(page, row);
        await hold.sent;
        const stopGets = watchGets(page);
        await closeReviewDetails(page, modal);
        const answered = hold.answered();
        hold.release();
        out.W.considerStatus = (await answered).status();
        await idle(page);
        await page.waitForTimeout(3000);
        out.W.getsAfterClose = stopGets();
        out.W.afterClose = await row.innerText();
        await page.unroute(CONSIDER);
        await page.reload();
        await idle(page);
        await row.waitFor({timeout: 30_000});
        out.W.afterReload = await row.innerText();
        out.W.stale = out.W.afterClose !== out.W.afterReload;
        log('W', JSON.stringify(out.W, null, 1));

        // ---------- D: the dashboard popover ----------
        const dash = new EditorialDashboardPage(page, T);
        const relist = async () => {
            await dash.goto();
            await dash.openView('Active submissions');
            await dash.searchFor(`U853 d ${T}`);
            await dash.row(`U853 d ${T}`).waitFor({timeout: 30_000});
            return dash.row(`U853 d ${T}`);
        };
        const buttons = async (r) => {
            await dash.activityIndicator(r, /Review completed on/).click();
            const pop = dash.activityPopover(r);
            await pop.waitFor({timeout: 30_000});
            const names = await pop.getByRole('button').allInnerTexts();
            await dash.closeActivityPopover(r);
            return names.map((s) => s.trim()).filter(Boolean);
        };
        let drow = await relist();
        out.D = {before: await buttons(drow)};
        await dash.activityIndicator(drow, /Review completed on/).click();
        const dhold = await holdConsider(page);
        await dash.activityPopover(drow).getByRole('button', {name: 'View unread recommendation', exact: true}).click();
        const details = reviewDetailsModal(page);
        await details.waitFor({timeout: 30_000});
        await dhold.sent;
        const stopDGets = watchGets(page);
        await closeReviewDetails(page, details);
        const danswered = dhold.answered();
        dhold.release();
        out.D.considerStatus = (await danswered).status();
        await idle(page);
        await page.waitForTimeout(3000);
        out.D.getsAfterClose = stopDGets();
        await drow.waitFor({timeout: 30_000});
        out.D.afterClose = await buttons(drow);
        await page.unroute(CONSIDER);
        drow = await relist();
        out.D.afterReload = await buttons(drow);
        out.D.stale = JSON.stringify(out.D.afterClose) !== JSON.stringify(out.D.afterReload);
        log('D', JSON.stringify(out.D, null, 1));
    } finally {
        await close();
    }
    record('result', out);
    return out;
});
