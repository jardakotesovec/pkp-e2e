// @ts-check
/**
 * @file playwright/pages/PublicationPages.js
 *
 * OPS-local Page Object and flow helpers for the Publication metadata
 * feature (spec: docs/specs/U40-publication-metadata.md). App-local by
 * design (PRINCIPLES M1) — nothing here touches the shared POMs.
 *
 * Surfaces:
 * - PublicationScreen — the workflow's Publication-area pages, reached
 *   through the OPS workflow nav group labeled "Preprint" (spec Rule 1):
 *   "Title & Abstract", "Metadata", "Data", "Permissions & Disclosure",
 *   each headed "Preprint: {entry}". Carries the form-field addressing
 *   (FieldBase compileId: `{formId}-{name}-control[-{locale}]`, TinyMCE
 *   iframes at `{controlId}_ifr`), the Save flow bounded by the
 *   publications API + the "Saved" status (patterns.md pitfall 13), the
 *   locked-field "Override" affordance (Rule 11), and the "Current
 *   Submission Language" readout with its "Change" panel (Rule 13).
 * - postPreprint / unpostPreprint — the Production stage screen's "Post"
 *   (legacy "Post the preprint" modal wrapping the OPS PublishForm) and
 *   "Unpost" (confirm dialog "Are you sure you don't want this to be
 *   posted?").
 *
 * Labels are the live locale strings (ops + lib/pkp locale/en/*.po at the
 * pinned commits); DOM shapes from lib/ui-library WorkflowPublicationForm /
 * FieldBase / FieldText / FieldRichTextarea, confirmed against the running
 * OPS fleet while this suite was built (2026-08-28).
 */
const {expect} = require('@playwright/test');

/**
 * Open a submission's workflow panel straight by URL (editorial or author
 * dashboard). The OPS workflow panel has no "Workflow:" heading — arrival is
 * judged on the "Preprint" nav group (apps/ops MySubmissionsPage note).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} contextPath
 * @param {number} submissionId
 * @param {{author?: boolean}} [options]
 */
async function openWorkflow(page, contextPath, submissionId, {author = false} = {}) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(
        `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}`
    );
    await expect(
        page.getByRole('link', {name: 'Preprint', exact: true})
    ).toBeVisible({timeout: 30_000});
}

exports.openWorkflow = openWorkflow;

exports.PublicationScreen = class PublicationScreen {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
    }

    /** A Publication-area nav entry under the "Preprint" group. */
    navLink(name) {
        return this.page.getByRole('link', {name, exact: true});
    }

    /**
     * Open a Publication page from an open workflow panel and wait for its
     * "Preprint: {entry}" heading. The "Preprint" group is expanded by
     * default — clicking it would COLLAPSE it, so it is only clicked when
     * the entry is hidden (same guard as FundingPages).
     *
     * @param {string} name nav entry ("Title & Abstract", "Metadata", …)
     */
    async openPage(name) {
        const group = this.page.getByRole('link', {name: 'Preprint', exact: true});
        await expect(group).toBeVisible({timeout: 30_000});
        const entry = this.navLink(name);
        if (!(await entry.isVisible())) {
            await group.click();
        }
        await entry.click();
        await expect(
            this.page.getByRole('heading', {name: `Preprint: ${name}`})
        ).toBeVisible({timeout: 30_000});
    }

    /** Open the workflow's Production stage screen (OPS's one stage,
     * editorial view only — the author view has none). Arrival is judged on
     * the stage's Participants panel (the OPS workflow panel carries no
     * "Workflow:" heading — apps/ops MySubmissionsPage note). */
    async openProductionStage() {
        await this.navLink('Production').click();
        await expect(
            this.page.locator('[data-cy="participant-manager"]')
        ).toBeVisible({timeout: 30_000});
    }

    /**
     * A form field's control id (FieldBase compileId): multilingual fields
     * carry the locale key.
     */
    controlId(formId, name, locale = null) {
        return locale ? `${formId}-${name}-control-${locale}` : `${formId}-${name}-control`;
    }

    /** A plain input (FieldText) by its control id. */
    input(formId, name, locale = null) {
        return this.page.locator(`#${this.controlId(formId, name, locale)}`);
    }

    /** The TinyMCE editing body of a rich-text field (iframe `{id}_ifr`). */
    richTextBody(formId, name, locale = null) {
        return this.page
            .frameLocator(`iframe#${this.controlId(formId, name, locale)}_ifr`)
            .locator('body');
    }

    /** Replace a rich-text field's content by typing into its editor body. */
    async fillRichText(formId, name, locale, text) {
        const body = this.richTextBody(formId, name, locale);
        await body.click();
        await body.press('ControlOrMeta+a');
        await body.press('Delete');
        if (text) {
            await body.fill(text);
            await expect(body).toContainText(text);
        }
    }

    /** Read a rich-text field's stored HTML through the TinyMCE API
     * (server-rendered values never reach the backing textarea —
     * patterns.md). */
    async readRichText(formId, name, locale = null) {
        const id = this.controlId(formId, name, locale);
        return this.page.evaluate(
            // @ts-ignore tinymce is the page's global
            (fieldId) => window.tinymce?.get(fieldId)?.getContent(),
            id
        );
    }

    /** The field wrapper element around a control (label, description,
     * Override button live here). */
    fieldWrapper(formId, name, locale = null) {
        return this.page
            .locator('.pkpFormField')
            .filter({has: this.page.locator(`#${this.controlId(formId, name, locale)}`)});
    }

    /** A locked field's "Override" button (Rule 11). */
    overrideButton(formId, name, locale = null) {
        return this.fieldWrapper(formId, name, locale).getByRole('button', {
            name: 'Override',
            exact: true,
        });
    }

    /** The open page's Save button (one form per page — Rule 1). */
    saveButton() {
        return this.page.getByRole('button', {name: 'Save', exact: true});
    }

    /**
     * Save the open form, bounded by the publications API answering OK
     * (useFetch tunnels PUT via POST) and the "Saved" status appearing.
     */
    async save() {
        const saved = this.page.waitForResponse(
            (r) =>
                r.url().includes('/publications/') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await this.saveButton().click();
        await saved;
        await expect(
            this.page.locator('[role="status"]', {hasText: 'Saved'}).first()
        ).toBeVisible({timeout: 30_000});
    }

    /** The "Current Submission Language: {language}" readout (Rule 13a).
     * The label and the language name are sibling spans — return their
     * wrapping element so text assertions see both. */
    languageReadout() {
        return this.page
            .getByText('Current Submission Language:')
            .locator('xpath=..');
    }

    /** The readout's "Change" button. */
    changeLanguageButton() {
        return this.page.getByRole('button', {name: 'Change', exact: true});
    }

    /** The "Change Submission Language For" side panel (Rule 13b). */
    changeLanguagePanel() {
        return this.page
            .locator('[data-cy="active-modal"]')
            .filter({has: this.page.getByText('Change Submission Language For')});
    }
};

/**
 * Post the open workflow's preprint (live-probed 2026-08-28): the stage
 * screen's "Post the preprint" action navigates to the publication screen,
 * whose header carries the "Post" primary control (already there when a
 * publication page is open); "Post" opens the legacy "Post the preprint"
 * modal wrapping the OPS PublishForm ("All requirements have been met. Are
 * you sure you want to post this?"), whose submit button reads "Post".
 * Bounded by the publish API answering OK and the header's "Unpost"
 * control appearing.
 *
 * @param {import('@playwright/test').Page} page
 */
async function postPreprint(page) {
    const stageAction = page.getByRole('button', {
        name: 'Post the preprint',
        exact: true,
    });
    const postControl = page.getByRole('button', {name: 'Post', exact: true});
    await expect(stageAction.or(postControl).first()).toBeVisible({timeout: 30_000});
    if (await stageAction.isVisible()) {
        await stageAction.click();
    }
    await expect(postControl).toBeVisible({timeout: 30_000});
    await postControl.click();
    const confirm = page
        .getByRole('dialog')
        .filter({hasText: 'Are you sure you want to post this?'});
    await expect(confirm).toBeVisible({timeout: 30_000});
    const posted = page.waitForResponse(
        (r) => /\/publications\/\d+\/publish/.test(r.url()) && r.ok(),
        {timeout: 30_000}
    );
    await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
    await posted;
    await expect(
        page.getByRole('button', {name: 'Unpost', exact: true})
    ).toBeVisible({timeout: 30_000});
}

exports.postPreprint = postPreprint;

/**
 * Unpost the open workflow's posted preprint: a posted preprint's workflow
 * opens on its publication screen, whose header carries the "Unpost"
 * control; it opens a confirm dialog ("Are you sure you don't want this to
 * be posted?") whose confirming button also reads "Unpost".
 *
 * @param {import('@playwright/test').Page} page
 */
async function unpostPreprint(page) {
    await page.getByRole('button', {name: 'Unpost', exact: true}).click();
    const dialog = page
        .getByRole('dialog')
        .filter({hasText: "Are you sure you don't want this to be posted?"});
    await expect(dialog).toBeVisible({timeout: 30_000});
    const unposted = page.waitForResponse(
        (r) => /\/publications\/\d+\/unpublish/.test(r.url()) && r.ok(),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'Unpost', exact: true}).last().click();
    await unposted;
    await expect(dialog).toHaveCount(0, {timeout: 30_000});
}

exports.unpostPreprint = unpostPreprint;

/**
 * Save a Settings form's tab panel, bounded by the contexts API answering
 * OK (settings forms PUT via the tunneled POST).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} panel the tab panel holding the form
 */
async function saveSettingsPanel(page, panel) {
    const saved = page.waitForResponse(
        (r) =>
            r.url().includes('/api/v1/contexts/') &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
}

exports.saveSettingsPanel = saveSettingsPanel;
