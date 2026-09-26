// @ts-check
/**
 * @file shared/playwright/pages/NotifyUsersPages.js
 *
 * Page objects for U55 "Notify users (bulk email)" (docs/specs/U55-notify-users.md),
 * shared by the OJS, OMP and OPS suites. App-neutral (PRINCIPLES M2): every
 * on-screen word that differs per app (role names, the wizard's first tab
 * "Journal Settings" / "Setup" / "Server Settings", the context's name on
 * the site's "Bulk Emails" list) is passed in by the suite; the locators
 * are the markup the three apps share (one lib/pkp and ui-library code
 * path, the spec's footnotes).
 *
 * Surfaces:
 * - NotifyTab — Settings › Users & Roles › "Notify": the "Roles" boxes,
 *   "Subject", the "Email" rich-text box and its toolbar, "Copy", the
 *   form's footer (its send button, "Saved", the error line with "Jump to
 *   next error"), each field's message, the "queued" line with "Send
 *   another email", and the notices at the top right. The page heading and
 *   tab row come from ContextIdentityPages' `SettingsPages`.
 * - SendEmailWindow — the "Send Email" confirmation window.
 * - RestrictBulkEmailsTab — the Settings wizard's first tab › "Restrict
 *   Bulk Emails": "Disable Roles" with its boxes and "Save", or the
 *   sentence shown while the context may not send bulk email, and the
 *   "Admin > Site Settings" links. The wizard is reached through U53's
 *   `HostedContextsPage` (UsersManagementPages.js).
 * - SiteBulkEmailsTab — Administration › Site Settings › "Site Setup" ›
 *   "Bulk Emails": a context's box and "Save". Its "Save" posts the list as
 *   the page loaded it (scenarios.md, `bulkEmails`), so only a test that
 *   runs alone (`@solo`) presses it.
 *
 * DOM facts the locators rely on (U55 claim check, 2026-09-26, three apps;
 * `.reports/U55/screen-notes.md`):
 * - the tab's panel is `#notify`; the role boxes are `input[name="userGroupIds"]`
 *   labelled with the role's name, "Copy" is `input[name="copy"]`, the
 *   "Email" box is a TinyMCE editor whose id contains `notifyUsers-body`;
 * - the form's send button is the last button of its footer
 *   (`.pkpFormPage__footer`); it is found by place, not by its label,
 *   because the label is register A1's;
 * - the send posts `{context}/api/v1/_email` (200 `{totalBulkJobs}`, 400
 *   field errors, 403 when the context may not send);
 * - the notices at the top right live in `.app__notifications` and expire
 *   after about five seconds;
 * - the confirmation is a Vue dialog; the modal slot is kept ~450 ms after
 *   it closes, so a "Save" pressed within it opens nothing
 *   (`afterWindowClose()`, patterns.md pitfall 4);
 * - the wizard keeps its last top tab in the address, so its first tab is
 *   pressed (`#setup-button`) before the side tab; the side tab's panel is
 *   `#restrictBulkEmails`, its boxes `input[name="disableBulkEmailUserGroups"]`;
 * - on Site Settings the "Site Setup" tab is `#setup-button` (the first of
 *   two with that id) and its side tab `#bulkEmails-button`; the boxes are
 *   `input[name="enableBulkEmails"]`, labelled with the context's name.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {SettingsPages} = require('./ContextIdentityPages.js');
const {afterWindowClose} = require('./UsersManagementPages.js');

const T = 30_000;

/** Select-all on the platform's key (TinyMCE ignores the other modifier). */
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

/** Whitespace-collapsed text. */
function flat(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

/** Is this response the "Notify" send? */
function isSend(response) {
    return /\/api\/v1\/_email(\?|$)/.test(response.url()) && response.request().method() === 'POST';
}
exports.isSend = isSend;

// ---------------------------------------------------------------------------
// Settings › Users & Roles › "Notify"
// ---------------------------------------------------------------------------

exports.NotifyTab = class NotifyTab extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        /** Heading and tab row of the Settings page. */
        this.settings = new SettingsPages(page, contextPath);
        this.tab = page.getByRole('tab', {name: 'Notify', exact: true});
        this.panel = page.locator('#notify');
        this.form = this.panel.locator('form').first();
        this.roleBoxes = this.panel.locator('input[name="userGroupIds"]');
        this.rolesField = this.panel.locator('fieldset').filter({has: page.locator('input[name="userGroupIds"]')});
        this.subject = this.panel.locator('input[name="subject"]');
        this.subjectField = this.fieldAround(this.subject);
        this.bodyField = this.panel
            .locator('.pkpFormField')
            .filter({has: page.locator('textarea[id*="notifyUsers-body"]')})
            .last();
        this.bodyFrame = this.bodyField.locator('iframe').first().contentFrame().locator('body');
        this.copyField = this.panel.locator('fieldset').filter({has: page.locator('input[name="copy"]')});
        this.copyBox = this.panel.locator('input[name="copy"]');
        this.footer = this.panel.locator('.pkpFormPage__footer');
        /** The form's send button, by place (its label is register A1's). */
        this.submitButton = this.footer.getByRole('button').last();
        this.savedStatus = this.footer.locator('.pkpFormPage__status', {hasText: 'Saved'});
        this.errorLine = this.footer.locator('.pkpFormErrors');
        this.jumpButton = this.errorLine.getByRole('button', {name: 'Jump to next error', exact: true});
        this.queuedLine = this.panel.getByRole('alert').filter({hasText: 'successfully queued'});
        this.sendAnotherButton = this.panel.getByRole('button', {name: 'Send another email', exact: true});
        this.notices = page.locator('.app__notifications');
    }

    /** The field wrapper (`.pkpFormField`) around a control. */
    fieldAround(control) {
        return control.locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " pkpFormField ")][1]'
        );
    }

    /** The Users & Roles address, optionally with a tab hash ("#notify"). */
    url(hash = '') {
        return this.contextUrl(this.contextPath, `/management/settings/access${hash}`);
    }

    /** Open Settings › Users & Roles (on its first tab) and wait for the tab row. */
    async gotoPage() {
        await this.page.goto(this.url());
        await expect(this.settings.topTabs.first()).toBeVisible({timeout: T});
    }

    /** Open Settings › Users & Roles and press "Notify"; the form ready. */
    async goto() {
        await this.gotoPage();
        await this.open();
    }

    /**
     * Press the "Notify" tab and wait for the form, and for the address to
     * carry `#notify`: it gains the hash a moment after the tab is selected,
     * so an address read at once can lack it (the U55 OPS author).
     */
    async open() {
        await expect(this.tab).toBeVisible({timeout: T});
        await this.tab.click();
        await expect(this.tab).toHaveAttribute('aria-selected', 'true');
        await expect(this.page).toHaveURL(/#notify$/, {timeout: T});
        await this.ready();
    }

    /** Wait until the form shows with its "Email" editor initialized. */
    async ready() {
        await expect(this.submitButton).toBeVisible({timeout: T});
        await this.page.waitForFunction(
            () =>
                ((window.tinymce && window.tinymce.get()) || []).some(
                    (e) => /notifyUsers-body/.test(e.id) && e.initialized
                ),
            undefined,
            {timeout: T}
        );
    }

    /** A role's box by its whole name. */
    roleBox(name) {
        return this.rolesField.getByRole('checkbox', {name, exact: true});
    }

    /** The role boxes' labels, top to bottom. */
    async roleLabels() {
        await expect(this.roleBoxes.first()).toBeAttached({timeout: T});
        return this.roleBoxes.evaluateAll((boxes) =>
            boxes.map((b) => ((b.closest('label') || {}).innerText || '').replace(/\s+/g, ' ').trim())
        );
    }

    /** The labels of the ticked role boxes. */
    async checkedRoles() {
        return this.roleBoxes.evaluateAll((boxes) =>
            boxes
                .filter((b) => b.checked)
                .map((b) => ((b.closest('label') || {}).innerText || '').replace(/\s+/g, ' ').trim())
        );
    }

    /** A field's legend or label ("Roles", "Subject", "Email", "Copy"). */
    fieldLabel(field) {
        return field.locator('legend, label.pkpFormFieldLabel').first();
    }

    /** A field's description line. */
    fieldDescription(field) {
        return field.locator('.pkpFormField__description').first();
    }

    /** The message under a field (`.pkpFieldError`). */
    fieldError(field) {
        return field.locator('.pkpFieldError');
    }

    /** The "Email" box's content as the editor holds it (HTML). */
    async bodyContent() {
        return this.page.evaluate(() => {
            const ed = ((window.tinymce && window.tinymce.get()) || []).find((e) => /notifyUsers-body/.test(e.id));
            return ed ? ed.getContent() : null;
        });
    }

    /** The "Email" box's toolbar buttons' names, left to right. */
    async toolbarButtons() {
        const buttons = this.bodyField.locator('.tox-toolbar button, .tox-toolbar__group button');
        await expect(buttons.first()).toBeVisible({timeout: T});
        const names = await buttons.evaluateAll((els) =>
            els.map((b) => (b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText || '').trim())
        );
        return [...new Set(names)];
    }

    /** Type into the "Email" box (after anything it holds). */
    async typeBody(text) {
        await this.bodyFrame.click();
        await this.bodyFrame.pressSequentially(text);
        await expect.poll(async () => (await this.bodyContent()) || '', {timeout: T}).toContain(text);
    }

    /** Empty the "Email" box. */
    async clearBody() {
        await this.bodyFrame.click();
        await this.page.keyboard.press(SELECT_ALL);
        await this.page.keyboard.press('Delete');
        await expect
            .poll(async () => ((await this.bodyContent()) || '').replace(/<[^>]+>|&nbsp;|\s/g, ''), {timeout: T})
            .toBe('');
    }

    /** Tick roles, type "Subject" and "Email", tick "Copy". */
    async fill({roles = [], subject, body, copy = false}) {
        for (const role of roles) {
            await this.roleBox(role).check();
        }
        if (subject !== undefined) {
            await this.subject.fill(subject);
        }
        if (body !== undefined) {
            await this.typeBody(body);
        }
        if (copy) {
            await this.copyBox.check();
        }
    }

    /** Press the form's send button ("Save", A1) and return the open window. */
    async pressSubmit() {
        await this.submitButton.click();
        const window = new SendEmailWindow(this.page);
        await window.expectOpen();
        return window;
    }

    /**
     * Press the form's button, then "Send Email" in the window; returns the
     * send's response.
     */
    async send() {
        const window = await this.pressSubmit();
        return window.sendAndWait();
    }

    /** A notice at the top right by its text. */
    notice(text) {
        return this.notices.getByText(text).first();
    }

    /** Press "Send another email" and wait for the reloaded page's form. */
    async sendAnother() {
        await Promise.all([
            this.page.waitForEvent('load', {timeout: T}),
            this.sendAnotherButton.click(),
        ]);
        await expect(this.tab).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await this.ready();
    }
};

// ---------------------------------------------------------------------------
// The "Send Email" window
// ---------------------------------------------------------------------------

class SendEmailWindow extends BasePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        super(page);
        this.dialog = page.getByRole('dialog').filter({hasText: 'You are about to send an email to'}).last();
        this.title = this.dialog.getByRole('heading').first();
        this.sendButton = this.dialog.getByRole('button', {name: 'Send Email', exact: true});
        this.cancelButton = this.dialog.getByRole('button', {name: 'Cancel', exact: true});
    }

    async expectOpen() {
        await expect(this.sendButton).toBeVisible({timeout: T});
    }

    async expectClosed() {
        await expect(this.dialog).toHaveCount(0, {timeout: T});
    }

    /** The window's message line, whitespace-collapsed. */
    async message() {
        const text = await this.dialog.locator('p, [class*="message"]').filter({hasText: 'You are about to send'}).last().innerText();
        return flat(text);
    }

    /** The window's buttons, in order. */
    async buttonLabels() {
        return (await this.dialog.getByRole('button').allInnerTexts()).map(flat).filter(Boolean);
    }

    /** "Send Email": waits for the send's answer and the window's close; returns the response. */
    async sendAndWait() {
        const answered = this.page.waitForResponse(isSend, {timeout: T});
        await this.sendButton.click();
        const response = await answered;
        await this.expectClosed();
        await afterWindowClose(this.page);
        return response;
    }

    /** "Cancel": the window closes; the modal slot waited out. */
    async cancel() {
        await this.cancelButton.click();
        await this.expectClosed();
        await afterWindowClose(this.page);
    }
}
exports.SendEmailWindow = SendEmailWindow;

// ---------------------------------------------------------------------------
// The Settings wizard › first tab › "Restrict Bulk Emails"
// ---------------------------------------------------------------------------

exports.RestrictBulkEmailsTab = class RestrictBulkEmailsTab extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {{firstTab: string}} labels the wizard's first tab: "Journal Settings" / "Setup" / "Server Settings"
     */
    constructor(page, {firstTab}) {
        super(page);
        this.firstTabLabel = firstTab;
        this.firstTab = page.locator('#setup-button').first();
        this.sideTab = page.getByRole('tab', {name: 'Restrict Bulk Emails', exact: true}).first();
        this.panel = page.locator('[id="restrictBulkEmails"]').first();
        this.boxes = this.panel.locator('input[name="disableBulkEmailUserGroups"]');
        this.field = this.panel.locator('fieldset').filter({has: page.locator('input[name="disableBulkEmailUserGroups"]')});
        this.saveButton = this.panel.getByRole('button', {name: 'Save', exact: true});
        this.savedStatus = this.panel.locator('.pkpFormPage__status', {hasText: 'Saved'});
        this.siteSettingsLinks = this.panel.getByRole('link', {name: 'Admin > Site Settings', exact: true});
    }

    /** On the wizard: press its first tab, then "Restrict Bulk Emails". */
    async open() {
        await expect(this.firstTab).toBeVisible({timeout: T});
        await expect(this.firstTab).toHaveText(new RegExp(`^\\s*${this.firstTabLabel}\\s*$`));
        await this.firstTab.click();
        await expect(this.sideTab).toBeVisible({timeout: T});
        await this.sideTab.click();
        await expect(this.sideTab).toHaveAttribute('aria-selected', 'true');
        await expect(this.panel).toBeVisible({timeout: T});
    }

    /** Reload the wizard and open the side tab again. */
    async reload() {
        await this.page.reload();
        await this.open();
    }

    /** A role's box by its whole name. */
    box(name) {
        return this.field.getByRole('checkbox', {name, exact: true});
    }

    /** The boxes' labels, top to bottom. */
    async boxLabels() {
        await expect(this.boxes.first()).toBeAttached({timeout: T});
        return this.boxes.evaluateAll((boxes) =>
            boxes.map((b) => ((b.closest('label') || {}).innerText || '').replace(/\s+/g, ' ').trim())
        );
    }

    /** The labels of the ticked boxes. */
    async checkedLabels() {
        return this.boxes.evaluateAll((boxes) =>
            boxes
                .filter((b) => b.checked)
                .map((b) => ((b.closest('label') || {}).innerText || '').replace(/\s+/g, ' ').trim())
        );
    }

    /** "Disable Roles"' legend. */
    legend() {
        return this.field.locator('legend').first();
    }

    /** "Disable Roles"' description, whitespace-collapsed. */
    async description() {
        return flat(await this.field.locator('.pkpFormField__description').first().innerText());
    }

    /** "Save": waits for the context save's answer and "Saved". */
    async save() {
        const answered = this.page.waitForResponse(
            (r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.saveButton.click();
        const response = await answered;
        expect(response.status(), 'the "Disable Roles" save answers 200').toBe(200);
        await expect(this.savedStatus).toBeVisible({timeout: T});
        return response;
    }

    /** The panel's whole text, whitespace-collapsed. */
    async text() {
        return flat(await this.panel.innerText());
    }
};

// ---------------------------------------------------------------------------
// Administration › Site Settings › "Site Setup" › "Bulk Emails"
// ---------------------------------------------------------------------------

exports.SiteBulkEmailsTab = class SiteBulkEmailsTab extends BasePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        super(page);
        this.setupTab = page.locator('#setup-button').first();
        this.sideTab = page.locator('#bulkEmails-button').first();
        this.panel = page
            .locator('[role="tabpanel"]:visible')
            .filter({has: page.locator('input[name="enableBulkEmails"]')})
            .last();
        this.boxes = this.panel.locator('input[name="enableBulkEmails"]');
        this.saveButton = this.panel.getByRole('button', {name: 'Save', exact: true});
        this.savedStatus = this.panel.locator('.pkpFormPage__status', {hasText: 'Saved'});
    }

    /** Administration › Site Settings, then "Site Setup" › "Bulk Emails". */
    async goto() {
        await this.page.goto(this.siteUrl('/admin/settings'));
        await expect(this.setupTab).toBeVisible({timeout: T});
        await this.setupTab.click();
        await this.sideTab.click();
        await this.expectOpen();
    }

    /** The "Bulk Emails" side tab is the one showing, with its boxes. */
    async expectOpen() {
        await expect(this.sideTab).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await expect(this.boxes.first()).toBeVisible({timeout: T});
    }

    /** A context's box by the context's name. */
    box(contextName) {
        return this.panel.getByRole('checkbox', {name: contextName, exact: true});
    }

    /** "Save": waits for the site save's answer and "Saved". */
    async save() {
        const answered = this.page.waitForResponse(
            (r) => /\/api\/v1\/site(\?|$)/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.saveButton.click();
        const response = await answered;
        expect(response.status(), 'the "Bulk Emails" save answers 200').toBe(200);
        await expect(this.savedStatus).toBeVisible({timeout: T});
        return response;
    }
};
