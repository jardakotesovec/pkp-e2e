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
 * page. U34 (2026-09-20, spec docs/specs/U34-editorial-decision-recording.md)
 * added the wizard frame's remaining readers: the address a decision is
 * typed at (Rule 12), the title read as the decision's name alone (Rule 1),
 * the sentence under it, the footer's buttons left to right and "Skip this
 * email" with its notice (Rules 3, 10). The email page's own controls (the
 * templates, "Attach Files", "Insert Content", the letter) live in
 * `DecisionWizardPages.js`.
 *
 * DOM facts (lib/pkp templates/decision/record.tpl, confirmed live
 * 2026-09-20, .reports/U34/screen-notes.md ccK1/ccK3): the h1 is
 * `.app__pageHeading`, the sentence `.app__pageDescription`; the footer is
 * `.decision__footer`, its "Skip this email" a link-styled button
 * (`.decision__skipStep`); a skipped step's panel holds a warning
 * notification with the "Don't skip this email" button.
 */
const {expect} = require('@playwright/test');

/** The step rail's accessible name (lib/pkp `editor.decision.completeSteps`). */
const STEPS_LIST = 'Complete the following steps to take this decision';

/** The skipped page's notice (lib/pkp `editor.decision.emailSkipped`). */
const SKIPPED_NOTICE = 'This step has been skipped and no email will be sent.';

exports.SKIPPED_NOTICE = SKIPPED_NOTICE;

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

    /**
     * The wizard's address for a decision typed by hand (Rule 12; footnote
     * s1 gives the numbers: 8 "Decline Submission", 9 "Recommend Accept").
     */
    static recordUrl(contextPath, submissionId, decision) {
        return `/index.php/${contextPath}/decision/record/${submissionId}?decision=${decision}`;
    }

    // ---------------------------------------------------------------------
    // The heading, the sentence and the footer (Rules 1, 3, 10)
    // ---------------------------------------------------------------------

    /** The page's level-1 heading. */
    heading() {
        return this.page.getByRole('heading', {level: 1});
    }

    /**
     * The h1 reads the decision's name alone, no page name after it: a
     * one-page wizard (Rule 1; record.tpl renders the label alone when the
     * wizard has one step).
     */
    async expectTitleAlone(title) {
        await expect(this.heading()).toHaveText(title, {timeout: 30_000});
    }

    /** The sentence under the heading (Rule 11's table). */
    pageDescription() {
        return this.page.locator('.app__pageDescription');
    }

    /** The footer's visible buttons, left to right in DOM order. */
    footerButtons() {
        return this.page.locator('.decision__footer').getByRole('button');
    }

    /** The footer's button labels, left to right ("Skip this email", "Cancel", …). */
    async footerLabels() {
        const labels = await this.footerButtons().allInnerTexts();
        return labels.map((s) => s.trim()).filter(Boolean);
    }

    /** The footer holds exactly these buttons, left to right (auto-waited). */
    async expectFooter(labels) {
        await expect.poll(() => this.footerLabels(), {timeout: 30_000}).toEqual(labels);
    }

    /** The footer's "Skip this email" (email pages only). */
    skipButton() {
        return this.page.getByRole('button', {name: 'Skip this email', exact: true});
    }

    /** The skipped page's notice, in place of the letter. */
    skippedNotice() {
        return this.page.getByText(SKIPPED_NOTICE);
    }

    /** The notice's "Don't skip this email" button. */
    dontSkipButton() {
        return this.page.getByRole('button', {name: "Don't skip this email", exact: true});
    }

    /**
     * Press "Skip this email": the letter is replaced by the notice with
     * its "Don't skip this email" link, and the footer loses "Skip this
     * email" (Rule 3). Bounded by the notice.
     */
    async skipEmail() {
        await this.awaitComposerLoaded();
        await this.skipButton().click();
        await expect(this.skippedNotice()).toBeVisible({timeout: 30_000});
        await expect(this.dontSkipButton()).toBeVisible();
        await expect(this.skipButton()).toHaveCount(0);
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
