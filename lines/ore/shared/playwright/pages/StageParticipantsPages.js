// @ts-check
/**
 * @file lib/pkp/playwright/pages/StageParticipantsPages.js
 *
 * The stage "Participants" panel and the windows it opens, shared by the
 * three app suites (feature spec: docs/specs/U35-stage-participants.md):
 * - `ParticipantsPanel` — the right-hand "Participants" box of a workflow
 *   stage: its "Assign" button, one row per assignment (initials badge,
 *   full name, role, and the recommend-only line), each row's "More
 *   Actions" menu ("Edit", "Notify", "Login As", "Remove"), plus the
 *   stage's discussions panel and the discussion window a message opens;
 * - `AssignParticipantWindow` — the legacy "Assign Participant" side window
 *   (role list, "Search User By Name", the people grid with "Load more",
 *   the "Assignment privileges" and "Permissions" boxes, the predefined
 *   message list and the TinyMCE "Message", "Cancel" and "OK");
 * - `EditAssignmentWindow` — the legacy "Edit Assignment" side window;
 * - `NotifyWindow` — the legacy "Notify" side window;
 * - `RemoveParticipantDialog` — the "Remove Participant" confirm dialog;
 * - `RoleOptionsForm` — Settings › Users & Roles › Roles, a role's
 *   "Settings" › "Edit" window and its two "Role Options" boxes;
 * - `LeavePageDialogs` — the browser boxes the Assign window raises on its
 *   way out (a `confirm()` from its close control, a `beforeunload` box
 *   when the page is left), answered from a queue.
 *
 * App neutrality (PRINCIPLES M2): every string here is a lib/pkp string the
 * three apps share (the window titles, box sentences, notices, "More
 * Actions"). What differs per app — role names, stage labels, the
 * discussions panel's title, the predefined messages' names — is passed in
 * by the suite. The workflow frame itself (opening, the side menu, the
 * Activity Log) is `WorkflowPage`'s and reached through `panel.frame`.
 *
 * DOM facts the locators rely on (U35 claim check, 2026-09-22, all three
 * apps; `.reports/U35/screen-notes.md`):
 * - the panel lives in `[data-cy="workflow-secondary-items"]`, one `li` per
 *   assignment whose lines read initials, name, role (and "Only allowed to
 *   recommend an editorial decision"); its heading is CSS-uppercased, so it
 *   is read by text content. The panel is read by CSS here: after a legacy
 *   side window closes, the workflow dialog stays hidden from role queries
 *   until the page is landed afresh (patterns.md pitfall 6), and a suite
 *   calls `reland()` before its next row action;
 * - a row's menu button is named "{Given Family} More Actions"; the items
 *   are `role=menuitem`, portalled to the document root; "Remove" carries
 *   `text-negative` (red); the menu is closed by pressing its button again
 *   (Escape would close the workflow dialog, pitfall 7);
 * - the three windows are legacy forms: "Cancel" is a link, the saves post
 *   `…/stage-participant-grid/save-participant` and `…/send-notification`,
 *   the template choice `…/fetch-template-body`, which fills the TinyMCE
 *   box after jQuery goes idle; a box a window does not offer is absent
 *   from the DOM on "Edit Assignment" and hidden on "Assign Participant";
 * - notices ("User added as a stage participant.", …) are toasts in
 *   `[role="status"].app__notifications`, about half a second after the
 *   save, living five seconds.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {WorkflowPage} = require('./WorkflowPage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

/** The row's third line for a recommend-only assignment (Rule 1). */
const RECOMMEND_ONLY_LINE = 'Only allowed to recommend an editorial decision';

/** The notices of Rules 6a, 8d and Side effects (toasts, verbatim). */
const NOTICES = {
    added: 'User added as a stage participant.',
    changed: 'The stage assignment has been changed.',
    notified: 'Notification sent to users.',
    notifyRefused:
        'Please ensure that you have filled out the message field and included someone other than yourself in the discussion.',
};

/** The two boxes' sentences (Fields), shared by "Assign" and "Edit Assignment". */
const BOX_LABELS = {
    recommendOnly:
        'This participant is only allowed to recommend an editorial decision and will require an authorised editor to record editorial decisions.',
    canChangeMetadata:
        'Allow this person to make changes to the publication, such as the title, abstract, metadata and other publication details. You may wish to revoke this privilege if the submission has received a final check and is ready for publication.',
};

/** The predefined-message list's label (Fields). */
const TEMPLATE_LABEL = 'Choose a predefined message to use, or fill out the form below.';

/** The close control's confirm box (Rules 6c, 8f). */
const UNSAVED_QUESTION = 'The data on this form has changed. Do you wish to continue without saving?';

/** The "Remove Participant" dialog's sentence (Rule 10). */
const REMOVE_SENTENCE = 'You are about to remove this participant from all stages.';

/** The Roles form's two "Role Options" (Settings bullets 2, 3). */
const ROLE_OPTIONS = {
    recommendOnly:
        'This role is only allowed to recommend a review decision and will require an authorised editor to record a final decision.',
    permitMetadataEdit: 'Permit submission metadata edit.',
};

exports.RECOMMEND_ONLY_LINE = RECOMMEND_ONLY_LINE;
exports.NOTICES = NOTICES;
exports.BOX_LABELS = BOX_LABELS;
exports.TEMPLATE_LABEL = TEMPLATE_LABEL;
exports.UNSAVED_QUESTION = UNSAVED_QUESTION;
exports.REMOVE_SENTENCE = REMOVE_SENTENCE;
exports.ROLE_OPTIONS = ROLE_OPTIONS;

/** Escape a string for a RegExp. */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A toast at the top right carrying `text` (Rules 6a, 8d, 11). */
function notice(page, text) {
    return page.locator('[role="status"].app__notifications .pkpNotification').filter({hasText: text});
}
exports.notice = notice;

/**
 * The stage's own in-page box headed "Notification" carrying `text` (CSS:
 * readable while the workflow dialog is hidden from role queries). On a
 * preprint server's Production entry a participant notice may land here
 * instead of in the toast: the entry's notification display refetches on
 * every data change without request options and so drains the user's
 * trivial notices, racing the toast (`.reports/U35/test-ops-findings.md`
 * T-ops-1). A journal's or press's stage box never shows these notices.
 */
function stageNotice(page, text) {
    return page
        .locator('div:has(> h3)')
        .filter({has: page.locator('h3').filter({hasText: /^\s*Notification\s*$/})})
        .filter({hasText: text});
}
exports.stageNotice = stageNotice;

/**
 * Read a TinyMCE box's text (format "text", so a tag such as "NAME" reads as
 * its label) by the backing textarea inside `root`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} root the window
 */
async function readRichText(page, root) {
    const id = await root.locator('textarea[name="message"]').getAttribute('id');
    return page.evaluate((i) => {
        // eslint-disable-next-line no-undef
        const mce = window.tinymce || window.tinyMCE;
        const editor = mce && mce.get(i);
        return editor ? editor.getContent({format: 'text'}) : document.getElementById(i).value;
    }, id);
}

/**
 * Replace a TinyMCE box's text by typing into its iframe, once the editor
 * reports `initialized` (text typed earlier is wiped; patterns.md).
 */
async function typeRichText(page, root, text) {
    const id = await root.locator('textarea[name="message"]').getAttribute('id');
    await page.waitForFunction(
        (i) => {
            // eslint-disable-next-line no-undef
            const mce = window.tinymce || window.tinyMCE;
            const editor = mce && mce.get(i);
            return !!(editor && editor.initialized);
        },
        id,
        {timeout: 30_000}
    );
    const body = page.frameLocator(`#${id}_ifr`).locator('body');
    await body.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    if (text) {
        await page.keyboard.type(text);
    }
    await expect.poll(() => readRichText(page, root), {timeout: 10_000}).toBe(text);
}

/**
 * Choose a predefined message in a window's list and wait until the
 * message box holds the template's text (the body arrives by AJAX after
 * jQuery goes idle; screen-notes ccK3).
 */
async function chooseTemplate(page, root, label) {
    const before = await readRichText(page, root);
    const fetched = page.waitForResponse((r) => r.url().includes('fetch-template-body'), {timeout: 30_000});
    await root.locator('select[name="template"]').selectOption({label});
    await fetched;
    await waitForJQueryIdle(page);
    await expect
        .poll(() => readRichText(page, root), {timeout: 30_000})
        .not.toBe(before);
}

/** The option labels of a window's predefined-message list, blank entry included. */
async function templateOptions(root) {
    const texts = await root.locator('select[name="template"] option').allTextContents();
    return texts.map((t) => t.trim());
}

exports.ParticipantsPanel = class ParticipantsPanel extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{appContext?: any, labels?: object}} [options] passed to `WorkflowPage`
     */
    constructor(page, contextPath, options = {}) {
        super(page);
        this.contextPath = contextPath;
        /** The workflow frame (opening, side menu, Activity Log). */
        this.frame = new WorkflowPage(page, contextPath, options);
    }

    // ---------------------------------------------------------------------
    // Opening
    // ---------------------------------------------------------------------

    /** Open the submission's workflow by address (on a stage when `menuKey` is given) and wait for the panel. */
    async goto(submissionId, {menuKey = null} = {}) {
        await this.frame.gotoEditorial(submissionId, {menuKey});
        await expect(this.heading()).toBeVisible({timeout: 30_000});
    }

    /** Land the same address afresh (after a window closed, before the next row action). */
    async reland() {
        await this.page.goto(this.page.url());
        await this.frame.expectOpen();
        await expect(this.heading()).toBeVisible({timeout: 30_000});
    }

    /** Select a stage entry in the workflow menu and wait for its panel. */
    async selectStage(label) {
        await this.frame.selectStage(label);
        await expect(this.heading()).toBeVisible({timeout: 30_000});
    }

    // ---------------------------------------------------------------------
    // The panel (Rule 1)
    // ---------------------------------------------------------------------

    /** The right-hand column (CSS, readable while the workflow dialog is hidden from role queries). */
    column() {
        return this.page.locator('[data-cy="workflow-secondary-items"]');
    }

    /** The "Participants" heading (its text is CSS-uppercased; matched on text content). */
    heading() {
        return this.column().locator('h3').filter({hasText: /^\s*Participants\s*$/i});
    }

    /** The heading's "Assign" button. */
    assignButton() {
        return this.column().locator('button').filter({hasText: /^\s*Assign\s*$/});
    }

    /** Every row of the panel (one `li` per assignment). */
    rows() {
        return this.column().locator('li').filter({has: this.page.locator('button')});
    }

    /**
     * A person's row(s) by full name; `role` narrows to the row whose role
     * line reads it (a person assigned in two roles has two rows).
     */
    row(name, role = null) {
        let rows = this.rows().filter({has: this.page.getByText(name, {exact: true})});
        if (role) {
            rows = rows.filter({has: this.page.getByText(role, {exact: true})});
        }
        return rows;
    }

    /** Every row as its lines ([initials, name, role, (recommend-only line)]), top to bottom. */
    async rowLines() {
        return this.rows().evaluateAll((items) =>
            items.map((li) =>
                li.innerText
                    .split('\n')
                    .map((s) => s.trim())
                    .filter((s) => s && !/More Actions$/.test(s))
            )
        );
    }

    /** The rows are exactly these, top to bottom, each as [initials, name, role, …] (auto-waited). */
    async expectRows(expected) {
        await expect.poll(() => this.rowLines(), {timeout: 30_000}).toEqual(expected);
    }

    /** The lines a row shows: the badge's initials, the name, the role, and the limit's line when set. */
    static lines(person, role, {recommendOnly = false} = {}) {
        const initials = `${person.givenName[0]}${person.familyName[0]}`.toUpperCase();
        const lines = [initials, `${person.givenName} ${person.familyName}`, role];
        if (recommendOnly) {
            lines.push(RECOMMEND_ONLY_LINE);
        }
        return lines;
    }

    // ---------------------------------------------------------------------
    // The row menu (Rule 1; Actors)
    // ---------------------------------------------------------------------

    /** A row's "More Actions" button (the row's one button, named "{name} More Actions"). */
    menuButton(name, role = null) {
        return this.row(name, role).locator('button[aria-haspopup="menu"]');
    }

    /** The open row menu's items. */
    menuItems() {
        return this.page.getByRole('menuitem');
    }

    /** A menu item by its exact label. */
    menuItem(label) {
        return this.page.getByRole('menuitem', {name: label, exact: true});
    }

    async openMenu(name, role = null) {
        await this.menuButton(name, role).click();
        await expect(this.menuItems().first()).toBeVisible({timeout: 30_000});
    }

    /** Close an open row menu by pressing its button again (never Escape). */
    async closeMenu(name, role = null) {
        await this.menuButton(name, role).click();
        await expect(this.menuItems()).toHaveCount(0, {timeout: 30_000});
    }

    /** The open menu's labels, top to bottom. */
    async menuLabels() {
        const texts = await this.menuItems().allTextContents();
        return texts.map((t) => t.replace(/\s+/g, ' ').trim());
    }

    /**
     * The row's menu offers exactly these items, in order (Rule 1): the
     * settled read of what a role is offered and that nothing else is.
     */
    async expectMenu(name, labels, role = null) {
        await this.openMenu(name, role);
        await expect.poll(() => this.menuLabels(), {timeout: 30_000}).toEqual(labels);
        await this.closeMenu(name, role);
    }

    /** Open a row's menu and press one item. */
    async chooseAction(name, label, role = null) {
        await this.openMenu(name, role);
        await this.menuItem(label).click();
    }

    // ---------------------------------------------------------------------
    // The windows (Rules 3–11)
    // ---------------------------------------------------------------------

    /** Press "Assign" and wait for the window's role list. */
    async openAssign() {
        await this.assignButton().click();
        const win = new exports.AssignParticipantWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** Row menu › "Edit" and wait for the window's form. */
    async openEdit(name, role = null) {
        await this.chooseAction(name, 'Edit', role);
        const win = new exports.EditAssignmentWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** Row menu › "Notify" and wait for the window's message box. */
    async openNotify(name, role = null) {
        await this.chooseAction(name, 'Notify', role);
        const win = new exports.NotifyWindow(this.page);
        await win.expectOpen();
        return win;
    }

    /** Row menu › "Remove" and wait for the dialog. */
    async openRemove(name, role = null) {
        await this.chooseAction(name, 'Remove', role);
        const dialog = new exports.RemoveParticipantDialog(this.page);
        await dialog.expectOpen();
        return dialog;
    }

    // ---------------------------------------------------------------------
    // The stage's discussions panel and a discussion's window (Side effects)
    // ---------------------------------------------------------------------

    /**
     * The discussion rows named `name` (a template's name) of the stage's
     * discussions panel, found by its title (per app and stage, e.g. "Desk
     * Review Tasks & Discussions"). A role read: land the page afresh after
     * a window closed.
     */
    discussionRows(title, name) {
        return this.frame.panel(title).getByRole('row').filter({hasText: name}).filter({hasText: /Created by/});
    }

    /** Open a discussion row (its first control) and wait for its window. */
    async openDiscussion(row, name) {
        await row.locator('a, button').first().click();
        const win = new exports.DiscussionWindow(this.page, name);
        await win.expectOpen();
        return win;
    }

    /**
     * The Activity Log's "View Email" link of an "An email has been sent: …"
     * row: the legacy grid keeps it in the next `tr`, shown once the row's
     * "Settings" toggle is pressed (patterns.md pitfall 10).
     */
    async revealViewEmailLink(logRow) {
        await logRow.getByRole('link', {name: 'Settings'}).click();
        return logRow.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'View Email'});
    }
};

exports.AssignParticipantWindow = class AssignParticipantWindow extends BasePage {
    constructor(page) {
        super(page);
        this.root = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
    }

    async expectOpen() {
        await expect(this.roleSelect()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    async expectClosed() {
        await expect(this.root).toHaveCount(0, {timeout: 30_000});
    }

    /** The window's title ("Assign Participant"). */
    title() {
        return this.root.getByRole('heading', {level: 1});
    }

    /** The "Locate a User" heading over the role list. */
    locateHeading() {
        return this.root.getByRole('heading', {name: 'Locate a User', exact: true});
    }

    // -- the role list and the people (Rule 3) ------------------------------

    roleSelect() {
        return this.root.locator('select[name="filterUserGroupId"]');
    }

    /** The role list's labels, in order. */
    async roleOptions() {
        const texts = await this.roleSelect().locator('option').allTextContents();
        return texts.map((t) => t.trim());
    }

    /** The role currently chosen. */
    async selectedRole() {
        return this.roleSelect().evaluate((s) => s.options[s.selectedIndex].text.trim());
    }

    async chooseRole(label) {
        await this.roleSelect().selectOption({label});
        await waitForJQueryIdle(this.page);
    }

    searchBox() {
        return this.root.getByRole('textbox', {name: 'Search User By Name'});
    }

    /** Press "Search" and wait for the people grid to reload. */
    async search(name = null) {
        if (name !== null) {
            await this.searchBox().fill(name);
        }
        const fetched = this.page.waitForResponse((r) => r.url().includes('fetch-grid'), {timeout: 30_000});
        await this.root.getByRole('button', {name: 'Search', exact: true}).click();
        await fetched;
        await waitForJQueryIdle(this.page);
    }

    /** The people grid's rows (a choice button each). */
    people() {
        return this.root.locator('tr').filter({has: this.page.locator('input[name="userId"]')});
    }

    /** A person's row by full name. */
    person(name) {
        return this.people().filter({hasText: new RegExp(`(^|\\s)${escapeRegExp(name)}(\\s|$)`)});
    }

    /** The listed people's names ("Name" column), top to bottom. */
    async peopleNames() {
        return this.people().evaluateAll((rows) =>
            rows.map((tr) => (tr.querySelectorAll('td')[1]?.textContent || '').replace(/\s+/g, ' ').trim())
        );
    }

    /** The people listed are exactly these, in this order (auto-waited). */
    async expectPeople(names) {
        await expect.poll(() => this.peopleNames(), {timeout: 30_000}).toEqual(names);
    }

    /** The grid's column headings, the choice column's blank one included. */
    async gridHeadings() {
        const texts = await this.root.locator('thead th, thead [role="columnheader"]').allTextContents();
        return texts.map((t) => t.trim());
    }

    /**
     * Choose a person (a click, never `check()`: re-picking an already
     * picked radio must still run the window's own handler; ccK2).
     */
    async choosePerson(name) {
        await this.person(name).locator('input[name="userId"]').click();
        await waitForJQueryIdle(this.page);
    }

    /** The "Load more" link under the grid. */
    loadMoreLink() {
        return this.root.getByRole('link', {name: 'Load more', exact: true});
    }

    /** The "{shown} of {total} items" line under the grid. */
    itemsLine() {
        return this.root.getByText(/^\s*\d+ of \d+ items\s*$/);
    }

    // -- the two boxes (Rule 4) --------------------------------------------

    recommendOnlyBox() {
        return this.root.locator('input[name="recommendOnly"]');
    }

    metadataBox() {
        return this.root.locator('input[name="canChangeMetadata"]');
    }

    /** A box's heading ("Assignment privileges", "Permissions"). */
    boxHeading(text) {
        return this.root.getByText(text, {exact: true});
    }

    // -- the message (Rule 5) ----------------------------------------------

    templateSelect() {
        return this.root.locator('select[name="template"]');
    }

    templateOptions() {
        return templateOptions(this.root);
    }

    async chooseTemplate(label) {
        await chooseTemplate(this.page, this.root, label);
    }

    messageText() {
        return readRichText(this.page, this.root);
    }

    async typeMessage(text) {
        await typeRichText(this.page, this.root, text);
    }

    // -- leaving (Rule 6) --------------------------------------------------

    /** Press "OK" with a person chosen: the save answers and the window closes (Rule 6a). */
    async ok() {
        const saved = this.page.waitForResponse((r) => r.url().includes('save-participant'), {timeout: 30_000});
        await this.root.getByRole('button', {name: 'OK', exact: true}).click();
        await saved;
        await this.expectClosed();
        await waitForJQueryIdle(this.page);
    }

    /** The form's "Cancel" (a link). */
    cancelLink() {
        return this.root.getByRole('link', {name: 'Cancel', exact: true});
    }

    async cancel() {
        await this.cancelLink().click();
        await this.expectClosed();
    }

    /** The window's close control ("<", named "Close"). */
    closeControl() {
        return this.root.getByRole('button', {name: 'Close', exact: true});
    }
};

exports.EditAssignmentWindow = class EditAssignmentWindow extends BasePage {
    constructor(page) {
        super(page);
        this.root = page.getByRole('dialog', {name: 'Edit Assignment', exact: true});
    }

    /** Open once the form's "OK" is there (the no-boxes variant has no input; ccK4). */
    async expectOpen() {
        await expect(this.okButton()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    async expectClosed() {
        await expect(this.root).toHaveCount(0, {timeout: 30_000});
    }

    title() {
        return this.root.getByRole('heading', {level: 1});
    }

    /** The form's text (the "Participant" line and the box sentences). */
    form() {
        return this.root.locator('form');
    }

    /** The participant's name in bold. */
    boldName(name) {
        return this.root.locator('b, strong').filter({hasText: new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`)});
    }

    recommendOnlyBox() {
        return this.root.locator('input[name="recommendOnly"]');
    }

    metadataBox() {
        return this.root.locator('input[name="canChangeMetadata"]');
    }

    /** A message box or predefined-message list, if any (Rule 8: none). */
    messageFields() {
        return this.root.locator('textarea[name="message"], select[name="template"]');
    }

    okButton() {
        return this.root.getByRole('button', {name: 'OK', exact: true});
    }

    /** Press "OK": the save answers and the window closes (Rule 8d). */
    async ok() {
        const saved = this.page.waitForResponse((r) => r.url().includes('save-participant'), {timeout: 30_000});
        await this.okButton().click();
        await saved;
        await this.expectClosed();
        await waitForJQueryIdle(this.page);
    }

    cancelLink() {
        return this.root.getByRole('link', {name: 'Cancel', exact: true});
    }

    async cancel() {
        await this.cancelLink().click();
        await this.expectClosed();
    }
};

exports.NotifyWindow = class NotifyWindow extends BasePage {
    constructor(page) {
        super(page);
        this.root = page
            .getByRole('dialog')
            .filter({has: page.locator('select[name="template"]')})
            .filter({hasNot: page.locator('select[name="filterUserGroupId"]')})
            .last();
    }

    async expectOpen() {
        await expect(this.notifyButton()).toBeVisible({timeout: 30_000});
        await expect(this.root.locator('textarea[name="message"]')).toBeAttached({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    async expectClosed() {
        await expect(this.root).toHaveCount(0, {timeout: 30_000});
    }

    title() {
        return this.root.getByRole('heading', {level: 1});
    }

    /** The "Start Discussion" heading of the form (a group label, not a role heading). */
    startDiscussionHeading() {
        return this.root.getByText('Start Discussion', {exact: true});
    }

    /** "Begin a discussion between yourself and {name}." */
    sentence(name) {
        return this.root.getByText(`Begin a discussion between yourself and ${name}.`, {exact: true});
    }

    templateSelect() {
        return this.root.locator('select[name="template"]');
    }

    templateLabel() {
        return this.root.getByText(TEMPLATE_LABEL, {exact: true});
    }

    templateOptions() {
        return templateOptions(this.root);
    }

    async chooseTemplate(label) {
        await chooseTemplate(this.page, this.root, label);
    }

    messageText() {
        return readRichText(this.page, this.root);
    }

    async typeMessage(text) {
        await typeRichText(this.page, this.root, text);
    }

    notifyButton() {
        return this.root.getByRole('button', {name: 'Notify', exact: true});
    }

    /** A "Cancel" of either kind (Rule 11: none). */
    cancelControls() {
        return this.root.getByRole('link', {name: 'Cancel'}).or(this.root.getByRole('button', {name: 'Cancel'}));
    }

    /** Press "Notify" and wait for the send's answer; the caller asserts what follows. */
    async pressNotify() {
        const sent = this.page.waitForResponse((r) => r.url().includes('send-notification'), {timeout: 30_000});
        await this.notifyButton().click();
        return sent;
    }

    /** Press "Notify" with a message ready: the window closes. */
    async send() {
        await this.pressNotify();
        await this.expectClosed();
        await waitForJQueryIdle(this.page);
    }
};

exports.RemoveParticipantDialog = class RemoveParticipantDialog extends BasePage {
    constructor(page) {
        super(page);
        this.root = page.getByRole('dialog', {name: 'Remove Participant', exact: true});
    }

    async expectOpen() {
        await expect(this.root).toBeVisible({timeout: 30_000});
    }

    title() {
        return this.root.getByRole('heading', {name: 'Remove Participant'});
    }

    okButton() {
        return this.root.getByRole('button', {name: 'OK', exact: true});
    }

    cancelButton() {
        return this.root.getByRole('button', {name: 'Cancel', exact: true});
    }

    async cancel() {
        await this.cancelButton().click();
        await expect(this.root).toHaveCount(0, {timeout: 30_000});
    }

    /** Press "OK": the removal answers and the dialog closes. */
    async ok() {
        const removed = this.page.waitForResponse((r) => r.url().includes('delete-participant'), {timeout: 30_000});
        await this.okButton().click();
        await removed;
        await expect(this.root).toHaveCount(0, {timeout: 30_000});
    }
};

exports.DiscussionWindow = class DiscussionWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} name the discussion's title (the template's name)
     */
    constructor(page, name) {
        super(page);
        this.root = page.getByRole('dialog', {name, exact: true});
    }

    async expectOpen() {
        await expect(this.root.getByRole('heading', {name: 'Participants', exact: true})).toBeVisible({timeout: 30_000});
    }

    /**
     * The participants' usernames as the "Details" group lists them
     * ("1. {name} ({username}) …").
     */
    async participantUsernames() {
        const text = await this.root.getByRole('group', {name: 'Details'}).innerText();
        return [...text.matchAll(/^\s*\d+\.\s+[^(\n]+\(([^)\s]+)\)/gm)].map((m) => m[1]);
    }

    /** The participants are exactly these usernames, in any order (auto-waited). */
    async expectParticipants(usernames) {
        await expect
            .poll(async () => (await this.participantUsernames()).sort(), {timeout: 30_000})
            .toEqual([...usernames].sort());
    }

    /** The thread's entries, oldest first. */
    entries() {
        return this.root.getByRole('group', {name: 'Discussion'}).getByRole('listitem');
    }

    async close() {
        await this.root.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(this.root).toHaveCount(0, {timeout: 30_000});
    }
};

exports.RoleOptionsForm = class RoleOptionsForm extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.root = page.getByRole('dialog').filter({has: page.locator('input[name="permitMetadataEdit"]')}).last();
    }

    /** Settings › Users & Roles › "Roles" tab, its grid loaded. */
    async gotoRoles() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/access'));
        await this.page.getByRole('tab', {name: 'Roles', exact: true}).click();
        await expect(this.gridRow(null).first()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** A Roles grid row by the role's name (every row when null). */
    gridRow(roleName) {
        const rows = this.page.locator('[id^="component-grid-settings-roles-usergroupgrid"] tr.gridRow');
        return roleName === null ? rows : rows.filter({has: this.page.getByText(roleName, {exact: true})});
    }

    /** The role's "Settings" › "Edit": the role's form. */
    async openRole(roleName) {
        await this.gridRow(roleName).getByRole('link', {name: 'Settings'}).click();
        await this.page.getByRole('link', {name: 'Edit', exact: true}).first().click();
        await expect(this.root.locator('input[name="permitMetadataEdit"]')).toBeAttached({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    recommendOnlyBox() {
        return this.root.getByRole('checkbox', {name: ROLE_OPTIONS.recommendOnly, exact: true});
    }

    permitMetadataEditBox() {
        return this.root.getByRole('checkbox', {name: ROLE_OPTIONS.permitMetadataEdit, exact: true});
    }

    /** The "Role Options" group's heading text. */
    roleOptionsHeading() {
        return this.root.getByText('Role Options', {exact: true});
    }

    /** Press the form's "OK" and wait for it to close. */
    async save() {
        await this.root.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(this.root).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }
};

/**
 * The browser's own boxes a window raises on its way out: the close
 * control's `confirm()` and the leave-page `beforeunload` box (Rules 6c,
 * 8f). Register before the step; each box takes the next queued answer
 * (`'accept'` or `'dismiss'`), and every box is recorded as `{type,
 * message}` so a test can assert which appeared and that none did.
 */
exports.LeavePageDialogs = class LeavePageDialogs {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
        /** @type {{type: string, message: string, answer: string}[]} */
        this.seen = [];
        /** @type {string[]} */
        this.queue = [];
        page.on('dialog', async (dialog) => {
            const answer = this.queue.shift() || 'dismiss';
            this.seen.push({type: dialog.type(), message: dialog.message(), answer});
            if (answer === 'accept') {
                await dialog.accept().catch(() => {});
            } else {
                await dialog.dismiss().catch(() => {});
            }
        });
    }

    /** Queue the answer for the next box. */
    answerNext(answer) {
        this.queue.push(answer);
    }

    /** How many boxes appeared so far. */
    count() {
        return this.seen.length;
    }

    /** The last box that appeared. */
    last() {
        return this.seen[this.seen.length - 1];
    }
};
