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
 * The browser-side ROR registry stubs: FundingPages.stubRegistrySearch
 * (an empty answer; the Affiliations field queries the same api.ror.org
 * endpoint family) and stubRegistryRecords here (an answer carrying given
 * records). requestInSession sends a program's request in the page
 * user's signed-in session (spec Rule 4a). Revised 2026-11-12: the
 * CRediT rows, the registry pick, the Escape key, the "Edit Role"
 * window's language button and boxes.
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
     * 0..n for every row. Used for determinism: the suites' ordering
     * assertions then hold by construction instead of depending on the
     * insertion order; see the suite header.
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

    /**
     * A preview row by its Format label ("Abbreviated" / "Publication
     * Lists" / "Full"); the three rows are the preview's whole table.
     */
    previewRow(dialog, format) {
        return dialog.getByRole('row').filter({hasText: format});
    }

    /** The emptied list's "No items found." line under the header buttons. */
    noItemsMessage() {
        return this.panel().getByText('No items found.', {exact: true});
    }

    /** Every "Primary Contact" badge in the list (zero on a read-only list). */
    primaryContactBadges() {
        return this.rows().locator('.pkpBadge').filter({hasText: 'Primary Contact'});
    }

    /** An open panel's Save button. */
    saveButton(dialog) {
        return dialog.getByRole('button', {name: 'Save', exact: true});
    }

    /** The "Contributor Type" radio by its label ("Person" / "Organization or group" / "Anonymous"). */
    typeRadio(dialog, label) {
        return dialog.getByRole('radio', {name: label, exact: true});
    }

    /** Choose a contributor type; the form re-renders its fields for it. */
    async chooseType(dialog, label) {
        await this.typeRadio(dialog, label).check();
    }

    /**
     * The form field (`.pkpFormField`) wrapping the given control. The
     * wrappers carry no ids except Affiliations and CRediT roles (read live
     * 2026-09-16, `.reports/U41/tojs/empty-save-ojs.json`), so a field is
     * found by the control it holds.
     *
     * @param {import('@playwright/test').Locator} dialog
     * @param {import('@playwright/test').Locator} control
     */
    fieldOf(dialog, control) {
        return dialog.locator('.pkpFormField').filter({has: control});
    }

    /** A named text box or select of the form (`givenName-en`, `email`, `url`, `country`). */
    control(dialog, name) {
        return dialog.locator(`[name="${name}"]`);
    }

    /**
     * The field wrapping a named control. The inner locator is built from
     * the page, never from the dialog: a `has` locator is resolved relative
     * to the field, and a dialog-scoped chain never matches inside it.
     */
    fieldByName(dialog, name) {
        return this.fieldOf(dialog, this.page.locator(`[name="${name}"]`));
    }

    /** The "Contributor Roles" field (the wrapper of the "Author" box). */
    rolesField(dialog) {
        return this.fieldOf(dialog, this.page.getByRole('checkbox', {name: 'Author', exact: true}));
    }

    /** A field's inline error(s) (`.pkpFieldError`). */
    fieldError(field) {
        return field.locator('.pkpFieldError');
    }

    /** The foot's "Please correct {n} errors." / "Please correct one error." line. */
    errorSummary(dialog, count) {
        const text = count === 1 ? 'Please correct one error.' : `Please correct ${count} errors.`;
        // A substring match: the foot's line is not its element's whole text
        // (an exact match found nothing, run 1 of 2026-09-16).
        return dialog.getByText(text);
    }

    /**
     * Press Save on a panel the form or the server refuses, bounded by the
     * given refusal being on screen. Client-side refusals send nothing; the
     * server's (a bad Email or Homepage URL) answer 400 and the form shows
     * the field messages — either way the panel stays open.
     *
     * @param {import('@playwright/test').Locator} dialog
     * @param {import('@playwright/test').Locator} refusal
     */
    async saveRefused(dialog, refusal) {
        await this.saveButton(dialog).click();
        await expect(refusal).toBeVisible({timeout: 30_000});
        await expect(dialog).toBeVisible();
    }

    /** The "Homepage URL" box. */
    async fillUrl(dialog, url) {
        await dialog.locator('input[name="url"]').fill(url);
    }

    /** The "Organization Name" box (Organization type only). */
    organizationNameInput(dialog) {
        return dialog.locator('input[name="organizationName-en"]');
    }

    /** The "Publication Lists" tick box. */
    publicationListsBox(dialog) {
        return dialog.getByRole('checkbox', {
            name: 'Include this contributor when identifying authors in lists of publications.',
        });
    }

    /** The "CRediT roles and the degrees of contribution" field. */
    creditRolesField(dialog) {
        return dialog.locator('#contributor-creditRoles');
    }

    /**
     * Add a CRediT role: press the field's "Add Another Role" and set the
     * new (last) row's Role and Degree selects by their option labels
     * (FieldCreditRoles.vue: one FieldSelect per column, the row's "Remove
     * Role" beside them).
     */
    async addCreditRole(dialog, roleLabel, degreeLabel) {
        const field = this.creditRolesField(dialog);
        await field.getByRole('button', {name: 'Add Another Role', exact: true}).click();
        const row = field.locator('tbody tr').last();
        const roleSelect = row.locator('select').first();
        const degreeSelect = row.locator('select').nth(1);
        await expect(roleSelect).toBeVisible({timeout: 30_000});
        // A new row arrives on the taxonomy's first role, and a role a row
        // already holds is a disabled option (FieldCreditRoles.vue's
        // roleOptions), so the wanted role is picked only when the row is
        // not on it already.
        const currentRole = (await roleSelect.locator('option:checked').textContent()) || '';
        if (currentRole.trim() !== roleLabel) {
            await roleSelect.selectOption({label: roleLabel});
        }
        await expect(roleSelect.locator('option:checked')).toHaveText(roleLabel);
        await degreeSelect.selectOption({label: degreeLabel});
        await expect(degreeSelect.locator('option:checked')).toHaveText(degreeLabel);
    }

    /**
     * The affiliation row's per-language name boxes under "Edit institution
     * name" (one per submission language, in the journal's locale order).
     */
    affiliationNameBoxes(dialog, name) {
        return this.affiliationRow(dialog, name).locator('input[name="name"]');
    }

    /**
     * One language's name box under "Edit institution name", by the box's
     * own label "Type the institution name in {language}" — the read that
     * survives an emptied name (the row then carries no institution text
     * to filter on). The English box's accessible name runs into the next
     * box's label (A10), so the label anchors the start.
     */
    affiliationNameBox(dialog, language) {
        return this.affiliationsField(dialog)
            .getByRole('textbox', {name: new RegExp(`^Type the institution name in ${language}`)})
            .first();
    }
    /**
     * Shut an open side panel with the Escape key (Rule 4: at once, with no
     * question, nothing saved), pressed in the given box of the panel
     * (by default its first box).
     *
     * @param {import('@playwright/test').Locator} dialog
     * @param {import('@playwright/test').Locator} [target]
     */
    async closePanelByEscape(dialog, target = dialog.locator('input:visible').first()) {
        await target.press('Escape');
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }

    /**
     * The CRediT table's role rows (each with a role and a degree select
     * and "Remove Role"; the empty table's "No Items" line is no row here).
     * The rows' selects all carry the same ids, so a row is taken by its
     * position (ccI07b note).
     */
    creditRows(dialog) {
        return this.creditRolesField(dialog).locator('tbody tr').filter({has: this.page.locator('select')});
    }

    /** A CRediT row's "Select a new role (required)" drop-down. */
    creditRoleSelect(row) {
        return row.locator('select').first();
    }

    /** A CRediT row's "Degree" drop-down. */
    creditDegreeSelect(row) {
        return row.locator('select').nth(1);
    }

    /**
     * Press the CRediT table's "Add Another Role" once and wait for the new
     * row. A press issued while the previous row is still being drawn can
     * be lost (ccI07b note), so the press is repeated only while the row
     * count has not grown, never past one new row.
     */
    async addAnotherCreditRow(dialog) {
        const rows = this.creditRows(dialog);
        const before = await rows.count();
        const button = this.creditRolesField(dialog).getByRole('button', {name: 'Add Another Role', exact: true});
        await expect(async () => {
            if ((await rows.count()) === before) {
                await button.click({timeout: 2_000});
            }
            await expect(rows).toHaveCount(before + 1, {timeout: 2_000});
        }).toPass({intervals: [1_000], timeout: 30_000});
        return rows.nth(before);
    }

    /** The registry suggestion for one ROR record (its link is the record's address). */
    registrySuggestion(dialog, ror) {
        return this.affiliationsField(dialog)
            .locator('li.autosuggest__results-item')
            .filter({has: this.page.locator(`a[href="${ror}"]`)});
    }

    /**
     * Type a query into the Affiliations search box and wait for the
     * registry's answer (the field debounces, then queries from the
     * browser); returns the suggestion for the given record.
     */
    async searchRegistry(dialog, query, ror) {
        const search = this.affiliationsField(dialog).locator('input.pkpAutosuggest__input');
        await search.click();
        const answered = this.page.waitForResponse((r) => r.url().startsWith('https://api.ror.org/'), {
            timeout: 30_000,
        });
        await search.pressSequentially(query, {delay: 15});
        await answered;
        const suggestion = this.registrySuggestion(dialog, ror);
        await expect(suggestion).toBeVisible({timeout: 30_000});
        return suggestion;
    }

    /** A registry-backed affiliation's row, by its link to the record. */
    registryAffiliationRow(dialog, ror) {
        return this.affiliationsField(dialog)
            .locator('tbody tr')
            .filter({has: this.page.locator(`a[href="${ror}"]`)});
    }

    /**
     * Press "Add" on a picked registry suggestion, bounded by the server's
     * answer to the record fetch the press makes (`POST …/rors`).
     */
    async addPickedRegistryEntry(dialog) {
        const fetched = this.page.waitForResponse(
            (r) => /\/api\/v1\/rors\/?(\?|$)/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.affiliationAddButton(dialog).click();
        await fetched;
    }

    /**
     * Open an affiliation row's "Click to edit or delete" menu and return
     * its items (the menu portals, so they are looked up on the page).
     */
    async openAffiliationMenu(row) {
        await row.getByRole('button', {name: 'Click to edit or delete'}).click();
        const items = this.page.getByRole('menuitem');
        await expect(items.first()).toBeVisible({timeout: 30_000});
        return items;
    }

};

/**
 * Answer the Affiliations field's browser-side registry query
 * (api.ror.org/v2/organizations, fired from the user's own browser) with
 * the given registry records when the query names one of them, and with
 * an empty result set otherwise — a hermetic stand-in for the public
 * registry (the browser is not behind the test install's dead proxy).
 * Each record is shaped as the registry's v2 answer the field maps
 * (FieldAffiliationsRorAutoSuggest.vue `mapSuggestion`): its display
 * name, its status and its first location's country.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<{ror: string, name: string, country: string}>} records
 */
exports.stubRegistryRecords = async function stubRegistryRecords(page, records) {
    await page.route('https://api.ror.org/**', (route) => {
        const query = decodeURIComponent(route.request().url()).toLowerCase();
        const items = records
            .filter((record) => query.includes(record.name.toLowerCase().split(' ')[0]))
            .map((record) => ({
                id: record.ror,
                names: [{lang: 'en', types: ['ror_display', 'label'], value: record.name}],
                status: 'active',
                locations: [{geonames_details: {country_name: record.country}}],
            }));
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {'Access-Control-Allow-Origin': '*'},
            body: JSON.stringify({items}),
        });
    });
};

/**
 * Send a request to the context's REST API in the signed-in session of
 * the page's user, the way a program would send the same edit (spec Rule
 * 4a, fn o and s12): the API address and the CSRF token are read off the
 * page (`pkp.context.apiBaseUrl`, `pkp.currentUser.csrfToken`), so the
 * page must be an idle back-office page of the context. Returns
 * Playwright's APIResponse and never throws for a status.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} method GET | PUT
 * @param {string} path below the API base, e.g. 'submissions/12/publications/13/contributors/14'
 * @param {object} [body] sent as JSON
 */
exports.requestInSession = async function requestInSession(page, method, path, body) {
    await page.waitForFunction(
        () => !!(window.pkp && window.pkp.context && window.pkp.context.apiBaseUrl && window.pkp.currentUser && window.pkp.currentUser.csrfToken),
        null,
        {timeout: 30_000}
    );
    const {base, csrfToken} = await page.evaluate(() => ({
        base: window.pkp.context.apiBaseUrl,
        csrfToken: window.pkp.currentUser.csrfToken,
    }));
    return page.request.fetch(`${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, {
        method,
        headers: {'X-Csrf-Token': csrfToken},
        ...(body === undefined ? {} : {data: body}),
        failOnStatusCode: false,
    });
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

    /** The "Edit Role" side panel (the Add panel's twin, prefilled). */
    editRoleDialog() {
        return this.page.getByRole('dialog', {name: 'Edit Role'});
    }

    /** Open a role row's "Edit" behind its "…" menu and return the panel. */
    async openEditRole(rowText) {
        await this.openRoleAction(rowText, 'Edit');
        const dialog = this.editRoleDialog();
        await expect(dialog.locator('select[name="contributorRoleIdentifier"]')).toBeVisible({
            timeout: 30_000,
        });
        return dialog;
    }

    /** The panel's "Role Identifier" drop-down. */
    identifierSelect(dialog) {
        return dialog.locator('select[name="contributorRoleIdentifier"]');
    }

    /** Close an Add/Edit Role panel without saving (its header "Close"). */
    async closeRoleDialog(dialog) {
        await dialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }

    /** The "Edit Role" window's language button ("French") at its top. */
    languageButton(dialog, language) {
        return dialog.getByRole('button', {name: language, exact: true});
    }

    /** The primary language's "Role Name" box. */
    primaryRoleNameBox(dialog) {
        return dialog.getByRole('textbox', {name: /^Role Name\b(?! in )/});
    }

    /** Another language's "Role Name in {language}" box. */
    roleNameBox(dialog, language) {
        return dialog.getByRole('textbox', {name: `Role Name in ${language}`, exact: true});
    }

    /**
     * The shown "{count}/{total} languages completed" lines under the
     * boxes (a language's box and its line stay in the DOM, hidden, until
     * its button is pressed).
     */
    completionLines(dialog, text) {
        return dialog.getByText(text, {exact: true}).filter({visible: true});
    }

    /**
     * Press an Add/Edit Role window's "Save", bounded by the contributor
     * roles API answering OK, and wait for the window to close.
     */
    async saveRoleDialog(dialog) {
        const saved = this.page.waitForResponse(
            (r) => r.url().includes('/contributorRoles') && r.request().method() !== 'GET' && r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
    }
};
