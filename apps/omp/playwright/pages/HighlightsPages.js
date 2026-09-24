// @ts-check
/**
 * @file playwright/pages/HighlightsPages.js
 *
 * OMP-local Page Objects for the Highlights feature
 * (spec: docs/specs/U11-highlights.md). The OJS and OPS suites keep their
 * own copies (PRINCIPLES M1); the shared HighlightsListPanel, the
 * highlight form and the default theme's carousel are identical across
 * the apps at the pinned tips, so the shapes match.
 *
 * Surfaces:
 * - HighlightsTab — Settings › Website › Setup › Highlights: the list panel
 *   (rows, "No items found.", "Order" / "Save Order" / "Cancel" / "Add
 *   Highlight"), the ordering arrows and the "Delete Highlight" dialog.
 * - HighlightPanel — the "Add Highlight" / "Edit Highlight" side panel:
 *   its five fields (the TinyMCE "Title" and "Description", "URL", "Button
 *   Label", the "Image" dropzone with its preview, "Alternate text",
 *   "Remove" and "Restore Original"), the language toggle, the refusal
 *   summary and "Save" / "Close".
 * - HomeCarousel — the press home page's carousel: the block, its slides
 *   (headline, description, button, picture), the arrows and the dots.
 *
 * Labels are the live locale strings; DOM shapes from lib/ui-library
 * src/components/ListPanel/highlights/*, src/components/Form/* and the
 * default theme's highlights.tpl + main.js (Swiper), confirmed against the
 * running OMP app while this suite was built (2026-09-17). Locators for
 * every screen were first found by the U11 claim-check scripts
 * (shared/playwright/checks/U11/).
 */
const {expect} = require('@playwright/test');

const T = 30_000;

/** The management page's address on a context, with the locale segment. */
function websiteSettingsUrl(contextPath, locale = 'en') {
    return `/index.php/${contextPath}/${locale}/management/settings/website`;
}
exports.websiteSettingsUrl = websiteSettingsUrl;

exports.HighlightsTab = class HighlightsTab {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /**
     * Open Settings › Website on `contextPath`, select the top "Setup" tab
     * (only when another top tab is current) and the "Highlights" side
     * tab, and wait for the list panel. The side tab is reached by its
     * stable id (`#highlights-button`), so the same call works in the
     * French interface, where it reads "En vedette" (scenario 4 asserts
     * the label).
     */
    async goto(contextPath, {locale = 'en'} = {}) {
        await this.page.goto(websiteSettingsUrl(contextPath, locale));
        await this.openTab();
    }

    /** Select "Setup" › "Highlights" on the Website settings page already open. */
    async openTab() {
        const setupTab = this.page.locator('#setup-button');
        await expect(setupTab).toBeVisible({timeout: T});
        if ((await setupTab.getAttribute('aria-selected')) !== 'true') {
            await setupTab.click();
        }
        await this.sideTab().click();
        await expect(this.panel()).toBeVisible({timeout: T});
    }

    /** The "Highlights" side tab under Setup (by id, label-agnostic). */
    sideTab() {
        return this.page.locator('#setup').locator('#highlights-button');
    }

    /** The list panel. */
    panel() {
        return this.page.locator('.highlightsListPanel');
    }

    /** Every row of the list, in list order. */
    rows() {
        return this.panel().locator('.listPanel__item');
    }

    /** The rows' titles, in list order (the title's markup prints literally, A3). */
    titles() {
        return this.panel().locator('.listPanel__itemTitle');
    }

    /** The row whose title reads exactly `title`. */
    row(title) {
        return this.rows().filter({
            has: this.page.locator('.listPanel__itemTitle').getByText(title, {exact: true}),
        });
    }

    /** The empty list's "No items found." */
    noItems() {
        return this.panel().getByText('No items found.', {exact: true});
    }

    /** The header's "Add Highlight". */
    addButton() {
        return this.panel().getByRole('button', {name: 'Add Highlight', exact: true});
    }

    /** The header's "Order". */
    orderButton() {
        return this.panel().getByRole('button', {name: 'Order', exact: true});
    }

    /** Ordering mode's "Save Order". */
    saveOrderButton() {
        return this.panel().getByRole('button', {name: 'Save Order', exact: true});
    }

    /** Ordering mode's "Cancel". */
    cancelOrderButton() {
        return this.panel().getByRole('button', {name: 'Cancel', exact: true});
    }

    /** A row's "Edit". */
    editButton(title) {
        return this.row(title).getByRole('button', {name: 'Edit', exact: true});
    }

    /** A row's "Delete". */
    deleteButton(title) {
        return this.row(title).getByRole('button', {name: 'Delete', exact: true});
    }

    /** A row's up arrow in ordering mode ("Increase position of {title}"). */
    upArrow(title) {
        return this.row(title).getByRole('button', {name: `Increase position of ${title}`, exact: true});
    }

    /** A row's down arrow in ordering mode ("Decrease position of {title}"). */
    downArrow(title) {
        return this.row(title).getByRole('button', {name: `Decrease position of ${title}`, exact: true});
    }

    /** Press "Add Highlight" and wait for the "Add Highlight" panel. */
    async openAdd() {
        await this.addButton().click();
        const panel = new exports.HighlightPanel(this.page, 'Add Highlight');
        await panel.expectOpen();
        return panel;
    }

    /** Press a row's "Edit" and wait for the "Edit Highlight" panel. */
    async openEdit(title) {
        await this.editButton(title).click();
        const panel = new exports.HighlightPanel(this.page, 'Edit Highlight');
        await panel.expectOpen();
        return panel;
    }

    /**
     * Add a highlight through the panel: the fields, then "Save", bounded
     * by the highlights API answering and the panel closing; the new row
     * is waited for.
     */
    async add({title, description = null, url, buttonLabel}) {
        const panel = await this.openAdd();
        await panel.fill({title, description, url, buttonLabel});
        await panel.save();
        await expect(this.row(title)).toHaveCount(1, {timeout: T});
    }

    /** Press "Order" and wait for ordering mode. */
    async enterOrdering() {
        await this.orderButton().click();
        await expect(this.saveOrderButton()).toBeVisible({timeout: T});
    }

    /** Press "Save Order", bounded by the order request answering, and wait for ordering mode to end. */
    async saveOrder() {
        const saved = this.page.waitForResponse(
            (r) => /\/api\/v1\/highlights\/order/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.saveOrderButton().click();
        const response = await saved;
        expect(response.ok(), `Save Order answered ${response.status()}`).toBe(true);
        await expect(this.orderButton()).toBeVisible({timeout: T});
    }

    /** The "Delete Highlight" dialog. */
    deleteDialog() {
        return this.page.getByRole('dialog').filter({
            has: this.page.getByRole('heading', {name: 'Delete Highlight'}),
        });
    }

    /** Press a row's "Delete" and wait for the dialog. */
    async openDelete(title) {
        await this.deleteButton(title).click();
        await expect(this.deleteDialog()).toBeVisible({timeout: T});
    }

    /** Answer the open "Delete Highlight" dialog: "Yes" (bounded by the delete answering) or "No". */
    async answerDelete(answer) {
        const dialog = this.deleteDialog();
        if (answer === 'Yes') {
            const deleted = this.page.waitForResponse(
                (r) => /\/api\/v1\/highlights\/\d+/.test(r.url()) && r.request().method() === 'POST',
                {timeout: T}
            );
            await dialog.getByRole('button', {name: 'Yes', exact: true}).click();
            const response = await deleted;
            expect(response.ok(), `delete answered ${response.status()}`).toBe(true);
        } else {
            await dialog.getByRole('button', {name: 'No', exact: true}).click();
        }
        await expect(dialog).toHaveCount(0, {timeout: T});
    }
};

exports.HighlightPanel = class HighlightPanel {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {'Add Highlight'|'Edit Highlight'} name the panel's heading
     */
    constructor(page, name) {
        this.page = page;
        this.name = name;
    }

    /** The side panel (a dialog headed "Add Highlight" / "Edit Highlight"). */
    dialog() {
        return this.page.getByRole('dialog', {name: this.name});
    }

    /** Wait for the panel and its footer's "Save". */
    async expectOpen() {
        await expect(this.dialog()).toBeVisible({timeout: T});
        await expect(this.saveButton()).toBeVisible({timeout: T});
    }

    /** The control id of a text field: `title`, `description`, `url`, `urlText`; `locale` for the localized ones. */
    static controlId(key, locale = 'en') {
        return key === 'url' ? 'highlight-url-control' : `highlight-${key}-control-${locale}`;
    }

    /** A field's wrapper (`.pkpFormField`) by the id of its control. */
    fieldByControl(key, locale = 'en') {
        return this.dialog()
            .locator('.pkpFormField')
            .filter({has: this.page.locator(`#${HighlightPanel.controlId(key, locale)}`)});
    }

    /** "Title" (the TinyMCE one-liner) in `locale`. */
    titleField(locale = 'en') {
        return this.fieldByControl('title', locale);
    }

    /** "Description" (TinyMCE) in `locale`. */
    descriptionField(locale = 'en') {
        return this.fieldByControl('description', locale);
    }

    /** "URL". */
    urlField() {
        return this.fieldByControl('url');
    }

    /** "Button Label" in `locale`. */
    buttonLabelField(locale = 'en') {
        return this.fieldByControl('urlText', locale);
    }

    /** "Image" (the dropzone field). */
    imageField() {
        return this.dialog().locator('.pkpFormField--uploadImage');
    }

    /** A field's label element. */
    label(field) {
        return field.locator('label.pkpFormFieldLabel').first();
    }

    /** The required markers in the panel (none: no field is marked required). */
    requiredMarkers() {
        return this.dialog().locator('.pkpFormFieldLabel__required');
    }

    /** A field's inline error. */
    fieldError(field) {
        return field.locator('.pkpFieldError');
    }

    /** The refusal summary above "Save" ("Please correct {n} errors." and its buttons). */
    errorSummary() {
        return this.dialog().locator('.pkpFormErrors');
    }

    /** The footer's "Save". */
    saveButton() {
        return this.dialog().getByRole('button', {name: 'Save', exact: true});
    }

    /** The panel's close control. */
    closeButton() {
        return this.dialog().getByRole('button', {name: 'Close', exact: true});
    }

    /** The language button at the top of the panel ("French"). */
    localeToggle(name) {
        return this.dialog().locator('.pkpFormLocales button').filter({hasText: name});
    }

    /** The TinyMCE body of a rich-text field, once the editor is initialized. */
    async richBody(key, locale = 'en') {
        const id = HighlightPanel.controlId(key, locale);
        await this.page.waitForFunction(
            (textareaId) => {
                // @ts-ignore TinyMCE is the app's global
                const editor = window.tinymce?.get(textareaId);
                return !!editor?.initialized;
            },
            id,
            {timeout: T}
        );
        return this.fieldByControl(key, locale).locator(`iframe#${id}_ifr`).contentFrame().locator('body');
    }

    /** Replace a rich-text field's content by typing through the editor (empty `text` clears it). */
    async typeRich(key, text, locale = 'en') {
        const body = await this.richBody(key, locale);
        await body.click();
        await this.page.keyboard.press('ControlOrMeta+A');
        await this.page.keyboard.press('Delete');
        if (text) {
            await body.pressSequentially(text);
        }
    }

    /** A rich-text field's text as the editor shows it. */
    async readRich(key, locale = 'en') {
        const body = await this.richBody(key, locale);
        return (await body.innerText()).trim();
    }

    /** "URL"'s box. */
    urlInput() {
        return this.urlField().locator('input');
    }

    /** "Button Label"'s box in `locale`. */
    buttonLabelInput(locale = 'en') {
        return this.buttonLabelField(locale).locator('input');
    }

    /** Fill the text fields given (a null leaves the field alone). */
    async fill({title = null, description = null, url = null, buttonLabel = null, locale = 'en'} = {}) {
        if (title !== null) {
            await this.typeRich('title', title, locale);
        }
        if (description !== null) {
            await this.typeRich('description', description, locale);
        }
        if (url !== null) {
            await this.urlInput().fill(url);
        }
        if (buttonLabel !== null) {
            await this.buttonLabelInput(locale).fill(buttonLabel);
        }
    }

    // ---- the image ----------------------------------------------------

    /** The dropzone's hidden file input (appended to the body; the last one is the open panel's). */
    fileInput() {
        return this.page.locator('input[type=file]').last();
    }

    /** Drop a file the box accepts: bounded by the temporary-file upload answering. */
    async uploadImage(filePath) {
        const uploaded = this.page.waitForResponse(
            (r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.fileInput().setInputFiles(filePath);
        const response = await uploaded;
        expect(response.ok(), `image upload answered ${response.status()}`).toBe(true);
        await expect(this.preview()).toHaveCount(1, {timeout: T});
    }

    /** Drop a file the box refuses (client-side, nothing sent): the refusal is waited for. */
    async dropRefusedFile(filePath, message) {
        await this.fileInput().setInputFiles(filePath);
        await expect(this.fieldError(this.imageField())).toContainText(message, {timeout: T});
    }

    /** The preview picture. */
    preview() {
        return this.imageField().locator('.pkpFormField--upload__preview img');
    }

    /** The "Alternate text" box. */
    altTextInput() {
        return this.imageField().locator('input.pkpFormField--uploadImage__altTextInput');
    }

    /** The image's "Remove". */
    removeImageButton() {
        return this.imageField().getByRole('button', {name: 'Remove', exact: true});
    }

    /** The image's "Restore Original". */
    restoreImageButton() {
        return this.imageField().getByRole('button', {name: 'Restore Original', exact: true});
    }

    // ---- save / close -------------------------------------------------

    /**
     * Press "Save" and wait for the highlights API to answer OK and the
     * panel to close (Rule 5: the panel closes by itself, the list
     * refreshes with no reload).
     */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => /\/api\/v1\/highlights(\/\d+)?$/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.saveButton().click();
        const response = await saved;
        expect(response.ok(), `highlight save answered ${response.status()}`).toBe(true);
        await expect(this.dialog()).toHaveCount(0, {timeout: T});
    }

    /**
     * Press "Save" on a form the app refuses: the summary "Please correct
     * {n} error(s)." appears above "Save" and the panel stays open.
     */
    async saveRefused(summaryText) {
        await this.saveButton().click();
        await expect(this.errorSummary()).toContainText(summaryText, {timeout: T});
        await expect(this.dialog()).toBeVisible();
    }

    /** Press the close control and wait for the panel to go. */
    async close() {
        await this.closeButton().click();
        await expect(this.dialog()).toHaveCount(0, {timeout: T});
    }
};

exports.HomeCarousel = class HomeCarousel {
    /**
     * @param {import('@playwright/test').Page} page a visitor's page (signed out, usually)
     */
    constructor(page) {
        this.page = page;
    }

    /**
     * Open the press home page (bare on a single-language scratch press;
     * `locale` adds the segment, `/fr_CA`) and wait for the page's content
     * block to be in the DOM (it is server-rendered, and has no height at
     * all while the press has nothing to show), so an absence read of the
     * carousel is settled.
     */
    async goto(contextPath, {locale = null} = {}) {
        await this.page.goto(`/index.php/${contextPath}${locale ? `/${locale}` : ''}`);
        await expect(this.pageBlock()).toBeAttached({timeout: T});
    }

    /** The home page's content block (`div.page_homepage` on a press). */
    pageBlock() {
        return this.page.locator('.pkp_structure_main > div').first();
    }

    /** The first block of the page (skipping the anchor the theme puts first). */
    firstBlock() {
        return this.pageBlock().locator('> :not(a)').first();
    }

    /** The carousel block (absent while the list is empty). */
    block() {
        return this.page.locator('.highlights');
    }

    /** The screen-reader heading above the carousel. */
    heading() {
        return this.block().locator('h2');
    }

    /** Every slide, in document order (the saved order). */
    slides() {
        return this.block().locator('li.swiper-slide');
    }

    /** The slides' headlines, in document order. */
    titles() {
        return this.slides().locator('.swiper-slide-title');
    }

    /** The slide whose headline reads `title`. */
    slide(title) {
        return this.slides().filter({
            has: this.page.locator('.swiper-slide-title').getByText(title, {exact: true}),
        });
    }

    /** The slide on now. */
    activeSlide() {
        return this.block().locator('li.swiper-slide.swiper-slide-active');
    }

    /** A slide's headline. */
    title(slide) {
        return slide.locator('.swiper-slide-title');
    }

    /** A slide's description block (always printed by the theme; empty when the highlight has none). */
    description(slide) {
        return slide.locator('.swiper-slide-desc');
    }

    /** A slide's button (a link carrying the "URL" as typed). */
    button(slide) {
        return slide.locator('a.swiper-slide-button');
    }

    /** A slide's picture. */
    image(slide) {
        return slide.locator('img');
    }

    /** "Previous slide" (by class: the French interface names it with a raw key, A7). */
    prev() {
        return this.block().locator('.swiper-button-prev');
    }

    /** "Next slide". */
    next() {
        return this.block().locator('.swiper-button-next');
    }

    /** The dots' container. */
    pagination() {
        return this.block().locator('.swiper-pagination');
    }

    /** The dots, one per slide. */
    dots() {
        return this.pagination().locator('.swiper-pagination-bullet');
    }

    /** The dot of the slide on now. */
    activeDot() {
        return this.pagination().locator('.swiper-pagination-bullet-active');
    }

    /** Press "Next slide" and wait for `title`'s slide to be the one on. */
    async goNext(title) {
        await this.next().click();
        await expect(this.activeSlide()).toHaveCount(1, {timeout: T});
        await expect(this.title(this.activeSlide())).toHaveText(title, {timeout: T});
    }
};
