// @ts-check
/**
 * @file playwright/tests/U27-reviewer-assignment.spec.js
 *
 * Reviewer assignment & management — OJS suite, one test per canonical
 * scenario the spec runs on OJS (common scenarios 1–12, 16–21 +
 * OJS-specific 14; scenario 13 is OMP-only, 15 OPS-only — they live in
 * those trees).
 * Spec: docs/specs/U27-reviewer-assignment-and-management.md
 *
 * Deliberately NOT covered (register IDs; the spec's Coverage section is
 * the record of everything else left out):
 * - 🐞 A1, A2, A7, A12, A13, A15, A16, A18, A19, A21, A22, A26, A30, A31,
 *   A32, A36, A37, A39, A43, A44, A45, A46, A47, A49, A50, A51, A54, A55,
 *   A57.
 * - ❓ A4, A6, A17, A23, A28, A29, A38, A42, A48, A52, A53, A56.
 *
 * Seeding: scenario endpoints only; publicknowledge and the 18 seeded users
 * are read-only. Tests that mutate roles/accounts (S2–S4), need a private
 * toast queue, a bounded task list, a throwaway mailbox or a review form
 * (S1, S5, S6, S7, S9, S10, S11, S12, S21), or switch a journal's
 * recommendation off (S16), run on scratch journals with
 * throwaway users whose addresses carry app + test in the username (u27s7ojsw0…@mail.test). Mail assertions
 * on seeded reviewers are scoped by recipient + the scratch submission's
 * unique tag-bearing title. Silence claims are bounded (pkpMail.count after
 * a bounding find; list absences bounded by the row/response that carries
 * them). No hard-coded waits.
 */
const fs = require('fs');
const {test, expect} = require('../support/fixtures.js');
const {TasksPanel} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {
    WorkflowPage,
    performReview,
    legacyModal,
    pickDate,
    typeDate,
    inMemoryFile,
    openAddReviewerModal,
    searchReviewerList,
    selectReviewer,
    openReviewDetails,
    awaitReviewDetailsSettled,
    rateReview,
    markReviewComplete,
    closeReviewDetails,
    openRowMenu,
    closeRowMenu,
    clickRowAction,
    statusTitle,
    uploadReviewFiles,
    openEditReview,
    saveEditReview,
    editReviewFileCheckbox,
    setEditReviewFile,
    createNewReviewRound,
    typeRichText,
    openActivityLog,
    closeSideWindow,
    reviewerSearchAuthors,
    openReviewerSearchFilters,
    reviewerSearchFilter,
    reviewerListItems,
    reviewerListPagination,
    reviewTypeRadio,
    publicVisibilityCheckbox,
    noFilesWarning,
    reviewFileCheckboxes,
    openSendReminder,
    reviewScheduleLabels,
    submitSendReminder,
    revertReviewDecision,
    openModifyReview,
    cancelModifyReview,
    closeWindowAsking,
    datedLine,
    openReviewDetailsFromMenu,
    openReviewHistory,
    historyLines,
    competingInterestsGroup,
    declareCompetingInterests,
    saveModifyReview,
    statusCell,
    recommendationSection,
    recommendationValue,
    modifyReviewRecommendation,
    modifyReviewCommentsBody,
    modifyReviewErrorSummary,
    modifyReviewSaveButton,
    saveModifyReviewRefused,
    reviewerCommentsGroup,
    lastModifiedLine,
    waitForJQueryIdle,
    waitForLegacyFormSettled,
} = require('../pages/ReviewStagePages.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {EditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {ReviewerAssignmentsPage, ReviewWizardPage} = require('../../../../shared/playwright/pages/ReviewerPages.js');
const {ReviewSettingsPage} = require('../../../../shared/playwright/pages/ReviewSettingsPages.js');
const {legacyAnswerApplied} = require('../support/legacy.js');

const JOURNAL = 'publicknowledge';
const REVIEW_PENDING = 'Review pending.';
const ASSIGNMENT_UPDATED = 'Review assignment updated.';
const DATE_RULE = 'Review due date must be greater or equal to response due date.';
/**
 * The inverted-date refusal's notice. The spec quotes it whole ("There was
 * an error adding the reviewer as review due date must be equal or greater
 * than responde due date."); its two faults, "adding the reviewer" in Edit
 * and Resend and the typo "responde", are register A45 and are matched
 * either way, so the fix does not red this read.
 */
const INVERTED_DATES_NOTICE =
    /There was an error .+ as review due date must be equal or greater than respon(?:de|se) due date\./;
const FORM_CHANGED = 'The data on this form has changed. Do you wish to continue without saving?';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u27${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
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

/** Seed a submission standing in external review round 1. */
async function seedInReview(ojsApi, tag, {
    context = JOURNAL,
    submitter = 'author.alex',
    reviewers = [],
    participants = undefined,
} = {}) {
    return ojsApi.createSubmission({
        tag,
        context,
        submitter,
        title: `Submission ${tag}`,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers}],
        ...(participants ? {participants} : {}),
    });
}

/** The page's notice text (a toast or an inline notification), first match. */
function notice(page, text) {
    return page.getByText(text).first();
}

/** The toast area (`role="status"`), read whole for "no notice" claims. */
function toasts(page) {
    return page.locator('.app__notifications');
}

/** The request-letter TinyMCE body of an open Add Reviewer window. */
function requestLetter(page) {
    return page.frameLocator('iframe[id^="personalMessage"]').locator('body');
}

/** The hidden datepicker altField carrying a due date's submitted Y-m-d value. */
function dueDateValue(scope, fieldPrefix) {
    return scope.locator(`input[id^="${fieldPrefix}"][id$="-altField"]`);
}

/**
 * The header's Tasks window rows carrying `sentence` for the submission
 * titled `title`, read after the window's grid answered (the bound for
 * presence and absence alike). The caller closes the window.
 */
async function openTaskRows(page, sentence, title) {
    const tasks = new TasksPanel(page);
    await tasks.open();
    return {tasks, rows: tasks.row(sentence).filter({hasText: title})};
}

/** The app's short date and time ("2026-11-12 04:07 AM"), as a pattern source. */
const DATE_TIME = '\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} [AP]M';

/** A review-history line ("{label}: {date}", the label in bold) of the row's History window. */
function historyLine(historyModal, label) {
    return historyModal
        .locator('.pkp_review_history > div')
        .filter({has: historyModal.page().locator('strong', {hasText: new RegExp(`^${label}:\\s*$`)})});
}

/**
 * A review-form text question's answer box on the reviewer's step 3: the
 * boxes carry no accessible name, so the box is read inside the innermost
 * form section headed by its question (the step's own section wraps them
 * all).
 */
function formAnswerBox(wizard, question) {
    return wizard.step3Form
        .locator('div.section')
        .filter({has: wizard.page.locator('label', {hasText: new RegExp(`^${question}\\*?$`)})})
        .filter({hasNot: wizard.page.locator('div.section')})
        .locator('input[type="text"][name^="reviewFormResponses"]');
}

/** Text with every whitespace run removed, for reads across PDF text items. */
function squeezed(text) {
    return text.replace(/\s+/g, '');
}

/**
 * A downloaded PDF's text, read with the app's own pdf.js (the PDF viewer
 * plugin's build) in a context of the fixture's browser on the worker's
 * server: mpdf compresses the text streams, so the bytes are not read raw.
 */
async function pdfText(browser, baseURL, filePath) {
    const ctx = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    try {
        const page = await ctx.newPage();
        await page.goto('/plugins/generic/pdfJsViewer/pdf.js/LICENSE');
        return await page.evaluate(async (data) => {
            const lib = await import('/plugins/generic/pdfJsViewer/pdf.js/build/pdf.mjs');
            lib.GlobalWorkerOptions.workerSrc = '/plugins/generic/pdfJsViewer/pdf.js/build/pdf.worker.mjs';
            const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
            const doc = await lib.getDocument({data: bytes}).promise;
            const pages = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const content = await (await doc.getPage(i)).getTextContent();
                pages.push(content.items.map((item) => item.str).join(' '));
            }
            return pages.join('\n');
        }, fs.readFileSync(filePath).toString('base64'));
    } finally {
        await ctx.close();
    }
}

test.describe('reviewer-assignment', () => {
    test('S1: invite a reviewer', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s1', testInfo);
        const editor = `ed${tag}`;
        const editorName = `Ed${tag} Editor`;
        const author = `au${tag}`;
        const first = {username: `rev${tag}`, givenName: `Rev${tag}`, familyName: 'One'};
        const second = {username: `revb${tag}`, givenName: `Revb${tag}`, familyName: 'Two'};
        const firstName = `${first.givenName} ${first.familyName}`;
        const secondName = `${second.givenName} ${second.familyName}`;
        // Scratch journal: the add's notices need a private toast queue and
        // the silence control a throwaway mailbox.
        await ojsApi.createContext({
            tag,
            users: [
                {username: editor, givenName: `Ed${tag}`, familyName: 'Editor', roles: ['editor']},
                {username: author, roles: ['author']},
                {...first, roles: ['externalReviewer']},
                {...second, roles: ['externalReviewer']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {context: tag, submitter: author});

        const editorPage = await (await asUser(editor)).newPage();
        const workflow = new WorkflowPage(editorPage, tag);
        await workflow.gotoEditorial(submissionId);

        // "Add Reviewer": the window opens on "Locate a Reviewer" with no
        // request form and no submit button below the list.
        const modal = await openAddReviewerModal(editorPage);
        await expect(modal.getByText('Locate a Reviewer')).toBeVisible();
        await expect(modal.locator('#regularReviewerForm')).toBeHidden();
        await expect(modal.getByRole('button', {name: 'Add Reviewer', exact: true})).toBeHidden();

        // Search the pool and select the first reviewer: name and address
        // show with a "Change" link, and the request form appears below with
        // the prefilled letter and the two due dates (preset from the
        // journal's review setup; the datepicker's hidden altField carries the
        // submitted Y-m-d value).
        await selectReviewer(editorPage, modal, firstName);
        await expect(modal.locator('[id^="selectedReviewerEmail"]')).toContainText(`${first.username}@mail.test`);
        const changeLink = modal.getByRole('link', {name: 'Change', exact: true});
        await expect(changeLink).toBeVisible();
        await expect(requestLetter(editorPage)).toContainText('you would serve as an excellent reviewer', {
            timeout: 30_000,
        });
        await expect(dueDateValue(modal, 'responseDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));
        await expect(dueDateValue(modal, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));

        // "Change": the search shows again; select the same reviewer again.
        await changeLink.click();
        await expect(modal.locator('.listPanel--selectReviewer input.pkpSearch__input')).toBeVisible();
        await expect(modal.locator('#regularReviewerForm')).toBeHidden();
        await selectReviewer(editorPage, modal, firstName);

        // "Close" with a reviewer picked: the top bar's "Close" closes the
        // window at once, nothing asks (the enroll form's and the Edit
        // window's "Close" do ask, S4 and S6), and no row is added (the
        // table's empty state, whose place the add's row takes below).
        expect(await closeWindowAsking(editorPage, modal)).toBeNull();
        const reviewers = editorPage.getByRole('table', {name: 'Reviewers', exact: true});
        await expect(reviewers).toContainText('No Items');
        await expect(workflow.panelRow('Reviewers', firstName)).toHaveCount(0);
        const changed = await openAddReviewerModal(editorPage);
        await selectReviewer(editorPage, changed, firstName);

        // "Close" after a date change: "Review Due Date" typed a week after
        // its preset (the date box, reachable in this second window on the
        // page, where the calendar's hiding from screen readers is register
        // A54, asserted neither way). The top "Close" asks; "Cancel" keeps
        // the window with the changed date; "Close" again and "OK" closes
        // it, and no row is added, on the page and after a reload.
        const changedDue = ymd(daysFromNow(5 * 7));
        await expect(dueDateValue(changed, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));
        await typeDate(editorPage, changed, 'reviewDueDate', changedDue);
        expect(await closeWindowAsking(editorPage, changed, {answer: 'dismiss'})).toBe(FORM_CHANGED);
        await expect(changed.locator('#regularReviewerForm')).toBeVisible();
        await expect(changed.locator('[id^="selectedReviewerName"]')).toHaveText(firstName);
        await expect(changed.locator('input.datepicker[id^="reviewDueDate"]')).toHaveValue(changedDue);
        await expect(dueDateValue(changed, 'reviewDueDate')).toHaveValue(changedDue);
        expect(await closeWindowAsking(editorPage, changed, {answer: 'accept'})).toBe(FORM_CHANGED);
        await expect(reviewers).toContainText('No Items');
        await expect(workflow.panelRow('Reviewers', firstName)).toHaveCount(0);
        await editorPage.reload();
        await workflow.expectOpen();
        await expect(reviewers).toContainText('No Items', {timeout: 30_000});
        await expect(workflow.panelRow('Reviewers', firstName)).toHaveCount(0);
        const reopened = await openAddReviewerModal(editorPage);
        await selectReviewer(editorPage, reopened, firstName);

        // The add: the notice names the reviewer and the email, the row reads
        // "Request Sent" (the missing response-deadline second line is
        // register A7 — asserted neither way).
        await reopened.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(
            notice(editorPage, `${firstName} was assigned to review this submission and sent an email notification.`)
        ).toBeVisible({timeout: 30_000});
        await expect(reopened).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(editorPage);
        const row = workflow.panelRow('Reviewers', firstName);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Request Sent');

        // The reviewer's mailbox holds the request email, sent under the
        // Editor's name (verified: an emptied letter's silent add is A18).
        const request = await pkpMail.find({
            to: `${first.username}@mail.test`,
            subject: 'Invitation to review',
        });
        expect(request.From?.Name).toBe(editorName);
        // The email's body holds the letter's text (an emptied letter's
        // email carries a subject and no text, A18): the prefilled letter's
        // sentence read above in the window, and the submission's title.
        const requestBody = (await pkpMail.fullMessage(request.ID)).Text ?? '';
        expect(requestBody.trim()).not.toBe('');
        expect(requestBody).toContain('you would serve as an excellent reviewer');
        expect(requestBody).toContain(`Submission ${tag}`);

        // The submission's activity log records the assignment.
        const log = await openActivityLog(editorPage);
        await expect(
            log.getByRole('row').filter({
                hasText: `${firstName} has been assigned to review submission ${submissionId} for review round 1.`,
            })
        ).toBeVisible();
        await closeSideWindow(log);

        // The row's "More Actions" menu lists, in order, only "Review
        // Details", "Edit", "Unassign Reviewer", "Email Reviewer", "History",
        // "Login As" (the manager-level editor may impersonate a reviewer
        // who holds roles in this journal alone), "Editorial Notes" and
        // "Log Response"; no "Send Review To ORCID" (no iD on the install).
        const menu = await openRowMenu(editorPage, row);
        const entries = (await menu.getByRole('menuitem').allTextContents()).map((s) => s.trim());
        expect(entries).toEqual([
            'Review Details',
            'Edit',
            'Unassign Reviewer',
            'Email Reviewer',
            'History',
            'Login As',
            'Editorial Notes',
            'Log Response',
        ]);

        // "Editorial Notes": one text field under the guidance sentence.
        await menu.getByRole('menuitem', {name: 'Editorial Notes', exact: true}).click();
        const notesModal = legacyModal(editorPage, 'reviewerGossipForm');
        await expect(
            notesModal.getByText(
                'Record notes about this reviewer that you would like to make visible to other ' +
                    'administrators, managers and all editors. Notes will be visible for future review assignments.'
            )
        ).toBeVisible({timeout: 30_000});
        await expect(notesModal.locator('textarea[name="gossip"]')).toHaveCount(1);
        await expect(notesModal.locator('.tox-tinymce')).toHaveCount(1, {timeout: 30_000});
        await closeSideWindow(notesModal);

        // "Do not send email to Reviewer.": the second reviewer is added the
        // same way with the box ticked; the notice says so and the row reads
        // "Request Sent".
        const modal2 = await openAddReviewerModal(editorPage);
        await selectReviewer(editorPage, modal2, secondName);
        await modal2.locator('input[name="skipEmail"]').check();
        await modal2.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        // The notice on screen reads the full sentence (the spec's shorter
        // quote is finding T-ojs-1 in .reports/U27/test-ojs-findings.md).
        await expect(
            notice(
                editorPage,
                `${secondName} was assigned to review this submission and was not sent an email notification.`
            )
        ).toBeVisible({timeout: 30_000});
        await expect(modal2).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(editorPage);
        const secondRow = workflow.panelRow('Reviewers', secondName);
        await expect(secondRow).toContainText('Request Sent');

        // Control: the second reviewer's mailbox holds no request email
        // (read the same way as the first's, after the second add's own
        // response — the mail is sent inside that request).
        await pkpMail.find({to: `${first.username}@mail.test`, subject: 'Invitation to review'});
        expect(await pkpMail.count({to: `${second.username}@mail.test`, subject: 'Invitation to review'})).toBe(0);
        expect(await pkpMail.count({to: `${second.username}@mail.test`, contains: tag})).toBe(0);
    });

    test('S2: the list warns before anonymity breaks', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s2', testInfo);
        const manager = `mgr${tag}`;
        const author = `au${tag}`;
        const locked = `lock${tag}`;
        const lockedName = `Lock${tag}`;
        const assignedName = `reva${tag}`;
        // Thirty never-assigned reviewers push the pool past a page.
        const pool = Array.from({length: 30}, (_, i) => `rp${String(i + 1).padStart(2, '0')}${tag}`);
        const neverAssigned = pool[6];
        // Scratch journal: the locked entry needs a reviewer who also holds a
        // manager role — never a mutation of the shared roster.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: locked, givenName: lockedName, roles: ['externalReviewer', 'manager']},
                {username: assignedName, roles: ['externalReviewer']},
                ...pool.map((username) => ({username, roles: ['externalReviewer']})),
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [{username: assignedName, status: 'invited'}],
        });

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(managerPage);

        // The opening list: the submission's author named in bold above it,
        // 30 entries above the "View additional pages" bar (the pool is 32
        // reviewers plus the manager-reviewer).
        await expect(reviewerSearchAuthors(modal)).toHaveText([author]);
        await expect(reviewerListPagination(modal)).toBeVisible({timeout: 30_000});
        await expect(reviewerListItems(modal)).toHaveCount(30);

        // The "Filters" sidebar: five sliders by name, each disabled until
        // its enable button is pressed; pressing the one beside "Reviews
        // completed" enables that slider (the others stay disabled).
        const sidebar = await openReviewerSearchFilters(modal);
        const filterTitles = [
            'Rated at least',
            'Reviews completed',
            'Days since last review assigned',
            'Active reviews currently assigned',
            'Average days to complete review',
        ];
        await expect(sidebar.locator('.pkpFilter__inputTitle')).toHaveText(filterTitles);
        for (const title of filterTitles) {
            const {sliders, enable} = reviewerSearchFilter(sidebar, title);
            await expect(sliders.first()).toBeAttached();
            for (const slider of await sliders.all()) {
                await expect(slider).toBeDisabled();
            }
            await expect(enable).toBeVisible();
        }
        const completed = reviewerSearchFilter(sidebar, 'Reviews completed');
        await completed.enable.click();
        await expect(completed.sliders.first()).toBeEnabled();
        await expect(completed.sliders).toHaveCount(1);
        await expect(reviewerSearchFilter(sidebar, 'Rated at least').sliders.first()).toBeDisabled();

        // The same button, now "Clear filter: Reviews completed", disables
        // the slider again (a search made while the filter stays on drops
        // the never-assigned reviewers — register A28, walked, not
        // asserted).
        await expect(completed.enable).toHaveCount(0);
        await completed.clear.click();
        await expect(completed.sliders.first()).toBeDisabled();
        await expect(completed.clear).toHaveCount(0);
        await expect(completed.enable).toBeVisible();

        // A never-assigned reviewer's entry: the name, the completed count
        // "0" and "Never assigned" (the "{N} active" badge asserted neither
        // way, finding T-ojs-5 in
        // .reports/U27/test-ojs-findings-2026-09-13.md, folded).
        const neverItem = await searchReviewerList(managerPage, modal, neverAssigned);
        await expect(neverItem.locator('.listPanel__itemTitle')).toContainText(neverAssigned);
        await expect(neverItem.locator('.listPanel__item--reviewer__complete')).toHaveText('0');
        await expect(neverItem).toContainText('Never assigned');

        // The manager-reviewer is locked with the author-identity warning and
        // no Select button; "Unlock" frees it, and the add lands as
        // "Request Sent".
        const lockedItem = await searchReviewerList(managerPage, modal, lockedName);
        await expect(lockedItem).toContainText(
            'This reviewer is locked because they have been assigned a role which allows them to view the ' +
                "author's identity. Anonymous peer review can not be guaranteed. Would you like to unlock " +
                'this reviewer anyway?'
        );
        await expect(lockedItem.getByText(`Select ${lockedName}`)).toHaveCount(0);
        await lockedItem.getByRole('button', {name: 'Unlock'}).click();
        await expect(lockedItem.getByText(`Select ${lockedName}`)).toBeVisible();
        await selectReviewer(managerPage, modal, lockedName);
        await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(modal).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        const lockedRow = workflow.panelRow('Reviewers', lockedName);
        await expect(lockedRow).toContainText('Request Sent');

        // A reviewer already on the round is dimmed and cannot be selected
        // again.
        const modal2 = await openAddReviewerModal(managerPage);
        const assignedItem = await searchReviewerList(managerPage, modal2, assignedName);
        await expect(assignedItem).toContainText('This reviewer has already been assigned to this review round.');
        await expect(assignedItem.locator('.listPanel__item--reviewer.-isAssigned')).toHaveCount(1);
        await expect(assignedItem.getByText(`Select ${assignedName}`)).toHaveCount(0);
        await expect(assignedItem.getByRole('button', {name: /^Select /})).toHaveCount(0);
        await expect(assignedItem.getByRole('button', {name: /^Show more details/})).toBeVisible();

        // Own row: the spec's "Own row" bullet (the manager-reviewer opening
        // the stage, their own row's menu without "Editorial Notes") is not
        // driven: the screen refuses that user the stage outright ("You don't
        // currently have access to that stage of the workflow."), finding
        // T-ojs-2 in .reports/U27/test-ojs-findings.md. Control: the same
        // menu on the first reviewer's row offers "Editorial Notes" to a
        // Journal Manager (bounded by the always-offered "Email Reviewer").
        await closeSideWindow(modal2);
        const otherRow = workflow.panelRow('Reviewers', assignedName);
        const otherMenu = await openRowMenu(managerPage, otherRow);
        await expect(otherMenu.getByRole('menuitem', {name: 'Email Reviewer'})).toBeVisible();
        await expect(otherMenu.getByRole('menuitem', {name: 'Editorial Notes'})).toBeVisible();
        await closeRowMenu(managerPage, otherRow);
    });

    test('S3: create a brand-new reviewer', async ({asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const manager = `mgr${tag}`;
        const author = `au${tag}`;
        const givenName = `Rev${tag}x`;
        const expectedUsername = givenName.toLowerCase();
        const reviewerEmail = `${expectedUsername}@mail.test`;
        // Scratch journal: the minted account and its reviewer enrolment are
        // journal-level mutations, and the welcome mail needs a throwaway box.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {context: tag, submitter: author});

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(managerPage);
        await modal.getByRole('link', {name: 'Create New Reviewer'}).click();

        // The account fields appear above the request form; no "Appear on
        // the masthead" box, as reviewers are not listed on a new journal
        // (pkp/pkp-lib#13370, 2026-10-23).
        const createModal = managerPage
            .getByRole('dialog')
            .filter({has: managerPage.locator('form#createReviewerForm')});
        const form = createModal.locator('form#createReviewerForm');
        await expect(form.locator('input[name="username"]')).toBeVisible({timeout: 30_000});
        await expect(form.locator('#reviewerFormFooter')).toBeVisible();
        // Its file grid lands above "Add Reviewer" after the form: presses wait for it.
        await waitForLegacyFormSettled(managerPage, createModal);
        await expect(form.locator('input[name="masthead"]')).toHaveCount(0);

        // Control: no reviewer role select, one reviewer group serving the
        // stage (the username box above is the same form's positive read).
        await expect(form.locator('select[name="userGroupId"]')).toHaveCount(0);

        await form.locator('input[name="givenName[en]"]').fill(givenName);
        await form.locator('input[name="email"]').fill(reviewerEmail);

        // "Suggest" fills a lowercase proposal from the given name.
        await form.getByRole('button', {name: 'Suggest'}).click();
        await expect(form.locator('input[name="username"]')).toHaveValue(expectedUsername, {
            timeout: 30_000,
        });

        // Duplicates refused: the manager's own username, then their own
        // address, each with its toast; the form stays open.
        await form.locator('input[name="username"]').fill(manager);
        await form.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(notice(managerPage, 'The selected username is already in use by another user.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(form.locator('input[name="username"]')).toBeVisible();
        await form.locator('input[name="username"]').fill(expectedUsername);
        await form.locator('input[name="email"]').fill(`${manager}@mail.test`);
        await form.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(
            notice(managerPage, 'The selected email address is already in use by another user.')
        ).toBeVisible({timeout: 30_000});
        await expect(form.locator('input[name="email"]')).toBeVisible();

        // The add: the row reads "Request Sent".
        await form.locator('input[name="email"]').fill(reviewerEmail);
        await form.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(createModal).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        const row = workflow.panelRow('Reviewers', givenName);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Request Sent');

        // The journal's users list shows the new account with the Reviewer
        // role.
        await managerPage.goto(`/index.php/${tag}/management/settings/access`);
        await expect(managerPage.getByRole('heading', {name: 'Users & Roles'})).toBeVisible({
            timeout: 30_000,
        });
        const userRow = managerPage
            .getByRole('table', {name: /Current Users/})
            .getByRole('row')
            .filter({hasText: reviewerEmail});
        await expect(userRow).toBeVisible({timeout: 30_000});
        await expect(userRow).toContainText('Reviewer');

        // The new address's mailbox holds the registration email (with the
        // username and a password) and the review request.
        const registration = await pkpMail.find({
            to: reviewerEmail,
            subject: 'Registration as Reviewer',
        });
        await pkpMail.find({to: reviewerEmail, subject: 'Invitation to review'});
        const full = await pkpMail.fullMessage(registration.ID);
        const credentials = (full.HTML || '').match(
            /Username:\s*([^<\s]+)\s*<br\s*\/?>\s*Password:\s*([^<\s]+)/i
        );
        expect(credentials, 'emailed username and password').toBeTruthy();
        expect(credentials?.[1]).toBe(expectedUsername);

        // Signing in with the emailed password lands on "Change Password".
        const freshCtx = await browser.newContext({
            baseURL,
            storageState: {cookies: [], origins: []},
        });
        try {
            const loginPage = new LoginPage(await freshCtx.newPage());
            await loginPage.page.goto(`/index.php/${tag}/login`);
            await loginPage.usernameInput.fill(expectedUsername);
            await loginPage.fillPassword(credentials?.[2] || '');
            await loginPage.submitButton.click();
            await loginPage.page.waitForURL(/\/login\/changePassword/, {
                waitUntil: 'commit',
                timeout: 15_000,
            });
            await expect(
                loginPage.page.getByRole('heading', {name: 'Change Password'})
            ).toBeVisible();
        } finally {
            await freshCtx.close();
        }
    });

    test('S4: enroll an existing user', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s4', testInfo);
        const manager = `mgr${tag}`;
        const author = `au${tag}`;
        const enrollee = `enr${tag}`;
        const existingReviewer = `rev${tag}`;
        // Scratch journal: enrolling grants a permanent role — a mutation the
        // shared roster must never see.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: enrollee, roles: ['author']},
                {username: existingReviewer, roles: ['externalReviewer']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {context: tag, submitter: author});

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const enrollModal = managerPage
            .getByRole('dialog')
            .filter({has: managerPage.locator('form#enrollExistingReviewerForm')});
        const form = enrollModal.locator('form#enrollExistingReviewerForm');
        const nameInput = form.locator('input[id^="userId_input"]');
        const heading = form.getByRole('heading', {name: 'Enroll an Existing User as Reviewer'});
        const openEnrollForm = async () => {
            const modal = await openAddReviewerModal(managerPage);
            await modal.getByRole('link', {name: 'Enroll Existing User'}).click();
            await expect(heading).toBeVisible({timeout: 30_000});
            // The footer's file grid lands above the button after the form.
            await waitForLegacyFormSettled(managerPage, enrollModal);
        };

        // The enroll form's "Close": the Author's name typed into "Search
        // By Name", no suggestion picked; the window's top "Close" asks
        // first, and "OK" closes it with no row added (the table's empty
        // state, whose place the pick's row takes below).
        await openEnrollForm();
        await nameInput.pressSequentially(enrollee, {delay: 30});
        expect(await closeWindowAsking(managerPage, enrollModal, {answer: 'accept'})).toBe(FORM_CHANGED);
        const reviewers = managerPage.getByRole('table', {name: 'Reviewers', exact: true});
        await expect(reviewers).toContainText('No Items');
        await expect(workflow.panelRow('Reviewers', enrollee)).toHaveCount(0);

        // "Enroll Existing User": its heading, "Search By Name", a one-option
        // reviewer role select and no masthead box (reviewers are not listed
        // on a new journal, pkp/pkp-lib#13370).
        await openEnrollForm();
        await expect(form.getByText('Search By Name')).toBeVisible();
        const roleSelect = form.locator('select[name="userGroupId"]');
        await expect(roleSelect).toBeVisible();
        await expect(roleSelect.locator('option')).toHaveCount(1);
        await expect(form.locator('input[name="masthead"]')).toHaveCount(0);

        // An empty field is refused with "This field is required." under the
        // box (each refusal swaps the form for a new one).
        const pressAdd = async () => {
            await form.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            await legacyAnswerApplied(managerPage, 'enrollExistingReviewerForm');
        };
        const required = form.getByText('This field is required.');
        await pressAdd();
        await expect(required).toBeVisible({timeout: 30_000});
        await expect(nameInput).toBeVisible();

        // A name typed, not picked: left by a click outside the box, it is
        // cleared (the suggestion list showed it, the positive read), and
        // "Add Reviewer" is refused the same way.
        const menu = managerPage.locator('ul.ui-autocomplete').filter({visible: true});
        const match = menu.locator('li').filter({hasText: enrollee});
        await nameInput.pressSequentially(enrollee, {delay: 30});
        await expect(match).toBeVisible({timeout: 30_000});
        await expect(nameInput).toHaveValue(enrollee);
        await heading.click();
        await expect(nameInput).toHaveValue('');
        await pressAdd();
        await expect(required).toBeVisible({timeout: 30_000});
        await expect(enrollModal).toHaveCount(1);
        await expect(nameInput).toHaveValue('');

        // The pick: the message clears.
        await nameInput.pressSequentially(enrollee, {delay: 30});
        await expect(match).toBeVisible({timeout: 30_000});
        await match.click();
        await expect(required).toBeHidden();

        // The add: the row reads "Request Sent".
        await form.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(enrollModal).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        const row = workflow.panelRow('Reviewers', enrollee);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Request Sent');

        // The journal's users list shows the user now also holds Reviewer.
        await managerPage.goto(`/index.php/${tag}/management/settings/access`);
        await expect(managerPage.getByRole('heading', {name: 'Users & Roles'})).toBeVisible({
            timeout: 30_000,
        });
        const userRow = managerPage
            .getByRole('table', {name: /Current Users/})
            .getByRole('row')
            .filter({hasText: `${enrollee}@mail.test`});
        await expect(userRow).toBeVisible({timeout: 30_000});
        await expect(userRow).toContainText('Reviewer');

        // Control: an existing reviewer's name finds nothing in the same
        // autocomplete (bounded by the widget's own "No Matches" entry).
        await workflow.gotoEditorial(submissionId);
        const modal2 = await openAddReviewerModal(managerPage);
        await modal2.getByRole('link', {name: 'Enroll Existing User'}).click();
        const form2 = managerPage.locator('form#enrollExistingReviewerForm');
        await expect(form2.locator('input[id^="userId_input"]')).toBeVisible({timeout: 30_000});
        await form2.locator('input[id^="userId_input"]').pressSequentially(existingReviewer, {delay: 30});
        const menu2 = managerPage.locator('ul.ui-autocomplete').filter({visible: true});
        await expect(menu2.getByText('No Matches')).toBeVisible({timeout: 30_000});
        await expect(menu2.locator('li').filter({hasText: existingReviewer})).toHaveCount(0);
    });

    test('S5: deadlines are validated', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const editor = `ed${tag}`;
        const author = `au${tag}`;
        const reviewer = `rev${tag}`;
        // Scratch journal: the refusal's notice is a form-error notice fetched
        // for the signed-in user, so it is read by an editor no other test
        // signs in as (parallel lesson 2); the reviewer stays out of the seed.
        await ojsApi.createContext({
            tag,
            users: [
                {username: editor, roles: ['editor']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {context: tag, submitter: author});

        const editorPage = await (await asUser(editor)).newPage();
        const workflow = new WorkflowPage(editorPage, tag);
        await workflow.gotoEditorial(submissionId);
        const modal = await openAddReviewerModal(editorPage);
        await selectReviewer(editorPage, modal, reviewer);

        // "Files To Be Reviewed" on a round with no files (the seed carries
        // none): the list is empty and the inline warning "No Files
        // Selected" shows.
        await expect(noFilesWarning(modal)).toBeVisible({timeout: 30_000});
        await expect(noFilesWarning(modal)).toContainText('No Files Selected');
        await expect(reviewFileCheckboxes(modal)).toHaveCount(0);

        // The permanent guidance sentence states the rule.
        await expect(modal.getByText(DATE_RULE)).toBeVisible();

        // Inverted dates: the review due date a week out, before the
        // response due date (four weeks out); "Add Reviewer" is refused
        // with the notice at the top right, gone by itself within seconds;
        // the window stays open and nothing is added.
        await pickDate(editorPage, modal, 'reviewDueDate', daysFromNow(7));
        await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        const refusal = notice(editorPage, INVERTED_DATES_NOTICE);
        await expect(refusal).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(editorPage);
        await expect(modal.locator('input[id^="responseDueDate"]').first()).toBeVisible();
        await expect(workflow.panelRow('Reviewers', reviewer)).toHaveCount(0);
        await expect(refusal).toBeHidden({timeout: 30_000});

        // Control: the review due date on the response due date's day is
        // accepted and the row appears.
        await pickDate(editorPage, modal, 'reviewDueDate', daysFromNow(4 * 7));
        await expect(dueDateValue(modal, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));
        await expect(dueDateValue(modal, 'responseDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));
        await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(modal).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(editorPage);
        // Exactly one row: the refused submit created nothing (a leftover
        // assignment would have made this second add a refused duplicate).
        await expect(workflow.panelRow('Reviewers', reviewer)).toHaveCount(1);
        await expect(workflow.panelRow('Reviewers', reviewer)).toContainText('Request Sent');
    });

    test('S6: edit an assignment, reviewer is told', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s6', testInfo);
        const manager = `mgr${tag}`;
        const author = `au${tag}`;
        const reviewer = `rev${tag}`;
        const title = `Submission ${tag}`;
        const fileOne = inMemoryFile(`one${tag}.txt`);
        const fileTwo = inMemoryFile(`two${tag}.txt`);
        // Scratch journal: the change notice needs a throwaway mailbox and
        // the task assertion a bounded task list.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [{username: reviewer, status: 'invited'}],
        });

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', reviewer);
        await expect(row).toBeVisible();

        // The round's two review files (the seed carries none).
        await uploadReviewFiles(managerPage, workflow, [fileOne, fileTwo]);

        // "Edit", the dates: the window shows the rule; an inverted pair is
        // refused with the notice at the top right and the window staying
        // open; a week later than the original (+4 weeks, the form's own
        // default) saves. Calendar picks — the widget discards typed dates
        // (A16).
        const editModal = await openEditReview(managerPage, row);
        await expect(editModal.getByText(DATE_RULE)).toBeVisible();
        await pickDate(managerPage, editModal, 'reviewDueDate', daysFromNow(7));
        const refused = managerPage.waitForResponse(
            (r) => r.url().includes('/update-review') && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await editModal.getByRole('button', {name: 'OK', exact: true}).click();
        await refused;
        await expect(notice(managerPage, INVERTED_DATES_NOTICE)).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        await expect(editModal.locator('form#editReviewForm')).toBeVisible();
        await pickDate(managerPage, editModal, 'reviewDueDate', daysFromNow(5 * 7));
        await saveEditReview(managerPage, editModal);

        // The reviewer's side: the Tasks panel holds "Review pending." and
        // "Review assignment updated." for the submission, and the mailbox
        // the change notice.
        const reviewerPage = await (await asUser(reviewer)).newPage();
        await reviewerPage.goto(`/index.php/${tag}/dashboard/reviewAssignments`);
        const pending = await openTaskRows(reviewerPage, REVIEW_PENDING, title);
        await expect(pending.rows.first()).toBeVisible({timeout: 30_000});
        await expect(pending.tasks.row(ASSIGNMENT_UPDATED).filter({hasText: title})).toHaveCount(1);
        await pending.tasks.close();
        await pkpMail.find({
            to: `${reviewer}@mail.test`,
            subject: 'Your review assignment has been changed',
        });

        // "Close" with a change: the review due date moved to two weeks after
        // the original; the top "Close" asks first. "Cancel" keeps the
        // window with the new date in place; "Close" again and "OK" closes
        // it, the row unchanged, and "Edit" opened again shows the date
        // saved before. With nothing changed, "Close" closes at once.
        await managerPage.reload();
        await workflow.expectOpen();
        const rowBefore = (await statusCell(row).innerText()).trim();
        const editClose = await openEditReview(managerPage, row);
        await expect(dueDateValue(editClose, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(5 * 7)));
        await pickDate(managerPage, editClose, 'reviewDueDate', daysFromNow(6 * 7));
        expect(await closeWindowAsking(managerPage, editClose, {answer: 'dismiss'})).toBe(FORM_CHANGED);
        await expect(editClose.locator('form#editReviewForm')).toBeVisible();
        await expect(dueDateValue(editClose, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(6 * 7)));
        expect(await closeWindowAsking(managerPage, editClose, {answer: 'accept'})).toBe(FORM_CHANGED);
        await expect(statusCell(row)).toHaveText(rowBefore);
        const editReopened = await openEditReview(managerPage, row);
        await expect(dueDateValue(editReopened, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(5 * 7)));
        expect(await closeWindowAsking(managerPage, editReopened)).toBeNull();

        // "Files To Be Reviewed": no file ticked shows "No Files Selected";
        // one ticked back clears it; save.
        const editModal2 = await openEditReview(managerPage, row);
        const boxOne = editReviewFileCheckbox(editModal2, fileOne.name);
        const boxTwo = editReviewFileCheckbox(editModal2, fileTwo.name);
        await expect(boxOne).toBeVisible({timeout: 30_000});
        await expect(boxTwo).toBeVisible();
        const noFiles = editModal2.getByText('No Files Selected');
        // Each change slides the warning above the grid: the page object
        // presses once the window has stopped moving.
        await setEditReviewFile(managerPage, editModal2, fileOne.name, true);
        await setEditReviewFile(managerPage, editModal2, fileTwo.name, true);
        await expect(noFiles).toBeHidden();
        await setEditReviewFile(managerPage, editModal2, fileOne.name, false);
        await setEditReviewFile(managerPage, editModal2, fileTwo.name, false);
        await expect(noFiles).toBeVisible();
        await setEditReviewFile(managerPage, editModal2, fileOne.name, true);
        await expect(noFiles).toBeHidden();
        await saveEditReview(managerPage, editModal2);

        // The reviewer's files: "Respond to request" on their list opens
        // step 1, whose "Review Files" lists the first file alone (read once
        // the grid has loaded; the first file is the positive read).
        const assignments = new ReviewerAssignmentsPage(reviewerPage, tag);
        await assignments.goto('actionRequired');
        await assignments.openWizard(assignments.row(title), 'Respond to request');
        const wizard = new ReviewWizardPage(reviewerPage, tag);
        await wizard.expectReviewFilesSettled(1);
        const stepFiles = wizard.reviewFilesGrid(1);
        await expect(stepFiles.getByRole('row').filter({hasText: fileOne.name})).toBeVisible({timeout: 30_000});
        await expect(stepFiles.getByRole('row').filter({hasText: fileTwo.name})).toHaveCount(0);

        // Control: the mailbox holds no second change notice and the Tasks
        // panel no second "Review assignment updated.": an edit changing only
        // the file ticks sends nothing (bounded by the first notice above and
        // the second save's own response).
        expect(
            await pkpMail.count({
                to: `${reviewer}@mail.test`,
                subject: 'Your review assignment has been changed',
            })
        ).toBe(1);
        await reviewerPage.goto(`/index.php/${tag}/dashboard/reviewAssignments`);
        const after = await openTaskRows(reviewerPage, ASSIGNMENT_UPDATED, title);
        await expect(after.rows).toHaveCount(1);
        await after.tasks.close();
    });

    test('S7: remind an overdue reviewer', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s7', testInfo);
        const manager = `mgr${tag}`;
        const author = `au${tag}`;
        const overdueReviewer = `rev${tag}`;
        const acceptedReviewer = `revc${tag}`;
        const onTimeReviewer = `revb${tag}`;
        // Scratch journal: private toast queue + throwaway reminder mailbox.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: overdueReviewer, roles: ['externalReviewer']},
                {username: acceptedReviewer, roles: ['externalReviewer']},
                {username: onTimeReviewer, roles: ['externalReviewer']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [
                {username: overdueReviewer, status: 'invited'},
                {username: acceptedReviewer, status: 'accepted'},
                {username: onTimeReviewer, status: 'invited'},
            ],
        });

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', overdueReviewer);
        const acceptedRow = workflow.panelRow('Reviewers', acceptedReviewer);
        await expect(row).toBeVisible();
        await expect(acceptedRow).toBeVisible();

        // Overdue recipe (spec footnote s): backdate the response due date
        // through the Edit window — the screen's own route to a passed date;
        // the accepted reviewer gets both dates backdated the same way.
        const editModal = await openEditReview(managerPage, row);
        await pickDate(managerPage, editModal, 'responseDueDate', daysFromNow(-1));
        await saveEditReview(managerPage, editModal);
        const editAccepted = await openEditReview(managerPage, acceptedRow);
        await pickDate(managerPage, editAccepted, 'responseDueDate', daysFromNow(-2));
        await pickDate(managerPage, editAccepted, 'reviewDueDate', daysFromNow(-1));
        await saveEditReview(managerPage, editAccepted);

        // The overdue row reads "Overdue" in red with "Response due: {date}",
        // and its button reads "Send Reminder".
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(statusTitle(row)).toHaveText('Overdue');
        await expect(statusTitle(row)).toHaveClass(/text-negative/);
        await expect(row).toContainText(`Response due: ${ymd(daysFromNow(-1))}`);

        // "Review Reminder": the reviewer's name and address, the chooser
        // preset to the reminder template, the message, and the "Review
        // Schedule" dates.
        await row.getByRole('button', {name: 'Send Reminder', exact: true}).click();
        const reminderModal = legacyModal(managerPage, 'sendReminderForm');
        await expect(reminderModal.getByText('Review Schedule')).toBeVisible({timeout: 30_000});
        await expect(reminderModal.locator('input[name="reviewerName"]')).toHaveValue(
            new RegExp(`${overdueReviewer}.*${overdueReviewer}@mail\\.test`)
        );
        await expect(reminderModal.locator('select[name="template"]')).toHaveValue('REVIEW_REMIND');
        await expect(reminderModal.locator('.tox-tinymce')).toHaveCount(1, {timeout: 30_000});
        await expect(reminderModal.getByText("Editor's Request")).toBeVisible();
        await expect(reminderModal.getByText('Response Due Date')).toBeVisible();
        await expect(reminderModal.getByText('Review Due Date')).toBeVisible();
        await reminderModal
            .locator('form#sendReminderForm')
            .getByRole('button', {name: 'Send Reminder', exact: true})
            .click();

        // Notice, reminder email, and the History "Reminder" milestone
        // (checked before any reviewer response — its survival is A15).
        await expect(notice(managerPage, 'Notification sent.')).toBeVisible({timeout: 30_000});
        await expect(reminderModal.locator('form#sendReminderForm')).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        await pkpMail.find({
            to: `${overdueReviewer}@mail.test`,
            subject: 'A reminder to please complete your review',
        });

        await clickRowAction(managerPage, row, 'History');
        const historyModal = managerPage
            .getByRole('dialog')
            .filter({has: managerPage.locator('.pkp_review_history')});
        await expect(historyModal.getByRole('heading', {name: 'History'})).toBeVisible({timeout: 30_000});
        await expect(historyLine(historyModal, 'Request Sent')).toHaveText(/Request Sent:\s*\d{4}-\d{2}-\d{2}/);
        await expect(historyLine(historyModal, 'Reviewer Reminded')).toHaveText(/Reviewer Reminded:\s*\d{4}-\d{2}-\d{2}/);
        await closeSideWindow(historyModal);

        // The overdue review: the accepted reviewer's row reads "Overdue" in
        // red with "Review due: {date}" and its button "Send Reminder"; this
        // time the window's "Review Schedule" reads "Editor's Request",
        // "Review Acceptance Date" and "Review Due Date" (no "Response Due
        // Date"); sending shows "Notification sent." and the accepted
        // reviewer's mailbox holds the reminder.
        await expect(statusTitle(acceptedRow)).toHaveText('Overdue');
        await expect(statusTitle(acceptedRow)).toHaveClass(/text-negative/);
        await expect(acceptedRow).toContainText(`Review due: ${ymd(daysFromNow(-1))}`);
        const acceptedReminder = await openSendReminder(managerPage, acceptedRow);
        await expect(acceptedReminder.locator('input[name="reviewerName"]')).toHaveValue(
            new RegExp(`${acceptedReviewer}.*${acceptedReviewer}@mail\\.test`)
        );
        await expect(reviewScheduleLabels(acceptedReminder)).toHaveText([
            "Editor's Request",
            'Review Acceptance Date',
            'Review Due Date',
        ]);
        await expect(acceptedReminder.locator('form#sendReminderForm').getByText('Response Due Date')).toHaveCount(0);
        // The first reminder's notice has expired before the second is read.
        await expect(toasts(managerPage)).toHaveText('', {timeout: 30_000});
        await submitSendReminder(managerPage, acceptedReminder);
        await expect(notice(managerPage, 'Notification sent.')).toBeVisible({timeout: 30_000});
        await pkpMail.find({
            to: `${acceptedReviewer}@mail.test`,
            subject: 'A reminder to please complete your review',
        });

        // "Email Reviewer" on the on-schedule row: "To" shows the reviewer's
        // name; the typed subject and body reach their mailbox.
        const controlRow = workflow.panelRow('Reviewers', onTimeReviewer);
        await expect(controlRow).toBeVisible();
        await clickRowAction(managerPage, controlRow, 'Email Reviewer');
        const emailModal = legacyModal(managerPage, 'emailReviewerForm');
        await expect(emailModal.locator('input[name="user"]')).toHaveValue(new RegExp(onTimeReviewer), {
            timeout: 30_000,
        });
        await emailModal.locator('input[name="subject"]').fill('A question about your review');
        await typeRichText(managerPage, 'message', '<p>Will you meet the review date?</p>');
        await emailModal.getByRole('button', {name: 'Send Email', exact: true}).click();
        await expect(emailModal.locator('form#emailReviewerForm')).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        await pkpMail.find({
            to: `${onTimeReviewer}@mail.test`,
            subject: 'A question about your review',
            contains: 'Will you meet the review date?',
        });

        // Control: the on-schedule row, reading "Request Sent", offers no
        // "Send Reminder" button.
        await expect(controlRow).toContainText('Request Sent');
        await expect(controlRow.getByRole('button', {name: 'More Actions'})).toBeVisible();
        await expect(controlRow.getByRole('button', {name: 'Send Reminder', exact: true})).toHaveCount(0);
    });

    test('S8: log a response on the reviewer\'s behalf', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'invited'}],
        });

        const editorPage = await (await asUser('sectioneditor.ana')).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', 'Julia Reviewer');
        await expect(row).toBeVisible();

        await clickRowAction(editorPage, row, 'Log Response');
        const logModal = editorPage
            .getByRole('dialog')
            .filter({hasText: 'Record the response on behalf of the reviewer'});
        await expect(logModal).toBeVisible({timeout: 30_000});
        await logModal
            .getByRole('radio', {name: 'Reviewer has accepted the invitation to review'})
            .check();
        await logModal.getByRole('button', {name: 'Log Response', exact: true}).click();
        await expect(logModal).toBeHidden({timeout: 30_000});

        // The row reads "Request Accepted" with the review due date.
        await editorPage.reload();
        await workflow.expectOpen();
        await expect(row).toContainText('Request Accepted');
        // Seeded review due = today + the journal's review weeks (4 on the
        // baseline journal) — the Add Reviewer form's own arithmetic.
        await expect(row).toContainText(`Review due: ${ymd(daysFromNow(4 * 7))}`);

        // Control: "Log Response" is gone from the menu (bounded by the
        // always-offered "Email Reviewer" in the same menu).
        const menu = await openRowMenu(editorPage, row);
        await expect(menu.getByRole('menuitem', {name: 'Email Reviewer'})).toBeVisible();
        await expect(menu.getByRole('menuitem', {name: 'Log Response'})).toHaveCount(0);
    });

    test('S9: read, rate, mark complete, thank — and take it back', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(540_000);
        const tag = makeTag('s9', testInfo);
        const manager = `mgr${tag}`;
        const author = `au${tag}`;
        const reviewer = `rev${tag}`;
        const unanswered = `revb${tag}`;
        const title = `Submission ${tag}`;
        const formTitle = `Form ${tag}`;
        // Scratch journal: private toast queue + throwaway thank-you mailbox,
        // and an active review form for the Edit window's select.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer']},
                {username: unanswered, roles: ['externalReviewer']},
            ],
            reviewForms: [{title: formTitle, elements: [{question: `Question ${tag}`, type: 'textarea'}]}],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [
                {username: reviewer, status: 'accepted'},
                {username: unanswered, status: 'invited'},
            ],
        });

        // The reviewer's Tasks panel holds "Review pending." (the control
        // for its disappearance below), then they submit a review with both
        // comment blocks.
        const reviewerPage = await (await asUser(reviewer)).newPage();
        await reviewerPage.goto(`/index.php/${tag}/dashboard/reviewAssignments`);
        const before = await openTaskRows(reviewerPage, REVIEW_PENDING, title);
        await expect(before.rows.first()).toBeVisible({timeout: 30_000});
        await before.tasks.close();
        await performReview(reviewerPage, tag, submissionId, {
            comments: `Shared comment ${tag}`,
            privateComments: `Private remark ${tag}`,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', reviewer);
        await expect(row).toContainText('Review Submitted');

        // Read Review: the "Review Details: {title}" window opens (merely
        // opening it marks the row "Review Viewed" — asserted below the
        // moment the window closes, without a reload; the open window
        // aria-hides the table behind it, so role locators cannot reach the
        // row until then). It shows "Review Submitted: {date and time}" and
        // the comments split into their two headed blocks.
        const readModal = await openReviewDetails(managerPage, row);
        await expect(managerPage.getByRole('dialog', {name: `Review Details: ${title}`})).toBeVisible();
        await awaitReviewDetailsSettled(readModal);
        const submittedLine = readModal.getByRole('heading', {name: 'Review Submitted:'}).locator('xpath=..');
        await expect(submittedLine).toHaveText(/Review Submitted:\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2} [AP]M/);
        await expect(readModal.getByText('For author and editor')).toBeVisible({timeout: 30_000});
        await expect(readModal.getByText(`Shared comment ${tag}`)).toBeVisible();
        await expect(readModal.getByRole('heading', {name: 'For editor', exact: true})).toBeVisible();
        await expect(readModal.getByText(`Private remark ${tag}`)).toBeVisible();

        // Once the window has settled, a star click saves immediately with
        // its toast (rateReview waits out A21's race on observable outcomes,
        // never a timer).
        await rateReview(managerPage, readModal, 5);

        // Opening marked the row "Review Viewed" at once — it reads so as
        // soon as the window closes, before any reload — and it stays after
        // one. The rating persists across close and reopen.
        await closeReviewDetails(managerPage, readModal);
        await expect(row).toContainText('Review Viewed');
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(row).toContainText('Review Viewed');
        const reopenedModal = await openReviewDetails(managerPage, row);
        await awaitReviewDetailsSettled(reopenedModal);
        await expect(reopenedModal.locator('input[name="quality"][value="5"]')).toBeChecked();
        await closeReviewDetails(managerPage, reopenedModal);

        // "Edit" after submission: the window offers no "Review Form" select
        // (the visibility box is the same window's positive read).
        const editAfter = await openEditReview(managerPage, row);
        await expect(editAfter.locator('select[name="reviewFormId"]')).toHaveCount(0);
        await closeSideWindow(editAfter);

        // Mark as Complete (via its confirm dialog): in the still-open window
        // the button is disabled and "Modify Review" stays available; the
        // row reads "Complete" with "Thank Reviewer" and "Revert Decision"
        // once the window closes, no reload.
        const completeModal = await openReviewDetails(managerPage, row);
        await markReviewComplete(managerPage, completeModal);
        await expect(completeModal.getByRole('button', {name: 'Mark as Complete', exact: true})).toBeDisabled();
        await expect(completeModal.getByRole('button', {name: 'Modify Review', exact: true})).toBeEnabled();
        await closeReviewDetails(managerPage, completeModal);
        await expect(row).toContainText('Complete');
        await expect(row.getByRole('button', {name: 'Thank Reviewer', exact: true})).toBeVisible();
        await expect(row.getByRole('button', {name: 'Revert Decision', exact: true})).toBeVisible();

        // Review Details on "Complete": "More Actions" › "Review Details";
        // the dated line reads "Review Completed: {date and time}".
        const completedDetails = await openReviewDetailsFromMenu(managerPage, row);
        await expect(datedLine(completedDetails, 'Review Completed')).toHaveText(
            new RegExp(`^Review Completed:\\s*${DATE_TIME}$`)
        );
        await closeReviewDetails(managerPage, completedDetails);

        // The reviewer's side: the Tasks panel no longer holds "Review
        // pending." for the submission (read the same way as the control
        // above). Editor: the activity log records the completion.
        await reviewerPage.goto(`/index.php/${tag}/dashboard/reviewAssignments`);
        const afterComplete = await openTaskRows(reviewerPage, REVIEW_PENDING, title);
        await expect(afterComplete.rows).toHaveCount(0);
        await afterComplete.tasks.close();
        const log = await openActivityLog(managerPage);
        await expect(
            log.getByRole('row').filter({
                hasText: `Editor ${manager} has confirmed a review for the round 1 review for submission ${submissionId}.`,
            })
        ).toBeVisible();
        await closeSideWindow(log);

        // Thank the reviewer.
        await row.getByRole('button', {name: 'Thank Reviewer', exact: true}).click();
        const thankModal = legacyModal(managerPage, 'sendThankYouForm');
        await expect(thankModal.locator('form#sendThankYouForm')).toBeVisible({timeout: 30_000});
        await thankModal
            .locator('form#sendThankYouForm')
            .getByRole('button', {name: 'Thank Reviewer', exact: true})
            .click();
        await expect(toasts(managerPage).getByText('Thank you email sent to reviewer.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(thankModal.locator('form#sendThankYouForm')).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(row).toContainText('Reviewer Thanked');
        await pkpMail.find({to: `${reviewer}@mail.test`, subject: 'Thank you for your review'});

        // The row's "History" lists the five dated milestones, each "{label}: {date}".
        await clickRowAction(managerPage, row, 'History');
        const historyModal = managerPage
            .getByRole('dialog')
            .filter({has: managerPage.locator('.pkp_review_history')});
        await expect(historyModal.getByRole('heading', {name: 'History'})).toBeVisible({timeout: 30_000});
        for (const label of ['Request Sent', 'Request Accepted', 'Review Submitted', 'Review Completed', 'Reviewer Thanked']) {
            await expect(historyLine(historyModal, label)).toHaveText(new RegExp(`${label}:\\s*\\d{4}-\\d{2}-\\d{2}`));
        }
        const thankedInHistory = (await historyLine(historyModal, 'Reviewer Thanked').innerText())
            .replace(/\s+/g, ' ')
            .trim();
        await closeSideWindow(historyModal);

        // Review Details on "Reviewer Thanked": the dated line reads
        // "Reviewer Thanked: {date and time}", noted for the re-completion.
        const thankedDetails = await openReviewDetailsFromMenu(managerPage, row);
        const thankedLine = datedLine(thankedDetails, 'Reviewer Thanked');
        await expect(thankedLine).toHaveText(new RegExp(`^Reviewer Thanked:\\s*${DATE_TIME}$`));
        const thankedAt = (await thankedLine.innerText()).replace(/\s+/g, ' ').trim();
        await closeReviewDetails(managerPage, thankedDetails);

        // Revert Decision → "Unconsider this Review" → "Review Viewed" with no
        // notice (the toast area is empty once the row has changed; the
        // thank-you notice above was read the same way); the comments are
        // unchanged and the activity log records the revert.
        await row.getByRole('button', {name: 'Revert Decision', exact: true}).click();
        const revertDialog = managerPage
            .getByRole('dialog')
            .filter({hasText: 'Unconsider this Review'});
        await expect(revertDialog).toBeVisible({timeout: 30_000});
        await revertDialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(revertDialog).toBeHidden({timeout: 30_000});
        await expect(row).toContainText('Review Viewed', {timeout: 30_000});
        await expect(toasts(managerPage)).toHaveText('');
        const revertedModal = await openReviewDetails(managerPage, row);
        await expect(revertedModal.getByText(`Shared comment ${tag}`)).toBeVisible({timeout: 30_000});
        await expect(revertedModal.getByText(`Private remark ${tag}`)).toBeVisible();
        await expect(datedLine(revertedModal, 'Review Submitted')).toHaveText(
            new RegExp(`^Review Submitted:\\s*${DATE_TIME}$`)
        );
        await closeReviewDetails(managerPage, revertedModal);
        const log2 = await openActivityLog(managerPage);
        await expect(
            log2.getByRole('row').filter({
                hasText: `${manager} has marked the round 1 review for submission ${submissionId} as unconsidered.`,
            })
        ).toBeVisible();
        await closeSideWindow(log2);

        // The row's "History" ends at "Review Submitted": no "Review
        // Completed" and no "Reviewer Thanked" line (both read above, before
        // the revert).
        const revertedHistory = await openReviewHistory(managerPage, row);
        await expect(historyLine(revertedHistory, 'Review Submitted')).toBeVisible();
        const afterRevert = await historyLines(revertedHistory);
        expect(afterRevert.map((line) => line.split(':')[0])).toEqual([
            'Request Sent',
            'Request Accepted',
            'Review Submitted',
        ]);
        await closeSideWindow(revertedHistory);

        // Marked complete again: the row reads "Reviewer Thanked" at once and
        // offers "Revert Decision" alone, no "Thank Reviewer"; Review Details
        // names the first thank and its noted date, and History lists that
        // "Reviewer Thanked" date again, followed by the new "Review
        // Completed" one.
        const againModal = await openReviewDetails(managerPage, row);
        await markReviewComplete(managerPage, againModal);
        await closeReviewDetails(managerPage, againModal);
        await expect(statusTitle(row)).toHaveText('Reviewer Thanked', {timeout: 30_000});
        await expect(row.getByRole('button', {name: 'Revert Decision', exact: true})).toBeVisible();
        await expect(row.getByRole('button', {name: 'Thank Reviewer', exact: true})).toHaveCount(0);
        const againDetails = await openReviewDetailsFromMenu(managerPage, row);
        await expect(datedLine(againDetails, 'Reviewer Thanked')).toHaveText(thankedAt);
        await closeReviewDetails(managerPage, againDetails);
        const againHistory = await openReviewHistory(managerPage, row);
        await expect(historyLine(againHistory, 'Review Completed')).toBeVisible();
        const afterAgain = await historyLines(againHistory);
        expect(afterAgain.map((line) => line.split(':')[0])).toEqual([
            'Request Sent',
            'Request Accepted',
            'Review Submitted',
            'Reviewer Thanked',
            'Review Completed',
        ]);
        expect(afterAgain[3]).toBe(thankedInHistory);
        await closeSideWindow(againHistory);

        // The unanswered row: the second reviewer's row has no "Actions"
        // button (the thanked row's "Revert Decision" is the same cell's
        // positive read), and its "Edit" still offers the "Review Form"
        // select.
        const unansweredRow = workflow.panelRow('Reviewers', unanswered);
        await expect(unansweredRow).toContainText('Request Sent');
        // (The name column is a row header, so the "Actions" cell is the
        // third cell.)
        await expect(row.getByRole('cell').nth(2).getByRole('button')).toHaveCount(1);
        await expect(unansweredRow.getByRole('cell').nth(2).getByRole('button')).toHaveCount(0);
        const editUnanswered = await openEditReview(managerPage, unansweredRow);
        const formSelect = editUnanswered.locator('select[name="reviewFormId"]');
        await expect(formSelect).toBeVisible();
        await expect(formSelect.locator('option', {hasText: formTitle})).toHaveCount(1);
        await closeSideWindow(editUnanswered);

        // Review Details on the unanswered request: "More Actions" ›
        // "Review Details"; the dated line reads "Request Sent: {date and
        // time}" and "Mark as Complete" sits disabled beside the incomplete
        // message ("Modify Review", enabled, is the same footer's positive
        // read). "Cancel": the row still reads "Request Sent".
        const unansweredDetails = await openReviewDetailsFromMenu(managerPage, unansweredRow);
        await expect(datedLine(unansweredDetails, 'Request Sent')).toHaveText(
            new RegExp(`^Request Sent:\\s*${DATE_TIME}$`)
        );
        await expect(unansweredDetails.getByRole('button', {name: 'Modify Review', exact: true})).toBeEnabled();
        await expect(unansweredDetails.getByRole('button', {name: 'Mark as Complete', exact: true})).toBeDisabled();
        await expect(
            unansweredDetails.getByText('This review is incomplete and cannot be marked as complete yet.')
        ).toBeVisible();
        await closeReviewDetails(managerPage, unansweredDetails);
        await expect(statusTitle(unansweredRow)).toHaveText('Request Sent');

        // The second reviewer's review: signed in, their request for the
        // submission still offers "Respond to request"; they accept the
        // request and submit; the Editor reads that row as "Review
        // Submitted".
        const secondPage = await (await asUser(unanswered)).newPage();
        const secondList = new ReviewerAssignmentsPage(secondPage, tag);
        await secondList.goto();
        await expect(secondList.rowAction(secondList.row(title), 'Respond to request')).toBeVisible();
        await performReview(secondPage, tag, submissionId, {
            comments: `Second comment ${tag}`,
        });
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(unansweredRow).toContainText('Review Submitted');

        // "Revert Decision" on "Complete": Read Review, Mark as Complete and
        // confirm: the row reads "Complete"; Revert Decision and confirm
        // "Unconsider this Review": the row returns to "Review Submitted"
        // with no notice (the toast area, empty once the complete notice has
        // expired, stays empty as the row changes), and Read Review shows
        // the comments unchanged.
        const completeSecond = await openReviewDetails(managerPage, unansweredRow);
        await markReviewComplete(managerPage, completeSecond);
        await closeReviewDetails(managerPage, completeSecond);
        await expect(statusTitle(unansweredRow)).toHaveText('Complete');
        await expect(toasts(managerPage)).toHaveText('', {timeout: 30_000});
        await revertReviewDecision(managerPage, unansweredRow);
        await expect(statusTitle(unansweredRow)).toHaveText('Review Submitted', {timeout: 30_000});
        await expect(toasts(managerPage)).toHaveText('');
        const revertedSecond = await openReviewDetails(managerPage, unansweredRow);
        await expect(revertedSecond.getByText(`Second comment ${tag}`)).toBeVisible({timeout: 30_000});
        await closeReviewDetails(managerPage, revertedSecond);

        // Read Review, Mark as Complete and confirm: the row reads "Complete"
        // and offers "Thank Reviewer".
        const secondModal = await openReviewDetails(managerPage, unansweredRow);
        await markReviewComplete(managerPage, secondModal);
        await closeReviewDetails(managerPage, secondModal);
        await expect(statusTitle(unansweredRow)).toHaveText('Complete');
        await expect(unansweredRow.getByRole('button', {name: 'Thank Reviewer', exact: true})).toBeVisible();
        await unansweredRow.getByRole('button', {name: 'Thank Reviewer', exact: true}).click();
        const thankModal2 = legacyModal(managerPage, 'sendThankYouForm');
        await expect(thankModal2.locator('form#sendThankYouForm')).toBeVisible({timeout: 30_000});
        await waitForLegacyFormSettled(managerPage, thankModal2);

        // "Close" in "Thank Reviewer": "Many thanks." typed at the end of the
        // message and "Do not send email to Reviewer." ticked; "Close" asks
        // first, and "Cancel" keeps the window with the changed message.
        const thankMessage = thankModal2.frameLocator('iframe').first().locator('body');
        await expect(thankMessage).not.toBeEmpty({timeout: 30_000});
        await thankMessage.click();
        await managerPage.keyboard.press('Control+End');
        await managerPage.keyboard.type(' Many thanks.');
        await thankModal2.locator('input[name="skipEmail"]').check();
        expect(await closeWindowAsking(managerPage, thankModal2, {answer: 'dismiss'})).toBe(FORM_CHANGED);
        await expect(thankModal2.locator('form#sendThankYouForm')).toBeVisible();
        await expect(thankMessage).toContainText('Many thanks.');
        await expect(thankModal2.locator('input[name="skipEmail"]')).toBeChecked();

        // Thank without email: with the box ticked, "Thank Reviewer" in the
        // window; the notice says so and the row reads "Reviewer Thanked".
        await thankModal2
            .locator('form#sendThankYouForm')
            .getByRole('button', {name: 'Thank Reviewer', exact: true})
            .click();
        await expect(
            toasts(managerPage).getByText('Review marked as acknowledged. Email not sent.')
        ).toBeVisible({timeout: 30_000});
        await expect(thankModal2.locator('form#sendThankYouForm')).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(unansweredRow).toContainText('Reviewer Thanked');

        // Control: the second reviewer's mailbox holds no thank-you while the
        // first reviewer's holds one (read the same way; the skip thank's
        // own response bounds the silence).
        await pkpMail.find({to: `${reviewer}@mail.test`, subject: 'Thank you for your review'});
        expect(await pkpMail.count({to: `${reviewer}@mail.test`, subject: 'Thank you for your review'})).toBe(1);
        expect(await pkpMail.count({to: `${unanswered}@mail.test`, subject: 'Thank you for your review'})).toBe(0);
        expect(await pkpMail.count({to: `${unanswered}@mail.test`, contains: 'Thank you'})).toBe(0);
    });

    test('S10: download the review', async ({asUser, browser, baseURL, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s10', testInfo);
        const editor = `mgr${tag}`;
        const author = `au${tag}`;
        const freeReviewer = {username: `rev${tag}`, givenName: 'Noor', familyName: `Noform${tag}`};
        const formReviewer = {username: `revb${tag}`, givenName: 'Fay', familyName: `Formed${tag}`};
        const freeName = `${freeReviewer.givenName} ${freeReviewer.familyName}`;
        const formName = `${formReviewer.givenName} ${formReviewer.familyName}`;
        const title = `Submission ${tag}`;
        const formTitle = `Form ${tag}`;
        const STRENGTHS = 'A clear argument.';
        const CONCERNS = 'Check the sample size.';
        // Scratch journal with an active review form of two text questions,
        // "Strengths" included in the message to the author, "Concerns" not.
        await ojsApi.createContext({
            tag,
            users: [
                {username: editor, roles: ['manager']},
                {username: author, roles: ['author']},
                {...freeReviewer, roles: ['externalReviewer']},
                {...formReviewer, roles: ['externalReviewer']},
            ],
            reviewForms: [{
                title: formTitle,
                elements: [
                    {question: 'Strengths', type: 'smalltextfield'},
                    {question: 'Concerns', type: 'smalltextfield', included: false},
                ],
            }],
        });
        // Both reviewers accepted and submitting on their own screens: the
        // first without a form, with both comment blocks (a `completed` seed
        // carries the author-and-editor block only); the second on the form,
        // answering both questions (a `completed` seed on a form saves no
        // answers, A56).
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [
                {username: freeReviewer.username, status: 'accepted'},
                {username: formReviewer.username, status: 'accepted', reviewForm: formTitle},
            ],
        });

        const freePage = await (await asUser(freeReviewer.username)).newPage();
        await performReview(freePage, tag, submissionId, {
            comments: `Shared comment ${tag}`,
            privateComments: `Private remark ${tag}`,
        });

        const formPage = await (await asUser(formReviewer.username)).newPage();
        const wizard = new ReviewWizardPage(formPage, tag);
        await wizard.goto(submissionId);
        await wizard.expectStep(1);
        await wizard.saveAndContinueButton.click();
        await wizard.expectStep(2);
        await wizard.continueToStep3();
        await expect(wizard.step3Form.getByRole('heading', {name: formTitle})).toBeVisible();
        await formAnswerBox(wizard, 'Strengths').fill(STRENGTHS);
        await formAnswerBox(wizard, 'Concerns').fill(CONCERNS);
        await wizard.chooseRecommendation('Accept Submission');
        await wizard.submitReview();
        await wizard.expectCompleted();

        const editorPage = await (await asUser(editor)).newPage();
        const workflow = new WorkflowPage(editorPage, tag);
        await workflow.gotoEditorial(submissionId);
        const freeRow = workflow.panelRow('Reviewers', freeName);
        const formRow = workflow.panelRow('Reviewers', formName);
        await expect(freeRow).toContainText('Review Submitted');
        await expect(formRow).toContainText('Review Submitted');

        /**
         * Open the window's "Download Review Form" menu, press one entry and
         * return the file, after the export's own answer (a refused export
         * opens an "Error" window and sends no file; waiting on the answer
         * first keeps a refusal from costing the download timeout).
         */
        async function downloadExport(modal, label) {
            await modal.getByRole('button', {name: 'Download Review Form'}).click();
            const item = editorPage.getByRole('menuitem', {name: label, exact: true});
            await expect(item).toBeVisible({timeout: 30_000});
            const answer = editorPage.waitForResponse((r) =>
                /\/reviews\/\d+\/\d+\/export-(pdf|xml)/.test(r.url())
            );
            const download = editorPage.waitForEvent('download');
            await item.click();
            expect((await answer).status(), `${label} answers`).toBe(200);
            return download;
        }

        // The first review's window: both PDFs download.
        const freeModal = await openReviewDetails(editorPage, freeRow);
        await awaitReviewDetailsSettled(freeModal);
        await expect(freeModal.getByText(`Shared comment ${tag}`)).toBeVisible();
        await expect(freeModal.getByText(`Private remark ${tag}`)).toBeVisible();
        const pdfs = {};
        for (const label of [
            'Author-Only Sections Displayed (PDF)',
            'Editor Form Shows All Review Sections (PDF)',
        ]) {
            const download = await downloadExport(freeModal, label);
            expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
            pdfs[label] = await pdfText(browser, baseURL, await download.path());
        }

        // The author-only file omits the editor-only remarks and shows the
        // reviewer anonymized ("Reviewer: {letter}"), with the author-facing
        // block as its positive read.
        const authorPdf = pdfs['Author-Only Sections Displayed (PDF)'];
        expect(squeezed(authorPdf)).toContain(squeezed(`Shared comment ${tag}`));
        expect(squeezed(authorPdf)).not.toContain(squeezed(`Private remark ${tag}`));
        expect(authorPdf).toMatch(/Reviewer:\s*[A-Z]\b/);
        expect(squeezed(authorPdf)).not.toContain(squeezed(freeReviewer.familyName));

        // Control: the full PDF carries both comment blocks and the
        // reviewer's name.
        const editorPdf = pdfs['Editor Form Shows All Review Sections (PDF)'];
        expect(squeezed(editorPdf)).toContain(squeezed(`Shared comment ${tag}`));
        expect(squeezed(editorPdf)).toContain(squeezed(`Private remark ${tag}`));
        expect(squeezed(editorPdf)).toContain(squeezed(`Reviewer: ${freeName}`));

        // The review form's XML files: "Cancel", then the second reviewer's
        // "Read Review"; both XML entries download (after the first
        // review's PDFs, A49; this review's PDF entries are never pressed,
        // A55). The author-only file lists "Strengths" with its answer and
        // leaves out "Concerns"; the full file lists both with their
        // answers.
        await closeReviewDetails(editorPage, freeModal);
        const formModal = await openReviewDetails(editorPage, formRow);
        await awaitReviewDetailsSettled(formModal);
        await expect(formModal.getByText(STRENGTHS)).toBeVisible();
        const xmlOf = async (label) => {
            const download = await downloadExport(formModal, label);
            expect(download.suggestedFilename()).toMatch(/\.xml$/i);
            return fs.readFileSync(await download.path(), 'utf8');
        };
        const formItem = (question, answer) =>
            new RegExp(`<meta-name>${question}</meta-name>\\s*<meta-value>${answer.replace('.', '\\.')}</meta-value>`);
        const authorXml = await xmlOf('Author-Only Sections Displayed (XML)');
        expect(authorXml).toMatch(formItem('Strengths', STRENGTHS));
        expect(authorXml).not.toContain('Concerns');
        expect(authorXml).not.toContain(CONCERNS);
        const editorXml = await xmlOf('Editor Form Shows All Review Sections (XML)');
        expect(editorXml).toMatch(formItem('Strengths', STRENGTHS));
        expect(editorXml).toMatch(formItem('Concerns', CONCERNS));
    });

    test('S11: unassign before, cancel after, reinstate', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s11', testInfo);
        const manager = `mgr${tag}`;
        const author = `au${tag}`;
        const unanswered = `rev${tag}`;
        const accepted = `revb${tag}`;
        const title = `Submission ${tag}`;
        // Scratch journal: private toast queue + throwaway notice mailboxes.
        // The accepted reviewer also holds Funding Coordinator and sits on
        // the stage's Participants panel as one.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: unanswered, roles: ['externalReviewer']},
                {username: accepted, roles: ['externalReviewer', 'funding']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [
                {username: unanswered, status: 'invited'},
                {username: accepted, status: 'accepted'},
            ],
            participants: [{username: accepted, role: 'funding'}],
        });

        // The unanswered reviewer's Tasks panel holds "Review pending." (the
        // control for its disappearance).
        const reviewerPage = await (await asUser(unanswered)).newPage();
        await reviewerPage.goto(`/index.php/${tag}/dashboard/reviewAssignments`);
        const before = await openTaskRows(reviewerPage, REVIEW_PENDING, title);
        await expect(before.rows.first()).toBeVisible({timeout: 30_000});
        await before.tasks.close();

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const unansweredRow = workflow.panelRow('Reviewers', unanswered);
        const acceptedRow = workflow.panelRow('Reviewers', accepted);
        await expect(unansweredRow).toBeVisible();
        await expect(acceptedRow).toBeVisible();

        // Before a response the entry reads "Unassign Reviewer"; the window
        // shows the chooser above the notice and the skip box; removing
        // deletes the row outright.
        await clickRowAction(managerPage, unansweredRow, 'Unassign Reviewer');
        const unassignModal = legacyModal(managerPage, 'unassignReviewerForm');
        await expect(unassignModal.getByText('Choose a predefined message to use')).toBeVisible({
            timeout: 30_000,
        });
        await expect(unassignModal.locator('select[name="template"]')).toBeVisible();
        await expect(unassignModal.locator('.tox-tinymce')).toHaveCount(1, {timeout: 30_000});
        await expect(unassignModal.locator('input[name="skipEmail"]')).toBeVisible();
        await unassignModal
            .locator('form#unassignReviewerForm')
            .getByRole('button', {name: 'Unassign Reviewer', exact: true})
            .click();
        await expect(notice(managerPage, 'Reviewer removed.')).toBeVisible({timeout: 30_000});
        await expect(unassignModal.locator('form#unassignReviewerForm')).toBeHidden({
            timeout: 30_000,
        });
        await waitForJQueryIdle(managerPage);
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(acceptedRow).toBeVisible();
        await expect(unansweredRow).toHaveCount(0);

        // The unassigned reviewer's side: the removal notice, and no "Review
        // pending." task any more (read the same way as the control above).
        // (The notice's subject is finding T-ojs-4 in
        // .reports/U27/test-ojs-findings.md — asserted neither way; the
        // arrival is read by the throwaway recipient and the title.)
        await pkpMail.find({to: `${unanswered}@mail.test`, contains: title});
        await reviewerPage.goto(`/index.php/${tag}/dashboard/reviewAssignments`);
        const after = await openTaskRows(reviewerPage, REVIEW_PENDING, title);
        await expect(after.rows).toHaveCount(0);
        await after.tasks.close();

        // After a response the same entry reads "Cancel Reviewer" (the
        // notice "Reviewer cancelled."); the row stays as "Request Cancelled" (with its hover text), the menu offers
        // "Reinstate Reviewer" in place of the first three entries, and the
        // mailbox holds the cancel notice.
        await clickRowAction(managerPage, acceptedRow, 'Cancel Reviewer');
        const cancelModal = legacyModal(managerPage, 'cancelReviewForm');
        await expect(cancelModal.locator('select[name="template"]')).toBeVisible({timeout: 30_000});
        await expect(cancelModal.locator('.tox-tinymce')).toHaveCount(1, {timeout: 30_000});
        await cancelModal
            .locator('form#cancelReviewForm')
            .getByRole('button', {name: 'Cancel Reviewer', exact: true})
            .click();
        await expect(cancelModal.locator('form#cancelReviewForm')).toBeHidden({
            timeout: 30_000,
        });
        await expect(
            managerPage.locator('.app__notifications .pkpNotification').filter({hasText: 'Reviewer cancelled.'})
        ).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(statusTitle(acceptedRow)).toHaveText('Request Cancelled');
        await expect(statusTitle(acceptedRow)).toHaveAttribute('title', 'The editor cancelled this review request.');
        const cancelledMenu = await openRowMenu(managerPage, acceptedRow);
        await expect(cancelledMenu.getByRole('menuitem', {name: 'Reinstate Reviewer'})).toBeVisible();
        await expect(cancelledMenu.getByRole('menuitem', {name: 'Email Reviewer'})).toBeVisible();
        await expect(cancelledMenu.getByRole('menuitem', {name: 'Review Details'})).toHaveCount(0);
        await expect(cancelledMenu.getByRole('menuitem', {name: 'Edit', exact: true})).toHaveCount(0);
        await expect(cancelledMenu.getByRole('menuitem', {name: 'Cancel Reviewer'})).toHaveCount(0);
        await closeRowMenu(managerPage, acceptedRow);
        await pkpMail.find({to: `${accepted}@mail.test`, subject: 'has been cancelled'});

        // Participants: the stage's panel still lists the cancelled reviewer
        // as a Funding Coordinator.
        const participant = managerPage
            .locator('li')
            .filter({has: workflow.participantMoreActions(accepted)})
            .first();
        await expect(participant).toBeVisible();
        await expect(participant).toContainText(/Funding coordinator/i);

        // Reinstate: the notice, the row back in the state its dates imply,
        // and the reinstate notice in the mailbox.
        await clickRowAction(managerPage, acceptedRow, 'Reinstate Reviewer');
        const reinstateModal = legacyModal(managerPage, 'reinstateReviewerForm');
        await reinstateModal
            .locator('form#reinstateReviewerForm')
            .getByRole('button', {name: 'Reinstate Reviewer', exact: true})
            .click();
        await expect(notice(managerPage, 'Reviewer reinstated.')).toBeVisible({timeout: 30_000});
        await expect(reinstateModal.locator('form#reinstateReviewerForm')).toBeHidden({
            timeout: 30_000,
        });
        await waitForJQueryIdle(managerPage);
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(acceptedRow).toContainText('Request Accepted');
        await pkpMail.find({to: `${accepted}@mail.test`, subject: 'Can you still review something'});

        // Control: the reinstated row's menu again offers "Review Details",
        // "Edit" and "Cancel Reviewer", with no "Reinstate Reviewer".
        const reinstatedMenu = await openRowMenu(managerPage, acceptedRow);
        await expect(reinstatedMenu.getByRole('menuitem', {name: 'Review Details'})).toBeVisible();
        await expect(reinstatedMenu.getByRole('menuitem', {name: 'Edit', exact: true})).toBeVisible();
        await expect(reinstatedMenu.getByRole('menuitem', {name: 'Cancel Reviewer'})).toBeVisible();
        await expect(reinstatedMenu.getByRole('menuitem', {name: 'Reinstate Reviewer'})).toHaveCount(0);
        await closeRowMenu(managerPage, acceptedRow);
    });

    test('S12: decline, then ask again', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s12', testInfo);
        const manager = `mgr${tag}`;
        const author = `au${tag}`;
        const reviewer = `rev${tag}`;
        // Scratch journal: the resend's notice needs a private toast queue.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [{username: reviewer, status: 'declined'}],
        });

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', reviewer);

        // The declined row: its title, hover text, and a menu offering
        // "Resend Review Request" and no "Log Response".
        await expect(statusTitle(row)).toHaveText('Request Declined');
        await expect(statusTitle(row)).toHaveAttribute('title', 'The reviewer declined this review request.');
        const declinedMenu = await openRowMenu(managerPage, row);
        await expect(declinedMenu.getByRole('menuitem', {name: 'Resend Review Request'})).toBeVisible();
        await expect(declinedMenu.getByRole('menuitem', {name: 'Log Response'})).toHaveCount(0);
        await closeRowMenu(managerPage, row);

        // "Resend Review Request": the message, the skip box and fresh date
        // pickers preset from their configured intervals (4 weeks each on a
        // scratch journal); the preset "Review Due Date" is noted.
        await clickRowAction(managerPage, row, 'Resend Review Request');
        const resendModal = legacyModal(managerPage, 'resendRequestReviewerForm');
        await expect(resendModal.locator('.tox-tinymce')).toHaveCount(1, {timeout: 30_000});
        await expect(resendModal.locator('input[name="skipEmail"]')).toBeVisible();
        await expect(dueDateValue(resendModal, 'responseDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));
        await expect(dueDateValue(resendModal, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));
        const presetReviewDue = daysFromNow(4 * 7);

        // Inverted dates: the review due date a week out, before the response
        // due date; "Resend Review Request" is refused with the notice at the
        // top right and the window stays open (the browser alert that comes
        // with it is register A46, asserted neither way; Playwright
        // dismisses it).
        await pickDate(managerPage, resendModal, 'reviewDueDate', daysFromNow(7));
        await resendModal
            .locator('form#resendRequestReviewerForm')
            .getByRole('button', {name: 'Resend Review Request', exact: true})
            .click();
        await expect(notice(managerPage, INVERTED_DATES_NOTICE)).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(managerPage);
        await expect(resendModal.locator('form#resendRequestReviewerForm')).toBeVisible();
        await waitForLegacyFormSettled(managerPage, resendModal);

        // The resend: "Review Due Date" set back to its preset date.
        await pickDate(managerPage, resendModal, 'reviewDueDate', presetReviewDue);
        await expect(dueDateValue(resendModal, 'reviewDueDate')).toHaveValue(ymd(presetReviewDue));
        await resendModal
            .locator('form#resendRequestReviewerForm')
            .getByRole('button', {name: 'Resend Review Request', exact: true})
            .click();
        await expect(
            notice(managerPage, 'Request to reconsider the review assignment was sent.')
        ).toBeVisible({timeout: 30_000});
        await expect(resendModal.locator('form#resendRequestReviewerForm')).toBeHidden({
            timeout: 30_000,
        });
        await waitForJQueryIdle(managerPage);

        // The row reads "Request Resent" (its second line's date is register
        // A2 — asserted neither way) and the request counts as unanswered
        // again: the menu re-offers "Unassign Reviewer" and "Log Response".
        await managerPage.reload();
        await workflow.expectOpen();
        await expect(statusTitle(row)).toHaveText('Request Resent');
        const resentMenu = await openRowMenu(managerPage, row);
        await expect(resentMenu.getByRole('menuitem', {name: 'Unassign Reviewer'})).toBeVisible();
        await expect(resentMenu.getByRole('menuitem', {name: 'Log Response'})).toBeVisible();
        await closeRowMenu(managerPage, row);

        // The reviewer's mailbox holds the reconsider request.
        await pkpMail.find({
            to: `${reviewer}@mail.test`,
            subject: 'Requesting your review again',
        });
    });

    test('S14: the recommendation runs through the table', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s14', testInfo);
        // A second Reviewer's review is seeded submitted and unread (fn s):
        // the dashboard's "View unread recommendation" opens it.
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [
                {username: 'reviewer.adam', status: 'accepted'},
                {username: 'reviewer.julia', status: 'completed', recommendation: 'pendingRevisions'},
            ],
        });

        const reviewerPage = await (await asUser('reviewer.adam')).newPage();
        await performReview(reviewerPage, JOURNAL, submissionId, {
            recommendation: 'Accept Submission',
        });

        const editorPage = await (await asUser('sectioneditor.ana')).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', 'Adam Reviewer');
        await expect(row).toContainText('Review Submitted');

        // The "Review Details" window displays the reviewer's recommendation
        // read-only — anchored on its "Recommendation:" info line (one of
        // A23's two displays; the duplication is not frozen). No editable
        // select exists here: changing it on the reviewer's behalf runs
        // through "Modify Review" (S16).
        const readModal = await openReviewDetails(editorPage, row);
        await awaitReviewDetailsSettled(readModal);
        const recommendationLine = readModal
            .getByText('Recommendation:', {exact: true})
            .locator('xpath=..');
        await expect(recommendationLine).toContainText('Accept Submission');
        await expect(readModal.locator('select[name="reviewerRecommendationId"]')).toHaveCount(0);

        // After "Mark as Complete", the "Complete" row's status cell shows
        // the reviewer's recommendation under the status.
        await markReviewComplete(editorPage, readModal);
        await closeReviewDetails(editorPage, readModal);
        await expect(row).toContainText('Complete');
        await expect(row).toContainText('Accept Submission');

        // The dashboard's "View unread recommendation": on the submissions
        // list, the second Reviewer's indicator in the submission's entry
        // opens a popover whose button opens the "Review Details: {title}"
        // window, the one the Reviewers panel opens, with that Reviewer's
        // recommendation on its "Recommendation:" line.
        const dash = new EditorialDashboardPage(editorPage, JOURNAL);
        await dash.goto();
        await dash.searchFor(tag);
        const entry = dash.row(tag);
        await expect(entry).toBeVisible({timeout: 30_000});
        const popover = await dash.openActivityPopoverFor(entry, /Review completed on/, 'Julia Reviewer');
        await popover.getByRole('button', {name: 'View unread recommendation', exact: true}).click();
        const dashModal = dash.reviewDetailsDialog();
        await expect(dashModal).toBeVisible({timeout: 30_000});
        await expect(dashModal).toHaveAccessibleName(`Review Details: Submission ${tag}`);
        await awaitReviewDetailsSettled(dashModal);
        await expect(dashModal).toContainText('Julia Reviewer');
        const dashRecommendation = dashModal
            .getByText('Recommendation:', {exact: true})
            .locator('xpath=..');
        await expect(dashRecommendation).toContainText('Revisions Required');
        await expect(dashRecommendation).not.toContainText('Accept Submission');
        await closeReviewDetails(editorPage, dashModal);
    });

    test('S16: the editor modifies a submitted review', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s16', testInfo);
        const manager = `mgr${tag}`;
        const editor = `ed${tag}`;
        const editorName = `Ed${tag} Editor`;
        const author = `au${tag}`;
        const reviewer = `rev${tag}`;
        const reviewerName = `Rev${tag} Reviewer`;
        const title = `Submission ${tag}`;
        const switchedOff = 'See Comments';
        const STALE_RECOMMENDATION = 'The submitted reviewer recommendation ID is not a valid for this Context.';
        // Scratch journal (footnote s): the Journal Manager switches off one
        // of its recommendations, a setting every test on publicknowledge
        // shares. The Reviewer submits on their own screen so the review
        // carries both comment blocks (a review seeded `completed` carries
        // the "For author and editor" block only), with the default
        // recommendation "Accept Submission".
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: `Mgr${tag}`, familyName: 'Manager', roles: ['manager']},
                {username: editor, givenName: `Ed${tag}`, familyName: 'Editor', roles: ['editor']},
                {username: author, roles: ['author']},
                {username: reviewer, givenName: `Rev${tag}`, familyName: 'Reviewer', roles: ['externalReviewer']},
            ],
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [{username: reviewer, status: 'accepted'}],
        });
        const reviewerPage = await (await asUser(reviewer)).newPage();
        await performReview(reviewerPage, tag, submissionId, {
            recommendation: 'Accept Submission',
            comments: `Original comment ${tag}`,
            privateComments: `Private remark ${tag}`,
        });

        const editorPage = await (await asUser(editor)).newPage();
        const workflow = new WorkflowPage(editorPage, tag);
        await workflow.gotoEditorial(submissionId);
        // The Journal Manager signs in in a second browser context, after
        // the Editor's workflow page has loaded (the page carries the
        // recommendation list the "Modify Review" window offers).
        const managerPage = await (await asUser(manager)).newPage();
        const settings = new ReviewSettingsPage(managerPage, tag);
        await settings.goto('Reviewer Recommendations');

        const row = workflow.panelRow('Reviewers', reviewerName);
        const readModal = await openReviewDetails(editorPage, row);
        await awaitReviewDetailsSettled(readModal);

        // "Modify Review" first asks for confirmation, naming the reviewer
        // and the activity log.
        await readModal.getByRole('button', {name: 'Modify Review', exact: true}).click();
        const confirmDialog = editorPage
            .locator('[data-cy="dialog"]')
            .filter({hasText: 'Modify this review?'});
        await expect(confirmDialog).toBeVisible({timeout: 30_000});
        await expect(confirmDialog).toContainText(
            `You are about to modify the review submitted by ${reviewerName}. ` +
                'All modifications will be recorded in the activity log.'
        );
        await confirmDialog.getByRole('button', {name: 'Modify Review', exact: true}).click();

        // The "Modify Review" window stacks over the view window, naming the
        // submission, with a "Submitted recommendation:" line.
        const editModal = editorPage.getByRole('dialog', {name: 'Modify Review'});
        await expect(editModal).toBeVisible({timeout: 30_000});
        await expect(editModal.getByText(title, {exact: true})).toBeVisible();
        await expect(editModal).toContainText(/Submitted recommendation:\s*Accept Submission/);

        // "Cancel": the "Modify Review" window closes and the view window
        // shows again (its "Modify Review" button back in reach); then
        // "Modify Review" is pressed and confirmed again.
        await cancelModifyReview(editorPage, editModal);
        await expect(readModal.getByText(`Original comment ${tag}`)).toBeVisible();
        await expect(readModal.getByRole('button', {name: 'Modify Review', exact: true})).toBeEnabled();
        await openModifyReview(editorPage, readModal);
        await expect(editModal).toBeVisible({timeout: 30_000});
        const select = modifyReviewRecommendation(editModal);
        const saveButton = modifyReviewSaveButton(editModal);
        await expect(select.locator('option:checked')).toHaveText('Accept Submission');

        // A recommendation switched off meanwhile {OJS}: the Journal Manager,
        // in the second browser, unticks "See Comments" (not the review's
        // own) on Settings › Workflow › Review › "Reviewer Recommendations".
        await settings.recommendations.deactivate(switchedOff);
        // Control: the review's own entry and the one saved below stay ticked.
        await expect(settings.recommendations.tick(settings.recommendations.row('Accept Submission'))).toBeChecked();
        await expect(settings.recommendations.tick(settings.recommendations.row('Revisions Required'))).toBeChecked();

        // Editor: the still-open window still lists it (beside the entries
        // still active, the positive control). Chosen and saved, the save
        // is refused: the page notice, the reason under "Recommendation",
        // the window's summary; the window stays open and "Save Changes"
        // stays disabled until a field changes.
        await expect(select.locator('option', {hasText: switchedOff})).toHaveCount(1);
        await expect(select.locator('option', {hasText: 'Revisions Required'})).toHaveCount(1);
        await select.selectOption({label: switchedOff});
        await expect(saveButton).toBeEnabled();
        const refused = await saveModifyReviewRefused(editorPage, editModal);
        expect(refused.status()).toBe(422);
        await expect(
            notice(
                editorPage,
                'The form was not saved because 1 error(s) were encountered. Please correct these errors and try again.'
            )
        ).toBeVisible({timeout: 30_000});
        await expect(recommendationSection(editModal).getByText(STALE_RECOMMENDATION, {exact: true})).toBeVisible();
        await expect(modifyReviewErrorSummary(editModal)).toHaveText(
            new RegExp(
                `^\\s*Please correct one error\\.\\s*Go to Recommendation: ${STALE_RECOMMENDATION.replace(/\./g, '\\.')}\\s*Jump to next error\\s*$`
            )
        );
        await expect(editModal).toBeVisible();
        await expect(saveButton).toBeDisabled();

        // "Save Changes": replace the "For author and editor" comment and
        // pick a different recommendation, not the one switched off (the
        // field change enables "Save Changes" again).
        const commentsEditorId = 'reviewDetailsForm-comments-control';
        await editorPage.waitForFunction(
            (id) => !!window.tinymce?.get(id)?.initialized,
            commentsEditorId,
            {timeout: 30_000}
        );
        await select.selectOption({label: 'Revisions Required'});
        await expect(saveButton).toBeEnabled();
        await editorPage.evaluate(
            ([id, value]) => {
                const editor = window.tinymce.get(id);
                editor.setContent(value);
                editor.fire('change');
            },
            [commentsEditorId, `<p>Modified comment ${tag}</p>`]
        );

        // Control: the "For editor" comment offers no edit control in either
        // window — the edit window's one TinyMCE instance is the shared
        // comment's, while the private remark renders display-only.
        await expect(editModal.getByText(`Private remark ${tag}`)).toBeVisible();
        await expect(editModal.locator('.tox-tinymce')).toHaveCount(1);

        // Save Changes: the edit window closes and the view window refreshes
        // with the attribution line and the edited values.
        await saveModifyReview(editorPage, editModal);
        await expect(readModal.getByText(`Last modified by ${editorName}`)).toBeVisible({timeout: 30_000});
        await expect(readModal.getByText(`Modified comment ${tag}`)).toBeVisible();
        await expect(readModal.getByText(`Private remark ${tag}`)).toBeVisible();
        await expect(readModal.locator('.tox-tinymce')).toHaveCount(0);
        const recommendationLine = readModal
            .getByText('Recommendation:', {exact: true})
            .locator('xpath=..');
        await expect(recommendationLine).toContainText('Revisions Required');
        await closeReviewDetails(editorPage, readModal);

        // The activity log lists both modification entries attributed to
        // the editor, one each (the refused save recorded nothing), the
        // Comments row's expander offering "View changes".
        await editorPage.getByRole('button', {name: 'Activity Log', exact: true}).click();
        const log = editorPage.getByRole('dialog').filter({hasText: 'Activity Log & Notes'});
        const commentsEntry = log
            .getByRole('row')
            .filter({hasText: 'The following was modified in this review: Comments.'});
        await expect(commentsEntry.first()).toBeVisible({timeout: 30_000});
        await expect(commentsEntry).toHaveCount(1);
        await expect(commentsEntry).toContainText(editorName);
        const recommendationEntry = log.getByRole('row').filter({
            hasText: 'The following was modified in this review: Reviewer Recommendation.',
        });
        await expect(recommendationEntry).toHaveCount(1);
        await expect(recommendationEntry).toContainText(editorName);
        await commentsEntry.locator('a.show_extras').click();
        await expect(log.getByRole('link', {name: 'View changes'})).toBeVisible({timeout: 30_000});
        await expect(log.getByRole('link', {name: 'View changes'})).toHaveCount(1);
    });

    test('S17: the Author sees no Reviewers panel', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s17', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'invited'}],
        });

        // The Author opens the submission from My Submissions: its review
        // stage has no "Reviewers" panel, no table, no "Add Reviewer" and no
        // reviewer identity anywhere (bounded by the stage page title and a
        // panel the author does get).
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorWorkflow = new WorkflowPage(authorPage, JOURNAL);
        await authorWorkflow.gotoAuthor(submissionId);
        await authorWorkflow.expectPageTitle('Review (Round 1)');
        await expect(authorPage.getByRole('heading', {name: /Tasks & Discussions$/})).toBeVisible();
        await expect(authorPage.getByRole('table', {name: 'Reviewers', exact: true})).toHaveCount(0);
        await expect(authorPage.getByRole('heading', {name: 'Reviewers', exact: true})).toHaveCount(0);
        await expect(authorPage.getByRole('button', {name: 'Add Reviewer', exact: true})).toHaveCount(0);
        await expect(authorPage.getByText('Julia Reviewer')).toHaveCount(0);
        await expect(authorPage.getByText('reviewer.julia')).toHaveCount(0);

        // Control: the Editor's view of the same review stage lists the
        // reviewer's row in the "Reviewers" panel.
        const editorPage = await (await asUser('sectioneditor.ana')).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        await workflow.expectPageTitle('Review (Round 1)');
        const row = workflow.panelRow('Reviewers', 'Julia Reviewer');
        await expect(row).toBeVisible();
        await expect(row).toContainText('Request Sent');
        await expect(editorPage.getByRole('button', {name: 'Add Reviewer', exact: true})).toBeVisible();
    });

    test("S18: an assistant-level participant's panel", async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s18', testInfo);
        const title = `Submission ${tag}`;
        // The Funding Coordinator is assigned to the stage through the
        // scenario's participants (the Assign Participant row, no email);
        // reviewer.paul is kept out of the seed as the second Reviewer the
        // Coordinator adds from the opening list.
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'invited'}],
            participants: [{username: 'assistant.rita', role: 'funding'}],
        });

        // The panel: the row with its five columns.
        const ritaPage = await (await asUser('assistant.rita')).newPage();
        const ritaWorkflow = new WorkflowPage(ritaPage, JOURNAL);
        await ritaWorkflow.gotoEditorial(submissionId);
        const ritaRow = ritaWorkflow.panelRow('Reviewers', 'Julia Reviewer');
        await expect(ritaRow).toContainText('Request Sent');
        await expect(
            ritaWorkflow.panel('Reviewers').getByRole('columnheader')
        ).toHaveText(['Reviewer', 'Reviewer status', 'Type', 'Actions', 'More Actions']);

        // "Add Reviewer": the window opens on "Locate a Reviewer" with no
        // "Create New Reviewer" and no "Enroll Existing User" link.
        const ritaModal = await openAddReviewerModal(ritaPage);
        await expect(ritaModal.getByText('Locate a Reviewer')).toBeVisible();
        await expect(ritaModal.getByRole('link', {name: 'Create New Reviewer'})).toHaveCount(0);
        await expect(ritaModal.getByRole('link', {name: 'Enroll Existing User'})).toHaveCount(0);
        await closeSideWindow(ritaModal);

        // The row menu holds no "Editorial Notes" entry (bounded by the
        // always-offered "Email Reviewer").
        const ritaMenu = await openRowMenu(ritaPage, ritaRow);
        await expect(ritaMenu.getByRole('menuitem', {name: 'Email Reviewer'})).toBeVisible();
        await expect(ritaMenu.getByRole('menuitem', {name: 'Editorial Notes'})).toHaveCount(0);
        await closeRowMenu(ritaPage, ritaRow);

        // The add from the opening list: "Add Reviewer" again and, without
        // searching, "Select Reviewer" on the second Reviewer's entry in the
        // list as it opens, then "Add Reviewer": the notice names them and
        // the email. (This role's search, filters and further pages are
        // refused, register A51 — never touched here.) After a reload the
        // row reads "Request Sent" and the request is in their mailbox.
        const addModal = await openAddReviewerModal(ritaPage);
        await selectReviewer(ritaPage, addModal, 'Paul Reviewer', {search: false});
        await addModal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(
            notice(ritaPage, 'Paul Reviewer was assigned to review this submission and sent an email notification.')
        ).toBeVisible({timeout: 30_000});
        await expect(addModal).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(ritaPage);
        await ritaPage.reload();
        await ritaWorkflow.expectOpen();
        await expect(ritaWorkflow.panelRow('Reviewers', 'Paul Reviewer')).toContainText('Request Sent', {
            timeout: 30_000,
        });
        await pkpMail.find({to: 'reviewer.paul@mail.test', subject: 'Invitation to review', contains: title});

        // Control: the Editor's window offers both links and the row's menu
        // "Editorial Notes".
        const editorPage = await (await asUser('sectioneditor.ana')).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        const editorModal = await openAddReviewerModal(editorPage);
        await expect(editorModal.getByRole('link', {name: 'Create New Reviewer'})).toBeVisible();
        await expect(editorModal.getByRole('link', {name: 'Enroll Existing User'})).toBeVisible();
        await closeSideWindow(editorModal);
        const editorRow = workflow.panelRow('Reviewers', 'Julia Reviewer');
        const editorMenu = await openRowMenu(editorPage, editorRow);
        await expect(editorMenu.getByRole('menuitem', {name: 'Editorial Notes'})).toBeVisible();
        await closeRowMenu(editorPage, editorRow);
    });

    test("S19: a later round's request", async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s19', testInfo);
        const {submissionId} = await seedInReview(ojsApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'completed'}],
        });

        // The Round 1 review is marked complete in its Review Details window,
        // then "Create New Review Round" is recorded on screen (the wizard
        // belongs to *Review stage & rounds*).
        const editorPage = await (await asUser('sectioneditor.ana')).newPage();
        const workflow = new WorkflowPage(editorPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        const round1Row = workflow.panelRow('Reviewers', 'Julia Reviewer');
        await expect(round1Row).toContainText('Review Submitted');
        const readModal = await openReviewDetails(editorPage, round1Row);
        await markReviewComplete(editorPage, readModal);
        await closeReviewDetails(editorPage, readModal);
        await expect(round1Row).toContainText('Complete');
        await createNewReviewRound(editorPage, workflow, 2);

        // Round 2's panel lists no reviewer (bounded by its own "No Items"
        // cell), while Round 1 still lists the completed reviewer's row alone.
        await expect(workflow.panel('Reviewers').getByRole('cell', {name: 'No Items'})).toBeVisible();
        await expect(workflow.panelRow('Reviewers', 'Julia Reviewer')).toHaveCount(0);
        await workflow.selectRound(1);
        await expect(workflow.panelRow('Reviewers', 'Julia Reviewer')).toHaveCount(1);
        await expect(workflow.panelRow('Reviewers', 'Julia Reviewer')).toContainText('Complete');
        await expect(workflow.panel('Reviewers').locator('tbody').getByRole('row')).toHaveCount(1);
        await workflow.selectRound(2);

        // "Add Reviewer" on Round 2: the Round 1 reviewer sits at the top of
        // the list, flagged, with the button "Reassign"; control: the
        // never-assigned reviewer's entry carries no flag and "Select
        // Reviewer".
        const modal = await openAddReviewerModal(editorPage);
        const items = modal.locator('.listPanel--selectReviewer .listPanel__item');
        const topItem = items.first();
        await expect(topItem).toContainText('Julia Reviewer');
        await expect(topItem).toContainText('This reviewer completed a review in the last round.');
        await expect(topItem.getByRole('button', {name: 'Reassign Julia Reviewer'})).toBeVisible();
        const paulItem = await searchReviewerList(editorPage, modal, 'Paul Reviewer');
        await expect(paulItem.locator('.listPanel__item--reviewer__notice')).toHaveCount(0);
        await expect(paulItem.getByRole('button', {name: 'Select Paul Reviewer'})).toBeVisible();
        await expect(paulItem).not.toContainText('completed a review in the last round');

        // "Reassign": the request letter is prefilled; "Add Reviewer" lands
        // the row as "Request Sent" on Round 2, and the mailbox holds the
        // subsequent-round request.
        await selectReviewer(editorPage, modal, 'Julia Reviewer', {action: 'Reassign'});
        await expect(requestLetter(editorPage)).not.toHaveText('', {timeout: 30_000});
        await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(modal).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(editorPage);
        await workflow.expectPageTitle('Review (Round 2)');
        const round2Row = workflow.panelRow('Reviewers', 'Julia Reviewer');
        await expect(round2Row).toBeVisible();
        await expect(round2Row).toContainText('Request Sent');
        await pkpMail.find({
            to: 'reviewer.julia@mail.test',
            subject: 'Request to review a revised submission',
            contains: tag,
        });
    });

    test("S20: the journal's review setup presets the request", async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s20', testInfo);
        const editor = `ed${tag}`;
        const author = `au${tag}`;
        const reviewer = `rev${tag}`;
        // Scratch journal with a review setup of its own (the `review`
        // passthrough): one week to respond, two to complete, "Open" as the
        // default review type, reviewer comments publicly shown; the
        // reviewer stays out of the round's seed.
        await ojsApi.createContext({
            tag,
            users: [
                {username: editor, roles: ['editor']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer']},
            ],
            review: {
                numWeeksPerResponse: 1,
                numWeeksPerReview: 2,
                defaultReviewMode: 'open',
                defaultReviewPublicVisibility: true,
            },
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {context: tag, submitter: author});

        const editorPage = await (await asUser(editor)).newPage();
        const workflow = new WorkflowPage(editorPage, tag);
        await workflow.gotoEditorial(submissionId);

        // The request form: the dates preset one and two weeks from today
        // (the datepicker's hidden altField carries the Y-m-d value), "Open"
        // the selected "Review Type", "Publicly Show Reviewer Comments"
        // ticked.
        const modal = await openAddReviewerModal(editorPage);
        await selectReviewer(editorPage, modal, reviewer);
        await expect(dueDateValue(modal, 'responseDueDate')).toHaveValue(ymd(daysFromNow(7)));
        await expect(dueDateValue(modal, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(14)));
        await expect(reviewTypeRadio(modal, 'Open')).toBeChecked();
        await expect(reviewTypeRadio(modal, 'Anonymous Reviewer/Anonymous Author')).not.toBeChecked();
        await expect(publicVisibilityCheckbox(modal)).toBeChecked();

        // The add: the row reads "Request Sent"; its "Edit" window shows
        // "Open" selected and the box ticked.
        await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        await expect(modal).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(editorPage);
        const row = workflow.panelRow('Reviewers', reviewer);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Request Sent');
        const editModal = await openEditReview(editorPage, row);
        await expect(reviewTypeRadio(editModal, 'Open')).toBeChecked();
        await expect(publicVisibilityCheckbox(editModal)).toBeChecked();
        await closeSideWindow(editModal);

        // Control: on the seeded journal (install defaults) the Add Reviewer
        // window, with a reviewer selected, presets both dates four weeks
        // from today, selects "Anonymous Reviewer/Anonymous Author" and
        // leaves the box unticked.
        const controlTag = `${tag}c`;
        const control = await seedInReview(ojsApi, controlTag);
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        const controlWorkflow = new WorkflowPage(anaPage, JOURNAL);
        await controlWorkflow.gotoEditorial(control.submissionId);
        const controlModal = await openAddReviewerModal(anaPage);
        await selectReviewer(anaPage, controlModal, 'Julia Reviewer');
        await expect(dueDateValue(controlModal, 'responseDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));
        await expect(dueDateValue(controlModal, 'reviewDueDate')).toHaveValue(ymd(daysFromNow(4 * 7)));
        await expect(reviewTypeRadio(controlModal, 'Anonymous Reviewer/Anonymous Author')).toBeChecked();
        await expect(reviewTypeRadio(controlModal, 'Open')).not.toBeChecked();
        await expect(publicVisibilityCheckbox(controlModal)).not.toBeChecked();
        await closeSideWindow(controlModal);
    });

    test('S21: a journal that asks about competing interests', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s21', testInfo);
        const manager = `mgr${tag}`;
        const managerName = `Mgr${tag} Manager`;
        const author = `au${tag}`;
        const reviewer = `rev${tag}`;
        const unanswered = `revb${tag}`;
        const third = `revc${tag}`;
        const drafter = `revd${tag}`;
        const policy = `Disclose any competing interests ${tag}.`;
        const statement = 'I co-authored a paper with the author.';
        const draftComment = 'The methods need a second look.';
        const draftRecommendation = 'Revisions Required';
        const ciLogLine = 'The following was modified in this review: Reviewer Competing Interests.';
        const recLogLine = 'The following was modified in this review: Reviewer Recommendation.';
        const commentsLogLine = 'The following was modified in this review: Comments.';
        // Scratch journal with a "Competing Interests" policy (the `review`
        // passthrough); the seeded `completed` review records "I do not have
        // any competing interests", the second and third requests stay
        // unanswered, and the fourth Reviewer's request is accepted and
        // drafted on screen below (no scenario key seeds a "Save for Later"
        // draft). The policy is emptied on screen, as the scenario does.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: `Mgr${tag}`, familyName: 'Manager', roles: ['manager']},
                {username: author, roles: ['author']},
                {username: reviewer, roles: ['externalReviewer']},
                {username: unanswered, roles: ['externalReviewer']},
                {username: third, roles: ['externalReviewer']},
                {username: drafter, roles: ['externalReviewer']},
            ],
            review: {competingInterests: {en: policy}},
        });
        const {submissionId} = await seedInReview(ojsApi, tag, {
            context: tag,
            submitter: author,
            reviewers: [
                {username: reviewer, status: 'completed'},
                {username: unanswered, status: 'invited'},
                {username: third, status: 'invited'},
                {username: drafter, status: 'invited'},
            ],
        });

        // The fourth Reviewer, signed in: step 1 answers "I do not have any
        // competing interests" and accepts; step 3 takes the comment for
        // author and editor and a "Recommendation", then "Save for Later".
        const drafterPage = await (await asUser(drafter)).newPage();
        const wizard = new ReviewWizardPage(drafterPage, tag);
        await wizard.goto(submissionId);
        await wizard.expectStep(1);
        await wizard.noCompetingInterestsRadio.check();
        await expect(wizard.noCompetingInterestsRadio).toBeChecked();
        await wizard.accept();
        await wizard.continueToStep3();
        await wizard.typeComments(draftComment);
        await wizard.chooseRecommendation(draftRecommendation);
        await wizard.saveForLater();

        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag);
        await workflow.gotoEditorial(submissionId);
        const row = workflow.panelRow('Reviewers', reviewer);
        const secondRow = workflow.panelRow('Reviewers', unanswered);
        const thirdRow = workflow.panelRow('Reviewers', third);
        const draftRow = workflow.panelRow('Reviewers', drafter);
        const badge = (r) => statusCell(r).getByText('Competing Interests', {exact: true});
        const ciLogRows = (log) => log.getByRole('row').filter({hasText: ciLogLine});

        // The submitted review: "Review Submitted" with no badge (the badge
        // shows in this same cell below). "Read Review": the "Competing
        // Interests" group follows the summary block, its "Declaration"
        // reading "I do not have any competing interests".
        await expect(statusTitle(row)).toHaveText('Review Submitted');
        await expect(badge(row)).toHaveCount(0);
        const readModal = await openReviewDetails(managerPage, row);
        await awaitReviewDetailsSettled(readModal);
        const group = competingInterestsGroup(readModal);
        await expect(group).toBeVisible({timeout: 30_000});
        await expect(group).toHaveText(/^\s*Competing Interests\s*Declaration\s*I do not have any competing interests\s*$/);
        const summary = datedLine(readModal, 'Review Submitted');
        await expect(summary).toBeVisible();
        expect(
            await summary.evaluate(
                (line, other) => Boolean(line.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
                await group.elementHandle()
            )
        ).toBe(true);

        // "Modify Review", a declared interest: the window's group offers
        // "Declaration" with the reviewer's answer ticked and the second
        // radio; the second opens a "Competing Interests" box for the
        // statement. "Save Changes": the view window's "Declaration" reads
        // "I may have competing interests", then "Competing Interests" and
        // the statement.
        const editModal = await openModifyReview(managerPage, readModal);
        const editGroup = competingInterestsGroup(editModal);
        await expect(editGroup).toBeVisible({timeout: 30_000});
        await expect(editGroup.getByText('Declaration', {exact: true})).toBeVisible();
        await expect(
            editGroup.getByRole('radio', {name: 'I do not have any competing interests', exact: true})
        ).toBeChecked();
        const declareRadio = editGroup.getByRole('radio', {
            name: 'I may have competing interests (Specify below)',
            exact: true,
        });
        await expect(declareRadio).not.toBeChecked();
        await declareCompetingInterests(managerPage, editModal, statement);
        await expect(declareRadio).toBeChecked();
        await expect(editGroup.getByText('Competing Interests', {exact: true}).last()).toBeVisible();
        await saveModifyReview(managerPage, editModal);
        await expect(group).toHaveText(
            new RegExp(`Declaration\\s*I may have competing interests\\s*Competing Interests\\s*${statement.replace('.', '\\.')}`),
            {timeout: 30_000}
        );

        // The row and the activity log: the badge is on the row, and the
        // log lists the change attributed to the Journal Manager.
        await closeReviewDetails(managerPage, readModal);
        await expect(badge(row)).toBeVisible({timeout: 30_000});
        const log = await openActivityLog(managerPage);
        await expect(ciLogRows(log)).toHaveCount(1);
        await expect(ciLogRows(log).first()).toContainText(managerName);
        await closeSideWindow(log);

        // A journal's unanswered request, a recommendation alone: the third
        // Reviewer's "Review Details" › "Modify Review": no "Submitted
        // recommendation:" line (the window's own "You are modifying a
        // submitted review." the positive read) and an empty select.
        await expect(statusTitle(thirdRow)).toHaveText('Request Sent');
        const thirdModal = await openReviewDetailsFromMenu(managerPage, thirdRow);
        const thirdEdit = await openModifyReview(managerPage, thirdModal);
        const thirdSelect = modifyReviewRecommendation(thirdEdit);
        await expect(thirdEdit.getByText('You are modifying a submitted review.', {exact: false})).toBeVisible();
        await expect(thirdSelect).toBeVisible({timeout: 30_000});
        await expect(thirdEdit.getByText('Submitted recommendation:', {exact: false})).toHaveCount(0);
        await expect(thirdSelect).toHaveValue('');
        // "Save Changes" refused in the window: "This field is required."
        // under the select, the summary with its "Go to Recommendation"
        // entry, no review save sent, the window still open, and "Save
        // Changes" disabled until the select changes.
        const reviewSaves = [];
        const onReviewSave = (r) => {
            if (/\/reviewAssignments\/\d+\/review$/.test(r.url().split('?')[0]) && r.method() === 'POST') {
                reviewSaves.push(r.url());
            }
        };
        managerPage.on('request', onReviewSave);
        const thirdSave = thirdEdit.getByRole('button', {name: 'Save Changes', exact: true});
        await expect(thirdSave).toBeEnabled();
        await thirdSave.click();
        await expect(
            recommendationSection(thirdEdit).getByText('This field is required.', {exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(modifyReviewErrorSummary(thirdEdit)).toHaveText(
            /^\s*Please correct one error\.\s*Go to Recommendation: This field is required\.\s*Jump to next error\s*$/
        );
        await expect(
            modifyReviewErrorSummary(thirdEdit).getByRole('button', {
                name: 'Go to Recommendation: This field is required.',
                exact: true,
            })
        ).toHaveCount(1);
        await expect(thirdSave).toBeDisabled();
        await expect(thirdEdit).toBeVisible();
        managerPage.off('request', onReviewSave);
        expect(reviewSaves).toEqual([]);
        // A "Recommendation" picked: "Save Changes" enabled again; pressed
        // with nothing else entered, the window closes.
        await thirdSelect.selectOption({label: 'Accept Submission'});
        await expect(thirdSave).toBeEnabled();
        await saveModifyReview(managerPage, thirdEdit);
        // "Cancel": the row reads "Review Submitted" with the recommendation
        // and "Read Review".
        await closeReviewDetails(managerPage, thirdModal);
        await expect(statusTitle(thirdRow)).toHaveText('Review Submitted', {timeout: 30_000});
        await expect(statusCell(thirdRow)).toContainText('Accept Submission');
        await expect(thirdRow.getByRole('button', {name: 'Read Review', exact: true})).toBeVisible();
        // The activity log: one "Reviewer Recommendation." row under the
        // Journal Manager's name, and no "Comments." row (the recommendation
        // row read in the same settled log is the positive control).
        const recLog = await openActivityLog(managerPage);
        const recRows = recLog.getByRole('row').filter({hasText: recLogLine});
        await expect(recRows).toHaveCount(1);
        await expect(recRows.first()).toContainText(managerName);
        await expect(recLog.getByRole('row').filter({hasText: commentsLogLine})).toHaveCount(0);
        await closeSideWindow(recLog);

        // A reviewer's saved draft: the fourth Reviewer's "Review Details"
        // reads "Request Accepted: {date and time}", the draft's comment,
        // recommendation and declaration, and "Mark as Complete" disabled
        // beside the incomplete message.
        await expect(statusTitle(draftRow)).toHaveText('Request Accepted');
        const draftModal = await openReviewDetailsFromMenu(managerPage, draftRow);
        await expect(datedLine(draftModal, 'Request Accepted')).toHaveText(
            new RegExp(`^Request Accepted:\\s*${DATE_TIME}$`)
        );
        await expect(reviewerCommentsGroup(draftModal)).toContainText(
            new RegExp(`For author and editor\\s*${draftComment.replace('.', '\\.')}`)
        );
        await expect(recommendationValue(draftModal)).toHaveText(draftRecommendation);
        await expect(competingInterestsGroup(draftModal)).toHaveText(
            /^\s*Competing Interests\s*Declaration\s*I do not have any competing interests\s*$/
        );
        await expect(draftModal.getByRole('button', {name: 'Mark as Complete', exact: true})).toBeDisabled();
        await expect(
            draftModal.getByText('This review is incomplete and cannot be marked as complete yet.')
        ).toBeVisible();
        // "Modify Review": the window opens with the draft's comment, the
        // declaration ticked and the recommendation selected.
        const draftEdit = await openModifyReview(managerPage, draftModal);
        await expect(modifyReviewCommentsBody(draftEdit)).toHaveText(draftComment, {timeout: 30_000});
        await expect(
            competingInterestsGroup(draftEdit).getByRole('radio', {
                name: 'I do not have any competing interests',
                exact: true,
            })
        ).toBeChecked();
        await expect(modifyReviewRecommendation(draftEdit).locator('option:checked')).toHaveText(
            draftRecommendation
        );
        // "Save Changes" with nothing changed: the view window reads "Review
        // Submitted: {date and time}" under "Last modified by {the Journal
        // Manager's name}".
        await saveModifyReview(managerPage, draftEdit);
        const draftSubmitted = datedLine(draftModal, 'Review Submitted');
        await expect(draftSubmitted).toHaveText(new RegExp(`^Review Submitted:\\s*${DATE_TIME}$`), {
            timeout: 30_000,
        });
        const draftModified = lastModifiedLine(draftModal);
        await expect(draftModified).toHaveText(`Last modified by ${managerName}`);
        expect(
            await draftModified.evaluate(
                (line, other) => Boolean(line.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
                await draftSubmitted.elementHandle()
            )
        ).toBe(true);
        // "Cancel": the row reads "Review Submitted" with the recommendation
        // and "Read Review".
        await closeReviewDetails(managerPage, draftModal);
        await expect(statusTitle(draftRow)).toHaveText('Review Submitted', {timeout: 30_000});
        await expect(statusCell(draftRow)).toContainText(draftRecommendation);
        await expect(draftRow.getByRole('button', {name: 'Read Review', exact: true})).toBeVisible();

        // The unanswered request: its "Review Details" group reads
        // "Declaration" over "-" (the window's "Request Sent:" line the
        // positive read of a loaded window).
        const unansweredModal = await openReviewDetailsFromMenu(managerPage, secondRow);
        await expect(datedLine(unansweredModal, 'Request Sent')).toBeVisible();
        await expect(competingInterestsGroup(unansweredModal)).toHaveText(
            /^\s*Competing Interests\s*Declaration\s*-\s*$/
        );
        await closeReviewDetails(managerPage, unansweredModal);

        // The policy emptied on Settings › Workflow › Review, "Reviewer
        // Guidance" (the box holds the policy first, the positive read).
        const settings = new ReviewSettingsPage(managerPage, tag);
        await settings.goto('Reviewer Guidance');
        const policyBox = settings.guidance.richBody('competingInterests');
        await expect(policyBox).toContainText(policy, {timeout: 30_000});
        await settings.guidance.typeInto('competingInterests', '');
        await expect(policyBox).toHaveText('');
        await settings.guidance.save();

        // Back on the review stage: the first row keeps its badge, and its
        // "Review Details" still shows the group with the statement.
        await workflow.gotoEditorial(submissionId);
        await expect(badge(row)).toBeVisible({timeout: 30_000});
        const keptModal = await openReviewDetails(managerPage, row);
        await awaitReviewDetailsSettled(keptModal);
        const keptGroup = competingInterestsGroup(keptModal);
        await expect(keptGroup).toContainText('I may have competing interests', {timeout: 30_000});
        await expect(keptGroup).toContainText(statement);

        // The answer still editable: "Modify Review" still offers the group;
        // "I do not have any competing interests" saved, the "Declaration"
        // reads it, the badge is gone, and the log lists one more row.
        const keptEdit = await openModifyReview(managerPage, keptModal);
        const keptEditGroup = competingInterestsGroup(keptEdit);
        await expect(keptEditGroup).toBeVisible({timeout: 30_000});
        await keptEditGroup
            .getByRole('radio', {name: 'I do not have any competing interests', exact: true})
            .check();
        await saveModifyReview(managerPage, keptEdit);
        await expect(keptGroup).toHaveText(
            /^\s*Competing Interests\s*Declaration\s*I do not have any competing interests\s*$/,
            {timeout: 30_000}
        );
        await closeReviewDetails(managerPage, keptModal);
        await expect(statusTitle(row)).toHaveText('Review Viewed');
        await expect(badge(row)).toHaveCount(0);
        const log2 = await openActivityLog(managerPage);
        await expect(ciLogRows(log2)).toHaveCount(2);
        await closeSideWindow(log2);

        // Control: the second reviewer's "Review Details" shows no
        // "Competing Interests" group now (its "Request Sent:" line read
        // first, in the same settled window).
        const controlModal = await openReviewDetailsFromMenu(managerPage, secondRow);
        await expect(datedLine(controlModal, 'Request Sent')).toBeVisible();
        await expect(controlModal.getByText('For author and editor')).toBeVisible();
        await expect(competingInterestsGroup(controlModal)).toHaveCount(0);
        await closeReviewDetails(managerPage, controlModal);
    });
});
