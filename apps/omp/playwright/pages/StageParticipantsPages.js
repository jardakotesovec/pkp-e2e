// @ts-check
/**
 * @file playwright/pages/StageParticipantsPages.js
 *
 * OMP-local Page Objects for the Stage participants feature (spec:
 * docs/specs/U35-stage-participants.md), in the press's own words: the
 * workflow's "Participants" panel and its rows, the "Assign Participant",
 * "Edit Assignment" and "Notify" legacy windows, the "Remove Participant"
 * and "Login As" dialogs, the panel's "Logout as" entry, the stage's
 * discussions panel and a discussion's window, and the settings forms
 * scenario 6 flips (the Roles form's recommend-only box, a series'
 * "Editorial Assignments" boxes, the "Editor Assigned (Auto)" template's
 * subject).
 *
 * A press has five stage entries (Submission, Internal Review, External
 * Review, Copyediting, Production); its review rounds sit under "Internal
 * Review" (workflow_2_<roundId>) and "External Review" (workflow_3_<roundId>),
 * and the Internal Review stage entry itself carries no Participants panel
 * (register OMP1). The workflow frame (opening, the side menu, the Activity
 * Log) is the shared `WorkflowPage`, held as `frame` with the press's
 * "External Review" label. The row helper of `ReviewStagePages.js`
 * (`participantRow`) stays there for the suites that use it; this file
 * reads the panel through CSS anchored on `[data-cy="participant-manager"]`,
 * because for about 450 ms after an inner legacy window closes the workflow
 * dialog is aria-hidden and a role query finds no row (U35 claim check,
 * screen-notes 2026-09-20).
 *
 * The shape is the OJS suite's `StageParticipantsPages.js`, copied (never
 * imported across apps). Strings are the live locale strings
 * (lib/pkp/locale/en/*.po); the DOM shapes come from the U35 claim check's
 * kept scripts (shared/playwright/checks/U35) and were confirmed by this
 * suite's run.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');
const {WorkflowPage: WorkflowFrame} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {waitForJQueryIdle} = require('../../../../shared/playwright/support/legacy.js');
const {ManageEmailsPage} = require('./DecisionSettingsPages.js');

/** The panel's strings (Rules 1, 5a). */
const RECOMMEND_ONLY_LINE = 'Only allowed to recommend an editorial decision';
const ASSIGN_WINDOW = 'Assign Participant';
const EDIT_WINDOW = 'Edit Assignment';
const NOTIFY_WINDOW = 'Notify';
const REMOVE_DIALOG = 'Remove Participant';
const REMOVE_QUESTION = 'You are about to remove this participant from all stages.';
const NO_CHANGES = 'No changes can be made to this participant';
const PRIVILEGES_HEADING = 'Assignment privileges';
const PERMISSIONS_HEADING = 'Permissions';
const PRIVILEGES_LABEL =
    'This participant is only allowed to recommend an editorial decision and will require an authorised editor to record editorial decisions.';
const TEMPLATE_PROMPT = 'Choose a predefined message to use, or fill out the form below.';
const NOTIFY_EMPTY_MESSAGE =
    'Please ensure that you have filled out the message field and included someone other than yourself in the discussion.';
const LEAVE_QUESTION = 'The data on this form has changed. Do you wish to continue without saving?';

/** The "Login As" dialog's sentence (Rule 9). */
const LOGIN_AS_QUESTION = 'Log in as this user? All actions you perform will be attributed to this user.';

/** The toasts (Rules 4f, 7, 8a). */
const ADDED_TOAST = 'User added as a stage participant.';
const CHANGED_TOAST = 'The stage assignment has been changed.';
const SENT_TOAST = 'Notification sent to users.';

/** The refusal a removed participant's landing answers (Rule 10). */
const NO_ROLE_ACCESS = 'The current role does not have access to this operation.';

/** The managers' task on a press (Rule 12). */
const NEEDS_EDITOR_TASK = 'A new monograph has been submitted to which an editor needs to be assigned.';

/** The press's stage entries' menu keys. */
const MENU_KEY = {
    submission: 'workflow_1',
    'internal review': 'workflow_2',
    'external review': 'workflow_3',
    copyediting: 'workflow_4',
    production: 'workflow_5',
};

/** The press's review stage label the shared frame uses for round headings. */
const REVIEW_STAGE = 'External Review';

exports.RECOMMEND_ONLY_LINE = RECOMMEND_ONLY_LINE;
exports.ASSIGN_WINDOW = ASSIGN_WINDOW;
exports.EDIT_WINDOW = EDIT_WINDOW;
exports.NOTIFY_WINDOW = NOTIFY_WINDOW;
exports.REMOVE_DIALOG = REMOVE_DIALOG;
exports.REMOVE_QUESTION = REMOVE_QUESTION;
exports.NO_CHANGES = NO_CHANGES;
exports.PRIVILEGES_HEADING = PRIVILEGES_HEADING;
exports.PERMISSIONS_HEADING = PERMISSIONS_HEADING;
exports.PRIVILEGES_LABEL = PRIVILEGES_LABEL;
exports.TEMPLATE_PROMPT = TEMPLATE_PROMPT;
exports.NOTIFY_EMPTY_MESSAGE = NOTIFY_EMPTY_MESSAGE;
exports.LEAVE_QUESTION = LEAVE_QUESTION;
exports.LOGIN_AS_QUESTION = LOGIN_AS_QUESTION;
exports.ADDED_TOAST = ADDED_TOAST;
exports.CHANGED_TOAST = CHANGED_TOAST;
exports.SENT_TOAST = SENT_TOAST;
exports.NO_ROLE_ACCESS = NO_ROLE_ACCESS;
exports.NEEDS_EDITOR_TASK = NEEDS_EDITOR_TASK;
exports.MENU_KEY = MENU_KEY;
exports.REVIEW_STAGE = REVIEW_STAGE;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The HTML and text of the TinyMCE editor behind `textarea[name="message"]`
 * of the topmost open window (the legacy windows render one such box).
 *
 * @param {import('@playwright/test').Page} page
 */
async function readMessage(page) {
    return page.evaluate(() => {
        const textarea = [...document.querySelectorAll('[role="dialog"] textarea[name="message"]')].pop();
        const mce = /** @type {any} */ (window).tinymce || /** @type {any} */ (window).tinyMCE;
        const editor = textarea && mce?.get(textarea.id);
        if (!editor) {
            return {html: null, text: null};
        }
        return {html: editor.getContent(), text: editor.getContent({format: 'text'}).replace(/\s+/g, ' ').trim()};
    });
}

/**
 * Choose an entry of a window's "Choose a predefined message…" list and
 * wait for the template's body to land in the "Message" box (it arrives by
 * AJAX; saving before it lands sends an empty message).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {string} label
 */
async function chooseTemplateIn(page, dialog, label) {
    await dialog.locator('select[name="template"]').selectOption({label});
    await expect.poll(async () => (await readMessage(page)).text, {timeout: 30_000}).not.toBe('');
    await waitForJQueryIdle(page);
}

// ---------------------------------------------------------------------------
// The panel (Rules 1–3, 9)
// ---------------------------------------------------------------------------

exports.ParticipantsPanel = class ParticipantsPanel extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        /** The shared workflow frame (opening, side menu, Activity Log), with the press's review label. */
        this.frame = new WorkflowFrame(page, contextPath, {labels: {reviewStage: REVIEW_STAGE}});
    }

    /** Open the workflow on the editorial dashboard at a stage entry ("Submission", "External Review", "Copyediting", …). */
    async gotoStage(submissionId, stage) {
        const key = MENU_KEY[stage.toLowerCase()];
        await this.frame.gotoEditorial(submissionId, {menuKey: key});
        await this.frame.expectStageHeading(stage);
    }

    /**
     * Open the workflow at a review round's entry ("Review Round 1"), on the
     * press's External Review by default (`stage: 'Internal Review'` for an
     * internal round, whose panel sits on the round entry alone, OMP1).
     */
    async gotoRound(submissionId, roundId, round = 1, stage = REVIEW_STAGE) {
        await this.frame.gotoEditorial(submissionId, {menuKey: `${MENU_KEY[stage.toLowerCase()]}_${roundId}`});
        await this.frame.expectHeading(`Workflow: ${stage} (Round ${round})`);
    }

    /** The panel: `[data-cy="participant-manager"]`, read page-wide (see the file header). */
    panel() {
        return this.page.locator('[data-cy="participant-manager"]');
    }

    /** The "Participants" heading (its innerText is CSS-uppercased). */
    heading() {
        return this.panel().locator('h3');
    }

    /** The "Assign" button beside the heading. */
    assignButton() {
        return this.panel().locator('button').filter({hasText: /^\s*Assign\s*$/});
    }

    /** The "Logout as {name}" entry the list opens with while impersonating (Rule 9). */
    logoutAsEntry(name = null) {
        const pattern = name ? new RegExp(`^\\s*Logout as ${escapeRegExp(name)}\\s*$`) : /^\s*Logout as /;
        return this.panel().locator('button').filter({hasText: pattern});
    }

    /** Every participant row (a list item carrying a "{name} More Actions" button). */
    rows() {
        return this.panel().locator('ul > li').filter({has: this.page.locator('button[aria-label$="More Actions"]')});
    }

    /** The rows whose text carries `name` (a person in two roles has two; add `role` to pick one). */
    row(name, role = null) {
        let rows = this.rows().filter({hasText: name});
        if (role) {
            // The name and role lines are adjacent text nodes (no whitespace between them).
            rows = rows.filter({hasText: new RegExp(`${escapeRegExp(name)}\\s*${escapeRegExp(role)}(\\s|$|[A-Z])`)});
        }
        return rows;
    }

    /** The row's bold full name. */
    rowName(row) {
        return row.locator('.text-base-bold').first();
    }

    /** The row's initials circle. */
    rowAvatar(row) {
        return row.locator('.rounded-full').first();
    }

    /** The row filtered to those carrying the "Only allowed to recommend an editorial decision" line (0 or 1). */
    recommendLine(row) {
        return row.filter({hasText: RECOMMEND_ONLY_LINE});
    }

    /** The row's "…" menu button, announced as "{name} More Actions". */
    moreActions(row) {
        return row.locator('button[aria-label$="More Actions"]');
    }

    /** Every row's bold name, top to bottom (a settled poll by the caller). */
    async rowNames() {
        return this.rows().locator('.text-base-bold').allInnerTexts();
    }

    /** The rows read as "{name} | {role}" top to bottom. */
    async rowSummaries() {
        return this.rows().evaluateAll((items) =>
            items.map((li) => {
                const lines = [...li.querySelectorAll('.flex-col > *')]
                    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                return lines.join(' | ');
            })
        );
    }

    /** The open menu's items (headlessui portals them to the document root). */
    menuItems() {
        return this.page.getByRole('menuitem');
    }

    /** Press the row's "…" and wait for its first entry. */
    async openMenu(row) {
        await this.moreActions(row).click();
        await expect(this.menuItems().first()).toBeVisible({timeout: 30_000});
        return this.menuItems();
    }

    /** Press the row's "…" again to close the menu (never Escape: it closes the workflow too). */
    async closeMenu(row) {
        await this.moreActions(row).click();
        await expect(this.menuItems()).toHaveCount(0, {timeout: 30_000});
    }

    /** The row's menu holds exactly these entries, in this order; the menu is closed again. */
    async expectMenu(row, labels) {
        await this.openMenu(row);
        await expect(this.menuItems()).toHaveText(labels, {timeout: 30_000});
        await this.closeMenu(row);
    }

    /** Open the row's menu and press one entry by its exact name. */
    async clickAction(row, name) {
        await this.openMenu(row);
        await this.menuItems().filter({hasText: new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`)}).click();
    }

    /** Row › "Edit": the "Edit Assignment" window, settled. */
    async openEdit(row) {
        await this.clickAction(row, 'Edit');
        const win = new exports.EditAssignmentWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** Row › "Notify": the "Notify" window, settled. */
    async openNotify(row) {
        await this.clickAction(row, 'Notify');
        const win = new exports.NotifyWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** Row › "Remove": the "Remove Participant" dialog. */
    async openRemove(row) {
        await this.clickAction(row, 'Remove');
        const dialog = new exports.RemoveParticipantDialog(this.page);
        await dialog.expectOpen();
        return dialog;
    }

    /** Row › "Login As": the "Login As" dialog (Rule 9). */
    async openLoginAs(row) {
        await this.clickAction(row, 'Login As');
        const dialog = new exports.LoginAsDialog(this.page);
        await dialog.expectOpen();
        return dialog;
    }

    /** "Assign": the "Assign Participant" window, settled on its role list. */
    async openAssign() {
        await this.assignButton().click();
        const win = new exports.AssignParticipantWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** The stage's discussions panel. */
    discussions() {
        return new exports.DiscussionsPanel(this.page);
    }
};

// ---------------------------------------------------------------------------
// "Assign Participant" (Rule 4)
// ---------------------------------------------------------------------------

exports.AssignParticipantWindow = class AssignParticipantWindow extends BasePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        super(page);
        this.dialog = page.getByRole('dialog', {name: ASSIGN_WINDOW, exact: true});
    }

    /** The window is open with its role list rendered and jQuery idle. */
    async expectOpen() {
        await expect(this.dialog).toBeVisible({timeout: 30_000});
        await expect(this.roleList()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** The unlabelled role list, first in the window (Rule 4a). */
    roleList() {
        return this.dialog.locator('select[name="filterUserGroupId"]');
    }

    /** The role list's entries, top to bottom. */
    async roleOptions() {
        return this.roleList().locator('option').allInnerTexts().then((texts) => texts.map((t) => t.trim()));
    }

    /** The entry selected now. */
    async selectedRole() {
        return this.roleList().evaluate((el) => /** @type {HTMLSelectElement} */ (el).selectedOptions[0]?.text.trim());
    }

    /** Select a role; the person list does not reload until "Search" (Rule 4b). */
    async selectRole(label) {
        await this.roleList().selectOption({label});
        await waitForJQueryIdle(this.page);
    }

    /** "Search User By Name". */
    nameBox() {
        return this.dialog.locator('input[name="name"]').first();
    }

    /** The "Search" button of the search form. */
    searchButton() {
        return this.dialog.locator('form[id^="searchUserFilter"]').getByRole('button', {name: 'Search', exact: true});
    }

    /** Type a name (or clear the box) and press "Search"; returns once the list re-rendered. */
    async search(text = '') {
        await this.nameBox().fill(text);
        const fetched = this.page.waitForResponse((r) => /fetch-grid/.test(r.url()), {timeout: 30_000});
        await this.searchButton().click();
        await fetched;
        await waitForJQueryIdle(this.page);
    }

    /** The "Locate a User" list (the legacy user-select grid). */
    personGrid() {
        return this.dialog.locator('.pkp_controllers_grid').first();
    }

    /** The list's column headings, left to right. */
    async columnHeadings() {
        const texts = await this.personGrid().locator('thead th').allInnerTexts();
        return texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    }

    /** The person rows (each with a radio button at its start). */
    personRows() {
        return this.personGrid().locator('tr').filter({has: this.page.locator('input[name="userId"]')});
    }

    /** The person row carrying `name`. */
    personRow(name) {
        return this.personRows().filter({hasText: name});
    }

    /** The empty list's "No Items" cell. */
    noItems() {
        return this.dialog.getByText('No Items', {exact: true});
    }

    /** Choose a person: their radio button; the boxes render after it (Rule 4c). */
    async choose(name) {
        const row = this.personRow(name);
        await expect(row).toHaveCount(1, {timeout: 30_000});
        await row.locator('input[name="userId"]').check();
        await waitForJQueryIdle(this.page);
    }

    /** The "Assignment privileges" heading (present for editor- and manager-level roles). */
    privilegesHeading() {
        return this.dialog.getByText(PRIVILEGES_HEADING, {exact: true});
    }

    /** The "Permissions" heading (present for every role but a manager-level one). */
    permissionsHeading() {
        return this.dialog.getByText(PERMISSIONS_HEADING, {exact: true});
    }

    /** The recommend-only box under "Assignment privileges". */
    recommendOnlyBox() {
        return this.dialog.locator('input[name="recommendOnly"]');
    }

    /** The metadata box under "Permissions". */
    metadataBox() {
        return this.dialog.locator('input[name="canChangeMetadata"]');
    }

    /** The "Choose a predefined message…" list. */
    templateList() {
        return this.dialog.locator('select[name="template"]');
    }

    /** The list's entries. */
    async templateOptions() {
        return this.templateList().locator('option').allInnerTexts().then((texts) => texts.map((t) => t.trim()));
    }

    /** Choose a predefined message and wait for "Message" to fill (Rule 4e). */
    async chooseTemplate(label) {
        await chooseTemplateIn(this.page, this.dialog, label);
    }

    /** The "Message" box's HTML and text. */
    async message() {
        return readMessage(this.page);
    }

    okButton() {
        return this.dialog.getByRole('button', {name: 'OK', exact: true});
    }

    /** The FBV form's "Cancel", a link. */
    cancelLink() {
        return this.dialog.getByRole('link', {name: 'Cancel', exact: true});
    }

    /** The window's "Close" arrow in its header. */
    closeArrow() {
        return this.dialog.getByRole('button', {name: 'Close', exact: true}).first();
    }

    /** Press "OK" and wait for the save's answer; the caller reads what follows. */
    async ok() {
        const saved = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /save-participant/.test(r.url()),
            {timeout: 30_000}
        );
        await this.okButton().click();
        const response = await saved;
        await waitForJQueryIdle(this.page);
        return response;
    }

    /** Press "OK" and wait for the window to close (a saved assignment). */
    async okAndClose() {
        const response = await this.ok();
        await expect(this.dialog).toBeHidden({timeout: 30_000});
        return response;
    }

    /** Press "Cancel" (silent) and wait for the window to close. */
    async cancel() {
        await this.cancelLink().click();
        await expect(this.dialog).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }
};

// ---------------------------------------------------------------------------
// "Edit Assignment" (Rule 7)
// ---------------------------------------------------------------------------

exports.EditAssignmentWindow = class EditAssignmentWindow extends BasePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        super(page);
        this.dialog = page.getByRole('dialog', {name: EDIT_WINDOW, exact: true});
    }

    /** The window is open and its AJAX-loaded form landed: a box or the "No changes" sentence. */
    async expectOpen() {
        await expect(this.dialog).toBeVisible({timeout: 30_000});
        await expect(
            this.dialog.locator('input[name="recommendOnly"], input[name="canChangeMetadata"]').or(this.noChangesText()).first()
        ).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** "Participant" reads "{name} ({role})" (the name in bold). */
    async expectParticipant(name, role) {
        await expect(this.dialog.getByText('Participant', {exact: true})).toBeVisible();
        await expect(this.dialog.locator('strong, b').filter({hasText: name})).toBeVisible();
        await expect(this.dialog).toContainText(`${name} (${role})`);
    }

    privilegesHeading() {
        return this.dialog.getByText(PRIVILEGES_HEADING, {exact: true});
    }

    permissionsHeading() {
        return this.dialog.getByText(PERMISSIONS_HEADING, {exact: true});
    }

    recommendOnlyBox() {
        return this.dialog.locator('input[name="recommendOnly"]');
    }

    metadataBox() {
        return this.dialog.locator('input[name="canChangeMetadata"]');
    }

    /**
     * "No changes can be made to this participant": a bare text node of the
     * form's fieldset beside "Participant …", so the locator resolves to the
     * fieldset; assert it with `toBeVisible()` and the sentence with
     * `toContainText` on the dialog.
     */
    noChangesText() {
        return this.dialog.getByText(NO_CHANGES);
    }

    okButton() {
        return this.dialog.getByRole('button', {name: 'OK', exact: true});
    }

    cancelLink() {
        return this.dialog.getByRole('link', {name: 'Cancel', exact: true});
    }

    /** Press "OK", wait for the save's answer and the window to close. */
    async ok() {
        const saved = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /save-participant/.test(r.url()),
            {timeout: 30_000}
        );
        await this.okButton().click();
        const response = await saved;
        await expect(this.dialog).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        return response;
    }

    /**
     * Press "Cancel" and wait for the window to close. With a box changed the
     * browser asks "The data on this form has changed…": the caller registers
     * `page.on('dialog')` before the press (Playwright dismisses it otherwise
     * and the window stays open).
     */
    async cancel() {
        await this.cancelLink().click();
        await expect(this.dialog).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }
};

// ---------------------------------------------------------------------------
// "Notify" (Rule 8)
// ---------------------------------------------------------------------------

exports.NotifyWindow = class NotifyWindow extends BasePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        super(page);
        this.dialog = page.getByRole('dialog', {name: NOTIFY_WINDOW, exact: true});
    }

    async expectOpen() {
        await expect(this.dialog).toBeVisible({timeout: 30_000});
        await expect(this.templateList()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    templateList() {
        return this.dialog.locator('select[name="template"]');
    }

    async chooseTemplate(label) {
        await chooseTemplateIn(this.page, this.dialog, label);
    }

    async message() {
        return readMessage(this.page);
    }

    /** The one button, "Notify". */
    notifyButton() {
        return this.dialog.getByRole('button', {name: 'Notify', exact: true});
    }

    /** The window's controls besides "Notify": every button and link name. */
    async controlNames() {
        const buttons = await this.dialog.getByRole('button').allInnerTexts();
        const links = await this.dialog.getByRole('link').allInnerTexts();
        return [...buttons, ...links].map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    }

    /** Press "Notify" and wait for the send's answer; the caller reads what follows. */
    async notify() {
        const sent = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /send-notification/.test(r.url()),
            {timeout: 30_000}
        );
        await this.notifyButton().click();
        const response = await sent;
        await waitForJQueryIdle(this.page);
        return response;
    }

    /** The window's "Close" arrow. */
    closeArrow() {
        return this.dialog.getByRole('button', {name: 'Close', exact: true}).first();
    }
};

// ---------------------------------------------------------------------------
// "Remove Participant" (Rule 10)
// ---------------------------------------------------------------------------

exports.RemoveParticipantDialog = class RemoveParticipantDialog extends BasePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        super(page);
        this.dialog = page.getByRole('dialog', {name: REMOVE_DIALOG, exact: true});
    }

    async expectOpen() {
        await expect(this.dialog).toBeVisible({timeout: 30_000});
        await expect(this.dialog).toContainText(REMOVE_QUESTION);
        await expect(this.okButton()).toBeVisible();
        await expect(this.cancelButton()).toBeVisible();
    }

    okButton() {
        return this.dialog.getByRole('button', {name: 'OK', exact: true});
    }

    cancelButton() {
        return this.dialog.getByRole('button', {name: 'Cancel', exact: true});
    }

    async cancel() {
        await this.cancelButton().click();
        await expect(this.dialog).toBeHidden({timeout: 30_000});
    }

    /** "OK": wait for the removal's answer and the dialog to close. */
    async ok() {
        const removed = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /delete-participant/.test(r.url()),
            {timeout: 30_000}
        );
        await this.okButton().click();
        const response = await removed;
        await expect(this.dialog).toBeHidden({timeout: 30_000});
        return response;
    }
};

// ---------------------------------------------------------------------------
// "Login As" (Rule 9)
// ---------------------------------------------------------------------------

exports.LoginAsDialog = class LoginAsDialog extends BasePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        super(page);
        this.dialog = page.locator('[data-cy="dialog"]').filter({hasText: LOGIN_AS_QUESTION});
    }

    /** The dialog is open: its title, its sentence, "OK" and "Cancel". */
    async expectOpen() {
        await expect(this.dialog).toBeVisible({timeout: 30_000});
        await expect(this.dialog.getByRole('heading', {name: 'Login As', exact: true})).toBeVisible();
        await expect(this.okButton()).toBeVisible();
        await expect(this.cancelButton()).toBeVisible();
    }

    okButton() {
        return this.dialog.getByRole('button', {name: 'OK', exact: true});
    }

    cancelButton() {
        return this.dialog.getByRole('button', {name: 'Cancel', exact: true});
    }

    /** "OK": the browser continues as the person; the caller waits for the landing address. */
    async ok() {
        await this.okButton().click();
    }
};

// ---------------------------------------------------------------------------
// The stage's discussions panel (Rule 8a)
// ---------------------------------------------------------------------------

exports.DiscussionsPanel = class DiscussionsPanel extends BasePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        super(page);
    }

    panel() {
        return this.page.locator('[data-cy="discussion-manager"]').first();
    }

    /** The rows whose title carries `title`. */
    row(title) {
        return this.panel().locator('tbody tr').filter({hasText: title});
    }

    /** Open a row's title: the discussion's window, settled on its "Participants" heading. */
    async open(row, title) {
        await row.locator('button, a').filter({hasText: title}).first().click();
        const win = this.page.getByRole('dialog', {name: title, exact: true});
        await expect(win).toBeVisible({timeout: 30_000});
        await expect(win.getByRole('heading', {name: 'Participants', exact: true})).toBeVisible({timeout: 30_000});
        return win;
    }

    /** The numbered participant entries of an open discussion window ("1. Name (username) …"). */
    participantEntries(win) {
        return win.getByText(/^\s*\d+\.\s+/);
    }

    /** The window's entry for `name`. */
    participantEntry(win, name) {
        return win.getByText(new RegExp(`^\\s*\\d+\\.\\s+${escapeRegExp(name)}\\b`));
    }

    async close(win) {
        await win.getByRole('button', {name: /^(Close|Cancel)$/}).first().click();
        await expect(win).toBeHidden({timeout: 30_000});
    }
};

// ---------------------------------------------------------------------------
// Settings › Users & Roles › Roles › a role's form (Settings bullet 1)
// ---------------------------------------------------------------------------

exports.RolesSettingsPage = class RolesSettingsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /** Users & Roles, the "Roles" tab, its grid rendered. */
    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/access'));
        await expect(this.page.getByRole('heading', {name: 'Users & Roles'})).toBeVisible({timeout: 30_000});
        await this.page.getByRole('tab', {name: 'Roles', exact: true}).click();
        await expect(this.roleRow('Author')).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** The grid row of a role by its name cell. */
    roleRow(name) {
        return this.page
            .locator('tr.gridRow')
            .filter({has: this.page.locator('td').first().filter({hasText: new RegExp(`^\\s*(Settings\\s+)?${escapeRegExp(name)}\\s*$`)})});
    }

    /** The role's form ("Edit" under the row's arrow). */
    form() {
        return this.page.locator('form#userGroupForm');
    }

    recommendOnlyBox() {
        return this.form().locator('input[name="recommendOnly"]');
    }

    /** Open a role's form: the row's arrow, then the "Edit" link in the next row. */
    async openRole(name) {
        const row = this.roleRow(name);
        await expect(row).toHaveCount(1, {timeout: 30_000});
        await row.locator('a.show_extras').click();
        await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
        await expect(this.form()).toBeVisible({timeout: 30_000});
        await expect(this.recommendOnlyBox()).toBeAttached({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Press the form's "OK" (its save), wait for the write and the form to go. */
    async save() {
        const saved = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /update-user-group/.test(r.url()),
            {timeout: 30_000}
        );
        await this.form().getByRole('button', {name: /^(OK|Save)$/}).click();
        const response = await saved;
        expect(response.ok(), `the role form's save answered ${response.status()}`).toBe(true);
        await expect(this.form()).toBeHidden({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Set the role's recommend-only box and save; returns the box's state before. */
    async setRecommendOnly(name, checked) {
        await this.goto();
        await this.openRole(name);
        const before = await this.recommendOnlyBox().isChecked();
        await this.recommendOnlyBox().setChecked(checked);
        await this.save();
        return before;
    }

    /** Reopen the role's form and read the box (the settled read after a save). */
    async readRecommendOnly(name) {
        await this.goto();
        await this.openRole(name);
        const checked = await this.recommendOnlyBox().isChecked();
        await this.form().getByRole('link', {name: 'Cancel', exact: true}).click();
        await expect(this.form()).toBeHidden({timeout: 30_000});
        return checked;
    }
};

// ---------------------------------------------------------------------------
// Settings › Press › Series › a series' "Editorial Assignments" (Rule 11b)
// ---------------------------------------------------------------------------

exports.SeriesSettingsPage = class SeriesSettingsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /** Settings › Press, the "Series" tab, its grid rendered. */
    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/context'));
        await this.page.getByRole('tab', {name: 'Series', exact: true}).click();
        await expect(this.grid().locator('tr.gridRow').first()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    grid() {
        return this.page.locator('#seriesGridContainer');
    }

    form() {
        return this.page.locator('form#seriesForm');
    }

    /** Open a series' form by its title. */
    async openSeries(title) {
        const row = this.grid().locator('tr.gridRow').filter({hasText: title}).first();
        await row.locator('a.show_extras').click();
        await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
        await expect(this.form().locator('input[name^="subEditors"]').first()).toBeAttached({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** The ticked "Editorial Assignments" boxes' labels ("Assign {name} as {role}"). */
    async tickedAssignments() {
        return this.form()
            .locator('input[name^="subEditors"]')
            .evaluateAll((boxes) =>
                boxes
                    .filter((box) => /** @type {HTMLInputElement} */ (box).checked)
                    .map((box) => {
                        const input = /** @type {HTMLInputElement} */ (box);
                        const label = input.labels?.[0] || input.closest('label');
                        return (label?.textContent || '').replace(/\s+/g, ' ').trim();
                    })
            );
    }

    /** Leave the form through its "Cancel". */
    async cancel() {
        await this.form().getByRole('link', {name: 'Cancel', exact: true}).click();
        await expect(this.form()).toBeHidden({timeout: 30_000});
    }
};

// ---------------------------------------------------------------------------
// Settings › Workflow › Emails › "Editor Assigned (Auto)" › "Edit Template" (Settings bullet 5)
// ---------------------------------------------------------------------------

exports.AutoAssignedTemplatePage = class AutoAssignedTemplatePage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.manageEmails = new ManageEmailsPage(page, contextPath);
        this.name = 'Editor Assigned (Auto)';
    }

    /** Search the mailable and press its "Edit": the "Edit Template" window (no inner list). */
    async openTemplate() {
        await this.manageEmails.goto();
        await this.manageEmails.searchBox().fill(this.name);
        await this.manageEmails.searchBox().press('Enter');
        const row = this.manageEmails.mailableRow(this.name);
        await expect(row).toBeVisible({timeout: 30_000});
        await row.getByRole('button', {name: `Edit ${this.name}`, exact: true}).click();
        const form = this.manageEmails.templateWindow();
        await expect(form).toBeVisible({timeout: 30_000});
        await expect(this.subjectBox(form)).toBeVisible({timeout: 30_000});
        return form;
    }

    /** The window's "Subject" box. */
    subjectBox(form) {
        return form.getByRole('textbox', {name: /^Subject/}).first();
    }

    /** Read the subject and close the window. */
    async readSubject() {
        const form = await this.openTemplate();
        const subject = await this.subjectBox(form).inputValue();
        await form.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(form).toBeHidden({timeout: 30_000});
        return subject;
    }

    /** Set the subject and save; returns the subject before. */
    async setSubject(value) {
        const form = await this.openTemplate();
        const before = await this.subjectBox(form).inputValue();
        await this.subjectBox(form).fill(value);
        await this.manageEmails.save(form);
        return before;
    }
};
