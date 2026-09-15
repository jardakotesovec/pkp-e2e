// @ts-check
/**
 * @file playwright/pages/ReviewSettingsPages.js
 *
 * The press's Settings › Workflow › "Review" screen: the shared page object
 * (`shared/playwright/pages/ReviewSettingsPages.js`) with the press-only
 * parts on top (spec docs/specs/U29-review-setup-and-review-forms.md,
 * register OMP1 and OMP2). A press has three side tabs (no "Reviewer
 * Recommendations"), its library tab reads "Press Library", and "Reviewer
 * Guidance" carries two guideline boxes, "Internal Review Guidelines"
 * (setting `internalReviewGuidelines`, read by Internal Reviewers) above
 * "External Review Guidelines" (setting `reviewGuidelines`, the journal's
 * one box, read by External Reviewers). Everything else is the shared DOM.
 *
 * The press-side reads the revision of 2026-09-15 needed now (the "Create
 * Review Form" and item windows' refusals, the item window's heading and
 * its row's "Edit" / "Delete", the backend sidebar's "Settings" group and
 * the access-denied page) live here in `PressReviewFormsList` and
 * `PressReviewSettingsPage`; the shared file is another session's, so they
 * are proposed for it as the method names used here (`titleRefusal`,
 * `itemWindow`, `itemWindowHeading`, `itemRefusals`, `itemQuestionRefusal`, `saveItemRefused`,
 * `openItemEdit`, `deleteItem`, `sideNav`, `settingsGroup`,
 * `openFromSidebar`, `accessDenied`).
 *
 * DOM facts (live 2026-09-15 on OMP): the legacy windows' required-box
 * refusals are jQuery-validate `label.error` elements after the box,
 * made in the browser with nothing posted (a response wait on that press
 * never returns); the empty-question refusal is the server's; the item window
 * is the dialog holding `form#reviewFormElementForm`, headed "Edit" for
 * an existing item; a refused item save answers `{status: false,
 * content}` and the page prints the content as a notification; the item
 * row's "Delete" asks "Confirm delete of a published form item..." in a
 * "Confirm" window with "OK"; the backend sidebar is the navigation "Site
 * Navigation", its groups regions, "Settings" a collapsed group rendered
 * as a button that opens to links ("Workflow" among them).
 */
const {expect} = require('@playwright/test');
const shared = require('../../../../shared/playwright/pages/ReviewSettingsPages.js');
const {waitForJQueryIdle} = require('../../../../shared/playwright/support/legacy.js');

/** The access-denied page's sentence. */
const ACCESS_DENIED = 'The current role does not have access to this operation.';
exports.ACCESS_DENIED = ACCESS_DENIED;

/** The item row's "Delete" question (its head; the window prints the whole sentence). */
const DELETE_ITEM = /Confirm delete of a published form item/;
exports.DELETE_ITEM = DELETE_ITEM;

/** The press's side tabs, in screen order. */
const PRESS_SIDE_TABS = ['Setup', 'Reviewer Guidance', 'Review Forms'];
exports.PRESS_SIDE_TABS = PRESS_SIDE_TABS;

/** The press's wording of the library tab. */
const LIBRARY_TAB = 'Press Library';
exports.LIBRARY_TAB = LIBRARY_TAB;

/** The two guideline boxes' headings, in screen order, and their settings. */
const GUIDELINE_BOXES = {
    internal: {heading: 'Internal Review Guidelines', setting: 'internalReviewGuidelines'},
    external: {heading: 'External Review Guidelines', setting: 'reviewGuidelines'},
};
exports.GUIDELINE_BOXES = GUIDELINE_BOXES;

/**
 * "Reviewer Guidance" on a press: the shared form plus the two guideline
 * boxes by their press name.
 */
class PressReviewerGuidanceForm extends shared.ReviewerGuidanceForm {
    /** The "Internal Review Guidelines" box's editable body. */
    get internalBody() {
        return this.richBody(GUIDELINE_BOXES.internal.setting);
    }

    /** The "External Review Guidelines" box's editable body. */
    get externalBody() {
        return this.richBody(GUIDELINE_BOXES.external.setting);
    }

    async typeInternal(text) {
        await this.typeInto(GUIDELINE_BOXES.internal.setting, text);
    }

    async typeExternal(text) {
        await this.typeInto(GUIDELINE_BOXES.external.setting, text);
    }
}
exports.PressReviewerGuidanceForm = PressReviewerGuidanceForm;

/**
 * "Review Forms" on a press: the shared list plus the refusal and item-row
 * reads the revision needed.
 */
class PressReviewFormsList extends shared.ReviewFormsList {
    /** "Create Review Form": open the window and leave it open (the caller saves). */
    async openCreateForm() {
        await this.createLink.click();
        await expect(this.titleInput).toBeVisible({timeout: 30_000});
    }

    /** The red reason under the form window's "Title" box (empty while none). */
    titleRefusal() {
        return this.formFields.locator('label.error:visible').filter({hasText: 'This field is required.'});
    }

    /**
     * Press the form window's "Save" without waiting for a request: an
     * empty required box is refused in the browser (jQuery validate puts
     * "This field is required." under it and nothing is posted).
     */
    async pressFormSave() {
        await this.formSaveButton.click();
    }

    /** Press the form window's "Save" and wait for the save's answer. */
    async saveFormWindow() {
        const saved = this.page.waitForResponse((r) => r.url().includes('/update-review-form') && !r.url().includes('-element') && r.request().method() === 'POST');
        await this.formSaveButton.click();
        await saved;
        await waitForJQueryIdle(this.page);
    }

    /** The item window (the dialog holding `form#reviewFormElementForm`). */
    itemWindow() {
        return this.page.getByRole('dialog').filter({has: this.page.locator('form#reviewFormElementForm')}).last();
    }

    /** The item window's heading ("Edit" on an existing item). */
    itemWindowHeading() {
        return this.itemWindow().getByRole('heading').first();
    }

    /** The visible red reasons inside the item window (empty while none). */
    itemRefusals() {
        return this.itemForm.locator('label.error:visible');
    }

    /**
     * A red reason under the item window's "Item" box (empty while none):
     * every visible reason but the "Item type" list's, whose label keeps
     * its text after a pick until the list loses focus.
     */
    itemQuestionRefusal() {
        return this.itemForm.locator('label.error:visible:not([for*="elementType"])');
    }

    /** The red reason under the item window's "Item type" list. */
    itemTypeRefusal() {
        return this.itemTypeSelect.locator('xpath=following-sibling::label[contains(@class,"error")]');
    }

    /** Press the item window's "Save" without waiting for a request (the in-browser refusal). */
    async pressItemSave() {
        await this.itemSaveButton.click();
    }

    /**
     * Press the item window's "Save" and return true when the server
     * refused it (`status: false`; the reason reaches the page as a
     * notification, the answer's `content` being empty), false when it
     * went through; the window is left as the app leaves it.
     */
    async saveItemRefused() {
        const saved = this.page.waitForResponse((r) => r.url().includes('/update-review-form-element') && r.request().method() === 'POST');
        await this.itemSaveButton.click();
        const response = await saved;
        const result = await response.json().catch(() => null);
        await waitForJQueryIdle(this.page);
        return !!(result && result.status === false);
    }

    /** Open an item row's "Edit" (the item window) and wait for its question box. */
    async openItemEdit(row) {
        const controls = await this.rowControls(row);
        await this.control(controls, 'Edit').click();
        await expect(this.itemQuestionBody).toBeVisible({timeout: 30_000});
    }

    /** Retype an open item window's question and save; waits for the window to close. */
    async retypeItem(question) {
        await this.page.waitForFunction(() => {
            const textarea = document.querySelector('form#reviewFormElementForm textarea[id^="question"]');
            const mce = window.tinyMCE || window.tinymce;
            return !!(textarea && mce?.get(textarea.id)?.initialized);
        }, undefined, {timeout: 30_000});
        await shared.typeRichText(this.page, this.itemQuestionBody, question);
        if (await this.saveItemRefused()) {
            throw new Error('The item window refused the save');
        }
        await expect(this.itemForm).toBeHidden({timeout: 30_000});
        await expect(this.itemRow(question)).toBeVisible({timeout: 30_000});
    }

    /** Press an item row's "Delete" and answer its "Confirm" window with "OK". */
    async deleteItem(row) {
        const controls = await this.rowControls(row);
        await this.control(controls, 'Delete').click();
        await this.answerConfirm(DELETE_ITEM, 'OK');
    }
}
exports.PressReviewFormsList = PressReviewFormsList;

/**
 * The press's "Review" settings page: the shared page with the press's
 * guidance form and forms list, plus the sidebar walk and the refusal page.
 */
class PressReviewSettingsPage extends shared.ReviewSettingsPage {
    constructor(page, contextPath) {
        super(page, contextPath);
        this.guidance = new PressReviewerGuidanceForm(page);
        this.forms = new PressReviewFormsList(page);
    }

    /** The backend sidebar. */
    sideNav() {
        return this.page.getByRole('navigation', {name: 'Site Navigation'});
    }

    /** The sidebar's collapsed "Settings" group (a button; absent for the refused roles). */
    settingsGroup() {
        return this.sideNav().getByRole('button', {name: 'Settings', exact: true});
    }

    /** Any "Settings" word in the sidebar, for the absence read. */
    settingsWord() {
        return this.sideNav().getByText('Settings', {exact: true});
    }

    /** Open "Settings" › "Workflow" from the sidebar and wait for the page. */
    async openFromSidebar() {
        await this.settingsGroup().click();
        await this.sideNav().getByRole('link', {name: 'Workflow', exact: true}).click();
        await this.page.waitForURL(/\/management\/settings\/workflow/, {waitUntil: 'commit'});
        await expect(this.heading).toBeVisible({timeout: 30_000});
    }

    /** The access-denied page's sentence. */
    accessDenied() {
        return this.page.getByText(ACCESS_DENIED, {exact: true});
    }

    /** The top tabs' names, in order ("Submission", "Review", "Press Library", …). */
    async topTabNames() {
        const names = await this.topTabs.allInnerTexts();
        return names.map((s) => s.trim());
    }
}
exports.PressReviewSettingsPage = PressReviewSettingsPage;
