// @ts-check
/**
 * @file playwright/pages/ReaderCommentsPages.js
 *
 * Reader comments & moderation — the OMP page objects (feature spec:
 * docs/specs/U14-reader-comments-and-moderation.md). A press installs the
 * moderation half only: the "Comments" tab of the Website settings (Rule
 * 2), the editorial side menu's Content › Comments entry (Rule 3c) and the
 * Comments page with its tabs, row menu, comment panel and report panel
 * (Rules 10 to 16). The monograph's catalog page carries no comments block
 * (the absence paragraph), which `CatalogBookPage` reads.
 *
 * DOM facts the locators rely on (U14 claim checks K1, K3 and K4, all three
 * apps, 2026-09-16, `.reports/U14/screen-notes.md`; the OMP rows of
 * `.reports/U14/screen-locators.md`):
 * - Settings › Website is a Vue tab page: the top tab "Content" holds ONE
 *   side tab "Comments" whose form is the one carrying the checkbox
 *   "Enable Public Comments"; its "Save" is enabled with nothing changed.
 *   Pressing "Save" POSTs `contexts/{id}` (`enablePublicComments=…`),
 *   shows "Saving" for a beat and then RELOADS the whole page (a full
 *   navigation on the same address, "#publicComments" kept) landing on
 *   Appearance › Theme; "Saved" never shows (A5; patterns.md pitfall 14),
 *   so the save waits for the reload, never for a status.
 * - The side menu `navigation "Site Navigation"` is a PrimeVue panelmenu:
 *   every group's entries are in the DOM, the closed groups' regions
 *   `display:none`; a group header is `[role="button"][aria-controls]`
 *   (aria-label the group's name) and its entries `[role="treeitem"]`
 *   (aria-label the entry's name) inside the region it controls; only the
 *   open header carries `aria-expanded` (patterns.md pitfall 2).
 * - The Comments page (`management/settings/userComments`) keeps all four
 *   tab panels' tables in the DOM: every table read is scoped to
 *   `main [role="tabpanel"]:visible`. The table shows a "Loading" row
 *   after a tab press; the rows follow. The tab is written after "#"
 *   (`#all`, `#approved`, `#needsApproval`, `#reported`). Paging is
 *   `nav.pkpPagination` inside the panel: buttons "Go to Page N" (aria
 *   labels), "Go to Previous", and "Next" (no aria-label); the line
 *   "Showing 1 to 25 of 26" sits before it and is absent with one page.
 * - A closed Vue side panel leaves a hidden shell that keeps `main`
 *   out of the accessibility tree until the next navigation (patterns.md
 *   pitfall 4), so the page's own reads here are CSS and text locators,
 *   never `getByRole` on the table or the tabs; the panels, the confirm
 *   dialogs and the row menu (a headlessui menu portaled to the root)
 *   are read by role.
 * - The comment panel is the dialog headed "View comment details by"
 *   (no aria-label on a panel opened by address; the heading names it),
 *   the report panel "View report details by", stacked over it; while
 *   the report panel is on top the comment panel is hidden from the
 *   accessibility tree, so "over the comment panel" is read as two
 *   visible dialogs. The confirm dialogs are "Delete Comment" and
 *   "Delete Report" (exact) with "Delete" / "Cancel". The delete and
 *   approval requests travel as POST with `X-Http-Method-Override`
 *   (match on method !== GET); the refetch after a closing action is a
 *   GET `api/v1/comments?…`.
 * - The notice is `.app__notifications [role=status]` at the top right,
 *   its text and its "×" in one element (substring match, never exact).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

const ENABLE_BOX = 'Enable Public Comments';
const T = 30_000;

/** The Comments page's tabs, their labels and the hash each writes. */
const TABS = {
    All: 'all',
    Approved: 'approved',
    'Hidden/Needs Approval': 'needsApproval',
    Reported: 'reported',
};

/** The two task sentences the moderators get (Side effects). */
const COMMENT_TASK = 'A comment has been submitted and is pending review by a moderator.';
const REPORT_TASK = 'A report was submitted for a comment and requires review by a moderator.';

/** The notices (Rules 13 to 15). */
const NOTICE = {
    updated: 'The comment has been updated successfully.',
    deleted: 'The comment has been deleted successfully.',
    reportDeleted: 'The report has been deleted successfully.',
};

/** The "Reports" table's empty text (Rule 15). */
const NO_REPORTS = 'No one has reported this comment yet';

/** The access-denied page's sentence (Actors; footnote m). */
const ACCESS_DENIED = 'The current role does not have access to this operation.';

/** Column headers as written (`textContent`; the theme's `text-transform` upper-cases `innerText`). */
async function headerTexts(locator) {
    return locator.evaluateAll((els) => els.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()));
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Anchored, whitespace-tolerant match of a cell's or tab's whole text. */
function exact(text) {
    return new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`);
}

exports.TABS = TABS;
exports.COMMENT_TASK = COMMENT_TASK;
exports.REPORT_TASK = REPORT_TASK;
exports.NOTICE = NOTICE;
exports.NO_REPORTS = NO_REPORTS;
exports.ACCESS_DENIED = ACCESS_DENIED;
exports.ENABLE_BOX = ENABLE_BOX;

/** The notice at the top right holding `text` (the element also holds its "×"). */
function notice(page, text) {
    return page.locator('.app__notifications').getByText(text).first();
}
exports.notice = notice;

/**
 * Settings › Website › the "Content" tab › the "Comments" side tab (Rule 2).
 */
exports.CommentsSettingsTab = class CommentsSettingsTab extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the press's path
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    url() {
        return this.contextUrl(this.contextPath, '/management/settings/website');
    }

    /** The top tab bar's "Content" tab and the Content panel's "Comments" side tab. */
    contentTab() {
        return this.page.getByRole('tab', {name: 'Content', exact: true});
    }

    commentsTab() {
        return this.page.getByRole('tab', {name: 'Comments', exact: true});
    }

    appearanceTab() {
        return this.page.getByRole('tab', {name: 'Appearance', exact: true});
    }

    /** The box "Enable Public Comments". */
    box() {
        return this.page.getByRole('checkbox', {name: ENABLE_BOX});
    }

    /** The form carrying the box. */
    form() {
        return this.page.locator('form').filter({has: this.box()});
    }

    saveButton() {
        return this.form().getByRole('button', {name: 'Save', exact: true});
    }

    /** Open the Website settings by address and its Content › Comments side tab. */
    async goto() {
        await this.page.goto(this.url());
        await this.openCommentsTab();
    }

    /** From anywhere on the Website settings page: the "Content" tab, then "Comments". */
    async openCommentsTab() {
        await expect(this.contentTab()).toBeVisible({timeout: T});
        await this.contentTab().click();
        await expect(this.commentsTab()).toBeVisible({timeout: T});
        await this.commentsTab().click();
        await expect(this.box()).toBeVisible({timeout: T});
    }

    /** The selected top tab's name, as the tab strip reports it. */
    selectedTopTab() {
        return this.page.locator('[role="tab"][aria-selected="true"]').first();
    }

    /**
     * Press "Save" and wait for what follows (Rule 2a): the contexts POST
     * answers OK, "Saving" shows, and the whole page reloads (a full
     * navigation) onto Appearance › Theme. Returns nothing; the caller
     * reopens the Content › Comments tab to read the box.
     */
    async save() {
        const saved = this.page.waitForResponse(
            (r) =>
                r.request().method() === 'POST' &&
                /\/api\/v1\/contexts\/\d+/.test(r.url()),
            {timeout: T}
        );
        const saving = this.page
            .locator('.pkpFormPage__status', {hasText: 'Saving'})
            .first()
            .waitFor({state: 'visible', timeout: 10_000})
            .then(() => true)
            .catch(() => false);
        const reloaded = this.page.waitForEvent('load', {timeout: T});
        await this.saveButton().click();
        const response = await saved;
        expect(response.ok(), `the Comments tab's save answered ${response.status()}`).toBe(true);
        const sawSaving = await saving;
        await reloaded;
        // The reloaded page lands on Appearance › Theme; the box is off screen.
        await expect(this.appearanceTab()).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await expect(this.page.getByRole('tab', {name: 'Theme', exact: true})).toHaveAttribute(
            'aria-selected',
            'true',
            {timeout: T}
        );
        await expect(this.box()).toBeHidden();
        return {sawSaving};
    }
};

/**
 * The editorial side menu (`navigation "Site Navigation"`): the "Content"
 * group and its entries (Rule 3c).
 */
exports.EditorialSideMenu = class EditorialSideMenu extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page an editorial page
     */
    constructor(page) {
        super(page);
        this.nav = page.getByRole('navigation', {name: 'Site Navigation'});
    }

    /** A group's header by its name ("Content", "Settings", …). */
    groupHeader(name) {
        return this.nav.locator(`[role="button"][aria-controls][aria-label="${name}"]`);
    }

    /**
     * The entries of a group as their names, read from the region the
     * header controls whether or not the group is open (its region is
     * `display:none` while closed). `[]` when the group is absent.
     */
    async groupEntries(name) {
        const header = this.groupHeader(name);
        if ((await header.count()) === 0) {
            return [];
        }
        return header.first().evaluate((el) => {
            const region = document.getElementById(el.getAttribute('aria-controls') || '');
            if (!region) {
                return [];
            }
            return [...region.querySelectorAll('[role="treeitem"]')].map(
                (item) => item.getAttribute('aria-label') || (item.textContent || '').replace(/\s+/g, ' ').trim()
            );
        });
    }

    /** The "Content" group's entries; `[]` when the menu has no such group. */
    contentEntries() {
        return this.groupEntries('Content');
    }

    /** Open the "Content" group (a closed header carries no aria-expanded). */
    async openContentGroup() {
        const header = this.groupHeader('Content').first();
        await expect(header).toBeVisible({timeout: T});
        if ((await header.getAttribute('aria-expanded')) !== 'true') {
            await header.click();
        }
        await expect(header).toHaveAttribute('aria-expanded', 'true', {timeout: T});
    }

    /** The Content › Comments entry's link (visible once the group is open). */
    commentsEntry() {
        return this.nav.getByRole('link', {name: 'Comments', exact: true});
    }

    /** Open the "Content" group and press "Comments"; the caller asserts the landing. */
    async pressContentComments() {
        await this.openContentGroup();
        await expect(this.commentsEntry()).toBeVisible({timeout: T});
        await this.commentsEntry().click();
    }
};

/**
 * The Comments page (Rules 10 to 16): `management/settings/userComments`.
 */
exports.CommentsPage = class CommentsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the press's path
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.main = page.locator('main');
        this.heading = this.main.locator('h1', {hasText: exact('Comments')});
    }

    /** The page's address, optionally with a query (`?commentId=N`) or a hash. */
    url(suffix = '') {
        return this.contextUrl(this.contextPath, `/management/settings/userComments${suffix}`);
    }

    /** Open by address and wait for the table to settle. */
    async goto(suffix = '') {
        await this.page.goto(this.url(suffix));
        await this.expectOpen();
    }

    /** The page is up: heading "Comments", four tabs, the visible table settled. */
    async expectOpen() {
        await expect(this.heading).toBeVisible({timeout: T});
        await expect(this.tab('All')).toBeVisible({timeout: T});
        await this.tableSettled();
    }

    // ---------------------------------------------------------------------
    // Tabs (Rule 10a)
    // ---------------------------------------------------------------------

    /** A tab by its label (CSS: a closed panel's shell hides `main` from role reads). */
    tab(name) {
        return this.main.locator('[role="tab"]').filter({hasText: exact(name)});
    }

    /** Every tab label in the strip's order. */
    async tabLabels() {
        const labels = await this.main.locator('[role="tablist"] [role="tab"]').allInnerTexts();
        return labels.map((label) => label.trim());
    }

    /** The visible tab's panel (the other three keep their tables in the DOM). */
    panel() {
        return this.main.locator('[role="tabpanel"]:visible').first();
    }

    /**
     * Press a tab and wait for its table: the page refetches the list
     * (bounded, a revisited tab may serve what it holds) and the "Loading"
     * row gives way to the rows or "No Items".
     */
    async openTab(name) {
        const fetched = this.page
            .waitForResponse((r) => r.request().method() === 'GET' && /\/api\/v1\/comments\?/.test(r.url()), {
                timeout: 5_000,
            })
            .catch(() => null);
        await this.tab(name).click();
        await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await fetched;
        await this.tableSettled();
    }

    async expectSelectedTab(name) {
        await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true', {timeout: T});
    }

    /** The tab's hash is in the address (`#all`, `#approved`, `#needsApproval`, `#reported`). */
    async expectHash(name) {
        await expect(this.page).toHaveURL(new RegExp(`#${TABS[name]}$`), {timeout: T});
    }

    // ---------------------------------------------------------------------
    // The table (Fields, Rule 10)
    // ---------------------------------------------------------------------

    /** Wait until the visible table shows rows or "No Items", never "Loading". */
    async tableSettled() {
        const body = this.panel().locator('table tbody');
        await expect(body.locator('tr').first()).toBeVisible({timeout: T});
        await expect(body).not.toHaveText(/^\s*Loading\s*$/, {timeout: T});
    }

    /** The visible table's column headers, trimmed, in order (textContent: the theme upper-cases them). */
    async columns() {
        return headerTexts(this.panel().locator('table thead th'));
    }

    /** Every data row of the visible table (the "No Items" row included when empty). */
    rows() {
        return this.panel().locator('table tbody tr');
    }

    /** The row(s) whose "Comment" cell reads `text` (the full comment text). */
    row(text) {
        return this.rows().filter({has: this.page.locator('td', {hasText: exact(text)})});
    }

    /** A row's cells as trimmed texts: [submission, comment, user, status, actions]. */
    async cells(row) {
        const texts = await row.locator('td').allInnerTexts();
        return texts.map((text) => text.replace(/\s+/g, ' ').trim());
    }

    /** The "Status" cell of a row (the fourth column). */
    status(row) {
        return row.locator('td').nth(3);
    }

    /** The "No Items" row of the visible table. */
    noItems() {
        return this.rows().filter({hasText: exact('No Items')});
    }

    /** The visible tab reads "No Items" alone. */
    async expectNoItems() {
        await expect(this.noItems()).toHaveCount(1, {timeout: T});
        await expect(this.rows()).toHaveCount(1);
    }

    /** The paging nav under the visible table. */
    pagination() {
        return this.panel().locator('nav.pkpPagination');
    }

    /** The "Go to Page N" button of the paging nav. */
    pageButton(n) {
        return this.pagination().locator(`button[aria-label="Go to Page ${n}"]`);
    }

    /** The "Showing X to Y of Z" line above the paging nav. */
    showingLine() {
        return this.panel().getByText(/^\s*Showing\s+\d+\s+to\s+\d+\s+of\s+\d+/);
    }

    /** Press a page link and wait for that page's fetch and the table. */
    async gotoPage(n) {
        const fetched = this.page.waitForResponse(
            (r) => r.request().method() === 'GET' && new RegExp(`/api/v1/comments\\?.*page=${n}(&|$)`).test(r.url()),
            {timeout: T}
        );
        await this.pageButton(n).click();
        await fetched;
        await this.tableSettled();
    }

    // ---------------------------------------------------------------------
    // The row menu (Rule 11)
    // ---------------------------------------------------------------------

    /** A row's "…" ("More Actions") button: the row's only button. */
    rowMenuButton(row) {
        return row.locator('button');
    }

    /** Open a row's menu; the items portal to the root. */
    async openRowMenu(row) {
        await this.rowMenuButton(row).click();
        await expect(this.page.getByRole('menuitem').first()).toBeVisible({timeout: T});
    }

    /** The open menu's items, trimmed. */
    async menuItems() {
        const items = await this.page.getByRole('menuitem').allInnerTexts();
        return items.map((item) => item.trim());
    }

    menuItem(name) {
        return this.page.getByRole('menuitem', {name, exact: true});
    }

    /** "…" › "View Comment" on a row: the comment panel opens. */
    async viewComment(row) {
        await this.openRowMenu(row);
        await this.menuItem('View Comment').click();
        await expect(this.commentPanel()).toBeVisible({timeout: T});
    }

    /** "…" › "Delete Comment" on a row: the confirm dialog opens. */
    async deleteCommentFromRow(row) {
        await this.openRowMenu(row);
        await this.menuItem('Delete Comment').click();
        await expect(this.confirmDialog('Delete Comment')).toBeVisible({timeout: T});
    }

    // ---------------------------------------------------------------------
    // The comment panel (Rules 12 to 14)
    // ---------------------------------------------------------------------

    /** The panel "View comment details by {writer}" (its heading names it). */
    commentPanel() {
        return this.page.getByRole('dialog', {name: /^View comment details by/});
    }

    /** The panel's heading and the writer's name under it. */
    panelHeading() {
        return this.commentPanel().getByRole('heading', {name: 'View comment details by', level: 1});
    }

    /** The submission line above the title (the table's "Submission" cell text). */
    panelSubmissionLine() {
        return this.commentPanel().locator('h1').locator('xpath=preceding-sibling::*').first();
    }

    /** The "Reports" table inside the panel. */
    reportsTable() {
        return this.commentPanel().getByRole('table', {name: 'Reports'});
    }

    reportRows() {
        return this.reportsTable().locator('tbody tr');
    }

    /** The "Reports" table's column headers as written. */
    async reportColumns() {
        return headerTexts(this.reportsTable().locator('thead th'));
    }

    /** The report row whose "Reason" cell reads `note`. */
    reportRow(note) {
        return this.reportRows().filter({has: this.page.locator('td', {hasText: exact(note)})});
    }

    /** The "Reports" table's empty text. */
    noReports() {
        return this.commentPanel().getByText(NO_REPORTS);
    }

    /** The note on the right: "Approving this comment will…" or "This comment was approved on…". */
    approvalNote() {
        return this.commentPanel().getByText(/Approving this comment will make it visible|This comment was approved on/);
    }

    approveButton() {
        return this.commentPanel().getByRole('button', {name: 'Approve Comment', exact: true});
    }

    hideButton() {
        return this.commentPanel().getByRole('button', {name: 'Hide Comment', exact: true});
    }

    deleteButton() {
        return this.commentPanel().getByRole('button', {name: 'Delete Comment', exact: true});
    }

    closeButton() {
        return this.commentPanel().getByRole('button', {name: 'Close', exact: true});
    }

    /** The ORCID iD link inside the panel's preview. */
    orcidLink() {
        return this.commentPanel().locator('a[href^="https://orcid.org/"]');
    }

    /** The icon before the ORCID link: the solid (verified) one carries the filled green disc. */
    orcidSolidIcon() {
        return this.orcidLink().locator('xpath=preceding-sibling::span[1]').locator('svg path[fill="#A6CE39"]');
    }

    /**
     * Press "Approve Comment" or "Hide Comment" (Rule 13): the approval
     * request answers OK, the panel closes and the table refetches. The
     * caller reads the notice and the rows.
     */
    async setApproval(button) {
        const saved = this.page.waitForResponse(
            (r) => r.request().method() !== 'GET' && /\/api\/v1\/comments\/\d+\/setApproval/.test(r.url()),
            {timeout: T}
        );
        const refetched = this.page.waitForResponse(
            (r) => r.request().method() === 'GET' && /\/api\/v1\/comments\?/.test(r.url()),
            {timeout: T}
        );
        await (button === 'Approve Comment' ? this.approveButton() : this.hideButton()).click();
        const response = await saved;
        expect(response.ok(), `${button} answered ${response.status()}`).toBe(true);
        await expect(this.commentPanel()).toBeHidden({timeout: T});
        await refetched;
        await this.tableSettled();
    }

    /** Press the panel's "Close": the panel goes and the table refetches (Rule 12). */
    async closeCommentPanel() {
        const refetched = this.page
            .waitForResponse((r) => r.request().method() === 'GET' && /\/api\/v1\/comments\?/.test(r.url()), {
                timeout: 10_000,
            })
            .catch(() => null);
        await this.closeButton().click();
        await expect(this.commentPanel()).toBeHidden({timeout: T});
        await refetched;
        await this.tableSettled();
    }

    // ---------------------------------------------------------------------
    // Confirm dialogs and deletions (Rules 14, 15)
    // ---------------------------------------------------------------------

    /** "Delete Comment" / "Delete Report" (exact) with "Delete" and "Cancel". */
    confirmDialog(name) {
        return this.page.getByRole('dialog', {name, exact: true});
    }

    /**
     * Press "Delete" on the open confirm dialog for a comment: the delete
     * request answers OK, the dialog (and the panel, if open) close and the
     * table refetches.
     */
    async confirmDeleteComment() {
        const deleted = this.page.waitForResponse(
            (r) => r.request().method() !== 'GET' && /\/api\/v1\/comments\/\d+$/.test(r.url()),
            {timeout: T}
        );
        const refetched = this.page.waitForResponse(
            (r) => r.request().method() === 'GET' && /\/api\/v1\/comments\?/.test(r.url()),
            {timeout: T}
        );
        await this.confirmDialog('Delete Comment').getByRole('button', {name: 'Delete', exact: true}).click();
        const response = await deleted;
        expect(response.ok(), `Delete Comment answered ${response.status()}`).toBe(true);
        await expect(this.confirmDialog('Delete Comment')).toBeHidden({timeout: T});
        await expect(this.commentPanel()).toBeHidden({timeout: T});
        await refetched;
        await this.tableSettled();
    }

    /**
     * Press "Delete" on the open "Delete Report" dialog: the request
     * answers OK, the dialog (and the report panel, if open) close and the
     * "Reports" table refetches.
     */
    async confirmDeleteReport() {
        const deleted = this.page.waitForResponse(
            (r) => r.request().method() !== 'GET' && /\/api\/v1\/comments\/\d+\/reports\/\d+$/.test(r.url()),
            {timeout: T}
        );
        const refetched = this.page.waitForResponse(
            (r) => r.request().method() === 'GET' && /\/api\/v1\/comments\/\d+\/reports\?/.test(r.url()),
            {timeout: T}
        );
        await this.confirmDialog('Delete Report').getByRole('button', {name: 'Delete', exact: true}).click();
        const response = await deleted;
        expect(response.ok(), `Delete Report answered ${response.status()}`).toBe(true);
        await expect(this.confirmDialog('Delete Report')).toBeHidden({timeout: T});
        await expect(this.reportPanel()).toBeHidden({timeout: T});
        await refetched;
    }

    // ---------------------------------------------------------------------
    // The report panel (Rule 15)
    // ---------------------------------------------------------------------

    /** The panel "View report details by {reporter}", over the comment panel. */
    reportPanel() {
        return this.page.getByRole('dialog', {name: /^View report details by/});
    }

    /** Every visible dialog (two while the report panel is over the comment panel). */
    visibleDialogs() {
        return this.page.locator('[role="dialog"]:visible');
    }

    deleteReportButton() {
        return this.reportPanel().getByRole('button', {name: 'Delete Report', exact: true});
    }

    /** A report row's "…" menu button (the row's only button). */
    reportMenuButton(row) {
        return row.locator('button');
    }

    async openReportMenu(row) {
        await this.reportMenuButton(row).click();
        await expect(this.page.getByRole('menuitem').first()).toBeVisible({timeout: T});
    }

    /** "…" › "View Report" on a report row: the report panel opens. */
    async viewReport(row) {
        await this.openReportMenu(row);
        await this.menuItem('View Report').click();
        await expect(this.reportPanel()).toBeVisible({timeout: T});
    }

    /** "…" › "Delete Report" on a report row: the confirm dialog opens. */
    async deleteReportFromRow(row) {
        await this.openReportMenu(row);
        await this.menuItem('Delete Report').click();
        await expect(this.confirmDialog('Delete Report')).toBeVisible({timeout: T});
    }

    /** Press the report panel's "Close": the panel goes; the comment panel stays. */
    async closeReportPanel() {
        await this.reportPanel().getByRole('button', {name: 'Close', exact: true}).click();
        await expect(this.reportPanel()).toBeHidden({timeout: T});
    }

    // ---------------------------------------------------------------------
    // The "Error" dialog (Rule 12)
    // ---------------------------------------------------------------------

    errorDialog() {
        return this.page.getByRole('dialog', {name: 'Error', exact: true});
    }
};

/**
 * The monograph's catalog page (`catalog/book/{id}`): what a press's
 * landing page does NOT carry (the absence paragraph), read beside the
 * page's own content as the control.
 */
exports.CatalogBookPage = class CatalogBookPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the press's path (a scratch press is single-locale: bare address)
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    url(submissionId) {
        return this.contextUrl(this.contextPath, `/catalog/book/${submissionId}`);
    }

    async goto(submissionId, title) {
        await this.page.goto(this.url(submissionId));
        await expect(this.page.getByRole('heading', {name: title, level: 1})).toBeVisible({timeout: T});
    }

    /** The main block's heading (OJS: "Comments on this publication"). */
    mainBlockHeading() {
        return this.page.getByText('Comments on this publication');
    }

    /** The main block's region (OJS: `#public-comments`). */
    mainBlock() {
        return this.page.locator('#public-comments');
    }

    /** The sidebar block's heading (OJS: a heading reading "Comments"). */
    sidebarBlockHeading() {
        return this.page.locator('h2, h3, h4').filter({hasText: exact('Comments')});
    }

    /** "All Comments (n)" (OJS: the sidebar link). */
    allCommentsLink() {
        return this.page.getByText(/All Comments \(\d+\)/);
    }

    /** "Log in to comment" (OJS: the button in both blocks, signed out). */
    loginToComment() {
        return this.page.getByText('Log in to comment');
    }

    /** The comment box (OJS: a textbox with the placeholder as its name). */
    commentBox() {
        return this.page.getByRole('textbox', {
            name: 'What do you think about this publication? Type your comments here.',
        });
    }

    submitButton() {
        return this.page.getByRole('button', {name: 'Submit', exact: true});
    }

    /** A comment's body (OJS: `[class*="messageBody"]` inside the block). */
    commentBodies() {
        return this.page.locator('[class*="messageBody"]');
    }

    /**
     * The page's whole text, whitespace collapsed (the "exactly as before"
     * read). The frontend has no `main` landmark and the skip link's target
     * `#pkp_content_main` is an empty anchor, so the body is read.
     */
    async mainText() {
        const text = await this.page.locator('body').innerText();
        return text.replace(/\s+/g, ' ').trim();
    }

    /** The signed-in name in the reader-facing header (the user menu's toggle). */
    signedInName(username) {
        return this.page.locator('#navigationUserWrapper').getByRole('link', {name: new RegExp(`^\\s*${escapeRegExp(username)}`)});
    }

    /** The header's "Login" link (signed out). */
    loginLink() {
        return this.page.locator('#navigationUserWrapper').getByRole('link', {name: 'Login', exact: true});
    }
};
