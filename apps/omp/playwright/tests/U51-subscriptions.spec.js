// @ts-check
/**
 * @file playwright/tests/U51-subscriptions.spec.js
 *
 * Subscriptions & open access control — OMP suite. A press does not
 * install subscriptions (the spec's title badge is {OJS}), so the press
 * runs the one scenario written for it, S16 "No subscriptions on a press
 * or a preprint server" {OMP OPS}: the absence test with a positive
 * control per assertion (RUNBOOK multi-app rule 3), in the press's own
 * words: the Press Manager's Settings › Distribution tabs and Settings ›
 * Users & Roles › "Roles", and the two reader addresses typed by a visitor.
 * S1–S15 are the journal's, in its tree; S16's second bullet (the preprint
 * server's "Access" tab) is the OPS suite's.
 * Spec: docs/specs/U51-subscriptions.md
 *
 * The spec's control is taken on the seeded journal, which the OMP fleet
 * does not serve; the journal half ("Access" with "Publishing Mode", the
 * "Subscription Manager" role, the two pages) is the OJS suite's. Here each
 * absence is paired with what the press offers in the same place, read the
 * same way: the Distribution tab row's "Payments" tab (the absence
 * paragraph: a press's "Payments" tab serves the direct sale of publication
 * formats), the Roles grid's "Press manager" and "Reader" rows, and an
 * address of the same page family typed the same way ("about", "user/
 * register").
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1–A27: all on a journal's subscription screens, which a press does
 *   not have.
 * - OPS1: the preprint server's "Posting Mode"; OPS only.
 *
 * Seeding: none. The seeded press publicknowledge and the seeded Press
 * Manager are read-only; the visitor is a browser context with no session.
 *
 * The Distribution tab row is read web-first as a whole, the missing
 * "Access" paired with "Payments" read by role the same way, whose panel
 * then opens. The Roles grid is read once its rows have rendered and its
 * paging line says every role is on the page, the missing "Subscription
 * Manager" paired with rows read the same way. Each address is read from
 * its response and its heading, paired with an address typed the same way
 * (M4, M6). Waits are web-first (A5). Runs in the parallel `omp` project:
 * nothing here changes the press.
 */
const {test: base, expect} = require('../support/fixtures.js');
const {SettingsPages} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');
const {whole} = require('../../../../shared/playwright/pages/NavigationChromePages.js');
const {waitForJQueryIdle} = require('../../../../shared/playwright/support/legacy.js');

const PRESS = 'publicknowledge';
/** publicknowledge is bilingual, so its addresses carry the /en prefix. */
const LOCALE = 'en';
const T = 30_000;

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
    test('S16: no subscriptions on a press', async ({asUser, visitor}) => {
        const page = await (await asUser('manager.maya')).newPage();
        const settings = new SettingsPages(page, PRESS, {locale: LOCALE});

        // The press's Distribution: Settings › Distribution has no "Access"
        // tab (Purpose, the absence paragraph). The whole tab row is read
        // web-first, so the read is settled.
        await settings.goto('distribution');
        await expect(settings.topTabs).toHaveText([
            whole('License'),
            whole('DOIs'),
            whole('Search Indexing'),
            whole('Payments'),
            whole('Statistics'),
        ]);
        await expect(settings.tab('Access')).toHaveCount(0);

        // Control: the same row's "Payments" tab, read by role the same way,
        // opens its panel (the press's own payments, for direct sales).
        await expect(settings.tab('Payments')).toHaveCount(1);
        await settings.tab('Payments').click();
        await expect(settings.tab('Payments')).toHaveAttribute('aria-selected', 'true');
        await expect(
            settings.mainRegion
                .getByRole('tabpanel', {name: 'Payments', exact: true})
                .getByRole('checkbox', {name: /^Payments will be enabled for this press\./})
        ).toBeVisible({timeout: T});

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

        // Control: the same grid lists the press's own roles, read the same
        // way: the Press Manager's and the reader's.
        await expect(rows.filter({hasText: 'Press manager'})).not.toHaveCount(0);
        await expect(rows.filter({has: page.getByText('Reader', {exact: true})})).not.toHaveCount(0);
        await expect(grid.getByText('Press manager', {exact: true})).toHaveCount(1);

        // No "Subscriptions" page: the press's address followed by
        // "about/subscriptions" opens no "Subscriptions" page but "404 Not
        // Found" (Purpose, the absence paragraph).
        const url = (path) => `/index.php/${PRESS}/${LOCALE}/${path}`;
        const heading = visitor.locator('.pkp_structure_main h1').first();
        /** The 404 page is the bare error page, outside the press's chrome. */
        const errorHeading = visitor.locator('h1');
        const aboutSubs = await visitor.goto(url('about/subscriptions'));
        expect(aboutSubs && aboutSubs.status(), 'about/subscriptions answered').toBe(404);
        await expect(errorHeading).toHaveText(whole('404 Not Found'), {timeout: T});
        await expect(visitor.getByRole('heading', {name: 'Subscriptions'})).toHaveCount(0);

        // Control: the same page family's own address, typed the same way,
        // opens the About page.
        const about = await visitor.goto(url('about'));
        expect(about && about.status(), 'about answered').toBe(200);
        await expect(heading).toHaveText(whole('About the Press'), {timeout: T});

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
