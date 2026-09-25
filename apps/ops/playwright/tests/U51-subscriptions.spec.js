// @ts-check
/**
 * @file playwright/tests/U51-subscriptions.spec.js
 *
 * Subscriptions & open access control — OPS suite. A preprint server does
 * not install subscriptions (the spec's title badge is {OJS}), so the
 * server runs the one scenario written for it, S16 "No subscriptions on a
 * press or a preprint server" {OMP OPS}: the absence test with a positive
 * control per assertion (RUNBOOK multi-app rule 3), in the server's own
 * words: the Preprint Server Manager's Settings › Distribution › "Access"
 * tab and Settings › Users & Roles › "Roles", and the two reader addresses
 * typed by a visitor. S1–S15 are the journal's, in its tree; S16's first
 * bullet (the press's Distribution without "Access") is the OMP suite's.
 * Spec: docs/specs/U51-subscriptions.md
 *
 * The spec's control is taken on the seeded journal, which the OPS fleet
 * does not serve; the journal half ("Access" with "Publishing Mode", the
 * "Subscription Manager" role, the two pages) is the OJS suite's. Here each
 * absence is paired with what the server offers in the same place, read the
 * same way: the "Access" tab's own "Posting Mode" and "Enable OAI" groups
 * (no "Publishing Mode", no subscription choice), the Roles grid's
 * "Preprint Server manager" and "Reader" rows, and an address of the same
 * page family typed the same way ("about", "user/register").
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - OPS1: a "Posting Mode" choice saved on the "Access" tab is not kept
 *   (🐞); the suite neither saves there (the seeded server is read-only,
 *   A1) nor reads which choice is marked.
 * - A1: the mode arriving with no choice selected (❓), the server's
 *   "Posting Mode" included.
 * - A4–A27: all on a journal's subscription screens, which a preprint
 *   server does not have.
 *
 * Seeding: none. The seeded server publicknowledge and the seeded Preprint
 * Server Manager are read-only; the visitor is a browser context with no
 * session.
 *
 * The Distribution tab row is read web-first as a whole; the "Access"
 * panel's groups, radios and other fields are read by role once its two
 * groups have rendered, each missing field paired with a present one read
 * the same way. The Roles grid is read once its rows have rendered and its
 * paging line says every role is on the page, the missing "Subscription
 * Manager" paired with rows read the same way. Each address is read from
 * its response and its heading, paired with an address typed the same way
 * (M4, M6). Waits are web-first (A5). Runs in the parallel `ops` project:
 * nothing here changes the server.
 */
const {test: base, expect} = require('../support/fixtures.js');
const {SettingsPages} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');
const {whole} = require('../../../../shared/playwright/pages/NavigationChromePages.js');
const {waitForJQueryIdle} = require('../../../../shared/playwright/support/legacy.js');

const SERVER = 'publicknowledge';
/** publicknowledge is bilingual, so its addresses carry the /en prefix. */
const LOCALE = 'en';
const T = 30_000;

const OPEN = 'The server will provide open access to its contents.';
const OFFLINE = "OPS will not be used to post the server's contents online.";

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

test.describe('Subscriptions & open access control', () => {
    test('S16: no subscriptions on a preprint server', async ({asUser, visitor}) => {
        const page = await (await asUser('manager.maya')).newPage();
        const settings = new SettingsPages(page, SERVER, {locale: LOCALE});

        // The server's "Access" tab: Settings › Distribution › "Access"
        // holds "Posting Mode" with its two choices and "Enable OAI", and
        // nothing more (Purpose, the absence paragraph). The whole tab row
        // is read web-first first, so the read is settled.
        await settings.goto('distribution');
        await expect(settings.topTabs).toHaveText([
            whole('License'),
            whole('DOIs'),
            whole('Search Indexing'),
            whole('Access'),
            whole('Statistics'),
        ]);
        await settings.tab('Access').click();
        await expect(settings.tab('Access')).toHaveAttribute('aria-selected', 'true');
        const panel = settings.mainRegion.getByRole('tabpanel', {name: 'Access', exact: true});
        const groups = panel.getByRole('group');
        await expect(panel.getByRole('group', {name: 'Enable OAI', exact: true})).toBeVisible({timeout: T});

        // The panel's groups, read as a whole: "Posting Mode" and "Enable
        // OAI", no "Publishing Mode" (the journal's legend) beside them.
        await expect(groups).toHaveCount(2);
        const posting = panel.getByRole('group', {name: 'Posting Mode', exact: true});
        await expect(posting).toHaveCount(1);
        await expect(panel.getByRole('group', {name: 'Publishing Mode', exact: true})).toHaveCount(0);
        await expect(panel.getByText('Publishing Mode', {exact: true})).toHaveCount(0);

        // "Posting Mode" holds exactly the two choices, none of them the
        // journal's "…require subscriptions…" (the control: the two
        // choices, read by role the same way).
        await expect(posting.getByRole('radio')).toHaveCount(2);
        await expect(posting.getByRole('radio', {name: OPEN, exact: true})).toHaveCount(1);
        await expect(posting.getByRole('radio', {name: OFFLINE, exact: true})).toHaveCount(1);
        await expect(panel.getByRole('radio', {name: /subscription/i})).toHaveCount(0);

        // "Enable OAI" holds its two choices; the panel has no other radio,
        // and no list, box or text field ("Delayed Open Access" and the
        // like), its only button "Save".
        const oai = panel.getByRole('group', {name: 'Enable OAI', exact: true});
        await expect(oai.getByRole('radio')).toHaveCount(2);
        await expect(oai.getByRole('radio', {name: 'Enable', exact: true})).toHaveCount(1);
        await expect(oai.getByRole('radio', {name: 'Disable', exact: true})).toHaveCount(1);
        await expect(panel.getByRole('radio')).toHaveCount(4);
        await expect(panel.getByRole('combobox')).toHaveCount(0);
        await expect(panel.getByRole('checkbox')).toHaveCount(0);
        await expect(panel.getByRole('textbox')).toHaveCount(0);
        await expect(panel.getByText('Delayed Open Access')).toHaveCount(0);
        await expect(panel.getByRole('button')).toHaveText([whole('Save')]);

        // No Subscription Manager: Settings › Users & Roles › "Roles" lists
        // no "Subscription Manager" (Purpose, the absence paragraph). Read
        // once the grid's rows have rendered and its paging line says the
        // whole list is on this page.
        await settings.goto('usersRoles');
        await settings.tab('Roles').click();
        const grid = page.locator('[id^="component-grid-settings-roles-usergroupgrid"]');
        const rows = grid.locator('tr.gridRow');
        await expect(rows.first()).toBeVisible({timeout: T});
        await waitForJQueryIdle(page);
        const paging = grid.getByText(/^\s*1 - (\d+) of \1 items\s*$/);
        await expect(paging).toHaveCount(1);
        const total = Number((await paging.innerText()).match(/of (\d+) items/)?.[1]);
        await expect(rows).toHaveCount(total);
        await expect(rows.filter({hasText: 'Subscription Manager'})).toHaveCount(0);
        await expect(grid.getByText('Subscription Manager')).toHaveCount(0);

        // Control: the same grid lists the server's own roles, read the same
        // way: the Preprint Server Manager's and the reader's.
        await expect(rows.filter({hasText: 'Preprint Server manager'})).not.toHaveCount(0);
        await expect(rows.filter({has: page.getByText('Reader', {exact: true})})).not.toHaveCount(0);
        await expect(grid.getByText('Preprint Server manager', {exact: true})).toHaveCount(1);

        // No "Subscriptions" page: the server's address followed by
        // "about/subscriptions" opens no "Subscriptions" page but "404 Not
        // Found" (Purpose, the absence paragraph).
        const url = (path) => `/index.php/${SERVER}/${LOCALE}/${path}`;
        const heading = visitor.locator('.pkp_structure_main h1').first();
        /** The 404 page is the bare error page, outside the server's chrome. */
        const errorHeading = visitor.locator('h1');
        const aboutSubs = await visitor.goto(url('about/subscriptions'));
        expect(aboutSubs && aboutSubs.status(), 'about/subscriptions answered').toBe(404);
        await expect(errorHeading).toHaveText(whole('404 Not Found'), {timeout: T});
        await expect(visitor.getByRole('heading', {name: 'Subscriptions'})).toHaveCount(0);

        // Control: the same page family's own address, typed the same way,
        // opens the About page.
        const about = await visitor.goto(url('about'));
        expect(about && about.status(), 'about answered').toBe(200);
        await expect(heading).toHaveText(whole('About the Server'), {timeout: T});

        // No "My Subscriptions": "user/subscriptions" opens no "My
        // Subscriptions" page but "404 Not Found" either.
        const userSubs = await visitor.goto(url('user/subscriptions'));
        expect(userSubs && userSubs.status(), 'user/subscriptions answered').toBe(404);
        await expect(errorHeading).toHaveText(whole('404 Not Found'), {timeout: T});
        await expect(visitor.getByRole('heading', {name: 'Subscriptions'})).toHaveCount(0);

        // Control: the same page family's "user/register", typed the same
        // way, opens the Register page.
        const register = await visitor.goto(url('user/register'));
        expect(register && register.status(), 'user/register answered').toBe(200);
        await expect(heading).toHaveText(whole('Register'), {timeout: T});
    });
});
