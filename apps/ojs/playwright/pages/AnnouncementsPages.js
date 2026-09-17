// @ts-check
/**
 * @file playwright/pages/AnnouncementsPages.js
 *
 * OJS-local Page Objects and flow helpers for the Announcements feature
 * (spec: docs/specs/U12-announcements.md).
 *
 * Surfaces:
 * - AnnouncementsSettingsTab — Settings › Website › Setup › Announcements:
 *   "Enable announcements", "Introduction" (TinyMCE, per language) and
 *   "Display on Homepage", the footer's error summary and "Save".
 * - SiteAnnouncementsTab — Administration › Site Settings › Announcements:
 *   the side tabs "Settings", "Announcements" and "Announcement Types", the
 *   same settings form, the site's list panel and types grid.
 * - SideMenu — the editorial layout's "Site Navigation" panelmenu: its
 *   top-level entries in order ("Announcements" sits among them).
 * - AnnouncementsPage — the journal's Announcements page
 *   (`management/settings/announcements`): the "Announcements" tab's list
 *   panel (search, rows, "View" / "Edit" / "Delete", "Add Announcement",
 *   the "Delete Announcement" dialog) and the "Announcement Types" tab's
 *   legacy grid (rows, the arrow, "Edit" / "Remove", the "Add Announcement
 *   Type" window and the remove confirm).
 * - AnnouncementPanel — the "Add Announcement" / "Edit Announcement" side
 *   panel: "Title" (one input per form language), the TinyMCE "Short
 *   Description" and "Announcement", the "Image" dropzone with its preview,
 *   "Alternate text", "Remove" and "Restore Original", "Expiry Date", the
 *   "Announcement Type" radios, "Send Email", the language buttons, the
 *   error summary and "Save".
 * - PublicAnnouncements / AnnouncementView / homeBlock / feedBlock /
 *   primaryNavItems / readFeed — the reader's side: the Announcements page,
 *   an announcement's page, the home page block and skip link, the
 *   header's primary navigation, the OJS feed block and the feeds.
 *
 * Labels are the live locale strings; DOM shapes confirmed against the
 * running app by the U12 claim check (the kept scripts under
 * shared/playwright/checks/U12/ and .reports/U12/screen-notes.md,
 * 2026-09-17) and while this suite was built.
 */
const {expect} = require('@playwright/test');

const T = 30_000;

/** Decode the entities a feed's text nodes carry. */
function unescapeXml(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&');
}

/** The text of the first `<tag>` element in `xml` (empty when absent). */
function tagText(xml, tag) {
    const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
    return m ? unescapeXml(m[1].trim()) : '';
}

// -------------------------------------------------------------------------
// Settings › Website › Setup › Announcements (Rule 2; Fields)
// -------------------------------------------------------------------------

/**
 * The three-field settings form, shared by the journal's tab and the site's
 * "Settings" side tab: the same Vue form with the same field names.
 */
class AnnouncementsSettingsForm {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} panel the visible tabpanel holding the form
     */
    constructor(page, panel) {
        this.page = page;
        this.panel = panel;
    }

    enableBox() {
        return this.panel.getByRole('checkbox', {name: 'Enable announcements', exact: true});
    }

    /** The field wrapper holding the given control (`.pkpFormField`). */
    fieldOf(controlSelector) {
        return this.panel.locator('.pkpFormField').filter({has: this.page.locator(controlSelector)});
    }

    enableField() {
        return this.fieldOf('input[type=checkbox][name=enableAnnouncements]');
    }

    /** "Introduction": the TinyMCE box of the given language. */
    introductionField(locale = 'en') {
        return this.panel.locator('.pkpFormField').filter({has: this.page.locator(`iframe[id*="announcementsIntroduction"][id$="-${locale}_ifr"]`)});
    }

    countField() {
        return this.fieldOf('input[name=numAnnouncementsHomepage]');
    }

    countInput() {
        return this.panel.locator('input[name=numAnnouncementsHomepage]');
    }

    /** A field's label element. */
    label(field) {
        return field.locator('label.pkpFormFieldLabel').first();
    }

    /** The field's message under its box (`.pkpFieldError`). */
    fieldError(field) {
        return field.locator('.pkpFieldError');
    }

    /** The footer's summary ("Please correct one error." with "Jump to next error"). */
    errorSummary() {
        return this.panel.locator('.pkpFormPage__footer .pkpFormErrors');
    }

    /** A rich-text box's editable body once TinyMCE has made it editable. */
    async richBody(field) {
        const frame = field.locator('iframe').first();
        await expect(frame).toBeVisible({timeout: T});
        const body = frame.contentFrame().locator('body');
        await expect(body).toHaveAttribute('contenteditable', 'true', {timeout: T});
        return body;
    }

    /** Replace a rich-text box's content with `text` (empty clears it). */
    async setRich(field, text) {
        const body = await this.richBody(field);
        await body.click();
        await this.page.keyboard.press('ControlOrMeta+A');
        await this.page.keyboard.press('Delete');
        if (text) {
            await body.pressSequentially(text);
        }
        await expect(body).toHaveText(text ? text : '', {timeout: T});
    }

    async typeIntroduction(text, locale = 'en') {
        await this.setRich(this.introductionField(locale), text);
    }

    saveButton() {
        return this.panel.getByRole('button', {name: 'Save', exact: true});
    }

    /** The inline "Saved" status the form shows after a successful save (patterns.md pitfall 14). */
    savedStatus() {
        return this.panel.locator('[role="status"]').filter({hasText: 'Saved'});
    }

    /** Press "Save" and wait for the "Saved" status. */
    async save() {
        await this.saveButton().click();
        await expect(this.savedStatus()).toBeVisible({timeout: T});
    }

    /**
     * Press "Save" on a form the app refuses in place: the summary reads
     * `summary`, and "Save" is grayed out until the value changes (Fields).
     */
    async saveRefused(summary = 'Please correct one error.') {
        await this.saveButton().click();
        await expect(this.errorSummary()).toContainText(summary, {timeout: T});
        await expect(this.saveButton()).toBeDisabled();
    }
}
exports.AnnouncementsSettingsForm = AnnouncementsSettingsForm;

exports.AnnouncementsSettingsTab = class AnnouncementsSettingsTab extends AnnouncementsSettingsForm {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the journal's url path
     */
    constructor(page, contextPath) {
        super(page, page.locator('#setup').first().locator('[role="tabpanel"]:visible').first());
        this.contextPath = contextPath;
    }

    /**
     * Open Settings › Website, select the outer "Setup" tab when it is not
     * current, then the "Announcements" side tab, and wait for the box.
     */
    async goto() {
        await this.page.goto(`/index.php/${this.contextPath}/en/management/settings/website`);
        const setupTab = this.page.locator('#setup-button').first();
        await expect(setupTab).toBeVisible({timeout: T});
        if ((await setupTab.getAttribute('aria-selected')) !== 'true') {
            await setupTab.click();
        }
        await this.page.locator('#setup').first().getByRole('tab', {name: 'Announcements', exact: true}).click();
        await expect(this.enableBox()).toBeVisible({timeout: T});
    }
};

// -------------------------------------------------------------------------
// Administration › Site Settings › Announcements (Rule 16)
// -------------------------------------------------------------------------

exports.SiteAnnouncementsTab = class SiteAnnouncementsTab {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
        this.tab = page.locator('#announcements').first();
    }

    /** Open the Site Settings and press the "Announcements" top tab. */
    async goto() {
        await this.page.goto('/index.php/index/en/admin/settings');
        const topTab = this.page.locator('#announcements-button').first();
        await expect(topTab).toBeVisible({timeout: T});
        await topTab.click();
        await expect(this.sideTab('settings')).toBeVisible({timeout: T});
    }

    /** A side tab: `settings`, `items` or `types`. */
    sideTab(name) {
        return this.tab.locator(`#announcement-${name}-button`).first();
    }

    /** The side tab's visible panel. */
    sidePanel() {
        return this.tab.locator('[role="tabpanel"]:visible').first();
    }

    async openSideTab(name) {
        await this.sideTab(name).click();
        await expect(this.sideTab(name)).toHaveAttribute('aria-selected', 'true', {timeout: T});
    }

    /** The "Settings" side tab's form. */
    settingsForm() {
        return new AnnouncementsSettingsForm(this.page, this.sidePanel());
    }

    /** The "You must enable announcements." sentence of a side tab while the box is unticked. */
    mustEnableText() {
        return this.sidePanel().getByText('You must enable announcements.', {exact: false});
    }

    /** Its "enable announcements" link. */
    mustEnableLink() {
        return this.sidePanel().getByRole('link', {name: 'enable announcements', exact: true});
    }

    /** The site's list panel on the "Announcements" side tab. */
    list() {
        return new AnnouncementsList(this.page, this.sidePanel().locator('.listPanel').first());
    }

    /** The site's types grid on the "Announcement Types" side tab. */
    types() {
        return new AnnouncementTypesGrid(
            this.page,
            this.page.locator('[id^="component-grid-announcements-announcementtypegrid"]:visible').first()
        );
    }
};

// -------------------------------------------------------------------------
// The editorial side menu (Rules 2, 3)
// -------------------------------------------------------------------------

exports.SideMenu = class SideMenu {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
    }

    nav() {
        return this.page.getByRole('navigation', {name: 'Site Navigation'});
    }

    /**
     * The top-level entries' labels in DOM order: every `[role="button"]`
     * of the panelmenu that sits in no group's region (the groups' own
     * headers included), read from the DOM whether open or closed.
     */
    async topLevelLabels() {
        await expect(this.nav()).toBeVisible({timeout: T});
        return this.nav().evaluate((nav) =>
            [...nav.querySelectorAll('[role="button"]')]
                .filter((el) => !el.closest('[role="region"]'))
                .map((el) => el.getAttribute('aria-label') || (el.textContent || '').replace(/\s+/g, ' ').trim())
        );
    }

    /** The "Announcements" entry. */
    announcementsEntry() {
        return this.nav().locator('[role="button"]').filter({hasText: /^\s*Announcements\s*$/}).first();
    }
};

// -------------------------------------------------------------------------
// The Announcements page: the list panel (Rules 3–7)
// -------------------------------------------------------------------------

/** A list panel of announcements: the journal's tab or the site's side tab. */
class AnnouncementsList {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} panel the `.listPanel`
     */
    constructor(page, panel) {
        this.page = page;
        this.panel = panel;
    }

    rows() {
        return this.panel.locator('.listPanel__item');
    }

    row(title) {
        return this.rows().filter({has: this.page.locator('.listPanel__itemTitle', {hasText: title})});
    }

    async rowTitles() {
        return this.rows().locator('.listPanel__itemTitle').allInnerTexts();
    }

    emptyMessage() {
        return this.panel.getByText('No items found.', {exact: true});
    }

    addButton() {
        return this.panel.getByRole('button', {name: 'Add Announcement', exact: true});
    }

    searchBox() {
        return this.panel.locator('input[type="search"]');
    }

    /** The row's "View" (a link to the announcement's public page). */
    viewLink(title) {
        return this.row(title).getByRole('link', {name: 'View', exact: true});
    }

    editButton(title) {
        return this.row(title).getByRole('button', {name: 'Edit', exact: true});
    }

    deleteButton(title) {
        return this.row(title).getByRole('button', {name: 'Delete', exact: true});
    }

    /** The announcement's number, read from the row's "View" address. */
    async idOf(title) {
        const href = await this.viewLink(title).getAttribute('href');
        const m = (href || '').match(/\/announcement\/view\/(\d+)/);
        if (!m) {
            throw new Error(`AnnouncementsList.idOf: no announcement number in "${href}"`);
        }
        return Number(m[1]);
    }

    /**
     * Type a phrase in "Search" and press Enter (the box commits on Enter
     * only), bounded by the list's own fetch (Rule 4).
     */
    async search(phrase) {
        const fetched = this.page.waitForResponse(
            (r) => /\/api\/v1\/announcements\?/.test(r.url()) && r.request().method() === 'GET' && r.ok(),
            {timeout: T}
        );
        await this.searchBox().fill(phrase);
        await this.searchBox().press('Enter');
        await fetched;
    }

    async openAdd() {
        await this.addButton().click();
        const panel = new AnnouncementPanel(this.page, 'Add Announcement');
        await panel.expectOpen();
        return panel;
    }

    async openEdit(title) {
        await this.editButton(title).click();
        const panel = new AnnouncementPanel(this.page, 'Edit Announcement');
        await panel.expectOpen();
        return panel;
    }

    /** The "Delete Announcement" dialog (Rule 7). */
    deleteDialog() {
        return this.page.getByRole('dialog').filter({hasText: 'Delete Announcement'});
    }

    /** "Yes" in the delete dialog, bounded by the delete request answering OK. */
    async confirmDelete() {
        const deleted = this.page.waitForResponse(
            (r) =>
                /\/api\/v1\/announcements\/\d+$/.test(r.url()) &&
                r.request().method() === 'POST' &&
                r.request().headers()['x-http-method-override'] === 'DELETE' &&
                r.ok(),
            {timeout: T}
        );
        await this.deleteDialog().getByRole('button', {name: 'Yes', exact: true}).click();
        await deleted;
        await expect(this.deleteDialog()).toHaveCount(0, {timeout: T});
    }

    /** "Delete" on the row, then "Yes"; the row is gone. */
    async deleteAnnouncement(title) {
        await this.deleteButton(title).click();
        await expect(this.deleteDialog()).toBeVisible({timeout: T});
        await this.confirmDelete();
        await expect(this.row(title)).toHaveCount(0, {timeout: T});
    }
}
exports.AnnouncementsList = AnnouncementsList;

// -------------------------------------------------------------------------
// The Announcements page: the types grid (Rule 13)
// -------------------------------------------------------------------------

/** The "Announcement Types" legacy grid: the journal's tab or the site's side tab. */
class AnnouncementTypesGrid {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} grid the grid's container
     */
    constructor(page, grid) {
        this.page = page;
        this.grid = grid;
    }

    /** "Add Announcement Type" (a link above the table). */
    addLink() {
        return this.grid.getByRole('link', {name: /Add Announcement Type/});
    }

    rows() {
        return this.grid.locator('tr.gridRow');
    }

    /** The row whose name reads `name` (the cell text reads "Settings {name}", pitfall 16). */
    row(name) {
        return this.rows().filter({hasText: new RegExp(`(^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)});
    }

    /** Every row's name in order (`innerText`: a freshly added row's `textContent` carries its inline script). */
    async rowNames() {
        return this.rows().evaluateAll((rows) =>
            rows.map((row) => (row.innerText || '').replace(/\s+/g, ' ').trim().replace(/^Settings\s+/, ''))
        );
    }

    emptyMessage() {
        return this.grid.getByText('No announcement types have been created.', {exact: true});
    }

    /** Open the row's controls (`a.show_extras`); its links live in the next `tr` (pitfall 10). */
    async openRowControls(name) {
        const row = this.row(name);
        await expect(row).toHaveCount(1, {timeout: T});
        await row.locator('a.show_extras').click();
        const controls = row.locator('xpath=following-sibling::tr[1]');
        await expect(controls.getByRole('link', {name: 'Edit', exact: true})).toBeVisible({timeout: T});
        return controls;
    }

    /** The "Add Announcement Type" / "Edit" window (the last visible dialog). */
    window() {
        return this.page.locator('[role="dialog"]:visible').last();
    }

    /** The window's "Name" box of the given language (`name[en]` / `name[fr_CA]`). */
    nameInput(locale = 'en') {
        return this.window().locator(`input[name="name[${locale}]"]`);
    }

    async openAdd() {
        await this.addLink().click();
        await expect(this.window().getByRole('heading', {name: 'Add Announcement Type'})).toBeVisible({timeout: T});
        await expect(this.nameInput('en')).toBeVisible({timeout: T});
    }

    async openEdit(name) {
        const controls = await this.openRowControls(name);
        await controls.getByRole('link', {name: 'Edit', exact: true}).click();
        await expect(this.nameInput('en')).toBeVisible({timeout: T});
        await expect(this.nameInput('en')).toHaveValue(name, {timeout: T});
    }

    windowSaveButton() {
        return this.window().getByRole('button', {name: 'Save', exact: true});
    }

    /** "Cancel" is a link on this legacy form (pitfall 7). */
    windowCancelLink() {
        return this.window().getByRole('link', {name: 'Cancel', exact: true});
    }

    /** Press the window's "Save", bounded by the grid's update request. */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => /update-announcement-type/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
            {timeout: T}
        );
        await this.windowSaveButton().click();
        await saved;
    }

    /** The window's "This field is required." under "Name" (the browser-side refusal, `label.error`). */
    nameError() {
        return this.window().locator('label.error, .error').filter({hasText: 'This field is required.'}).first();
    }

    /** The top-right toast with the given sentence ("Announcement type added."). */
    toast(text) {
        return this.page.locator('[class*=notification]:visible').filter({hasText: text}).first();
    }

    /** The "Remove" confirmation dialog. */
    confirmDialog() {
        return this.page.locator('[role="dialog"]:visible').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
    }

    /** Open the row's controls and press "Remove"; the confirm is on screen. */
    async openRemove(name) {
        const controls = await this.openRowControls(name);
        await controls.getByRole('link', {name: 'Remove', exact: true}).click();
        await expect(this.confirmDialog()).toBeVisible({timeout: T});
    }
}
exports.AnnouncementTypesGrid = AnnouncementTypesGrid;

exports.AnnouncementsPage = class AnnouncementsPage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the journal's url path
     */
    constructor(page, contextPath) {
        this.page = page;
        this.contextPath = contextPath;
    }

    /** Open the page by its address in the given interface language and wait for its heading. */
    async goto({locale = 'en'} = {}) {
        await this.page.goto(`/index.php/${this.contextPath}/${locale}/management/settings/announcements`);
        await expect(this.heading()).toBeVisible({timeout: T});
    }

    /** The page's heading, read by CSS (the panel is a sibling of the tabs). */
    heading() {
        return this.page.locator('main h1');
    }

    tab(name) {
        return this.page.locator('main').getByRole('tab', {name, exact: true});
    }

    /** The "Announcements" tab's list panel. */
    list() {
        return new AnnouncementsList(this.page, this.page.locator('main .listPanel').first());
    }

    /** The "Announcement Types" tab's grid. */
    types() {
        return new AnnouncementTypesGrid(this.page, this.page.locator('#announcementTypes:visible').first());
    }

    async openTypesTab() {
        await this.tab('Announcement Types').click();
        await expect(this.page.locator('#announcementTypes:visible').first()).toBeVisible({timeout: T});
    }

    async openAnnouncementsTab() {
        await this.tab('Announcements').click();
        await expect(this.list().panel).toBeVisible({timeout: T});
    }
};

// -------------------------------------------------------------------------
// The "Add Announcement" / "Edit Announcement" side panel (Fields)
// -------------------------------------------------------------------------

const AnnouncementPanel = class AnnouncementPanel {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {'Add Announcement' | 'Edit Announcement'} title
     */
    constructor(page, title) {
        this.page = page;
        this.title = title;
        this.dialog = page.getByRole('dialog', {name: title});
    }

    /** The panel with its footer's "Save" on screen (the form renders after the dialog). */
    async expectOpen() {
        await expect(this.dialog).toBeVisible({timeout: T});
        await expect(this.saveButton()).toBeVisible({timeout: T});
    }

    /** The field wrapper holding the given control (`.pkpFormField`). */
    fieldOf(controlSelector) {
        return this.dialog.locator('.pkpFormField').filter({has: this.page.locator(controlSelector)});
    }

    titleField(locale = 'en') {
        return this.fieldOf(`input[name="title-${locale}"]`);
    }

    titleInput(locale = 'en') {
        return this.dialog.locator(`input[name="title-${locale}"]`);
    }

    shortDescriptionField(locale = 'en') {
        return this.fieldOf(`#announcement-descriptionShort-control-${locale}_ifr`);
    }

    announcementField(locale = 'en') {
        return this.fieldOf(`#announcement-description-control-${locale}_ifr`);
    }

    imageField() {
        return this.dialog.locator('.pkpFormField--uploadImage');
    }

    expiryField() {
        return this.fieldOf('input[name="dateExpire"]');
    }

    expiryInput() {
        return this.dialog.locator('input[name="dateExpire"]');
    }

    /** The "Announcement Type" field (present only while the journal has a type). */
    typeField() {
        return this.fieldOf('input[name="typeId"]');
    }

    /** The round button of the given type name. */
    typeRadio(name) {
        return this.typeField().getByRole('radio', {name, exact: true});
    }

    typeRadios() {
        return this.dialog.locator('input[name="typeId"]');
    }

    sendEmailField() {
        return this.fieldOf('input[name="sendEmail"]');
    }

    sendEmailBox() {
        return this.dialog.getByRole('checkbox', {name: 'Send an email about this to all registered users.', exact: true});
    }

    /** A field's label element (its text carries "{Field} in French" on a second language). */
    label(field) {
        return field.locator('label.pkpFormFieldLabel').first();
    }

    /** The field's message under its box (`.pkpFieldError`). */
    fieldError(field) {
        return field.locator('.pkpFieldError');
    }

    /** A rich-text box's editable body once TinyMCE has made it editable. */
    async richBody(field) {
        const frame = field.locator('iframe').first();
        await expect(frame).toBeVisible({timeout: T});
        const body = frame.contentFrame().locator('body');
        await expect(body).toHaveAttribute('contenteditable', 'true', {timeout: T});
        return body;
    }

    /** Replace a rich-text box's content with `text` (empty clears it). */
    async setRich(field, text) {
        const body = await this.richBody(field);
        await body.click();
        await this.page.keyboard.press('ControlOrMeta+A');
        await this.page.keyboard.press('Delete');
        if (text) {
            await body.pressSequentially(text);
        }
        await expect(body).toHaveText(text ? text : '', {timeout: T});
    }

    async typeShortDescription(text, locale = 'en') {
        await this.setRich(this.shortDescriptionField(locale), text);
    }

    async typeAnnouncement(text, locale = 'en') {
        await this.setRich(this.announcementField(locale), text);
    }

    /** A rich-text box's text as shown. */
    async richText(field) {
        return (await this.richBody(field)).innerText();
    }

    /** The language button at the top of a two-language panel ("French"). */
    localeButton(name) {
        return this.dialog.locator('.pkpFormLocales button').filter({hasText: name});
    }

    /** The dropzone's hidden file input (appended to the body, so the last one on the page). */
    fileInput() {
        return this.page.locator('input[type=file]').last();
    }

    /** The preview image ("Preview of the currently selected image."). */
    preview() {
        return this.imageField().locator('.pkpFormField--upload__preview img');
    }

    altTextInput() {
        return this.imageField().locator('input.pkpFormField--uploadImage__altTextInput');
    }

    removeButton() {
        return this.imageField().getByRole('button', {name: 'Remove', exact: true});
    }

    restoreButton() {
        return this.imageField().getByRole('button', {name: 'Restore Original', exact: true});
    }

    uploadFileButton() {
        return this.imageField().getByRole('button', {name: 'Upload File', exact: true});
    }

    /** The box's refusal of a file ("You can't upload files of this type."). */
    dropzoneError() {
        return this.fieldError(this.imageField());
    }

    /** The refused file's entry in the box (its name and the "REMOVE FILE" link). */
    refusedFile() {
        return this.imageField().locator('.dz-preview.dz-error');
    }

    /** The refused entry's "REMOVE FILE" link (`a.dz-remove`). */
    removeFileLink() {
        return this.refusedFile().locator('a.dz-remove');
    }

    /** Drop an image into the box, bounded by its temporary-file upload answering OK, and wait for the preview. */
    async uploadImage(filePath) {
        const uploaded = this.page.waitForResponse(
            (r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
            {timeout: T}
        );
        await this.fileInput().setInputFiles(filePath);
        await uploaded;
        await expect(this.preview()).toBeVisible({timeout: T});
    }

    saveButton() {
        return this.dialog.getByRole('button', {name: 'Save', exact: true});
    }

    /** The error summary in the footer, next to "Save" (`.pkpFormErrors`). */
    errorSummary() {
        return this.dialog.locator('.pkpFormErrors');
    }

    /** A "Go to {field}: {message}" button of the summary. */
    errorLink(text) {
        return this.errorSummary().getByRole('button', {name: text, exact: true});
    }

    /**
     * Press Save, bounded by the announcements API answering OK (useFetch
     * tunnels PUT via POST, so an edit is a POST too), and wait for the
     * panel to close. Returns the saved announcement's number.
     */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => /\/api\/v1\/announcements(\/\d+)?$/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
            {timeout: T}
        );
        await this.saveButton().click();
        const response = await saved;
        await expect(this.dialog).toHaveCount(0, {timeout: T});
        const body = await response.json().catch(() => null);
        return body && typeof body.id === 'number' ? body.id : null;
    }

    /**
     * Press Save on a panel the form refuses in place: the summary reads
     * `summary`, the panel stays open and Save is grayed out (Fields).
     */
    async saveRefused(summary = 'Please correct one error.') {
        await this.saveButton().click();
        await expect(this.errorSummary()).toContainText(summary, {timeout: T});
        await expect(this.dialog).toBeVisible();
        await expect(this.saveButton()).toBeDisabled();
    }

    /** The panel's close control. */
    async close() {
        await this.dialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(this.dialog).toHaveCount(0, {timeout: T});
    }
};
exports.AnnouncementPanel = AnnouncementPanel;

// -------------------------------------------------------------------------
// The reader's side (Rules 9–12, 18)
// -------------------------------------------------------------------------

/** The top-level items of the header's primary navigation, in order. */
exports.primaryNavItems = async function primaryNavItems(page) {
    const nav = page.locator('#navigationPrimary');
    await expect(nav).toBeVisible({timeout: T});
    return nav.locator('> li > a').allInnerTexts().then((items) => items.map((s) => s.replace(/\s+/g, ' ').trim()));
};

/** The header's "Announcements" item. */
exports.primaryNavItem = function primaryNavItem(page, name) {
    return page.locator('#navigationPrimary > li > a').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)});
};

/** The "Skip to announcements" link of the skip links. */
exports.skipToAnnouncements = function skipToAnnouncements(page) {
    return page.locator('.cmp_skip_to_content a[href="#homepageAnnouncements"]');
};

/**
 * A summary (`article.obj_announcement_summary`) on the Announcements page
 * or in the home page block: its parts as locators.
 */
function summaryParts(article) {
    return {
        article,
        image: article.locator('img'),
        titleLink: article.locator('.obj_announcement_summary_details h2 a, .obj_announcement_summary_details h3 a, h2 a, h3 a').first(),
        date: article.locator('.date'),
        summary: article.locator('.summary'),
        readMore: article.locator('a.read_more'),
        readMoreVisible: article.locator('a.read_more [aria-hidden]'),
        readMoreScreenReader: article.locator('a.read_more .pkp_screen_reader'),
    };
}

/** The public Announcements page (`{path}/announcement`, Rule 9). */
exports.PublicAnnouncements = class PublicAnnouncements {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the journal's url path ('index' for the site's page)
     */
    constructor(page, contextPath) {
        this.page = page;
        this.contextPath = contextPath;
    }

    url(locale = '') {
        return `/index.php/${this.contextPath}${locale ? `/${locale}` : ''}/announcement`;
    }

    /** Open the page and wait for its heading; returns the navigation response. */
    async goto(locale = '') {
        const response = await this.page.goto(this.url(locale));
        await expect(this.heading()).toBeVisible({timeout: T});
        return response;
    }

    container() {
        return this.page.locator('.page_announcements');
    }

    heading() {
        return this.container().locator('h1').first();
    }

    breadcrumb() {
        return this.container().locator('.cmp_breadcrumbs');
    }

    /** The "Edit" link a signed-in manager sees under the heading (`a.cmp_edit_link`). */
    editLink() {
        return this.container().locator('a.cmp_edit_link');
    }

    list() {
        return this.container().locator('ul.cmp_announcements');
    }

    articles() {
        return this.list().locator('> li > article');
    }

    async titles() {
        return this.articles().locator('h2 a').allInnerTexts().then((items) => items.map((s) => s.trim()));
    }

    /** The summary whose title reads `title`. */
    summary(title) {
        return summaryParts(this.articles().filter({has: this.page.locator('h2 a', {hasText: new RegExp(`^\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)})}));
    }
};

/** An announcement's own page (`{path}/announcement/view/{id}`, Rule 10). */
exports.AnnouncementView = class AnnouncementView {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the journal's url path
     */
    constructor(page, contextPath) {
        this.page = page;
        this.contextPath = contextPath;
    }

    url(id, locale = '') {
        return `/index.php/${this.contextPath}${locale ? `/${locale}` : ''}/announcement/view/${id}`;
    }

    /** Open the page by its address; returns the navigation response (the page may land on the list instead). */
    async goto(id, locale = '') {
        return this.page.goto(this.url(id, locale));
    }

    container() {
        return this.page.locator('.page_announcement');
    }

    article() {
        return this.container().locator('article.obj_announcement_full');
    }

    heading() {
        return this.article().locator('h1').first();
    }

    breadcrumb() {
        return this.container().locator('.cmp_breadcrumbs_announcement');
    }

    date() {
        return this.article().locator('.date');
    }

    image() {
        return this.article().locator('img');
    }

    description() {
        return this.article().locator('.description');
    }

    /** Every link of the page's container (the two crumbs, and nothing else). */
    links() {
        return this.container().locator('a');
    }
};

/** The home page's announcements block (`section.cmp_announcements`, Rule 11). */
exports.homeBlock = function homeBlock(page) {
    const section = page.locator('section.cmp_announcements');
    const articles = section.locator('article');
    return {
        section,
        heading: section.locator('h2').first(),
        anchor: section.locator('#homepageAnnouncements'),
        articles,
        /** The newest announcement as a full summary (the first article). */
        first: summaryParts(articles.first()),
        /** The further items (title links with their dates) under `div.more`. */
        more: section.locator('div.more article'),
        moreTitles: () => section.locator('div.more article a').allInnerTexts().then((items) => items.map((s) => s.trim())),
        moreDates: section.locator('div.more article .date'),
    };
};

/** The journal's home page in a page, in the given language ('' for the bare address). */
exports.gotoHome = async function gotoHome(page, contextPath, locale = '') {
    const response = await page.goto(`/index.php/${contextPath}${locale ? `/${locale}` : ''}`);
    await expect(page.locator('.pkp_structure_main')).toBeVisible({timeout: T});
    return response;
};

/** The bare "404 Not Found" page the app answers for a refused public address. */
exports.expectNotFound = async function expectNotFound(page, url) {
    const response = await page.goto(url);
    expect(response && response.status(), `${url} answers 404`).toBe(404);
    await expect(page.locator('h1')).toHaveText('404 Not Found');
    await expect(page.locator('#navigationPrimary')).toHaveCount(0);
};

/** The OJS feed block in the sidebar (`.block_announcement_feed`, Rule 18). */
exports.feedBlock = function feedBlock(page) {
    const block = page.locator('.block_announcement_feed');
    return {
        block,
        heading: block.locator('h2, .title').first(),
        links: block.locator('a'),
        /** The link whose logo image is described `alt` ("Atom logo", "RSS2 logo", "RSS1 logo"). */
        link: (alt) => block.locator('a').filter({has: page.locator(`img[alt="${alt}"]`)}),
    };
};

/** A feed's address (`gateway/plugin/AnnouncementFeedGatewayPlugin/{atom|rss2|rss}`). */
exports.feedUrl = function feedUrl(contextPath, type) {
    return `/index.php/${contextPath}/gateway/plugin/AnnouncementFeedGatewayPlugin/${type}`;
};

/**
 * Read a feed the way its link is followed (a plain GET; Chromium would
 * download the XML) and take it apart: the status, the content type, the
 * feed's title and its entries as `{title, link, date, description}`.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} url
 */
exports.readFeed = async function readFeed(request, url) {
    const response = await request.get(url, {failOnStatusCode: false, maxRedirects: 0});
    const body = await response.text();
    const entries = [...body.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((m) => {
        const xml = m[2];
        const atomLink = xml.match(/<link\s[^>]*rel="alternate"[^>]*href="([^"]+)"/);
        return {
            title: tagText(xml, 'title'),
            link: atomLink ? atomLink[1] : tagText(xml, 'link'),
            date: tagText(xml, 'published') || tagText(xml, 'updated') || tagText(xml, 'pubDate') || tagText(xml, 'dc:date'),
            description: tagText(xml, 'summary') || tagText(xml, 'content') || tagText(xml, 'description'),
        };
    });
    return {
        status: response.status(),
        contentType: response.headers()['content-type'] || '',
        body,
        title: tagText(body, 'title'),
        entries,
    };
};
