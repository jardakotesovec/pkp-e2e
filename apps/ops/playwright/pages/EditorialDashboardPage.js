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
 * counterpart is `ReviewStagePages.completeAssignParticipantForm`.
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

    async _optionLabels(select) {
        const labels = await select.locator('option').evaluateAll((options) =>
            options.map((o) => (o.textContent || '').trim())
        );
        return labels.filter(Boolean);
    }
};
