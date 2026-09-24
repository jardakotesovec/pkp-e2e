// U08 sync check fr0924 (after lib/pkp 25182919bf, the fr_CA translations of
// common.editorialMasthead and common.changeLanguage): Rule 12b / A19 and
// Rule 28 / A20 on a running install.
// Seeds per app, through POST scenarios/context:
//   F  French under "UI" and "Forms"; one account per permission level
//      (manager, sub-editor, assistant, author, reviewer where the app has
//      one, reader)
//   E  English alone under "UI" (the other end of Rule 28's "while it has
//      more than one"); a manager
// Screens, each recorded with screen() and swept for raw "##key##" codes:
//   01/02  F's public header, French then English, signed out
//   03     F's Editorial Masthead page in French
//   04     F's Navigation tab in French as the manager: both tables
//   05     the Primary menu's window in French (its panels)
//   06     the Editorial Masthead item's window in French; then a French
//          title typed and the window closed unsaved, then the page left
//   07     the Website settings' Appearance tab strip in French
//   10-*   the initials menu in French, one account per level, and admin
//   11     the initials menu on E (one UI language)
// The publicknowledge end of Rule 2 (French under "UI" alone) is k1-fr.js.
// Run: PROBE_FEATURE=sync PROBE_AGENT=fr0924 node bin/probe.js all shared/playwright/checks/U08/K1/k1-fr0924.js
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const log = (...a) => console.log('[fr0924]', ...a);
const ctxUrl = (app, ctx, p = '', locale = '') => app.url(`/index.php/${ctx}${locale ? '/' + locale : ''}${p}`);

/** Every "##key##" left on the page (rendered text and naming attributes), with where it sits and whether it is visible. */
const rawKeys = (page) => page.evaluate(() => {
    const re = /##[A-Za-z0-9_.\-]+##/g;
    const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
    const where = (e) => {
        const land = e.closest('nav[aria-label], [role="dialog"], header, main, aside, footer, [role="tabpanel"]');
        const own = `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
        const l = land ? `${land.tagName.toLowerCase()}${land.id ? '#' + land.id : ''}${land.getAttribute('aria-label') ? '[' + land.getAttribute('aria-label') + ']' : ''}` : 'body';
        return `${l} > ${own}`;
    };
    const found = new Map();
    const add = (k, e, how) => { const key = `${k} @ ${where(e)} (${how}${vis(e) ? '' : ', hidden'})`; found.set(key, true); };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement && n.parentElement.tagName === 'SCRIPT') continue;
        (n.nodeValue.match(re) || []).forEach((k) => add(k, n.parentElement, 'text'));
    }
    for (const el of document.querySelectorAll('[aria-label],[title],[alt],[placeholder]')) {
        for (const a of ['aria-label', 'title', 'alt', 'placeholder']) {
            const v = el.getAttribute(a);
            if (v) (v.match(re) || []).forEach((k) => add(k, el, a));
        }
    }
    (document.title.match(re) || []).forEach((k) => found.set(`${k} @ <title>`, true));
    return [...found.keys()];
});

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    const raw = await rawKeys(page).catch(() => null);
    record(name, {...s, rawKeys: raw, ...extra});
    await shot(page, name).catch(() => {});
    return {...s, rawKeys: raw};
}

function watchDialogs(page) {
    const seen = [];
    page.on('dialog', async (d) => {
        seen.push({type: d.type(), message: d.message(), url: page.url()});
        await d.accept().catch(() => {});
    });
    return seen;
}

/** The public header: primary and user menus as a tree, hidden sub-lists included. */
const header = (page) => page.evaluate(() => {
    const tree = (ul) => (ul ? [...ul.children].filter((li) => li.tagName === 'LI').map((li) => {
        const a = li.querySelector(':scope > a');
        const sub = li.querySelector(':scope > ul');
        const o = {title: a ? a.textContent.trim() : null, href: a ? a.getAttribute('href') : null};
        if (sub) o.children = tree(sub);
        return o;
    }) : null);
    return {
        primary: tree(document.querySelector('#navigationPrimary')),
        user: tree(document.querySelector('#navigationUser')),
        htmlLang: document.documentElement.lang,
    };
});

const itemsTable = (page) => page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first();
const menusTable = (page) => page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]').first();
const readRows = (table) => table.evaluate((t) => ({
    heads: [...t.querySelectorAll('th')].map((th) => th.innerText.trim()),
    rows: [...t.querySelectorAll('tr.gridRow')].map((tr) => ({id: tr.id, cells: [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())})),
    heading: t.closest('.pkp_controllers_grid')?.querySelector('h4, .header h4')?.innerText.trim() ?? null,
    actions: [...(t.closest('.pkp_controllers_grid')?.querySelectorAll('.actions a') || [])].map((a) => a.innerText.trim()).filter(Boolean),
}));

/** The initials menu: open it, read it, close it. */
async function initialsMenu(page, username) {
    const nav = page.locator('[data-cy="app-user-nav"]').first();
    await nav.waitFor({timeout: T});
    const button = page.getByRole('banner').getByRole('button', {name: username}).first();
    await loc(page, 'the initials button (banner button named by username)', button);
    await button.click();
    const menu = nav.locator('nav').first();
    await menu.waitFor({timeout: T});
    await sleep(300);
    const data = await menu.evaluate((n) => {
        const blocks = [...n.children].map((d) => ({
            heading: d.querySelector(':scope > div.text-base-bold')?.innerText.trim() ?? null,
            links: [...d.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), ticked: !!a.querySelector('svg')})),
            text: d.innerText.trim(),
        }));
        return {ariaLabel: n.getAttribute('aria-label'), blocks, text: n.innerText.trim()};
    });
    const bannerSr = await page.getByRole('banner').evaluate((b) => [...b.querySelectorAll('.-screenReader')].map((s) => s.innerText.trim())).catch(() => null);
    return {...data, bannerScreenReaderTexts: bannerSr, button: await button.innerText().catch(() => null)};
}

forEachApp(async (app) => {
    const t = tag('u08f');
    const e = tag('u08e');
    const levels = [
        ['mgr', 'manager'],
        ['se', 'sectionEditor'],
        ...(app.name === 'ops' ? [['as', 'editorialBoardMember']] : [['as', 'funding']]),
        ['au', 'author'],
        ...(app.name === 'ops' ? [] : [['rv', 'externalReviewer']]),
        ['rd', 'reader'],
    ];
    await app.api.createContext({tag: t, context: {name: `FR0924 ${t}`, supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
        users: levels.map(([u, r]) => ({username: `${t}${u}`, roles: [r]}))});
    await app.api.createContext({tag: e, context: {name: `FR0924 E ${e}`}, users: [{username: `${e}mgr`, roles: ['manager']}]});
    note(`fr0924 [${app.name}]: U08 scratch contexts ${t} (en+fr_CA UI and Forms; ${levels.map(([u, r]) => `${t}${u}=${r}`).join(', ')}) and ${e} (en only)`);
    log(app.name, 'seeded', t, e);

    const {page, close} = await launch(app);
    const dialogs = watchDialogs(page);
    const out = {ctx: t, ctxEnglishOnly: e};
    try {
        // 01/02 the public header, signed out
        await page.goto(ctxUrl(app, t, '', 'fr_CA'));
        await idle(page);
        out.headerFr = await header(page);
        out.s01 = (await snap(page, '01-public-fr', {header: out.headerFr})).rawKeys;
        await page.goto(ctxUrl(app, t, '', 'en'));
        await idle(page);
        out.headerEn = await header(page);
        out.s02 = (await snap(page, '02-public-en', {header: out.headerEn})).rawKeys;

        // 03 the Editorial Masthead page in French
        await page.goto(ctxUrl(app, t, '/about/editorialMasthead', 'fr_CA'));
        await idle(page);
        out.mastheadPage = await page.evaluate(() => ({title: document.title, h1: document.querySelector('main h1, h1')?.innerText.trim() ?? null,
            breadcrumbs: document.querySelector('.cmp_breadcrumbs')?.innerText.replace(/\s+/g, ' ').trim() ?? null}));
        out.s03 = (await snap(page, '03-masthead-page-fr', out.mastheadPage)).rawKeys;

        // 04 the Navigation tab in French, as the manager
        await signIn(page, `${t}mgr`, {contextPath: t});
        await idle(page);
        await page.goto(ctxUrl(app, t, '/management/settings/website#setup/navigationMenus', 'fr_CA'));
        await idle(page);
        await itemsTable(page).waitFor({timeout: T});
        await menusTable(page).waitFor({timeout: T});
        await sleep(500);
        out.itemsFr = await readRows(itemsTable(page));
        out.menusFr = await readRows(menusTable(page));
        out.s04 = (await snap(page, '04-navigation-fr', {items: out.itemsFr, menus: out.menusFr})).rawKeys;
        await loc(page, 'Navigation tab (fr_CA): items table', itemsTable(page));

        // 05 the Primary menu's window in French
        const primaryLink = menusTable(page).locator('tr.gridRow').filter({hasText: 'Primary Navigation Menu'}).first().getByRole('link', {name: 'Primary Navigation Menu', exact: true});
        out.primaryLinkText = await primaryLink.innerText().catch(() => null);
        await primaryLink.click();
        const editor = page.locator('[data-cy="navigation-menu-editor"]:visible').first();
        await editor.waitFor({timeout: T}).catch(() => {});
        await idle(page);
        await sleep(600);
        out.menuPanels = await editor.evaluate((root) => {
            const read = (cy) => {
                const p = root.querySelector(`[data-cy="${cy}"]`);
                if (!p) return null;
                return [...p.querySelectorAll('[data-menu-item-title]')].map((el) => ({title: el.getAttribute('data-menu-item-title'), shown: el.innerText.trim().split('\n')[0], level: Math.round(parseInt(el.style.marginInlineStart || '0', 10) / 24)}));
            };
            return {assigned: read('panel-content-assigned'), unassigned: read('panel-content-unassigned')};
        }).catch((err) => ({error: String(err).slice(0, 200)}));
        const menuWinText = await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null);
        out.s05 = (await snap(page, '05-menu-window-fr', {panels: out.menuPanels, windowText: menuWinText})).rawKeys;
        // close it with its own close control (no change made)
        const menuDialog = page.locator('[role="dialog"]:visible').last();
        const closeBtn = menuDialog.getByRole('button', {name: /Fermer|Close|Annuler|Cancel/}).first();
        out.menuCloseLabel = await closeBtn.innerText().catch(() => null);
        await closeBtn.click().catch(() => {});
        await sleep(800);
        out.menuCloseDialogs = dialogs.splice(0);

        // 06 the Editorial Masthead item's window in French
        await page.goto('about:blank');
        await page.goto(ctxUrl(app, t, '/management/settings/website#setup/navigationMenus', 'fr_CA'));
        await idle(page);
        await itemsTable(page).waitFor({timeout: T});
        await sleep(500);
        const rows = await readRows(itemsTable(page));
        const mRow = rows.rows.find((r) => /editorialMasthead|Entête|Editorial Masthead|Comité/i.test(r.cells.join(' ')));
        out.mastheadRow = mRow || null;
        if (mRow) {
            const row = page.locator(`[id="${mRow.id}"]`);
            if (await row.locator('a.show_extras').count()) { await row.locator('a.show_extras').first().click(); await sleep(300); }
            const ctl = page.locator(`[id="${mRow.id}-control-row"]`);
            out.mastheadRowControls = await ctl.locator('a').evaluateAll((els) => els.filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()).filter(Boolean));
            await ctl.locator('a').filter({hasText: /Modifier|Edit/}).first().click();
            const itemWin = page.locator('[role="dialog"]:visible').filter({has: page.locator('form#navigationMenuItemsForm')}).first();
            await itemWin.locator('select[name="menuItemType"]').waitFor({timeout: T});
            await idle(page);
            await sleep(600);
            out.itemWindow = await itemWin.evaluate((w) => {
                const sel = w.querySelector('select[name="menuItemType"]');
                return {
                    heading: w.querySelector('h1')?.innerText.trim() ?? null,
                    titleBoxes: [...w.querySelectorAll('input[name^="title["]')].map((i) => ({name: i.name, value: i.value})),
                    type: sel ? sel.options[sel.selectedIndex]?.text : null,
                    typeLine: w.querySelector('#menuItemTypeSection .sub_label, #menuItemTypeSection label.sub_label, .pkp_form .description')?.innerText.trim() ?? null,
                    text: w.innerText.replace(/\n{2,}/g, '\n').trim().slice(0, 3000),
                };
            });
            out.s06 = (await snap(page, '06-item-window-fr', {itemWindow: out.itemWindow})).rawKeys;
            // leave with something changed: type a French title, close the window
            const frBox = itemWin.locator('input[name="title[fr_CA]"]');
            if (await frBox.count()) {
                if (!(await frBox.isVisible())) {
                    await itemWin.locator('input[name="title[en]"]').focus().catch(() => {});
                    await sleep(300);
                }
                await frBox.fill('Comité fr0924').catch(() => {});
                await frBox.blur().catch(() => {});
            }
            const itemClose = itemWin.getByRole('button', {name: /Fermer|Close/}).first();
            out.itemCloseLabel = await itemClose.innerText().catch(() => null);
            await itemClose.click().catch(() => {});
            await sleep(1000);
            out.itemCloseDialogs = dialogs.splice(0);
            out.itemWindowOpenAfterClose = await page.locator('form#navigationMenuItemsForm:visible').count();
            // reopen: was anything kept?
            const rows2 = await readRows(itemsTable(page));
            out.rowsAfterClose = rows2.rows.map((r) => r.cells.join(' | '));
        }
        // leave the page (another address)
        await page.goto(ctxUrl(app, t, '/management/settings/website#appearance', 'fr_CA'));
        await idle(page);
        await sleep(500);
        out.leaveDialogs = dialogs.splice(0);

        // 07 the Website settings' top tabs and Appearance's side tabs in French
        out.websiteTabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((x) => x.offsetParent !== null).map((x) => ({id: x.id, text: x.innerText.trim()})));
        out.s07 = (await snap(page, '07-website-appearance-fr', {tabs: out.websiteTabs})).rawKeys;

        // 10 the initials menu in French, per level (the Profile page carries the bar)
        out.initials = {};
        for (const [u] of levels) {
            const username = `${t}${u}`;
            await signIn(page, username, {contextPath: t});
            await idle(page);
            await page.goto(ctxUrl(app, t, '/user/profile', 'fr_CA'));
            await idle(page);
            const m = await initialsMenu(page, username).catch((err) => ({error: String(err).slice(0, 300)}));
            out.initials[u] = m;
            await snap(page, `10-initials-fr-${u}`, {menu: m});
            await page.keyboard.press('Escape').catch(() => {});
        }
        // the manager on the website settings page (dashboard-type bar) too
        await signIn(page, `${t}mgr`, {contextPath: t});
        await page.goto(ctxUrl(app, t, '/management/settings/website', 'fr_CA'));
        await idle(page);
        out.initials.mgrSettings = await initialsMenu(page, `${t}mgr`).catch((err) => ({error: String(err).slice(0, 300)}));
        await snap(page, '10-initials-fr-mgr-settings', {menu: out.initials.mgrSettings});
        // the site administrator: in F, then on Administration
        await signIn(page, 'admin');
        await page.goto(ctxUrl(app, t, '/user/profile', 'fr_CA'));
        await idle(page);
        out.initials.admin = await initialsMenu(page, 'admin').catch((err) => ({error: String(err).slice(0, 300)}));
        await snap(page, '10-initials-fr-admin', {menu: out.initials.admin});
        await page.goto(app.url('/index.php/index/fr_CA/admin'));
        await idle(page);
        out.initials.adminSite = await initialsMenu(page, 'admin').catch((err) => ({error: String(err).slice(0, 300)}));
        await snap(page, '10-initials-fr-admin-site', {menu: out.initials.adminSite});
        await page.goto(app.url('/index.php/index/en/admin'));
        await idle(page);

        // 11 the other end: one UI language
        await signIn(page, `${e}mgr`, {contextPath: e});
        await page.goto(ctxUrl(app, e, '/user/profile', 'en'));
        await idle(page);
        out.initials.englishOnly = await initialsMenu(page, `${e}mgr`).catch((err) => ({error: String(err).slice(0, 300)}));
        await snap(page, '11-initials-en-only', {menu: out.initials.englishOnly});
        await signOut(page);
    } finally {
        record('summary', out);
        log(app.name, JSON.stringify({headerFr: out.headerFr?.primary, mastheadPage: out.mastheadPage, mastheadRow: out.mastheadRow, initialsMgr: out.initials?.mgr?.blocks?.[0]}));
        await close();
    }
});
