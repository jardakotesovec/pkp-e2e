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
 * roles and messages a preprint server offers (U32 S10), delegating to
 * the U35 `StageParticipantsPages.AssignParticipantWindow`, which owns the
 * driven window; the OJS counterpart is
 * `ReviewStagePages.completeAssignParticipantForm`.
 * Feature spec: docs/specs/U23-submissions-dashboard.md.
 */
const {EditorialDashboardPage: SharedEditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {withOpsWorkflowPanel} = require('./MySubmissionsPage.js');
const {AssignParticipantWindow} = require('./StageParticipantsPages.js');

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
     * The legacy "Assign Participant" window the "Assign" button opens
     * (the U35 `AssignParticipantWindow` owns the driven window; these
     * readers delegate to it so the U32 absence test keeps its API).
     */
    assignParticipantForm() {
        return new AssignParticipantWindow(this.page).dialog();
    }

    /** Press "Assign" and wait for the window's role select and message select. */
    async openAssignParticipantForm() {
        await this.participantsAssignButton().click();
        const window = new AssignParticipantWindow(this.page);
        await window.expectOpen();
        return window.dialog();
    }

    /** The "Locate a User" role select's option labels, in order (blank entries dropped). */
    async assignParticipantGroupOptions() {
        return new AssignParticipantWindow(this.page).roleOptions();
    }

    /** The "Choose a predefined message" select's option labels, in order (blank entries dropped). */
    async assignParticipantTemplateOptions() {
        return new AssignParticipantWindow(this.page).templateOptions();
    }

    /** Close the window with its bottom "Cancel" (an `<a>` link on this legacy form, patterns.md pitfall 7). */
    async cancelAssignParticipantForm() {
        await new AssignParticipantWindow(this.page).cancel();
    }
};
