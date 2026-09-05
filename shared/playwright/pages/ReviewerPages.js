/**
 * @file shared/playwright/pages/ReviewerPages.js
 *
 * The reviewer's side of a review assignment (spec
 * docs/specs/U28-reviewers-review.md): the "My Assignments as Reviewer"
 * list and the four-step review wizard, including the "Previous Reviews"
 * box and its round-history window. Shared by the OJS and OMP suites: the
 * screens are the same pkp-lib pages on both apps, and every app-specific
 * string (the OJS "Recommendation" list, the private box's label) sits
 * behind an option or a small method, never hard-coded from one app.
 *
 * DOM facts come from the U28 screen notes (`.reports/U28/screen-notes.md`)
 * and the pkp-lib templates under `templates/reviewer/review/`:
 * - the list is the Vue dashboard page in its reviewer flavour; its sidebar
 *   views sit OUTSIDE <main> and their link text starts with the count;
 * - the wizard's tabs are jQuery UI tabs (role=tab, aria-disabled="true"
 *   for steps not reached), the page opens on the furthest step reached;
 * - step 3's boxes are TinyMCE (type through the editor iframe, never
 *   fill() the textarea), "Submit Review" opens an in-page "Confirm"
 *   dialog BEFORE any check, and the refusal after "OK" is the box
 *   `#reviewStep3MessageBox` (review form) or a `label.error` under the
 *   OJS recommendation list;
 * - the "Previous Reviews" box is a div above the tabs with one BUTTON
 *   "Read Round N Review" per earlier round; its window is the last open
 *   dialog and renders its content a beat after the title.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {LoginPage} = require('./LoginPage.js');

/** The six sidebar views, by their `currentViewId` (Rule 2's order). */
const REVIEWER_VIEWS = {
    actionRequired: 'reviewer-action-required',
    all: 'reviewer-assignments-all',
    completed: 'reviewer-assignments-completed',
    declined: 'reviewer-assignments-declined',
    published: 'reviewer-assignments-published',
    archived: 'reviewer-assignments-archived',
};
exports.REVIEWER_VIEWS = REVIEWER_VIEWS;

/** The views' on-screen names, keyed like REVIEWER_VIEWS. */
const REVIEWER_VIEW_NAMES = {
    actionRequired: 'Action Required by me',
    all: 'All assignments',
    completed: 'Completed',
    declined: 'Declined',
    published: 'Published',
    archived: 'Archived',
};
exports.REVIEWER_VIEW_NAMES = REVIEWER_VIEW_NAMES;

/**
 * Sign in on the CONTEXT's own Login page (`/index.php/{path}/login`), the
 * one whose landing is the reviewer's list (screen notes pA: the site
 * login lands on the public home instead). The page must be signed out.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} contextPath
 * @param {string} username
 * @param {string} password
 */
exports.signInAtContext = async function signInAtContext(page, contextPath, username, password) {
    const login = new LoginPage(page);
    await page.goto(login.contextUrl(contextPath, '/login'));
    await expect(login.usernameInput).toBeVisible({timeout: 30_000});
    await login.signIn(username, password);
};

/**
 * "My Assignments as Reviewer": the sidebar group and the list it opens.
 */
exports.ReviewerAssignmentsPage = class ReviewerAssignmentsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.sidebar = page.getByRole('navigation', {name: 'Site Navigation'});
        this.reviewerGroup = this.sidebar.getByRole('region', {name: 'My Assignments as Reviewer'});
        this.editorGroup = this.sidebar.getByRole('region', {name: 'Editor Dashboard'});
        this.table = page.locator('main table');
        this.searchBox = page.getByRole('textbox', {name: /Search submissions, ID/});
        this.filtersButton = page.getByRole('button', {name: 'Filters', exact: true});
    }

    /** The list's address for a view (a key of REVIEWER_VIEWS, or a raw id). */
    url(view = 'actionRequired') {
        const id = REVIEWER_VIEWS[view] || view;
        return this.contextUrl(this.contextPath, `/dashboard/reviewAssignments?currentViewId=${id}`);
    }

    /** Open a view by address and wait for its rows (or "No Items"). */
    async goto(view = 'actionRequired') {
        await this.page.goto(this.url(view));
        await this.expectSettled();
    }

    /**
     * The table has finished loading: the "Loading" row is gone and either a
     * data cell or the empty-state text is on screen. Every presence and
     * absence read is bounded by this.
     */
    async expectSettled() {
        await expect(this.table).toBeVisible({timeout: 30_000});
        await expect(this.table).not.toContainText('Loading', {timeout: 30_000});
        await expect(this.table.locator('tbody tr td').or(this.page.getByText('No Items')).first()).toBeVisible({
            timeout: 30_000,
        });
    }

    /** The page heading, "{View} ({count})". */
    heading() {
        return this.page.locator('main h1, main h2').first();
    }

    /**
     * A sidebar view's link. The link's own text carries the count FIRST
     * ("3 Action Required by me"), so it is reached through its treeitem.
     *
     * @param {string} view a key of REVIEWER_VIEWS
     */
    viewLink(view) {
        return this.reviewerGroup
            .getByRole('treeitem', {name: REVIEWER_VIEW_NAMES[view], exact: true})
            .getByRole('link');
    }

    /** Select a sidebar view and wait for the list. */
    async selectView(view) {
        await this.viewLink(view).click();
        await this.page.waitForURL((url) => url.searchParams.get('currentViewId') === REVIEWER_VIEWS[view], {
            waitUntil: 'commit',
        });
        await this.expectSettled();
    }

    /** The count a sidebar view's link shows ("3 Declined" → 3). */
    async viewCount(view) {
        const text = (await this.viewLink(view).innerText()).trim();
        const match = text.match(/^(\d+)\s/);
        return match ? Number(match[1]) : null;
    }

    /** A row of the list by any text it carries (the seed tag in the title). */
    row(text) {
        return this.table.getByRole('row').filter({hasText: text});
    }

    /** A row's single "Actions" button ("Respond to request", "Finish review", "View"). */
    rowAction(row, name) {
        return row.getByRole('button', {name, exact: true});
    }

    /** Every button in a row's "Actions" cell (zero for a declined or archived row). */
    rowActions(row) {
        return row.locator('td:last-child button');
    }

    /** The row's "Editorial Activity" sentence. */
    async rowActivity(row) {
        return (await row.innerText()).replace(/\s+/g, ' ').trim();
    }

    /** Open the wizard from a row's action button. */
    async openWizard(row, name) {
        await this.rowAction(row, name).click();
        await this.page.waitForURL(/\/reviewer\/submission\//, {waitUntil: 'commit'});
    }

    /** Assert which of the six views list (or do not list) a row's text. */
    async expectInViews(text, listedIn) {
        for (const view of Object.keys(REVIEWER_VIEWS)) {
            await this.goto(view);
            const count = listedIn.includes(view) ? 1 : 0;
            await expect(this.row(text), `${REVIEWER_VIEW_NAMES[view]} lists "${text}"`).toHaveCount(count);
        }
    }
};

/**
 * The review wizard (`{context}/reviewer/submission/{submissionId}`): four
 * steps, the "Previous Reviews" box and the round-history window.
 */
exports.ReviewWizardPage = class ReviewWizardPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{privateBoxLabel?: string}} [options] the app's label of the
     *   editor-only box ("For editor" on OJS, "For editor only" on OMP)
     */
    constructor(page, contextPath, options = {}) {
        super(page);
        this.contextPath = contextPath;
        this.privateBoxLabel = options.privateBoxLabel || 'For editor';

        // Header
        this.previousReviewsBox = page.locator('div').filter({has: page.getByRole('heading', {name: 'Previous Reviews', exact: true})}).last();

        // Step 1
        this.acceptButton = page.getByRole('button', {name: 'Accept Review, Continue to Step #2'});
        this.saveAndContinueButton = page.getByRole('button', {name: 'Save and continue', exact: true});
        this.declineLink = page.getByRole('link', {name: 'Decline Review Request'});
        this.privacyBox = page.locator('input[name="privacyConsent"]');
        this.viewAllDetailsLink = page.getByRole('link', {name: 'View All Submission Details'});
        this.aboutDueDatesLink = page.getByRole('link', {name: 'About Due Dates'});
        this.competingInterestsLink = page.getByRole('link', {name: /Competing Interests/}).first();
        this.noCompetingInterestsRadio = page.locator('input[name="competingInterestOption"][value="noCompetingInterests"]');
        this.hasCompetingInterestsRadio = page.locator('input[name="competingInterestOption"][value="hasCompetingInterests"]');
        this.competingInterestsBody = page.frameLocator('iframe[id^="reviewerCompetingInterests"]').locator('body');

        // Step 2
        this.continueToStep3Button = page.getByRole('button', {name: 'Continue to Step #3'});
        this.goBackLink = page.getByRole('link', {name: 'Go Back'});

        // Step 3
        this.commentsBody = page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body');
        this.privateCommentsBody = page.frameLocator('iframe[id^="commentsPrivate"]').locator('body');
        this.recommendationSelect = page.locator('select#reviewerRecommendationId');
        this.recommendationError = page.locator('label#reviewerRecommendationId-error.error');
        this.saveForLaterButton = page.getByRole('button', {name: 'Save for Later', exact: true});
        this.submitReviewButton = page.getByRole('button', {name: 'Submit Review', exact: true});
        this.messageBox = page.locator('#reviewStep3MessageBox');
        this.reviewerFilesGrid = page.locator('#reviewAttachmentsGridContainer');
        this.uploadFileLink = this.reviewerFilesGrid.getByRole('link', {name: 'Upload File', exact: true});
        this.guidelinesLink = page.locator('a[id^="viewGuidelines-viewReviewGuidelines-button"]');
        this.discussionsAddButton = page.locator('main').getByRole('button', {name: 'Add', exact: true});

        // Step 4
        this.completedHeading = page.getByRole('heading', {name: 'Review Submitted'});
    }

    /** The wizard address, optionally with a typed step. */
    url(submissionId, step = null) {
        const query = step ? `?step=${step}` : '';
        return this.contextUrl(this.contextPath, `/reviewer/submission/${submissionId}${query}`);
    }

    /** Open the wizard by address and wait for its heading. */
    async goto(submissionId, {step = null} = {}) {
        await this.page.goto(this.url(submissionId, step));
        await this.expectOpen();
    }

    /** The page is headed "Review: {title}". */
    async expectOpen(title = null) {
        const name = title ? `Review: ${title}` : /^Review: /;
        await expect(this.page.getByRole('heading', {name, level: 1})).toBeVisible({timeout: 30_000});
    }

    /** A step's tab ("1. Request", …). */
    tab(step) {
        return this.page.getByRole('tab', {name: new RegExp(`^${step}\\.`)});
    }

    async expectStep(step) {
        await expect(this.tab(step)).toHaveAttribute('aria-selected', 'true', {timeout: 30_000});
    }

    async expectTabDisabled(step) {
        await expect(this.tab(step)).toHaveAttribute('aria-disabled', 'true');
    }

    async expectTabEnabled(step) {
        await expect(this.tab(step)).not.toHaveAttribute('aria-disabled', 'true');
    }

    /** Select a reached step's tab (a step beyond the reached one is disabled). */
    async selectStep(step) {
        await this.tab(step).click();
        await this.expectStep(step);
    }

    // ---------------------------------------------------------------------
    // Step 1 — the request
    // ---------------------------------------------------------------------

    /** The "Review Files" grid of step 1 or 3 (absent on step 1 with "Restrict File Access" on). */
    reviewFilesGrid(step) {
        return this.page.locator(`#reviewFilesStep${step}`);
    }

    /** Wait for a step's "Review Files" grid to finish its own load. */
    async expectReviewFilesSettled(step) {
        const grid = this.reviewFilesGrid(step);
        await expect(grid).toBeVisible({timeout: 30_000});
        await expect(grid).not.toContainText('Loading', {timeout: 30_000});
        await expect(grid.locator('table tbody tr td').or(grid.getByText('No Files')).first()).toBeVisible({timeout: 30_000});
    }

    /** A file's download link in a step's "Review Files" grid. */
    reviewFileLink(step, name) {
        return this.reviewFilesGrid(step).locator('a[href*="download-file"]').filter({hasText: name});
    }

    /** Press a file link and return the download it starts. */
    async downloadReviewFile(step, name) {
        const [download] = await Promise.all([
            this.page.waitForEvent('download', {timeout: 30_000}),
            this.reviewFileLink(step, name).click(),
        ]);
        return download;
    }

    /** The whole step-1 text of a labelled read-only line ("Review Type", "Review Due Date"). */
    async step1Value(label) {
        const text = await this.page.locator('#reviewStep1Form').innerText();
        const match = text.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?\\s*([^\\n]+)`));
        return match ? match[1].trim() : null;
    }

    /** "View All Submission Details": open the window and wait for its content. */
    async openSubmissionDetails() {
        await this.viewAllDetailsLink.click();
        const dialog = this.page.getByRole('dialog').last();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await this.page.waitForFunction(() => {
            const dialogs = document.querySelectorAll('[role="dialog"]');
            const last = dialogs[dialogs.length - 1];
            return !!last && last.innerText.length > 120;
        }, undefined, {timeout: 30_000});
        return dialog;
    }

    /** "About Due Dates": open the dialog and return it. */
    async openAboutDueDates() {
        await this.aboutDueDatesLink.click();
        const dialog = this.page.getByRole('dialog').filter({
            hasText: 'The editor asks that you either accept or decline the review',
        });
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /** Close a legacy in-page dialog by its "OK" or "Close" control. */
    async closeDialog(dialog) {
        const ok = dialog.getByRole('button', {name: 'OK', exact: true});
        if (await ok.count()) {
            await ok.click();
        } else {
            await dialog.getByRole('button', {name: 'Close', exact: true}).click();
        }
        await expect(dialog).toBeHidden({timeout: 30_000});
    }

    /**
     * Accept the request: tick the privacy box (when shown) and press the
     * accept button; lands on step 2.
     */
    async accept({privacy = true} = {}) {
        if (privacy && (await this.privacyBox.count())) {
            await this.privacyBox.check();
        }
        await this.acceptButton.click();
        await this.expectStep(2);
    }

    /** The "Decline Review Request" side window (its message is a TinyMCE box). */
    declineDialog() {
        return this.page.getByRole('dialog').filter({
            hasText: 'You may provide the editor with any reasons why you are declining',
        });
    }

    /** The decline window's message body (the editor iframe inside the dialog). */
    declineMessageBody() {
        return this.declineDialog().frameLocator('iframe').locator('body');
    }

    /** Open the decline window and wait for its prefilled message. */
    async openDecline() {
        await this.declineLink.click();
        const dialog = this.declineDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(this.declineMessageBody()).not.toHaveText('', {timeout: 30_000});
        return dialog;
    }

    /**
     * Finish an OPEN decline window: append `appendText` to the prefilled
     * message (or replace it when `replace` is given), press the window's
     * button and wait for the navigation away from the wizard.
     */
    async confirmDecline({appendText = null, replace = null} = {}) {
        const dialog = this.declineDialog();
        const body = this.declineMessageBody();
        if (replace !== null) {
            await body.fill(replace);
        }
        if (appendText) {
            await body.click();
            await this.page.keyboard.press('Control+End');
            await this.page.keyboard.press('Enter');
            await body.pressSequentially(appendText);
        }
        await dialog.getByRole('button', {name: 'Decline Review Request', exact: true}).click();
        await this.page.waitForURL((url) => !url.pathname.includes('/reviewer/'), {
            timeout: 30_000,
            waitUntil: 'commit',
        });
    }

    /** Open the decline window and finish it (openDecline + confirmDecline). */
    async decline(options = {}) {
        await this.openDecline();
        await this.confirmDecline(options);
    }

    // ---------------------------------------------------------------------
    // Step 2 — guidelines
    // ---------------------------------------------------------------------

    async continueToStep3() {
        await this.continueToStep3Button.click();
        await this.expectStep(3);
    }

    // ---------------------------------------------------------------------
    // Step 3 — download & review
    // ---------------------------------------------------------------------

    /** Type into a TinyMCE box through the editor (a fill() bypasses the model). */
    async typeInto(body, text) {
        await body.click();
        await body.pressSequentially(text);
    }

    async typeComments(text) {
        await this.typeInto(this.commentsBody, text);
    }

    async typePrivateComments(text) {
        await this.typeInto(this.privateCommentsBody, text);
    }

    /** Pick an entry of the OJS "Recommendation" list (absent on a press). */
    async chooseRecommendation(label) {
        await this.recommendationSelect.selectOption({label});
    }

    /** A review-form radio option by its label. */
    formRadio(label) {
        return this.page.getByRole('radio', {name: label, exact: true});
    }

    /** "Save for Later": press and wait for the toast. */
    async saveForLater() {
        await this.saveForLaterButton.click();
        await expect(this.page.getByText('Your changes have been saved.').first()).toBeVisible({timeout: 30_000});
    }

    /** The in-page "Confirm" dialog "Submit Review" opens. */
    confirmDialog() {
        return this.page.getByRole('dialog').filter({hasText: 'Are you sure you want to submit this review?'});
    }

    /** Press "Submit Review" and wait for the confirmation to appear. */
    async pressSubmitReview() {
        await this.submitReviewButton.click();
        const dialog = this.confirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /** "Submit Review" › "OK". The caller asserts what follows. */
    async submitReview() {
        const dialog = await this.pressSubmitReview();
        await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(dialog).toBeHidden({timeout: 30_000});
    }

    /** Step 4 is open with "Review Submitted". */
    async expectCompleted() {
        await this.expectStep(4);
        await expect(this.completedHeading).toBeVisible({timeout: 30_000});
    }

    /** Wait for the "Reviewer Files" grid's own load. */
    async expectReviewerFilesSettled() {
        const grid = this.reviewerFilesGrid;
        await expect(grid).toBeVisible({timeout: 30_000});
        await expect(grid).not.toContainText('Loading', {timeout: 30_000});
        await expect(grid.locator('table tbody tr td').or(grid.getByText('No Files')).first()).toBeVisible({timeout: 30_000});
    }

    /** A "Reviewer Files" row by file name. */
    reviewerFileRow(name) {
        return this.reviewerFilesGrid.getByRole('row').filter({hasText: name});
    }

    /**
     * Reveal a "Reviewer Files" row's controls (behind the legacy grid's
     * "Settings" toggle) and return the controls row; read its links by
     * accessible name (`getByRole('link', {name: 'Edit', exact: true})`).
     */
    async reviewerFileActions(row) {
        const toggle = row.locator('a.show_extras');
        if (await toggle.count()) {
            await toggle.click();
        }
        // The controls render in the row's next sibling, a "row_controls"
        // row (templates/controllers/grid/gridRow.tpl).
        const controls = row.locator('xpath=following-sibling::tr[contains(@class, "row_controls")][1]');
        await expect(controls).toBeVisible({timeout: 30_000});
        return controls;
    }

    /**
     * "Upload File" under step 3's "Upload": the reviewer's three-step upload
     * wizard ("1. Upload File", "2. Review Details", "3. Confirm"; no
     * file-type question, the name arrives prefilled). Attaches an in-memory
     * text file and waits for its "Reviewer Files" row.
     */
    async uploadReviewerFile(fileName) {
        await this.uploadFileLink.click();
        const wizard = this.page
            .getByRole('dialog')
            .filter({has: this.page.getByRole('tab', {name: '1. Upload File'})});
        await expect(wizard.getByRole('tab', {name: '1. Upload File'})).toBeVisible({timeout: 30_000});
        await this.page.locator('input[type="file"]').last().setInputFiles({
            name: fileName,
            mimeType: 'text/plain',
            buffer: Buffer.from(`Reviewer file ${fileName}`),
        });
        await expect(wizard.getByRole('button', {name: /Change File/})).toBeVisible({timeout: 30_000});
        await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
        await expect(wizard.getByRole('tab', {name: '2. Review Details'})).toHaveAttribute('aria-selected', 'true', {timeout: 30_000});
        await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
        await expect(wizard.getByRole('tab', {name: '3. Confirm'})).toHaveAttribute('aria-selected', 'true', {timeout: 30_000});
        await wizard.getByRole('button', {name: 'Complete', exact: true}).click();
        await expect(wizard).toBeHidden({timeout: 30_000});
        await expect(this.reviewerFileRow(fileName)).toBeVisible({timeout: 30_000});
    }

    // ---------------------------------------------------------------------
    // Previous Reviews
    // ---------------------------------------------------------------------

    /** The "Round {N} Review Submitted on …" line. */
    previousReviewLine(round) {
        return this.previousReviewsBox.locator('p').filter({hasText: `Round ${round} Review Submitted on`});
    }

    /** "Read Round {N} Review": open the round-history window and wait for its content. */
    async openRoundHistory(round) {
        await this.previousReviewsBox.getByRole('button', {name: `Read Round ${round} Review`}).click();
        const dialog = this.page.getByRole('dialog').last();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await this.page.waitForFunction(() => {
            const dialogs = document.querySelectorAll('[role="dialog"]');
            const last = dialogs[dialogs.length - 1];
            return !!last && last.innerText.length > 150;
        }, undefined, {timeout: 30_000});
        return dialog;
    }

    /** Close the round-history window (its header "Close" is the only control). */
    async closeRoundHistory(dialog) {
        await dialog.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(dialog).toBeHidden({timeout: 30_000});
    }
};
