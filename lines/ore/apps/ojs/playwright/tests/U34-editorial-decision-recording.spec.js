// @ts-check
/**
 * @file playwright/tests/U34-editorial-decision-recording.spec.js
 *
 * Editorial decision recording — OJS suite, one test per canonical scenario
 * the spec runs on a journal: the eight common scenarios (1–8, {OJS OMP})
 * and scenario 10 ({OJS} "Request Payment"); scenario 9 is {OPS} and 11
 * {OMP}. The wizard is one lib/pkp page on the three apps, so the {OJS}
 * exclusivity of the fee page needs no cross-app control here: the OMP and
 * OPS suites assert their own rosters (Rule 2's table, Settings bullet 5).
 * Spec: docs/specs/U34-editorial-decision-recording.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A6 🐞 ("Revert Decline" typed on a never-declined submission): S7 presses
 *   the button on a declined submission only.
 * - A9 🐞 (a Section Editor's "Find Template" refused): S2 searches as the
 *   Editor, whose search works.
 * - OJS1 🐞 ("Waive" requests the fee): S10 reads that "Waive" is offered and
 *   records with "Request publication fee" chosen; nothing presses "Waive".
 * - OMP1 🐞, OPS2 🐞, OPS1 ✅: other apps' territory.
 * - A1 ❓ ("New Review Round" heading), A2 ❓ (the wizard with no page), A11 ❓
 *   (a past round's number): nothing opens those wizards.
 * - A4 ❓ (the recommendation's discussion lists the deciding editor, not its
 *   writer): S5 reads the Editor as the participant and the Section Editor
 *   as "Created by" / "Message from", as the scenario states; nothing asserts
 *   who should be listed.
 * - A5 ❓ (author notices no screen shows): nothing reads them.
 * - A7 ❓ (the emptied "To:" refused by the banner alone): S6 reads the banner
 *   and "View Error" opening the page; the box's "None" and the missing
 *   message are not asserted.
 * - A8 ❓ ("Insert Content" rows as raw markup): S2 reads the title row and
 *   the row count; the signature row's text is not asserted.
 * - A10 ❓ (the "Email Templates" snippet after the language switch): S8
 *   reads the French subject and letter; the snippet's language is not
 *   asserted.
 *
 * Two transient states the scenarios name are not asserted, since no settled
 * read can hold them: the upload window's progress bar (S2 reads the file's
 * name and "Remove" that follow it) and the greyed letter while a template
 * loads (S2, S7 read the subject and letter that replace it). "Searching" is
 * read through a wait armed before the Enter press.
 *
 * Seeding: scenario endpoints only; `publicknowledge` and the seeded roster
 * are read-only (A1, A7). S1, S2 and S4 run on the seeded journal with
 * scratch submissions (footnote s1: `author.alex` in ART auto-assigns
 * `editor.diana`); S3, S5, S6, S7, S8 and S10 run on scratch journals with
 * throwaway accounts because each reads a mailbox (A8: every read scoped by
 * a throwaway address, every silence bounded by a message that did arrive)
 * or needs a setting at its non-default end (`review` passthrough keys, the
 * form languages). States with no seed key are built on screen before the
 * scenario's first step, as footnote s1 says: a submission file and a
 * revision through the panels' "Upload", a Library file through "Library" ›
 * "Add a file", a reviewer's file through the reviewer wizard of a reviewer
 * seeded `accepted`, a confirmed review through "Read Review" › "Mark as
 * Complete", the recommend-only flag through the Participants row's "Edit",
 * a contributor without an account through "Contributors" › "Add
 * Contributor", an edited template and an alternative through Manage
 * Emails, the "Notify All Authors" choice and the payments set-up through
 * their settings screens (`apps/ojs/playwright/pages/DecisionSettingsPages.js`).
 * Tags are unique per run (M5); waits are web-first (A5). Everything runs
 * in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {TasksPanel} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {ReviewWizardPage} = require('../../../../shared/playwright/pages/ReviewerPages.js');
const {ContributorsPanel} = require('../pages/ContributorPages.js');
const {
    WorkflowPage,
    FIXTURE_PDF,
    FIXTURE_PDF_NAME,
    inMemoryFile,
    openReviewDetails,
    markReviewComplete,
    closeReviewDetails,
} = require('../pages/ReviewStagePages.js');
const {CopyeditingStagePage, DRAFT_FILES} = require('../pages/CopyeditingStagePages.js');
const {
    DecisionWizardPage,
    ComposerPage,
    CANCEL_DIALOG,
    CANCEL_QUESTION,
    MINIMUM_DIALOG,
    MINIMUM_QUESTION,
    WRONG_STAGE,
    REVIEW_FILES_WINDOW,
    SUBMISSION_FILES_WINDOW,
    LIBRARY_FILES_WINDOW,
    REQUIRED_STRING,
    INVALID_EMAIL,
} = require('../pages/DecisionWizardPages.js');
const {ManageEmailsPage, WorkflowEmailsSettingsPage, PaymentsSetupPage} = require('../pages/DecisionSettingsPages.js');

const JOURNAL = 'publicknowledge';
const JOURNAL_NAME = 'Journal of Public Knowledge';
const EDITOR = 'editor.diana';
const EDITOR_NAME = 'Diana Editor';
const AUTHOR = 'author.alex';
const AUTHOR_NAME = 'Alex Author';

/** Footnote s1's decision numbers. */
const DECISION_ACCEPT = 2;
const DECISION_SEND_TO_PRODUCTION = 7;
const DECISION_DECLINE = 8;
const DECISION_RECOMMEND_ACCEPT = 9;

/** The refusals a typed address answers (Actors row 4; Rule 12). */
const NO_ROLE_ACCESS = 'The current role does not have access to this operation.';
const NOT_ASSIGNED = 'You must be assigned to this submission in order to record an editorial decision.';
const NO_PERMISSION = 'You do not have permission to record this decision on this submission.';

/** The sentences under the headings (Rule 11's table). */
const SENTENCE = {
    accept: 'This submission will be accepted for publication and sent for copyediting.',
    declineSubmission:
        'This submission will be declined for publication. No further review will be conducted and the submission will be archived.',
    requestRevisions: 'The author must provide revisions before this submission will be accepted for publication.',
    resubmit:
        'The author must provide revisions that will be sent for another round of review before this submission will be accepted for publication.',
    cancelRound:
        'Cancel the current round of review and send the submission back to the last round of review. If this is the first review round, it will be moved to the submission stage.',
    recommendAccept: 'Recommend that this submission be accepted for publication and sent for copyediting.',
    recommendDecline: 'Recommend that the submission be declined for publication.',
};

/** The "Notify Editors" page's guidance (Rule 13). */
const NOTIFY_EDITORS_GUIDANCE =
    'Send a message to the deciding editors to let them know the recommendation. Explain why this recommendation was made in response to the recommendations and comments submitted by reviewers.';

/** The templates' names and default subjects (Side effects' table). */
const SUBJECT = {
    accepted: (journal) => `Your submission has been accepted to ${journal}`,
    declined: 'Your submission has been declined',
    reverted: 'We have reversed the decision to decline your submission',
    revisions: 'Your submission has been reviewed and we encourage you to submit revisions',
    resubmit: 'Your submission has been reviewed - please revise and resubmit',
    sentForReview: 'Your submission has been sent for review',
    copyediting: 'Your submission has been sent for copyediting',
    thankYou: 'Thank you for your review',
    reviewCancelled: (title) => `Your review for "${title}" has been cancelled`,
    recommendation: 'Editor Recommendation',
    paymentRequest: 'Payment Request Notification',
};

/** The "Attach Files" sources (Rule 6). */
const REVIEW_SOURCES = ['Upload File', 'Review Files', 'Submission Files', 'Library Files'];
const SUBMISSION_SOURCES = ['Upload File', 'Submission Files', 'Library Files'];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u34${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/** A roster or throwaway account's address. */
const mailOf = (username) => `${username}@mail.test`;

/** A page as a given user with the OJS workflow page object and the wizard and composer readers. */
async function workflowAs(asUser, username, contextPath) {
    const context = await asUser(username);
    const page = await context.newPage();
    const workflow = new WorkflowPage(page, contextPath);
    return {context, page, workflow, frame: workflow.frame, wizard: new DecisionWizardPage(page), composer: new ComposerPage(page)};
}

/** Seed a submission on a journal (Submission stage unless `decisions` say otherwise). */
async function seedSubmission(ojsApi, tag, {context = JOURNAL, submitter = AUTHOR, title = `Submission ${tag}`, ...rest} = {}) {
    return await ojsApi.createSubmission({tag, context, submitter, title, ...rest});
}

/** Seed a submission on its first external review round with these reviewers. */
async function seedInReview(ojsApi, tag, {reviewers = [], reviewRounds = null, ...rest} = {}) {
    return await seedSubmission(ojsApi, tag, {
        decisions: ['sendExternalReview'],
        reviewRounds: reviewRounds || [{reviewers}],
        ...rest,
    });
}

/** The round id of a seed's first round (the wizard address's `reviewRoundId`). */
const roundIdOf = (seeded, index = 0) => seeded.reviewRounds[index].id;

/** The scratch reviewer's wizard: the accepted seed's step 1, step 2, step 3 with a file, then "Submit Review". */
async function reviewWithFile(page, contextPath, submissionId, fileName) {
    const wizard = new ReviewWizardPage(page, contextPath);
    await wizard.goto(submissionId);
    await wizard.expectStep(1);
    if (await wizard.privacyBox.count()) {
        await wizard.privacyBox.check();
    }
    await wizard.saveAndContinueButton.click();
    await wizard.expectStep(2);
    await wizard.continueToStep3Button.click();
    await wizard.expectStep(3);
    await wizard.uploadReviewerFile(fileName);
    await wizard.chooseRecommendation('Accept Submission');
    await wizard.submitReview();
    await wizard.expectCompleted();
}

/** The editor's "Read Review" › "Mark as Complete" on a reviewer's row; the row then reads "Complete". */
async function confirmReview(page, workflow, reviewerName) {
    const row = workflow.reviewerRow(reviewerName);
    const modal = await openReviewDetails(page, row);
    await markReviewComplete(page, modal);
    await closeReviewDetails(page, modal);
    await page.reload();
    await workflow.expectOpen();
    await expect(workflow.reviewerRow(reviewerName)).toContainText('Complete', {timeout: 30_000});
}

/** Add a contributor without an account through the "Contributors" page's "Add Contributor". */
async function addContributor(page, frame, {given, family, email}) {
    await frame.selectPage('Contributors');
    const panel = new ContributorsPanel(page);
    const dialog = await panel.openAdd();
    // "Country" is required on the form (U41), so it is filled with the rest.
    await panel.fillPerson(dialog, {given, family, email, country: 'Canada'});
    await panel.tickRole(dialog, 'Author');
    await panel.savePanel(dialog);
    await expect(panel.row(given)).toBeVisible({timeout: 30_000});
}

test.describe('editorial decision recording (U34)', () => {
    test('S1: accept a submission through the wizard', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
        const title = `Submission ${tag}`;
        // Given: the Editor auto-assigned to a submission on its first review
        // round with two reviews submitted and no reviewer file; the one
        // revision is uploaded on screen below (footnote s1). A second
        // submission on a round with one invited reviewer.
        const seeded = await seedInReview(ojsApi, tag, {
            reviewers: [
                {username: 'reviewer.julia', status: 'completed'},
                {username: 'reviewer.paul', status: 'completed'},
            ],
        });
        const control = await seedInReview(ojsApi, `${tag}c`, {reviewers: [{username: 'reviewer.julia'}]});

        const {page, workflow, frame, wizard, composer} = await workflowAs(asUser, EDITOR, JOURNAL);
        await workflow.gotoEditorial(seeded.submissionId);
        await workflow.expectPageTitle('Review (Round 1)');
        await workflow.uploadRevision(FIXTURE_PDF);
        await page.reload();
        await workflow.expectOpen();
        await expect(workflow.reviewerRow('Julia Reviewer')).toContainText('Review Submitted');
        await expect(workflow.reviewerRow('Paul Reviewer')).toContainText('Review Submitted');

        // ── The page and the rail ────────────────────────────────────────
        // "Accept Submission": a full page headed "Accept Submission: Notify
        // Authors" with the sentence under it; the rail "1 Notify Authors"
        // numbered, "2 Notify Reviewers" and "3 Select Files" plain text ("3
        // Select Files" ignores a click); the breadcrumb Dashboard › the
        // submission › "Accept Submission" (Rule 1).
        await frame.actionButton('Accept Submission').click();
        await wizard.expectTitle('Accept Submission: Notify Authors');
        await expect(wizard.pageDescription()).toHaveText(SENTENCE.accept);
        await wizard.expectSteps(['Notify Authors', 'Notify Reviewers', 'Select Files']);
        await wizard.expectStepCurrent('Notify Authors', 1);
        await wizard.expectStepUnreached('Notify Reviewers', 2);
        await wizard.expectStepUnreached('Select Files', 3);
        await wizard.stepPlain('Select Files').click();
        await wizard.expectTitle('Accept Submission: Notify Authors');
        const crumbs = await wizard.breadcrumbTexts();
        expect(crumbs).toHaveLength(3);
        expect(crumbs[0]).toBe('Dashboard');
        expect(crumbs[1]).toMatch(new RegExp(`^Author, ${title.slice(0, 40)}`));
        expect(crumbs[2]).toBe('Accept Submission');

        // ── "Notify Authors" ─────────────────────────────────────────────
        // "To" holds the Author as a chip with no remove control;
        // "Subject:" the accept subject; the letter opens "Dear Alex
        // Author," with its placeholders as values; "Email Templates" lists
        // "Submission Accepted" with the first 70 characters of its text
        // (Rules 3, 4, 5; Fields; Side effects).
        await wizard.awaitComposerLoaded();
        await composer.expectRecipients([AUTHOR_NAME]);
        await composer.expectRecipientsFixed();
        await expect(composer.subjectInput()).toHaveValue(SUBJECT.accepted(JOURNAL_NAME), {timeout: 30_000});
        expect(await composer.firstParagraphText()).toBe(`Dear ${AUTHOR_NAME},`);
        expect(await composer.letterText()).toContain(JOURNAL_NAME);
        expect(await composer.letterText()).not.toContain('{$');
        await composer.expectTemplates(['Submission Accepted']);
        const snippet = (await composer.templateSnippet('Submission Accepted').innerText()).trim();
        expect(snippet).toMatch(/^Dear \{\$recipientName\},/);
        expect(snippet.length).toBeLessThanOrEqual(73);
        expect(snippet.endsWith('...')).toBe(true);

        // ── "Skip this email" and back ───────────────────────────────────
        // "Skip this email": the wizard moves to "Notify Reviewers" at
        // once and the rail's "Notify Authors" shows a check in place of
        // its "1" and is a button; press it: the skipped notice with "Don't
        // skip this email"; press the link: the default letter is back
        // (Rules 1, 3).
        await wizard.skipEmail();
        await wizard.expectTitle('Accept Submission: Notify Reviewers');
        await wizard.expectStepCompleted('Notify Authors');
        await wizard.stepButton('Notify Authors').click();
        await wizard.expectTitle('Accept Submission: Notify Authors');
        await expect(wizard.skippedNotice()).toBeVisible({timeout: 30_000});
        await expect(wizard.dontSkipButton()).toBeVisible();
        await expect(composer.subjectInput()).toHaveCount(0);
        await wizard.unskipEmail();
        await expect(composer.subjectInput()).toHaveValue(SUBJECT.accepted(JOURNAL_NAME), {timeout: 30_000});
        expect(await composer.firstParagraphText()).toBe(`Dear ${AUTHOR_NAME},`);

        // ── "Notify Reviewers" ───────────────────────────────────────────
        // "Continue": "To" lists both reviewers as chips, each with a
        // remove control; the letter keeps "{$recipientName}" on screen as
        // a token; "Email Templates" lists "Notify Reviewers of Decision"
        // (Rule 4; Side effects).
        await wizard.continueStep();
        await wizard.expectTitle('Accept Submission: Notify Reviewers');
        await wizard.awaitComposerLoaded();
        await composer.expectRecipients(['Julia Reviewer', 'Paul Reviewer']);
        await expect(composer.chipRemoveButton('Julia Reviewer')).toBeVisible();
        await expect(composer.chipRemoveButton('Paul Reviewer')).toBeVisible();
        expect(await composer.letterText()).toMatch(/\{\$recipientName\}/i);
        await composer.expectTemplates(['Notify Reviewers of Decision']);

        // ── "Previous" and the rail's buttons ────────────────────────────
        // "Previous": "Notify Authors" again with its letter; the rail's
        // "Notify Reviewers": that page again, nothing checked on the way
        // (no banner) (Rules 1, 10).
        await wizard.previous();
        await wizard.expectTitle('Accept Submission: Notify Authors');
        await expect(composer.subjectInput()).toHaveValue(SUBJECT.accepted(JOURNAL_NAME), {timeout: 30_000});
        await wizard.stepButton('Notify Reviewers').click();
        await wizard.expectTitle('Accept Submission: Notify Reviewers');
        await expect(wizard.errorBanners()).toHaveCount(0);

        // ── "Attach Files" on a review decision ──────────────────────────
        // The window with the four panels; "Attach Review Files": "No items
        // found." and "Back", no reviewer having uploaded a file; "Back",
        // then "Upload File", a PDF and the window's "Attach Files": both
        // windows close and the chip sits under the message; its cross
        // removes it (Rule 6).
        await composer.openAttachWindow();
        await composer.expectAttachSources(REVIEW_SOURCES);
        const reviewFiles = await composer.openAttachSource('Attach Review Files', REVIEW_FILES_WINDOW);
        await expect(reviewFiles.getByText('No items found.')).toBeVisible({timeout: 30_000});
        await expect(composer.sourceCheckboxes(reviewFiles)).toHaveCount(0);
        await composer.back(reviewFiles);
        await composer.expectAttachSources(REVIEW_SOURCES);
        await composer.uploadAndAttach(FIXTURE_PDF, FIXTURE_PDF_NAME);
        await expect(composer.attachmentChips()).toHaveCount(1);
        await composer.removeAttachment(FIXTURE_PDF_NAME);
        await expect(composer.attachmentChips()).toHaveCount(0);

        // ── "Select Files" ───────────────────────────────────────────────
        // "Continue": the heading "Accept Submission: Select Files" with the
        // sentence; the panel "Select Files" with "Select files that should
        // be sent to the copyediting stage." and the list "Revisions"
        // holding the revision, ticked, with its type, uploader, date and
        // "Download" (Rules 2, 9).
        await wizard.continueStep();
        await wizard.expectTitle('Accept Submission: Select Files');
        await expect(wizard.pageDescription()).toHaveText(SENTENCE.accept);
        await expect(wizard.stepHeading('Select Files')).toBeVisible({timeout: 30_000});
        await expect(wizard.stepDescription()).toHaveText('Select files that should be sent to the copyediting stage.');
        await expect.poll(() => wizard.filesListTitles(), {timeout: 30_000}).toEqual(['Revisions']);
        const revisionRow = wizard.fileRow('Revisions', FIXTURE_PDF_NAME);
        await expect(revisionRow).toHaveCount(1);
        await expect(wizard.promoteFileCheckbox(FIXTURE_PDF_NAME)).toBeChecked();
        await expect(revisionRow).toContainText('Article Text');
        // The uploader line names the account by username (T-ojs-2).
        await expect(revisionRow).toContainText(new RegExp(`Uploaded by ${EDITOR} on \\d{4}-\\d{2}-\\d{2}`));
        await expect(revisionRow.getByRole('link', {name: 'Download'})).toBeVisible();

        // ── "Record Decision" ────────────────────────────────────────────
        // The window "Submission Accepted" with its sentence and its one
        // control, "View Submission Summary", back to the workflow page
        // (Rule 11).
        const done = await wizard.recordDecision('Submission Accepted');
        await expect(done).toContainText(
            `The submission, ${title}, has been accepted for publication and sent to the copyediting stage. All notifications have been sent, except any you chose to skip.`
        );
        await expect(done.getByRole('link', {name: 'View Submission Summary', exact: true})).toBeVisible();
        await expect(done.getByRole('link')).toHaveCount(1);
        await expect(done.getByRole('button')).toHaveCount(0);
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(seeded.submissionId);
        await frame.expectStage('Copyediting');

        // ── After the decision ───────────────────────────────────────────
        // The Activity Log's two lines; on the round each reviewer's row
        // reads "Reviewer Thanked" with "Revert Decision" (Side effects).
        await frame.openActivityLog();
        await expect(
            frame.activityLogRow(`${EDITOR_NAME} accepted this submission and sent it to the copyediting stage.`)
        ).toHaveCount(1, {timeout: 30_000});
        await expect(
            frame.activityLogRow(`An email about the decision was sent to 2 reviewer(s) with the subject ${SUBJECT.thankYou}.`)
        ).toHaveCount(1);
        await frame.closeActivityLog();
        await page.reload();
        await workflow.expectOpen();
        await frame.selectRound(1);
        for (const name of ['Julia Reviewer', 'Paul Reviewer']) {
            const row = workflow.reviewerRow(name);
            await expect(row).toContainText('Reviewer Thanked', {timeout: 30_000});
            await expect(row).not.toContainText('Review Submitted');
            await expect(row.getByRole('button', {name: 'Revert Decision', exact: true})).toBeVisible();
        }

        // ── Control ──────────────────────────────────────────────────────
        // The second submission's "Accept Submission": the rail "1 Notify
        // Authors", "2 Select Files" and no "Notify Reviewers" page, its
        // round holding no submitted review (Rule 2).
        await workflow.gotoEditorial(control.submissionId);
        await frame.actionButton('Accept Submission').click();
        await wizard.expectTitle('Accept Submission: Notify Authors');
        await wizard.expectSteps(['Notify Authors', 'Select Files']);
        await expect(wizard.stepItem('Notify Reviewers')).toHaveCount(0);
        await wizard.expectStepUnreached('Select Files', 2);
    });

    test('S2: the composer: "Insert Content", "Attach Files", the templates and the refusals', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        const title = `Submission ${tag}`;
        // Given: the Editor auto-assigned to a submission at the Submission stage.
        const seeded = await seedSubmission(ojsApi, tag);

        const {page, workflow, frame, wizard, composer} = await workflowAs(asUser, EDITOR, JOURNAL);
        await workflow.gotoEditorial(seeded.submissionId);
        await workflow.expectPageTitle('Submission');

        // ── The one-page wizard ──────────────────────────────────────────
        // "Decline Submission": the page headed "Decline Submission" alone,
        // its sentence, the rail "1 Notify Authors"; "Email Templates"
        // lists "Submission Declined (Pre-Review)" (Rules 1, 11; Side effects).
        await frame.actionButton('Decline Submission').click();
        await wizard.expectTitle('Decline Submission');
        await expect(wizard.pageDescription()).toHaveText(SENTENCE.declineSubmission);
        await wizard.expectSteps(['Notify Authors']);
        await wizard.expectStepCurrent('Notify Authors', 1);
        await wizard.awaitComposerLoaded();
        await composer.expectTemplates(['Submission Declined (Pre-Review)']);
        await expect(composer.subjectInput()).toHaveValue(SUBJECT.declined, {timeout: 30_000});
        expect(await composer.firstParagraphText()).toBe(`Dear ${AUTHOR_NAME},`);

        // ── "Insert Content" ─────────────────────────────────────────────
        // With the cursor at the end of the first line, the window lists
        // every value with a description and an "Insert" button (the
        // signature row's markup is A8 ❓, not asserted); "title" typed in
        // "Search" keeps the matching rows, the submission's title among
        // them; its "Insert": the title stands at the cursor (Rule 5).
        await composer.placeCursorAtEndOfFirstParagraph();
        await composer.openInsertWindow();
        const rowCount = await composer.insertRows().count();
        expect(rowCount).toBeGreaterThan(5);
        await expect(composer.insertRows().locator('.insertContent__item__description')).toHaveCount(rowCount);
        await expect(composer.insertRows().getByRole('button', {name: 'Insert', exact: true})).toHaveCount(rowCount);
        await expect(composer.insertRowValue("The latest published version of the submission's title")).toHaveText(title);
        // The box commits on Enter like every pkp Search box (typing alone
        // leaves the list whole: finding T-ojs-1, .reports/U34/test-ojs-findings.md).
        await composer.searchInsert('title');
        await expect.poll(() => composer.insertRows().count(), {timeout: 30_000}).toBeLessThan(rowCount);
        const kept = await composer.insertRows().allInnerTexts();
        expect(kept.length).toBeGreaterThan(0);
        for (const text of kept) {
            expect(text.toLowerCase()).toContain('title');
        }
        await expect(composer.insertRowValue("The latest published version of the submission's title")).toHaveText(title);
        await composer.insertValue("The latest published version of the submission's title");
        await expect.poll(() => composer.firstParagraphText(), {timeout: 30_000}).toBe(`Dear ${AUTHOR_NAME},${title}`);

        // ── "Attach Files" › "Upload File" ───────────────────────────────
        // The window with "Upload File", "Submission Files" and "Library
        // Files" and no "Review Files"; "Upload File": the drop zone, "Add
        // Files" and a greyed "Attach Files", "Back"; a PDF added: its name
        // with "Remove"; "Attach Files": both windows close, the chip with
        // its cross; the cross: gone (Rule 6; Fields).
        await composer.openAttachWindow();
        await composer.expectAttachSources(SUBMISSION_SOURCES);
        await expect(composer.attachSourceButton('Attach Review Files')).toHaveCount(0);
        await expect(composer.attachSource('Upload File')).toContainText('Upload a file from your computer.');
        await composer.attachSourceButton('Upload File').click();
        const upload = composer.uploadWindow();
        await expect(upload).toBeVisible({timeout: 30_000});
        await expect(upload).toContainText('Drag and drop files here');
        await expect(upload).toContainText('Or upload a file');
        await expect(upload.getByRole('button', {name: 'Add Files', exact: true})).toBeVisible();
        await expect(upload.getByRole('button', {name: 'Attach Files', exact: true})).toBeDisabled();
        await expect(upload.getByRole('button', {name: 'Back', exact: true})).toBeVisible();
        await upload.locator('input[type="file"]').setInputFiles(FIXTURE_PDF);
        await expect(upload).toContainText(FIXTURE_PDF_NAME, {timeout: 30_000});
        await expect(upload.getByRole('button', {name: `Remove ${FIXTURE_PDF_NAME}`})).toBeVisible({timeout: 30_000});
        await expect(upload.getByRole('button', {name: 'Attach Files', exact: true})).toBeEnabled({timeout: 30_000});
        await upload.getByRole('button', {name: 'Attach Files', exact: true}).click();
        await expect(upload).toBeHidden({timeout: 30_000});
        await expect(composer.attachWindow()).toBeHidden({timeout: 30_000});
        await expect(composer.attachmentChip(FIXTURE_PDF_NAME)).toBeVisible({timeout: 30_000});
        await expect(composer.attachmentChips()).toHaveCount(1);
        await expect(composer.attachmentRemoveButton(FIXTURE_PDF_NAME)).toBeVisible();
        await composer.removeAttachment(FIXTURE_PDF_NAME);
        await expect(composer.attachmentChips()).toHaveCount(0);

        // ── "Add CC/BCC" ─────────────────────────────────────────────────
        // The link is replaced by two empty boxes "CC:" and "BCC:"; a word
        // that is not an address typed in "CC:" (Fields).
        await composer.addCcBcc();
        await expect(composer.ccInput()).toHaveValue('');
        await expect(composer.bccInput()).toHaveValue('');
        await expect(composer.root().locator('label[for$="-cc"]')).toHaveText('CC:');
        await expect(composer.root().locator('label[for$="-bcc"]')).toHaveText('BCC:');
        await composer.ccInput().fill('not.an.address');

        // ── "Subject:" emptied ───────────────────────────────────────────
        // "Record Decision": the banner "There was a problem with the
        // Notify Authors step." with "View Error", which opens the page;
        // the two messages under "Subject:" and "CC:"; nothing recorded
        // (Rule 10; Fields).
        await composer.subjectInput().fill('');
        await wizard.recordRefused('Notify Authors');
        await expect(wizard.viewErrorButton('Notify Authors')).toBeVisible();
        await wizard.viewErrorButton('Notify Authors').click();
        await wizard.expectTitle('Decline Submission');
        await expect(composer.subjectError()).toHaveText(REQUIRED_STRING, {timeout: 30_000});
        await expect(composer.ccError()).toHaveText(INVALID_EMAIL);
        await expect(composer.fieldErrors()).toHaveCount(2);
        await expect(wizard.completionDialog('Submission Declined')).toHaveCount(0);

        // ── "Find Template" ──────────────────────────────────────────────
        // "CC:" cleared; "Sent to Review" typed in "Find Template": the
        // list reads "Searching", then the results, "Sent to Review" among
        // them; pressed: "Subject:" reads that template's subject and the
        // message holds its text, the title inserted earlier gone (Rule 7;
        // Fields).
        await composer.ccInput().fill('');
        const searching = page.waitForSelector('.composer__templates__searching', {state: 'attached', timeout: 30_000});
        await composer.searchTemplates('Sent to Review');
        await searching;
        await expect(composer.templateButton('Sent to Review')).toBeVisible({timeout: 30_000});
        await expect(composer.searchingNotice()).toHaveCount(0, {timeout: 30_000});
        await composer.loadTemplate('Sent to Review');
        await expect(composer.subjectInput()).toHaveValue(SUBJECT.sentForReview, {timeout: 30_000});
        await expect.poll(() => composer.firstParagraphText(), {timeout: 30_000}).toBe(`Dear ${AUTHOR_NAME},`);
        expect(await composer.letterText()).not.toContain(`${AUTHOR_NAME},${title}`);
        expect(await composer.letterText()).toMatch(/review/i);

        // ── "Record Decision" ────────────────────────────────────────────
        // The window "Submission Declined" with its sentence; "View
        // Submission Summary" returns to the workflow page (Rule 11).
        const done = await wizard.recordDecision('Submission Declined');
        await expect(done).toContainText(
            `The submission, ${title}, has been declined and sent to the archives. All notifications have been sent, except any you chose to skip.`
        );
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(seeded.submissionId);
        await frame.expectStage('Declined');

        // ── The Activity Log and the control ─────────────────────────────
        // "{editor} declined this submission." and "An email has been sent:
        // Your submission has been sent for review", the loaded template's
        // subject; one decision line and one email line, not two: the
        // refused press recorded and sent nothing (Rule 7, 10; Side effects).
        await frame.openActivityLog();
        await expect(frame.activityLogRow(`${EDITOR_NAME} declined this submission.`)).toHaveCount(1, {timeout: 30_000});
        await expect(frame.activityLogRow(`An email has been sent: ${SUBJECT.sentForReview}`)).toHaveCount(1);
        await expect(frame.activityLogRow('declined this submission')).toHaveCount(1);
        // The seed's own rows ("You have been assigned as an editor…", "Thank
        // you for your submission…") predate the decision: the decision's
        // email lines are those carrying a decline or the loaded subject.
        await expect(frame.activityLogRow(/An email has been sent: Your submission has been (declined|sent for review)/)).toHaveCount(1);
        await expect(frame.activityLogRow(`An email has been sent: ${SUBJECT.declined}`)).toHaveCount(0);
        await frame.closeActivityLog();
    });

    test("S3: request revisions with a reviewer's file attached", async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s3', testInfo);
        const editor = `${tag}ed`;
        const author = `${tag}au`;
        const rv1 = `${tag}r1`;
        const rv2 = `${tag}r2`;
        const EDITOR_DISPLAY = 'Erin Editor';
        const AUTHOR_DISPLAY = 'Ava Author';
        const RV1_DISPLAY = 'Rita Reviewer';
        const RV2_DISPLAY = 'Rae Reviewer';
        const reviewerFile = `${tag}review.txt`;
        const libraryName = `Library ${tag}`;
        // Given: a scratch journal whose default review type is Open; the
        // first submission's round with rv1 and rv2 accepted (rv1 reviews
        // with a file on screen and the Editor confirms it), the second
        // submission of the same Author with rv2's review submitted
        // (footnote s1).
        await ojsApi.createContext({
            tag,
            context: {name: `Journal ${tag}`},
            review: {defaultReviewMode: 'open'},
            users: [
                user(editor, 'Erin', 'Editor', ['editor']),
                user(author, 'Ava', 'Author', ['author']),
                user(rv1, 'Rita', 'Reviewer', ['externalReviewer']),
                user(rv2, 'Rae', 'Reviewer', ['externalReviewer']),
            ],
        });
        const first = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            title: `First ${tag}`,
            reviewers: [
                {username: rv1, status: 'accepted'},
                {username: rv2, status: 'accepted'},
            ],
            participants: [{username: editor, role: 'editor'}],
        });
        const second = await seedInReview(ojsApi, `${tag}b`, {
            context: tag,
            submitter: author,
            title: `Second ${tag}`,
            reviewers: [{username: rv2, status: 'completed'}],
            participants: [{username: editor, role: 'editor'}],
        });
        const firstTitle = `First ${tag}`;
        const secondTitle = `Second ${tag}`;
        expect(await pkpMail.count({to: mailOf(author)})).toBe(0);

        const rv1Page = await (await asUser(rv1)).newPage();
        await reviewWithFile(rv1Page, tag, first.submissionId, reviewerFile);

        const {page, workflow, frame, wizard, composer} = await workflowAs(asUser, editor, tag);
        await workflow.gotoEditorial(first.submissionId);
        await workflow.expectPageTitle('Review (Round 1)');
        await confirmReview(page, workflow, RV1_DISPLAY);
        await workflow.addLibraryFile({name: libraryName, file: FIXTURE_PDF});
        await page.reload();
        await workflow.expectOpen();

        // ── The choice window ────────────────────────────────────────────
        // "Request Revisions": the side window "Request Revisions" with
        // "Require New Review Round": the no-new-round option preselected,
        // the other, and "Next"; "Next": the wizard "Request Revisions:
        // Notify Authors" with its sentence and the rail "1 Notify Authors",
        // "2 Notify Reviewers" (Rules 1, 2, 14; Fields).
        const choice = await workflow.openRequestRevisionsWindow();
        await expect(choice).toContainText('Require New Review Round');
        await expect(workflow.revisionOption(choice, 'Revisions will not be subject to a new round of peer reviews.')).toBeChecked();
        await expect(workflow.revisionOption(choice, 'Revisions will be subject to a new round of peer reviews.')).not.toBeChecked();
        await expect(choice.getByRole('radio')).toHaveCount(2);
        await workflow.pressNext(choice);
        await wizard.expectTitle('Request Revisions: Notify Authors');
        await expect(wizard.pageDescription()).toHaveText(SENTENCE.requestRevisions);
        await wizard.expectSteps(['Notify Authors', 'Notify Reviewers']);
        await wizard.awaitComposerLoaded();

        // ── "Review Files" ───────────────────────────────────────────────
        // "Attach Files" › "Attach Review Files": one row "{reviewer} —
        // {file}" with a tick box and a greyed "Attach Selected"; ticked
        // and attached: both windows close and the chip sits under the
        // message (Rule 6).
        await composer.openAttachWindow();
        await composer.expectAttachSources(REVIEW_SOURCES);
        const reviewFiles = await composer.openAttachSource('Attach Review Files', REVIEW_FILES_WINDOW);
        await expect(composer.sourceCheckboxes(reviewFiles)).toHaveCount(1);
        await expect(reviewFiles).toContainText(`${RV1_DISPLAY} — ${reviewerFile}`);
        await expect(composer.attachSelectedButton(reviewFiles)).toBeDisabled();
        await composer.attachSelected(reviewFiles, reviewerFile, reviewerFile);
        await expect(composer.attachmentChips()).toHaveCount(1);

        // ── "Submission Files" and "Other Files" ─────────────────────────
        // "Attach Submission Files": the sentence, the group "Revisions"
        // first and an "Other Files" dropdown to switch to "Review Files";
        // "Back": the four panels again (Rule 6).
        await composer.openAttachWindow();
        await expect(composer.attachSource('Submission Files')).toContainText(
            'Attach files uploaded during the submission workflow, such as revisions or files to be reviewed.'
        );
        const submissionFiles = await composer.openAttachSource('Attach Submission Files', SUBMISSION_FILES_WINDOW);
        await expect(submissionFiles.getByRole('heading', {name: 'Revisions', exact: true, level: 2})).toBeVisible({timeout: 30_000});
        expect(await composer.otherFilesGroups(submissionFiles)).toEqual(['Revisions', 'Review Files']);
        await composer.closeOtherFiles(submissionFiles);
        await composer.back(submissionFiles);
        await composer.expectAttachSources(REVIEW_SOURCES);

        // ── "Library Files" ──────────────────────────────────────────────
        // "Attach Library Files": one row with the file's name, its type,
        // "Download" and a tick box; ticked and attached: a second chip
        // (Rule 6).
        const libraryFiles = await composer.openAttachSource('Attach Library Files', LIBRARY_FILES_WINDOW);
        await expect(composer.sourceCheckboxes(libraryFiles)).toHaveCount(1);
        await expect(libraryFiles).toContainText(libraryName);
        await expect(libraryFiles).toContainText('Marketing');
        await expect(libraryFiles.getByRole('link', {name: 'Download'})).toHaveCount(1);
        await composer.sourceCheckbox(libraryFiles, libraryName).check({force: true});
        await expect(composer.attachSelectedButton(libraryFiles)).toBeEnabled({timeout: 30_000});
        await composer.attachSelectedButton(libraryFiles).click();
        await expect(libraryFiles).toBeHidden({timeout: 30_000});
        await expect(composer.attachWindow()).toBeHidden({timeout: 30_000});
        await expect(composer.attachmentChips()).toHaveCount(2, {timeout: 30_000});

        // ── "Notify Reviewers" and the recording ─────────────────────────
        // "Continue": "To" lists the reviewer whose review is complete
        // alone; "Record Decision": the window "Revisions Requested" with
        // its sentence (Rules 4, 11).
        await wizard.continueStep();
        await wizard.expectTitle('Request Revisions: Notify Reviewers');
        await wizard.awaitComposerLoaded();
        await composer.expectRecipients([RV1_DISPLAY]);
        const done = await wizard.recordDecision('Revisions Requested');
        await expect(done).toContainText(
            `Revisions for the submission, ${firstTitle}, have been requested. All notifications have been sent, except any you chose to skip.`
        );
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(first.submissionId);

        // ── The Author's mailbox ─────────────────────────────────────────
        // The revisions subject from the Editor's name and address, both
        // files attached (Side effects).
        const revisionsMail = await pkpMail.find({to: mailOf(author), subject: SUBJECT.revisions, contains: firstTitle});
        expect(revisionsMail.From).toEqual({Name: EDITOR_DISPLAY, Address: mailOf(editor)});
        const revisionsFull = await pkpMail.fullMessage(revisionsMail.ID);
        const attached = (revisionsFull.Attachments || []).map((a) => a.FileName);
        expect(attached).toHaveLength(2);
        expect(attached).toContain(reviewerFile);

        // ── The Author's workflow ────────────────────────────────────────
        // The review stage's "Notifications" list lists the email; the
        // header's Tasks panel reads "Revision required." linking to the
        // submission; the "Read Review" window of the completed review
        // lists the reviewer's file under "Reviewer Files" (Rule 6; Side
        // effects).
        const authorSide = await workflowAs(asUser, author, tag);
        await authorSide.workflow.gotoAuthor(first.submissionId);
        await authorSide.workflow.expectPageTitle('Review (Round 1)');
        await expect(authorSide.workflow.notificationsHeading()).toBeVisible({timeout: 30_000});
        await expect(authorSide.workflow.notificationItem(SUBJECT.revisions)).toHaveCount(1, {timeout: 30_000});
        const readReview = await authorSide.workflow.openAuthorReadReview(RV1_DISPLAY);
        await expect(readReview).toContainText('Reviewer Files');
        await expect(readReview.getByRole('row').filter({hasText: reviewerFile})).toBeVisible({timeout: 30_000});
        await readReview.getByRole('button', {name: 'Close'}).first().click();
        await expect(readReview).toHaveCount(0, {timeout: 30_000});
        await authorSide.page.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        const tasks = new TasksPanel(authorSide.page);
        await tasks.open();
        const revisionTask = tasks.row('Revision required.').filter({hasText: firstTitle});
        await expect(revisionTask).toHaveCount(1);
        // The row's link marks the task read and forwards to the submission.
        await tasks.openTask(revisionTask);
        await authorSide.page.waitForURL((u) => u.searchParams.get('workflowSubmissionId') === String(first.submissionId), {
            waitUntil: 'commit',
            timeout: 30_000,
        });
        await authorSide.frame.expectOpen(first.submissionId);

        // ── The Activity Log ─────────────────────────────────────────────
        await frame.openActivityLog();
        await expect(frame.activityLogRow(`${EDITOR_DISPLAY} requested revisions for this submission.`)).toHaveCount(1, {
            timeout: 30_000,
        });
        await expect(
            frame.activityLogRow(`An email about the decision was sent to 1 reviewer(s) with the subject ${SUBJECT.thankYou}.`)
        ).toHaveCount(1);
        await frame.closeActivityLog();

        // ── Control ──────────────────────────────────────────────────────
        // The reviewer who has not yet reviewed the first submission was
        // not listed on its "Notify Reviewers" page (read above) and
        // receives no email about it, while the other reviewer's "Thank
        // you for your review" arrives (Rules 2, 4; Side effects). Read
        // before the second submission's decision, whose reviewer is rv2.
        const thanks = await pkpMail.find({to: mailOf(rv1), subject: SUBJECT.thankYou, contains: firstTitle});
        expect(thanks.From).toEqual({Name: EDITOR_DISPLAY, Address: mailOf(editor)});
        await pkpMail.expectNone({
            to: mailOf(rv2),
            subject: SUBJECT.thankYou,
            afterControl: {to: mailOf(rv1), subject: SUBJECT.thankYou, contains: firstTitle},
        });
        expect(await pkpMail.count({to: mailOf(rv2)})).toBe(0);

        // ── "Resubmit for Review" on the second submission ───────────────
        // The second option and "Next": the wizard "Resubmit for Review:
        // Notify Authors" with its sentence; recorded: the window's resubmit
        // sentence; the Author's mailbox holds the resubmit subject and
        // their Tasks panel now also reads "Resubmit for review." (Rules
        // 11, 14; Side effects). Its round's one reviewer, rv2, is the
        // submitted review the page lists.
        await workflow.gotoEditorial(second.submissionId);
        await workflow.expectPageTitle('Review (Round 1)');
        const choice2 = await workflow.openRequestRevisionsWindow();
        await workflow.revisionOption(choice2, 'Revisions will be subject to a new round of peer reviews.').check();
        await workflow.pressNext(choice2);
        await wizard.expectTitle('Resubmit for Review: Notify Authors');
        await expect(wizard.pageDescription()).toHaveText(SENTENCE.resubmit);
        await wizard.expectSteps(['Notify Authors', 'Notify Reviewers']);
        await wizard.continueStep();
        await wizard.expectTitle('Resubmit for Review: Notify Reviewers');
        await wizard.awaitComposerLoaded();
        await composer.expectRecipients([RV2_DISPLAY]);
        const done2 = await wizard.recordDecision('Revisions Requested');
        await expect(done2).toContainText(
            `Revisions for the submission, ${secondTitle}, have been requested. A decision to send the revisions for another round of reviews was recorded. All notifications have been sent, except any you chose to skip.`
        );
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(second.submissionId);
        const resubmitMail = await pkpMail.find({to: mailOf(author), subject: SUBJECT.resubmit, contains: secondTitle});
        expect(resubmitMail.From.Address).toBe(mailOf(editor));
        await authorSide.page.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        await tasks.open();
        await expect(tasks.row('Resubmit for review.').filter({hasText: secondTitle})).toHaveCount(1);
        await expect(tasks.row('Revision required.').filter({hasText: firstTitle})).toHaveCount(1);
        await tasks.close();
    });

    test('S4: the wizard refuses the wrong hands, the wrong stage and a stale page', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        // Given: the Editor auto-assigned to a submission at the Submission
        // stage; the Copyeditor, the Author, a Section Editor of another
        // section and the Journal Manager on the seeded journal (footnote s1).
        const seeded = await seedSubmission(ojsApi, tag);
        const declineUrl = DecisionWizardPage.recordUrl(JOURNAL, seeded.submissionId, DECISION_DECLINE);
        const productionUrl = DecisionWizardPage.recordUrl(JOURNAL, seeded.submissionId, DECISION_SEND_TO_PRODUCTION);

        // ── The Copyeditor, the Author and the unassigned Section Editor by address ──
        // Each types the "Decline Submission" address the Editor's button
        // opens: the access-denied page with its sentence (Actors row 4).
        for (const [username, message] of [
            ['copyeditor.carla', NO_ROLE_ACCESS],
            [AUTHOR, NO_ROLE_ACCESS],
            ['sectioneditor.ravi', NOT_ASSIGNED],
        ]) {
            const other = await workflowAs(asUser, username, JOURNAL);
            await other.frame.expectAccessDeniedPage(declineUrl, message);
        }

        // ── A decision of another stage ──────────────────────────────────
        // The Editor opens the submission's "Send To Production" address, a
        // Copyediting-stage decision: the access-denied page with the
        // wrong-stage sentence (Rule 12).
        const editor = await workflowAs(asUser, EDITOR, JOURNAL);
        await editor.frame.expectAccessDeniedPage(productionUrl, WRONG_STAGE);

        // ── A wizard left open ───────────────────────────────────────────
        // The Editor presses "Decline Submission": the wizard opens at the
        // address that refused the others (the Control); stay on it (Rule 1).
        await editor.workflow.gotoEditorial(seeded.submissionId);
        await editor.frame.actionButton('Decline Submission').click();
        await editor.wizard.expectTitle('Decline Submission');
        await editor.wizard.awaitComposerLoaded();
        const opened = new URL(editor.page.url());
        // The bilingual seeded journal prefixes its addresses with the locale (patterns.md lesson 9).
        expect(opened.pathname).toMatch(new RegExp(`^/index.php/${JOURNAL}(/en)?/decision/record/${seeded.submissionId}$`));
        expect(opened.searchParams.get('decision')).toBe(String(DECISION_DECLINE));

        // ── The Journal Manager, not assigned ────────────────────────────
        // In a session of their own the Manager opens the same submission,
        // presses "Send for Review" and records it, no assignment needed
        // (Actors row 1).
        const manager = await workflowAs(asUser, 'manager.maya', JOURNAL);
        await manager.workflow.gotoEditorial(seeded.submissionId);
        await expect(manager.frame.participantsHeading()).toBeVisible({timeout: 30_000});
        await manager.frame.actionButton('Send for Review').click();
        await manager.wizard.expectTitle('Send for Review: Notify Authors');
        await manager.wizard.continueStep();
        await expect(manager.wizard.stepHeading('Select Files')).toBeVisible({timeout: 30_000});
        const sent = await manager.wizard.recordDecision('Sent for Review');
        await expect(sent).toContainText(`The submission, Submission ${tag}, has been sent to the review stage.`);
        await manager.wizard.viewSubmissionSummary();
        await manager.frame.expectOpen(seeded.submissionId);
        await manager.frame.expectStage('Review (Round 1)');

        // ── "Record Decision" on the stale wizard ────────────────────────
        // The Editor presses "Record Decision": the error window with the
        // wrong-stage sentence; the page reloaded: the access-denied page
        // with the same sentence (Rules 10, 12).
        const errorDialog = await editor.wizard.recordRefusedStale();
        await expect(errorDialog.getByRole('button', {name: 'OK', exact: true})).toBeVisible();
        await editor.page.reload();
        await expect(editor.frame.accessDeniedText(WRONG_STAGE)).toBeVisible({timeout: 30_000});
        await expect(editor.page).toHaveURL(/authorizationDenied/);
        await editor.frame.expectClosed();
    });

    test('S5: record a recommendation, then change it', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s5', testInfo);
        const editor = `${tag}ed`;
        const sectionEditor = `${tag}se`;
        const author = `${tag}au`;
        const reviewer = `${tag}rv`;
        const EDITOR_DISPLAY = 'Erin Editor';
        const SE_DISPLAY = 'Selma Section';
        // Given: a scratch journal; the first submission with the Editor and
        // the Section Editor assigned to its round with one review
        // submitted; the second with the Section Editor alone; the
        // recommend-only flag set on screen on both (footnote s1).
        await ojsApi.createContext({
            tag,
            context: {name: `Journal ${tag}`},
            users: [
                user(editor, 'Erin', 'Editor', ['editor']),
                user(sectionEditor, 'Selma', 'Section', ['sectionEditor']),
                user(author, 'Ava', 'Author', ['author']),
                user(reviewer, 'Rita', 'Reviewer', ['externalReviewer']),
            ],
        });
        const first = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            title: `First ${tag}`,
            reviewers: [{username: reviewer, status: 'completed'}],
            participants: [
                {username: editor, role: 'editor'},
                {username: sectionEditor, role: 'sectionEditor'},
            ],
        });
        const second = await seedInReview(ojsApi, `${tag}b`, {
            context: tag,
            submitter: author,
            title: `Second ${tag}`,
            participants: [{username: sectionEditor, role: 'sectionEditor'}],
        });
        expect(await pkpMail.count({to: mailOf(editor)})).toBe(0);

        const ed = await workflowAs(asUser, editor, tag);
        for (const id of [first.submissionId, second.submissionId]) {
            await ed.workflow.gotoEditorial(id);
            await ed.workflow.setRecommendOnly(SE_DISPLAY);
            await ed.page.reload();
            await ed.workflow.expectOpen();
            await expect(ed.workflow.participantRow(SE_DISPLAY)).toContainText('Only allowed to recommend an editorial decision');
        }

        // ── The recommendation wizard ────────────────────────────────────
        // "Recommend Accept": a page headed "Recommend Accept" alone with its
        // sentence; the panel "Notify Editors" with its guidance; "To" holds
        // the Editor as a fixed chip; "Email Templates" lists
        // "Recommendation Made", whose letter names the recommendation; no
        // "Skip this email" (Rules 1, 11, 13; Actors rows 5, 6).
        const se = await workflowAs(asUser, sectionEditor, tag);
        await se.workflow.gotoEditorial(first.submissionId);
        await se.workflow.expectPageTitle('Review (Round 1)');
        await se.workflow.expectDecisionButtons(['Recommend Revisions', 'Recommend Accept', 'Recommend Decline']);
        await se.frame.actionButton('Recommend Accept').click();
        await se.wizard.expectTitle('Recommend Accept');
        await expect(se.wizard.pageDescription()).toHaveText(SENTENCE.recommendAccept);
        await se.wizard.expectSteps(['Notify Editors']);
        await expect(se.wizard.stepHeading('Notify Editors')).toBeVisible({timeout: 30_000});
        await expect(se.wizard.stepDescription()).toHaveText(NOTIFY_EDITORS_GUIDANCE);
        await se.wizard.awaitComposerLoaded();
        await se.composer.expectRecipients([EDITOR_DISPLAY]);
        await se.composer.expectRecipientsFixed();
        await se.composer.expectTemplates(['Recommendation Made']);
        expect(await se.composer.letterText()).toContain('My recommendation is: Accept Submission.');
        await se.wizard.expectFooter(['Cancel', 'Record Decision']);
        await expect(se.wizard.skipButton()).toHaveCount(0);

        // ── "Record Decision" ────────────────────────────────────────────
        // The window "Recommendation Submitted" with its sentence; back on
        // the round the "Recommendation" box reads "Accept Submission" with
        // "Change decision", the submission still on its round (Rules 11, 13).
        const done = await se.wizard.recordDecision('Recommendation Submitted');
        await expect(done).toContainText('Your recommendation has been recorded and the deciding editor(s) have been notified.');
        await se.wizard.viewSubmissionSummary();
        await se.frame.expectOpen(first.submissionId);
        await se.frame.expectStage('Review (Round 1)');
        await expect(se.workflow.recommendationBox()).toContainText('Accept Submission', {timeout: 30_000});
        await expect(se.workflow.changeDecisionButton()).toBeVisible();

        // ── The Editor's side ────────────────────────────────────────────
        // The round's "Recommendation" box lists it; the discussions panel
        // lists "Editor Recommendation" holding the letter, with the Editor
        // as its participant and the Section Editor only as "Created by"
        // (A4 ❓, read as the scenario states); the Editor's mailbox holds
        // "Editor Recommendation" from the Section Editor (Rule 13; Side
        // effects; Actors row 10).
        await ed.workflow.gotoEditorial(first.submissionId);
        await ed.workflow.expectPageTitle('Review (Round 1)');
        await expect(ed.workflow.recommendationBox()).toContainText('Accept Submission', {timeout: 30_000});
        await expect(ed.workflow.changeDecisionButton()).toHaveCount(0);
        const discussionRows = ed.workflow.discussionRow('Editor Recommendation');
        await expect(discussionRows).toHaveCount(1, {timeout: 30_000});
        await expect(discussionRows).toContainText(`Created by: ${sectionEditor}`);
        const discussion = await ed.workflow.openDiscussion(discussionRows.first(), 'Editor Recommendation');
        await expect(discussion).toContainText(EDITOR_DISPLAY);
        await expect(discussion).toContainText('My recommendation is: Accept Submission.');
        await expect(discussion).toContainText(`Message from ${sectionEditor}`);
        await expect(discussion.getByText(new RegExp(`^\\s*\\d+\\.\\s+${EDITOR_DISPLAY}`))).toHaveCount(1);
        await expect(discussion.getByText(new RegExp(`^\\s*\\d+\\.\\s+${SE_DISPLAY}`))).toHaveCount(0);
        await ed.workflow.closeDiscussion(discussion);
        const recommendationMail = await pkpMail.find({to: mailOf(editor), subject: SUBJECT.recommendation});
        expect(recommendationMail.From).toEqual({Name: SE_DISPLAY, Address: mailOf(sectionEditor)});

        // ── The Activity Log ─────────────────────────────────────────────
        await ed.frame.openActivityLog();
        await expect(
            ed.frame.activityLogRow(`${SE_DISPLAY} recommended that this submission be accepted and sent for copyediting.`)
        ).toHaveCount(1, {timeout: 30_000});
        await ed.frame.closeActivityLog();

        // ── "Change decision" ────────────────────────────────────────────
        // The three recommendation buttons are back; "Recommend Decline":
        // the page headed so with its sentence; recorded: the box on both
        // editors' rounds reads "Decline Submission" and the Editor's
        // panel lists a second "Editor Recommendation" (Rule 13).
        await se.workflow.gotoEditorial(first.submissionId);
        await se.workflow.changeDecisionButton().click();
        await se.workflow.expectDecisionButtons(['Recommend Revisions', 'Recommend Accept', 'Recommend Decline']);
        await se.frame.actionButton('Recommend Decline').click();
        await se.wizard.expectTitle('Recommend Decline');
        await expect(se.wizard.pageDescription()).toHaveText(SENTENCE.recommendDecline);
        await se.wizard.recordDecision('Recommendation Submitted');
        await se.wizard.viewSubmissionSummary();
        await se.frame.expectOpen(first.submissionId);
        await expect(se.workflow.recommendationBox()).toContainText('Decline Submission', {timeout: 30_000});
        await expect(se.workflow.recommendationBox()).not.toContainText('Accept Submission');
        await ed.workflow.gotoEditorial(first.submissionId);
        await expect(ed.workflow.recommendationBox()).toContainText('Decline Submission', {timeout: 30_000});
        await expect(ed.workflow.discussionRow('Editor Recommendation')).toHaveCount(2, {timeout: 30_000});

        // ── No deciding editor ───────────────────────────────────────────
        // The second submission's round: no recommendation button (the
        // Participants list is the positive read); its "Recommend Accept"
        // address: a bare "404 Not Found" page (Actors row 2; Rule 12).
        await se.workflow.gotoEditorial(second.submissionId);
        await se.workflow.expectPageTitle('Review (Round 1)');
        await expect(se.frame.participantsHeading()).toBeVisible({timeout: 30_000});
        await expect(se.frame.actionItems().getByRole('button', {name: /Recommend/})).toHaveCount(0);
        expect((await se.frame.actionButtonLabels()).filter((l) => /Recommend/.test(l))).toEqual([]);
        const response = await se.page.goto(
            DecisionWizardPage.recordUrl(tag, second.submissionId, DECISION_RECOMMEND_ACCEPT, roundIdOf(second))
        );
        expect(response?.status()).toBe(404);
        await expect(se.page.locator('body')).toHaveText(/404 Not Found/);

        // ── Control ──────────────────────────────────────────────────────
        // On the first submission the Section Editor's round offers no
        // "Accept Submission", "Request Revisions" or "Decline Submission"
        // (the exact recommendation list above), and the "Accept
        // Submission" address answers the access-denied page (Actors row
        // 4; Settings bullet 6).
        await se.workflow.gotoEditorial(first.submissionId);
        await se.workflow.changeDecisionButton().click();
        await se.workflow.expectDecisionButtons(['Recommend Revisions', 'Recommend Accept', 'Recommend Decline']);
        for (const label of ['Accept Submission', 'Request Revisions', 'Decline Submission']) {
            await expect(se.frame.actionButton(label)).toHaveCount(0);
        }
        await se.frame.expectAccessDeniedPage(
            DecisionWizardPage.recordUrl(tag, first.submissionId, DECISION_ACCEPT, roundIdOf(first)),
            NO_PERMISSION
        );
    });

    test('S6: accept with the reviewers notified, below and at the minimum', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s6', testInfo);
        const editor = `${tag}ed`;
        const author = `${tag}au`;
        const rv1 = `${tag}r1`;
        const rv2 = `${tag}r2`;
        const rv3 = `${tag}r3`;
        const EDITOR_DISPLAY = 'Erin Editor';
        const names = {[rv1]: 'Rita Reviewer', [rv2]: 'Rae Reviewer', [rv3]: 'Rob Reviewer'};
        // Given: a scratch journal whose "Minimum Confirmed Reviews Required"
        // is 2; three submissions: two reviews submitted and no file; two
        // reviews the Editor confirms on screen; a second round holding one
        // invited reviewer (footnote s1).
        await ojsApi.createContext({
            tag,
            context: {name: `Journal ${tag}`},
            review: {numReviewsPerSubmission: 2},
            users: [
                user(editor, 'Erin', 'Editor', ['editor']),
                user(author, 'Ava', 'Author', ['author']),
                user(rv1, 'Rita', 'Reviewer', ['externalReviewer']),
                user(rv2, 'Rae', 'Reviewer', ['externalReviewer']),
                user(rv3, 'Rob', 'Reviewer', ['externalReviewer']),
            ],
        });
        const two = [
            {username: rv1, status: 'completed'},
            {username: rv2, status: 'completed'},
        ];
        const participants = [{username: editor, role: 'editor'}];
        const first = await seedInReview(ojsApi, tag, {context: tag, submitter: author, title: `First ${tag}`, reviewers: two, participants});
        const second = await seedInReview(ojsApi, `${tag}b`, {context: tag, submitter: author, title: `Second ${tag}`, reviewers: two, participants});
        const third = await seedInReview(ojsApi, `${tag}c`, {
            context: tag,
            submitter: author,
            title: `Third ${tag}`,
            reviewRounds: [{reviewers: [{username: rv1, status: 'completed'}]}, {reviewers: [{username: rv3}]}],
            participants,
        });
        const firstTitle = `First ${tag}`;
        const thirdTitle = `Third ${tag}`;
        expect(await pkpMail.count({to: mailOf(rv3)})).toBe(0);

        const {page, workflow, frame, wizard, composer} = await workflowAs(asUser, editor, tag);
        await workflow.gotoEditorial(first.submissionId);
        await workflow.expectPageTitle('Review (Round 1)');
        await expect(workflow.statusLines('Round 1 Status').first()).toHaveText('Minimum number of confirmed reviews required: 2.');

        // ── Control ──────────────────────────────────────────────────────
        // "Decline Submission" on the first submission before its accept:
        // "Decline Submission: Notify Authors" at once though the round is
        // below the minimum; "Cancel" › "Cancel Decision" closes it with
        // nothing recorded (Rules 11, 15).
        await frame.actionButton('Decline Submission').click();
        await wizard.expectTitle('Decline Submission: Notify Authors');
        await expect(workflow.minimumReviewsDialog()).toHaveCount(0);
        await wizard.pressCancel();
        await wizard.confirmCancel();
        await frame.expectOpen(first.submissionId);
        await frame.expectStage('Review (Round 1)');
        await frame.openActivityLog();
        await expect(frame.activityLogRow('Submission').first()).toBeVisible({timeout: 30_000});
        await expect(frame.activityLogRow('declined this submission')).toHaveCount(0);
        await frame.closeActivityLog();

        // ── The warning ──────────────────────────────────────────────────
        // "Accept Submission": the dialog with its question, "Yes, Continue"
        // and "Cancel"; "Cancel": the round unchanged, no wizard; again and
        // "Yes, Continue": the wizard (Rule 15).
        const warning = await workflow.pressExpectingMinimumDialog('Accept Submission');
        await expect(warning).toContainText(MINIMUM_QUESTION);
        await expect(warning.getByRole('button', {name: 'Yes, Continue', exact: true})).toBeVisible();
        await expect(warning.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await workflow.answerMinimumDialog('Cancel');
        await frame.expectStage('Review (Round 1)');
        await expect(frame.actionButton('Accept Submission')).toBeVisible();
        await expect(wizard.heading()).toHaveCount(0);
        await workflow.pressExpectingMinimumDialog('Accept Submission');
        await workflow.answerMinimumDialog('Yes, Continue');
        await wizard.expectTitle('Accept Submission: Notify Authors');

        // ── "Notify Reviewers" emptied ───────────────────────────────────
        // Both chips removed; "Continue" (the "Select Files" page lists no
        // file) and "Record Decision": the banner for the Notify Reviewers
        // step with "View Error", which opens the page (the box's "None" and
        // the missing message are A7 ❓); the box offers the round's
        // reviewers back: both put back (Fields; Rule 10).
        await wizard.continueStep();
        await wizard.expectTitle('Accept Submission: Notify Reviewers');
        await wizard.awaitComposerLoaded();
        await composer.expectRecipients([names[rv1], names[rv2]]);
        await composer.removeRecipient(names[rv1]);
        await composer.removeRecipient(names[rv2]);
        await composer.expectRecipients([]);
        await wizard.continueStep();
        await wizard.expectTitle('Accept Submission: Select Files');
        await expect(wizard.stepHeading('Select Files')).toBeVisible({timeout: 30_000});
        await expect(wizard.promoteCheckboxes()).toHaveCount(0);
        await wizard.recordRefused('Notify Reviewers');
        await wizard.viewErrorButton('Notify Reviewers').click();
        await wizard.expectTitle('Accept Submission: Notify Reviewers');
        await composer.addRecipient(names[rv1]);
        await composer.addRecipient(names[rv2]);
        await composer.expectRecipients([names[rv1], names[rv2]]);

        // ── "Record Decision" with nothing ticked ────────────────────────
        // Back on "Select Files" (the last page carries "Record Decision"),
        // "Record Decision": "Submission Accepted"; nothing is copied: the
        // "Copyediting" entry's "Draft Files" list is empty (Rules 9, 11).
        await wizard.continueStep();
        await wizard.expectTitle('Accept Submission: Select Files');
        await wizard.recordDecision('Submission Accepted');
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(first.submissionId);
        await frame.expectStage('Copyediting');
        const copyediting = new CopyeditingStagePage(page, tag);
        await frame.selectStage('Copyediting');
        await expect(copyediting.table(DRAFT_FILES)).toBeVisible({timeout: 30_000});
        await expect(copyediting.noItems(DRAFT_FILES)).toBeVisible({timeout: 30_000});
        await expect(copyediting.fileRows(DRAFT_FILES)).toHaveCount(0);

        // ── The reviewers' side ──────────────────────────────────────────
        // Each reviewer's mailbox holds "Thank you for your review" from the
        // Editor, carrying that reviewer's own name and the accept sentence;
        // each row reads "Reviewer Thanked" with "Revert Decision"; the
        // Activity Log's line (Rule 4; Side effects).
        for (const username of [rv1, rv2]) {
            const thanks = await pkpMail.find({to: mailOf(username), subject: SUBJECT.thankYou, contains: firstTitle});
            expect(thanks.From).toEqual({Name: EDITOR_DISPLAY, Address: mailOf(editor)});
            const full = await pkpMail.fullMessage(thanks.ID);
            expect(full.Text).toContain(names[username]);
            expect(full.Text).toContain('We have chosen to accept this submission without revisions.');
        }
        await frame.selectRound(1);
        for (const username of [rv1, rv2]) {
            const row = workflow.reviewerRow(names[username]);
            await expect(row).toContainText('Reviewer Thanked', {timeout: 30_000});
            await expect(row.getByRole('button', {name: 'Revert Decision', exact: true})).toBeVisible();
        }
        await frame.openActivityLog();
        await expect(
            frame.activityLogRow(`An email about the decision was sent to 2 reviewer(s) with the subject ${SUBJECT.thankYou}.`)
        ).toHaveCount(1, {timeout: 30_000});
        await frame.closeActivityLog();

        // ── The minimum met ──────────────────────────────────────────────
        // The second submission's two reviews confirmed on screen; "Accept
        // Submission": the wizard at once, no dialog (Rule 15).
        await workflow.gotoEditorial(second.submissionId);
        await workflow.expectPageTitle('Review (Round 1)');
        await confirmReview(page, workflow, names[rv1]);
        await confirmReview(page, workflow, names[rv2]);
        await frame.actionButton('Accept Submission').click();
        await wizard.expectTitle('Accept Submission: Notify Authors');
        await expect(workflow.minimumReviewsDialog()).toHaveCount(0);

        // ── "Cancel" ─────────────────────────────────────────────────────
        // The footer's "Cancel": the dialog "Cancel Decision" with its
        // question, "Cancel Decision" and "Keep Working"; "Keep Working":
        // the wizard stays; "Cancel" again and "Cancel Decision": the
        // workflow page, the submission on its round and the Activity Log
        // without a decision line (Rule 11).
        await wizard.awaitComposerLoaded();
        const subjectBefore = await composer.subjectInput().inputValue();
        const cancelDialog = await wizard.pressCancel();
        await expect(cancelDialog).toContainText(CANCEL_QUESTION);
        await expect(cancelDialog.getByRole('button', {name: CANCEL_DIALOG, exact: true})).toBeVisible();
        await expect(cancelDialog.getByRole('button', {name: 'Keep Working', exact: true})).toBeVisible();
        await wizard.keepWorking();
        await wizard.expectTitle('Accept Submission: Notify Authors');
        await expect(composer.subjectInput()).toHaveValue(subjectBefore);
        await wizard.pressCancel();
        await wizard.confirmCancel();
        await frame.expectOpen(second.submissionId);
        await frame.expectStage('Review (Round 1)');
        await frame.openActivityLog();
        await expect(frame.activityLogRow('Submission').first()).toBeVisible({timeout: 30_000});
        await expect(frame.activityLogRow('accepted this submission')).toHaveCount(0);
        await frame.closeActivityLog();

        // ── "Cancel Review Round" ────────────────────────────────────────
        // On the third submission: no dialog asks; the wizard "Cancel Review
        // Round: Notify Authors" with its sentence and the rail "1 Notify
        // Authors", "2 Notify Reviewers", the second page listing the
        // invited reviewer; recorded: the window's title and sentence; the
        // invited reviewer's mailbox holds the cancel subject; the Activity
        // Log reads "{editor} cancelled the review round." (Rules 2, 11,
        // 15; Side effects).
        await workflow.gotoEditorial(third.submissionId);
        await workflow.expectPageTitle('Review (Round 2)');
        await frame.actionButton('Cancel Review Round').click();
        await wizard.expectTitle('Cancel Review Round: Notify Authors');
        await expect(workflow.minimumReviewsDialog()).toHaveCount(0);
        await expect(wizard.pageDescription()).toHaveText(SENTENCE.cancelRound);
        await wizard.expectSteps(['Notify Authors', 'Notify Reviewers']);
        await wizard.continueStep();
        await wizard.expectTitle('Cancel Review Round: Notify Reviewers');
        await wizard.awaitComposerLoaded();
        await composer.expectRecipients([names[rv3]]);
        const cancelled = await wizard.recordDecision('Cancelled the latest round of review.');
        await expect(cancelled).toContainText(
            `The review round for the submission, ${thirdTitle}, has been cancelled. All notifications have been sent, except any you chose to skip.`
        );
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(third.submissionId);
        // The subject carries quotes, which Mailpit's `subject:` query cannot
        // hold; the read is scoped by the recipient and the title instead.
        const cancelMail = await pkpMail.find({to: mailOf(rv3), contains: thirdTitle});
        expect(cancelMail.Subject).toBe(SUBJECT.reviewCancelled(thirdTitle));
        expect(cancelMail.From.Address).toBe(mailOf(editor));
        expect(await pkpMail.count({to: mailOf(rv3)})).toBe(1);
        await frame.openActivityLog();
        await expect(frame.activityLogRow(`${EDITOR_DISPLAY} cancelled the review round.`)).toHaveCount(1, {timeout: 30_000});
        await frame.closeActivityLog();
    });

    test("S7: decline: the author's email, the contributor's copy, then a skipped revert", async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s7', testInfo);
        const manager = `${tag}mg`;
        const editor = `${tag}ed`;
        const author = `${tag}au`;
        const contributorEmail = `${tag}co@mail.test`;
        const EDITOR_DISPLAY = 'Erin Editor';
        const AUTHOR_DISPLAY = 'Ava Author';
        const journalName = `Journal ${tag}`;
        const title = `Submission ${tag}`;
        const EDITED_LINE = 'This letter was edited for the test.';
        const MAILABLE = 'Submission Declined (Pre-Review)';
        const ALTERNATIVE = 'Decline, short form';
        // Given: a scratch journal whose decline template is edited and
        // given an alternative by the Manager on screen; the Editor assigned
        // to a Submission-stage submission with one file uploaded on screen,
        // whose Author has an account and whose Contributors list gains a
        // second contributor with an address and no account (footnote s1).
        await ojsApi.createContext({
            tag,
            context: {name: journalName},
            users: [
                user(manager, 'Mira', 'Manager', ['manager']),
                user(editor, 'Erin', 'Editor', ['editor']),
                user(author, 'Ava', 'Author', ['author']),
            ],
        });
        const seeded = await seedSubmission(ojsApi, tag, {
            context: tag,
            submitter: author,
            title,
            participants: [{username: editor, role: 'editor'}],
        });
        expect(await pkpMail.count({to: mailOf(author)})).toBe(0);
        expect(await pkpMail.count({to: contributorEmail})).toBe(0);

        const managerPage = await (await asUser(manager)).newPage();
        const emails = new ManageEmailsPage(managerPage, tag);
        await emails.goto();
        const mailable = await emails.openMailable(MAILABLE);
        await emails.prefixDefaultTemplateBody(mailable, MAILABLE, `<p>${EDITED_LINE}</p>`);
        await emails.addTemplate(mailable, {name: ALTERNATIVE, subject: 'A short decline', bodyHtml: '<p>A short decline for {$recipientName}.</p>'});
        await emails.closeMailable(mailable);

        const {page, workflow, frame, wizard, composer} = await workflowAs(asUser, editor, tag);
        await workflow.gotoEditorial(seeded.submissionId);
        await workflow.expectPageTitle('Submission');
        await workflow.uploadSubmissionFile(FIXTURE_PDF);
        await addContributor(page, frame, {given: 'Cleo', family: 'Contributor', email: contributorEmail});
        await frame.selectStage('Submission');

        // ── The edited template and its alternative ──────────────────────
        // "Decline Submission": the letter opens with the edited line;
        // "Email Templates" lists the default first, then the alternative;
        // the alternative pressed: "Subject:" reads "A short decline"; the
        // default pressed: the edited letter is back (Rule 7; Settings
        // bullet 2).
        await frame.actionButton('Decline Submission').click();
        await wizard.expectTitle('Decline Submission');
        await wizard.awaitComposerLoaded();
        await expect.poll(() => composer.firstParagraphText(), {timeout: 30_000}).toBe(EDITED_LINE);
        await composer.expectTemplates([MAILABLE, ALTERNATIVE]);
        await composer.loadTemplate(ALTERNATIVE);
        await expect(composer.subjectInput()).toHaveValue('A short decline', {timeout: 30_000});
        await expect.poll(() => composer.firstParagraphText(), {timeout: 30_000}).toBe(`A short decline for ${AUTHOR_DISPLAY}.`);
        await composer.loadTemplate(MAILABLE);
        await expect(composer.subjectInput()).toHaveValue(SUBJECT.declined, {timeout: 30_000});
        await expect.poll(() => composer.firstParagraphText(), {timeout: 30_000}).toBe(EDITED_LINE);

        // ── "Submission Files" ───────────────────────────────────────────
        // "Attach Files" › "Attach Submission Files": the Submission-stage
        // sentence and the file's row with a tick box; ticked and attached:
        // the file's chip (Rule 6).
        await composer.openAttachWindow();
        await composer.expectAttachSources(SUBMISSION_SOURCES);
        await expect(composer.attachSource('Submission Files')).toContainText(
            'Attach files uploaded by the author in the submission stage.'
        );
        const submissionFiles = await composer.openAttachSource('Attach Submission Files', SUBMISSION_FILES_WINDOW);
        await expect(composer.sourceCheckboxes(submissionFiles)).toHaveCount(1);
        await expect(submissionFiles).toContainText(FIXTURE_PDF_NAME);
        await composer.attachSelected(submissionFiles, FIXTURE_PDF_NAME, FIXTURE_PDF_NAME);
        await expect(composer.attachmentChips()).toHaveCount(1);

        // ── "Add CC/BCC" ─────────────────────────────────────────────────
        await composer.addCcBcc();
        await composer.ccInput().fill(mailOf(manager));

        // ── "Record Decision" ────────────────────────────────────────────
        await wizard.recordDecision('Submission Declined');
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(seeded.submissionId);
        await frame.expectStage('Declined');

        // ── The Author's mailbox ─────────────────────────────────────────
        // "Your submission has been declined" from the Editor, its text
        // opening with the edited line, the file attached and the Manager's
        // address on its CC line (Side effects; Fields).
        const declineMail = await pkpMail.find({to: mailOf(author), subject: SUBJECT.declined, contains: title});
        expect(declineMail.From).toEqual({Name: EDITOR_DISPLAY, Address: mailOf(editor)});
        expect((declineMail.Cc || []).map((c) => c.Address)).toEqual([mailOf(manager)]);
        const declineFull = await pkpMail.fullMessage(declineMail.ID);
        expect(declineFull.Text.trim().startsWith(EDITED_LINE)).toBe(true);
        expect((declineFull.Attachments || []).map((a) => a.FileName)).toEqual([FIXTURE_PDF_NAME]);

        // ── The contributor's mailbox ────────────────────────────────────
        // An email under the same subject, opening "The following email was
        // sent to {author} from {journal} regarding "{title}"." and quoting
        // the letter (Side effects; Settings bullet 1).
        const copy = await pkpMail.find({to: contributorEmail, subject: SUBJECT.declined, contains: title});
        const copyFull = await pkpMail.fullMessage(copy.ID);
        expect(copyFull.Text.trim().startsWith(`The following email was sent to ${AUTHOR_DISPLAY} from ${journalName} regarding "${title}".`)).toBe(true);
        expect(copyFull.Text).toContain(EDITED_LINE);
        expect(await pkpMail.count({to: contributorEmail})).toBe(1);

        // ── "Revert Decline" with the email skipped ──────────────────────
        // The one-page wizard; "Skip this email": the notice with "Don't
        // skip this email", the page staying since none follows; "Record
        // Decision": the window "Submission Reactivated" with its sentence
        // (Rules 3, 11).
        await frame.actionButton('Revert Decline').click();
        await wizard.expectTitle('Revert Decline');
        await wizard.expectSteps(['Notify Authors']);
        await wizard.skipEmail();
        await wizard.expectTitle('Revert Decline');
        await expect(wizard.skippedNotice()).toBeVisible({timeout: 30_000});
        await expect(wizard.dontSkipButton()).toBeVisible();
        const reactivated = await wizard.recordDecision('Submission Reactivated');
        await expect(reactivated).toContainText(
            `The submission, ${title}, is now active in the submission stage. The author has been notified, unless you chose to skip that email.`
        );
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(seeded.submissionId);
        await frame.expectStage('Submission');

        // ── The mailboxes after the revert, and the control ──────────────
        // The Author's holds no revert email and the contributor's nothing
        // new, the decline's email that reached both being the control;
        // the Activity Log reads "{editor} reversed the decision to decline
        // this submission." (Rule 3; Side effects).
        await frame.openActivityLog();
        await expect(frame.activityLogRow(`${EDITOR_DISPLAY} reversed the decision to decline this submission.`)).toHaveCount(1, {
            timeout: 30_000,
        });
        await frame.closeActivityLog();
        await pkpMail.expectNone({
            to: mailOf(author),
            subject: SUBJECT.reverted,
            afterControl: {to: mailOf(author), subject: SUBJECT.declined, contains: title},
        });
        expect(await pkpMail.count({to: mailOf(author)})).toBe(1);
        expect(await pkpMail.count({to: contributorEmail})).toBe(1);
    });

    test('S8: decline in French, to the assigned authors alone', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s8', testInfo);
        const manager = `${tag}mg`;
        const editor = `${tag}ed`;
        const author = `${tag}au`;
        const contributorEmail = `${tag}co@mail.test`;
        const title = `Submission ${tag}`;
        // Given: a scratch journal with French as a second form language and
        // "Notify All Authors" flipped to the assigned authors by the Manager
        // on screen; the Editor assigned to a Submission-stage submission
        // whose Author has an account and whose Contributors list gains a
        // second contributor without one (footnote s1).
        await ojsApi.createContext({
            tag,
            // French is a submission language too: with French under "Forms"
            // alone, "Add Contributor" › "Save" is refused with no message
            // (the form posts `organizationName` in French, which the API
            // answers 400 "This language is not accepted."; T-ojs-4, a
            // workaround for the given, proposed as an app-changes row).
            context: {
                name: `Journal ${tag}`,
                supportedLocales: ['en', 'fr_CA'],
                supportedFormLocales: ['en', 'fr_CA'],
                supportedSubmissionLocales: ['en', 'fr_CA'],
            },
            users: [
                user(manager, 'Mira', 'Manager', ['manager']),
                user(editor, 'Erin', 'Editor', ['editor']),
                user(author, 'Ava', 'Author', ['author']),
            ],
        });
        const seeded = await seedSubmission(ojsApi, tag, {
            context: tag,
            submitter: author,
            title,
            participants: [{username: editor, role: 'editor'}],
        });
        const control = await seedSubmission(ojsApi, `${tag}c`);
        expect(await pkpMail.count({to: mailOf(author)})).toBe(0);

        const managerPage = await (await asUser(manager)).newPage();
        const settings = new WorkflowEmailsSettingsPage(managerPage, tag);
        await settings.goto();
        await settings.setNotifyAllAuthors('false');

        const {page, workflow, frame, wizard, composer} = await workflowAs(asUser, editor, tag);
        await workflow.gotoEditorial(seeded.submissionId);
        await workflow.expectPageTitle('Submission');
        await addContributor(page, frame, {given: 'Cleo', family: 'Contributor', email: contributorEmail});
        await frame.selectStage('Submission');

        // ── "Switch to: French" ──────────────────────────────────────────
        // "Decline Submission": under the templates the line "Switch to:"
        // with the link "French"; pressed: the dialog "Switch to French"
        // with its question, "Switch to French" and "Cancel"; confirmed:
        // "Subject:" and "Message" hold the template in French (the
        // "Email Templates" snippet's language is A10 ❓) (Rule 8; Fields).
        await frame.actionButton('Decline Submission').click();
        await wizard.expectTitle('Decline Submission');
        await wizard.awaitComposerLoaded();
        await expect(composer.subjectInput()).toHaveValue(SUBJECT.declined, {timeout: 30_000});
        const englishLetter = await composer.letterText();
        await expect(composer.switchToLine()).toHaveText(/^\s*Switch to:\s*French\s*$/, {timeout: 30_000});
        await expect(composer.switchToLink('French')).toBeVisible();
        const dialog = await composer.pressSwitchTo('French');
        await expect(dialog).toContainText(
            'Are you sure you want to change to French to compose this email? Any changes you have made to the subject and body of the email will be lost.'
        );
        await expect(dialog.getByRole('button', {name: 'Switch to French', exact: true})).toBeVisible();
        await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await composer.confirmSwitch('French');
        await expect(composer.subjectInput()).not.toHaveValue(SUBJECT.declined, {timeout: 30_000});
        await expect(composer.subjectInput()).not.toHaveValue('');
        const frenchSubject = await composer.subjectInput().inputValue();
        const frenchLetter = await composer.letterText();
        expect(frenchLetter).not.toBe(englishLetter);
        expect(frenchLetter.length).toBeGreaterThan(20);
        await expect(composer.switchToLine()).toHaveText(/^\s*Switch to:\s*English\s*$/);

        // ── "Record Decision" ────────────────────────────────────────────
        // "Submission Declined"; the Author's mailbox holds the email under
        // the French subject the page showed (Rule 8; Side effects).
        await wizard.recordDecision('Submission Declined');
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(seeded.submissionId);
        const declineMail = await pkpMail.find({to: mailOf(author), subject: frenchSubject, contains: title});
        expect(declineMail.Subject).toBe(frenchSubject);
        expect(declineMail.From.Address).toBe(mailOf(editor));

        // ── The contributor's mailbox ────────────────────────────────────
        // Nothing, the Author's email having arrived (Settings bullet 1).
        await pkpMail.expectNone({
            to: contributorEmail,
            afterControl: {to: mailOf(author), subject: frenchSubject, contains: title},
        });
        expect(await pkpMail.count({to: contributorEmail})).toBe(0);

        // ── Control ──────────────────────────────────────────────────────
        // On the seeded journal, whose forms have one language, the wizard
        // shows no "Switch to:" line under the templates, the templates
        // heading being there (Rule 8; Settings bullet 3).
        const seededSide = await workflowAs(asUser, EDITOR, JOURNAL);
        await seededSide.workflow.gotoEditorial(control.submissionId);
        await seededSide.frame.actionButton('Decline Submission').click();
        await seededSide.wizard.expectTitle('Decline Submission');
        await seededSide.wizard.awaitComposerLoaded();
        await seededSide.composer.expectTemplates(['Submission Declined (Pre-Review)']);
        await expect(seededSide.composer.switchToLine()).toHaveCount(0);
    });

    test('S10: "Request Payment" on a fee-charging journal', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s10', testInfo);
        const manager = `${tag}mg`;
        const editor = `${tag}ed`;
        const author = `${tag}au`;
        const contactEmail = `${tag}contact@mail.test`;
        const title = `Submission ${tag}`;
        // Given: a scratch journal with payments enabled and an "Article
        // Processing Charge" set by the Manager on screen (seed-facts); the
        // Editor assigned to a Submission-stage submission whose Author has
        // an account; a second such submission on the seeded journal, where
        // payments are off.
        await ojsApi.createContext({
            tag,
            context: {name: `Journal ${tag}`, contactName: 'Paula Contact', contactEmail},
            users: [
                user(manager, 'Mira', 'Manager', ['manager']),
                user(editor, 'Erin', 'Editor', ['editor']),
                user(author, 'Ava', 'Author', ['author']),
            ],
        });
        const seeded = await seedSubmission(ojsApi, tag, {
            context: tag,
            submitter: author,
            title,
            participants: [{username: editor, role: 'editor'}],
        });
        const control = await seedSubmission(ojsApi, `${tag}c`);
        expect(await pkpMail.count({to: mailOf(author)})).toBe(0);

        const managerPage = await (await asUser(manager)).newPage();
        const payments = new PaymentsSetupPage(managerPage, tag);
        await payments.enableManualPayments({instructions: `Manual payment instructions ${tag}`});
        await payments.setPublicationFee(100);

        // ── "Request Payment" ────────────────────────────────────────────
        // "Accept and Skip Review": the wizard headed "Accept and Skip
        // Review: Request Payment" with the rail "1 Request Payment", "2
        // Notify Authors", "3 Select Files"; the choice "Payment" offers
        // "Request publication fee (100 USD)", preselected, and "Waive"
        // (OJS1 🐞: not pressed) (Rules 2, 16; Fields).
        const {workflow, frame, wizard} = await workflowAs(asUser, editor, tag);
        await workflow.gotoEditorial(seeded.submissionId);
        await workflow.expectPageTitle('Submission');
        await frame.actionButton('Accept and Skip Review').click();
        await wizard.expectTitle('Accept and Skip Review: Request Payment');
        await wizard.expectSteps(['Request Payment', 'Notify Authors', 'Select Files']);
        await expect(wizard.stepHeading('Request Payment')).toBeVisible({timeout: 30_000});
        await expect(wizard.currentStep().getByRole('radio')).toHaveCount(2);
        await expect(wizard.paymentRadio('Request publication fee (100 USD)')).toBeChecked();
        await expect(wizard.paymentRadio('Waive')).toBeVisible();
        await expect(wizard.paymentRadio('Waive')).not.toBeChecked();

        // ── "Record Decision" ────────────────────────────────────────────
        // "Continue" twice and "Record Decision": the window "Skipped
        // Review" with its sentence (Rule 11).
        await wizard.continueStep();
        await wizard.expectTitle('Accept and Skip Review: Notify Authors');
        await wizard.continueStep();
        await wizard.expectTitle('Accept and Skip Review: Select Files');
        const done = await wizard.recordDecision('Skipped Review');
        await expect(done).toContainText(
            `The submission, ${title}, skipped the review stage and has been sent to the copyediting stage. The author has been notified, unless you chose to skip that email.`
        );
        await wizard.viewSubmissionSummary();
        await frame.expectOpen(seeded.submissionId);
        await frame.expectStage('Copyediting');

        // ── The Author's side ────────────────────────────────────────────
        // The header's Tasks panel reads "The publication fee is due for
        // payment."; the mailbox holds "Payment Request Notification" from
        // the journal's principal contact and the copyediting subject from
        // the Editor (Rule 16; Side effects).
        const authorPage = await (await asUser(author)).newPage();
        await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        const tasks = new TasksPanel(authorPage);
        await tasks.open();
        await expect(tasks.row('The publication fee is due for payment.').filter({hasText: title})).toHaveCount(1);
        await tasks.close();
        const paymentMail = await pkpMail.find({to: mailOf(author), subject: SUBJECT.paymentRequest});
        expect(paymentMail.From).toEqual({Name: 'Paula Contact', Address: contactEmail});
        const copyeditingMail = await pkpMail.find({to: mailOf(author), subject: SUBJECT.copyediting, contains: title});
        expect(copyeditingMail.From).toEqual({Name: 'Erin Editor', Address: mailOf(editor)});
        expect(await pkpMail.count({to: mailOf(author)})).toBe(2);

        // ── Control ──────────────────────────────────────────────────────
        // On the seeded journal "Accept and Skip Review" opens headed "Accept
        // and Skip Review: Notify Authors" with no "Request Payment" page
        // (Settings bullet 5).
        const seededSide = await workflowAs(asUser, EDITOR, JOURNAL);
        await seededSide.workflow.gotoEditorial(control.submissionId);
        await seededSide.frame.actionButton('Accept and Skip Review').click();
        await seededSide.wizard.expectTitle('Accept and Skip Review: Notify Authors');
        await seededSide.wizard.expectSteps(['Notify Authors', 'Select Files']);
        await expect(seededSide.wizard.stepItem('Request Payment')).toHaveCount(0);
    });
});
