/**
 * @file lib/pkp/playwright/pages/EditorialDashboardPage.js
 *
 * The editorial submissions dashboard (dashboard/editorial) — the same
 * ui-library DashboardPage that serves the author's list, so the list
 * mechanics (heading, sidebar views, in-page search, rows, workflow panel,
 * bulk delete) are inherited from MySubmissionsPage. This subclass rebinds
 * the sidebar to the "Editor Dashboard" group (view links are disambiguated
 * by their dashboard/editorial href — an account holding Author too has a
 * second group with colliding view names) and adds the editorial-only
 * surfaces. App differences are WHICH views/filters exist (spec U23 Rule 2 /
 * Fields table) and each app's vocabulary; per-app suites pass their own
 * names — the mechanics below are one ui-library everywhere. The only
 * genuine app divergence is OPS's workflow panel (no "Workflow:" heading),
 * carried by apps/ops/playwright/pages/EditorialDashboardPage.js.
 * Feature spec: docs/specs/U23-submissions-dashboard.md.
 *
 * Editorial-only surfaces covered:
 * - the sidebar's global "Search submissions" box and the "Search Results"
 *   view it opens (U23 Rule 7);
 * - the search/filter chips row above the table and its clear controls;
 * - the "Filters" button and the Filters side panel (U23 Rule 8);
 * - the sortable ID / Days column headers and the pager (U23 Rules 4–5);
 * - activity-cell action buttons ("Assign Editor", "Assign Reviewers") and
 *   the per-reviewer activity indicators with their popovers (U23 Rules
 *   9–10).
 */
const {expect} = require('@playwright/test');
const {MySubmissionsPage} = require('./MySubmissionsPage.js');

exports.EditorialDashboardPage = class EditorialDashboardPage extends MySubmissionsPage {
    async goto(query = '') {
        await this.page.goto(
            this.contextUrl(this.contextPath, `/dashboard/editorial${query}`)
        );
        await expect(this.heading()).toBeVisible({timeout: 30_000});
    }

    /** Open the dashboard directly on a view by its address (Rule 4). */
    async gotoView(viewId) {
        await this.goto(`?currentViewId=${viewId}`);
    }

    /** The content area (everything that is not the backend sidebar). */
    contentArea() {
        return this.page.locator('#app-main');
    }

    /** The "Editor Dashboard" sidebar menu group entry. */
    menuGroupLink() {
        return this.sideNav()
            .locator('a')
            .filter({has: this.page.getByText('Editor Dashboard', {exact: true})});
    }

    /**
     * A view entry in the editorial sidebar group. Scoped by the entry's
     * dashboard/editorial href so an Author-holding account's identically
     * named "My Submissions as Author" entries never match.
     */
    viewLink(name) {
        return this.sideNav()
            .locator('a[href*="dashboard/editorial"]')
            .filter({has: this.page.getByText(name, {exact: true})});
    }

    /** The sidebar's global search box (label "Search submissions"). Once a
     * phrase is typed, the clear button appears inside the same label and
     * the accessible name grows to "Search submissions Clear search phrase"
     * — match by prefix, never exactly. The sidebar scope keeps the in-page
     * box ("Search submissions, ID, …" under #app-main) out. */
    globalSearchBox() {
        return this.sideNav().getByRole('searchbox', {name: /^Search submissions/});
    }

    /** Submit a phrase through the sidebar's global search (Enter commit);
     * lands on the "Search Results" view. */
    async globalSearch(phrase) {
        const box = this.globalSearchBox();
        await expect(box).toBeVisible({timeout: 30_000});
        await box.click();
        // Clear any previous phrase without submitting (Enter is the commit).
        await box.fill('');
        await box.pressSequentially(phrase, {delay: 25});
        await box.press('Enter');
        await this.expectViewHeading('Search Results');
    }

    /** The "Search: {phrase}" chip above the table. Pass the phrase to pin
     * the chip's content, omit it to match any active-search chip. */
    searchChip(phrase = '') {
        let chip = this.page
            .locator('div.bg-selection-light')
            .filter({hasText: 'Search:'});
        if (phrase) {
            chip = chip.filter({hasText: phrase});
        }
        return chip;
    }

    /** The search chip's X (scoped to the chip — the sidebar box carries an
     * identically named clear control). */
    searchChipClearButton() {
        return this.searchChip().getByRole('button', {name: 'Clear search phrase'});
    }

    /** Clear the search via the chip's X. */
    async clearSearchChip() {
        await this.searchChipClearButton().click();
    }

    /** A filter chip above the table, matched by its "{field}: {value}" text. */
    filterChip(text) {
        return this.page.locator('div.bg-selection-light').filter({hasText: text});
    }

    /**
     * A filter chip's remove button — its accessible name is
     * "Clear filter: {field}: {value}", so the name doubles as the chip
     * presence assertion.
     */
    filterChipButton(text) {
        return this.page.getByRole('button', {
            name: new RegExp(`^Clear filter: ${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
        });
    }

    /** The chips row's "Clear Filters" button (only exists while filters are
     * active AND the Filters panel is closed — with the panel open the
     * panel's own button matches too). */
    clearFiltersButton() {
        return this.page.getByRole('button', {name: 'Clear Filters', exact: true});
    }

    /** The "Filters" button above the list. */
    filtersButton() {
        return this.page.getByRole('button', {name: 'Filters', exact: true});
    }

    /** The Filters side panel (title "Filters", Apply/Clear buttons). */
    filtersModal() {
        return this.page
            .locator('[data-cy="active-modal"]')
            .filter({has: this.page.getByRole('button', {name: 'Apply Filters', exact: true})});
    }

    /** Open the Filters panel and wait for its form. The side-modal wrapper
     * reports visibility: hidden (patterns.md locator pitfall 5) — anchor
     * the wait on the panel's own Apply button, never the wrapper. */
    async openFilters() {
        await this.filtersButton().click();
        const modal = this.filtersModal();
        await expect(
            modal.getByRole('button', {name: 'Apply Filters', exact: true})
        ).toBeVisible({timeout: 30_000});
        return modal;
    }

    /**
     * Set the "Days since last activity" slider (PrimeVue slider — keyboard
     * driven; starts at 0, step 1).
     */
    async setDaysSinceLastActivity(days) {
        // Keyboard-driven (a track click would jump to the pointer position).
        const slider = this.filtersModal().getByRole('slider');
        await slider.focus();
        for (let i = 0; i < days; i++) {
            await slider.press('ArrowRight');
        }
        await expect(slider).toHaveAttribute('aria-valuenow', String(days));
    }

    /** Apply the open Filters panel and wait for it to close. */
    async applyFilters() {
        await this.filtersModal()
            .getByRole('button', {name: 'Apply Filters', exact: true})
            .click();
        await expect(this.filtersModal()).toHaveCount(0, {timeout: 30_000});
    }

    /** A sortable column header's sort button ('ID' or 'Days') — the button
     * inside the columnheader carries the label plus a screen-reader "Sort"
     * text (TableColumn.vue). */
    sortButton(columnName) {
        return this.page
            .getByRole('columnheader', {name: columnName})
            .getByRole('button');
    }

    /** All data rows of the submissions table (header row excluded). */
    dataRows() {
        return this.page.locator('table tbody tr');
    }

    /** The topmost submission row of the table (order assertions). */
    firstDataRow() {
        return this.dataRows().first();
    }

    /** The pager under the table (nav "View additional pages"). */
    pager() {
        return this.page.getByRole('navigation', {name: 'View additional pages'});
    }

    /** A row's "Assign Editor" activity-cell button (U23 Rule 9d). */
    assignEditorButton(row) {
        return row.getByRole('button', {name: 'Assign Editor', exact: true});
    }

    /** A row's "Assign Reviewers" activity-cell button (U23 Rule 9e). */
    assignReviewersButton(row) {
        return row.getByRole('button', {name: 'Assign Reviewers', exact: true});
    }

    /**
     * A row's per-reviewer activity indicators (U23 Rule 10). The indicator
     * button's accessible name carries the status headline ("Awaiting
     * Response from the reviewer", "Review completed on {date}", …).
     */
    activityIndicator(row, statusPattern) {
        return row.getByRole('button', {name: statusPattern});
    }
};
