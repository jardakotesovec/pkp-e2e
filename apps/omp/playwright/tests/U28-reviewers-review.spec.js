// @ts-check
/**
 * @file playwright/tests/U28-reviewers-review.spec.js
 *
 * U28 — Reviewer's review, OMP suite (spec: docs/specs/U28-reviewers-review.md).
 * One test per canonical scenario a press runs, in OMP vocabulary (press,
 * monograph, "Book Title", the private box "For editor only"; the roster
 * splits julia/paul → External Reviewers, amara/adam → Internal Reviewers):
 * the common scenarios 1–14 on External Review, plus the {OMP} scenario 15
 * (two stages, no recommendation — OMP1 ✅). Scenario 16 is OJS's and 17 is
 * OPS's. The reviewer's screens are driven through the shared
 * `ReviewerPages.js` (the list and the wizard); the editor's side through
 * the OMP `ReviewStagePages.js` / `ReviewerAssignmentPages.js`.
 *
 * Deliberate omissions (register IDs from the spec's Findings register —
 * 🐞 findings are never asserted as contract, PRINCIPLES M3):
 * - A1 (bug): the list's search, sort and pager are not exercised; rows are
 *   found by the seed tag in the title on the full list.
 * - A2 (bug): S11 reads only the round-1 line of a SUBMITTED review (with a
 *   date); nothing is asserted about a dateless line.
 * - A3 (open): S3 waits only for the browser to leave the wizard after the
 *   decline; the landing page itself is not asserted.
 * - A4 (bug): S5 saves once and never empties a saved box.
 * - A5 (bug): S2 asserts the accepted row's sentence up to the date; the
 *   clock time is not asserted.
 * - A6 (bug): no file link is opened by an account without file access.
 * - A7 (bug): S7 asserts that the empty submit goes through as the spec's
 *   scenario prescribes (the behavior the register flags), and nothing
 *   about what the editor then receives beyond the mail's arrival.
 * - A9 / A10 (bugs): S10 opens each one-click link before any further mail
 *   reaches that reviewer and never in a browser signed in as somebody
 *   else; the dead-link 404 and the blank page are not asserted.
 * - A11 (open): S14 drives the archived wizard through "Submit Review" as
 *   scenario 14 prescribes; whether that wizard should be read-only is the
 *   open question, so the assertions there follow the spec's current text.
 * - A12 (bug): nothing is asserted about a "Previous Reviews" box on the
 *   reviewer's current round; S11 reads it only from the round-2 wizard.
 * - A13 (open): the round-history window's file lists are not asserted.
 * - OMP2 (bug): S6 and S15 assert that the "Review complete" email arrives,
 *   never its "recommends None" subject.
 * - OMP3 (bug): S8 asserts the refusal box's second sentence only, never
 *   its first line (the raw key).
 * - Rule 4 (filters), Rule 5 (the header's "Dashboard" link) and the
 *   discussions panel's mechanics have no canonical scenario here.
 *
 * Seeding: scenario endpoints only. Scenarios 1–7, 11, 12 and 14 run on the
 * seeded press with the roster reviewers and scratch monographs; scenarios
 * 8, 9, 10, 13 and 15 on scratch presses configured through the `review`
 * and `reviewForms` passthrough keys with throwaway accounts. Mailpit is
 * shared: every read is scoped by recipient plus the seed tag (the title
 * carries it), silence claims are paired with a positive control. All tests
 * run in the parallel `omp` project — nothing here mutates shared
 * singletons.
 */
const {test, expect} = require('../support/fixtures.js');
const {getEmail, getPassword} = require('../../../../shared/playwright/data/users.js');
const {disableMotion} = require('../../../../shared/playwright/support/motion.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {
    ReviewerAssignmentsPage,
    ReviewWizardPage,
    signInAtContext,
} = require('../../../../shared/playwright/pages/ReviewerPages.js');
const {
    decisionButton,
    openEditorial,
    walkDecisionWizard,
    openTasksPanel,
    uploadRoundReviewFile,
} = require('../pages/ReviewStagePages.js');
const {
    reviewerRow,
    addReviewerFromList,
    grantFileToReviewer,
    completeReview,
} = require('../pages/ReviewerAssignmentPages.js');

const PK = 'publicknowledge';
const ANA = 'sectioneditor.ana';
const JULIA = 'reviewer.julia';
const PAUL = 'reviewer.paul';
const PRIVATE_BOX = 'For editor only';

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/** The seeded title carries the tag, so list rows and mails are found by it. */
function titleFor(tag) {
    return `Monograph ${tag}`;
}

/**
 * Seed a monograph on the seeded press straight into External Review round
 * 1 with the given reviewers; ana is on the stage so the reviewer's
 * response and review-complete emails have a roster recipient (fn s).
 */
async function seedExternal(ompApi, tag, reviewers = [], extra = {}) {
    return ompApi.createSubmission({
        tag,
        context: PK,
        submitter: 'author.alex',
        series: 'monographs',
        title: titleFor(tag),
        decisions: ['skipInternalReview'],
        reviewRounds: [{stage: 'external', reviewers}],
        participants: [{username: ANA, role: 'sectionEditor'}],
        ...extra,
    });
}

/**
 * Seed a scratch press (its own review setup, its own mailboxes) with a
 * manager, an author, a series editor with a unique mailbox, and the given
 * extra users. Returns the usernames and the editor's address.
 */
async function seedScratchPress(ompApi, tag, {users = [], review, reviewForms} = {}) {
    const manager = `mgr${tag}`;
    const author = `au${tag}`;
    const editor = `se${tag}`;
    const editorEmail = `${tag}se@mail.test`;
    const spec = {
        tag,
        users: [
            {username: manager, roles: ['manager'], givenName: `Mgr${tag}`, familyName: 'Manager'},
            {username: author, roles: ['author'], givenName: `Au${tag}`, familyName: 'Author'},
            {username: editor, roles: ['sectionEditor'], givenName: `Se${tag}`, familyName: 'Editor', email: editorEmail},
            ...users,
        ],
    };
    if (review) {
        spec.review = review;
    }
    if (reviewForms) {
        spec.reviewForms = reviewForms;
    }
    await ompApi.createContext(spec);
    return {manager, author, editor, editorEmail};
}

/** Seed a monograph on a scratch press into one review round. */
async function seedScratchMonograph(ompApi, tag, press, {reviewers = [], stage = 'external'} = {}) {
    return ompApi.createSubmission({
        tag,
        context: press.path,
        submitter: press.author,
        title: titleFor(tag),
        decisions: [stage === 'internal' ? 'sendInternalReview' : 'skipInternalReview'],
        reviewRounds: [{stage, reviewers}],
        participants: [{username: press.editor, role: 'sectionEditor'}],
    });
}

/** A signed-out browser context (never inherits a storage state). */
async function anonymousPage(browser, baseURL) {
    const ctx = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    await disableMotion(ctx);
    return ctx.newPage();
}

/** The wizard and list page objects for a page on a context. */
function reviewerScreens(page, contextPath) {
    return {
        list: new ReviewerAssignmentsPage(page, contextPath),
        wizard: new ReviewWizardPage(page, contextPath, {privateBoxLabel: PRIVATE_BOX}),
    };
}

/** From an accepted (seeded) request to step 3: "Save and continue", "Continue to Step #3". */
async function walkToStep3(wizard, submissionId) {
    await wizard.goto(submissionId);
    await wizard.expectStep(1);
    await wizard.saveAndContinueButton.click();
    await wizard.expectStep(2);
    await wizard.continueToStep3();
}

test.describe("Reviewer's review (U28)", () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: the request appears in the reviewer\'s list', async ({ompApi, browser, baseURL}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s1');
        const seeded = await seedExternal(ompApi, tag, [{username: JULIA, status: 'invited'}]);

        // Signing in on the press's Login page lands on "Action Required by me".
        const page = await anonymousPage(browser, baseURL);
        await signInAtContext(page, PK, JULIA, getPassword(JULIA));
        await page.waitForURL(
            (url) =>
                url.pathname.includes('/dashboard/reviewAssignments') &&
                url.searchParams.get('currentViewId') === 'reviewer-action-required',
            {waitUntil: 'commit'}
        );
        const {list} = reviewerScreens(page, PK);
        await list.expectSettled();
        await expect(list.heading()).toHaveText(/^\s*Action Required by me \(\d+\)\s*$/);

        // The sidebar entry and the heading both carry a count that includes
        // this request (never asserted equal: a shared roster reviewer gains
        // requests from parallel workers between the two reads).
        const headingCount = Number((await list.heading().innerText()).match(/\((\d+)\)/)[1]);
        expect(headingCount).toBeGreaterThanOrEqual(1);
        expect(await list.viewCount('actionRequired')).toBeGreaterThanOrEqual(1);

        // The row: ID, title, the unanswered sentence and "Respond to request".
        const row = list.row(tag);
        await expect(row).toBeVisible();
        await expect(row).toContainText(String(seeded.submissionId));
        await expect(row).toContainText(titleFor(tag));
        await expect(row).toContainText('Please accept or decline this request by');
        await expect(list.rowAction(row, 'Respond to request')).toBeVisible();

        // Control: a reviewer-only account has no "Editor Dashboard" group.
        await expect(list.reviewerGroup).toBeVisible();
        await expect(list.editorGroup).toHaveCount(0);

        // The same row is under "All assignments" and in no other view.
        await list.expectInViews(tag, ['actionRequired', 'all']);
    });

    test('S2: accept a review request', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s2');
        const seeded = await seedExternal(ompApi, tag, [{username: JULIA, status: 'invited'}]);

        const page = await (await asUser(JULIA)).newPage();
        const {list, wizard} = reviewerScreens(page, PK);
        await list.goto('actionRequired');
        await list.openWizard(list.row(tag), 'Respond to request');
        await wizard.expectOpen(titleFor(tag));
        await wizard.expectStep(1);
        await wizard.expectTabDisabled(2);
        await wizard.expectTabDisabled(3);
        await wizard.expectTabDisabled(4);

        // Review Type and the Review Schedule dates.
        await expect(page.getByText('Anonymous Reviewer/Anonymous Author')).toBeVisible();
        // The "Review Schedule" block: three read-only dates.
        await expect(page.getByText('Review Schedule')).toBeVisible();
        for (const label of ["Editor's Request", 'Response Due Date', 'Review Due Date']) {
            await expect(page.getByRole('textbox', {name: label})).toHaveValue(/\d{4}-\d{2}-\d{2}/);
        }

        // "View All Submission Details": title and abstract, no authors on an
        // anonymous review.
        const details = await wizard.openSubmissionDetails();
        await expect(details).toContainText(titleFor(tag));
        await expect(details).toContainText(`Seeded abstract for ${tag}.`);
        await expect(details.getByText('Authors', {exact: true})).toHaveCount(0);
        await wizard.closeDialog(details);

        // "About Due Dates".
        const about = await wizard.openAboutDueDates();
        await expect(about).toContainText('complete the review by the Review Due Date.');
        await wizard.closeDialog(about);

        // Accepting without the privacy box is refused; the step stays.
        await wizard.acceptButton.click();
        await expect(page.getByText('This field is required.').first()).toBeVisible();
        await wizard.expectStep(1);
        await expect(wizard.acceptButton).toBeVisible();

        // Ticked, the accept lands on step 2 with the empty-guidelines text.
        await wizard.accept();
        await expect(page.getByText('This publisher has not set any reviewer guidelines.')).toBeVisible();

        // Reloaded, the wizard opens on step 2 and step 1 offers "Save and continue".
        await page.reload();
        await wizard.expectOpen();
        await wizard.expectStep(2);
        await wizard.selectStep(1);
        await expect(wizard.saveAndContinueButton).toBeVisible();
        await expect(wizard.acceptButton).toHaveCount(0);

        // The list row moved to the accepted wording with "Finish review".
        await list.goto('actionRequired');
        const row = list.row(tag);
        await expect(row).toContainText('Please complete this review by');
        await expect(list.rowAction(row, 'Finish review')).toBeVisible();

        // The assigned editor's mailbox holds "Review accepted: …".
        await pkpMail.find({to: getEmail(ANA), subject: 'Review accepted', contains: tag});
    });

    test('S3: decline a review request', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s3');
        const reason = `Reason${tag}`;
        const seeded = await seedExternal(ompApi, tag, [{username: JULIA, status: 'invited'}]);

        const page = await (await asUser(JULIA)).newPage();
        const {list, wizard} = reviewerScreens(page, PK);
        await wizard.goto(seeded.submissionId);
        await wizard.expectStep(1);

        // The window opens prefilled; a line is added and the decline sent.
        const dialog = await wizard.openDecline();
        const body = wizard.declineMessageBody();
        await expect(body).toContainText('I am afraid that at this time I am unable to review');
        await expect(dialog).toContainText('You may provide the editor with any reasons why you are declining');
        await body.click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await body.pressSequentially(reason);
        await dialog.getByRole('button', {name: 'Decline Review Request', exact: true}).click();
        await page.waitForURL((url) => !url.pathname.includes('/reviewer/'), {
            timeout: 30_000,
            waitUntil: 'commit',
        });
        // (Where the browser lands is register question A3, unasserted.)

        // The row reads "Request declined on {date}" with no button, under
        // "Declined" only.
        await list.goto('declined');
        const row = list.row(tag);
        await expect(row).toContainText(/Request declined on \d{4}-\d{2}-\d{2}/);
        await expect(list.rowActions(row)).toHaveCount(0);
        await list.expectInViews(tag, ['declined']);

        // The wizard is closed to the reviewer from now on.
        await page.goto(wizard.url(seeded.submissionId));
        await expect(
            page.getByText('The current user is not assigned as a reviewer for the requested document.')
        ).toBeVisible({timeout: 30_000});

        // The assigned editor's mailbox holds "Unable to Review" with the
        // edited message.
        await pkpMail.find({to: getEmail(ANA), subject: 'Unable to Review', contains: reason});
    });

    test('S4: download the files for review', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s4');
        const ticked = `${tag}A.txt`;
        const unticked = `${tag}B.txt`;
        const seeded = await seedExternal(ompApi, tag, [{username: JULIA, status: 'accepted'}]);

        // The editor puts two files on the round and ticks one for Julia.
        const editorPage = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(editorPage, PK, seeded.submissionId);
        await uploadRoundReviewFile(editorPage, modal, ticked);
        await uploadRoundReviewFile(editorPage, modal, unticked);
        await grantFileToReviewer(editorPage, reviewerRow(modal, 'Julia Reviewer'), ticked);

        // Step 1 lists the ticked file only, and its name downloads.
        const page = await (await asUser(JULIA)).newPage();
        const {wizard} = reviewerScreens(page, PK);
        await wizard.goto(seeded.submissionId);
        await wizard.expectReviewFilesSettled(1);
        await expect(wizard.reviewFileLink(1, ticked)).toBeVisible();
        await expect(wizard.reviewFileLink(1, unticked)).toHaveCount(0);
        const download = await wizard.downloadReviewFile(1, ticked);
        expect(download.suggestedFilename()).toBeTruthy();

        // The same list heads step 3.
        await wizard.saveAndContinueButton.click();
        await wizard.expectStep(2);
        await wizard.continueToStep3();
        await wizard.expectReviewFilesSettled(3);
        await expect(wizard.reviewFileLink(3, ticked)).toBeVisible();
        await expect(wizard.reviewFileLink(3, unticked)).toHaveCount(0);
    });

    test('S5: save a review for later', async ({ompApi, asUser, pkpMail, browser, baseURL}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s5');
        const controlTag = makeTag(testInfo, 'u28s5c');
        const shared = `Shared draft ${tag}`;
        const priv = `Private draft ${tag}`;
        // A scratch press: the "Your changes have been saved." toast is
        // server-fed per user, and a roster reviewer's queue is shared with
        // every parallel test signed in as them (patterns.md, parallel
        // lesson 2); the throwaway reviewer's queue is this test's alone.
        const reviewer = `rv${tag}`;
        const controlReviewer = `rc${tag}`;
        const press = {
            path: tag,
            ...(await seedScratchPress(ompApi, tag, {
                users: [
                    {username: reviewer, roles: ['externalReviewer'], givenName: `Rv${tag}`, familyName: 'Reviewer'},
                    {username: controlReviewer, roles: ['externalReviewer'], givenName: `Rc${tag}`, familyName: 'Reviewer'},
                ],
            })),
        };
        const seeded = await seedScratchMonograph(ompApi, tag, press, {
            reviewers: [{username: reviewer, status: 'accepted'}],
        });
        const control = await seedScratchMonograph(ompApi, controlTag, press, {
            reviewers: [{username: controlReviewer, status: 'accepted'}],
        });

        const page = await (await asUser(reviewer)).newPage();
        const {wizard} = reviewerScreens(page, tag);
        await walkToStep3(wizard, seeded.submissionId);
        await expect(page.getByText(PRIVATE_BOX).first()).toBeVisible();
        await wizard.typeComments(shared);
        await wizard.typePrivateComments(priv);
        await wizard.saveForLater();
        await wizard.expectStep(3);
        await expect(wizard.submitReviewButton).toBeVisible();

        // Signed out and in again: the row still reads "Finish review" and
        // the wizard opens on step 3 with both texts restored.
        const fresh = await anonymousPage(browser, baseURL);
        await signInAtContext(fresh, tag, reviewer, getPassword(reviewer));
        const {list: freshList, wizard: freshWizard} = reviewerScreens(fresh, tag);
        await freshList.goto('actionRequired');
        const row = freshList.row(tag);
        await expect(freshList.rowAction(row, 'Finish review')).toBeVisible();
        await freshList.openWizard(row, 'Finish review');
        await freshWizard.expectOpen(titleFor(tag));
        await freshWizard.expectStep(3);
        await expect(freshWizard.commentsBody).toContainText(shared);
        await expect(freshWizard.privateCommentsBody).toContainText(priv);

        // Control: the editor's row still reads "Request Accepted"…
        const editorPage = await (await asUser(press.manager)).newPage();
        const modal = await openEditorial(editorPage, tag, seeded.submissionId);
        await expect(reviewerRow(modal, `Rv${tag} Reviewer`)).toContainText('Request Accepted');

        // …and no review-complete email went out (bounded by a positive
        // control: the other reviewer's submitted review on another
        // monograph of the same press).
        const controlPage = await (await asUser(controlReviewer)).newPage();
        await completeReview(controlPage, tag, control.submissionId, {comment: `Control ${controlTag}`});
        // (The scope is the title phrase: the press's name and the editor's
        // own address carry the tag, so the bare tag would match every mail.)
        await pkpMail.expectNone({
            to: press.editorEmail,
            subject: 'Review complete',
            contains: titleFor(tag),
            afterControl: {to: press.editorEmail, subject: 'Review complete', contains: titleFor(controlTag)},
        });
    });

    test('S6: submit a free-form review', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s6');
        const seeded = await seedExternal(ompApi, tag, [{username: JULIA, status: 'accepted'}]);

        const page = await (await asUser(JULIA)).newPage();
        const {list, wizard} = reviewerScreens(page, PK);
        await walkToStep3(wizard, seeded.submissionId);
        await wizard.typeComments(`Review text ${tag}`);
        await wizard.submitReview();

        // "4. Completion": "Review Submitted" and the thank-you text.
        await wizard.expectCompleted();
        await expect(
            page.getByText('Thank you for completing the review of this submission.')
        ).toBeVisible();

        // All four tabs open; step 3's buttons are disabled.
        for (const step of [1, 2, 3, 4]) {
            await wizard.expectTabEnabled(step);
        }
        await wizard.goto(seeded.submissionId, {step: 3});
        await expect(wizard.submitReviewButton).toBeDisabled();
        await expect(wizard.saveForLaterButton).toBeDisabled();

        // The row reads "Review submitted on {date}" with "View", under
        // "Completed"; "View" opens the wizard on "4. Completion".
        await list.goto('completed');
        const row = list.row(tag);
        await expect(row).toContainText(/Review submitted on \d{4}-\d{2}-\d{2}/);
        await expect(list.rowAction(row, 'View')).toBeVisible();
        await list.openWizard(row, 'View');
        await wizard.expectOpen(titleFor(tag));
        await wizard.expectStep(4);

        // The assigned editor's mailbox holds "Review complete: …" (its
        // "recommends None" subject is register finding OMP2, unasserted).
        await pkpMail.find({to: getEmail(ANA), subject: 'Review complete', contains: tag});

        // The editor's header "Tasks" panel gains no entry for it (bounded by
        // the panel's own table).
        const anaPage = await (await asUser(ANA)).newPage();
        await anaPage.goto(`/index.php/${PK}/dashboard/editorial`);
        const tasks = await openTasksPanel(anaPage);
        await expect(tasks.getByText(tag)).toHaveCount(0);
    });

    test('S7: nothing stops an empty review', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s7');
        const controlTag = makeTag(testInfo, 'u28s7c');
        const fileName = `${controlTag}.txt`;
        const seeded = await seedExternal(ompApi, tag, [{username: JULIA, status: 'accepted'}]);
        const control = await seedExternal(ompApi, controlTag, [{username: PAUL, status: 'accepted'}]);

        // Nothing typed, no file: the confirmation appears at once with no
        // field marked, and "OK" submits (register finding A7's behavior,
        // as scenario 7 prescribes).
        const page = await (await asUser(JULIA)).newPage();
        const {wizard} = reviewerScreens(page, PK);
        await walkToStep3(wizard, seeded.submissionId);
        await wizard.expectReviewerFilesSettled();
        await expect(wizard.reviewerFilesGrid).toContainText('No Files');
        const confirm = await wizard.pressSubmitReview();
        await expect(page.locator('label.error')).toHaveCount(0);
        await confirm.getByRole('button', {name: 'OK', exact: true}).click();
        await wizard.expectCompleted();
        await pkpMail.find({to: getEmail(ANA), subject: 'Review complete', contains: tag});

        // Control: a reviewer file attached under "Upload" lists with "Edit"
        // and "Delete", and the empty boxes still submit.
        const paulPage = await (await asUser(PAUL)).newPage();
        const {wizard: paulWizard} = reviewerScreens(paulPage, PK);
        await walkToStep3(paulWizard, control.submissionId);
        await paulWizard.expectReviewerFilesSettled();
        await paulWizard.uploadReviewerFile(fileName);
        const fileRow = paulWizard.reviewerFileRow(fileName);
        await fileRow.locator('a.show_extras').click();
        await expect(paulWizard.reviewerFilesGrid.getByRole('link', {name: 'Edit', exact: true})).toBeVisible();
        await expect(paulWizard.reviewerFilesGrid.getByRole('link', {name: 'Delete', exact: true})).toBeVisible();
        await paulWizard.submitReview();
        await paulWizard.expectCompleted();
    });

    test('S8: a review form instead of free text', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s8');
        const formTitle = `Form ${tag}`;
        const formDescription = `Form description ${tag}`;
        const question = `Is the work sound ${tag}`;
        const reviewer = `rv${tag}`;
        const press = {
            path: tag,
            ...(await seedScratchPress(ompApi, tag, {
                users: [{username: reviewer, roles: ['externalReviewer'], givenName: `Rv${tag}`, familyName: 'Reviewer'}],
                reviewForms: [
                    {
                        title: formTitle,
                        description: formDescription,
                        elements: [{question, type: 'radiobuttons', required: true, options: ['Yes', 'No']}],
                    },
                ],
            })),
        };
        const seeded = await seedScratchMonograph(ompApi, tag, press, {
            reviewers: [{username: reviewer, status: 'accepted', reviewForm: formTitle}],
        });

        const page = await (await asUser(reviewer)).newPage();
        const {wizard} = reviewerScreens(page, tag);
        await walkToStep3(wizard, seeded.submissionId);

        // The form's title, description and its required question replace the
        // two text boxes.
        await expect(page.getByText(formTitle).first()).toBeVisible();
        await expect(page.getByText(formDescription).first()).toBeVisible();
        const section = page.locator('#reviewStep3Form .section').filter({hasText: question}).first();
        await expect(section).toContainText('*');
        await expect(section.locator('fieldset[id^="reviewFormResponses"]')).toBeVisible();
        await expect(wizard.formRadio('Yes')).toBeVisible();
        await expect(page.locator('iframe[id^="comments"]')).toHaveCount(0);

        // Unanswered: the confirmation first, then the refusal box under the
        // buttons (its first line is register finding OMP3, unasserted), the
        // step stays and no question is marked.
        await wizard.submitReview();
        await expect(wizard.messageBox).toContainText(
            'Some required fields are not filled in. Please complete them before submitting your review.'
        );
        await wizard.expectStep(3);
        await expect(wizard.submitReviewButton).toBeVisible();
        await expect(wizard.formRadio('Yes')).not.toBeChecked();
        await expect(wizard.formRadio('No')).not.toBeChecked();
        await expect(page.locator('label.error')).toHaveCount(0);

        // "Save for Later" saves with the question still open; a reload
        // shows it still unanswered.
        await wizard.saveForLater();
        await wizard.goto(seeded.submissionId, {step: 3});
        await wizard.expectStep(3);
        await expect(wizard.formRadio('Yes')).not.toBeChecked();
        await expect(wizard.formRadio('No')).not.toBeChecked();

        // Answered, the submit goes through to step 4.
        await wizard.formRadio('Yes').check();
        await wizard.submitReview();
        await wizard.expectCompleted();
    });

    test('S9: restricted file access', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s9');
        const fileName = `${tag}A.txt`;
        const reviewer = `rv${tag}`;
        const press = {
            path: tag,
            ...(await seedScratchPress(ompApi, tag, {
                users: [{username: reviewer, roles: ['externalReviewer'], givenName: `Rv${tag}`, familyName: 'Reviewer'}],
                review: {restrictReviewerFileAccess: true},
            })),
        };
        const seeded = await seedScratchMonograph(ompApi, tag, press, {
            reviewers: [{username: reviewer, status: 'invited'}],
        });

        // The editor puts one file on the round and ticks it for the reviewer.
        const editorPage = await (await asUser(press.manager)).newPage();
        const modal = await openEditorial(editorPage, tag, seeded.submissionId);
        await uploadRoundReviewFile(editorPage, modal, fileName);
        await grantFileToReviewer(editorPage, reviewerRow(modal, `Rv${tag} Reviewer`), fileName);

        // Step 1 shows no "Review Files" list at all (bounded by the step's
        // other content); after accepting, step 3 lists the file and it
        // downloads. Control: scenario 4 (the setting off on the seeded press).
        const page = await (await asUser(reviewer)).newPage();
        const {wizard} = reviewerScreens(page, tag);
        await wizard.goto(seeded.submissionId);
        await expect(page.getByText('Review Type', {exact: true})).toBeVisible();
        await expect(page.locator('main')).not.toContainText('Loading');
        await expect(page.getByRole('heading', {name: 'Review Files'})).toHaveCount(0);
        await expect(wizard.reviewFilesGrid(1)).toHaveCount(0);
        await wizard.accept();
        await wizard.continueToStep3();
        await wizard.expectReviewFilesSettled(3);
        await expect(wizard.reviewFileLink(3, fileName)).toBeVisible();
        const download = await wizard.downloadReviewFile(3, fileName);
        expect(download.suggestedFilename()).toBeTruthy();
    });

    test('S10: one-click access', async ({ompApi, asUser, pkpMail, browser, baseURL}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s10');
        const controlTag = makeTag(testInfo, 'u28s10c');
        const reviewer = `rv${tag}`;
        const reviewerEmail = `${tag}rv@mail.test`;
        const press = {
            path: tag,
            ...(await seedScratchPress(ompApi, tag, {
                users: [{username: reviewer, roles: ['externalReviewer'], givenName: `Rv${tag}`, familyName: 'Reviewer', email: reviewerEmail}],
                review: {reviewerAccessKeysEnabled: true},
            })),
        };
        const seeded = await seedScratchMonograph(ompApi, tag, press);

        // Only the editor's "Add Reviewer" window sends the request email
        // (seed-facts), so the reviewer is added through it.
        const editorPage = await (await asUser(press.manager)).newPage();
        const modal = await openEditorial(editorPage, tag, seeded.submissionId);
        await addReviewerFromList(editorPage, modal, {search: `Rv${tag}`, name: `Rv${tag} Reviewer`});
        const mail = await pkpMail.find({to: reviewerEmail, subject: 'Manuscript Review Request'});
        const link = pkpMail.extractLink((await pkpMail.fullMessage(mail.ID)).HTML, titleFor(tag));
        expect(link).toContain('/invitation/accept');

        // A signed-out browser lands on the wizard with the reviewer signed
        // in; a second signed-out browser lands there again.
        const first = await anonymousPage(browser, baseURL);
        await first.goto(link);
        const {wizard: firstWizard} = reviewerScreens(first, tag);
        await firstWizard.expectOpen(titleFor(tag));
        await firstWizard.expectStep(1);
        await expect(firstWizard.acceptButton).toBeVisible();

        const second = await anonymousPage(browser, baseURL);
        await second.goto(link);
        const {wizard: secondWizard} = reviewerScreens(second, tag);
        await secondWizard.expectOpen(titleFor(tag));
        await expect(secondWizard.acceptButton).toBeVisible();

        // Accept and submit; the link then shows "Invitation Unavailable".
        await secondWizard.accept();
        await secondWizard.continueToStep3();
        await secondWizard.typeComments(`Review ${tag}`);
        await secondWizard.submitReview();
        await secondWizard.expectCompleted();
        const third = await anonymousPage(browser, baseURL);
        await third.goto(link);
        await expect(third.getByText('Invitation Unavailable').first()).toBeVisible({timeout: 30_000});

        // Control: with the setting off (the seeded press), the request
        // email's link is the plain wizard address: the Login page first,
        // then the wizard.
        const control = await seedExternal(ompApi, controlTag);
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const controlModal = await openEditorial(mayaPage, PK, control.submissionId);
        await addReviewerFromList(mayaPage, controlModal, {search: 'Julia', name: 'Julia Reviewer'});
        const controlMail = await pkpMail.find({
            to: getEmail(JULIA),
            subject: 'Manuscript Review Request',
            contains: controlTag,
        });
        const plainLink = pkpMail.extractLink((await pkpMail.fullMessage(controlMail.ID)).HTML, titleFor(controlTag));
        expect(plainLink).toContain('/reviewer/submission');
        expect(plainLink).not.toContain('/invitation/');
        const fourth = await anonymousPage(browser, baseURL);
        await fourth.goto(plainLink);
        const login = new LoginPage(fourth);
        await expect(login.usernameInput).toBeVisible({timeout: 30_000});
        await login.signIn(JULIA, getPassword(JULIA));
        await fourth.waitForURL(/\/reviewer\/submission/, {waitUntil: 'commit'});
        const {wizard: fourthWizard} = reviewerScreens(fourth, PK);
        await fourthWizard.expectOpen(titleFor(controlTag));
    });

    test("S11: read an earlier round's review", async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s11');
        const roundOneText = `Roundone ${tag}`;
        const reason = `Reason${tag}`;
        // Round 1 with Julia accepted and Paul invited; an empty round 2.
        const seeded = await seedExternal(ompApi, tag, [], {
            reviewRounds: [
                {stage: 'external', reviewers: [{username: JULIA, status: 'accepted'}, {username: PAUL, status: 'invited'}]},
                {stage: 'external', reviewers: []},
            ],
        });

        // Julia submits her round-1 review; Paul declines round 1 with a reason.
        const juliaPage = await (await asUser(JULIA)).newPage();
        await completeReview(juliaPage, PK, seeded.submissionId, {comment: roundOneText});
        const paulPage = await (await asUser(PAUL)).newPage();
        const {wizard: paulWizard} = reviewerScreens(paulPage, PK);
        await paulWizard.goto(seeded.submissionId);
        await paulWizard.decline({appendText: reason});

        // The editor asks both again on round 2.
        const editorPage = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(editorPage, PK, seeded.submissionId);
        await expect(modal.getByRole('heading', {name: 'Workflow: External Review (Round 2)'})).toBeVisible();
        await addReviewerFromList(editorPage, modal, {search: 'Julia', name: 'Julia Reviewer'});
        await addReviewerFromList(editorPage, modal, {search: 'Paul', name: 'Paul Reviewer'});

        // Julia's round-2 wizard: "Previous Reviews" with the dated round-1
        // line; its window shows her comments and the round's dates.
        const {wizard} = reviewerScreens(juliaPage, PK);
        await wizard.goto(seeded.submissionId);
        await expect(wizard.previousReviewLine(1)).toHaveText(/Round 1 Review Submitted on \d{4}-\d{2}-\d{2}/);
        const history = await wizard.openRoundHistory(1);
        await expect(history).toContainText('Round 1 Review submitted by you for');
        await expect(history).toContainText(titleFor(tag));
        await expect(history).toContainText('Reviewer Comments');
        await expect(history).toContainText('For editors and authors');
        await expect(history).toContainText(roundOneText);
        await expect(history).toContainText('General Information');
        await expect(history).toContainText("Editor's Request");
        await expect(history).toContainText('Review Submitted On');
        await wizard.closeRoundHistory(history);

        // Control: Paul's window reads the decline instead.
        await paulWizard.goto(seeded.submissionId);
        const declined = await paulWizard.openRoundHistory(1);
        await expect(declined).toContainText('Declined Date');
        await expect(declined).toContainText('Decline reason sent by email');
        await expect(declined).toContainText('Unable to Review');
        await expect(declined).toContainText(reason);
        await expect(declined.getByText('Reviewer Comments')).toHaveCount(0);
    });

    test('S12: nothing can be saved after submission', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s12');
        const openTag = makeTag(testInfo, 'u28s12o');
        const fileName = `${tag}.txt`;
        const seeded = await seedExternal(ompApi, tag, [{username: JULIA, status: 'accepted'}]);
        const open = await seedExternal(ompApi, openTag, [{username: JULIA, status: 'accepted'}]);

        // A submitted review carrying one reviewer file.
        const page = await (await asUser(JULIA)).newPage();
        const {list, wizard} = reviewerScreens(page, PK);
        await walkToStep3(wizard, seeded.submissionId);
        await wizard.expectReviewerFilesSettled();
        await wizard.uploadReviewerFile(fileName);
        await wizard.typeComments(`Review ${tag}`);
        await wizard.submitReview();
        await wizard.expectCompleted();

        // From "View": every tab opens, nothing can be saved.
        await list.goto('completed');
        await list.openWizard(list.row(tag), 'View');
        await wizard.expectOpen(titleFor(tag));
        await wizard.expectStep(4);
        for (const step of [1, 2, 3]) {
            await wizard.expectTabEnabled(step);
        }
        await wizard.selectStep(1);
        await expect(wizard.saveAndContinueButton).toBeDisabled();
        await wizard.selectStep(2);
        await expect(wizard.continueToStep3Button).toBeDisabled();
        await wizard.goto(seeded.submissionId, {step: 3});
        await expect(wizard.submitReviewButton).toBeDisabled();
        await expect(wizard.saveForLaterButton).toBeDisabled();
        await wizard.expectReviewerFilesSettled();
        await expect(wizard.uploadFileLink).toHaveCount(0);
        const fileRow = wizard.reviewerFileRow(fileName);
        await expect(fileRow).toBeVisible();
        await fileRow.locator('a.show_extras').click();
        await expect(wizard.reviewerFilesGrid.getByRole('link', {name: 'Edit', exact: true})).toBeVisible();
        await expect(wizard.reviewerFilesGrid.getByRole('link', {name: 'Delete', exact: true})).toHaveCount(0);

        // Control: the same reviewer's other, still-open assignment offers
        // all of them.
        await wizard.goto(open.submissionId);
        await expect(wizard.saveAndContinueButton).toBeEnabled();
        await wizard.saveAndContinueButton.click();
        await wizard.expectStep(2);
        await expect(wizard.continueToStep3Button).toBeEnabled();
        await wizard.continueToStep3();
        await wizard.expectReviewerFilesSettled();
        await expect(wizard.uploadFileLink).toBeVisible();
        await expect(wizard.submitReviewButton).toBeEnabled();
        await expect(wizard.saveForLaterButton).toBeEnabled();
    });

    test('S13: declare competing interests', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s13');
        const controlTag = makeTag(testInfo, 'u28s13c');
        const policy = `Policy ${tag} on disclosure.`;
        const statement = `Statement ${tag}`;
        const reviewer = `rv${tag}`;
        const press = {
            path: tag,
            ...(await seedScratchPress(ompApi, tag, {
                users: [{username: reviewer, roles: ['externalReviewer'], givenName: `Rv${tag}`, familyName: 'Reviewer'}],
                review: {competingInterests: policy},
            })),
        };
        const seeded = await seedScratchMonograph(ompApi, tag, press, {
            reviewers: [{username: reviewer, status: 'invited'}],
        });

        const page = await (await asUser(reviewer)).newPage();
        const {wizard} = reviewerScreens(page, tag);
        await wizard.goto(seeded.submissionId);
        await expect(page.getByText('Competing Interests').first()).toBeVisible();
        await expect(
            page.getByText('This publisher has a policy for disclosure of potential competing interests from its reviewers.')
        ).toBeVisible();

        // The policy link opens the policy text.
        await wizard.competingInterestsLink.click();
        const policyDialog = page.getByRole('dialog').filter({hasText: policy});
        await expect(policyDialog).toBeVisible({timeout: 30_000});
        await wizard.closeDialog(policyDialog);

        // "I do not have any competing interests" is preselected; choosing
        // the other reveals the statement box.
        await expect(wizard.noCompetingInterestsRadio).toBeChecked();
        await expect(wizard.hasCompetingInterestsRadio).not.toBeChecked();
        await wizard.hasCompetingInterestsRadio.check();
        await expect(wizard.competingInterestsBody).toBeVisible({timeout: 30_000});
        await wizard.typeInto(wizard.competingInterestsBody, statement);
        await wizard.accept();

        // The editor's row carries the "Competing Interests" badge.
        const editorPage = await (await asUser(press.manager)).newPage();
        const modal = await openEditorial(editorPage, tag, seeded.submissionId);
        const row = reviewerRow(modal, `Rv${tag} Reviewer`);
        await expect(row).toContainText('Request Accepted');
        await expect(row).toContainText('Competing Interests');

        // Control: on the seeded press (no policy) step 1 has no "Competing
        // Interests" section (bounded by the step's "Review Type" line).
        const control = await seedExternal(ompApi, controlTag, [{username: JULIA, status: 'invited'}]);
        const juliaPage = await (await asUser(JULIA)).newPage();
        const {wizard: juliaWizard} = reviewerScreens(juliaPage, PK);
        await juliaWizard.goto(control.submissionId);
        await expect(juliaPage.getByText('Review Type', {exact: true})).toBeVisible();
        await expect(juliaPage.getByText('Competing Interests')).toHaveCount(0);
        await expect(juliaWizard.noCompetingInterestsRadio).toHaveCount(0);
    });

    test('S14: left behind when the submission moves on', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s14');
        const controlTag = makeTag(testInfo, 'u28s14c');
        // A seeded acceptance on a monograph the editor has since sent on to
        // Copyediting (the API's promote-from-review decision is `accept`).
        const seeded = await seedExternal(ompApi, tag, [{username: JULIA, status: 'accepted'}], {
            decisions: ['skipInternalReview', 'accept'],
        });
        // Control: a submitted review on another monograph in Copyediting.
        const control = await seedExternal(ompApi, controlTag, [{username: JULIA, status: 'accepted'}]);
        const page = await (await asUser(JULIA)).newPage();
        await completeReview(page, PK, control.submissionId, {comment: `Control ${controlTag}`});
        const editorPage = await (await asUser('manager.maya')).newPage();
        const controlModal = await openEditorial(editorPage, PK, control.submissionId);
        await decisionButton(controlModal, 'Accept Submission').click();
        await expect(editorPage.getByRole('heading', {level: 1, name: /Accept Submission/})).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(editorPage);

        // The unfinished one reads "Incomplete" with no button, under
        // "Archived" only.
        const {list, wizard} = reviewerScreens(page, PK);
        await list.goto('archived');
        const row = list.row(tag);
        await expect(row).toContainText('Incomplete');
        await expect(list.rowActions(row)).toHaveCount(0);
        await list.expectInViews(tag, ['archived']);

        // The wizard address still opens on "1. Request" with "Save and
        // continue" enabled and nothing saying the round is over (register
        // question A11; scenario 14 drives it through as written).
        await wizard.goto(seeded.submissionId);
        await wizard.expectStep(1);
        await expect(wizard.saveAndContinueButton).toBeEnabled();
        await wizard.saveAndContinueButton.click();
        await wizard.expectStep(2);
        await wizard.continueToStep3();
        await wizard.typeComments(`Late review ${tag}`);
        await wizard.submitReview();
        await wizard.expectCompleted();

        // The row now sits under "Completed" with "View", no longer under
        // "Archived".
        await list.goto('completed');
        const completedRow = list.row(tag);
        await expect(completedRow).toContainText(/Review submitted on \d{4}-\d{2}-\d{2}/);
        await expect(list.rowAction(completedRow, 'View')).toBeVisible();
        await list.goto('archived');
        await expect(list.row(tag)).toHaveCount(0);

        // Control: the submitted review on the other monograph in Copyediting
        // keeps its "View" under "Completed".
        await list.goto('completed');
        const controlRow = list.row(controlTag);
        await expect(controlRow).toContainText(/Review submitted on \d{4}-\d{2}-\d{2}/);
        await expect(list.rowAction(controlRow, 'View')).toBeVisible();
    });

    test('S15: two stages, no recommendation ({OMP})', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u28s15');
        const externalTag = makeTag(testInfo, 'u28s15x');
        const internalGuidance = `Internal guidance ${tag}`;
        const externalGuidance = `External guidance ${tag}`;
        const internalReviewer = `ir${tag}`;
        const externalReviewer = `er${tag}`;
        const press = {
            path: tag,
            ...(await seedScratchPress(ompApi, tag, {
                users: [
                    {username: internalReviewer, roles: ['internalReviewer'], givenName: `Ir${tag}`, familyName: 'Reviewer'},
                    {username: externalReviewer, roles: ['externalReviewer'], givenName: `Er${tag}`, familyName: 'Reviewer'},
                ],
                review: {internalReviewGuidelines: internalGuidance, reviewGuidelines: externalGuidance},
            })),
        };
        const internal = await seedScratchMonograph(ompApi, tag, press, {
            stage: 'internal',
            reviewers: [{username: internalReviewer, status: 'accepted'}],
        });
        const external = await seedScratchMonograph(ompApi, externalTag, press, {
            stage: 'external',
            reviewers: [{username: externalReviewer, status: 'accepted'}],
        });

        // Internal Review: step 2 shows the press's "Internal Review
        // Guidelines"; step 3 has no "Recommendation" list (OMP1).
        const page = await (await asUser(internalReviewer)).newPage();
        const {wizard} = reviewerScreens(page, tag);
        await wizard.goto(internal.submissionId);
        await wizard.saveAndContinueButton.click();
        await wizard.expectStep(2);
        await expect(page.getByText(internalGuidance)).toBeVisible();
        await expect(page.getByText(externalGuidance)).toHaveCount(0);
        await wizard.continueToStep3();
        await expect(page.getByText(PRIVATE_BOX).first()).toBeVisible();
        await expect(wizard.commentsBody).toBeVisible();
        await expect(page.getByText(/Recommendation/)).toHaveCount(0);
        await expect(wizard.recommendationSelect).toHaveCount(0);
        await wizard.typeComments(`Internal review ${tag}`);
        await wizard.submitReview();
        await wizard.expectCompleted();

        // The "Review complete" email reaches the stage's editor (its
        // "recommends None" subject is register finding OMP2, unasserted).
        await pkpMail.find({to: press.editorEmail, subject: 'Review complete', contains: titleFor(tag)});

        // External Review: step 2 shows the "External Review Guidelines".
        const externalPage = await (await asUser(externalReviewer)).newPage();
        const {wizard: externalWizard} = reviewerScreens(externalPage, tag);
        await externalWizard.goto(external.submissionId);
        await externalWizard.saveAndContinueButton.click();
        await externalWizard.expectStep(2);
        await expect(externalPage.getByText(externalGuidance)).toBeVisible();
        await expect(externalPage.getByText(internalGuidance)).toHaveCount(0);
    });
});
