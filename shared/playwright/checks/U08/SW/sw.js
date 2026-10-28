// U08 drift sweep 2026-10-28 (housekeeping, MAINTENANCE step 12), checker SW: the lines the
// kept checks (K1-K4, I07, I28; their r1/r2 outputs at today's tips) do not settle.
// Spec: docs/specs/U08-navigation-menus-and-site-chrome.md. Report: .reports/U08/cc-SW.md.
//
// Run (twice, each run under its own PROBE_RUN; each run seeds its own scratch contexts):
//   PROBE_RUN=r1 PROBE_FEATURE=U08 PROBE_AGENT=ccSW node bin/probe.js all shared/playwright/checks/U08/SW/sw.js
//   PROBE_RUN=r2 PROBE_FEATURE=U08 PROBE_AGENT=ccSW node bin/probe.js all shared/playwright/checks/U08/SW/sw.js
//   ONLY=ojs narrows the apps; PHASES=a,b narrows the phases (default: all, in this order; seed first).
// Files this script writes and reads itself, all through the kit's outFile() (so each PROBE_RUN
// keeps its own): sw-state[-<run>]-<app>.json (the seeded contexts; RESEED=1 seeds again),
// sw-facts[-<run>]-<app>.json (every fact, merged across processes). No other script is needed.
//
// Seeds per app (tag prefix u08sw): S (English only under UI and Forms): manager, section editor,
//   guest editor [OJS], author (with one submission), reader; F (English and French under UI and
//   Forms): manager, section editor, author; G: a manager and `admin` holding Reader beside the
//   manager role every new context gives it (phase a22 ends that manager role on screen).
// Phases:
//   seed       the contexts above
//   a2         Rule 19a/19b, A2, U05 A3/A15: the public user menu (wide, then the narrow "Open Menu"
//              list) of the manager, the section editor, the guest editor [OJS] on S and F; where
//              "Dashboard" leads; the Profile page's side menu and its one press to the Dashboard
//   escape     Rule 28, A25: the initials menu (manager.maya on publicknowledge's Dashboard): Escape,
//              a second press, Tab out of it, a press elsewhere
//   sitelevel  Rule 26c, OPS4, scenario 9's last bullet: a journal's settings addresses with
//              "index" as the path, as admin, manager.maya, reader.rosa, and signed out (then signing
//              in on the Login page it lands on, as S's author and as admin)
//   a1         Rule 27b, A1: the help link's name on the author's My Submissions, the submission
//              form, their submission's page, their Profile page, and in the Tasks window's strip
//   a18        Rule 11a, A18: the item window untouched, closed by Escape and by a press beside it;
//              after a refused "Save", the page left by a typed address and by a reload
//   a7site     Rule 15b, A7: the narrow header on the site's pages in English and French
//   a15site    Rule 3b, A15: the site's tab, an item renamed and named back, the menu cell before
//              and after a reload (site-level: the site item "Login" is renamed and restored)
//   a22        Rule 30a, A22: G's Users & Roles, `admin` ends its own manager role (Reader left);
//              the Dashboard's "Error" window, the side menu, the search box, then Tools,
//              Statistics and Settings behind it (irreversible on G only)
//   comments   Rule 29a's "Comments": seeds C and D (public comments on), reads the
//              Comments page on publicknowledge (off) and C, and the switcher from C to D and to S
const fs = require('fs');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, tag, outFile, users} = require('../../../probe');

const ALL = ['seed', 'a2', 'escape', 'sitelevel', 'a1', 'a18', 'a7site', 'a15site', 'a22', 'comments'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const PK = 'publicknowledge';

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs';
    const isOps = app.name === 'ops';
    const cUrl = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    const stateFile = outFile('sw-state.json');
    const factsFile = outFile('sw-facts.json');
    const facts = fs.existsSync(factsFile) ? JSON.parse(fs.readFileSync(factsFile, 'utf8')) : {};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[${app.name}] ${k} ${JSON.stringify(v).slice(0, 1200)}`);
        fs.writeFileSync(factsFile, JSON.stringify(facts, null, 1));
    };
    let st = fs.existsSync(stateFile) && !process.env.RESEED ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;

    if (on('seed') && !st) {
        const t = tag('u08sw');
        const P = (s) => `${t}${s}`;
        const U = {m: P('m'), s: P('s'), au: P('au'), rd: P('rd'), fm: P('fm'), fs: P('fs'), gm: P('gm')};
        const usersS = [
            {username: U.m, roles: ['manager'], givenName: 'Mia', familyName: 'SWManager'},
            {username: U.s, roles: ['sectionEditor'], givenName: 'Sol', familyName: 'SWSection'},
            {username: U.au, roles: ['author'], givenName: 'Abe', familyName: 'SWAuthor'},
            {username: U.rd, roles: ['reader'], givenName: 'Ria', familyName: 'SWReader'},
        ];
        if (isOjs) { U.g = P('g'); usersS.push({username: U.g, roles: ['guestEditor'], givenName: 'Gus', familyName: 'SWGuest'}); }
        const S = await app.api.createContext({tag: `${t}s`, context: {name: `U08 SW S ${t}`, acronym: 'SWS'}, users: usersS});
        const sub = await app.api.createSubmission({tag: `${t}p1`, context: S.path, submitter: U.au, title: `SW submitted ${t}`});
        const F = await app.api.createContext({tag: `${t}f`, context: {name: `U08 SW F ${t}`, acronym: 'SWF', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [{username: U.fm, roles: ['manager'], givenName: 'Fay', familyName: 'SWFManager'}, {username: U.fs, roles: ['sectionEditor'], givenName: 'Fin', familyName: 'SWFSection'}]});
        const G = await app.api.createContext({tag: `${t}g`, context: {name: `U08 SW G ${t}`, acronym: 'SWG'},
            users: [{username: U.gm, roles: ['manager'], givenName: 'Gil', familyName: 'SWGManager'}, {username: 'admin', roles: ['reader']}]});
        st = {t, U, S: S.path, F: F.path, G: G.path, sub: sub.submissionId || sub.id};
        fs.writeFileSync(stateFile, JSON.stringify(st, null, 1));
        fact('seed', st);
    }
    if (!st) throw new Error('no seed state: run PHASES=seed first');
    const U = st.U;

    const {page, context, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: rel(page.url()), step: dialogs.step || ''}); await d.accept().catch(() => {}); });
    const snap = async (name, extra = {}, png = false) => {
        const s = await screen(page).catch((e) => ({error: String(e)}));
        record(name, {...s, extra});
        if (png) await shot(page, name).catch(() => {});
        return s;
    };
    const as = async (u, ctx) => { await signIn(page, u, ctx ? {contextPath: ctx} : {}); await idle(page).catch(() => {}); };
    const go = async (url) => { let r = null; try { r = await page.goto(url, {timeout: 45_000}); } catch (e) { return {error: flat(e.message, 200)}; } await idle(page).catch(() => {}); return r; };
    const wide = () => page.setViewportSize({width: 1280, height: 900});
    const narrow = () => page.setViewportSize({width: 375, height: 800});
    /** The public user menu: each top entry's text, its visible text, its href, and its children. */
    const userMenu = () => page.evaluate(() => {
        const ul = document.getElementById('navigationUser');
        if (!ul) return null;
        const one = (a) => ({text: a.textContent.replace(/\s+/g, ' ').trim(), shown: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), count: a.querySelector('.task_count') ? a.querySelector('.task_count').textContent.trim() : null, countShown: a.querySelector('.task_count') ? getComputedStyle(a.querySelector('.task_count')).display !== 'none' : null});
        return [...ul.children].filter((li) => li.tagName === 'LI').map((li) => {
            const a = li.querySelector(':scope > a');
            const sub = li.querySelector(':scope > ul');
            return {...one(a), children: sub ? [...sub.querySelectorAll(':scope > li > a')].map(one) : null};
        });
    }).catch((e) => ({error: String(e)}));
    const sideNav = () => page.evaluate(() => {
        const nav = document.querySelector('nav#app-nav');
        if (!nav) return null;
        return [...nav.querySelectorAll('[data-pc-section="panel"]')].map((p) => {
            const h = p.querySelector('[data-pc-section="header"]');
            const a = h && h.querySelector('a');
            return {label: h ? h.getAttribute('aria-label') : null, href: a ? a.getAttribute('href') : null,
                items: [...p.querySelectorAll('[role="treeitem"]')].map((li) => ({label: li.getAttribute('aria-label'), href: li.querySelector('a') ? li.querySelector('a').getAttribute('href') : null, input: li.querySelector('input') ? li.querySelector('input').getAttribute('placeholder') : null}))};
        });
    }).catch((e) => ({error: String(e)}));

    try {
        // ── a2: Rule 19a/19b, A2 (and U05 A3/A15 as A2 states them) ─────────────────
        if (on('a2')) {
            const who = [['S', st.S, 'manager', U.m], ['S', st.S, 'sectionEditor', U.s], ['S', st.S, 'author', U.au], ['S', st.S, 'reader', U.rd], ['F', st.F, 'manager', U.fm], ['F', st.F, 'sectionEditor', U.fs]];
            if (U.g) who.splice(2, 0, ['S', st.S, 'guestEditor', U.g]);
            for (const [cn, ctx, lvl, u] of who) {
                await as(u, ctx);
                const editorialHeader = flat(await page.locator('header').first().innerText().catch(() => ''), 200);
                await wide();
                await go(cUrl(ctx, '/en/index'));
                await page.waitForFunction(() => { const a = document.querySelector('#navigationUser > li > a'); return !a || a.getAttribute('href') === '#'; }, null, {timeout: 10000}).catch(() => {});
                await snap(`a2-${cn}-${lvl}-home-wide`);
                const wideMenu = await userMenu();
                await narrow(); await sleep(400);
                await page.locator('button.pkp_site_nav_toggle').click().catch(() => {}); await sleep(500);
                await snap(`a2-${cn}-${lvl}-home-narrow-open`, {}, lvl === 'sectionEditor');
                const narrowMenu = await userMenu();
                const toggle = await page.locator('button.pkp_site_nav_toggle').evaluate((b) => ({text: b.innerText.trim(), aria: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded')})).catch(() => null);
                await wide(); await sleep(300);
                await go(cUrl(ctx, '/en/index'));
                await page.waitForFunction(() => { const a = document.querySelector('#navigationUser > li > a'); return !a || a.getAttribute('href') === '#'; }, null, {timeout: 10000}).catch(() => {});
                await page.locator('#navigationUser > li > a').first().hover().catch(() => {});
                const dash = page.locator('#navigationUser > li > ul a').filter({hasText: /^\s*Dashboard/}).first();
                await dash.click({timeout: 8000}).catch(() => {});
                await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {}); await sleep(500);
                const landed = {url: rel(page.url()), title: await page.title()};
                await snap(`a2-${cn}-${lvl}-dashboard-landed`);
                let back = null;
                if (/user\/profile/.test(landed.url)) {
                    const nav = await sideNav();
                    // the side menu's way back to the Dashboard, pressed as a person does: the first
                    // group's header ("Editor Dashboard"), then, if that only opened the group, its first view
                    const presses = [];
                    const first = page.locator('nav#app-nav [role="treeitem"] a').first();
                    presses.push({firstViewVisible: await first.isVisible().catch(() => false), firstViewLabel: flat(await first.textContent().catch(() => null), 60)});
                    if (!presses[0].firstViewVisible) {
                        await page.locator('nav#app-nav [data-pc-section="header"]').first().click({timeout: 8000}).catch(() => {}); await sleep(800);
                        presses.push({pressed: 'group header', url: rel(page.url()), firstViewVisible: await first.isVisible().catch(() => false)});
                    }
                    if (/user\/profile/.test(page.url()) && await first.isVisible().catch(() => false)) {
                        await first.click({timeout: 8000}).catch(() => {}); await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {}); await sleep(500);
                        presses.push({pressed: 'first view', url: rel(page.url())});
                    }
                    back = {nav, presses, url: rel(page.url()), title: await page.title()};
                    await snap(`a2-${cn}-${lvl}-profile-back`);
                }
                fact(`a2-${cn}-${lvl}`, {editorialHeader, wide: wideMenu, narrow: narrowMenu, toggle, landed, back});
            }
            await wide();
        }

        // ── escape: Rule 28, A25 ─────────────────────────────────────────────────────
        if (on('escape')) {
            await as('manager.maya', PK);
            await go(cUrl(PK, '/en/dashboard/editorial'));
            const btn = page.locator('[data-cy="app-user-nav"] button').first();
            const menu = page.locator('nav[aria-label="User Navigation"]');
            const shown = async () => menu.isVisible().catch(() => false);
            const r = {};
            await btn.click(); await sleep(600); r.openedByPress = await shown();
            await snap('esc-open');
            await page.keyboard.press('Escape'); await sleep(1000); r.afterEscape1s = await shown();
            await page.keyboard.press('Escape'); await sleep(1000); r.afterSecondEscape = await shown();
            await snap('esc-after-escape');
            await btn.click(); await sleep(600); r.afterSecondPress = await shown();
            // focus moves off: Tab until the focus leaves the menu's component
            await btn.click(); await sleep(600); r.reopened = await shown();
            const tabs = [];
            for (let i = 0; i < 8; i++) {
                await page.keyboard.press('Tab'); await sleep(250);
                const inside = await page.evaluate(() => !!document.activeElement.closest('[data-cy="app-user-nav"]'));
                tabs.push({inside, focus: await page.evaluate(() => (document.activeElement.innerText || document.activeElement.getAttribute('aria-label') || document.activeElement.tagName).replace(/\s+/g, ' ').trim().slice(0, 40))});
                if (!inside) break;
            }
            await sleep(800); r.afterTabOut = await shown(); r.tabs = tabs;
            if (r.afterTabOut) { await btn.click(); await sleep(600); }
            await btn.click(); await sleep(600); r.reopened2 = await shown();
            await page.locator('main h1, main').first().click({position: {x: 5, y: 5}}).catch(() => {}); await sleep(800);
            r.afterPressElsewhere = await shown();
            await snap('esc-after-press-elsewhere');
            fact('escape', r);
        }

        // ── sitelevel: Rule 26c, OPS4, scenario 9 ───────────────────────────────────
        if (on('sitelevel')) {
            const read = async () => page.evaluate(() => {
                const crumbs = [...document.querySelectorAll('.cmp_breadcrumbs li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim());
                const main = document.querySelector('.page, .pkp_structure_main, main') || document.body;
                return {title: document.title, h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()), crumbs, text: main.innerText.replace(/\s+/g, ' ').trim().slice(0, 400),
                    links: [...main.querySelectorAll('a')].filter((a) => !a.closest('.cmp_breadcrumbs, .pkp_structure_sidebar, header, footer')).map((a) => a.innerText.trim()).filter(Boolean),
                    header: !!document.querySelector('.pkp_structure_head'), siteName: (document.querySelector('.pkp_site_name a') || {}).className || null, login: !!document.querySelector('form#login, form.cmp_form.login, input[name="password"]')};
            }).catch((e) => ({error: String(e)}));
            const paths = ['/index.php/index/management/settings/website', '/index.php/index/en/management/settings/context', '/index.php/index/management/settings/institutions'];
            for (const u of ['admin', 'manager.maya', 'reader.rosa']) {
                await as(u, u === 'admin' ? undefined : PK);
                for (const p of paths) {
                    const resp = await go(app.url(p));
                    const k = p.split('/').pop();
                    await snap(`site-level-${u.replace('.', '')}-${k}`, {}, u === 'admin' && k === 'website');
                    fact(`sitelevel-${u}-${k}`, {status: resp && resp.status ? resp.status() : resp, url: rel(page.url()), ...(await read())});
                }
            }
            for (const [who, pw] of [[U.au, null], ['admin', 'admin']]) {
                await signOut(page);
                const resp = await go(app.url(paths[0]));
                await snap(`site-level-signedout-${who === 'admin' ? 'admin' : 'author'}-login`);
                const before = {status: resp && resp.status ? resp.status() : resp, url: rel(page.url()), ...(await read())};
                await page.locator('input[name="username"]').fill(who);
                // the box carries a maxlength shorter than a throwaway user's password (LoginPage.fillPassword lifts it too)
                await page.locator('input[name="password"]').evaluate((el) => el.removeAttribute('maxlength'));
                await page.locator('input[name="password"]').fill(pw || users.getPassword(who));
                await page.locator('form').filter({has: page.locator('input[name="password"]')}).getByRole('button', {name: /Login|Log in/}).first().click();
                await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {}); await sleep(500);
                await snap(`site-level-signedout-${who === 'admin' ? 'admin' : 'author'}-after`);
                fact(`sitelevel-signedout-then-${who === 'admin' ? 'admin' : 'author'}`, {before, after: {url: rel(page.url()), ...(await read())}});
            }
        }

        // ── a1: Rule 27b, A1 (the author's pages, the Tasks window's strip) ─────────
        if (on('a1')) {
            await as(U.au, st.S);
            const help = () => page.evaluate(() => [...document.querySelectorAll('a[target="_blank"]')].filter((a) => /docs\.pkp\.sfu\.ca/.test(a.href)).map((a) => ({href: a.getAttribute('href'), text: a.textContent.replace(/\s+/g, ' ').trim(), aria: a.getAttribute('aria-label'), inStrip: !!a.closest('[role="dialog"]')})));
            const out = {};
            for (const [k, p] of [['mySubmissions', '/en/dashboard/mySubmissions'], ['submissionForm', '/en/submission'], ['submissionPage', `/en/dashboard/mySubmissions?workflowSubmissionId=${st.sub}`], ['profile', '/en/user/profile']]) {
                await go(cUrl(st.S, p)); await sleep(1500);
                await snap(`a1-author-${k}`);
                const named = await page.getByRole('link', {name: '##common.help##'}).count();
                const namedHelp = await page.getByRole('link', {name: 'Help', exact: true}).count();
                out[k] = {url: rel(page.url()), help: await help(), byRawName: named, byHelp: namedHelp};
            }
            await go(cUrl(st.S, '/en/dashboard/mySubmissions'));
            await page.getByRole('button', {name: /^Tasks/}).first().click().catch(() => {}); await sleep(1200);
            await snap('a1-author-tasks-window');
            out.tasksWindow = {help: await help(), dialogs: await page.locator('[role="dialog"]:visible').count()};
            fact('a1-author', out);
        }

        // ── a18: Rule 11a, A18 ──────────────────────────────────────────────────────
        if (on('a18')) {
            await as(U.m, st.S);
            const tab = cUrl(st.S, '/en/management/settings/website#setup/navigationMenus');
            const openTab = async () => {
                await go(app.url('/index.php/index/en/login').replace('/login', '/index')); // leave first (a hash-only goto keeps the page)
                await go(tab);
                await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor({timeout: T});
                await idle(page).catch(() => {}); await sleep(400);
            };
            const win = () => page.locator('[role="dialog"]:visible').filter({has: page.locator('form#navigationMenuItemsForm')}).first();
            const addItem = async () => {
                await page.getByRole('link', {name: 'Add item', exact: true}).click();
                await win().locator('select[name="menuItemType"]').waitFor({timeout: T}); await idle(page).catch(() => {}); await sleep(700);
            };
            const r = {};
            const step = async (k, fn) => {
                dialogs.step = k; const n0 = dialogs.length;
                await fn(); await sleep(1500);
                r[k] = {windowOpen: await win().isVisible().catch(() => false), asked: dialogs.slice(n0).map((d) => `${d.type}: ${d.message}`)};
            };
            await openTab();
            await addItem(); await snap('a18-add-untouched');
            await step('untouched-escape', async () => { await page.keyboard.press('Escape'); });
            if (r['untouched-escape'].windowOpen) await win().getByRole('button', {name: 'Close', exact: true}).click().catch(() => {});
            await openTab(); await addItem();
            await step('untouched-press-beside', async () => { await page.mouse.click(40, 450); });
            if (r['untouched-press-beside'].windowOpen) await win().getByRole('button', {name: 'Close', exact: true}).click().catch(() => {});
            await openTab(); await addItem();
            await step('untouched-close', async () => { await win().getByRole('button', {name: 'Close', exact: true}).click(); });
            // a refused save, then the page left by a typed address
            await openTab(); await addItem();
            await win().locator('input[name="title[en]"]').fill('SW refused');
            await win().locator('select[name="menuItemType"]').selectOption({label: 'Remote URL'}); await sleep(400);
            await win().locator('input[name="remoteUrl[en]"]').fill('pkp.sfu.ca');
            await win().locator('input[name="remoteUrl[en]"]').blur().catch(() => {});
            const ans = page.waitForResponse((x) => /update-navigation-menu-item/.test(x.url()), {timeout: T}).catch(() => null);
            await win().getByRole('button', {name: 'Save', exact: true}).click();
            const a = await ans; r.refusedAnswer = a ? await a.text().catch(() => null) : null;
            await sleep(800);
            await snap('a18-refused-open');
            await step('refused-typed-address', async () => { await go(cUrl(st.S, '/en/management/settings/workflow')); });
            r['refused-typed-address'].url = rel(page.url());
            // the same, left by a reload
            await openTab(); await addItem();
            await win().locator('input[name="title[en]"]').fill('SW refused 2');
            await win().locator('select[name="menuItemType"]').selectOption({label: 'Remote URL'}); await sleep(400);
            await win().locator('input[name="remoteUrl[en]"]').fill('pkp.sfu.ca');
            const ans2 = page.waitForResponse((x) => /update-navigation-menu-item/.test(x.url()), {timeout: T}).catch(() => null);
            await win().getByRole('button', {name: 'Save', exact: true}).click(); await ans2; await sleep(800);
            await step('refused-reload', async () => { await page.reload().catch(() => {}); await idle(page).catch(() => {}); });
            // control: the untouched window, then a typed address
            await openTab(); await addItem();
            await step('untouched-typed-address', async () => { await go(cUrl(st.S, '/en/management/settings/workflow')); });
            // nothing stored
            await openTab();
            r.itemsAfter = await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"] tr.gridRow td:first-child').allInnerTexts().then((x) => x.map((s) => flat(s.replace(/^Settings/, ''), 60))).catch(() => null);
            await snap('a18-items-after');
            dialogs.step = '';
            fact('a18', r);
        }

        // ── a7site: Rule 15b, A7 on the site's pages ────────────────────────────────
        if (on('a7site')) {
            await signOut(page);
            const out = {};
            for (const [k, url] of [['site-en', '/index.php/index/en/index'], ['site-fr', '/index.php/index/fr_CA/index'], ['F-fr', `/index.php/${st.F}/fr_CA/index`]]) {
                await narrow(); await go(app.url(url)); await sleep(500);
                const b = page.locator('button.pkp_site_nav_toggle');
                const before = await b.evaluate((x) => ({text: x.innerText.trim(), aria: x.getAttribute('aria-label'), visible: x.offsetParent !== null})).catch(() => null);
                const menuVisibleBefore = await page.locator('#navigationUser').isVisible().catch(() => null);
                await b.click().catch(() => {}); await sleep(500);
                const menuVisibleAfter = await page.locator('#navigationUser').isVisible().catch(() => null);
                await snap(`a7-${k}-narrow-open`, {}, true);
                const name = await page.getByRole('button', {name: 'Open Menu'}).count();
                const search = await page.locator('.pkp_navigation_search_wrapper a').innerText().catch(() => null);
                const userItems = await page.locator('#navigationUser a').allInnerTexts().catch(() => []);
                await b.click().catch(() => {}); await sleep(400);
                out[k] = {lang: await page.evaluate(() => document.documentElement.lang), toggle: before, byName: name, menuVisibleBefore, menuVisibleAfter, hiddenAgain: !(await page.locator('#navigationUser').isVisible().catch(() => false)), search, userItems};
            }
            await wide();
            fact('a7site', out);
        }

        // ── a15site: Rule 3b, A15 on the site's tab (site item "Login" renamed and restored) ──
        if (on('a15site')) {
            await as('admin');
            const openSite = async () => {
                await go(app.url('/index.php/index/en/admin/settings'));
                await page.locator('#setup-button').first().click(); await sleep(300);
                await page.locator('#nav-button').click();
                await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]').first().waitFor({timeout: T});
                await idle(page).catch(() => {}); await sleep(500);
            };
            const cells = () => page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"] tr.gridRow').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => { const c = td.cloneNode(true); c.querySelectorAll('a.show_extras, a.hide_extras, script').forEach((a) => a.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); }).join(' | ')));
            const items = () => page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"] tr.gridRow td:first-child').allInnerTexts().then((x) => x.map((s) => flat(s.replace(/^\s*Settings/, ''), 60)));
            const rename = async (from, to) => {
                const table = page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first();
                const row = table.locator('tr.gridRow').filter({has: page.locator('td').first().filter({hasText: new RegExp(`^\\s*(Settings\\s*)?${from}\\s*$`)})}).first();
                const id = await row.getAttribute('id', {timeout: T});
                if (await row.locator('a.show_extras').count()) { await row.locator('a.show_extras').first().click(); await sleep(400); }
                await page.locator(`[id="${id}-control-row"]`).getByRole('link', {name: 'Edit', exact: true}).click();
                const w = page.locator('[role="dialog"]:visible').filter({has: page.locator('form#navigationMenuItemsForm')}).first();
                await w.locator('input[name="title[en]"]').waitFor({timeout: T}); await sleep(600);
                await w.locator('input[name="title[en]"]').fill(to);
                const ans = page.waitForResponse((x) => /update-navigation-menu-item/.test(x.url()), {timeout: T}).catch(() => null);
                await w.getByRole('button', {name: 'Save', exact: true}).click();
                const a = await ans; await idle(page).catch(() => {}); await sleep(1200);
                return a ? a.status() : null;
            };
            await openSite();
            const r = {before: {menus: await cells(), items: await items()}};
            await snap('a15site-before');
            r.renameStatus = await rename('Login', 'Login SW');
            r.afterRename = {menus: await cells(), items: await items()};
            await snap('a15site-after-rename');
            await openSite();
            r.afterReload = {menus: await cells(), items: await items()};
            r.restoreStatus = await rename('Login SW', 'Login');
            await openSite();
            r.restored = {menus: await cells(), items: await items()};
            await snap('a15site-restored');
            fact('a15site', r);
        }

        // ── a22: Rule 30a, A22 (G only) ─────────────────────────────────────────────
        if (on('a22')) {
            await as('admin', st.G);
            await go(cUrl(st.G, '/en/management/settings/access'));
            await sleep(800);
            const row = page.locator('tr').filter({hasText: 'admin@mail.test'}).first();
            await row.waitFor({timeout: T}).catch(() => {});
            await snap('a22-users');
            let removed = null, roleRows = [];
            const errDlg0 = flat(await page.locator('[role="dialog"]:visible').first().innerText().catch(() => ''), 200);
            if (!/does not have access/.test(errDlg0)) {
                await row.locator('button').last().click().catch(() => {}); await sleep(500);
                await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
                await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 30000}).catch(() => {});
                await idle(page).catch(() => {}); await sleep(1000);
                await snap('a22-user-edit');
                roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 60))).catch(() => []);
                const mgrRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
                if (await mgrRow.count()) {
                    await mgrRow.getByRole('button', {name: /Remove Role/i}).click(); await sleep(600);
                    const d = page.locator('[role="dialog"]:visible').last();
                    const w = page.waitForResponse((x) => x.request().method() !== 'GET' && /\/api\/v1\//.test(x.url()), {timeout: T}).catch(() => null);
                    await d.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
                    const x = await w; await idle(page).catch(() => {}); await sleep(800);
                    removed = x ? x.status() : 'no response';
                }
            }
            const out = {removed, roleRows, errBefore: errDlg0};
            const errorWindow = async () => { const d = page.locator('[role="dialog"]:visible').filter({hasText: /does not have access/}); return (await d.count()) ? flat(await d.first().innerText(), 200) : null; };
            await go(cUrl(st.G, '/en/dashboard/editorial')); await sleep(2000);
            out.dashboard = {url: rel(page.url()), error: await errorWindow(), nav: await sideNav()};
            await snap('a22-dashboard', {}, true);
            const okBtn = page.locator('[role="dialog"]:visible').filter({hasText: /does not have access/}).getByRole('button', {name: 'OK', exact: true});
            if (await okBtn.count()) { await okBtn.first().click(); await sleep(800); }
            out.dashboard.afterOk = {dialogs: await page.locator('[role="dialog"]:visible').count(), main: flat(await page.locator('main').innerText().catch(() => ''), 300)};
            const box = page.locator('nav#app-nav input').first();
            out.searchBoxVisible = await box.isVisible().catch(() => false);
            if (!out.searchBoxVisible) {
                // the group closed: a person opens "Editor Dashboard" first
                await page.locator('nav#app-nav [data-pc-section="header"]').first().click().catch(() => {}); await sleep(600);
                out.searchBoxVisibleAfterOpen = await box.isVisible().catch(() => false);
                out.navAfterOpen = await sideNav();
            }
            if (await box.isVisible().catch(() => false)) {
                await box.fill('SW'); await box.press('Enter'); await idle(page).catch(() => {}); await sleep(2000);
                out.search = {url: rel(page.url()), error: await errorWindow(), main: flat(await page.locator('main').innerText().catch(() => ''), 300)};
                await snap('a22-search');
                const ok2 = page.locator('[role="dialog"]:visible').filter({hasText: /does not have access/}).getByRole('button', {name: 'OK', exact: true});
                if (await ok2.count()) { await ok2.first().click(); await sleep(600); }
            }
            for (const [k, p] of [['tools', '/en/management/tools'], ['statistics', '/en/stats/publications/publications'], ['settings', '/en/management/settings/context']]) {
                const resp = await go(cUrl(st.G, p)); await sleep(1500);
                const e = await errorWindow();
                const ok = page.locator('[role="dialog"]:visible').filter({hasText: /does not have access/}).getByRole('button', {name: 'OK', exact: true});
                if (await ok.count()) { await ok.first().click(); await sleep(600); }
                await snap(`a22-${k}`);
                out[k] = {status: resp && resp.status ? resp.status() : resp, url: rel(page.url()), title: await page.title(), error: e, h1: await page.locator('main h1, h1').first().innerText().catch(() => null), deniedPage: /user\/authorizationDenied/.test(page.url())};
            }
            fact('a22', out);
        }

        // ── comments: Rule 29a's "Comments" (a context with public comments on), Rule 30 ──
        if (on('comments')) {
            if (!st.C) {
                const C = await app.api.createContext({tag: `${st.t}c`, context: {name: `U08 SW C ${st.t}`, acronym: 'SWC'}, enablePublicComments: true, users: [{username: `${st.t}cm`, roles: ['manager']}]});
                const D = await app.api.createContext({tag: `${st.t}d`, context: {name: `U08 SW D ${st.t}`, acronym: 'SWD'}, enablePublicComments: true, users: [{username: `${st.t}dm`, roles: ['manager']}]});
                st.C = C.path; st.D = D.path;
                fs.writeFileSync(stateFile, JSON.stringify(st, null, 1));
            }
            await as('admin');
            const out = {};
            for (const [k, ctx] of [['pkOff', PK], ['C', st.C]]) {
                const resp = await go(cUrl(ctx, '/en/management/settings/userComments'));
                await snap(`comments-${k}`);
                out[k] = {status: resp && resp.status ? resp.status() : resp, url: rel(page.url()), title: await page.title(), nav: (await sideNav() || []).map((p) => `${p.label}${p.items.length ? ' › ' + p.items.map((i) => i.label).join(', ') : ''}`).filter((l) => /^Content/.test(l))};
            }
            // from C's Comments page: the switcher's entries for D (comments on) and S (comments off)
            await go(cUrl(st.C, '/en/management/settings/userComments'));
            await page.locator('header.app__header .app__contexts button').first().click().catch(() => {}); await sleep(600);
            for (const [k, name] of [['toD', `U08 SW D ${st.t}`], ['toS', `U08 SW S ${st.t}`]]) {
                const a = page.locator('header.app__header .app__contexts a').filter({hasText: name}).first();
                out[k] = {href: rel(await a.getAttribute('href').catch(() => null))};
            }
            for (const k of ['toD', 'toS']) {
                if (!out[k].href) continue;
                const resp = await go(app.url(out[k].href));
                await snap(`comments-switch-${k}`);
                out[k].landed = {status: resp && resp.status ? resp.status() : resp, url: rel(page.url()), title: await page.title()};
            }
            fact('comments', out);
        }

        fact('dialogsAll', dialogs);
    } finally {
        await close();
    }
});
