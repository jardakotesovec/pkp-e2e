// @ts-check
/**
 * @file shared/playwright/pages/ActivityLogPages.js
 *
 * Page objects for the Submission activity log & notes feature (spec:
 * docs/specs/U38-submission-activity-log-and-notes.md), shared by the OJS,
 * OMP and OPS suites. The window is one legacy surface
 * (`SubmissionInformationCenterHandler` and its event-log grid) in all three
 * apps. App-neutral: nothing here names an app; every per-app string (a
 * submit line's wording, a role's label) stays in the suites.
 *
 * Surfaces:
 * - ActivityLogWindow — the header's "Activity Log" (named by the shared
 *   frame, `WorkflowPage.headerButton`) and the "Activity Log & Notes"
 *   window it opens: the "History" and "Notes" tabs; a History line's
 *   Date / User / Event cells, its arrow and the strip under it ("Download",
 *   "View Email", "View changes"); the notes with their writer, date, text
 *   and "Delete", the "Add Note" box and button, the "Confirm" dialog of a
 *   note's "Delete"; closing by "Close" or Escape.
 * - ViewEmailWindow — the "View Email" window an email line's strip opens.
 *
 * Browser dialogs (the window's "The data on this form has changed…" and
 * the page-leave question) are the caller's: register
 * `SubmissionFilesPages.recordBrowserDialogs` before the step that asks.
 *
 * DOM shapes (U38 claim check, `.reports/U38/screen-notes.md`, ccK1–ccK3,
 * all three apps, 2026-09-23): the window is a dialog named after its
 * title; the tabs are `li[role=tab]` carrying `aria-selected`, each tab's
 * body a tabpanel named after it, which shows a loading indicator until
 * the grid or the notes arrive; History rows are `tr.gridRow` with the
 * cells Date, User, Event; a line with an action carries `a.show_extras`
 * (screen-reader text "Settings") inside its Date cell, and pressing it
 * inserts the strip as the NEXT `tr` (patterns.md pitfall 10: never press
 * an arrow twice); each note is `.pkp_notes_list .note` with `.user`,
 * `.date`, `.message` and a `button[id^=deleteNote-]`.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');
const {captureDownload} = require('./SubmissionFilesPages.js');

/** The window's title (Rule 1). */
const TITLE = 'Activity Log & Notes';
exports.ACTIVITY_LOG_TITLE = TITLE;

/** The tabs, in order (Rule 1). */
exports.ACTIVITY_LOG_TABS = ['History', 'Notes'];

/** "History"'s columns (Rule 2). */
exports.HISTORY_COLUMNS = ['Date', 'User', 'Event'];

/** The texts of Rule 10 and its sub-rules, verbatim. */
exports.NOTES_TEXT = {
    none: 'There are no notes to display.',
    posted: 'Note posted.',
    deleted: 'Note deleted.',
    historyLine: 'Posted new note.',
    deleteTitle: 'Confirm',
    deleteQuestion: 'Are you sure you wish to delete this note?',
    formChanged: 'The data on this form has changed. Do you wish to continue without saving?',
};

/**
 * The request that brings each tab's contents (a switch reloads the tab,
 * Rule 1b): "History"'s grid and "Notes"' list, so a read after a switch is
 * never the previous load's.
 */
const TAB_FETCH = {
    History: 'submission-event-log-grid/fetch-grid',
    Notes: 'view-notes',
};

/** Collapse whitespace. */
function flat(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

exports.ActivityLogWindow = class ActivityLogWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('./WorkflowPage.js').WorkflowPage} frame the open workflow panel
     */
    constructor(page, frame) {
        super(page);
        this.frame = frame;
    }

    // --- The window (Rule 1) ---------------------------------------------

    /** The header's "Activity Log" button. */
    button() {
        return this.frame.headerButton('Activity Log');
    }

    /** The window, found by its title. */
    dialog() {
        return this.page.getByRole('dialog', {name: TITLE, exact: true});
    }

    /** The window's level-1 heading. */
    heading() {
        return this.dialog().getByRole('heading', {name: TITLE, exact: true, level: 1});
    }

    /** The window's header "Close". */
    closeButton() {
        return this.dialog().getByRole('button', {name: 'Close', exact: true}).first();
    }

    /** Press "Activity Log" and wait for the window with "History" loaded. */
    async open() {
        const fetched = this.page.waitForResponse((r) => r.url().includes(TAB_FETCH.History), {timeout: 30_000});
        await this.button().click();
        await fetched;
        await this.expectOpen();
    }

    /** The window is open, on "History", its table loaded. */
    async expectOpen() {
        await expect(this.heading()).toBeVisible({timeout: 30_000});
        await this.expectTab('History');
        await this.expectHistoryLoaded();
    }

    /** Press the window's "Close" and wait for it to go (nothing typed, or the question answered "OK"). */
    async close() {
        await this.closeButton().click();
        await this.expectClosed();
    }

    /** The window is gone. */
    async expectClosed() {
        await expect(this.dialog()).toHaveCount(0, {timeout: 30_000});
    }

    tabs() {
        return this.dialog().getByRole('tab');
    }

    tab(name) {
        return this.dialog().getByRole('tab', {name, exact: true});
    }

    /** The named tab is the selected one. */
    async expectTab(name) {
        await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true', {timeout: 30_000});
    }

    /** A tab's panel. */
    panel(name) {
        return this.dialog().getByRole('tabpanel', {name});
    }

    /**
     * Press a tab and wait for its contents (Rule 1b: each press reloads it).
     * A question the tab switch raises (Rule 10d) is the caller's: pass
     * `{loaded: false}` when the switch may be refused.
     */
    async selectTab(name, {loaded = true} = {}) {
        if (!loaded) {
            await this.tab(name).click();
            return;
        }
        const fetched = this.page.waitForResponse((r) => r.url().includes(TAB_FETCH[name]), {timeout: 30_000});
        await this.tab(name).click();
        await fetched;
        await this.expectTab(name);
        if (name === 'History') {
            await this.expectHistoryLoaded();
        } else {
            await this.expectNotesLoaded();
        }
    }

    // --- "History" (Rules 2–9) ---------------------------------------------

    /** "History"'s column headers. */
    historyHeaders() {
        return this.panel('History').getByRole('columnheader');
    }

    /** "History"'s lines (legacy grid rows), newest first. */
    historyRows() {
        return this.panel('History').locator('tbody tr.gridRow');
    }

    /** Wait until "History" shows its lines (a submission always has some). */
    async expectHistoryLoaded() {
        await expect(this.historyRows().first()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /**
     * Every line as `{date, user, event, arrow}`, top to bottom. Read it
     * after `expectHistoryLoaded()` or through `expect.poll`.
     *
     * @returns {Promise<Array<{date: string, user: string, event: string, arrow: boolean}>>}
     */
    async historyLines() {
        return this.historyRows().evaluateAll((rows) =>
            rows.map((tr) => {
                // The arrow's screen-reader text ("Settings") sits inside the
                // Date cell; inline scripts sit in the cells too: both dropped.
                const cellText = (/** @type {Element | undefined} */ td) => {
                    if (!td) {
                        return '';
                    }
                    const copy = /** @type {Element} */ (td.cloneNode(true));
                    copy.querySelectorAll('script, a.show_extras, a.hide_extras').forEach((e) => e.remove());
                    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
                };
                const tds = Array.from(tr.querySelectorAll(':scope > td'));
                return {
                    date: cellText(tds[0]),
                    user: cellText(tds[1]),
                    event: cellText(tds[2]),
                    arrow: !!tr.querySelector('a.show_extras, a.hide_extras'),
                };
            })
        );
    }

    /** The lines whose Event reads exactly `event` (whitespace folded). */
    async linesWith(event) {
        return (await this.historyLines()).filter((line) => line.event === flat(event));
    }

    /** The row(s) whose Event cell reads exactly `event`. */
    historyRow(event) {
        return this.historyRows().filter({
            has: this.page.locator('td:last-child').filter({hasText: new RegExp(`^\\s*${escapeRegExp(flat(event))}\\s*$`)}),
        });
    }

    /** A row's arrow (screen-reader text "Settings"). */
    arrow(row) {
        return row.locator('a.show_extras');
    }

    /** The strip under a row (the next `tr`), once its arrow was pressed. */
    strip(row) {
        return row.locator('xpath=following-sibling::tr[1]');
    }

    /**
     * Press the arrow at the start of the line whose event is `event` and
     * return the strip under it. Press each arrow once only (pitfall 10).
     */
    async openStrip(event) {
        const row = this.historyRow(event).first();
        await this.arrow(row).click();
        const strip = this.strip(row);
        await expect(strip.getByRole('link').first()).toBeVisible({timeout: 30_000});
        return strip;
    }

    /** The strip's action links' names, left to right. */
    async stripActions(strip) {
        return (await strip.getByRole('link').allInnerTexts()).map(flat).filter(Boolean);
    }

    /** Press a strip's "Download" and return the download (Rule 6a). */
    async download(strip) {
        const link = strip.getByRole('link', {name: 'Download', exact: true});
        await expect(link).toBeVisible({timeout: 30_000});
        return await captureDownload(this.page, () => link.click());
    }

    /** Press a strip's "View Email" and wait for its window (Rule 7). */
    async viewEmail(strip) {
        await strip.getByRole('link', {name: 'View Email', exact: true}).click();
        const win = new exports.ViewEmailWindow(this.page);
        await win.expectOpen();
        return win;
    }

    // --- "Notes" (Rule 10) -----------------------------------------------

    /** The "Add Note" box. */
    noteBox() {
        return this.panel('Notes').getByRole('textbox', {name: 'Add Note'});
    }

    /** The "Add Note" button. */
    addNoteButton() {
        return this.panel('Notes').getByRole('button', {name: 'Add Note', exact: true});
    }

    /** The submission's notes list. */
    notesList() {
        return this.panel('Notes').locator('.pkp_notes_list').first();
    }

    /** Every listed note. */
    notes() {
        return this.notesList().locator('.note');
    }

    /** A note by its text. */
    note(text) {
        return this.notes().filter({has: this.page.locator('.message').filter({hasText: text})});
    }

    /** A note's writer. */
    noteUser(note) {
        return note.locator('.user');
    }

    /** A note's date and time. */
    noteDate(note) {
        return note.locator('.date');
    }

    /** A note's text. */
    noteText(note) {
        return note.locator('.message');
    }

    /** A note's "Delete". */
    noteDeleteButton(note) {
        return note.getByRole('button', {name: 'Delete', exact: true});
    }

    /** "There are no notes to display." */
    noNotes() {
        return this.panel('Notes').getByText(exports.NOTES_TEXT.none, {exact: true});
    }

    /** "Notes" has arrived: the box is there. */
    async expectNotesLoaded() {
        await expect(this.noteBox()).toBeVisible({timeout: 30_000});
        await expect(this.addNoteButton()).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** Type a note and press "Add Note"; resolves with the save's answer once the list has redrawn. */
    async addNote(text) {
        await this.noteBox().fill(text);
        const saved = this.page.waitForResponse((r) => r.url().includes('save-note'), {timeout: 30_000});
        await this.addNoteButton().click();
        const response = await saved;
        await waitForJQueryIdle(this.page);
        return response;
    }

    /** The "Confirm" dialog a note's "Delete" opens. */
    deleteDialog() {
        return this.page
            .getByRole('dialog', {name: exports.NOTES_TEXT.deleteTitle, exact: true})
            .filter({hasText: exports.NOTES_TEXT.deleteQuestion});
    }

    /** Press a note's "Delete" and wait for the "Confirm" dialog. */
    async pressDelete(note) {
        await this.noteDeleteButton(note).click();
        await expect(this.deleteDialog()).toBeVisible({timeout: 30_000});
        return this.deleteDialog();
    }

    /**
     * "Cancel" in the "Confirm" dialog. The modal store keeps a closed
     * dialog's slot for 450 ms on a timer, and a "Delete" pressed inside it
     * opens nothing (patterns.md pitfall 4; U38 tojs, 2026-09-24), so this
     * returns once a page timer longer than the app's has run.
     */
    async cancelDelete() {
        await this.deleteDialog().getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(this.deleteDialog()).toHaveCount(0, {timeout: 30_000});
        await this.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
    }

    /** "OK" in the "Confirm" dialog; resolves with the delete's answer. */
    async confirmDelete() {
        const answered = this.page.waitForResponse((r) => r.url().includes('delete-note'), {timeout: 30_000});
        await this.deleteDialog().getByRole('button', {name: 'OK', exact: true}).click();
        const response = await answered;
        await expect(this.deleteDialog()).toHaveCount(0, {timeout: 30_000});
        await waitForJQueryIdle(this.page);
        return response;
    }
};

/** Escape a string for a RegExp. */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// "View Email" (Rule 7)
// ---------------------------------------------------------------------------

exports.ViewEmailWindow = class ViewEmailWindow extends BasePage {
    dialog() {
        return this.page.getByRole('dialog', {name: 'View Email', exact: true});
    }

    /** The window is open with the email's lines loaded. */
    async expectOpen() {
        await expect(this.dialog()).toBeVisible({timeout: 30_000});
        await expect(this.dialog()).toContainText('Subject:', {timeout: 30_000});
        await waitForJQueryIdle(this.page);
    }

    /** The window's text, line by line (blank lines dropped). */
    async lines() {
        const text = await this.dialog().innerText();
        return text
            .split('\n')
            .map((s) => s.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
    }

    /** The window's whole text, whitespace folded. */
    async text() {
        return flat(await this.dialog().innerText());
    }

    /** Close it with its "Close". */
    async close() {
        await this.dialog().getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(this.dialog()).toHaveCount(0, {timeout: 30_000});
    }
};
