// @ts-check
/**
 * @file playwright/pages/ContributorPages.js
 *
 * OJS-local Page Objects for the Contributors & affiliations feature
 * (spec: docs/specs/U41-contributors-and-affiliations.md).
 *
 * Surfaces:
 * - ContributorsPanel — the workflow's "Publication: Contributors" list
 *   panel (`.listPanel--contributor`): rows (li.listPanel__item) with role
 *   badges, the Order / Preview / Add Contributor header buttons, ordering
 *   mode's screen-reader-named arrows, the Add/Edit side panel
 *   (ContributorForm, form id `contributor`; the edit panel's accessible
 *   name is just "Edit"), the Affiliations field's typed-entry path, the
 *   "List of Contributors" preview modal and the "Delete Contributor"
 *   confirmation.
 * - ContributorRolesScreen — Settings → Workflow → Submission →
 *   "Contributor Roles" (#submission-button / #contributorRoles-button):
 *   the roles table (accessible name "Contributor Roles"), the Add/Edit
 *   Role side panel (form id `editContributorRole`), the type-to-confirm
 *   delete dialog (its confirm button is located as "the non-Cancel
 *   pkpButton" so nothing depends on its mislabeled text — spec ⚠ A12),
 *   the modal "Error" refusals and the "Role Deleted" success dialog.
 *
 * Labels are the live locale strings (lib/pkp/locale/en/*.po); DOM shapes
 * from lib/ui-library src/components/ListPanel/contributors/*,
 * src/components/Form/fields/FieldAffiliations*.vue and
 * src/managers/ContributorRoleManager/*, confirmed against the running app
 * while this suite was built (2026-08-28).
 *
 * The browser-side ROR registry stub is FundingPages.stubRegistrySearch
 * (the Affiliations field queries the same api.ror.org endpoint family).
 */
const {expect} = require('@playwright/test');

exports.ContributorsPanel = class ContributorsPanel {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /** The contributors list panel. */
    panel() {
        return this.page.locator('.listPanel--contributor');
    }

    /** The contributor rows, in display order. */
    rows() {
        return this.panel().locator('li.listPanel__item');
    }

    /** The row carrying the given text (name). */
    row(text) {
        return this.rows().filter({hasText: text});
    }

    /** A badge on a row (role badges and the "Primary Contact" badge). */
    badge(rowText, badgeText) {
        return this.row(rowText).locator('.pkpBadge').filter({hasText: badgeText});
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

    addButton() {
        return this.panel().getByRole('button', {name: 'Add Contributor', exact: true});
    }

    /** A row's "Set Primary Contact" button (absent on the primary's row). */
    setPrimaryContactButton(rowText) {
        return this.row(rowText).getByRole('button', {
            name: 'Set Primary Contact',
            exact: true,
        });
    }

    /**
     * Press a row's "Set Primary Contact" and wait for the publication PUT
     * (the badge moves with no confirmation dialog).
     */
    async setPrimaryContact(rowText) {
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/publications/') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await this.setPrimaryContactButton(rowText).click();
        await saved;
    }

    /**
     * Pin a deterministic order with the named contributor first: enter
     * ordering mode, press the row's up arrow (a no-op when already
     * first) and Save Order — which persists explicit sequence numbers
     * 0..n for every row. Needed because a panel-added second contributor
     * TIES the auto-created author at sequence 0 (`AuthorDAO::getNextSeq`
     * treats a max seq of 0 as "no contributors"), leaving the untouched
     * order nondeterministic; see the suite header.
     */
    async makeFirst(name) {
        // Content-verified pin (campaign workaround; see the app-changes
        // note): the contributors panel can remount mid-flow on the async
        // publication refresh after a contributor save — dropping Order
        // mode, swallowing clicks, or resetting the client-side rows right
        // before "Save Order" serializes them, so the saveOrder POST can
        // persist the OLD order (response ok, content wrong). Each bounded
        // attempt (re-)enters ordering, redoes the move, saves with a
        // freshly armed response wait, and passes only when the panel —
        // re-rendered from the response — shows the pinned order. Repeated
        // saveOrder POSTs are harmless (idempotent full-order persist).
        await expect(async () => {
            if (!(await this.saveOrderButton().isVisible())) {
                await this.orderButton().click({timeout: 2_000});
            }
            await this.row(name)
                .getByRole('button', {name: `Increase position of ${name}`})
                .click({timeout: 2_000});
            await expect(this.rows().first()).toContainText(name, {
                timeout: 2_000,
            });
            const saved = this.page.waitForResponse(
                (r) =>
                    r.url().includes('/contributors/saveOrder') &&
                    r.request().method() === 'POST' &&
                    r.ok(),
                {timeout: 35_000}
            );
            saved.catch(() => {}); // consumed by the await below
            await this.saveOrderButton().click({timeout: 2_000});
            await saved;
            // The success handler re-renders the rows from the response —
            // this verifies the PERSISTED order, not the client echo.
            await expect(this.rows().first()).toContainText(name, {
                timeout: 5_000,
            });
        }).toPass({intervals: [1_000, 2_000], timeout: 120_000});
    }

    /** The Add Contributor side panel (a dialog named by its title). */
    addDialog() {
        return this.page.getByRole('dialog', {name: 'Add Contributor'});
    }

    /** The Edit side panel — its accessible name is just "Edit". */
    editDialog() {
        return this.page.getByRole('dialog', {name: 'Edit', exact: true});
    }

    /** Open the Add Contributor panel. */
    async openAdd() {
        await this.addButton().click();
        const dialog = this.addDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /** Open a row's Edit panel. */
    async openEdit(rowText) {
        await this.row(rowText)
            .getByRole('button', {name: 'Edit', exact: true})
            .click();
        const dialog = this.editDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /**
     * Fill the person fields (any subset). Multilingual inputs carry the
     * primary-locale suffix (givenName-en); email is not multilingual;
     * country is a native select picked by label.
     *
     * @param {import('@playwright/test').Locator} dialog
     * @param {{given?: string, family?: string, email?: string, country?: string}} fields
     */
    async fillPerson(dialog, {given, family, email, country} = {}) {
        if (given !== undefined) {
            await dialog.locator('input[name="givenName-en"]').fill(given);
        }
        if (family !== undefined) {
            await dialog.locator('input[name="familyName-en"]').fill(family);
        }
        if (email !== undefined) {
            await dialog.locator('input[name="email"]').fill(email);
        }
        if (country !== undefined) {
            await dialog.locator('select[name="country"]').selectOption({label: country});
        }
    }

    /** Tick a contributor-role checkbox by its role name. */
    async tickRole(dialog, roleName) {
        await dialog.getByRole('checkbox', {name: roleName, exact: true}).check();
    }

    async untickRole(dialog, roleName) {
        await dialog.getByRole('checkbox', {name: roleName, exact: true}).uncheck();
    }

    /**
     * Press the panel's Save, bounded by the contributors API answering OK
     * (add POSTs, edit PUTs via POST override), and wait for the panel to
     * close.
     *
     * @param {import('@playwright/test').Locator} dialog
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

    /** Close a side panel without saving (the back/close button). */
    async closePanel(dialog) {
        await dialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }

    /** The "Delete Contributor" confirmation dialog. */
    deleteDialog() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'Are you sure you want to remove'});
    }

    /**
     * The Affiliations field inside an open Add/Edit panel.
     *
     * @param {import('@playwright/test').Locator} dialog
     */
    affiliationsField(dialog) {
        return dialog.locator('#contributor-affiliations');
    }

    /**
     * Type an institution name into the Affiliations search box and pick
     * the typed text itself from the suggestions (the manual path; the
     * registry suggestions are stubbed empty by stubRegistrySearch).
     */
    async typeAndPickTypedInstitution(dialog, name) {
        const field = this.affiliationsField(dialog);
        const search = field.locator('input.pkpAutosuggest__input');
        await search.click();
        await search.pressSequentially(name, {delay: 15});
        await field
            .locator('li.autosuggest__results-item')
            .filter({hasText: name})
            .first()
            .click();
    }

    /** The field's "Add" button (appears enabled only after a pick). */
    affiliationAddButton(dialog) {
        return this.affiliationsField(dialog).getByRole('button', {
            name: 'Add',
            exact: true,
        });
    }

    /** An affiliation row in the field's table. */
    affiliationRow(dialog, name) {
        return this.affiliationsField(dialog).locator('tbody tr').filter({hasText: name});
    }

    /**
     * Open an affiliation row's "…" menu and press an action ("Edit
     * institution name" / "Remove institution"). The menu portals, so the
     * item is looked up on the page.
     */
    async openAffiliationAction(dialog, name, action) {
        await this.affiliationRow(dialog, name)
            .getByRole('button', {name: 'Click to edit or delete'})
            .click();
        await this.page.getByRole('menuitem', {name: action, exact: true}).click();
    }

    /** The affiliation delete confirmation ("Are you sure?" / Yes / No). */
    affiliationDeleteDialog() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'will be deleted'});
    }

    /** Open the "List of Contributors" preview modal. */
    async openPreview() {
        await this.previewButton().click();
        const dialog = this.page.getByRole('dialog', {name: 'List of Contributors'});
        await expect(
            dialog.getByText(
                'Contributors to this publication will be identified in the following formats.'
            )
        ).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /**
     * A preview row's Display cell ("Abbreviated" / "Publication Lists" /
     * "Full").
     */
    previewValue(dialog, format) {
        return dialog
            .getByRole('row')
            .filter({hasText: format})
            .locator('td')
            .nth(1);
    }
};

exports.ContributorRolesScreen = class ContributorRolesScreen {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        this.page = page;
        this.contextPath = contextPath;
    }

    /** Open Settings → Workflow → Submission → "Contributor Roles". */
    async goto() {
        await this.page.goto(
            `/index.php/${this.contextPath}/management/settings/workflow`
        );
        const roleTab = this.page.locator('#contributorRoles-button');
        if (!(await roleTab.isVisible())) {
            await this.page.locator('#submission-button').click();
        }
        await roleTab.click();
        await expect(this.table()).toBeVisible({timeout: 30_000});
    }

    /** The roles table (aria-labelledby → "Contributor Roles"). */
    table() {
        return this.page.getByRole('table', {name: 'Contributor Roles'});
    }

    /** A role's row, matched by name or identifier text. */
    roleRow(text) {
        return this.table().locator('tbody tr').filter({hasText: text});
    }

    addRoleButton() {
        return this.page.getByRole('button', {name: 'Add Role', exact: true});
    }

    /**
     * Add a role through the panel; identifier is the enum code
     * ("EDITOR"), names keyed by locale ({en: '…'}).
     *
     * @param {{identifier: string, names: Record<string, string>}} role
     */
    async addRole({identifier, names}) {
        await this.addRoleButton().click();
        const dialog = this.page.getByRole('dialog', {name: 'Add Role'});
        await expect(dialog).toBeVisible({timeout: 30_000});
        await dialog
            .locator('select[name="contributorRoleIdentifier"]')
            .selectOption(identifier);
        for (const [locale, name] of Object.entries(names)) {
            await dialog.locator(`input[name="name-${locale}"]`).fill(name);
        }
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/contributorRoles') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }

    /** Open a role row's "…" menu action ("Edit" / "Delete Role"). */
    async openRoleAction(rowText, action) {
        await this.roleRow(rowText)
            .getByRole('button', {name: 'More Actions'})
            .click();
        await this.page.getByRole('menuitem', {name: action, exact: true}).click();
    }

    /** The type-to-confirm delete dialog. */
    typeToConfirmDialog() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'Are you absolutely sure'});
    }

    /**
     * The dialog's confirm button, located as the non-Cancel pkpButton so
     * nothing depends on its mislabeled text (spec ⚠ A12).
     */
    confirmDeleteButton(dialog) {
        return dialog.locator('button.pkpButton').filter({hasNotText: 'Cancel'});
    }

    /** The modal "Error" dialog both delete refusals use. */
    errorDialog() {
        return this.page.getByRole('dialog', {name: 'Error', exact: true});
    }

    /** The "Role Deleted" success dialog. */
    roleDeletedDialog() {
        return this.page.getByRole('dialog', {name: 'Role Deleted'});
    }
};
