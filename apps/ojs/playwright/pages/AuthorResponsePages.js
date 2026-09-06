// @ts-check
/**
 * @file playwright/pages/AuthorResponsePages.js
 *
 * OJS-local Page Objects for the "Author response to reviews" feature
 * (spec: docs/specs/U30-author-response-to-reviews.md). Navigation and the
 * workflow frame come from the shared WorkflowPage
 * (shared/playwright/pages/WorkflowPage.js); the Reviewers-panel flows come
 * from ReviewStagePages.js. This file owns the surfaces this feature adds
 * to the already-open review stage:
 *
 * - AuthorResponseTable — the editorial view's "Author Response" table: the
 *   "Request Response" header button, the per-author rows (Author cell,
 *   Response Status cell, the "…" More Actions menu with "View"/"Delete"),
 *   and the "Delete" confirm dialog.
 * - AuthorResponseCard — the author view's "Author Response" card: its
 *   status line and the "Submit Response" / "View Submitted Response"
 *   button.
 * - AuthorResponseWindow — the side window both views open: the author's
 *   "Submit Your Response to Reviewer Feedback" and the editor's "Author
 *   Response to Reviews", with the rich-text "Author Response" body, the
 *   "Authors" checkboxes, and the "Submit Response" / "Save" / "Cancel"
 *   buttons.
 * - RequestAuthorResponsePage — the full "Request Author Response" email
 *   page reached from "Request Response" or by its typed address: the "To"
 *   recipients, "Subject", the TinyMCE "Message", "Cancel"/"Submit Request"
 *   and the "Request for review response sent" dialog.
 *
 * The OMP and OPS absence suites and later features (U34 editorial
 * decisions, U26 maintenance) reuse these. Labels are the live locale
 * strings; DOM shapes confirmed against the running fleet (probe
 * .reports/U30/{pA,pB,pC,pD}, 2026-09-06).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

/** Status-cell wordings (Rule 2). Read case-insensitively — the "Ready…" cell
 * is title-cased by CSS (innerText "Ready To Invite Author", DOM "Ready to
 * invite author"), so every match is a case-insensitive regex. */
const STATUS = {
    awaiting: /Awaiting reviews/i,
    ready: /Ready to invite author/i,
    submittedBy: (name) => new RegExp(`A response was submitted by ${name}`, 'i'),
};

exports.STATUS = STATUS;

/**
 * The editorial "Author Response" table on the open review stage (Rules 1, 2,
 * 10, 11). Scopes to the table's accessible name, so it holds whichever
 * workflow round is showing.
 */
exports.AuthorResponseTable = class AuthorResponseTable extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        super(page);
    }

    /** The table itself (aria-labelledby the "Author Response" h3). */
    table() {
        return this.page.getByRole('table', {name: 'Author Response'});
    }

    async expectVisible() {
        await expect(this.table()).toBeVisible({timeout: 30_000});
    }

    async expectAbsent() {
        await expect(this.table()).toHaveCount(0, {timeout: 30_000});
    }

    /** The "Request Response" header button (Rule 3). */
    requestResponseButton() {
        return this.page.getByRole('button', {name: 'Request Response', exact: true});
    }

    /**
     * A row by the author named in its FIRST cell. Once a response exists
     * every row's status cell names the submitter, so the row must be keyed
     * on the Author column, not on the row's whole text (pB screen note).
     */
    row(name) {
        return this.table()
            .locator('tbody tr')
            .filter({has: this.page.locator('td:first-child').filter({hasText: name})});
    }

    /** Every author row (order-independent reads take the count). */
    rows() {
        return this.table().locator('tbody tr');
    }

    /** A row's "Response Status" cell (the second column). */
    statusCell(name) {
        return this.row(name).locator('td').nth(1);
    }

    /** A row's "More Actions" ("…") button, present only once a response exists. */
    moreActions(name) {
        return this.row(name).getByRole('button', {name: 'More Actions'});
    }

    /**
     * A menu item of an open "More Actions" menu ("View" / "Delete"). The
     * headlessui/DropdownActions menu portals to the document root, so the
     * item resolves page-wide, never inside the row.
     */
    menuItem(name) {
        return this.page.getByRole('menuitem', {name, exact: true});
    }

    /** Open a row's "…" menu and press one of its items. */
    async openRowMenu(name) {
        await this.moreActions(name).click();
    }

    /** The "Delete" confirm dialog (Rule 11), verified against its body. */
    deleteDialog() {
        return this.page
            .getByRole('dialog', {name: 'Delete', exact: true})
            .filter({hasText: 'Are you sure you wish to delete this item?'});
    }

    /**
     * Press "…" › "Delete", then answer the dialog. Resolves once the dialog
     * has closed. The table itself catches up on its own a few seconds later
     * (poll the status cell after this).
     */
    async deleteResponse(name, {confirm = true} = {}) {
        await this.openRowMenu(name);
        await this.menuItem('Delete').click();
        const dialog = this.deleteDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await dialog.getByRole('button', {name: confirm ? 'OK' : 'Cancel', exact: true}).click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }

    /**
     * Wait for a row's status cell to settle on the given wording. Used after
     * a delete (the table refreshes itself within ~15 s) or a stage switch
     * (the rows can read "No Items" for a moment first).
     */
    async expectStatus(name, pattern) {
        await expect(this.statusCell(name)).toContainText(pattern, {timeout: 30_000});
    }
};

/**
 * The author view's "Author Response" card (Rules 6, 8, 9). The card is the
 * h4 "Author Response" that ends the review stage; when the response window
 * is closed its button's name is unique to the card.
 */
exports.AuthorResponseCard = class AuthorResponseCard extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        super(page);
    }

    /** The workflow side modal the card lives in. */
    modal() {
        return this.page.getByRole('dialog').first();
    }

    /** The card heading (h4). On the author view the table (h3) is absent. */
    heading() {
        return this.modal().getByRole('heading', {name: 'Author Response', exact: true});
    }

    async expectVisible() {
        await expect(this.heading()).toBeVisible({timeout: 30_000});
    }

    async expectAbsent() {
        await expect(this.heading()).toHaveCount(0, {timeout: 30_000});
    }

    /** The card's "Submit Response" button (before a response exists). */
    submitButton() {
        return this.modal().getByRole('button', {name: 'Submit Response', exact: true});
    }

    /** The card's "View Submitted Response" button (after one exists). */
    viewButton() {
        return this.modal().getByRole('button', {name: 'View Submitted Response', exact: true});
    }

    /** The card's status text ("Respond to Reviews" / "A response was submitted by …"). */
    async expectStatus(pattern) {
        await expect(this.heading().locator('xpath=ancestor::div[1]')).toContainText(pattern, {
            timeout: 30_000,
        });
    }
};

/**
 * The response side window (Rules 8–10). Author view: "Submit Your Response
 * to Reviewer Feedback"; editor view: "Author Response to Reviews". Both hold
 * the rich-text "Author Response" body, one "Authors" checkbox per
 * contributor, and a submit button ("Submit Response" for the author, "Save"
 * for the editor) plus "Cancel".
 */
exports.AuthorResponseWindow = class AuthorResponseWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {{editor?: boolean}} [options] editor view (default author view)
     */
    constructor(page, {editor = false} = {}) {
        super(page);
        this.title = editor
            ? 'Author Response to Reviews'
            : 'Submit Your Response to Reviewer Feedback';
        this.submitLabel = editor ? 'Save' : 'Submit Response';
    }

    /** The open window (the side-modal dialog named by this window's title). */
    modal() {
        return this.page.getByRole('dialog', {name: this.title});
    }

    async expectOpen() {
        await expect(this.modal()).toBeVisible({timeout: 30_000});
    }

    async expectClosed() {
        await expect(this.modal()).toHaveCount(0, {timeout: 30_000});
    }

    /** The rich-text "Author Response" body (TinyMCE, first iframe of the window). */
    body() {
        return this.modal().frameLocator('iframe').first().locator('body');
    }

    /** Replace the body text cleanly (Meta/Ctrl+A then type — Rule 8, pB note). */
    async fillBody(text) {
        const body = this.body();
        await body.click();
        await this.page.keyboard.press('ControlOrMeta+A');
        await this.page.keyboard.press('Delete');
        await body.pressSequentially(text);
    }

    /** An "Authors" checkbox by the contributor's display name. */
    authorCheckbox(name) {
        return this.modal().getByRole('checkbox', {name});
    }

    /** The submit button ("Submit Response" for the author, "Save" for the editor). */
    submitButton() {
        return this.modal().getByRole('button', {name: this.submitLabel, exact: true});
    }

    cancelButton() {
        return this.modal().getByRole('button', {name: 'Cancel', exact: true});
    }

    /** The window's intro/description paragraph text. */
    intro() {
        return this.modal().locator('p').first();
    }

    async cancel() {
        await this.cancelButton().click();
        await this.expectClosed();
    }
};

/**
 * The full "Request Author Response" email page (Rules 4, 4a, 14). Reached
 * from the table's "Request Response" (with a `ret`) or by its typed address
 * (no `ret`). One TinyMCE "Message" editor loads after the page's own
 * request, so callers wait for `expectLoaded()` before submitting (an early
 * submit posts an empty body and 422s with no dialog — pB note).
 */
exports.RequestAuthorResponsePage = class RequestAuthorResponsePage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /** The typed address for a round (Rule 14; the review stage is 3). */
    url(submissionId, reviewRoundId) {
        return this.contextUrl(
            this.contextPath,
            `/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=${reviewRoundId}&submissionId=${submissionId}`
        );
    }

    async goto(submissionId, reviewRoundId) {
        await this.page.goto(this.url(submissionId, reviewRoundId));
    }

    heading() {
        return this.page.getByRole('heading', {name: 'Request Author Response', level: 1});
    }

    subject() {
        return this.page.getByRole('textbox', {name: 'Subject'});
    }

    /** The TinyMCE "Message" body (the composer's iframe). */
    messageBody() {
        return this.page.locator('iframe[id^="composer-body"]').first().contentFrame().locator('body');
    }

    addCcBccButton() {
        return this.page.getByRole('button', {name: 'Add CC/BCC'});
    }

    ccInput() {
        return this.page.getByRole('textbox', {name: 'CC', exact: true});
    }

    bccInput() {
        return this.page.getByRole('textbox', {name: 'BCC', exact: true});
    }

    /** The recipients ("To") region. Its input is disabled — there is no box
     * to add anyone (Rule 13). */
    recipientsDisabled() {
        return this.page.locator('.pkpAutosuggest--disabled');
    }

    cancelButton() {
        return this.page.getByRole('button', {name: 'Cancel', exact: true});
    }

    submitRequestButton() {
        return this.page.getByRole('button', {name: 'Submit Request', exact: true});
    }

    /**
     * The page and its template have loaded: the heading is up, the message
     * iframe has attached, its "Loading" placeholder is gone and the body
     * holds the template. Submitting before this posts an empty body (422).
     */
    async expectLoaded() {
        await expect(this.heading()).toBeVisible({timeout: 30_000});
        await expect(this.subject()).not.toHaveValue('', {timeout: 30_000});
        await expect(this.messageBody()).not.toHaveText('', {timeout: 30_000});
        await expect(this.page.getByText('Loading', {exact: true})).toHaveCount(0, {timeout: 30_000});
    }

    /** The "Request for review response sent" dialog (Rule 4). */
    sentDialog() {
        return this.page.getByRole('dialog', {name: 'Request for review response sent'});
    }

    /** The sent dialog's link when the page had a `ret` (Rule 4). */
    viewSubmissionSummaryLink() {
        return this.sentDialog().getByRole('link', {name: 'View Submission Summary'});
    }

    /**
     * Submit the request and wait for the sent dialog. Callers must have
     * awaited `expectLoaded()` first.
     */
    async submit() {
        await this.submitRequestButton().click();
        await expect(this.sentDialog()).toBeVisible({timeout: 30_000});
    }
};
