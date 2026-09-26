// @ts-check
/**
 * @file shared/playwright/pages/EmailsPages.js
 *
 * Page objects for U56 "Emails management"
 * (docs/specs/U56-emails-management.md), shared by the OJS, OMP and OPS
 * suites, and for the U34 decision suites, which set a template or the
 * "Notify All Authors" choice before their first step (the OJS and OMP
 * `DecisionSettingsPages.js` re-export both classes). App-neutral
 * (PRINCIPLES M2): the words the three apps share (one lib/pkp and
 * ui-library code path) are the locators; the email names, the choices'
 * values and the placeholders a test reads are passed in by the suite.
 *
 * Surfaces:
 * - WorkflowEmailsSettingsPage — Settings › Workflow › "Emails": the tab's
 *   panel, its radios by setting name and value, "Notify Anyone", the
 *   journal's "Signature" (a TinyMCE box), "Save" with its "Saved" status
 *   and error line, the "Add and edit templates" link, the page's other
 *   tabs.
 * - ManageEmailsPage — "Manage Emails": the headings, the search box with
 *   its "×", "Reset All" and its confirmation, the list's rows, the
 *   "Filters" panel (its blocks, buttons, marked state and "×"), an email's
 *   "Edit"; an email's window (the "Templates" rows with their "Default"
 *   badge and "Edit" / "Reset" / "Remove", "Add Template", the "Reset
 *   Template" and "Remove Template" confirmations); the "Edit Template"
 *   window (its boxes per language, the body editor, each field's message
 *   and language count, the language button, "Insert Content" and its
 *   rows, "Save" with "Saved" and the error line, the back arrow).
 *
 * DOM facts the locators rely on (U56 claim check, 2026-09-26, three apps;
 * `.reports/U56/screen-notes.md`, the kept scripts under
 * `shared/playwright/checks/U56/`; U34 ccK1–K4 for the first methods):
 * - the tab's panel is `#emails` (the tab `#emails-button`); its radios are
 *   `input[name=<setting>]`, "Notify Anyone" `input[name=copySubmissionAckAddress]`,
 *   the signature the TinyMCE editor `emailSetup-emailSignature-control`;
 *   the Save answers PUT `contexts/{id}` and shows `[role=status]` "Saved";
 * - the list is `.manageEmails__listPanel`, a row `.listPanel__item` with
 *   the name in `.listPanel__itemTitle` and the description in
 *   `.listPanel__itemSubtitle`; a row's "Edit" is named "Edit {name}" for
 *   screen readers; a filter is `.pkpFilter` with its button
 *   `.pkpFilter__label` (class `-isActive` when marked) and, when marked,
 *   the "×" named "Clear filter: {label}";
 * - an email that takes several templates answers GET `mailables/{KEY}`
 *   and opens a dialog named after the email; a one-template email answers
 *   GET `emailTemplates/{KEY}` and opens "Edit Template"; in the email's
 *   window a template row is `.listPanel__item` with the template's name in
 *   `.listPanel__itemSubtitle` and the badge `.pkpBadge`;
 * - "Edit Template" holds `input[name=name-{locale}]`,
 *   `input[name=subject-{locale}]` and the TinyMCE body
 *   `editEmailTemplate-body-control-{locale}`; its window closes itself
 *   about a second after a save (`templateSaved()`'s timer), so "Saved" is
 *   caught by a mutation watch armed before the click;
 * - a closed side window keeps the modal store's slot for 450 ms, and an
 *   opener pressed inside it opens nothing (patterns.md pitfall 4):
 *   `pastSideModalCloseWindow()` waits it out.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');

/** Select-all on the platform's key (TinyMCE ignores the other modifier). */
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactText = (s) => new RegExp(`^\\s*${escapeRegExp(s)}\\s*$`);

/** The id of the visible, initialized TinyMCE editor inside `scope`. */
async function visibleEditorId(page, scope) {
    const handle = await scope.elementHandle();
    const pick = (root) => {
        const t = /** @type {any} */ (window).tinymce;
        const editor = (t ? t.get() || [] : []).find((e) => {
            try {
                const c = e.getContainer();
                return !!(c && c.getClientRects().length) && e.initialized && (!root || root.contains(c));
            } catch {
                return false;
            }
        });
        return editor ? editor.id : null;
    };
    await page.waitForFunction(pick, handle, {timeout: 30_000});
    return page.evaluate(pick, handle);
}

/** Set an editor's HTML and flush it into the form. */
async function setEditorContent(page, id, html) {
    await page.evaluate(
        ([i, value]) => {
            const editor = /** @type {any} */ (window).tinymce.get(i);
            editor.setContent(value);
            editor.fire('change');
            editor.fire('input');
            editor.save();
        },
        [id, html]
    );
}

/** Wait until a TinyMCE editor exists and is initialized. */
async function waitEditor(page, id) {
    await page.waitForFunction(
        (i) => {
            const t = /** @type {any} */ (window).tinymce;
            return !!(t && t.get(i) && t.get(i).initialized);
        },
        id,
        {timeout: 30_000}
    );
}

/** A TinyMCE editor's HTML. */
function editorHtml(page, id) {
    return page.evaluate((i) => /** @type {any} */ (window).tinymce.get(i).getContent(), id);
}

/**
 * Whether a button's lettering is red: its computed colour's red channel
 * dominates (the "in red lettering" of the confirmations and "Reset All").
 */
async function isRedLettering(locator) {
    return locator.evaluate((el) => {
        const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g);
        if (!m) {
            return false;
        }
        const [r, g, b] = m.map(Number);
        return r > 120 && r > g + 60 && r > b + 60;
    });
}
exports.isRedLettering = isRedLettering;

/** Wait out the modal store's 450 ms close slot with a later page timer. */
async function pastSideModalCloseWindow(page) {
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
}

exports.WorkflowEmailsSettingsPage = class WorkflowEmailsSettingsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.pageHeading = page.locator('main h1').first();
        this.tabButton = page.locator('#emails-button');
        this.panel = page.locator('#emails');
        this.signatureId = 'emailSetup-emailSignature-control';
    }

    /** The Workflow Settings address, with the tab's hash. */
    url() {
        return this.contextUrl(this.contextPath, '/management/settings/workflow#emails');
    }

    /** Open Settings › Workflow on its "Emails" tab. */
    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/workflow'));
        await this.openTab();
    }

    /** Press the "Emails" tab of the page already open and wait for its form and signature editor. */
    async openTab() {
        await this.tabButton.click();
        await expect(this.panel.locator('input[name="submissionAcknowledgement"]').first()).toBeVisible({timeout: 30_000});
        await waitEditor(this.page, this.signatureId);
        await expect(this.panel.getByRole('button', {name: 'Insert Content'}).first()).toBeVisible({timeout: 30_000});
    }

    /** Another top tab of Settings › Workflow, by its label. */
    tab(name) {
        return this.page.getByRole('tab', {name, exact: true});
    }

    /** The panel's visible text, one trimmed non-empty line each. */
    async lines() {
        const text = await this.panel.innerText();
        return text
            .split('\n')
            .map((l) => l.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
    }

    radios(name) {
        return this.panel.locator(`input[name="${name}"]`);
    }

    /**
     * A radio by setting name and value attribute. "Do not send an email."
     * has no value attribute (its DOM value reads the browser's "on"), so it
     * is reached by `radioByLabel()`.
     */
    radio(name, value) {
        return this.panel.locator(`input[name="${name}"][value="${value}"]`);
    }

    /** The labels of a setting's radios, in order. */
    async radioLabels(name) {
        return this.radios(name).evaluateAll((inputs) =>
            inputs.map((i) => ((i.closest('label') || {}).textContent || '').replace(/\s+/g, ' ').trim())
        );
    }

    /** The checked value of a setting's radios, or null when none is checked. */
    async checkedValue(name) {
        return this.radios(name).evaluateAll((inputs) => {
            const on = inputs.find((i) => /** @type {HTMLInputElement} */ (i).checked);
            return on ? /** @type {HTMLInputElement} */ (on).value : null;
        });
    }

    async choose(name, value) {
        await this.radio(name, value).check();
    }

    /** A radio of the tab by its label ("Do not send an email."). */
    radioByLabel(label) {
        return this.panel.getByRole('radio', {name: label, exact: true});
    }

    notifyAnyoneBox() {
        return this.panel.locator('input[name="copySubmissionAckAddress"]');
    }

    /** A field's block (label, description, input, message) by its input's name. */
    field(name) {
        return this.panel.locator('.pkpFormField').filter({has: this.page.locator(`input[name="${name}"]`)});
    }

    /** A field's message under it. */
    fieldError(name) {
        return this.field(name).locator('.pkpFieldError');
    }

    saveButton() {
        return this.panel.getByRole('button', {name: 'Save', exact: true});
    }

    /** The form's footer line beside "Save" ("Saved", "Please correct one error."). */
    footer() {
        return this.panel.locator('.pkpFormPage__footer, .pkpForm__footer').last();
    }

    savedStatus() {
        return this.panel.locator('[role="status"]').filter({hasText: 'Saved'});
    }

    /** Press "Save" and wait for "Saved" beside it. */
    async save() {
        const answered = this.page.waitForResponse(
            (r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET',
            {timeout: 30_000}
        );
        await this.saveButton().click();
        expect((await answered).status()).toBe(200);
        await expect(this.savedStatus()).toBeVisible({timeout: 30_000});
    }

    /** Press "Save" and return the answer's status (a refusal is a 400). */
    async pressSave() {
        const answered = this.page.waitForResponse(
            (r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET',
            {timeout: 30_000}
        );
        await this.saveButton().click();
        return (await answered).status();
    }

    /** The signature's editable body (the TinyMCE iframe). */
    signatureBody() {
        return this.page.frameLocator(`#${this.signatureId}_ifr`).locator('body');
    }

    async signatureHtml() {
        await waitEditor(this.page, this.signatureId);
        return editorHtml(this.page, this.signatureId);
    }

    /** Replace the signature by typing through the editor. */
    async typeSignature(text) {
        await waitEditor(this.page, this.signatureId);
        const body = this.signatureBody();
        await body.click();
        await this.page.keyboard.press(SELECT_ALL);
        await this.page.keyboard.press('Delete');
        await body.pressSequentially(text);
    }

    manageEmailsLink() {
        return this.panel.getByRole('link', {name: 'Add and edit templates', exact: true});
    }

    /** Press "Add and edit templates" and wait for the "Manage Emails" list. */
    async openManageEmails() {
        await this.manageEmailsLink().click();
        const manage = new exports.ManageEmailsPage(this.page, this.contextPath);
        await manage.waitForList();
        return manage;
    }

    notifyAllAuthorsRadios() {
        return this.page.locator('input[name="notifyAllAuthors"]');
    }

    /** Choose "true" (every author) or "false" (assigned authors only) and save the tab (U34). */
    async setNotifyAllAuthors(value) {
        await this.page.locator(`input[name="notifyAllAuthors"][value="${value}"]`).check();
        const panel = this.page.getByRole('tabpanel', {name: 'Emails', exact: true});
        await panel.getByRole('button', {name: 'Save', exact: true}).first().click();
        await expect(panel.locator('[role="status"]').filter({hasText: 'Saved'})).toBeVisible({timeout: 30_000});
    }
};

exports.ManageEmailsPage = class ManageEmailsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.list = page.locator('.manageEmails__listPanel');
        this.sidebar = this.list.locator('.listPanel__sidebar');
    }

    url() {
        return this.contextUrl(this.contextPath, '/management/settings/manageEmails');
    }

    async goto() {
        await this.page.goto(this.url());
        await this.waitForList();
    }

    async waitForList() {
        await expect(this.list.locator('.listPanel__item').first()).toBeVisible({timeout: 30_000});
    }

    async reload() {
        await this.page.reload();
        await this.waitForList();
    }

    pageHeading() {
        return this.page.getByRole('heading', {name: 'Manage Emails', exact: true, level: 1});
    }

    listHeading() {
        return this.page.getByRole('heading', {name: 'Emails', exact: true, level: 1});
    }

    // ── The list ─────────────────────────────────────────────────────────

    rows() {
        return this.list.locator('.listPanel__item');
    }

    rowTitles() {
        return this.list.locator('.listPanel__item .listPanel__itemTitle');
    }

    async rowNames() {
        return (await this.rowTitles().allInnerTexts()).map((t) => t.trim());
    }

    /** The rows as {name, description, bold, buttons}. */
    async rowsRead() {
        return this.rows().evaluateAll((items) =>
            items.map((i) => {
                const t = i.querySelector('.listPanel__itemTitle');
                const s = i.querySelector('.listPanel__itemSubtitle');
                return {
                    name: t ? /** @type {HTMLElement} */ (t).innerText.trim() : null,
                    description: s ? /** @type {HTMLElement} */ (s).innerText.trim() : null,
                    bold: t ? Number(getComputedStyle(t).fontWeight) >= 600 : false,
                    buttons: [...i.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent.replace(/\s+/g, ' ').trim()),
                };
            })
        );
    }

    /** The row whose name is exactly `name`. */
    mailableRow(name) {
        return this.rows().filter({has: this.page.locator('.listPanel__itemTitle', {hasText: exactText(name)})});
    }

    noItems() {
        return this.list.getByText('No items found.', {exact: true});
    }

    /** An email's "Edit" in the list. */
    editButton(name) {
        return this.list.getByRole('button', {name: `Edit ${name}`, exact: true});
    }

    // ── Search ───────────────────────────────────────────────────────────

    searchBox() {
        return this.list.locator('input[type="search"]');
    }

    clearSearchButton() {
        return this.list.getByRole('button', {name: /Clear search/});
    }

    /** Type into the search box without committing it. */
    async typeSearch(text) {
        await this.searchBox().fill(text);
    }

    /** Type into the search box and press Enter. */
    async search(text) {
        await this.searchBox().fill(text);
        await this.searchBox().press('Enter');
    }

    resetAllButton() {
        return this.list.getByRole('button', {name: 'Reset All', exact: true});
    }

    // ── Filters ──────────────────────────────────────────────────────────

    filtersHeading() {
        return this.sidebar.getByRole('heading', {name: 'Filters'});
    }

    /**
     * The "Filters" panel as blocks, in order: `{heading, buttons}`, the
     * first block unheaded (null) when its buttons come straight after the
     * panel's own "Filters" heading.
     */
    async filterBlocks() {
        return this.sidebar.evaluate((root) => {
            const blocks = [];
            let current = null;
            const walk = (el) => {
                for (const c of el.children) {
                    if (/^H[1-6]$/.test(c.tagName)) {
                        const text = /** @type {HTMLElement} */ (c).innerText.trim();
                        if (text === 'Filters') {
                            current = {heading: null, buttons: []};
                        } else {
                            current = {heading: text, buttons: []};
                        }
                        blocks.push(current);
                    } else if (c.classList.contains('pkpFilter')) {
                        const l = c.querySelector('.pkpFilter__label');
                        if (!current) {
                            current = {heading: null, buttons: []};
                            blocks.push(current);
                        }
                        current.buttons.push(/** @type {HTMLElement} */ (l).innerText.trim());
                    } else {
                        walk(c);
                    }
                }
            };
            walk(root);
            return blocks.filter((b) => b.buttons.length);
        });
    }

    /** A filter button by label; `nth` picks among equal labels ("Reader" is in "Sent From" and "Sent To"). */
    filterButton(label, nth = 0) {
        return this.sidebar.locator('.pkpFilter__label').filter({hasText: exactText(label)}).nth(nth);
    }

    /** The "×" beside a marked filter button. */
    filterRemove(label) {
        return this.sidebar.getByRole('button', {name: `Clear filter: ${label}`, exact: true});
    }

    /** The labels of the marked filter buttons. */
    markedFilters() {
        return this.sidebar.locator('.pkpFilter__label.-isActive');
    }

    // ── Opening an email ─────────────────────────────────────────────────

    /** The email's window (several templates), a dialog named after it. */
    mailableWindow(name) {
        return this.page.getByRole('dialog', {name, exact: true});
    }

    emailWindow(name) {
        return this.mailableWindow(name);
    }

    /**
     * Press an email's "Edit" (searching it first unless `search` is
     * false) and wait for the window it opens: `kind` "several" (the
     * email's window) or "one" ("Edit Template" straight away, its body
     * editor initialized). Returns `{kind, window}`.
     */
    async openEmail(name, {search = true} = {}) {
        if (search) {
            await this.search(name);
        }
        const button = this.editButton(name);
        await expect(button).toBeVisible({timeout: 30_000});
        const answered = this.page.waitForResponse(
            (r) => /\/api\/v1\/(mailables|emailTemplates)\/[^/?]+/.test(r.url()) && r.request().method() === 'GET',
            {timeout: 30_000}
        );
        await button.click();
        const response = await answered;
        expect(response.status(), `GET for "${name}"`).toBe(200);
        if (/\/mailables\//.test(response.url())) {
            const win = this.mailableWindow(name);
            await expect(win.getByRole('heading', {name: 'Templates', exact: true})).toBeVisible({timeout: 30_000});
            return {kind: 'several', window: win};
        }
        const form = this.templateWindow();
        await expect(form.locator('input[name^="subject"]').first()).toBeVisible({timeout: 30_000});
        await waitEditor(this.page, this.bodyId());
        return {kind: 'one', window: form};
    }

    /** Search the mailable and open its window with the row's "Edit" (U34). */
    async openMailable(name) {
        const {window} = await this.openEmail(name);
        await expect(window.getByRole('button', {name: 'Add Template', exact: true})).toBeVisible({timeout: 30_000});
        return window;
    }

    // ── The email's window ───────────────────────────────────────────────

    /** The window's paragraphs (the description and the explanation). */
    async windowParagraphs(win) {
        return (await win.locator('p').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    }

    templatesHeading(win) {
        return win.getByRole('heading', {name: 'Templates', exact: true});
    }

    addTemplateButton(win) {
        return win.getByRole('button', {name: 'Add Template', exact: true});
    }

    templateRows(win) {
        return win.locator('.listPanel__item');
    }

    /** A template row by the template's name. */
    templateRow(win, name) {
        return this.templateRows(win).filter({has: this.page.locator('.listPanel__itemSubtitle', {hasText: exactText(name)})});
    }

    /** The template rows as {name, badges, buttons}, in order. */
    async templateRowsRead(win) {
        return this.templateRows(win).evaluateAll((items) =>
            items.map((i) => ({
                name: ((i.querySelector('.listPanel__itemSubtitle') || {}).textContent || '').trim(),
                badges: [...i.querySelectorAll('.pkpBadge')].map((b) => b.textContent.trim()),
                buttons: [...i.querySelectorAll('button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
            }))
        );
    }

    rowButton(row, label) {
        return row.getByRole('button', {name: label, exact: true});
    }

    /** A template row's "Edit": "Edit Template" filled, its body editor initialized. */
    async openTemplate(win, rowName) {
        await this.pastSideModalCloseWindow();
        await this.rowButton(this.templateRow(win, rowName), 'Edit').click();
        const form = this.templateWindow();
        await expect(form.locator('input[name^="subject"]').first()).toBeVisible({timeout: 30_000});
        await waitEditor(this.page, this.bodyId());
        return form;
    }

    /** "Add Template": the empty template window, its body editor initialized. */
    async openAddTemplate(win) {
        await this.pastSideModalCloseWindow();
        await this.addTemplateButton(win).click();
        const form = this.templateWindow();
        await expect(form.locator('input[name^="name"]').first()).toBeVisible({timeout: 30_000});
        await waitEditor(this.page, this.bodyId());
        return form;
    }

    /** A confirmation window by its title ("Reset Template", "Remove Template", "Reset All"). */
    confirmation(title) {
        return this.page.getByRole('dialog', {name: title, exact: true}).last();
    }

    /** The confirmation's button of that label. */
    confirmationButton(title, label) {
        return this.confirmation(title).getByRole('button', {name: label, exact: true});
    }

    /** A window's back arrow (read "Close" by a screen reader). */
    closeButton(win) {
        return win.getByRole('button', {name: 'Close', exact: true}).first();
    }

    /** Press a window's back arrow and wait for it to go. */
    async closeWindow(win) {
        await this.closeButton(win).click();
        await expect(win).toBeHidden({timeout: 30_000});
        await this.pastSideModalCloseWindow();
    }

    /** Close the mailable's window (U34). */
    async closeMailable(win) {
        await this.closeWindow(win);
    }

    async pastSideModalCloseWindow() {
        await pastSideModalCloseWindow(this.page);
    }

    // ── "Edit Template" ──────────────────────────────────────────────────

    /** The template window ("Edit Template"; the title "Add Template" too, should the window be retitled). */
    templateWindow() {
        return this.page.getByRole('dialog', {name: /^(Edit|Add) Template$/}).last();
    }

    nameBox(locale = 'en') {
        return this.templateWindow().locator(`input[name="name-${locale}"]`);
    }

    subjectBox(locale = 'en') {
        return this.templateWindow().locator(`input[name="subject-${locale}"]`);
    }

    bodyId(locale = 'en') {
        return `editEmailTemplate-body-control-${locale}`;
    }

    bodyFrame(locale = 'en') {
        return this.page.frameLocator(`#${this.bodyId(locale)}_ifr`).locator('body');
    }

    async bodyHtml(locale = 'en') {
        await waitEditor(this.page, this.bodyId(locale));
        return editorHtml(this.page, this.bodyId(locale));
    }

    /** Type into the body through the editor; `keep` types after what is there. */
    async typeBody(text, {locale = 'en', keep = false} = {}) {
        await waitEditor(this.page, this.bodyId(locale));
        const body = this.bodyFrame(locale);
        await body.click();
        if (keep) {
            await this.page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
        } else {
            await this.page.keyboard.press(SELECT_ALL);
            await this.page.keyboard.press('Delete');
        }
        if (text) {
            await body.pressSequentially(text);
        }
    }

    /** Empty the body through the editor. */
    async clearBody(locale = 'en') {
        await this.typeBody('', {locale});
    }

    /**
     * A field's block in "Edit Template" by field ("name", "subject",
     * "body") and language: its label, the box, its message and its
     * language count.
     */
    templateField(field, locale = 'en') {
        const inner = field === 'body' ? `#${this.bodyId(locale)}` : `input[name="${field}-${locale}"]`;
        return this.templateWindow().locator('.pkpFormField').filter({has: this.page.locator(inner)}).last();
    }

    /** The message under a field. */
    templateFieldError(field, locale = 'en') {
        return this.templateField(field, locale).locator('.pkpFieldError');
    }

    /**
     * A field's language count ("2/2 languages completed"): the progress
     * mark beside the primary-language box, read by a screen reader.
     */
    languageCount(field, locale = 'en') {
        return this.templateWindow().locator(`#editEmailTemplate-${field}-multilingualProgress-${locale}`);
    }

    /** The window's language button ("French"). */
    languageButton(label) {
        return this.templateWindow().getByRole('button', {name: label, exact: true});
    }

    templateSaveButton() {
        return this.templateWindow().getByRole('button', {name: 'Save', exact: true});
    }

    /** The footer line beside "Save" ("Please correct 3 errors.", "Saved"). */
    templateFooter() {
        return this.templateWindow().locator('.pkpFormPage__footer, .pkpForm__footer').last();
    }

    jumpToErrorButton() {
        return this.templateWindow().getByRole('button', {name: 'Jump to next error'});
    }

    /**
     * Press "Save" in the template window and wait for the API's answer.
     * Returns `{status, sawSaved}`; `sawSaved` is whether "Saved" showed in
     * the window, caught by a mutation watch armed before the click (the
     * window closes itself about a second later).
     */
    async pressTemplateSave() {
        const form = this.templateWindow();
        const handle = await form.elementHandle();
        await this.page.evaluate((root) => {
            const w = /** @type {any} */ (window);
            w.__u56SawSaved = false;
            const check = () => {
                if ([...root.querySelectorAll('[role="status"]')].some((e) => /Saved/.test(e.textContent || ''))) {
                    w.__u56SawSaved = true;
                }
            };
            if (w.__u56Observer) {
                w.__u56Observer.disconnect();
            }
            w.__u56Observer = new MutationObserver(check);
            w.__u56Observer.observe(root, {subtree: true, childList: true, characterData: true});
        }, handle);
        const answered = this.page.waitForResponse(
            (r) => /\/api\/v1\/emailTemplates/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.templateSaveButton().click();
        const response = await answered;
        return {
            status: response.status(),
            sawSaved: async () => {
                await this.page
                    .waitForFunction(() => /** @type {any} */ (window).__u56SawSaved === true, null, {timeout: 5_000})
                    .catch(() => {});
                return this.page.evaluate(() => /** @type {any} */ (window).__u56SawSaved === true);
            },
        };
    }

    /**
     * "Save" a template that the app stores: the answer is 200, "Saved"
     * shows, and the window closes itself (asserted, as the spec says).
     */
    async saveTemplate() {
        const form = this.templateWindow();
        const {status, sawSaved} = await this.pressTemplateSave();
        expect(status, 'the template save answers 200').toBe(200);
        expect(await sawSaved(), '"Saved" shows in the window').toBe(true);
        await expect(form).toBeHidden({timeout: 30_000});
        await this.pastSideModalCloseWindow();
    }

    /**
     * Press the template window's "Save" and wait for the API's answer and
     * the window to go (U34). The window closes itself about a second
     * after the save; "Close" is pressed only when it is still open.
     */
    async save(form) {
        const saved = this.page.waitForResponse(
            (r) => r.url().includes('/emailTemplates') && r.request().method() === 'POST' && r.ok(),
            {timeout: 30_000}
        );
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        const closedItself = await form
            .waitFor({state: 'hidden', timeout: 5_000})
            .then(() => true)
            .catch(() => false);
        if (!closedItself) {
            await form.getByRole('button', {name: 'Close', exact: true}).first().click();
            await expect(form).toBeHidden({timeout: 30_000});
        }
    }

    /**
     * The default template's "Edit": put `prefixHtml` in front of its body
     * and save (U34).
     */
    async prefixDefaultTemplateBody(win, name, prefixHtml) {
        await win.getByRole('listitem').filter({hasText: name}).getByRole('button', {name: 'Edit', exact: true}).click();
        const form = this.templateWindow();
        await expect(form.locator('input[name^="subject"]')).toBeVisible({timeout: 30_000});
        const id = await visibleEditorId(this.page, form);
        const current = await editorHtml(this.page, id);
        await setEditorContent(this.page, id, `${prefixHtml}${current}`);
        await this.save(form);
    }

    /** "Add Template": a further template for the mailable, saved (U34). */
    async addTemplate(win, {name, subject, bodyHtml}) {
        await win.getByRole('button', {name: 'Add Template', exact: true}).click();
        const form = this.templateWindow();
        await expect(form.locator('input[name^="name"]')).toBeVisible({timeout: 30_000});
        await form.locator('input[name^="name"]').first().fill(name);
        await form.locator('input[name^="subject"]').first().fill(subject);
        const id = await visibleEditorId(this.page, form);
        await setEditorContent(this.page, id, bodyHtml);
        await this.save(form);
        await expect(win.getByRole('listitem').filter({hasText: name})).toBeVisible({timeout: 30_000});
    }

    // ── "Insert Content" ─────────────────────────────────────────────────

    /** Press the body's "Insert Content" and return its window. */
    async openInsertContent(locale = 'en') {
        await this.templateField('body', locale).getByRole('button', {name: 'Insert Content', exact: true}).click();
        const win = this.page.getByRole('dialog', {name: 'Insert Content'}).last();
        await expect(win.locator('li').first()).toBeVisible({timeout: 30_000});
        return win;
    }

    /** The "Insert Content" rows as {value, description, insert}. */
    async insertContentRows(win) {
        return win.locator('li').evaluateAll((items) =>
            items.map((li) => ({
                value: ((li.querySelector('.insertContent__item__value') || {}).textContent || '').trim(),
                description: ((li.querySelector('.insertContent__item__description') || {}).textContent || '').trim(),
                insert: [...li.querySelectorAll('button')].map((b) => b.textContent.trim()).includes('Insert'),
            }))
        );
    }

    /** Press "Insert" on a placeholder's row. */
    async insertPlaceholder(win, value) {
        await win
            .locator('li')
            .filter({has: this.page.locator('.insertContent__item__value', {hasText: exactText(value)})})
            .getByRole('button', {name: 'Insert', exact: true})
            .click();
    }

    // ── "Reset All" ──────────────────────────────────────────────────────

    /** Confirm "Reset All" in its confirmation and wait for the page's reload. */
    async confirmResetAll() {
        const reloaded = this.page.waitForEvent('load', {timeout: 30_000});
        await this.confirmationButton('Reset All', 'Reset All').click();
        await reloaded;
        await this.waitForList();
    }
};
