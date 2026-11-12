/**
 * @file lib/pkp/playwright/support/menus.js
 *
 * Closing an open ui-library "More Actions" menu (`DropdownActions`, a
 * headlessui 1.7 Menu) without choosing an item.
 *
 * headlessui renders the menu at once on the button's click but hands
 * keyboard focus from the button to the menu only two animation frames
 * later (`MenuButton` onClick: `openMenu()`, then
 * `requestAnimationFrame(() => requestAnimationFrame(focus menu))`), and
 * only the menu element handles Escape (closes itself, stops the event).
 * An Escape sent through `page.keyboard` inside that window lands on the
 * button, which ignores it, and bubbles to the document: inside the
 * workflow panel or any other side window that is the reka-ui dialog's own
 * Escape, and the whole window closes (patterns.md locator pitfall 7). A
 * busy renderer (four workers, CI, a heavy dashboard behind the panel)
 * widens the window past the test's own reads of the items; U30 S4 lost
 * its workflow panel that way on CI and in most local OJS finals
 * (.reports/flake-s26/u30/diagnosis.md).
 *
 * `locator.press()` focuses the menu element before the key, so the Escape
 * reaches the menu's own handler whatever the frame timing.
 */
const {expect} = require('@playwright/test');

/** The open headlessui menu (its items container, `role="menu"`). */
function openMenu(page) {
    return page.locator('[id^="headlessui-menu-items-"][role="menu"]');
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
