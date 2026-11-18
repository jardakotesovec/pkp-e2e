// @ts-check
/**
 * @file playwright/pages/EditorialDashboardPage.js
 *
 * OPS editorial dashboard: the shared editorial POM
 * (shared/playwright/pages/EditorialDashboardPage.js) carries the whole
 * surface — the ONLY OPS divergence is the workflow panel's missing
 * "Workflow:" heading, so the same `withOpsWorkflowPanel` mixin the app's
 * MySubmissionsPage uses re-anchors the panel helpers here too. The one
 * OPS-only locator is the Production stage's "Decline Submission" button
 * inside the panel a row's "View" opens: a preprint server's only decision
 * (spec U23 fn-s11; the decision itself is the stage features'). The
 * Participants panel's "Assign" form (the legacy "Assign Participant"
 * window: the role select, the user grid, the "Choose a predefined message"
 * select) is here too, read-only, for the absence tests that assert which
 * roles and messages a preprint server offers (U32 S10); the OJS
 * counterpart is `ReviewStagePages.completeAssignParticipantForm`. The
 * U23 2026-11-18 revision adds the sidebar group's view links, the panel
 * header a reload is read against, and the sort clicks with the row
 * order they leave.
 * Feature spec: docs/specs/U23-submissions-dashboard.md.
 */
const {expect} = require('@playwright/test');
const {EditorialDashboardPage: SharedEditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {withOpsWorkflowPanel} = require('./MySubmissionsPage.js');

exports.EditorialDashboardPage = class EditorialDashboardPage extends withOpsWorkflowPanel(
    SharedEditorialDashboardPage
) {
    /**
     * The Production stage's "Decline Submission" button in the open
     * workflow panel (the panel lands on "Workflow: Production" for an
     * active preprint). Pressing it leaves for the decision wizard page
     * (`DecisionPage`).
     */
    declineSubmissionButton() {
        return this.workflowDialog()
            .locator('[data-cy="workflow-action-items"]')
            .getByRole('button', {name: 'Decline Submission', exact: true});
    }

    /** The Participants panel's "Assign" button in the open workflow panel. */
    participantsAssignButton() {
        return this.workflowDialog()
            .locator('[data-cy="workflow-secondary-items"]')
            .getByRole('button', {name: 'Assign', exact: true});
    }

    /**
     * The legacy "Assign Participant" window the "Assign" button opens: the
     * dialog carrying the role select (`select[name="filterUserGroupId"]`).
     * The workflow panel is a dialog too, so the window is the last match.
     */
    assignParticipantForm() {
        return this.page
            .getByRole('dialog')
            .filter({has: this.page.locator('select[name="filterUserGroupId"]')})
            .last();
    }

    /** Press "Assign" and wait for the window's role select and message select. */
    async openAssignParticipantForm() {
        await this.participantsAssignButton().click();
        const form = this.assignParticipantForm();
        await expect(form.locator('select[name="filterUserGroupId"]')).toBeVisible({timeout: 30_000});
        await expect(form.locator('select[name="template"]')).toBeVisible({timeout: 30_000});
        return form;
    }

    /** The "Locate a User" role select's option labels, in order (blank entries dropped). */
    async assignParticipantGroupOptions() {
        return this._optionLabels(this.assignParticipantForm().locator('select[name="filterUserGroupId"]'));
    }

    /** The "Choose a predefined message" select's option labels, in order (blank entries dropped). */
    async assignParticipantTemplateOptions() {
        return this._optionLabels(this.assignParticipantForm().locator('select[name="template"]'));
    }

    /** Close the window with its bottom "Cancel" (an `<a>` link on this legacy form, patterns.md pitfall 7). */
    async cancelAssignParticipantForm() {
        const form = this.assignParticipantForm();
        await form.getByRole('link', {name: /^\s*Cancel\s*$/}).last().click();
        await expect(form).toHaveCount(0, {timeout: 30_000});
    }

    /**
     * Every view entry of the sidebar's "Editor Dashboard" group: the links
     * to a `dashboard/editorial` view (the group's own toggle is a `#` link
     * and stays out). A preprint server's manager has six (U23 Rule 2,
     * scenario 15).
     */
    editorialViewLinks() {
        return this.sideNav().locator('a[href*="dashboard/editorial"]');
    }

    /**
     * The open workflow panel's header: the submission's ID, contributors,
     * title and stage, then "Preview", "Activity Log", "Library" (OPS; U23
     * Rule 11 reads which submission the panel is on from it).
     */
    workflowPanelHeader() {
        return this.workflowDialog().locator('[data-cy="sidemodal-header"]');
    }

    /**
     * Click a sortable column's header ('ID' or 'Days') and wait for the
     * address to record the sort: `sortColumn` (`id`, `lastActivity`) and
     * `sortDirection` (`descending`, `ascending`), the view kept (U23
     * Rules 4–5).
     */
    async sortBy(columnName, sortColumn, direction) {
        await this.sortButton(columnName).click();
        await this.page.waitForURL(
            (url) =>
                url.searchParams.get('sortColumn') === sortColumn &&
                url.searchParams.get('sortDirection') === direction,
            {waitUntil: 'commit'}
        );
    }

    /** The ID cell of every data row, in row order (a one-shot read; use
     * `expectRowIds()` to wait for an order). */
    async rowIds() {
        return this.dataRows().evaluateAll((rows) =>
            rows.map((r) => (r.children[0] ? r.children[0].innerText.trim() : ''))
        );
    }

    /** Wait until the rows stand in exactly this ID order (the whole page). */
    async expectRowIds(ids) {
        await expect
            .poll(() => this.rowIds(), {timeout: 30_000})
            .toEqual(ids.map(String));
    }

    async _optionLabels(select) {
        const labels = await select.locator('option').evaluateAll((options) =>
            options.map((o) => (o.textContent || '').trim())
        );
        return labels.filter(Boolean);
    }
};
