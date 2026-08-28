// @ts-check
/**
 * @file playwright/pages/ContributorPages.js
 *
 * OPS-local Page Object and flow helpers for the Contributors &
 * affiliations feature (spec: docs/specs/U41-contributors-and-affiliations.md).
 * App-local by design (PRINCIPLES M1) — nothing here touches the shared POMs.
 *
 * Surfaces:
 * - ContributorsScreen — the workflow's "Preprint: Contributors" screen
 *   (the Publication-area nav group is labeled "Preprint" on a preprint
 *   server — spec Rule 2): the contributors list panel
 *   (`[data-cy="contributor-manager"]`, ContributorsListPanel), its
 *   "Order" / "Save Order" / "Cancel" / "Preview" / "Add Contributor"
 *   header buttons, the per-row "Set Primary Contact" / "Primary Contact"
 *   badge / "Edit" / "Delete" actions, the ordering arrows (accessible
 *   names "Increase/Decrease position of {name}" — spec Rule 6), the
 *   Add/Edit side panel (form id `contributor`, FieldBase control ids
 *   `contributor-{name}-control[-{locale}]`), the Affiliations field
 *   (FieldAffiliations: typed-name path only — see the suite header),
 *   the "List of Contributors" preview modal and the "Delete Contributor"
 *   confirmation.
 * - Contributor Roles settings screen helpers live in the suite (they are
 *   one tab-panel open away from a plain goto).
 *
 * Registry hermeticity: the Affiliations field queries the public ROR
 * registry from the browser (api.ror.org, from 4 typed characters);
 * suites stub that query via FundingPages.stubRegistrySearch (the same
 * registry, the same Autosuggest) so the typed-text option — offered
 * independently of the suggestions payload (`allowCustom`) — is the only
 * suggestion, and no registry-error dialog (spec A11 ❓) can fire.
 *
 * Labels are the live locale strings (lib/pkp/locale/en/*.po at the
 * pinned commits); DOM shapes from lib/ui-library
 * ContributorsListPanel.vue / ContributorsPreviewModal.vue /
 * FieldAffiliations.vue / Orderer.vue, confirmed against the running OPS
 * fleet while this suite was built (2026-08-28).
 */
const {expect} = require('@playwright/test');

exports.ContributorsScreen = class ContributorsScreen {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /**
     * From an open workflow dialog (editorial or author view), open the
     * "Contributors" entry of the Publication-area group — labeled
     * "Preprint" on a preprint server (spec Rule 2) — and wait for the
     * screen. The group is expanded by default; clicking it would COLLAPSE
     * it, so it is only clicked when the entry is hidden (same guard as
     * FundingPages / PublicationPages).
     */
    async openFromWorkflow() {
        const preprintGroup = this.page.getByRole('link', {
            name: 'Preprint',
            exact: true,
        });
        await expect(preprintGroup).toBeVisible({timeout: 30_000});
        const entry = this.page.getByRole('link', {
            name: 'Contributors',
            exact: true,
        });
        if (!(await entry.isVisible())) {
            await preprintGroup.click();
        }
        await entry.click();
        await expect(
            this.page.getByRole('heading', {name: 'Preprint: Contributors'})
        ).toBeVisible({timeout: 30_000});
        await expect(this.panel()).toBeVisible();
    }

    /** The contributors list panel (ContributorManager mount). */
    panel() {
        return this.page.locator('[data-cy="contributor-manager"]');
    }

    /** The list's rows, in display order. */
    rows() {
        return this.panel().locator('.listPanel__item');
    }

    /** The row carrying the given contributor name. */
    row(name) {
        return this.rows().filter({hasText: name});
    }

    /** A role badge on a row (exact text match — "Author", "Translator"). */
    roleBadge(name, role) {
        return this.row(name).getByText(role, {exact: true});
    }

    orderButton() {
        return this.panel().getByRole('button', {name: 'Order', exact: true});
    }

    saveOrderButton() {
        return this.panel().getByRole('button', {name: 'Save Order', exact: true});
    }

    cancelOrderButton() {
        return this.panel().getByRole('button', {name: 'Cancel', exact: true});
    }

    previewButton() {
        return this.panel().getByRole('button', {name: 'Preview', exact: true});
    }

    addContributorButton() {
        return this.panel().getByRole('button', {
            name: 'Add Contributor',
            exact: true,
        });
    }

    /** The "Primary Contact" badge on a row (spec Rule 10). */
    primaryContactBadge(name) {
        return this.row(name).getByText('Primary Contact', {exact: true});
    }

    /** A non-primary row's "Set Primary Contact" button. */
    setPrimaryContactButton(name) {
        return this.row(name).getByRole('button', {
            name: 'Set Primary Contact',
            exact: true,
        });
    }

    rowEditButton(name) {
        return this.row(name).getByRole('button', {name: 'Edit', exact: true});
    }

    rowDeleteButton(name) {
        return this.row(name).getByRole('button', {name: 'Delete', exact: true});
    }

    /** Ordering-mode arrows (accessible names — spec Rule 6). */
    moveUpButton(name) {
        return this.page.getByRole('button', {
            name: `Increase position of ${name}`,
            exact: true,
        });
    }

    moveDownButton(name) {
        return this.page.getByRole('button', {
            name: `Decrease position of ${name}`,
            exact: true,
        });
    }

    /**
     * Set the current contributor as primary contact, bounded by the
     * publication PUT (tunneled POST — the panel writes
     * `{primaryContactId}` to the publication itself, not a contributor
     * endpoint).
     */
    async setPrimaryContact(name) {
        const saved = this.page.waitForResponse(
            (r) =>
                /\/publications\/\d+$/.test(r.url().split('?')[0]) &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await this.setPrimaryContactButton(name).click();
        await saved;
    }

    /**
     * The Add/Edit side panel — a dialog named by its title ("Add
     * Contributor" for add, "Edit" for edit; the workflow page is itself
     * a dialog, so disambiguate by name).
     *
     * @param {string} title 'Add Contributor' | 'Edit'
     */
    formDialog(title) {
        return this.page.getByRole('dialog', {name: title, exact: true});
    }

    /** Open the Add Contributor panel. */
    async openAddPanel() {
        await this.addContributorButton().click();
        const panel = this.formDialog('Add Contributor');
        await expect(panel).toBeVisible({timeout: 30_000});
        return panel;
    }

    /** Open a row's Edit panel (prefilled — spec Rule 4). */
    async openEditPanel(name) {
        await this.rowEditButton(name).click();
        const panel = this.formDialog('Edit');
        await expect(panel).toBeVisible({timeout: 30_000});
        return panel;
    }

    /** A form field's control id (FieldBase compileId). */
    controlId(name, locale = null) {
        return locale
            ? `contributor-${name}-control-${locale}`
            : `contributor-${name}-control`;
    }

    /** A plain input or select by its control id. */
    input(name, locale = null) {
        return this.page.locator(`#${this.controlId(name, locale)}`);
    }

    /** The TinyMCE editing body of a rich-text field. */
    richTextBody(name, locale) {
        return this.page
            .frameLocator(`iframe#${this.controlId(name, locale)}_ifr`)
            .locator('body');
    }

    /** Replace a rich-text field's content by typing into its editor body. */
    async fillRichText(name, locale, text) {
        const body = this.richTextBody(name, locale);
        await body.click();
        await body.press('ControlOrMeta+a');
        await body.press('Delete');
        if (text) {
            await body.fill(text);
            await expect(body).toContainText(text);
        }
    }

    /** A contributor-role checkbox in the open panel (by role name). */
    roleCheckbox(panel, roleName) {
        return panel.getByRole('checkbox', {name: roleName, exact: true});
    }

    /** The "Publication Lists" tick (spec Rule 8). */
    includeInBrowseCheckbox(panel) {
        return panel.getByRole('checkbox', {
            name: 'Include this contributor when identifying authors in lists of publications.',
            exact: true,
        });
    }

    /**
     * Save the open panel, bounded by the contributors API answering OK
     * (add POSTs; edit PUTs via the tunneled POST) and the panel closing.
     *
     * @param {import('@playwright/test').Locator} panel from formDialog()
     */
    async saveForm(panel) {
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/contributors') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(panel).toHaveCount(0, {timeout: 30_000});
    }

    /**
     * Add a person contributor through the panel: Given Name, Email,
     * Country and one role (scenario 1's minimal person).
     *
     * @param {{given: string, family?: string, email: string, country?: string, role?: string}} fields
     */
    async addPersonContributor({
        given,
        family,
        email,
        country = 'Canada',
        role = 'Author',
    }) {
        const panel = await this.openAddPanel();
        await expect(
            panel.getByRole('radio', {name: 'Person', exact: true})
        ).toBeChecked();
        await this.input('givenName', 'en').fill(given);
        if (family) {
            await this.input('familyName', 'en').fill(family);
        }
        await this.input('email').fill(email);
        await this.input('country').selectOption({label: country});
        await this.roleCheckbox(panel, role).check();
        await this.saveForm(panel);
    }

    // ------------------------------------------------------------------
    // Affiliations (FieldAffiliations — typed-name path)

    /** The Affiliations field in the open panel. */
    affiliationsField(panel) {
        return panel.locator('.pkpFormField--affiliations');
    }

    /** An affiliation row in the field's table (by institution name). */
    affiliationRow(panel, name) {
        return this.affiliationsField(panel)
            .locator('tbody tr')
            .filter({hasText: name});
    }

    /**
     * Add a hand-typed institution: type the name (4+ characters fires
     * the — stubbed — registry query), pick the typed text itself from
     * the suggestions (offered as a bare label), then press "Add", which
     * only exists once a suggestion is picked (spec Fields & validation).
     */
    async addTypedAffiliation(panel, name) {
        const field = this.affiliationsField(panel);
        const search = field.locator('input.pkpAutosuggest__input');
        await search.click();
        await search.pressSequentially(name, {delay: 15});
        await field
            .locator('li.autosuggest__results-item')
            .filter({hasText: name})
            .first()
            .click();
        const addButton = field.getByRole('button', {name: 'Add', exact: true});
        await expect(addButton).toBeEnabled({timeout: 10_000});
        await addButton.click();
        await expect(this.affiliationRow(panel, name)).toBeVisible({
            timeout: 10_000,
        });
    }

    /**
     * Open an affiliation row's "…" action ("Edit institution name" /
     * "Remove institution"). The menu portals to the document root.
     */
    async openAffiliationRowAction(panel, name, action) {
        await this.affiliationRow(panel, name)
            .getByRole('button', {name: 'Click to edit or delete'})
            .click();
        await this.page.getByRole('menuitem', {name: action, exact: true}).click();
    }

    /**
     * The affiliation-delete confirmation ("Are you sure?" — spec Fields
     * & validation). Scoped by its message so the workflow dialog never
     * matches.
     */
    affiliationDeleteDialog() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'will be deleted'});
    }

    // ------------------------------------------------------------------
    // Preview modal (spec Rule 7)

    /** Open the "List of Contributors" preview modal. */
    async openPreview() {
        await this.previewButton().click();
        const modal = this.previewModal();
        await expect(modal).toBeVisible({timeout: 30_000});
        return modal;
    }

    previewModal() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'List of Contributors'});
    }

    /** A preview table row by its Format label (exact cell text). */
    previewRow(label) {
        return this.previewModal()
            .locator('tr')
            .filter({has: this.page.getByText(label, {exact: true})});
    }

    async closePreview() {
        await this.previewModal()
            .getByRole('button', {name: 'Close', exact: true})
            .first()
            .click();
        await expect(this.previewModal()).toHaveCount(0, {timeout: 30_000});
    }

    // ------------------------------------------------------------------
    // Delete (spec Rule 5)

    /**
     * The "Delete Contributor" confirmation. Scoped by its message text
     * (the confirm dialog portals to the document root, outside the
     * workflow dialog).
     */
    deleteContributorDialog() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'as a contributor?'});
    }

    /**
     * Confirm a delete, bounded by the contributor DELETE (tunneled POST)
     * answering OK and the row leaving the list.
     */
    async confirmDelete(name) {
        const dialog = this.deleteContributorDialog();
        const deleted = this.page.waitForResponse(
            (r) =>
                r.url().includes('/contributors/') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await dialog
            .getByRole('button', {name: 'Delete Contributor', exact: true})
            .click();
        await deleted;
        await expect(this.row(name)).toHaveCount(0, {timeout: 30_000});
    }
};
