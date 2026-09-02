// @ts-check
/**
 * @file lib/pkp/playwright/pages/WorkflowPage.js
 *
 * The per-submission workflow panel — the side modal the editorial dashboard
 * and My Submissions open over their lists. It is one ui-library surface
 * (`pages/workflow/WorkflowPage.vue`) in all three apps, so its frame lives
 * here: opening the panel by address or from a list row, the header
 * (number, contributors' line, title, stage bubble, header buttons), the
 * side menu (groups, stage entries, the striped active entry, review-round
 * sub-entries, the version nodes and their pages), the main-column heading,
 * the status box, the "no access" box, the publication-page control
 * regions, and the three confirm dialogs the frame itself carries (Delete,
 * Return to Workflow, Return to Done).
 * Feature spec: docs/specs/U24-workflow-screen-and-stage-access.md.
 *
 * What lives elsewhere: what each stage entry shows once open (decision
 * buttons, file panels) is the stage feature's and stays in the app-side
 * page objects (`apps/<app>/playwright/pages/ReviewStagePages.js` and
 * friends); the list-side mechanics of the dashboards are
 * `EditorialDashboardPage` / `MySubmissionsPage`.
 *
 * App neutrality (PRINCIPLES M2): nothing here gates on an app name. The
 * labels that differ per app are resolved from `appContext.capabilities`
 * where a capability decides them and are otherwise passed in through the
 * `labels` option:
 * - `reviewStage`: the review stage entry's label — "Review" on a journal,
 *   "External Review" where `hasInternalReview` is set (a press);
 * - `publicationGroup`: the second menu group — "Publication" by default;
 *   a preprint server passes "Preprint";
 * - `workflowHeading` / `publicationHeading`: the main-column heading
 *   prefixes — "Workflow" and the publication group's label.
 * The panel is anchored on its header (`[data-cy="sidemodal-header"]` with
 * the submission number), never on a "Workflow:" heading, so the anchors
 * hold on a preprint server's author view too, which has no Workflow group.
 *
 * DOM facts the locators rely on (confirmed live 2026-09-02, all apps):
 * - the panel is a reka-ui dialog; the confirm dialogs it opens are dialogs
 *   too, named by their title (patterns.md pitfall 7);
 * - the side menu is a PrimeVue PanelMenu inside `nav`: every group, stage,
 *   round, version node and page is an `a` (role link) whose classes carry
 *   the nesting (`!px-7`/`!px-9` level 2, `!px-10`/`!px-12` level 3), the
 *   active-stage stripe (`!border-s-8`) and the selection (`bg-selection-dark`);
 * - the main column is `[data-cy="workflow-primary-items"]`; the status
 *   box and the no-access box are both a `div.border` with a `p`, the status
 *   box additionally carrying an `h3` ("Status" / "Round N Status");
 * - the action buttons sit in `[data-cy="workflow-action-items"]`, the
 *   right-hand column in `[data-cy="workflow-secondary-items"]`, and the
 *   publication pages' control regions in `[data-cy="workflow-controls-left"]`
 *   / `-right`; each of those wrappers is absent when it has nothing to show.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');

/** The no-access box's whole text (Rule 13). */
const NO_ACCESS_TEXT = "You don't currently have access to that stage of the workflow.";

/** The three confirm dialogs of Rules 18–19: title and body, verbatim. */
const DIALOGS = {
    delete: {
        title: 'Delete',
        message: 'Are you sure you want to permanently delete this submission?',
    },
    returnToWorkflow: {
        title: 'Return to Workflow',
        message:
            'Return this submission to the workflow stage it occupied before it was moved to Done.',
    },
    returnToDone: {
        title: 'Return to Done',
        message: 'Return this submission to the Done stage.',
    },
};

/** Version-node labels are Publish, schedule & versions' (U49); match any shape. */
const VERSION_NODE_PATTERN = /^(Unassigned version|Version of Record|Author Original)\b/;

exports.WorkflowPage = class WorkflowPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{appContext?: any, labels?: {reviewStage?: string, publicationGroup?: string, workflowHeading?: string, publicationHeading?: string}}} [options]
     */
    constructor(page, contextPath, options = {}) {
        super(page);
        this.contextPath = contextPath;
        const capabilities = options.appContext?.capabilities || {};
        const labels = options.labels || {};
        this.labels = {
            workflowGroup: 'Workflow',
            reviewStage: labels.reviewStage || (capabilities.hasInternalReview ? 'External Review' : 'Review'),
            publicationGroup: labels.publicationGroup || 'Publication',
            workflowHeading: labels.workflowHeading || 'Workflow',
            publicationHeading: labels.publicationHeading || labels.publicationGroup || 'Publication',
        };
    }

    // ---------------------------------------------------------------------
    // Opening and closing (Rules 1, 2c, 12)
    // ---------------------------------------------------------------------

    /** The editorial dashboard address that opens the panel (Rule 2c). */
    editorialUrl(submissionId, menuKey = null) {
        const key = menuKey ? `&workflowMenuKey=${menuKey}` : '';
        return this.contextUrl(
            this.contextPath,
            `/dashboard/editorial?workflowSubmissionId=${submissionId}${key}`
        );
    }

    /** The My Submissions address that opens the author's view. */
    authorUrl(submissionId, menuKey = null) {
        const key = menuKey ? `&workflowMenuKey=${menuKey}` : '';
        return this.contextUrl(
            this.contextPath,
            `/dashboard/mySubmissions?workflowSubmissionId=${submissionId}${key}`
        );
    }

    /** Open a submission's workflow on the editorial dashboard by address. */
    async gotoEditorial(submissionId, {menuKey = null} = {}) {
        await this.page.goto(this.editorialUrl(submissionId, menuKey));
        await this.expectOpen(submissionId);
    }

    /** Open the author's view of the same workflow (My Submissions) by address. */
    async gotoAuthor(submissionId, {menuKey = null} = {}) {
        await this.page.goto(this.authorUrl(submissionId, menuKey));
        await this.expectOpen(submissionId);
    }

    /**
     * Open the panel from a list row's "View" action (the row comes from
     * `EditorialDashboardPage`/`MySubmissionsPage.findRowByTag`).
     */
    async openFromRow(row, submissionId = null) {
        await row.getByRole('button', {name: 'View', exact: true}).click();
        await this.expectOpen(submissionId);
    }

    /**
     * The panel is mounted: its header shows the submission number (the one
     * anchor every app and view shares — the error shell of Rule 3 included).
     */
    async expectOpen(submissionId = null) {
        await expect(this.header()).toBeVisible({timeout: 30_000});
        if (submissionId !== null) {
            // The line also carries the "Refreshing data" spinner's text, so
            // the number is matched as the line's leading token.
            await expect(this.submissionNumber()).toHaveText(
                new RegExp(`^\\s*${submissionId}\\b`),
                {timeout: 30_000}
            );
        }
    }

    /** No workflow panel is open. */
    async expectClosed() {
        await expect(this.page.locator('[data-cy="sidemodal-header"]')).toHaveCount(0, {
            timeout: 30_000,
        });
    }

    /** Close the panel through its "Close" control and wait for it to go. */
    async close() {
        await this.dialog().getByRole('button', {name: 'Close', exact: true}).first().click();
        await this.expectClosed();
    }

    /** The `workflowMenuKey` the address currently carries, or null. */
    menuKeyFromUrl() {
        return new URL(this.page.url()).searchParams.get('workflowMenuKey');
    }

    /** The `workflowSubmissionId` the address currently carries, or null. */
    submissionIdFromUrl() {
        return new URL(this.page.url()).searchParams.get('workflowSubmissionId');
    }

    // ---------------------------------------------------------------------
    // The panel and its header (Rules 4–6)
    // ---------------------------------------------------------------------

    /**
     * The workflow side modal: the dialog that carries a side-modal header.
     * Confirm dialogs stacked over it are dialogs without one.
     */
    dialog() {
        return this.page
            .getByRole('dialog')
            .filter({has: this.page.locator('[data-cy="sidemodal-header"]')})
            .first();
    }

    header() {
        return this.dialog().locator('[data-cy="sidemodal-header"]');
    }

    /** The submission number line above the title (the spinner sits inside it). */
    submissionNumber() {
        return this.header().locator('.text-xl-medium').first();
    }

    /** The contributors' short names, underlined, in the panel's h1. */
    contributorsLine() {
        return this.header().getByRole('heading', {level: 1}).locator('span.underline');
    }

    /** The full title of the version being shown (the dialog description). */
    titleLine() {
        return this.header().locator('p').first();
    }

    /** The coloured stage bubble's text ("Submission", "Review (Round 1)", …). */
    stageBubble() {
        return this.header().locator('span[class*="bg-stage-"] + span');
    }

    async expectStage(label) {
        await expect(this.stageBubble()).toHaveText(label, {timeout: 30_000});
    }

    /** A header button by its exact label ("View", "Preview", "Library", …). */
    headerButton(label) {
        return this.header().getByRole('button', {name: label, exact: true});
    }

    /** Every header button's label, left to right. */
    async headerButtonLabels() {
        const labels = await this.header().getByRole('button').allInnerTexts();
        return labels.map((s) => s.trim()).filter(Boolean);
    }

    // ---------------------------------------------------------------------
    // The side menu (Rules 7–10)
    // ---------------------------------------------------------------------

    menu() {
        return this.dialog().getByRole('navigation');
    }

    /** Any menu entry — group, stage, round, version node or page — by label. */
    menuLink(label) {
        return this.menu().getByRole('link', {name: label, exact: true});
    }

    workflowGroup() {
        return this.menuLink(this.labels.workflowGroup);
    }

    publicationGroup() {
        return this.menuLink(this.labels.publicationGroup);
    }

    /** A stage entry ("Submission", "Copyediting", …; the review stage via `reviewStageLink`). */
    stageLink(label) {
        return this.menuLink(label);
    }

    reviewStageLink() {
        return this.menuLink(this.labels.reviewStage);
    }

    /** A review-round sub-entry ("Review Round N"). */
    roundLink(round) {
        return this.menuLink(`Review Round ${round}`);
    }

    /** The version nodes under the publication group (newest last). */
    versionNodes() {
        return this.menu().getByRole('link', {name: VERSION_NODE_PATTERN});
    }

    /** The newest version node. */
    latestVersionNode() {
        return this.versionNodes().last();
    }

    /** A publication page entry ("Title & Abstract", "Contributors", …). */
    pageLink(label) {
        return this.menuLink(label);
    }

    createNewVersionLink() {
        return this.menuLink('Create New Version');
    }

    /**
     * The menu's entries in DOM order as `{label, level, striped, selected}`,
     * the level read from the PanelMenu indentation classes (1 = group,
     * 2 = stage / version node, 3 = round / page).
     */
    async menuEntries() {
        return this.menu().getByRole('link').evaluateAll((anchors) =>
            anchors.map((a) => {
                const cls = a.className;
                let level = 1;
                if (/!px-(7|9)\b/.test(cls)) level = 2;
                if (/!px-(10|12)\b/.test(cls)) level = 3;
                if (/!px-(14|16)\b/.test(cls)) level = 4;
                return {
                    label: (a.textContent || '').trim(),
                    level,
                    striped: /!border-s-8/.test(cls),
                    selected: /bg-selection-dark/.test(cls),
                };
            })
        );
    }

    /** The stage entries listed under the "Workflow" group, in order. */
    async stageLabels() {
        const entries = await this.menuEntries();
        const start = entries.findIndex((e) => e.level === 1 && e.label === this.labels.workflowGroup);
        if (start < 0) return [];
        const out = [];
        for (const e of entries.slice(start + 1)) {
            if (e.level === 1) break;
            if (e.level === 2) out.push(e.label);
        }
        return out;
    }

    /** The pages listed under the newest version node, in order (unfolds it first). */
    async pagesUnderLatestVersion() {
        await this.expandLatestVersionNode();
        const entries = await this.menuEntries();
        const nodes = entries
            .map((e, i) => ({...e, i}))
            .filter((e) => e.level === 2 && VERSION_NODE_PATTERN.test(e.label));
        if (!nodes.length) return [];
        const start = nodes[nodes.length - 1].i;
        const out = [];
        for (const e of entries.slice(start + 1)) {
            if (e.level <= 2) break;
            out.push(e.label);
        }
        return out;
    }

    /** Unfold the newest version node when its pages are hidden. */
    async expandLatestVersionNode() {
        const node = this.latestVersionNode();
        await expect(node).toBeVisible({timeout: 30_000});
        if ((await this.pageLink('Title & Abstract').count()) === 0) {
            await node.click();
        }
        await expect(this.pageLink('Title & Abstract')).toBeVisible({timeout: 30_000});
    }

    /** Labels of the entries carrying the active-stage stripe. */
    async stripedLabels() {
        return (await this.menuEntries()).filter((e) => e.striped).map((e) => e.label);
    }

    async expectStriped(label) {
        await expect(this.menuLink(label)).toHaveClass(/!border-s-8/, {timeout: 30_000});
    }

    async expectNotStriped(label) {
        await expect(this.menuLink(label)).not.toHaveClass(/!border-s-8/, {timeout: 30_000});
    }

    async expectSelected(label) {
        await expect(this.menuLink(label)).toHaveClass(/bg-selection-dark/, {timeout: 30_000});
    }

    /** Select a menu entry and wait for its main-column heading. */
    async select(label, heading = null) {
        await this.menuLink(label).click();
        if (heading) {
            await this.expectHeading(heading);
        }
    }

    /** Select a stage entry: heading "Workflow: {stage}". */
    async selectStage(label) {
        await this.select(label, `${this.labels.workflowHeading}: ${label}`);
    }

    /** Select a review round: heading "Workflow: {review stage} (Round N)". */
    async selectRound(round) {
        await this.select(
            `Review Round ${round}`,
            `${this.labels.workflowHeading}: ${this.labels.reviewStage} (Round ${round})`
        );
    }

    /** Select a publication page: heading "Publication: {page}". */
    async selectPage(label) {
        await this.expandLatestVersionNode();
        await this.select(label, `${this.labels.publicationHeading}: ${label}`);
    }

    // ---------------------------------------------------------------------
    // The main column (Rules 13–17)
    // ---------------------------------------------------------------------

    /** The main-column heading ("Workflow: Submission", "Publication: Contributors"). */
    heading() {
        return this.dialog().locator('.pkp-modal-scroll-container h2').first();
    }

    /** `toHaveText` normalises whitespace, so the DOM's double space after the colon matches. */
    async expectHeading(text) {
        await expect(this.heading()).toHaveText(text, {timeout: 30_000});
    }

    async expectStageHeading(stage) {
        await this.expectHeading(`${this.labels.workflowHeading}: ${stage}`);
    }

    async expectPageHeading(pageLabel) {
        await this.expectHeading(`${this.labels.publicationHeading}: ${pageLabel}`);
    }

    primaryColumn() {
        return this.dialog().locator('[data-cy="workflow-primary-items"]');
    }

    /** The stage's action-button region (absent when the stage offers none). */
    actionItems() {
        return this.dialog().locator('[data-cy="workflow-action-items"]');
    }

    /** The right-hand column (the "Participants" list lives here). */
    secondaryColumn() {
        return this.dialog().locator('[data-cy="workflow-secondary-items"]');
    }

    controlsLeft() {
        return this.dialog().locator('[data-cy="workflow-controls-left"]');
    }

    controlsRight() {
        return this.dialog().locator('[data-cy="workflow-controls-right"]');
    }

    /**
     * The "Current Submission Language: {language}" line on a stage or page —
     * the wrapper of its label span and its value span (and, where offered,
     * the "Change" link), so `toHaveText` reads the whole line.
     */
    languageLine() {
        return this.dialog()
            .locator('div')
            .filter({has: this.page.getByText('Current Submission Language:', {exact: true})})
            .last();
    }

    /** The language line's "Change" link (offered to the roles U40 names). */
    changeLanguageLink() {
        return this.languageLine().getByRole('button', {name: 'Change', exact: true});
    }

    /** The status box by its heading ("Status" or "Round N Status"). */
    statusBox(heading = 'Status') {
        return this.primaryColumn()
            .locator('div.border')
            .filter({has: this.page.getByRole('heading', {name: heading, exact: true})});
    }

    async expectStatus(body, heading = 'Status') {
        await expect(this.statusBox(heading)).toContainText(body, {timeout: 30_000});
    }

    /** Any status box at all (a bordered box with an h3 heading). */
    anyStatusBox() {
        return this.primaryColumn().locator('div.border').filter({has: this.page.locator('h3')});
    }

    /** The no-access box of Rule 13 (a bordered box with no heading). */
    noAccessBox() {
        return this.primaryColumn().locator('div.border').filter({hasText: NO_ACCESS_TEXT});
    }

    /**
     * The stage shows the no-access box and nothing else: one child in the
     * main column, no language line, no action buttons, no right-hand column.
     */
    async expectNoAccessOnly() {
        await expect(this.noAccessBox()).toBeVisible({timeout: 30_000});
        await expect(this.noAccessBox()).toHaveText(NO_ACCESS_TEXT);
        await expect(this.primaryColumn().locator(':scope > *')).toHaveCount(1);
        await expect(this.languageLine()).toHaveCount(0);
        await expect(this.actionItems()).toHaveCount(0);
        await expect(this.secondaryColumn()).toHaveCount(0);
    }

    /** The stage's own panels (every table in the main column). */
    panelTables() {
        return this.primaryColumn().getByRole('table');
    }

    /** A stage panel by its table's accessible name ("Submission Files", "Reviewers", …). */
    panel(title) {
        return this.primaryColumn().getByRole('table', {name: title, exact: true});
    }

    /** The right-hand "Participants" heading. */
    participantsHeading() {
        return this.secondaryColumn().getByRole('heading', {name: /^participants$/i});
    }

    /** The Participants list's "Assign" button. */
    participantsAssignButton() {
        return this.secondaryColumn().getByRole('button', {name: 'Assign', exact: true});
    }

    /** A stage action button by its exact label ("Schedule For Publication", "Delete", …). */
    actionButton(label) {
        return this.actionItems().getByRole('button', {name: label, exact: true});
    }

    // ---------------------------------------------------------------------
    // The frame's confirm dialogs (Rules 18–19)
    // ---------------------------------------------------------------------

    /** A confirm dialog by its title, verified against its verbatim body. */
    confirmDialog(kind) {
        const {title, message} = DIALOGS[kind];
        return this.page.getByRole('dialog', {name: title, exact: true}).filter({hasText: message});
    }

    /**
     * Press a header button that opens one of the frame's dialogs and answer
     * it. Resolves once the dialog has closed.
     */
    async _answerHeaderDialog(buttonLabel, kind, confirm) {
        await this.headerButton(buttonLabel).click();
        const dialog = this.confirmDialog(kind);
        await expect(dialog).toBeVisible({timeout: 30_000});
        await dialog
            .getByRole('button', {name: confirm ? 'Confirm' : 'Cancel', exact: true})
            .click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }

    /** "Return to Workflow" (Rule 18a): open the dialog and confirm or cancel it. */
    async returnToWorkflow({confirm = true} = {}) {
        await this._answerHeaderDialog('Return to Workflow', 'returnToWorkflow', confirm);
    }

    /** "Return to Done" (Rule 18b). */
    async returnToDone({confirm = true} = {}) {
        await this._answerHeaderDialog('Return to Done', 'returnToDone', confirm);
    }

    /** The stage's "Delete" button and its dialog (Rule 19). */
    async deleteSubmission({confirm = true} = {}) {
        await this.actionButton('Delete').click();
        const dialog = this.confirmDialog('delete');
        await expect(dialog).toBeVisible({timeout: 30_000});
        await dialog
            .getByRole('button', {name: confirm ? 'Confirm' : 'Cancel', exact: true})
            .click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
        if (confirm) {
            await this.expectClosed();
        }
    }
};

exports.NO_ACCESS_TEXT = NO_ACCESS_TEXT;
exports.WORKFLOW_DIALOGS = DIALOGS;
exports.VERSION_NODE_PATTERN = VERSION_NODE_PATTERN;
