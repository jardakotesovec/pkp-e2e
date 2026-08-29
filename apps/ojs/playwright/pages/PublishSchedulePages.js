// @ts-check
/**
 * @file playwright/pages/PublishSchedulePages.js
 *
 * OJS-local Page Object for the Publish, schedule & versions feature
 * (spec: docs/specs/U49-publish-schedule-and-versions.md). Extends the
 * U40 PublicationScreen (workflow Publication area, "Review Publishing
 * Details" panel, publish/unpublish flows, issue helpers) with the
 * version machinery and status surfaces this feature owns:
 *
 * - the "Status: {state}" readout in the workflow's left controls;
 * - the top-right publish/unpublish/unschedule buttons (right controls);
 * - the version side menu (one treeitem per version, entries nested) and
 *   the "Create New Version" dialog;
 * - the publish confirmation window (legacy modal) and its refusal form;
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
 */
const {expect} = require('@playwright/test');
const {PublicationScreen} = require('./PublicationMetadataPages.js');

exports.PublishScreen = class PublishScreen extends PublicationScreen {
    /** The workflow's left controls (carry the "Status: {state}" readout). */
    leftControls() {
        return this.page.locator('[data-cy="workflow-controls-left"]');
    }

    /** The workflow's top-right controls (publish/unpublish/unschedule). */
    rightControls() {
        return this.page.locator('[data-cy="workflow-controls-right"]');
    }

    /** Assert the shown version's status readout ("Unscheduled", …). */
    async expectStatus(state) {
        await expect(this.leftControls()).toContainText(`Status: ${state}`, {
            timeout: 30_000,
        });
    }

    /** A version's side-menu treeitem (accessible name = version name). */
    versionMenuItem(versionLabel) {
        return this.page.getByRole('treeitem', {name: versionLabel, exact: true});
    }

    /**
     * Open a Publication entry under a specific version's submenu (the
     * side menu nests each version's entries inside its treeitem; clicking
     * the version's own link expands the group).
     */
    async openVersionEntry(versionLabel, entryName) {
        const item = this.versionMenuItem(versionLabel);
        await expect(item).toBeVisible({timeout: 30_000});
        const entry = item.getByRole('link', {name: entryName, exact: true});
        if (!(await entry.isVisible())) {
            await item.getByRole('link', {name: versionLabel, exact: true}).click();
        }
        await expect(entry).toBeVisible({timeout: 30_000});
        await entry.click();
        await expect(
            this.page.getByRole('heading', {name: `Publication: ${entryName}`})
        ).toBeVisible({timeout: 30_000});
    }

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
     * the dialog closing.
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
        await created;
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
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
