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
 * - the toast helpers (`layouts/backend.tpl` `.app__notifications`; Rule 9);
 * - `ReaderHeader` — the reader-facing header's user menu
 *   (`frontend/components/header.tpl` `#navigationUserWrapper`): the
 *   signed-in name with its unread count and the entries under it (Rule 4).
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
 *   page has no form and the same address (wait on the POST, not the URL);
 * - a broken footer link answers the bare page `<h1>404 Not Found</h1>`,
 *   no title, no journal header (probed 2026-09-13, `.reports/U05/tojs`);
 * - the reader-side user menu is `#navigationUserWrapper > ul > li > a`
 *   (the name, `data-toggle="dropdown"`) holding `span.task_count` for the
 *   roles Rule 4 names, and under it a hidden `ul.dropdown-menu` whose
 *   entries are links ("Dashboard" with its own `span.task_count` where the
 *   name has one, "View Profile", "Logout"); the entries are in the DOM but
 *   hidden until the name is pressed (probed 2026-09-13, `.reports/U05/tojs`);
 * - a task row's text link (`a.pkp_linkaction_details`) is shorter than its
 *   cell, so the cell's bottom-right corner is the blank part of the row
 *   (Rule 2c; probed 2026-09-13, the window stayed open);
 * - a toast lives 5 s (`Page.vue` `expire: Date.now() + 5000`), swept every
 *   250 ms unless the pointer rests on the toast area (`:hover` on the
 *   container pauses the sweep for every toast).
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

/**
 * Run `action` with a wait for the success toast `text` already armed, so a
 * toast raised during the action is caught even when the action's own waits
 * (a save response, jQuery idle, a window closing) outlive the toast's
 * lifetime (TOAST_LIFETIME_MS): reading it only after the action returns lost
 * U35 S2's "User added as a stage participant." on CI (2026-09-22).
 */
async function expectToastDuring(page, text, action, {timeout = 30_000} = {}) {
    const seen = expect(successToasts(page).filter({hasText: text})).toBeVisible({timeout});
    seen.catch(() => {});
    await action();
    await seen;
}

/** A toast's "×" control (named "Close" for screen readers). */
function toastCloseButton(toast) {
    return toast.getByRole('button', {name: 'Close'});
}

/** How long a toast lives once the pointer is off the toast area (`Page.vue`). */
const TOAST_LIFETIME_MS = 5000;

/**
 * `below` is stacked under `above` (Rule 9: each new toast under the last):
 * both visible, and the second's top edge below the first's.
 */
async function expectStackedBelow(above, below) {
    await expect(above).toBeVisible();
    await expect(below).toBeVisible();
    const [top, bottom] = await Promise.all([above.boundingBox(), below.boundingBox()]);
    expect(top, 'the upper toast has a box').toBeTruthy();
    expect(bottom, 'the lower toast has a box').toBeTruthy();
    expect(bottom.y).toBeGreaterThan(top.y);
}

/**
 * Rest the pointer on `toast` and hold it there past the toast's own
 * lifetime, reading it visible all the while (the one claim in this spec
 * that only the app's own timer bounds: "stays while the pointer rests on
 * it"); then move the pointer off and wait for the toast to disappear by
 * itself. `lifetimeMs` is the app's constant, never a guess.
 */
async function expectStaysWhileHovered(page, toast, {lifetimeMs = TOAST_LIFETIME_MS} = {}) {
    await toast.hover();
    const start = Date.now();
    while (Date.now() - start < lifetimeMs + 1000) {
        await expect(toast).toBeVisible();
        await page.waitForTimeout(250);
    }
    await page.mouse.move(0, 0);
    await expect(toast).toBeHidden({timeout: lifetimeMs + 10_000});
}

exports.DISCUSSION_TASK = DISCUSSION_TASK;
exports.TOAST_LIFETIME_MS = TOAST_LIFETIME_MS;
exports.toasts = toasts;
exports.successToasts = successToasts;
exports.expectToastDuring = expectToastDuring;
exports.toastCloseButton = toastCloseButton;
exports.expectStackedBelow = expectStackedBelow;
exports.expectStaysWhileHovered = expectStaysWhileHovered;

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

    /** The badge's number as the bell shows it now (0 when there is no badge). */
    async count() {
        const text = (await this.bell().innerText()).replace(/\s+/g, ' ').trim();
        const match = text.match(/^Tasks(?: (\d+))?$/);
        if (!match) {
            throw new Error(`TasksPanel.count: the bell reads "${text}"`);
        }
        return match[1] ? Number(match[1]) : 0;
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

    /** The row(s) whose sentence matches `pattern` (a RegExp on the `.message`). */
    rowsOpening(pattern) {
        return this.rows().filter({has: this.page.locator('.task .message', {hasText: pattern})});
    }

    /**
     * Every row as "{sentence} | {title}" in the window's order, read in one
     * pass so two windows can be compared (Rule 2d: the same rows from any
     * journal's editorial page and from the site-level Profile page).
     */
    async rowTexts() {
        return this.rows().evaluateAll((rows) =>
            rows.map((row) => {
                const text = (selector) => (row.querySelector(selector)?.textContent || '').replace(/\s+/g, ' ').trim();
                return `${text('.task .message')} | ${text('.task .details .submission')}`;
            })
        );
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

    /**
     * Press the blank part of the row (Rule 2c): the task cell's bottom-right
     * corner, below the link that wraps the sentence and the title. Nothing
     * happens: the window stays open with the row as it was, on the same
     * address; the caller's next press of the link is the positive control.
     */
    async pressBlankPart(row) {
        const cell = row.locator('td').last();
        const box = await cell.boundingBox();
        expect(box, 'the task cell has a box').toBeTruthy();
        const address = this.page.url();
        await cell.click({position: {x: box.width - 4, y: box.height - 4}});
        await expect(this.dialog()).toBeVisible();
        await expect(row).toBeVisible();
        await expect(this.page).toHaveURL(address);
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

    /**
     * Rule 8a's three broken links, built from an emailed one
     * (`…/unsubscribe?validate={code}&id={n}`): `codeOnly` (everything from
     * the "&" on deleted), `idOnly` (the code and its name cut out, so the
     * address ends "?id={n}") and `unknownId` (intact, 999999999 in place
     * of the notification number).
     */
    static brokenLinks(link) {
        if (!/\/notification\/unsubscribe\?validate=[^&]+&id=\d+$/.test(link)) {
            throw new Error(`UnsubscribePage.brokenLinks: unexpected link shape ${link}`);
        }
        return {
            codeOnly: link.replace(/&id=\d+$/, ''),
            idOnly: link.replace(/validate=[^&]+&/, ''),
            unknownId: link.replace(/id=\d+$/, 'id=999999999'),
        };
    }

    /**
     * Open `url` and read the bare "404 Not Found" page (Rule 8a): the
     * response is a 404, the page's whole text is that heading, and no
     * journal header or Unsubscribe form is on it.
     */
    async expectNotFound(url) {
        const response = await this.page.goto(url);
        expect(response, 'a response').toBeTruthy();
        expect(response.status(), `${url} answered`).toBe(404);
        await expect(this.page.getByRole('heading', {name: '404 Not Found', exact: true})).toBeVisible();
        await expect(this.page.locator('body')).toHaveText(/^\s*404 Not Found\s*$/);
        await expect(this.page.locator('#navigationUserWrapper')).toHaveCount(0);
        await expect(this.form).toHaveCount(0);
    }

    /** Press "user profile" (Rule 8e); the caller asserts the landing (Login or the Profile page). */
    async pressProfileLink() {
        await this.profileLink().first().click();
        await this.page.waitForLoadState('domcontentloaded');
    }
};

exports.ReaderHeader = class ReaderHeader extends BasePage {
    /**
     * The reader-facing header's user menu (Rule 4): the signed-in name
     * (a dropdown toggle) with its unread count where the role has one, and
     * the entries under it ("Dashboard", "View Profile", "Logout"; a Site
     * Administrator also "Administration").
     *
     * @param {import('@playwright/test').Page} page a reader-facing page (a journal's or the site's home)
     */
    constructor(page) {
        super(page);
        this.wrapper = page.locator('#navigationUserWrapper');
        this.toggle = this.wrapper.locator('> ul > li > a[data-toggle="dropdown"]');
        this.menu = this.wrapper.locator('ul.dropdown-menu');
    }

    /** The count beside the name (`span.task_count` inside the toggle). */
    nameCount() {
        return this.toggle.locator('span.task_count');
    }

    /** "{name} {count}": the name is followed by the number the bell shows (Rule 4). */
    async expectCount(username, count) {
        await expect(this.toggle).toBeVisible({timeout: 30_000});
        await expect(this.nameCount()).toHaveText(String(count));
        await expect(this.toggle).toHaveText(new RegExp(`^\\s*${escapeRegExp(username)}\\s+${count}\\s*$`));
    }

    /** The bare name: no count element and no number after the name (Rule 4). */
    async expectBareName(username) {
        await expect(this.toggle).toBeVisible({timeout: 30_000});
        await expect(this.toggle).toHaveText(new RegExp(`^\\s*${escapeRegExp(username)}\\s*$`));
        await expect(this.nameCount()).toHaveCount(0);
    }

    /** Press the name: the entries under it show. */
    async open() {
        await this.toggle.click();
        await expect(this.entry('View Profile')).toBeVisible({timeout: 30_000});
    }

    /** An entry under the name, by the start of its text ("Dashboard" matches "Dashboard 1"). */
    entry(name) {
        return this.menu.getByRole('link', {name: new RegExp(`^${escapeRegExp(name)}(\\s+\\d+)?$`)});
    }

    /** The count after "Dashboard" (`span.task_count` inside that entry). */
    dashboardCount() {
        return this.entry('Dashboard').locator('span.task_count');
    }

    /** The open menu's entries, as their texts with whitespace collapsed. */
    async entryTexts() {
        const texts = await this.menu.getByRole('link').allInnerTexts();
        return texts.map((text) => text.replace(/\s+/g, ' ').trim());
    }
};

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
