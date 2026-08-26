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
 *   its confirm dialog.
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
        await this.page.goto(this.contextUrl(this.contextPath, '/dashboard/mySubmissions'));
        await expect(this.heading()).toBeVisible({timeout: 30_000});
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

    /** The in-page submissions-table search box (scoped by accessible name). */
    searchBox() {
        return this.page.getByRole('searchbox', {name: /Search submissions, ID/});
    }

    /** Type a phrase into the search box and commit it (Enter-only commit). */
    async searchFor(phrase) {
        const search = this.searchBox();
        await expect(search).toBeVisible({timeout: 30_000});
        await search.click();
        await search.pressSequentially(phrase, {delay: 25});
        await search.press('Enter');
    }

    /** A submissions-table row containing the given text. */
    row(text) {
        return this.page.getByRole('row').filter({hasText: text});
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
