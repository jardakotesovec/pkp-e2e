// @ts-check
/**
 * @file playwright/tests/U22-my-submissions.spec.js
 *
 * My Submissions (author dashboard) — OMP suite, one test per canonical
 * scenario the spec runs on a press (common scenarios 1–3 + scenario 4,
 * OJS/OMP-only) in OMP vocabulary (press, monograph, series — glossary
 * substitution), plus the OMP-specific internal-review-round variant of
 * Rule 7a that the spec marks (fn-g: the internal stage drives the same
 * "Revision requested" cell and the upload lands in the internal round) as
 * S5. OJS's issue-scheduling feeder for "Scheduled for publication" (Rule
 * 7d) has no press analogue; the view is only ever seen empty here
 * (register ❓ A3) and serves as scenario 3's sanctioned empty-view check
 * (footnote s3) — nothing is asserted about WHY it is empty.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A1 ❓: S4/S5 assert the post-upload "Review update 0/1" cell exactly as
 *   scenario 4 states it — the register's question is whether the counter
 *   SHOULD be author-visible; if that ruling reverses, the spec and these
 *   assertions move together. The Rule 7b avatar row (open-review
 *   reviewers) is not a canonical scenario and is not asserted.
 * - A2 ❓: S3 declines its monograph from the Submission stage (footnote
 *   s3), so the declined row's activity cell stays clear of the counter;
 *   what a declined-during-review row shows is open and asserted neither
 *   way.
 * - A3 ❓: no test asserts that nothing CAN feed the press's "Scheduled for
 *   publication" view — S3 only uses the view, empty after its own seeding,
 *   as the "No Items" control.
 * - OPS1/OPS2: other apps' territory (OPS suite).
 * - Rule 3's landing-precedence combinations (Author+Reviewer,
 *   Author+Series Editor), the old author-dashboard link forward, and the
 *   access-denied page for a roleless account typing the address are not
 *   canonical scenarios of this spec. S1 exercises the landing rule through
 *   the retired submissions address (an author-only account forwards to My
 *   Submissions). Rule 3's journal-vs-site login split (the sign-in landing
 *   is context-login behavior; the site login page lands on the site index
 *   on a multi-press install) is likewise not asserted: the auth fixture
 *   signs in once on the site login page purely to cache cookies, asserting
 *   nothing about where sign-in lands.
 * - Rule 5's Filters panel is Submissions dashboard machinery; only the
 *   search box is scenario'd here.
 * - Rule 7c (copyediting counter) and Rule 9's grayed-out menu state /
 *   Cancel path have no canonical scenario; not asserted.
 * - OMP offers no internal-stage resubmit decision (spec fn-g), so S5
 *   drives only the revisions-requested round state.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S2–S5 isolate on scratch presses with throwaway users
 * (sidebar badge counts need a list only the test controls); S1 rides
 * publicknowledge read-only as author.alex. The list itself sends no mail
 * (spec Side effects), so there are no Mailpit assertions. Waits are
 * event-based (auto-wait on rows, headings and badges) — no hard-coded
 * sleeps. Everything runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');
const {expectWizardOpen} = require('../pages/SubmissionWizardPages.js');
const {completeStandaloneUploadWizard} = require('../pages/ReviewStagePages.js');

const PRESS = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u22${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('my submissions', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: track and open a monograph', {tag: '@smoke'}, async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s1', testInfo);
        // Title deliberately avoids the word "Submission" so the stage
        // bubble's label can be asserted from the row text unambiguously.
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PRESS,
            submitter: 'author.alex',
            title: `arta${tag}`,
        });

        // An author-only account lands on My Submissions, "Active
        // submissions" view (Rule 3 — exercised through the retired
        // submission-list address, which forwards the same way).
        const page = await (await asUser('author.alex')).newPage();
        await page.goto(`/index.php/${PRESS}/submissions`);
        await page.waitForURL((url) => url.pathname.includes('/dashboard/mySubmissions'), {
            waitUntil: 'commit',
        });
        const mySub = new MySubmissionsPage(page, PRESS);
        await mySub.expectViewHeading('Active submissions');

        // The row shows the monograph's ID, the authors-and-title line, and
        // the current stage in a bubble (Rule 4).
        const row = await mySub.findRowByTag(tag);
        await expect(row).toContainText(String(submissionId));
        await expect(row).toContainText(`arta${tag}`);
        await expect(row).toContainText('Author');
        // The current stage in a bubble: a fresh submitted monograph sits
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

    test('S2: resume and clean up drafts', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s2', testInfo);
        // A scratch press so the list and its badges hold only this test's
        // rows: two drafts and one submitted control.
        const author = `${tag}au`;
        await ompApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        const draftA = await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `drafta${tag}`, submitted: false,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `draftb${tag}`, submitted: false,
        });
        await ompApi.createSubmission({
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
        await expectWizardOpen(page);
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

    test('S3: browse the views and search', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s3', testInfo);
        // A scratch press with a throwaway author holding two published
        // monographs and one declined from the Submission stage (footnote
        // s3 — declining pre-review keeps the activity cell clear of A2's
        // counter). No press route feeds "Scheduled for publication" (❓
        // A3), so that view is this test's empty-view control.
        const author = `${tag}au`;
        await ompApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Vera', familyName: 'Views', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        const toProduction = ['skipExternalReview', 'sendToProduction'];
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `puba${tag}`,
            decisions: toProduction, published: true,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `pubb${tag}`,
            decisions: toProduction, published: true,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `decl${tag}`,
            decisions: ['initialDecline'],
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // Walk the sidebar's view entries: the press author gets the same
        // seven views as a journal author (Rule 2), each opening the list
        // under that view's heading with its count, badges carrying the
        // same numbers (Rules 1–2).
        const expectedCounts = [
            ['Active submissions', 0],
            ['Revisions requested', 0],
            ['Revisions submitted', 0],
            ['Incomplete submissions', 0],
            ['Scheduled for publication', 0],
            ['Published', 2],
            ['Declined', 1],
        ];
        for (const [name, count] of expectedCounts) {
            await mySub.expectViewCount(name, count);
        }

        // A view holding nothing shows "No Items" (footnote s3: the
        // empty-view check uses whichever view holds nothing after seeding).
        await mySub.openView('Scheduled for publication');
        await mySub.expectViewHeading('Scheduled for publication', 0);
        await expect(page.getByText('No Items')).toBeVisible();

        // The published monographs under "Published".
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

    test('S4: act on a revision request', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s4', testInfo);
        // A scratch press (badge moves need a list only this test feeds)
        // with a throwaway author and external reviewer; the monograph's
        // External Review round 1 has revisions requested and one assigned
        // reviewer (skip-internal entry).
        const author = `${tag}au`;
        const reviewer = `${tag}rv`;
        await ompApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
                {username: reviewer, givenName: 'Rex', familyName: 'Reviewer', email: `${reviewer}@mail.test`, roles: ['externalReviewer']},
            ],
        });
        await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            title: `Monograph ${tag}`,
            decisions: ['skipInternalReview', 'requestRevisions'],
            reviewRounds: [{stage: 'external', reviewers: [{username: reviewer, status: 'accepted'}]}],
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // The monograph lists under "Revisions requested"; its stage bubble
        // names the external round and its activity cell reads "Revision
        // requested" with "Submit revisions" (Rules 4, 7a).
        await mySub.expectViewCount('Revisions requested', 1);
        await mySub.expectViewCount('Revisions submitted', 0);
        await mySub.openView('Revisions requested');
        const row = mySub.row(`Monograph ${tag}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('External Review (Round 1)');
        await expect(row).toContainText('Revision requested');
        await expect(mySub.submitRevisionsButton(row)).toBeVisible();

        // "Submit revisions" opens the three-step upload dialog directly
        // (Upload File → Review Details → Confirm); the app-local helper
        // walks the same wizard the review stage opens.
        await mySub.submitRevisionsButton(row).click();
        await completeStandaloneUploadWizard(page, `rev-${tag}.txt`);

        // Back on the list without a reload: the monograph now sits under
        // "Revisions submitted", the sidebar badges have moved with it, and
        // its activity cell shows the review progress counter (Rule 10;
        // scenario 4 — the counter itself is register ❓ A1, asserted here as
        // the spec's current text).
        await mySub.expectViewCount('Revisions requested', 0);
        await mySub.expectViewCount('Revisions submitted', 1);
        await mySub.openView('Revisions submitted');
        const rowAfter = mySub.row(`Monograph ${tag}`);
        await expect(rowAfter).toBeVisible();
        await expect(rowAfter).toContainText('Review update 0/1');
        await expect(mySub.submitRevisionsButton(rowAfter)).toHaveCount(0);
        await expect(rowAfter.getByText('Revision requested')).toHaveCount(0);
    });

    test('S5: act on an internal-review revision request', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s5', testInfo);
        // OMP-specific variant of scenario 4 (spec Rule 7a "internal or
        // external"; fn-g): the SAME cell and flow while the Internal
        // Review round awaits the author's revisions. A scratch press with
        // a throwaway author and internal reviewer.
        const author = `${tag}au`;
        const reviewer = `${tag}rv`;
        await ompApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Ida', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
                {username: reviewer, givenName: 'Ira', familyName: 'Reviewer', email: `${reviewer}@mail.test`, roles: ['internalReviewer']},
            ],
        });
        await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            title: `Monograph ${tag}`,
            decisions: ['sendInternalReview', 'requestRevisionsInternal'],
            reviewRounds: [{stage: 'internal', reviewers: [{username: reviewer, status: 'accepted'}]}],
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // The internal round drives the same views and cell as the external
        // one: listed under "Revisions requested", stage bubble naming the
        // internal round, "Revision requested" + "Submit revisions".
        await mySub.expectViewCount('Revisions requested', 1);
        await mySub.expectViewCount('Revisions submitted', 0);
        await mySub.openView('Revisions requested');
        const row = mySub.row(`Monograph ${tag}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Internal Review (Round 1)');
        await expect(row).toContainText('Revision requested');
        await expect(mySub.submitRevisionsButton(row)).toBeVisible();

        // Upload through the same three-step dialog.
        await mySub.submitRevisionsButton(row).click();
        await completeStandaloneUploadWizard(page, `rev-${tag}.txt`);

        // Delivered: "Revisions submitted" with the review progress counter,
        // badges moved in place (Rule 10; counter text is ❓ A1, asserted as
        // the spec's current text).
        await mySub.expectViewCount('Revisions requested', 0);
        await mySub.expectViewCount('Revisions submitted', 1);
        await mySub.openView('Revisions submitted');
        const rowAfter = mySub.row(`Monograph ${tag}`);
        await expect(rowAfter).toBeVisible();
        await expect(rowAfter).toContainText('Review update 0/1');
        await expect(mySub.submitRevisionsButton(rowAfter)).toHaveCount(0);
        await expect(rowAfter.getByText('Revision requested')).toHaveCount(0);
    });
});
