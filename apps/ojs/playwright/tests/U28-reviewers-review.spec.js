// @ts-check
/**
 * @file playwright/tests/U28-reviewers-review.spec.js
 *
 * Reviewer's review — OJS suite, one test per canonical scenario the spec
 * runs on OJS (common scenarios 1–14 and OJS-specific 16; scenario 15 is
 * OMP's and 17 OPS's, in those trees).
 * Spec: docs/specs/U28-reviewers-review.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap):
 * - A1 🐞: nothing searches, sorts or pages the reviewer's list; every row
 *   read is by the seed tag in the title on a settled, unfiltered view.
 * - A2 🐞 / A12 🐞: the "Previous Reviews" line is asserted only for a
 *   round the reviewer SUBMITTED (S11); the dateless line and the
 *   own-round listing are the bugs' record, asserted neither way.
 * - A3 ❓: S3 asserts only that declining leaves the wizard and what the
 *   list and the wizard address show afterwards; the home-page landing and
 *   its silence are the open question, not asserted either way.
 * - A4 🐞: no test empties a saved box; S5 saves and re-reads one text.
 * - A5 🐞: the accepted row is asserted through its date
 *   ("Please complete this review by {date}") and its button; the trailing
 *   "00:00:00." is the bug's record, asserted neither way.
 * - A6 🐞: no file link is opened by an account without file access.
 * - A7 🐞: S7 walks the spec's own scenario (an empty review goes through
 *   once a recommendation is chosen) because the scenario is the recipe
 *   for the check that DOES exist (the recommendation's "This field is
 *   required."); the empty submit's success is not frozen by any assertion
 *   beyond the step reached and the email the editors get.
 * - A9 🐞 / A10 🐞: no reminder or second request follows a one-click link
 *   (S10 opens its link before anything else reaches that reviewer), and
 *   no link is opened while signed in as someone else.
 * - A11 ❓: S14 drives the spec's scenario through the archived wizard
 *   (the step reached, "Save and continue" enabled, a full submit) because
 *   that is what the screens offer today; whether the wizard SHOULD stay
 *   open is the open question and no assertion says it is right.
 * - A13 ❓: nothing asserts the round-history window's "Files For Review"
 *   block either way.
 * - Settings with no scenario of their own (configured "Review Guidelines",
 *   the Privacy Statement's empty end, an "Open" review type, the
 *   journal's own recommendations, automatic reminders): none here.
 *
 * Seeding: scenario endpoints only. publicknowledge and the 18 seeded users
 * are read-only; scenarios 1–7, 11, 12, 14 and 16 use scratch submissions
 * on the seeded journal with reviewer.julia / reviewer.paul and
 * sectioneditor.ana; scenarios 8, 9, 10 and 13 seed a scratch journal
 * through the `review` / `reviewForms[]` passthrough keys with throwaway
 * users whose addresses carry app + test (u28s10ojsw0…@mail.test). Mail is
 * read by recipient plus the tag-bearing submission title (PRINCIPLES A8);
 * silence claims are bounded by the response or row that would carry the
 * effect. A "sign in again" is a NEW session at the journal's Login page
 * in a fresh context — never a sign-out, which would kill the cached
 * session every parallel test of that user shares. No hard-coded waits.
 */
const path = require('path');
const {test, expect} = require('../support/fixtures.js');
const {
    WorkflowPage,
    DecisionPage,
    uploadViaWizard,
    legacyModal,
    openAddReviewerModal,
    selectReviewer,
    addReviewer,
    waitForJQueryIdle,
    FIXTURE_PDF,
    FIXTURE_PDF_NAME,
} = require('../pages/ReviewStagePages.js');
const {
    ReviewerAssignmentsPage,
    ReviewWizardPage,
    signInAtContext,
} = require('../../../../shared/playwright/pages/ReviewerPages.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {getPassword} = require('../../../../shared/playwright/data/users.js');

const JOURNAL = 'publicknowledge';
const EDITOR = 'sectioneditor.ana';
const EDITOR_MAIL = `${EDITOR}@mail.test`;
const REVIEWER = 'reviewer.julia';
const REVIEWER_NAME = 'Julia Reviewer';
const SECOND_FIXTURE = path.join(__dirname, '..', 'fixtures', 'files', 'profile-image-400.png');
const SECOND_FIXTURE_NAME = 'profile-image-400.png';
const NO_GUIDELINES = 'This publisher has not set any reviewer guidelines.';
const NOT_ASSIGNED = 'The current user is not assigned as a reviewer for the requested document.';
const THANK_YOU =
    'Thank you for completing the review of this submission. Your review has been submitted successfully. ' +
    'We appreciate your contribution to the quality of the work that we publish; the editor may contact you again for more information if needed.';
const DATE = /\d{4}-\d{2}-\d{2}/;

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u28${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A submission standing in external review round 1 with the given reviewers. */
async function seedInReview(ojsApi, tag, {
    context = JOURNAL,
    submitter = 'author.alex',
    reviewers = [],
    decisions = ['sendExternalReview'],
    participants = context === JOURNAL ? [{username: EDITOR, role: 'sectionEditor'}] : [],
    title = `Submission ${tag}`,
} = {}) {
    const result = await ojsApi.createSubmission({
        tag,
        context,
        submitter,
        title,
        decisions,
        reviewRounds: [{reviewers}],
        participants,
    });
    return {submissionId: result.submissionId, title};
}

/** A brand-new signed-out context (never inherits the file's storage state). */
async function anonymousContext(browser, baseURL) {
    return browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
}

/**
 * Open a reviewer row's "More Actions" menu entry (the headlessui menu
 * portals to the document root, so the item resolves page-wide).
 */
async function clickRowAction(page, row, name) {
    await row.getByRole('button', {name: 'More Actions'}).click();
    await page.getByRole('menuitem', {name, exact: true}).click();
}

/**
 * Editor's side: put a file into the round through "Upload/Select Files"
 * beside "Files for Review" (window "Current Review Files For Round N" ›
 * "Upload Review File" › the legacy wizard › "OK").
 */
async function uploadRoundFiles(page, files) {
    await page.getByRole('button', {name: 'Upload/Select Files', exact: true}).click();
    const window = page.getByRole('dialog').filter({hasText: /Current Review Files For Round/});
    await expect(window.getByRole('link', {name: 'Upload Review File'})).toBeVisible({timeout: 30_000});
    for (const file of files) {
        await window.getByRole('link', {name: 'Upload Review File'}).click();
        await uploadViaWizard(page, {file});
        await expect(window.getByRole('row').filter({hasText: path.basename(file)})).toBeVisible({timeout: 30_000});
    }
    await window.getByRole('button', {name: 'OK', exact: true}).click();
    await expect(window).toBeHidden({timeout: 30_000});
    await waitForJQueryIdle(page);
}

/**
 * Editor's side: grant round files to a reviewer through the row's "Edit"
 * window ("Files To Be Reviewed": a box per file; files added after the
 * assignment arrive unticked).
 */
async function grantFilesToReviewer(page, workflow, reviewerText, fileNames) {
    const row = workflow.panelRow('Reviewers', reviewerText);
    await expect(row).toBeVisible({timeout: 30_000});
    await clickRowAction(page, row, 'Edit');
    const editModal = legacyModal(page, 'editReviewForm');
    await expect(editModal.locator('input[name="isReviewPubliclyVisible"]')).toBeVisible({timeout: 30_000});
    for (const name of fileNames) {
        await editModal.getByRole('row').filter({hasText: name}).getByRole('checkbox').check();
    }
    await editModal.getByRole('button', {name: 'OK', exact: true}).click();
    await expect(editModal.locator('form#editReviewForm')).toBeHidden({timeout: 30_000});
    await waitForJQueryIdle(page);
}

/** Walk a seeded acceptance to step 3 ("Save and continue", "Continue to Step #3"). */
async function walkToStep3(wizard) {
    await wizard.expectStep(1);
    await wizard.saveAndContinueButton.click();
    await wizard.expectStep(2);
    await wizard.continueToStep3();
}

/** The first href in an email's HTML whose address matches. */
function linkMatching(html, pattern) {
    const anchorRe = /<a\b[^>]*href=(["'])([^"']+)\1/gi;
    let match;
    while ((match = anchorRe.exec(html)) !== null) {
        const href = match[2].replace(/&amp;/g, '&');
        if (pattern.test(href)) {
            return href;
        }
    }
    return null;
}

test.describe('reviewer\'s review', () => {
    test('S1: the request appears in the reviewer\'s list', {tag: '@smoke'}, async ({browser, baseURL, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId, title} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'invited'}],
        });

        // A fresh session at the journal's Login page lands on the list.
        const context = await anonymousContext(browser, baseURL);
        const page = await context.newPage();
        try {
            await signInAtContext(page, JOURNAL, REVIEWER, getPassword(REVIEWER));
            await page.waitForURL(/dashboard\/reviewAssignments\?currentViewId=reviewer-action-required/, {
                waitUntil: 'commit',
            });
            const list = new ReviewerAssignmentsPage(page, JOURNAL);
            await list.expectSettled();
            await expect(list.heading()).toHaveText(/^Action Required by me \(\d+\)\s*$/);
            expect(await list.viewCount('actionRequired')).toBeGreaterThanOrEqual(1);

            const row = list.row(tag);
            await expect(row).toContainText(String(submissionId));
            await expect(row).toContainText(title);
            await expect(row).toContainText(/Please accept or decline this request by \d{4}-\d{2}-\d{2}/);
            await expect(list.rowAction(row, 'Respond to request')).toBeVisible();

            // The same row under "All assignments" only; not in the other four.
            await list.expectInViews(tag, ['actionRequired', 'all']);

            // Control: a reviewer-only account has no "Editor Dashboard" group.
            await expect(list.reviewerGroup).toBeVisible();
            await expect(list.editorGroup).toHaveCount(0);
        } finally {
            await context.close();
        }
    });

    test('S2: accept a review request', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId, title} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'invited'}],
        });

        const page = await (await asUser(REVIEWER)).newPage();
        const list = new ReviewerAssignmentsPage(page, JOURNAL);
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await list.goto('actionRequired');
        await list.openWizard(list.row(tag), 'Respond to request');
        await wizard.expectOpen(title);
        await wizard.expectStep(1);
        for (const step of [2, 3, 4]) {
            await wizard.expectTabDisabled(step);
        }

        // Review Type and the three Review Schedule dates.
        expect(await wizard.step1Value('Review Type')).toBe('Anonymous Reviewer/Anonymous Author');
        await expect(page.locator('#reviewStep1Form')).toContainText('Review Schedule');
        for (const field of ['dateNotified', 'responseDue', 'dateDue']) {
            await expect(page.locator(`input[id^="${field}"]`)).toHaveValue(DATE);
        }

        // "View All Submission Details": title and abstract, no authors on an
        // anonymous review.
        const details = await wizard.openSubmissionDetails();
        await expect(details).toContainText(title);
        await expect(details).toContainText(`Seeded abstract for ${tag}.`);
        await expect(details).not.toContainText('Authors');
        await details.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(details).toBeHidden({timeout: 30_000});

        // "About Due Dates".
        const dueDates = await wizard.openAboutDueDates();
        await wizard.closeDialog(dueDates);

        // Accepting without the privacy box is refused and the step stays.
        await wizard.acceptButton.click();
        await expect(page.locator('label.error').filter({hasText: 'This field is required.'})).toBeVisible({
            timeout: 30_000,
        });
        await wizard.expectStep(1);
        await expect(wizard.acceptButton).toBeVisible();

        // Ticked, the acceptance moves to step 2 with no guidelines configured.
        await wizard.accept();
        await expect(page.getByText(NO_GUIDELINES)).toBeVisible();

        // The wizard remembers step 2; step 1 now offers "Save and continue".
        await page.reload();
        await wizard.expectOpen(title);
        await wizard.expectStep(2);
        await wizard.selectStep(1);
        await expect(wizard.saveAndContinueButton).toBeVisible();
        await expect(wizard.acceptButton).toHaveCount(0);

        // The list row and the editor's mailbox.
        await list.goto('actionRequired');
        const row = list.row(tag);
        await expect(row).toContainText(/Please complete this review by \d{4}-\d{2}-\d{2}/);
        await expect(list.rowAction(row, 'Finish review')).toBeVisible();
        await pkpMail.find({to: EDITOR_MAIL, subject: 'Review accepted', contains: tag});
    });

    test('S3: decline a review request', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'invited'}],
        });
        const reason = `Declining for ${tag}`;

        const page = await (await asUser(REVIEWER)).newPage();
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);

        // The window opens prefilled; a line is added; declining leaves the
        // wizard (where it lands is register A3, asserted neither way).
        const dialog = await wizard.openDecline();
        await expect(wizard.declineMessageBody()).toContainText('I am afraid that at this time I am unable to review');
        await expect(dialog).toBeVisible();
        await wizard.confirmDecline({appendText: reason});
        await expect(page).not.toHaveURL(/\/reviewer\//);

        // The list: declined wording, no button, under "Declined" only.
        const list = new ReviewerAssignmentsPage(page, JOURNAL);
        await list.goto('declined');
        const row = list.row(tag);
        await expect(row).toContainText(/Request declined on \d{4}-\d{2}-\d{2}/);
        await expect(list.rowActions(row)).toHaveCount(0);
        await list.expectInViews(tag, ['declined']);

        // The wizard is closed to the reviewer from now on.
        await page.goto(wizard.url(submissionId));
        await expect(page.getByText(NOT_ASSIGNED)).toBeVisible({timeout: 30_000});

        // The editor's mailbox holds "Unable to Review" with the edited message.
        await pkpMail.find({to: EDITOR_MAIL, subject: 'Unable to Review', contains: reason});
    });

    test('S4: download the files for review', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });

        // Editor: two files into the round, one of them ticked for Julia.
        const editorPage = await (await asUser(EDITOR)).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        await uploadRoundFiles(editorPage, [FIXTURE_PDF, SECOND_FIXTURE]);
        await expect(workflow.panelRow('Files for Review', FIXTURE_PDF_NAME)).toBeVisible();
        await expect(workflow.panelRow('Files for Review', SECOND_FIXTURE_NAME)).toBeVisible();
        await grantFilesToReviewer(editorPage, workflow, REVIEWER_NAME, [FIXTURE_PDF_NAME]);

        // Reviewer: the ticked file is on step 1 and downloads.
        const page = await (await asUser(REVIEWER)).newPage();
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await wizard.expectReviewFilesSettled(1);
        await expect(wizard.reviewFileLink(1, FIXTURE_PDF_NAME)).toBeVisible();
        await expect(wizard.reviewFilesGrid(1)).not.toContainText(SECOND_FIXTURE_NAME);
        const download = await wizard.downloadReviewFile(1, FIXTURE_PDF_NAME);
        expect(download.suggestedFilename()).toMatch(/\.pdf$/);

        // The same list heads step 3.
        await walkToStep3(wizard);
        await wizard.expectReviewFilesSettled(3);
        await expect(wizard.reviewFileLink(3, FIXTURE_PDF_NAME)).toBeVisible();
        await expect(wizard.reviewFilesGrid(3)).not.toContainText(SECOND_FIXTURE_NAME);
    });

    test('S5: save a review for later', async ({asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });
        const publicText = `Public review text ${tag}`;
        const privateText = `Private review text ${tag}`;

        const page = await (await asUser(REVIEWER)).newPage();
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);
        await wizard.typeComments(publicText);
        await wizard.typePrivateComments(privateText);
        await wizard.chooseRecommendation('Revisions Required');
        const saved = page.waitForResponse((r) => r.url().includes('/reviewer/saveStep/') && r.request().method() === 'POST');
        await wizard.saveForLater();
        await saved;
        await wizard.expectStep(3);

        // A new session: the row still says "Finish review" and the wizard
        // opens on step 3 with both texts and the choice restored.
        const context = await anonymousContext(browser, baseURL);
        const page2 = await context.newPage();
        try {
            await signInAtContext(page2, JOURNAL, REVIEWER, getPassword(REVIEWER));
            const list = new ReviewerAssignmentsPage(page2, JOURNAL);
            await list.goto('actionRequired');
            await expect(list.rowAction(list.row(tag), 'Finish review')).toBeVisible();
            const wizard2 = new ReviewWizardPage(page2, JOURNAL);
            await wizard2.goto(submissionId);
            await wizard2.expectStep(3);
            await expect(wizard2.commentsBody).toContainText(publicText);
            await expect(wizard2.privateCommentsBody).toContainText(privateText);
            await expect(wizard2.recommendationSelect.locator('option:checked')).toHaveText('Revisions Required');
        } finally {
            await context.close();
        }

        // Control: nothing reached the editor. The save's own response bounds
        // the mail read (any mail would have left during that request), and
        // the editor's row still reads "Request Accepted".
        expect(await pkpMail.count({to: EDITOR_MAIL, subject: 'Review complete', contains: tag})).toBe(0);
        const editorPage = await (await asUser(EDITOR)).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        await expect(workflow.panelRow('Reviewers', REVIEWER_NAME)).toContainText('Request Accepted');
    });

    test('S6: submit a free-form review', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });

        const page = await (await asUser(REVIEWER)).newPage();
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);
        await wizard.typeComments(`Review text ${tag}`);
        await wizard.chooseRecommendation('Accept Submission');
        await wizard.submitReview();
        await wizard.expectCompleted();

        // Step 4: the heading and the thank-you text. (The step also carries
        // the "Review Tasks & Discussions" panel — a spec contradiction
        // returned as finding T-ojs-1, asserted neither way.)
        const panel = page.getByRole('tabpanel', {name: '4. Completion'});
        await expect(panel.getByRole('heading', {name: 'Review Submitted'})).toBeVisible();
        await expect(panel.getByRole('paragraph').first()).toHaveText(THANK_YOU);

        // All four tabs open; step 3's buttons are disabled (read on a typed
        // ?step=3 load, screen notes pC).
        for (const step of [1, 2, 3, 4]) {
            await wizard.expectTabEnabled(step);
        }
        await wizard.goto(submissionId, {step: 3});
        await wizard.expectStep(3);
        await expect(wizard.submitReviewButton).toBeDisabled();
        await expect(wizard.saveForLaterButton).toBeDisabled();

        // The list: "Review submitted on {date}" with "View", under "Completed".
        const list = new ReviewerAssignmentsPage(page, JOURNAL);
        await list.goto('completed');
        const row = list.row(tag);
        await expect(row).toContainText(/Review submitted on \d{4}-\d{2}-\d{2}/);
        await expect(list.rowAction(row, 'View')).toBeVisible();
        await list.expectInViews(tag, ['all', 'completed']);

        // Every editor assigned to the stage gets "Review complete: …" with
        // the recommendation in the subject.
        for (const editor of ['sectioneditor.ana', 'editor.diana', 'sectioneditor.omar']) {
            const mail = await pkpMail.find({to: `${editor}@mail.test`, subject: 'Review complete', contains: tag});
            expect(mail.Subject).toContain('recommends Accept Submission');
        }

        // The editor's "Tasks" panel gains no entry for it (bounded by the
        // mail that the same submit sent).
        const editorPage = await (await asUser(EDITOR)).newPage();
        await editorPage.goto(`/index.php/${JOURNAL}/dashboard/editorial`);
        await editorPage.getByRole('button', {name: /^Tasks/}).click();
        const tasks = editorPage.getByRole('dialog').last();
        await expect(tasks.locator('table tbody tr').first()).toBeVisible({timeout: 30_000});
        await expect(tasks).not.toContainText(tag);

        // Control: "View" opens the wizard on "4. Completion".
        await list.goto('completed');
        await list.openWizard(list.row(tag), 'View');
        await wizard.expectCompleted();
    });

    test('S7: nothing stops an empty review', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });
        const controlTag = `${tag}b`;
        const {submissionId: controlId} = await seedInReview(ojsApi, controlTag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });

        const page = await (await asUser(REVIEWER)).newPage();
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);

        // The confirmation comes at once, with no field marked; after "OK"
        // the only check is the recommendation.
        const confirm = await wizard.pressSubmitReview();
        await expect(wizard.recommendationError).toHaveCount(0);
        await confirm.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(wizard.recommendationError).toHaveText('This field is required.', {timeout: 30_000});
        await wizard.expectStep(3);

        // A reload between the two presses (screen notes pC), then a
        // recommendation, and the empty review goes through (A7's record).
        await wizard.goto(submissionId, {step: 3});
        await wizard.chooseRecommendation('See Comments');
        await wizard.submitReview();
        await wizard.expectCompleted();
        await pkpMail.find({to: EDITOR_MAIL, subject: 'Review complete', contains: tag});

        // Control: an attached file lists with "Edit" and "Delete", and the
        // submit with empty boxes goes through the same way.
        await wizard.goto(controlId);
        await walkToStep3(wizard);
        await wizard.expectReviewerFilesSettled();
        await wizard.uploadReviewerFile(`reviewer-${controlTag}.txt`);
        const fileRow = wizard.reviewerFileRow(`reviewer-${controlTag}.txt`);
        const actions = await wizard.reviewerFileActions(fileRow);
        await expect(actions.getByRole('link', {name: 'Edit', exact: true})).toBeVisible();
        await expect(actions.getByRole('link', {name: 'Delete', exact: true})).toBeVisible();
        await wizard.chooseRecommendation('See Comments');
        await wizard.submitReview();
        await wizard.expectCompleted();
        await pkpMail.find({to: EDITOR_MAIL, subject: 'Review complete', contains: controlTag});
    });

    test('S8: a review form instead of free text', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const reviewer = `rev${tag}`;
        const author = `au${tag}`;
        const formTitle = `Form ${tag}`;
        const formDescription = `Answer the one question for ${tag}.`;
        const question = `Is the method sound for ${tag}?`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer']},
            ],
            reviewForms: [{
                title: formTitle,
                description: formDescription,
                elements: [{question, type: 'radiobuttons', required: true, options: ['Yes', 'No']}],
            }],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [{username: reviewer, status: 'accepted', reviewForm: formTitle}],
        });

        const page = await (await asUser(reviewer)).newPage();
        const wizard = new ReviewWizardPage(page, tag);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);

        // The form's title, description and starred question replace the boxes.
        const form = page.locator('#reviewStep3Form');
        await expect(form.getByRole('heading', {name: formTitle})).toBeVisible();
        await expect(form).toContainText(formDescription);
        await expect(form).toContainText(`${question}*`);
        await expect(wizard.formRadio('Yes')).toBeVisible();
        await expect(page.locator('iframe[id^="comments"]')).toHaveCount(0);

        // Unanswered: the confirmation, then the message box, nothing marked.
        await wizard.chooseRecommendation('Accept Submission');
        await wizard.submitReview();
        await expect(wizard.messageBox).toBeVisible({timeout: 30_000});
        await expect(wizard.messageBox).toContainText('Please fill in required fields.');
        await expect(wizard.messageBox).toContainText(
            'Some required fields are not filled in. Please complete them before submitting your review.'
        );
        await wizard.expectStep(3);
        await expect(wizard.formRadio('Yes')).not.toBeChecked();
        await expect(wizard.formRadio('No')).not.toBeChecked();

        // "Save for Later" saves whether or not the question is answered.
        await wizard.saveForLater();
        await wizard.goto(submissionId, {step: 3});
        await expect(wizard.formRadio('Yes')).not.toBeChecked();
        await expect(wizard.formRadio('No')).not.toBeChecked();

        // Answered, the submit goes through.
        await wizard.formRadio('Yes').check();
        await wizard.chooseRecommendation('Accept Submission');
        await wizard.submitReview();
        await wizard.expectCompleted();
    });

    test('S9: restricted file access', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const manager = `mgr${tag}`;
        const reviewer = `rev${tag}`;
        const author = `au${tag}`;
        await ojsApi.createContext({
            tag,
            review: {restrictReviewerFileAccess: true},
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer'], givenName: 'Restricted', familyName: `Reviewer${tag}`},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [{username: reviewer, status: 'invited'}],
        });

        // Manager: one file into the round, ticked for the reviewer.
        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        await uploadRoundFiles(managerPage, [FIXTURE_PDF]);
        await grantFilesToReviewer(managerPage, workflow, 'Restricted', [FIXTURE_PDF_NAME]);

        // Reviewer: no "Review Files" list on step 1 (control: the rest of
        // the step is there); after accepting, step 3 lists the file and it
        // downloads.
        const page = await (await asUser(reviewer)).newPage();
        const wizard = new ReviewWizardPage(page, tag);
        await wizard.goto(submissionId);
        await expect(page.locator('#reviewStep1Form')).toContainText('Review Schedule');
        await expect(wizard.reviewFilesGrid(1)).toHaveCount(0);
        await expect(page.locator('#reviewStep1Form')).not.toContainText('Review Files');
        await wizard.accept();
        await wizard.continueToStep3();
        await wizard.expectReviewFilesSettled(3);
        await expect(wizard.reviewFileLink(3, FIXTURE_PDF_NAME)).toBeVisible();
        const download = await wizard.downloadReviewFile(3, FIXTURE_PDF_NAME);
        expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        // Control for the setting's "off" end: S4 (the list is on step 1).
    });

    test('S10: one-click access', async ({asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s10', testInfo);
        const manager = `mgr${tag}`;
        const reviewer = `rev${tag}`;
        const reviewerName = `Oneclick Reviewer${tag}`;
        const author = `au${tag}`;
        await ojsApi.createContext({
            tag,
            review: {reviewerAccessKeysEnabled: true},
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer'], givenName: 'Oneclick', familyName: `Reviewer${tag}`},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {context: tag, submitter: author});

        // The request email comes only from the editor's "Add Reviewer" window.
        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(managerPage);
        await selectReviewer(managerPage, modal, reviewerName);
        await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(modal).toHaveCount(0, {timeout: 30_000});
        const request = await pkpMail.find({to: `${reviewer}@mail.test`, subject: 'Invitation to review'});
        const html = (await pkpMail.fullMessage(request.ID)).HTML;
        const link = linkMatching(html, /invitation\/accept/);
        expect(link).not.toBeNull();

        // The link is opened before anything else reaches this reviewer
        // (seed-facts: a later one-click email kills the earlier link).
        const first = await anonymousContext(browser, baseURL);
        const second = await anonymousContext(browser, baseURL);
        const third = await anonymousContext(browser, baseURL);
        try {
            // Signed out, the link signs the reviewer in and lands on step 1.
            const page1 = await first.newPage();
            await page1.goto(link);
            await page1.waitForURL(/\/reviewer\/submission/, {waitUntil: 'commit'});
            const wizard1 = new ReviewWizardPage(page1, tag);
            await wizard1.expectOpen();
            await wizard1.expectStep(1);
            await expect(page1.locator('header, [role="banner"]').getByRole('button', {name: new RegExp(reviewer)})).toBeVisible();

            // A second signed-out open lands on the wizard again.
            const page2 = await second.newPage();
            await page2.goto(link);
            await page2.waitForURL(/\/reviewer\/submission/, {waitUntil: 'commit'});
            const wizard2 = new ReviewWizardPage(page2, tag);
            await wizard2.expectOpen();
            await wizard2.expectStep(1);

            // Accept and submit the review.
            await wizard2.accept();
            await wizard2.continueToStep3();
            await wizard2.chooseRecommendation('Accept Submission');
            await wizard2.submitReview();
            await wizard2.expectCompleted();

            // The link is used up: "Invitation Unavailable".
            const page3 = await third.newPage();
            await page3.goto(link);
            await expect(page3.getByText('Invitation Unavailable')).toBeVisible({timeout: 30_000});
        } finally {
            await Promise.all([first.close(), second.close(), third.close()]);
        }

        // Control: on the seeded journal (the setting off) the request's link
        // is the plain wizard address, which asks for sign-in first.
        const controlTag = `${tag}b`;
        const {submissionId: controlId} = await seedInReview(ojsApi, controlTag);
        const editorPage = await (await asUser(EDITOR)).newPage();
        const controlWorkflow = new WorkflowPage(editorPage, JOURNAL);
        await controlWorkflow.gotoEditorial(controlId);
        await addReviewer(editorPage, REVIEWER_NAME);
        const controlMail = await pkpMail.find({to: `${REVIEWER}@mail.test`, subject: 'Invitation to review', contains: controlTag});
        const controlHtml = (await pkpMail.fullMessage(controlMail.ID)).HTML;
        const plainLink = linkMatching(controlHtml, /reviewer\/submission/);
        expect(plainLink).not.toBeNull();
        expect(plainLink).not.toMatch(/invitation\/accept/);
        const control = await anonymousContext(browser, baseURL);
        try {
            const page = await control.newPage();
            await page.goto(plainLink);
            const login = new LoginPage(page);
            await expect(login.usernameInput).toBeVisible({timeout: 30_000});
            await login.signIn(REVIEWER, getPassword(REVIEWER));
            await page.waitForURL(/\/reviewer\/submission/, {waitUntil: 'commit'});
            await new ReviewWizardPage(page, JOURNAL).expectOpen();
        } finally {
            await control.close();
        }
    });

    test('S11: read an earlier round\'s review', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s11', testInfo);
        const {submissionId, title} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });
        const roundOneText = `Round one text ${tag}`;

        // Julia submits round 1 with a recommendation.
        const page = await (await asUser(REVIEWER)).newPage();
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);
        await wizard.typeComments(roundOneText);
        await wizard.chooseRecommendation('Revisions Required');
        await wizard.submitReview();
        await wizard.expectCompleted();

        // The editor opens round 2 and asks Julia again.
        const editorPage = await (await asUser(EDITOR)).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        await workflow.decisionButton('Create New Review Round').click();
        const decision = new DecisionPage(editorPage);
        await decision.expectOpen('New Review Round');
        await decision.completeAll();
        await workflow.expectPageTitle('Review (Round 2)');
        await addReviewer(editorPage, REVIEWER_NAME);

        // The wizard opens with "Previous Reviews"; the window shows the
        // round-1 review.
        await wizard.goto(submissionId);
        await expect(wizard.previousReviewLine(1)).toHaveText(/Round 1 Review Submitted on \d{4}-\d{2}-\d{2}/);
        const history = await wizard.openRoundHistory(1);
        await expect(history).toContainText('Round 1 Review submitted by you for');
        await expect(history).toContainText(title);
        await expect(history).toContainText('Reviewer Comments');
        await expect(history).toContainText('For editors and authors');
        await expect(history).toContainText(roundOneText);
        await expect(history).toContainText('Recommendation');
        await expect(history).toContainText('Revisions Required');
        await expect(history).toContainText('General Information');
        await expect(history).toContainText("Editor's Request");
        await expect(history).toContainText('Review Submitted On');
        await wizard.closeRoundHistory(history);

        // Control: a round-1 request declined with a typed reason reads the
        // decline in the window instead.
        const controlTag = `${tag}b`;
        const reason = `No time this month ${controlTag}`;
        const {submissionId: controlId} = await seedInReview(ojsApi, controlTag, {
            reviewers: [{username: 'reviewer.paul', status: 'invited'}],
        });
        const paulPage = await (await asUser('reviewer.paul')).newPage();
        const paulWizard = new ReviewWizardPage(paulPage, JOURNAL);
        await paulWizard.goto(controlId);
        await paulWizard.decline({appendText: reason});
        await workflow.gotoEditorial(controlId);
        await workflow.decisionButton('Create New Review Round').click();
        await decision.expectOpen('New Review Round');
        await decision.completeAll();
        await workflow.expectPageTitle('Review (Round 2)');
        await addReviewer(editorPage, 'Paul Reviewer');
        await paulWizard.goto(controlId);
        const declined = await paulWizard.openRoundHistory(1);
        await expect(declined).toContainText('Declined Date');
        await expect(declined).toContainText('Decline reason sent by email');
        await expect(declined).toContainText('Unable to Review');
        await expect(declined).toContainText(reason);
    });

    test('S12: nothing can be saved after submission', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s12', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });
        const controlTag = `${tag}b`;
        const {submissionId: controlId} = await seedInReview(ojsApi, controlTag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });
        const fileName = `reviewer-${tag}.txt`;

        // A submitted review carrying one reviewer file.
        const page = await (await asUser(REVIEWER)).newPage();
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);
        await wizard.expectReviewerFilesSettled();
        await wizard.uploadReviewerFile(fileName);
        await wizard.chooseRecommendation('Accept Submission');
        await wizard.submitReview();
        await wizard.expectCompleted();

        // From "View": every tab opens; steps 1 and 2 are disabled.
        const list = new ReviewerAssignmentsPage(page, JOURNAL);
        await list.goto('completed');
        await list.openWizard(list.row(tag), 'View');
        await wizard.expectCompleted();
        for (const step of [1, 2, 3, 4]) {
            await wizard.expectTabEnabled(step);
        }
        await wizard.goto(submissionId, {step: 1});
        await wizard.expectStep(1);
        await expect(wizard.saveAndContinueButton).toBeDisabled();
        await wizard.goto(submissionId, {step: 2});
        await wizard.expectStep(2);
        await expect(wizard.continueToStep3Button).toBeDisabled();

        // Step 3: both buttons disabled, no "Upload File", the file's row
        // offers "Edit" but no "Delete".
        await wizard.goto(submissionId, {step: 3});
        await wizard.expectStep(3);
        await expect(wizard.submitReviewButton).toBeDisabled();
        await expect(wizard.saveForLaterButton).toBeDisabled();
        await wizard.expectReviewerFilesSettled();
        await expect(wizard.uploadFileLink).toHaveCount(0);
        const actions = await wizard.reviewerFileActions(wizard.reviewerFileRow(fileName));
        await expect(actions.getByRole('link', {name: 'Edit', exact: true})).toBeVisible();
        await expect(actions.getByRole('link', {name: 'Delete', exact: true})).toHaveCount(0);

        // Control: the same reviewer's other, still-open assignment offers all of them.
        await wizard.goto(controlId);
        await expect(wizard.saveAndContinueButton).toBeEnabled();
        await wizard.saveAndContinueButton.click();
        await wizard.expectStep(2);
        await expect(wizard.continueToStep3Button).toBeEnabled();
        await wizard.continueToStep3();
        await expect(wizard.submitReviewButton).toBeEnabled();
        await expect(wizard.saveForLaterButton).toBeEnabled();
        await wizard.expectReviewerFilesSettled();
        await expect(wizard.uploadFileLink).toBeVisible();
        await wizard.uploadReviewerFile(`reviewer-${controlTag}.txt`);
        const openActions = await wizard.reviewerFileActions(wizard.reviewerFileRow(`reviewer-${controlTag}.txt`));
        await expect(openActions.getByRole('link', {name: 'Edit', exact: true})).toBeVisible();
        await expect(openActions.getByRole('link', {name: 'Delete', exact: true})).toBeVisible();
    });

    test('S13: declare competing interests', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s13', testInfo);
        const manager = `mgr${tag}`;
        const reviewer = `rev${tag}`;
        const author = `au${tag}`;
        const policy = `Reviewers disclose every competing interest for ${tag}.`;
        const statement = `I once co-authored with the author ${tag}`;
        await ojsApi.createContext({
            tag,
            review: {competingInterests: policy},
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer'], givenName: 'Candid', familyName: `Reviewer${tag}`},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [{username: reviewer, status: 'invited'}],
        });

        const page = await (await asUser(reviewer)).newPage();
        const wizard = new ReviewWizardPage(page, tag);
        await wizard.goto(submissionId);
        const form = page.locator('#reviewStep1Form');
        await expect(form).toContainText('Competing Interests');
        await expect(form).toContainText('This publisher has a policy for disclosure of potential competing interests');
        await expect(wizard.noCompetingInterestsRadio).toBeChecked();
        await expect(wizard.hasCompetingInterestsRadio).not.toBeChecked();

        // The policy dialog.
        await wizard.competingInterestsLink.click();
        const policyDialog = page.getByRole('dialog').filter({hasText: policy});
        await expect(policyDialog).toBeVisible({timeout: 30_000});
        await wizard.closeDialog(policyDialog);

        // Declare, and accept.
        await wizard.hasCompetingInterestsRadio.check();
        await wizard.typeInto(wizard.competingInterestsBody, statement);
        await wizard.accept();

        // The editor's row carries the "Competing Interests" badge.
        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', 'Candid');
        await expect(row).toContainText('Request Accepted');
        await expect(row).toContainText('Competing Interests');

        // Control: on the seeded journal (no policy) step 1 has no such section.
        const controlTag = `${tag}b`;
        const {submissionId: controlId} = await seedInReview(ojsApi, controlTag, {
            reviewers: [{username: REVIEWER, status: 'invited'}],
        });
        const juliaPage = await (await asUser(REVIEWER)).newPage();
        const controlWizard = new ReviewWizardPage(juliaPage, JOURNAL);
        await controlWizard.goto(controlId);
        const controlForm = juliaPage.locator('#reviewStep1Form');
        await expect(controlForm).toContainText('Review Schedule');
        await expect(controlForm).not.toContainText('Competing Interests');
        await expect(controlWizard.noCompetingInterestsRadio).toHaveCount(0);
    });

    test('S14: left behind when the submission moves on', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s14', testInfo);
        // A seeded acceptance on a submission the editor has since accepted
        // (the API's promote-from-review decision is `accept`, footnote s).
        const {submissionId} = await seedInReview(ojsApi, tag, {
            decisions: ['sendExternalReview', 'accept'],
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });

        const page = await (await asUser(REVIEWER)).newPage();
        const list = new ReviewerAssignmentsPage(page, JOURNAL);
        await list.goto('archived');
        const row = list.row(tag);
        await expect(row).toContainText('Incomplete');
        await expect(list.rowActions(row)).toHaveCount(0);
        await list.expectInViews(tag, ['archived']);

        // The wizard still opens at step 1 and takes a full review (A11's
        // record; the scenario's own walk).
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await wizard.expectStep(1);
        await expect(wizard.saveAndContinueButton).toBeEnabled();
        await walkToStep3(wizard);
        await wizard.typeComments(`Late review ${tag}`);
        await wizard.chooseRecommendation('Accept Submission');
        await wizard.submitReview();
        await wizard.expectCompleted();

        // The row moved from "Archived" to "Completed".
        await list.goto('completed');
        const doneRow = list.row(tag);
        await expect(doneRow).toContainText(/Review submitted on \d{4}-\d{2}-\d{2}/);
        await expect(list.rowAction(doneRow, 'View')).toBeVisible();
        await list.expectInViews(tag, ['all', 'completed']);

        // Control: a review submitted BEFORE the submission moved on sits
        // under "Completed" with "View" once the editor accepts.
        const controlTag = `${tag}b`;
        const {submissionId: controlId} = await seedInReview(ojsApi, controlTag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });
        await wizard.goto(controlId);
        await walkToStep3(wizard);
        await wizard.chooseRecommendation('Accept Submission');
        await wizard.submitReview();
        await wizard.expectCompleted();
        const editorPage = await (await asUser(EDITOR)).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(controlId);
        await workflow.decisionButton('Accept Submission').click();
        const decision = new DecisionPage(editorPage);
        await decision.expectOpen('Accept Submission');
        await decision.completeAll();
        await workflow.expectPageTitle('Copyediting');
        await list.goto('completed');
        const controlRow = list.row(controlTag);
        await expect(controlRow).toContainText(/Review submitted on \d{4}-\d{2}-\d{2}/);
        await expect(list.rowAction(controlRow, 'View')).toBeVisible();
    });

    test('S16: the recommendation reaches the editor', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s16', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: REVIEWER, status: 'accepted'}],
        });

        const page = await (await asUser(REVIEWER)).newPage();
        const wizard = new ReviewWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);
        await wizard.typeComments(`Needs work ${tag}`);
        await wizard.chooseRecommendation('Revisions Required');
        await wizard.submitReview();
        await wizard.expectCompleted();

        // The editor's row: "Review Submitted" with the recommendation under it
        // (the later round's window is scenario 11's).
        const editorPage = await (await asUser(EDITOR)).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', REVIEWER_NAME);
        await expect(row).toContainText('Review Submitted');
        await expect(row).toContainText('Revisions Required');
    });
});
