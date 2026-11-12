/**
 * @file playwright/pages/ContextIdentityPages.js
 *
 * OPS-only additions to the shared U07 page objects
 * (shared/playwright/pages/ContextIdentityPages.js) for "Journal identity &
 * about pages" (docs/specs/U07-journal-identity-and-about-pages.md) on a
 * preprint server:
 * - ServerAboutPages — the shared AboutPages with the site's list of
 *   servers (`.page_index_site .servers`, where a journal site lists
 *   `.journals`).
 * - ServerWebsiteSettings — the shared SettingsPages plus Settings ›
 *   Website's "Setup" side tabs and the "Appearance" › "Setup" side tab's
 *   "Sidebar" list, which scenario 12 reads (Rule 19c).
 * - rolesTableHeaders(), fillNewRoleRowWithoutMasthead() — the roles table
 *   of "Invite to a role", the users list's "Edit" page and the invitee's
 *   review step, read and filled while the masthead is not based on
 *   enrollments (scenario 13; Settings bullet 3): the table has no masthead
 *   column, and a new role row carries one list (the role), not two.
 *
 * Markup read on the OPS fleet (templates/frontend/pages/indexSite.tpl;
 * the U07 claim check's K1/K3 records), 2026-09-23; the roles tables with
 * the masthead off (.reports/U07/screen-notes.md, tops0712), 2026-11-12.
 */
const {expect} = require('@playwright/test');
const {AboutPages, SettingsPages} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');

const T = 30_000;

exports.ServerAboutPages = class ServerAboutPages extends AboutPages {
    /** The site index's entry title for a server, found by its path. */
    siteListEntry(contextPath) {
        return this.page.locator(`.page_index_site .servers h3 a[href$="/index.php/${contextPath}"]`);
    }
};

exports.ServerWebsiteSettings = class ServerWebsiteSettings extends SettingsPages {
    /** The side tabs of Settings › Website › "Setup". */
    setupSideTabs() {
        return this.mainRegion.locator('#setup').getByRole('tab');
    }

    /** Open Settings › Website on its "Setup" tab and wait for its side tabs. */
    async openSetup() {
        await this.goto('website', '#setup');
        await expect(this.tab('Setup')).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await expect(this.setupSideTabs().first()).toBeVisible({timeout: T});
    }

    /** The "Sidebar" list's boxes on "Appearance" › "Setup" (one per offered block). */
    sidebarChoices() {
        return this.page.locator('#appearance input[name="sidebar"]');
    }

    /**
     * Open Settings › Website › "Appearance" › "Setup" and wait for its
     * "Sidebar" list. Returns the list's choices as `{value, label}`
     * (the label without the row's position buttons).
     */
    async openAppearanceSetup() {
        await this.goto('website', '#appearance');
        const appearance = this.mainRegion.locator('#appearance');
        await expect(appearance).toBeVisible({timeout: T});
        const side = appearance.getByRole('tab', {name: 'Setup', exact: true});
        if ((await side.getAttribute('aria-selected')) !== 'true') {
            await side.click();
        }
        await expect(side).toHaveAttribute('aria-selected', 'true');
        await expect(this.sidebarChoices().first()).toBeAttached({timeout: T});
    }

    /** The "Sidebar" list's choices as `{value, label}`, read once the list is on screen. */
    async sidebarChoiceList() {
        return this.sidebarChoices().evaluateAll((boxes) =>
            boxes.map((box) => ({
                value: box.value,
                label: ((box.closest('label') || box.parentElement).innerText || '').split('\n')[0].trim(),
            }))
        );
    }
};

/**
 * The column headers of the roles table on the open invitation step or
 * users-list "Edit" page ("Role", "Start Date", "End Date", and "Server
 * Masthead" while the masthead is based on enrollments), as the source
 * text (the screen upper-cases them by CSS), the empty action column left
 * out. Waits for the table's first header before reading.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
exports.rolesTableHeaders = async function rolesTableHeaders(page) {
    // The column headers only: the invitee's review step heads each row
    // with a `th` of its own (the role's name).
    const table = page.locator('main table').filter({has: page.locator('thead th')}).first();
    await expect(table.locator('thead th').first()).toBeVisible({timeout: T});
    return table.locator('thead th').evaluateAll((ths) =>
        ths.map((th) => (th.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
    );
};

/**
 * Fill the i-th new role row (0-based) of the invitation wizard while the
 * masthead is not based on enrollments: the row offers the role list alone
 * (no masthead list), asserted before filling.
 *
 * @param {{newRoleRows: import('@playwright/test').Locator}} wizard the OPS SendInvitationWizard
 * @param {number} i
 * @param {{role: string, dateStart: string}} options
 */
exports.fillNewRoleRowWithoutMasthead = async function fillNewRoleRowWithoutMasthead(wizard, i, {role, dateStart}) {
    const row = wizard.newRoleRows.nth(i);
    await expect(row.getByRole('combobox')).toHaveCount(1, {timeout: T});
    await row.getByRole('combobox').selectOption({label: role});
    await row.getByRole('textbox').fill(dateStart);
};
