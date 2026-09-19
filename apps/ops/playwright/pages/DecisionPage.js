// @ts-check
/**
 * @file playwright/pages/DecisionPage.js
 *
 * The full-page decision wizard (decision/record/{id}) on a preprint
 * server: the Production stage's "Decline Submission" (OPS's `Decline`
 * extends lib/pkp's `InitialDecline`: one "Notify Authors" composer step
 * and "Record Decision"), then the success dialog whose "View Submission"
 * link returns to the address the wizard was opened from (the editorial
 * dashboard with the workflow panel open). The OPS counterpart of the OJS
 * tree's `ReviewStagePages.DecisionPage`; the decision itself belongs to
 * the stage features, so a suite here drives it only to reach a state the
 * list must then show (U23 S11). U33 (2026-09-20) added the readers a
 * Production-stage suite needs on the same page: the step rail ("1 Notify
 * Authors"), the completion dialog by its title ("Submission Declined",
 * "Submission Reactivated") read before it is left, and the split of
 * `record()` into `recordDecision()` and `viewSubmission()`; "Revert
 * Decline" (`RevertDecline`, one "Notify Authors" step too) drives the same
 * page.
 */
const {expect} = require('@playwright/test');

/** The step rail's accessible name (lib/pkp `editor.decision.completeSteps`). */
const STEPS_LIST = 'Complete the following steps to take this decision';

exports.DecisionPage = class DecisionPage {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
        this.continueButton = page.getByRole('button', {name: 'Continue', exact: true});
        this.recordButton = page.getByRole('button', {name: 'Record Decision', exact: true});
        this.viewSubmissionLink = page.getByRole('link', {name: 'View Submission'});
    }

    /** The wizard's step rail items ("1 Notify Authors", …). */
    stepItems() {
        return this.page.getByRole('list', {name: STEPS_LIST}).getByRole('listitem');
    }

    /**
     * The rail lists exactly these steps, in order (each matched as a
     * substring, so the leading number is ignored): the one read that
     * states which pages the wizard has and that it has no other.
     */
    async expectSteps(labels) {
        await expect(this.stepItems()).toHaveText(
            labels.map((label) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
            {timeout: 30_000}
        );
    }

    /** The current step's level-2 heading ("Notify Authors"). */
    stepHeading(label) {
        return this.page.getByRole('heading', {name: label, exact: true, level: 2});
    }

    /** The completion dialog by its exact title ("Submission Declined", "Submission Reactivated"). */
    completionDialog(title) {
        return this.page.getByRole('dialog', {name: title, exact: true});
    }

    /**
     * Press "Record Decision" and wait for the completion dialog titled
     * `title`, returned for the caller to read before it is left. The click
     * is retried while the wizard re-renders under it, but never once the
     * decisions POST is on the wire (recording twice is not idempotent; the
     * same guard as `record()`).
     */
    async recordDecision(title) {
        await this.awaitComposerLoaded();
        const dialog = this.completionDialog(title);
        let posted = false;
        this.page
            .waitForRequest((r) => r.url().includes('/decisions') && r.method() === 'POST', {
                timeout: 60_000,
            })
            .then(
                () => (posted = true),
                () => {}
            );
        await expect(async () => {
            if (!(await dialog.count()) && !posted) {
                try {
                    await this.recordButton.click({timeout: 2_000});
                } catch {
                    // retried by toPass; success is the completion dialog
                }
            }
            expect(await dialog.count()).toBeGreaterThan(0);
        }).toPass({intervals: [500, 1_000, 2_000], timeout: 60_000});
        await expect(dialog).toBeVisible();
        return dialog;
    }

    /**
     * Follow the completion dialog's "View Submission Summary" link, its
     * only control, back to the address the wizard was opened from. The
     * caller asserts the landing (the workflow panel's header).
     */
    async viewSubmission() {
        await this.viewSubmissionLink.click();
        await this.page.waitForURL((u) => /\/dashboard\/editorial/.test(u.pathname), {
            waitUntil: 'commit',
            timeout: 30_000,
        });
    }

    /**
     * The wizard page is open under the given decision title: the h1 reads
     * "{Decision}: {Step}" on multi-step wizards and plain "{Decision}" on
     * single-step ones (templates/decision/record.tpl).
     */
    async expectOpen(title) {
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await expect(
            this.page.getByRole('heading', {name: new RegExp(`^${escaped}(:|$)`), level: 1})
        ).toBeVisible({timeout: 30_000});
    }

    /**
     * Wait for the current step's email composer to finish loading its
     * template (patterns.md pitfall 12: a submit during the load mask posts
     * an empty body that fails server-side validation).
     */
    async awaitComposerLoaded() {
        await expect(this.page.locator('.composer__loadingTemplateMask')).toHaveCount(0, {
            timeout: 30_000,
        });
    }

    /**
     * Record the decision and return through "View Submission". The wizard
     * can re-render under the click (seen on the OMP twin of the OJS page
     * object), so the click is outcome-keyed and bounded: success is the
     * success dialog's "View Submission" link; no further click once the
     * decisions POST is on the wire (recording twice is not idempotent).
     */
    async record() {
        await this.awaitComposerLoaded();
        let posted = false;
        this.page
            .waitForRequest((r) => r.url().includes('/decisions') && r.method() === 'POST', {
                timeout: 60_000,
            })
            .then(
                () => (posted = true),
                () => {}
            );
        await expect(async () => {
            if (!(await this.viewSubmissionLink.count()) && !posted) {
                try {
                    await this.recordButton.click({timeout: 2_000});
                } catch {
                    // retried by toPass; success is the completion link
                }
            }
            expect(await this.viewSubmissionLink.count()).toBeGreaterThan(0);
        }).toPass({intervals: [500, 1_000, 2_000], timeout: 60_000});
        await this.viewSubmissionLink.click();
    }

    /**
     * Walk every remaining step with no per-step input: wait out composer
     * loads, "Continue" until "Record Decision" appears, record, and follow
     * "View Submission" back. The caller asserts the landing (the dashboard's
     * workflow panel, `EditorialDashboardPage.expectWorkflowOpen()`).
     */
    async completeAll({maxSteps = 6} = {}) {
        for (let i = 0; i < maxSteps; i++) {
            await this.awaitComposerLoaded();
            if (await this.recordButton.isVisible()) {
                await this.record();
                return;
            }
            await this.continueButton.click();
        }
        throw new Error(`DecisionPage.completeAll: no "Record Decision" button within ${maxSteps} steps`);
    }
};
