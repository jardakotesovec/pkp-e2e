// @ts-check
/**
 * @file playwright/tests/U50-issues.spec.js
 *
 * Issues — OPS suite. A preprint server does not install issues (the
 * spec's title badge is {OJS}), so the server runs the one scenario written
 * for it, S11 "No issues" {OMP OPS}: the absence test with a positive
 * control per assertion (RUNBOOK multi-app rule 3), in the server's own
 * words: the Preprint Server Manager's side menu, the visitor's header, an
 * issue address typed on the server. S1–S10 are the journal's, in its tree.
 * Spec: docs/specs/U50-issues.md
 *
 * The spec's control is taken on the seeded journal, which the OPS fleet
 * does not serve; the journal half ("Issues" under "Content", "Current"
 * opening "Vol. 1 No. 2 (2014)") is the OJS suite's. Here each absence is
 * paired with what the server offers in the same place, read the same way:
 * the side menu has no "Content" group at all, so the control is the
 * "Published" line of "Editor Dashboard" (the posted preprints); "Archives"
 * in the header; the "Archives" address (the absence paragraph: a preprint
 * server posts each preprint on its own, its "Archives" listing the
 * preprints themselves).
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1–A15: all on the journal's "Issues" page, its windows or its reader
 *   pages, which a preprint server does not have.
 *
 * Seeding: none. The seeded server publicknowledge and the seeded Preprint
 * Server Manager are read-only; the visitor is a browser context with no
 * session.
 *
 * The side menu is read once it has rendered its first group (a settled
 * read), as data and by locator, the missing "Issues" paired with
 * "Published" in the "Editor Dashboard" group read the same ways, whose
 * page then opens. The header is read with a web-first assertion on its
 * whole top-level list, the missing "Current" paired with "Archives" in
 * that list, whose page then opens. The issue address is read from its
 * response and its heading, paired with the "Archives" address typed the
 * same way (M4, M6). Waits are web-first (A5). Runs in the parallel `ops`
 * project: nothing here changes the server.
 */
const {test: base, expect} = require('../support/fixtures.js');
const {PublicChrome, EditorialChrome, whole} = require('../../../../shared/playwright/pages/NavigationChromePages.js');

const SERVER = 'publicknowledge';
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
    test('S11: no issues on a preprint server', async ({asUser, visitor}) => {
        // The side menu: the Preprint Server Manager's editorial side menu
        // has no "Issues" (Purpose, the absence paragraph). Read once the
        // menu has rendered its first group, as data (every group's lines
        // are in the DOM whether open or closed) and by locator on the
        // entries and lines, hidden ones included (a role query skips a
        // closed group).
        const page = await (await asUser('manager.maya')).newPage();
        const ed = new EditorialChrome(page);
        await page.goto(`/index.php/${SERVER}/${LOCALE}/submissions`);
        await ed.waitSideMenu();
        const side = await ed.sideMenu();
        const labels = side.map((e) => e.label);
        const lines = side.flatMap((e) => e.items.map((i) => i.label));
        expect(labels).not.toContain('Issues');
        expect(lines).not.toContain('Issues');
        await expect(ed.sideEntry('Issues')).toHaveCount(0);
        await expect(sideLine(ed, 'Issues')).toHaveCount(0);

        // Control: the same menu's "Editor Dashboard" group holds
        // "Published", where a preprint server's posted preprints are
        // listed, read the same ways, and its page opens.
        expect(labels).toContain('Editor Dashboard');
        expect(side.find((e) => e.label === 'Editor Dashboard')?.items.map((i) => i.label)).toContain('Published');
        await expect(ed.sideEntry('Editor Dashboard')).toHaveCount(1);
        await expect(sideLine(ed, 'Published')).toHaveCount(1);
        await ed.chooseSideEntry('Editor Dashboard', 'Published');
        await expect(page).toHaveURL(/currentViewId=published/, {timeout: T});
        await expect(page.getByRole('heading', {level: 1})).toHaveText(/^Published \(\d+\)/, {timeout: T});

        // The header: the visitor's header has no "Current" (Purpose, the
        // absence paragraph). The whole top-level list is read web-first,
        // so the read is settled.
        const chrome = new PublicChrome(visitor, SERVER, {locale: LOCALE});
        await chrome.goto();
        await expect(chrome.primaryTopLinks).toHaveText([whole('Archives'), whole('About')]);
        await expect(chrome.topLink('primary', 'Current')).toHaveCount(0);
        await expect(chrome.header.getByRole('link', {name: 'Current', exact: true})).toHaveCount(0);

        // Control: the same list's "Archives", read by role the same way,
        // opens the server's archive of preprints.
        const archivesLink = chrome.header.getByRole('link', {name: 'Archives', exact: true});
        await expect(archivesLink).toHaveCount(1);
        await archivesLink.click();
        await expect(chrome.heading).toHaveText(whole('Archives'), {timeout: T});

        // An issue address: the server's address followed by
        // "issue/current" opens no issue's page but "404 Not Found"
        // (Purpose, the absence paragraph).
        const current = await visitor.goto(chrome.url('/issue/current'));
        expect(current && current.status(), 'issue/current answered').toBe(404);
        await expect(visitor.locator('h1')).toHaveText(whole('404 Not Found'), {timeout: T});
        await expect(visitor.locator('.obj_issue_toc')).toHaveCount(0);

        // Control: the server's own "Archives" page, its address typed the
        // same way, opens.
        const archives = await visitor.goto(chrome.url('/preprints'));
        expect(archives && archives.status(), 'preprints answered').toBe(200);
        await expect(chrome.heading).toHaveText(whole('Archives'), {timeout: T});
    });
});
