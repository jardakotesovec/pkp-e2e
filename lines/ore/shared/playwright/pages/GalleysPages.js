// @ts-check
/**
 * @file shared/playwright/pages/GalleysPages.js
 *
 * Page objects for the Galleys feature (spec: docs/specs/U46-galleys.md),
 * shared by the OJS and OPS suites (a press has no "Galleys" page; the OMP
 * suite reads its absence through the shared WorkflowPage). App-neutral:
 * the strings below are lib/pkp's and the ui-library's, the same on a
 * journal and a preprint server; every per-app string (a component name,
 * a fixture file, a window title an app words differently) is passed in
 * by the suite.
 *
 * Surfaces:
 * - GalleyManager — the workflow's Publication ("Preprint") › version ›
 *   "Galleys" page (`[data-cy="galley-manager"]`): its table, "No Items",
 *   "Order" / "Save Order" above it and "Add galley" below it, a row's
 *   label link (a download in a new tab), language cell and "More
 *   Actions" menu ("Edit", "View", "Change File", "More Information",
 *   "Delete"), ordering mode's unnamed up and down arrows, and the
 *   "Delete" dialog.
 * - GalleyWindow — the legacy galley form in its three windows: "Create
 *   New Galley" ("Add galley"), "Upload a File Ready for Publication" (a
 *   row's "Edit", A1) and "View Galley" (a preprint's read-only "View"):
 *   "Galley Label", "Language", the remote box and its address, "URL
 *   Path", the refusals under a box, "Save" / "Cancel" and the header
 *   "Close".
 * - The upload wizard "Add galley" and "Change File" open is
 *   SubmissionFilesPages' UploadWizard, titled `UPLOAD_TITLE`; the "More
 *   Information" window is its InformationCenter.
 *
 * Browser dialogs (the window's "The data on this form has changed…"
 * confirm) are the caller's: register SubmissionFilesPages'
 * `recordBrowserDialogs` before the step that may ask.
 *
 * DOM shapes (U46 claim check, `.reports/U46/screen-notes.md`, ccK1–ccK3,
 * and the ui-library's GalleyManager, 2026-09-24): the form is
 * `form#articleGalleyForm` (journal) / `form#preprintGalleyForm` (preprint
 * server), its boxes found by `name=`; a save posts `…/update-galley`, a
 * delete `…/delete-galley`, "Save Order" `…/save-sequence`; the list's
 * empty row is a single `td[colspan]`; the row menu button is the
 * ellipsis `button[aria-label="More Actions"]`; the arrows are the two
 * unnamed buttons of a row in ordering mode (up first, A5). Row and
 * control reads use CSS inside the table, not role queries, because the
 * workflow dialog stays aria-hidden for a moment after a window closes
 * (patterns.md pitfall 4), and an absence read there would pass falsely.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');
const {pastCloseWindow} = require('./IdentifiersPages.js');
const {UploadWizard, captureDownload} = require('./SubmissionFilesPages.js');

/** The strings the journal and the preprint server share (lib/pkp, ui-library). */
const TEXT = {
    noItems: 'No Items',
    createTitle: 'Create New Galley',
    editTitle: 'Upload a File Ready for Publication',
    viewTitle: 'View Galley',
    labelHelp: 'Typically used to identify the file format (e.g. PDF, HTML, etc.).',
    urlPathHelp: 'An optional path to use in the URL instead of the ID.',
    remoteBox: 'This galley will be available at a separate website.',
    remoteUrl: 'URL of remotely-hosted content',
    required: 'This field is required.',
    urlPathNumber: 'The URL path can not be a number.',
    urlPathCharacters: 'This may only contain letters, numbers, dashes, underscores and periods.',
    urlPathUsed: 'The URL path has already been used and can not be used again.',
    formChanged: 'The data on this form has changed. Do you wish to continue without saving?',
    deleteTitle: 'Delete',
    deleteQuestion: 'Are you sure you wish to delete this item? This action cannot be undone.',
};
exports.GALLEYS_TEXT = TEXT;

/** The upload wizard's title, for "Add galley" and "Change File" alike. */
const UPLOAD_TITLE = TEXT.editTitle;
exports.GALLEY_UPLOAD_TITLE = UPLOAD_TITLE;

/** A whole-text matcher for a button's text (ignores the padding around it). */
function whole(text) {
    return new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

// -------------------------------------------------------------------------
// The "Galleys" page
// -------------------------------------------------------------------------

exports.GalleyManager = class GalleyManager extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('./WorkflowPage.js').WorkflowPage} frame
     * @param {{pageLabel?: string}} [options] the side menu's page entry ("Galleys")
     */
    constructor(page, frame, {pageLabel = 'Galleys'} = {}) {
        super(page);
        this.frame = frame;
        this.pageLabel = pageLabel;
    }

    /** Open a version's "Galleys" page by address (editorial view). */
    async open(submissionId, publicationId) {
        await this.frame.gotoEditorial(submissionId, {menuKey: `publication_${publicationId}_galleys`});
        await this.expectLoaded();
    }

    /** Open a version's "Galleys" page in the Author's view (My Submissions) by address. */
    async openAuthor(submissionId, publicationId) {
        await this.frame.gotoAuthor(submissionId, {menuKey: `publication_${publicationId}_galleys`});
        await this.expectLoaded();
    }

    /** Reload the page and wait for it again. */
    async reload() {
        await this.page.reload();
        await this.frame.expectOpen();
        await this.expectLoaded();
    }

    /** The page's heading ("Publication: Galleys", "Preprint: Galleys") and its table have arrived. */
    async expectLoaded() {
        await this.frame.expectPageHeading(this.pageLabel);
        await expect(this.table()).toBeVisible({timeout: 30_000});
        await expect(this.rowsOrEmpty().first()).toBeVisible({timeout: 30_000});
    }

    /** The manager: the table with its controls above and below. */
    root() {
        return this.frame.dialog().locator('[data-cy="galley-manager"]').first();
    }

    /** The table named "Galleys". */
    table() {
        return this.root().locator('table');
    }

    /** The table's label ("Galleys"), the name the table carries. */
    tableLabel() {
        return this.frame.dialog().getByRole('table', {name: 'Galleys', exact: true});
    }

    /** Every body row, the empty list's "No Items" row included. */
    rowsOrEmpty() {
        return this.table().locator('tbody tr');
    }

    /** The galley rows (the empty row is a single spanning cell). */
    rows() {
        return this.table().locator('tbody tr').filter({hasNot: this.page.locator('td[colspan]')});
    }

    /** The empty list's single line. */
    noItems() {
        return this.table().locator('tbody td[colspan]');
    }

    /** A galley's row by its whole label ("PDF" never matches "PDF2"). */
    row(label) {
        return this.rows().filter({has: this.page.locator('td').first().filter({hasText: whole(label)})});
    }

    /** Each row's name cell, in list order. */
    nameCells() {
        return this.rows().locator('td:first-of-type');
    }

    /** Assert the labels the list shows, top to bottom (web-first). */
    async expectLabels(labels) {
        await expect(this.nameCells()).toHaveText(labels.map(whole), {timeout: 30_000});
    }

    /** The labels shown, top to bottom, once the list has settled on `count` rows. */
    async labels() {
        return (await this.nameCells().allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    }

    /** A row's language cell. */
    languageCell(label) {
        return this.row(label).locator('td').nth(1);
    }

    /** A row's label link (present while the galley has a file). */
    nameLink(label) {
        return this.row(label).locator('td').first().locator('a');
    }

    /** Press a row's label link and return the download it starts (in a new tab). */
    async download(label) {
        const link = this.nameLink(label);
        await expect(link).toBeVisible({timeout: 30_000});
        const {download} = await captureDownload(this.page, () => link.click());
        return download;
    }

    /** Press a row's label link and return the suggested file name of the download. */
    async downloadedName(label) {
        return (await this.download(label)).suggestedFilename();
    }

    /** "Add galley", below the list. */
    addButton() {
        return this.root().locator('button').filter({hasText: whole('Add galley')});
    }

    /** "Order", above the list (outside ordering mode). */
    orderButton() {
        return this.root().locator('button').filter({hasText: whole('Order')});
    }

    /** "Save Order", the same button in ordering mode. */
    saveOrderButton() {
        return this.root().locator('button').filter({hasText: whole('Save Order')});
    }

    /** Any "Cancel" among the manager's controls (ordering mode has none). */
    cancelButton() {
        return this.root().locator('button').filter({hasText: whole('Cancel')});
    }

    /** A row's "More Actions" ("…") button. */
    menuButton(label) {
        return this.row(label).locator('button[aria-label="More Actions"]');
    }

    /** Every button of a row (the "…" button, or the two arrows in ordering mode). */
    rowButtons(label) {
        return this.row(label).locator('button');
    }

    /** The open row menu's items. */
    menuItems() {
        return this.page.getByRole('menuitem');
    }

    /**
     * Press a row's "…" button and return the items it offers, in order;
     * the menu stays open for `choose()` or `closeMenu()`.
     */
    async openMenu(label) {
        const button = this.menuButton(label);
        await expect(button).toBeVisible({timeout: 30_000});
        await button.click();
        await expect(this.menuItems().first()).toBeVisible({timeout: 30_000});
        return (await this.menuItems().allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    }

    /** Close the open row menu with its own button (Escape closes the workflow too, ccK1). */
    async closeMenu(label) {
        await this.menuButton(label).click();
        await expect(this.menuItems()).toHaveCount(0, {timeout: 30_000});
    }

    /** The items a row's menu offers, the menu closed again. */
    async menuOffers(label) {
        const items = await this.openMenu(label);
        await this.closeMenu(label);
        return items;
    }

    /** Pick an item of the open row menu. */
    async choose(item) {
        await this.page.getByRole('menuitem', {name: item, exact: true}).click();
    }

    /** "Add galley": the "Create New Galley" window, loaded. */
    async openCreate() {
        await this.addButton().click();
        const win = new GalleyWindow(this.page, TEXT.createTitle);
        await win.expectLoaded();
        return win;
    }

    /** A row's "Edit": the galley's window, loaded on "Edit Metadata". */
    async openEdit(label, {title = TEXT.editTitle} = {}) {
        await this.openMenu(label);
        await this.choose('Edit');
        const win = new GalleyWindow(this.page, title);
        await win.expectLoaded();
        return win;
    }

    /** A row's "View" (a preprint server's read-only window, "View Galley"). */
    async openView(label, {title = TEXT.viewTitle} = {}) {
        await this.openMenu(label);
        await this.choose('View');
        const win = new GalleyWindow(this.page, title);
        await win.expectLoaded();
        return win;
    }

    /** A row's "Change File": the upload wizard, open on step 1. */
    async openChangeFile(label) {
        await this.openMenu(label);
        await this.choose('Change File');
        const wizard = new UploadWizard(this.page, UPLOAD_TITLE);
        await wizard.expectOpen();
        return wizard;
    }

    /** A row's "More Information" pressed (the window is SubmissionFilesPages' InformationCenter). */
    async openMoreInformation(label) {
        await this.openMenu(label);
        await this.choose('More Information');
    }

    /**
     * The open upload wizard's whole path ("Add galley" › "Save", or "Change
     * File"): the component when one is asked for, the file, "Continue"
     * twice, "Complete"; waits for the window to go and its close window to
     * pass.
     *
     * @param {{component?: string, file: string, name: string}} options
     */
    async uploadInWizard({component, file, name}) {
        const wizard = new UploadWizard(this.page, UPLOAD_TITLE);
        await wizard.expectOpen();
        await wizard.uploadOne({component, file, name});
        await pastCloseWindow(this.page);
    }

    /** The open upload wizard's "Cancel" before any file is up; waits for the close window to pass. */
    async cancelWizard() {
        const wizard = new UploadWizard(this.page, UPLOAD_TITLE);
        await wizard.cancel({uploaded: false});
        await pastCloseWindow(this.page);
    }

    /**
     * "Add galley", the label typed, "Save", and the wizard's upload: the
     * whole "Add galley" path of a galley with a file.
     *
     * @param {{label: string, component: string, file: string, name: string}} options
     */
    async addGalley({label, component, file, name}) {
        const win = await this.openCreate();
        await win.type(win.labelBox(), label);
        await win.save();
        await this.uploadInWizard({component, file, name});
    }

    // --- Deleting ------------------------------------------------------------

    /** The "Delete" dialog. */
    deleteDialog() {
        return this.page.getByRole('dialog', {name: TEXT.deleteTitle, exact: true});
    }

    /** A row's "Delete": the dialog, open. */
    async openDelete(label) {
        await this.openMenu(label);
        await this.choose('Delete');
        await expect(this.deleteDialog()).toBeVisible({timeout: 30_000});
        return this.deleteDialog();
    }

    /** "Cancel" in the "Delete" dialog: it closes; nothing is sent. */
    async cancelDelete() {
        await this.deleteDialog().getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(this.deleteDialog()).toHaveCount(0, {timeout: 30_000});
        await pastCloseWindow(this.page);
    }

    /** "OK" in the "Delete" dialog: resolves with the delete request's answer once the dialog has gone. */
    async confirmDelete() {
        const answered = this.page.waitForResponse(
            (r) => r.url().includes('delete-galley') && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.deleteDialog().getByRole('button', {name: 'OK', exact: true}).click();
        const response = await answered;
        await expect(this.deleteDialog()).toHaveCount(0, {timeout: 30_000});
        await pastCloseWindow(this.page);
        return response;
    }

    // --- Ordering ------------------------------------------------------------

    /** "Order": ordering mode ("Save Order" shows). */
    async startOrdering() {
        await this.orderButton().click();
        await expect(this.saveOrderButton()).toBeVisible({timeout: 30_000});
    }

    /** A row's up arrow in ordering mode (its first button; the arrows carry no name, A5). */
    upArrow(label) {
        return this.rowButtons(label).first();
    }

    /** A row's down arrow in ordering mode (its last button). */
    downArrow(label) {
        return this.rowButtons(label).last();
    }

    /**
     * In ordering mode, move rows with the up arrows until the list reads
     * `target` top to bottom (every label listed once).
     *
     * @param {string[]} target
     */
    async arrange(target) {
        for (let i = 0; i < target.length; i++) {
            const current = await this.labels();
            let at = current.indexOf(target[i]);
            if (at < 0) {
                throw new Error(`arrange: no row "${target[i]}" in ${JSON.stringify(current)}`);
            }
            while (at > i) {
                const expected = [...current];
                [expected[at - 1], expected[at]] = [expected[at], expected[at - 1]];
                await this.upArrow(target[i]).click();
                await this.expectLabels(expected);
                current.splice(0, current.length, ...expected);
                at--;
            }
        }
        await this.expectLabels(target);
    }

    /** "Save Order": waits for the save and for "Order" to come back. */
    async saveOrder() {
        const saved = this.page.waitForResponse(
            (r) => r.url().includes('save-sequence') && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.saveOrderButton().click();
        const response = await saved;
        await expect(this.orderButton()).toBeVisible({timeout: 30_000});
        return response;
    }
};

// -------------------------------------------------------------------------
// The galley window ("Create New Galley", "Edit", "View Galley")
// -------------------------------------------------------------------------

class GalleyWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} title the window's title
     */
    constructor(page, title) {
        super(page);
        this.title = title;
    }

    /** The window, found by its title. */
    dialog() {
        return this.page.getByRole('dialog', {name: this.title, exact: true});
    }

    /** The galley form (`#articleGalleyForm` / `#preprintGalleyForm`). */
    form() {
        return this.dialog().locator('form[id$="GalleyForm"]').first();
    }

    /** A tab of the window ("Edit Metadata", "Identifiers"). */
    tab(name) {
        return this.dialog().getByRole('tab', {name, exact: true});
    }

    /** The form has loaded (its label box is there, the AJAX quiet). */
    async expectLoaded() {
        await expect(this.labelBox()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    labelBox() {
        return this.form().locator('input[name="label"]');
    }

    localeSelect() {
        return this.form().locator('select[name="locale"]');
    }

    remoteBox() {
        return this.form().locator('input[name="remotelyHostedContent"]');
    }

    remoteUrlBox() {
        return this.form().locator('input[name="urlRemote"]');
    }

    urlPathBox() {
        return this.form().locator('input[name="urlPath"]');
    }

    /** "Language"'s option texts, in order. */
    async localeOptions() {
        return (await this.localeSelect().locator('option').allInnerTexts()).map((t) => t.trim());
    }

    /** "Language"'s selected option (a locator, for web-first reads). */
    selectedLocale() {
        return this.localeSelect().locator('option:checked');
    }

    /** Choose a language by its name ("French (Canada)"). */
    async chooseLocale(name) {
        await this.localeSelect().selectOption({label: name});
    }

    /** Type into a box and leave it (the form notices a change on blur). */
    async type(box, value) {
        await box.fill(value);
        await box.blur();
    }

    /** Tick or untick the remote box. */
    async setRemote(want) {
        if (want) {
            await this.remoteBox().check();
        } else {
            await this.remoteBox().uncheck();
        }
    }

    /** The form's "Save" (the HTML galley's nested Dependent Files grid has a "Search" submit of its own). */
    saveButton() {
        return this.form().getByRole('button', {name: 'Save', exact: true}).last();
    }

    /** The form's "Cancel" (a link on the legacy form). */
    cancelControl() {
        return this.form()
            .getByRole('link', {name: 'Cancel', exact: true})
            .or(this.form().getByRole('button', {name: 'Cancel', exact: true}));
    }

    /** The window's header "Close". */
    closeButton() {
        return this.dialog().getByRole('button', {name: 'Close', exact: true}).first();
    }

    /** The form's boxes a person can use (text boxes, lists, the remote box), shown or not. */
    fields() {
        return this.form().locator('input[name="label"], select[name="locale"], input[name="remotelyHostedContent"], input[name="urlRemote"], input[name="urlPath"]');
    }

    /**
     * The read-only window (Rule 7): every field greyed out, "Save" shown
     * greyed out, and no "Cancel". The label box being there is the
     * control of the "Cancel" absence.
     */
    async expectReadOnly() {
        await expect(this.labelBox()).toBeVisible({timeout: 30_000});
        const count = await this.fields().count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
            await expect(this.fields().nth(i)).toBeDisabled();
        }
        await expect(this.saveButton()).toBeVisible();
        await expect(this.saveButton()).toBeDisabled();
        await expect(this.cancelControl()).toHaveCount(0);
    }

    /** The editable window: the label box and "Save" usable, "Cancel" there. */
    async expectEditable() {
        await expect(this.labelBox()).toBeEditable({timeout: 30_000});
        await expect(this.saveButton()).toBeEnabled();
        await expect(this.cancelControl()).toBeVisible();
    }

    /**
     * Press "Save" on a form the server accepts: waits for the save's POST
     * and for the window to close.
     */
    async save() {
        const answered = this.page.waitForResponse(
            (r) => r.url().includes('update-galley') && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.saveButton().click();
        const response = await answered;
        await this.expectClosed();
        return response;
    }

    /**
     * Press "Save" on a form the server refuses: waits for the POST and the
     * re-rendered form; the window stays open.
     */
    async saveRefused() {
        const answered = this.page.waitForResponse(
            (r) => r.url().includes('update-galley') && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.saveButton().click();
        await answered;
        await waitForJQueryIdle(this.page);
        await expect(this.labelBox()).toBeVisible({timeout: 30_000});
        await expect(this.dialog()).toBeVisible();
    }

    /**
     * Press "Save" on a form the browser refuses (an empty required box):
     * the message shows under the box; returns the number of saves sent,
     * counted until the message is there.
     */
    async saveRefusedInBrowser() {
        let sent = 0;
        const count = (/** @type {import('@playwright/test').Request} */ r) => {
            if (r.url().includes('update-galley') && r.method() === 'POST') sent++;
        };
        this.page.on('request', count);
        try {
            await this.saveButton().click();
            await expect(this.form()).toContainText(TEXT.required, {timeout: 30_000});
            await waitForJQueryIdle(this.page);
        } finally {
            this.page.off('request', count);
        }
        return sent;
    }

    /** The form's "Cancel": the window closes. */
    async cancel() {
        await this.cancelControl().click();
        await this.expectClosed();
    }

    /** The header "Close", when it closes the window (nothing changed, or its question answered "OK"). */
    async close() {
        await this.closeButton().click();
        await this.expectClosed();
    }

    /** The window has gone, and the modal store's close window has passed. */
    async expectClosed() {
        await expect(this.dialog()).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
    }
}
exports.GalleyWindow = GalleyWindow;

/**
 * The upload wizard "Add galley" › "Save" and "Change File" open.
 *
 * @param {import('@playwright/test').Page} page
 */
function galleyUploadWizard(page) {
    return new UploadWizard(page, UPLOAD_TITLE);
}
exports.galleyUploadWizard = galleyUploadWizard;

/**
 * The galley links on a published article's (preprint's) reader page, in
 * order (`a.obj_galley_link`, the theme's galley list).
 *
 * @param {import('@playwright/test').Page} page
 */
function readerGalleyLinks(page) {
    return page.locator('a.obj_galley_link');
}
exports.readerGalleyLinks = readerGalleyLinks;
