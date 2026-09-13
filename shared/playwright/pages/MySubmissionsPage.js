/**
 * @file lib/pkp/playwright/pages/MySubmissionsPage.js
 *
 * The author's My Submissions dashboard (dashboard/mySubmissions) — the same
 * ui-library DashboardPage in all three apps, so the mechanics live here.
 * App differences are WHICH views exist (spec U22 Rule 2) and each app's
 * vocabulary; per-app suites pass their own view names and assert their own
 * roster. Feature spec: docs/specs/U22-my-submissions.md.
 *
 * Surfaces covered:
 * - the sidebar "My Submissions as Author" menu group: view entries with
 *   live count badges (the badge count is the entry's leading text);
 * - the list heading ("Active submissions (2)");
 * - the table search box (commits on Enter; on My Submissions the search
 *   narrows the CURRENT view — no cross-status search view for authors);
 * - row affordances ("View", "Complete submission", "Submit revisions");
 * - the workflow panel a row's "View" opens over the list;
 * - the "More Actions" → "Delete Incomplete Submissions" selection mode and
 *   its confirm dialog;
 * - the ways in and the refusals (U22 Rules 1, 3 and the Actors table): the
 *   retired submission-list address, the old author-dashboard link, and
 *   the two access-denied sentences;
 * - a row's Stage and Editorial Activity cells, the review progress
 *   counter and the "Reviewers assigned:" avatars with their popover (U22
 *   Rules 4, 7);
 * - the "Filters" button and its side panel's fields (U22 Rule 5). The
 *   editorial dashboard (EditorialDashboardPage) inherits these and adds
 *   the editors' own controls.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.MySubmissionsPage = class MySubmissionsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    async goto() {
        await this.page.goto(this.url());
        await expect(this.heading()).toBeVisible({timeout: 30_000});
    }

    /** The list's own address, `{context}/dashboard/mySubmissions`. */
    url() {
        return this.contextUrl(this.contextPath, '/dashboard/mySubmissions');
    }

    /**
     * The retired submission-list address of older versions,
     * `{context}/submissions`, which forwards to the account's landing the
     * way the context's own login does (U22 Rule 3, fn-c).
     */
    retiredListUrl() {
        return this.contextUrl(this.contextPath, '/submissions');
    }

    /**
     * Open the retired address and let it forward. Asserts nothing about
     * where it lands: the caller reads `page.url()` (the author-only case
     * lands on this list; other role mixes land on their own dashboards).
     */
    async gotoRetiredListAddress() {
        await this.page.goto(this.retiredListUrl());
        await this.page.waitForURL((url) => !/\/submissions$/.test(url.pathname), {
            waitUntil: 'commit',
            timeout: 30_000,
        });
    }

    /**
     * The old bookmarked author-dashboard link for one submission,
     * `{context}/authorDashboard/submission/{id}` (U22 Rule 3, fn-c).
     */
    oldAuthorDashboardUrl(submissionId) {
        return this.contextUrl(this.contextPath, `/authorDashboard/submission/${submissionId}`);
    }

    /** Open the old author-dashboard link and let it forward (or refuse). */
    async gotoOldAuthorDashboardLink(submissionId) {
        await this.page.goto(this.oldAuthorDashboardUrl(submissionId));
    }

    /**
     * The role gate's access-denied sentence, the answer to this list's
     * address typed by an account without the Author role (Actors row 1,
     * fn-a).
     */
    accessDenied() {
        return this.page.getByText('The current role does not have access to this operation.', {exact: true});
    }

    /**
     * The workflow authorization refusal, the answer to another author's
     * old author-dashboard link (Rule 3, fn-c).
     */
    workflowAccessDenied() {
        return this.page.getByText("You don't currently have access to that stage of the workflow.", {exact: true});
    }

    /** The "Start A New Submission" sidebar entry beside the menu group (Rule 1). */
    startNewSubmissionLink() {
        return this.sideNav().getByRole('link', {name: 'Start A New Submission', exact: true});
    }

    /**
     * The landing an author-only account gets from the context's login or
     * the retired list address (Rule 3, scenarios 1 and 5): this list's
     * address, the "Active submissions" view, the "My Submissions as
     * Author" group in the sidebar. Pass a count to pin the heading's total.
     */
    async expectLanded(count = null) {
        await expect(this.page).toHaveURL(/\/dashboard\/mySubmissions/, {timeout: 30_000});
        await this.expectViewHeading('Active submissions', count);
        await expect(this.menuGroupLink()).toBeVisible({timeout: 30_000});
    }

    /** The empty view's "No Items" text (Rule 4). */
    emptyState() {
        return this.page.getByText('No Items', {exact: true});
    }

    /** The page heading: "{view name} ({count})". */
    heading() {
        return this.page.getByRole('heading', {level: 1});
    }

    /**
     * The heading names the current view with its total. Pass a number to pin
     * the count, omit it to accept any.
     */
    async expectViewHeading(name, count = null) {
        const countPattern = count === null ? '\\d+' : String(count);
        await expect(this.heading()).toHaveText(
            new RegExp(`^\\s*${escapeRegExp(name)} \\(${countPattern}\\)\\s*$`),
            {timeout: 30_000}
        );
    }

    /** The backend sidebar (SideNav). */
    sideNav() {
        return this.page.locator('#app-nav');
    }

    /** The "My Submissions as Author" menu group entry. */
    menuGroupLink() {
        return this.sideNav()
            .locator('a')
            .filter({has: this.page.getByText('My Submissions as Author', {exact: true})});
    }

    /**
     * A view entry in the sidebar group (e.g. 'Active submissions'). The
     * entry's accessible text is "{badge count}{label}".
     */
    viewLink(name) {
        return this.sideNav()
            .locator('a')
            .filter({has: this.page.getByText(name, {exact: true})});
    }

    /** The view entry's live count badge reads the given number. */
    async expectViewCount(name, count) {
        await expect(this.viewLink(name)).toHaveText(
            new RegExp(`^\\s*${count}\\s*${escapeRegExp(name)}\\s*$`),
            {timeout: 30_000}
        );
    }

    /** Open a view from the sidebar (expands the group if collapsed). */
    async openView(name) {
        const link = this.viewLink(name);
        if (!(await link.isVisible())) {
            await this.menuGroupLink().click();
        }
        await link.click();
        await this.expectViewHeading(name);
    }

    /** The "Filters" button above the list (Rule 5). */
    filtersButton() {
        return this.page.getByRole('button', {name: 'Filters', exact: true});
    }

    /** The Filters side panel (title "Filters", Apply/Clear buttons). */
    filtersModal() {
        return this.page
            .locator('[data-cy="active-modal"]')
            .filter({has: this.page.getByRole('button', {name: 'Apply Filters', exact: true})});
    }

    /**
     * Open the Filters panel and wait for its form. The side-modal wrapper
     * reports visibility: hidden (patterns.md locator pitfall 5): anchor the
     * wait on the panel's own Apply button, never the wrapper.
     */
    async openFilters() {
        await this.filtersButton().click();
        const modal = this.filtersModal();
        await expect(
            modal.getByRole('button', {name: 'Apply Filters', exact: true})
        ).toBeVisible({timeout: 30_000});
        return modal;
    }

    /** Close the open Filters panel without applying (Escape). */
    async closeFilters() {
        await this.page.keyboard.press('Escape');
        await expect(this.filtersModal()).toHaveCount(0, {timeout: 30_000});
    }

    /**
     * A field of the open Filters panel by its label ("Section",
     * "Categories", "Issues", "Days since last activity", the editors'
     * "Assigned To Editor"): the label text as the panel shows it.
     */
    filterField(label) {
        return this.filtersModal().getByText(label, {exact: true});
    }

    /** The in-page submissions-table search box (scoped by accessible name). */
    searchBox() {
        return this.page.getByRole('searchbox', {name: /Search submissions, ID/});
    }

    /** Type a phrase into the search box (replacing any earlier one) and commit it (Enter-only commit). */
    async searchFor(phrase) {
        const search = this.searchBox();
        await expect(search).toBeVisible({timeout: 30_000});
        await search.click();
        await search.fill('');
        await search.pressSequentially(phrase, {delay: 25});
        await search.press('Enter');
    }

    /** A submissions-table row containing the given text. */
    row(text) {
        return this.page.getByRole('row').filter({hasText: text});
    }

    /**
     * A row's Stage cell (Rule 4: the stage or outcome in a colored
     * bubble). The Submissions column (authors and title) is the row's
     * header (`rowheader`), so among the row's `cell`s (ID, Stage,
     * Editorial Activity, Actions) Stage is the second.
     */
    stageCell(row) {
        return row.getByRole('cell').nth(1);
    }

    /**
     * A row's Editorial Activity cell (Rule 7; empty while a new submission
     * awaits the editorial team's first move, Rule 7e). The author's list
     * has no "Days" column, so among the row's `cell`s it is the third and
     * "Actions" the fourth (the editorial list, one column wider, overrides
     * this).
     */
    activityCell(row) {
        return row.getByRole('cell').nth(2);
    }

    /**
     * A row's Actions cell (Rule 6: "View" on a submitted row; empty on a
     * draft, no button at all). Among the row's `cell`s it is the fourth.
     */
    actionsCell(row) {
        return row.getByRole('cell').nth(3);
    }

    /** The review progress counter in a row's activity cell, "Review update {completed}/{total}" (Rule 7b). */
    reviewCounter(row) {
        return row.getByText(/^\s*Review update \d+\/\d+\s*$/);
    }

    /** The "Reviewers assigned:" label of a row's open-review avatar row (Rule 7b). */
    reviewersAssignedLabel(row) {
        return row.getByText('Reviewers assigned:', {exact: true});
    }

    /**
     * The avatars of a row's "Reviewers assigned:" row, one per completed
     * open review: each is a headlessui popover button carrying the
     * reviewer's initials.
     */
    reviewerAvatars(row) {
        return row.locator('button[id^="headlessui-popover-button"]');
    }

    /** The popover an avatar (or an activity indicator) opens inside its row. */
    activityPopover(row) {
        return row.locator('[id^="headlessui-popover-panel"]');
    }

    /** Click the n-th avatar of a row and return its open popover. */
    async openReviewerPopover(row, index = 0) {
        await this.reviewerAvatars(row).nth(index).click();
        const panel = this.activityPopover(row);
        await expect(panel).toBeVisible({timeout: 30_000});
        return panel;
    }

    /**
     * Dismiss a row's open popover with a click outside it (on the page
     * heading): Escape closes it only while focus is inside, and a window
     * opened from the popover leaves focus elsewhere when it closes. No-op
     * when none is open.
     */
    async closeActivityPopover(row) {
        const panel = this.activityPopover(row);
        if (await panel.count()) {
            await this.heading().click();
        }
        await expect(panel).toHaveCount(0, {timeout: 30_000});
    }

    /** Search for a unique tag and return the matching row. */
    async findRowByTag(tag) {
        await this.searchFor(tag);
        const row = this.row(tag);
        await expect(row).toBeVisible({timeout: 30_000});
        return row;
    }

    /** A row's "View" action (absent on drafts). */
    viewButton(row) {
        return row.getByRole('button', {name: 'View', exact: true});
    }

    /** A draft row's "Complete submission" action (activity cell). */
    completeSubmissionButton(row) {
        return row.getByRole('button', {name: 'Complete submission', exact: true});
    }

    /** A row's "Submit revisions" action (activity cell, Rule 7a). */
    submitRevisionsButton(row) {
        return row.getByRole('button', {name: 'Submit revisions', exact: true});
    }

    /** The workflow panel a row's "View" opens over the list. */
    workflowDialog() {
        return this.page
            .getByRole('dialog')
            .filter({has: this.page.getByRole('heading', {name: /^Workflow:/})});
    }

    async expectWorkflowOpen() {
        await expect(
            this.page.getByRole('heading', {name: /^Workflow:/})
        ).toBeVisible({timeout: 30_000});
    }

    /** Close the open workflow panel and wait for it to be gone. */
    async closeWorkflow() {
        await this.workflowDialog()
            .getByRole('button', {name: 'Close', exact: true})
            .first()
            .click();
        await expect(this.page.getByRole('heading', {name: /^Workflow:/})).toHaveCount(0, {
            timeout: 30_000,
        });
    }

    /**
     * Tick a draft row's selection checkbox. The input is screen-reader-only
     * (`sr-only`) behind a styled span that intercepts pointer events, so the
     * ordinary actionability check never passes — force the check and let
     * Playwright verify the resulting checked state.
     */
    async checkRowCheckbox(row) {
        const box = row.getByRole('checkbox');
        await expect(box).toBeVisible({timeout: 30_000});
        await box.check({force: true});
    }

    /** The "More Actions" ellipsis button above the list. */
    moreActionsButton() {
        return this.page.getByRole('button', {name: 'More Actions', exact: true});
    }

    /** The "Delete Incomplete Submissions" entry in the More Actions menu. */
    bulkDeleteMenuItem() {
        // Headlessui menu items — scope to the page, not the control bar.
        return this.page.getByRole('menuitem', {name: 'Delete Incomplete Submissions'});
    }

    /** Enter draft-deletion selection mode via More Actions. */
    async enterBulkDeleteSelection() {
        await this.moreActionsButton().click();
        const item = this.bulkDeleteMenuItem();
        await expect(item).toBeVisible({timeout: 30_000});
        await item.click();
        await expect(this.bulkDeleteButton()).toBeVisible({timeout: 30_000});
    }

    /** The selection-mode "Delete Incomplete Submissions" button above the list. */
    bulkDeleteButton() {
        return this.page.getByRole('button', {
            name: 'Delete Incomplete Submissions',
            exact: true,
        });
    }

    /** The selection-mode "Cancel" button beside it. */
    bulkDeleteCancelButton() {
        return this.bulkDeleteButton().locator('xpath=following-sibling::button[1]');
    }

    /** The "Confirm Delete of Incomplete Submissions" dialog. */
    bulkDeleteConfirmDialog() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'Confirm Delete of Incomplete Submissions'});
    }
};
