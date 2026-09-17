// @ts-check
/**
 * @file playwright/pages/HighlightsPages.js
 *
 * OJS-local Page Object and flow helpers for the Highlights feature
 * (spec: docs/specs/U11-highlights.md).
 *
 * Surfaces:
 * - HighlightsTab — Settings › Website › Setup › Highlights: the list panel
 *   (`.highlightsListPanel`), its "Order" / "Save Order" + "Cancel" / "Add
 *   Highlight" header, the rows with "Edit" and "Delete", ordering mode's
 *   up and down arrows, and the "Delete Highlight" dialog.
 * - HighlightPanel — the "Add Highlight" / "Edit Highlight" side panel: the
 *   one-line TinyMCE "Title", the TinyMCE "Description", the "URL" and
 *   "Button Label" boxes (one per form language), the "Image" dropzone with
 *   its preview, "Alternate text", "Remove" and "Restore Original", the
 *   language buttons at the top, the error summary and "Save".
 * - carousel(page) — the home page's `.highlights` block: slides, arrows,
 *   dots.
 *
 * Labels are the live locale strings; DOM shapes from lib/ui-library
 * src/components/ListPanel/highlights/*, src/components/Form/fields/
 * FieldUploadImage.vue and FieldRichText.vue, and the default theme's
 * highlights.tpl, confirmed against the running app while this suite was
 * built (2026-09-17; the kept claim-check scripts under
 * shared/playwright/checks/U11/ hold the same locators).
 */
const {expect} = require('@playwright/test');

const T = 30_000;

exports.HighlightsTab = class HighlightsTab {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the journal's url path
     */
    constructor(page, contextPath) {
        this.page = page;
        this.contextPath = contextPath;
    }

    /**
     * Open Settings › Website in the given interface language, select the
     * outer "Setup" tab when it is not current, then the "Highlights" side
     * tab (its raw key in French, A7), and wait for the panel.
     *
     * @param {{locale?: 'en' | 'fr_CA'}} options
     */
    async goto({locale = 'en'} = {}) {
        await this.page.goto(`/index.php/${this.contextPath}/${locale}/management/settings/website`);
        // The outer "Setup" tab comes first in the DOM; Appearance › Setup
        // carries the same id (patterns.md, locator pitfall 2).
        const setupTab = this.page.locator('#setup-button').first();
        await expect(setupTab).toBeVisible({timeout: T});
        if ((await setupTab.getAttribute('aria-selected')) !== 'true') {
            await setupTab.click();
        }
        await this.sideTab(locale).click();
        await expect(this.panel()).toBeVisible({timeout: T});
    }

    /** The Setup side tab that opens the list (`##common.highlights##` in French, A7). */
    sideTab(locale = 'en') {
        return this.page
            .locator('#setup')
            .first()
            .getByRole('tab', {name: locale === 'fr_CA' ? '##common.highlights##' : 'Highlights', exact: true});
    }

    /** The list panel. */
    panel() {
        return this.page.locator('.highlightsListPanel');
    }

    /** The panel's rows in display order. */
    rows() {
        return this.panel().locator('.listPanel__item');
    }

    /** The row whose name reads `title`. */
    row(title) {
        return this.rows().filter({has: this.page.locator('.listPanel__itemTitle', {hasText: title})});
    }

    /** Every row's name, in display order. */
    async rowTitles() {
        return this.rows().locator('.listPanel__itemTitle').allInnerTexts();
    }

    /** The empty list's "No items found." */
    emptyMessage() {
        return this.panel().getByText('No items found.', {exact: true});
    }

    addButton() {
        return this.panel().getByRole('button', {name: 'Add Highlight', exact: true});
    }

    orderButton() {
        return this.panel().getByRole('button', {name: 'Order', exact: true});
    }

    saveOrderButton() {
        return this.panel().getByRole('button', {name: 'Save Order', exact: true});
    }

    cancelOrderButton() {
        return this.panel().getByRole('button', {name: 'Cancel', exact: true});
    }

    editButton(title) {
        return this.row(title).getByRole('button', {name: 'Edit', exact: true});
    }

    deleteButton(title) {
        return this.row(title).getByRole('button', {name: 'Delete', exact: true});
    }

    /** Ordering mode's arrows, named for a screen reader (Rule 9). */
    upArrow(title) {
        return this.page.getByRole('button', {name: `Increase position of ${title}`, exact: true});
    }

    downArrow(title) {
        return this.page.getByRole('button', {name: `Decrease position of ${title}`, exact: true});
    }

    /** Press "Add Highlight" and wait for the panel's form. */
    async openAdd() {
        await this.addButton().click();
        const panel = new HighlightPanel(this.page, 'Add Highlight');
        await panel.expectOpen();
        return panel;
    }

    /** Press a row's "Edit" and wait for the "Edit Highlight" panel. */
    async openEdit(title) {
        await this.editButton(title).click();
        const panel = new HighlightPanel(this.page, 'Edit Highlight');
        await panel.expectOpen();
        return panel;
    }

    /**
     * Add a highlight through the panel and wait for its row (Rule 5).
     *
     * @param {{title: string, description?: string, url: string, label: string, image?: string, alt?: string}} highlight
     */
    async addHighlight({title, description, url, label, image, alt}) {
        const panel = await this.openAdd();
        await panel.typeTitle(title);
        if (description) {
            await panel.typeDescription(description);
        }
        await panel.urlInput().fill(url);
        await panel.buttonLabelInput().fill(label);
        if (image) {
            await panel.uploadImage(image);
            if (alt !== undefined) {
                await panel.altTextInput().fill(alt);
            }
        }
        await panel.save();
        await expect(this.row(title)).toBeVisible({timeout: T});
    }

    /** "Save Order", bounded by the order request answering OK (Rule 9). */
    async saveOrder() {
        const saved = this.page.waitForResponse(
            (r) => /\/highlights\/order$/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
            {timeout: T}
        );
        await this.saveOrderButton().click();
        await saved;
        await expect(this.orderButton()).toBeVisible({timeout: T});
    }

    /** The "Delete Highlight" dialog (Rule 8). */
    deleteDialog() {
        return this.page.getByRole('dialog').filter({hasText: 'Delete Highlight'});
    }

    /** "Yes" in the delete dialog, bounded by the delete request answering OK. */
    async confirmDelete() {
        const deleted = this.page.waitForResponse(
            (r) =>
                /\/highlights\/\d+$/.test(r.url()) &&
                r.request().method() === 'POST' &&
                r.request().headers()['x-http-method-override'] === 'DELETE' &&
                r.ok(),
            {timeout: T}
        );
        await this.deleteDialog().getByRole('button', {name: 'Yes', exact: true}).click();
        await deleted;
        await expect(this.deleteDialog()).toHaveCount(0, {timeout: T});
    }
};

const HighlightPanel = class HighlightPanel {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {'Add Highlight' | 'Edit Highlight'} title
     */
    constructor(page, title) {
        this.page = page;
        this.title = title;
        this.dialog = page.getByRole('dialog', {name: title});
    }

    /** The panel with its footer's "Save" on screen (the form renders after the dialog). */
    async expectOpen() {
        await expect(this.dialog).toBeVisible({timeout: T});
        await expect(this.saveButton()).toBeVisible({timeout: T});
    }

    /** The field wrapper holding the given control (`.pkpFormField`). */
    fieldOf(controlSelector) {
        return this.dialog.locator('.pkpFormField').filter({has: this.page.locator(controlSelector)});
    }

    titleField(locale = 'en') {
        return this.fieldOf(`#highlight-title-control-${locale}_ifr`);
    }

    descriptionField(locale = 'en') {
        return this.fieldOf(`#highlight-description-control-${locale}_ifr`);
    }

    urlField() {
        return this.fieldOf('#highlight-url-control');
    }

    buttonLabelField(locale = 'en') {
        return this.fieldOf(`#highlight-urlText-control-${locale}`);
    }

    imageField() {
        return this.dialog.locator('.pkpFormField--uploadImage');
    }

    /** A field's label element (its text carries "{Field} in French" on a second language). */
    label(field) {
        return field.locator('label.pkpFormFieldLabel').first();
    }

    /** The field's message under its box (`.pkpFieldError`). */
    fieldError(field) {
        return field.locator('.pkpFieldError');
    }

    urlInput() {
        return this.dialog.locator('#highlight-url-control');
    }

    buttonLabelInput(locale = 'en') {
        return this.dialog.locator(`#highlight-urlText-control-${locale}`);
    }

    /**
     * A rich-text box's editable body, once TinyMCE has made it editable
     * (text typed earlier is wiped; patterns.md "UI realities").
     */
    async richBody(field) {
        const frame = field.locator('iframe').first();
        await expect(frame).toBeVisible({timeout: T});
        const body = frame.contentFrame().locator('body');
        await expect(body).toHaveAttribute('contenteditable', 'true', {timeout: T});
        return body;
    }

    /** Replace a rich-text box's content with `text` (empty clears it). */
    async setRich(field, text) {
        const body = await this.richBody(field);
        await body.click();
        await this.page.keyboard.press('ControlOrMeta+A');
        await this.page.keyboard.press('Delete');
        if (text) {
            await body.pressSequentially(text);
        }
        await expect(body).toHaveText(text ? text : '', {timeout: T});
    }

    async typeTitle(text, locale = 'en') {
        await this.setRich(this.titleField(locale), text);
    }

    async typeDescription(text, locale = 'en') {
        await this.setRich(this.descriptionField(locale), text);
    }

    /** The "Title" box's text as shown. */
    async titleText(locale = 'en') {
        return (await this.richBody(this.titleField(locale))).innerText();
    }

    /** The language button at the top of a two-language panel ("French"). */
    localeButton(name) {
        return this.dialog.locator('.pkpFormLocales button').filter({hasText: name});
    }

    /** The dropzone's hidden file input (appended to the body, so the last one on the page). */
    fileInput() {
        return this.page.locator('input[type=file]').last();
    }

    /** The preview image ("Preview of the currently selected image."). */
    preview() {
        return this.imageField().locator('.pkpFormField--upload__preview img');
    }

    altTextInput() {
        return this.imageField().locator('input.pkpFormField--uploadImage__altTextInput');
    }

    removeButton() {
        return this.imageField().getByRole('button', {name: 'Remove', exact: true});
    }

    restoreButton() {
        return this.imageField().getByRole('button', {name: 'Restore Original', exact: true});
    }

    /**
     * The box's refusal of a file ("You can't upload files of this type."):
     * the Image field's own message under the box (`.pkpFieldError`; the
     * dropzone's preview template carries no `.dz-error-message`, 2026-09-17).
     */
    dropzoneError() {
        return this.fieldError(this.imageField());
    }

    /** The refused file's entry in the box (its name and a "Remove file" link). */
    refusedFile() {
        return this.imageField().locator('.dz-preview.dz-error');
    }

    /**
     * Drop an image into the box, bounded by its temporary-file upload
     * answering OK, and wait for the preview.
     */
    async uploadImage(filePath) {
        const uploaded = this.page.waitForResponse(
            (r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
            {timeout: T}
        );
        await this.fileInput().setInputFiles(filePath);
        await uploaded;
        await expect(this.preview()).toBeVisible({timeout: T});
    }

    saveButton() {
        return this.dialog.getByRole('button', {name: 'Save', exact: true});
    }

    /** The error summary under the fields, above "Save" (`.pkpFormErrors`). */
    errorSummary() {
        return this.dialog.locator('.pkpFormErrors');
    }

    /** A "Go to {field}: {message}" button of the summary. */
    errorLink(text) {
        return this.errorSummary().getByRole('button', {name: text, exact: true});
    }

    /**
     * Press Save, bounded by the highlights API answering OK (useFetch
     * tunnels PUT via POST, so an edit is a POST too), and wait for the
     * panel to close.
     */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => /\/api\/v1\/highlights(\/\d+)?$/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
            {timeout: T}
        );
        await this.saveButton().click();
        await saved;
        await expect(this.dialog).toHaveCount(0, {timeout: T});
    }

    /**
     * Press Save on a panel the form refuses in place: the summary reads
     * `summary`, the panel stays open and Save is grayed out (Fields).
     */
    async saveRefused(summary) {
        await this.saveButton().click();
        await expect(this.errorSummary()).toContainText(summary, {timeout: T});
        await expect(this.dialog).toBeVisible();
        await expect(this.saveButton()).toBeDisabled();
    }

    /** The panel's close control (the button whose screen-reader text is "Close"). */
    async close() {
        await this.dialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(this.dialog).toHaveCount(0, {timeout: T});
    }
};
exports.HighlightPanel = HighlightPanel;

/**
 * The home page's carousel (`.highlights`, footnote j): slides in document
 * order, the active slide, the arrows and the dots.
 *
 * @param {import('@playwright/test').Page} page
 */
exports.carousel = function carousel(page) {
    const block = page.locator('.highlights');
    const slides = block.locator('li.swiper-slide');
    const slide = (n) => slides.nth(n);
    return {
        block,
        /** The screen-reader heading above the carousel. */
        heading: block.locator('h2'),
        slides,
        slide,
        activeSlide: block.locator('li.swiper-slide-active'),
        titleOf: (s) => s.locator('.swiper-slide-title'),
        descriptionOf: (s) => s.locator('.swiper-slide-desc'),
        buttonOf: (s) => s.locator('a.swiper-slide-button'),
        imageOf: (s) => s.locator('img'),
        /** Every slide's headline in document order. */
        titles: () => slides.locator('.swiper-slide-title').allInnerTexts(),
        prev: block.locator('.swiper-button-prev'),
        next: block.locator('.swiper-button-next'),
        dots: block.locator('.swiper-pagination-bullet'),
        activeDot: block.locator('.swiper-pagination-bullet-active'),
        /** The home page's block that holds the carousel and its siblings (`div.page_index_journal`). */
        pageBlocks: page.locator('.pkp_structure_main > div.page_index_journal > div'),
    };
};
