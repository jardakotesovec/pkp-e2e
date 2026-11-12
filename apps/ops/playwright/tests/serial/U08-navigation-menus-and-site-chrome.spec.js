// @ts-check
/**
 * @file playwright/tests/serial/U08-navigation-menus-and-site-chrome.spec.js
 *
 * Navigation menus & site chrome — the scenario that cannot run beside the
 * parallel OPS suite: S8 (the site's own Navigation tab) renames the site's
 * "Login" item and adds and removes a site item, and the site's header is
 * shared by every test that reads a site page (PRINCIPLES A7, A9). It
 * carries `@solo` and runs alone in the `ops-solo` project, and it puts
 * "Login" back and removes "PKP" in a `finally` (and sweeps both before it
 * starts, should an earlier run have died between the two).
 * Spec: docs/specs/U08-navigation-menus-and-site-chrome.md
 *
 * Coverage boundaries are declared in the parallel suite's header
 * (playwright/tests/U08-navigation-menus-and-site-chrome.spec.js); this
 * file adds only:
 * - A4 🐞: no step presses "Add Menu", a site menu's title or its "Edit"
 *   (they open nothing and leave the page dimmed); the site's only menu is
 *   never removed with "OK" (no screen could give it back).
 * - A14 ❓: the site's "Navigation Menu Type" list is not read; the item
 *   window is asserted by its heading and the save.
 * - A27 ❓: the site's home page is read in a wide window only.
 *
 * Seeding: a scratch server (the site's pages need two contexts) and the
 * site's "Site Name" emptied through `POST site` `title: ''`, the install
 * state S8's given names ("a site with no name").
 */
const {test, expect} = require('../../support/fixtures.js');
const {whole, PublicChrome, EditorialChrome, NavigationTab} = require('../../../../../shared/playwright/pages/NavigationChromePages.js');

const T = 30_000;

const SITE = 'index';
const REMOVE_TEXT = 'Are you sure you wish to delete this item? This action cannot be undone.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u8${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A signed-out browser page (no inherited storage state). */
async function signedOutPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
    return context.newPage();
}

/** The user menu's top-level entry of a signed-in user. */
function userTop(username) {
    return new RegExp(`^\\s*${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

/** Rename an item of the tab through its "Edit" window; waits for the notice. */
async function renameItem(page, tab, from, to) {
    const item = await tab.editItem(from);
    await item.titleInput().fill(to);
    await tab.noticeDuring('Navigation menu item was successfully updated', () => item.save());
    await expect(item.form).toHaveCount(0);
}

/** Put the site's items back as installed: "Login" titled "Login", no "PKP" (PRINCIPLES A7). */
async function restoreSite(page, tab) {
    await tab.goto();
    if (await tab.row('items', 'Sign in').count()) {
        await renameItem(page, tab, 'Sign in', 'Login');
    }
    if (await tab.row('items', 'PKP').count()) {
        const dialog = await tab.openRemove('items', 'PKP');
        await tab.noticeDuring('Navigation menu item was successfully removed', () =>
            dialog.getByRole('button', {name: 'OK', exact: true}).click()
        );
    }
}

test.describe('navigation menus & site chrome (the site)', () => {
    test("S8: the site's own Navigation tab @solo", async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        // A scratch server, so the site hosts two or more contexts and
        // offers the tab (Rule 1b).
        await opsApi.createContext({tag: makeTag('s8', testInfo)});
        await opsApi.setSite({title: ''});
        const page = await (await asUser('admin')).newPage();
        page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
        const tab = new NavigationTab(page, SITE);
        const visitor = await signedOutPage(browser, baseURL);
        const siteHeader = new PublicChrome(visitor, SITE, {locale: 'en'});

        await restoreSite(page, tab);
        try {
            // The tab: the same two tables; "User Navigation Menu" alone and
            // its seven items, the username item as "admin", no "Search"
            // (Rules 1b, 2, 10).
            await tab.goto();
            await expect(tab.tableHeading('menus')).toHaveText(whole('Navigation'));
            await expect(tab.tableHeading('items')).toHaveText(whole('Navigation Menu Items'));
            await expect(tab.addMenuLink).toBeVisible();
            await expect(tab.addItemLink).toBeVisible();
            await expect(tab.rows('menus')).toHaveCount(1);
            expect((await tab.menus()).map((m) => m.title)).toEqual(['User Navigation Menu']);
            await expect(tab.rows('items')).toHaveCount(7);
            expect((await tab.rowTitles('items')).sort()).toEqual(
                ['Register', 'Login', 'admin', 'Dashboard', 'View Profile', 'Administration', 'Logout'].sort()
            );
            await expect(tab.row('items', 'Search')).toHaveCount(0);

            // The dark bar of a site with no name: at its left "Open
            // Preprint Systems" as plain text, not a link; the bar's
            // right-hand part is there (Rule 27a).
            const ed = new EditorialChrome(page);
            const barName = ed.bar.locator('.app__contextTitle');
            await expect(barName).toHaveText(whole('Open Preprint Systems'));
            expect(await barName.evaluate((e) => !!e.closest('a') || !!e.querySelector('a'))).toBe(false);
            await expect(ed.bar.getByRole('link', {name: 'Open Preprint Systems', exact: true})).toHaveCount(0);
            await expect(ed.contextTitle).toHaveCount(0);
            await expect(ed.helpLink).toBeVisible();
            await expect(ed.initialsButton).toBeVisible();

            // The menu kept: "Remove" asks; "Cancel": the row stays (Rules 1b, 9).
            const dialog = await tab.openRemove('menus', 'User Navigation Menu');
            await expect(dialog).toContainText(REMOVE_TEXT);
            await expect(dialog.getByRole('button', {name: 'OK', exact: true})).toBeVisible();
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            await expect(tab.removeDialog()).toHaveCount(0);
            await expect(tab.row('menus', 'User Navigation Menu')).toHaveCount(1);

            // An item added: "PKP", "Remote URL", https://pkp.sfu.ca: the
            // notice and the row (Rules 1b, 11; A14 not read).
            const item = await tab.addItem();
            await expect(item.heading).toHaveText(whole('Add item'));
            await item.titleInput().fill('PKP');
            await item.chooseType('Remote URL');
            await item.urlInput().fill('https://pkp.sfu.ca');
            await tab.noticeDuring('Navigation menu item was successfully added', () => item.save());
            await expect(item.form).toHaveCount(0);
            await expect(tab.row('items', 'PKP')).toHaveCount(1);

            // Control, while "PKP" exists: the visitor's site home page has
            // no "PKP" link, the item belonging to no menu, and no primary
            // menu (Rules 2, 11).
            await siteHeader.goto();
            await expect(siteHeader.userTopLinks).toHaveText([whole('Register'), whole('Login')]);
            await expect(visitor.getByRole('link', {name: 'PKP', exact: true})).toHaveCount(0);
            await expect(siteHeader.primaryTopLinks).toHaveCount(0);

            // An item renamed: "Login" to "Sign in": the notice; the
            // visitor's site home page shows "Sign in" where "Login" was;
            // put back the same way (Rules 11, 18).
            await renameItem(page, tab, 'Login', 'Sign in');
            await siteHeader.goto();
            await expect(siteHeader.userTopLinks).toHaveText([whole('Register'), whole('Sign in')]);
            await renameItem(page, tab, 'Sign in', 'Login');
            await siteHeader.goto();
            await expect(siteHeader.userTopLinks).toHaveText([whole('Register'), whole('Login')]);

            // An item removed: "PKP" leaves the table (Rule 13).
            const remove = await tab.openRemove('items', 'PKP');
            await tab.noticeDuring('Navigation menu item was successfully removed', () =>
                remove.getByRole('button', {name: 'OK', exact: true}).click()
            );
            await expect(tab.row('items', 'PKP')).toHaveCount(0, {timeout: T});
            await expect(tab.rows('items')).toHaveCount(7);

            // The Site Administrator on the site's home page, in a wide
            // window: the username at the top right carries no number;
            // pressed, its list opens, and "Dashboard" in it shows no
            // number either; the list's four entries are the control
            // (Rule 19c).
            expect((page.viewportSize() || {width: 0}).width).toBeGreaterThanOrEqual(1024);
            const adminSite = new PublicChrome(page, SITE, {locale: 'en'});
            await adminSite.goto();
            const username = adminSite.topLink('user', userTop('admin'));
            await expect(username).toHaveText(whole('admin'), {useInnerText: true});
            await expect(adminSite.taskCount(username)).toHaveCount(0);
            await adminSite.pressTop('user', userTop('admin'));
            const list = adminSite.submenuLinks('user', userTop('admin'));
            await expect(list).toHaveText([whole('Dashboard'), whole('View Profile'), whole('Administration'), whole('Logout')], {
                useInnerText: true,
            });
            const dashboard = list.filter({hasText: /^\s*Dashboard\b/});
            await expect(dashboard).toBeVisible();
            await expect(adminSite.taskCount(dashboard)).toBeHidden();
        } finally {
            await restoreSite(page, tab);
        }
    });
});
