/**
 * @file playwright/support/legacy.js
 *
 * Helpers for the legacy jQuery-driven surfaces (grids, AjaxModals, the
 * file-upload wizard). Promoted from the OJS app-local helper when the OPS
 * suite became its second consumer (patterns.md: "promote it when a second
 * app suite needs it"); the app-local files re-export from here.
 */

/**
 * Wait until jQuery has no in-flight AJAX requests. The Playwright counterpart
 * of Cypress's cy.waitJQuery(); call it after interacting with legacy
 * jQuery-driven UI (AjaxModal saves, grid refreshes). No-op on pages without
 * jQuery.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForJQueryIdle(page) {
    await page.waitForFunction(() => !window.jQuery || window.jQuery.active === 0);
}

module.exports = {waitForJQueryIdle};
