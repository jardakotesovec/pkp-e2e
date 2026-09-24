// U08 claim check, chunk K4: who may do what, the editorial chrome, the cross-feature
// pointers (Purpose, Actors & permissions, Rules 27–31, register A1 and OPS1).
// Spec: docs/specs/U08-navigation-menus-and-site-chrome.md lines 1–46, 370–431,
// 520–628, register A1 (650–655), OPS1 (736–741); footnotes a, b, c, d, e, f, g, h,
// y, td15, td16, td17, td18, f-a1, f-ops1.
//
// Seeds per app (tag prefix u08k4; kept in k4-state-<app>.json, RESEED=1 to redo):
//   A   one account per permission level (manager, editor and production editor
//       [OJS/OMP], section editor, assistant, reviewer [OJS/OMP], author, reader,
//       subscription manager [OJS]), English and French UI, one submission
//   A2  a second context: the "two" author (also in A), a production editor without
//       "Permit changes to Settings" [OJS/OMP], the Site Administrator reduced to
//       Reader (on screen, phase adm), English only
//   C   announcements and public comments on (seeded), then changed on screen by its
//       manager: disable submissions, DOIs, payments [OJS OMP], site access
//   T1, T2  two contexts with the same name and one user enrolled in both (twin)
// Phases (PHASES=a,b to narrow; all by default, in this order; seed first on a fresh run):
//   seed      the contexts above (skipped while k4-state-<app>.json exists)
//   actors    per level on A: Profile side menu, the Settings address / Navigation tab,
//             the About page's "Edit", the public user menu; signed out (Actors rows 1-5)
//   pkside    td17 on publicknowledge per roster role; Administration as admin (Rule 30)
//   header    td15, A1, Rules 27-28: header per page, help pressed, Tasks window, initials
//             menu (Edit Profile, French and back, Logout), side-window strips, skip links
//   site      Administration's header and no side menu, the site's Navigation tab, a manager
//             at the site's addresses (Rule 27a, Actors row 2)
//   switcher  td16 (admin from each page; the "two" author; one-journal users); swextra more pages
//   twin      two journals with one name (Rule 29)
//   noroles   a user with no role in A2 (Actors rows 6, 8); noroles2 OPS "Make a Submission"
//   adm       the Site Administrator reduced to Reader in A2 on screen; adm2 its Navigation tab
//   imp       Login As, the initials menu while impersonating (Rule 28)
//   cond      Rule 30's "Only while": disable submissions, DOIs, payments, comments (OPS1)
//   leave     td18 by polling; leave2 by an observer from document start (Rule 31)
//   unsaved   Settings left with an unsaved change; the item and menu windows left
//   closed    restrict site access, then registration closed (Actors rows 3-4); put back
//   extra     site header in French, switcher from Administration, the site's "Add Menu",
//             highlights (Rule 30), the DOIs tab re-ticked with no prefix
//   rdnone    submissions disabled: a Reader's side menu (Actors row 8)
// Irreversible or site-level: adm (A2 only), nothing site-wide is changed.
// Run: PROBE_FEATURE=U08 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U08/K4/k4.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signOut, record, loc, note, idle, tag, outDir, shot} = require('../../../probe');
const L = require('./lib');
const {T, sleep, flat, rel, snap, as, edHeader, sideNav, navLine, openSwitcher, openInitials, publicUser, classify, go} = L;

const ALL = ['seed', 'actors', 'pkside', 'header', 'site', 'switcher', 'swextra', 'twin', 'noroles', 'noroles2', 'adm', 'adm2', 'imp', 'cond', 'leave', 'leave2', 'unsaved', 'closed', 'extra', 'rdnone'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);
const factsFile = (app) => path.join(outDir(), `k4-facts-${app.name}.json`);
const PK = 'publicknowledge';

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs';
    const isOmp = app.name === 'omp';
    const isOps = app.name === 'ops';
    const cUrl = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    // facts merge across runs (record() overwrites; screen-notes gotcha)
    const facts = fs.existsSync(factsFile(app)) ? JSON.parse(fs.readFileSync(factsFile(app), 'utf8')) : {};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[${app.name}] ${k} ${JSON.stringify(v).slice(0, 1500)}`);
        fs.writeFileSync(factsFile(app), JSON.stringify(facts, null, 1));
    };
    let st = fs.existsSync(stateFile(app)) && !process.env.RESEED ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;

    // ── seed ────────────────────────────────────────────────────────────────────
    if (on('seed') && !st) {
        const t = tag('u08k4');
        const P = (s) => `${t}${s}`;
        const U = {m: P('m'), s: P('s'), as: P('as'), au: P('au'), rd: P('rd'), two: P('two'), m2: P('m2'), cm: P('cm'), cs: P('cs'), tw: P('tw'), tm: P('tm')};
        const usersA = [
            {username: U.m, roles: ['manager'], givenName: 'Mona', familyName: 'K4Manager'},
            {username: U.s, roles: ['sectionEditor'], givenName: 'Sami', familyName: 'K4Section'},
            {username: U.as, roles: [isOps ? 'editorialBoardMember' : 'copyeditor'], givenName: 'Asa', familyName: 'K4Assistant'},
            {username: U.au, roles: ['author'], givenName: 'Ada', familyName: 'K4Author'},
            {username: U.rd, roles: ['reader'], givenName: 'Rhea', familyName: 'K4Reader'},
            {username: U.two, roles: ['author'], givenName: 'Tove', familyName: 'K4Two'},
        ];
        if (!isOps) {
            U.e = P('e'); U.pe = P('pe'); U.rv = P('rv');
            usersA.push({username: U.e, roles: ['editor'], givenName: 'Eda', familyName: 'K4Editor'});
            usersA.push({username: U.pe, roles: ['productionEditor'], givenName: 'Pia', familyName: 'K4Production'});
            usersA.push({username: U.rv, roles: ['externalReviewer'], givenName: 'Rev', familyName: 'K4Reviewer'});
        }
        if (isOjs) {
            U.sm = P('sm');
            usersA.push({username: U.sm, roles: ['subscriptionManager'], givenName: 'Sub', familyName: 'K4SubManager'});
        }
        const A = await app.api.createContext({tag: `${t}a`, context: {name: `U08 K4 A ${t}`, acronym: 'K4A', supportedLocales: ['en', 'fr_CA']}, users: usersA});
        const usersA2 = [
            {username: U.m2, roles: ['manager'], givenName: 'Max', familyName: 'K4A2Manager'},
            {username: U.two, roles: ['author']},
            {username: 'admin', roles: ['reader']},
        ];
        const specA2 = {tag: `${t}b`, context: {name: `U08 K4 A2 ${t}`, acronym: 'K4B'}, users: usersA2};
        if (!isOps) {
            U.pe2 = P('pe2');
            usersA2.push({username: U.pe2, roles: ['productionEditor'], givenName: 'Pat', familyName: 'K4NoSettings'});
            specA2.roles = {productionEditor: {permitSettings: false}};
        }
        const A2 = await app.api.createContext(specA2);
        const specC = {
            tag: `${t}c`, context: {name: `U08 K4 C ${t}`, acronym: 'K4C'},
            users: [
                {username: U.cm, roles: ['manager'], givenName: 'Cora', familyName: 'K4CManager'},
                {username: U.cs, roles: ['sectionEditor'], givenName: 'Cyd', familyName: 'K4CSection'},
            ],
            enableAnnouncements: true,
            enablePublicComments: true,
        };
        if (isOjs) { U.csm = P('csm'); specC.users.push({username: U.csm, roles: ['subscriptionManager'], givenName: 'Cas', familyName: 'K4CSubManager'}); }
        const C = await app.api.createContext(specC);
        const twinName = `U08 K4 Twin ${t}`;
        const T1 = await app.api.createContext({tag: `${t}t1`, context: {name: twinName, acronym: 'K4T'}, users: [{username: U.tw, roles: ['author'], givenName: 'Twin', familyName: 'K4Twin'}, {username: U.tm, roles: ['manager'], givenName: 'Tim', familyName: 'K4TwinManager'}]});
        const T2 = await app.api.createContext({tag: `${t}t2`, context: {name: twinName, acronym: 'K4T'}, users: [{username: U.tw, roles: ['author']}]});
        const sub = await app.api.createSubmission({tag: `${t}s1`, context: A.path, submitter: U.au, title: `K4 submitted ${t}`, participants: [{username: U.s, role: 'sectionEditor'}]});
        st = {t, U, A: A.path, A2: A2.path, C: C.path, T1: T1.path, T2: T2.path, twinName, sub: sub.submissionId || sub.id};
        fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 1));
        fact('seed', st);
    }
    if (!st && PHASES.some((p) => p !== 'seed')) throw new Error('no seed state: run PHASES=seed first');
    const U = st.U;

    const {page, context, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: rel(page.url())}); await d.accept().catch(() => {}); });
    try {
        // Roster per app on publicknowledge (td17)
        const pkRoster = isOps
            ? [['manager', 'manager.maya'], ['sectionEditor', 'sectioneditor.ana'], ['editorialBoardMember', 'assistant.rita'], ['author', 'author.alex'], ['reader', 'reader.rosa']]
            : [['manager', 'manager.maya'], ['editor', 'editor.diana'], ['sectionEditor', 'sectioneditor.ana'], ['copyeditor', 'copyeditor.carla'], ['funding', 'assistant.rita'], ['reviewer', 'reviewer.julia'], ['author', 'author.alex'], ['reader', 'reader.rosa']];
        const aRoster = [['admin', 'admin'], ['manager', U.m], ['editor', U.e], ['productionEditor', U.pe], ['sectionEditor', U.s], ['assistant', U.as], ['reviewer', U.rv], ['author', U.au], ['reader', U.rd], ['subscriptionManager', U.sm]].filter(([, u]) => u);

        // ── actors: settings access, the Navigation tab, side menu, "Edit", user menu ──
        if (on('actors')) {
            const rows = {};
            const who = [...aRoster, ['productionEditorNoSettings', U.pe2, st.A2]].filter(([, u]) => u);
            for (const [lvl, u, ctx0] of who) {
                const ctx = ctx0 || st.A;
                await as(page, u, ctx);
                const r = {};
                // the Profile page's side menu
                await go(page, cUrl(ctx, '/user/profile'));
                r.profileNav = navLine(await sideNav(page));
                r.header = await edHeader(page);
                await snap(page, `act-${lvl}-profile`, {nav: r.profileNav, header: r.header}, false);
                // the Settings address, the Navigation tab
                const resp = await go(page, cUrl(ctx, '/management/settings/website#setup/navigationMenus'));
                r.settings = await classify(page, resp && resp.status ? resp : null);
                r.navTable = await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
                r.navTabButton = await page.locator('#navigationMenus-button').count();
                r.settingsNav = navLine(await sideNav(page));
                await snap(page, `act-${lvl}-settings-website`, {settings: r.settings, navTable: r.navTable}, lvl === 'reader' || lvl === 'manager');
                // the grid's own fetch (the table's request, as the tab issues it) — read what the page shows only
                // the public "Edit" shortcut on the About page, and the user menu
                await go(page, cUrl(ctx, '/about'));
                r.edit = await page.locator('a.cmp_edit_link').evaluateAll((as) => as.map((a) => `${a.textContent.replace(/\s+/g, ' ').trim()}>${a.getAttribute('href')}`)).catch(() => []);
                r.userMenu = await publicUser(page);
                await snap(page, `act-${lvl}-about`, {edit: r.edit, user: r.userMenu}, false);
                rows[lvl] = r;
                fact(`actors-${lvl}`, {settings: r.settings, navTable: r.navTable, profileNav: r.profileNav, edit: r.edit, user: r.userMenu, switcher: r.header && r.header.switcher});
            }
            // signed out: the Settings address, the user menu
            await signOut(page).catch(() => {});
            const resp = await go(page, cUrl(st.A, '/management/settings/website'));
            fact('actors-signedout-settings', await classify(page, resp && resp.status ? resp : null));
            await snap(page, 'act-signedout-settings', {}, false);
            await go(page, cUrl(st.A, ''));
            fact('actors-signedout-user', await publicUser(page));
            await snap(page, 'act-signedout-home', {}, false);
        }

        // ── pkside: td17 on the seeded journal; Administration as the Site Administrator ──
        if (on('pkside')) {
            for (const [lvl, u] of pkRoster) {
                await as(page, u, PK);
                const landed = rel(page.url());
                await go(page, cUrl(PK, '/user/profile'));
                const nav = await sideNav(page);
                const h = await edHeader(page);
                await snap(page, `pk-${lvl}-profile`, {nav, header: h}, lvl === 'manager' || lvl === 'reader');
                fact(`pkside-${lvl}`, {landed, nav: navLine(nav), switcher: h && h.switcher, title: h && h.title});
            }
            await as(page, 'admin');
            await go(page, app.url('/index.php/index/admin'));
            const nav = await sideNav(page);
            const h = await edHeader(page);
            await snap(page, 'pk-admin-administration', {nav, header: h}, true);
            fact('pkside-admin-administration', {url: rel(page.url()), nav, header: h});
            await go(page, cUrl(PK, '/user/profile'));
            const nav2 = await sideNav(page);
            await snap(page, 'pk-admin-profile', {nav: nav2}, false);
            fact('pkside-admin-pk-profile', navLine(nav2));
        }

        // ── header: td15, A1, Rules 27–28 on the seeded journal ──────────────────────
        if (on('header')) {
            await as(page, 'manager.maya', PK);
            const pages = [['dashboard', '/dashboard/editorial'], ['settings', '/management/settings/website'], ['profile', '/user/profile'], ['stats', '/stats/publications/publications'], ['tools', '/management/tools'], ['submit', '/submission']];
            for (const [k, p] of pages) {
                await go(page, cUrl(PK, p));
                const h = await edHeader(page);
                await snap(page, `hd-mgr-${k}`, {header: h}, k === 'dashboard');
                fact(`header-mgr-${k}`, {url: rel(page.url()), header: h});
            }
            await go(page, cUrl(PK, '/dashboard/editorial'));
            await loc(page, 'editorial header: help link (accessible name ##common.help##)', page.getByRole('banner').getByRole('link', {name: '##common.help##'}));
            await loc(page, 'editorial header: journal name link', page.locator('header.app__header a.app__contextTitle'));
            await loc(page, 'editorial header: Tasks button', page.getByRole('banner').getByRole('button', {name: /^Tasks/}));
            await loc(page, 'editorial header: initials menu button', page.locator('[data-cy="app-user-nav"] button').first());
            fact('header-help-accessible', {byRole: await page.getByRole('banner').getByRole('link', {name: '##common.help##', exact: true}).count(), byHelp: await page.getByRole('banner').getByRole('link', {name: 'Help', exact: true}).count()});
            // press the help icon: a new tab?
            const popP = context.waitForEvent('page', {timeout: 8000}).catch(() => null);
            await page.getByRole('banner').getByRole('link', {name: '##common.help##'}).click().catch((e) => fact('help-click-error', String(e).slice(0, 200)));
            const pop = await popP;
            let popUrl = null;
            if (pop) { await pop.waitForLoadState('domcontentloaded', {timeout: 8000}).catch(() => {}); popUrl = pop.url(); await pop.close().catch(() => {}); }
            fact('header-help-press', {newTab: !!pop, popUrl, stillOn: rel(page.url())});
            // press the journal name
            await page.locator('header.app__header a.app__contextTitle').click();
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            fact('header-title-press', {url: rel(page.url()), title: await page.title()});
            await snap(page, 'hd-title-press', {}, false);
            // Tasks: what opens, and its strip
            await go(page, cUrl(PK, '/dashboard/editorial'));
            await page.getByRole('banner').getByRole('button', {name: /^Tasks/}).click();
            await sleep(1500); await idle(page);
            const tasksDlg = page.locator('[role="dialog"]:visible').last();
            const tasksStrip = await tasksDlg.evaluate((d) => { const s = d.querySelector('a[target="_blank"]'); const box = s ? s.closest('div.flex, div') : null; return {help: s ? {href: s.getAttribute('href'), sr: s.textContent.replace(/\s+/g, ' ').trim()} : null, top: d.innerText.split('\n').slice(0, 8)}; }).catch((e) => ({error: String(e).slice(0, 200)}));
            await snap(page, 'hd-tasks-window', {tasksStrip}, true);
            fact('header-tasks-window', tasksStrip);
            // the initials menu
            await go(page, cUrl(PK, '/dashboard/editorial'));
            const im = await openInitials(page);
            await snap(page, 'hd-initials-open', {im}, true);
            fact('initials-pk-mgr', im);
            // press "Edit Profile"
            await page.locator('[data-cy="app-user-nav"] nav a').filter({hasText: 'Edit Profile'}).first().click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            fact('initials-edit-profile-press', {url: rel(page.url()), title: await page.title()});
            // choose French
            await go(page, cUrl(PK, '/dashboard/editorial'));
            await openInitials(page);
            const fr = page.locator('[data-cy="app-user-nav"] nav a').filter({hasText: /fran/i}).first();
            fact('initials-french-link', {count: await fr.count(), href: await fr.getAttribute('href').catch(() => null)});
            await fr.click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await idle(page); await sleep(800);
            const hfr = await edHeader(page);
            await snap(page, 'hd-mgr-french', {header: hfr}, true);
            const imfr = await openInitials(page);
            fact('header-french', {url: rel(page.url()), lang: await page.evaluate(() => document.documentElement.lang), header: hfr, initials: imfr, nav: navLine(await sideNav(page))});
            await snap(page, 'hd-initials-french', {imfr}, false);
            // back to English through the same menu
            const en = page.locator('[data-cy="app-user-nav"] nav a').filter({hasText: /English/}).first();
            await en.click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            fact('initials-back-english', {url: rel(page.url()), lang: await page.evaluate(() => document.documentElement.lang)});
            // a side window: a menu's "Edit" on the Navigation tab (Vue) and "Add item" (legacy)
            await go(page, cUrl(PK, '/management/settings/website#setup/navigationMenus'));
            await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"] tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            dialogs.length = 0;
            await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]:visible').first().getByRole('link', {name: 'Primary Navigation Menu', exact: true}).first().click().catch((e) => fact('menu-window-click-error', String(e).slice(0, 200)));
            await page.locator('[data-cy="navigation-menu-editor"]:visible').first().waitFor({timeout: T}).catch(() => {});
            await sleep(800); await idle(page);
            const strip = async () => page.locator('[role="dialog"]:visible').last().evaluate((d) => {
                const help = d.querySelector('a[target="_blank"]');
                const initials = d.querySelector('[data-cy="app-user-nav"]');
                const tasks = [...d.querySelectorAll('button')].find((b) => /Tasks/.test(b.textContent));
                return {help: help ? {href: help.getAttribute('href'), sr: help.textContent.replace(/\s+/g, ' ').trim()} : null, tasks: !!tasks, initials: initials ? initials.innerText.replace(/\s+/g, ' ').trim() : null, first: d.innerText.split('\n').filter(Boolean).slice(0, 6)};
            }).catch((e) => ({error: String(e).slice(0, 200)}));
            const s1 = await strip();
            await snap(page, 'hd-sidewindow-menu', {strip: s1}, true);
            fact('strip-menu-window', s1);
            // its strip's help, Tasks and initials pressed
            const dlg = page.locator('[role="dialog"]:visible').last();
            const im2 = await dlg.locator('[data-cy="app-user-nav"] button').first().click().then(async () => { await sleep(500); return dlg.locator('[data-cy="app-user-nav"] nav').innerText().catch(() => null); }).catch((e) => 'error ' + String(e).slice(0, 100));
            fact('strip-initials-open', flat(im2));
            await page.keyboard.press('Escape').catch(() => {});
            await sleep(400);
            fact('dialogs-after-menu-window', dialogs.slice());
            await go(page, cUrl(PK, '/management/settings/website#setup/navigationMenus'));
            fact('dialogs-after-leaving-menu-window', dialogs.slice());
            await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().locator('xpath=ancestor::div[contains(@class,"pkp_controllers_grid")]').getByRole('link', {name: /Add item/i}).first().click().catch(() => {});
            await sleep(1500); await idle(page);
            const s2 = await strip();
            await snap(page, 'hd-sidewindow-legacy-item', {strip: s2}, true);
            fact('strip-legacy-item-window', s2);
            dialogs.length = 0;
            // skip links: the first Tab press
            await go(page, cUrl(PK, '/dashboard/editorial'));
            fact('dialogs-after-leaving-item-window', dialogs.slice());
            await page.locator('body').click({position: {x: 700, y: 500}}).catch(() => {});
            await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
            await go(page, cUrl(PK, '/dashboard/editorial'));
            await page.keyboard.press('Tab');
            await sleep(300);
            const focus1 = await page.evaluate(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); const box = e.parentElement.getBoundingClientRect(); return {tag: e.tagName, text: e.textContent.trim(), visible: r.width > 2 && r.height > 2, siblings: [...e.parentElement.children].map((c) => c.textContent.trim()), boxW: Math.round(box.width)}; });
            await shot(page, 'hd-skip-first-tab');
            await page.keyboard.press('Enter');
            await sleep(400);
            const afterMain = await page.evaluate(() => ({tag: document.activeElement.tagName, id: document.activeElement.id, cls: String(document.activeElement.className).slice(0, 60)}));
            await go(page, cUrl(PK, '/dashboard/editorial'));
            await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await sleep(300);
            const focus2 = await page.evaluate(() => ({text: document.activeElement.textContent.trim()}));
            await page.keyboard.press('Enter'); await sleep(400);
            const afterNav = await page.evaluate(() => ({tag: document.activeElement.tagName, id: document.activeElement.id, inNav: !!document.activeElement.closest('#app-nav'), label: document.activeElement.getAttribute('aria-label')}));
            fact('skip-links', {focus1, afterMain, focus2, afterNav});
            // Logout from the initials menu
            await go(page, cUrl(PK, '/dashboard/editorial'));
            await openInitials(page);
            await page.locator('[data-cy="app-user-nav"] nav a').filter({hasText: /^\s*Logout\s*$/}).first().click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await sleep(800);
            fact('initials-logout-press', {url: rel(page.url()), title: await page.title()});
            // a context with one UI language: no "Change Language"
            await as(page, U.m2, st.A2);
            await go(page, cUrl(st.A2, '/dashboard/editorial'));
            const im3 = await openInitials(page);
            await snap(page, 'hd-initials-one-language', {im3}, false);
            fact('initials-one-language', im3);
            // A1 in French on a scratch context too, and the Tasks strip in French
            await as(page, U.m, st.A);
            await go(page, cUrl(st.A, '/fr_CA/dashboard/editorial'));
            const hA = await edHeader(page);
            await snap(page, 'hd-A-french', {header: hA}, false);
            fact('header-A-french', {url: rel(page.url()), help: hA && hA.help, skip: hA && hA.skip, text: hA && hA.text});
        }

        // ── site: Administration's header, no side menu, the site's Navigation tab ──
        if (on('site')) {
            await as(page, 'admin');
            for (const [k, p] of [['admin', '/index.php/index/admin'], ['contexts', '/index.php/index/admin/contexts'], ['settings', '/index.php/index/admin/settings'], ['sysinfo', '/index.php/index/admin/systemInfo']]) {
                await go(page, app.url(p));
                const h = await edHeader(page);
                const nav = await sideNav(page);
                await snap(page, `site-${k}`, {header: h, nav}, k === 'admin' || k === 'settings');
                fact(`site-${k}`, {url: rel(page.url()), title: h && h.title, switcher: h && h.switcher, nav});
            }
            // the site's Navigation tab
            await go(page, app.url('/index.php/index/admin/settings'));
            await page.locator('#setup-button').first().click().catch(() => {}); await idle(page); await sleep(500);
            const sideTabs = await page.locator('[role="tabpanel"]:visible [role="tab"]').allInnerTexts().catch(() => []);
            const navBtn = await page.locator('#nav-button').count();
            await page.locator('#nav-button').click().catch(() => {}); await idle(page); await sleep(800);
            const grids = await page.locator('table[id^="component-grid-navigationmenus-"]:visible').count();
            await snap(page, 'site-navigation-tab', {sideTabs, navBtn, grids}, true);
            fact('site-navigation-tab', {sideTabs: sideTabs.map((s) => s.trim()), navBtn, grids});
            // the site name link pressed
            await page.locator('header.app__header a.app__contextTitle').click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            fact('site-title-press', {url: rel(page.url()), title: await page.title()});
            // a journal manager at the site's addresses
            await as(page, U.m, st.A);
            for (const [k, p] of [['admin', '/index.php/index/admin'], ['settings', '/index.php/index/admin/settings']]) {
                const resp = await go(page, app.url(p));
                const c = await classify(page, resp && resp.status ? resp : null);
                await snap(page, `site-mgr-${k}`, {c}, false);
                fact(`site-mgr-${k}`, c);
            }
        }

        // ── switcher: td16 ────────────────────────────────────────────────────────────
        if (on('switcher')) {
            await as(page, 'admin');
            // how many journals the site has (Hosted Journals)
            await go(page, app.url('/index.php/index/admin/contexts'));
            await sleep(800);
            const hosted = await page.locator('main').innerText().catch(() => '');
            const aName = `U08 K4 A ${st.t}`;
            const starts = [['settings-website', '/management/settings/website'], ['dashboard', '/dashboard/editorial'], ['profile', '/user/profile'], ['tools', '/management/tools'], ['stats', '/stats/publications/publications'], ['announcements', '/management/settings/announcements']];
            if (isOjs) starts.push(['issues', '/manageIssues']);
            for (const [k, p] of starts) {
                await go(page, cUrl(PK, p));
                const from = rel(page.url());
                const sw = await openSwitcher(page);
                if (k === 'settings-website') await snap(page, 'sw-admin-open', {sw: {n: sw.entries && sw.entries.length}}, true);
                const target = page.locator('header.app__header .app__contexts a').filter({hasText: aName}).first();
                const href = await target.getAttribute('href').catch(() => null);
                await target.click().catch(() => {});
                await page.waitForLoadState('load').catch(() => {}); await idle(page);
                const to = rel(page.url());
                await snap(page, `sw-admin-from-${k}`, {from, href}, false);
                fact(`switcher-admin-${k}`, {from, n: sw.entries && sw.entries.length, name: sw.name, hasA: (sw.entries || []).some((e) => e.text === aName), hasPk: (sw.entries || []).some((e) => /Public Knowledge/.test(e.text)), href: rel(href), to, title: await page.title()});
            }
            fact('switcher-admin-list', {hostedHasNames: (hosted.match(/U08 K4/g) || []).length, sample: (await (async () => { await go(page, cUrl(PK, '/dashboard/editorial')); const s = await openSwitcher(page); return s.entries.map((e) => e.text); })())});
            // (2) the "two" author, in A and A2
            await as(page, U.two, st.A);
            await go(page, cUrl(st.A, '/dashboard/mySubmissions'));
            const sw2 = await openSwitcher(page);
            await snap(page, 'sw-two-open', {sw2}, true);
            const t2 = page.locator('header.app__header .app__contexts a').first();
            const href2 = await t2.getAttribute('href').catch(() => null);
            await t2.click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            await snap(page, 'sw-two-chosen', {}, false);
            fact('switcher-two', {list: sw2, href: rel(href2), to: rel(page.url()), title: await page.title()});
            // from the Profile page
            await go(page, cUrl(st.A, '/user/profile'));
            const sw3 = await openSwitcher(page);
            const href3 = await page.locator('header.app__header .app__contexts a').first().getAttribute('href').catch(() => null);
            fact('switcher-two-from-profile', {n: sw3.entries && sw3.entries.length, href: rel(href3)});
            // a user with one journal: no switcher
            await as(page, U.m, st.A);
            await go(page, cUrl(st.A, '/dashboard/editorial'));
            const sw4 = await openSwitcher(page);
            fact('switcher-one-journal', sw4);
            // a section editor of publicknowledge who is nowhere else
            await as(page, 'sectioneditor.ana', PK);
            await go(page, cUrl(PK, '/dashboard/editorial'));
            fact('switcher-pk-sectioneditor', await openSwitcher(page));
        }

        // ── twin: two journals with the same name ─────────────────────────────────────
        if (on('twin')) {
            await as(page, U.tw, st.T1);
            await go(page, cUrl(st.T1, '/dashboard/mySubmissions'));
            const sw = await openSwitcher(page);
            await snap(page, 'twin-author-open', {sw}, true);
            fact('twin-author', {url: rel(page.url()), sw});
            await as(page, 'admin');
            await go(page, cUrl(st.T1, '/dashboard/editorial'));
            const swa = await openSwitcher(page);
            fact('twin-admin', {n: swa.entries.length, twins: swa.entries.filter((e) => e.text === st.twinName).map((e) => rel(e.href))});
            await go(page, cUrl(PK, '/dashboard/editorial'));
            const swb = await openSwitcher(page);
            fact('twin-admin-from-pk', {twins: swb.entries.filter((e) => e.text === st.twinName).map((e) => rel(e.href))});
        }

        // ── noroles: a user with no role in the journal ──────────────────────────────
        if (on('noroles')) {
            await as(page, U.rd, st.A);
            for (const [k, p] of [['profile', '/user/profile'], ['dashboard', '/dashboard/editorial'], ['mysubs', '/dashboard/mySubmissions'], ['submit', '/submission'], ['settings', '/management/settings/website']]) {
                const resp = await go(page, cUrl(st.A2, p));
                const c = await classify(page, resp && resp.status ? resp : null);
                const h = await edHeader(page);
                const nav = await sideNav(page);
                await snap(page, `noroles-${k}`, {c, header: h, nav}, k === 'profile');
                fact(`noroles-${k}`, {c, header: h && {title: h.title, help: !!h.help, tasks: !!h.tasks, initials: !!h.initials, switcher: h.switcher}, nav: navLine(nav)});
            }
            // the seeded Author on a scratch journal's Profile page
            await as(page, 'author.alex', PK);
            await go(page, cUrl(st.A, '/user/profile'));
            const h = await edHeader(page);
            fact('noroles-pkauthor-on-A', {url: rel(page.url()), header: h && {title: h.title, tasks: h.tasks, switcher: h.switcher}, nav: navLine(await sideNav(page))});
            await snap(page, 'noroles-pkauthor-on-A', {}, false);
        }

        // ── adm: the Site Administrator reduced to Reader in A2 ───────────────────────
        if (on('adm')) {
            await as(page, U.m2, st.A2);
            await go(page, cUrl(st.A2, '/management/settings/access'));
            await sleep(800);
            const row = page.locator('tr').filter({hasText: 'admin@mail.test'}).first();
            await row.waitFor({timeout: T}).catch(() => {});
            await row.locator('button').last().click().catch(() => {}); await sleep(500);
            await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 30000}).catch(() => {});
            await idle(page); await sleep(800);
            await snap(page, 'adm-user-edit', {}, false);
            const mgrRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
            let removed = null;
            if (await mgrRow.count()) {
                await mgrRow.getByRole('button', {name: /Remove Role/i}).click(); await sleep(600);
                const d = page.locator('[role="dialog"]:visible').last();
                const w = page.waitForResponse((r) => r.request().method() !== 'GET' && /\/api\/v1\//.test(r.url()), {timeout: T}).catch(() => null);
                await d.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
                const r = await w; await idle(page); await sleep(800);
                removed = r ? r.status() : 'no response';
            }
            const roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            await snap(page, 'adm-user-edit-after', {roleRows}, false);
            fact('adm-remove', {removed, roleRows});
            await as(page, 'admin');
            for (const [k, p] of [['profile', '/user/profile'], ['dashboard', '/dashboard/editorial'], ['settings', '/management/settings/website']]) {
                const resp = await go(page, cUrl(st.A2, p));
                const c = await classify(page, resp && resp.status ? resp : null);
                const nav = await sideNav(page);
                await snap(page, `adm-${k}`, {c, nav}, k === 'profile');
                fact(`adm-${k}`, {c: {url: c.url, denied: c.denied, title: c.title}, nav: navLine(nav)});
            }
            await go(page, cUrl(st.A2, '/about'));
            const edit = await page.locator('a.cmp_edit_link').count();
            await snap(page, 'adm-about', {edit}, false);
            fact('adm-edit-shortcut', {edit});
        }

        // ── adm2: the Site Administrator (Reader alone in A2) on A2's Navigation tab ──
        if (on('adm2')) {
            await as(page, 'admin');
            const resp = await go(page, cUrl(st.A2, '/management/settings/website#setup/navigationMenus'));
            const c = await classify(page, resp && resp.status ? resp : null);
            const table = await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]').first().waitFor({timeout: 10000}).then(() => true).catch(() => false);
            const rows = table ? await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"] tr.gridRow').count() : 0;
            const dlg = flat(await page.locator('[role="dialog"]:visible').first().innerText().catch(() => ''), 200);
            await snap(page, 'adm2-navigation-tab', {c, table, rows, dlg}, true);
            fact('adm2-navigation-tab', {url: c.url, table, rows, dialog: dlg});
        }

        // ── rdnone: submissions disabled: a Reader's side menu (Actors row 8) ─────────
        if (on('rdnone')) {
            const toggle = async (on_) => {
                await as(page, U.m, st.A);
                await go(page, cUrl(st.A, '/management/settings/workflow'));
                await page.locator('[id="submission-button"]').first().click().catch(() => {}); await idle(page); await sleep(500);
                const box = page.locator('input[name="disableSubmissions"]').first();
                if (!(await box.isVisible().catch(() => false))) { await page.locator('[role="tabpanel"]:visible [role="tab"]').filter({hasText: /Disable Submissions/}).first().click().catch(() => {}); await sleep(400); }
                if (on_) await box.check({force: true}).catch(() => {}); else await box.uncheck({force: true}).catch(() => {});
                const w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await page.locator('form').filter({has: box}).first().getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
                const r = await w; return r ? r.status() : null;
            };
            const s1 = await toggle(true);
            await as(page, U.rd, st.A);
            await go(page, cUrl(st.A, '/user/profile'));
            const nav = await sideNav(page);
            const navEl = await page.locator('nav#app-nav').count();
            await snap(page, 'rdnone-reader-profile', {nav, navEl}, true);
            const s2 = await toggle(false);
            fact('rdnone', {s1, s2, nav, navEl});
        }

        // ── imp: the initials menu while logged in as another user (Rule 28) ─────────
        if (on('imp')) {
            await as(page, 'admin');
            await go(page, cUrl(st.A, '/management/settings/access'));
            await sleep(800);
            const row = page.locator('tr').filter({hasText: 'K4Author'}).first();
            await row.waitFor({timeout: T}).catch(() => {});
            await row.locator('button').last().click().catch(() => {}); await sleep(500);
            await page.getByRole('menuitem', {name: /Login As/i}).first().click().catch(() => {});
            await sleep(600);
            const d = page.getByRole('dialog').filter({hasText: /Log in as/}).last();
            await d.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await sleep(1500); await idle(page);
            fact('imp-landed', rel(page.url()));
            await go(page, cUrl(st.A, '/dashboard/mySubmissions'));
            const h = await edHeader(page);
            const im = await openInitials(page);
            await snap(page, 'imp-initials', {header: h, im}, true);
            fact('imp-initials', {header: h && h.initials, im});
            const logoutAs = page.locator('[data-cy="app-user-nav"] nav a').filter({hasText: /Logout as/}).last();
            await logoutAs.click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await sleep(1000); await idle(page);
            fact('imp-after-logout-as', {url: rel(page.url()), header: (await edHeader(page) || {}).initials});
            await snap(page, 'imp-after', {}, false);
        }

        // ── noroles2: a user with no role opens "Make a Submission" (OPS gave a side menu) ──
        if (on('noroles2')) {
            await as(page, U.s, st.A);
            const read = async (k, p) => {
                const resp = await go(page, cUrl(st.A2, p));
                const c = await classify(page, resp && resp.status ? resp : null);
                const nav = navLine(await sideNav(page));
                await snap(page, `noroles2-${k}`, {c, nav}, false);
                return {url: c.url, denied: c.denied, nav};
            };
            const before = await read('profile-before', '/user/profile');
            const submit = await read('submit', '/submission');
            const after = await read('profile-after', '/user/profile');
            // the Roles tab of the Profile page
            await page.getByRole('tab', {name: 'Roles', exact: true}).click().catch(() => {});
            await sleep(800);
            const roles = flat(await page.locator('[role="tabpanel"]:visible').first().innerText().catch(() => ''), 600);
            await snap(page, 'noroles2-profile-roles', {roles}, true);
            const home = await go(page, cUrl(st.A2, ''));
            const user = await publicUser(page);
            fact('noroles2', {before, submit, after, roles, user});
        }

        // ── swextra: the switcher from DOIs, Institutions, Payments [OJS], Announcements ──
        if (on('swextra')) {
            await as(page, 'admin');
            const aName = `U08 K4 A ${st.t}`;
            const starts = [['dois', '/dois'], ['institutions', '/management/settings/institutions'], ['comments', '/management/settings/userComments'], ['submit', '/submission']];
            if (isOjs) starts.push(['payments', '/payments']);
            if (isOmp) starts.push(['catalog', '/manageCatalog']);
            for (const [k, p] of starts) {
                await go(page, cUrl(PK, p));
                const from = rel(page.url());
                await openSwitcher(page);
                const target = page.locator('header.app__header .app__contexts a').filter({hasText: aName}).first();
                const href = await target.getAttribute('href').catch(() => null);
                fact(`swextra-${k}`, {from, href: rel(href)});
            }
        }

        // ── cond: Rule 30's "Only while" column, OPS1 ─────────────────────────────────
        if (on('cond')) {
            const readSide = async (u, k) => {
                await as(page, u, st.C);
                await go(page, cUrl(st.C, '/user/profile'));
                const nav = await sideNav(page);
                await snap(page, `cond-${k}`, {nav}, false);
                return navLine(nav);
            };
            const who = [['manager', U.cm], ['sectionEditor', U.cs], ['admin', 'admin']];
            if (U.csm) who.push(['subscriptionManager', U.csm]);
            const readAll = async (k) => { const o = {}; for (const [l, u] of who) o[l] = await readSide(u, `${k}-${l}`); fact(`cond-${k}`, o); return o; };
            await readAll('0-ann-comments-on');
            // disable submissions on, then off
            const openWf = async () => {
                await as(page, U.cm, st.C);
                await go(page, cUrl(st.C, '/management/settings/workflow'));
                await page.locator('[id="submission-button"]').first().click().catch(() => {}); await idle(page); await sleep(500);
                const tab = page.locator('[role="tabpanel"]:visible [role="tab"]').filter({hasText: /Disable|Accept|Submissions/i}).first();
                const tabs = await page.locator('[role="tabpanel"]:visible [role="tab"]').allInnerTexts().catch(() => []);
                const ctl0 = page.locator('input[name="disableSubmissions"]').first();
                if (!(await ctl0.isVisible().catch(() => false)) && (await tab.count())) { await tab.click(); await idle(page); await sleep(400); }
                return tabs;
            };
            const saveBox = async (sel) => {
                const form = page.locator('form').filter({has: page.locator(sel)}).first();
                const w = page.waitForResponse((r) => /\/api\/v1\/(contexts|site)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await form.getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
                const r = await w;
                const saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
                return {status: r ? r.status() : null, saved};
            };
            let tabs = await openWf();
            const ctl = page.locator('input[name="disableSubmissions"]').first();
            const lbl = await ctl.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            await ctl.check({force: true}).catch(() => {});
            const s1 = await saveBox('input[name="disableSubmissions"]');
            fact('cond-disable-save', {tabs, lbl, s1});
            await readAll('1-submissions-disabled');
            await openWf();
            await page.locator('input[name="disableSubmissions"]').first().uncheck({force: true}).catch(() => {});
            fact('cond-enable-save', await saveBox('input[name="disableSubmissions"]'));
            // DOIs off
            const openDois = async () => {
                await as(page, U.cm, st.C);
                await go(page, cUrl(st.C, '/management/settings/distribution'));
                await page.locator('[id="dois-button"]').first().click().catch(() => {}); await idle(page); await sleep(600);
            };
            await openDois();
            const doiOn = await page.locator('input[name="enableDois"]').first().isChecked().catch(() => null);
            const types = await page.locator('input[name="enabledDoiTypes"]').evaluateAll((els) => els.map((e) => `${e.value}:${e.checked}`)).catch(() => []);
            await snap(page, 'cond-dois-tab', {doiOn, types}, false);
            await page.locator('input[name="enableDois"]').first().uncheck({force: true}).catch(() => {});
            fact('cond-dois-off-save', {doiOn, types, save: await saveBox('input[name="enableDois"]')});
            await readAll('2-dois-off');
            await openDois();
            await page.locator('input[name="enableDois"]').first().check({force: true}).catch(() => {}); await sleep(500);
            fact('cond-dois-on-save', await saveBox('input[name="enableDois"]'));
            // payments
            await as(page, U.cm, st.C);
            await go(page, cUrl(st.C, '/management/settings/distribution'));
            const payTab = await page.locator('[id="payments-button"]').count();
            fact('cond-payments-tab', payTab);
            if (payTab) {
                await page.locator('[id="payments-button"]').first().click(); await idle(page); await sleep(600);
                await page.locator('input[name="paymentsEnabled"]').first().check({force: true}).catch(() => {});
                await sleep(400);
                await page.locator('select[name="currency"]').first().selectOption({label: 'US Dollar'}).catch(() => {});
                await page.locator('select[name="paymentPluginName"]').first().selectOption({label: 'Manual Fee Payment'}).catch(() => {});
                await sleep(700);
                const instr = page.locator('textarea[name*="manualInstructions"], input[name*="manualInstructions"]').first();
                if (await instr.count()) await instr.fill('K4 manual payment instructions').catch(() => {});
                const s = await saveBox('input[name="paymentsEnabled"]');
                await snap(page, 'cond-payments-saved', {s}, true);
                fact('cond-payments-save', s);
                await readAll('3-payments-on');
            }
            // comments off: the "Content" group (OPS1)
            await as(page, U.cm, st.C);
            await go(page, cUrl(st.C, '/management/settings/website'));
            await page.locator('[id="content-button"]').first().click().catch(() => {}); await idle(page); await sleep(500);
            const cTab = page.locator('[role="tabpanel"]:visible [role="tab"]').filter({hasText: /Comments/}).first();
            if (await cTab.count()) { await cTab.click(); await idle(page); await sleep(400); }
            const box = page.locator('input[name="enablePublicComments"]').first();
            const cOn = await box.isChecked().catch(() => null);
            await box.uncheck({force: true}).catch(() => {});
            const form = page.locator('form').filter({has: box}).first();
            await form.getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await sleep(4000); await idle(page);
            fact('cond-comments-off', {wasOn: cOn});
            await readAll('4-comments-off');
            // announcements: A has them off (actors phase), C on (step 0)
        }

        // ── leave: td18, the notice area while an editorial page is left ─────────────
        if (on('leave')) {
            await as(page, U.m, st.A);
            const cdp = await context.newCDPSession(page);
            const runs = [];
            for (const [k, fromPath, press] of [
                ['workflow-closed-side', `/dashboard/editorial?workflowSubmissionId=${st.sub}`, 'side'],
                ['workflow-closed-title', `/dashboard/editorial?workflowSubmissionId=${st.sub}`, 'title'],
                ['workflow-open-address', `/dashboard/editorial?workflowSubmissionId=${st.sub}`, 'address'],
                ['settings-side', '/management/settings/website', 'side'],
            ]) {
                await go(page, cUrl(st.A, fromPath));
                await sleep(1500); await idle(page);
                if (/workflow-closed/.test(k)) {
                    // the workflow window covers the side menu and header: close it first, as a person must
                    const wf = page.getByRole('dialog').first();
                    await wf.getByRole('button', {name: 'Close', exact: true}).first().click({timeout: 8000}).catch((e) => fact(`leave-${k}-close-error`, String(e).slice(0, 160)));
                    await sleep(800);
                }
                await snap(page, `leave-${k}-before`, {}, false);
                await cdp.send('Emulation.setCPUThrottlingRate', {rate: 6}).catch(() => {});
                const samples = [];
                let stop = false;
                const poll = (async () => {
                    const t0 = Date.now();
                    let i = 0;
                    while (!stop && Date.now() - t0 < 6000) {
                        const s = await page.evaluate(() => {
                            const n = document.querySelector('.app__notifications');
                            const app = document.getElementById('app');
                            const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
                            const body = document.body ? document.body.innerText : '';
                            return {url: location.pathname + location.search, ready: document.readyState, notice: n ? n.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : null, noticeVisible: vis(n), appVisible: vis(app), rawInBodyText: body.includes('{{')};
                        }).catch((e) => ({err: String(e).slice(0, 60)}));
                        s.t = Date.now() - t0;
                        if (i % 3 === 0) {
                            const buf = await page.screenshot({clip: {x: 700, y: 0, width: 580, height: 200}, timeout: 2000}).catch(() => null);
                            if (buf && s.notice && s.notice.includes('{{')) { fs.writeFileSync(path.join(outDir(), `leave-${k}-${i}-${app.name}.png`), buf); s.shot = `leave-${k}-${i}`; }
                        }
                        samples.push(s);
                        i++;
                        await sleep(50);
                    }
                })();
                if (press === 'side') {
                    // the side menu entry "Tools" (a manager's), pressed as a person would
                    const tools = page.locator('nav#app-nav').getByRole('button', {name: 'Tools'}).first();
                    const toolsLink = page.locator('nav#app-nav a').filter({hasText: /^\s*Tools\s*$/}).first();
                    await (await tools.count() ? tools : toolsLink).click({timeout: 8000}).catch((e) => samples.push({clickError: String(e).slice(0, 160)}));
                } else if (press === 'address') {
                    // an address typed while the workflow window is open
                    await page.goto(cUrl(st.A, '/management/tools'), {waitUntil: 'commit'}).catch((e) => samples.push({clickError: String(e).slice(0, 160)}));
                } else {
                    await page.locator('header.app__header a.app__contextTitle').click({timeout: 8000}).catch((e) => samples.push({clickError: String(e).slice(0, 160)}));
                }
                await page.waitForLoadState('load').catch(() => {});
                await sleep(1500);
                stop = true;
                await poll;
                await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1}).catch(() => {});
                const raw = samples.filter((s) => s.notice && s.notice.includes('{{'));
                runs.push({k, landed: rel(page.url()), samples: samples.length, rawSamples: raw.length, rawVisible: raw.filter((s) => s.noticeVisible && s.appVisible).length, firstRaw: raw[0] || null, clickError: (samples.find((s) => s.clickError) || {}).clickError || null, shots: raw.filter((s) => s.shot).map((s) => s.shot).slice(0, 5)});
                record(`leave-${k}-samples`, samples);
                fact(`leave-${k}`, runs[runs.length - 1]);
            }
        }

        // ── leave2: td18 from inside the arriving page: an observer from document start
        //    logs the notice area's text and whether it can be seen, until the app mounts ──
        if (on('leave2')) {
            await as(page, U.m, st.A);
            await context.addInitScript(() => {
                const log = [];
                const t0 = performance.now();
                const read = (why) => {
                    const n = document.querySelector('.app__notifications');
                    const app = document.getElementById('app');
                    if (!n) return;
                    const cs = app ? getComputedStyle(app) : null;
                    const r = n.getBoundingClientRect();
                    log.push({why, t: Math.round(performance.now() - t0), text: n.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), appDisplay: cs ? cs.display : null, cloak: app ? app.hasAttribute('v-cloak') : null, w: Math.round(r.width), h: Math.round(r.height)});
                    try { sessionStorage.setItem('k4log:' + location.pathname, JSON.stringify(log.slice(0, 40))); } catch (e) { /* ignore */ }
                };
                new MutationObserver(() => read('mutation')).observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: ['v-cloak']});
                document.addEventListener('DOMContentLoaded', () => read('dcl'));
                window.addEventListener('load', () => read('load'));
            });
            const out = {};
            for (const [k, target] of [['to-tools', '/management/tools'], ['to-dashboard', '/dashboard/editorial'], ['to-settings', '/management/settings/website']]) {
                await go(page, cUrl(st.A, `/dashboard/editorial?workflowSubmissionId=${st.sub}`));
                await sleep(1000);
                await page.goto(cUrl(st.A, target)).catch(() => {});
                await idle(page).catch(() => {});
                const log = await page.evaluate(() => { const o = {}; for (let i = 0; i < sessionStorage.length; i++) { const key = sessionStorage.key(i); if (key.startsWith('k4log:')) o[key] = JSON.parse(sessionStorage.getItem(key)); } return o; });
                const entries = Object.values(log).flat();
                out[k] = {n: entries.length, raw: entries.filter((e) => e.text.includes('{{')).map((e) => `${e.why}@${e.t} display=${e.appDisplay} cloak=${e.cloak} ${e.w}x${e.h}`).slice(0, 6), lastText: entries.length ? entries[entries.length - 1].text : null};
                await page.evaluate(() => sessionStorage.clear());
            }
            fact('leave2', out);
        }

        // ── extra: the site header in French, the switcher from Administration, hosted
        //    journals vs the list, highlights, the DOIs tab re-ticked, the site's "Add Menu" ──
        if (on('extra')) {
            await as(page, 'admin');
            await go(page, app.url('/index.php/index/fr_CA/admin'));
            const hfr = await edHeader(page);
            await snap(page, 'ex-site-french', {header: hfr}, false);
            fact('ex-site-french', {url: rel(page.url()), title: hfr && hfr.title, help: hfr && hfr.help && hfr.help.sr, switcher: hfr && hfr.switcher});
            await go(page, app.url('/index.php/index/en/admin/contexts'));
            await sleep(1000);
            const hosted = await page.locator('main').innerText().catch(() => '');
            const m = hosted.match(/of (\d+)/g);
            const sw = await openSwitcher(page);
            const aName = `U08 K4 A ${st.t}`;
            const target = page.locator('header.app__header .app__contexts a').filter({hasText: aName}).first();
            const href = await target.getAttribute('href').catch(() => null);
            await target.click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            fact('ex-switcher-from-admin', {hostedCounts: m, listed: sw.entries.length, href: rel(href), to: rel(page.url())});
            // the site's "Add Menu" (K1-4, read only: the page is reloaded after)
            const errs = [];
            const onC = (msg) => { if (msg.type() === 'error') errs.push(msg.text().slice(0, 160)); };
            page.on('console', onC);
            await go(page, app.url('/index.php/index/en/admin/settings'));
            await page.locator('#setup-button').first().click().catch(() => {}); await idle(page); await sleep(400);
            await page.locator('#nav-button').click().catch(() => {}); await idle(page); await sleep(800);
            await page.getByRole('link', {name: 'Add Menu', exact: true}).first().click().catch(() => {});
            await sleep(2500);
            const opened = await page.locator('[data-cy="navigation-menu-editor"]:visible').count();
            await snap(page, 'ex-site-add-menu', {opened, errs}, true);
            page.off('console', onC);
            fact('ex-site-add-menu', {opened, errs});
            await go(page, app.url('/index.php/index/en/admin'));
            // highlights as the scratch manager
            await as(page, U.cm, st.C);
            const hl = {};
            for (const [k, p] of [['tools', '/management/tools'], ['stats', '/stats/publications/publications'], ['website', '/management/settings/website'], ['access', '/management/settings/access'], ['announcements', '/management/settings/announcements'], ['submission', '/submission'], ['dashboard', '/dashboard/editorial'], ['profile', '/user/profile']]) {
                await go(page, cUrl(st.C, p));
                hl[k] = navLine(await sideNav(page)).filter((l) => /\*|\(open\)/.test(l));
            }
            await snap(page, 'ex-highlight-profile', {}, false);
            fact('ex-highlights', hl);
            // the DOIs tab: the box ticked again with no prefix
            await go(page, cUrl(st.C, '/management/settings/distribution'));
            await page.locator('[id="dois-button"]').first().click().catch(() => {}); await idle(page); await sleep(600);
            const on0 = await page.locator('input[name="enableDois"]').first().isChecked().catch(() => null);
            if (!on0) {
                await page.locator('input[name="enableDois"]').first().check({force: true}).catch(() => {}); await sleep(500);
                const form = page.locator('form').filter({has: page.locator('input[name="enableDois"]')}).first();
                const w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await form.getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
                const r = await w; await sleep(1500);
                const errors = await page.locator('.pkpFieldError, .pkpFormPage__errors, [role="alert"]').allInnerTexts().catch(() => []);
                const statuses = await page.locator('[role="status"]').allInnerTexts().catch(() => []);
                await snap(page, 'ex-dois-retick', {errors}, true);
                fact('ex-dois-retick', {status: r ? r.status() : null, errors: errors.map((e) => flat(e, 200)), statuses: statuses.map((e) => flat(e, 80)).filter(Boolean)});
            } else {
                fact('ex-dois-retick', {already: true});
            }
        }

        // ── unsaved: a Settings tab left with an unsaved change ───────────────────────
        if (on('unsaved')) {
            await as(page, U.m, st.A);
            const out = {};
            // 1: Settings › Journal › Masthead: change the name, then press the side menu's "Website"
            await go(page, cUrl(st.A, '/management/settings/context'));
            await sleep(800);
            const name = page.locator('input[name="name-en"], input[id*="name-control-en"]').first();
            out.nameBox = await name.count();
            await name.fill(`U08 K4 A ${st.t} CHANGED`).catch(() => {});
            dialogs.length = 0;
            await page.locator('nav#app-nav a').filter({hasText: /^\s*Website\s*$/}).first().click({timeout: 8000}).catch(async () => {
                await page.locator('nav#app-nav').getByRole('button', {name: 'Settings'}).first().click().catch(() => {});
                await sleep(400);
                await page.locator('nav#app-nav a').filter({hasText: /^\s*Website\s*$/}).first().click().catch(() => {});
            });
            await page.waitForLoadState('load').catch(() => {}); await sleep(1200);
            out.sideLeave = {url: rel(page.url()), dialogs: dialogs.slice()};
            await snap(page, 'unsaved-after-side', {}, false);
            // did the change stick? (it must not)
            await go(page, cUrl(st.A, ''));
            out.publicName = await page.locator('.pkp_site_name a').innerText().catch(() => null);
            // 2: Settings › Website › Setup › Information changed, then another tab, then the header's name
            await go(page, cUrl(st.A, '/management/settings/website'));
            await page.locator('#setup-button').first().click().catch(() => {}); await idle(page); await sleep(500);
            const info = page.getByRole('tab', {name: 'Information', exact: true}).filter({visible: true}).first();
            await info.click().catch(() => {}); await idle(page); await sleep(800);
            const fid = await page.evaluate(() => (window.tinymce ? window.tinymce.get().map((e) => e.id).find((i) => /readerInformation/.test(i) && /-en$/.test(i)) : null)).catch(() => null);
            if (fid) {
                await page.frameLocator(`[id="${fid}_ifr"]`).locator('body').click().catch(() => {});
                await page.keyboard.type(' K4 unsaved');
            }
            out.infoEditor = fid;
            dialogs.length = 0;
            await page.getByRole('tab', {name: 'Navigation', exact: true}).filter({visible: true}).first().click().catch(() => {});
            await sleep(800);
            out.tabSwitch = {dialogs: dialogs.slice(), url: rel(page.url())};
            await snap(page, 'unsaved-tab-switch', {}, false);
            dialogs.length = 0;
            await page.locator('header.app__header a.app__contextTitle').click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await sleep(1200);
            out.titleLeave = {url: rel(page.url()), dialogs: dialogs.slice()};
            // 3: the Navigation tab: "Add item" opened and closed, then the page left
            await go(page, cUrl(st.A, '/management/settings/website#setup/navigationMenus'));
            await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            dialogs.length = 0;
            await go(page, cUrl(st.A, '/dashboard/editorial'));
            out.navTabUntouched = dialogs.slice();
            for (const closeHow of ['close', 'open']) {
                await go(page, cUrl(st.A, '/management/settings/website#setup/navigationMenus'));
                await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor({timeout: T}).catch(() => {});
                await idle(page);
                await page.getByRole('link', {name: 'Add item', exact: true}).click().catch(() => {});
                await page.locator('form#navigationMenuItemsForm select[name="menuItemType"]').waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(500);
                if (closeHow === 'close') {
                    await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
                    await sleep(800);
                }
                dialogs.length = 0;
                await go(page, cUrl(st.A, '/dashboard/editorial'));
                out[`itemWindow-${closeHow}`] = dialogs.slice();
            }
            // the same for the Vue menu window opened and closed
            await go(page, cUrl(st.A, '/management/settings/website#setup/navigationMenus'));
            await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]:visible').first().getByRole('link', {name: 'Primary Navigation Menu', exact: true}).first().click().catch(() => {});
            await page.locator('[data-cy="navigation-menu-editor"]:visible').first().waitFor({timeout: T}).catch(() => {});
            await sleep(600);
            await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(800);
            dialogs.length = 0;
            await go(page, cUrl(st.A, '/dashboard/editorial'));
            out.menuWindowClosed = dialogs.slice();
            fact('unsaved', out);
        }

        // ── closed: a journal closed to signed-out visitors (Actors row 3) ───────────
        if (on('closed')) {
            await as(page, U.cm, st.C);
            await go(page, cUrl(st.C, '/management/settings/access'));
            await sleep(800);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click().catch(() => {}); await idle(page); await sleep(500);
            const box = page.locator('input[name="restrictSiteAccess"]').first();
            const lbl = await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            await box.check({force: true}).catch(() => {});
            const form = page.locator('form').filter({has: box}).first();
            const w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
            const r = await w;
            await snap(page, 'closed-access-saved', {lbl}, false);
            await signOut(page).catch(() => {});
            const out = {lbl, save: r ? r.status() : null};
            for (const [k, p] of [['home', ''], ['about', '/about'], ['search', '/search']]) {
                await go(page, cUrl(st.C, p));
                out[k] = {url: rel(page.url()), primary: await page.locator('#navigationPrimary > li > a').allInnerTexts().catch(() => []), user: await publicUser(page), footer: await page.locator('.pkp_brand_footer, .pkp_footer_content').count(), crumbs: flat(await page.locator('.cmp_breadcrumbs').innerText().catch(() => null), 100)};
                await snap(page, `closed-signedout-${k}`, {}, k === 'home');
            }
            fact('closed', out);
            // registration closed too: "Register" leaves the user menu (Actors row 4)
            await as(page, U.cm, st.C);
            await go(page, cUrl(st.C, '/management/settings/access'));
            await sleep(800);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click().catch(() => {}); await idle(page); await sleep(500);
            await page.locator('input[name="restrictSiteAccess"]').first().uncheck({force: true}).catch(() => {});
            await page.locator('input[name="disableUserReg"][value="true"]').first().check({force: true}).catch(() => {});
            const w2 = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await page.locator('form').filter({has: page.locator('input[name="disableUserReg"]')}).first().getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
            const r2 = await w2;
            await signOut(page).catch(() => {});
            await go(page, cUrl(st.C, ''));
            fact('closed-registration', {save: r2 ? r2.status() : null, url: rel(page.url()), user: await publicUser(page)});
            await snap(page, 'closed-registration-home', {}, false);
            await as(page, U.cm, st.C);
            await go(page, cUrl(st.C, '/management/settings/access'));
            await sleep(800);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click().catch(() => {}); await idle(page); await sleep(500);
            await page.locator('input[name="disableUserReg"][value="false"]').first().check({force: true}).catch(() => {});
            await page.locator('form').filter({has: page.locator('input[name="disableUserReg"]')}).first().getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
            await sleep(1500);
            // put it back
            await as(page, U.cm, st.C);
            await go(page, cUrl(st.C, '/management/settings/access'));
            await sleep(800);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click().catch(() => {}); await idle(page); await sleep(500);
            await page.locator('input[name="restrictSiteAccess"]').first().uncheck({force: true}).catch(() => {});
            await page.locator('form').filter({has: page.locator('input[name="restrictSiteAccess"]')}).first().getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
            await sleep(1500);
        }
    } finally {
        if (dialogs.length) fact('dialogs-' + PHASES.join('+'), dialogs);
        await close();
    }
});
