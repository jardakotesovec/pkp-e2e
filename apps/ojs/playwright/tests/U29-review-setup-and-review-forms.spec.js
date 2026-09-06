// @ts-check
/**
 * @file playwright/tests/U29-review-setup-and-review-forms.spec.js
 *
 * Review setup & review forms — OJS suite, one test per canonical scenario
 * the spec runs on OJS (common scenarios 1–8 and OJS-specific 9–10;
 * scenario 11 is OPS's, in that tree).
 * Spec: docs/specs/U29-review-setup-and-review-forms.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap):
 * - A1 🐞: the automatic reminder clock is off on the test installs; S1
 *   saves a slider and reads it back, and no test expects a reminder email.
 * - A5 🐞: no test changes an item's type after adding response options.
 * - A2 ❓: S8 deactivates a form nobody carries; a form in use is never
 *   deactivated, and the activation warning's promise is asserted neither
 *   way.
 * - A3 ❓: no deadline is saved as 0 or emptied.
 * - A4 ❓: after a reload every test runs the tab chain again ("Review" ›
 *   the side tab) without asserting where the reload landed.
 * - A6 ❓: no test opens the editor's "Read Review" window on a
 *   deactivated recommendation.
 * - A7 ❓: S9 asserts the new entry's presence and the toggled row's tick
 *   and the reviewer's list, never the toggled row's position in the table
 *   (the order is not fixed).
 * - OMP1–OMP3: press-only, in the OMP tree.
 * - Settings with no scenario of their own (a second form language, a
 *   role's settings access, a section's default review form, the daily
 *   clock): none here.
 * - S10 note: the spec's scenario uses a custom recommendation as the entry
 *   in use. The context API has no key that seeds one (returned as a harness
 *   need), so S10 drives the same Rule 18 behaviour on the six starting
 *   entries: the reviewer picks "Accept Submission" (in use, no menu) and the
 *   manager deletes "Revisions Required" (not in use, "Edit" and "Delete").
 *
 * Seeding: scenario endpoints only. Every test runs on its own scratch
 * journal (`POST scenarios/context`, install defaults unless a `review` /
 * `reviewForms[]` passthrough key names the configured end) with throwaway
 * users whose addresses carry app + test (u29s4ojsw0…@mail.test) and one
 * seeded submission in review; publicknowledge and the 18 seeded users are
 * never touched. The reviewer side runs in its own authenticated context
 * (`asUser`), never a sign-out. Absence claims are paired with a positive
 * control read the same way (the same window's other control, the other
 * row's menu). No hard-coded waits.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    WorkflowPage,
    openAddReviewerModal,
    selectReviewer,
    performReview,
} = require('../pages/ReviewStagePages.js');
const {ReviewSettingsPage} = require('../../../../shared/playwright/pages/ReviewSettingsPages.js');
const {ReviewWizardPage} = require('../../../../shared/playwright/pages/ReviewerPages.js');

const DEFAULT_RECOMMENDATIONS = [
    'Accept Submission',
    'Revisions Required',
    'Resubmit for Review',
    'Resubmit Elsewhere',
    'Decline Submission',
    'See Comments',
];
const REFUSED_NOTICE =
    'The form was not saved because 1 error(s) were encountered. Please correct these errors and try again.';
const DEACTIVATE_FORM = 'Are you sure you wish to deactivate this review form? It will no longer be available for new review assignments.';
const ACTIVATE_FORM = "Are you sure you wish to activate this review form? Once it's assigned to a review you will no longer be able to deactivate it.";
const COPY_FORM = 'Are you sure you wish to create a copy of this review form?';
const DELETE_FORM = 'Are you sure you wish to delete this review form?';
const RADIO_TYPE = 'Radio buttons (you can only choose one)';
const TEXTAREA_TYPE = 'Extended text box';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u29${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** Local date as the app's short format (Y-m-d). */
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

/**
 * A scratch journal with a manager, an author and a reviewer, plus one
 * submission in external review round 1 (the reviewer on it when
 * `reviewer` names a status). Returns the names the screens show.
 */
async function seedJournal(ojsApi, tag, {review, reviewForms, reviewer = null, reviewForm} = {}) {
    const manager = `mgr${tag}`;
    const author = `au${tag}`;
    const reviewerUser = `rev${tag}`;
    const reviewerName = `Probe Reviewer${tag}`;
    const spec = {
        tag,
        users: [
            {username: manager, roles: ['manager']},
            {username: author, roles: ['author']},
            {username: reviewerUser, roles: ['externalReviewer'], givenName: 'Probe', familyName: `Reviewer${tag}`},
        ],
    };
    if (review) spec.review = review;
    if (reviewForms) spec.reviewForms = reviewForms;
    await ojsApi.createContext(spec);
    const reviewers = reviewer ? [{username: reviewerUser, status: reviewer, ...(reviewForm ? {reviewForm} : {})}] : [];
    const {submissionId} = await ojsApi.createSubmission({
        tag,
        context: tag,
        submitter: author,
        title: `Submission ${tag}`,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers}],
    });
    return {manager, author, reviewer: reviewerUser, reviewerName, submissionId};
}

/**
 * Open the submission's "Add Reviewer" window and select the reviewer, so
 * the request form (review type, dates, the "Review Form" list) is on
 * screen. Returns the window.
 */
async function openRequestForm(page, tag, submissionId, reviewerName) {
    const workflow = new WorkflowPage(page, tag);
    await workflow.gotoEditorial(submissionId);
    const modal = await openAddReviewerModal(page);
    await selectReviewer(page, modal, reviewerName);
    return modal;
}

/** The request form's "Review Form" list (absent while no form is active). */
function reviewFormList(modal) {
    return modal.locator('#regularReviewerForm select[name="reviewFormId"]');
}

/** Close the "Add Reviewer" window (it has no "Cancel"; never Escape). */
async function closeRequestForm(modal) {
    await modal.getByRole('button', {name: /^Close/}).first().click();
    await expect(modal).toBeHidden({timeout: 30_000});
}

test.describe('review setup & review forms', () => {
    test('S1: save the review setup', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {manager, reviewerName, submissionId} = await seedJournal(ojsApi, tag);
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const setup = settings.setup;
        await settings.goto('Setup');

        // The install defaults are on screen, then the edits.
        await expect(setup.modeRadio('Anonymous Reviewer/Anonymous Author')).toBeChecked();
        await expect(setup.sliderReadout('Review Request Response - Before Due Date')).toHaveText('No reminder set');
        await setup.modeRadio('Open').check();
        await setup.field('Default Response Deadline').fill('2');
        await setup.field('Minimum Confirmed Reviews Required').fill('1');
        await setup.setSliderByKeyboard('Review Request Response - Before Due Date', 3);
        await expect(setup.sliderReadout('Review Request Response - Before Due Date')).toHaveText('3 days before due date');
        await setup.save();

        // Reload and open "Review" › "Setup" again: every value shows as saved.
        await settings.reloadAndOpen('Setup');
        await expect(setup.modeRadio('Open')).toBeChecked();
        await expect(setup.field('Default Response Deadline')).toHaveValue('2');
        await expect(setup.field('Minimum Confirmed Reviews Required')).toHaveValue('1');
        await expect(setup.slider('Review Request Response - Before Due Date')).toHaveAttribute('aria-valuetext', '3 days before due date');
        await expect(setup.sliderReadout('Review Request Response - Before Due Date')).toHaveText('3 days before due date');

        // Add Reviewer: "Open" preselected, the response due date two weeks out.
        const modal = await openRequestForm(page, tag, submissionId, reviewerName);
        await expect(modal.getByRole('radio', {name: 'Open', exact: true})).toBeChecked();
        await expect(modal.locator('input[id^="responseDueDate"][id$="-altField"]')).toHaveValue(ymd(daysFromNow(14)));
        // Control: the completion deadline was left at its default of four weeks.
        await expect(modal.locator('input[id^="reviewDueDate"][id$="-altField"]')).toHaveValue(ymd(daysFromNow(28)));
    });

    test('S2: a refused deadline saves nothing', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {manager} = await seedJournal(ojsApi, tag);
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const setup = settings.setup;
        await settings.goto('Setup');

        // Letters in the deadline plus a mode change in the same edit.
        await setup.field('Default Completion Deadline').fill('abc');
        await setup.modeRadio('Anonymous Reviewer/Disclosed Author').check();
        await setup.saveButton.click();
        await expect(setup.fieldError('Default Completion Deadline')).toContainText('This is not a valid integer.', {timeout: 30_000});
        await expect(setup.errorSummary).toContainText('Please correct one error.');
        await expect(setup.jumpToErrorButton).toBeVisible();
        await expect(settings.notice(REFUSED_NOTICE)).toBeVisible({timeout: 30_000});
        await expect(setup.saveButton).toBeDisabled();
        // Control: no "Saved" appeared beside the button.
        await expect(setup.savedStatus).toHaveCount(0);

        // Nothing was saved, not even the mode that passed.
        await settings.reloadAndOpen('Setup');
        await expect(setup.field('Default Completion Deadline')).toHaveValue('4');
        await expect(setup.modeRadio('Anonymous Reviewer/Anonymous Author')).toBeChecked();
        await expect(setup.modeRadio('Anonymous Reviewer/Disclosed Author')).not.toBeChecked();

        // A negative number is refused with the other message.
        await setup.field('Default Completion Deadline').fill('-1');
        await setup.saveButton.click();
        await expect(setup.fieldError('Default Completion Deadline')).toContainText('This must be at least 0.', {timeout: 30_000});
        await expect(setup.errorSummary).toContainText('Please correct one error.');
    });

    test('S3: unsaved edits survive a tab switch, not a reload', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {manager} = await seedJournal(ojsApi, tag);
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const setup = settings.setup;
        // Any browser prompt (a beforeunload on the reload) would be recorded here.
        const prompts = [];
        page.on('dialog', (dialog) => {
            prompts.push(dialog.type());
            dialog.dismiss().catch(() => {});
        });
        await settings.goto('Setup');
        await expect(setup.field('Default Response Deadline')).toHaveValue('4');

        // Edit, switch side tabs and come back: no warning, the edit is still there.
        await setup.field('Default Response Deadline').fill('6');
        await settings.openSideTab('Reviewer Guidance');
        await expect(settings.guidance.saveButton).toBeVisible();
        await expect(page.locator('[role="dialog"]:visible')).toHaveCount(0);
        await settings.openSideTab('Setup');
        await expect(setup.field('Default Response Deadline')).toHaveValue('6');
        await expect(page.locator('[role="dialog"]:visible')).toHaveCount(0);

        // A reload drops the edit with no prompt: the saved value is back.
        await settings.reloadAndOpen('Setup');
        await expect(setup.field('Default Response Deadline')).toHaveValue('4');
        expect(prompts).toEqual([]);
    });

    test('S4: guidance reaches the reviewer', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const guidelines = 'Judge the method first.';
        const policy = 'Declare any funding link.';
        const {manager, reviewer, submissionId} = await seedJournal(ojsApi, tag, {reviewer: 'invited'});

        // Manager: both texts saved on "Reviewer Guidance".
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        await settings.goto('Reviewer Guidance');
        await settings.guidance.typeInto('reviewGuidelines', guidelines);
        await settings.guidance.typeInto('competingInterests', policy);
        await settings.guidance.save();

        // Reviewer: step 1's "Competing Interests" block, its window, then step 2's guidelines.
        const reviewerPage = await (await asUser(reviewer)).newPage();
        const wizard = new ReviewWizardPage(reviewerPage, tag);
        await wizard.goto(submissionId);
        const step1 = reviewerPage.locator('#reviewStep1Form');
        await expect(step1).toContainText('Competing Interests');
        await expect(step1.getByText('I do not have any competing interests')).toBeVisible();
        await expect(step1.getByText('I may have competing interests (Specify below)')).toBeVisible();
        await expect(wizard.noCompetingInterestsRadio).toBeChecked();
        await expect(step1).not.toContainText(policy);
        await wizard.competingInterestsLink.click();
        const policyWindow = reviewerPage.getByRole('dialog').filter({hasText: policy});
        await expect(policyWindow).toBeVisible({timeout: 30_000});
        await policyWindow.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(policyWindow).toBeHidden({timeout: 30_000});
        await wizard.accept();
        const step2 = reviewerPage.locator('#reviewStep2Form');
        await expect(step2).toContainText('Reviewer Guidelines');
        await expect(step2).toContainText(guidelines);
        const text = await step2.innerText();
        expect(text.indexOf('Reviewer Guidelines')).toBeLessThan(text.indexOf(guidelines));
        await expect(step2).not.toContainText('This publisher has not set any reviewer guidelines.');
    });

    test('S5: the guidelines box per app', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {manager} = await seedJournal(ojsApi, tag);
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const guidance = settings.guidance;
        await settings.goto('Reviewer Guidance');

        // A journal has the one "Review Guidelines" box (no per-stage boxes).
        const headings = await guidance.headings();
        expect(headings).toContain('Review Guidelines');
        expect(headings).toContain('Competing Interests');
        expect(headings).not.toContain('Internal Review Guidelines');
        expect(headings).not.toContain('External Review Guidelines');

        // Tick the anonymizing box, save, reload: it stays ticked.
        await expect(guidance.anonymizeBox).not.toBeChecked();
        await guidance.anonymizeBox.check();
        await guidance.save();
        await settings.reloadAndOpen('Reviewer Guidance');
        await expect(guidance.anonymizeBox).toBeChecked();

        // The words in the sentence open the instructions; "Close" closes them,
        // and there is no "OK" (control: "Close" is there). The box stays as it was.
        await guidance.anonymizeWords.click();
        const window = guidance.instructionsWindow();
        await expect(window).toBeVisible({timeout: 30_000});
        await expect(window.getByRole('heading', {name: 'How to ensure all files are anonymized'})).toBeVisible();
        await expect(window.getByRole('button', {name: 'Close', exact: true})).toBeVisible();
        await expect(window.getByRole('button', {name: 'OK', exact: true})).toHaveCount(0);
        await window.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(window).toBeHidden({timeout: 30_000});
        await expect(guidance.anonymizeBox).toBeChecked();
    });

    test('S6: build a review form and offer it', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s6', testInfo);
        const title = 'Method check';
        const question = 'Is the method sound?';
        const {manager, reviewerName, submissionId} = await seedJournal(ojsApi, tag);
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const forms = settings.forms;
        await settings.goto('Review Forms');
        await expect(forms.noItems).toBeVisible();

        // "Create Review Form": the notice, the row with 0 / 0 and no tick.
        await forms.createForm(title);
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        const row = forms.row(title).first();
        expect(await forms.rowCounts(row)).toEqual({inReview: 0, completed: 0});
        await expect(forms.activeBox(row)).not.toBeChecked();

        // "Edit" › "Form Items": a required radio item with two options, then a text item.
        const controls = await forms.rowControls(row);
        await forms.control(controls, 'Edit').click();
        await expect(forms.windowHeading()).toHaveText('Edit', {timeout: 30_000});
        await forms.openWindowTab('Form Items');
        await expect(forms.itemsGrid().getByText('No Items')).toBeVisible({timeout: 30_000});
        await forms.openCreateItem();
        await forms.saveItem({question, required: true, type: RADIO_TYPE, options: ['Yes', 'No']});
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        await forms.openCreateItem();
        await forms.saveItem({question: 'Other remarks', type: TEXTAREA_TYPE});
        await expect(forms.itemRows()).toHaveCount(2);

        // "Preview Form": the title, the starred question with two radios, the text box.
        await forms.openWindowTab('Preview Form');
        await expect(forms.previewForm).toBeVisible({timeout: 30_000});
        await expect(forms.previewForm.getByRole('heading', {name: title})).toBeVisible();
        await expect(forms.previewForm).toContainText(`${question}*`);
        await expect(forms.previewRadio('Yes')).toBeVisible();
        await expect(forms.previewRadio('No')).toBeVisible();
        await expect(forms.previewForm).toContainText('Other remarks');
        await expect(forms.previewForm.locator('textarea')).toHaveCount(1);
        await forms.closeWindow();

        // Inactive: "Add Reviewer" has no "Review Form" list (control: the
        // same form's review type radios are there).
        let modal = await openRequestForm(page, tag, submissionId, reviewerName);
        await expect(modal.locator('#regularReviewerForm input[name="reviewMethod"]').first()).toBeVisible();
        await expect(reviewFormList(modal)).toHaveCount(0);
        await closeRequestForm(modal);

        // Tick "Active" › "OK": the notice, and the list now offers the form.
        await settings.goto('Review Forms');
        await forms.activeBox(forms.row(title).first()).click();
        await forms.answerConfirm(ACTIVATE_FORM, 'OK');
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        await expect(forms.activeBox(forms.row(title).first())).toBeChecked();
        modal = await openRequestForm(page, tag, submissionId, reviewerName);
        await expect(reviewFormList(modal)).toBeVisible({timeout: 30_000});
        await expect(reviewFormList(modal).locator('option')).toHaveText(['None / Free Form Review', title]);
        await expect(reviewFormList(modal).locator('option:checked')).toHaveText('None / Free Form Review');
    });

    test('S7: a form in use is frozen', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const title = 'Method check';
        const items = ['Is the method sound?', 'Other remarks'];
        const {manager} = await seedJournal(ojsApi, tag, {
            reviewForms: [{
                title,
                elements: [
                    {question: items[0], type: 'radiobuttons', required: true, options: ['Yes', 'No']},
                    {question: items[1], type: 'textarea'},
                ],
            }],
            reviewer: 'accepted',
            reviewForm: title,
        });
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const forms = settings.forms;
        await settings.goto('Review Forms');

        // In Review 1; "Copy" and "Preview" only.
        const row = forms.row(title).first();
        expect(await forms.rowCounts(row)).toEqual({inReview: 1, completed: 0});
        await expect(forms.activeBox(row)).toBeChecked();
        let controls = await forms.rowControls(row);
        await expect(forms.control(controls, 'Copy')).toBeVisible();
        await expect(forms.control(controls, 'Preview')).toBeVisible();
        await expect(forms.control(controls, 'Edit')).toHaveCount(0);
        await expect(forms.control(controls, 'Delete')).toHaveCount(0);

        // "Preview": the window headed "Preview" on "Preview Form", the other two greyed.
        await forms.control(controls, 'Preview').click();
        await expect(forms.windowHeading()).toHaveText('Preview', {timeout: 30_000});
        await expect(forms.windowTab('Preview Form')).toHaveAttribute('aria-selected', 'true', {timeout: 30_000});
        await expect(forms.windowTab('Review Form')).toHaveAttribute('aria-disabled', 'true');
        await expect(forms.windowTab('Form Items')).toHaveAttribute('aria-disabled', 'true');
        await expect(forms.previewForm).toContainText(`${items[0]}*`);
        await forms.closeWindow();

        // "Copy" › "OK": a second, unticked row at the bottom with "Edit" and
        // "Delete", carrying the same items.
        controls = await forms.rowControls(forms.row(title).first());
        await forms.control(controls, 'Copy').click();
        await forms.answerConfirm(COPY_FORM, 'OK');
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        await expect(forms.row(title)).toHaveCount(2, {timeout: 30_000});
        const copy = forms.rows().last();
        await expect(copy).toContainText(title);
        expect(await forms.rowCounts(copy)).toEqual({inReview: 0, completed: 0});
        await expect(forms.activeBox(copy)).not.toBeChecked();
        const copyControls = await forms.rowControls(copy);
        await expect(forms.control(copyControls, 'Edit')).toBeVisible();
        await expect(forms.control(copyControls, 'Delete')).toBeVisible();
        await forms.control(copyControls, 'Edit').click();
        await expect(forms.windowHeading()).toHaveText('Edit', {timeout: 30_000});
        await forms.openWindowTab('Form Items');
        await expect(forms.itemRows()).toHaveCount(2, {timeout: 30_000});
        await expect(forms.itemRows().nth(0)).toContainText(items[0]);
        await expect(forms.itemRows().nth(1)).toContainText(items[1]);
    });

    test('S8: deactivate and delete an unused form', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s8', testInfo);
        const title = 'Method check';
        const {manager, reviewerName, submissionId} = await seedJournal(ojsApi, tag, {
            reviewForms: [{title, active: true, elements: [{question: 'Is the method sound?', type: 'textarea'}]}],
        });
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const forms = settings.forms;

        // Control for the absence below: while the form is active the list is offered.
        let modal = await openRequestForm(page, tag, submissionId, reviewerName);
        await expect(reviewFormList(modal)).toBeVisible({timeout: 30_000});
        await closeRequestForm(modal);

        // Untick "Active": the deactivation question, "OK", the notice, the tick gone.
        await settings.goto('Review Forms');
        const row = forms.row(title).first();
        await expect(forms.activeBox(row)).toBeChecked();
        await forms.activeBox(row).click();
        await expect(forms.confirmWindow(DEACTIVATE_FORM)).toBeVisible({timeout: 30_000});
        await forms.answerConfirm(DEACTIVATE_FORM, 'OK');
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        await expect(forms.activeBox(forms.row(title).first())).not.toBeChecked();

        // With no other active form, "Add Reviewer" has no "Review Form" list.
        modal = await openRequestForm(page, tag, submissionId, reviewerName);
        await expect(modal.locator('#regularReviewerForm input[name="reviewMethod"]').first()).toBeVisible();
        await expect(reviewFormList(modal)).toHaveCount(0);
        await closeRequestForm(modal);

        // "Delete" › "OK": the row is gone.
        await settings.goto('Review Forms');
        const controls = await forms.rowControls(forms.row(title).first());
        await forms.control(controls, 'Delete').click();
        await forms.answerConfirm(DELETE_FORM, 'OK');
        await expect(forms.row(title)).toHaveCount(0, {timeout: 30_000});
        await expect(forms.noItems).toBeVisible({timeout: 30_000});
    });

    test('S9: add and retire a recommendation', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const custom = 'Accept with minor changes';
        const {manager, reviewer, submissionId} = await seedJournal(ojsApi, tag, {reviewer: 'accepted'});
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const table = settings.recommendations;
        await settings.goto('Reviewer Recommendations');

        // The six starting entries, all ticked.
        expect(await table.titles()).toEqual(DEFAULT_RECOMMENDATIONS);
        for (const title of DEFAULT_RECOMMENDATIONS) {
            await expect(table.tick(table.row(title))).toBeChecked();
        }

        // "Add Recommendation": the new row lands last, ticked.
        await table.add({title: custom, type: 'Approved'});
        expect(await table.titles()).toEqual([...DEFAULT_RECOMMENDATIONS, custom]);
        await expect(table.tick(table.row(custom))).toBeChecked();

        // Untick "See Comments" › "Yes": the row is unticked; the other rows
        // keep their ticks. (Where the toggled row lands is finding T-ojs-1:
        // the run showed it above the new entry, so no order is asserted here.)
        await table.tick(table.row('See Comments')).click();
        await table.answerConfirm('Are you sure you want to deactivate the recommendation See Comments', 'Yes');
        await expect(table.tick(table.row('See Comments'))).not.toBeChecked({timeout: 30_000});
        expect((await table.titles()).sort()).toEqual([...DEFAULT_RECOMMENDATIONS, custom].sort());
        for (const title of DEFAULT_RECOMMENDATIONS.filter((t) => t !== 'See Comments')) {
            await expect(table.tick(table.row(title))).toBeChecked();
        }

        // Reviewer: step 3's list offers the new entry and has no "See Comments".
        // (A seeded acceptance opens on step 1; the reviewer walks to step 3.)
        const reviewerPage = await (await asUser(reviewer)).newPage();
        const wizard = new ReviewWizardPage(reviewerPage, tag);
        await wizard.goto(submissionId);
        await wizard.expectStep(1);
        await wizard.saveAndContinueButton.click();
        await wizard.expectStep(2);
        await wizard.continueToStep3();
        const options = (await wizard.recommendationSelect.locator('option').allInnerTexts()).map((s) => s.trim());
        expect(options).toContain(custom);
        expect(options).not.toContain('See Comments');
        expect(options).toContain('Accept Submission');
    });

    test('S10: a recommendation in use loses its menu', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const inUse = 'Accept Submission';
        const unused = 'Revisions Required';
        const {manager, reviewer, submissionId} = await seedJournal(ojsApi, tag, {reviewer: 'accepted'});

        // The reviewer submits a review recommending the entry.
        const reviewerPage = await (await asUser(reviewer)).newPage();
        await performReview(reviewerPage, tag, submissionId, {recommendation: inUse, comments: `Review ${tag}`});

        // Manager: the entry in use has no menu; an unused one still offers
        // "Edit" and "Delete" (the control, read the same way).
        const page = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(page, tag);
        const table = settings.recommendations;
        await settings.goto('Reviewer Recommendations');
        await expect(table.tick(table.row(inUse))).toBeVisible({timeout: 30_000});
        await expect(table.menuButton(table.row(unused))).toBeVisible();
        await expect(table.menuButton(table.row(inUse))).toHaveCount(0);
        const items = await table.openMenu(table.row(unused));
        await expect(items).toHaveText(['Edit', 'Delete']);

        // "Delete" › "Yes" on the unused row removes it.
        await page.getByRole('menuitem', {name: 'Delete', exact: true}).click();
        await table.answerConfirm(`Are you sure you want to delete the recommendation ${unused}`, 'Yes');
        await expect(table.row(unused)).toHaveCount(0, {timeout: 30_000});
        expect(await table.titles()).toEqual(DEFAULT_RECOMMENDATIONS.filter((t) => t !== unused));
    });
});
