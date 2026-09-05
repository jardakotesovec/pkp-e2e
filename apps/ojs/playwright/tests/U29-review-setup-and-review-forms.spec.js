// @ts-check
/**
 * @file playwright/tests/U29-review-setup-and-review-forms.spec.js
 *
 * Review setup & review forms — OJS suite, one test per canonical scenario
 * the spec runs on OJS (common scenarios 1–9 and OJS-specific 10; 11 is
 * OMP's and 12 OPS's, in those trees).
 * Spec: docs/specs/U29-review-setup-and-review-forms.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap):
 * - A1 ❓: no reminder clock is ever observed firing (the daily task does
 *   not run on the test installs); S4 asserts only the readings, the save
 *   and, bounded by the request email, the silence.
 * - A2 ❓: S7 unticks "Active" on a form in use because the spec's scenario
 *   is the recipe for Rule 11's contract (gone from "Add Reviewer", kept by
 *   the request, still met on step 3); whether the box should lock is the
 *   open question and no assertion says the untick is right.
 * - A3 ❓: no declined request carries a form anywhere here.
 * - A4 🐞: S3 saves 0 and re-reads it; the "Add Reviewer" date a 0 gives
 *   (today plus 21 days) is the bug's record, asserted neither way. S3's
 *   control is the minimum's effect on the round status box instead.
 * - A5 🐞: every navigation walks the tab chain (Settings › Workflow ›
 *   "Review" › side tab); no test bookmarks or reloads a side-tab address
 *   and asserts where it lands.
 * - A6 🐞: S7 never opens the reviewer row's "Edit" window on a request
 *   carrying a deactivated form.
 * - A7 ❓: rows on "Reviewer Recommendations" are located by title, never
 *   by position, except the "last" of a freshly added option (Rule 18's
 *   own claim, read once, before any toggle).
 * - A8 ❓: no second forms language anywhere here.
 * - S9's "no dialog appeared on the way out": one claim-check run saw a
 *   browser beforeunload prompt once after activating a form. S9 accepts
 *   any dialog so the trip completes, and asserts the values, not the
 *   prompt's absence.
 * - Settings with no scenario of their own ("Restrict File Access",
 *   "One-click Reviewer Access", "Reviewer Suggestion at Submission", a
 *   section's default form, a second forms language): none here.
 *
 * Seeding: scenario endpoints only. publicknowledge and the 18 seeded users
 * are read-only (S1 only reads them). Every other scenario seeds a scratch
 * journal through `POST scenarios/context` with throwaway users (a
 * `manager`, an `author`, `externalReviewer`s: a roster reviewer named on a
 * scratch journal is not enrolled there) and, where a setting is a
 * precondition, the `review` / `reviewForms[]` passthrough keys; what a
 * test drives on the settings screen is the behavior under test. Mail is
 * read by throwaway recipient (PRINCIPLES A8) with a positive control. No
 * hard-coded waits.
 */
const {test, expect} = require('../support/fixtures.js');
const {ReviewSettingsPage} = require('../pages/ReviewSettingsPages.js');
const {
    WorkflowPage,
    legacyModal,
    openAddReviewerModal,
    selectReviewer,
    uploadWizardDialog,
    waitForJQueryIdle,
} = require('../pages/ReviewStagePages.js');
const {ReviewWizardPage} = require('../../../../shared/playwright/pages/ReviewerPages.js');
const {WorkflowPage: WorkflowFrame} = require('../../../../shared/playwright/pages/WorkflowPage.js');

const JOURNAL = 'publicknowledge';
const ANON_ANON = 'Anonymous Reviewer/Anonymous Author';
const NO_REMINDER = 'No reminder set';
const SLIDERS = [
    'Review Request Response - Before Due Date',
    'Review Request Response - After Due Date',
    'Review Submission - Before Due Date',
    'Review Submission - After Due Date',
];
const DEFAULT_RECOMMENDATIONS = [
    'Accept Submission',
    'Revisions Required',
    'Resubmit for Review',
    'Resubmit Elsewhere',
    'Decline Submission',
    'See Comments',
];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u29${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
}

/** The throwaway accounts of a scratch journal. */
function scratchUsers(tag) {
    return {
        manager: `mgr${tag}`,
        author: `au${tag}`,
        reviewer: `rev${tag}`,
        reviewerName: `Scratch Reviewer${tag}`,
        second: `two${tag}`,
        secondName: `Second Reviewer${tag}`,
    };
}

/** A scratch journal with a manager, an author and two reviewers. */
async function seedJournal(ojsApi, tag, extra = {}) {
    const users = scratchUsers(tag);
    await ojsApi.createContext({
        tag,
        users: [
            {username: users.manager, roles: ['manager']},
            {username: users.author, roles: ['author']},
            {username: users.reviewer, roles: ['externalReviewer'], givenName: 'Scratch', familyName: `Reviewer${tag}`},
            {username: users.second, roles: ['externalReviewer'], givenName: 'Second', familyName: `Reviewer${tag}`},
        ],
        ...extra,
    });
    return users;
}

/** A scratch submission standing in external review round 1. */
async function seedInReview(ojsApi, tag, submitter, reviewers = [], {suffix = ''} = {}) {
    const title = `Submission ${tag}${suffix}`;
    const result = await ojsApi.createSubmission({
        tag: `${tag}${suffix}`,
        context: tag,
        submitter,
        title,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers}],
    });
    return {submissionId: result.submissionId, title};
}

/** The Add Reviewer window's "Review Form" list (present only with an active form). */
function reviewFormSelect(modal) {
    return modal.locator('select[name="reviewFormId"]');
}

/** Walk a seeded acceptance to step 3 ("Save and continue", "Continue to Step #3"). */
async function walkToStep3(wizard) {
    await wizard.expectStep(1);
    await wizard.saveAndContinueButton.click();
    await wizard.expectStep(2);
    await wizard.continueToStep3Button.click();
    await wizard.expectStep(3);
}

test.describe('review setup & review forms', () => {
    test('S1: the Review settings and who reaches them', {tag: '@smoke'}, async ({asUser}) => {
        const page = await (await asUser('manager.maya')).newPage();
        const settings = new ReviewSettingsPage(page, JOURNAL);
        await settings.gotoSideTab('Setup');
        expect(await settings.sideTabNames()).toEqual(['Setup', 'Reviewer Guidance', 'Review Forms', 'Reviewer Recommendations']);

        // "Setup" at the install defaults.
        const setup = settings.setup;
        await expect(setup.reviewModeRadio(ANON_ANON)).toBeChecked();
        for (const label of [
            'Make reviewer comments publicly visible with published content',
            'Reviewers will not be given access to the submission file until they have agreed to review it.',
            'Include a secure link in the email invitation to reviewers.',
            'Allow authors to suggest potential reviewers at submission process',
        ]) {
            await expect(setup.box(label)).not.toBeChecked();
        }
        await expect(setup.responseDeadline).toHaveValue('4');
        await expect(setup.completionDeadline).toHaveValue('4');
        await expect(setup.minReviews).toHaveValue('0');
        for (const label of SLIDERS) {
            await expect(setup.sliderReading(label)).toHaveText(NO_REMINDER);
        }

        // "Reviewer Guidance" empty, "Review Forms" empty.
        await settings.openSideTab('Reviewer Guidance');
        await expect(settings.guidance.guidelinesBody).toHaveText('');
        await expect(settings.guidance.competingInterestsBody).toHaveText('');
        await expect(settings.guidance.anonymityBox).not.toBeChecked();
        await settings.openSideTab('Review Forms');
        await expect(settings.forms.noItems).toBeVisible();
        await expect(settings.forms.rows).toHaveCount(0);

        // Control: a Section Editor has no "Settings" and the address is refused.
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        const anaSettings = new ReviewSettingsPage(anaPage, JOURNAL);
        await anaPage.goto(anaSettings.contextUrl(JOURNAL, '/dashboard/editorial'));
        await expect(anaSettings.sidebar.getByRole('link', {name: 'Editor Dashboard'}).first()).toBeVisible({timeout: 30_000});
        await expect(anaSettings.sidebar.getByRole('link', {name: 'Settings', exact: true})).toHaveCount(0);
        await expect(anaSettings.sidebar.getByRole('button', {name: 'Settings', exact: true})).toHaveCount(0);
        await anaPage.goto(anaSettings.url());
        await expect(anaSettings.accessDenied).toBeVisible({timeout: 30_000});
        await expect(anaSettings.reviewTab).toHaveCount(0);
    });

    test('S2: change the defaults and see them on the next request', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const users = await seedJournal(ojsApi, tag);
        // The earlier reviewer is assigned before the settings change.
        const {submissionId} = await seedInReview(ojsApi, tag, users.author, [{username: users.reviewer, status: 'invited'}]);

        const page = await (await asUser(users.manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Setup');
        const setup = settings.setup;
        await setup.reviewModeRadio('Open').check();
        await setup.box('Make reviewer comments publicly visible with published content').check();
        await setup.responseDeadline.fill('2');
        await setup.completionDeadline.fill('6');
        const response = await setup.save();
        expect(response.status()).toBe(200);
        await setup.expectSaved();

        // Reload: the tab shows the same values (walking the tab chain, A5).
        await page.reload();
        await settings.openReviewTab();
        await settings.openSideTab('Setup');
        await expect(setup.reviewModeRadio('Open')).toBeChecked();
        await expect(setup.box('Make reviewer comments publicly visible with published content')).toBeChecked();
        await expect(setup.responseDeadline).toHaveValue('2');
        await expect(setup.completionDeadline).toHaveValue('6');

        // The next request starts from the new defaults.
        const workflow = new WorkflowPage(page, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(page);
        await selectReviewer(page, modal, users.secondName);
        await expect(modal.getByRole('radio', {name: 'Open', exact: true})).toBeChecked();
        await expect(modal.locator('input[name="isReviewPubliclyVisible"]')).toBeChecked();
        await expect(modal.locator('input[id^="responseDueDate"][id$="-altField"]')).toHaveValue(ymd(daysFromNow(14)));
        await expect(modal.locator('input[id^="reviewDueDate"][id$="-altField"]')).toHaveValue(ymd(daysFromNow(42)));

        // Control: the earlier request keeps its type and dates.
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', 'Scratch');
        await row.getByRole('button', {name: 'More Actions'}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const editModal = legacyModal(page, 'editReviewForm');
        await expect(editModal.locator('input[name="isReviewPubliclyVisible"]')).toBeVisible({timeout: 30_000});
        await expect(editModal.getByRole('radio', {name: ANON_ANON, exact: true})).toBeChecked();
        await expect(editModal.locator('input[name="isReviewPubliclyVisible"]')).not.toBeChecked();
        await expect(editModal.locator('input[id^="responseDueDate"][id$="-altField"]')).toHaveValue(ymd(daysFromNow(28)));
        await expect(editModal.locator('input[id^="reviewDueDate"][id$="-altField"]')).toHaveValue(ymd(daysFromNow(28)));
    });

    test('S3: whole weeks only', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const users = await seedJournal(ojsApi, tag);
        const {submissionId} = await seedInReview(ojsApi, tag, users.author, [{username: users.reviewer, status: 'accepted'}]);

        const page = await (await asUser(users.manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Setup');
        const setup = settings.setup;

        // Refused: the message under the box, the value kept, no "Saved".
        await setup.responseDeadline.fill('abc');
        const refused = await setup.save();
        expect(refused.status()).toBe(400);
        await expect(setup.fieldError(setup.responseDeadline)).toHaveText('This is not a valid integer.');
        await expect(setup.responseDeadline).toHaveValue('abc');
        await expect(setup.formErrors).toContainText('Please correct one error.');
        await expect(setup.status.filter({hasText: 'Saved'})).toHaveCount(0);

        // Accepted: 0 and 2.
        await setup.responseDeadline.fill('0');
        await setup.minReviews.fill('2');
        const saved = await setup.save();
        expect(saved.status()).toBe(200);
        await setup.expectSaved();
        await page.reload();
        await settings.openReviewTab();
        await settings.openSideTab('Setup');
        await expect(setup.responseDeadline).toHaveValue('0');
        await expect(setup.minReviews).toHaveValue('2');
        await expect(setup.fieldError(setup.responseDeadline)).toHaveCount(0);

        // Control: the saved minimum reaches the round status box (Rule 4).
        const frame = new WorkflowFrame(page, tag);
        await frame.gotoEditorial(submissionId);
        await expect(frame.dialog()).toContainText('Minimum number of confirmed reviews required: 2.', {timeout: 30_000});
    });

    test('S4: set the reminder clocks', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const users = await seedJournal(ojsApi, tag);
        const reviewerMail = `${users.reviewer}@mail.test`;
        const {submissionId, title} = await seedInReview(ojsApi, tag, users.author);

        const page = await (await asUser(users.manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Setup');
        const setup = settings.setup;
        const days = [3, 5, 7, 0];
        const readings = ['3 days before due date', '5 days after due date', '7 days before due date', NO_REMINDER];
        for (const [i, label] of SLIDERS.entries()) {
            await setup.setSlider(label, days[i]);
            await expect(setup.sliderReading(label)).toHaveText(readings[i]);
        }
        const saved = await setup.save();
        expect(saved.status()).toBe(200);
        await setup.expectSaved();
        await page.reload();
        await settings.openReviewTab();
        await settings.openSideTab('Setup');
        for (const [i, label] of SLIDERS.entries()) {
            await expect(setup.sliderReading(label)).toHaveText(readings[i]);
            await expect(setup.slider(label)).toHaveAttribute('aria-valuenow', String(days[i]));
        }

        // Control: a request sent now brings the reviewer the request email
        // (positive control, bounds the wait) and no reminder.
        const workflow = new WorkflowPage(page, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(page);
        await selectReviewer(page, modal, users.reviewerName);
        await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(modal).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(page);
        await pkpMail.expectNone({
            to: reviewerMail,
            contains: 'Will you be able to review this for us?',
            afterControl: {to: reviewerMail, contains: title},
        });
        expect(await pkpMail.count({to: reviewerMail, contains: 'A reminder to please complete your review'})).toBe(0);
    });

    test('S5: guidance and the anonymity link', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const users = await seedJournal(ojsApi, tag);
        const {submissionId} = await seedInReview(ojsApi, tag, users.author);
        const guidelines = `Guidelines for ${tag}.`;
        const policy = `Policy for ${tag}.`;

        const page = await (await asUser(users.manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Reviewer Guidance');
        const guidance = settings.guidance;
        await guidance.typeInto('reviewGuidelines', guidelines);
        await guidance.typeInto('competingInterests', policy);
        await expect(guidance.guidelinesBody).toHaveText(guidelines);
        await expect(guidance.competingInterestsBody).toHaveText(policy);

        // The words open the dialog without changing the box.
        await guidance.anonymityWordsButton.click();
        await expect(guidance.anonymityDialog).toBeVisible({timeout: 30_000});
        await expect(guidance.anonymityDialog.getByRole('button', {name: 'Close', exact: true})).toBeVisible();
        await guidance.anonymityDialog.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(guidance.anonymityDialog).toBeHidden();
        await expect(guidance.anonymityBox).not.toBeChecked();

        await guidance.anonymityBox.check();
        const saved = await guidance.save();
        expect(saved.status()).toBe(200);
        await guidance.expectSaved();
        await page.reload();
        await settings.openReviewTab();
        await settings.openSideTab('Reviewer Guidance');
        await expect(guidance.guidelinesBody).toHaveText(guidelines);
        await expect(guidance.competingInterestsBody).toHaveText(policy);
        await expect(guidance.anonymityBox).toBeChecked();

        // The upload window shows the link, and the link opens the dialog.
        const link = await openSubmissionUpload(page, tag, submissionId);
        await expect(link).toBeVisible({timeout: 30_000});
        await link.click();
        const dialog = page
            .getByRole('dialog')
            .filter({has: page.getByRole('heading', {name: 'How to ensure all files are anonymized'})})
            .last();
        await expect(dialog.getByRole('button', {name: 'OK', exact: true})).toBeVisible({timeout: 30_000});
        await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(dialog).toBeHidden();

        // Control: a journal with the box unticked shows no link.
        const controlTag = `${tag}b`;
        const controlUsers = await seedJournal(ojsApi, controlTag);
        const {submissionId: controlId} = await seedInReview(ojsApi, controlTag, controlUsers.author);
        const controlPage = await (await asUser(controlUsers.manager)).newPage();
        const controlLink = await openSubmissionUpload(controlPage, controlTag, controlId);
        await expect(uploadWizardDialog(controlPage).locator('select[id^="genreId"]')).toBeVisible({timeout: 30_000});
        await expect(controlLink).toHaveCount(0);
    });

    test('S6: create a review form and offer it', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const inactiveTitle = `Unused ${tag}`;
        const users = await seedJournal(ojsApi, tag, {
            // Control: a second form left inactive.
            reviewForms: [{title: inactiveTitle, active: false, elements: [{question: 'Unused?', type: 'textarea'}]}],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, users.author);
        const formTitle = `Form ${tag}`;
        const description = `Answer both questions for ${tag}.`;
        const question1 = `Is the method sound for ${tag}?`;
        const question2 = `Comments for ${tag}`;

        const page = await (await asUser(users.manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Review Forms');
        const forms = settings.forms;

        // Create: a row at the bottom, 0 / 0, inactive.
        const createWindow = await forms.openCreateWindow();
        await createWindow.fillForm({title: formTitle, description});
        await createWindow.save();
        const row = forms.row(formTitle);
        await expect(row).toBeVisible({timeout: 30_000});
        expect(await forms.counts(row)).toEqual({inReview: '0', completed: '0'});
        await expect(forms.activeBox(row)).not.toBeChecked();

        // Two items.
        const editWindow = await forms.openEditWindow(row);
        await editWindow.openTab('Form Items');
        await expect(editWindow.itemsGrid.getByText('No Items')).toBeVisible({timeout: 30_000});
        const item1 = await editWindow.openCreateItemWindow();
        await item1.questionBody.click();
        await page.keyboard.type(question1);
        await item1.chooseType('radiobuttons');
        await item1.addOption('Yes');
        await item1.addOption('No');
        await item1.requiredBox.check();
        await item1.save();
        await expect(editWindow.itemRow(question1)).toBeVisible({timeout: 30_000});
        const item2 = await editWindow.openCreateItemWindow();
        await item2.questionBody.click();
        await page.keyboard.type(question2);
        await item2.chooseType('textarea');
        await item2.save();
        await expect(editWindow.itemRow(question2)).toBeVisible({timeout: 30_000});
        await expect(editWindow.itemRows).toHaveCount(2);

        // Preview: title, description, the starred radio question, the text box.
        await editWindow.openTab('Preview Form');
        const preview = editWindow.preview;
        await expect(preview).toBeVisible({timeout: 30_000});
        await expect(preview).toContainText(formTitle);
        await expect(preview).toContainText(description);
        await expect(preview).toContainText(`${question1}*`);
        await expect(preview.getByRole('radio', {name: 'Yes', exact: true})).toBeVisible();
        await expect(preview.getByRole('radio', {name: 'No', exact: true})).toBeVisible();
        await expect(preview).toContainText(question2);
        await expect(preview.locator('textarea')).toHaveCount(1);
        await editWindow.close();

        // Activate.
        await forms.setActive(forms.row(formTitle), true);

        // The Add Reviewer window offers the active form and not the inactive one.
        const workflow = new WorkflowPage(page, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(page);
        await selectReviewer(page, modal, users.reviewerName);
        const select = reviewFormSelect(modal);
        await expect(select).toBeVisible({timeout: 30_000});
        const options = await select.locator('option').allInnerTexts();
        expect(options[0]).toBe('None / Free Form Review');
        expect(options).toContain(formTitle);
        expect(options).not.toContain(inactiveTitle);
    });

    test('S7: a form in use is locked', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const formA = `Form A ${tag}`;
        const formB = `Form B ${tag}`;
        const question = `Question A for ${tag}?`;
        const users = await seedJournal(ojsApi, tag, {
            reviewForms: [
                {title: formA, elements: [{question, type: 'radiobuttons', options: ['Yes', 'No']}]},
                {title: formB, elements: [{question: `Question B for ${tag}?`, type: 'textarea'}]},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, users.author, [
            {username: users.reviewer, status: 'accepted', reviewForm: formA},
        ]);

        const page = await (await asUser(users.manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Review Forms');
        const forms = settings.forms;
        const rowA = forms.row(formA);
        expect(await forms.counts(rowA)).toEqual({inReview: '1', completed: '0'});
        const actions = await forms.openActions(rowA);
        expect(actions).toContain('Copy');
        expect(actions).toContain('Preview');
        expect(actions).not.toContain('Edit');
        expect(actions).not.toContain('Delete');
        // Control: the unused form offers all four.
        const actionsB = await forms.openActions(forms.row(formB));
        expect(actionsB).toEqual(expect.arrayContaining(['Edit', 'Copy', 'Preview', 'Delete']));

        // "Preview" opens on "Preview Form" with the other two tabs dead.
        const preview = await forms.openPreviewWindow(rowA);
        await expect(preview.heading()).toHaveText('Preview');
        await expect(preview.tab('Preview Form')).toHaveAttribute('aria-selected', 'true');
        await expect(preview.tab('Review Form')).toHaveAttribute('aria-disabled', 'true');
        await expect(preview.tab('Form Items')).toHaveAttribute('aria-disabled', 'true');
        await expect(preview.preview).toContainText(question);
        await preview.close();

        // Deactivate: the box unticks, the count stays, the list drops it.
        await forms.setActive(forms.row(formA), false);
        expect(await forms.counts(forms.row(formA))).toEqual({inReview: '1', completed: '0'});
        const workflow = new WorkflowPage(page, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(page);
        await selectReviewer(page, modal, users.secondName);
        const select = reviewFormSelect(modal);
        await expect(select).toBeVisible({timeout: 30_000});
        const options = await select.locator('option').allInnerTexts();
        expect(options).toContain(formB);
        expect(options).not.toContain(formA);

        // Control: the reviewer still meets the form on step 3.
        const reviewerPage = await (await asUser(users.reviewer)).newPage();
        const wizard = new ReviewWizardPage(reviewerPage, tag);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);
        const step3 = reviewerPage.locator('#reviewStep3Form');
        await expect(step3.getByRole('heading', {name: formA})).toBeVisible({timeout: 30_000});
        await expect(step3).toContainText(question);
        await expect(wizard.formRadio('Yes')).toBeVisible();
    });

    test('S8: copy, reorder and delete', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const formA = `Form A ${tag}`;
        const formB = `Form B ${tag}`;
        const questionA = `Question A for ${tag}?`;
        const users = await seedJournal(ojsApi, tag, {
            reviewForms: [
                {title: formA, active: false, elements: [{question: questionA, type: 'radiobuttons', options: ['Yes', 'No']}]},
                {title: formB, elements: [{question: `Question B for ${tag}?`, type: 'textarea'}]},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, users.author);

        const page = await (await asUser(users.manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Review Forms');
        const forms = settings.forms;
        await expect(forms.rows).toHaveCount(2);
        const idA = await forms.rowId(forms.row(formA));
        const idB = await forms.rowId(forms.row(formB));

        // Copy: a third row at the bottom, same title, inactive, same items.
        await forms.pressAction(forms.row(formA), 'Copy');
        await forms.confirm('create a copy of this review form');
        await expect(forms.rows).toHaveCount(3, {timeout: 30_000});
        const copyRow = forms.rows.last();
        await expect(copyRow).toContainText(formA);
        const idCopy = await forms.rowId(copyRow);
        expect(idCopy).not.toBe(idA);
        await expect(forms.activeBox(copyRow)).not.toBeChecked();
        const copyWindow = await forms.openEditWindow(copyRow);
        await copyWindow.openTab('Form Items');
        await expect(copyWindow.itemRow(questionA)).toBeVisible({timeout: 30_000});
        await expect(copyWindow.itemRows).toHaveCount(1);
        await copyWindow.close();

        // Reorder: the copy to the top, "Done", and it stays first after a reload.
        await forms.moveRowToTop(forms.rows.last());
        await page.reload();
        await settings.openReviewTab();
        await settings.openSideTab('Review Forms');
        expect(await forms.rowId(forms.rows.first())).toBe(idCopy);
        expect(await forms.rowId(forms.rows.nth(1))).toBe(idA);
        expect(await forms.rowId(forms.rows.nth(2))).toBe(idB);

        // Once activated, the "Review Form" list names the copy first.
        await forms.setActive(forms.rows.first(), true);
        const workflow = new WorkflowPage(page, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(page);
        await selectReviewer(page, modal, users.reviewerName);
        const select = reviewFormSelect(modal);
        await expect(select).toBeVisible({timeout: 30_000});
        const values = await select.locator('option').evaluateAll((options) => options.map((o) => [o.value, o.textContent.trim()]));
        expect(values[0][1]).toBe('None / Free Form Review');
        expect(values[1]).toEqual([String(idCopy), formA]);
        expect(values[2]).toEqual([String(idB), formB]);

        // Delete the copy; the originals stay.
        await settings.gotoSideTab('Review Forms');
        await forms.pressAction(forms.rows.first(), 'Delete');
        await forms.confirm('delete this review form');
        await page.reload();
        await settings.openReviewTab();
        await settings.openSideTab('Review Forms');
        await expect(forms.rows).toHaveCount(2);
        expect(await forms.rowId(forms.rows.nth(0))).toBe(idA);
        expect(await forms.rowId(forms.rows.nth(1))).toBe(idB);
        await expect(forms.row(formB)).toBeVisible();
    });

    test('S9: leave with unsaved changes', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const users = await seedJournal(ojsApi, tag);
        const page = await (await asUser(users.manager)).newPage();
        // A browser prompt was seen once on the way out; accept it so the
        // trip completes, and assert the values (header).
        page.on('dialog', (dialog) => dialog.accept());
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Setup');
        const setup = settings.setup;
        await expect(setup.reviewModeRadio(ANON_ANON)).toBeChecked();

        // A side-tab trip keeps the change.
        await setup.reviewModeRadio('Open').check();
        await settings.openSideTab('Reviewer Guidance');
        await settings.openSideTab('Setup');
        await expect(setup.reviewModeRadio('Open')).toBeChecked();

        // Leaving the page drops it.
        await settings.leaveThroughSidebar('Website');
        await settings.returnThroughSidebar();
        await settings.openSideTab('Setup');
        await expect(setup.reviewModeRadio(ANON_ANON)).toBeChecked();
        await expect(setup.reviewModeRadio('Open')).not.toBeChecked();

        // Control: saved, the same trip keeps it.
        await setup.reviewModeRadio('Open').check();
        const saved = await setup.save();
        expect(saved.status()).toBe(200);
        await setup.expectSaved();
        await settings.leaveThroughSidebar('Website');
        await settings.returnThroughSidebar();
        await settings.openSideTab('Setup');
        await expect(setup.reviewModeRadio('Open')).toBeChecked();
    });

    test('S10: recommendation options', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const users = await seedJournal(ojsApi, tag);
        const {submissionId} = await seedInReview(ojsApi, tag, users.author, [{username: users.reviewer, status: 'accepted'}]);
        const newTitle = `Major revisions ${tag}`;

        const page = await (await asUser(users.manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.gotoSideTab('Reviewer Recommendations');
        const tab = settings.recommendations;
        expect(await tab.titles()).toEqual(DEFAULT_RECOMMENDATIONS);
        for (const title of DEFAULT_RECOMMENDATIONS) {
            await expect(tab.activateBox(tab.row(title))).toBeChecked();
        }

        // Add: a seventh row, ticked, last.
        await tab.openAddWindow();
        await expect(tab.statusSelect).toHaveValue(/./);
        await expect(tab.statusSelect.locator('option:checked')).toHaveText('Active Upon Saving');
        await tab.saveWindow({title: newTitle, type: 'Revisions Requested'});
        await expect(tab.rows).toHaveCount(7, {timeout: 30_000});
        await expect(tab.rows.last()).toContainText(newTitle);
        await expect(tab.activateBox(tab.row(newTitle))).toBeChecked();

        // The reviewer's list opens on "Choose One" and ends with the new option.
        const reviewerPage = await (await asUser(users.reviewer)).newPage();
        const wizard = new ReviewWizardPage(reviewerPage, tag);
        await wizard.goto(submissionId);
        await walkToStep3(wizard);
        await expect(wizard.recommendationSelect.locator('option:checked')).toHaveText('Choose One');
        let options = await wizard.recommendationSelect.locator('option').allInnerTexts();
        expect(options.at(-1)).toBe(newTitle);
        expect(options).toContain('Accept Submission');

        // Deactivate a default: gone from the reviewer's list.
        await tab.toggle(tab.row('Accept Submission'), {activate: false});
        await wizard.goto(submissionId, {step: 3});
        await wizard.expectStep(3);
        await expect(wizard.recommendationSelect.locator('option').first()).toBeAttached({timeout: 30_000});
        options = await wizard.recommendationSelect.locator('option').allInnerTexts();
        expect(options).not.toContain('Accept Submission');
        expect(options).toContain(newTitle);

        // Delete the new option.
        await tab.deleteRow(tab.row(newTitle));
        await expect(tab.rows).toHaveCount(6);

        // Control: an option a reviewer chose loses its menu; "Activate" still toggles.
        await wizard.chooseRecommendation('See Comments');
        await wizard.submitReview();
        await wizard.expectCompleted();
        await settings.gotoSideTab('Reviewer Recommendations');
        await expect(tab.moreActions(tab.row('See Comments'))).toHaveCount(0);
        await expect(tab.moreActions(tab.row('Decline Submission'))).toHaveCount(1);
        await tab.toggle(tab.row('See Comments'), {activate: false});
        await tab.toggle(tab.row('See Comments'), {activate: true});
    });
});

/**
 * Open a submission's Submission stage and its "Submission Files" › "Upload"
 * window; returns the anonymity link locator inside the wizard (asserted by
 * the caller either way).
 */
async function openSubmissionUpload(page, contextPath, submissionId) {
    const frame = new WorkflowFrame(page, contextPath);
    await frame.gotoEditorial(submissionId);
    await frame.selectStage('Submission');
    await page.getByRole('button', {name: 'Upload', exact: true}).first().click();
    const wizard = uploadWizardDialog(page);
    await expect(wizard.locator('input[type="file"]')).toBeAttached({timeout: 30_000});
    return wizard.getByRole('link', {name: 'How to ensure all files are anonymized'});
}
