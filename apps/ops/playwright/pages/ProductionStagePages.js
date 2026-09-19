// @ts-check
/**
 * @file playwright/pages/ProductionStagePages.js
 *
 * The Production stage entry on a preprint server (feature U33, spec
 * docs/specs/U33-production-stage.md), OPS-only by design (PRINCIPLES M1):
 * what the "Production" entry shows once open, on top of the shared
 * `WorkflowPage` frame (patterns.md "Page Object Model": the frame is
 * shared, the stage's own panels and buttons stay app-side).
 *
 * Surfaces:
 * - the stage's panels: the "Production Tasks & Discussions" table with its
 *   "Add" button, the right-hand "Participants" panel; and the journal's
 *   surfaces the preprint server never renders (register OPS1), read for
 *   the absence assertions: the "Production Ready Files" list with its
 *   "Upload", the notice box ("Notification" heading, the galley and
 *   press notice texts);
 * - the decision buttons in the action region ("Post the preprint",
 *   "Decline Submission", "Revert Decline", "Delete"), their exact roster
 *   left to right and the highlighted one (`bg-primary`, the frame's
 *   `isPrimary` button);
 * - a participant's row on the "Participants" panel, its "More Actions" ›
 *   "Edit" › "Edit Assignment" window (a legacy side window whose form
 *   arrives by AJAX, so the wait is on its `recommendOnly` box, never on a
 *   button: .reports/U33/screen-notes.md ccK4) and the row's "Only allowed
 *   to recommend an editorial decision" mark afterwards.
 *
 * DOM facts (confirmed live 2026-09-19, .reports/U33/screen-notes.md
 * ccK1/ccK4): the action buttons live in `[data-cy="workflow-action-items"]`;
 * "Post the preprint" carries `bg-primary`; the discussions panel is the
 * main column's one table; a row's menu is the button named
 * "{name} More Actions", its entries `role=menuitem` portaled to the page.
 */
const {expect} = require('@playwright/test');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

/** The preprint server's Production-stage `workflowMenuKey`. */
const PRODUCTION_MENU_KEY = 'workflow_5';

/** The discussions panel's title (lib/pkp `submission.queries.production`). */
const DISCUSSIONS_PANEL = 'Production Tasks & Discussions';

/** The journal's file list title (never rendered on a preprint server, OPS1). */
const FILES_PANEL = 'Production Ready Files';

/** The journal's and the press's notice texts (never rendered here, Rule 3e). */
const NOTICE_TEXTS = [
    'Assign a user to create galleys using the Assign link in the Participants list.',
    'Awaiting Galleys.',
    'Awaiting approval.',
    'Catalog Management',
];

/** The participant row's recommend-only mark after "Edit Assignment". */
const RECOMMEND_ONLY_MARK = 'Only allowed to recommend an editorial decision';

exports.PRODUCTION_MENU_KEY = PRODUCTION_MENU_KEY;
exports.DISCUSSIONS_PANEL = DISCUSSIONS_PANEL;
exports.FILES_PANEL = FILES_PANEL;
exports.NOTICE_TEXTS = NOTICE_TEXTS;
exports.RECOMMEND_ONLY_MARK = RECOMMEND_ONLY_MARK;

exports.ProductionStagePage = class ProductionStagePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{appContext?: any}} [options]
     */
    constructor(page, contextPath, options = {}) {
        this.page = page;
        /** The shared workflow frame, with the preprint server's "Preprint" group label. */
        this.frame = new WorkflowPage(page, contextPath, {
            appContext: options.appContext,
            labels: {publicationGroup: 'Preprint'},
        });
    }

    /** Open the editorial view straight at the "Production" entry. */
    async gotoProduction(submissionId) {
        await this.frame.gotoEditorial(submissionId, {menuKey: PRODUCTION_MENU_KEY});
        await this.frame.expectStageHeading('Production');
    }

    // ---------------------------------------------------------------------
    // The panels (Rules 1, 3e, 12; OPS1)
    // ---------------------------------------------------------------------

    /** The "Production Tasks & Discussions" table (main column, or the author's page). */
    discussionsPanel() {
        return this.frame.dialog().getByRole('table', {name: DISCUSSIONS_PANEL, exact: true});
    }

    /** The discussions panel's "Add" button. */
    discussionsAddButton() {
        return this.frame.dialog().getByRole('button', {name: 'Add', exact: true});
    }

    /** The journal's "Production Ready Files" list (an absence read here). */
    productionReadyFilesList() {
        return this.frame.dialog().getByRole('table', {name: FILES_PANEL, exact: true});
    }

    /** The file list's "Upload" button (an absence read here). */
    uploadButton() {
        return this.frame.primaryColumn().getByRole('button', {name: 'Upload', exact: true});
    }

    /** The journal's notice box heading (an absence read here). */
    noticeHeading() {
        return this.frame.dialog().getByRole('heading', {name: 'Notification', exact: true});
    }

    /** Any of the journal's or the press's notice texts (an absence read here). */
    noticeText(text) {
        return this.frame.dialog().getByText(text, {exact: true});
    }

    /**
     * The panels the preprint server never renders are absent: no file
     * list, no "Upload", no notice heading and none of the notice texts.
     * The caller pairs it with the discussions panel as the control.
     */
    async expectNoJournalSurfaces() {
        await expect(this.productionReadyFilesList()).toHaveCount(0);
        await expect(this.uploadButton()).toHaveCount(0);
        await expect(this.frame.dialog().getByText(/These are the files that will be sent/)).toHaveCount(0);
        await expect(this.noticeHeading()).toHaveCount(0);
        for (const text of NOTICE_TEXTS) {
            await expect(this.noticeText(text)).toHaveCount(0);
        }
    }

    // ---------------------------------------------------------------------
    // The decision buttons (Rules 1, 6, 8–11)
    // ---------------------------------------------------------------------

    /** A decision button of the action region by its exact label. */
    decisionButton(label) {
        return this.frame.actionButton(label);
    }

    /** The action region's buttons are exactly these, left to right (auto-waited). */
    async expectDecisionButtons(labels) {
        await expect.poll(() => this.frame.actionButtonLabels(), {timeout: 30_000}).toEqual(labels);
    }

    /** The highlighted button (the frame's `isPrimary`, class `bg-primary`). */
    async expectHighlighted(label) {
        await expect(this.decisionButton(label)).toHaveClass(/\bbg-primary\b/, {timeout: 30_000});
    }

    async expectNotHighlighted(label) {
        await expect(this.decisionButton(label)).not.toHaveClass(/\bbg-primary\b/, {timeout: 30_000});
    }

    /** Any recommendation control on the panel (an absence read; register A1). */
    recommendationControls() {
        return this.frame.dialog().getByRole('button', {name: /recommend/i});
    }

    /**
     * Press "Post the preprint": the newest version's "Title & Abstract"
     * page opens under the "Preprint" group (Rule 6).
     */
    async pressPostThePreprint() {
        await this.frame.pressShortcutToPage('Post the preprint', 'Title & Abstract');
    }

    // ---------------------------------------------------------------------
    // The "Participants" panel's rows (Actors row 7; footnote s)
    // ---------------------------------------------------------------------

    /** A participant's row on the "Participants" panel by the name it shows. */
    participantRow(name) {
        return this.frame.secondaryColumn().getByRole('listitem').filter({hasText: name});
    }

    /** The row's recommend-only mark. */
    recommendOnlyMark(name) {
        return this.participantRow(name).getByText(RECOMMEND_ONLY_MARK);
    }

    /**
     * Participants row › "More Actions" › "Edit" › tick "This participant is
     * only allowed to recommend an editorial decision…" › "OK": the
     * assignment becomes a recommending one (the roster carries no such
     * assignment, so a scenario sets it here). Bounded by the window
     * closing and the row's mark appearing.
     */
    async setRecommendOnly(name) {
        const row = this.participantRow(name);
        await expect(row).toBeVisible({timeout: 30_000});
        await row.getByRole('button', {name: `${name} More Actions`}).click();
        await this.page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const form = this.page
            .getByRole('dialog')
            .filter({has: this.page.locator('input[name="recommendOnly"]')});
        const box = form.locator('input[name="recommendOnly"]');
        await expect(box).toBeVisible({timeout: 30_000});
        await box.check();
        await form.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(form).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        await expect(this.recommendOnlyMark(name)).toBeVisible({timeout: 30_000});
    }
};
