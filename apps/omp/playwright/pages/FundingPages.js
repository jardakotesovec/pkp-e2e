// @ts-check
/**
 * @file playwright/pages/FundingPages.js
 *
 * OMP-local Page Object and flow helpers for the Funding feature
 * (spec: docs/specs/U43-funding.md). Mirrors the OJS sibling
 * (apps/ojs/playwright/pages/FundingPages.js) in OMP's context — the
 * shared FunderManager component is identical across apps (same pinned
 * ui-library commit), so the shapes match; duplication between app suites
 * is deliberate (PRINCIPLES M1).
 *
 * Surfaces:
 * - FundingScreen — the workflow's "Publication: Funding" screen and the
 *   same FunderManager as mounted on the wizard's Details step: the funders
 *   table (aria-label "Funders"), the Order / Save Order and Add Funder top
 *   buttons, the row "…" (More Actions) menus, the Add/Edit Funder side
 *   panel (typed-name path + grants sub-table, its refusals) and the
 *   delete confirmation.
 * - stubRegistrySearch — routes the browser-side ROR registry query
 *   (api.ror.org, fired straight from the Funder field) to an empty result
 *   set, or to given registry records the query names, so no test depends
 *   on the public registry being reachable. The
 *   typed-text option the tests pick renders independently of the
 *   suggestions payload (Autosuggest `allowCustom`), so the manual-name
 *   path under test is unchanged by the stub.
 *
 * OMP note: on the wizard's Details step, saving a funder leaves the
 * section's table stale ("No funders have been added." — spec A4 🐞), so
 * `addFunder` takes `{expectRow: false}` there: the save itself is still
 * bounded by the funders API response and the panel closing; nothing is
 * asserted about the (stale) table either way.
 *
 * Labels are the live locale strings (lib/pkp/locale/en/*.po); DOM shapes
 * from lib/ui-library src/managers/FunderManager/* and
 * src/components/Form/fields/FieldFunder*.vue, confirmed against the
 * running OMP app while this suite was built (2026-08-28) and revised
 * (2026-09-16).
 */
const {expect} = require('@playwright/test');

/**
 * Answer the Funder field's browser-side registry query (api.ror.org, its
 * `query` parameter the typed text) — hermetic replacement for the live
 * call. With no `records` every query gets an empty result set (no
 * suggestions, no error dialog). `records` are ROR API v2 organization
 * records (the shape `pkpApi.setSite({rors})` seeds the install's copy
 * with, scenarios.md "POST site" › `rors`): a query that is part of a
 * record's `ror_display` name, case aside, is answered `{items: [record]}`,
 * any other query empty. Call once per page before opening the panel.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{records?: object[]}} [options]
 */
exports.stubRegistrySearch = async function stubRegistrySearch(page, {records = []} = {}) {
    const displayName = (record) =>
        (record.names.find((n) => (n.types || []).includes('ror_display')) || {value: ''}).value;
    await page.route('https://api.ror.org/**', (route) => {
        const query = (
            new URL(route.request().url()).searchParams.get('query') || ''
        ).toLowerCase();
        const items = query
            ? records.filter((record) => displayName(record).toLowerCase().includes(query))
            : [];
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {'Access-Control-Allow-Origin': '*'},
            body: JSON.stringify({items}),
        });
    });
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
     * default — clicking "Publication" would COLLAPSE it, so the group is
     * only clicked when the entry is hidden.
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
     * In ordering mode, move a row one place up. The row's up/down buttons
     * carry no accessible name (spec A5 🐞, never asserted), so the arrow
     * is reached positionally — the first button in the row is "up".
     */
    async moveRowUp(name) {
        await this.row(name).locator('button').first().click();
    }

    /** Press "Save Order", bounded by the funders order API answering OK. */
    async saveOrder() {
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/funders/order') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await this.saveOrderButton().click();
        await saved;
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

    /** The panel's footer "Save". */
    saveButton(panel) {
        return panel.getByRole('button', {name: 'Save', exact: true});
    }

    /** The panel's refusal summary ("Please correct one error."). */
    errorSummary(panel) {
        return panel.getByText('Please correct one error.');
    }

    /** The Funder field's "nothing chosen" message. */
    funderFieldError(panel) {
        return panel.getByText('Search and select a Funder or enter a Funder name').first();
    }

    /** The Funder field's registry search box (shown while nothing is chosen). */
    searchInput(panel) {
        return panel.locator('input.pkpAutosuggest__input');
    }

    /** The per-language funder name boxes (shown once a typed name is chosen). */
    nameBoxes(panel) {
        return panel.locator('input[name="name"]');
    }

    /** The "Delete" under the chosen funder, which clears the field. */
    funderDeleteButton(panel) {
        return panel
            .locator('.pkpFormField--funder')
            .getByRole('button', {name: 'Delete', exact: true});
    }

    /**
     * Type a name into the Funder search and pick the typed text itself
     * from the top of the suggestions; the primary-language name box then
     * appears (pre-filled with the typed text).
     *
     * @param {import('@playwright/test').Locator} panel from dialog()
     * @param {string} name
     */
    async pickTypedFunder(panel, name) {
        const search = this.searchInput(panel);
        await search.click();
        await search.pressSequentially(name, {delay: 15});
        await panel
            .locator('li.autosuggest__results-item')
            .filter({hasText: name})
            .first()
            .click();
        await expect(this.nameBoxes(panel).first()).toBeVisible({timeout: 10_000});
    }

    /**
     * Fill the panel's Funder field through the typed-name path: type the
     * name, pick the typed text itself from the suggestions, then fill
     * every per-language name box with the same name (the primary-language
     * box is the required one; filling all keeps the helper stable on
     * multilingual presses).
     *
     * @param {import('@playwright/test').Locator} panel from dialog()
     * @param {string} name
     */
    async fillTypedFunderName(panel, name) {
        await this.pickTypedFunder(panel, name);
        const nameBoxes = this.nameBoxes(panel);
        const count = await nameBoxes.count();
        for (let i = 0; i < count; i++) {
            await nameBoxes.nth(i).fill(name);
        }
    }

    /** The grants sub-table's rows. */
    grantRows(panel) {
        return panel.locator('.pkpFormField--funder-grants tbody tr');
    }

    /** A grant cell's input by column ("grantDoi" | "grantNumber" | "grantName") and row index. */
    grantCell(panel, column, index = 0) {
        return panel.locator(`input[name="${column}"]`).nth(index);
    }

    /** The grants sub-table's DOI-format refusal ("This is not formatted correctly."). */
    grantDoiError(panel) {
        return panel
            .locator('.pkpFormField--funder-grants')
            .getByText('This is not formatted correctly.');
    }

    /**
     * Add one grant row in the panel's Funder Grants sub-table and fill its
     * cells (any subset; a row added with nothing given stays blank).
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
        await this.saveButton(panel).click();
        await saved;
        await expect(panel).toHaveCount(0, {timeout: 30_000});
    }

    /** Close the panel with its header "Close" without saving. */
    async closePanel(panel) {
        await panel.getByRole('button', {name: 'Close'}).click();
        await expect(panel).toHaveCount(0, {timeout: 30_000});
    }

    /**
     * Add a funder through the panel's typed-name path (optionally with
     * grant rows). By default waits for its row to appear in the table;
     * pass `expectRow: false` on the OMP wizard, where the table does not
     * refresh after the save (spec A4 🐞 — never asserted either way).
     *
     * @param {string} name
     * @param {{grants?: Array<{grantName?: string, grantNumber?: string, grantDoi?: string}>, expectRow?: boolean}} options
     */
    async addFunder(name, {grants = [], expectRow = true} = {}) {
        await this.addFunderButton().click();
        const panel = this.dialog('Add Funder');
        await expect(panel).toBeVisible({timeout: 30_000});
        await this.fillTypedFunderName(panel, name);
        for (const grant of grants) {
            await this.addGrantRow(panel, grant);
        }
        await this.savePanel(panel);
        if (expectRow) {
            await expect(this.row(name)).toBeVisible({timeout: 30_000});
        }
    }

    /**
     * A row's "…" menu button. Hidden (not removed) on read-only views, so
     * role queries — which skip hidden nodes — count it 0 there.
     */
    rowMoreActions(name) {
        return this.row(name).getByRole('button', {name: 'More Actions'});
    }

    /**
     * An open row menu's item ("Edit" / "Delete"). Headlessui menus portal
     * to the document root, so the item is looked up on the page.
     */
    rowMenuItem(action) {
        return this.page.getByRole('menuitem', {name: action, exact: true});
    }

    /** Open a row's "…" menu (the caller reads or picks its items). */
    async openRowMenu(name) {
        await this.rowMoreActions(name).click();
        await expect(this.rowMenuItem('Edit')).toBeVisible({timeout: 30_000});
    }

    /** Open a row action ("Edit" / "Delete") from the row's "…" menu. */
    async openRowAction(name, action) {
        await this.openRowMenu(name);
        await this.rowMenuItem(action).click();
    }

    /** Open a row's "Edit" and return the "Edit Funder" panel once shown. */
    async openRowEdit(name) {
        await this.openRowAction(name, 'Edit');
        const panel = this.dialog('Edit Funder');
        await expect(panel).toBeVisible({timeout: 30_000});
        return panel;
    }

    /**
     * The registry suggestion for one ROR record: the option carrying the
     * record's registry link (the typed-text option above it has none).
     *
     * @param {import('@playwright/test').Locator} panel
     * @param {string} ror the record's address (https://ror.org/…)
     */
    registrySuggestion(panel, ror) {
        return panel
            .locator('li.autosuggest__results-item')
            .filter({has: this.page.locator(`a[href="${ror}"]`)});
    }

    /**
     * Type a name into the Funder search and wait for the registry
     * suggestion of the given record; returns it unpicked, for the caller
     * to read and pick.
     */
    async searchRegistry(panel, name, ror) {
        const search = this.searchInput(panel);
        await search.click();
        await search.pressSequentially(name, {delay: 10});
        const suggestion = this.registrySuggestion(panel, ror);
        await expect(suggestion).toBeVisible({timeout: 30_000});
        return suggestion;
    }

    /**
     * The chosen funder's registry link in the panel (shown once a registry
     * suggestion is picked): the link that reads the record's address.
     */
    chosenRegistryLink(panel, ror) {
        return panel
            .locator('.pkpFormField--funder')
            .getByRole('link', {name: ror, exact: true});
    }

    /** The ROR mark beside a row's funder name (FunderManagerCellFunder's icon). */
    rowRorMark(name) {
        return this.row(name).locator('td').first().locator('.pkpIcon--inline svg');
    }

    /**
     * Locale-neutral handles for a non-English interface, where the list's
     * own labels may differ from the English ones the methods above name.
     * `topControls(orderLabel)`: the buttons of the list's top-controls row
     * ("Order" and "Add Funder" in English), found by the "Order" button's
     * label in the interface language (the innermost such row: the last
     * in document order).
     *
     * @param {string} orderLabel the "Order" button's label ('Trier' in French)
     */
    topControls(orderLabel = 'Order') {
        return this.page
            .locator('div.flex.gap-x-2')
            .filter({has: this.page.getByRole('button', {name: orderLabel, exact: true})})
            .last()
            .getByRole('button');
    }

    /**
     * The row carrying the given funder name, whatever the table's own
     * accessible name (in French it is a raw locale key, not "Funders").
     * The Funding screen holds no other table.
     */
    rowAnyLocale(name) {
        return this.page.locator('table tbody tr').filter({hasText: name});
    }

    /** A row's "…" button whatever its accessible name (the row's one button outside ordering mode). */
    rowMenuButton(name) {
        return this.rowAnyLocale(name).getByRole('button');
    }

    /**
     * The Add/Edit Funder panel whatever its title: the dialog carrying the
     * Funder field.
     */
    funderPanel() {
        return this.page
            .getByRole('dialog')
            .filter({has: this.page.locator('.pkpFormField--funder')})
            .last();
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

    /**
     * Confirm an open delete dialog with "OK", bounded by the funders API
     * answering OK (useFetch tunnels DELETE via POST).
     */
    async confirmDelete(confirm) {
        const deleted = this.page.waitForResponse(
            (r) =>
                r.url().includes('/funders/') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await confirm.getByRole('button', {name: 'OK', exact: true}).click();
        await deleted;
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
    }
};
