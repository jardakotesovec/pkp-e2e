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
 *
 * Markup read on the OPS fleet (templates/frontend/pages/indexSite.tpl;
 * the U07 claim check's K1/K3 records), 2026-09-23.
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
