/**
 * @file playwright/pages/ContextIdentityPages.js
 *
 * OMP additions to the shared U07 page objects
 * (shared/playwright/pages/ContextIdentityPages.js, owned by the OJS suite;
 * spec docs/specs/U07-journal-identity-and-about-pages.md). Only what a
 * press marks up differently, and the team screens the press suite drives
 * for scenarios 8, 9 and 13, live here:
 * - PressAboutPages — the shared AboutPages with the site's list of presses
 *   (OMP's `templates/frontend/pages/indexSite.tpl` lists them under
 *   `.presses`, where a journal site uses `.journals`).
 * - TeamScreens — the manager's side of the masthead: a user's "Edit" page
 *   (the invitation wizard in editUser mode, its roles table with the
 *   "Press Masthead" column), the users list's "Remove User", "Disable
 *   User" and "Merge user", and the two boxes of Settings › Website ›
 *   "Appearance" › "Editorial Masthead".
 * - publishBook() — the Publication pages' "Publish" and its "Schedule For
 *   Publication" window (U49 scenario 1's press path).
 *
 * DOM facts (probe tomp0712, 2026-11-12, OMP main): the user's "Edit"
 * page heads its roles table "Role", "Start Date", "End Date", "Press
 * Masthead" and an unnamed last column while the masthead is based on
 * enrollments, and drops "Press Masthead" (and every row's cell under it)
 * while it is not; an External Reviewer row carries the fixed text "Does
 * not appear on the masthead" (reviewers not listed) in that cell, no
 * select; the masthead page with the enrollment box unticked is
 * `.page_masthead` holding the breadcrumb, the h1, the manager's
 * `a.cmp_edit_link` and the "Editorial History" text, nothing else.
 */
const {expect} = require('@playwright/test');
const {AboutPages} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {WebsiteSettings} = require('../../../../shared/playwright/pages/AppearancePages.js');
const {
    UsersListPage,
    DisableUserWindow,
    RemoveUserDialog,
    MergeUserWindow,
} = require('../../../../shared/playwright/pages/UsersManagementPages.js');

const T = 30_000;

class PressAboutPages extends AboutPages {
    /** The site index's entry title for a press, found by its path. */
    siteListEntry(contextPath) {
        return this.page.locator(`.page_index_site .presses h3 a[href$="/index.php/${contextPath}"]`);
    }
}

class TeamScreens extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page a Press Manager's page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.list = new UsersListPage(page, contextPath);
        this.website = new WebsiteSettings(page, contextPath, {thumbnailField: 'pressThumbnail'});
        /** The roles table of a user's "Edit" page. */
        this.rolesTable = page.getByRole('main').getByRole('table').first();
    }

    // --- A user's "Edit" page -------------------------------------------------

    /** Open the users list and a member's "Edit" page (by the member's email); waits for the roles table. */
    async openUserEdit(email) {
        await this.list.goto();
        await this.list.chooseAction(this.list.row(email), 'Edit');
        await this.page.waitForURL(/\/invitation\/|\/management\/settings\/user\//, {waitUntil: 'commit', timeout: T});
        await expect(this.rolesTable.getByRole('columnheader', {name: 'Role', exact: true})).toBeVisible({timeout: T});
    }

    /** The roles table's column headers' words ("Role", "Start Date", …; the source text, not the upper case CSS shows), empty ones dropped. */
    async roleColumns() {
        await expect(this.rolesTable.getByRole('columnheader').first()).toBeVisible({timeout: T});
        return (await this.rolesTable.getByRole('columnheader').allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    }

    /** A row of the roles table by its role's name (the first cell). */
    roleRow(roleName) {
        return this.rolesTable.getByRole('row').filter({has: this.page.getByRole('cell', {name: roleName, exact: true})});
    }

    /** A held role's masthead select ("Appear on the masthead" / "Does not appear on the masthead"). */
    mastheadSelect(roleName) {
        return this.roleRow(roleName).locator('select[name="masthead"]');
    }

    // --- The users list's row actions ------------------------------------------

    /** "Remove User" on a member's row, confirmed with "OK"; returns the answer's status. */
    async removeUser(email) {
        await this.list.goto();
        const dialog = new RemoveUserDialog(this.page);
        await this.list.chooseAction(this.list.row(email), 'Remove User');
        await dialog.expectOpen();
        return (await dialog.ok()).status();
    }

    /** "Disable User" on a member's row, saved with "OK" (the reason left empty); the row shows the disabled icon. */
    async disableUser(email, fullName) {
        await this.list.goto();
        const row = this.list.row(email);
        const window = new DisableUserWindow(this.page, `Disable ${fullName}`);
        await this.list.chooseAction(row, 'Disable User');
        await window.expectForm();
        await window.ok();
        await expect(this.list.disabledIcon(row)).toHaveCount(1, {timeout: T});
    }

    /**
     * "Merge user" on the row of the account that goes (`fromEmail`), then
     * "Merge into this User" on the kept account's row (found by searching
     * `searchText`) and "OK"; returns the answer's status.
     */
    async mergeUser(fromEmail, intoEmail, searchText) {
        await this.list.goto();
        const merge = new MergeUserWindow(this.page);
        await this.list.chooseAction(this.list.row(fromEmail), 'Merge user');
        await merge.expectOpen();
        await merge.grid.search({text: searchText});
        await expect(merge.grid.row(intoEmail)).toBeVisible({timeout: T});
        await merge.mergeInto(intoEmail);
        const status = (await merge.confirm()).status();
        await merge.expectClosed();
        return status;
    }

    // --- Settings › Website › "Appearance" › "Editorial Masthead" ---------------

    /** Open the "Editorial Masthead" tab and return its form (shared AppearancePages' MastheadForm). */
    async openMastheadTab() {
        await this.website.goto();
        return this.website.open('appearance-masthead');
    }
}

/**
 * Publish a book in Production from its Publication pages, as a Press
 * Manager: the workflow by its address, "Title & Abstract", "Publish", and
 * "Publish" in the "Schedule For Publication" window; waits for the publish
 * answer and the "Unpublish" button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} contextPath
 * @param {number} submissionId
 */
async function publishBook(page, contextPath, submissionId) {
    await page.goto(`/index.php/${contextPath}/dashboard/editorial?workflowSubmissionId=${submissionId}`);
    await expect(page.getByRole('link', {name: 'Publication', exact: true})).toBeVisible({timeout: T});
    const entry = await new WorkflowPage(page, contextPath).revealPublicationEntry('Title & Abstract');
    await entry.click();
    await expect(page.getByRole('heading', {name: 'Publication: Title & Abstract'})).toBeVisible({timeout: T});
    await page.getByRole('button', {name: 'Publish', exact: true}).click();
    const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
    await expect(modal).toBeVisible({timeout: T});
    const published = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T});
    await modal.getByRole('button', {name: 'Publish', exact: true}).click();
    expect((await published).status(), 'the publish answers 200').toBe(200);
    await expect(page.getByRole('button', {name: 'Unpublish', exact: true})).toBeVisible({timeout: T});
}

module.exports = {PressAboutPages, TeamScreens, publishBook};
