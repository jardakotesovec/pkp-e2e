// @ts-check
/**
 * @file playwright/pages/PublicationMetadataPages.js
 *
 * OJS-local Page Object and flow helpers for the Publication metadata
 * feature (spec: docs/specs/U40-publication-metadata.md).
 *
 * Surfaces:
 * - PublicationScreen — the workflow's Publication area pages ("Title &
 *   Abstract", "Metadata", "Data", "Permissions & Disclosure", "Publication
 *   Settings"): opening an entry, the Vue form's TinyMCE fields, the
 *   bounded Save, the "Current Submission Language" readout with its
 *   "Change" panel, the "Schedule For Publication" panel (Review Publishing
 *   Details), Unpublish, and the participant "Edit Assignment" permission
 *   tick.
 * - Issue helpers (legacy jQuery grid at /manageIssues) — create a future
 *   issue, publish it without notifying users, and set its published date
 *   through the date-picker calendar (the visible input's altField only
 *   updates through the calendar UI, so the helpers drive it).
 *
 * Labels are the live locale strings; DOM shapes confirmed against the
 * running app while this suite was built (2026-08-28): TinyMCE editor ids
 * follow `{formId}-{field}-control[-{locale}]`; the one-line editors keep
 * their toolbar behind a "Formatting" drop-down that opens a floating
 * toolbar overflow (`.tox-toolbar__overflow`) with Bold / Italic /
 * Underline / Superscript / Subscript buttons; useFetch tunnels PUT via
 * POST, so form saves are matched as POSTs.
 */
const {expect} = require('@playwright/test');
const {waitForJQueryIdle} = require('../support/legacy.js');

/**
 * Wait for a publications API write to answer OK (PUT rides POST via
 * X-Http-Method-Override).
 *
 * @param {import('@playwright/test').Page} page
 */
function waitForPublicationSave(page) {
    return page.waitForResponse(
        (r) =>
            r.url().includes('/publications/') &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
}

/**
 * Wait for a context-settings form save (Settings › Workflow / Distribution
 * forms POST to /api/v1/contexts/{id}).
 *
 * @param {import('@playwright/test').Page} page
 */
function waitForContextSettingsSave(page) {
    return page.waitForResponse(
        (r) =>
            r.url().includes('/api/v1/contexts/') &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
}

exports.waitForPublicationSave = waitForPublicationSave;
exports.waitForContextSettingsSave = waitForContextSettingsSave;

exports.PublicationScreen = class PublicationScreen {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        this.page = page;
        this.contextPath = contextPath;
    }

    /**
     * Open a submission's workflow (editorial or author view). Waits on the
     * "Publication" menu group, not the "Workflow:" heading — a published
     * submission's workflow can open on a Publication page without it.
     */
    async gotoWorkflow(submissionId, {author = false} = {}) {
        const dashboard = author ? 'mySubmissions' : 'editorial';
        await this.page.goto(
            `/index.php/${this.contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}`
        );
        await expect(
            this.page.getByRole('link', {name: 'Publication', exact: true})
        ).toBeVisible({timeout: 30_000});
    }

    /** The Publication-area menu entry for a page ("Title & Abstract", …). */
    entryLink(name) {
        return this.page.getByRole('link', {name, exact: true});
    }

    /**
     * Open a Publication entry and wait for its "Publication: {name}" page
     * heading. The Publication group is expanded by default; clicking the
     * group header would collapse it, so it is only clicked when the entry
     * is hidden.
     */
    async openEntry(name) {
        const entry = this.entryLink(name);
        if (!(await entry.isVisible())) {
            await this.page.getByRole('link', {name: 'Publication', exact: true}).click();
        }
        await entry.click();
        await expect(
            this.page.getByRole('heading', {name: `Publication: ${name}`})
        ).toBeVisible({timeout: 30_000});
    }

    /** The current form's Save button. */
    saveButton() {
        return this.page.getByRole('button', {name: 'Save', exact: true});
    }

    /** Press Save and wait for the API write plus the "Saved" footer note. */
    async save() {
        const saved = waitForPublicationSave(this.page);
        await this.saveButton().click();
        const response = await saved;
        await expect(
            this.page.locator('[role="status"]:has-text("Saved")')
        ).toBeVisible({timeout: 30_000});
        return response;
    }

    /**
     * Set a TinyMCE field's content the way a save reads it (the backing
     * textarea never updates — patterns.md). Waits for the editor to
     * initialize first.
     *
     * @param {string} editorId e.g. 'titleAbstract-abstract-control-en'
     * @param {string} html
     */
    async setRichText(editorId, html) {
        await this.page.waitForFunction(
            (id) => !!window.tinymce?.get(id)?.initialized,
            editorId,
            {timeout: 30_000}
        );
        await this.page.evaluate(
            ([id, value]) => {
                const editor = window.tinymce.get(id);
                editor.setContent(value);
                editor.fire('change');
            },
            [editorId, html]
        );
    }

    /** Read a TinyMCE field's current content. */
    async richTextContent(editorId) {
        await this.page.waitForFunction(
            (id) => !!window.tinymce?.get(id)?.initialized,
            editorId,
            {timeout: 30_000}
        );
        return this.page.evaluate((id) => window.tinymce.get(id).getContent(), editorId);
    }

    /**
     * Apply a Formatting-menu command to a one-line editor: click into the
     * editor, select everything, open the "Formatting" drop-down and press
     * the command's button in the floating toolbar it opens.
     *
     * @param {string} editorId
     * @param {string} command accessible name, e.g. 'Italic'
     */
    async applyFormattingCommand(editorId, command) {
        await this.page.frameLocator(`#${editorId}_ifr`).locator('body').click();
        await this.page.keyboard.press('ControlOrMeta+a');
        await this.page.getByRole('button', {name: 'Formatting'}).click();
        const overflow = this.page.locator('.tox-toolbar__overflow');
        await expect(overflow).toBeVisible({timeout: 30_000});
        await overflow.getByRole('button', {name: command, exact: true}).click();
    }

    /** The "Current Submission Language: {language}" readout's line. */
    languageReadoutLine() {
        return this.page
            .getByText('Current Submission Language:', {exact: false})
            .locator('xpath=..');
    }

    /** The readout's "Change" button (editorial Publication pages only). */
    changeLanguageButton() {
        return this.page.getByRole('button', {name: 'Change', exact: true});
    }

    /** The "Change Submission Language For" side panel. */
    changeLanguageDialog() {
        return this.page.getByRole('dialog', {name: /Change Submission Language/i});
    }

    /**
     * Open the Change Submission Language panel and wait until it is fully
     * initialized. The panel loads the publication in the background and a
     * language picked before that load lands leaves the revealed boxes
     * describing the OLD language; the publication's title in the panel's
     * subtitle renders from the same load, so it is the settle gate.
     *
     * @param {string} expectedTitle the submission's title
     */
    async openChangeLanguagePanel(expectedTitle) {
        await this.changeLanguageButton().click();
        const dialog = this.changeLanguageDialog();
        await expect(
            dialog.getByRole('button', {name: 'Confirm', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(dialog.getByText(expectedTitle).first()).toBeVisible({
            timeout: 30_000,
        });
        return dialog;
    }

    /**
     * The top-right publish button in the Publication area's controls (its
     * label is "Schedule For Publication" until the submission itself counts
     * as published, then "Publish"). Scoped to the right-controls container
     * so the stage views' same-labeled navigation shortcut never matches.
     */
    publishButton() {
        return this.page
            .locator('[data-cy="workflow-controls-right"]')
            .getByRole('button', {name: /^(Schedule For Publication|Publish)$/});
    }

    /**
     * The "Review Publishing Details" side panel, opened by the publish
     * button from a Publication page. The FIRST press is occasionally
     * swallowed (nothing opens, no request fires — U49 spec fn-k), so the
     * press is retried once when the panel has not appeared.
     */
    async openPublishPanel() {
        const button = this.publishButton();
        await expect(button).toBeVisible({timeout: 30_000});
        await button.click();
        const panel = this.page
            .locator('[data-cy="active-modal"]')
            .filter({hasText: 'Review Publishing Details'})
            .last();
        const settled = panel.locator('select[name="versionStage"]');
        try {
            await expect(settled).toBeVisible({timeout: 5_000});
        } catch {
            await button.click();
        }
        await expect(settled).toBeVisible({timeout: 30_000});
        return panel;
    }

    /**
     * Fill the panel's required version details (Publication Stage and
     * Revision Significance; "Minor Revision" is disabled for a first
     * Version of Record, so the major option is picked).
     *
     * @param {import('@playwright/test').Locator} panel
     */
    async fillVersionDetails(panel) {
        await panel.locator('select[name="versionStage"]').selectOption('VoR');
        await panel.locator('select[name="versionIsMinor"]').selectOption('false');
    }

    /**
     * Pick an option in the panel/page "Issue *" select once its async
     * option list carries a label matching the given pattern.
     *
     * @param {import('@playwright/test').Locator} scope
     * @param {RegExp} issueLabel
     */
    async selectIssueOption(scope, issueLabel) {
        const issueSelect = scope.locator('select[name="issueId"]');
        await expect(issueSelect).toBeVisible({timeout: 30_000});
        const option = issueSelect.locator('option').filter({hasText: issueLabel});
        await expect(option).toHaveCount(1, {timeout: 30_000});
        await issueSelect.selectOption((await option.getAttribute('value')) || '');
    }

    /**
     * Publish the current submission through the panel. With no issue
     * assigned the journal publishes immediately (continuous publication);
     * pass an issue label regex to pick "Assign To Current/Back Issue"
     * first. Ends on the workflow with "Status: Published".
     *
     * On a journal that has issues the panel carries a required "Issue
     * Assignment" radio group (rendered after its own fetch); without
     * issues the group never appears — hence the bounded conditional wait.
     *
     * @param {{backIssueLabel?: RegExp}} options
     */
    /**
     * Wait for the panel's Issue Assignment group to finish its async
     * preselection (touching the radios earlier races the fetch and the
     * Confirm then submits an inconsistent status).
     *
     * @param {import('@playwright/test').Locator} panel
     */
    async awaitAssignmentPreselected(panel) {
        await expect(panel.locator('input[name="assignment"]:checked')).toHaveCount(1, {
            timeout: 30_000,
        });
    }

    async publish({backIssueLabel} = {}) {
        const panel = await this.openPublishPanel();
        await this.fillVersionDetails(panel);
        if (backIssueLabel) {
            const backRadio = panel.getByRole('radio', {
                name: 'Assign To Current/Back Issue',
            });
            await expect(backRadio).toBeVisible({timeout: 30_000});
            await this.awaitAssignmentPreselected(panel);
            await backRadio.check();
            await this.selectIssueOption(panel, backIssueLabel);
        } else {
            const dontAssign = panel.getByRole('radio', {
                name: "Don't Assign To An Issue",
            });
            const hasAssignmentGroup = await dontAssign
                .waitFor({state: 'visible', timeout: 5_000})
                .then(() => true)
                .catch(() => false);
            if (hasAssignmentGroup) {
                await this.awaitAssignmentPreselected(panel);
                await dontAssign.check();
            }
        }
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirmDialog = this.page
            .getByRole('dialog')
            .filter({hasText: 'Are you sure you want to publish this?'});
        const published = this.page.waitForResponse(
            (r) => r.url().includes('/publish') && r.ok(),
            {timeout: 30_000}
        );
        await confirmDialog
            .getByRole('button', {name: 'Publish', exact: true})
            .click();
        await published;
        await expect(
            this.page.getByRole('button', {name: 'Unpublish', exact: true})
        ).toBeVisible({timeout: 30_000});
    }

    /**
     * Schedule the current submission to a future issue WITHOUT publishing:
     * the dependable route (spec scenario seeding) saves "Assign To Future
     * Issue and Schedule Only" on the Publication Settings page first, then
     * re-picks the same choice in the "Review Publishing Details" panel.
     * Ends with "Status: Scheduled".
     *
     * @param {RegExp} issueLabel matches the future issue's option label
     */
    async scheduleToFutureIssue(issueLabel) {
        await this.openEntry('Publication Settings');
        const pickScheduleOnly = async (scope) => {
            const scheduleOnly = scope.getByRole('radio', {
                name: 'Assign To Future Issue and Schedule Only',
            });
            await expect(scheduleOnly).toBeVisible({timeout: 30_000});
            await scheduleOnly.check();
            await this.selectIssueOption(scope, issueLabel);
        };
        await pickScheduleOnly(this.page);
        const saved = waitForPublicationSave(this.page);
        await this.saveButton().click();
        await saved;

        const panel = await this.openPublishPanel();
        await this.fillVersionDetails(panel);
        await this.awaitAssignmentPreselected(panel);
        await pickScheduleOnly(panel);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirmDialog = this.page
            .getByRole('dialog')
            .filter({hasText: 'Are you sure you want to schedule this for publication?'});
        const scheduled = this.page.waitForResponse(
            (r) => r.url().includes('/publish') && r.ok(),
            {timeout: 30_000}
        );
        await confirmDialog
            .getByRole('button', {name: 'Schedule For Publication', exact: true})
            .click();
        await scheduled;
        await expect(
            this.page.getByRole('button', {name: 'Unschedule', exact: true})
        ).toBeVisible({timeout: 30_000});
    }

    /** Unpublish the current version through its confirmation dialog. */
    async unpublish() {
        await this.page.getByRole('button', {name: 'Unpublish', exact: true}).click();
        const dialog = this.page
            .getByRole('dialog')
            .filter({hasText: "Are you sure you don't want this to be published?"});
        const unpublished = this.page.waitForResponse(
            (r) => r.url().includes('/unpublish') && r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Unpublish', exact: true}).click();
        await unpublished;
        await expect(
            this.page.getByRole('button', {name: 'Schedule For Publication', exact: true})
        ).toBeVisible({timeout: 30_000});
    }

    /**
     * On a stage screen's Participants panel, open a participant's "Edit
     * Assignment" form and tick "Allow this person to make changes to the
     * publication…" (legacy jQuery form).
     *
     * @param {string} displayName e.g. 'Ada Author'
     */
    async allowParticipantMetadataEdit(displayName) {
        await this.page
            .getByRole('button', {name: `${displayName} More Actions`})
            .first()
            .click();
        await this.page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const dialog = this.page
            .getByRole('dialog')
            .filter({hasText: 'Edit Assignment'});
        const checkbox = dialog.locator('input[name="canChangeMetadata"]');
        await expect(checkbox).toBeVisible({timeout: 30_000});
        await checkbox.check();
        await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(checkbox).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Open the workflow's "Activity Log" modal ("Activity Log & Notes"). */
    async openActivityLog() {
        await this.page
            .getByRole('button', {name: 'Activity Log', exact: true})
            .click();
        const dialog = this.page
            .getByRole('dialog')
            .filter({hasText: 'Activity Log & Notes'});
        await expect(dialog.getByText('Event', {exact: true})).toBeVisible({
            timeout: 30_000,
        });
        return dialog;
    }
};

/**
 * Create an issue through Issues › Future Issues › "Create Issue" (legacy
 * grid). Leaves the page on /manageIssues.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} contextPath
 * @param {{volume: string, number: string, year: string, title: string}} data
 */
exports.createIssue = async function createIssue(page, contextPath, {volume, number, year, title}) {
    await page.goto(`/index.php/${contextPath}/manageIssues`);
    await page.getByRole('link', {name: 'Create Issue'}).click();
    const modal = page
        .getByRole('dialog')
        .filter({has: page.locator('input[name="volume"]')});
    await expect(modal.locator('input[name="volume"]')).toBeVisible({timeout: 30_000});
    await modal.locator('input[name="volume"]').fill(volume);
    await modal.locator('input[name="number"]').fill(number);
    await modal.locator('input[name="year"]').fill(year);
    await modal.locator('input[name="title[en]"]').fill(title);
    await modal.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(modal.locator('input[name="volume"]')).toHaveCount(0, {timeout: 30_000});
    await waitForJQueryIdle(page);
};

/**
 * Publish the future issue whose row carries the given identification,
 * unticking "Send an email about this to all registered users." so the
 * shared Mailpit stays quiet. Assumes the page is on /manageIssues.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} identification e.g. 'Vol. 2 No. 1 (2025)'
 */
exports.publishIssue = async function publishIssue(page, identification) {
    const row = page.locator('tr.gridRow').filter({hasText: identification});
    await row.locator('a.show_extras').click();
    await waitForJQueryIdle(page);
    await page.getByRole('link', {name: 'Publish Issue'}).click();
    const dialog = page
        .getByRole('dialog')
        .filter({hasText: 'Are you sure you want to publish the new issue?'});
    const mailToggle = dialog.locator('input[type="checkbox"]').first();
    await expect(mailToggle).toBeVisible({timeout: 30_000});
    await mailToggle.uncheck();
    await dialog.getByRole('button', {name: 'OK', exact: true}).click();
    await expect(dialog).toHaveCount(0, {timeout: 30_000});
    await waitForJQueryIdle(page);
};

/**
 * Set a back issue's Date Published through the Issue Data form's
 * date-picker calendar (typing alone never syncs the hidden altField the
 * form submits). Assumes the page is on /manageIssues.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} identification issue row text to match
 * @param {{year: string, monthIndex: string, day: string}} date
 *   monthIndex is the calendar's 0-based month value ('5' = June).
 */
exports.setBackIssueDate = async function setBackIssueDate(page, identification, {year, monthIndex, day}) {
    await page.getByRole('tab', {name: 'Back Issues'})
        .or(page.getByRole('link', {name: 'Back Issues'}))
        .first()
        .click();
    await waitForJQueryIdle(page);
    const row = page.locator('tr.gridRow').filter({hasText: identification});
    await row.locator('a.show_extras').click();
    await waitForJQueryIdle(page);
    await page.getByRole('link', {name: 'Edit', exact: true}).click();
    const modal = page.getByRole('dialog').filter({hasText: 'Issue Management'});
    await expect(modal.getByRole('link', {name: 'Issue Data'}).first()).toBeVisible({
        timeout: 30_000,
    });
    await modal.getByRole('link', {name: 'Issue Data'}).first().click();
    const dateField = modal.locator('input[name="datePublished-removed"]');
    await expect(dateField).toBeVisible({timeout: 30_000});
    await dateField.click();
    const calendar = page.locator('#ui-datepicker-div');
    await expect(calendar).toBeVisible({timeout: 30_000});
    await calendar.locator('select.ui-datepicker-year').selectOption(year);
    await calendar.locator('select.ui-datepicker-month').selectOption(monthIndex);
    await calendar.locator('td a').filter({hasText: new RegExp(`^${day}$`)}).click();
    await expect(modal.locator('input[name="datePublished"]')).toHaveValue(
        new RegExp(`^${year}-`)
    );
    // Component-router op URLs are kebab-cased (patterns.md).
    const saved = page.waitForResponse(
        (r) => /update-issue/.test(r.url()) && r.ok(),
        {timeout: 30_000}
    );
    await modal.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
    await waitForJQueryIdle(page);
    // The Issue Management modal is left open (its Close button re-renders
    // and can stay "unstable" after the save) and the form can still be
    // flagged dirty, which turns the next navigation into a beforeunload
    // confirm; Playwright's default dismisses that and the navigation would
    // hang. Accept beforeunload prompts on this page from here on.
    page.on('dialog', (dialog) => {
        const handle =
            dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss();
        handle.catch(() => {});
    });
};
