// @ts-check
/**
 * @file playwright/pages/BodyTextExportPages.js
 *
 * OJS-local page objects for the Body Text's "Export" (spec:
 * docs/specs/U48-jats-and-body-text.md, Rule 24 and scenario 10) and the
 * galleys it makes. The feature is a journal's only, so these stay in the
 * OJS tree beside the shared `JatsBodyTextPages.js` (BodyTextPage) and
 * `GalleysPages.js` (GalleyManager, GalleyWindow), which they build on
 * without changing.
 *
 * Surfaces:
 * - BodyTextExport — the "Document Edit" panel's "Export" menu ("Export to
 *   HTML", "Preview: PDF"), the line under it ("HTML galley saved."), the
 *   "Preview: PDF" page that replaces the editor (its heading, the text in
 *   its frame, "Create PDF" and the line "PDF galley saved." in its
 *   footer), the editor's images (a pasted `<img>` included) and a paste
 *   of HTML from the clipboard.
 * - watchImportBox / importBoxTexts — every text the "Send to Text
 *   Editor" import box shows, recorded as the DOM changes.
 * - ExportedGalleys — the "Galleys" page as an export leaves it: a row is
 *   found by its label link, because the name cell of an exported galley
 *   also reads "Generated from text editor" and "Revision N" (GalleyManager
 *   `row()` matches the whole cell); the rows' names as one set; the
 *   label's download; the row's "Edit" window and its "Dependent Files"
 *   grid.
 *
 * DOM facts (probe tojsr 2026-11-12, `.reports/U48/screen-notes.md`): the
 * menu button is `.body-text-export` "Export" (a reka dropdown, items are
 * `menuitem`s); "HTML galley saved." is the `p[role=status]` of
 * `.sciflow-body-text__document-bar`, gone when an export is refused; the
 * preview is `section.body-text-pdf-preview` (h2 "Publication: Preview:
 * PDF", an `iframe`, a footer `[role=status]`); the exports POST
 * `…/publications/{id}/bodyText` (HTML, 201) and `…/bodyText/pdf` (PDF,
 * 201), a refusal answers 422 and raises the workflow's "Error" window;
 * `img.ProseMirror-separator` (no `src`) sits beside a pasted inline image,
 * so images are counted by `img[src]`. The exported galley's label link
 * answers as an attachment (`bodyText-{publicationId}.html`) and opens an
 * empty tab, which `captureDownload` closes. The galley list's order is
 * not fixed (both rows `seq` 0): compare it as a set (patterns.md 14c).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');
const {GalleyManager, GalleyWindow, GALLEYS_TEXT} = require('../../../../shared/playwright/pages/GalleysPages.js');
const {captureDownload} = require('../../../../shared/playwright/pages/SubmissionFilesPages.js');
const {readDownload} = require('../../../../shared/playwright/pages/JatsBodyTextPages.js');

/** The export's strings, verbatim (ui-library, lib/pkp). */
const TEXT = {
    exportMenu: 'Export',
    exportHtml: 'Export to HTML',
    previewPdf: 'Preview: PDF',
    createPdf: 'Create PDF',
    htmlSaved: 'HTML galley saved.',
    pdfSaved: 'PDF galley saved.',
    previewHeading: 'Publication: Preview: PDF',
    generated: 'Generated from text editor',
    foreignImage: "The HTML references an image that is not attached to this publication's body text.",
    dependentFiles: 'Dependent Files',
};
exports.EXPORT_TEXT = TEXT;

/** Whitespace folded, ends trimmed. */
const flat = (text) => (text || '').replace(/\s+/g, ' ').trim();

/** A POST to the version's Body Text export (`…/bodyText`, or `…/bodyText/pdf`). */
const exportPost = (pdf) => (/** @type {import('@playwright/test').Response} */ r) =>
    (pdf ? /\/bodyText\/pdf$/ : /\/bodyText$/).test(new URL(r.url()).pathname) && r.request().method() === 'POST';

exports.BodyTextExport = class BodyTextExport extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('../../../../shared/playwright/pages/WorkflowPage.js').WorkflowPage} frame
     */
    constructor(page, frame) {
        super(page);
        this.frame = frame;
    }

    /** The panel's "Export" menu button. */
    menuButton() {
        return this.page.locator('.body-text-export').getByRole('button', {name: TEXT.exportMenu, exact: true});
    }

    /** The open menu's items. */
    menuItems() {
        return this.page.getByRole('menu', {name: TEXT.exportMenu}).getByRole('menuitem');
    }

    /** One item of the open menu. */
    menuItem(name) {
        return this.page.getByRole('menuitem', {name, exact: true});
    }

    /** Press "Export": the menu opens; returns nothing (read `menuItems()`). */
    async openMenu() {
        await expect(this.menuButton()).toBeVisible({timeout: 30_000});
        await this.menuButton().click();
        await expect(this.menuItems().first()).toBeVisible({timeout: 30_000});
    }

    /** The line under "Export" ("HTML galley saved."). */
    status() {
        return this.page.locator('.sciflow-body-text__document-bar p[role="status"]');
    }

    /**
     * "Export" › "Export to HTML": returns the export's answer (201 when a
     * galley was made or revised, 422 when it was refused). With
     * `{menuOpen: true}` the menu is already open (`openMenu()`).
     */
    async exportToHtml({menuOpen = false} = {}) {
        if (!menuOpen) {
            await this.openMenu();
        }
        const sent = this.page.waitForResponse(exportPost(false), {timeout: 60_000});
        await this.menuItem(TEXT.exportHtml).click();
        return sent;
    }

    /** The "Preview: PDF" page. */
    preview() {
        return this.page.locator('section.body-text-pdf-preview');
    }

    /** Its heading. */
    previewHeading() {
        return this.preview().locator('h2').first();
    }

    /** The text in its frame. */
    previewBody() {
        return this.preview().frameLocator('iframe').first().locator('body');
    }

    /** "Create PDF". */
    createPdfButton() {
        return this.preview().getByRole('button', {name: TEXT.createPdf, exact: true});
    }

    /** The preview's footer line ("PDF galley saved."). */
    previewStatus() {
        return this.preview().locator('footer [role="status"]');
    }

    /** "Export" › "Preview: PDF": the preview page with its "Create PDF". */
    async openPdfPreview() {
        await this.openMenu();
        await this.menuItem(TEXT.previewPdf).click();
        await expect(this.createPdfButton()).toBeVisible({timeout: 30_000});
    }

    /** "Create PDF": returns the export's answer (the PDF is made on the server, which takes a while). */
    async createPdf() {
        const sent = this.page.waitForResponse(exportPost(true), {timeout: 120_000});
        await this.createPdfButton().click();
        return sent;
    }

    /** The editor's images (a figure's, a pasted one), the editor's own separators left out. */
    images() {
        return this.page.locator('sciflow-editor [contenteditable]').first().locator('img[src]');
    }

    /** The editor's images whose address is `src`. */
    imagesAt(src) {
        return this.page.locator('sciflow-editor [contenteditable]').first().locator(`img[src="${src}"]`);
    }

    /** Let the page's context use the clipboard (once per context). */
    async allowClipboard() {
        await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    }

    /**
     * Put `html` on the clipboard as HTML and paste it where the cursor is
     * (the caller places the cursor first).
     *
     * @param {string} html
     */
    async pasteHtml(html) {
        await this.page.evaluate(async (markup) => {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([markup], {type: 'text/html'}),
                    'text/plain': new Blob([' '], {type: 'text/plain'}),
                }),
            ]);
        }, html);
        await this.page.keyboard.press('ControlOrMeta+v');
    }
};

/**
 * Record every text the Body Text's import box shows, as the DOM takes it
 * (a MutationObserver, so a step that lasts less than a sampling interval
 * is not missed; the shared `BodyTextPage.watchImport()` samples every
 * 25 ms and missed "Converting…" on a fast import). Read with
 * `importBoxTexts(page)`; an empty string while no box shows. Survives the
 * workflow's in-page navigation, not a reload.
 *
 * @param {import('@playwright/test').Page} page
 */
async function watchImportBox(page) {
    await page.evaluate(() => {
        const w = /** @type {any} */ (window);
        if (w.__u48ImportObserver) {
            w.__u48ImportObserver.disconnect();
        }
        w.__u48ImportTexts = [];
        const read = () => {
            const box = document.querySelector('.sciflow-body-text__main [role=status]');
            const text = box ? (box.textContent || '').replace(/\s+/g, ' ').trim() : '';
            const seen = w.__u48ImportTexts;
            if (!seen.length || seen[seen.length - 1] !== text) {
                seen.push(text);
            }
        };
        read();
        w.__u48ImportObserver = new MutationObserver(read);
        w.__u48ImportObserver.observe(document.body, {subtree: true, childList: true, characterData: true});
    });
}
exports.watchImportBox = watchImportBox;

/**
 * The texts `watchImportBox()` recorded, in order; the recording stops.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{stop?: boolean}} [options]
 */
async function importBoxTexts(page, {stop = false} = {}) {
    return page.evaluate((stopNow) => {
        const w = /** @type {any} */ (window);
        if (stopNow && w.__u48ImportObserver) {
            w.__u48ImportObserver.disconnect();
            w.__u48ImportObserver = null;
        }
        return /** @type {string[]} */ (w.__u48ImportTexts || []);
    }, stop);
}
exports.importBoxTexts = importBoxTexts;

exports.ExportedGalleys = class ExportedGalleys extends GalleyManager {
    /** A galley's row by its label link's text ("HTML" never matches "HTML2"). */
    rowByLink(label) {
        return this.rows().filter({
            has: this.page.locator('td:first-of-type a').filter({hasText: new RegExp(`^\\s*${label}\\s*$`)}),
        });
    }

    /** The rows' name cells as one sorted list of folded texts ("HTML Generated from text editor Revision 2"). */
    async names() {
        return (await this.nameCells().allInnerTexts()).map(flat).sort();
    }

    /** Assert the rows' names as a set (the list's order is not fixed). */
    async expectNames(names) {
        await expect.poll(() => this.names(), {timeout: 30_000}).toEqual([...names].sort());
    }

    /** Press a row's label: the file the browser saves. */
    async downloadByLink(label) {
        const link = this.rowByLink(label).locator('td:first-of-type a');
        await expect(link).toBeVisible({timeout: 30_000});
        const {download} = await captureDownload(this.page, () => link.click());
        return readDownload(download);
    }

    /** A row's "More Actions" › "Edit": the galley's window, loaded. */
    async openEditByLink(label) {
        const button = this.rowByLink(label).locator('button[aria-label="More Actions"]');
        await expect(button).toBeVisible({timeout: 30_000});
        await button.click();
        await expect(this.menuItems().first()).toBeVisible({timeout: 30_000});
        await this.choose('Edit');
        const win = new GalleyWindow(this.page, GALLEYS_TEXT.editTitle);
        await win.expectLoaded();
        return win;
    }

    /** The "Dependent Files" heading of an open galley window. */
    dependentFilesHeading(win) {
        return win.dialog().getByRole('heading', {name: TEXT.dependentFiles, exact: true});
    }

    /** The "Dependent Files" grid's file rows (its hidden "No Files" row left out). */
    dependentFileRows(win) {
        return win.dialog().locator('table tbody tr').filter({has: this.page.locator('a[href*="download-file"]')});
    }
};
