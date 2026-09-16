// @ts-check
/**
 * @file playwright/pages/FundingPages.js
 *
 * OPS-local Page Object and flow helpers for the Funding feature
 * (spec: docs/specs/U43-funding.md). Mirrors the OJS/OMP siblings
 * (apps/{ojs,omp}/playwright/pages/FundingPages.js) in OPS's context — the
 * shared FunderManager component is identical across apps (same pinned
 * ui-library commit), so the shapes match; duplication between app suites
 * is deliberate (PRINCIPLES M1).
 *
 * Surfaces:
 * - FundingScreen — the workflow's "Publication: Funding" screen (reached
 *   through the OPS workflow nav group labeled "Preprint" — spec Rule 3)
 *   and the same FunderManager as mounted on the wizard's Details step: the
 *   funders table (aria-label "Funders"), the Order / Save Order and Add
 *   Funder top buttons, the row "…" (More Actions) menus, the Add/Edit
 *   Funder side panel (typed-name path + grants sub-table) and the delete
 *   confirmation.
 * - stubRegistrySearch — routes the browser-side ROR registry query
 *   (api.ror.org, fired straight from the Funder field) to an empty result
 *   set, so no test depends on the public registry being reachable. The
 *   typed-text option the tests pick renders independently of the
 *   suggestions payload (Autosuggest `allowCustom`), so the manual-name
 *   path under test is unchanged by the stub.
 *
 * OPS note: on the wizard's Details step, saving a funder leaves the
 * section's table stale ("No funders have been added." — spec A4 🐞), so
 * `addFunder` takes `{expectRow: false}` there: the save itself is still
 * bounded by the funders API response and the panel closing; nothing is
 * asserted about the (stale) table either way.
 *
 * Added 2026-09-16 (the coverage revision): the panel's parts by name
 * (`searchInput`, `pickTypedText`, `nameBox`, `deleteFunderButton`,
 * `funderFieldError`, `grantsTable`, `grantRows`, `grantDoiError`,
 * `errorSummary`, `saveButton`, `closePanel`), the row menu opened without
 * an item picked (`openRowMenu`, `menuItem`), the ordering-mode arrows
 * (`orderArrows`), the landing page's block (`fundersBlock`,
 * `fundersBlockNames`), the wizard's Details-step sections
 * (`wizardStepSections`, `wizardFundersSection`) and Review-step warning
 * (`fundersRequiredWarning`), and the Metadata settings screen's funders
 * controls (`openMetadataSettings`, `enableFunderMetadataBox`,
 * `funderLevelRadio`, `saveMetadataSettings`).
 *
 * Labels are the live locale strings (lib/pkp/locale/en/*.po); DOM shapes
 * from lib/ui-library src/managers/FunderManager/* and
 * src/components/Form/fields/FieldFunder*.vue, confirmed against the
 * running OPS app while this suite was built (2026-08-28) and again on
 * the revision (2026-09-16, `.reports/U43/tops/`).
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
     * Publication-area group — labeled "Preprint" on a preprint server
     * (spec Rule 3) — and its "Funding" entry, then wait for the screen
     * heading. On OPS that heading reads "Preprint: Funding" (observed on
     * the running app, 2026-08-28 — the spec's fn-a says "Publication:
     * Funding" on all three apps; contradiction reported to the register).
     * The group (and its version submenu) is expanded by default —
     * clicking "Preprint" would COLLAPSE it, so the group is only clicked
     * when the entry is hidden.
     */
    async openFromWorkflow() {
        const preprintGroup = this.page.getByRole('link', {
            name: 'Preprint',
            exact: true,
        });
        await expect(preprintGroup).toBeVisible({timeout: 30_000});
        const funding = this.fundingMenuLink();
        if (!(await funding.isVisible())) {
            await preprintGroup.click();
        }
        await funding.click();
        await expect(
            this.page.getByRole('heading', {name: 'Preprint: Funding'})
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
     * multilingual servers).
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
     * grant rows). By default waits for its row to appear in the table;
     * pass `expectRow: false` on the OPS wizard, where the table does not
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

    /** The panel's "Search for a funder by name" box (the registry
     * autosuggest; the typed text is always its first suggestion). */
    searchInput(panel) {
        return panel.locator('input.pkpAutosuggest__input');
    }

    /**
     * Type a name in the panel's search box and pick the typed text itself
     * from the top of the suggestions — the typed-name path WITHOUT
     * touching the per-language name box, which arrives pre-filled with
     * the typed text (Fields: "the name box marked '* Required' arrives
     * pre-filled with it").
     *
     * @param {import('@playwright/test').Locator} panel from dialog()
     * @param {string} name
     */
    async pickTypedText(panel, name) {
        const search = this.searchInput(panel);
        await search.click();
        await search.pressSequentially(name, {delay: 15});
        await panel
            .locator('li.autosuggest__results-item')
            .filter({hasText: name})
            .first()
            .click();
        await expect(this.nameBox(panel)).toBeVisible({timeout: 10_000});
    }

    /**
     * The typed-name path's primary-language name box, labelled "Type the
     * funder name in {language}" with the "* Required" mark in its
     * accessible name (live 2026-09-16: one box on the seeded server).
     */
    nameBox(panel) {
        return panel.getByRole('textbox', {name: /^Type the funder name in .*Required/});
    }

    /** The "Delete" button under the chosen funder (Rule 5: clears the
     * field so the search can be repeated) — scoped to the Funder field so
     * a grant row's own "Delete" never matches. */
    deleteFunderButton(panel) {
        return panel
            .locator('.pkpFormField--funder')
            .getByRole('button', {name: 'Delete', exact: true});
    }

    /** The Funder field's refusal message on an empty save. */
    funderFieldError(panel) {
        return panel
            .locator('.pkpFormField--funder')
            .getByText('Search and select a Funder or enter a Funder name');
    }

    /** The panel's "Funder Grants" sub-table. */
    grantsTable(panel) {
        return panel.getByRole('table', {name: 'Funder Grants', exact: true});
    }

    /** The grant rows (an empty table carries one "No Items" row, which
     * has no textbox, so rows are counted by their Grant DOI box; the
     * `has:` locator is built from the page, never from the panel scope —
     * patterns.md). */
    grantRows(panel) {
        return this.grantsTable(panel).locator('tbody tr').filter({
            has: this.page.locator('input[name="grantDoi"]'),
        });
    }

    /** "This is not formatted correctly." on a Grant DOI cell (Fields). */
    grantDoiError(panel) {
        return this.grantsTable(panel).getByText('This is not formatted correctly.');
    }

    /** The panel's error summary block ("Please correct one error." with
     * its "Go to …" list and "Jump to next error"; read with
     * `toContainText`). */
    errorSummary(panel) {
        return panel.getByText(/Please correct (one|\d+) errors?\./);
    }

    /** The panel's Save button. */
    saveButton(panel) {
        return panel.getByRole('button', {name: 'Save', exact: true});
    }

    /**
     * Dismiss the panel without saving through its "Close" control (the
     * panel offers no "Cancel" button, live 2026-08-28 and 2026-09-16)
     * and wait for it to leave.
     */
    async closePanel(panel) {
        await panel.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(panel).toHaveCount(0, {timeout: 30_000});
    }

    /** Open a row's "…" menu without picking an item (to read what it
     * offers: Rule 4's "Edit" and "Delete"). */
    async openRowMenu(name) {
        await this.rowMoreActions(name).click();
        await expect(this.menuItem('Edit')).toBeVisible({timeout: 10_000});
    }

    /** An item of the open row menu (portalled to the document root). */
    menuItem(action) {
        return this.page.getByRole('menuitem', {name: action, exact: true});
    }

    /** A row's up/down arrows in ordering mode: icon-only buttons with no
     * accessible name (A5 🐞, never asserted), the first is "up". */
    orderArrows(name) {
        return this.row(name).locator('button');
    }

    /** The reader-side "Funders" block on the preprint's page (Rule 9). */
    fundersBlock() {
        return this.page.locator('#funding-data');
    }

    /** The block's funder names, in the order the page lists them. */
    fundersBlockNames() {
        return this.fundersBlock().locator('span.funder');
    }

    /** The wizard's CURRENT step's sections (non-current steps are
     * `hidden`; each section heads with an `h2`). */
    wizardStepSections() {
        return this.page.locator('.pkpStep:not([hidden]) .panelSection');
    }

    /** The Details step's "Funders" section (Rule 10). */
    wizardFundersSection() {
        return this.wizardStepSections().filter({
            has: this.page.getByRole('heading', {name: 'Funders', level: 2}),
        });
    }

    /** The Review step's "Funders are required." warning (Rule 11). */
    fundersRequiredWarning() {
        return this.page.locator('.submissionWizard__fundersEmptyWarning');
    }

    /**
     * Open the workflow settings' Metadata tab (the funders setting's
     * home) and wait for its "Enable funder metadata" box.
     *
     * @param {string} contextPath
     */
    async openMetadataSettings(contextPath) {
        await this.page.goto(`/index.php/${contextPath}/management/settings/workflow`);
        await this.page.locator('#metadata-button').click();
        await expect(this.enableFunderMetadataBox()).toBeVisible({timeout: 30_000});
    }

    /** The "Enable funder metadata" checkbox (Settings). */
    enableFunderMetadataBox() {
        return this.page.getByRole('checkbox', {name: 'Enable funder metadata'});
    }

    /**
     * One of the three submission-time radios (Rule 2's levels), by its
     * on-screen text: "Do not request funder metadata from the author
     * during submission.", "Ask the author for funder metadata during
     * submission." or "Require the author to add funder metadata before
     * accepting their submission.".
     */
    funderLevelRadio(label) {
        return this.page.getByRole('radio', {name: label});
    }

    /**
     * Save the Metadata settings form (the one carrying the funders
     * setting), bounded by the contexts API answering OK.
     */
    async saveMetadataSettings() {
        const form = this.page
            .locator('form')
            .filter({has: this.enableFunderMetadataBox()});
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/api/v1/contexts/') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
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
