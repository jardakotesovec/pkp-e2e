// @ts-check
/**
 * @file playwright/tests/U29-review-setup-and-review-forms.spec.js
 *
 * Review setup & review forms — OMP suite, one test per canonical
 * scenario the spec runs on a press (S1–S8, S12 and S13 common; S9 and
 * S10 are the journal's, the "Reviewer Recommendations" tab being
 * journal-only; S11 is the preprint server's), in the press's own
 * context: Press Manager, monograph, External Review (the monograph is
 * seeded there through `skipInternalReview`), the two guideline boxes,
 * the three side tabs (S5 reads the press's tab list, with no "Reviewer
 * Recommendations" tab, OMP1) and a wizard step 3 with no
 * "Recommendation" list.
 * Spec: docs/specs/U29-review-setup-and-review-forms.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞
 * (the reminder clock is off on the test installs; S1 saves a slider and
 * reads it back), A2 ❓ (S7 deactivates the form in use and asserts only
 * the scenario's own sentence, never the warning's promise), A3 ❓ (no
 * deadline is saved as 0 or emptied), A4 ❓ (every reload runs the tab
 * chain again without asserting where it landed), A5 🐞 (no item's type is
 * changed after adding response options), A6 ❓ and A7 ❓ (journal-only),
 * A8 ❓ (no declined request is counted), A9 🐞 (S7 reads the "Edit"
 * windows before the deactivation and never presses "OK" on one), OMP3 🐞
 * (nothing is asserted about the internal box's toolbar). The spec's
 * Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only. S1–S8 and S13 run on their own scratch
 * press (`POST scenarios/context`, install defaults unless a `review` /
 * `reviewForms[]` passthrough key names the configured end) with throwaway
 * users whose addresses carry app + test (revu29s1ompw0…@mail.test) and
 * one seeded monograph in External Review round 1; S12 runs read-only on
 * the seeded press with the ready accounts. publicknowledge and the 18
 * seeded users are never changed (A1, A7). The reviewer side runs in its
 * own authenticated context (`asUser`), never a sign-out. Every absence is
 * a settled read paired with a positive control taken the same way (the
 * same window's other control, the same tab strip's other tabs); S1's
 * mailbox silence is bounded by a request email the test itself sends to
 * a spare reviewer (A8). No hard-coded waits (A5).
 */
const {test, expect} = require('../support/fixtures.js');
const {
    STATUS,
    openEditorial,
    minimumLine,
    expectRoundStatusOpensWith,
    roundStatusBox,
} = require('../pages/ReviewStagePages.js');
const {
    openAddReviewer,
    reviewerListEntry,
    selectButton,
    selectReviewerAndAwaitForm,
    reviewerRow,
    openEditReview,
    cancelEditReview,
    reviewTypeRadio,
    publicVisibilityBox,
    reviewFormSelect,
    reviewFormSelected,
    openReadReview,
    markReviewComplete,
    closeReadReview,
    reviewDetailsText,
    dateAltField,
    isoDate,
    daysFromNow,
} = require('../pages/ReviewerAssignmentPages.js');
const {
    PressReviewSettingsPage,
    PRESS_SIDE_TABS,
    LIBRARY_TAB,
    GUIDELINE_BOXES,
} = require('../pages/ReviewSettingsPages.js');
const {ReviewWizardPage} = require('../../../../shared/playwright/pages/ReviewerPages.js');

const PK = 'publicknowledge';
const REFUSED_NOTICE =
    'The form was not saved because 1 error(s) were encountered. Please correct these errors and try again.';
const DEACTIVATE_FORM = 'Are you sure you wish to deactivate this review form? It will no longer be available for new review assignments.';
const ACTIVATE_FORM = "Are you sure you wish to activate this review form? Once it's assigned to a review you will no longer be able to deactivate it.";
const COPY_FORM = 'Are you sure you wish to create a copy of this review form?';
const DELETE_FORM = 'Are you sure you wish to delete this review form?';
const RADIO_TYPE = 'Radio buttons (you can only choose one)';
const TEXTAREA_TYPE = 'Extended text box';
const TEXTFIELD_TYPE = 'Single line text box';
const PUBLIC_BOX = 'Make reviewer comments publicly visible with published content';
const REMINDER_SLIDERS = [
    'Review Request Response - Before Due Date',
    'Review Request Response - After Due Date',
    'Review Submission - Before Due Date',
    'Review Submission - After Due Date',
];
const NONE_FORM = 'None / Free Form Review';
const ITEM_QUESTION_REQUIRED = 'A question is required for the form item. (English)';
const FIELD_REQUIRED = 'This field is required.';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u29${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway user's address (the seed's default, `<username>@mail.test`). */
function emailOf(username) {
    return `${username}@mail.test`;
}

/**
 * A scratch press with a manager, an author and one External Reviewer
 * per `reviewers[]` entry (`{status, reviewForm}`; each with a request on
 * the monograph), plus, with `spare`, an External Reviewer with no request
 * (the one Add Reviewer's list still offers), and one monograph in
 * External Review round 1. Returns the names the screens show.
 */
async function seedPress(ompApi, tag, {review, reviewForms, reviewers = [], spare = false} = {}) {
    const manager = `mgr${tag}`;
    const author = `au${tag}`;
    const given = ['Probe', 'Second', 'Third'];
    const seeded = reviewers.map((entry, i) => ({
        username: `rev${i ? i + 1 : ''}${tag}`,
        name: `${given[i]} Reviewer${tag}`,
        email: emailOf(`rev${i ? i + 1 : ''}${tag}`),
        entry,
        givenName: given[i],
    }));
    const spareUser = spare ? {username: `sp${tag}`, name: `Spare Reviewer${tag}`, email: emailOf(`sp${tag}`)} : null;
    const spec = {
        tag,
        users: [
            {username: manager, roles: ['manager']},
            {username: author, roles: ['author']},
            ...seeded.map((r) => ({username: r.username, roles: ['externalReviewer'], givenName: r.givenName, familyName: `Reviewer${tag}`})),
            ...(spareUser ? [{username: spareUser.username, roles: ['externalReviewer'], givenName: 'Spare', familyName: `Reviewer${tag}`}] : []),
        ],
    };
    if (review) spec.review = review;
    if (reviewForms) spec.reviewForms = reviewForms;
    await ompApi.createContext(spec);
    const {submissionId} = await ompApi.createSubmission({
        tag,
        context: tag,
        submitter: author,
        title: `Monograph ${tag}`,
        decisions: ['skipInternalReview'],
        reviewRounds: [{
            stage: 'external',
            reviewers: seeded.map((r) => ({username: r.username, status: r.entry.status, ...(r.entry.reviewForm ? {reviewForm: r.entry.reviewForm} : {})})),
        }],
    });
    return {
        manager,
        author,
        reviewers: seeded.map(({username, name, email}) => ({username, name, email})),
        spare: spareUser,
        submissionId,
    };
}

/**
 * Open the monograph's "Add Reviewer" window and select the reviewer, so
 * the request form (review type, dates, the "Review Form" list) is on
 * screen. Returns the window.
 */
async function openRequestForm(page, tag, submissionId, reviewerName) {
    const workflow = await openEditorial(page, tag, submissionId);
    const addModal = await openAddReviewer(page, workflow);
    await selectButton(reviewerListEntry(addModal, reviewerName)).click();
    // These tests read the request form and close it; none submits it, so
    // readiness is the form's own init signal (the FormHandler renamed the
    // visible date inputs), not the prefilled letter. On a press whose
    // active review form was seeded, the letter's client-side fill loses
    // its race with the editor's init and stays empty (incidentals.md, U27).
    await expect(addModal.getByRole('button', {name: 'Add Reviewer', exact: true})).toBeVisible({timeout: 30_000});
    await expect(addModal.locator('input[name="responseDueDate-removed"]')).toBeAttached({timeout: 30_000});
    return addModal;
}

/** The request form's "Review Form" list (absent while no form is active). */
function reviewFormList(modal) {
    return modal.locator('#regularReviewerForm select[name="reviewFormId"]');
}

/** The request form's review-type radios: the control for the list's absence. */
function reviewMethodRadios(modal) {
    return modal.locator('#regularReviewerForm input[name="reviewMethod"]');
}

/** Close the "Add Reviewer" window (it has no "Cancel"; never Escape). */
async function closeRequestForm(modal) {
    await modal.getByRole('button', {name: /^Close/}).first().click();
    await expect(modal.locator('#regularReviewerForm')).toBeHidden({timeout: 30_000});
}

/** The reviewer's wizard on a press (its editor-only box reads "For editor only"). */
function pressWizard(page, tag) {
    return new ReviewWizardPage(page, tag, {privateBoxLabel: 'For editor only'});
}

/**
 * Walk an accepted request's wizard to step 3 (a seeded acceptance opens
 * on step 1 with "Save and continue"; step 2's "Continue to Step #3").
 */
async function walkToStep3(wizard, submissionId) {
    await wizard.goto(submissionId);
    await wizard.saveAndContinueButton.click();
    await wizard.expectStep(2);
    await wizard.continueToStep3Button.click();
    await wizard.expectStep(3);
}

/** A review-form question's own section on step 3 (sections nest; the last match is the question's). */
function formSection(wizard, question) {
    return wizard.step3Form.locator('.section').filter({hasText: question}).last();
}

test.describe('review setup & review forms', () => {
    test('S1: save the review setup', {tag: '@smoke'}, async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s1', testInfo);
        // The Reviewer's request is made before any change (seeded
        // `invited`, at the defaults); the spare reviewer is the request
        // the test sends after the save, the mailbox read's control.
        const {manager, reviewers: [reviewer], spare, submissionId} = await seedPress(ompApi, tag, {
            reviewers: [{status: 'invited'}],
            spare: true,
        });
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
        const setup = settings.setup;
        await settings.goto('Setup');

        // Control: the install defaults are on screen before the save.
        await expect(setup.modeRadio('Anonymous Reviewer/Anonymous Author')).toBeChecked();
        await expect(setup.checkbox(PUBLIC_BOX)).not.toBeChecked();
        await expect(setup.field('Default Response Deadline')).toHaveValue('4');
        await expect(setup.field('Default Completion Deadline')).toHaveValue('4');
        await expect(setup.field('Minimum Confirmed Reviews Required')).toHaveValue('0');
        for (const label of REMINDER_SLIDERS) {
            await expect(setup.sliderReadout(label)).toHaveText('No reminder set');
        }

        // The edits, then "Save": "Saved" beside the button.
        await setup.modeRadio('Open').check();
        await setup.checkbox(PUBLIC_BOX).check();
        await setup.field('Default Response Deadline').fill('2');
        await setup.field('Minimum Confirmed Reviews Required').fill('1');
        await setup.setSliderByKeyboard('Review Request Response - Before Due Date', 3);
        await expect(setup.sliderReadout('Review Request Response - Before Due Date')).toHaveText('3 days before due date');
        await setup.save();

        // Reload and open "Review" › "Setup" again: every value shows as saved.
        await settings.reloadAndOpen('Setup');
        await expect(setup.modeRadio('Open')).toBeChecked();
        await expect(setup.checkbox(PUBLIC_BOX)).toBeChecked();
        await expect(setup.field('Default Response Deadline')).toHaveValue('2');
        await expect(setup.field('Minimum Confirmed Reviews Required')).toHaveValue('1');
        await expect(setup.slider('Review Request Response - Before Due Date')).toHaveAttribute('aria-valuetext', '3 days before due date');
        await expect(setup.sliderReadout('Review Request Response - Before Due Date')).toHaveText('3 days before due date');

        // The round status box now opens with the minimum line.
        const workflow = await openEditorial(page, tag, submissionId);
        await expectRoundStatusOpensWith(workflow, 1, minimumLine(1));

        // The earlier request's "Edit" window keeps what it was made with:
        // the anonymous type, the box unticked, the response date four
        // weeks from today. Closed without saving.
        const editModal = await openEditReview(page, reviewerRow(workflow, reviewer.name));
        await expect(reviewTypeRadio(editModal, 'Anonymous Reviewer/Anonymous Author')).toBeChecked();
        await expect(reviewTypeRadio(editModal, 'Open')).not.toBeChecked();
        await expect(publicVisibilityBox(editModal)).not.toBeChecked();
        await expect(dateAltField(editModal, 'responseDueDate')).toHaveValue(isoDate(daysFromNow(28)));
        await cancelEditReview(page, editModal);

        // Add Reviewer: "Open" preselected, the box ticked, the response
        // due date two weeks out (control: the completion deadline left at
        // its default of four weeks). Sent to the spare reviewer, whose
        // request email bounds the mailbox read below.
        const addModal = await openAddReviewer(page, workflow);
        await selectReviewerAndAwaitForm(page, addModal, spare.name);
        await expect(reviewTypeRadio(addModal, 'Open')).toBeChecked();
        await expect(publicVisibilityBox(addModal)).toBeChecked();
        await expect(dateAltField(addModal, 'responseDueDate')).toHaveValue(isoDate(daysFromNow(14)));
        await expect(dateAltField(addModal, 'reviewDueDate')).toHaveValue(isoDate(daysFromNow(28)));
        await addModal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(reviewerRow(workflow, spare.name)).toContainText('Request Sent', {timeout: 30_000});

        // The Reviewer's mailbox: nothing from the save (the spare's
        // request email, sent after it, is the control that bounds the read).
        await pkpMail.expectNone({to: reviewer.email, afterControl: {to: spare.email}});
    });

    test('S2: a refused deadline saves nothing', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {manager} = await seedPress(ompApi, tag);
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
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

        // Control: the same box takes a whole number, with "Saved" and no notice.
        await setup.field('Default Completion Deadline').fill('2');
        await setup.save();
        await expect(settings.notice(REFUSED_NOTICE)).toHaveCount(0);
    });

    test('S3: unsaved edits survive a tab switch, not a reload', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {manager} = await seedPress(ompApi, tag);
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
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

        // Control: a saved value does survive the reload.
        await setup.field('Default Response Deadline').fill('2');
        await setup.save();
        await settings.reloadAndOpen('Setup');
        await expect(setup.field('Default Response Deadline')).toHaveValue('2');
    });

    test('S4: guidance reaches the reviewer', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const external = 'Judge the method first.';
        const internal = 'Judge the market first.';
        const policy = 'Declare any funding link.';
        const {manager, reviewers: [reviewer], submissionId} = await seedPress(ompApi, tag, {reviewers: [{status: 'invited'}]});

        // Manager: the external guidelines, the internal ones (the control
        // of the box split, OMP2) and the policy saved on "Reviewer Guidance".
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
        await settings.goto('Reviewer Guidance');
        await settings.guidance.typeExternal(external);
        await settings.guidance.typeInternal(internal);
        await settings.guidance.typeInto('competingInterests', policy);
        await settings.guidance.save();

        // External Reviewer: step 1's "Competing Interests" block, its
        // window, then step 2's guidelines — the external text, not the internal.
        const reviewerPage = await (await asUser(reviewer.username)).newPage();
        const wizard = pressWizard(reviewerPage, tag);
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
        await expect(step2).toContainText(external);
        const text = await step2.innerText();
        expect(text.indexOf('Reviewer Guidelines')).toBeLessThan(text.indexOf(external));
        await expect(step2).not.toContainText(internal);
        await expect(step2).not.toContainText('This publisher has not set any reviewer guidelines.');
    });

    test('S5: the guidelines box per app', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {manager} = await seedPress(ompApi, tag);
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
        const guidance = settings.guidance;
        await settings.goto();

        // The side tabs: a press lists "Setup", "Reviewer Guidance" and
        // "Review Forms" only; no "Reviewer Recommendations" tab, panel or
        // table (OMP1; the three tabs are the control, and "Review" sits
        // between "Submission" and "Press Library" in the top strip, OMP2).
        const topTabs = await settings.topTabNames();
        expect(topTabs.slice(0, 3)).toEqual(['Submission', 'Review', LIBRARY_TAB]);
        await settings.openReviewTab();
        expect(await settings.sideTabNames()).toEqual(PRESS_SIDE_TABS);
        await expect(settings.sideTab('Review Forms')).toBeVisible();
        await expect(settings.sideTab('Reviewer Recommendations')).toHaveCount(0);
        await expect(settings.sidePanel('Reviewer Recommendations')).toHaveCount(0);
        await expect(settings.reviewPanel).not.toContainText('Reviewer Recommendations');
        await expect(page.locator('[data-cy="reviewer-recommendation-manager"]')).toHaveCount(0);

        // A press has two guideline boxes, internal above external, and no
        // bare "Review Guidelines" box (OMP2); both are rich-text boxes.
        await settings.openSideTab('Reviewer Guidance');
        const headings = await guidance.headings();
        expect(headings).toContain(GUIDELINE_BOXES.internal.heading);
        expect(headings).toContain(GUIDELINE_BOXES.external.heading);
        expect(headings).toContain('Competing Interests');
        expect(headings).not.toContain('Review Guidelines');
        expect(headings.indexOf(GUIDELINE_BOXES.internal.heading)).toBeLessThan(headings.indexOf(GUIDELINE_BOXES.external.heading));
        await expect(guidance.internalBody).toBeVisible();
        await expect(guidance.externalBody).toBeVisible();

        // The words in the sentence open the instructions; "Close" closes
        // them, and there is no "OK" (control: "Close" is there). Pressing
        // the words left the box unticked.
        await expect(guidance.anonymizeBox).not.toBeChecked();
        await guidance.anonymizeWords.click();
        const window = guidance.instructionsWindow();
        await expect(window).toBeVisible({timeout: 30_000});
        await expect(window.getByRole('heading', {name: 'How to ensure all files are anonymized'})).toBeVisible();
        await expect(window.getByRole('button', {name: 'Close', exact: true})).toBeVisible();
        await expect(window.getByRole('button', {name: 'OK', exact: true})).toHaveCount(0);
        await window.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(window).toBeHidden({timeout: 30_000});
        await expect(guidance.anonymizeBox).not.toBeChecked();

        // Tick the anonymizing box, save, reload: it stays ticked.
        await guidance.anonymizeBox.check();
        await guidance.save();
        await settings.reloadAndOpen('Reviewer Guidance');
        await expect(guidance.anonymizeBox).toBeChecked();
    });

    test('S6: build a review form and offer it', {tag: '@smoke'}, async ({asUser, ompApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s6', testInfo);
        const title = 'Method check';
        const question = 'Is the method sound?';
        const scratch = 'Scratch question';
        const reworded = 'Scratch question, reworded';
        // No request is seeded: the reviewer stays in Add Reviewer's list
        // for the "Review Form" reads.
        const {manager, spare: reviewer, submissionId} = await seedPress(ompApi, tag, {spare: true});
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
        const forms = settings.forms;
        await settings.goto('Review Forms');
        await expect(forms.noItems).toBeVisible();

        // A refused form: "Save" with "Title" empty leaves the window open
        // with the reason under the box (control: the same window saves
        // once the title is typed, below).
        await forms.openCreateForm();
        await forms.pressFormSave();
        await expect(forms.titleRefusal()).toHaveText(FIELD_REQUIRED, {timeout: 30_000});
        await expect(forms.titleInput).toBeVisible();
        await expect(forms.row(title)).toHaveCount(0);

        // The form: the window closes, the notice, the row with 0 / 0 and no tick.
        await forms.titleInput.fill(title);
        await forms.saveFormWindow();
        await expect(forms.formFields).toBeHidden({timeout: 30_000});
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        const row = forms.row(title).first();
        await expect(row).toBeVisible({timeout: 30_000});
        expect(await forms.rowCounts(row)).toEqual({inReview: 0, completed: 0});
        await expect(forms.activeBox(row)).not.toBeChecked();

        // "Edit" › "Form Items" reads "No Items"; a refused item: "Save"
        // with nothing filled puts the reason under "Item type"; with a
        // type chosen and "Item" still empty the page notice names the
        // question and nothing sits under the box.
        const controls = await forms.rowControls(row);
        await forms.control(controls, 'Edit').click();
        await expect(forms.windowHeading()).toHaveText('Edit', {timeout: 30_000});
        await forms.openWindowTab('Form Items');
        await expect(forms.itemsGrid().getByText('No Items')).toBeVisible({timeout: 30_000});
        await forms.openCreateItem();
        await forms.pressItemSave();
        await expect(forms.itemTypeRefusal()).toHaveText(FIELD_REQUIRED, {timeout: 30_000});
        await expect(forms.itemForm).toBeVisible();
        await forms.itemTypeSelect.selectOption({label: RADIO_TYPE});
        expect(await forms.saveItemRefused()).toBe(true);
        await expect(page.getByText(ITEM_QUESTION_REQUIRED).first()).toBeVisible({timeout: 30_000});
        await expect(forms.itemQuestionRefusal()).toHaveCount(0);
        await expect(forms.itemForm).toBeVisible();

        // The items: the required radio item with its two options, then a
        // text item under it.
        await forms.saveItem({question, required: true, type: RADIO_TYPE, options: ['Yes', 'No']});
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        await forms.openCreateItem();
        await forms.saveItem({question: 'Other remarks', type: TEXTAREA_TYPE});
        await expect(forms.itemRows()).toHaveCount(2);
        await expect(forms.itemRows().nth(0)).toContainText(question);
        await expect(forms.itemRows().nth(1)).toContainText('Other remarks');

        // Edit and delete an item: a third item, its "Edit" window headed
        // "Edit", the reworded text saved with the notice and listed, then
        // "Delete" with its confirmation: two items remain.
        await forms.openCreateItem();
        await forms.saveItem({question: scratch, type: TEXTFIELD_TYPE});
        await expect(forms.itemRows()).toHaveCount(3);
        await forms.openItemEdit(forms.itemRow(scratch));
        await expect(forms.itemWindowHeading()).toHaveText('Edit', {timeout: 30_000});
        await forms.retypeItem(reworded);
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        await expect(forms.itemRow(reworded)).toHaveCount(1);
        await expect(forms.itemRows()).toHaveCount(3);
        await forms.deleteItem(forms.itemRow(reworded));
        await expect(forms.itemRow(reworded)).toHaveCount(0, {timeout: 30_000});
        await expect(forms.itemRows()).toHaveCount(2);
        await expect(forms.itemRows().nth(0)).toContainText(question);
        await expect(forms.itemRows().nth(1)).toContainText('Other remarks');

        // "Preview Form": the title, the starred question with two radios, the text box.
        await forms.openWindowTab('Preview Form');
        await expect(forms.previewForm).toBeVisible({timeout: 30_000});
        await expect(forms.previewForm.getByRole('heading', {name: title})).toBeVisible();
        await expect(forms.previewForm).toContainText(`${question}*`);
        await expect(forms.previewRadio('Yes')).toBeVisible();
        await expect(forms.previewRadio('No')).toBeVisible();
        await expect(forms.previewForm).toContainText('Other remarks');
        await expect(forms.previewForm.locator('textarea')).toHaveCount(1);
        await expect(forms.previewForm).not.toContainText(scratch);
        await forms.closeWindow();

        // Inactive: "Add Reviewer" has no "Review Form" list (control: the
        // same form's review type radios are there).
        let modal = await openRequestForm(page, tag, submissionId, reviewer.name);
        await expect(reviewMethodRadios(modal).first()).toBeVisible();
        await expect(reviewFormList(modal)).toHaveCount(0);
        await closeRequestForm(modal);

        // Tick "Active" › "OK": the notice, and the list now offers the form.
        await settings.goto('Review Forms');
        await forms.activeBox(forms.row(title).first()).click();
        await forms.answerConfirm(ACTIVATE_FORM, 'OK');
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        await expect(forms.activeBox(forms.row(title).first())).toBeChecked();
        modal = await openRequestForm(page, tag, submissionId, reviewer.name);
        await expect(reviewFormList(modal)).toBeVisible({timeout: 30_000});
        await expect(reviewFormList(modal).locator('option')).toHaveText([NONE_FORM, title]);
        await expect(reviewFormList(modal).locator('option:checked')).toHaveText(NONE_FORM);
    });

    test('S7: a form in use is frozen', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s7', testInfo);
        const title = 'Method check';
        const items = ['Is the method sound?', 'Other remarks'];
        // The Reviewer's open request carries the form; a second Reviewer's
        // free-form review is already submitted (`completed`, no form: on a
        // press it takes no recommendation); a spare reviewer for the Add
        // Reviewer control at the end.
        const {manager, reviewers: [carrier, completed], spare, submissionId} = await seedPress(ompApi, tag, {
            reviewForms: [{
                title,
                elements: [
                    {question: items[0], type: 'radiobuttons', required: true, options: ['Yes', 'No']},
                    {question: items[1], type: 'textarea'},
                ],
            }],
            reviewers: [{status: 'accepted', reviewForm: title}, {status: 'completed'}],
            spare: true,
        });
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
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
        await forms.closeWindow();

        // The open request's "Edit" window: "Method check" selected, not
        // the first entry "None / Free Form Review"; closed without saving.
        let workflow = await openEditorial(page, tag, submissionId);
        let editModal = await openEditReview(page, reviewerRow(workflow, carrier.name));
        await expect(reviewFormSelect(editModal)).toBeVisible({timeout: 30_000});
        await expect(reviewFormSelect(editModal).locator('option').first()).toHaveText(NONE_FORM);
        await expect(reviewFormSelected(editModal)).toHaveText(title);
        await cancelEditReview(page, editModal);

        // The completed request's "Edit" window has no "Review Form" list,
        // though the form is active (control: the same window's "Review
        // Type" group, and the other window's list just read).
        editModal = await openEditReview(page, reviewerRow(workflow, completed.name));
        await expect(editModal.getByText('Review Type')).toBeVisible();
        await expect(reviewFormSelect(editModal)).toHaveCount(0);
        await cancelEditReview(page, editModal);

        // Deactivate while carried: the question, "OK", the notice and the
        // tick gone (A2 is passed by: only the scenario's sentence is read).
        await settings.goto('Review Forms');
        await forms.activeBox(forms.row(title).first()).click();
        await forms.answerConfirm(DEACTIVATE_FORM, 'OK');
        await expect(forms.savedNotice()).toBeVisible({timeout: 30_000});
        await expect(forms.activeBox(forms.row(title).first())).not.toBeChecked();

        // The Reviewer's step 3 still shows "Method check" with its items
        // instead of the two free-text boxes.
        const reviewerPage = await (await asUser(carrier.username)).newPage();
        const wizard = pressWizard(reviewerPage, tag);
        await walkToStep3(wizard, submissionId);
        await expect(wizard.step3Form.getByText(title).first()).toBeVisible();
        await expect(formSection(wizard, items[0]).locator('fieldset[role="radiogroup"]')).toBeVisible();
        await expect(wizard.formRadio('Yes')).toBeVisible();
        await expect(wizard.formRadio('No')).toBeVisible();
        await expect(formSection(wizard, items[1]).locator('textarea')).toBeVisible();
        await expect(reviewerPage.locator('iframe[id^="comments"]')).toHaveCount(0);
        await expect(reviewerPage.getByText('For author and editor')).toHaveCount(0);
        await expect(reviewerPage.getByText('For editor only')).toHaveCount(0);

        // Control: the submission's "Add Reviewer" now has no "Review Form"
        // list, the copy being inactive (the review type radios are there).
        const addModal = await openRequestForm(page, tag, submissionId, spare.name);
        await expect(reviewMethodRadios(addModal).first()).toBeVisible();
        await expect(reviewFormList(addModal)).toHaveCount(0);
    });

    test('S8: deactivate and delete an unused form', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s8', testInfo);
        const title = 'Style check';
        // No request carries the form and none is seeded: the reviewer
        // stays in Add Reviewer's list for the "Review Form" reads.
        const {manager, spare: reviewer, submissionId} = await seedPress(ompApi, tag, {
            reviewForms: [{title, active: true, elements: [{question: 'Is the style consistent?', type: 'textarea'}]}],
            spare: true,
        });
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
        const forms = settings.forms;

        // Control for the absence below: while the form is active the list
        // is offered, "Style check" under "None / Free Form Review".
        let modal = await openRequestForm(page, tag, submissionId, reviewer.name);
        await expect(reviewFormList(modal)).toBeVisible({timeout: 30_000});
        await expect(reviewFormList(modal).locator('option')).toHaveText([NONE_FORM, title]);
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
        modal = await openRequestForm(page, tag, submissionId, reviewer.name);
        await expect(reviewMethodRadios(modal).first()).toBeVisible();
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

    test('S12: the other roles are refused the screen', async ({asUser}) => {
        test.slow();
        test.setTimeout(240_000);
        // Read-only on the seeded press: each role's own landing shows the
        // backend sidebar without a "Settings" group (its own group is the
        // control), and the typed Workflow Settings address lands on the
        // refusal.
        const refused = [
            {username: 'sectioneditor.ana', landing: `/index.php/${PK}/dashboard/editorial`},
            {username: 'assistant.rita', landing: `/index.php/${PK}/dashboard/editorial`},
            {username: 'reviewer.julia', landing: `/index.php/${PK}/dashboard/reviewAssignments`},
            {username: 'author.alex', landing: `/index.php/${PK}/dashboard/mySubmissions`},
        ];
        for (const {username, landing} of refused) {
            const page = await (await asUser(username)).newPage();
            const settings = new PressReviewSettingsPage(page, PK);
            await page.goto(landing);
            await expect(settings.sideNav().getByRole('region').first()).toBeVisible({timeout: 30_000});
            await expect(settings.settingsGroup()).toHaveCount(0);
            await expect(settings.settingsWord()).toHaveCount(0);
            await page.goto(settings.url());
            await expect(settings.accessDenied()).toBeVisible({timeout: 30_000});
            await expect(settings.heading).toHaveCount(0);
            await expect(settings.reviewTab).toHaveCount(0);
        }

        // Control: the Press Manager's sidebar has the collapsed "Settings"
        // group, which opened lists "Workflow", leading to the page with
        // its "Review" tab.
        const page = await (await asUser('manager.maya')).newPage();
        const settings = new PressReviewSettingsPage(page, PK);
        await page.goto(`/index.php/${PK}/dashboard/editorial`);
        await expect(settings.settingsGroup()).toBeVisible({timeout: 30_000});
        await expect(settings.sideNav().getByRole('link', {name: 'Workflow', exact: true})).toHaveCount(0);
        await settings.openFromSidebar();
        await expect(settings.reviewTab).toBeVisible();
        await expect(settings.accessDenied()).toHaveCount(0);
    });

    test('S13: a submitted review on a form with an item kept from the author', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s13', testInfo);
        const title = 'Method check';
        const items = ['Is the method sound?', 'Other remarks'];
        const remark = 'The sample is small.';
        const MINIMUM = minimumLine(1);
        // "Minimum Confirmed Reviews Required" at 1, the active form with
        // the second item's "Included in message to author" unticked, and
        // the Reviewer's accepted request carrying the form.
        const {manager, reviewers: [reviewer], submissionId} = await seedPress(ompApi, tag, {
            review: {numReviewsPerSubmission: 1},
            reviewForms: [{
                title,
                elements: [
                    {question: items[0], type: 'radiobuttons', options: ['Yes', 'No']},
                    {question: items[1], type: 'textarea', included: false},
                ],
            }],
            reviewers: [{status: 'accepted', reviewForm: title}],
        });

        // The form's row before the review: 1 / 0.
        const page = await (await asUser(manager)).newPage();
        const settings = new PressReviewSettingsPage(page, tag);
        const forms = settings.forms;
        await settings.goto('Review Forms');
        expect(await forms.rowCounts(forms.row(title).first())).toEqual({inReview: 1, completed: 0});

        // The Reviewer's step 3: the form's items instead of the two
        // free-text boxes; "Yes", the remark, no "Recommendation" list on
        // a press (control: "Submit Review" is there), submit and confirm.
        const reviewerPage = await (await asUser(reviewer.username)).newPage();
        const wizard = pressWizard(reviewerPage, tag);
        await walkToStep3(wizard, submissionId);
        await expect(wizard.step3Form.getByText(title).first()).toBeVisible();
        await expect(formSection(wizard, items[0]).locator('fieldset[role="radiogroup"]')).toBeVisible();
        await expect(wizard.formRadio('Yes')).toBeVisible();
        await expect(wizard.formRadio('No')).toBeVisible();
        const remarkBox = formSection(wizard, items[1]).locator('textarea');
        await expect(remarkBox).toBeVisible();
        await expect(reviewerPage.locator('iframe[id^="comments"]')).toHaveCount(0);
        await expect(reviewerPage.getByText('For author and editor')).toHaveCount(0);
        await wizard.formRadio('Yes').check();
        await remarkBox.fill(remark);
        await expect(wizard.submitReviewButton).toBeVisible();
        await expect(wizard.recommendationSelect).toHaveCount(0);
        await wizard.submitReview();
        await wizard.expectCompleted();

        // The form's row after the review: 0 / 1.
        await settings.goto('Review Forms');
        expect(await forms.rowCounts(forms.row(title).first())).toEqual({inReview: 0, completed: 1});

        // The round status opens with the minimum line; control: with the
        // review submitted and not yet marked complete, the line under it
        // does not read the "confirmed" sentence.
        let workflow = await openEditorial(page, tag, submissionId);
        await expectRoundStatusOpensWith(workflow, 1, MINIMUM);
        await expect(roundStatusBox(workflow, 1)).toHaveText(new RegExp(`^Round 1 Status\\s+${MINIMUM.replace(/[.]/g, '\\.')}\\s+\\S`));
        await expect(roundStatusBox(workflow, 1).getByText(STATUS.minimumConfirmed, {exact: true})).toHaveCount(0);

        // "Read Review": the row reads "Review Submitted"; the window shows
        // both items with their answers, the unticked one included.
        await expect(reviewerRow(workflow, reviewer.name)).toContainText('Review Submitted');
        let readModal = await openReadReview(page, workflow, reviewer.name);
        await expect(readModal.getByText(items[0]).first()).toBeVisible();
        await expect(readModal.getByText(items[1]).first()).toBeVisible();
        await expect(readModal.getByText(remark).first()).toBeVisible();
        const details = await reviewDetailsText(readModal);
        const firstAt = details.indexOf(items[0]);
        const secondAt = details.indexOf(items[1]);
        expect(firstAt).toBeGreaterThanOrEqual(0);
        expect(details.indexOf('Yes', firstAt)).toBeGreaterThan(firstAt);
        expect(details.indexOf('Yes', firstAt)).toBeLessThan(secondAt);
        expect(details.indexOf(remark, secondAt)).toBeGreaterThan(secondAt);

        // "Mark as Complete" and its confirmation: the round status keeps
        // its first line and the round's own line reads the "confirmed"
        // sentence.
        await markReviewComplete(page, readModal);
        await closeReadReview(page, workflow, readModal, reviewer.name, 'Complete');
        workflow = await openEditorial(page, tag, submissionId);
        await expectRoundStatusOpensWith(workflow, 1, MINIMUM, STATUS.minimumConfirmed);
    });
});
