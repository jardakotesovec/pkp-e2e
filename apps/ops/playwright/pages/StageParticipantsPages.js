// @ts-check
/**
 * @file playwright/pages/StageParticipantsPages.js
 *
 * The Participants panel and its windows on a preprint server (feature
 * U35, spec docs/specs/U35-stage-participants.md), OPS-only by design
 * (PRINCIPLES M1): the panel's rows and their "…" menus, the "Assign
 * Participant", "Edit Assignment" and "Notify" windows (legacy side windows
 * whose forms arrive by AJAX), the "Remove Participant" and "Login As"
 * dialogs, the discussions panel a message opens a row on, and the Roles
 * settings form scenario 9 flips. The workflow frame is the shared
 * `WorkflowPage` (patterns.md "Page Object Model"); the OPS
 * `EditorialDashboardPage` keeps its read-only "Assign" form readers for
 * the U32 absence tests, this file owns the driven window.
 *
 * DOM facts (.reports/U35/screen-notes.md, ccK1–ccK4, 2026-09-20):
 * - the panel is `[data-cy="participant-manager"]` in the workflow dialog:
 *   an h3 "Participants" (CSS-uppercased), the header's "Assign" button,
 *   rows `> ul > li` each with the initials circle, the `.text-base-bold`
 *   name, the role line, the optional "Only allowed to recommend an
 *   editorial decision" line and one button "{Given Family} More Actions"
 *   (headlessui: the items are `role=menuitem` at the document root; the
 *   menu closes by pressing the button again, never Escape, which closes
 *   the workflow dialog too); while an impersonation lasts the list's
 *   first entry is a button "Logout as {name}". The rows are read through
 *   page-level locators, never scoped to the workflow dialog: for ~450 ms
 *   after an inner window closes the dialog is aria-hidden and a
 *   dialog-scoped role query finds nothing (ccK3);
 * - "Assign Participant": `select[name="filterUserGroupId"]` (the first
 *   role preselected), `input[name="name"]` and the search form's button
 *   (`form[id^="searchUserFilter"]`; only "Search" refetches the grid),
 *   `input[name="userId"]` radios, the two boxes `input[name="recommendOnly"]`
 *   and `input[name="canChangeMetadata"]` rendered only once a radio is
 *   checked, `select[name="template"]` over TinyMCE `textarea[name="message"]`;
 *   "OK" a button, "Cancel" an `<a>` link (patterns.md pitfall 7), the
 *   window's back arrow the "Close" button. A refused "OK" (no person)
 *   answers 200 with the form re-rendered;
 * - "Edit Assignment": the same two boxes or the sentence "No changes can
 *   be made to this participant"; "OK" a button, "Cancel" a link. "Cancel"
 *   with a box changed asks the browser's confirm (`page.on('dialog')`
 *   before the press);
 * - "Notify": `select[name="template"]` and `textarea[name="message"]`, one
 *   submit button "Notify", no "Cancel"; the modal's "Close" is the only
 *   other control; the empty-message refusal is a server-side validator
 *   whose sentence shows as a top-right toast (test finding T-ops-2);
 * - the toast "Notification sent to users." is added and gone on OPS
 *   before a settled read, so a toast is caught with a MutationObserver
 *   armed before the press (`armToastObserver` / `observedToasts`), and
 *   the test asserts the effect (the row, the discussion, the mailbox);
 * - the discussions panel is `[data-cy="discussion-manager"]`, its rows
 *   `tbody tr` with the title as a link-button; the row's view opens as
 *   the last `[data-cy="active-modal"]` whose text lists "Participants 1.
 *   {name} ({username}) …";
 * - Roles: Settings › Users & Roles › the "Roles" tab, a legacy grid
 *   (`tr.gridRow`, `a.show_extras`, the next row's "Edit" link), the form
 *   `form#userGroupForm` with `input[name="recommendOnly"]`, saved by its
 *   "Save" with the toast "Your changes have been saved." (ccK5).
 */
const {expect} = require('@playwright/test');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

/** The preprint server's stage entries and their `workflowMenuKey`s (Rule 2). */
const ENTRY_KEYS = {Submission: 'workflow_1', Production: 'workflow_5'};

/** The participant row's recommend-only line (Rule 5a). */
const RECOMMEND_ONLY_MARK = 'Only allowed to recommend an editorial decision';

/** The window titles and toasts (Rules 4f, 7, 8a; Fields). */
const TOASTS = {
    added: 'User added as a stage participant.',
    changed: 'The stage assignment has been changed.',
    sent: 'Notification sent to users.',
    rolesSaved: 'Your changes have been saved.',
};
const NOTIFY_EMPTY_MESSAGE =
    'Please ensure that you have filled out the message field and included someone other than yourself in the discussion.';
const REMOVE_SENTENCE = 'You are about to remove this participant from all stages.';
const LOGIN_AS_SENTENCE = 'Log in as this user? All actions you perform will be attributed to this user.';
const FORM_CHANGED_CONFIRM = 'The data on this form has changed. Do you wish to continue without saving?';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Toasts caught in flight (scenarios.md "Mailpit", the OPS "Notify" note)
// ---------------------------------------------------------------------------

/**
 * Arm a MutationObserver that records the text of every `.pkpNotification`
 * added to the page from now on. Re-arm before each press; the list is
 * reset on every call.
 */
async function armToastObserver(page) {
    await page.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__u35toasts = [];
        if (w.__u35observer) {
            return;
        }
        w.__u35observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const n of m.addedNodes) {
                    if (!(n instanceof HTMLElement)) {
                        continue;
                    }
                    const nodes = n.matches('.pkpNotification') ? [n] : [...n.querySelectorAll('.pkpNotification')];
                    for (const t of nodes) {
                        w.__u35toasts.push((t.textContent || '').replace(/\s+/g, ' ').trim());
                    }
                }
            }
        });
        w.__u35observer.observe(document.body, {childList: true, subtree: true});
    });
}

/** The toasts recorded since the last `armToastObserver`. */
async function observedToasts(page) {
    return page.evaluate(() => [...(/** @type {any} */ (window).__u35toasts || [])]);
}

/** Poll until a toast carrying `text` was recorded (bounded, no sleep). */
async function expectObservedToast(page, text, {timeout = 30_000} = {}) {
    await expect
        .poll(async () => (await observedToasts(page)).some((t) => t.includes(text)), {timeout})
        .toBe(true);
}

// ---------------------------------------------------------------------------
// The panel (Rules 1–3, 9)
// ---------------------------------------------------------------------------

exports.ParticipantsPanel = class ParticipantsPanel {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{appContext?: any}} [options]
     */
    constructor(page, contextPath, options = {}) {
        this.page = page;
        this.contextPath = contextPath;
        /** The shared workflow frame, with the preprint server's "Preprint" group label. */
        this.frame = new WorkflowPage(page, contextPath, {
            appContext: options.appContext,
            labels: {publicationGroup: 'Preprint'},
        });
    }

    /**
     * Open the editorial view by address with a stage's `workflowMenuKey`
     * (`ENTRY_KEYS`). A preprint server has one stage entry, "Production",
     * and lands there on either key (the Submission stage's key included:
     * test finding T-ops-1), so the heading read is "Workflow: Production".
     */
    async gotoByKey(submissionId, key) {
        await this.frame.gotoEditorial(submissionId, {menuKey: key});
        await this.frame.expectStageHeading('Production');
    }

    /** Open the editorial view straight at the "Production" entry. */
    async gotoProduction(submissionId) {
        await this.gotoByKey(submissionId, ENTRY_KEYS.Production);
    }

    /** The side menu's stage entries (a preprint server's are exactly ["Production"]). */
    async stageLabels() {
        return this.frame.stageLabels();
    }

    /** The panel element (page-level; see the file header). */
    panel() {
        return this.page.locator('[data-cy="participant-manager"]');
    }

    /** The "Participants" heading (its innerText is uppercased by CSS). */
    heading() {
        return this.panel().getByRole('heading', {name: /^participants$/i});
    }

    /** The header's "Assign" button. */
    assignButton() {
        return this.panel().getByRole('button', {name: 'Assign', exact: true});
    }

    /** The participant rows: the list items carrying a "… More Actions" button. */
    rows() {
        return this.panel()
            .locator(':scope > ul > li')
            .filter({has: this.page.getByRole('button', {name: /More Actions$/})});
    }

    /** A participant's row by the name it shows (a string or RegExp). */
    row(name) {
        return this.rows().filter({hasText: name});
    }

    /** The row's role line is read through `toContainText`; this is the recommend-only line. */
    recommendOnlyMark(name) {
        return this.row(name).getByText(RECOMMEND_ONLY_MARK);
    }

    /** The row's "{name} More Actions" button (page-level; a RegExp name is used as given). */
    menuButton(name) {
        const pattern = name instanceof RegExp ? name : new RegExp(`^${escapeRegExp(name)} More Actions$`);
        return this.page.getByRole('button', {name: pattern});
    }

    /** Open a row's menu and wait for its first item. */
    async openMenu(name) {
        await this.menuButton(name).first().click();
        await expect(this.page.getByRole('menuitem').first()).toBeVisible({timeout: 30_000});
    }

    /** Close an open row menu by pressing its button again (never Escape). */
    async closeMenu(name) {
        await this.menuButton(name).first().click();
        await expect(this.page.getByRole('menuitem')).toHaveCount(0, {timeout: 30_000});
    }

    /** The open menu's item labels, top to bottom. */
    async menuItemLabels() {
        const labels = await this.page.getByRole('menuitem').allInnerTexts();
        return labels.map((s) => s.trim());
    }

    /** Open a row's menu, read its items, close it. */
    async readMenu(name) {
        await this.openMenu(name);
        const labels = await this.menuItemLabels();
        await this.closeMenu(name);
        return labels;
    }

    /** Open a row's menu and press one entry ("Edit", "Notify", "Login As", "Remove"). */
    async chooseMenuItem(name, item) {
        await this.openMenu(name);
        await this.page.getByRole('menuitem', {name: item, exact: true}).click();
    }

    /** The "Logout as {name}" entry the list opens with while impersonating (Rule 9). */
    logoutAsButton(name) {
        return this.panel().getByRole('button', {name: `Logout as ${name}`, exact: true});
    }

    /** The list's first entry (the "Logout as" line sits above the rows). */
    firstEntry() {
        return this.panel().locator(':scope > ul > li').first();
    }

    // ---- the windows the panel opens --------------------------------------

    /** Press "Assign" and wait for the window. */
    async openAssign() {
        await this.assignButton().click();
        const window = new exports.AssignParticipantWindow(this.page);
        await window.expectOpen();
        return window;
    }

    /** A row's "Edit": the "Edit Assignment" window with its form loaded. */
    async openEdit(name) {
        await this.chooseMenuItem(name, 'Edit');
        const window = new exports.EditAssignmentWindow(this.page);
        await window.expectOpen();
        return window;
    }

    /** A row's "Notify": the "Notify" window with its form loaded. */
    async openNotify(name) {
        await this.chooseMenuItem(name, 'Notify');
        const window = new exports.NotifyWindow(this.page);
        await window.expectOpen();
        return window;
    }

    /** A row's "Remove": the "Remove Participant" dialog. */
    async openRemove(name) {
        await this.chooseMenuItem(name, 'Remove');
        const dialog = this.page.getByRole('dialog').filter({hasText: REMOVE_SENTENCE});
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /** A row's "Login As": the "Login As" dialog. */
    async openLoginAs(name) {
        await this.chooseMenuItem(name, 'Login As');
        const dialog = this.page.getByRole('dialog').filter({hasText: LOGIN_AS_SENTENCE});
        await expect(dialog).toBeVisible({timeout: 30_000});
        return dialog;
    }

    /**
     * "Login As" › "OK": the browser session continues as the person and
     * lands on the editorial dashboard with this submission open (Rule 9).
     */
    async loginAs(name, submissionId) {
        const dialog = await this.openLoginAs(name);
        await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        await this.page.waitForURL(/dashboard\/editorial/, {waitUntil: 'commit', timeout: 30_000});
        await this.frame.expectOpen(submissionId);
        await expect(this.logoutAsButton(name)).toBeVisible({timeout: 30_000});
    }

    /** Press the list's "Logout as {name}": back as the impersonator on the same submission. */
    async logoutAs(name, submissionId) {
        await this.logoutAsButton(name).click();
        await expect(this.logoutAsButton(name)).toHaveCount(0, {timeout: 30_000});
        await this.frame.expectOpen(submissionId);
        await expect(this.rows().first()).toBeVisible({timeout: 30_000});
    }

    /** The discussions panel of the open entry. */
    discussions() {
        return new exports.DiscussionsPanel(this.page);
    }
};

// ---------------------------------------------------------------------------
// "Assign Participant" (Rule 4; Fields)
// ---------------------------------------------------------------------------

exports.AssignParticipantWindow = class AssignParticipantWindow {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
    }

    /** The window: the last dialog carrying the role select (the workflow panel is a dialog too). */
    dialog() {
        return this.page
            .getByRole('dialog')
            .filter({has: this.page.locator('select[name="filterUserGroupId"]')})
            .last();
    }

    async expectOpen() {
        await expect(this.roleSelect()).toBeVisible({timeout: 30_000});
        await expect(this.templateSelect()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    async expectClosed() {
        await expect(this.page.locator('select[name="filterUserGroupId"]')).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    roleSelect() {
        return this.dialog().locator('select[name="filterUserGroupId"]');
    }

    /** The role list's labels in order (blank entries dropped). */
    async roleOptions() {
        return optionLabels(this.roleSelect());
    }

    /** The selected role's label. */
    async selectedRole() {
        return this.roleSelect().evaluate((el) => el.options[el.selectedIndex]?.text.trim() || '');
    }

    async selectRole(label) {
        await this.roleSelect().selectOption({label});
        await waitForJQueryIdle(this.page);
    }

    searchInput() {
        return this.dialog().locator('input[name="name"]').first();
    }

    /** Type a name (or nothing) and press "Search": the grid refetches for the chosen role. */
    async search(text = '') {
        await this.searchInput().fill(text);
        const fetched = this.page.waitForResponse(
            (r) => /user-select|userselect|fetch-grid/i.test(r.url()) && r.request().method() === 'POST'
        );
        await this.dialog().locator('form[id^="searchUserFilter"] button').first().click();
        await fetched;
        await waitForJQueryIdle(this.page);
    }

    /** The grid's rows carrying a radio (the "Locate a User" list). */
    userRows() {
        return this.dialog().getByRole('row').filter({has: this.page.locator('input[name="userId"]')});
    }

    /** A person's row by name. */
    userRow(name) {
        return this.userRows().filter({hasText: name});
    }

    /** Check a person's radio; the two boxes render after it. */
    async chooseUser(name) {
        await this.userRow(name).first().locator('input[name="userId"]').check({force: true});
        await waitForJQueryIdle(this.page);
    }

    /** "Assignment privileges" heading and its box (an editor- or manager-level role). */
    privilegesHeading() {
        return this.dialog().getByText('Assignment privileges', {exact: true});
    }

    recommendOnlyBox() {
        return this.dialog().locator('input[name="recommendOnly"]');
    }

    /** "Permissions" heading and its box (every role but a manager-level one). */
    permissionsHeading() {
        return this.dialog().getByText('Permissions', {exact: true});
    }

    metadataBox() {
        return this.dialog().locator('input[name="canChangeMetadata"]');
    }

    templateSelect() {
        return this.dialog().locator('select[name="template"]');
    }

    /** The predefined-message list's labels in order (the blank first entry dropped). */
    async templateOptions() {
        return optionLabels(this.templateSelect());
    }

    /**
     * Choose a predefined message; with `fills`, wait until the TinyMCE box
     * behind `textarea[name="message"]` carries that text (the body arrives
     * by AJAX; saving before it lands sends an empty message).
     */
    async chooseTemplate(label, {fills = null} = {}) {
        await this.templateSelect().selectOption({label});
        await waitForJQueryIdle(this.page);
        if (fills) {
            await expect.poll(() => messageText(this.page), {timeout: 30_000}).toContain(fills);
        }
    }

    /** The message box's text as TinyMCE holds it. */
    async messageText() {
        return messageText(this.page);
    }

    okButton() {
        return this.dialog().getByRole('button', {name: 'OK', exact: true}).last();
    }

    cancelLink() {
        return this.dialog().getByRole('link', {name: 'Cancel', exact: true}).last();
    }

    /** Press "OK" and wait for the save to answer (the window closes on success). */
    async pressOk() {
        const saved = this.page.waitForResponse(
            (r) => /save-participant/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.okButton().click();
        await saved;
        await waitForJQueryIdle(this.page);
    }

    /** "OK" that succeeds: the window is gone afterwards. */
    async ok() {
        await this.pressOk();
        await this.expectClosed();
    }

    /**
     * The window's own "Cancel" (silent, even with a person chosen). After
     * a refused "OK" the re-rendered form may swallow the link's click, so
     * the back arrow ("Close") is the fallback; a browser confirm on the
     * way out is accepted (Rule 4f).
     */
    async cancel() {
        const onDialog = (d) => d.accept().catch(() => {});
        this.page.on('dialog', onDialog);
        try {
            await this.cancelLink().click();
            const gone = await this.page
                .locator('select[name="filterUserGroupId"]')
                .waitFor({state: 'detached', timeout: 5_000})
                .then(() => true)
                .catch(() => false);
            if (!gone) {
                await this.dialog().getByRole('button', {name: 'Close', exact: true}).first().click();
            }
            await this.expectClosed();
        } finally {
            this.page.off('dialog', onDialog);
        }
    }
};

// ---------------------------------------------------------------------------
// "Edit Assignment" (Rule 7)
// ---------------------------------------------------------------------------

exports.EditAssignmentWindow = class EditAssignmentWindow {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
    }

    /** The window: the last dialog carrying a "Participant" read-out and an "OK". */
    dialog() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'Participant'})
            .filter({has: this.page.getByRole('button', {name: 'OK', exact: true})})
            .last();
    }

    /** The form arrives by AJAX: wait for a box or the "No changes" sentence. */
    async expectOpen() {
        await expect(
            this.dialog()
                .locator('input[name="recommendOnly"], input[name="canChangeMetadata"]')
                .or(this.dialog().getByText('No changes can be made to this participant'))
                .first()
        ).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    async expectClosed() {
        await expect(this.dialog()).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    privilegesHeading() {
        return this.dialog().getByText('Assignment privileges', {exact: true});
    }

    recommendOnlyBox() {
        return this.dialog().locator('input[name="recommendOnly"]');
    }

    permissionsHeading() {
        return this.dialog().getByText('Permissions', {exact: true});
    }

    metadataBox() {
        return this.dialog().locator('input[name="canChangeMetadata"]');
    }

    okButton() {
        return this.dialog().getByRole('button', {name: 'OK', exact: true}).last();
    }

    cancelLink() {
        return this.dialog().getByRole('link', {name: 'Cancel', exact: true}).last();
    }

    /** "OK": the save answers and the window closes. */
    async ok() {
        const saved = this.page.waitForResponse(
            (r) => /save-participant/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.okButton().click();
        await saved;
        await this.expectClosed();
    }

    /** "Cancel" with nothing changed: silent, the window closes. */
    async cancel() {
        await this.cancelLink().click();
        await this.expectClosed();
    }
};

// ---------------------------------------------------------------------------
// "Notify" (Rule 8; Fields)
// ---------------------------------------------------------------------------

exports.NotifyWindow = class NotifyWindow {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
    }

    /** The window: the last dialog carrying "Start Discussion" and the template list. */
    dialog() {
        return this.page
            .getByRole('dialog')
            .filter({hasText: 'Start Discussion'})
            .filter({has: this.page.locator('select[name="template"]')})
            .last();
    }

    async expectOpen() {
        await expect(this.templateSelect()).toBeVisible({timeout: 30_000});
        await expect(this.notifyButton()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    async expectClosed() {
        await expect(this.dialog()).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    templateSelect() {
        return this.dialog().locator('select[name="template"]');
    }

    messageTextarea() {
        return this.dialog().locator('textarea[name="message"]');
    }

    /** The one submit button. */
    notifyButton() {
        return this.dialog().getByRole('button', {name: 'Notify', exact: true});
    }

    /** No "Cancel" here: neither a button nor a link (Rule 8). */
    cancelControls() {
        return this.dialog()
            .getByRole('button', {name: 'Cancel', exact: true})
            .or(this.dialog().getByRole('link', {name: 'Cancel', exact: true}));
    }

    /** The modal's top "Close" (the back arrow). */
    closeButton() {
        return this.dialog().getByRole('button', {name: 'Close', exact: true}).first();
    }

    /**
     * Press "Notify" and wait for the send to answer. A refusal ("Message"
     * empty) answers 200 with the window kept open and the sentence
     * `NOTIFY_EMPTY_MESSAGE` as a top-right toast, caught by an observer
     * armed before the press.
     */
    async pressNotify() {
        const sent = this.page.waitForResponse(
            (r) => /send-notification/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await this.notifyButton().click();
        await sent;
        await waitForJQueryIdle(this.page);
    }

    async close() {
        await this.closeButton().click();
        await this.expectClosed();
    }
};

// ---------------------------------------------------------------------------
// The discussions panel (Rule 8a; the rows are *Tasks & discussions*')
// ---------------------------------------------------------------------------

exports.DiscussionsPanel = class DiscussionsPanel {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
    }

    panel() {
        return this.page.locator('[data-cy="discussion-manager"]').first();
    }

    rows() {
        return this.panel().locator('tbody tr');
    }

    /** A discussion's row by its title. */
    row(title) {
        return this.rows().filter({hasText: title});
    }

    /**
     * The row's view (a display-only side window over the workflow dialog,
     * which is itself an `active-modal`): its text lists "Participants 1.
     * {name} ({username}) …" and "Message from {username} …", the marker
     * that tells it from the workflow dialog beneath. The wrapper reports
     * `visibility: hidden` (patterns.md pitfall 5), so presence is judged
     * on its inner text.
     */
    view() {
        return this.page.locator('[data-cy="active-modal"]').filter({hasText: 'Message from'}).last();
    }

    /** The view's "Message from …" line, the inner anchor. */
    viewMessageLine() {
        return this.view().getByText(/Message from/).first();
    }

    /** Open a row's view by its title link and wait for its message. */
    async open(title) {
        await this.row(title).last().locator('button, a').filter({hasText: title}).first().click();
        await expect(this.viewMessageLine()).toBeVisible({timeout: 30_000});
        await expect(this.view().getByText('Participants', {exact: true}).first()).toBeVisible({timeout: 30_000});
        return this.view();
    }

    /** Close the open view with its own "Close"/"Cancel" (a closed side modal may leave a hidden shell). */
    async close() {
        await this.view()
            .getByRole('button', {name: /^(Close|Cancel)$/})
            .last()
            .click();
        await expect(this.viewMessageLine()).toBeHidden({timeout: 30_000});
    }
};

// ---------------------------------------------------------------------------
// Settings › Users & Roles › Roles (the recommend-only box; Settings)
// ---------------------------------------------------------------------------

exports.RolesSettingsPage = class RolesSettingsPage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        this.page = page;
        this.contextPath = contextPath;
    }

    /** Open Settings › Users & Roles on the "Roles" tab and wait for the grid. */
    async goto() {
        await this.page.goto(`/index.php/${this.contextPath}/management/settings/access`);
        const tab = this.page.getByRole('tab', {name: 'Roles', exact: true}).or(this.page.locator('#roles-button')).first();
        await tab.click();
        await expect(this.rolesGrid().locator('tr.gridRow').first()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    rolesGrid() {
        return this.page.locator('#userGroupsGridContainer, [id^="userGroupsGridContainer"], .pkp_controllers_grid').first();
    }

    /** A role's row by the name in its first cell. */
    roleRow(roleName) {
        return this.rolesGrid().locator('tr.gridRow').filter({
            has: this.page.locator('td').first().filter({hasText: new RegExp(`^\\s*${escapeRegExp(roleName)}\\s*$`)}),
        });
    }

    /** The role's "Edit" form: the row's arrow, then the next row's "Edit" link. */
    async openRoleEdit(roleName) {
        const row = this.rolesGrid().locator('tr.gridRow').filter({hasText: roleName}).first();
        await expect(row).toBeVisible({timeout: 30_000});
        await row.locator('a.show_extras').click();
        await this.page.getByRole('link', {name: 'Edit', exact: true}).last().click();
        const form = this.page.locator('form#userGroupForm');
        await expect(form.locator('input[name="recommendOnly"]')).toBeAttached({timeout: 30_000});
        await waitForJQueryIdle(this.page);
        return form;
    }

    recommendOnlyBox() {
        return this.page.locator('form#userGroupForm input[name="recommendOnly"]');
    }

    /** The form's "Save": the toast "Your changes have been saved." and the form gone. */
    async save() {
        await armToastObserver(this.page);
        await this.page
            .locator('form#userGroupForm')
            .getByRole('button', {name: /^(Save|OK)$/})
            .last()
            .click();
        await expectObservedToast(this.page, TOASTS.rolesSaved);
        await expect(this.page.locator('form#userGroupForm')).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Tick or clear a role's "This role is only allowed to recommend…" box and save. */
    async setRecommendOnly(roleName, on) {
        await this.goto();
        await this.openRoleEdit(roleName);
        const box = this.recommendOnlyBox();
        await expect(box).toBeEnabled({timeout: 30_000});
        if (on) {
            await box.check();
        } else {
            await box.uncheck();
        }
        await this.save();
    }

    /** Read a role's box (opens the form and leaves by "Cancel"). */
    async readRecommendOnly(roleName) {
        await this.goto();
        const form = await this.openRoleEdit(roleName);
        const checked = await this.recommendOnlyBox().isChecked();
        await form.getByRole('link', {name: 'Cancel', exact: true}).first().click();
        await expect(form).toHaveCount(0, {timeout: 30_000});
        return checked;
    }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function optionLabels(select) {
    const labels = await select.locator('option').evaluateAll((options) => options.map((o) => (o.textContent || '').trim()));
    return labels.filter(Boolean);
}

/** The text TinyMCE holds behind the last open dialog's `textarea[name="message"]`. */
function messageText(page) {
    return page.evaluate(() => {
        const textarea = [...document.querySelectorAll('[role="dialog"] textarea[name="message"]')].pop();
        const mce = /** @type {any} */ (window).tinyMCE || /** @type {any} */ (window).tinymce;
        const editor = textarea && mce?.get(textarea.id);
        return editor ? editor.getContent({format: 'text'}).replace(/\s+/g, ' ').trim() : '';
    });
}

exports.ENTRY_KEYS = ENTRY_KEYS;
exports.RECOMMEND_ONLY_MARK = RECOMMEND_ONLY_MARK;
exports.TOASTS = TOASTS;
exports.NOTIFY_EMPTY_MESSAGE = NOTIFY_EMPTY_MESSAGE;
exports.REMOVE_SENTENCE = REMOVE_SENTENCE;
exports.LOGIN_AS_SENTENCE = LOGIN_AS_SENTENCE;
exports.FORM_CHANGED_CONFIRM = FORM_CHANGED_CONFIRM;
exports.armToastObserver = armToastObserver;
exports.observedToasts = observedToasts;
exports.expectObservedToast = expectObservedToast;
