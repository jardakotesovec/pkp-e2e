// @ts-check
/**
 * @file shared/playwright/pages/SectionsPages.js
 *
 * Page objects for U17 "Sections" (docs/specs/U17-sections.md), shared by
 * the OJS, OMP and OPS suites. App-neutral: every on-screen word that
 * differs per app (the tab's name "Sections" / "Series", the add link
 * "Create Section" / "Add Series", the window's form id, the address word
 * of a preprint server's pages) is passed in by the suite or has a
 * journal default the suite overrides; the locators are the markup the
 * three apps share (lib/pkp's legacy settings grid, its AjaxModal window
 * and the Vue confirmation dialog, and the default theme's pages).
 *
 * Surfaces:
 * - SectionsTab — Settings › Journal (Press, Server) › "Sections"
 *   ("Series"): the table's heading, "Create Section" / "Add Series",
 *   "Order", the column headers, the rows in order, a row's "Editors"
 *   cell and "Inactive" box, the row's arrow and its "Edit" / "Delete"
 *   links, the "Order" mode ("Done", "Cancel ordering", a row dragged
 *   onto another), and the "No Items" line.
 * - SectionWindow — the section window ("Create Section" / "Edit") and
 *   the series window ("Add Series" / "Edit"): its heading, the boxes by
 *   their form name, the formatted-text boxes (TinyMCE), the tick boxes
 *   by label, the "Editorial Assignments" boxes, the "Review Form" list,
 *   the messages under the boxes, "Save" (bounded by the save's answer or,
 *   when the browser refuses, by the message, counting the posts) and
 *   "Cancel"; {OMP} the series window's lists ("Order of monographs"), its
 *   tick-box groups by label ("Categories") and its required-fields note.
 * - ConfirmWindow — the "Confirm" window of an "Inactive" box and the
 *   "Delete" window of a row's "Delete": its question, "OK", "Cancel".
 * - notices / markNotices / expectNotice / expectNoticeTopRight — the
 *   notice at the top right ("Your changes have been saved.", the
 *   refusals), armed before the action, told from a standing one;
 *   noticesGone — the column cleared by the app's own expiry.
 * - pastCloseWindow — the closed window's 450 ms slot, waited out.
 * - startFormSections — {OJS OPS} the start form's "Section" choices.
 * - SubmissionsPage — About › "Submissions": the notice under the heading,
 *   the submission checklist, the section policy blocks in order, each
 *   block's heading, text and "Make a new submission to the {section}
 *   section." line.
 * - ArchivePage — {OPS} "Archives" and the home page: the heading, the
 *   archive header (search box, category links), the preprint list.
 * - SectionPage — {OPS} a section's page, preprints/section/{path}: the
 *   heading, the description, the list, the empty line, a 404.
 *
 * DOM shapes from the U17 claim check (.reports/U17/screen-notes.md, the
 * kept scripts under shared/playwright/checks/U17/) and the OJS suite's
 * runs, 2026-09-25.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

const T = 30_000;

/** Escape a string for a RegExp. */
function esc(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A whole-text matcher (trimmed), for `filter({hasText})`. */
function whole(text) {
    return new RegExp(`^\\s*${esc(text)}\\s*$`);
}

/** Text with runs of white space collapsed. */
function flat(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

/** A context-relative address: '/index.php/<path>[/<locale>]<pathname>'. */
function contextAddress(contextPath, locale, pathname = '') {
    return `/index.php/${contextPath}${locale ? `/${locale}` : ''}${pathname}`;
}

/** A section / series window's save (the component router's kebab-cased ops). */
function isWindowSave(request) {
    return request.method() === 'POST' && /\/(section|series)-grid\/update-(section|series)/.test(request.url());
}

// ---------------------------------------------------------------------------
// The notice at the top right
// ---------------------------------------------------------------------------

/**
 * The notices at the top right (the Vue notification area every legacy
 * save and refusal ends in), optionally those carrying `text`; with
 * `fresh`, only those shown after the last `markNotices`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|RegExp} [text]
 * @param {{fresh?: boolean}} [options]
 */
function notices(page, text, {fresh = false} = {}) {
    const all = page.locator(`.app__notifications .pkpNotification${fresh ? ':not([data-seen])' : ''}`);
    return text ? all.filter({hasText: text}) : all;
}

/**
 * Mark every notice now on screen as seen, so a later read with `fresh`
 * finds only the ones an action shows afterwards (an earlier action's
 * notice may still stand, and a window over the page can cover its "×").
 *
 * @param {import('@playwright/test').Page} page
 */
async function markNotices(page) {
    await page.evaluate(() => {
        document.querySelectorAll('.app__notifications .pkpNotification').forEach((n) => n.setAttribute('data-seen', '1'));
    });
}

/**
 * Run `action` and wait for a fresh notice carrying `text` at the top
 * right. The notices already on screen are marked first, and the wait is
 * armed before the action: the notice goes after a few seconds.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|RegExp} text
 * @param {() => Promise<any>} action
 */
async function expectNotice(page, text, action) {
    await markNotices(page);
    const seen = expect(notices(page, text, {fresh: true}).first()).toBeVisible({timeout: T});
    seen.catch(() => {});
    const result = await action();
    await seen;
    return result;
}

/**
 * Wait until every notice at the top right has gone (the app drops each
 * five seconds after it shows). Notices stack downward, so a fourth one
 * stands below the viewport's top third; a scenario that reads a notice's
 * place after several refusals clears the column first (added by the OMP
 * author, 2026-09-25).
 *
 * @param {import('@playwright/test').Page} page
 */
async function noticesGone(page) {
    await expect(notices(page)).toHaveCount(0, {timeout: T});
}

/**
 * `expectNotice`, then read that the notice stands at the top right of the
 * viewport (right half, top third).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|RegExp} text
 * @param {() => Promise<any>} action
 */
async function expectNoticeTopRight(page, text, action) {
    const result = await expectNotice(page, text, action);
    const box = await notices(page, text, {fresh: true}).first().boundingBox();
    const viewport = page.viewportSize();
    expect(
        !!(box && viewport && box.x + box.width > viewport.width / 2 && box.y < viewport.height / 3),
        `"${text}" stands at the top right`
    ).toBe(true);
    return result;
}

/**
 * Wait out the slot a closed window keeps for 450 ms on the app's timer: an
 * opener pressed within it opens nothing (patterns.md, pitfall 4). A page
 * timer longer than the app's fires after it whatever the load.
 *
 * @param {import('@playwright/test').Page} page
 */
async function pastCloseWindow(page) {
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
}

// ---------------------------------------------------------------------------
// "Make a Submission" {OJS OPS}
// ---------------------------------------------------------------------------

/**
 * The start form's "Section" choices, in form order (for `toHaveText([...])`).
 *
 * @param {import('@playwright/test').Page} page
 */
function startFormSections(page) {
    return page.locator('label.pkpFormField--options__option:has(input[name="sectionId"])');
}

// ---------------------------------------------------------------------------
// Settings › Journal › "Sections" (Press › "Series", Server › "Sections")
// ---------------------------------------------------------------------------

class SectionsTab extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{tab?: string, addLabel?: string, gridId?: string, formId?: string, locale?: string}} [options]
     *   tab: the tab's and table's name ("Sections", "Series"); addLabel:
     *   "Create Section" / "Add Series"; gridId: the grid's container
     *   ("sectionsGridContainer", "seriesGridContainer"); formId: the
     *   window's form ("sectionForm", "seriesForm").
     */
    constructor(page, contextPath, {tab = 'Sections', addLabel = 'Create Section', gridId, formId, locale = ''} = {}) {
        super(page);
        this.contextPath = contextPath;
        this.tab = tab;
        this.addLabel = addLabel;
        this.gridId = gridId || (tab === 'Series' ? 'seriesGridContainer' : 'sectionsGridContainer');
        this.formId = formId || (tab === 'Series' ? 'seriesForm' : 'sectionForm');
        this.locale = locale;
    }

    url() {
        return contextAddress(this.contextPath, this.locale, '/management/settings/context');
    }

    /** The tab button of Settings › Journal (Press, Server). */
    tabButton() {
        return this.page.getByRole('tab', {name: this.tab, exact: true});
    }

    /** Open the settings page on the tab and wait until the table holds its rows (or "No Items"). */
    async goto() {
        await this.page.goto(this.url());
        await this.openTab();
    }

    /** Reload the page and reopen the tab. */
    async reload() {
        await this.page.reload();
        await this.openTab();
    }

    /** Press the tab (the page is open) and wait for the table's body. */
    async openTab() {
        await this.tabButton().click();
        await expect(this.grid().locator('table')).toBeVisible({timeout: T});
        await expect(this.grid().locator('tr.gridRow, tbody.empty').first()).toBeAttached({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** The grid's container. */
    grid() {
        return this.page.locator(`#${this.gridId}`);
    }

    /** The table's heading ("Sections", "Series"). */
    heading() {
        return this.grid().locator('.header').getByRole('heading', {name: this.tab, exact: true});
    }

    /** "Create Section" / "Add Series" at the table's top right. */
    addLink() {
        return this.grid().locator('.header').getByRole('link', {name: this.addLabel, exact: true});
    }

    /** "Order" at the table's top right (there from two rows on). */
    orderLink() {
        return this.grid().locator('.header').getByRole('link', {name: 'Order', exact: true});
    }

    /** The header's links, in screen order (words only). */
    headerLinks() {
        return this.grid().locator('.header ul.actions a:visible');
    }

    /** The column headers. */
    columnHeaders() {
        return this.grid().locator('table thead th');
    }

    /** Every section row (the controls rows and the "No Items" line excluded). */
    rows() {
        return this.grid().locator('tbody tr.gridRow');
    }

    /** The rows' titles, in screen order (a locator for `toHaveText([...])`). */
    titleCells() {
        return this.rows().locator('[id$="-title"]');
    }

    /** The row whose title is `title` (the whole title). */
    row(title) {
        return this.rows().filter({has: this.page.locator('[id$="-title"]').filter({hasText: whole(title)})});
    }

    /** A row's "Editors" cell (the series table's too). */
    editorsCell(title) {
        return this.row(title).locator('[id$="-editors"]');
    }

    /** A row's "Categories" cell {OMP}. */
    categoriesCell(title) {
        return this.row(title).locator('[id$="-categories"]');
    }

    /** A row's "Inactive" box. */
    inactiveBox(title) {
        return this.row(title).locator('input[type="checkbox"]');
    }

    /** The "No Items" line (hidden, but in the DOM, once a row exists). */
    noItems() {
        return this.grid().locator('tbody.empty');
    }

    /**
     * Press a row's arrow and return its controls row (the next `tr`). A
     * click that lands before the grid's handlers bind leaves the controls
     * hidden, so it is repeated (patterns.md, pitfall 10).
     */
    async rowControls(title) {
        const row = this.row(title);
        const controls = row.locator('xpath=following-sibling::tr[1]');
        for (let attempt = 0; attempt < 3; attempt++) {
            const toggle = row.locator('a.show_extras');
            if (await toggle.count()) {
                await toggle.click();
            }
            try {
                await expect(controls.getByRole('link', {name: 'Edit', exact: true})).toBeVisible({timeout: 10_000});
                return controls;
            } catch (e) {
                if (attempt === 2) throw e;
            }
        }
        return controls;
    }

    /** "Create Section" / "Add Series": the window, once its title box is there. */
    async openAdd() {
        await this.addLink().click();
        const win = new SectionWindow(this.page, {formId: this.formId});
        await win.waitLoaded();
        return win;
    }

    /** A row's arrow, then "Edit": the window, once its title box is there. */
    async openEdit(title) {
        const controls = await this.rowControls(title);
        await controls.getByRole('link', {name: 'Edit', exact: true}).click();
        const win = new SectionWindow(this.page, {formId: this.formId});
        await win.waitLoaded();
        return win;
    }

    /** A row's arrow, then "Delete": the "Delete" window. */
    async openDelete(title) {
        const controls = await this.rowControls(title);
        await controls.getByRole('link', {name: 'Delete', exact: true}).click();
        const win = new ConfirmWindow(this.page, 'Delete');
        await expect(win.root()).toBeVisible({timeout: T});
        return win;
    }

    /** Press a row's "Inactive" box: the "Confirm" window. */
    async pressInactive(title) {
        await this.inactiveBox(title).click();
        const win = new ConfirmWindow(this.page, 'Confirm');
        await expect(win.root()).toBeVisible({timeout: T});
        return win;
    }

    /**
     * Answer an open "Confirm" / "Delete" window with "OK" and wait for the
     * grid's answer (the toggle or delete op), the redraw it triggers and
     * the closed window's slot, so the next opener works at once.
     *
     * @param {ConfirmWindow} win
     * @returns {Promise<import('@playwright/test').Response>}
     */
    async confirm(win) {
        const answered = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/(section|series)-grid\/(delete|deactivate|activate)-(section|series)/.test(r.url()),
            {timeout: T}
        );
        await win.answer('OK');
        const response = await answered;
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
        return response;
    }

    // ---- "Order"

    /** "Done" and "Cancel ordering" under the table while ordering. */
    doneLink() {
        return this.grid().getByRole('link', {name: 'Done', exact: true});
    }

    cancelOrderingLink() {
        return this.grid().getByRole('link', {name: 'Cancel ordering', exact: true});
    }

    /** The rows' drag handles, shown while ordering (each row's move control, hidden otherwise). */
    dragHandles() {
        return this.rows().locator('.pkp_linkaction_moveItem:visible');
    }

    /**
     * Whether a row is in "Order" mode now (the mode gives each row the
     * class `ordering`); a one-shot read: assert with
     * `expect(tab.row(title)).toHaveClass(/\bordering\b/)` where it must settle.
     */
    async isOrdering(title) {
        const classes = (await this.row(title).getAttribute('class')) || '';
        return classes.split(/\s+/).includes('ordering');
    }

    /** "Order": the mode's "Done" and "Cancel ordering" show. */
    async startOrdering() {
        await this.orderLink().click();
        await expect(this.doneLink()).toBeVisible({timeout: T});
    }

    /**
     * Drag the row `from` onto the top of the row `to` with the mouse (the
     * jQuery UI sortable needs a real press, a few steps of move and a
     * release; `dragTo` is too quick for it), then wait until `from` stands
     * directly above `to`.
     */
    async drag(from, to) {
        const source = this.row(from);
        const target = this.row(to);
        const sb = await source.boundingBox();
        const tb = await target.boundingBox();
        if (!sb || !tb) throw new Error(`drag: no box for "${from}" or "${to}"`);
        await this.page.mouse.move(sb.x + 40, sb.y + sb.height / 2);
        await this.page.mouse.down();
        await this.page.mouse.move(sb.x + 40, sb.y + sb.height / 2 - 5, {steps: 5});
        await this.page.mouse.move(tb.x + 40, tb.y + 3, {steps: 20});
        await this.page.mouse.move(tb.x + 40, tb.y + 2, {steps: 2});
        await this.page.mouse.up();
    }

    /**
     * "Done": waits for the order's save and the grid's redraw.
     *
     * @returns {Promise<import('@playwright/test').Response>}
     */
    async done() {
        const saved = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /save-sequence/.test(r.url()),
            {timeout: T}
        );
        await this.doneLink().click();
        const response = await saved;
        await expect(this.doneLink()).toBeHidden({timeout: T});
        await waitForJQueryIdle(this.page);
        return response;
    }

    /** "Cancel ordering": the mode ends. */
    async cancelOrdering() {
        await this.cancelOrderingLink().click();
        await expect(this.cancelOrderingLink()).toBeHidden({timeout: T});
    }
}

// ---------------------------------------------------------------------------
// The section window / the series window
// ---------------------------------------------------------------------------

class SectionWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {{formId?: string}} [options] "sectionForm" (default) or "seriesForm"
     */
    constructor(page, {formId = 'sectionForm'} = {}) {
        super(page);
        this.formId = formId;
    }

    /** The window (the dialog around the form). */
    root() {
        return this.page.getByRole('dialog').filter({has: this.page.locator(`form#${this.formId}`)});
    }

    form() {
        return this.page.locator(`form#${this.formId}`);
    }

    /** The window's heading ("Create Section", "Add Series", "Edit"). */
    heading() {
        return this.root().getByRole('heading', {level: 1});
    }

    /** Wait until the form's title box is there and jQuery is idle (the form loads by AJAX). */
    async waitLoaded() {
        await expect(this.box('title[en]')).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** A box by its form name ("title[en]", "abbrev[en]", "path", "wordCount", "identifyType[en]"). */
    box(name) {
        return this.form().locator(`[name="${name}"]`).first();
    }

    /** A tick box by its label ("Do not require abstracts", "Assign Sam Section as Section editor"). */
    checkbox(label) {
        return this.form().getByRole('checkbox', {name: label, exact: true});
    }

    /** The "Section Options" group's boxes {OJS OPS}. */
    optionBoxes() {
        return this.form().getByRole('group', {name: 'Section Options'}).getByRole('checkbox');
    }

    /** The "Editorial Assignments" boxes ("Assign {name} as {role}"). */
    assignmentBoxes() {
        return this.form().getByRole('checkbox', {name: /^Assign .+ as /});
    }

    /** The "Editorial Assignments" heading and its sentence (the list's text). */
    assignmentsList() {
        return this.form().locator('ul, .pkp_helpers_clear').filter({hasText: /^\s*Editorial Assignments/}).first();
    }

    /** "Review Form" {OJS}. */
    reviewFormSelect() {
        return this.form().locator('select[name="reviewFormId"]');
    }

    // ---- the series window {OMP} (added by the OMP author)

    /** A list by its form name ("sortOption": "Order of monographs" {OMP}). */
    select(name) {
        return this.form().locator(`select[name="${name}"]`);
    }

    /** A list's chosen entry (for `toHaveText`). */
    selectedOption(name) {
        return this.select(name).locator('option:checked');
    }

    /**
     * A group of tick boxes by the label it opens with ("Editorial
     * Assignments", "Categories" {OMP}); the window's option boxes open with
     * their first box's label instead. A group the window lacks matches
     * nothing, so `toHaveCount(0)` beside a present group's `toHaveCount(1)`
     * reads its absence.
     */
    boxGroup(label) {
        return this.form()
            .locator('ul.checkbox_and_radiobutton')
            .filter({hasText: new RegExp(`^\\s*${esc(label)}`)});
    }

    /** The note above the window's foot ("Required fields are marked with an asterisk: *" {OMP}). */
    requiredNote() {
        return this.form().locator('.formRequired');
    }

    /** The message under a box ("This field is required."). */
    fieldError(name) {
        return this.form().locator(`[name="${name}"] ~ label.error`);
    }

    /** Every message shown under a box. */
    visibleErrors() {
        return this.form().locator('label.error:visible');
    }

    /** "Save" and "Cancel" (a link) at the window's foot. */
    saveButton() {
        return this.form().getByRole('button', {name: 'Save', exact: true});
    }

    cancelLink() {
        return this.form().getByRole('link', {name: 'Cancel', exact: true});
    }

    /** The id of a formatted-text box's backing textarea ("policy[en]", "description[en]"). */
    async richTextId(name) {
        const id = await this.form().locator(`textarea[name="${name}"]`).getAttribute('id');
        if (!id) throw new Error(`no textarea ${name}`);
        await this.page.waitForFunction(
            // eslint-disable-next-line no-undef
            (i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized),
            id,
            {timeout: T}
        );
        return id;
    }

    /** A formatted-text box's editable body (inside its iframe). */
    async richTextBody(name) {
        const id = await this.richTextId(name);
        return this.page.frameLocator(`#${id}_ifr`).locator('body');
    }

    /** Type into a formatted-text box, replacing what it holds. */
    async typeRichText(name, text) {
        const body = await this.richTextBody(name);
        await body.click();
        await body.fill(text);
    }

    /** Type into a multilingual box (its French twin opens on focus; only the named box is filled). */
    async type(name, text) {
        const box = this.box(name);
        await box.click();
        await box.fill(text);
    }

    /**
     * "Save" on a window the server answers: waits for the save's answer
     * and returns it. The caller asserts the window's state and the notice.
     *
     * @returns {Promise<import('@playwright/test').Response>}
     */
    async save() {
        const answered = this.page.waitForResponse((r) => isWindowSave(r.request()), {timeout: T});
        await this.saveButton().click();
        const response = await answered;
        await waitForJQueryIdle(this.page);
        return response;
    }

    /** "Save" that closes the window: bounded by the answer and the window's going. */
    async saveAndClose() {
        const response = await this.save();
        await expect(this.form()).toBeHidden({timeout: T});
        return response;
    }

    /**
     * "Save" the browser refuses before sending: counts the window's saves
     * posted until `refusal` shows (the bound) and returns that count.
     *
     * @param {import('@playwright/test').Locator} refusal
     */
    async saveRefusedInPlace(refusal) {
        let sent = 0;
        const onRequest = (request) => {
            if (isWindowSave(request)) sent += 1;
        };
        this.page.on('request', onRequest);
        try {
            await this.saveButton().click();
            await expect(refusal).toBeVisible({timeout: T});
            await waitForJQueryIdle(this.page);
        } finally {
            this.page.off('request', onRequest);
        }
        return sent;
    }

    /** "Cancel": the window closes at once. */
    async cancel() {
        await this.cancelLink().click();
        await expect(this.form()).toBeHidden({timeout: T});
    }
}

// ---------------------------------------------------------------------------
// "Confirm" (an "Inactive" box) and "Delete" (a row's "Delete")
// ---------------------------------------------------------------------------

class ConfirmWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} name the window's heading ("Confirm", "Delete")
     */
    constructor(page, name) {
        super(page);
        this.name = name;
    }

    root() {
        return this.page.getByRole('dialog', {name: this.name, exact: true});
    }

    /** The question the window asks. */
    question() {
        return this.root().locator('.modal-content');
    }

    button(name) {
        return this.root().getByRole('button', {name, exact: true});
    }

    /** Press "OK" or "Cancel" and wait for the window to go. */
    async answer(name) {
        await this.button(name).click();
        await expect(this.root()).toBeHidden({timeout: T});
    }
}

// ---------------------------------------------------------------------------
// About › "Submissions" {OJS OPS}
// ---------------------------------------------------------------------------

class SubmissionsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{locale?: string}} [options]
     */
    constructor(page, contextPath, {locale = ''} = {}) {
        super(page);
        this.contextPath = contextPath;
        this.locale = locale;
    }

    url() {
        return contextAddress(this.contextPath, this.locale, '/about/submissions');
    }

    /** Open the page and wait for its heading. */
    async goto() {
        await this.page.goto(this.url());
        await expect(this.root().getByRole('heading', {name: 'Submissions', level: 1})).toBeVisible({timeout: T});
    }

    root() {
        return this.page.locator('.page_submissions');
    }

    /** The notice under the heading (the invitation, or "…is not accepting submissions…"). */
    notice() {
        return this.root().locator('.cmp_notification');
    }

    /** The submission checklist's block. */
    checklist() {
        return this.root().locator('.submission_checklist');
    }

    /** Every section policy block, in screen order. */
    blocks() {
        return this.root().locator('.section_policy');
    }

    /** The blocks' headings, in screen order (for `toHaveText([...])`). */
    blockHeadings() {
        return this.blocks().locator('h2');
    }

    /** The block headed `title`. */
    block(title) {
        return this.blocks().filter({has: this.page.locator('h2').filter({hasText: whole(title)})});
    }

    /** Section policy blocks that stand after the submission checklist. */
    blocksAfterChecklist() {
        return this.root().locator('.submission_checklist ~ .section_policy');
    }

    /** A block's "Make a new submission to the {section} section." line. */
    submitLine(title) {
        return this.block(title).locator('p').filter({hasText: /^\s*Make a new submission to the /});
    }

    /** Every block's submission line. */
    submitLines() {
        return this.blocks().locator('p').filter({hasText: /Make a new submission to the /});
    }

    /** The link a block's submission line carries (named by the section). */
    submitLink(title) {
        return this.submitLine(title).getByRole('link', {name: title, exact: true});
    }

    /**
     * A block's words without its heading and submission line (the policy),
     * white space collapsed.
     */
    async policyText(title) {
        const block = this.block(title);
        await expect(block).toHaveCount(1, {timeout: T});
        return flat(
            await block.evaluate((el) => {
                const copy = /** @type {HTMLElement} */ (el.cloneNode(true));
                copy.querySelectorAll('h2').forEach((h) => h.remove());
                copy.querySelectorAll('p').forEach((p) => {
                    if (/Make a new submission to the /.test(p.textContent || '')) p.remove();
                });
                return copy.textContent || '';
            })
        );
    }
}

// ---------------------------------------------------------------------------
// {OPS} "Archives", the home page's archive header, a section's page
// ---------------------------------------------------------------------------

class ArchivePage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{word?: string, locale?: string}} [options] word: the address word ("preprints")
     */
    constructor(page, contextPath, {word = 'preprints', locale = ''} = {}) {
        super(page);
        this.contextPath = contextPath;
        this.word = word;
        this.locale = locale;
    }

    url(pathname = '') {
        return contextAddress(this.contextPath, this.locale, `/${this.word}${pathname}`);
    }

    /** Open the "Archives" page by its address. */
    async goto() {
        return this.page.goto(this.url());
    }

    /** Open the home page. */
    async gotoHome() {
        return this.page.goto(contextAddress(this.contextPath, this.locale, ''));
    }

    /** The main menu's "Archives" item. */
    menuLink() {
        return this.page.locator('.pkp_navigation_primary').getByRole('link', {name: 'Archives', exact: true});
    }

    /** The page's heading ("Archives", "Archives - Page {n}"). */
    heading() {
        return this.page.locator('h1').first();
    }

    /** The archive header above the list. */
    archiveHeader() {
        return this.page.locator('.archiveHeader');
    }

    /** The archive header's search box. */
    searchBox() {
        return this.archiveHeader().locator('form[role="search"] input[name="query"]');
    }

    /** The archive header's category links. */
    categoryLinks() {
        return this.archiveHeader().locator('.archiveHeader_categories a');
    }

    /** The preprint list's items, in screen order. */
    items() {
        return this.page.locator('ul.cmp_preprint_list > li');
    }

    /** The items' titles, in screen order (for `toHaveText([...])`). */
    itemTitles() {
        return this.items().locator('.title');
    }

    /** The home page's "Latest preprints" heading. */
    latestHeading() {
        return this.page.getByRole('heading', {name: 'Latest preprints'});
    }
}

class SectionPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{word?: string, locale?: string}} [options]
     */
    constructor(page, contextPath, {word = 'preprints', locale = ''} = {}) {
        super(page);
        this.contextPath = contextPath;
        this.word = word;
        this.locale = locale;
    }

    url(path, pathname = '') {
        return contextAddress(this.contextPath, this.locale, `/${this.word}/section/${path}${pathname}`);
    }

    /** Open a section's page by its address; returns the response. */
    async goto(path) {
        return this.page.goto(this.url(path));
    }

    heading() {
        return this.page.locator('h1.page_title');
    }

    description() {
        return this.page.locator('.about_section .description');
    }

    /** "Nothing has been posted in this section yet." */
    emptyLine() {
        return this.page.locator('p.section_empty');
    }

    items() {
        return this.page.locator('ul.cmp_preprint_list > li');
    }

    itemTitles() {
        return this.items().locator('.title');
    }

    /** A bare "404 Not Found" answer for an address. */
    async expect404(path) {
        const response = await this.goto(path);
        expect(response && response.status()).toBe(404);
        await expect(this.page.locator('body')).toContainText('404 Not Found');
    }
}

module.exports = {
    SectionsTab,
    SectionWindow,
    ConfirmWindow,
    SubmissionsPage,
    ArchivePage,
    SectionPage,
    notices,
    markNotices,
    expectNotice,
    expectNoticeTopRight,
    noticesGone,
    pastCloseWindow,
    startFormSections,
    whole,
    flat,
};
