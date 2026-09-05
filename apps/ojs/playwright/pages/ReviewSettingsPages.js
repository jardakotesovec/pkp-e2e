/**
 * @file playwright/pages/ReviewSettingsPages.js
 *
 * OJS-local Page Objects for Settings › Workflow › "Review": the shared
 * page (shared/playwright/pages/ReviewSettingsPages.js) plus the journal-only
 * "Reviewer Recommendations" side tab and its "Add Recommendation" / "Edit
 * Recommendation" window (spec: docs/specs/U29-review-setup-and-review-forms.md,
 * Rule 18). DOM anchors live-confirmed by the U29 probes (2026-09-05,
 * `.reports/U29/screen-notes.md`, pD and ccK6).
 */
const {expect} = require('@playwright/test');
const shared = require('../../../../shared/playwright/pages/ReviewSettingsPages.js');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

/** The "Reviewer Recommendations" tab: a Vue table, every write a POST, no notice. */
class RecommendationsTab extends BasePage {
    constructor(page) {
        super(page);
        this.panel = page.locator('[role=tabpanel]#reviewerRecommendations');
        this.manager = page.locator('[data-cy="reviewer-recommendation-manager"]');
        this.rows = this.manager.locator('tbody tr');
        this.addButton = this.manager.getByRole('button', {name: 'Add Recommendation', exact: true});
        this.window = page.getByRole('dialog').filter({has: page.locator('select[name="type"]')});
        this.titleInput = this.window.locator('input[name^="title"]').first();
        this.typeSelect = this.window.locator('select[name="type"]');
        this.statusSelect = this.window.locator('select[name="status"]');
        this.saveButton = this.window.getByRole('button', {name: 'Save', exact: true});
    }

    /** A row by its title (a substring match: the row's name carries "More Actions"). */
    row(title) {
        return this.rows.filter({hasText: title});
    }

    /** The row's "Activate" box. */
    activateBox(row) {
        return row.locator('input[name="recommendation_status[]"]');
    }

    /** The row's "More Actions" button (absent once the option is in use). */
    moreActions(row) {
        return row.locator('button[aria-label="More Actions"]');
    }

    /** The row's title cell (a row header). */
    titleCell(row) {
        return row.getByRole('rowheader');
    }

    /** The titles in table order. */
    async titles() {
        const cells = await this.rows.getByRole('rowheader').allInnerTexts();
        return cells.map((text) => text.trim());
    }

    /** The "Activate" / "Deactivate" / "Delete" confirmation dialog. */
    confirmDialog(heading) {
        return this.page.getByRole('dialog').filter({has: this.page.getByRole('heading', {name: heading})});
    }

    /** Toggle a row's box and answer "Yes"; waits for the box to flip. */
    async toggle(row, {activate}) {
        const box = this.activateBox(row);
        const title = (await this.titleCell(row).innerText()).trim();
        await box.click();
        const dialog = this.confirmDialog(activate ? 'Activate Reviewer Recommendation' : 'Deactivate Reviewer Recommendation');
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            `Are you sure you want to ${activate ? 'activate' : 'deactivate'} the recommendation ${title}`
        );
        const posted = this.page.waitForResponse((response) => /recommendations\/\d+\/status/.test(response.url()));
        await dialog.getByRole('button', {name: 'Yes', exact: true}).click();
        await posted;
        // The row may move (register A7): re-resolve it by title.
        await expect(this.activateBox(this.row(title))).toBeChecked({checked: activate, timeout: 30_000});
    }

    /** "More Actions" › an entry (the menu portals to the document root). */
    async pressRowAction(row, name) {
        await this.moreActions(row).click();
        await this.page.getByRole('menuitem', {name, exact: true}).click();
    }

    /** "More Actions" › "Delete" › "Yes"; waits for the row to go. */
    async deleteRow(row) {
        const title = (await this.titleCell(row).innerText()).trim();
        await this.pressRowAction(row, 'Delete');
        const dialog = this.confirmDialog('Delete Recommendation');
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(`Are you sure you want to delete the recommendation ${title}`);
        await dialog.getByRole('button', {name: 'Yes', exact: true}).click();
        await expect(this.row(title)).toHaveCount(0, {timeout: 30_000});
    }

    /** "Add Recommendation" › the window. */
    async openAddWindow() {
        await this.addButton.click();
        await expect(this.titleInput).toBeVisible({timeout: 30_000});
    }

    /** Fill the window and press "Save"; waits for the window to go. */
    async saveWindow({title, type, status}) {
        if (title !== undefined) {
            await this.titleInput.fill(title);
        }
        if (type !== undefined) {
            await this.typeSelect.selectOption({label: type});
        }
        if (status !== undefined) {
            await this.statusSelect.selectOption({label: status});
        }
        await this.saveButton.click();
        await expect(this.window).toBeHidden({timeout: 30_000});
    }
}
exports.RecommendationsTab = RecommendationsTab;

exports.ReviewSettingsPage = class ReviewSettingsPage extends shared.ReviewSettingsPage {
    constructor(page, contextPath) {
        super(page, contextPath);
        this.recommendations = new RecommendationsTab(page);
    }

    /** @override the journal's fourth side tab waits on its table. */
    async openSideTab(name) {
        await super.openSideTab(name);
        if (name === 'Reviewer Recommendations') {
            await expect(this.recommendations.rows.first()).toBeVisible({timeout: 30_000});
        }
    }
};

exports.ReviewSetupForm = shared.ReviewSetupForm;
exports.ReviewerGuidanceForm = shared.ReviewerGuidanceForm;
exports.ReviewFormsGrid = shared.ReviewFormsGrid;
exports.ReviewFormWindow = shared.ReviewFormWindow;
exports.FormItemWindow = shared.FormItemWindow;
exports.ITEM_TYPE_LABELS = shared.ITEM_TYPE_LABELS;
exports.dialogWith = shared.dialogWith;
exports.confirmDialog = shared.confirmDialog;
