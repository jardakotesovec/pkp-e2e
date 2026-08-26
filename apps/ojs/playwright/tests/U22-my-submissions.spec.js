// @ts-check
/**
 * @file playwright/tests/U22-my-submissions.spec.js
 *
 * My Submissions (author dashboard) — OJS suite, one test per canonical
 * scenario the spec runs on OJS (common scenarios 1–3 + scenario 4, which is
 * OJS/OMP-only). Scenario 3 folds in the OJS-specific "Scheduled for
 * publication" feeder (Rule 7d: issue scheduling, "To be published in issue
 * …") — the one view whose feeder is OJS-only (register ❓ A3 is about its
 * absence on OMP/OPS, other apps' territory, as are OPS1/OPS2).
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A1 ❓: S4 asserts the post-upload "Review update 0/1" cell exactly as
 *   scenario 4 states it — the register's question is whether the counter
 *   SHOULD be author-visible; if that ruling reverses, the spec and this
 *   assertion move together. The Rule 7b avatar row (open-review reviewers)
 *   is not a canonical scenario and is not asserted.
 * - A2 ❓: S3 declines its submission from the Submission stage (footnote
 *   s3), so the declined row's activity cell stays clear of the counter;
 *   what a declined-during-review row shows is open and asserted neither
 *   way.
 * - Rule 3's landing-precedence combinations (Author+Reviewer,
 *   Author+Section Editor), the old author-dashboard link forward, and the
 *   access-denied page for a roleless account typing the address are not
 *   canonical scenarios of this spec. S1 exercises the landing rule through
 *   the retired submissions address (an author-only account forwards to My
 *   Submissions). Rule 3's journal-vs-site login split (the sign-in landing
 *   is journal-login behavior; the site login page lands on the site index
 *   on a multi-journal install) is likewise not asserted: the auth fixture
 *   signs in once on the site login page purely to cache cookies, asserting
 *   nothing about where sign-in lands.
 * - Rule 5's Filters panel is Submissions dashboard machinery; only the
 *   search box is scenario'd here.
 * - Rule 7c (copyediting counter) and Rule 9's grayed-out menu state /
 *   Cancel path have no canonical scenario; not asserted.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S2 and S4 isolate on scratch journals with throwaway users
 * (sidebar badge counts need a list only the test controls); S3 mints a
 * throwaway author via a helper context and seeds their submissions in
 * publicknowledge (issue scheduling needs the seeded issues), so every
 * count is scoped to that author's own list. The list itself sends no mail
 * (spec Side effects), so there are no Mailpit assertions. Waits are
 * event-based (auto-wait on rows, headings and badges) — no hard-coded
 * sleeps. Everything runs in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');
const {SubmissionWizardPage} = require('../pages/SubmissionWizardPage.js');
const {uploadViaWizard} = require('../pages/ReviewStagePages.js');

const JOURNAL = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u22${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('my submissions', () => {
    test('S1: track and open a submission', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        // Title deliberately avoids the word "Submission" so the stage
        // bubble's label can be asserted from the row text unambiguously.
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `arta${tag}`,
        });

        // An author-only account lands on My Submissions, "Active
        // submissions" view (Rule 3 — exercised through the retired
        // submission-list address, which forwards the same way).
        const page = await (await asUser('author.alex')).newPage();
        await page.goto(`/index.php/${JOURNAL}/submissions`);
        await page.waitForURL((url) => url.pathname.includes('/dashboard/mySubmissions'), {
            waitUntil: 'commit',
        });
        const mySub = new MySubmissionsPage(page, JOURNAL);
        await mySub.expectViewHeading('Active submissions');

        // The row shows the submission's ID, the authors-and-title line, and
        // the current stage in a bubble (Rule 4).
        const row = await mySub.findRowByTag(tag);
        await expect(row).toContainText(String(submissionId));
        await expect(row).toContainText(`arta${tag}`);
        await expect(row).toContainText('Author');
        // The current stage in a bubble: a fresh submitted submission sits
        // at the Submission stage.
        await expect(row).toContainText('Submission');

        // "View" opens the workflow as a panel over the list; the address
        // records which submission is open (Rule 8).
        const urlBefore = page.url();
        await mySub.viewButton(row).click();
        await mySub.expectWorkflowOpen();
        expect(page.url()).toContain(`workflowSubmissionId=${submissionId}`);

        // Close it — the list is back at the exact address it left.
        await mySub.closeWorkflow();
        await expect(row).toBeVisible();
        expect(page.url()).toBe(urlBefore);
    });

    test('S2: resume and clean up drafts', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // A scratch journal so the list and its badges hold only this test's
        // rows: two drafts and one submitted control.
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        const draftA = await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `drafta${tag}`, submitted: false,
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `draftb${tag}`, submitted: false,
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `subm${tag}`,
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // The "Incomplete submissions" view holds the two drafts (Rule 2);
        // each draft row wears the "Incomplete" stage bubble, offers
        // "Complete submission" and no "View" (Rule 6); the submitted row is
        // not listed here.
        await mySub.openView('Incomplete submissions');
        await mySub.expectViewHeading('Incomplete submissions', 2);
        for (const title of [`drafta${tag}`, `draftb${tag}`]) {
            const row = mySub.row(title);
            await expect(row).toBeVisible();
            await expect(row).toContainText('Incomplete');
            await expect(mySub.completeSubmissionButton(row)).toBeVisible();
            await expect(mySub.viewButton(row)).toHaveCount(0);
        }
        await expect(mySub.row(`subm${tag}`)).toHaveCount(0);

        // "Complete submission" reopens the submission wizard (Rule 6: it
        // resumes at the last step saved with "Save for Later"; these
        // API-seeded drafts carry no saved step, so only the wizard entry is
        // asserted — per fn-s2 a resume-position assertion would need
        // Save-for-Later seeding, done in the OPS S2 leg and U21 S3).
        await mySub.completeSubmissionButton(mySub.row(`drafta${tag}`)).click();
        const wizard = new SubmissionWizardPage(page, tag);
        await wizard.expectLoaded();
        expect(page.url()).toContain(`id=${draftA.submissionId}`);

        // Back on the list ("Active submissions" holds drafts and the
        // submitted row alike): enter the draft-deletion selection mode.
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 3);
        await mySub.enterBulkDeleteSelection();

        // Checkboxes appear on draft rows only — the submitted row gets none
        // (positive control: both draft rows carry one) — and the delete
        // button stays disabled until something is selected (Rule 9).
        await expect(mySub.row(`drafta${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`draftb${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`subm${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(mySub.bulkDeleteButton()).toBeDisabled();

        // Tick the other draft and delete it through the confirm dialog.
        await mySub.checkRowCheckbox(mySub.row(`draftb${tag}`));
        await expect(mySub.bulkDeleteButton()).toBeEnabled();
        await mySub.bulkDeleteButton().click();
        const dialog = mySub.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            'Are you sure you want to delete the selected items? This action cannot be undone.'
        );
        await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();

        // The draft is gone and the heading and sidebar counts drop in place
        // — no reload (Rule 10).
        await expect(mySub.row(`draftb${tag}`)).toHaveCount(0, {timeout: 30_000});
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await mySub.expectViewHeading('Active submissions', 2);
        await mySub.expectViewCount('Incomplete submissions', 1);
    });

    test('S3: browse the views and search', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        // A throwaway author (minted via a helper context) whose submissions
        // are seeded in publicknowledge — the per-author list scopes every
        // count, and the seeded issues feed the OJS "Scheduled for
        // publication" view (Rule 7d).
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag: `${tag}h`,
            users: [
                {username: author, givenName: 'Vera', familyName: 'Views', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        const toProduction = ['skipExternalReview', 'sendToProduction'];
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `puba${tag}`,
            decisions: toProduction, published: true,
            issue: {volume: 1, number: 2, year: 2014},
        });
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `pubb${tag}`,
            decisions: toProduction, published: true,
            issue: {volume: 1, number: 2, year: 2014},
        });
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `sched${tag}`,
            decisions: toProduction, published: true,
            issue: {volume: 2, number: 1, year: 2015},
        });
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `decl${tag}`,
            decisions: ['initialDecline'],
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, JOURNAL);
        await mySub.goto();

        // Walk the sidebar's view entries: each opens the list under that
        // view's heading with its count, and the badges carry the same
        // numbers (Rules 1–2).
        const expectedCounts = [
            ['Active submissions', 0],
            ['Revisions requested', 0],
            ['Revisions submitted', 0],
            ['Incomplete submissions', 0],
            ['Scheduled for publication', 1],
            ['Published', 2],
            ['Declined', 1],
        ];
        for (const [name, count] of expectedCounts) {
            await mySub.expectViewCount(name, count);
        }

        // A view holding nothing shows "No Items".
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 0);
        await expect(page.getByText('No Items')).toBeVisible();

        // The issue-scheduled submission sits under "Scheduled for
        // publication" with its activity line naming the issue (Rule 7d —
        // OJS-specific feeder).
        await mySub.openView('Scheduled for publication');
        await mySub.expectViewHeading('Scheduled for publication', 1);
        const schedRow = mySub.row(`sched${tag}`);
        await expect(schedRow).toBeVisible();
        await expect(schedRow).toContainText('Scheduled');
        await expect(schedRow).toContainText('To be published in issue Vol. 2 No. 1 (2015)');

        // The published submissions under "Published".
        await mySub.openView('Published');
        await mySub.expectViewHeading('Published', 2);
        await expect(mySub.row(`puba${tag}`)).toBeVisible();
        await expect(mySub.row(`pubb${tag}`)).toBeVisible();

        // The declined one under "Declined", with its "Declined" stage
        // bubble.
        await mySub.openView('Declined');
        await mySub.expectViewHeading('Declined', 1);
        const declRow = mySub.row(`decl${tag}`);
        await expect(declRow).toBeVisible();
        await expect(declRow).toContainText('Declined');

        // Search narrows the current view to the typed title; the heading
        // keeps the view's name and count (Rule 5).
        await mySub.openView('Published');
        await mySub.searchFor(`puba${tag}`);
        await expect(mySub.row(`puba${tag}`)).toBeVisible({timeout: 30_000});
        await expect(mySub.row(`pubb${tag}`)).toHaveCount(0);
        await mySub.expectViewHeading('Published', 1);
    });

    test('S4: act on a revision request', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        // A scratch journal (badge moves need a list only this test feeds)
        // with a throwaway author and reviewer; the submission's review
        // round 1 has revisions requested and one assigned reviewer.
        const author = `${tag}au`;
        const reviewer = `${tag}rv`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
                {username: reviewer, givenName: 'Rex', familyName: 'Reviewer', email: `${reviewer}@mail.test`, roles: ['externalReviewer']},
            ],
        });
        await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            title: `Submission ${tag}`,
            decisions: ['sendExternalReview', 'requestRevisions'],
            reviewRounds: [{reviewers: [{username: reviewer, status: 'accepted'}]}],
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // The submission lists under "Revisions requested"; its activity
        // cell reads "Revision requested" with "Submit revisions" (Rule 7a).
        await mySub.expectViewCount('Revisions requested', 1);
        await mySub.expectViewCount('Revisions submitted', 0);
        await mySub.openView('Revisions requested');
        const row = mySub.row(`Submission ${tag}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Revision requested');
        await expect(mySub.submitRevisionsButton(row)).toBeVisible();

        // "Submit revisions" opens the three-step upload dialog directly
        // (Upload File → Review Details → Confirm); the shared helper walks
        // the same wizard the review stage opens.
        await mySub.submitRevisionsButton(row).click();
        await uploadViaWizard(page);

        // Back on the list without a reload: the submission now sits under
        // "Revisions submitted", the sidebar badges have moved with it, and
        // its activity cell shows the review progress counter (Rule 10;
        // scenario 4 — the counter itself is register ❓ A1, asserted here as
        // the spec's current text).
        await mySub.expectViewCount('Revisions requested', 0);
        await mySub.expectViewCount('Revisions submitted', 1);
        await mySub.openView('Revisions submitted');
        const rowAfter = mySub.row(`Submission ${tag}`);
        await expect(rowAfter).toBeVisible();
        await expect(rowAfter).toContainText('Review update 0/1');
        await expect(mySub.submitRevisionsButton(rowAfter)).toHaveCount(0);
        await expect(rowAfter.getByText('Revision requested')).toHaveCount(0);
    });
});
