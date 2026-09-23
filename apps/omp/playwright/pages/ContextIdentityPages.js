/**
 * @file playwright/pages/ContextIdentityPages.js
 *
 * OMP additions to the shared U07 page objects
 * (shared/playwright/pages/ContextIdentityPages.js, owned by the OJS suite;
 * spec docs/specs/U07-journal-identity-and-about-pages.md). Only what a
 * press marks up differently lives here:
 * - PressAboutPages — the shared AboutPages with the site's list of presses
 *   (OMP's `templates/frontend/pages/indexSite.tpl` lists them under
 *   `.presses`, where a journal site uses `.journals`).
 */
const {AboutPages} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');

class PressAboutPages extends AboutPages {
    /** The site index's entry title for a press, found by its path. */
    siteListEntry(contextPath) {
        return this.page.locator(`.page_index_site .presses h3 a[href$="/index.php/${contextPath}"]`);
    }
}

module.exports = {PressAboutPages};
