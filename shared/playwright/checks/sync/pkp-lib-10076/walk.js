// pkp-lib#10076 regression walk (docs/reports/2026-11-25-pkp-lib-10076.md): an assistant-level participant (the Funding coordinator) assigned to a submission's
// review stage does not see the declined and cancelled reviewers in the workflow's "Reviewers"
// table, while the editor (dbarnes) does; the 3.4 reviewers grid showed assistants every row.
// On PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets"), `publicknowledge`.
// The kit builds nothing; every step is a screen. A preprint server has no review: OPS not walked.
//
// OJS submission 12 (jjanssen, phudson not responded; author lchristopher) /
// OMP submission 2 (alzacharia, gfavio not responded; author afinkel):
//   1. admin gives mfritz (Maria Fritz) "Funding coordinator" (Administration > Hosted
//      Journals/Presses > Settings wizard > Users > "Edit User").
//   2. dbarnes opens the submission, Participants "Assign": "Funding coordinator", Maria Fritz, "OK".
//   3. the first reviewer accepts the request (a not-yet-confirmed reviewer is only "Unassign
//      Reviewer", which deletes the assignment); dbarnes, row "More Actions" > "Cancel Reviewer".
//   4. the second reviewer opens the request, "Decline Review Request" (link, then the window's button).
//   5. dbarnes: the "Reviewers" table.  6. mfritz: the dashboard row, then the "Reviewers" table.
//   7. the author: what the review stage shows.
// Every step is recorded and none throws, so the same script reads the state a fix brings.
// PART=read takes steps 5-7 alone (reads, no change), on a fleet the earlier steps have already run on.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs,omp shared/playwright/checks/sync/pkp-lib-10076/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 in front, with the 3.5 fleet's feature.
// Facts: .reports/<feature>/<id>/facts-<app>.json (PART=read: facts-read-<app>.json)
// Fixed when facts-<app>.json `assistantRows.rows` lists the same "Request Cancelled" and "Request Declined"
// rows as `editorRows.rows` (today: one "No Items" row); `authorRows` must still name no reviewer.
const {forEachApp, launch, signIn, signOut, screen, shot, record} = require('../../../probe');
const H = require('./lib.js');

const PART = process.env.PART || 'all';

forEachApp(async (app) => {
    const c = H.CASES[app.name];
    if (!c) {
        console.log(`[walk ${app.name}] no review stage: not walked`);
        return;
    }
    const A = H.ASSISTANT;
    const o = {app: app.name, line: app.line || 'main', submissionId: c.id};
    const {page, close} = await launch(app);
    let n = 0;
    const step = async (key, fn) => {
        try {
            o[key] = await fn();
        } catch (e) {
            o[key] = {threw: H.flat(e.message, 600)};
        }
        console.log(`[walk ${app.name}] ${key}`, JSON.stringify(o[key]).slice(0, 2500));
        const label = `${PART === 'read' ? 'read-' : ''}${String(++n).padStart(2, '0')}-${key}`;
        record(label, await screen(page).catch(() => ({url: page.url()})));
        await shot(page, label).catch(() => {});
        record(PART === 'read' ? 'facts-read' : 'facts', o);
        return o[key];
    };
    const as = (username) => signIn(page, username, {contextPath: app.contextPath});
    try {
        if (PART !== 'read') {
        await step('role', async () => {                                               // 1
            await signIn(page, 'admin');
            return H.giveRoleAsAdmin(page, app, {username: A.username, role: A.role});
        });
        await step('assign', async () => {                                             // 2
            await as('dbarnes');
            return H.assignAs(page, app, c.id, {role: A.role, personName: A.name});
        });
        await step('accept', async () => {                                             // 3a
            await as(c.cancel.username);
            return H.accept(page, app, c.id);
        });
        await step('cancel', async () => {                                             // 3b
            await as('dbarnes');
            await H.openReviewStage(page, app, c.id);
            return H.cancelReviewer(page, c.cancel.name);
        });
        await step('decline', async () => {                                            // 4
            await as(c.decline.username);
            return H.decline(page, app, c.id);
        });
        }
        await step('editorRows', async () => {                                         // 5
            await as('dbarnes');
            await H.openReviewStage(page, app, c.id);
            return H.readReviewers(page);
        });
        await step('editorDashboard', () => H.findInViews(page, app, c.id));          // 5 (control)
        await step('assistantDashboard', async () => {                                 // 6a
            await as(A.username);
            return H.findInViews(page, app, c.id);
        });
        await step('assistantRows', async () => {                                      // 6b
            await H.openReviewStage(page, app, c.id);
            return H.readReviewers(page);
        });
        await step('authorRows', async () => {                                         // 7
            await as(c.author);
            await page.goto('about:blank');
            await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/mySubmissions?workflowSubmissionId=${c.id}`));
            await page.locator('[role="dialog"]').first().waitFor({timeout: H.T}).catch(() => {});
            await H.sleep(2500);
            const out = await H.readReviewers(page);
            out.menu = H.flat(await page.locator('[role="dialog"] nav').first().innerText().catch(() => null), 400);
            out.dialogText = H.flat(await page.locator('[role="dialog"]:visible').first().innerText().catch(() => null), 1500);
            out.reviewerNames = [c.cancel.name, c.decline.name].filter((nm) => (out.dialogText || '').includes(nm));
            return out;
        });
        await signOut(page).catch(() => {});
    } finally {
        record(PART === 'read' ? 'facts-read' : 'facts', o);
        console.log(JSON.stringify(o, null, 1));
        await close();
    }
});
