// @ts-check
/**
 * @file playwright/pages/DecisionSettingsPages.js
 *
 * The settings screens the decision-recording scenarios (feature U34, spec
 * docs/specs/U34-editorial-decision-recording.md, "Settings that modify
 * behavior") set on a scratch journal before their first step, since no
 * scenario key covers them yet (scenarios.md "Field shapes not built yet":
 * `notifyAllAuthors`, the email templates, payments). OJS-owned (PRINCIPLES
 * M1): a press shares the first two screens but has no fee page.
 *
 * - `ManageEmailsPage`, `WorkflowEmailsSettingsPage` — Settings › Workflow ›
 *   "Emails" and "Manage Emails", now in the shared
 *   `shared/playwright/pages/EmailsPages.js` (U56) and re-exported here.
 * - `PaymentsSetupPage` — Settings › Distribution › "Payments" ("Enable",
 *   "Currency", "Payment Plugins", the manual plugin's "Manual Payment
 *   Instructions", "Save") and the "Payments" page's "Payment Types" tab
 *   (`#paymentTypesForm`, "Article Processing Charge", a legacy AJAX form).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

// Moved to the shared tree for U56 (Emails management); re-exported here
// so the U34 suite's imports stay as they were.
const {ManageEmailsPage, WorkflowEmailsSettingsPage} = require('../../../../shared/playwright/pages/EmailsPages.js');

exports.ManageEmailsPage = ManageEmailsPage;
exports.WorkflowEmailsSettingsPage = WorkflowEmailsSettingsPage;

exports.PaymentsSetupPage = class PaymentsSetupPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /**
     * Settings › Distribution › Payments: enable payments in US Dollars
     * through the manual plugin with its instructions filled (an empty box
     * leaves the plugin unconfigured and no "Request Payment" page shows;
     * seed-facts), and save.
     */
    async enableManualPayments({instructions}) {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/distribution'));
        await this.page.locator('#payments-button').click();
        const panel = this.page.getByRole('tabpanel', {name: 'Payments', exact: true});
        const enable = panel.locator('input[name="paymentsEnabled"]');
        await expect(enable).toBeVisible({timeout: 30_000});
        await enable.check();
        await panel.locator('select[name="currency"]').selectOption({label: 'US Dollar'});
        await panel.locator('select[name="paymentPluginName"]').selectOption({label: 'Manual Fee Payment'});
        const box = panel.locator('textarea[name="manualInstructions"]');
        await expect(box).toBeVisible({timeout: 30_000});
        await box.fill(instructions);
        await panel.getByRole('button', {name: 'Save', exact: true}).first().click();
        await expect(panel.locator('[role="status"]').filter({hasText: 'Saved'})).toBeVisible({timeout: 30_000});
    }

    /** The "Payments" page's "Payment Types" tab: set the "Article Processing Charge" and save. */
    async setPublicationFee(amount) {
        await this.page.goto(this.contextUrl(this.contextPath, '/payments'));
        await this.page.locator('a[name="paymentTypes"]').click();
        const form = this.page.locator('#paymentTypesForm');
        const fee = form.locator('input[name="publicationFee"]');
        await expect(fee).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        await fee.fill(String(amount));
        const saved = this.page.waitForResponse(
            (r) => r.url().includes('savePaymentTypes') && r.request().method() === 'POST' && r.ok(),
            {timeout: 30_000}
        );
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await waitForJQueryIdle(this.page);
        await this.page.goto(this.contextUrl(this.contextPath, '/payments'));
        await this.page.locator('a[name="paymentTypes"]').click();
        await expect(this.page.locator('#paymentTypesForm input[name="publicationFee"]')).toHaveValue(String(amount), {
            timeout: 30_000,
        });
    }
};
