// @ts-check
/**
 * @file playwright/pages/ContributorPages.js
 *
 * OMP-local Page Object and flow helpers for Contributors & affiliations
 * (spec: docs/specs/U41-contributors-and-affiliations.md). The shared
 * ContributorsListPanel / ContributorManager component is identical across
 * the apps (same pinned ui-library commit), so an OJS/OPS sibling would
 * match; duplication between app suites is deliberate (PRINCIPLES M1).
 *
 * Surfaces:
 * - ContributorsScreen — the workflow's "Publication: Contributors" screen:
 *   the contributor rows (ListPanel list items with role badges and the
 *   "Primary Contact" badge), the Order / Save Order / Cancel, Preview and
 *   Add Contributor header buttons, the Add ("Add Contributor") / Edit
 *   ("Edit") side panel with the contributor form, the "List of
 *   Contributors" preview modal, the "Delete Contributor" confirmation and
 *   the form's Affiliations sub-table (typed-name path).
 * - stubRegistrySearch — re-exported from FundingPages: routes the
 *   browser-side ROR registry query (api.ror.org, fired straight from the
 *   Affiliations field from four typed characters) to an empty result set,
 *   so no test depends on the public registry. The typed-text option the
 *   tests pick renders independently of the suggestions payload
 *   (Autosuggest `allowCustom`), so the hand-typed path is unchanged.
 *
 * Note on request bounding: the panel writes ride POST with
 * X-Http-Method-Override (jQuery in the panel, useFetch elsewhere), so
 * add, edit, delete and saveOrder all match `method === 'POST'`; setting
 * the primary contact PUTs (as POST) to the publication itself, not a
 * contributor endpoint.
 *
 * Labels are the live locale strings (lib/pkp/locale/en/*.po); DOM shapes
 * from lib/ui-library src/components/ListPanel/contributors/* and
 * src/components/Form/fields/FieldAffiliations*.vue, confirmed against the
 * running OMP app while this suite was built (2026-08-28).
 */
const {expect} = require('@playwright/test');
const {stubRegistrySearch} = require('./FundingPages.js');

exports.stubRegistrySearch = stubRegistrySearch;

exports.ContributorsScreen = class ContributorsScreen {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /**
     * From an open workflow dialog (editorial or author view), open the
     * Publication group's "Contributors" entry and wait for the screen
     * heading. The Publication group is expanded by default — clicking
     * "Publication" would COLLAPSE it, so it is only clicked when the
     * entry is hidden.
     */
    async openFromWorkflow() {
        const publicationGroup = this.page.getByRole('link', {
            name: 'Publication',
            exact: true,
        });
        await expect(publicationGroup).toBeVisible({timeout: 30_000});
        const link = this.menuLink();
        if (!(await link.isVisible())) {
            await publicationGroup.click();
        }
        await link.click();
        await expect(
            this.page.getByRole('heading', {name: 'Publication: Contributors'})
        ).toBeVisible({timeout: 30_000});
    }

    /** The workflow menu's "Contributors" entry (always present). */
    menuLink() {
        return this.page.getByRole('link', {name: 'Contributors', exact: true});
    }

    /** The contributors list panel container. */
    panel() {
        return this.page.locator('.contributorsListPanel');
    }

    /** The contributor rows, in display order. */
    rows() {
        return this.panel().getByRole('listitem');
    }

    /** The row carrying the given contributor name. */
    row(name) {
        return this.rows().filter({hasText: name});
    }

    /** A role badge on a row (badges are the only exact-text 'Author' etc.). */
    roleBadge(name, role) {
        return this.row(name).getByText(role, {exact: true});
    }

    /** The "Primary Contact" badge on a row (never matches the button). */
    primaryContactBadge(name) {
        return this.row(name).getByText('Primary Contact', {exact: true});
    }

    setPrimaryContactButton(name) {
        return this.row(name).getByRole('button', {
            name: 'Set Primary Contact',
            exact: true,
        });
    }

    orderButton() {
        return this.panel().getByRole('button', {name: 'Order', exact: true});
    }

    saveOrderButton() {
        return this.panel().getByRole('button', {name: 'Save Order', exact: true});
    }

    cancelOrderingButton() {
        return this.panel().getByRole('button', {name: 'Cancel', exact: true});
    }

    previewButton() {
        return this.panel().getByRole('button', {name: 'Preview', exact: true});
    }

    addContributorButton() {
        return this.panel().getByRole('button', {name: 'Add Contributor', exact: true});
    }

    /** The Add Contributor side panel (a dialog named by its title). */
    addDialog() {
        return this.page.getByRole('dialog', {name: 'Add Contributor'});
    }

    /** The Edit side panel — its title is just "Edit". */
    editDialog() {
        return this.page.getByRole('dialog', {name: 'Edit', exact: true});
    }

    /** The "List of Contributors" preview modal. */
    previewDialog() {
        return this.page.getByRole('dialog', {name: 'List of Contributors'});
    }

    /** Open the preview modal (it re-fetches the publication first). */
    async openPreview() {
        await this.previewButton().click();
        const dialog = this.previewDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /** A preview table row by its Format cell ("Abbreviated", "Full", …). */
    previewRow(dialog, format) {
        return dialog
            .getByRole('row')
            .filter({has: this.page.getByRole('cell', {name: format, exact: true})});
    }

    async closePreview(dialog) {
        await dialog.getByRole('button', {name: 'Close'}).click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }

    async openAdd() {
        await this.addContributorButton().click();
        const dialog = this.addDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    async openRowEdit(name) {
        await this.row(name).getByRole('button', {name: 'Edit', exact: true}).click();
        const dialog = this.editDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /** The "Delete Contributor" confirmation dialog. */
    deleteDialog() {
        return this.page.getByRole('dialog', {name: 'Delete Contributor'});
    }

    async openRowDelete(name) {
        await this.row(name).getByRole('button', {name: 'Delete', exact: true}).click();
        const dialog = this.deleteDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /** A form field's container inside an open panel, by its label text. */
    field(dialog, labelRe) {
        return dialog.locator('.pkpFormField').filter({
            has: this.page.locator('label.pkpFormFieldLabel').filter({hasText: labelRe}),
        });
    }

    /** The TinyMCE body of a rich-text panel field (first = primary language). */
    richBody(dialog, labelRe) {
        return this.field(dialog, labelRe).frameLocator('iframe').first().locator('body');
    }

    /**
     * Fill the person fields (any subset). Country is picked by its visible
     * option label.
     */
    async fillPersonFields(dialog, {given, family, email, country} = {}) {
        if (given !== undefined) {
            await dialog.locator('input[name^="givenName"]').first().fill(given);
        }
        if (family !== undefined) {
            await dialog.locator('input[name^="familyName"]').first().fill(family);
        }
        if (email !== undefined) {
            await dialog.locator('input[name="email"]').fill(email);
        }
        if (country !== undefined) {
            await this.field(dialog, /^Country/)
                .locator('select')
                .selectOption({label: country});
        }
    }

    /** Tick or untick a contributor-role checkbox by its exact role name. */
    async setRole(dialog, roleName, on = true) {
        const box = dialog.getByRole('checkbox', {name: roleName, exact: true});
        if (on) {
            await box.check();
        } else {
            await box.uncheck();
        }
    }

    /**
     * Press the panel's Save, bounded by the contributors API answering OK
     * (add and edit both travel as POST), and wait for the panel to close.
     */
    async savePanel(dialog) {
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/contributors') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }

    /**
     * Add a person contributor through the panel and wait for the row.
     *
     * @param {{given: string, family?: string, email: string, country?: string, roles?: string[]}} data
     */
    async addContributor({given, family, email, country = 'Canada', roles = ['Author']}) {
        const dialog = await this.openAdd();
        await this.fillPersonFields(dialog, {given, family, email, country});
        for (const role of roles) {
            await this.setRole(dialog, role, true);
        }
        await this.savePanel(dialog);
        const fullName = family ? `${given} ${family}` : given;
        await expect(this.row(fullName)).toBeVisible({timeout: 30_000});
    }

    /**
     * Set a row's contributor as the primary contact, bounded by the
     * publication PUT (as POST) answering OK.
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

    // ---- Affiliations (inside an open Add/Edit panel) ----

    /** The Affiliations field container. */
    affiliationsField(dialog) {
        return dialog.locator('.pkpFormField--affiliations');
    }

    /** Type into the institution search box (queries fire from 4 chars). */
    async typeInstitution(dialog, name) {
        const input = this.affiliationsField(dialog).locator(
            'input.pkpAutosuggest__input'
        );
        await input.click();
        await input.pressSequentially(name, {delay: 15});
    }

    /** The suggestion list's entry carrying the given text. */
    suggestion(dialog, name) {
        return this.affiliationsField(dialog)
            .locator('li.autosuggest__results-item')
            .filter({hasText: name})
            .first();
    }

    /** The "Add" button that appears once a suggestion is picked. */
    affiliationAddButton(dialog) {
        return this.affiliationsField(dialog).getByRole('button', {
            name: 'Add',
            exact: true,
        });
    }

    /** The affiliation table row carrying the given institution name. */
    affiliationRow(dialog, name) {
        return this.affiliationsField(dialog)
            .getByRole('row')
            .filter({hasText: name});
    }

    /**
     * A typed row's per-language name boxes (visible in edit mode or on a
     * validation error; primary language first).
     */
    affiliationNameBoxes(dialog, name) {
        return this.affiliationRow(dialog, name).locator('input[name="name"]');
    }

    /**
     * Open a typed row's "…" action ("Edit institution name" / "Remove
     * institution"). The menu portals to the document root.
     */
    async openAffiliationRowAction(dialog, name, action) {
        await this.affiliationRow(dialog, name)
            .getByRole('button', {name: 'Click to edit or delete'})
            .click();
        await this.page.getByRole('menuitem', {name: action, exact: true}).click();
    }

    /**
     * Record a typed (hand-entered) institution: type, pick the typed text
     * itself from the suggestions, press "Add", and wait for its row.
     */
    async addTypedInstitution(dialog, name) {
        await this.typeInstitution(dialog, name);
        await this.suggestion(dialog, name).click();
        await this.affiliationAddButton(dialog).click();
        await expect(this.affiliationRow(dialog, name)).toBeVisible({timeout: 30_000});
    }
};
