// The PR review's round-1 report (fixed in round 2, deleted at the merge): what still
// names the open reviewer to the author before the editor's confirmation, at
// the PR heads. Same dataset cases as walk.js; `dbarnes` sets the review
// "Open", then the author (`jnovak` / `mpower`) opens My Submissions and
// clicks the row's "Reviewers assigned:" avatar (screenshot of the row with
// its popover), and reads the submission's API record of the review.
// Reset first:  npm run fleet-prep -- --feature i13602 --dataset --reset --apps ojs,omp
// Run:          PROBE_FEATURE=i13602 PROBE_AGENT=<id> PROBE_RUN=<run> node bin/probe.js ojs,omp shared/playwright/checks/sync/pkp-lib-13712/gap.js
const {forEachApp, launch, signIn, signOut, record, idle, outFile} = require('../../../probe');
const L = require('../../issues/author-read-review-no-text/lib.js');

const CASES = {
    ojs: {...L.CASES.ojs, reviewId: 15},
    omp: {...L.CASES.omp, reviewId: 21},
};

forEachApp(async (app) => {
    const c = CASES[app.name];
    if (!c) return;
    const run = process.env.PROBE_RUN || '-';
    const o = {app: app.name, run, submission: c.id, reviewId: c.reviewId};
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        await L.openEditorial(page, app, c.id);
        o.setOpen = await L.setReviewType(page, c.reviewer, 'Open');
        await signOut(page);
        await signIn(page, c.author);
        await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/mySubmissions`));
        await idle(page);
        const row = page.getByRole('row').filter({hasText: c.title}).first();
        await row.waitFor({timeout: L.T});
        const avatar = row.locator('button[id^="headlessui-popover-button"]').first();
        o.avatars = await row.locator('button[id^="headlessui-popover-button"]').count();
        if (o.avatars) {
            await avatar.click();
            const panel = row.locator('[id^="headlessui-popover-panel"]');
            await panel.waitFor({timeout: L.T});
            o.popover = L.flat(await panel.innerText(), 300);
        }
        await L.sleep(400);
        const box = await row.boundingBox();
        await page.screenshot({path: `${outFile(`gap-${run}-my-submissions`)}.png`, clip: {x: box.x, y: box.y, width: box.width, height: box.height + 110}});
        const api = await page.request.get(app.url(`/index.php/${app.contextPath}/api/v1/submissions/${c.id}`));
        const j = await api.json().catch(() => null);
        const ra = j && (j.reviewAssignments || []).find((x) => x.id === c.reviewId);
        o.api = ra ? {reviewerFullName: ra.reviewerFullName, reviewerUserName: ra.reviewerUserName, reviewerId: ra.reviewerId, dateCompleted: ra.dateCompleted, dateConsidered: ra.dateConsidered} : 'no record';
        await L.openAsAuthor(page, app, c);
        o.reviewersPanel = await page.locator('[data-cy="reviewer-manager"]').count();
        await page.screenshot({path: `${outFile(`gap-${run}-workflow`)}.png`});
    } finally {
        record(`gap-${run}`, o);
        await close();
    }
});
