// PR review of pkp-lib#13602, round 3 (pkp-lib#13712 `13d982d9f4`,
// ui-library#1041 `255c839533`): an editor's confirmation is now
// `ReviewAssignment::isConfirmedByEditor()`, "date_considered or
// date_acknowledged, and not unconsidered", in the API's anonymisation, the
// author's review round (ui-library `isConfirmedByEditor`) and the public
// review queries. `ReviewAssignmentRequiredPolicy` (the "Read Review"
// address) still asks for date_considered alone.
//
// A review an editor thanked on 3.4 has date_acknowledged and no
// date_considered after the upgrade (the column came in 3.5 with no
// backfill, I10359): PKP's own 3.4 dataset, upgraded by fleet-prep to the
// checkout, holds such reviews (OJS 20 on submission 13, OMP 10 on
// submission 11: considered 0, date_considered null, date_acknowledged set).
// The review method is set to "Open" in the database (the column the
// reviewer row's "Edit" › "Open" writes, walk.js step 1), then the author
// (`lkumiega` / `jlockehart`) reads the review round, presses "Read Review",
// asks the read-review address directly and reads the submissions API.
//
// Reset first:  PKP_E2E_DATASET_BRANCH=stable-3_4_0 npm run fleet-prep -- --feature i13602-34 --dataset 2 --reset --apps ojs,omp
// Run:          PROBE_FEATURE=i13602-34 PROBE_AGENT=<id> PROBE_RUN=<run> node bin/probe.js ojs,omp shared/playwright/checks/sync/pkp-lib-13712/legacy.js
// Facts: .reports/i13602-34/<id>/legacy-<run>-<app>.json, screenshots beside.
const {forEachApp, launch, signIn, signOut, sql, record, idle, outFile} = require('../../../probe');
const L = require('../../issues/author-read-review-no-text/lib.js');

const T = 30_000;
const CASES = {
    ojs: {id: 13, reviewId: 20, roundId: 10, author: 'lkumiega', reviewer: 'Aisla McCrae', comment: 'Here are my review comments',
        title: 'Hydrologic Connectivity in the Edwards Aquifer between San Marcos Springs and Barton Springs during 2009 Drought Conditions'},
    omp: {id: 11, reviewId: 10, roundId: 11, author: 'jlockehart', reviewer: 'Adela Gallego', comment: 'I recommend that the author revise this submission.',
        title: 'Dreamwork'},
};

const state = (app, c) => sql(app, `select 'method='||review_method||':considered='||considered||':date_considered='||coalesce(date_considered::text,'-')||':date_acknowledged='||coalesce(date_acknowledged::text,'-') from review_assignments where review_id=${c.reviewId}`);

forEachApp(async (app) => {
    const c = CASES[app.name];
    if (!c) { console.log(`[legacy ${app.name}] no case: not walked`); return; }
    const run = process.env.PROBE_RUN || '-';
    const o = {app: app.name, run, submission: c.id, reviewId: c.reviewId, reviewer: c.reviewer};
    o.state0 = state(app, c);
    sql(app, `update review_assignments set review_method=3 where review_id=${c.reviewId}`);
    o.state1 = state(app, c);
    const {page, close} = await launch(app);
    const errors = [];
    page.on('pageerror', (e) => errors.push(L.flat(e.message, 200)));
    try {
        await signIn(page, c.author);

        // The submissions API as the author.
        const api = await page.request.get(app.url(`/index.php/${app.contextPath}/api/v1/submissions/${c.id}`));
        const j = await api.json().catch(() => null);
        const ra = j && (j.reviewAssignments || []).find((x) => x.id === c.reviewId);
        o.api = {status: api.status(), record: ra ? {reviewerFullName: ra.reviewerFullName, reviewerId: ra.reviewerId, isConfirmedByEditor: ra.isConfirmedByEditor, dateConsidered: ra.dateConsidered, reviewMethod: ra.reviewMethod, statusId: ra.statusId} : 'no record'};

        // The workflow's review round.
        await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/mySubmissions?workflowSubmissionId=${c.id}&workflowMenuKey=workflow_3_${c.roundId}`));
        await page.locator('[data-cy="sidemodal-header"]').first().waitFor({timeout: T});
        await idle(page);
        await page.locator('[data-cy="reviewer-manager"]').first().waitFor({timeout: 8000}).catch(() => {});
        await L.sleep(800);
        o.reviewersPanel = await page.locator('[data-cy="reviewer-manager"]').count();
        const row = L.reviewerRow(page, c.reviewer);
        o.reviewerRow = (await row.count()) ? L.flat(await row.innerText(), 300) : null;
        o.readReviewButtons = o.reviewerRow ? await row.getByRole('button', {name: 'Read Review', exact: true}).count() : 0;
        await page.screenshot({path: outFile('legacy-round.png'), fullPage: false});

        // Pressing the row's "Read Review".
        if (o.readReviewButtons) {
            const answer = page.waitForResponse((r) => /read-review/i.test(r.url()), {timeout: T}).catch(() => null);
            await row.getByRole('button', {name: 'Read Review', exact: true}).click();
            const res = await answer;
            o.click = {request: res ? {status: res.status(), url: res.url().replace(/^https?:\/\/[^/]+/, '')} : null};
            if (res) {
                const t = await res.text().catch(() => '');
                let b = null;
                try { b = JSON.parse(t); } catch (_) { /* not json */ }
                o.click.jsonStatus = b ? b.status : null;
                o.click.content = L.flat((b && typeof b.content === 'string' ? b.content : t).replace(/<[^>]+>/g, ' '), 300);
            }
            await L.sleep(2500);
            await idle(page);
            const dialogs = page.getByRole('dialog');
            o.click.dialogs = [];
            for (let i = 0; i < await dialogs.count(); i++) {
                const d = dialogs.nth(i);
                if (await d.isVisible().catch(() => false)) o.click.dialogs.push(L.flat(await d.innerText().catch(() => ''), 400));
            }
            o.click.commentOnScreen = await page.getByText(c.comment).count();
            await page.screenshot({path: outFile('legacy-read.png'), fullPage: false});
        }

        // The "Read Review" address, asked directly.
        const rr = await page.request.get(app.url(`/index.php/${app.contextPath}/$$$call$$$/grid/users/reviewer/author-reviewer-grid/read-review?submissionId=${c.id}&reviewAssignmentId=${c.reviewId}&stageId=3`));
        const txt = await rr.text();
        let body = null;
        try { body = JSON.parse(txt); } catch (_) { /* not json */ }
        o.readReview = {
            status: rr.status(),
            jsonStatus: body ? body.status : null,
            content: L.flat((body && typeof body.content === 'string' ? body.content : txt).replace(/<[^>]+>/g, ' '), 300),
            commentShown: txt.includes(c.comment),
        };
        o.pageErrors = errors;
    } finally {
        record(`legacy-${run}`, o);
        await close();
    }
});
