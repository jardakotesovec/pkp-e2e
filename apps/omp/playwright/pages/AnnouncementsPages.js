// @ts-check
/**
 * @file playwright/pages/AnnouncementsPages.js
 *
 * OMP-local Page Objects for the Announcements feature
 * (spec: docs/specs/U12-announcements.md). The OJS and OPS suites keep their
 * own copies (PRINCIPLES M1); the shared settings form, list panel, side
 * panel, types grid and public templates are lib/pkp's at the pinned tips,
 * so the shapes match, with the press's own strings where they differ
 * ("Additional Information" for the introduction, OMP1; the "Edit" link's
 * screen-reader span "Open a new page to edit this information").
 *
 * Surfaces:
 * - AnnouncementSettingsTab — Settings › Website › Setup › Announcements
 *   (the press's form) and, through `SiteAnnouncementsTab`, the same form
 *   on Administration › Site Settings › Announcements › "Settings".
 * - AnnouncementsPage — the press's Announcements page
 *   (`management/settings/announcements`): heading, the two tabs, the
 *   list panel (`AnnouncementsList`) and the types grid
 *   (`AnnouncementTypesGrid`).
 * - AnnouncementPanel — the "Add Announcement" / "Edit Announcement" side
 *   panel: "Title", the two TinyMCE boxes, "Image" with its preview,
 *   "Expiry Date", "Announcement Type", "Send Email", the language button,
 *   the refusal summary, "Save" and "Close".
 * - AnnouncementTypeWindow — the legacy "Add Announcement Type" / "Edit"
 *   window ("Name" per language, "Save", "Cancel").
 * - PublicAnnouncements — the visitor's side: the Announcements page, an
 *   announcement's page, the home page block and the header item, on a
 *   press and on the site.
 * - sideMenuLabels — the editorial side menu's entries, in order.
 *
 * Labels are the live locale strings; DOM shapes from lib/ui-library
 * src/components/ListPanel/announcements/*, src/components/Form/*,
 * lib/pkp/templates/frontend/{pages,objects}/announcement*.tpl and the
 * AnnouncementTypeGridHandler's grid, confirmed against the running OMP
 * app while this suite was built (2026-09-17). Locators for every screen
 * were first found by the U12 claim-check scripts
 * (shared/playwright/checks/U12/) and the tomp shape probe.
 */
const {expect} = require('@playwright/test');
const {waitForJQueryIdle} = require('../../../../shared/playwright/support/legacy.js');

const T = 30_000;

/** The Website settings page on a context, with the locale segment. */
function websiteSettingsUrl(contextPath, locale = 'en') {
    return `/index.php/${contextPath}/${locale}/management/settings/website`;
}
exports.websiteSettingsUrl = websiteSettingsUrl;

/** The press's Announcements page (the manager's), with the locale segment. */
function announcementsPageUrl(contextPath, locale = 'en') {
    return `/index.php/${contextPath}/${locale}/management/settings/announcements`;
}
exports.announcementsPageUrl = announcementsPageUrl;

/** The "Site Navigation" side menu's entries, in order (patterns.md pitfall 2). */
async function sideMenuLabels(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    await expect(nav).toBeVisible({timeout: T});
    const labels = await nav.locator('[role="button"]').allInnerTexts();
    return labels.map((label) => label.replace(/\s+/g, ' ').trim());
}
exports.sideMenuLabels = sideMenuLabels;

/** The side menu's "Announcements" entry. */
function sideMenuEntry(page, label) {
    return page
        .getByRole('navigation', {name: 'Site Navigation'})
        .locator('[role="button"]')
        .filter({hasText: new RegExp(`^\\s*${label}\\s*$`)});
}
exports.sideMenuEntry = sideMenuEntry;

/**
 * Wait until a TinyMCE editor is initialized and return its body (inside
 * the editor's iframe, `#{id}_ifr`).
 */
async function richBody(page, root, id) {
    await page.waitForFunction(
        (textareaId) => {
            // @ts-ignore TinyMCE is the app's global
            const editor = window.tinymce?.get(textareaId);
            return !!editor?.initialized;
        },
        id,
        {timeout: T}
    );
    return root.locator(`iframe#${id}_ifr`).contentFrame().locator('body');
}

/** Replace a TinyMCE editor's content by typing (empty `text` clears it). */
async function typeRich(page, root, id, text) {
    const body = await richBody(page, root, id);
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    if (text) {
        await body.pressSequentially(text);
    }
}

/**
 * The "Announcements" settings form (`announcementSettings`): the press's
 * Setup side tab or the site's "Settings" side tab. `root` is the visible
 * tab panel holding the form.
 */
class AnnouncementSettingsForm {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} root
     */
    constructor(page, root) {
        this.page = page;
        this.root = root;
    }

    /** The "Announcements" group ("Enable announcements" and its sentence). */
    enableField() {
        return this.root.locator('.pkpFormField').filter({has: this.page.locator('input[name="enableAnnouncements"]')});
    }

    /** The group's sentence under its label. */
    enableDescription() {
        return this.root.locator('#announcementSettings-enableAnnouncements-description');
    }

    /** "Enable announcements". */
    enableBox() {
        return this.root.getByRole('checkbox', {name: 'Enable announcements', exact: true});
    }

    /** The introduction field ("Additional Information" on a press, OMP1). */
    introductionField(locale = 'en') {
        return this.root
            .locator('.pkpFormField')
            .filter({has: this.page.locator(`#announcementSettings-announcementsIntroduction-control-${locale}`)});
    }

    /** The introduction's help text (a screen-reader span beside the label). */
    introductionTooltip(locale = 'en') {
        return this.root.locator(`#announcementSettings-announcementsIntroduction-tooltip-${locale}`);
    }

    /** Type the introduction (TinyMCE). */
    async typeIntroduction(text, locale = 'en') {
        await typeRich(this.page, this.root, `announcementSettings-announcementsIntroduction-control-${locale}`, text);
    }

    /** The "Display on Homepage" field. */
    countField() {
        return this.root.locator('.pkpFormField').filter({has: this.page.locator('input[name="numAnnouncementsHomepage"]')});
    }

    /** The "Display on Homepage" box. */
    countInput() {
        return this.root.locator('input[name="numAnnouncementsHomepage"]');
    }

    /** A field's label element. */
    label(field) {
        return field.locator('.pkpFormFieldLabel, legend').first();
    }

    /** A field's inline error. */
    fieldError(field) {
        return field.locator('.pkpFieldError');
    }

    /** The refusal summary in the footer ("Please correct one error." with "Jump to next error"). */
    errorSummary() {
        return this.root.locator('.pkpFormErrors');
    }

    /** The form's "Save". */
    saveButton() {
        return this.root.getByRole('button', {name: 'Save', exact: true});
    }

    /** Press "Save" and wait for the "Saved" status (patterns.md pitfall 14). */
    async save() {
        await this.saveButton().click();
        await expect(this.root.locator('[role="status"]').filter({hasText: 'Saved'})).toBeVisible({timeout: T});
    }

    /** Press "Save" on a form the app refuses: the summary appears and the field keeps its error. */
    async saveRefused(summaryText) {
        await this.saveButton().click();
        await expect(this.errorSummary()).toContainText(summaryText, {timeout: T});
    }
}
exports.AnnouncementSettingsForm = AnnouncementSettingsForm;

exports.AnnouncementSettingsTab = class AnnouncementSettingsTab {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /** Open Settings › Website on `contextPath`, then Setup › Announcements. */
    async goto(contextPath, {locale = 'en'} = {}) {
        await this.page.goto(websiteSettingsUrl(contextPath, locale));
        await this.openTab();
    }

    /** Select "Setup" › "Announcements" on the Website settings page already open. */
    async openTab() {
        const setupTab = this.page.locator('#setup-button');
        await expect(setupTab).toBeVisible({timeout: T});
        if ((await setupTab.getAttribute('aria-selected')) !== 'true') {
            await setupTab.click();
        }
        await this.page.locator('#setup').getByRole('tab', {name: 'Announcements', exact: true}).click();
        await expect(this.form().enableBox()).toBeVisible({timeout: T});
    }

    /** The visible tab panel under Setup. */
    panel() {
        return this.page.locator('#setup [role="tabpanel"]:visible');
    }

    /** The settings form inside it. */
    form() {
        return new AnnouncementSettingsForm(this.page, this.panel());
    }
};

exports.SiteAnnouncementsTab = class SiteAnnouncementsTab {
    /**
     * @param {import('@playwright/test').Page} page the Site Administrator's page
     */
    constructor(page) {
        this.page = page;
    }

    /** Administration › Site Settings, then the "Announcements" top tab. */
    async goto() {
        await this.page.goto('/index.php/index/admin/settings');
        await this.openTab();
    }

    /** Select the "Announcements" top tab on the Site Settings page already open. */
    async openTab() {
        const tab = this.page.locator('#announcements-button');
        await expect(tab).toBeVisible({timeout: T});
        await tab.click();
        await expect(this.sideTab('settings')).toBeVisible({timeout: T});
    }

    /** The tab's region. */
    region() {
        return this.page.locator('#announcements');
    }

    /** A side tab: `settings`, `items` or `types`. */
    sideTab(key) {
        return this.region().locator(`#announcement-${key}-button`);
    }

    /** The visible side tab panel. */
    panel() {
        return this.region().locator('[role="tabpanel"]:visible');
    }

    /** Select a side tab. */
    async openSideTab(key) {
        await this.sideTab(key).click();
        await expect(this.sideTab(key)).toHaveAttribute('aria-selected', 'true', {timeout: T});
    }

    /** The "You must enable announcements." sentence of a side tab, with its link. */
    notEnabledText() {
        return this.panel().getByText('You must enable announcements.', {exact: true});
    }

    /** The "enable announcements" link inside that sentence. */
    notEnabledLink() {
        return this.panel().getByRole('link', {name: 'enable announcements', exact: true});
    }

    /** The settings form on the "Settings" side tab. */
    form() {
        return new AnnouncementSettingsForm(this.page, this.panel());
    }

    /** The site's list panel on the "Announcements" side tab. */
    list() {
        return new exports.AnnouncementsList(this.page, this.panel());
    }

    /** The site's types grid on the "Announcement Types" side tab. */
    types() {
        return new exports.AnnouncementTypesGrid(
            this.page,
            this.panel().locator('[id^="component-grid-announcements-announcementtypegrid"]:visible').first()
        );
    }
};

exports.AnnouncementsPage = class AnnouncementsPage {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /** Open the press's Announcements page by its address and wait for its heading. */
    async goto(contextPath, {locale = 'en'} = {}) {
        await this.page.goto(announcementsPageUrl(contextPath, locale));
        await this.expectOpen();
    }

    /** The page's heading (read by CSS: a side panel may sit on top, pitfall 4). */
    heading() {
        return this.page.locator('main h1');
    }

    /** Wait for the page and its list panel. */
    async expectOpen() {
        await expect(this.heading()).toBeVisible({timeout: T});
        await expect(this.list().panel()).toBeVisible({timeout: T});
    }

    /** A top tab of the page: "Announcements" or "Announcement Types". */
    tab(name) {
        return this.page.getByRole('tab', {name, exact: true});
    }

    /** The list panel on the "Announcements" tab. */
    list() {
        return new exports.AnnouncementsList(this.page, this.page.locator('main'));
    }

    /** Select "Announcements" (the list). */
    async openListTab() {
        await this.tab('Announcements').click();
        await expect(this.list().panel()).toBeVisible({timeout: T});
    }

    /** Select "Announcement Types" and wait for the grid. */
    async openTypesTab() {
        await this.tab('Announcement Types').click();
        const grid = this.types();
        await expect(grid.grid()).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
        return grid;
    }

    /** The types grid. */
    types() {
        return new exports.AnnouncementTypesGrid(this.page, this.page.locator('#announcementTypes:visible'));
    }
};

exports.AnnouncementsList = class AnnouncementsList {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} root the region holding the panel
     */
    constructor(page, root) {
        this.page = page;
        this.root = root;
    }

    /** The list panel. */
    panel() {
        return this.root.locator('.announcementsListPanel');
    }

    /** Every row, in list order. */
    rows() {
        return this.panel().locator('.listPanel__item');
    }

    /** The rows' titles, in list order. */
    titles() {
        return this.panel().locator('.listPanel__itemTitle');
    }

    /** The row whose title reads exactly `title`. */
    row(title) {
        return this.rows().filter({
            has: this.page.locator('.listPanel__itemTitle').getByText(title, {exact: true}),
        });
    }

    /** The empty list's "No items found.". */
    noItems() {
        return this.panel().getByText('No items found.', {exact: true});
    }

    /** The header's "Add Announcement". */
    addButton() {
        return this.panel().getByRole('button', {name: 'Add Announcement', exact: true});
    }

    /** The "Search" box. */
    searchBox() {
        return this.panel().locator('input[type="search"]');
    }

    /** Page controls under the list (present past 30 rows). */
    pagination() {
        return this.panel().locator('.pkpPagination');
    }

    /**
     * Type `phrase` in "Search" and press Enter (the box commits on Enter
     * alone), bounded by the list's own fetch answering.
     */
    async search(phrase) {
        const fetched = this.page.waitForResponse(
            (r) => /\/api\/v1\/announcements\?/.test(r.url()) && r.request().method() === 'GET',
            {timeout: T}
        );
        await this.searchBox().fill(phrase);
        await this.searchBox().press('Enter');
        const response = await fetched;
        expect(response.ok(), `search answered ${response.status()}`).toBe(true);
    }

    /** A row's "View" (a link to the public page). */
    viewLink(title) {
        return this.row(title).getByRole('link', {name: 'View', exact: true});
    }

    /** A row's "Edit". */
    editButton(title) {
        return this.row(title).getByRole('button', {name: 'Edit', exact: true});
    }

    /** A row's "Delete". */
    deleteButton(title) {
        return this.row(title).getByRole('button', {name: 'Delete', exact: true});
    }

    /** Press "Add Announcement" and wait for the "Add Announcement" panel. */
    async openAdd() {
        await this.addButton().click();
        const panel = new exports.AnnouncementPanel(this.page, 'Add Announcement');
        await panel.expectOpen();
        return panel;
    }

    /** Press a row's "Edit" and wait for the "Edit Announcement" panel. */
    async openEdit(title) {
        await this.editButton(title).click();
        const panel = new exports.AnnouncementPanel(this.page, 'Edit Announcement');
        await panel.expectOpen();
        return panel;
    }

    /**
     * Add an announcement through the panel: the fields, then "Save";
     * the new row is waited for. Returns the saved announcement (the API's
     * answer: `id` among others).
     */
    async add({title, shortDescription = null, announcement = null, dateExpire = null, sendEmail = false}) {
        const panel = await this.openAdd();
        await panel.fill({title, shortDescription, announcement, dateExpire});
        if (sendEmail) {
            await panel.sendEmailBox().check();
        }
        const saved = await panel.save();
        await expect(this.row(title)).toHaveCount(1, {timeout: T});
        return saved;
    }

    /** The "Delete Announcement" dialog. */
    deleteDialog() {
        return this.page.getByRole('dialog').filter({
            has: this.page.getByRole('heading', {name: 'Delete Announcement'}),
        });
    }

    /** Press a row's "Delete" and wait for the dialog. */
    async openDelete(title) {
        await this.deleteButton(title).click();
        await expect(this.deleteDialog()).toBeVisible({timeout: T});
    }

    /** Answer the open dialog: "Yes" (bounded by the delete answering) or "No". */
    async answerDelete(answer) {
        const dialog = this.deleteDialog();
        if (answer === 'Yes') {
            const deleted = this.page.waitForResponse(
                (r) => /\/api\/v1\/announcements\/\d+/.test(r.url()) && r.request().method() === 'POST',
                {timeout: T}
            );
            await dialog.getByRole('button', {name: 'Yes', exact: true}).click();
            const response = await deleted;
            expect(response.ok(), `delete answered ${response.status()}`).toBe(true);
        } else {
            await dialog.getByRole('button', {name: 'No', exact: true}).click();
        }
        await expect(dialog).toHaveCount(0, {timeout: T});
    }
};

exports.AnnouncementPanel = class AnnouncementPanel {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {'Add Announcement'|'Edit Announcement'} name the panel's heading
     */
    constructor(page, name) {
        this.page = page;
        this.name = name;
    }

    /** The side panel (a dialog headed "Add Announcement" / "Edit Announcement"). */
    dialog() {
        return this.page.getByRole('dialog', {name: this.name});
    }

    /** Wait for the panel and its footer's "Save". */
    async expectOpen() {
        await expect(this.dialog()).toBeVisible({timeout: T});
        await expect(this.saveButton()).toBeVisible({timeout: T});
    }

    /** The control id of a field: `title`, `descriptionShort`, `description` (per locale), `dateExpire`, `image`. */
    static controlId(key, locale = 'en') {
        return ['dateExpire', 'image'].includes(key) ? `announcement-${key}-control` : `announcement-${key}-control-${locale}`;
    }

    /** A field's wrapper (`.pkpFormField`) by the id of its control. */
    fieldByControl(key, locale = 'en') {
        return this.dialog()
            .locator('.pkpFormField')
            .filter({has: this.page.locator(`#${AnnouncementPanel.controlId(key, locale)}`)});
    }

    /** "Title" in `locale`. */
    titleField(locale = 'en') {
        return this.fieldByControl('title', locale);
    }

    /** "Title"'s box in `locale`. */
    titleInput(locale = 'en') {
        return this.dialog().locator(`input[name="title-${locale}"]`);
    }

    /** "Short Description" (TinyMCE) in `locale`. */
    shortDescriptionField(locale = 'en') {
        return this.fieldByControl('descriptionShort', locale);
    }

    /** "Announcement" (TinyMCE) in `locale`. */
    announcementField(locale = 'en') {
        return this.fieldByControl('description', locale);
    }

    /** "Image" (the dropzone field). */
    imageField() {
        return this.dialog().locator('.pkpFormField--uploadImage');
    }

    /** "Expiry Date". */
    expiryField() {
        return this.fieldByControl('dateExpire');
    }

    /** "Expiry Date"'s box. */
    expiryInput() {
        return this.dialog().locator('input[name="dateExpire"]');
    }

    /** "Announcement Type" (present only while the press has a type). */
    typeField() {
        return this.dialog().locator('.pkpFormField').filter({has: this.page.locator('input[name="typeId"]')});
    }

    /** A type's round button, by the type's name. */
    typeRadio(name) {
        return this.typeField().getByRole('radio', {name, exact: true});
    }

    /** "Send an email about this to all registered users.". */
    sendEmailBox() {
        return this.dialog().getByRole('checkbox', {name: 'Send an email about this to all registered users.', exact: true});
    }

    /** A field's label element. */
    label(field) {
        return field.locator('.pkpFormFieldLabel, legend').first();
    }

    /** A field's hint under its label. */
    description(field) {
        return field.locator('.pkpFormField__description');
    }

    /** A field's inline error. */
    fieldError(field) {
        return field.locator('.pkpFieldError');
    }

    /** The refusal summary next to "Save" ("Please correct one error." and its buttons). */
    errorSummary() {
        return this.dialog().locator('.pkpFormErrors');
    }

    /** The footer's "Save". */
    saveButton() {
        return this.dialog().getByRole('button', {name: 'Save', exact: true});
    }

    /** The panel's close control. */
    closeButton() {
        return this.dialog().getByRole('button', {name: 'Close', exact: true});
    }

    /** The language button at the top of the panel ("French"). */
    localeToggle(name) {
        return this.dialog().locator('.pkpFormLocales button').filter({hasText: name});
    }

    /** The TinyMCE body of a rich-text field. */
    async richBody(key, locale = 'en') {
        return richBody(this.page, this.dialog(), AnnouncementPanel.controlId(key, locale));
    }

    /** Replace a rich-text field's content by typing (empty `text` clears it). */
    async typeRich(key, text, locale = 'en') {
        await typeRich(this.page, this.dialog(), AnnouncementPanel.controlId(key, locale), text);
    }

    /** A rich-text field's text as the editor shows it. */
    async readRich(key, locale = 'en') {
        const body = await this.richBody(key, locale);
        return (await body.innerText()).trim();
    }

    /** Fill the text fields given (a null leaves the field alone). */
    async fill({title = null, shortDescription = null, announcement = null, dateExpire = null, locale = 'en'} = {}) {
        if (title !== null) {
            await this.titleInput(locale).fill(title);
        }
        if (shortDescription !== null) {
            await this.typeRich('descriptionShort', shortDescription, locale);
        }
        if (announcement !== null) {
            await this.typeRich('description', announcement, locale);
        }
        if (dateExpire !== null) {
            await this.expiryInput().fill(dateExpire);
        }
    }

    // ---- the image ----------------------------------------------------

    /** The dropzone's file input inside the panel. */
    fileInput() {
        return this.dialog().locator('input[type=file]').first();
    }

    /** Drop a file the box accepts: bounded by the temporary-file upload answering. */
    async uploadImage(file) {
        const uploaded = this.page.waitForResponse(
            (r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.fileInput().setInputFiles(file);
        const response = await uploaded;
        expect(response.ok(), `image upload answered ${response.status()}`).toBe(true);
        await expect(this.preview()).toHaveCount(1, {timeout: T});
    }

    /** Drop a file the box refuses (client-side, nothing sent): the refusal is waited for. */
    async dropRefusedFile(file, message) {
        await this.fileInput().setInputFiles(file);
        await expect(this.fieldError(this.imageField())).toContainText(message, {timeout: T});
    }

    /** The refused file's "REMOVE FILE" link in the box. */
    removeFileLink() {
        return this.imageField().locator('a.dz-remove');
    }

    /** The box's "Upload File" button. */
    uploadFileButton() {
        return this.imageField().getByRole('button', {name: 'Upload File', exact: true});
    }

    /** The preview picture. */
    preview() {
        return this.imageField().locator('.pkpFormField--upload__preview img');
    }

    /** The "Alternate text" box. */
    altTextInput() {
        return this.imageField().locator('input.pkpFormField--uploadImage__altTextInput');
    }

    /** The image's "Remove". */
    removeImageButton() {
        return this.imageField().getByRole('button', {name: 'Remove', exact: true});
    }

    /** The image's "Restore Original". */
    restoreImageButton() {
        return this.imageField().getByRole('button', {name: 'Restore Original', exact: true});
    }

    // ---- save / close -------------------------------------------------

    /**
     * Press "Save" and wait for the announcements API to answer OK and the
     * panel to close (Rules 5, 6). Returns the API's answer (the saved
     * announcement with its `id`).
     */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => /\/api\/v1\/announcements(\/\d+)?$/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.saveButton().click();
        const response = await saved;
        expect(response.ok(), `announcement save answered ${response.status()}`).toBe(true);
        const body = await response.json();
        await expect(this.dialog()).toHaveCount(0, {timeout: T});
        return body;
    }

    /**
     * Press "Save" on a form the app refuses: the summary "Please correct
     * {n} error(s)." appears next to "Save" and the panel stays open.
     */
    async saveRefused(summaryText) {
        await this.saveButton().click();
        await expect(this.errorSummary()).toContainText(summaryText, {timeout: T});
        await expect(this.dialog()).toBeVisible();
    }

    /** Press the close control and wait for the panel to go. */
    async close() {
        await this.closeButton().click();
        await expect(this.dialog()).toHaveCount(0, {timeout: T});
    }
};

exports.AnnouncementTypesGrid = class AnnouncementTypesGrid {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} grid the grid's container
     */
    constructor(page, grid) {
        this.page = page;
        this._grid = grid;
    }

    /** The grid. */
    grid() {
        return this._grid;
    }

    /** The grid's heading. */
    heading() {
        return this.grid().locator('.pkp_controllers_grid > .header h4, h4').first();
    }

    /** The "Name" column header. */
    nameColumn() {
        return this.grid().locator('th').filter({hasText: /^\s*Name\s*$/});
    }

    /** "Add Announcement Type" (a link). */
    addLink() {
        return this.grid().getByRole('link', {name: /Add Announcement Type/});
    }

    /** Every row. */
    rows() {
        return this.grid().locator('tr.gridRow');
    }

    /** The row whose name cell reads `name` (the row text is "Settings {name}"). */
    row(name) {
        return this.rows().filter({has: this.page.locator('td', {hasText: new RegExp(`(^|\\s)${name}\\s*$`)})});
    }

    /** The empty grid's sentence. */
    noneCreated() {
        return this.grid().getByText('No announcement types have been created.', {exact: true});
    }

    /** Press "Add Announcement Type" and wait for the window. */
    async openAdd() {
        await this.addLink().click();
        const window = new exports.AnnouncementTypeWindow(this.page);
        await window.expectOpen();
        return window;
    }

    /**
     * Open a row's arrow and press one of its actions ("Edit" or
     * "Remove"); the links sit in the row after it (pitfall 10).
     */
    async pressRowAction(name, action) {
        const row = this.row(name);
        await expect(row).toHaveCount(1, {timeout: T});
        await row.locator('a.show_extras').click();
        const controls = row.locator('xpath=following-sibling::tr[1]');
        const link = controls.getByRole('link', {name: action, exact: true});
        await expect(link).toBeVisible({timeout: T});
        await link.click();
    }

    /** Press a row's "Edit" and wait for the window. */
    async openEdit(name) {
        await this.pressRowAction(name, 'Edit');
        const window = new exports.AnnouncementTypeWindow(this.page);
        await window.expectOpen();
        return window;
    }

    /** The "Remove" confirmation dialog. */
    removeDialog() {
        return this.page.locator('[role="dialog"]:visible').filter({hasText: 'Are you sure you wish to delete this item?'});
    }

    /** Press a row's "Remove" and wait for the dialog. */
    async openRemove(name) {
        await this.pressRowAction(name, 'Remove');
        await expect(this.removeDialog()).toBeVisible({timeout: T});
    }

    /** Answer the open "Remove" dialog: "OK" (bounded by the delete answering) or "Cancel". */
    async answerRemove(answer) {
        const dialog = this.removeDialog();
        if (answer === 'OK') {
            const removed = this.page.waitForResponse(
                (r) => /announcement-type-grid\/delete-announcement-type/.test(r.url()) && r.request().method() === 'POST',
                {timeout: T}
            );
            await dialog.getByRole('button', {name: 'OK', exact: true}).click();
            const response = await removed;
            expect(response.ok(), `remove answered ${response.status()}`).toBe(true);
        } else {
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
        }
        await expect(dialog).toHaveCount(0, {timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** The notice at the top right of the screen ("Announcement type added." and its siblings). */
    toast(text) {
        return this.page.locator('[class*="notification"]:visible').filter({hasText: text}).first();
    }
};

exports.AnnouncementTypeWindow = class AnnouncementTypeWindow {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /** The window (the last visible dialog, over the page). */
    dialog() {
        return this.page.locator('[role="dialog"]:visible').filter({has: this.page.locator('form#announcementTypeForm')});
    }

    /** Wait for the window and its "Name" box. */
    async expectOpen() {
        await expect(this.dialog()).toBeVisible({timeout: T});
        await expect(this.nameInput('en')).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** "Name" in `locale` (the French twin shows once the English box is focused). */
    nameInput(locale = 'en') {
        return this.dialog().locator(`input[name="name[${locale}]"]`);
    }

    /** The window's heading. */
    heading() {
        return this.dialog().locator('h1, h2, h3').first();
    }

    /** The error under "Name" (the legacy form's error list). */
    nameError() {
        return this.dialog().locator('form#announcementTypeForm .error, form#announcementTypeForm .pkp_form_error, form#announcementTypeForm [class*="error"]').filter({hasText: 'This field is required.'}).first();
    }

    /** "Save". */
    saveButton() {
        return this.dialog().getByRole('button', {name: 'Save', exact: true});
    }

    /** "Cancel" (a link on the legacy form, pitfall 7). */
    cancelLink() {
        return this.dialog().getByRole('link', {name: 'Cancel', exact: true});
    }

    /** Press "Save", bounded by the grid's update answering, and wait for the window to close. */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => /announcement-type-grid\/update-announcement-type/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.saveButton().click();
        const response = await saved;
        expect(response.ok(), `type save answered ${response.status()}`).toBe(true);
        await expect(this.dialog()).toHaveCount(0, {timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** Press "Save" on a name the form refuses: the message under "Name", the window open. */
    async saveRefused() {
        await this.saveButton().click();
        await expect(this.nameError()).toBeVisible({timeout: T});
        await expect(this.dialog()).toBeVisible();
    }
};

exports.PublicAnnouncements = class PublicAnnouncements {
    /**
     * @param {import('@playwright/test').Page} page a visitor's page (signed out, usually)
     */
    constructor(page) {
        this.page = page;
    }

    // ---- addresses ----------------------------------------------------

    /** A context's public address (bare on a single-language scratch press; `locale` adds the segment). */
    static contextBase(contextPath, locale = null) {
        return `/index.php/${contextPath}${locale ? `/${locale}` : ''}`;
    }

    /** The Announcements page's address. */
    static listUrl(contextPath, locale = null) {
        return `${PublicAnnouncements.contextBase(contextPath, locale)}/announcement`;
    }

    /** An announcement's page address. */
    static viewUrl(contextPath, id, locale = null) {
        return `${PublicAnnouncements.contextBase(contextPath, locale)}/announcement/view/${id}`;
    }

    /** Open the Announcements page and wait for its heading. */
    async gotoList(contextPath, {locale = null} = {}) {
        await this.page.goto(PublicAnnouncements.listUrl(contextPath, locale));
        await expect(this.heading()).toBeVisible({timeout: T});
    }

    /** Open an announcement's page (it may land on the Announcements page instead, Rule 10). */
    async gotoView(contextPath, id, {locale = null} = {}) {
        await this.page.goto(PublicAnnouncements.viewUrl(contextPath, id, locale));
        await expect(this.page.locator('.cmp_breadcrumbs, .cmp_breadcrumbs_announcement').first()).toBeVisible({timeout: T});
    }

    /** Open the home page and wait for its skip links (server-rendered, so the block read is settled). */
    async gotoHome(contextPath, {locale = null} = {}) {
        await this.page.goto(PublicAnnouncements.contextBase(contextPath, locale));
        await expect(this.skipLinks().first()).toBeAttached({timeout: T});
    }

    /**
     * Open an address the app refuses and assert the bare "404 Not Found"
     * page (HTTP 404, no header).
     */
    async expectNotFound(url) {
        const response = await this.page.goto(url);
        expect(response, 'a response').toBeTruthy();
        expect(response && response.status(), `${url} answered`).toBe(404);
        await expect(this.page.getByText('404 Not Found')).toBeVisible({timeout: T});
        await expect(this.page.locator('#navigationPrimary')).toHaveCount(0);
    }

    // ---- the chrome ---------------------------------------------------

    /** The header's primary menu items, in order (top level only). */
    async headerItems() {
        const items = await this.page.locator('#navigationPrimary > li > a').allInnerTexts();
        return items.map((item) => item.replace(/\s+/g, ' ').trim());
    }

    /** The header's "Announcements" item. */
    headerItem(name) {
        return this.page.locator('#navigationPrimary > li > a').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)});
    }

    /** The page's skip links. */
    skipLinks() {
        return this.page.locator('.cmp_skip_to_content a');
    }

    /** "Skip to announcements" (present only while the home block shows). */
    skipToAnnouncements() {
        return this.page.locator('.cmp_skip_to_content a[href="#homepageAnnouncements"]');
    }

    // ---- the Announcements page ---------------------------------------

    /** The breadcrumb trail, as one string. */
    breadcrumbs() {
        return this.page.locator('.cmp_breadcrumbs, .cmp_breadcrumbs_announcement').first();
    }

    /** The page's heading ("Announcements", or the announcement's title). */
    heading() {
        return this.page.locator('h1').first();
    }

    /** The manager's "Edit" link under the heading. */
    editLink() {
        return this.page.locator('a.cmp_edit_link');
    }

    /** The introduction printed between the heading and the list. */
    introduction() {
        return this.page.locator('.page_announcements');
    }

    /** The list's summaries, newest first. */
    summaries() {
        return this.page.locator('ul.cmp_announcements > li > article.obj_announcement_summary');
    }

    /** The summary whose title reads `title`. */
    summary(title) {
        return this.summaries().filter({has: this.page.locator('h2, h3').getByText(title, {exact: true})});
    }

    /** The summaries' titles, in list order. */
    summaryTitles() {
        return this.summaries().locator('.obj_announcement_summary_details > h2 a, .obj_announcement_summary_details > h3 a');
    }

    /** A summary's title link. */
    titleLink(summary) {
        return summary.locator('.obj_announcement_summary_details a').first();
    }

    /** A summary's posted date. */
    date(summary) {
        return summary.locator('.date');
    }

    /** A summary's short description (the text without the "Read More" link). */
    summaryText(summary) {
        return summary.locator('.summary');
    }

    /** A summary's "Read More" link (read as "Read more about {title}"). */
    readMore(summary) {
        return summary.locator('a.read_more');
    }

    /** A summary's picture. */
    image(summary) {
        return summary.locator('img.obj_announcement_summary_image');
    }

    // ---- an announcement's page ---------------------------------------

    /** The full announcement. */
    full() {
        return this.page.locator('article.obj_announcement_full');
    }

    /** The full announcement's date. */
    fullDate() {
        return this.full().locator('.date');
    }

    /** The full announcement's picture. */
    fullImage() {
        return this.full().locator('img.obj_announcement_full_image');
    }

    /** The full announcement's text. */
    fullText() {
        return this.full().locator('.description');
    }

    // ---- the home page block ------------------------------------------

    /** The block headed "Announcements" (absent without a count or a live announcement). */
    homeBlock() {
        return this.page.locator('section.cmp_announcements');
    }

    /** The block's heading. */
    homeHeading() {
        return this.homeBlock().locator('h2').first();
    }

    /** The block's first item (a full summary). */
    homeFirst() {
        return this.homeBlock().locator('article.obj_announcement_summary').first();
    }

    /** The block's further items (title links with their date). */
    homeMore() {
        return this.homeBlock().locator('div.more article');
    }

    /** The further items' titles, in order. */
    homeMoreTitles() {
        return this.homeMore().locator('h4 a');
    }
};
