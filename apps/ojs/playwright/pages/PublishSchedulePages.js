// @ts-check
/**
 * @file playwright/pages/PublishSchedulePages.js
 *
 * OJS-local Page Object for the Publish, schedule & versions feature
 * (spec: docs/specs/U49-publish-schedule-and-versions.md). Extends the
 * U40 PublicationScreen (workflow Publication area, "Review Publishing
 * Details" panel, publish/unpublish flows, issue helpers, and — since the
 * U40 revision of 2026-09-09 — the "Status: {state}" readout, the left and
 * right controls, the version side menu's treeitems and version-scoped
 * entries) with the surfaces this feature owns:
 *
 * - the "Create New Version" dialog opened and confirmed as two steps (the
 *   suite asserts the dialog's own state between them);
 * - the publish panel on a journal that has issues, bounded by its
 *   issue-assignment status fetch;
 * - the publish confirmation window (legacy modal) and its refusal form;
 * - the Unschedule dialog;
 * - the user's Tasks modal (legacy notifications grid).
 *
 * DOM shapes confirmed against the running app while this suite was built
 * (2026-08-29): the version dialog's selects are named
 * `versionSource`/`versionStage`/`versionIsMinor` (ids
 * `version-{field}-control`); the publish panel adds `updateType` and the
 * TinyMCE `version-summaryOfChanges-control-{locale}`; the side menu is a
 * PrimeVue PanelMenu whose treeitems carry the version's display name
 * ("Version of Record 1.0"); the Tasks button's accessible name is
 * "Tasks" plus the unread count.
 *
 * Revision facts (probed 2026-09-16, `.reports/U49/tojs`): the panel's
 * "Associated review round" is a reka-ui select (a `button[role=combobox]`
 * named by its label, its options in a portalled listbox), which arrives
 * pre-filled only on the version the round was opened for and lists the
 * round greyed on any other version; the Production stage's "Production
 * Ready Files" table is a Vue file manager whose "Upload" opens the legacy
 * upload wizard ("Upload a Production Ready File") and whose row menus are
 * headlessui `menuitem`s at the document root; the "Send File to Text
 * Editor" dialog's picker is `select[name="sendToVersion"]`; the Publication
 * Settings page's summary editor is `issueEntry-summaryOfChanges-control-en`
 * and its date box `input[name="datePublished"]`; the publish window and the
 * refused window close through the header's "Close".
 */
const {expect} = require('@playwright/test');
const {PublicationScreen} = require('./PublicationMetadataPages.js');
const {uploadViaWizard} = require('./ReviewStagePages.js');

exports.PublishScreen = class PublishScreen extends PublicationScreen {
    /**
     * Open the "Create New Version" dialog from the side menu and wait for
     * its selects to arrive.
     */
    async openCreateVersionDialog() {
        await this.page
            .getByRole('link', {name: 'Create New Version', exact: true})
            .click();
        const dialog = this.page
            .getByRole('dialog')
            .filter({hasText: 'Which version should metadata be copied from?'});
        await expect(dialog.locator('select[name="versionStage"]')).toBeVisible({
            timeout: 30_000,
        });
        return dialog;
    }

    /**
     * Confirm the open version dialog and wait for the version POST plus
     * the dialog closing. Returns the new version's publication id (the
     * POST's answer), which the draft's own address is built from.
     *
     * @returns {Promise<number>}
     */
    async confirmVersionDialog(dialog) {
        const created = this.page.waitForResponse(
            (r) =>
                r.url().includes('/version') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        const response = await created;
        const publication = await response.json();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
        return publication.id;
    }

    /** Every version node of the side menu (one per version, any stage). */
    versionMenuItems() {
        return this.page.getByRole('treeitem', {
            name: /^(Version of Record|Author Original|Published Manuscript Under Review|Unassigned version)/,
        });
    }

    /** The "Preview" among the publishing controls (top right). */
    previewButton() {
        return this.rightControls().getByRole('button', {name: 'Preview', exact: true});
    }

    /**
     * Every "Preview" button of the page: the publishing controls' one and
     * the workflow window's own header one, when they are offered.
     */
    previewButtons() {
        return this.page.getByRole('button', {name: 'Preview', exact: true});
    }

    /**
     * Press the publishing controls' "Preview" on the shown version: it
     * navigates the same page to the version's public address
     * (`…/article/view/{id}/version/{publicationId}`). Returns that address.
     *
     * @returns {Promise<string>}
     */
    async pressPreview() {
        await this.previewButton().click();
        await this.page.waitForURL(/\/article\/view\/\d+\/version\/\d+/, {
            timeout: 30_000,
            waitUntil: 'commit',
        });
        return this.page.url();
    }

    /** The panel's "Associated review round" picker (a reka-ui combobox). */
    reviewRoundPicker(panel) {
        return panel.getByRole('combobox', {name: 'Associated review round'});
    }

    /**
     * Open the review-round picker's listbox and return its options (the
     * listbox portals to the document root). Close it again with Escape;
     * the panel stays open.
     */
    async openReviewRoundOptions(panel) {
        await this.reviewRoundPicker(panel).click();
        const options = this.reviewRoundListbox().getByRole('option');
        await expect(options.first()).toBeVisible({timeout: 30_000});
        return options;
    }

    /** The picker's open listbox (portalled; gone again after Escape). */
    reviewRoundListbox() {
        return this.page.getByRole('listbox').last();
    }

    /** The panel's "Cancel". */
    async cancelPanel(panel) {
        await panel.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(panel.locator('select[name="versionStage"]')).toBeHidden({timeout: 30_000});
    }

    /**
     * The refused publish window ("The following requirements must be met
     * before this can be published." with the list and no confirm button).
     */
    refusalWindow() {
        return this.page
            .getByRole('dialog')
            .filter({
                hasText: 'The following requirements must be met before this can be published.',
            })
            .last();
    }

    /**
     * Close a publish window (the all-met one or the refused one) through
     * its header "Close" without confirming, and wait for it to go.
     */
    async closeWindow(dialog) {
        await dialog.getByRole('button', {name: 'Close', exact: true}).last().click();
        await expect(dialog).toBeHidden({timeout: 30_000});
    }

    /**
     * Unpublish the shown version while another version stays published:
     * the same red dialog as `unpublish()`, but the button that comes back
     * reads "Publish" (the submission still counts as published, Rule 2),
     * so the wait is on the readout and the publish button's regex.
     */
    async unpublishVersion() {
        await this.rightControls().getByRole('button', {name: 'Unpublish', exact: true}).click();
        const dialog = this.page
            .getByRole('dialog')
            .filter({hasText: "Are you sure you don't want this to be published?"});
        const unpublished = this.page.waitForResponse(
            (r) => r.url().includes('/unpublish') && r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Unpublish', exact: true}).click();
        await unpublished;
        await expect(this.publishButton()).toBeVisible({timeout: 30_000});
        await this.expectStatus('Unpublished');
    }

    // ---------------------------------------------------------------------
    // The Production stage's "Production Ready Files" list (Rule 16)
    // ---------------------------------------------------------------------

    /** The "Production Ready Files" table on the Production stage. */
    productionReadyFiles() {
        return this.page.getByRole('table', {name: 'Production Ready Files'});
    }

    /** A file's row in that table, by its listed name. */
    productionReadyFileRow(name) {
        return this.productionReadyFiles().getByRole('row').filter({hasText: name});
    }

    /**
     * Upload a file through the list's own "Upload" control (the legacy
     * "Upload a Production Ready File" wizard, driven by
     * ReviewStagePages.uploadViaWizard) and wait for its row.
     *
     * @param {string | {name: string, mimeType: string, buffer: Buffer}} file
     * @param {string} name the name the row will list
     */
    async uploadProductionReadyFile(file, name) {
        await this.page.getByRole('button', {name: 'Upload', exact: true}).click();
        await expect(
            this.page.getByRole('heading', {name: 'Upload a Production Ready File'})
        ).toBeVisible({timeout: 30_000});
        await uploadViaWizard(this.page, {genre: 'Article Text', file});
        await expect(this.productionReadyFileRow(name)).toBeVisible({timeout: 30_000});
    }

    /**
     * Open a file row's "More Actions" menu and return its items (headlessui
     * menuitems, portalled to the document root; patterns.md pitfall 3).
     */
    async openProductionReadyFileMenu(name) {
        await this.productionReadyFileRow(name)
            .getByRole('button', {name: /More Actions/})
            .click();
        const items = this.page.getByRole('menuitem');
        await expect(items.first()).toBeVisible({timeout: 30_000});
        return items;
    }

    /** Close an open row menu without choosing (Escape). */
    async closeMenu() {
        await this.page.keyboard.press('Escape');
        await expect(this.page.getByRole('menuitem')).toHaveCount(0, {timeout: 30_000});
    }

    /** The "Send File to Text Editor" dialog. */
    sendToTextEditorDialog() {
        return this.page.getByRole('dialog', {name: 'Send File to Text Editor'});
    }

    /** That dialog's version picker ("To which version would you like to send this file?"). */
    sendToVersionPicker(dialog) {
        return dialog.locator('select[name="sendToVersion"]');
    }

    // ---------------------------------------------------------------------
    // The Publication Settings page (Fields; Rules 13, 14)
    // ---------------------------------------------------------------------

    /** The Summary of Changes box's "Insert Content" button (submission language only). */
    insertContentButton() {
        return this.page.getByRole('button', {name: 'Insert Content', exact: true});
    }

    /** Press "Insert Content" and wait for its side panel to load its list (or empty state). */
    async openInsertContent() {
        await this.insertContentButton().first().click();
        const dialog = this.page.getByRole('dialog', {name: 'Insert Content'});
        await expect(dialog.getByText('Loading')).toBeHidden({timeout: 30_000});
        return dialog;
    }

    /** The entry page's or panel's "Update Type" select. */
    updateTypeSelect(scope = this.page) {
        return scope.locator('select[name="updateType"]');
    }

    /** The entry page's "Publication Date" box. */
    datePublishedInput() {
        return this.page.locator('input[name="datePublished"]');
    }

    /**
     * Open the "Review Publishing Details" panel on a journal that HAS
     * issues, bounded by the panel's own issue-assignment status fetch:
     * the radios' async preselection writes the form's hidden status when
     * that response lands, so touching the group earlier races it
     * (app-changes row 7). On a journal whose only issues are future ones
     * nothing gets preselected, so the checked-radio wait the U40 POM uses
     * cannot bound the race — the response itself does. The fn-k swallowed
     * first press is absorbed the same way as in openPublishPanel.
     */
    async openPublishPanelExpectingIssueFields() {
        const button = this.publishButton();
        await expect(button).toBeVisible({timeout: 30_000});
        const statusFetched = this.page.waitForResponse(
            (r) => r.url().includes('issueAssignmentStatus') && r.ok(),
            {timeout: 60_000}
        );
        await button.click();
        const panel = this.page
            .locator('[data-cy="active-modal"]')
            .filter({hasText: 'Review Publishing Details'})
            .last();
        const settled = panel.locator('select[name="versionStage"]');
        try {
            await expect(settled).toBeVisible({timeout: 5_000});
        } catch {
            await button.click();
        }
        await expect(settled).toBeVisible({timeout: 30_000});
        await statusFetched;
        return panel;
    }

    /**
     * The publish confirmation window (legacy modal titled "Schedule For
     * Publication"), matched by a distinctive piece of its text.
     */
    confirmationDialog(text) {
        return this.page.getByRole('dialog').filter({hasText: text}).last();
    }

    /**
     * Confirm the publish window by its submit label ('Publish' or
     * 'Schedule For Publication') and wait for the publish call.
     */
    async confirmPublish(dialog, submitLabel) {
        const published = this.page.waitForResponse(
            (r) => r.url().includes('/publish') && r.ok(),
            {timeout: 30_000}
        );
        await dialog
            .getByRole('button', {name: submitLabel, exact: true})
            .click();
        await published;
    }

    /** Unschedule the shown scheduled version through its red dialog. */
    async unschedule() {
        await this.rightControls()
            .getByRole('button', {name: 'Unschedule', exact: true})
            .click();
        const dialog = this.page
            .getByRole('dialog')
            .filter({hasText: "Are you sure you don't want this scheduled for publication?"});
        const unscheduled = this.page.waitForResponse(
            (r) => r.url().includes('/unpublish') && r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Unschedule', exact: true}).click();
        await unscheduled;
        await expect(
            this.rightControls().getByRole('button', {
                name: 'Schedule For Publication',
                exact: true,
            })
        ).toBeVisible({timeout: 30_000});
    }
};

/**
 * Open the current user's Tasks modal (bell button, legacy notifications
 * grid) from any backend page; returns the dialog locator.
 *
 * @param {import('@playwright/test').Page} page
 */
exports.openTasks = async function openTasks(page) {
    await page.getByRole('button', {name: /^Tasks/}).click();
    const dialog = page.getByRole('dialog').filter({hasText: 'Tasks'}).first();
    await expect(dialog.getByText('Mark New')).toBeVisible({timeout: 30_000});
    return dialog;
};
