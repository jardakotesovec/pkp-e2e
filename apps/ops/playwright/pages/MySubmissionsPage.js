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
 */
const {expect} = require('@playwright/test');
const {MySubmissionsPage: SharedMySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');

exports.MySubmissionsPage = class MySubmissionsPage extends SharedMySubmissionsPage {
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
