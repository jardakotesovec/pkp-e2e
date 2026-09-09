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
 */
const {expect} = require('@playwright/test');
const {PublicationScreen} = require('./PublicationMetadataPages.js');

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
