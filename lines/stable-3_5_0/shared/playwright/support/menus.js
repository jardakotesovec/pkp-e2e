/**
 * @file lib/pkp/playwright/support/menus.js
 *
 * Closing an open ui-library "More Actions" menu (`DropdownActions`)
 * without choosing an item.
 *
 * `DropdownActions` is a reka-ui `DropdownMenu` (non-modal) since
 * ui-library#1006 (pkp-lib#12647); before it, it was a headlessui 1.7
 * Menu. The menu content renders inline beside its button, only while
 * open, as `[data-reka-menu-content][role="menu"]`, and it is a reka-ui
 * dismissable layer: Escape closes the topmost layer only, so an Escape
 * pressed while the menu is open closes the menu and leaves the workflow
 * panel or side window behind it open.
 *
 * Under headlessui the focus reached the menu two animation frames after
 * the button's click and only the menu element handled Escape; an Escape
 * sent through `page.keyboard` in that window closed the enclosing reka-ui
 * dialog instead (patterns.md locator pitfall 7; U30 S4,
 * .reports/flake-s26/u30/diagnosis.md). `locator.press()` on the menu
 * stays the one way to close it: it reaches the menu whatever the
 * frame timing, and a menu that is not open fails the press instead of
 * sending a stray Escape to the page.
 */
const {expect} = require('@playwright/test');

/** The open "More Actions" menu (reka-ui menu content, `role="menu"`). */
function openMenu(page) {
    return page.locator('[data-reka-menu-content][role="menu"]');
}

/**
 * Close the open "More Actions" menu without choosing, and wait until it
 * is gone. Never `page.keyboard.press('Escape')` for this.
 *
 * @param {import('@playwright/test').Page} page
 */
async function closeMenu(page) {
    const menu = openMenu(page);
    await menu.press('Escape');
    await expect(menu).toHaveCount(0, {timeout: 30_000});
}

module.exports = {closeMenu, openMenu};
