// @ts-check
/**
 * @file lib/pkp/playwright/pages/NotificationsPages.js
 *
 * The notification surfaces every signed-in user meets, shared by the three
 * app suites (feature spec: docs/specs/U05-notifications-center-and-email-
 * preferences.md):
 * - `TasksPanel` — the bell in the editorial header (`TopNavActions.vue`)
 *   and the "Tasks" window it opens: a legacy grid
 *   (`TaskNotificationsGridHandler`) in a side modal, with the row boxes and
 *   the three actions "Mark New", "Mark Read" and "Delete" (Rules 2–3);
 * - `UnsubscribePage` — the reader-facing page a notification email's
 *   footer link opens (`templates/notification/unsubscribeNotificationsForm.tpl`
 *   and `…Result.tpl`; Rule 8);
 * - the toast helpers (`layouts/backend.tpl` `.app__notifications`; Rule 9).
 *
 * App neutrality (PRINCIPLES M2): every string here is a lib/pkp string
 * shared by the three apps ("Tasks", "Close", "Mark Read", "Mark New",
 * "Delete", "No Items", "Unsubscribe" and its sentences). What differs per
 * app — the task sentences, the row list, the box names — is passed in by
 * the suite (`row(text)`, `box(settingName)`).
 *
 * DOM facts the locators rely on (probed live 2026-09-04, all three apps,
 * `.reports/U05/screen-notes.md` pT, pN, pU, ccK1, ccK4):
 * - the bell is a `button` whose text is the screen-reader "Tasks" plus the
 *   badge number ("Tasks" / "Tasks 1"); it is `disabled` while the window is
 *   open and then shows no badge; the badge is read at page load and, after
 *   an action inside the window, refreshed when the window closes;
 * - the window is a side modal (`role=dialog`) headed "Tasks" with a
 *   back-arrow button named "Close"; rows are `tr.gridRow`, each holding a
 *   box (`input[type=checkbox]`) and one link (`…/task-notifications-grid/
 *   mark-read?redirect=1&selectedElements[]=<id>`) wrapping `div.task`
 *   (`div.task.unread` while unread) with `.message` and `.details`
 *   (`.acronym` on a multi-context account, `.submission` for the title);
 * - the three actions are links; each POSTs to `…/mark-read`, `…/mark-new`
 *   or `…/delete-notifications` and re-renders the grid with every box
 *   unticked; "Delete" asks nothing; an empty list reads "No Items";
 * - the Unsubscribe page is the frontend layout (no `main`): `h1`
 *   "Unsubscribe", `form#unsubscribeNotificationForm` with one
 *   `input#emailNotification{Type}` per row (every one ticked on arrival),
 *   the "user profile" link and a `button.submit` "Unsubscribe"; the result
 *   page has no form and the same address (wait on the POST, not the URL).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

/** The task sentence a discussion raises (`submission.query.new`). */
const DISCUSSION_TASK = ({creatorName, name, message}) =>
    `${creatorName} started a discussion: ${name}: ${message}`;

/** Every toast currently shown at the top right (`.pkpNotification`). */
function toasts(page) {
    return page.locator('[role="status"].app__notifications .pkpNotification');
}

/** The success toasts (green left edge, `.pkpNotification--success`). */
function successToasts(page) {
    return page.locator('.pkpNotification.pkpNotification--success');
}

/** A toast's "×" control (named "Close" for screen readers). */
function toastCloseButton(toast) {
    return toast.getByRole('button', {name: 'Close'});
}

exports.DISCUSSION_TASK = DISCUSSION_TASK;
exports.toasts = toasts;
exports.successToasts = successToasts;
exports.toastCloseButton = toastCloseButton;

exports.TasksPanel = class TasksPanel extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page an editorial page (the header carries the bell)
     */
    constructor(page) {
        super(page);
    }

    // ---------------------------------------------------------------------
    // The bell (Rule 2a)
    // ---------------------------------------------------------------------

    /** The bell button; its text is "Tasks" plus the badge number, if any. */
    bell() {
        return this.page.getByRole('button', {name: /^Tasks/});
    }

    /**
     * The badge reads `count`; `0` means no badge at all. Read on a freshly
     * loaded page, or after the window closed (Rule 2a).
     */
    async expectCount(count) {
        // The button's text is the screen-reader "Tasks" plus the badge,
        // with whitespace around both.
        await expect(this.bell()).toHaveText(
            count ? new RegExp(`^\\s*Tasks\\s*${count}\\s*$`) : /^\s*Tasks\s*$/,
            {timeout: 30_000}
        );
    }

    // ---------------------------------------------------------------------
    // The window (Rule 2b)
    // ---------------------------------------------------------------------

    /** The open window: the dialog headed "Tasks". */
    dialog() {
        return this.page
            .getByRole('dialog')
            .filter({has: this.page.getByRole('heading', {name: 'Tasks', exact: true})});
    }

    /** The grid inside the window (present once the legacy fetch landed). */
    grid() {
        return this.dialog().locator('table').first();
    }

    /** Press the bell and wait for the window and its grid. */
    async open() {
        await this.bell().click();
        await expect(this.dialog()).toBeVisible({timeout: 30_000});
        await expect(this.grid()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Press the window's "Close" (the back arrow) and wait for it to go. */
    async close() {
        await this.dialog().getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(this.dialog()).toHaveCount(0, {timeout: 30_000});
    }

    /** Every task row, newest first. */
    rows() {
        return this.dialog().locator('tr.gridRow');
    }

    /** The row(s) carrying `text` (a sentence, a title or both). */
    row(text) {
        return this.rows().filter({hasText: text});
    }

    /** The empty list's "No Items" cell. */
    noItems() {
        return this.dialog().getByText('No Items', {exact: true});
    }

    /** A row's sentence (`.message`). */
    sentence(row) {
        return row.locator('.task .message');
    }

    /** A row's submission title (`.details .submission`). */
    title(row) {
        return row.locator('.task .details .submission');
    }

    /** A row's journal mark (`.details .acronym`; only on a multi-context account). */
    acronym(row) {
        return row.locator('.task .details .acronym');
    }

    /** The row's text is one link (Rule 2c). */
    link(row) {
        return row.getByRole('link').first();
    }

    async expectUnread(row) {
        await expect(row.locator('div.task.unread')).toHaveCount(1);
    }

    async expectRead(row) {
        await expect(row.locator('div.task')).toHaveCount(1);
        await expect(row.locator('div.task.unread')).toHaveCount(0);
    }

    /** A row's box at the start of the row. */
    box(row) {
        return row.locator('input[type="checkbox"]');
    }

    /**
     * Press the row's text: the task is marked read and the browser leaves
     * for the submission (Rule 2c). The caller asserts the landing.
     */
    async openTask(row) {
        await this.link(row).click();
    }

    // ---------------------------------------------------------------------
    // Mark Read, Mark New, Delete (Rule 3)
    // ---------------------------------------------------------------------

    /** One of the three action links under the table. */
    actionLink(name) {
        return this.dialog().getByRole('link', {name, exact: true});
    }

    /**
     * Press "Mark Read", "Mark New" or "Delete" and wait for the grid to
     * re-render (the action's POST, then jQuery idle). With no box ticked the
     * grid may send nothing; pass `expectRequest: false` then, and pair the
     * press with a ticked one as the positive control.
     */
    async act(name, {expectRequest = true} = {}) {
        const op = {'Mark Read': 'mark-read', 'Mark New': 'mark-new', Delete: 'delete-notifications'}[name];
        if (!op) {
            throw new Error(`TasksPanel.act: unknown action "${name}"`);
        }
        const done = expectRequest
            ? this.page.waitForResponse((response) => response.url().includes(`/${op}`), {timeout: 30_000})
            : Promise.resolve();
        await this.actionLink(name).click();
        await done;
        await waitForJQueryIdle(this.page);
    }
};

exports.UnsubscribePage = class UnsubscribePage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        super(page);
        this.heading = page.getByRole('heading', {name: 'Unsubscribe', exact: true});
        this.form = page.locator('form#unsubscribeNotificationForm');
        this.successHeading = page.getByRole('heading', {name: 'You have been unsubscribed', exact: true});
        this.errorHeading = page.getByRole('heading', {name: 'We could not unsubscribe you', exact: true});
    }

    /** Open an emailed link (the full address, code and number included). */
    async goto(link) {
        await this.page.goto(link);
        await expect(this.heading).toBeVisible({timeout: 30_000});
        await expect(this.form).toBeVisible();
    }

    /** "Select the emails that you no longer wish to receive at {email} from {journal name}." */
    sentence() {
        return this.page.getByText('Select the emails that you no longer wish to receive at');
    }

    /** Every box, in the page's order. */
    boxes() {
        return this.form.locator('input[type="checkbox"]');
    }

    /** The label texts of the boxes, in order. */
    async boxLabels() {
        const labels = await this.form.locator('label').allInnerTexts();
        return labels.map((label) => label.trim());
    }

    /** One box by its setting name (`emailNotificationNewQuery`, …). */
    box(settingName) {
        return this.form.locator(`input#${settingName}`);
    }

    /** The "user profile" link (on the form and on the result page). */
    profileLink() {
        return this.page.getByRole('link', {name: 'user profile', exact: true});
    }

    button() {
        return this.form.locator('button.submit');
    }

    /**
     * Press "Unsubscribe" and wait for the form's POST to answer. The result
     * page keeps the same address, so the caller asserts `successHeading`
     * or `errorHeading` next.
     */
    async unsubscribe() {
        const posted = this.page.waitForResponse(
            (response) =>
                response.request().method() === 'POST' && /\/notification\/unsubscribe/.test(response.url()),
            {timeout: 30_000}
        );
        await this.button().click();
        await posted;
    }

    /** The result page's sentence (success or error). */
    resultSentence() {
        return this.page.locator('.page_unsubscribe_notifications p').first();
    }
};
