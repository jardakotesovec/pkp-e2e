/**
 * @file shared/playwright/pages/ReviewSettingsPages.js
 *
 * Shared (lib/pkp) Page Objects for Settings › Workflow › "Review"
 * (spec: docs/specs/U29-review-setup-and-review-forms.md): the "Setup"
 * and "Reviewer Guidance" forms, the "Review Forms" grid and its windows
 * (the form window with its "Review Form" / "Form Items" / "Preview Form"
 * tabs, the item window, the "Preview" window). App-neutral: no app words,
 * no roles; the app-only "Reviewer Recommendations" tab lives in the app's
 * own ReviewSettingsPages.js, which extends ReviewSettingsPage.
 *
 * Surfaces and their DOM anchors (live-confirmed by the U29 probes, 2026-09-05,
 * `.reports/U29/screen-notes.md`):
 * - ReviewSettingsPage — the page (`management/settings/workflow`), its
 *   "Review" tab (`#review-button`) and the side tabs (`#<id>-button`,
 *   panels `[role=tabpanel]#<id>`). A reload never returns to a side tab
 *   (register A5), so every navigation walks the tab chain.
 * - ReviewSetupForm — the Vue form on `#reviewSetup`: radios, boxes, the
 *   three number boxes, the four PrimeVue sliders (keyboard-driven) and the
 *   "Saved" footer status.
 * - ReviewerGuidanceForm — the Vue form on `#reviewerGuidance`: TinyMCE
 *   boxes (`…-control-<locale>_ifr`), the anonymity box and its words button.
 * - ReviewFormsGrid — the legacy grid `#reviewFormGridContainer`: rows, the
 *   row arrow and its sibling action row, the "Confirm" dialogs, ordering.
 * - ReviewFormWindow / FormItemWindow — the legacy AjaxModals hosted in Vue
 *   `[role=dialog]`s, picked by the form they carry.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

const ITEM_TYPE_LABELS = {
    smalltextfield: 'Single word text box',
    textfield: 'Single line text box',
    textarea: 'Extended text box',
    checkboxes: 'Checkboxes (you can choose one or more)',
    radiobuttons: 'Radio buttons (you can only choose one)',
    dropdownbox: 'Drop-down box',
};
exports.ITEM_TYPE_LABELS = ITEM_TYPE_LABELS;

/** A legacy AjaxModal (Vue-hosted dialog) located by an element it carries. */
function dialogWith(page, selector) {
    return page.locator('[role=dialog]').filter({has: page.locator(selector)}).last();
}
exports.dialogWith = dialogWith;

/**
 * The legacy "Confirm" dialog (activate / deactivate / copy / delete) with
 * "OK" and "Cancel".
 */
function confirmDialog(page, text) {
    return page.getByRole('dialog').filter({hasText: text}).last();
}
exports.confirmDialog = confirmDialog;

exports.ReviewSettingsPage = class ReviewSettingsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.reviewTab = page.locator('#review-button');
        this.reviewPanel = page.locator('[role=tabpanel]#review');
        this.sideTabList = this.reviewPanel.getByRole('tablist').first();
        this.setup = new ReviewSetupForm(page);
        this.guidance = new ReviewerGuidanceForm(page);
        this.forms = new ReviewFormsGrid(page);
        this.accessDenied = page.getByText('The current role does not have access to this operation.');
        this.sidebar = page.getByRole('navigation', {name: 'Site Navigation'});
    }

    /** The page address (the "Review" tab is reached by clicking, A5). */
    url() {
        return this.contextUrl(this.contextPath, '/management/settings/workflow');
    }

    /** Open Settings › Workflow by address and press the "Review" tab. */
    async goto() {
        await this.page.goto(this.url());
        await this.openReviewTab();
    }

    /** Press the "Review" tab and wait for its side tabs. */
    async openReviewTab() {
        await expect(this.reviewTab).toBeVisible({timeout: 30_000});
        await this.reviewTab.click();
        await expect(this.sideTabList).toBeVisible({timeout: 30_000});
    }

    /** Settings › Workflow › "Review" › a side tab, all by clicking. */
    async gotoSideTab(name) {
        await this.goto();
        await this.openSideTab(name);
    }

    /** A side tab of the "Review" tab by its label. */
    sideTab(name) {
        return this.sideTabList.getByRole('tab', {name, exact: true});
    }

    /** Press a side tab and wait for its panel. */
    async openSideTab(name) {
        await this.sideTab(name).click();
        await expect(this.sideTab(name)).toHaveAttribute('aria-selected', 'true');
        if (name === 'Setup') {
            await expect(this.setup.panel).toBeVisible({timeout: 30_000});
        } else if (name === 'Reviewer Guidance') {
            await expect(this.guidance.panel).toBeVisible({timeout: 30_000});
        } else if (name === 'Review Forms') {
            await this.forms.expectLoaded();
        }
    }

    /** The side tabs' labels, in order. */
    async sideTabNames() {
        return this.sideTabList.getByRole('tab').allInnerTexts();
    }

    /** Leave the page for another Settings screen through the sidebar. */
    async leaveThroughSidebar(linkName) {
        await this.sidebar.getByRole('link', {name: linkName, exact: true}).first().click();
        await this.page.waitForURL((url) => !url.pathname.endsWith('/settings/workflow'), {waitUntil: 'commit'});
    }

    /** Come back to Settings › Workflow through the sidebar's "Workflow" link. */
    async returnThroughSidebar() {
        await this.sidebar.getByRole('link', {name: 'Workflow', exact: true}).first().click();
        await this.page.waitForURL((url) => url.pathname.endsWith('/settings/workflow'), {waitUntil: 'commit'});
        await this.openReviewTab();
    }
};

/**
 * Shared mechanics of the two Vue settings forms: the footer status and
 * the field-level refusals.
 */
class VueSettingsForm extends BasePage {
    constructor(page, panelId) {
        super(page);
        this.panel = page.locator(`[role=tabpanel]#${panelId}`);
        this.saveButton = this.panel.getByRole('button', {name: 'Save', exact: true});
        this.status = this.panel.locator('.pkpFormPage__status');
        this.formErrors = this.panel.locator('.pkpFormErrors');
    }

    /** Press "Save" and wait for the context write to answer (200 or 400). */
    async save() {
        const answered = this.page.waitForResponse(
            (response) => response.url().includes('/api/v1/contexts/') && response.request().method() === 'POST'
        );
        await this.saveButton.click();
        return answered;
    }

    /**
     * "Saved" beside the button. The leaving "Saving" span and the entering
     * "Saved" span coexist for a moment (a Vue transition), so the match is
     * on the one that reads "Saved".
     */
    async expectSaved() {
        await expect(this.status.filter({hasText: /Saved/}).first()).toHaveText(/Saved/, {timeout: 30_000});
    }

    /** The refusal under a box (`.pkpFieldError`, sibling of the control). */
    fieldError(textbox) {
        return textbox
            .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " pkpFormField ")][1]')
            .locator('.pkpFieldError');
    }
}

class ReviewSetupForm extends VueSettingsForm {
    constructor(page) {
        super(page, 'reviewSetup');
        this.responseDeadline = this.panel.getByRole('textbox', {name: 'Default Response Deadline', exact: true});
        this.completionDeadline = this.panel.getByRole('textbox', {name: 'Default Completion Deadline', exact: true});
        this.minReviews = this.panel.getByRole('textbox', {name: 'Minimum Confirmed Reviews Required', exact: true});
    }

    /** A "Default Review Mode" radio by its label. */
    reviewModeRadio(label) {
        return this.panel.getByRole('radio', {name: label, exact: true});
    }

    /** One of the four boxes by its label. */
    box(label) {
        return this.panel.getByRole('checkbox', {name: label});
    }

    /** A reminder slider's handle by its heading. */
    slider(label) {
        return this.panel.getByRole('slider', {name: label, exact: true});
    }

    /** The reading box beside a slider ("No reminder set", "3 days before due date"). */
    sliderReading(label) {
        return this.slider(label).locator('xpath=ancestor::div[contains(@class,"max-w-lg")][1]').locator('.w-48');
    }

    /** Move a slider by keyboard: Home, then one ArrowRight per day. */
    async setSlider(label, days) {
        const handle = this.slider(label);
        await handle.focus();
        await this.page.keyboard.press('Home');
        for (let i = 0; i < days; i++) {
            await this.page.keyboard.press('ArrowRight');
        }
        await expect(handle).toHaveAttribute('aria-valuenow', String(days));
    }
}
exports.ReviewSetupForm = ReviewSetupForm;

class ReviewerGuidanceForm extends VueSettingsForm {
    constructor(page) {
        super(page, 'reviewerGuidance');
        this.anonymityBox = this.panel.locator('input[name="showEnsuringLink"]');
        this.anonymityWordsButton = this.panel.locator('label button');
        this.anonymityDialog = page.getByRole('dialog').filter({
            has: page.getByRole('heading', {name: 'How to ensure all files are anonymized'}),
        });
    }

    /** A rich-text box's editable body (TinyMCE iframe), by field name and locale. */
    body(field, locale = 'en') {
        return this.page.frameLocator(`iframe#reviewerGuidance-${field}-control-${locale}_ifr`).locator('body');
    }

    get guidelinesBody() {
        return this.body('reviewGuidelines');
    }

    get competingInterestsBody() {
        return this.body('competingInterests');
    }

    /** Wait for a rich-text box's editor to finish initialising. */
    async expectEditorReady(field, locale = 'en') {
        await this.page.waitForFunction(
            (id) => {
                const mce = window.tinymce || window.tinyMCE;
                return !!mce?.get(id)?.initialized;
            },
            `reviewerGuidance-${field}-control-${locale}`,
            {timeout: 30_000}
        );
    }

    /** Replace a rich-text box's content (a fill on the editable body). */
    async typeInto(field, text, locale = 'en') {
        await this.expectEditorReady(field, locale);
        const body = this.body(field, locale);
        await body.click();
        await body.fill(text);
    }
}
exports.ReviewerGuidanceForm = ReviewerGuidanceForm;

class ReviewFormsGrid extends BasePage {
    constructor(page) {
        super(page);
        this.container = page.locator('#reviewFormGridContainer');
        this.grid = this.container.locator('.pkp_controllers_grid');
        this.rows = this.container.locator('tbody tr.gridRow');
        this.createLink = this.container.getByRole('link', {name: 'Create Review Form'});
        this.orderLink = this.container.locator('a.pkp_linkaction_orderItems');
        this.doneLink = this.container.locator('a.saveButton');
        this.cancelOrderingLink = this.container.locator('a.cancelFormButton');
        this.noItems = this.container.getByText('No Items');
    }

    /** The grid has fetched (its header link is there). */
    async expectLoaded() {
        await expect(this.createLink).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** A data row by its title. */
    row(title) {
        return this.rows.filter({hasText: title});
    }

    /** The numeric id of a row (`…-row-<id>`). */
    async rowId(row) {
        const id = await row.getAttribute('id');
        return Number(id.split('-').pop());
    }

    /** The "In Review" and "Completed" cells. */
    async counts(row) {
        const cells = await row.locator('td').allInnerTexts();
        return {inReview: cells[1].trim(), completed: cells[2].trim()};
    }

    /** The row's "Active" box. */
    activeBox(row) {
        return row.locator('input[type=checkbox]');
    }

    /** The row's action links (the sibling `tr` the arrow toggles). */
    actionLinks(row) {
        return row.locator('xpath=following-sibling::tr[1]').locator('a');
    }

    /** Open the row's arrow (only when its actions are hidden) and return the action names. */
    async openActions(row) {
        const actions = row.locator('xpath=following-sibling::tr[1]');
        if (!(await actions.isVisible())) {
            await row.locator('a.show_extras').click();
            await expect(actions).toBeVisible({timeout: 30_000});
        }
        const names = await this.actionLinks(row).allInnerTexts();
        return names.map((name) => name.trim());
    }

    /** Open the arrow and press one of the row's actions. */
    async pressAction(row, name) {
        await this.openActions(row);
        await this.actionLinks(row).filter({hasText: name}).first().click();
    }

    /** Press "OK" in the "Confirm" dialog carrying the text; waits for the grid's re-fetch. */
    async confirm(text) {
        const dialog = confirmDialog(this.page, text);
        await expect(dialog).toBeVisible({timeout: 30_000});
        await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(dialog).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Tick or untick a row's "Active" box through its "Confirm" dialog. */
    async setActive(row, active) {
        const box = this.activeBox(row);
        await box.click();
        await this.confirm(active ? 'activate this review form' : 'deactivate this review form');
        await expect(this.activeBox(row)).toBeChecked({checked: active, timeout: 30_000});
    }

    /** "Order", then drag a row above the first row, then "Done" (saves with no notice). */
    async moveRowToTop(row) {
        await this.orderLink.click();
        await expect(this.doneLink).toBeVisible({timeout: 30_000});
        const source = await row.boundingBox();
        const target = await this.rows.first().boundingBox();
        await this.page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
        await this.page.mouse.down();
        const steps = 25;
        const endX = target.x + target.width / 2;
        const endY = target.y + 4;
        for (let i = 1; i <= steps; i++) {
            await this.page.mouse.move(
                source.x + source.width / 2 + ((endX - source.x - source.width / 2) * i) / steps,
                source.y + source.height / 2 + ((endY - source.y - source.height / 2) * i) / steps
            );
        }
        await this.page.mouse.up();
        const saved = this.page.waitForResponse((response) => response.url().includes('save-sequence'));
        await this.doneLink.click();
        await saved;
        await waitForJQueryIdle(this.page);
    }

    /** Press "Create Review Form" and return the open window. */
    async openCreateWindow() {
        await this.createLink.click();
        const window = new ReviewFormWindow(this.page);
        await window.expectFormLoaded();
        return window;
    }

    /** Press a row's "Edit" and return the open window (on "Review Form"). */
    async openEditWindow(row) {
        await this.pressAction(row, 'Edit');
        const window = new ReviewFormWindow(this.page);
        await window.expectTabsLoaded();
        return window;
    }

    /** Press a row's "Preview" and return the open window (on "Preview Form"). */
    async openPreviewWindow(row) {
        await this.pressAction(row, 'Preview');
        const window = new ReviewFormWindow(this.page);
        await window.expectTabsLoaded();
        return window;
    }
}
exports.ReviewFormsGrid = ReviewFormsGrid;

/**
 * The form window: "Create Review Form" (one form) or "Edit" / "Preview"
 * (three jQuery UI tabs: "Review Form", "Form Items", "Preview Form").
 */
class ReviewFormWindow extends BasePage {
    constructor(page) {
        super(page);
        this.dialog = dialogWith(page, 'form#reviewFormForm, #editReviewFormTabs');
        this.tabsDialog = dialogWith(page, '#editReviewFormTabs');
        this.form = page.locator('form#reviewFormForm');
        this.titleInput = this.form.locator('input[id^="title-"]').first();
        this.descriptionBody = page.frameLocator('form#reviewFormForm iframe[id^="description-"]').locator('body');
        this.saveButton = this.form.getByRole('button', {name: 'Save', exact: true});
        this.itemsGrid = page.locator('#reviewFormElementsGridContainer');
        this.itemRows = this.itemsGrid.locator('tbody tr.gridRow');
        this.createItemLink = this.itemsGrid.getByRole('link', {name: 'Create New Item'});
        this.preview = page.locator('form#previewReviewForm');
    }

    /** The "Create Review Form" form is on screen. */
    async expectFormLoaded() {
        await expect(this.titleInput).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** The tabbed window has filled (the tab strip is there and no tab is loading). */
    async expectTabsLoaded() {
        await expect(this.tabsDialog.locator('.ui-tabs-nav li').first()).toBeVisible({timeout: 30_000});
        await expect(this.tabsDialog.locator('.ui-tabs-loading')).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** A tab of the window by its label. */
    tab(name) {
        return this.tabsDialog.getByRole('tab', {name, exact: true});
    }

    /** Press a tab and wait for it to be selected and loaded. */
    async openTab(name) {
        await this.tab(name).click();
        await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true', {timeout: 30_000});
        await expect(this.tabsDialog.locator('.ui-tabs-loading')).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** The window's title (its level-1 heading). */
    heading() {
        return this.tabsDialog.getByRole('heading', {level: 1}).first();
    }

    /** Type a title and a description into the "Review Form" form. */
    async fillForm({title, description}) {
        await this.titleInput.fill(title);
        if (description !== undefined) {
            await this.descriptionBody.click();
            await this.page.keyboard.type(description);
        }
    }

    /** Press the form's "Save"; the caller asserts the grid. */
    async save() {
        await this.saveButton.click();
        await expect(this.form).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** An item row of "Form Items" by its question. */
    itemRow(question) {
        return this.itemRows.filter({hasText: question});
    }

    /**
     * Press "Create New Item" and return the item window. The grid re-renders
     * after an item save and can swallow a click on the just-replaced link,
     * so the press is retried until the window is there.
     */
    async openCreateItemWindow() {
        const window = new FormItemWindow(this.page);
        await expect(async () => {
            await this.createItemLink.click({timeout: 5_000});
            await expect(window.typeSelect).toBeVisible({timeout: 5_000});
        }).toPass({timeout: 30_000});
        await window.expectLoaded();
        return window;
    }

    /** Close the window through its own "Close" button. */
    async close() {
        const dialog = this.tabsDialog.or(this.dialog).first();
        await dialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(this.tabsDialog).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }
}
exports.ReviewFormWindow = ReviewFormWindow;

/** The "Create New Item" / "Edit" window of a form item. */
class FormItemWindow extends BasePage {
    constructor(page) {
        super(page);
        this.dialog = dialogWith(page, 'form#reviewFormElementForm');
        this.form = page.locator('form#reviewFormElementForm');
        this.questionBody = page.frameLocator('form#reviewFormElementForm iframe[id^="question-"]').locator('body');
        this.requiredBox = this.form.locator('input#required');
        this.includedBox = this.form.locator('input#included');
        this.typeSelect = this.form.locator('select#elementType');
        this.options = this.form.locator('#elementOptions');
        this.addOptionLink = this.options.getByRole('link', {name: 'Add Item'});
        this.optionRows = this.options.locator('tbody tr');
        this.optionInputs = this.options.locator('input[type=text]:visible');
        this.saveButton = this.form.getByRole('button', {name: 'Save', exact: true});
    }

    async expectLoaded() {
        await expect(this.typeSelect).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Choose the item type by its label (or its scenario key). */
    async chooseType(type) {
        await this.typeSelect.selectOption({label: ITEM_TYPE_LABELS[type] || type});
    }

    /**
     * Add one "Response Options" row. The listbuilder keeps one row editable
     * at a time, so the wait is on the ROW count, and the new row's box is
     * the only visible one.
     */
    async addOption(text) {
        const before = await this.optionRows.count();
        await this.addOptionLink.click();
        await expect(this.optionRows).toHaveCount(before + 1, {timeout: 30_000});
        await this.optionInputs.last().fill(text);
    }

    /** Press "Save" and wait for the window to go. */
    async save() {
        await this.saveButton.click();
        await expect(this.form).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }
}
exports.FormItemWindow = FormItemWindow;
