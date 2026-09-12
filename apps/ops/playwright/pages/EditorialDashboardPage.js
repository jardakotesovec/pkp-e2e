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
 * (spec U23 fn-s11; the decision itself is the stage features').
 * Feature spec: docs/specs/U23-submissions-dashboard.md.
 */
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
};
