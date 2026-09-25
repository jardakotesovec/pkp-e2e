// @ts-check
/**
 * @file playwright/tests/U50-issues.spec.js
 *
 * Issues — OMP suite. A press does not install issues (the spec's title
 * badge is {OJS}), so the press runs the one scenario written for it,
 * S11 "No issues" {OMP OPS}: the absence test with a positive control per
 * assertion (RUNBOOK multi-app rule 3), in the press's own words: the
 * Press Manager's side menu, the visitor's header, an issue address typed
 * on the press. S1–S10 are the journal's, in its tree.
 * Spec: docs/specs/U50-issues.md
 *
 * The spec's control is taken on the seeded journal, which the OMP fleet
 * does not serve; the journal half ("Issues" under "Content", "Current"
 * opening "Vol. 1 No. 2 (2014)") is the OJS suite's. Here each absence is
 * paired with what the press offers in the same place, read the same way:
 * "Catalog" under "Content", "Catalog" in the header, the catalog's own
 * address (the absence paragraph: a press publishes through its catalog).
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1–A15: all on the journal's "Issues" page, its windows or its reader
 *   pages, which a press does not have.
 *
 * Seeding: none. The seeded press publicknowledge and the seeded Press
 * Manager are read-only; the visitor is a browser context with no session.
 *
 * The side menu is read once it has rendered its first group (a settled
 * read), as data and by role, the missing "Issues" paired with "Catalog"
 * in the "Content" group read both ways, whose page then opens. The header
 * is read with a web-first assertion on its whole top-level list, the
 * missing "Current" paired with "Catalog" in that list, whose page then
 * opens. The issue address is read from its response and its heading,
 * paired with the catalog address typed the same way (M4, M6). Waits are
 * web-first (A5). Runs in the parallel `omp` project: nothing here changes
 * the press.
 */
const {test: base, expect} = require('../support/fixtures.js');
const {PublicChrome, EditorialChrome, whole} = require('../../../../shared/playwright/pages/NavigationChromePages.js');

const PRESS = 'publicknowledge';
/** publicknowledge is bilingual, so its addresses carry the /en prefix. */
const LOCALE = 'en';
const T = 30_000;

/** A side-menu line by its label, whether its group is open or closed. */
const sideLine = (ed, label) => ed.sideNav.locator(`[role="treeitem"][aria-label="${label}"]`);

/** A visitor's page: a second browser context with no session at all (parallel lesson 8). */
const test = base.extend({
    visitor: async ({browser, baseURL}, use) => {
        const context = await browser.newContext({
            baseURL,
            storageState: {cookies: [], origins: []},
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

test.describe('Issues', () => {
    test('S11: no issues on a press', async ({asUser, visitor}) => {
        // The side menu: the Press Manager's editorial side menu has no
        // "Issues" (Purpose, the absence paragraph). Read once the menu has
        // rendered its first group, as data (every group's lines are in the
        // DOM whether open or closed) and by locator on the entries and
        // lines, hidden ones included (a role query skips a closed group).
        const page = await (await asUser('manager.maya')).newPage();
        const ed = new EditorialChrome(page);
        await page.goto(`/index.php/${PRESS}/${LOCALE}/submissions`);
        await ed.waitSideMenu();
        const side = await ed.sideMenu();
        const labels = side.map((e) => e.label);
        const lines = side.flatMap((e) => e.items.map((i) => i.label));
        expect(labels).not.toContain('Issues');
        expect(lines).not.toContain('Issues');
        await expect(ed.sideEntry('Issues')).toHaveCount(0);
        await expect(sideLine(ed, 'Issues')).toHaveCount(0);

        // Control: the same menu's "Content" group holds "Catalog", read the
        // same ways, and its page opens.
        expect(labels).toContain('Content');
        expect(side.find((e) => e.label === 'Content')?.items.map((i) => i.label)).toEqual(['Catalog']);
        await expect(ed.sideEntry('Content')).toHaveCount(1);
        await expect(sideLine(ed, 'Catalog')).toHaveCount(1);
        await ed.chooseSideEntry('Content', 'Catalog');
        await expect(page).toHaveURL(/\/manageCatalog/, {timeout: T});

        // The header: the visitor's header has no "Current" (Purpose, the
        // absence paragraph). The whole top-level list is read web-first,
        // so the read is settled.
        const chrome = new PublicChrome(visitor, PRESS, {locale: LOCALE});
        await chrome.goto();
        await expect(chrome.primaryTopLinks).toHaveText([whole('Catalog'), whole('About')]);
        await expect(chrome.topLink('primary', 'Current')).toHaveCount(0);
        await expect(chrome.header.getByRole('link', {name: 'Current', exact: true})).toHaveCount(0);

        // Control: the same list's "Catalog", read by role the same way,
        // opens the catalog.
        const catalogLink = chrome.header.getByRole('link', {name: 'Catalog', exact: true});
        await expect(catalogLink).toHaveCount(1);
        await catalogLink.click();
        await expect(chrome.heading).toHaveText(whole('Catalog'), {timeout: T});

        // An issue address: the press's address followed by "issue/current"
        // opens no issue's page but "404 Not Found" (Purpose, the absence
        // paragraph).
        const current = await visitor.goto(chrome.url('/issue/current'));
        expect(current && current.status(), 'issue/current answered').toBe(404);
        await expect(visitor.locator('h1')).toHaveText(whole('404 Not Found'), {timeout: T});
        await expect(visitor.locator('.obj_issue_toc')).toHaveCount(0);

        // Control: the press's own publishing page, its address typed the
        // same way, opens.
        const catalog = await visitor.goto(chrome.url('/catalog'));
        expect(catalog && catalog.status(), 'catalog answered').toBe(200);
        await expect(chrome.heading).toHaveText(whole('Catalog'), {timeout: T});
    });
});
