// @ts-check
/**
 * @file playwright/tests/serial/U08-navigation-menus-and-site-chrome.spec.js
 *
 * Navigation menus & site chrome — OMP suite, the serial part: S8 (the
 * site's own Navigation tab). The other scenarios and the suite's coverage
 * boundaries are in `../U08-navigation-menus-and-site-chrome.spec.js`.
 * Spec: docs/specs/U08-navigation-menus-and-site-chrome.md
 *
 * Serial project, alone (PRINCIPLES A7, A9): the scenario adds an item to
 * the site's own menus and renames the site's "Login" item, fleet-global
 * state every test reading a site page (the site's home, Login and
 * Register pages) would see, so it carries `@solo` and runs by itself in
 * the `omp-solo` project after the serial one (harness.md "Project
 * chain"). It puts "Login" back and removes its "PKP" item before it
 * returns, and a best-effort restore runs even when the test fails midway.
 *
 * Not asserted here, by register ID: A4 🐞 (no test presses the site's
 * "Add Menu" or a menu's "Edit", which open no window), A14 ❓ (the site's
 * item window is opened without reading its type list). The site's only
 * menu is never removed ("Remove" is answered "Cancel"): no screen could
 * give it back (the spec's Coverage, "No seed").
 *
 * Seeding: one scratch press through `POST scenarios/context`, so the site
 * hosts two or more presses and offers the "Navigation" side tab (Rule 1b)
 * whatever else the install holds. The visitor is a browser context with
 * an empty storage state (patterns.md, parallel lesson 8).
 */
const {test: base, expect} = require('../../support/fixtures.js');
const {NavigationTab, PublicChrome, whole} = require('../../../../../shared/playwright/pages/NavigationChromePages.js');

const SITE = 'index';
const T = 30_000;
const REMOVE_QUESTION = 'Are you sure you wish to delete this item? This action cannot be undone.';
const ITEM_ADDED = 'Navigation menu item was successfully added';
const ITEM_UPDATED = 'Navigation menu item was successfully updated';
const ITEM_REMOVED = 'Navigation menu item was successfully removed';
const SITE_ITEMS = ['Register', 'Login', 'admin', 'Dashboard', 'View Profile', 'Administration', 'Logout'];

const sorted = (list) => [...list].sort();

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

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u8${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** Rename a site item back (best effort, for the restore). */
async function renameItem(nav, from, to) {
    const item = await nav.editItem(from);
    await item.titleInput().fill(to);
    const saved = await item.save();
    await expect(item.form).toBeHidden();
    return saved;
}

test.describe('navigation menus & site chrome (the site)', () => {
    test("S8: the site's own Navigation tab @solo", async ({asUser, ompApi, visitor}, testInfo) => {
        test.slow();
        await ompApi.createContext({tag: makeTag('8', testInfo)});
        const page = await (await asUser('admin')).newPage();
        const nav = new NavigationTab(page, SITE, {locale: 'en'});
        const site = new PublicChrome(visitor, SITE, {locale: 'en'});
        await site.goto();
        await expect(site.userTopLinks).toHaveText([whole('Register'), whole('Login')]);

        let renamed = false;
        let added = false;
        try {
            // The tab: the same two tables; "User Navigation Menu" alone and
            // its seven items, no "Search" (Rules 1b, 2, 10).
            await nav.goto();
            await expect(nav.tableHeading('menus')).toHaveText(whole('Navigation'));
            await expect(nav.tableHeading('items')).toHaveText(whole('Navigation Menu Items'));
            await expect.poll(() => nav.rowTitles('menus')).toEqual(['User Navigation Menu']);
            await expect.poll(async () => sorted(await nav.rowTitles('items'))).toEqual(sorted(SITE_ITEMS));
            await expect(nav.row('items', 'Search')).toHaveCount(0);

            // The menu kept: "Remove" asks; "Cancel": the row stays (Rules 1b, 9).
            await nav.openRemove('menus', 'User Navigation Menu');
            await expect(nav.removeDialog()).toContainText(REMOVE_QUESTION);
            await nav.removeDialogButton('Cancel').click();
            await expect(nav.removeDialog()).toHaveCount(0);
            await expect(nav.row('menus', 'User Navigation Menu')).toHaveCount(1);

            // An item added: "PKP", "Remote URL", https://pkp.sfu.ca; the
            // notice, "PKP" listed (Rules 1b, 11; A14 not read).
            const item = await nav.addItem();
            await expect(item.heading).toHaveText(whole('Add item'));
            await item.titleInput().fill('PKP');
            await item.chooseType('Remote URL');
            await item.urlInput().fill('https://pkp.sfu.ca');
            const saved = await item.save();
            expect(saved.body && saved.body.status).toBe(true);
            added = true;
            await expect(item.form).toBeHidden();
            await expect(nav.notice(ITEM_ADDED)).toBeVisible();
            await expect(nav.row('items', 'PKP')).toHaveCount(1);

            // Control, while "PKP" exists: the site's home page shows no
            // "PKP" link, the item belonging to no menu, and no primary menu
            // (Rules 2, 11).
            await site.reload();
            await expect(site.userTopLinks).toHaveText([whole('Register'), whole('Login')]);
            await expect(site.header.getByRole('link', {name: 'PKP', exact: true})).toHaveCount(0);
            await expect(site.primaryTopLinks).toHaveCount(0);

            // An item renamed: "Login" to "Sign in"; the visitor's site home
            // page shows "Sign in" where "Login" was (Rules 11, 18).
            const edit = await nav.editItem('Login');
            await expect(edit.heading).toHaveText(whole('Edit'));
            await edit.titleInput().fill('Sign in');
            const renamedAnswer = await edit.save();
            expect(renamedAnswer.body && renamedAnswer.body.status).toBe(true);
            renamed = true;
            await expect(edit.form).toBeHidden();
            await expect(nav.notice(ITEM_UPDATED)).toBeVisible();
            await site.reload();
            await expect(site.userTopLinks).toHaveText([whole('Register'), whole('Sign in')]);

            // "Login" put back the same way.
            const back = await renameItem(nav, 'Sign in', 'Login');
            expect(back.body && back.body.status).toBe(true);
            renamed = false;
            await site.reload();
            await expect(site.userTopLinks).toHaveText([whole('Register'), whole('Login')]);

            // An item removed: "PKP", "Remove", "OK"; the notice, "PKP" gone (Rule 13).
            await nav.openRemove('items', 'PKP');
            await nav.removeDialogButton('OK').click();
            await expect(nav.notice(ITEM_REMOVED)).toBeVisible();
            await expect(nav.row('items', 'PKP')).toHaveCount(0);
            added = false;
            await expect.poll(async () => sorted(await nav.rowTitles('items'))).toEqual(sorted(SITE_ITEMS));
        } finally {
            // Best-effort restore of the site's items, whatever failed above.
            if (renamed || added) {
                await nav.goto().catch(() => {});
                if (renamed && (await nav.row('items', 'Sign in').count().catch(() => 0))) {
                    await renameItem(nav, 'Sign in', 'Login').catch(() => {});
                }
                if (added && (await nav.row('items', 'PKP').count().catch(() => 0))) {
                    await nav.openRemove('items', 'PKP').catch(() => {});
                    await nav.removeDialogButton('OK').click({timeout: T}).catch(() => {});
                }
            }
        }
    });
});
