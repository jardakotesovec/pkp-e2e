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
 *   panel (typed-name path, the registry pick of a held record, grants
 *   sub-table), the delete confirmation, and locale-neutral reads of the
 *   same pieces for the French list (Rule 14).
 * - stubRegistrySearch — routes the browser-side ROR registry query
 *   (api.ror.org, fired straight from the Funder field) to an empty result
 *   set, or to the given registry records whose names match the query, so
 *   no test depends on the public registry being reachable. The typed-text
 *   option the tests pick renders independently of the suggestions
 *   payload (Autosuggest `allowCustom`), so the manual-name path under
 *   test is unchanged by the stub.
 * - landingFunders — the article landing page's "Funders" block and its
 *   funder entries in display order (Rule 9).
 *
 * Labels are the live locale strings (lib/pkp/locale/en/*.po); DOM shapes
 * from lib/ui-library src/managers/FunderManager/* and
 * src/components/Form/fields/FieldFunder*.vue, confirmed against the
 * running app while this suite was built (2026-08-28) and revised
 * (2026-09-16: the panel's refusals, the Funder field's two states, the
 * grant rows, the row menu, the wizard's sections and its require warning;
 * 2026-11-12: the held registry record's pick, the ROR mark, the French
 * list).
 */
const {expect} = require('@playwright/test');
const {closeMenu} = require('../../../../shared/playwright/support/menus.js');

/**
 * Answer the Funder field's browser-side registry query — hermetic
 * replacement for the live api.ror.org call. With no records, every query
 * gets an empty result set (no suggestions, no error dialog). With
 * records (ROR API v2 organization objects, the shape `POST site` `rors`
 * seeds, scenarios.md), a query is answered with the records one of whose
 * names contains the typed text, as `{items: [...]}` — the registry's own
 * search shape. Call once per page before opening the panel.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<{names: Array<{value: string}>}>} [records]
 */
exports.stubRegistrySearch = async function stubRegistrySearch(page, records = []) {
    await page.route('https://api.ror.org/**', (route) => {
        const query = (new URL(route.request().url()).searchParams.get('query') || '').toLowerCase();
        const items = query
            ? records.filter((r) => r.names.some((n) => n.value.toLowerCase().includes(query)))
            : [];
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {'Access-Control-Allow-Origin': '*'},
            body: JSON.stringify({number_of_results: items.length, items}),
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
     * @param {{saveLabel?: string}} [options] the Save button's label in
     *   the interface language (Rule 14: "Enregistrer" in French)
     */
    async savePanel(panel, {saveLabel = 'Save'} = {}) {
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/funders') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await panel.getByRole('button', {name: saveLabel, exact: true}).click();
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

    // --- The panel's refusals and the Funder field's two states (revision
    // 2026-09-16; DOM from FieldFunder.vue / FieldFunderGrants.vue: the
    // Funder field is `.pkpFormField--funder`, the grants sub-table
    // `.pkpFormField--funder-grants`, a field message `.pkpFieldError`).

    /** The panel's Save button. */
    saveButton(panel) {
        return panel.getByRole('button', {name: 'Save', exact: true});
    }

    /**
     * The foot's "Please correct one error." line — a substring match, the
     * line is not its element's whole text (U41 tojs, 2026-09-16).
     */
    errorSummary(panel) {
        return panel.getByText('Please correct one error.');
    }

    /** The Funder field (`.pkpFormField--funder`). */
    funderField(panel) {
        return panel.locator('.pkpFormField--funder');
    }

    /** The Funder field's message ("Search and select a Funder or enter a Funder name"). */
    funderFieldError(panel) {
        return this.funderField(panel).locator('.pkpFieldError');
    }

    /** The "Search for a funder by name" box (the field's search state). */
    funderSearchInput(panel) {
        return this.funderField(panel).locator('input.pkpAutosuggest__input');
    }

    /** The per-language name boxes of a chosen typed-name funder. */
    funderNameBoxes(panel) {
        return this.funderField(panel).locator('input[name="name"]');
    }

    /**
     * The "Delete" button under the chosen funder (Rule 5: clears the
     * field so you can search again). Scoped to the Funder field, so the
     * grant rows' own "Delete" links never match.
     */
    deleteChosenFunderButton(panel, label = 'Delete') {
        return this.funderField(panel).getByRole('button', {name: label, exact: true});
    }

    /**
     * Type a name in the search box and pick the typed text itself from
     * the top of the suggestions; leaves the per-language name boxes as
     * they arrive (the primary one pre-filled with the typed text).
     *
     * @param {import('@playwright/test').Locator} panel
     * @param {string} name
     */
    async pickTypedFunder(panel, name) {
        const search = this.funderSearchInput(panel);
        await search.click();
        await search.pressSequentially(name, {delay: 15});
        await panel
            .locator('li.autosuggest__results-item')
            .filter({hasText: name})
            .first()
            .click();
        await expect(this.funderNameBoxes(panel).first()).toBeVisible({timeout: 10_000});
    }

    /** The "Funder Grants" sub-table's rows (one per grant, blank or filled). */
    grantRows(panel) {
        return panel.locator('.pkpFormField--funder-grants tbody tr');
    }

    /** The Grant DOI cell's message ("This is not formatted correctly."). */
    grantDoiError(panel) {
        return panel
            .locator('.pkpFormField--funder-grants')
            .locator('.pkpFieldError')
            .filter({hasText: 'This is not formatted correctly.'});
    }

    /**
     * Press Save on a panel the form refuses in place: the given field
     * message and the foot's "Please correct one error." appear, the
     * panel stays open and Save is disabled (Fields & validation).
     *
     * @param {import('@playwright/test').Locator} panel
     * @param {import('@playwright/test').Locator} fieldMessage
     */
    async saveRefused(panel, fieldMessage) {
        await this.saveButton(panel).click();
        await expect(fieldMessage.first()).toBeVisible({timeout: 30_000});
        await expect(this.errorSummary(panel)).toBeVisible({timeout: 30_000});
        await expect(panel).toBeVisible();
        await expect(this.saveButton(panel)).toBeDisabled();
    }

    /**
     * Open a row's "…" menu and return its items (headlessui portals the
     * menu to the document root; close it with `closeRowMenu`).
     */
    async openRowMenu(name) {
        await this.rowMoreActions(name).click();
        const items = this.page.getByRole('menuitem');
        await expect(items.first()).toBeVisible({timeout: 30_000});
        return items;
    }

    /** Close an open row menu without choosing (Escape on the menu itself, support/menus.js). */
    async closeRowMenu() {
        await closeMenu(this.page);
    }

    // --- The registry path on a held record (revision 2026-11-12; the
    // copy seeded with `POST site` `rors`, the browser search answered by
    // stubRegistrySearch with the same record).

    /**
     * The registry suggestion for a name: the autosuggest item carrying
     * the name and its own registry-record link (the typed-text item has
     * neither the country nor the link, Fields; A6).
     *
     * @param {import('@playwright/test').Locator} panel
     * @param {string} name
     */
    registrySuggestion(panel, name) {
        return panel
            .locator('li.autosuggest__results-item')
            .filter({hasText: name})
            .filter({has: this.page.locator('a[target="_blank"]')});
    }

    /**
     * Type a registry funder's name in the search box and return its
     * registry suggestion once it shows.
     *
     * @param {import('@playwright/test').Locator} panel
     * @param {string} name
     */
    async searchRegistry(panel, name) {
        const search = this.funderSearchInput(panel);
        await search.click();
        await search.pressSequentially(name, {delay: 10});
        const suggestion = this.registrySuggestion(panel, name).first();
        await expect(suggestion).toBeVisible({timeout: 30_000});
        return suggestion;
    }

    /**
     * Pick a registry suggestion, bounded by the app's own `POST …/rors`
     * answer (the copy lookup the pick makes, fn d). Returns that response.
     *
     * @param {import('@playwright/test').Locator} suggestion from searchRegistry()
     */
    async pickRegistrySuggestion(suggestion) {
        const looked = this.page.waitForResponse(
            (r) => /\/api\/v1\/rors\/?(\?|$)/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await suggestion.click();
        return looked;
    }

    /**
     * A row's ROR mark: the registry logo, an unnamed inline svg the
     * accessibility tree reads as an image (none on a typed-name row).
     */
    rorMark(name) {
        return this.row(name).getByRole('img');
    }

    // --- Locale-neutral reads (Rule 14). In another interface language
    // the table's own name, the "Add Funder" button and the panel's title
    // are not the English strings, so these find the list's pieces by
    // structure and take the labels the scenario names as arguments.

    /** A list row by the funder's name, in any interface language. */
    anyRow(name) {
        return this.page.getByRole('row').filter({hasText: name});
    }

    /**
     * The top-controls button labelled `label` ("Order" / "Trier", or its
     * "Save Order" state).
     */
    topButton(label) {
        return this.page.getByRole('button', {name: label, exact: true});
    }

    /**
     * The other button beside the ordering button above the table ("Add
     * Funder" in English), found through the controls group both share.
     *
     * @param {string} sortLabel the ordering button's label in this language
     */
    addButtonBeside(sortLabel) {
        return this.topButton(sortLabel)
            .locator('xpath=..')
            .getByRole('button')
            .filter({hasNotText: sortLabel});
    }

    /** The add/edit panel in any language: the dialog holding the Funder field. */
    anyPanel() {
        return this.page
            .getByRole('dialog')
            .filter({has: this.page.locator('.pkpFormField--funder')});
    }

    /** A row's "…" menu button, in any language (the row's one button outside ordering mode). */
    anyRowMenuButton(name) {
        return this.anyRow(name).getByRole('button');
    }

    // --- The wizard's Details step (Rule 10, 11).

    /**
     * The current step's sections (`.panelSection`, each headed by an h2).
     * Every step's sections sit in the DOM; only the current step's are
     * shown, so the read is the visible ones.
     */
    wizardSections() {
        return this.page.locator('.panelSection:visible');
    }

    /** The Details step's "Funders" section (the one holding the funders table). */
    wizardFundersSection() {
        return this.wizardSections().filter({has: this.page.getByRole('table', {name: 'Funders', exact: true})});
    }

    /** The Review step's "Funders are required." warning (Rule 11). */
    fundersRequiredWarning() {
        return this.page.locator('.submissionWizard__fundersEmptyWarning');
    }
};

/**
 * The landing page's "Funders" block (`section#funding-data`, Rule 9) and
 * its funder entries in display order (one `li > span.funder` each).
 *
 * @param {import('@playwright/test').Page} page
 */
exports.landingFunders = function landingFunders(page) {
    const block = page.locator('#funding-data');
    return {
        block,
        heading: block.getByRole('heading', {name: 'Funders'}),
        funderNames: block.locator('span.funder'),
    };
};
