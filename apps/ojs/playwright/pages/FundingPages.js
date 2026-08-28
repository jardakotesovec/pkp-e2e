// @ts-check
/**
 * @file playwright/pages/FundingPages.js
 *
 * OJS-local Page Object and flow helpers for the Funding feature
 * (spec: docs/specs/U43-funding.md).
 *
 * Surfaces:
 * - FundingScreen — the workflow's "Publication: Funding" screen and the
 *   same FunderManager as mounted on the wizard's Details step: the funders
 *   table (aria-label "Funders"), the Order / Save Order and Add Funder top
 *   buttons, the row "…" (More Actions) menus, the Add/Edit Funder side
 *   panel (typed-name path + grants sub-table) and the delete confirmation.
 * - stubRegistrySearch — routes the browser-side ROR registry query
 *   (api.ror.org, fired straight from the Funder field) to an empty result
 *   set, so no test depends on the public registry being reachable. The
 *   typed-text option the tests pick renders independently of the
 *   suggestions payload (Autosuggest `allowCustom`), so the manual-name
 *   path under test is unchanged by the stub.
 *
 * Labels are the live locale strings (lib/pkp/locale/en/*.po); DOM shapes
 * from lib/ui-library src/managers/FunderManager/* and
 * src/components/Form/fields/FieldFunder*.vue, confirmed against the
 * running app while this suite was built (2026-08-28).
 */
const {expect} = require('@playwright/test');

/**
 * Answer the Funder field's browser-side registry query with an empty
 * result set (no suggestions, no error dialog) — hermetic replacement for
 * the live api.ror.org call. Call once per page before opening the panel.
 *
 * @param {import('@playwright/test').Page} page
 */
exports.stubRegistrySearch = async function stubRegistrySearch(page) {
    await page.route('https://api.ror.org/**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {'Access-Control-Allow-Origin': '*'},
            body: JSON.stringify({items: []}),
        })
    );
};

exports.FundingScreen = class FundingScreen {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /**
     * From an open workflow dialog (editorial or author view), open the
     * Publication group's "Funding" entry and wait for the screen heading.
     * The Publication group (and its version submenu) is expanded by
     * default (live-probed 2026-08-28) — clicking "Publication" would
     * COLLAPSE it, so the group is only clicked when the entry is hidden.
     */
    async openFromWorkflow() {
        const publicationGroup = this.page.getByRole('link', {
            name: 'Publication',
            exact: true,
        });
        await expect(publicationGroup).toBeVisible({timeout: 30_000});
        const funding = this.fundingMenuLink();
        if (!(await funding.isVisible())) {
            await publicationGroup.click();
        }
        await funding.click();
        await expect(
            this.page.getByRole('heading', {name: 'Publication: Funding'})
        ).toBeVisible({timeout: 30_000});
    }

    /** The workflow menu's "Funding" entry (present only when enabled). */
    fundingMenuLink() {
        return this.page.getByRole('link', {name: 'Funding', exact: true});
    }

    /** The funders table (PkpTable aria-label "Funders"). */
    table() {
        return this.page.getByRole('table', {name: 'Funders', exact: true});
    }

    /** The table's data rows, in display order. */
    rows() {
        return this.table().locator('tbody tr');
    }

    /** The row carrying the given funder name. */
    row(name) {
        return this.rows().filter({hasText: name});
    }

    addFunderButton() {
        return this.page.getByRole('button', {name: 'Add Funder', exact: true});
    }

    orderButton() {
        return this.page.getByRole('button', {name: 'Order', exact: true});
    }

    saveOrderButton() {
        return this.page.getByRole('button', {name: 'Save Order', exact: true});
    }

    /**
     * The Add/Edit Funder side panel — a dialog named by its title
     * (the workflow page is itself a dialog; disambiguate by name).
     *
     * @param {string} title 'Add Funder' | 'Edit Funder'
     */
    dialog(title) {
        return this.page.getByRole('dialog', {name: title});
    }

    /**
     * A row's "…" menu button. Hidden (not removed) on read-only views, so
     * role queries — which skip hidden nodes — count it 0 there.
     */
    rowMoreActions(name) {
        return this.row(name).getByRole('button', {name: 'More Actions'});
    }

    /**
     * Open a row action ("Edit" / "Delete"). Headlessui menus portal to the
     * document root, so the menu item is looked up on the page.
     */
    async openRowAction(name, action) {
        await this.rowMoreActions(name).click();
        await this.page.getByRole('menuitem', {name: action, exact: true}).click();
    }

    /**
     * Fill the panel's Funder field through the typed-name path: type the
     * name, pick the typed text itself from the suggestions, then fill
     * every per-language name box with the same name (the primary-language
     * box is the required one; filling all keeps the helper stable on
     * multilingual journals).
     *
     * @param {import('@playwright/test').Locator} panel from dialog()
     * @param {string} name
     */
    async fillTypedFunderName(panel, name) {
        const search = panel.locator('input.pkpAutosuggest__input');
        await search.click();
        await search.pressSequentially(name, {delay: 15});
        await panel
            .locator('li.autosuggest__results-item')
            .filter({hasText: name})
            .first()
            .click();
        const nameBoxes = panel.locator('input[name="name"]');
        await expect(nameBoxes.first()).toBeVisible({timeout: 10_000});
        const count = await nameBoxes.count();
        for (let i = 0; i < count; i++) {
            await nameBoxes.nth(i).fill(name);
        }
    }

    /**
     * Add one grant row in the panel's Funder Grants sub-table and fill its
     * cells (any subset).
     *
     * @param {import('@playwright/test').Locator} panel
     * @param {{grantName?: string, grantNumber?: string, grantDoi?: string}} grant
     */
    async addGrantRow(panel, {grantName, grantNumber, grantDoi} = {}) {
        await panel.getByRole('button', {name: 'Add', exact: true}).click();
        if (grantDoi !== undefined) {
            await panel.locator('input[name="grantDoi"]').last().fill(grantDoi);
        }
        if (grantNumber !== undefined) {
            await panel.locator('input[name="grantNumber"]').last().fill(grantNumber);
        }
        if (grantName !== undefined) {
            await panel.locator('input[name="grantName"]').last().fill(grantName);
        }
    }

    /**
     * Press the panel's Save, bounded by the funders API answering OK
     * (useFetch tunnels PUT via POST, so both add and edit are POSTs), and
     * wait for the panel to close.
     *
     * @param {import('@playwright/test').Locator} panel
     */
    async savePanel(panel) {
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/funders') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(panel).toHaveCount(0, {timeout: 30_000});
    }

    /**
     * Add a funder through the panel's typed-name path (optionally with
     * grant rows) and wait for its row to appear in the table.
     *
     * @param {string} name
     * @param {{grants?: Array<{grantName?: string, grantNumber?: string, grantDoi?: string}>}} options
     */
    async addFunder(name, {grants = []} = {}) {
        await this.addFunderButton().click();
        const panel = this.dialog('Add Funder');
        await expect(panel).toBeVisible({timeout: 30_000});
        await this.fillTypedFunderName(panel, name);
        for (const grant of grants) {
            await this.addGrantRow(panel, grant);
        }
        await this.savePanel(panel);
        await expect(this.row(name)).toBeVisible({timeout: 30_000});
    }

    /** The delete confirmation dialog (Rule 6). */
    deleteConfirmDialog() {
        return this.page
            .getByRole('dialog')
            .filter({
                hasText:
                    'Are you sure you wish to delete this item? This action cannot be undone.',
            });
    }
};
