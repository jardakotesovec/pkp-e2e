// @ts-check
/**
 * @file shared/playwright/pages/IdentifiersPages.js
 *
 * Page objects for the Identifiers feature (publisher IDs & URN; spec:
 * docs/specs/U44-identifiers.md), shared by the OJS, OMP and OPS suites.
 * App-neutral: every per-app string (the settings window's opening line,
 * the kinds of item, the context word of the duplicate refusal, the
 * default patterns) is passed in by the suite; the strings below are the
 * ones the three apps share (lib/pkp and the URN plugin's own locale).
 *
 * Surfaces:
 * - PublisherIdSettings — Settings › Workflow › Submission › "Metadata":
 *   the "Publisher ID" group (help text, boxes, "Save").
 * - UrnPluginSettings — Settings › Website › "Plugins": the "URN" row
 *   (its "Enabled" box, the "Disable" question, the row's "Settings") and
 *   (a preprint server: the "Public Identifier Plugins" category with no
 *   plugin row) and
 *   the plugin's settings window (`#urnSettingsForm`: kinds, prefix,
 *   suffix choice, "Check Number", "Namespace", "Resolver URL", the
 *   browser's and the server's refusals, "Save", "Reassign URNs").
 * - IdentifiersPage — the workflow's Publication › "Identifiers" page (a
 *   Vue form: the "URN" field with "Assign", "Clear", "Add Check Number",
 *   the page's "Save"), plus the Metadata page's "Publisher ID" box.
 * - LegacyIdentifiersWindow — a legacy tabbed window with an
 *   "Identifiers" tab (a galley's "Upload a File Ready for Publication",
 *   an issue's "Issue Management: …", a press's chapter / format / file
 *   windows): the tab's "Publisher ID" box, the "URN" area (preview,
 *   suffix boxes, the assign box, "Clear"), the issue's "Clear Issue
 *   Objects URNs" block, "Save" (accepted: the window closes; refused:
 *   the tab re-renders with "Errors occurred processing this form") and
 *   the "Delete" question of "Clear".
 * - GalleysPage — the workflow's Publication › "Galleys" page: a galley
 *   row's menu › "Edit" (journal, preprint server); on a preprint server
 *   also the author's view, the menu's items and a posted preprint's
 *   "View" ("View Galley", its tabs read-only).
 * - IssuesPage / PublishIssueWindow — Issues (`/manageIssues`, journal
 *   only): a row's control links ("Edit", "Publish Issue") and the
 *   "Publish Issue" window's URN step and email box.
 * - The reader side: the URN link of an article's and an issue's page,
 *   and the publish confirmation window's URN note and table (Rule 17).
 *
 * Browser dialogs (a legacy window's "The data on this form has changed…"
 * confirm, the page-leave question) are the caller's: register
 * `page.on('dialog', …)` before a step that switches tabs, closes a window,
 * navigates or reloads. The in-page questions ("Delete", "Disable") are
 * legacy windows, answered here.
 *
 * DOM shapes (U44 claim check, `.reports/U44/screen-notes.md`, ccK1–ccK4,
 * 2026-09-24): the tab's form is `#publicIdentifiersForm`, its URN area
 * `[id^="pubIdURNFormArea"]` (a group named "URN"), the issue's objects
 * block `[id^="pubIdURNIssueobjectsFormArea"]`, the assign box
 * `input[name="assignURN"]`; a tab's "Save" posts `…/update-identifiers`
 * and "Clear" (after "OK") `…/clear-pub-id`, "Clear Issue Objects URNs"
 * `…/clear-issue-objects-pub-ids`, "Reassign URNs" `…/manage?verb=clearPubIds`;
 * the settings window's browser refusals are `label.error[for^=<name>]`
 * under the box, its server refusals the list `#formErrors` at the top.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

/** The strings the three apps share (lib/pkp, the URN plugin's locale). */
const TEXT = {
    publisherIdHelp:
        'The publisher ID may be used to record the ID from an external database. For example, items exported for deposit to PubMed may include the publisher ID. This should not be used for DOIs.',
    formErrors: 'Errors occurred processing this form',
    notANumber: (value) => `The public identifier '${value}' must not be a number.`,
    slash: 'The pattern "/" is not allowed for the public identifier.',
    duplicate: (value, contextWord) =>
        `The public identifier '${value}' already exists for another object of the same type. Please choose unique identifiers for the objects of the same type within your ${contextWord}.`,
    preview: 'What you see is a preview of the URN. Select the checkbox and save the form to assign the URN.',
    unresolved: 'The URN cannot be assigned because it contains an unresolved pattern.',
    suffixMissing: 'The URN cannot be assigned because the custom suffix is missing.',
    suffixIntro:
        'A URN suffix can take any form, but must be unique among all publishing objects with the same URN prefix assigned:',
    suffixInUse:
        'The given URN suffix is already in use for another published item. Please enter a unique URN suffix for each item.',
    assigned: (item) => `The URN is assigned to this ${item}.`,
    clearQuestion: 'Are you sure you wish to delete the existing URN?',
    clearIssueObjectsQuestion: 'Are you sure you wish to delete the existing issue objects URNs?',
    issueObjectsIntro:
        'Use the following option to clear URNs of all objects (articles and galleys) currently scheduled for this issue.',
    reassignQuestion: 'Are you sure you wish to delete all existing URNs?',
    mustBegin: (prefix) => `The URN must begin with ${prefix}.`,
    noIssue: 'You can not generate a URN until this publication has been assigned to an issue.',
    required: 'This field is required.',
    invalidUrl: 'Please enter a valid URL.',
    prefixPattern: 'The URN prefix pattern must be in the form "urn:"<NID>":"<NSS>.',
    noKind: 'Please choose the objects URNs should be assigned to.',
    settingsSaved: 'Your changes have been saved.',
    disableQuestion: 'Are you sure you want to disable this plugin?',
    urnNotAssigned: 'A URN has not been assigned to this publication.',
    urnWillBe: (urn) => `The URN for this publication will be ${urn}.`,
    publishIssueQuestion: 'Are you sure you want to publish the new issue?',
    assignIssueUrn: (urn) => `Assign the URN ${urn} to this issue`,
    unassigned: 'Unassigned',
};
exports.IDENTIFIERS_TEXT = TEXT;

/**
 * Wait out the modal store's close window (patterns.md pitfall 4): a page
 * timer longer than the app's 450 ms slot, due after it whatever the load,
 * so an opener pressed next opens its window.
 *
 * @param {import('@playwright/test').Page} page
 */
async function pastCloseWindow(page) {
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
}
exports.pastCloseWindow = pastCloseWindow;

/**
 * A legacy in-page question ("Delete", "Disable"): a dialog carrying
 * `text`, answered "OK" or "Cancel". With "OK" and `request`, waits for
 * the POST whose address matches it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
function questionDialog(page, text) {
    return page.getByRole('dialog').filter({hasText: text}).last();
}
exports.questionDialog = questionDialog;

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {'OK'|'Cancel'} answer
 * @param {RegExp} [request] the POST that "OK" sends
 */
async function answerQuestion(page, dialog, answer, request) {
    const sent =
        answer === 'OK' && request
            ? page.waitForResponse((r) => request.test(r.url()) && r.request().method() === 'POST', {
                  timeout: 30_000,
              })
            : null;
    await dialog.getByRole('button', {name: answer, exact: true}).click();
    const response = sent ? await sent : null;
    await expect(dialog).toBeHidden({timeout: 30_000});
    await waitForJQueryIdle(page);
    await pastCloseWindow(page);
    return response;
}
exports.answerQuestion = answerQuestion;

// -------------------------------------------------------------------------
// Settings › Workflow › Submission › "Metadata": "Publisher ID"
// -------------------------------------------------------------------------

exports.PublisherIdSettings = class PublisherIdSettings extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /** The "Metadata" tab's form (the one with the keyword box). */
    form() {
        return this.page
            .locator('form')
            .filter({has: this.page.getByRole('checkbox', {name: 'Enable keyword metadata', exact: true})});
    }

    /** The "Publisher ID" group. */
    group() {
        return this.form().getByRole('group', {name: 'Publisher ID'});
    }

    /** One box of the group by its label ("Enable for Publications", …). */
    box(label) {
        return this.group().getByRole('checkbox', {name: label, exact: true});
    }

    /** Open Settings › Workflow › Submission › "Metadata" and wait for the group. */
    async open() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/workflow'));
        await this.page.locator('#metadata-button').click();
        await expect(this.group()).toBeVisible({timeout: 30_000});
    }

    /** The group's boxes as `{label, checked}`, top to bottom. */
    async boxes() {
        return this.group()
            .getByRole('checkbox')
            .evaluateAll((els) =>
                els.map((el) => ({
                    label: ((el.closest('label') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
                    checked: /** @type {HTMLInputElement} */ (el).checked,
                }))
            );
    }

    /** Tick (`true`) or untick (`false`) the boxes named in `states` ({label: bool}). */
    async setBoxes(states) {
        for (const [label, want] of Object.entries(states)) {
            const box = this.box(label);
            if (want) {
                await box.check();
            } else {
                await box.uncheck();
            }
        }
    }

    /** The form's "Save", bounded by the context API answering OK and the "Saved" status. */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => r.url().includes('/api/v1/contexts/') && r.request().method() === 'POST' && r.ok(),
            {timeout: 30_000}
        );
        await this.form().getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(this.page.locator('[role="status"]').filter({hasText: 'Saved'}).first()).toBeVisible({
            timeout: 30_000,
        });
    }
};

// -------------------------------------------------------------------------
// Settings › Website › "Plugins": the "URN" row and its settings window
// -------------------------------------------------------------------------

exports.UrnPluginSettings = class UrnPluginSettings extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /** The Plugins grid. */
    grid() {
        return this.page.locator('#pluginGridContainer');
    }

    /** The "URN" row. */
    row() {
        return this.grid().locator('tr.gridRow[id$="-row-urnpubidplugin"]');
    }

    /** The category the "URN" row sits in: its tbody's first row (the category heading). */
    rowCategory() {
        return this.row().locator('xpath=ancestor::tbody[1]').locator('tr').first();
    }

    /** The row's "Enabled" box. */
    enabledBox() {
        return this.row().getByRole('checkbox');
    }

    /**
     * A category's heading row by its key ("pubIds" is "Public Identifier
     * Plugins"): the row whose id ends `-category-{key}-row-{key}`.
     */
    categoryHeadingRow(key) {
        return this.grid().locator(`tr.gridRow[id$="-category-${key}-row-${key}"]`);
    }

    /** A category's plugin rows (its heading row excluded). */
    categoryPluginRows(key) {
        return this.grid().locator(
            `tr.gridRow[id*="-category-${key}-row-"]:not([id$="-category-${key}-row-${key}"])`
        );
    }

    /**
     * A plugin's row by its name cell (anchored: "URN" never matches a
     * longer name).
     */
    pluginRowNamed(name) {
        return this.grid()
            .locator('tr.gridRow')
            .filter({has: this.page.getByRole('cell', {name, exact: true})});
    }

    /**
     * Open Settings › Website › "Plugins" where the "URN" row may be absent
     * (a preprint server): wait for the grid's rows up to `lastRow`, a
     * plugin row the grid renders after "Public Identifier Plugins".
     *
     * @param {string} lastRow a plugin's name ("Default Theme")
     */
    async openPluginsGrid(lastRow) {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/website'));
        await this.page.locator('#plugins-button').click();
        await expect(this.pluginRowNamed(lastRow)).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Open Settings › Website › "Plugins" and wait for the "URN" row. */
    async openPlugins() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/website'));
        await this.page.locator('#plugins-button').click();
        await expect(this.row()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /**
     * Tick or untick the row's "Enabled" box. Unticking asks "Disable" first
     * ("Are you sure you want to disable this plugin?"), answered "OK".
     * Bounded by the grid's enable / disable answer.
     *
     * @param {boolean} want
     */
    async setEnabled(want) {
        const box = this.enabledBox();
        const answered = this.page.waitForResponse(
            (r) => new RegExp(`settings-plugin-grid/${want ? 'enable' : 'disable'}`).test(r.url()) && r.ok(),
            {timeout: 30_000}
        );
        await box.click();
        if (!want) {
            const question = questionDialog(this.page, TEXT.disableQuestion);
            await expect(question).toBeVisible({timeout: 30_000});
            await question.getByRole('button', {name: 'OK', exact: true}).click();
        }
        await answered;
        await waitForJQueryIdle(this.page);
        await expect(this.enabledBox()).toBeChecked({checked: want, timeout: 30_000});
    }

    /** The row's "Settings" link (in the next row once the row's arrow is pressed). */
    settingsLink() {
        return this.grid()
            .locator('tr[id$="-row-urnpubidplugin"] + tr')
            .getByRole('link', {name: 'Settings', exact: true});
    }

    /** Press the row's arrow (once: a second press hangs, pitfall 10) and "Settings"; wait for the window. */
    async openSettings() {
        const arrow = this.row().locator('a.show_extras');
        await expect(arrow).toBeVisible({timeout: 30_000});
        await arrow.click();
        await expect(this.settingsLink()).toBeVisible({timeout: 30_000});
        await this.settingsLink().click();
        await expect(this.prefixBox()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    // --- the settings window -----------------------------------------------

    form() {
        return this.page.locator('#urnSettingsForm');
    }

    /** The window, named after its title ("URN"). */
    window() {
        return this.page.getByRole('dialog').filter({has: this.form()});
    }

    /** A kind's box under "Journal Content" / "Press Content" by label ("Articles", …). */
    kindBox(label) {
        return this.form().getByRole('checkbox', {name: label, exact: true});
    }

    /** A "URN Suffix" radio by value: `default`, `customId`, `pattern`. */
    suffixRadio(value) {
        return this.form().locator(`input[type=radio][name="urnSuffix"][value="${value}"]`);
    }

    checkNumberBox() {
        return this.form().locator('input[name="urnCheckNo"]');
    }

    prefixBox() {
        return this.form().locator('input[name="urnPrefix"]');
    }

    namespaceSelect() {
        return this.form().locator('select[name="urnNamespace"]');
    }

    resolverBox() {
        return this.form().locator('input[name="urnResolver"]');
    }

    /** The "Namespace" list's entries, in order. */
    async namespaceOptions() {
        return this.namespaceSelect()
            .locator('option')
            .evaluateAll((opts) => opts.map((o) => (o.textContent || '').trim()));
    }

    /** "Reassign URNs" (a link in the window). */
    reassignButton() {
        return this.form()
            .getByRole('link', {name: 'Reassign URNs', exact: true})
            .or(this.form().getByRole('button', {name: 'Reassign URNs', exact: true}));
    }

    /** The browser's message under a box, by the box's `name` ("urnPrefix", …). */
    fieldError(name) {
        return this.form().locator(`label.error[for^="${name}"]`);
    }

    /** The server's refusal at the top of the window ("Errors occurred processing this form:" and its list). */
    formErrors() {
        return this.form().locator('#formErrors');
    }

    /** The top list's items. */
    formErrorItems() {
        return this.formErrors().locator('li');
    }

    /** Set a kind box to the given state. */
    async setKind(label, want) {
        if (want) {
            await this.kindBox(label).check();
        } else {
            await this.kindBox(label).uncheck();
        }
    }

    /**
     * Press "Save" on a window the browser refuses: returns how many posts
     * left the page until `refusal` showed (0 when nothing was sent).
     *
     * @param {import('@playwright/test').Locator} refusal
     */
    async saveRefusedInBrowser(refusal) {
        let sent = 0;
        const onRequest = (request) => {
            if (request.method() === 'POST' && /\/manage\b|verb=save/.test(request.url())) {
                sent += 1;
            }
        };
        this.page.on('request', onRequest);
        try {
            await this.form().getByRole('button', {name: 'Save', exact: true}).click();
            await expect(refusal).toBeVisible({timeout: 30_000});
        } finally {
            this.page.off('request', onRequest);
        }
        await expect(this.form()).toBeVisible();
        return sent;
    }

    /** Press "Save" on a window the server refuses: the window stays with the top list. */
    async saveRefusedByServer() {
        const answered = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/manage\b/.test(r.url()),
            {timeout: 30_000}
        );
        await this.form().getByRole('button', {name: 'Save', exact: true}).click();
        await answered;
        await waitForJQueryIdle(this.page);
        await expect(this.formErrors()).toBeVisible({timeout: 30_000});
    }

    /** Press "Save" on a window the server accepts: it closes with the notice. */
    async saveAccepted() {
        const answered = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/manage\b/.test(r.url()) && r.ok(),
            {timeout: 30_000}
        );
        await this.form().getByRole('button', {name: 'Save', exact: true}).click();
        await answered;
        await expect(this.form()).toHaveCount(0, {timeout: 30_000});
        await expect(this.page.getByText(TEXT.settingsSaved).first()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
    }

    /** Press "Reassign URNs" and return its question (not answered). */
    async pressReassign() {
        await this.reassignButton().click();
        const question = questionDialog(this.page, TEXT.reassignQuestion);
        await expect(question).toBeVisible({timeout: 30_000});
        return question;
    }
};

// -------------------------------------------------------------------------
// The workflow's Publication › "Identifiers" page, and the Metadata page's box
// -------------------------------------------------------------------------

exports.IdentifiersPage = class IdentifiersPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('./WorkflowPage.js').WorkflowPage} frame the workflow panel
     */
    constructor(page, frame) {
        super(page);
        this.frame = frame;
    }

    /**
     * Open a version's "Identifiers" page by address (the menu key
     * `publication_{publicationId}_identifiers`) and wait for its heading
     * and the "URN" field. Also the way to "reload" the page.
     */
    async open(submissionId, publicationId) {
        await this.frame.gotoEditorial(submissionId, {menuKey: `publication_${publicationId}_identifiers`});
        await this.expectLoaded();
    }

    /** The page is on screen: its heading and the "URN" field. */
    async expectLoaded() {
        await this.frame.expectPageHeading('Identifiers');
        await expect(this.box()).toBeVisible({timeout: 30_000});
    }

    /** Select "Identifiers" in the side menu. */
    async select() {
        await this.frame.selectPage('Identifiers');
        await expect(this.box()).toBeVisible({timeout: 30_000});
    }

    /** The "URN" field (label, box, buttons, help, message). */
    field() {
        return this.frame.dialog().locator('.pkpFormField').filter({hasText: 'URN'}).first();
    }

    box() {
        return this.field().locator('input').first();
    }

    assignButton() {
        return this.field().getByRole('button', {name: 'Assign', exact: true});
    }

    clearButton() {
        return this.field().getByRole('button', {name: 'Clear', exact: true});
    }

    addCheckNumberButton() {
        return this.field().getByRole('button', {name: 'Add Check Number', exact: true});
    }

    /** A message under the box (`.pkpFieldError`) carrying `text`. */
    fieldError(text) {
        return this.field().locator('.pkpFieldError').filter({hasText: text});
    }

    /** The page's footer "Save". */
    saveButton() {
        return this.frame.dialog().getByRole('button', {name: 'Save', exact: true});
    }

    /** "Save", bounded by the publication write answering OK and the "Saved" status. */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
            {timeout: 30_000}
        );
        await this.saveButton().click();
        await saved;
        await expect(this.frame.dialog().locator('[role="status"]').filter({hasText: 'Saved'})).toBeVisible({
            timeout: 30_000,
        });
    }

    /** "Save" the server refuses: returns the refusing response. */
    async saveRefused() {
        const refused = this.page.waitForResponse(
            (r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST' && !r.ok(),
            {timeout: 30_000}
        );
        await this.saveButton().click();
        return refused;
    }

    /** The Metadata page's "Publisher ID" box (Rule 2). */
    metadataPublisherIdBox() {
        return this.frame.dialog().getByRole('textbox', {name: 'Publisher ID', exact: true});
    }
};

// -------------------------------------------------------------------------
// The legacy windows' "Identifiers" tab
// -------------------------------------------------------------------------

class LegacyIdentifiersWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} dialog the window
     */
    constructor(page, dialog) {
        super(page);
        this.dialog = dialog;
    }

    /** A tab of the window by name. */
    tab(name) {
        return this.dialog.getByRole('tab', {name, exact: true});
    }

    /** The window's tab names, in order. */
    async tabNames() {
        return (await this.dialog.getByRole('tab').allInnerTexts()).map((t) => t.trim());
    }

    /** Press the "Identifiers" tab and wait for its form (loaded by AJAX). */
    async openIdentifiersTab() {
        await this.tab('Identifiers').click();
        await expect(this.form()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** The tab's form. */
    form() {
        return this.dialog.locator('#publicIdentifiersForm');
    }

    publisherIdBox() {
        return this.form().getByRole('textbox', {name: 'Publisher ID', exact: true});
    }

    /** The area headed "URN" (Rule 12). */
    urnArea() {
        return this.form().locator('[id^="pubIdURNFormArea"]');
    }

    /** The issue's "Clear Issue Objects URNs" block (Rule 15). */
    objectsArea() {
        return this.form().locator('[id^="pubIdURNIssueobjectsFormArea"]');
    }

    urnPrefixBox() {
        return this.form().locator('input[name="urnPrefix"]');
    }

    urnSuffixBox() {
        return this.form().locator('input[name="urnSuffix"]');
    }

    /** The box that assigns the URN on "Save" (its label is not a label[for]). */
    assignBox() {
        return this.form().locator('input[name="assignURN"]');
    }

    addCheckNumberButton() {
        return this.form().getByRole('button', {name: 'Add Check Number'});
    }

    clearLink() {
        return this.urnArea().getByRole('link', {name: 'Clear', exact: true});
    }

    /** The tab's "Save" (greyed on a read-only tab). */
    saveButton() {
        return this.form().getByRole('button', {name: 'Save', exact: true});
    }

    clearIssueObjectsLink() {
        return this.objectsArea().getByRole('link', {name: 'Clear Issue Objects URNs', exact: true});
    }

    /** Press the tab's "Save" and wait for the window to close (accepted, no notice). */
    async save() {
        const answered = this.page.waitForResponse(
            (r) => /update-identifiers/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.form().getByRole('button', {name: 'Save', exact: true}).click();
        await answered;
        await expect(this.dialog).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
    }

    /** Press "Save" on a tab that refuses: the tab re-renders with the error box; the window stays. */
    async saveRefused() {
        const answered = this.page.waitForResponse(
            (r) => /update-identifiers/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.form().getByRole('button', {name: 'Save', exact: true}).click();
        await answered;
        await waitForJQueryIdle(this.page);
        await expect(this.form()).toContainText(TEXT.formErrors, {timeout: 30_000});
        await expect(this.dialog).toBeVisible();
    }

    /** Close the window with its header "Close" (a typed change raises the caller's confirm). */
    async close() {
        await this.dialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(this.dialog).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
    }

    /**
     * Press a "Clear" link of the tab ("Clear" or "Clear Issue Objects
     * URNs") and return the "Delete" question it raises (not answered).
     *
     * @param {import('@playwright/test').Locator} link
     * @param {string} question the question's text
     */
    async pressClear(link, question) {
        await link.click();
        const dialog = questionDialog(this.page, question);
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }
}
exports.LegacyIdentifiersWindow = LegacyIdentifiersWindow;

/** The request "OK" sends from a tab's "Clear". */
exports.CLEAR_REQUEST = /clear-pub-id/;
/** The request "OK" sends from "Clear Issue Objects URNs". */
exports.CLEAR_ISSUE_OBJECTS_REQUEST = /clear-issue-objects-pub-ids/;
/** The request "OK" sends from "Reassign URNs". */
exports.REASSIGN_REQUEST = /clearPubIds|clear-pub-ids/;

// -------------------------------------------------------------------------
// The workflow's Publication › "Galleys" page (journal, preprint server)
// -------------------------------------------------------------------------

exports.GalleysPage = class GalleysPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('./WorkflowPage.js').WorkflowPage} frame
     */
    constructor(page, frame) {
        super(page);
        this.frame = frame;
    }

    /** Open a version's "Galleys" page by address. */
    async open(submissionId, publicationId) {
        await this.frame.gotoEditorial(submissionId, {menuKey: `publication_${publicationId}_galleys`});
        await this.frame.expectPageHeading('Galleys');
    }

    /** A galley's row by its label ("PDF"). */
    row(label) {
        return this.frame
            .dialog()
            .locator('tbody tr')
            .filter({hasText: label});
    }

    /** The galley window the row menu's "Edit" opens. */
    window() {
        return this.page.getByRole('dialog', {name: 'Upload a File Ready for Publication'});
    }

    /** The row menu's "Edit": the window with its tabs. */
    async openEdit(label) {
        const row = this.row(label);
        await expect(row).toBeVisible({timeout: 30_000});
        await row.getByRole('button').last().click();
        await this.page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const win = new LegacyIdentifiersWindow(this.page, this.window());
        await expect(win.tab('Edit Metadata')).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        return win;
    }

    /** The row menu's "Edit", then "Identifiers". */
    async openIdentifiers(label) {
        const win = await this.openEdit(label);
        await win.openIdentifiersTab();
        return win;
    }

    /**
     * Open a version's "Galleys" page in the author's view (My Submissions)
     * by address.
     */
    async openAuthor(submissionId, publicationId) {
        await this.frame.gotoAuthor(submissionId, {menuKey: `publication_${publicationId}_galleys`});
        await this.frame.expectPageHeading('Galleys');
    }

    /**
     * Press a galley row's menu button and return the items it offers, in
     * order; the menu stays open for the caller's pick (`pickMenuItem`).
     */
    async openMenu(label) {
        const row = this.row(label);
        await expect(row).toBeVisible({timeout: 30_000});
        await row.getByRole('button').last().click();
        const items = this.page.getByRole('menuitem');
        await expect(items.first()).toBeVisible({timeout: 30_000});
        return (await items.allInnerTexts()).map((t) => t.trim());
    }

    /** The "View Galley" window a posted preprint's "View" opens for its Author. */
    viewWindow() {
        return this.page.getByRole('dialog', {name: 'View Galley'});
    }

    /**
     * Pick an item of the open row menu ("Edit" or "View") and return the
     * window it opens, loaded on its "Edit Metadata" tab.
     *
     * @param {'Edit'|'View'} item
     */
    async pickMenuItem(item) {
        await this.page.getByRole('menuitem', {name: item, exact: true}).click();
        const win = new LegacyIdentifiersWindow(this.page, item === 'View' ? this.viewWindow() : this.window());
        await expect(win.tab('Edit Metadata')).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        return win;
    }
};

// -------------------------------------------------------------------------
// Issues (journal only)
// -------------------------------------------------------------------------

exports.IssuesPage = class IssuesPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /** Open Issues on "Future Issues" or, with `back`, "Back Issues". */
    async open({back = false} = {}) {
        await this.page.goto(this.contextUrl(this.contextPath, '/manageIssues'));
        if (back) {
            await this.page
                .getByRole('tab', {name: 'Back Issues'})
                .or(this.page.getByRole('link', {name: 'Back Issues', exact: true}))
                .first()
                .click();
        }
        await expect(this.page.locator('tr.gridRow').filter({visible: true}).first()).toBeVisible({
            timeout: 30_000,
        });
        await waitForJQueryIdle(this.page);
    }

    /** An issue's row by its identification ("Vol. 1 No. 2 (2026)"). */
    row(identification) {
        return this.page.locator('tr.gridRow').filter({hasText: identification}).filter({visible: true});
    }

    /** Press the row's arrow and one of its control links ("Edit", "Publish Issue", …). */
    async rowAction(identification, linkName) {
        const row = this.row(identification);
        await expect(row).toBeVisible({timeout: 30_000});
        const id = await row.getAttribute('id');
        await row.locator('a.show_extras').click();
        const link = this.page.locator(`[id="${id}-control-row"]`).getByRole('link', {name: linkName, exact: true});
        await expect(link).toBeVisible({timeout: 30_000});
        await link.click();
    }

    /** The issue's "Edit" window. */
    editWindow(identification) {
        return this.page.getByRole('dialog', {name: `Issue Management: ${identification}`});
    }

    /** Open the issue's "Edit" window. */
    async openEdit(identification) {
        await this.rowAction(identification, 'Edit');
        const win = new LegacyIdentifiersWindow(this.page, this.editWindow(identification));
        await expect(win.tab('Table of Contents')).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        return win;
    }

    /** Open the issue's "Edit" window, then "Identifiers". */
    async openIdentifiers(identification) {
        const win = await this.openEdit(identification);
        await win.openIdentifiersTab();
        return win;
    }

    /** Open the row's "Publish Issue" window. */
    async openPublishIssue(identification) {
        await this.rowAction(identification, 'Publish Issue');
        const win = new PublishIssueWindow(this.page);
        await expect(win.mailBox()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        return win;
    }
};

class PublishIssueWindow extends BasePage {
    dialog() {
        return this.page.getByRole('dialog', {name: 'Publish Issue', exact: true});
    }

    /** "Send an email about this to all registered users." (the issue feature's). */
    mailBox() {
        return this.dialog().locator('input[name="sendIssueNotification"]');
    }

    /** The window's "URN" group. */
    urnArea() {
        return this.dialog().getByRole('group', {name: 'URN'});
    }

    assignBox() {
        return this.dialog().locator('input[name="assignURN"]');
    }

    /** "OK": the issue is published; bounded by the publish answer. */
    async ok() {
        const published = this.page.waitForResponse(
            (r) => /publish-issue/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
            {timeout: 30_000}
        );
        await this.dialog().getByRole('button', {name: 'OK', exact: true}).click();
        await published;
        await expect(this.dialog()).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
    }
}
exports.PublishIssueWindow = PublishIssueWindow;

// -------------------------------------------------------------------------
// Reader pages and the publish confirmation window
// -------------------------------------------------------------------------

/** A reader page's URN links (an `a` whose address carries "urn:"). */
exports.readerUrnLinks = function readerUrnLinks(page) {
    return page.locator('a[href*="urn:"]');
};

/** The article page's "URN" heading (Rule 21). */
exports.articleUrnHeading = function articleUrnHeading(page) {
    return page.getByRole('heading', {name: 'URN', exact: true});
};

/** The publish confirmation window's URN table (headed "URN" and "Item"). */
exports.publishUrnTable = function publishUrnTable(dialog) {
    return dialog
        .getByRole('table')
        .filter({has: dialog.page().getByRole('columnheader', {name: 'URN', exact: true})});
};

/** A row of that table by its item ("Publication", "Galley: PDF"). */
exports.publishUrnRow = function publishUrnRow(dialog, item) {
    return exports
        .publishUrnTable(dialog)
        .getByRole('row')
        .filter({hasText: item});
};
