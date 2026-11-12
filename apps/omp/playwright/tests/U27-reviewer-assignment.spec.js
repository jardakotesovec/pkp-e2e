// @ts-check
/**
 * @file playwright/tests/U27-reviewer-assignment.spec.js
 *
 * U27 — Reviewer assignment & management, OMP suite (spec:
 * docs/specs/U27-reviewer-assignment-and-management.md). One test per
 * canonical scenario the spec runs on a press, in OMP vocabulary (press,
 * monograph, External Review per the glossary; the reviewer roster splits
 * julia/paul → External, amara/adam → Internal): common scenarios 1–12,
 * 16–20 and 21 run on External Review, plus the OMP-specific stage-split scenario
 * 13 and the {OMP} control of scenario 14 as an absence test (no
 * recommendation surfaces on a press — OMP1 ✅). Scenario 15 is OPS-only.
 * S21's scratch press gets its "Competing Interests" policy through the
 * same `review` passthrough, and the scenario's own step empties it on
 * screen. The editor-side read window is the Vue "Review Details" modal with its
 * "Modify Review" partner (pkp/pkp-lib#13156 — Rules 14a/14b). S20's
 * scratch press is created with the context's `review` passthrough (the
 * press's Settings › Workflow › Review, never driven on screen).
 *
 * Not covered, by register ID (the spec's Coverage section is the record of
 * everything else left out; 🐞 findings are never asserted as contract):
 * A1, A2, A4, A6, A7, A12, A13, A15, A16, A17, A18, A19, A21, A22, A23,
 * A26, A28, A29, A30, A31, A32, A36, A37, A38, A39, A41, A42, A43, A44,
 * A45, A46, A47, A48, A49, A50, OMP2, OMP4, OMP6.
 *
 * Seeding: scenario endpoints only. Tests that read a server-fed notice
 * ("{name} was assigned…", "Reviewer removed.") or a reviewer's mailbox or
 * task list run on scratch presses with throwaway users (a shared user's
 * toast queue races under parallel workers; Mailpit is shared across fleets
 * and never cleared, so every mail claim is scoped by a unique throwaway
 * recipient, or by roster recipient plus the seeded title's tag, and every
 * silence claim is bounded by a positive control). The Review Details
 * windows' toasts ("Reviewer rating saved", "The review has been marked as
 * complete.") are client-emitted by the acting page and safe on a shared
 * user. All tests run in the parallel `omp` project — nothing here mutates
 * shared singletons.
 */
const {test, expect} = require('../support/fixtures.js');
const {getEmail} = require('../../../../shared/playwright/data/users.js');
const {
    decisionButton,
    openEditorial,
    openAuthorView,
    walkDecisionWizard,
    openTasksPanel,
    closeTopModal,
    uploadRoundReviewFile,
    participantPanel,
    selectRound,
    createNewReviewRound,
} = require('../pages/ReviewStagePages.js');
const {
    reviewerPanel,
    reviewerRow,
    openRowMenu,
    menuEntry,
    menuEntries,
    authorName,
    openFiltersSidebar,
    filterSlider,
    filterSliderInput,
    filterEnableButton,
    filterClearButton,
    listEntries,
    paginationBar,
    noFilesWarning,
    filesToBeReviewedGrid,
    reviewTypeRadio,
    publicVisibilityBox,
    openReminder,
    revertDecision,
    closeRowMenu,
    columnHeader,
    statusTitle,
    toasts,
    openEditorialNotes,
    openHistory,
    closeLegacyWindow,
    openActivityLog,
    activityLogRow,
    enrollSearchBox,
    enrollAutocomplete,
    reviewFormSelect,
    templateChooser,
    skipEmailBox,
    reassignButton,
    openThankReviewer,
    openAddReviewer,
    searchReviewerList,
    reviewerListEntry,
    selectButton,
    selectReviewerAndAwaitForm,
    awaitLetterEditorReady,
    awaitRequestFormReady,
    openEditReview,
    saveEditReview,
    setEditReviewFile,
    isoDate,
    daysFromNow,
    pickDate,
    dateAltField,
    completeReview,
    awaitTinyMce,
    openReadReview,
    rateReview,
    markReviewComplete,
    openModifyReview,
    pastWindowCloseSlot,
    pressTopClose,
    openRowReviewDetails,
    openModifyReviewWindow,
    saveModifyReview,
    cancelReviewDetails,
    competingInterestsGroup,
    declarationRadio,
    typeCompetingInterests,
    competingInterestsBadge,
    DATE_TIME,
    historyMilestones,
    datedLine,
    appendToMessage,
    clearCompetingInterestsPolicy,
    reviewDetailsText,
} = require('../pages/ReviewerAssignmentPages.js');
const {
    ReviewerAssignmentsPage,
    ReviewWizardPage,
} = require('../../../../shared/playwright/pages/ReviewerPages.js');
const {UsersAccessPage} = require('../pages/UserInvitationPages.js');
const {waitForJQueryIdle} = require('../../../../shared/playwright/support/legacy.js');
const fs = require('fs');

const PK = 'publicknowledge';
const DATE_RULE = 'Review due date must be greater or equal to response due date.';
/**
 * The inverted-date refusal (Fields, Rule 9). Its wording is register
 * finding A45 ("responde"; "adding the reviewer" in Edit and Resend), so
 * the tests match the sentence with those words left open, never the
 * misspelling itself (PRINCIPLES M3).
 */
const DATE_REFUSAL = /review due date must be equal or greater than respon\w* due date\./;
const ADD_REFUSAL = /There was an error adding the reviewer as review due date must be equal or greater than respon\w* due date\./;
/**
 * A notice reading exactly `sentence`: the notice's text is the sentence
 * and its dismiss button ("×", read "Close").
 */
function noticeReading(sentence) {
    return new RegExp(`^\\s*${sentence.source}\\s*×\\s*Close\\s*$`);
}
const ANY_REFUSAL = /There was an error \w+ the reviewer as review due date must be equal or greater than respon\w* due date\./;

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/** Seed a monograph on publicknowledge straight into External Review. */
async function seedExternal(ompApi, tag, reviewers = [], extra = {}) {
    return ompApi.createSubmission({
        tag,
        context: PK,
        submitter: 'author.alex',
        series: 'monographs',
        decisions: ['skipInternalReview'],
        reviewRounds: [{stage: 'external', reviewers}],
        ...extra,
    });
}

/**
 * Seed a scratch press (unique throwaway mailboxes / unshared toast queues)
 * with a manager, an author, and the given extra users, plus a monograph in
 * External Review round 1. `context` and `submission` extend the two seed
 * requests (review forms, participants).
 */
async function seedScratchPress(
    ompApi,
    tag,
    extraUsers,
    reviewers = [],
    {context = {}, submission = {}} = {}
) {
    const manager = `mgr${tag}`;
    const author = `au${tag}`;
    await ompApi.createContext({
        tag,
        users: [
            {username: manager, roles: ['manager'], givenName: `Mgr${tag}`, familyName: 'Manager'},
            {username: author, roles: ['author'], givenName: `Au${tag}`, familyName: 'Author'},
            ...extraUsers,
        ],
        ...context,
    });
    const seeded = await ompApi.createSubmission({
        tag,
        context: tag,
        submitter: author,
        decisions: ['skipInternalReview'],
        reviewRounds: [{stage: 'external', reviewers}],
        ...submission,
    });
    return {manager, author, seeded};
}

/**
 * The "Edit Review" window's OK, resolving once it closes: the page
 * object's, which presses once the window has stopped moving (a date pick's
 * calendar or a file box's "No Files Selected" slide).
 */
async function saveEditWindow(editModal) {
    await saveEditReview(editModal);
}

/**
 * Send a free-form "Email Reviewer" message from the row (subject and body
 * filled — A13 unasserted) and resolve once the window has closed.
 */
async function emailReviewer(page, row, {subject, body}) {
    const menu = await openRowMenu(page, row);
    await menuEntry(menu, 'Email Reviewer').click();
    const emailModal = page.locator('[data-cy="active-modal"]').last();
    const subjectInput = emailModal.locator('input[name="subject"]');
    await expect(subjectInput).toBeVisible({timeout: 20_000});
    await subjectInput.fill(subject);
    const bodyFrame = page
        .frameLocator('iframe[id^="message"]')
        .last()
        .locator('body');
    await bodyFrame.click();
    await bodyFrame.fill(body);
    await emailModal.getByRole('button', {name: 'Send Email'}).click();
    await expect(subjectInput).toBeHidden({timeout: 20_000});
    return emailModal;
}

test.describe('Reviewer assignment & management (U27)', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: invite a reviewer', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s1');
        // Scratch press: the add notices are server-fed toasts (a throwaway
        // manager's queue is this test's alone) and the second reviewer's
        // silence needs a unique mailbox.
        const first = `rva${tag}`;
        const second = `rvb${tag}`;
        const firstEmail = `${tag}one@mail.test`;
        const secondEmail = `${tag}two@mail.test`;
        const {manager, seeded} = await seedScratchPress(ompApi, tag, [
            {username: first, roles: ['externalReviewer'], givenName: `First${tag}`, familyName: 'Reviewer', email: firstEmail},
            {username: second, roles: ['externalReviewer'], givenName: `Second${tag}`, familyName: 'Reviewer', email: secondEmail},
        ]);

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);

        // "Add Reviewer": the window opens on "Locate a Reviewer" with no
        // request form and no submit button below the list (the search
        // box is the positive control on the same window; the form is kept
        // hidden until a reviewer is chosen, so hidden is the read).
        let addModal = await openAddReviewer(page, modal);
        await expect(
            addModal.getByRole('button', {name: 'Add Reviewer', exact: true})
        ).toBeHidden();
        await expect(
            addModal.locator('iframe[id^="personalMessage"]')
        ).toBeHidden();

        // Select the first reviewer: name and email show with a "Change"
        // link, and the request form appears with the prefilled letter and
        // the two due dates, preset from the press's review setup (4/4
        // weeks on every seeded context — Rule 9).
        await searchReviewerList(page, addModal, `First${tag}`);
        await selectReviewerAndAwaitForm(page, addModal, `First${tag} Reviewer`);
        await expect(addModal.getByText(firstEmail)).toBeVisible();
        const changeLink = addModal.getByText('Change', {exact: true});
        await expect(changeLink).toBeVisible();
        await expect(
            page
                .frameLocator('iframe[id^="personalMessage"]')
                .last()
                .locator('body')
        ).toContainText('I believe that you would serve as an excellent reviewer');
        await expect(dateAltField(addModal, 'responseDueDate')).toHaveValue(
            isoDate(daysFromNow(28))
        );
        await expect(dateAltField(addModal, 'reviewDueDate')).toHaveValue(
            isoDate(daysFromNow(28))
        );

        // "Change": the search shows again; select the same reviewer again.
        await changeLink.click();
        await expect(addModal.getByRole('searchbox').first()).toBeVisible();
        await expect(
            addModal.getByRole('button', {name: 'Add Reviewer', exact: true})
        ).toBeHidden();
        await searchReviewerList(page, addModal, `First${tag}`);
        await selectReviewerAndAwaitForm(page, addModal, `First${tag} Reviewer`);

        // "Close" with a reviewer picked: the window's top-bar "Close"
        // closes it at once, with no question asked, and no row is added
        // (the panel's own "Add Reviewer" is the positive control for the
        // row read); then "Add Reviewer" again and the first reviewer
        // selected.
        const asked = await pressTopClose(page, addModal, 'dismiss');
        await expect(addModal.getByRole('heading', {name: 'Locate a Reviewer'})).toBeHidden({timeout: 20_000});
        expect(asked).toEqual([]);
        await expect(
            reviewerPanel(modal).getByRole('button', {name: 'Add Reviewer', exact: true})
        ).toBeVisible();
        await expect(reviewerRow(modal, `First${tag} Reviewer`)).toHaveCount(0);
        await pastWindowCloseSlot(page);
        addModal = await openAddReviewer(page, modal);
        await searchReviewerList(page, addModal, `First${tag}`);
        await selectReviewerAndAwaitForm(page, addModal, `First${tag} Reviewer`);

        // The add: the notice, the "Request Sent" row (its "Response due:"
        // line is register finding A7, unasserted), the request email
        // under the manager's name, and the activity-log entry.
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        await expect(
            page.getByText(
                `First${tag} Reviewer was assigned to review this submission and sent an email notification.`
            )
        ).toBeVisible({timeout: 20_000});
        const row = reviewerRow(modal, `First${tag} Reviewer`);
        await expect(row).toBeVisible({timeout: 20_000});
        await expect(row).toContainText('Request Sent');
        const request = await pkpMail.find({
            to: firstEmail,
            subject: 'Manuscript Review Request',
        });
        expect(request.From.Name).toBe(`Mgr${tag} Manager`);
        const log = await openActivityLog(page);
        await expect(
            activityLogRow(log, 'has been assigned to review submission')
        ).toContainText(`First${tag} Reviewer`);
        await log.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(log).toBeHidden({timeout: 20_000});

        // "Editorial Notes": the row's "More Actions" menu lists, in
        // order, only "Review Details", "Edit", "Unassign Reviewer",
        // "Email Reviewer", "History", "Login As", "Editorial Notes" and
        // "Log Response" (the whole menu, read as one list). Pressing
        // "Editorial Notes" opens one text field under the audience
        // guidance.
        const modal2 = await openEditorial(page, tag, seeded.submissionId);
        const row2 = reviewerRow(modal2, `First${tag} Reviewer`);
        const orderMenu = await openRowMenu(page, row2);
        await expect(menuEntries(orderMenu)).toHaveText([
            'Review Details',
            'Edit',
            'Unassign Reviewer',
            'Email Reviewer',
            'History',
            'Login As',
            'Editorial Notes',
            'Log Response',
        ]);
        await closeRowMenu(page, row2, orderMenu);
        const notes = await openEditorialNotes(page, row2);
        await expect(
            notes.getByText(
                'Record notes about this reviewer that you would like to make visible to other administrators, managers and all editors. Notes will be visible for future review assignments.'
            )
        ).toBeVisible();
        await expect(notes.locator('iframe[id^="gossip"]')).toHaveCount(1);
        await closeLegacyWindow(page, notes);

        // "Do not send email to Reviewer.": the second reviewer's add reads
        // "was not sent an email notification." and the row "Request Sent".
        const addModal2 = await openAddReviewer(page, modal2);
        await searchReviewerList(page, addModal2, `Second${tag}`);
        await selectReviewerAndAwaitForm(page, addModal2, `Second${tag} Reviewer`);
        await skipEmailBox(addModal2).check();
        await addModal2
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        await expect(
            page.getByText(
                `Second${tag} Reviewer was assigned to review this submission and was not sent an email notification.`
            )
        ).toBeVisible({timeout: 20_000});
        const secondRow = reviewerRow(modal2, `Second${tag} Reviewer`);
        await expect(secondRow).toBeVisible({timeout: 20_000});
        await expect(secondRow).toContainText('Request Sent');

        // Control: the second reviewer's mailbox holds no request email —
        // bounded by a later Email Reviewer message to the same mailbox.
        await emailReviewer(page, secondRow, {
            subject: `Control ctl${tag}`,
            body: `Control body ctl${tag}.`,
        });
        await pkpMail.expectNone({
            to: secondEmail,
            subject: 'Manuscript Review Request',
            afterControl: {to: secondEmail, contains: `ctl${tag}`},
        });
    });

    test('S2: the list warns before anonymity breaks', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s2');
        // Scratch press: the lock needs a reviewer who is also a Press
        // Manager, and no seeded user may gain a role (PRINCIPLES A7).
        const assigned = `rva${tag}`;
        const lockedMgr = `rvb${tag}`;
        // Thirty more never-assigned reviewers push the pool past the
        // list's page of 30 (the opening list pages; one of them is the
        // entry read).
        const pool = Array.from({length: 30}, (_, i) => ({
            username: `rp${String(i).padStart(2, '0')}${tag}`,
            roles: ['externalReviewer'],
            givenName: `Pool${String(i).padStart(2, '0')}${tag}`,
            familyName: 'Reviewer',
        }));
        const {manager, seeded} = await seedScratchPress(
            ompApi,
            tag,
            [
                {username: assigned, roles: ['externalReviewer'], givenName: `Assigned${tag}`, familyName: 'Reviewer'},
                {username: lockedMgr, roles: ['manager', 'externalReviewer'], givenName: `Locked${tag}`, familyName: 'Reviewer'},
                ...pool,
            ],
            [{username: assigned, status: 'invited'}]
        );

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);
        let addModal = await openAddReviewer(page, modal);

        // The opening list: the submission's author named in bold above
        // it; the "Filters" sidebar's five sliders, each disabled until its
        // enable button is pressed; 30 entries above the "View additional
        // pages" bar; enabling "Reviews completed" enables that slider; a
        // never-assigned reviewer's entry shows the name, "0 active" and
        // "Never assigned".
        await expect(authorName(addModal, `Au${tag} Author`)).toBeVisible();
        const sidebar = await openFiltersSidebar(addModal);
        const sliderTitles = [
            'Rated at least',
            'Reviews completed',
            'Days since last review assigned',
            'Active reviews currently assigned',
            'Average days to complete review',
        ];
        for (const title of sliderTitles) {
            const slider = filterSlider(sidebar, title);
            await expect(slider).toBeVisible();
            // A range filter ("Days since…", "Active reviews…") is two
            // range inputs (more than / less than); every input of the
            // slider sits disabled.
            const inputs = filterSliderInput(slider);
            await expect(inputs.first()).toBeAttached();
            for (const input of await inputs.all()) {
                await expect(input).toBeDisabled();
            }
            await expect(filterEnableButton(slider, title)).toBeVisible();
        }
        await expect(listEntries(addModal)).toHaveCount(30);
        await expect(paginationBar(addModal)).toBeVisible();
        const completedSlider = filterSlider(sidebar, 'Reviews completed');
        await filterEnableButton(completedSlider, 'Reviews completed').click();
        await expect(filterSliderInput(completedSlider)).toBeEnabled();
        // The other four stay disabled (the enabled one is the control).
        await expect(filterSliderInput(filterSlider(sidebar, 'Rated at least'))).toBeDisabled();
        // The never-assigned entry is read with the filter cleared again:
        // with "Reviews completed" enabled, a name search for a
        // never-assigned reviewer answers "No items found." (finding
        // T-omp-1 of 2026-09-13, .reports/U27/test-omp-findings-2026-09-13.md).
        await filterClearButton(completedSlider, 'Reviews completed').click();
        await expect(filterSliderInput(completedSlider)).toBeDisabled();
        await searchReviewerList(page, addModal, `Pool07${tag}`);
        const poolEntry = reviewerListEntry(addModal, `Pool07${tag} Reviewer`);
        await expect(poolEntry).toBeVisible();
        await expect(poolEntry).toContainText('Never assigned');
        // "0 active": NOT asserted — the entry carries no "{N} active"
        // badge at all for a reviewer with no active review; its brief
        // shows the completed count "0" beside "Never assigned" (finding
        // T-omp-2 of 2026-09-13).

        // The manager-reviewer is locked with the author-identity warning
        // and no Select button; Unlock frees it, and the add goes through.
        await searchReviewerList(page, addModal, `Locked${tag}`);
        const lockedEntry = reviewerListEntry(addModal, `Locked${tag} Reviewer`);
        await expect(
            lockedEntry.getByText(
                'This reviewer is locked because they have been assigned a role which allows them to view the author\'s identity. Anonymous peer review can not be guaranteed. Would you like to unlock this reviewer anyway?'
            )
        ).toBeVisible();
        await expect(selectButton(lockedEntry)).toHaveCount(0);
        await lockedEntry.getByText('Unlock', {exact: true}).click();
        await expect(selectButton(lockedEntry)).toBeVisible();
        await selectReviewerAndAwaitForm(page, addModal, `Locked${tag} Reviewer`);
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        const lockedRow = reviewerRow(modal, `Locked${tag} Reviewer`);
        await expect(lockedRow).toBeVisible({timeout: 20_000});
        await expect(lockedRow).toContainText('Request Sent');

        // A reviewer already on the round cannot be selected again.
        addModal = await openAddReviewer(page, modal);
        await searchReviewerList(page, addModal, `Assigned${tag}`);
        const assignedEntry = reviewerListEntry(addModal, `Assigned${tag} Reviewer`);
        await expect(
            assignedEntry.getByText(
                'This reviewer has already been assigned to this review round.'
            )
        ).toBeVisible();
        await expect(selectButton(assignedEntry)).toHaveCount(0);

        // Own row: NOT asserted — on a press the manager-reviewer opening
        // the same submission's review stage meets "You don't currently
        // have access to that stage of the workflow." and no panel at all
        // (finding T-omp-1, .reports/U27/test-omp-findings.md). Control:
        // the Press Manager's menu on the first reviewer's row offers
        // "Editorial Notes", and on the manager-reviewer's row too.
        await closeTopModal(page);
        await expect(addModal.getByRole('searchbox')).toHaveCount(0);
        const modal2 = await openEditorial(page, tag, seeded.submissionId);
        const assignedRow = reviewerRow(modal2, `Assigned${tag} Reviewer`);
        const assignedMenu = await openRowMenu(page, assignedRow);
        await expect(menuEntry(assignedMenu, 'Editorial Notes')).toBeVisible();
        await closeRowMenu(page, assignedRow, assignedMenu);
        const lockedRow2 = reviewerRow(modal2, `Locked${tag} Reviewer`);
        const lockedMenu = await openRowMenu(page, lockedRow2);
        await expect(menuEntry(lockedMenu, 'Editorial Notes')).toBeVisible();
    });

    test('S3: create a brand-new reviewer', async ({ompApi, asUser, pkpMail, browser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s3');
        const email = `${tag}new@mail.test`;
        // Scratch press: the duplicate refusals are server-fed toasts, and
        // the Press Manager's own username and address are the duplicates.
        const {manager, seeded} = await seedScratchPress(ompApi, tag, []);
        const managerEmail = `${manager}@mail.test`;

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);
        const addModal = await openAddReviewer(page, modal);

        // "Create New Reviewer": the account fields appear above the
        // request form; no "Appear on the masthead" box, as reviewers are
        // not listed on a new press (pkp/pkp-lib#13370, 2026-10-23).
        await addModal.getByText('Create New Reviewer', {exact: true}).click();
        const givenName = addModal.locator('input[name^="givenName"]').first();
        await expect(givenName).toBeVisible({timeout: 20_000});
        await expect(addModal.getByRole('checkbox', {name: 'Appear on the masthead'})).toHaveCount(0);
        // Control: one reviewer group serves the stage, so the create form
        // shows no reviewer role select (the username field beside it is
        // the positive control).
        const username = addModal.locator('input[name="username"]');
        await expect(username).toBeVisible();
        await expect(addModal.locator('select[name="userGroupId"]')).toHaveCount(0);

        await givenName.fill(`New${tag}`);
        await addModal.locator('input[name^="familyName"]').first().fill('Reviewer');
        const emailInput = addModal.locator('input[name="email"]');
        await emailInput.fill(email);

        // "Suggest" fills a lowercase username proposal from the given name.
        await addModal.getByText('Suggest', {exact: true}).click();
        await expect(username).toHaveValue(/^[a-z0-9]+$/, {timeout: 10_000});
        const suggestedUsername = await username.inputValue();
        await awaitRequestFormReady(page, addModal);

        // Duplicates refused: the manager's own username, then their own
        // address, each with its toast.
        await username.fill(manager);
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        await expect(
            page.getByText('The selected username is already in use by another user.')
        ).toBeVisible({timeout: 20_000});
        await username.fill(suggestedUsername);
        await emailInput.fill(managerEmail);
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        await expect(
            page.getByText('The selected email address is already in use by another user.')
        ).toBeVisible({timeout: 20_000});

        // The add: the row reads "Request Sent".
        await emailInput.fill(email);
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        const row = reviewerRow(modal, `New${tag} Reviewer`);
        await expect(row).toBeVisible({timeout: 20_000});
        await expect(row).toContainText('Request Sent');

        // The new address's mailbox holds the registration email (username
        // and password) and the review request.
        const registration = await pkpMail.find({
            to: email,
            subject: 'Registration as Reviewer',
        });
        await pkpMail.find({
            to: email,
            subject: 'Manuscript Review Request',
        });
        const full = await pkpMail.fullMessage(registration.ID);
        const passwordMatch = (full.HTML || full.Text).match(
            /Password: ([^<\s&]+)/
        );
        expect(passwordMatch).not.toBeNull();
        const password = passwordMatch[1];
        expect((full.HTML || full.Text).includes(suggestedUsername)).toBe(true);

        // The press's users list shows the new account with the Reviewer
        // role.
        const access = new UsersAccessPage(page, tag);
        await access.goto();
        await access.searchUsers(`New${tag}`);
        const userRow = access.userRow(`New${tag}`);
        await expect(userRow).toBeVisible();
        await expect(userRow).toContainText('External Reviewer');

        // First sign-in with the generated password lands on Change Password.
        const anonCtx = await browser.newContext({
            storageState: {cookies: [], origins: []},
        });
        const loginPage = await anonCtx.newPage();
        await loginPage.goto('/index.php/index/en/login');
        await loginPage.locator('input#username').fill(suggestedUsername);
        await loginPage.locator('input#password').fill(password);
        await loginPage.locator('form#login button').click();
        await expect(
            loginPage.getByText('Change Password').first()
        ).toBeVisible({timeout: 20_000});
        await anonCtx.close();
    });

    test('S4: enroll an existing user', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s4');
        // Scratch press: enrolling grants a permanent reviewer role, so the
        // enrollee must be a throwaway (never a seeded user).
        const enrollee = `enr${tag}`;
        const existingRev = `exr${tag}`;
        const {manager, seeded} = await seedScratchPress(ompApi, tag, [
            {username: enrollee, roles: ['author'], givenName: `Enrolee${tag}`, familyName: 'Person'},
            {username: existingRev, roles: ['externalReviewer'], givenName: `Extrev${tag}`, familyName: 'Reviewer'},
        ]);

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);
        let addModal = await openAddReviewer(page, modal);

        // The enroll form's "Close": the Author's name typed into "Search
        // By Name" and no suggestion picked (the autocomplete's own answer
        // bounds the typing), the top "Close" asks "The data on this form
        // has changed. Do you wish to continue without saving?"; "OK"
        // closes the window and no row is added (the panel's "Add
        // Reviewer" is the positive control); "Add Reviewer" again.
        await addModal.getByText('Enroll Existing User', {exact: true}).click();
        await expect(enrollSearchBox(addModal)).toBeVisible({timeout: 20_000});
        await awaitRequestFormReady(page, addModal);
        await enrollAutocomplete(page, addModal, `Enrolee${tag}`);
        const asked = await pressTopClose(page, addModal, 'accept');
        expect(asked).toEqual([
            'The data on this form has changed. Do you wish to continue without saving?',
        ]);
        await expect(addModal.getByRole('heading', {name: 'Locate a Reviewer'})).toBeHidden({timeout: 20_000});
        await expect(
            reviewerPanel(modal).getByRole('button', {name: 'Add Reviewer', exact: true})
        ).toBeVisible();
        await expect(reviewerRow(modal, `Enrolee${tag} Person`)).toHaveCount(0);
        await pastWindowCloseSlot(page);
        addModal = await openAddReviewer(page, modal);

        // "Enroll Existing User": the form's heading, "Search By Name" and the
        // one-option reviewer role select; no masthead box while reviewers are
        // not listed (pkp/pkp-lib#13370).
        await addModal.getByText('Enroll Existing User', {exact: true}).click();
        await expect(
            addModal.getByText('Enroll an Existing User as Reviewer')
        ).toBeVisible({timeout: 20_000});
        await expect(addModal.getByText('Search By Name')).toBeVisible();
        const roleSelect = addModal.locator('select[name="userGroupId"]');
        await expect(roleSelect).toBeVisible();
        await expect(roleSelect.locator('option')).toHaveCount(1);
        await roleSelect.selectOption({label: 'External Reviewer'});
        await expect(addModal.getByRole('checkbox', {name: 'Appear on the masthead'})).toHaveCount(0);

        // Submitting with the field empty: "This field is required." above
        // it (A14 retired: the message now belongs to an empty submit).
        await awaitRequestFormReady(page, addModal);
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        const required = addModal.getByText('This field is required.');
        await expect(required).toBeVisible({timeout: 10_000});

        // A name typed, not picked: the Author's name typed and the box
        // left (a click on the form's heading) without a suggestion picked
        // is cleared; "Add Reviewer" shows "This field is required." under
        // the box again.
        await enrollAutocomplete(page, addModal, `Enrolee${tag}`);
        await expect(enrollSearchBox(addModal)).toHaveValue(`Enrolee${tag}`);
        await addModal.getByText('Enroll an Existing User as Reviewer').click();
        await expect(enrollSearchBox(addModal)).toHaveValue('');
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        await expect(required).toBeVisible({timeout: 10_000});

        // The pick: the autocomplete offers users of the press with no
        // reviewer role; picking one clears the message and the add goes
        // through.
        const suggestions = await enrollAutocomplete(page, addModal, `Enrolee${tag}`);
        await suggestions.getByText(`Enrolee${tag} Person`).first().click();
        await expect(required).toBeHidden();
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        const row = reviewerRow(modal, `Enrolee${tag} Person`);
        await expect(row).toBeVisible({timeout: 20_000});
        await expect(row).toContainText('Request Sent');

        // The press's users list shows the user now also holds the role.
        const access = new UsersAccessPage(page, tag);
        await access.goto();
        await access.searchUsers(`Enrolee${tag}`);
        const userRow = access.userRow(`Enrolee${tag}`);
        await expect(userRow).toBeVisible();
        await expect(userRow).toContainText('External Reviewer');

        // Control: an existing reviewer's name finds nothing (bounded by
        // the autocomplete's own response).
        const modal2 = await openEditorial(page, tag, seeded.submissionId);
        addModal = await openAddReviewer(page, modal2);
        await addModal.getByText('Enroll Existing User', {exact: true}).click();
        await expect(enrollSearchBox(addModal)).toBeVisible({timeout: 20_000});
        const empty = await enrollAutocomplete(page, addModal, `Extrev${tag}`);
        await expect(empty).toContainText('No Matches');
        await expect(empty.getByText(`Extrev${tag}`)).toHaveCount(0);
    });

    test('S5: deadlines are validated', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s5');
        // Scratch press: the refusal's notice is a server-fed form-error
        // notice (Form::validate, NOTIFICATION_TYPE_FORM_ERROR), drained by
        // whichever page of the user loads next, so it is read by a
        // throwaway manager no other test signs in as (parallel lesson 2).
        const reviewer = `rev${tag}`;
        const {manager, seeded} = await seedScratchPress(ompApi, tag, [
            {username: reviewer, roles: ['externalReviewer'], givenName: `Due${tag}`, familyName: 'Reviewer'},
        ]);
        const reviewerName = `Due${tag} Reviewer`;

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);
        const addModal = await openAddReviewer(page, modal);
        await searchReviewerList(page, addModal, `Due${tag}`);
        await selectReviewerAndAwaitForm(page, addModal, reviewerName);

        // "Files To Be Reviewed": the round carries no files (the seed
        // uploads none), so the list is empty — no file row, no box to
        // tick — and the inline warning "No Files Selected" shows.
        const filesGrid = filesToBeReviewedGrid(addModal);
        await expect(noFilesWarning(addModal)).toBeVisible({timeout: 20_000});
        await expect(filesGrid).toBeAttached();
        await expect(filesGrid.locator('input[type="checkbox"]')).toHaveCount(0);
        await expect(filesGrid.locator('tr.gridRow')).toHaveCount(0);

        // The permanent guidance sentence states the rule.
        await expect(addModal.getByText(DATE_RULE)).toBeVisible();

        // Inverted dates (calendar picks — A16): "Add Reviewer", read at
        // once: a notice at the top right, gone by itself within seconds,
        // refuses the dates (its wording is register finding A45, so the
        // sentence is matched with the misspelt word left open); no
        // assignment is created and the window stays open.
        await pickDate(page, addModal, 'reviewDueDate', daysFromNow(7));
        const refused = page.waitForResponse((r) =>
            r.url().includes('update-reviewer')
        );
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        await refused;
        const notice = page
            .locator('.app__notifications .pkpNotification')
            .filter({hasText: DATE_REFUSAL});
        await expect(notice).toBeVisible({timeout: 20_000});
        await expect(notice).toHaveText(noticeReading(ADD_REFUSAL));
        await expect(notice).toBeHidden({timeout: 30_000});
        await expect(
            addModal.getByRole('button', {name: 'Add Reviewer', exact: true})
        ).toBeVisible();
        await expect(addModal.getByText(DATE_RULE)).toBeVisible();

        // Control: "Review Due Date" on the same day as "Response Due
        // Date" (four weeks, the seeded press's preset) is taken: the row
        // appears.
        await pickDate(page, addModal, 'reviewDueDate', daysFromNow(28));
        await expect(dateAltField(addModal, 'responseDueDate')).toHaveValue(isoDate(daysFromNow(28)));
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        const row = reviewerRow(modal, reviewerName);
        await expect(row).toBeVisible({timeout: 20_000});
        await expect(row).toContainText('Request Sent');
        // The refused press created no assignment: the reviewer has the one
        // row the accepted press added.
        await expect(row).toHaveCount(1);
    });

    test('S6: edit an assignment, reviewer is told', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s6');
        const reviewer = `rev${tag}`;
        const reviewerEmail = `${tag}rev@mail.test`;
        const fileA = `rfa${tag}.txt`;
        const fileB = `rfb${tag}.txt`;
        const {manager, seeded} = await seedScratchPress(
            ompApi,
            tag,
            [{username: reviewer, roles: ['externalReviewer'], givenName: `Rev${tag}`, familyName: 'Reviewer', email: reviewerEmail}],
            [{username: reviewer, status: 'invited'}]
        );

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);
        // Two review files on the round (the seed carries none).
        await uploadRoundReviewFile(page, modal, fileA);
        await uploadRoundReviewFile(page, modal, fileB);
        const row = reviewerRow(modal, `Rev${tag} Reviewer`);

        // "Edit", the dates: the window shows the date rule; the inverted
        // dates are refused, read at once, by the notice at the top right
        // (A45's wording left open) and the window stays open; then the
        // review due date moves a week past the original 4 weeks (calendar
        // picks — A16). The files added after the assignment are ticked
        // here so the later files-only edit has boxes to untick.
        let editModal = await openEditReview(page, row);
        await expect(editModal.getByText(DATE_RULE)).toBeVisible();
        await pickDate(page, editModal, 'reviewDueDate', daysFromNow(7));
        const refused = page.waitForResponse((r) =>
            /\/update-review(\?|$)/.test(r.url())
        );
        await editModal.getByRole('button', {name: 'OK', exact: true}).click();
        await refused;
        const notice = page
            .locator('.app__notifications .pkpNotification')
            .filter({hasText: DATE_REFUSAL});
        await expect(notice).toBeVisible({timeout: 20_000});
        await expect(notice).toHaveText(noticeReading(ANY_REFUSAL));
        await expect(editModal.getByText('Review Type')).toBeVisible();
        await pickDate(page, editModal, 'reviewDueDate', daysFromNow(35));
        const fileBoxes = editModal.locator('input[name="selectedFiles[]"]');
        await expect(fileBoxes).toHaveCount(2);
        // Each tick slides the warning above the grid: the page object
        // presses once the window has stopped moving.
        for (const name of [fileA, fileB]) {
            await setEditReviewFile(editModal, name, true);
        }
        await saveEditWindow(editModal);

        // The reviewer's side: the Tasks panel holds "Review pending." and
        // "Review assignment updated.", and the mailbox the change notice.
        const revPage = await (await asUser(reviewer)).newPage();
        await revPage.goto(`/index.php/${tag}/en/dashboard/reviewAssignments`);
        let tasks = await openTasksPanel(revPage);
        await expect(tasks.getByText('Review pending.').first()).toBeVisible();
        await expect(
            tasks.getByText('Review assignment updated.').first()
        ).toBeVisible();
        await closeTopModal(revPage);
        await pkpMail.find({
            to: reviewerEmail,
            subject: 'Your review assignment has been changed',
        });

        // "Close" with a change: "Review Due Date" two weeks past the
        // original date and the top "Close": it asks "The data on this form
        // has changed. Do you wish to continue without saving?"; "Cancel"
        // keeps the window with the new date; "Close" again and "OK" close
        // it with the row unchanged; "Edit" again shows the date saved
        // before; "Close" with nothing changed closes at once.
        const changedQuestion = 'The data on this form has changed. Do you wish to continue without saving?';
        // A fresh landing first: a calendar opened from a second Edit window
        // on the same page never takes the day click (S7, run 4 of
        // 2026-09-13).
        await openEditorial(page, tag, seeded.submissionId);
        await expect(row).toContainText('Request Sent');
        const rowBefore = (await row.innerText()).replace(/\s+/g, ' ').trim();
        editModal = await openEditReview(page, row);
        await expect(dateAltField(editModal, 'reviewDueDate')).toHaveValue(isoDate(daysFromNow(35)));
        await pickDate(page, editModal, 'reviewDueDate', daysFromNow(42));
        let asked = await pressTopClose(page, editModal, 'dismiss');
        expect(asked).toEqual([changedQuestion]);
        await expect(editModal.getByText('Review Type')).toBeVisible();
        await expect(dateAltField(editModal, 'reviewDueDate')).toHaveValue(isoDate(daysFromNow(42)));
        asked = await pressTopClose(page, editModal, 'accept');
        expect(asked).toEqual([changedQuestion]);
        await expect(editModal.getByText('Review Type')).toBeHidden({timeout: 20_000});
        await expect(row).toHaveText(rowBefore, {useInnerText: true});
        await pastWindowCloseSlot(page);
        editModal = await openEditReview(page, row);
        await expect(dateAltField(editModal, 'reviewDueDate')).toHaveValue(isoDate(daysFromNow(35)));
        asked = await pressTopClose(page, editModal, 'dismiss');
        await expect(editModal.getByText('Review Type')).toBeHidden({timeout: 20_000});
        expect(asked).toEqual([]);
        await pastWindowCloseSlot(page);

        // "Files To Be Reviewed": untick every file: "No Files Selected"
        // appears; tick the first back: it disappears. Save.
        editModal = await openEditReview(page, row);
        const boxes = editModal.locator('input[name="selectedFiles[]"]');
        await expect(boxes).toHaveCount(2);
        const noFiles = editModal.getByText('No Files Selected');
        await expect(noFiles).toBeHidden();
        for (const name of [fileA, fileB]) {
            await setEditReviewFile(editModal, name, false);
        }
        await expect(noFiles).toBeVisible();
        await setEditReviewFile(editModal, fileA, true);
        await expect(noFiles).toBeHidden();
        await saveEditWindow(editModal);

        // The reviewer's files: "Respond to request" on their list opens
        // step 1, whose "Review Files" lists the first file alone (the
        // grid's own load bounds the absence).
        const list = new ReviewerAssignmentsPage(revPage, tag);
        await list.goto('actionRequired');
        await list.openWizard(list.row(`Submission ${tag}`), 'Respond to request');
        const wizard = new ReviewWizardPage(revPage, tag, {privateBoxLabel: 'For editor only'});
        await wizard.expectStep(1);
        await wizard.expectReviewFilesSettled(1);
        const filesGrid = wizard.reviewFilesGrid(1);
        await expect(filesGrid.getByText(fileA)).toBeVisible();
        await expect(filesGrid.getByText(fileB)).toHaveCount(0);

        // Control: a files-only edit sent nothing — one change notice and
        // one "Review assignment updated." ever, bounded by a later Email
        // Reviewer message to the same throwaway mailbox.
        await emailReviewer(page, row, {
            subject: `Control ctl${tag}`,
            body: `Control body ctl${tag}.`,
        });
        await pkpMail.find({to: reviewerEmail, contains: `ctl${tag}`});
        expect(
            await pkpMail.count({
                to: reviewerEmail,
                subject: 'Your review assignment has been changed',
            })
        ).toBe(1);
        await revPage.goto(`/index.php/${tag}/en/dashboard/reviewAssignments`);
        tasks = await openTasksPanel(revPage);
        await expect(tasks.getByText('Review assignment updated.')).toHaveCount(1);
    });

    test('S7: remind an overdue reviewer', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s7');
        const overdueRev = `rva${tag}`;
        const onTimeRev = `rvb${tag}`;
        const acceptedRev = `rvc${tag}`;
        const overdueEmail = `${tag}rov@mail.test`;
        const onTimeEmail = `${tag}ont@mail.test`;
        const acceptedEmail = `${tag}acc@mail.test`;
        const {manager, seeded} = await seedScratchPress(
            ompApi,
            tag,
            [
                {username: overdueRev, roles: ['externalReviewer'], givenName: `Late${tag}`, familyName: 'Reviewer', email: overdueEmail},
                {username: onTimeRev, roles: ['externalReviewer'], givenName: `Ontime${tag}`, familyName: 'Reviewer', email: onTimeEmail},
                {username: acceptedRev, roles: ['externalReviewer'], givenName: `Slow${tag}`, familyName: 'Reviewer', email: acceptedEmail},
            ],
            [
                {username: overdueRev, status: 'invited'},
                {username: onTimeRev, status: 'invited'},
                {username: acceptedRev, status: 'accepted'},
            ]
        );

        const page = await (await asUser(manager)).newPage();
        let modal = await openEditorial(page, tag, seeded.submissionId);
        const row = reviewerRow(modal, `Late${tag} Reviewer`);

        // Backdate the response due date through the Edit window — the
        // screens' only route to an overdue row (the pickers accept past
        // dates; whether they should warn is open finding A17).
        const editModal = await openEditReview(page, row);
        await pickDate(page, editModal, 'responseDueDate', daysFromNow(-1));
        await saveEditWindow(editModal);
        // The accepted reviewer: both dates backdated the same way (the
        // review date one day past, the response date before it, so the
        // window's own rule holds). A fresh landing first: the calendar
        // opened from a second Edit window on the same page never took
        // the day click (run 4, 2026-09-13).
        const reviewDuePast = daysFromNow(-1);
        modal = await openEditorial(page, tag, seeded.submissionId);
        const acceptedEdit = await openEditReview(
            page,
            reviewerRow(modal, `Slow${tag} Reviewer`)
        );
        await pickDate(page, acceptedEdit, 'responseDueDate', daysFromNow(-2));
        await pickDate(page, acceptedEdit, 'reviewDueDate', reviewDuePast);
        await saveEditWindow(acceptedEdit);

        // The row reads "Overdue" in red with "Response due: {date}" and
        // its button is "Send Reminder"; control: the on-schedule row reads
        // "Request Sent" and offers no such button.
        modal = await openEditorial(page, tag, seeded.submissionId);
        const overdueRow = reviewerRow(modal, `Late${tag} Reviewer`);
        await expect(statusTitle(overdueRow, 'Overdue')).toHaveClass(/text-negative/);
        await expect(overdueRow).toContainText('Response due:');
        const reminderButton = overdueRow.getByRole('button', {
            name: 'Send Reminder',
        });
        await expect(reminderButton).toBeVisible();
        const onTimeRow = reviewerRow(modal, `Ontime${tag} Reviewer`);
        await expect(onTimeRow).toContainText('Request Sent');
        await expect(
            onTimeRow.getByRole('button', {name: 'Send Reminder'})
        ).toHaveCount(0);

        // "Review Reminder": the reviewer's name and address, the chooser
        // preset to the reminder template, the message, and the schedule
        // (reviewer not yet responded: Editor's Request + both due dates).
        await reminderButton.click();
        const reminderModal = page.locator('[data-cy="active-modal"]').last();
        await expect(reminderModal.getByText('Review Schedule')).toBeVisible({
            timeout: 20_000,
        });
        await expect(reminderModal.locator('input[name="reviewerName"]')).toHaveValue(
            `Late${tag} Reviewer <${overdueEmail}>`
        );
        const chooser = templateChooser(reminderModal);
        await expect(chooser).toBeVisible();
        await expect(chooser.locator('option:checked')).toHaveText(/Remind/i);
        await expect(reminderModal.getByText("Editor's Request")).toBeVisible();
        await expect(
            reminderModal.getByText('Response Due Date').first()
        ).toBeVisible();
        await expect(
            reminderModal.getByText('Review Due Date').first()
        ).toBeVisible();
        await awaitTinyMce(page, 'message');
        await reminderModal
            .getByRole('button', {name: 'Send Reminder', exact: true})
            .click();
        // Throwaway manager: the toast queue is this test's alone.
        await expect(page.getByText('Notification sent.')).toBeVisible({
            timeout: 20_000,
        });

        // The reviewer's mailbox holds the reminder…
        await pkpMail.find({
            to: overdueEmail,
            subject: 'A reminder to please complete your review',
        });

        // …and History lists the Reviewer Reminded milestone (read BEFORE
        // any response — its survival past one is open finding A15).
        const historyModal = await openHistory(page, overdueRow);
        await expect(historyModal.getByText('Reviewer Reminded:').first()).toBeVisible();
        await closeLegacyWindow(page, historyModal);

        // The overdue review: the accepted reviewer's row reads "Overdue"
        // in red with "Review due: {date}" (no "Response due:" line — the
        // unanswered row above is that line's control) and offers "Send
        // Reminder"; its window's "Review Schedule" reads "Editor's
        // Request", "Review Acceptance Date" and "Review Due Date" (no
        // "Response Due Date"); sending shows "Notification sent." (the
        // first notice has expired by now, so the read is this send's)
        // and the reminder reaches the accepted reviewer's mailbox.
        const acceptedRow = reviewerRow(modal, `Slow${tag} Reviewer`);
        await expect(statusTitle(acceptedRow, 'Overdue')).toHaveClass(/text-negative/);
        await expect(acceptedRow).toContainText(`Review due: ${isoDate(reviewDuePast)}`);
        await expect(acceptedRow).not.toContainText('Response due:');
        await expect(page.getByText('Notification sent.')).toBeHidden({timeout: 20_000});
        const acceptedReminder = await openReminder(page, acceptedRow);
        await expect(acceptedReminder.locator('input[name="reviewerName"]')).toHaveValue(
            `Slow${tag} Reviewer <${acceptedEmail}>`
        );
        await expect(acceptedReminder.getByText("Editor's Request")).toBeVisible();
        await expect(acceptedReminder.getByText('Review Acceptance Date')).toBeVisible();
        await expect(acceptedReminder.getByText('Review Due Date').first()).toBeVisible();
        await expect(acceptedReminder.getByText('Response Due Date')).toHaveCount(0);
        await acceptedReminder
            .getByRole('button', {name: 'Send Reminder', exact: true})
            .click();
        await expect(page.getByText('Notification sent.')).toBeVisible({
            timeout: 20_000,
        });
        await pkpMail.find({
            to: acceptedEmail,
            subject: 'A reminder to please complete your review',
        });

        // "Email Reviewer" on the on-schedule row: "To" shows the reviewer's
        // name; the message reaches their mailbox.
        const emailMenu = await openRowMenu(page, onTimeRow);
        await menuEntry(emailMenu, 'Email Reviewer').click();
        const emailModal = page.locator('[data-cy="active-modal"]').last();
        await expect(emailModal.locator('input[name="user"]')).toHaveValue(
            `Ontime${tag} Reviewer`,
            {timeout: 20_000}
        );
        await closeLegacyWindow(page, emailModal);
        await emailReviewer(page, onTimeRow, {
            subject: 'A question about your review',
            body: 'Will you meet the review date?',
        });
        const question = await pkpMail.find({
            to: onTimeEmail,
            subject: 'A question about your review',
        });
        expect(question.Snippet || '').toContain('Will you meet the review date?');
    });

    test('S8: log a response on the reviewer\'s behalf', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s8');
        const seeded = await seedExternal(ompApi, tag, [
            {username: 'reviewer.julia', status: 'invited'},
        ]);

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        const row = reviewerRow(modal, 'Julia Reviewer');

        const menu = await openRowMenu(page, row);
        await menuEntry(menu, 'Log Response').click();
        const logModal = page.locator('[data-cy="active-modal"]').last();
        await expect(
            logModal.getByText('Log Response for').first()
        ).toBeVisible({timeout: 20_000});
        await logModal
            .getByText('Reviewer has accepted the invitation to review')
            .click();
        await logModal
            .getByRole('button', {name: 'Log Response', exact: true})
            .click();

        // The row reads Request Accepted with the review deadline.
        await expect(row).toContainText('Request Accepted', {timeout: 20_000});
        await expect(row).toContainText('Review due');

        // Control: the entry is gone from the menu afterwards (bounded by
        // the reopened menu's other entries).
        const menu2 = await openRowMenu(page, row);
        await expect(menuEntry(menu2, 'Email Reviewer')).toBeVisible();
        await expect(menuEntry(menu2, 'Log Response')).toHaveCount(0);
        await closeRowMenu(page, row, menu2);
    });

    test('S9: read, rate, mark complete, thank', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s9');
        const shared = `Shared remarks ${tag} for author and editor.`;
        const priv = `Editoronly remarks ${tag}.`;
        // Scratch press: the thank notices are server-fed toasts, the
        // thank-you silence needs a unique mailbox, and the press carries
        // one active review form (the "Review Form" select's positive
        // control).
        const reviewer = `rva${tag}`;
        const second = `rvb${tag}`;
        const reviewerEmail = `${tag}rev@mail.test`;
        const {manager, seeded} = await seedScratchPress(
            ompApi,
            tag,
            [
                {username: reviewer, roles: ['externalReviewer'], givenName: `Done${tag}`, familyName: 'Reviewer', email: reviewerEmail},
                {username: second, roles: ['externalReviewer'], givenName: `Wait${tag}`, familyName: 'Reviewer'},
            ],
            [
                {username: reviewer, status: 'accepted'},
                {username: second, status: 'invited'},
            ],
            {
                context: {
                    reviewForms: [
                        {
                            title: `Form ${tag}`,
                            elements: [{question: `Question ${tag}`, type: 'textarea'}],
                        },
                    ],
                },
            }
        );
        const reviewerName = `Done${tag} Reviewer`;

        // The reviewer's Tasks panel holds "Review pending." (the positive
        // control for its later clearing; read before the review is
        // submitted, since the panel reads "No Items" right after the
        // reviewer's own submit — finding T-omp-4); then the reviewer
        // submits both comment blocks on their own screen.
        const revPage = await (await asUser(reviewer)).newPage();
        await revPage.goto(`/index.php/${tag}/en/dashboard/reviewAssignments`);
        let tasks = await openTasksPanel(revPage);
        await expect(tasks.getByText('Review pending.').first()).toBeVisible();
        await closeTopModal(revPage);
        await completeReview(revPage, tag, seeded.submissionId, {
            comment: shared,
            privateComment: priv,
        });

        const page = await (await asUser(manager)).newPage();
        let modal = await openEditorial(page, tag, seeded.submissionId);
        let row = reviewerRow(modal, reviewerName);
        await expect(row).toContainText('Review Submitted');

        // "Read Review": the "Review Details" window opens with "Review
        // Submitted: {date and time}" and the comments split into the two
        // audiences ({OMP}: "For editor only"). The workflow modal's DOM is
        // unmounted while this window is open, so every row claim waits
        // for the window to close first.
        let readModal = await openReadReview(page, modal, reviewerName);
        await expect(readModal.getByText(/Review Submitted:/)).toBeVisible();
        await expect(
            readModal.getByText('For author and editor').first()
        ).toBeVisible();
        await expect(readModal.getByText(shared)).toBeVisible();
        await expect(
            readModal.getByText('For editor only').first()
        ).toBeVisible();
        await expect(readModal.getByText(priv)).toBeVisible();

        // A star click saves inline with its toast; rateReview re-checks
        // the stars, since the window's "viewed" answer arriving after the
        // save puts them back to "No rating" on screen (A21).
        await rateReview(page, readModal, 5);

        // Merely opening the window marked the review viewed (Rule 14a):
        // closed without confirming anything, the row reads "Review
        // Viewed", and it stays so after a reload.
        await readModal
            .getByRole('button', {name: 'Cancel', exact: true})
            .click();
        await expect(readModal).toBeHidden({timeout: 20_000});
        await expect(row).toContainText('Review Viewed', {timeout: 20_000});
        modal = await openEditorial(page, tag, seeded.submissionId);
        row = reviewerRow(modal, reviewerName);
        await expect(row).toContainText('Review Viewed');

        // Reopen: the star is still selected.
        readModal = await openReadReview(page, modal, reviewerName);
        await expect(
            readModal.getByRole('radio', {name: '5 out of 5 stars'})
        ).toBeChecked();
        await readModal
            .getByRole('button', {name: 'Cancel', exact: true})
            .click();
        await expect(readModal).toBeHidden({timeout: 20_000});

        // "Edit" after submission offers no "Review Form" select; control:
        // the unanswered second row's "Edit" still offers it, and that row
        // has no "Actions" button.
        let editModal = await openEditReview(page, row);
        await expect(editModal.getByText('Review Type')).toBeVisible();
        await expect(reviewFormSelect(editModal)).toHaveCount(0);
        await closeLegacyWindow(page, editModal);
        const secondRow = reviewerRow(modal, `Wait${tag} Reviewer`);
        await expect(secondRow.getByRole('button', {name: 'More Actions'})).toBeVisible();
        await expect(
            secondRow.getByRole('button', {name: /Send Reminder|Read Review|Thank Reviewer|Revert Decision/})
        ).toHaveCount(0);
        // The "Actions" cell (fourth column; the name is the row header, so
        // it is the third cell) holds no button at all; the "Type" cell
        // before it holds the review-type button.
        await expect(secondRow.getByRole('cell').nth(1).getByRole('button')).toHaveCount(1);
        await expect(secondRow.getByRole('cell').nth(2).getByRole('button')).toHaveCount(0);
        editModal = await openEditReview(page, secondRow);
        await expect(reviewFormSelect(editModal)).toBeVisible();
        await expect(reviewFormSelect(editModal).locator('option', {hasText: `Form ${tag}`})).toHaveCount(1);
        await closeLegacyWindow(page, editModal);

        // "Mark as Complete" asks "Mark this review as complete?"; confirming
        // shows the toast; in the still-open window the button is disabled
        // and "Modify Review" stays available; the row turns "Complete" and
        // offers "Thank Reviewer" and "Revert Decision".
        readModal = await openReadReview(page, modal, reviewerName);
        await markReviewComplete(page, readModal);
        await expect(
            readModal.getByRole('button', {name: 'Mark as Complete', exact: true})
        ).toBeDisabled();
        await expect(
            readModal.getByRole('button', {name: 'Modify Review', exact: true})
        ).toBeEnabled();
        await readModal
            .getByRole('button', {name: 'Cancel', exact: true})
            .click();
        await expect(readModal).toBeHidden({timeout: 20_000});
        await expect(row).toContainText('Complete', {timeout: 20_000});
        await expect(row.getByRole('button', {name: 'Thank Reviewer'})).toBeVisible();
        await expect(row.getByRole('button', {name: 'Revert Decision'})).toBeVisible();

        // Review Details on "Complete": the row's "More Actions" › "Review
        // Details" reads "Review Completed: {date and time}" on its dated
        // line (no "Review Submitted:" line any more); "Cancel"; the
        // activity log records the completion.
        readModal = await openRowReviewDetails(page, row);
        await datedLine(readModal, 'Review Completed');
        await expect(readModal.getByText('Review Submitted:')).toHaveCount(0);
        await cancelReviewDetails(readModal);
        let log = await openActivityLog(page);
        await expect(activityLogRow(log, 'has confirmed a review')).toBeVisible();
        await log.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(log).toBeHidden({timeout: 20_000});

        // The reviewer's side: "Review pending." is gone from the Tasks
        // panel (the table bounds the read).
        await revPage.goto(`/index.php/${tag}/en/dashboard/reviewAssignments`);
        tasks = await openTasksPanel(revPage);
        await expect(tasks.getByText('Review pending.')).toHaveCount(0);
        await closeTopModal(revPage);
        modal = await openEditorial(page, tag, seeded.submissionId);
        row = reviewerRow(modal, reviewerName);

        // "Thank Reviewer": the notice, the "Reviewer Thanked" row, the
        // thank-you in the mailbox, and History's five dated milestones.
        let thankModal = await openThankReviewer(page, row);
        await thankModal
            .getByRole('button', {name: 'Thank Reviewer', exact: true})
            .click();
        await expect(page.getByText('Thank you email sent to reviewer.')).toBeVisible({
            timeout: 20_000,
        });
        await expect(row).toContainText('Reviewer Thanked', {timeout: 20_000});
        await pkpMail.find({
            to: reviewerEmail,
            subject: 'Thank you for your review',
        });
        let historyModal = await openHistory(page, row);
        let milestones = await historyMilestones(historyModal);
        expect(milestones.map((m) => m.name)).toEqual(
            expect.arrayContaining(['Request Sent', 'Request Accepted', 'Review Submitted', 'Review Completed', 'Reviewer Thanked'])
        );
        await closeLegacyWindow(page, historyModal);

        // Review Details on "Reviewer Thanked": the dated line reads
        // "Reviewer Thanked: {date and time}"; the date is noted.
        await pastWindowCloseSlot(page);
        readModal = await openRowReviewDetails(page, row);
        const firstThanked = await datedLine(readModal, 'Reviewer Thanked');
        await cancelReviewDetails(readModal);

        // "Revert Decision" asks "Unconsider this Review"; confirming returns
        // the thanked row to "Review Viewed" with no notice (the thank toast
        // has expired first, so a zero read after the row's change means
        // what it says); "Read Review" shows the comments unchanged and the
        // dated line "Review Submitted: {date and time}"; the revert is
        // logged; History ends at "Review Submitted", with no "Review
        // Completed" and no "Reviewer Thanked".
        await expect(page.getByText('Thank you email sent to reviewer.')).toBeHidden({
            timeout: 20_000,
        });
        await expect(toasts(page)).toHaveCount(0);
        await row.getByRole('button', {name: 'Revert Decision'}).click();
        const dialog = page
            .getByRole('dialog')
            .filter({hasText: 'Unconsider this Review'});
        await expect(dialog).toBeVisible({timeout: 10_000});
        await dialog.getByRole('button', {name: 'OK'}).click();
        await expect(row).toContainText('Review Viewed', {timeout: 20_000});
        await expect(toasts(page)).toHaveCount(0);
        readModal = await openReadReview(page, modal, reviewerName);
        await expect(readModal.getByText(shared)).toBeVisible();
        await expect(readModal.getByText(priv)).toBeVisible();
        await datedLine(readModal, 'Review Submitted');
        await expect(readModal.getByText(/Review Completed:|Reviewer Thanked:/)).toHaveCount(0);
        await cancelReviewDetails(readModal);
        log = await openActivityLog(page);
        await expect(activityLogRow(log, 'as unconsidered')).toBeVisible();
        await log.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(log).toBeHidden({timeout: 20_000});
        modal = await openEditorial(page, tag, seeded.submissionId);
        row = reviewerRow(modal, reviewerName);
        historyModal = await openHistory(page, row);
        milestones = await historyMilestones(historyModal);
        expect(milestones.length).toBeGreaterThan(0);
        expect(milestones[milestones.length - 1].name).toBe('Review Submitted');
        expect(milestones.map((m) => m.name)).not.toContain('Review Completed');
        expect(milestones.map((m) => m.name)).not.toContain('Reviewer Thanked');
        await closeLegacyWindow(page, historyModal);

        // Marked complete again: "Read Review", "Mark as Complete" and
        // confirm: the row reads "Reviewer Thanked" at once and offers
        // "Revert Decision" alone, no "Thank Reviewer"; its "Review
        // Details" reads "Reviewer Thanked:" with the date noted before the
        // revert; History lists that "Reviewer Thanked" date again,
        // followed by the new "Review Completed" one.
        await pastWindowCloseSlot(page);
        readModal = await openReadReview(page, modal, reviewerName);
        await markReviewComplete(page, readModal);
        await cancelReviewDetails(readModal);
        await expect(statusTitle(row, 'Reviewer Thanked')).toBeVisible({timeout: 20_000});
        await expect(row.getByRole('button', {name: 'Revert Decision'})).toBeVisible();
        await expect(row.getByRole('button', {name: 'Thank Reviewer'})).toHaveCount(0);
        readModal = await openRowReviewDetails(page, row);
        expect(await datedLine(readModal, 'Reviewer Thanked')).toBe(firstThanked);
        await cancelReviewDetails(readModal);
        historyModal = await openHistory(page, row);
        milestones = await historyMilestones(historyModal);
        const names = milestones.map((m) => m.name);
        const thankedAt = names.indexOf('Reviewer Thanked');
        expect(thankedAt).toBeGreaterThanOrEqual(0);
        expect(milestones[thankedAt].date).toBe(firstThanked);
        expect(names.indexOf('Review Completed')).toBeGreaterThan(thankedAt);
        await closeLegacyWindow(page, historyModal);

        // The second reviewer's review: they accept and submit.
        const secondPage = await (await asUser(second)).newPage();
        await completeReview(secondPage, tag, seeded.submissionId, {
            comment: `Second remarks ${tag}.`,
        });
        modal = await openEditorial(page, tag, seeded.submissionId);
        const secondName = `Wait${tag} Reviewer`;
        const secondRemarks = `Second remarks ${tag}.`;
        const doneRow = reviewerRow(modal, secondName);
        await expect(doneRow).toContainText('Review Submitted');

        // "Revert Decision" on "Complete": "Read Review", "Mark as
        // Complete" and confirm: the row reads "Complete"; "Revert
        // Decision" and confirm "Unconsider this Review": the row returns
        // to "Review Submitted" with no notice (the complete toast has
        // expired first, so a zero read after the row's change means what
        // it says), and "Read Review" shows the comments unchanged.
        readModal = await openReadReview(page, modal, secondName);
        await markReviewComplete(page, readModal);
        await cancelReviewDetails(readModal);
        await expect(doneRow).toContainText('Complete', {timeout: 20_000});
        await expect(doneRow.getByRole('button', {name: 'Revert Decision'})).toBeVisible();
        await expect(page.getByText('The review has been marked as complete.')).toBeHidden({
            timeout: 20_000,
        });
        await expect(toasts(page)).toHaveCount(0);
        await revertDecision(page, doneRow);
        await expect(doneRow).toContainText('Review Submitted', {timeout: 20_000});
        await expect(toasts(page)).toHaveCount(0);
        readModal = await openReadReview(page, modal, secondName);
        await expect(readModal.getByText(secondRemarks)).toBeVisible();
        await cancelReviewDetails(readModal);

        // "Close" in "Thank Reviewer": "Read Review", "Mark as Complete"
        // and confirm: the row reads "Complete" and offers "Thank
        // Reviewer"; in its window "Many thanks." typed at the end of the
        // message and "Do not send email to Reviewer." ticked, the top
        // "Close" asks "The data on this form has changed. Do you wish to
        // continue without saving?"; "Cancel" keeps the window with the
        // changed message.
        readModal = await openReadReview(page, modal, secondName);
        await markReviewComplete(page, readModal);
        await cancelReviewDetails(readModal);
        await expect(statusTitle(doneRow, 'Complete')).toBeVisible({timeout: 20_000});
        await expect(doneRow.getByRole('button', {name: 'Thank Reviewer'})).toBeVisible();
        thankModal = await openThankReviewer(page, doneRow);
        await appendToMessage(page, 'message', 'Many thanks.');
        await skipEmailBox(thankModal).check();
        const asked = await pressTopClose(page, thankModal, 'dismiss');
        expect(asked).toEqual([
            'The data on this form has changed. Do you wish to continue without saving?',
        ]);
        await expect(
            thankModal.getByRole('button', {name: 'Thank Reviewer', exact: true})
        ).toBeVisible();
        await expect(
            page.frameLocator('iframe[id^="message"]').last().locator('body')
        ).toContainText('Many thanks.');
        await expect(skipEmailBox(thankModal)).toBeChecked();

        // Thank without email: with the box ticked, "Thank Reviewer" in the
        // window: the notice "Review marked as acknowledged. Email not
        // sent." and the row "Reviewer Thanked".
        const thanked = page.waitForResponse((r) =>
            r.url().includes('thank-reviewer') && r.request().method() === 'POST'
        );
        await thankModal
            .getByRole('button', {name: 'Thank Reviewer', exact: true})
            .click();
        await thanked;
        await expect(
            page.getByText('Review marked as acknowledged. Email not sent.')
        ).toBeVisible({timeout: 20_000});
        await expect(doneRow).toContainText('Reviewer Thanked', {timeout: 20_000});

        // Control: the second reviewer's mailbox holds no thank-you (the
        // thank request's own answer bounds the read), while the first
        // reviewer's holds one (found above).
        expect(
            await pkpMail.count({to: `${second}@mail.test`, subject: 'Thank you for your review'})
        ).toBe(0);
        expect(
            await pkpMail.count({to: reviewerEmail, subject: 'Thank you for your review'})
        ).toBe(1);
    });

    test('S10: download the review', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s10');
        const shared = `Shared remarks ${tag} for author and editor.`;
        const priv = `Editoronly remarks ${tag}.`;
        const seeded = await seedExternal(ompApi, tag, [
            {username: 'reviewer.julia', status: 'accepted'},
        ]);

        const juliaPage = await (await asUser('reviewer.julia')).newPage();
        await completeReview(juliaPage, PK, seeded.submissionId, {
            comment: shared,
            privateComment: priv,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        const readModal = await openReadReview(page, modal, 'Julia Reviewer');

        const download = async (itemLabel) => {
            await readModal
                .getByRole('button', {name: 'Download Review Form'})
                .click();
            const downloaded = page.waitForEvent('download');
            await page
                .getByRole('menuitem', {name: itemLabel})
                .click();
            return downloaded;
        };

        // Both PDFs download through the browser.
        const authorPdf = await download('Author-Only Sections Displayed (PDF)');
        expect(authorPdf.suggestedFilename()).toMatch(/\.pdf$/i);
        expect(fs.statSync(await authorPdf.path()).size).toBeGreaterThan(0);
        const editorPdf = await download('Editor Form Shows All Review Sections (PDF)');
        expect(editorPdf.suggestedFilename()).toMatch(/\.pdf$/i);
        expect(fs.statSync(await editorPdf.path()).size).toBeGreaterThan(0);

        // The XML variants of the same two exports carry the content split:
        // author-only omits the editor-only remarks and anonymizes the
        // reviewer; the full export carries both blocks and the name.
        const authorXml = await download('Author-Only Sections Displayed (XML)');
        const authorText = fs.readFileSync(await authorXml.path(), 'utf8');
        expect(authorText).toContain(shared);
        expect(authorText).not.toContain(priv);
        expect(authorText).toContain('<anonymous');
        expect(authorText).not.toContain('Julia');
        const editorXml = await download('Editor Form Shows All Review Sections (XML)');
        const editorText = fs.readFileSync(await editorXml.path(), 'utf8');
        expect(editorText).toContain(shared);
        expect(editorText).toContain(priv);
        expect(editorText).toContain('Julia Reviewer');
    });

    test('S11: unassign before, cancel after', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s11');
        const unanswered = `rva${tag}`;
        const accepted = `rvb${tag}`;
        const unansweredEmail = `${tag}una@mail.test`;
        const acceptedEmail = `${tag}can@mail.test`;
        const {manager, seeded} = await seedScratchPress(
            ompApi,
            tag,
            [
                {username: unanswered, roles: ['externalReviewer'], givenName: `Unrow${tag}`, familyName: 'Reviewer', email: unansweredEmail},
                {username: accepted, roles: ['externalReviewer', 'funding'], givenName: `Canrow${tag}`, familyName: 'Reviewer', email: acceptedEmail},
            ],
            [
                {username: unanswered, status: 'invited'},
                {username: accepted, status: 'accepted'},
            ],
            {submission: {participants: [{username: accepted, role: 'funding'}]}}
        );
        const title = `Submission ${tag}`;

        // The unanswered reviewer's Tasks panel holds "Review pending."
        // before the unassign (the positive control for its clearing).
        const revPage = await (await asUser(unanswered)).newPage();
        await revPage.goto(`/index.php/${tag}/en/dashboard/reviewAssignments`);
        let tasks = await openTasksPanel(revPage);
        await expect(tasks.getByText('Review pending.').first()).toBeVisible();
        await closeTopModal(revPage);

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);

        // Before a response the entry reads "Unassign Reviewer"; the window
        // shows the chooser above the notice and the skip box; removing
        // deletes the row outright with "Reviewer removed.".
        const unRow = reviewerRow(modal, `Unrow${tag} Reviewer`);
        const unMenu = await openRowMenu(page, unRow);
        await menuEntry(unMenu, 'Unassign Reviewer').click();
        const unassignModal = page.locator('[data-cy="active-modal"]').last();
        await expect(
            unassignModal.getByText('Choose a predefined message to use')
        ).toBeVisible({timeout: 20_000});
        await expect(templateChooser(unassignModal)).toBeVisible();
        await expect(skipEmailBox(unassignModal)).toBeVisible();
        await awaitTinyMce(page, 'personalMessage');
        await unassignModal
            .getByRole('button', {name: 'Unassign Reviewer', exact: true})
            .click();
        await expect(page.getByText('Reviewer removed.')).toBeVisible({
            timeout: 20_000,
        });
        await expect(
            reviewerPanel(modal).getByText(`Unrow${tag} Reviewer`)
        ).toHaveCount(0);

        // The unassigned reviewer's side: the removal notice (matched by
        // its body — the subject it arrives under is the cancel notice's,
        // finding T-omp-2, never asserted), and no "Review pending." in the
        // Tasks panel any more.
        await pkpMail.find({
            to: unansweredEmail,
            contains: 'removed from the reviewer assignment',
        });
        await revPage.goto(`/index.php/${tag}/en/dashboard/reviewAssignments`);
        tasks = await openTasksPanel(revPage);
        await expect(tasks.getByText('Review pending.')).toHaveCount(0);

        // After a response the same entry reads "Cancel Reviewer", with its
        // own chooser; the row stays as "Request Cancelled" (tooltip: "The
        // editor cancelled this review request."), its menu offers
        // "Reinstate Reviewer" in place of "Review Details", "Edit" and the
        // cancel entry, and the reviewer's mailbox holds the cancel notice.
        const canRow = reviewerRow(modal, `Canrow${tag} Reviewer`);
        const canMenu = await openRowMenu(page, canRow);
        await expect(menuEntry(canMenu, 'Unassign Reviewer')).toHaveCount(0);
        await menuEntry(canMenu, 'Cancel Reviewer').click();
        const cancelModal = page.locator('[data-cy="active-modal"]').last();
        await expect(
            cancelModal.getByText('Choose a predefined message to use')
        ).toBeVisible({timeout: 20_000});
        await expect(templateChooser(cancelModal)).toBeVisible();
        await awaitTinyMce(page, 'personalMessage');
        await cancelModal
            .getByRole('button', {name: 'Cancel Reviewer', exact: true})
            .click();
        await expect(
            page.locator('.app__notifications .pkpNotification').filter({hasText: 'Reviewer cancelled.'})
        ).toBeVisible({timeout: 30_000});
        await expect(canRow).toContainText('Request Cancelled', {
            timeout: 20_000,
        });
        await expect(statusTitle(canRow, 'Request Cancelled')).toHaveAttribute(
            'title',
            'The editor cancelled this review request.'
        );
        let menu = await openRowMenu(page, canRow);
        await expect(menuEntry(menu, 'Reinstate Reviewer')).toBeVisible();
        await expect(menuEntry(menu, 'Email Reviewer')).toBeVisible();
        await expect(menuEntry(menu, 'History')).toBeVisible();
        await expect(menuEntry(menu, 'Review Details')).toHaveCount(0);
        await expect(menuEntry(menu, 'Edit')).toHaveCount(0);
        await expect(menuEntry(menu, 'Cancel Reviewer')).toHaveCount(0);
        await closeRowMenu(page, canRow, menu);
        await pkpMail.find({
            to: acceptedEmail,
            subject: 'has been cancelled',
            contains: title,
        });

        // Participants: the stage's Participants panel still lists the
        // cancelled reviewer as a Funding coordinator.
        const participants = participantPanel(modal);
        await expect(participants.getByText(`Canrow${tag} Reviewer`)).toBeVisible();
        await expect(
            participants.locator('*', {hasText: `Canrow${tag} Reviewer`}).getByText(/Funding coordinator/i).first()
        ).toBeVisible();

        // Reinstate: the notice, the row back in its dated state, the
        // reinstate notice in the mailbox.
        menu = await openRowMenu(page, canRow);
        await menuEntry(menu, 'Reinstate Reviewer').click();
        const reinstateModal = page.locator('[data-cy="active-modal"]').last();
        await awaitTinyMce(page, 'personalMessage');
        await reinstateModal
            .getByRole('button', {name: 'Reinstate Reviewer', exact: true})
            .click();
        await expect(page.getByText('Reviewer reinstated.')).toBeVisible({
            timeout: 20_000,
        });
        await expect(canRow).toContainText('Request Accepted', {
            timeout: 20_000,
        });
        await pkpMail.find({
            to: acceptedEmail,
            subject: 'Can you still review something for',
        });

        // Control: the reinstated row's menu again offers "Review Details",
        // "Edit" and "Cancel Reviewer", with no "Reinstate Reviewer".
        menu = await openRowMenu(page, canRow);
        await expect(menuEntry(menu, 'Review Details')).toBeVisible();
        await expect(menuEntry(menu, 'Edit')).toBeVisible();
        await expect(menuEntry(menu, 'Cancel Reviewer')).toBeVisible();
        await expect(menuEntry(menu, 'Reinstate Reviewer')).toHaveCount(0);
        await closeRowMenu(page, canRow, menu);
    });

    test('S12: decline, then ask again', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s12');
        const declined = `rvd${tag}`;
        const declinedEmail = `${tag}dec@mail.test`;
        const {manager, seeded} = await seedScratchPress(
            ompApi,
            tag,
            [{username: declined, roles: ['externalReviewer'], givenName: `Declined${tag}`, familyName: 'Reviewer', email: declinedEmail}],
            [{username: declined, status: 'declined'}]
        );

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);
        const row = reviewerRow(modal, `Declined${tag} Reviewer`);

        // The declined row: its status, tooltip, and a menu offering "Resend
        // Review Request" and no "Log Response".
        await expect(row).toContainText('Request Declined');
        await expect(statusTitle(row, 'Request Declined')).toHaveAttribute(
            'title',
            'The reviewer declined this review request.'
        );
        const menu = await openRowMenu(page, row);
        await expect(menuEntry(menu, 'Resend Review Request')).toBeVisible();
        await expect(menuEntry(menu, 'Log Response')).toHaveCount(0);
        await menuEntry(menu, 'Resend Review Request').click();

        // The Resend window: the message, the skip box, and fresh pickers
        // each preset from its own configured interval as at add time (4/4
        // weeks on every seeded context — A9 retired).
        const resendModal = page.locator('[data-cy="active-modal"]').last();
        await awaitTinyMce(page, 'personalMessage');
        await expect(skipEmailBox(resendModal)).toBeVisible();
        await expect(
            resendModal.locator('input[name="responseDueDate-removed"]')
        ).toBeVisible();
        await expect(
            resendModal.locator('input[name="reviewDueDate-removed"]')
        ).toBeVisible();
        await expect(dateAltField(resendModal, 'responseDueDate')).toHaveValue(
            isoDate(daysFromNow(28))
        );
        await expect(dateAltField(resendModal, 'reviewDueDate')).toHaveValue(
            isoDate(daysFromNow(28))
        );
        const presetReviewDue = daysFromNow(28);

        // Inverted dates: "Review Due Date" before "Response Due Date" and
        // "Resend Review Request": the notice at the top right refuses them
        // (A45's wording left open) and the window stays open. The browser
        // alert the refusal also raises is register finding A46: answered,
        // never asserted.
        await pickDate(page, resendModal, 'reviewDueDate', daysFromNow(7));
        const dismissAlert = (dialog) => dialog.dismiss().catch(() => {});
        page.on('dialog', dismissAlert);
        const refused = page.waitForResponse((r) =>
            r.url().includes('update-resend-request-reviewer')
        );
        await resendModal
            .getByRole('button', {name: 'Resend Review Request', exact: true})
            .click();
        await refused;
        const notice = page
            .locator('.app__notifications .pkpNotification')
            .filter({hasText: DATE_REFUSAL});
        await expect(notice).toBeVisible({timeout: 20_000});
        await expect(notice).toHaveText(noticeReading(ANY_REFUSAL));
        await waitForJQueryIdle(page);
        page.off('dialog', dismissAlert);
        await expect(
            resendModal.getByRole('button', {name: 'Resend Review Request', exact: true})
        ).toBeVisible();

        // The resend: "Review Due Date" back to its preset date.
        await pickDate(page, resendModal, 'reviewDueDate', presetReviewDue);
        await resendModal
            .getByRole('button', {name: 'Resend Review Request', exact: true})
            .click();
        await expect(
            page.getByText('Request to reconsider the review assignment was sent.')
        ).toBeVisible({timeout: 20_000});

        // The row reads Request Resent (its second line is register finding
        // A2, unasserted) and counts as unanswered again.
        await expect(row).toContainText('Request Resent', {timeout: 20_000});
        const menu2 = await openRowMenu(page, row);
        await expect(menuEntry(menu2, 'Unassign Reviewer')).toBeVisible();
        await expect(menuEntry(menu2, 'Log Response')).toBeVisible();
        await closeRowMenu(page, row, menu2);

        // The reviewer's mailbox holds the reconsider request.
        await pkpMail.find({
            to: declinedEmail,
            subject: 'Requesting your review again',
        });
    });

    test('S13: two review stages, two reviewer pools', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s13');
        const seeded = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            series: 'monographs',
            decisions: ['sendInternalReview'],
            reviewRounds: [{stage: 'internal'}],
        });

        const page = await (await asUser('manager.maya')).newPage();
        let modal = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal.getByRole('heading', {name: 'Workflow: Internal Review (Round 1)'})
        ).toBeVisible();

        // Internal stage: an Internal Reviewer is found by name, an External
        // one is not. Assert through the SEARCH — the window's opening,
        // unsearched list does not apply the split (register finding OMP2,
        // unasserted); each search is bounded by the list's own response.
        let addModal = await openAddReviewer(page, modal);
        await searchReviewerList(page, addModal, 'Amara');
        await expect(
            selectButton(reviewerListEntry(addModal, 'Amara Reviewer'))
        ).toBeVisible();
        await searchReviewerList(page, addModal, 'Julia');
        await expect(addModal.getByText('No items found.')).toBeVisible();
        await expect(addModal.getByText('Julia Reviewer')).toHaveCount(0);

        // Internal stage's "Enroll Existing User": the External Reviewer's
        // name finds nothing; control: the Author's name is found (each
        // read bounded by the autocomplete's own response).
        await addModal.getByText('Enroll Existing User', {exact: true}).click();
        await expect(enrollSearchBox(addModal)).toBeVisible({timeout: 20_000});
        let suggestions = await enrollAutocomplete(page, addModal, 'Julia');
        await expect(suggestions).toContainText('No Matches');
        await expect(suggestions.getByText('Julia Reviewer')).toHaveCount(0);
        suggestions = await enrollAutocomplete(page, addModal, 'Alex');
        await expect(suggestions.getByText('Alex Author').first()).toBeVisible();

        // Send the monograph on to External Review (a fresh landing leaves
        // the open window behind).
        await page.goto(`/index.php/${PK}/en/dashboard/editorial`);
        modal = await openEditorial(page, PK, seeded.submissionId);
        await decisionButton(modal, 'Send to External Review').click();
        await expect(
            page.getByRole('heading', {level: 1, name: /Send to External Review/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(page);

        // External stage: the pools swap.
        modal = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        addModal = await openAddReviewer(page, modal);
        await searchReviewerList(page, addModal, 'Julia');
        await expect(
            selectButton(reviewerListEntry(addModal, 'Julia Reviewer'))
        ).toBeVisible();
        await searchReviewerList(page, addModal, 'Amara');
        await expect(addModal.getByText('No items found.')).toBeVisible();
        await expect(addModal.getByText('Amara Reviewer')).toHaveCount(0);

        // External stage's "Enroll Existing User": the Internal Reviewer's
        // name finds nothing; the Author's name is still found.
        await addModal.getByText('Enroll Existing User', {exact: true}).click();
        await expect(enrollSearchBox(addModal)).toBeVisible({timeout: 20_000});
        suggestions = await enrollAutocomplete(page, addModal, 'Amara');
        await expect(suggestions).toContainText('No Matches');
        await expect(suggestions.getByText('Amara Reviewer')).toHaveCount(0);
        suggestions = await enrollAutocomplete(page, addModal, 'Alex');
        await expect(suggestions.getByText('Alex Author').first()).toBeVisible();
    });

    test('S14: absence — no recommendation surfaces on a press (scenario 14 {OMP} control)', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s14');
        const shared = `Shared remarks ${tag} for author and editor.`;
        const seeded = await seedExternal(ompApi, tag, [
            {username: 'reviewer.julia', status: 'accepted'},
        ]);

        const juliaPage = await (await asUser('reviewer.julia')).newPage();
        await completeReview(juliaPage, PK, seeded.submissionId, {
            comment: shared,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        const row = reviewerRow(modal, 'Julia Reviewer');
        await expect(row).toContainText('Review Submitted');

        // The "Review Details" window renders its comments and its rating
        // group (positive controls on the same surface the absences are
        // scoped to; openReadReview's load-settle bounds the reads)…
        const readModal = await openReadReview(page, modal, 'Julia Reviewer');
        await expect(readModal.getByText(shared)).toBeVisible();
        await expect(
            readModal
                .getByText('Rate the quality of the review provided.')
                .first()
        ).toBeVisible();
        await expect(
            readModal.getByRole('radio', {name: 'No rating'})
        ).toBeVisible();

        // …but no recommendation group, info line or select anywhere, and
        // no completeness gate: "Mark as Complete" is enabled at once with
        // no gate message beside it (OMP1 ✅ — the {OJS} gate does not
        // exist on a press).
        await expect(readModal.getByText(/recommendation/i)).toHaveCount(0);
        await expect(readModal.getByRole('combobox')).toHaveCount(0);
        await expect(
            readModal.getByText(
                'A recommendation is required before this review can be marked as complete.'
            )
        ).toHaveCount(0);
        await expect(
            readModal.getByRole('button', {name: 'Mark as Complete', exact: true})
        ).toBeEnabled();

        // The stacked "Modify Review" window: its comment editor and "Save
        // Changes" render (positive controls), no recommendation select —
        // or any select — anywhere ({OMP} marker of scenario 16 / OMP1 ✅).
        const {editModal} = await openModifyReview(page, readModal, shared);
        await expect(
            editModal.getByRole('button', {name: 'Save Changes', exact: true})
        ).toBeVisible();
        await expect(editModal.getByText(/recommendation/i)).toHaveCount(0);
        await expect(editModal.getByRole('combobox')).toHaveCount(0);
        await editModal
            .getByRole('button', {name: 'Cancel', exact: true})
            .click();
        await expect(editModal).toBeHidden({timeout: 20_000});

        // Marked complete, the Complete row's status cell carries no
        // recommendation line either (its status text and action button are
        // the positive control; the row is only in the DOM again once the
        // window is closed).
        await markReviewComplete(page, readModal);
        await readModal
            .getByRole('button', {name: 'Cancel', exact: true})
            .click();
        await expect(readModal).toBeHidden({timeout: 20_000});
        await expect(row).toContainText('Complete', {timeout: 20_000});
        await expect(
            row.getByRole('button', {name: 'Thank Reviewer'})
        ).toBeVisible();
        await expect(row.getByText(/recommendation/i)).toHaveCount(0);
    });

    test('S16: the editor modifies a submitted review', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s16');
        const shared = `Shared remarks ${tag} for author and editor.`;
        const priv = `Editoronly remarks ${tag}.`;
        const edited = `Modified remarks ${tag} by the editor.`;
        const seeded = await seedExternal(ompApi, tag, [
            {username: 'reviewer.julia', status: 'accepted'},
        ]);

        const juliaPage = await (await asUser('reviewer.julia')).newPage();
        await completeReview(juliaPage, PK, seeded.submissionId, {
            comment: shared,
            privateComment: priv,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        const readModal = await openReadReview(page, modal, 'Julia Reviewer');

        // Control, view-window half: the settled view window renders both
        // comments (positive control) with no rich-text editor at all —
        // read before the edit window stacks over it (the view window's
        // DOM is unmounted underneath the stacked window).
        await expect(readModal.getByText(shared)).toBeVisible();
        await expect(readModal.getByText(priv)).toBeVisible();
        await expect(
            readModal.locator('iframe.tox-edit-area__iframe')
        ).toHaveCount(0);

        // "Modify Review" asks "Modify this review?" and stacks the "Modify
        // Review" window over the view window, its one editor prefilled
        // with the shared comment (openModifyReview's own load-settle).
        const first = await openModifyReview(page, readModal, shared);

        // "Cancel": the "Modify Review" window closes and the view window
        // shows again (its comments and its enabled "Modify Review" button
        // are the read); then "Modify Review" is pressed and confirmed
        // again.
        await first.editModal
            .getByRole('button', {name: 'Cancel', exact: true})
            .click();
        await expect(first.editModal).toBeHidden({timeout: 20_000});
        await expect(readModal).toBeVisible();
        await expect(readModal.getByText(shared)).toBeVisible();
        await expect(
            readModal.getByRole('button', {name: 'Modify Review', exact: true})
        ).toBeEnabled();
        const {editModal, commentBody} = await openModifyReview(
            page,
            readModal,
            shared
        );

        // Control, edit-window half: the "For editor only" comment renders
        // display-only beside the single rich-text editor (the shared
        // comment's — the positive control).
        await expect(editModal.getByText(priv)).toBeVisible();
        await expect(
            editModal.locator('iframe.tox-edit-area__iframe')
        ).toHaveCount(1);
        // {OMP}: no recommendation field on a press (OMP1 ✅ — S14 owns the
        // full absence sweep).
        await expect(editModal.getByRole('combobox')).toHaveCount(0);

        // Edit the shared comment and save — no further confirmation.
        await commentBody.click();
        await commentBody.fill(edited);
        await expect(commentBody).toContainText(edited);
        // Blur so TinyMCE syncs the field before submit (the group label
        // renders as a plain element, not a heading).
        await editModal
            .getByText('Reviewer Comments', {exact: true})
            .first()
            .click();
        await editModal
            .getByRole('button', {name: 'Save Changes', exact: true})
            .click();
        await expect(editModal).toBeHidden({timeout: 20_000});

        // The view window refreshes: "Last modified by {name}" under its
        // title, with the edited text.
        await expect(
            readModal.getByText('Last modified by Maya Manager')
        ).toBeVisible({timeout: 20_000});
        await expect(readModal.getByText(edited)).toBeVisible();
        await expect(readModal.getByText(shared)).toHaveCount(0);
        await readModal
            .getByRole('button', {name: 'Cancel', exact: true})
            .click();
        await expect(readModal).toBeHidden({timeout: 20_000});

        // The activity log lists the modification attributed to the editor,
        // with its "View changes" action.
        const log = await openActivityLog(page);
        const logRow = activityLogRow(
            log,
            'The following was modified in this review: Comments.'
        );
        await expect(logRow).toBeVisible({timeout: 30_000});
        await expect(logRow).toContainText('Maya Manager');
        // The action sits in the row's hidden controls row (legacy grid);
        // the row's expander reveals the "View changes" link — the only
        // such link in this one-modification log.
        await logRow.locator('a.show_extras').click();
        await expect(
            log.getByRole('link', {name: 'View changes'}).first()
        ).toBeVisible();
    });

    test('S17: the Author sees no Reviewers panel', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s17');
        const seeded = await seedExternal(ompApi, tag, [
            {username: 'reviewer.julia', status: 'invited'},
        ]);

        // The Author's review stage (My Submissions): no "Reviewers" panel,
        // no table, no "Add Reviewer", no reviewer identity anywhere; the
        // stage heading is the positive control on the same screen.
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorModal = await openAuthorView(authorPage, PK, seeded.submissionId);
        await expect(
            authorModal.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await expect(reviewerPanel(authorModal)).toHaveCount(0);
        await expect(
            authorModal.getByRole('heading', {name: 'Reviewers', exact: true})
        ).toHaveCount(0);
        // No reviewers table: the screen's other tables ("Revisions
        // Uploaded", "Review Tasks & Discussions") are the positive control
        // for the read.
        await expect(authorModal.getByRole('table')).not.toHaveCount(0);
        await expect(authorModal.getByRole('table', {name: 'Reviewers'})).toHaveCount(0);
        await expect(
            authorModal.getByRole('columnheader', {name: 'Reviewer status', exact: true})
        ).toHaveCount(0);
        await expect(
            authorModal.getByRole('button', {name: 'Add Reviewer', exact: true})
        ).toHaveCount(0);
        await expect(authorPage.getByText('Julia Reviewer')).toHaveCount(0);
        await expect(authorPage.getByText('reviewer.julia')).toHaveCount(0);

        // Control: the Press Manager's view of the same submission lists
        // the reviewer's row in the "Reviewers" panel.
        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            reviewerPanel(modal).getByRole('heading', {name: 'Reviewers', exact: true})
        ).toBeVisible();
        await expect(reviewerRow(modal, 'Julia Reviewer')).toContainText('Request Sent');
    });

    test('S18: an assistant-level participant\'s panel', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s18');
        // The Funding coordinator is the one default assistant group with
        // review-stage access (users.md); the seed assigns her to the stage.
        const seeded = await seedExternal(
            ompApi,
            tag,
            [{username: 'reviewer.julia', status: 'invited'}],
            {participants: [{username: 'assistant.rita', role: 'funding'}]}
        );

        const page = await (await asUser('assistant.rita')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);

        // The panel lists the row with its five columns.
        const row = reviewerRow(modal, 'Julia Reviewer');
        await expect(row).toContainText('Request Sent');
        for (const header of ['Reviewer', 'Reviewer status', 'Type', 'Actions', 'More Actions']) {
            await expect(columnHeader(modal, header)).toHaveCount(1);
        }

        // "Add Reviewer": the window opens on "Locate a Reviewer" with no
        // "Create New Reviewer" and no "Enroll Existing User" link.
        const addModal = await openAddReviewer(page, modal);
        await expect(addModal.getByText('Create New Reviewer', {exact: true})).toHaveCount(0);
        await expect(addModal.getByText('Enroll Existing User', {exact: true})).toHaveCount(0);
        await closeTopModal(page);
        await expect(addModal.getByRole('searchbox')).toHaveCount(0);

        // The row menu holds no "Editorial Notes" (its other entries are the
        // positive control).
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        const row2 = reviewerRow(modal2, 'Julia Reviewer');
        const menu = await openRowMenu(page, row2);
        await expect(menuEntry(menu, 'Email Reviewer')).toBeVisible();
        await expect(menuEntry(menu, 'History')).toBeVisible();
        await expect(menuEntry(menu, 'Editorial Notes')).toHaveCount(0);
        await closeRowMenu(page, row2, menu);

        // Control: the Press Manager's window offers both links and the
        // row's menu offers "Editorial Notes".
        const mgrPage = await (await asUser('manager.maya')).newPage();
        const mgrModal = await openEditorial(mgrPage, PK, seeded.submissionId);
        const mgrAdd = await openAddReviewer(mgrPage, mgrModal);
        await expect(mgrAdd.getByText('Create New Reviewer', {exact: true})).toBeVisible();
        await expect(mgrAdd.getByText('Enroll Existing User', {exact: true})).toBeVisible();
        await closeTopModal(mgrPage);
        await expect(mgrAdd.getByRole('searchbox')).toHaveCount(0);
        const mgrModal2 = await openEditorial(mgrPage, PK, seeded.submissionId);
        const mgrRow = reviewerRow(mgrModal2, 'Julia Reviewer');
        const mgrMenu = await openRowMenu(mgrPage, mgrRow);
        await expect(menuEntry(mgrMenu, 'Editorial Notes')).toBeVisible();
    });

    test('S19: a later round\'s request', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s19');
        const seeded = await seedExternal(ompApi, tag, [
            {username: 'reviewer.julia', status: 'completed'},
        ]);

        // Round 1's review is marked complete and a new round is recorded
        // (the wizard belongs to *Review stage & rounds*).
        const page = await (await asUser('manager.maya')).newPage();
        let modal = await openEditorial(page, PK, seeded.submissionId);
        const readModal = await openReadReview(page, modal, 'Julia Reviewer');
        await markReviewComplete(page, readModal);
        await readModal
            .getByRole('button', {name: 'Cancel', exact: true})
            .click();
        await expect(readModal).toBeHidden({timeout: 20_000});
        await expect(reviewerRow(modal, 'Julia Reviewer')).toContainText('Complete', {
            timeout: 20_000,
        });
        await createNewReviewRound(page, modal);

        // Round 2's panel lists no reviewer, while Round 1 still lists the
        // completed reviewer's row alone.
        modal = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal.getByRole('heading', {name: 'Workflow: External Review (Round 2)'})
        ).toBeVisible();
        await expect(
            reviewerPanel(modal).getByRole('button', {name: 'Add Reviewer', exact: true})
        ).toBeVisible();
        await expect(reviewerPanel(modal).getByRole('button', {name: 'More Actions'})).toHaveCount(0);
        await expect(reviewerPanel(modal).getByText('Julia Reviewer')).toHaveCount(0);
        await selectRound(modal, 1);
        await expect(reviewerPanel(modal).getByRole('button', {name: 'More Actions'})).toHaveCount(1);
        await expect(reviewerRow(modal, 'Julia Reviewer')).toContainText('Complete');
        await selectRound(modal, 2);

        // "Add Reviewer" on Round 2: the Round 1 reviewer sits at the top,
        // flagged, with the button "Reassign"; control: the never-assigned
        // reviewer's entry carries no flag and its button reads "Select
        // Reviewer".
        const addModal = await openAddReviewer(page, modal);
        const topEntry = addModal.locator('.listPanel__item').first();
        await expect(topEntry).toContainText('Julia Reviewer');
        await expect(
            topEntry.getByText('This reviewer completed a review in the last round.')
        ).toBeVisible();
        await expect(reassignButton(topEntry)).toBeVisible();
        await expect(selectButton(topEntry)).toHaveCount(0);
        const paulEntry = reviewerListEntry(addModal, 'Paul Reviewer');
        await expect(
            paulEntry.getByText('This reviewer completed a review in the last round.')
        ).toHaveCount(0);
        await expect(reassignButton(paulEntry)).toHaveCount(0);
        await expect(selectButton(paulEntry)).toBeVisible();
        await expect(selectButton(paulEntry)).toContainText('Select Reviewer');

        // "Reassign": with the request letter prefilled, "Add Reviewer" puts
        // a "Request Sent" row on Round 2, and the reviewer's mailbox holds
        // the subsequent-round request.
        await awaitLetterEditorReady(page);
        await reassignButton(topEntry).click();
        await awaitRequestFormReady(page, addModal);
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        const row = reviewerRow(modal, 'Julia Reviewer');
        await expect(row).toBeVisible({timeout: 20_000});
        await expect(row).toContainText('Request Sent');
        await expect(
            modal.getByRole('heading', {name: 'Workflow: External Review (Round 2)'})
        ).toBeVisible();
        await pkpMail.find({
            to: getEmail('reviewer.julia'),
            subject: 'Request to review a revised submission',
            contains: tag,
        });
    });

    test('S20: the press\'s review setup presets the request', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s20');
        // Scratch press created with its review setup through the context's
        // `review` passthrough (one week to respond, two to complete, "Open"
        // as the default review type, reviewer comments publicly shown);
        // the reviewer is kept out of the round's seed so the screen adds
        // them.
        const reviewer = `rev${tag}`;
        const {manager, seeded} = await seedScratchPress(
            ompApi,
            tag,
            [{username: reviewer, roles: ['externalReviewer'], givenName: `Open${tag}`, familyName: 'Reviewer'}],
            [],
            {
                context: {
                    review: {
                        numWeeksPerResponse: 1,
                        numWeeksPerReview: 2,
                        defaultReviewMode: 'open',
                        defaultReviewPublicVisibility: true,
                    },
                },
            }
        );
        const reviewerName = `Open${tag} Reviewer`;

        const page = await (await asUser(manager)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);

        // The request form: with the reviewer selected, "Response Due Date"
        // is one week from today and "Review Due Date" two (the hidden
        // ISO value the form submits, today computed on the UTC clock the
        // servers run on), "Open" is the selected "Review Type", and
        // "Publicly Show Reviewer Comments" is ticked.
        const addModal = await openAddReviewer(page, modal);
        await searchReviewerList(page, addModal, `Open${tag}`);
        await selectReviewerAndAwaitForm(page, addModal, reviewerName);
        await expect(dateAltField(addModal, 'responseDueDate')).toHaveValue(
            isoDate(daysFromNow(7))
        );
        await expect(dateAltField(addModal, 'reviewDueDate')).toHaveValue(
            isoDate(daysFromNow(14))
        );
        await expect(reviewTypeRadio(addModal, 'Open')).toBeChecked();
        await expect(
            reviewTypeRadio(addModal, 'Anonymous Reviewer/Anonymous Author')
        ).not.toBeChecked();
        await expect(publicVisibilityBox(addModal)).toBeChecked();

        // The add: the row reads "Request Sent", and its "Edit" window
        // shows "Open" selected and the box ticked.
        await addModal
            .getByRole('button', {name: 'Add Reviewer', exact: true})
            .click();
        const row = reviewerRow(modal, reviewerName);
        await expect(row).toBeVisible({timeout: 20_000});
        await expect(row).toContainText('Request Sent');
        const editModal = await openEditReview(page, row);
        await expect(reviewTypeRadio(editModal, 'Open')).toBeChecked();
        await expect(publicVisibilityBox(editModal)).toBeChecked();
        await closeLegacyWindow(page, editModal);

        // Control: on the seeded press (install defaults — seed-facts.md),
        // the Add Reviewer window with a reviewer selected presets both
        // dates four weeks from today, selects "Anonymous Reviewer/
        // Anonymous Author" and leaves the box unticked.
        const control = await seedExternal(ompApi, tag);
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const controlModal = await openEditorial(mayaPage, PK, control.submissionId);
        const controlAdd = await openAddReviewer(mayaPage, controlModal);
        await searchReviewerList(mayaPage, controlAdd, 'Julia');
        await selectReviewerAndAwaitForm(mayaPage, controlAdd, 'Julia Reviewer');
        await expect(dateAltField(controlAdd, 'responseDueDate')).toHaveValue(
            isoDate(daysFromNow(28))
        );
        await expect(dateAltField(controlAdd, 'reviewDueDate')).toHaveValue(
            isoDate(daysFromNow(28))
        );
        await expect(
            reviewTypeRadio(controlAdd, 'Anonymous Reviewer/Anonymous Author')
        ).toBeChecked();
        await expect(reviewTypeRadio(controlAdd, 'Open')).not.toBeChecked();
        await expect(publicVisibilityBox(controlAdd)).not.toBeChecked();
    });

    test('S21: a press that asks about competing interests', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u27s21');
        const statement = 'I co-authored a paper with the author.';
        const modifiedRow = 'The following was modified in this review: Reviewer Competing Interests.';
        // Scratch press whose "Competing Interests" policy is set through
        // the context's `review` passthrough (Settings › Workflow › Review ›
        // "Reviewer Guidance", never driven to set it): the first reviewer's
        // `completed` review records "I do not have any competing
        // interests" (scenarios.md `reviewRounds[]`); the second and third
        // requests are unanswered.
        const answered = `rva${tag}`;
        const unanswered = `rvb${tag}`;
        const third = `rvc${tag}`;
        const {manager, seeded} = await seedScratchPress(
            ompApi,
            tag,
            [
                {username: answered, roles: ['externalReviewer'], givenName: `Ans${tag}`, familyName: 'Reviewer'},
                {username: unanswered, roles: ['externalReviewer'], givenName: `Una${tag}`, familyName: 'Reviewer'},
                {username: third, roles: ['externalReviewer'], givenName: `Thr${tag}`, familyName: 'Reviewer'},
            ],
            [
                {username: answered, status: 'completed'},
                {username: unanswered, status: 'invited'},
                {username: third, status: 'invited'},
            ],
            {context: {review: {competingInterests: {en: `Disclose any relationship with the authors ${tag}.`}}}}
        );
        const answeredName = `Ans${tag} Reviewer`;
        const unansweredName = `Una${tag} Reviewer`;
        const thirdName = `Thr${tag} Reviewer`;
        const managerName = `Mgr${tag} Manager`;

        const page = await (await asUser(manager)).newPage();
        let modal = await openEditorial(page, tag, seeded.submissionId);

        // The submitted review: "Review Submitted" with no "Competing
        // Interests" badge (the status line is the positive control in the
        // same cell); "Read Review": the "Competing Interests" group follows
        // the summary block ("Review Submitted:" and its date) and comes
        // before "Reviewer Comments", its "Declaration" reading "I do not
        // have any competing interests".
        let row = reviewerRow(modal, answeredName);
        await expect(statusTitle(row, 'Review Submitted')).toBeVisible();
        await expect(competingInterestsBadge(row)).toHaveCount(0);
        let readModal = await openReadReview(page, modal, answeredName);
        let group = competingInterestsGroup(readModal);
        await expect(group.getByRole('heading', {name: 'Declaration'})).toBeVisible();
        await expect(group).toContainText('I do not have any competing interests');
        const order = await reviewDetailsText(readModal);
        expect(order.indexOf('Review Submitted:')).toBeGreaterThanOrEqual(0);
        expect(order.indexOf('Competing Interests')).toBeGreaterThan(order.indexOf('Review Submitted:'));
        expect(order.indexOf('Reviewer Comments')).toBeGreaterThan(order.indexOf('Competing Interests'));

        // "Modify Review", a declared interest: the window's group offers
        // "Declaration" with "I do not have any competing interests" ticked
        // and "I may have competing interests (Specify below)"; choosing the
        // second opens a "Competing Interests" box; the statement saved,
        // the view window's "Declaration" reads "I may have competing
        // interests", then "Competing Interests" and the statement.
        let editModal = await openModifyReviewWindow(page, readModal);
        await expect(declarationRadio(editModal, 'I do not have any competing interests')).toBeChecked();
        const mayHave = declarationRadio(editModal, 'I may have competing interests (Specify below)');
        await expect(mayHave).not.toBeChecked();
        await expect(competingInterestsGroup(editModal).locator('iframe.tox-edit-area__iframe')).toHaveCount(0);
        await mayHave.check();
        await typeCompetingInterests(page, editModal, statement);
        await saveModifyReview(editModal);
        group = competingInterestsGroup(readModal);
        await expect(group).toContainText('I may have competing interests', {timeout: 20_000});
        await expect(group).not.toContainText('I do not have any competing interests');
        const declared = (await group.innerText()).replace(/\s+/g, ' ');
        expect(declared.indexOf(statement)).toBeGreaterThan(declared.lastIndexOf('Competing Interests'));
        expect(declared.indexOf('I may have competing interests')).toBeLessThan(declared.lastIndexOf('Competing Interests'));

        // The row and the activity log: the row carries the badge; the log
        // lists the modification attributed to the Press Manager.
        await cancelReviewDetails(readModal);
        await expect(competingInterestsBadge(row)).toBeVisible({timeout: 20_000});
        let log = await openActivityLog(page);
        await expect(activityLogRow(log, modifiedRow)).toContainText(managerName, {timeout: 30_000});
        await log.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(log).toBeHidden({timeout: 20_000});

        // {OMP} A press's unanswered request: "Save Changes" with nothing
        // entered closes the window and leaves the row "Request Sent" (no
        // review submitted for the reviewer: retired A40/OMP5's guard);
        // the same with a declared statement keeps "Request Sent" and adds
        // the badge.
        modal = await openEditorial(page, tag, seeded.submissionId);
        let thirdRow = reviewerRow(modal, thirdName);
        await expect(thirdRow).toContainText('Request Sent');
        readModal = await openRowReviewDetails(page, thirdRow);
        editModal = await openModifyReviewWindow(page, readModal);
        await saveModifyReview(editModal);
        await cancelReviewDetails(readModal);
        await expect(statusTitle(thirdRow, 'Request Sent')).toBeVisible({timeout: 20_000});
        await expect(competingInterestsBadge(thirdRow)).toHaveCount(0);
        modal = await openEditorial(page, tag, seeded.submissionId);
        thirdRow = reviewerRow(modal, thirdName);
        await expect(statusTitle(thirdRow, 'Request Sent')).toBeVisible();
        readModal = await openRowReviewDetails(page, thirdRow);
        editModal = await openModifyReviewWindow(page, readModal);
        await declarationRadio(editModal, 'I may have competing interests (Specify below)').check();
        await typeCompetingInterests(page, editModal, statement);
        await saveModifyReview(editModal);
        await cancelReviewDetails(readModal);
        await expect(competingInterestsBadge(thirdRow)).toBeVisible({timeout: 20_000});
        await expect(statusTitle(thirdRow, 'Request Sent')).toBeVisible();

        // The unanswered request: the second reviewer's "Review Details"
        // shows the group with "Declaration" reading "-".
        let secondRow = reviewerRow(modal, unansweredName);
        readModal = await openRowReviewDetails(page, secondRow);
        group = competingInterestsGroup(readModal);
        await expect(group.getByRole('heading', {name: 'Declaration'})).toBeVisible();
        await expect(group).toHaveText(/Declaration\s*-\s*$/);
        await cancelReviewDetails(readModal);

        // The policy emptied on Settings › Workflow › Review › "Reviewer
        // Guidance" (the scenario's own step, driven on screen): the first
        // reviewer's row keeps its badge and its "Review Details" the group
        // with the statement.
        await clearCompetingInterestsPolicy(page, tag);
        modal = await openEditorial(page, tag, seeded.submissionId);
        row = reviewerRow(modal, answeredName);
        await expect(competingInterestsBadge(row)).toBeVisible();
        // (The log's "…Reviewer Competing Interests." rows so far, counted
        // for the later "one more" read; the log opens from the workflow
        // header, which a stacked Review Details window covers.)
        log = await openActivityLog(page);
        await expect(activityLogRow(log, modifiedRow)).toBeVisible({timeout: 30_000});
        const loggedBefore = await log.getByRole('row').filter({hasText: modifiedRow}).count();
        await log.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(log).toBeHidden({timeout: 20_000});
        readModal = await openReadReview(page, modal, answeredName);
        group = competingInterestsGroup(readModal);
        await expect(group).toContainText('I may have competing interests');
        await expect(group).toContainText(statement);

        // The answer still editable: "Modify Review" still offers the group;
        // "I do not have any competing interests" saved, the view window's
        // "Declaration" reads it, the badge goes, and the log has one more
        // "…Reviewer Competing Interests." row.
        editModal = await openModifyReviewWindow(page, readModal);
        await expect(competingInterestsGroup(editModal)).toBeVisible();
        await declarationRadio(editModal, 'I do not have any competing interests').check();
        await saveModifyReview(editModal);
        group = competingInterestsGroup(readModal);
        await expect(group).toContainText('I do not have any competing interests', {timeout: 20_000});
        await expect(group).not.toContainText(statement);
        await cancelReviewDetails(readModal);
        await expect(statusTitle(row, 'Review Viewed').or(statusTitle(row, 'Review Submitted'))).toBeVisible({timeout: 20_000});
        await expect(competingInterestsBadge(row)).toHaveCount(0);
        log = await openActivityLog(page);
        await expect(log.getByRole('row').filter({hasText: modifiedRow})).toHaveCount(loggedBefore + 1, {timeout: 30_000});
        await log.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(log).toBeHidden({timeout: 20_000});

        // Control: without a policy and without an answer the second
        // reviewer's "Review Details" shows no "Competing Interests" group
        // (its "Reviewer Comments" group is the positive control).
        modal = await openEditorial(page, tag, seeded.submissionId);
        secondRow = reviewerRow(modal, unansweredName);
        readModal = await openRowReviewDetails(page, secondRow);
        await expect(readModal.getByRole('group', {name: 'Reviewer Comments'})).toBeVisible();
        await expect(competingInterestsGroup(readModal)).toHaveCount(0);
    });
});
