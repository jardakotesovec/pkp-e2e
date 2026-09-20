// @ts-check
/**
 * @file playwright/pages/DecisionSettingsPages.js
 *
 * The settings screens the decision-recording scenarios (feature U34, spec
 * docs/specs/U34-editorial-decision-recording.md, "Settings that modify
 * behavior") set on a scratch press before their first step, since no
 * scenario key covers them yet (scenarios.md "Field shapes not built yet":
 * `notifyAllAuthors`, the email templates). OMP-owned (PRINCIPLES M1),
 * copied from the OJS tree's file of the same name; a press has no fee
 * page, so the journal's payments set-up has no counterpart here.
 *
 * - `ManageEmailsPage` — Settings › Workflow › Emails › "Manage Emails"
 *   (management/settings/manageEmails): the mailables list with its search,
 *   a mailable's window (its templates list, the default's "Edit", "Add
 *   Template"), the "Edit Template" window (name, subject, the TinyMCE
 *   body, "Save").
 * - `WorkflowEmailsSettingsPage` — Settings › Workflow › the "Emails" tab's
 *   "Notify All Authors" choice (radios `notifyAllAuthors`, values "true" /
 *   "false") and its "Save".
 *
 * DOM facts confirmed live 2026-09-20 (.reports/U34/screen-notes.md ccK1,
 * ccK2, ccK4; the K1/K2/K4 kept scripts): the mailables list is a
 * `list-panel` whose items carry the name as `.listPanel__itemTitle` and an
 * "Edit" button named "Edit {name}" for screen readers; the mailable window
 * is a dialog named after the mailable, its templates a list with one
 * "Edit" per template and an "Add Template" button; the template window's
 * inputs are `input[name^="name"]`, `input[name^="subject"]` and one TinyMCE
 * body; a form-encoded "Save" shows the inline "Saved" status.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

/** The visible, initialized TinyMCE editor inside `scope` (a dialog), by id. */
async function visibleEditorId(page, scope) {
    const handle = await scope.elementHandle();
    await page.waitForFunction(
        (root) => {
            const t = /** @type {any} */ (window).tinymce;
            const list = t ? t.get() || [] : [];
            return list.some((e) => {
                try {
                    const c = e.getContainer();
                    return !!(c && c.getClientRects().length) && e.initialized && (!root || root.contains(c));
                } catch {
                    return false;
                }
            });
        },
        handle,
        {timeout: 30_000}
    );
    return page.evaluate((root) => {
        const t = /** @type {any} */ (window).tinymce;
        const editor = (t.get() || []).find((e) => {
            try {
                const c = e.getContainer();
                return !!(c && c.getClientRects().length) && e.initialized && (!root || root.contains(c));
            } catch {
                return false;
            }
        });
        return editor ? editor.id : null;
    }, handle);
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

exports.ManageEmailsPage = class ManageEmailsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/manageEmails'));
        await expect(this.page.locator('.manageEmails__listPanel .listPanel__item').first()).toBeVisible({timeout: 30_000});
    }

    /** The list's search box (commits on Enter). */
    searchBox() {
        return this.page.locator('.manageEmails__listPanel input[type="search"]');
    }

    /** The mailable's row: the item whose title is exactly `name`. */
    mailableRow(name) {
        return this.page.locator('.manageEmails__listPanel .listPanel__item').filter({
            has: this.page.locator('.listPanel__itemTitle', {hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)}),
        });
    }

    /** The mailable's window, a dialog named after it. */
    mailableWindow(name) {
        return this.page.getByRole('dialog', {name, exact: true});
    }

    /** Search the mailable and open its window with the row's "Edit". */
    async openMailable(name) {
        await this.searchBox().fill(name);
        await this.searchBox().press('Enter');
        const row = this.mailableRow(name);
        await expect(row).toBeVisible({timeout: 30_000});
        await row.getByRole('button', {name: `Edit ${name}`, exact: true}).click();
        const win = this.mailableWindow(name);
        await expect(win).toBeVisible({timeout: 30_000});
        await expect(win.getByRole('button', {name: 'Add Template', exact: true})).toBeVisible({timeout: 30_000});
        return win;
    }

    /** The "Edit Template" window (the default's "Edit" and "Add Template" open it). */
    templateWindow() {
        return this.page.getByRole('dialog', {name: /Template$/}).last();
    }

    /**
     * The default template's "Edit": put `prefixHtml` in front of its body
     * and save. The window's "Save" shows "Saved"; the window is then closed.
     */
    async prefixDefaultTemplateBody(win, name, prefixHtml) {
        await win.getByRole('listitem').filter({hasText: name}).getByRole('button', {name: 'Edit', exact: true}).click();
        const form = this.templateWindow();
        await expect(form.locator('input[name^="subject"]')).toBeVisible({timeout: 30_000});
        const id = await visibleEditorId(this.page, form);
        const current = await this.page.evaluate((i) => /** @type {any} */ (window).tinymce.get(i).getContent(), id);
        await setEditorContent(this.page, id, `${prefixHtml}${current}`);
        await this.save(form);
    }

    /** "Add Template": a further template for the mailable, saved. */
    async addTemplate(win, {name, subject, bodyHtml}) {
        await win.getByRole('button', {name: 'Add Template', exact: true}).click();
        const form = this.templateWindow();
        await expect(form.locator('input[name^="name"]')).toBeVisible({timeout: 30_000});
        await form.locator('input[name^="name"]').first().fill(name);
        await form.locator('input[name^="subject"]').first().fill(subject);
        const id = await visibleEditorId(this.page, form);
        await setEditorContent(this.page, id, bodyHtml);
        await this.save(form);
    }

    /** Press the template window's "Save", wait for the API's answer and the "Saved" status, then close it. */
    async save(form) {
        const saved = this.page.waitForResponse(
            (r) => r.url().includes('/emailTemplates') && r.request().method() === 'POST' && r.ok(),
            {timeout: 30_000}
        );
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(form.locator('[role="status"]').filter({hasText: 'Saved'})).toBeVisible({timeout: 30_000});
        await form.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(form).toBeHidden({timeout: 30_000});
    }

    /** Close the mailable's window. */
    async closeMailable(win) {
        await win.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(win).toBeHidden({timeout: 30_000});
    }
};

exports.WorkflowEmailsSettingsPage = class WorkflowEmailsSettingsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /** Open Settings › Workflow on its "Emails" tab. */
    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/workflow'));
        await this.page.locator('#emails-button').click();
        await expect(this.notifyAllAuthorsRadios().first()).toBeVisible({timeout: 30_000});
    }

    notifyAllAuthorsRadios() {
        return this.page.locator('input[name="notifyAllAuthors"]');
    }

    /** Choose "true" (every author) or "false" (assigned authors only) and save the tab. */
    async setNotifyAllAuthors(value) {
        await this.page.locator(`input[name="notifyAllAuthors"][value="${value}"]`).check();
        const panel = this.page.getByRole('tabpanel', {name: 'Emails', exact: true});
        await panel.getByRole('button', {name: 'Save', exact: true}).first().click();
        await expect(panel.locator('[role="status"]').filter({hasText: 'Saved'})).toBeVisible({timeout: 30_000});
    }
};
