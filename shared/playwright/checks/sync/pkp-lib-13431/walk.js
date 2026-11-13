// PR review of pkp/pkp-lib#12654 (pkp-lib#13431, ojs#5887, omp#2575, ops#1506; main only): the
// default theme's header. Desktop: a top-level item with a list becomes a <button> (the served <a>
// detached); narrow: the <a> is left (or put back) as served. New: a "Home" item (NMI_TYPE_HOME)
// first in a new context's primary menu, and aria-current="page" on the item of the page shown.
// On a fleet, the seeded context, signed out then as admin:
//   - wide (1280): the top items of both menus (tag, text, href, aria-current, aria-expanded);
//     press "About" (stays on the page, list shown), Escape; point at it; the username likewise;
//   - aria-current on the home page ('' and /index), on "About the Journal", on a query-string
//     address of a menu page, and on a page the menu does not hold;
//   - narrow (800), loaded narrow: the top items, then press "About" and the username: where to;
//   - wide → narrow → wide on one page: the items after each resize;
//   - the context's navigation items in the database (Home in the primary menu, its position).
//   PROBE_FEATURE=sync PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13431/walk.js
const {forEachApp, launch, signIn, signOut, record, screen, sql} = require('../../../probe');

async function items(page) {
    return page.evaluate(() => {
        const read = (sel) => [...document.querySelectorAll(sel)].map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent.replace(/\s+/g, ' ').trim(),
            href: el.getAttribute('href'),
            current: el.getAttribute('aria-current'),
            expanded: el.getAttribute('aria-expanded'),
            toggle: el.getAttribute('data-toggle'),
            id: el.id || null,
        }));
        return {
            primary: read('#navigationPrimary > li > :is(a, button)'),
            primaryChildren: read('#navigationPrimary > li > ul > li > a'),
            user: read('#navigationUser > li > :is(a, button)'),
            userChildren: read('#navigationUser > li > ul > li > a'),
            currentAnywhere: [...document.querySelectorAll('header [aria-current]')].map((el) => `${el.tagName.toLowerCase()} ${el.textContent.trim()} = ${el.getAttribute('aria-current')}`),
        };
    });
}

async function listShown(page, menu, title) {
    return page.evaluate(([menu, title]) => {
        const top = [...document.querySelectorAll(`${menu} > li > :is(a, button)`)].find((el) => el.textContent.trim().startsWith(title));
        const ul = top && top.parentElement.querySelector(':scope > ul');
        return ul ? getComputedStyle(ul).display !== 'none' && ul.getBoundingClientRect().height > 0 : null;
    }, [menu, title]);
}

forEachApp(async (app) => {
    const ctx = app.contextPath;
    const home = `/index.php/${ctx}/en`;
    const about = app.name === 'ojs' ? 'About the Journal' : app.name === 'omp' ? 'About the Press' : 'About the Server';
    const facts = {};
    facts.db = sql(app, `select i.type, coalesce(s.setting_value, '') title, a.seq, a.parent_id, m.title menu
        from navigation_menu_item_assignments a join navigation_menu_items i on i.navigation_menu_item_id = a.navigation_menu_item_id
        join navigation_menus m on m.navigation_menu_id = a.navigation_menu_id
        left join navigation_menu_item_settings s on s.navigation_menu_item_id = i.navigation_menu_item_id and s.setting_name = 'titleLocaleKey'
        where m.context_id = (select ${app.name === 'omp' ? 'press_id from presses' : app.name === 'ops' ? 'server_id from servers' : 'journal_id from journals'} where path = '${ctx}')
        order by m.title, a.parent_id, a.seq`).split('\n');

    const {page, close} = await launch(app);
    try {
        // wide, signed out
        await page.goto(home);
        await page.waitForTimeout(500);
        facts.wideOut = await items(page);
        record('01-home-wide-out', await screen(page));
        await page.goto(`/index.php/${ctx}/en/index`);
        facts.indexCurrent = (await items(page)).currentAnywhere;
        // press About
        const aboutTop = page.locator('#navigationPrimary > li > :is(a, button)').filter({hasText: /^\s*About\s*$/});
        await page.goto(home);
        await page.waitForTimeout(300);
        await aboutTop.click();
        await page.waitForTimeout(300);
        facts.afterPressAbout = {url: page.url(), shown: await listShown(page, '#navigationPrimary', 'About'), expanded: await aboutTop.getAttribute('aria-expanded'), focused: await page.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 160))};
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        facts.afterEscape = {shown: await listShown(page, '#navigationPrimary', 'About'), expanded: await aboutTop.getAttribute('aria-expanded')};
        await aboutTop.hover();
        await page.waitForTimeout(300);
        facts.afterPoint = {shown: await listShown(page, '#navigationPrimary', 'About'), expanded: await aboutTop.getAttribute('aria-expanded')};
        await page.mouse.move(5, 890);
        await page.waitForTimeout(300);
        facts.afterPointAway = {shown: await listShown(page, '#navigationPrimary', 'About'), expanded: await aboutTop.getAttribute('aria-expanded')};
        // keyboard: Tab to About, Enter
        await page.goto(home);
        await page.waitForTimeout(300);
        await aboutTop.focus();
        facts.focusOnly = {shown: await listShown(page, '#navigationPrimary', 'About')};
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        facts.enter = {url: page.url(), shown: await listShown(page, '#navigationPrimary', 'About'), expanded: await aboutTop.getAttribute('aria-expanded')};
        await page.keyboard.press('ArrowDown');
        facts.arrowDownFocus = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
        // aria-current on menu pages
        await page.getByRole('link', {name: about, exact: true}).first().click({force: true}).catch(async () => page.goto(`${home}/about`));
        await page.waitForLoadState('load');
        facts.aboutPage = {url: page.url(), current: (await items(page)).currentAnywhere};
        await page.goto(`${home}/about?x=1`);
        facts.aboutQuery = (await items(page)).currentAnywhere;
        await page.goto(`${home}/search/search?query=x`);
        facts.searchPage = (await items(page)).currentAnywhere;
        await page.goto(`${home}/about/submissions`);
        facts.submissionsPage = (await items(page)).currentAnywhere;
        record('02-about-wide', await screen(page));

        // wide, signed in
        await signIn(page, 'admin');
        await page.goto(home);
        await page.waitForTimeout(500);
        facts.wideIn = await items(page);
        const userTop = page.locator('#navigationUser > li > :is(a, button)').filter({hasText: /admin/});
        await userTop.click();
        await page.waitForTimeout(300);
        facts.afterPressUser = {url: page.url(), shown: await listShown(page, '#navigationUser', 'admin'), expanded: await userTop.getAttribute('aria-expanded')};
        record('03-home-wide-in', await screen(page));

        // narrow, loaded narrow, signed in
        await page.setViewportSize({width: 800, height: 900});
        await page.goto(home);
        await page.waitForTimeout(500);
        facts.narrowIn = await items(page);
        const openMenu = page.getByRole('button', {name: 'Open Menu'});
        if (await openMenu.isVisible()) await openMenu.click();
        await page.waitForTimeout(300);
        record('04-home-narrow-in', await screen(page));
        await page.locator('#navigationPrimary > li > :is(a, button)').filter({hasText: /^\s*About\s*$/}).click();
        await page.waitForLoadState('load');
        facts.narrowPressAbout = {url: page.url()};
        await page.goto(home);
        if (await openMenu.isVisible()) await openMenu.click();
        await page.waitForTimeout(300);
        await page.locator('#navigationUser > li > :is(a, button)').filter({hasText: /admin/}).click();
        await page.waitForLoadState('load');
        facts.narrowPressUser = {url: page.url()};

        // resize on one page: wide → narrow → wide
        await page.setViewportSize({width: 1280, height: 900});
        await page.goto(home);
        await page.waitForTimeout(500);
        await page.setViewportSize({width: 800, height: 900});
        await page.waitForTimeout(500);
        facts.resizedNarrow = await items(page);
        await page.setViewportSize({width: 1280, height: 900});
        await page.waitForTimeout(500);
        facts.resizedWide = await items(page);
        await signOut(page);
    } catch (e) {
        facts.error = String(e).slice(0, 600);
        record('error', await screen(page).catch(() => ({})));
    } finally {
        record('facts', facts);
        await close();
    }
});
