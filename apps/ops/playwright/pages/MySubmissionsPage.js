// @ts-check
/**
 * @file playwright/pages/MySubmissionsPage.js
 *
 * OPS extension of the shared My Submissions POM
 * (shared/playwright/pages/MySubmissionsPage.js). The list mechanics are the
 * shared DashboardPage everywhere; what differs on OPS is the workflow panel
 * a row's "View" opens: it lands on the preprint's publication tabs with no
 * stage menu (spec U22 fn-e), and its header carries the submission's
 * authors line as the panel heading — there is no "Workflow: …" heading the
 * shared anchors key on. Re-anchor the three workflow-panel helpers on the
 * panel's own workflow navigation (the "Preprint" menu entry); everything
 * else is inherited unchanged.
 *
 * The re-anchoring is a mixin (`withOpsWorkflowPanel`) because the same
 * panel serves the editorial dashboard too — the OPS EditorialDashboardPage
 * applies it on top of the shared editorial POM. The subclass adds OPS's
 * own label for the editors' assignment filter (U22 Rule 5).
 */
const {expect} = require('@playwright/test');
const {MySubmissionsPage: SharedMySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');

/**
 * Rebind the workflow-panel anchors on OPS's headingless panel. Applies to
 * any DashboardPage-family base (author list, editorial dashboard).
 */
const withOpsWorkflowPanel = (Base) => class extends Base {
    /**
     * The workflow panel's own navigation entry — the stable inner anchor
     * (the side-modal wrapper reports visibility:hidden, so presence is
     * judged on inner content; patterns.md pitfall 5).
     */
    workflowNavEntry() {
        return this.page
            .getByRole('dialog')
            .getByRole('navigation')
            .getByRole('link', {name: 'Preprint', exact: true});
    }

    /** The workflow panel a row's "View" opens over the list. */
    workflowDialog() {
        return this.page
            .getByRole('dialog')
            .filter({has: this.page.getByRole('navigation').getByRole('link', {name: 'Preprint', exact: true})});
    }

    async expectWorkflowOpen() {
        await expect(this.workflowNavEntry()).toBeVisible({timeout: 30_000});
    }

    /** Close the open workflow panel and wait for it to be gone. */
    async closeWorkflow() {
        await this.workflowDialog()
            .getByRole('button', {name: 'Close', exact: true})
            .first()
            .click();
        await expect(this.workflowNavEntry()).toHaveCount(0, {timeout: 30_000});
    }
};

exports.withOpsWorkflowPanel = withOpsWorkflowPanel;

exports.MySubmissionsPage = class MySubmissionsPage extends withOpsWorkflowPanel(
    SharedMySubmissionsPage
) {
    /**
     * The editors' assignment filter under OPS's own label, "Assigned to
     * Moderator" (the app's editor.po; a journal's reads "Assigned To
     * Editor"): absent from an author-only account's Filters panel (U22
     * Rule 5), so a suite asserting that absence names both labels.
     */
    assignedToModeratorField() {
        return this.filterField('Assigned to Moderator');
    }

    /**
     * Every editors'-assignment label the Filters panel could carry on a
     * preprint server: the lib/pkp wording and OPS's override. Both are
     * absent for an author-only account; the days filter beside them is
     * the positive control.
     */
    editorAssignmentFilterLabels() {
        return ['Assigned To Editor', 'Assigned to Moderator'];
    }
};
