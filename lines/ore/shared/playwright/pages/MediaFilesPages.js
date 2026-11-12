// @ts-check
/**
 * @file shared/playwright/pages/MediaFilesPages.js
 *
 * Page objects for the Media files feature (spec:
 * docs/specs/U47-media-files.md), shared by the OJS, OMP and OPS suites.
 * App-neutral: the strings below are lib/pkp's and the ui-library's, the
 * same on a journal, a press and a preprint server; every per-app string
 * (a media type's name, the page heading's "Publication" / "Preprint", a
 * fixture file) is passed in by the suite or comes from the shared
 * `WorkflowPage`'s labels.
 *
 * Surfaces:
 * - MediaFileManager — the workflow's Publication ("Preprint") › version ›
 *   "Media" page: the table labelled "Media Files" with its description
 *   line, "Batch Link Media" and "Add Media File" above it, "No Items";
 *   each row's "ID" cell (shared by a linked pair, `rowspan="2"`), name
 *   link (a download in a new tab), "Type" badges, size and date cells,
 *   and the "More Actions" ("…") menu ("More Information", "Edit
 *   Metadata", "Manually Link Media", "Delete File"); the "Delete media
 *   file?" dialog.
 * - MediaWindow — the four side windows the page opens, found by title:
 *   UploadMediaWindow ("Upload Media File": the drop area, the cards with
 *   their two lists and "Remove", "Upload Files"), MetadataWindow ("Edit
 *   Metadata"), ManualLinkWindow ("Manually Link Media") and
 *   BatchLinkWindow ("Batch Link Media"); each window's header "Close"
 *   and the "Warning" unsaved-changes dialog.
 * - "More Information" opens SubmissionFilesPages' InformationCenter.
 * - `recordPageDialogs` records every browser dialog with its type, so a
 *   page-leave question (`beforeunload`) is told apart from a confirm.
 *
 * DOM shapes (U47 claim check, `.reports/U47/screen-notes.md`, ccK1–ccK3,
 * and the ui-library's MediaFileManager, 2026-09-25): every body group is
 * its own `tbody` (a linked pair is one `tbody` of two rows); a row's
 * cells are `th` for "ID" (only on a group's first row) and "File Name"
 * (so the name is a row's last `th`), then `td` Type, Size, Date
 * uploaded, More Actions; the empty list is one `td[colspan]`. The
 * windows are side modals whose `h1` is the title; a closed one leaves a
 * shell in the DOM until the next navigation, so a closed window is read
 * as "no visible dialog holds that h1". Row and control reads use CSS
 * inside the table: the workflow dialog stays aria-hidden for a moment
 * after a window closes (patterns.md pitfall 4). The media API is
 * `…/publications/{id}/mediaFiles[/…]`; a change is a non-GET request
 * there (PUT and DELETE tunnelled as POST).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {pastCloseWindow} = require('./IdentifiersPages.js');

/** The strings the three apps share (lib/pkp, ui-library), verbatim. */
const TEXT = {
    pageLabel: 'Media',
    tableLabel: 'Media Files',
    description:
        'Upload media files in bulk, including high-resolution versions. After uploading, link each file to its web or high resolution counterpart by clicking Manually Link Media from the More Actions dropdown, or use Batch Link Media to link multiple files at once.',
    noItems: 'No Items',
    addButton: 'Add Media File',
    batchButton: 'Batch Link Media',
    highBadge: 'High resolution',
    menuFull: ['More Information', 'Edit Metadata', 'Manually Link Media', 'Delete File'],
    uploadTitle: 'Upload Media File',
    uploadDescription: 'Upload image or multimedia files in bulk. You can manually adjust or link files later if needed.',
    uploadHeading: 'Upload File',
    dragAndDrop: 'Drag and drop files here.',
    or: 'or',
    clickToUpload: 'Click to upload files',
    uploadFiles: 'Upload Files',
    remove: 'Remove',
    mediaTypeLabel: 'What kind of media is this? (Required)',
    mediaTypeHelp: 'Select a media type from the dropdown.',
    resolutionLabel: 'File resolution type (Required)',
    resolutionHelp: 'Select a file resolution from the dropdown.',
    web: 'Web resolution',
    high: 'High resolution',
    metadataTitle: 'Edit Metadata',
    nameLabel: 'Name of the file',
    nameHelp: '(e.g., Manuscript; Table 1)',
    required: 'This field is required.',
    artworkFields: ['Caption', 'Credit', 'Copyright Owner', 'Permission Terms'],
    supplementaryFields: [
        'Description',
        'Creator (or owner) of file',
        'Publisher',
        'Source',
        'Subject',
        'Contributor or sponsoring agency',
        'Date',
        'Language',
    ],
    linkTitle: 'Manually Link Media',
    selectedFile: 'Selected File',
    linkLabel: 'Select the media file to link as its counterpart',
    linkHelp: 'Only one file can be linked. The file types must differ (web <> high-res).',
    noHigh: 'No high-resolution file',
    noWeb: 'No web version file',
    linkMedia: 'Link Media',
    batchTitle: 'Batch Link Media',
    batchDescription:
        'Link web version media files to their high-resolution counterparts. Select a high-resolution file for each web version below.',
    batchColumns: ['Selected Web Version', 'Link High-Resolution Version'],
    deleteTitle: 'Delete media file?',
    warningTitle: 'Warning',
    formChanged: 'The data on this form has changed. Do you wish to continue without saving?',
    errorTitle: 'Error',
};
exports.MEDIA_TEXT = TEXT;

/** The delete dialog's text for `name` (the name in bold on screen). */
function deleteQuestion(name) {
    return `Are you sure you want to delete "${name}"? This action cannot be undone. If this file is linked to other media, those links will be removed.`;
}
exports.mediaDeleteQuestion = deleteQuestion;

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A whole-text matcher (ignores the padding around the text). */
function whole(text) {
    return new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`);
}

/** Collapse whitespace. */
function flat(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

/** A media API change (upload, save, link, delete): a non-GET request to …/mediaFiles… */
function isMediaChange(/** @type {import('@playwright/test').Response} */ r) {
    return /\/mediaFiles(\/|\?|$)/.test(r.url()) && r.request().method() !== 'GET';
}

/**
 * Record every browser dialog (confirm, alert, beforeunload) with its type
 * and answer it: `accept` by default, or the answer queued with
 * `answerNext`. A page-leave question must be accepted, or the navigation
 * is cancelled (patterns.md "Probe kit").
 *
 * @param {import('@playwright/test').Page} page
 */
function recordPageDialogs(page) {
    /** @type {Array<{type: string, message: string}>} */
    const seen = [];
    /** @type {Array<'accept' | 'dismiss'>} */
    const answers = [];
    const handler = async (/** @type {import('@playwright/test').Dialog} */ dialog) => {
        seen.push({type: dialog.type(), message: dialog.message()});
        const answer = answers.shift() || 'accept';
        if (answer === 'accept') {
            await dialog.accept().catch(() => {});
        } else {
            await dialog.dismiss().catch(() => {});
        }
    };
    page.on('dialog', handler);
    return {
        seen,
        /** The types seen since index `from`. */
        typesSince(from) {
            return seen.slice(from).map((d) => d.type);
        },
        answerNext(/** @type {'accept' | 'dismiss'} */ answer) {
            answers.push(answer);
        },
        stop() {
            page.off('dialog', handler);
        },
    };
}
exports.recordPageDialogs = recordPageDialogs;

/**
 * Press a link that downloads in a new tab and return what the browser
 * got: the download response's status and `Content-Disposition`, and
 * whether a new tab opened (it is closed again). Read through a
 * context-level response listener: the tab's own download event never
 * fires in headless Chromium (U47 ccK1).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function downloadFromNewTab(page, link) {
    const href = await link.getAttribute('href');
    if (!href) {
        throw new Error('downloadFromNewTab: the link has no address');
    }
    const target = new URL(href, page.url()).href;
    const context = page.context();
    /** @type {import('@playwright/test').Page[]} */
    const tabs = [];
    const onPage = (/** @type {import('@playwright/test').Page} */ p) => tabs.push(p);
    context.on('page', onPage);
    const answered = context.waitForEvent('response', {
        predicate: (r) => r.url() === target || r.request().redirectedFrom()?.url() === target,
        timeout: 30_000,
    });
    try {
        await link.click();
        const response = await answered;
        await expect.poll(() => tabs.length, {timeout: 30_000, message: 'a new tab opens'}).toBeGreaterThan(0);
        const disposition = (await response.headerValue('content-disposition')) || '';
        const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
        return {
            status: response.status(),
            disposition,
            fileName: match ? decodeURIComponent(match[1]) : null,
            newTab: tabs.length > 0,
            tabUrl: tabs[0]?.url() ?? null,
        };
    } finally {
        context.off('page', onPage);
        for (const tab of tabs) {
            await tab.close().catch(() => {});
        }
    }
}
exports.downloadFromNewTab = downloadFromNewTab;

// -------------------------------------------------------------------------
// The "Media" page
// -------------------------------------------------------------------------

exports.MediaFileManager = class MediaFileManager extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('./WorkflowPage.js').WorkflowPage} frame
     */
    constructor(page, frame) {
        super(page);
        this.frame = frame;
    }

    /** Open a version's "Media" page by address (editorial view). */
    async open(submissionId, publicationId) {
        await this.frame.gotoEditorial(submissionId, {menuKey: `publication_${publicationId}_media`});
        await this.expectLoaded();
    }

    /** Open a version's "Media" page in the Author's view (My Submissions) by address. */
    async openAuthor(submissionId, publicationId) {
        await this.frame.gotoAuthor(submissionId, {menuKey: `publication_${publicationId}_media`});
        await this.expectLoaded();
    }

    /** Side menu › the newest version › "Media" (the panel already open). */
    async openFromMenu() {
        await this.frame.selectPage(TEXT.pageLabel);
        await this.expectLoaded();
    }

    /** The page's heading and its table have arrived, the list fetched. */
    async expectLoaded() {
        await this.frame.expectPageHeading(TEXT.pageLabel);
        await expect(this.table()).toBeVisible({timeout: 30_000});
        await expect(this.table().locator('tbody tr').first()).toBeVisible({timeout: 30_000});
        await expect(this.spinner()).toHaveCount(0, {timeout: 30_000});
    }

    /** The table labelled "Media Files" (the only one with a "Date uploaded" column). */
    table() {
        return this.page
            .locator('table')
            .filter({has: this.page.locator('thead th', {hasText: /^\s*Date uploaded\s*$/i})});
    }

    /** The table's frame: its label, description and top controls with the table. */
    root() {
        return this.table().locator('xpath=..');
    }

    /** The loading spinner beside the table's label. */
    spinner() {
        return this.root().locator('h3 .pkpSpinner');
    }

    /** The table's label ("Media Files"). */
    label() {
        return this.root().locator('h3').first();
    }

    /** The description line under the label. */
    descriptionLine() {
        return this.root().locator('p').first();
    }

    /** The table's accessible name (its label). */
    namedTable() {
        return this.frame.dialog().getByRole('table', {name: TEXT.tableLabel, exact: true});
    }

    /** "Add Media File", above the list. */
    addButton() {
        return this.root().locator('button').filter({hasText: whole(TEXT.addButton)});
    }

    /** "Batch Link Media", above the list. */
    batchButton() {
        return this.root().locator('button').filter({hasText: whole(TEXT.batchButton)});
    }

    /** The empty list's single line. */
    noItems() {
        return this.table().locator('tbody td[colspan]');
    }

    /** Every file row. */
    rows() {
        return this.table().locator('tbody tr').filter({hasNot: this.page.locator('td[colspan]')});
    }

    /** Each row's name cell (a row's last `th`), in list order. */
    nameCells() {
        return this.rows().locator('th:last-of-type');
    }

    /** A file's name cell by its whole name ("figure.png" never matches "figure.png.bak"). */
    nameCell(name) {
        return this.nameCells().filter({hasText: whole(name)});
    }

    /**
     * A file's row. `target` is the name, or `{name, high}` to tell two
     * files of one name apart by the "High resolution" badge.
     *
     * @param {string | {name: string, high?: boolean}} target
     */
    row(target) {
        const {name, high} = typeof target === 'string' ? {name: target, high: undefined} : target;
        const named = this.rows().filter({has: this.page.locator('th:last-of-type').filter({hasText: whole(name)})});
        if (high === undefined) {
            return named;
        }
        const badge = this.page.locator('td span').filter({hasText: whole(TEXT.highBadge)});
        return high ? named.filter({has: badge}) : named.filter({hasNot: badge});
    }

    /** The group (`tbody`) a file's row belongs to. */
    group(name) {
        return this.table()
            .locator('tbody')
            .filter({has: this.page.locator('tr > th:last-of-type').filter({hasText: whole(name)})});
    }

    /** A row's name link (a download in a new tab). */
    nameLink(name) {
        return this.row(name).locator('th:last-of-type a');
    }

    /** A row's "Type" badges ("Image", "High resolution"). */
    typeCell(name) {
        return this.row(name).locator('td').nth(0);
    }

    sizeCell(name) {
        return this.row(name).locator('td').nth(1);
    }

    dateCell(name) {
        return this.row(name).locator('td').nth(2);
    }

    /** A row's "More Actions" ("…") button. */
    menuButton(name) {
        return this.row(name).locator('button[aria-label="More Actions"], button:has-text("More Actions")');
    }

    /** Every button of a row. */
    rowButtons(name) {
        return this.row(name).locator('button');
    }

    /** The names the list shows, sorted (the order among seeded rows is loose, Rule 1). */
    async sortedNames() {
        return (await this.nameCells().allInnerTexts()).map(flat).sort();
    }

    /** Assert the list shows exactly these names, in any order (web-first). */
    async expectNames(names) {
        await expect.poll(() => this.sortedNames(), {timeout: 30_000}).toEqual([...names].sort());
    }

    /** Assert a row's type badges read exactly `badges` ("Image" or "Image", "High resolution"). */
    async expectType(name, badges) {
        await expect(this.typeCell(name).locator(':scope > div > span')).toHaveText(badges.map(whole), {timeout: 30_000});
    }

    /**
     * Two files linked as a pair: one group of two rows, `first` above
     * `second`, one "ID" cell spanning both.
     */
    async expectPair(first, second) {
        const group = this.group(first);
        await expect(group.locator('tr > th:last-of-type')).toHaveText([whole(first), whole(second)], {timeout: 30_000});
        await expect(group.locator('th[rowspan="2"]')).toHaveCount(1);
    }

    /** A file standing alone: a group of one row with an "ID" cell of its own. */
    async expectAlone(name) {
        const group = this.group(name);
        await expect(group.locator('tr')).toHaveCount(1, {timeout: 30_000});
        await expect(group.locator('tr > th')).toHaveCount(2);
        await expect(group.locator('th[rowspan]')).toHaveCount(0);
    }

    /** A row's "ID" cell text (the pair's or the file's number). */
    async idText(name) {
        return flat(await this.group(name).locator('tr').first().locator('th').first().innerText());
    }

    /** The open row menu's items. */
    menuItems() {
        return this.page.getByRole('menuitem');
    }

    /** Press a row's "…" and return the items it offers, in order; the menu stays open. */
    async openMenu(name) {
        const button = this.menuButton(name);
        await expect(button).toBeVisible({timeout: 30_000});
        await button.click();
        await expect(this.menuItems().first()).toBeVisible({timeout: 30_000});
        return (await this.menuItems().allInnerTexts()).map(flat);
    }

    /** Close the open row menu with its own button (Escape closes the workflow too, ccK2). */
    async closeMenu(name) {
        await this.menuButton(name).click();
        await expect(this.menuItems()).toHaveCount(0, {timeout: 30_000});
    }

    /** The items a row's menu offers, the menu closed again. */
    async menuOffers(name) {
        const items = await this.openMenu(name);
        await this.closeMenu(name);
        return items;
    }

    /** A row's menu item pressed. */
    async choose(name, item) {
        await this.openMenu(name);
        await this.page.getByRole('menuitem', {name: item, exact: true}).click();
    }

    /** Press a row's name and return what the browser got (see `downloadFromNewTab`). */
    async download(name) {
        const link = this.nameLink(name);
        await expect(link).toBeVisible({timeout: 30_000});
        return downloadFromNewTab(this.page, link);
    }

    // --- Windows ------------------------------------------------------------

    /** "Add Media File": the "Upload Media File" window, open. */
    async openUpload() {
        await this.addButton().click();
        const win = new UploadMediaWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** "Batch Link Media": its window, its table loaded. */
    async openBatch() {
        await this.batchButton().click();
        const win = new BatchLinkWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** A row's "Edit Metadata": its window, the name box filled. */
    async openMetadata(name) {
        await this.choose(name, 'Edit Metadata');
        const win = new MetadataWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** A row's "Manually Link Media": its window, loaded. */
    async openManualLink(name) {
        await this.choose(name, 'Manually Link Media');
        const win = new ManualLinkWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** A row's "More Information" pressed (the window is SubmissionFilesPages' InformationCenter). */
    async openMoreInformation(name) {
        await this.choose(name, 'More Information');
    }

    /**
     * The whole "Add Media File" path: the files chosen through "Click to
     * upload files", each card's media type and resolution, "Upload
     * Files"; resolves once the window has closed and the list shows every
     * new name.
     *
     * @param {Array<{file: string, name: string, mediaType: string, resolution?: string}>} files
     */
    async addFiles(files) {
        const win = await this.openUpload();
        await win.chooseFiles(files.map((f) => f.file));
        for (const f of files) {
            await win.expectUploaded(f.name);
            await win.chooseMediaType(f.name, f.mediaType);
            if (f.resolution) {
                await win.chooseResolution(f.name, f.resolution);
            }
        }
        await win.submit();
        for (const f of files) {
            await expect(this.nameCell(f.name).first()).toBeVisible({timeout: 30_000});
        }
    }

    // --- Deleting -------------------------------------------------------------

    /** The "Delete media file?" dialog. */
    deleteDialog() {
        return this.page.getByRole('dialog', {name: TEXT.deleteTitle, exact: true});
    }

    /** A row's "Delete File": the dialog, open. */
    async openDelete(name) {
        await this.choose(name, 'Delete File');
        await expect(this.deleteDialog()).toBeVisible({timeout: 30_000});
        return this.deleteDialog();
    }

    /** "Cancel" in the delete dialog: it closes; nothing is sent. */
    async cancelDelete() {
        await this.deleteDialog().getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(this.deleteDialog()).toHaveCount(0, {timeout: 30_000});
        await pastCloseWindow(this.page);
    }

    /** "OK" in the delete dialog: resolves with the delete's answer once the dialog has gone. */
    async confirmDelete() {
        const answered = this.page.waitForResponse(isMediaChange, {timeout: 30_000});
        await this.deleteDialog().getByRole('button', {name: 'OK', exact: true}).click();
        const response = await answered;
        await expect(this.deleteDialog()).toHaveCount(0, {timeout: 30_000});
        await pastCloseWindow(this.page);
        return response;
    }
};
// -------------------------------------------------------------------------
// The side windows
// -------------------------------------------------------------------------

class MediaWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} title
     */
    constructor(page, title) {
        super(page);
        this.title = title;
    }

    /** The window, found by its title (the side modal's h1). */
    dialog() {
        return this.page.getByRole('dialog', {name: this.title, exact: true});
    }

    /** The window's title. */
    heading() {
        return this.dialog().locator('h1').filter({hasText: whole(this.title)});
    }

    /** The line under the title. */
    descriptionLine() {
        return this.dialog().locator('[data-cy="sidemodal-header"] h1 + *');
    }

    /** The window's header "Close" (the back arrow, screen-reader "Close"). */
    closeButton() {
        return this.dialog().getByRole('button', {name: 'Close', exact: true}).first();
    }

    async expectOpen() {
        await expect(this.heading()).toBeVisible({timeout: 30_000});
    }

    /** No visible dialog holds the window's title (the closed shell may linger), and the close window has passed. */
    async expectClosed() {
        await expect(
            this.page.locator('[role="dialog"]:visible').filter({has: this.page.locator('h1').filter({hasText: whole(this.title)})})
        ).toHaveCount(0, {timeout: 30_000});
        await pastCloseWindow(this.page);
    }

    /** The "Warning" unsaved-changes dialog. */
    warningDialog() {
        return this.page.getByRole('dialog', {name: TEXT.warningTitle, exact: true});
    }

    /** Press `control` and expect the "Warning" dialog with its question; returns it. */
    async pressExpectingWarning(control) {
        await control.click();
        const dialog = this.warningDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(TEXT.formChanged);
        await expect(dialog.getByRole('button', {name: 'Yes', exact: true})).toBeVisible();
        await expect(dialog.getByRole('button', {name: 'No', exact: true})).toBeVisible();
        return dialog;
    }

    /** "No" in the "Warning" dialog: it closes and the window stays. */
    async answerNo() {
        await this.warningDialog().getByRole('button', {name: 'No', exact: true}).click();
        await expect(this.warningDialog()).toHaveCount(0, {timeout: 30_000});
        await expect(this.heading()).toBeVisible();
    }

    /** "Yes" in the "Warning" dialog: it and the window close. */
    async answerYes() {
        await this.warningDialog().getByRole('button', {name: 'Yes', exact: true}).click();
        await expect(this.warningDialog()).toHaveCount(0, {timeout: 30_000});
        await this.expectClosed();
    }

    /** The header "Close" on a window with no change: it closes at once. */
    async close() {
        await this.closeButton().click();
        await this.expectClosed();
    }
}
exports.MediaWindow = MediaWindow;

/** "Upload Media File" ("Add Media File"). */
class UploadMediaWindow extends MediaWindow {
    constructor(page) {
        super(page, TEXT.uploadTitle);
    }

    /** The uploader: its heading, drop area, cards and "Upload Files". */
    uploader() {
        return this.dialog().locator('#mediaFileAddUploader');
    }

    /** "Upload File", the heading over the drop area. */
    uploaderHeading() {
        return this.uploader().locator('h3');
    }

    /** The drop area (its three lines and the link). */
    dropArea() {
        return this.uploader().locator('div.cursor-pointer').first();
    }

    /** "Click to upload files". */
    clickToUpload() {
        return this.dropArea().locator('button').filter({hasText: whole(TEXT.clickToUpload)});
    }

    /** "Upload Files" (shown once a file is on the window). */
    uploadFilesButton() {
        return this.dialog().getByRole('button', {name: TEXT.uploadFiles, exact: true});
    }

    /** Every card. */
    cards() {
        return this.uploader().locator('div.mb-4.rounded.bg-tertiary');
    }

    /** A file's card, by the file name it shows. */
    card(name) {
        return this.cards().filter({has: this.page.locator('.text-base-bold').filter({hasText: whole(name)})});
    }

    /** A card's name line. */
    cardName(name) {
        return this.card(name).locator('span.text-base-bold');
    }

    /** A card's size line. */
    cardSize(name) {
        return this.card(name).locator('span.text-xs-normal');
    }

    /** A card's "Remove" (×). */
    removeButton(name) {
        return this.card(name).getByRole('button', {name: TEXT.remove, exact: true});
    }

    /** A card's "What kind of media is this?" list. */
    mediaTypeSelect(name) {
        return this.card(name).locator('select[id*="-genreId-"]');
    }

    /** A card's "File resolution type" list. */
    resolutionSelect(name) {
        return this.card(name).locator('select[id*="-variantType-"]');
    }

    /** A card's list labels ("… (Required)") and help lines. */
    cardLabels(name) {
        return this.card(name).locator('label');
    }

    cardHelp(name) {
        return this.card(name).locator('label + p');
    }

    /** The selected option's text of a list ('' when nothing is chosen). */
    async selectedText(select) {
        return select.evaluate((/** @type {HTMLSelectElement} */ s) =>
            s.selectedIndex >= 0 ? (s.options[s.selectedIndex].textContent || '').trim() : ''
        );
    }

    /**
     * Press "Click to upload files" and choose `files` (absolute paths) in
     * the browser's file chooser; one card per file shows.
     *
     * @param {string[]} files
     */
    async chooseFiles(files) {
        const chooser = this.page.waitForEvent('filechooser', {timeout: 30_000});
        await this.clickToUpload().click();
        await (await chooser).setFiles(files);
    }

    /** A card's upload has finished: its media-type list shows. */
    async expectUploaded(name) {
        await expect(this.mediaTypeSelect(name)).toBeVisible({timeout: 30_000});
    }

    async chooseMediaType(name, mediaType) {
        await this.mediaTypeSelect(name).selectOption({label: mediaType});
    }

    async chooseResolution(name, resolution) {
        await this.resolutionSelect(name).selectOption({label: resolution});
    }

    /** "Remove" on a card: the card goes. */
    async removeCard(name) {
        await this.removeButton(name).click();
        await expect(this.card(name)).toHaveCount(0, {timeout: 30_000});
    }

    /** "Upload Files": the media API's add answers, the window closes. */
    async submit() {
        const answered = this.page.waitForResponse(isMediaChange, {timeout: 30_000});
        await this.uploadFilesButton().click();
        const response = await answered;
        expect(response.status(), 'the add answers 200').toBe(200);
        await this.expectClosed();
        return response;
    }
}
exports.UploadMediaWindow = UploadMediaWindow;

/** A form window ("Edit Metadata", "Manually Link Media"): a Vue form with "Save"-like and "Cancel" buttons. */
class FormWindow extends MediaWindow {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} title
     * @param {string} submitLabel
     */
    constructor(page, title, submitLabel) {
        super(page, title);
        this.submitLabel = submitLabel;
    }

    form() {
        return this.dialog().locator('form').first();
    }

    /** A field (`.pkpFormField`) by the start of its label. */
    field(label) {
        return this.form()
            .locator('.pkpFormField')
            .filter({has: this.page.locator('.pkpFormFieldLabel, legend').filter({hasText: new RegExp(`^\\s*${escapeRegExp(label)}`)})})
            .first();
    }

    /** A field's first box (text box, text area, date or list). */
    box(label) {
        return this.field(label).locator('input:not([type=hidden]), textarea, select').first();
    }

    /** A field's help line. */
    help(label) {
        return this.field(label).locator('.pkpFormField__description');
    }

    /** The field labels, in order, without the required marker. */
    async fieldLabels() {
        return this.form()
            .locator('.pkpFormFieldLabel')
            .evaluateAll((labels) =>
                labels.map((l) => {
                    const copy = /** @type {Element} */ (l.cloneNode(true));
                    copy.querySelectorAll('.pkpFormFieldLabel__required').forEach((e) => e.remove());
                    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
                })
            );
    }

    /** Assert the form's field labels, in order (web-first). */
    async expectFieldLabels(labels) {
        await expect.poll(() => this.fieldLabels(), {timeout: 30_000}).toEqual(labels);
    }

    submitButton() {
        return this.form().getByRole('button', {name: this.submitLabel, exact: true});
    }

    cancelButton() {
        return this.form().getByRole('button', {name: 'Cancel', exact: true});
    }

    /** Type into a box (replacing what it holds). */
    async type(label, value) {
        await this.box(label).fill(value);
    }

    /** The form's submit, accepted: the media API answers and the window closes. */
    async submit() {
        const answered = this.page.waitForResponse(isMediaChange, {timeout: 30_000});
        await this.submitButton().click();
        const response = await answered;
        expect(response.status(), `"${this.submitLabel}" answers 200`).toBe(200);
        await this.expectClosed();
        return response;
    }

    /** "Cancel" with no change: the window closes at once. */
    async cancel() {
        await this.cancelButton().click();
        await this.expectClosed();
    }
}

/** "Edit Metadata". */
class MetadataWindow extends FormWindow {
    constructor(page) {
        super(page, TEXT.metadataTitle, 'Save');
    }

    /** The window is open and its name box holds the file's name. */
    async expectOpen() {
        await super.expectOpen();
        await expect(this.nameBox()).not.toHaveValue('', {timeout: 30_000});
    }

    nameBox() {
        return this.box(TEXT.nameLabel);
    }

    /** "Save" refused in the browser (an empty name): the message under the box, nothing sent, the window open. */
    async saveRefused() {
        let sent = 0;
        const count = (/** @type {import('@playwright/test').Request} */ r) => {
            if (/\/mediaFiles/.test(r.url()) && r.method() !== 'GET') sent++;
        };
        this.page.on('request', count);
        try {
            await this.submitButton().click();
            await expect(this.field(TEXT.nameLabel)).toContainText(TEXT.required, {timeout: 30_000});
        } finally {
            this.page.off('request', count);
        }
        await expect(this.heading()).toBeVisible();
        return sent;
    }
}
exports.MetadataWindow = MetadataWindow;

/** "Manually Link Media". */
class ManualLinkWindow extends FormWindow {
    constructor(page) {
        super(page, TEXT.linkTitle, TEXT.linkMedia);
    }

    async expectOpen() {
        await super.expectOpen();
        await expect(this.targetSelect()).toBeVisible({timeout: 30_000});
    }

    /** "Selected File", greyed out. */
    selectedFileBox() {
        return this.box(TEXT.selectedFile);
    }

    /** "Select the media file to link as its counterpart". */
    targetSelect() {
        return this.field(TEXT.linkLabel).locator('select');
    }

    /** The list's options, in order. */
    async options() {
        return (await this.targetSelect().locator('option').allInnerTexts()).map(flat);
    }

    /** The list's chosen option (a locator, for web-first reads). */
    chosen() {
        return this.targetSelect().locator('option:checked');
    }

    async choose(label) {
        await this.targetSelect().selectOption({label});
    }
}
exports.ManualLinkWindow = ManualLinkWindow;

/** "Batch Link Media". */
class BatchLinkWindow extends MediaWindow {
    constructor(page) {
        super(page, TEXT.batchTitle);
    }

    async expectOpen() {
        await super.expectOpen();
        await expect(this.table()).toBeVisible({timeout: 30_000});
    }

    table() {
        return this.dialog().getByRole('table', {name: TEXT.batchTitle, exact: true});
    }

    columnHeaders() {
        return this.table().locator('thead th');
    }

    /** The body rows (the empty table's "No Items" row included). */
    bodyRows() {
        return this.table().locator('tbody tr');
    }

    /** The web files the table lists (each row's header cell), in order. */
    webNames() {
        return this.table().locator('tbody tr th');
    }

    /** A web file's list ("Select high-resolution version for {name}"). */
    select(webName) {
        return this.table().locator('tbody tr').filter({has: this.page.locator('th').filter({hasText: whole(webName)})}).locator('select');
    }

    async options(webName) {
        return (await this.select(webName).locator('option').allInnerTexts()).map(flat);
    }

    chosen(webName) {
        return this.select(webName).locator('option:checked');
    }

    async choose(webName, label) {
        await this.select(webName).selectOption({label});
    }

    cancelButton() {
        return this.dialog().getByRole('button', {name: 'Cancel', exact: true});
    }

    linkButton() {
        return this.dialog().getByRole('button', {name: TEXT.linkMedia, exact: true});
    }

    /** "Link Media": the media API answers and the window closes. */
    async link() {
        const answered = this.page.waitForResponse(isMediaChange, {timeout: 30_000});
        await this.linkButton().click();
        const response = await answered;
        expect(response.status(), '"Link Media" answers 200').toBe(200);
        await this.expectClosed();
        return response;
    }

    /** "Cancel" with no change: the window closes at once. */
    async cancel() {
        await this.cancelButton().click();
        await this.expectClosed();
    }
}
exports.BatchLinkWindow = BatchLinkWindow;
