// U08 claim check, chunk K3: the public chrome (Rules 15–26, register A2, A3, A7),
// on all three apps.
// Spec: docs/specs/U08-navigation-menus-and-site-chrome.md lines 255–369, register
// A2 (658–665), A3 (668–673), A7 (705–709); footnotes d, e, f, q, r, s, t, u, v, w,
// td13, td14, f-a2, f-a3, f-a7.
//
// Seeds per app (tag prefix u08k3; kept in k3-state-<app>.json, RESEED=1 to redo):
//   A  the main scratch context: one account per permission level (manager, editor
//      [OJS/OMP], production editor without "Permit changes to Settings" [OJS/OMP],
//      section editor, assistant, reviewer [OJS/OMP], author, reader), the "Developed
//      By" block enabled and placed, announcements on with two on the home page, one
//      submission submitted (a "needs an editor" task for the managers), three
//      published items (OMP/OPS) for the page links
//   B  a context where the Site Administrator holds Reader alone (their manager role
//      ended on screen)
//   C  a fresh context (defaults) that its manager changes on screen: the "Developed
//      By" plugin enabled then placed, a header logo and a "Page Footer", registration
//      closed, "Items per page", the "Search" item dragged into the primary menu
// Phases (PHASES=a,b to narrow):
//   pk      publicknowledge and the site's pages signed out: header, footer, breadcrumbs,
//           skip links, page links, a narrow window, French (Rules 15–17, 20, 22–24, A7)
//   dash    the user menu and where the username / "Dashboard" lead per role, on the
//           journal and on the site (Rules 18–19, td13, A2)
//   denied  the access-denied page per role (Rule 26, td14, A3)
//   seed    seeds A, B, C
//   edit    the "Edit" shortcut on every page per level (Rule 25)
//   devby   the "Developed By" block: placed on A; C default, enabled, placed (Rule 21)
//   skip    skip links on A's home (announcements, the description) (Rule 22)
//   count   the unread count on A (Rule 19b)
//   imp     Login As, "Logout as" on the public menu (Rule 18)
//   admb    B: the Site Administrator with Reader alone (Rules 19a, 25)
//   look    C: header logo, "Page Footer" (Rules 15a, 20); the tab left unsaved
//   reg     C: registration closed (Rule 18) and the refusal page (Rule 26)
//   msg     message pages: lost password, registration complete (Rule 26)
//   pages   page links: "Items per page" on the Lists tab, issues [OJS], items (Rule 24)
//   crumbs  breadcrumbs with a middle step: announcement, article [OJS], category [OMP]
//   search  C: the "Search" item placed in the primary menu (Rule 17)
//   site    the site's "Page Footer" and logo set and restored (Rules 15a, 20)
// Run: PROBE_FEATURE=U08 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U08/K3/k3.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['pk', 'dash', 'denied', 'seed', 'edit', 'devby', 'skip', 'count', 'imp', 'admb', 'look', 'reg', 'msg', 'pages', 'crumbs', 'search', 'sitedash', 'narrow2', 'extra', 'site', 'sitelogo', 'layout', 'secount', 'series'];
const OPT_IN = ['sitename']; // run only when named in PHASES (irreversible)
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const flat = (s, n = 3000) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const PK = 'publicknowledge';

// ---------------------------------------------------------------------------
// Reading the public chrome

/** Everything Rules 15–26 talk about, read from the DOM of a public page. */
async function chrome(page) {
    return page.evaluate(() => {
        const tc = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => {
            if (!e) return false;
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            // pkp_screen_reader clips to rect(1px, 1px, 1px, 1px): read as hidden (the first
            // snapshots of this script predate this line and report such elements visible)
            const clipped = cs.clip && /^rect\((0|1)px,? (0|1)px,? (0|1)px,? (0|1)px\)$/.test(cs.clip);
            return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && !clipped && !(cs.clipPath && cs.clipPath.includes('inset(50%'));
        };
        const menu = (id) => {
            const ul = document.getElementById(id);
            if (!ul) return null;
            return [...ul.children].map((li) => {
                const a = li.querySelector(':scope > a');
                const sub = li.querySelector(':scope > ul');
                return {
                    text: tc(a), href: a && a.getAttribute('href'), visible: vis(a),
                    count: tc(a && a.querySelector('.task_count')),
                    children: sub ? [...sub.querySelectorAll(':scope > li > a')].map((c) => ({text: tc(c), href: c.getAttribute('href'), count: tc(c.querySelector('.task_count')), visible: vis(c)})) : null,
                    deeper: li.querySelectorAll('ul ul').length,
                };
            });
        };
        const site = document.querySelector('.pkp_site_name');
        const siteA = site && site.querySelector('a');
        const img = siteA && siteA.querySelector('img');
        const search = document.querySelector('.pkp_navigation_search_wrapper a');
        const primary = document.getElementById('navigationPrimary');
        const toggle = document.querySelector('.pkp_site_nav_toggle');
        const brand = document.querySelector('.pkp_brand_footer a');
        const crumbs = document.querySelector('.cmp_breadcrumbs');
        const page = document.querySelector('.pkp_structure_main');
        const pag = document.querySelector('.cmp_pagination');
        const sidebar = document.querySelector('.pkp_structure_sidebar');
        return {
            lang: document.documentElement.lang,
            bodyClass: document.body.className,
            siteName: site ? {cls: siteA && siteA.className, text: tc(siteA), href: siteA && siteA.getAttribute('href'), img: img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), title: img.getAttribute('title')} : null} : null,
            srH1: [...document.querySelectorAll('header h1')].map(tc),
            toggle: toggle ? {text: tc(toggle), visible: vis(toggle), aria: toggle.getAttribute('aria-label'), expanded: toggle.getAttribute('aria-expanded')} : null,
            navVisible: vis(document.querySelector('.pkp_site_nav_menu')),
            primary: menu('navigationPrimary'),
            user: menu('navigationUser'),
            userVisible: vis(document.getElementById('navigationUser')),
            search: search ? {text: tc(search), href: search.getAttribute('href'), visible: vis(search), afterPrimary: primary ? !!(primary.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING) : null} : null,
            skip: [...document.querySelectorAll('.cmp_skip_to_content a')].map((a) => ({text: tc(a), href: a.getAttribute('href'), visible: vis(a), target: !!document.querySelector(a.getAttribute('href'))})),
            skipTag: (document.querySelector('.cmp_skip_to_content') || {}).tagName || null,
            crumbs: crumbs ? {label: crumbs.getAttribute('aria-label'), role: crumbs.getAttribute('role'), steps: [...crumbs.querySelectorAll('li')].map((li) => { const a = li.querySelector('a'); return {text: tc(li.querySelector('a, span[aria-current], span:not(.separator)')), link: a ? a.getAttribute('href') : null, current: !!li.querySelector('[aria-current]') || li.getAttribute('aria-current'), sep: tc(li.querySelector('.separator'))}; }), text: tc(crumbs)} : null,
            h1: [...document.querySelectorAll('.pkp_structure_main h1')].map(tc),
            main: tc(page) ? tc(page).slice(0, 1500) : null,
            mainLinks: page ? [...page.querySelectorAll('.page a, .cmp_back_link a')].slice(0, 30).map((a) => [tc(a), a.getAttribute('href')]) : [],
            edit: [...document.querySelectorAll('a.cmp_edit_link')].map((a) => ({text: tc(a), sr: tc(a.querySelector('.pkp_screen_reader')), href: a.getAttribute('href'), target: a.getAttribute('target'), prev: a.previousElementSibling ? a.previousElementSibling.tagName + ':' + tc(a.previousElementSibling).slice(0, 60) : null})),
            pagination: pag ? {label: pag.getAttribute('aria-label'), text: tc(pag), prev: (pag.querySelector('a.prev') || {}).href || null, next: (pag.querySelector('a.next') || {}).href || null} : null,
            footer: {
                content: tc(document.querySelector('.pkp_footer_content')),
                brandHref: brand && brand.getAttribute('href'),
                brandAlt: brand && brand.querySelector('img') && brand.querySelector('img').getAttribute('alt'),
                brandSrc: brand && brand.querySelector('img') && brand.querySelector('img').getAttribute('src'),
            },
            hasSidebarClass: !!document.querySelector('.pkp_structure_content.has_sidebar'),
            sidebar: sidebar ? [...sidebar.querySelectorAll('.pkp_block')].map((b) => ({cls: b.className, heading: tc(b.querySelector('h2,h3,.title')), headingCls: (b.querySelector('h2,h3,.title') || {}).className || null, headingVisible: vis(b.querySelector('h2,h3,.title')), links: [...b.querySelectorAll('a')].map((a) => [tc(a), a.getAttribute('href')])})) : null,
            sidebarBesideMain: sidebar && page ? (() => { const s = sidebar.getBoundingClientRect(); const m = page.getBoundingClientRect(); return {sidebarLeft: Math.round(s.left), mainLeft: Math.round(m.left), sidebarTop: Math.round(s.top), mainTop: Math.round(m.top), width: Math.round(s.width)}; })() : null,
        };
    });
}

/** Go to a public page, record the screen and the chrome; return the chrome. */
async function pub(page, url, name, {shotIt = false} = {}) {
    let resp = null;
    let error = null;
    try { resp = await page.goto(url); } catch (e) { error = String(e.message || e); }
    await idle(page).catch(() => {});
    const s = await screen(page).catch((e) => ({error: String(e)}));
    const c = await chrome(page).catch((e) => ({error: String(e)}));
    const out = {status: resp ? resp.status() : null, error, url: page.url(), title: await page.title().catch(() => null), ...c};
    record(name, {screen: s, chrome: out});
    if (shotIt) await shot(page, name).catch(() => {});
    return out;
}

const brief = (c) => ({
    status: c.status, url: (c.url || '').replace(/^https?:\/\/[^/]+/, ''), title: c.title,
    site: c.siteName && `${c.siteName.cls}|${c.siteName.text}|${c.siteName.href}|${c.siteName.img ? c.siteName.img.alt + ' ' + c.siteName.img.src : ''}`,
    primary: (c.primary || []).map((i) => i.text + (i.children ? `[${i.children.map((x) => x.text).join(',')}]` : '')).join(' · '),
    user: (c.user || []).map((i) => `${i.text}${i.count !== null ? '#' + i.count : ''}>${(i.href || '').replace(/^https?:\/\/[^/]+/, '')}` + (i.children ? `[${i.children.map((x) => `${x.text}${x.count !== null ? '#' + x.count : ''}>${(x.href || '').replace(/^https?:\/\/[^/]+/, '')}`).join(', ')}]` : '')).join(' · '),
    search: c.search && `${c.search.text} ${c.search.href} after=${c.search.afterPrimary}`,
    skip: (c.skip || []).map((s) => s.text).join(' | '),
    crumbs: c.crumbs && c.crumbs.steps.map((s) => `${s.text}${s.link ? '(a)' : ''}${s.current ? '*' : ''}`).join(' / '),
    h1: c.h1, footer: c.footer, sidebar: (c.sidebar || null) && c.sidebar.map((b) => `${b.cls}:${b.heading}:${JSON.stringify(b.links)}`),
    edit: c.edit && c.edit.map((e) => `${e.text}|${e.sr}|${(e.href || '').replace(/^https?:\/\/[^/]+/, '')}|${e.target}`),
    pagination: c.pagination && c.pagination.text,
});

function logger(app) {
    const lines = [];
    const log = (...a) => { const l = `[${app.name}] ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}`; console.log(l); lines.push(l); };
    return {log, lines};
}

// ---------------------------------------------------------------------------
// Roster per app

function roster(app) {
    if (app.name === 'ops') {
        return [
            ['admin', 'admin'], ['manager', 'manager.maya'], ['sectionEditor', 'sectioneditor.ana'],
            ['assistant', 'assistant.rita'], ['author', 'author.alex'], ['reader', 'reader.rosa'],
        ];
    }
    return [
        ['admin', 'admin'], ['manager', 'manager.maya'], ['editor', 'editor.diana'], ['sectionEditor', 'sectioneditor.ana'],
        ['assistant', 'copyeditor.carla'], ['funding', 'assistant.rita'], ['reviewer', 'reviewer.julia'],
        ['author', 'author.alex'], ['reader', 'reader.rosa'],
    ];
}

const listPage = (app) => (app.name === 'ojs' ? '/issue/archive' : app.name === 'omp' ? '/catalog' : '/preprints');

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const {log, lines} = logger(app);
    const cUrl = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    const facts = {};
    const fact = (k, v) => { facts[k] = v; log(k, v); };
    let st = fs.existsSync(stateFile(app)) && !process.env.RESEED ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;

    const {page, context, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
        // ── pk: publicknowledge and the site signed out ─────────────────────────────
        if (on('pk')) {
            await signOut(page).catch(() => {});
            const pages = [
                ['home', ''], ['about', '/about'], ['submissions', '/about/submissions'], ['masthead', '/about/editorialMasthead'],
                ['history', '/about/editorialHistory'], ['contact', '/about/contact'], ['privacy', '/about/privacy'],
                ['search', '/search'], ['login', '/login'], ['register', '/user/register'], ['lostpw', '/login/lostPassword'],
                ['info-readers', '/information/readers'], ['aboutsys', '/about/aboutThisPublishingSystem'], ['list', listPage(app)],
                ['announcements', '/announcement'],
            ];
            if (app.name === 'omp') pages.push(['series', '/catalog/series/monographs'], ['category', '/catalog/category/applied-science'], ['subcategory', '/catalog/category/comp-sci'], ['newreleases', '/catalog/newReleases']);
            if (app.name === 'ops') pages.push(['section', '/preprints/section/pre'], ['category', '/preprints/category/applied-science']);
            if (app.name === 'ojs') pages.push(['current', '/issue/current']);
            for (const [k, p] of pages) {
                const c = await pub(page, cUrl(PK, p), `pk-${k}`, {shotIt: k === 'home'});
                fact(`pk-${k}`, brief(c));
            }
            // the site's own pages
            for (const [k, p] of [['index', '/index.php/index/index'], ['login', '/index.php/index/login'], ['register', '/index.php/index/user/register'], ['search', '/index.php/index/search'], ['about', '/index.php/index/about'], ['aboutsys', '/index.php/index/about/aboutThisPublishingSystem']]) {
                const c = await pub(page, app.url(p), `site-${k}`, {shotIt: k === 'index'});
                fact(`site-${k}`, brief(c));
            }
            await loc(page, 'site header name/logo link', page.locator('.pkp_site_name a'));
            // Home link of the breadcrumb, logo link: press them
            await page.goto(cUrl(PK, '/about')); await idle(page);
            await page.locator('.pkp_site_name a').click(); await idle(page);
            fact('pk-press-logo-from-about', page.url());
            await page.goto(cUrl(PK, '/about')); await idle(page);
            await page.locator('.cmp_breadcrumbs a').first().click(); await idle(page);
            fact('pk-press-crumb-home-from-about', page.url());
            await page.goto(cUrl(PK, '')); await idle(page);
            await page.locator('.pkp_navigation_search_wrapper a').click(); await idle(page);
            fact('pk-press-search', {url: page.url(), h1: await page.locator('.pkp_structure_main h1').allInnerTexts()});
            await page.goto(cUrl(PK, '')); await idle(page);
            await page.locator('.pkp_brand_footer a').click(); await idle(page);
            fact('pk-press-brand', {url: page.url(), h1: await page.locator('.pkp_structure_main h1').allInnerTexts()});
            // Submenus: point at / focus the About item
            await page.goto(cUrl(PK, '')); await idle(page);
            const aboutLi = page.locator('#navigationPrimary > li').filter({has: page.locator(':scope > ul')}).first();
            const subVis = async () => aboutLi.locator(':scope > ul').evaluate((u) => { const r = u.getBoundingClientRect(); const cs = getComputedStyle(u); return {w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top), display: cs.display, vis: cs.visibility, opacity: cs.opacity}; }).catch((e) => String(e));
            fact('pk-sub-before', await subVis());
            await aboutLi.locator(':scope > a').hover(); await sleep(400);
            fact('pk-sub-hover', await subVis());
            await shot(page, 'pk-sub-hover');
            await page.mouse.move(5, 880); await sleep(400);
            fact('pk-sub-away', await subVis());
            await aboutLi.locator(':scope > a').focus(); await sleep(400);
            fact('pk-sub-focus', await subVis());
            await page.keyboard.press('Tab'); await sleep(300);
            fact('pk-sub-tab-into', {active: await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim()), sub: await subVis()});
            const nonSub = page.locator('#navigationPrimary > li').filter({hasNot: page.locator(':scope > ul')}).first();
            if (await nonSub.count()) { await nonSub.hover(); await sleep(300); fact('pk-nonsub-hover', {text: await nonSub.innerText(), lists: await nonSub.locator('ul').count()}); }
            // keyboard: focus the item, press Enter, Tab into the list
            await page.goto(cUrl(PK, '')); await idle(page);
            await aboutLi.locator(':scope > a').focus(); await sleep(200);
            await page.keyboard.press('Enter'); await sleep(400);
            fact('pk-sub-focus-enter', {url: page.url(), sub: await subVis(), expanded: await aboutLi.locator(':scope > a').getAttribute('aria-expanded'), href: await aboutLi.locator(':scope > a').getAttribute('href')});
            await page.keyboard.press('Tab'); await sleep(200);
            fact('pk-sub-focus-enter-tab', await page.evaluate(() => (document.activeElement.textContent || '').trim()));
            await page.keyboard.press('Escape'); await sleep(200);
            fact('pk-sub-escape', await subVis());
            // the mouse: press the item
            await page.goto(cUrl(PK, '')); await idle(page);
            const aboutHref = await aboutLi.locator(':scope > a').getAttribute('href');
            await aboutLi.locator(':scope > a').click(); await sleep(500); await idle(page);
            fact('pk-press-about-toplevel', {hrefAfterScripts: aboutHref, url: page.url(), sub: await subVis(), expanded: await aboutLi.locator(':scope > a').getAttribute('aria-expanded')});
            await shot(page, 'pk-press-about-toplevel');
            await page.mouse.move(5, 880); await sleep(300);
            fact('pk-press-about-then-away', await subVis());
            // the served HTML, before the theme's script
            const raw = await (await context.request.get(cUrl(PK, '/about'))).text();
            const m = raw.match(/<ul id="navigationPrimary"[\s\S]*?<\/ul>\s*<\/li>\s*<\/ul>/);
            fact('pk-served-primary-html', m ? m[0].replace(/\s+/g, ' ').slice(0, 1500) : null);
            // Skip links: the first Tab on the home page, then each link
            await page.goto(cUrl(PK, '')); await idle(page);
            await page.keyboard.press('Tab'); await sleep(200);
            fact('pk-first-tab', await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return {text: a.textContent.trim(), href: a.getAttribute('href'), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top)}; }));
            await shot(page, 'pk-first-tab');
            const skipCount = await page.locator('.cmp_skip_to_content a').count();
            const moves = [];
            for (let i = 0; i < skipCount; i++) {
                await page.goto(cUrl(PK, '')); await idle(page);
                for (let k = 0; k <= i; k++) await page.keyboard.press('Tab');
                await sleep(150);
                const before = await page.evaluate(() => ({text: document.activeElement.textContent.trim(), href: document.activeElement.getAttribute('href')}));
                await page.keyboard.press('Enter'); await sleep(400);
                const after = await page.evaluate(() => ({url: location.hash, activeTag: document.activeElement.tagName, activeId: document.activeElement.id, activeText: (document.activeElement.textContent || '').trim().slice(0, 60), scrollY: Math.round(scrollY)}));
                await page.keyboard.press('Tab'); await sleep(150);
                const next = await page.evaluate(() => ({text: (document.activeElement.textContent || '').trim().slice(0, 60), tag: document.activeElement.tagName, cls: document.activeElement.className}));
                moves.push({before, after, nextTab: next});
            }
            fact('pk-skip-moves', moves);
            // Skip links on a page other than home
            await page.goto(cUrl(PK, '/about')); await idle(page);
            await page.keyboard.press('Tab'); await sleep(150);
            fact('pk-first-tab-about', await page.evaluate(() => document.activeElement.textContent.trim()));
            // Narrow window
            await page.setViewportSize({width: 375, height: 800});
            let c = await pub(page, cUrl(PK, ''), 'pk-narrow-home', {shotIt: true});
            fact('pk-narrow', {toggle: c.toggle, navVisible: c.navVisible, primaryVis: (c.primary || []).map((i) => i.visible), userVisible: c.userVisible, search: c.search && c.search.visible});
            await loc(page, 'Open Menu button', page.getByRole('button', {name: 'Open Menu'}));
            await page.locator('.pkp_site_nav_toggle').click(); await sleep(500);
            c = await chrome(page);
            record('pk-narrow-open', c); await shot(page, 'pk-narrow-open');
            fact('pk-narrow-open', {toggle: c.toggle, navVisible: c.navVisible, primaryVis: (c.primary || []).map((i) => i.visible), userVisible: c.userVisible, search: c.search && c.search.visible});
            await page.locator('.pkp_site_nav_toggle').click(); await sleep(500);
            c = await chrome(page);
            fact('pk-narrow-closed-again', {toggle: c.toggle, navVisible: c.navVisible});
            // French, narrow then wide
            c = await pub(page, cUrl(PK, '/fr_CA/index'), 'pk-fr-narrow', {shotIt: true});
            fact('pk-fr-narrow', {lang: c.lang, toggle: c.toggle, user: (c.user || []).map((i) => i.text), primary: (c.primary || []).map((i) => i.text), search: c.search && c.search.text, skip: c.skip.map((s) => s.text), footerAlt: c.footer.brandAlt});
            await page.setViewportSize({width: 1280, height: 900});
            c = await pub(page, cUrl(PK, '/fr_CA/about'), 'pk-fr-about');
            fact('pk-fr-about', brief(c));
            c = await pub(page, app.url('/index.php/index/fr_CA/index'), 'site-fr-index');
            fact('site-fr-index', brief(c));
            await page.setViewportSize({width: 1280, height: 900});
        }

        // ── dash: the user menu per role ─────────────────────────────────────────────
        if (on('dash')) {
            for (const [role, user] of roster(app)) {
                await signIn(page, user, {contextPath: PK});
                await idle(page);
                const landed = page.url();
                const c = await pub(page, cUrl(PK, ''), `dash-${role}-home`);
                const um = c.user || [];
                const top = um.find((i) => i.children);
                fact(`dash-${role}-menu`, {landed, user: brief(c).user});
                // press the username
                const topLink = page.locator('#navigationUser > li > a').filter({hasText: user}).first();
                await topLink.click(); await idle(page);
                const s1 = await screen(page); record(`dash-${role}-username-dest`, s1);
                const nameDest = {url: page.url(), title: await page.title()};
                // press Dashboard
                await page.goto(cUrl(PK, '')); await idle(page);
                await page.locator('#navigationUser > li').filter({hasText: user}).first().hover(); await sleep(300);
                const dash = page.locator('#navigationUser > li > ul a').filter({hasText: /Dashboard/}).first();
                await dash.click(); await idle(page);
                const s2 = await screen(page); record(`dash-${role}-dashboard-dest`, s2);
                const dashDest = {url: page.url(), title: await page.title()};
                // View Profile, Administration
                await page.goto(cUrl(PK, '')); await idle(page);
                await page.locator('#navigationUser > li').filter({hasText: user}).first().hover(); await sleep(300);
                await page.locator('#navigationUser > li > ul a').filter({hasText: /View Profile/}).first().click(); await idle(page);
                const profDest = {url: page.url(), title: await page.title()};
                let adminDest = null;
                if (top && top.children.some((x) => /Administration/.test(x.text))) {
                    await page.goto(cUrl(PK, '')); await idle(page);
                    await page.locator('#navigationUser > li').filter({hasText: user}).first().hover(); await sleep(300);
                    await page.locator('#navigationUser > li > ul a').filter({hasText: /Administration/}).first().click(); await idle(page);
                    adminDest = {url: page.url(), title: await page.title()};
                }
                fact(`dash-${role}-dest`, {name: nameDest, dashboard: dashDest, profile: profDest, admin: adminDest});
                // the site's pages
                const cs = await pub(page, app.url('/index.php/index/index'), `dash-${role}-site`);
                fact(`dash-${role}-site-menu`, brief(cs).user);
                const sTop = page.locator('#navigationUser > li').filter({hasText: user}).first();
                if (await sTop.count()) {
                    await sTop.hover(); await sleep(300);
                    const sd = page.locator('#navigationUser > li > ul a').filter({hasText: /Dashboard/}).first();
                    if (await sd.count()) {
                        await sd.click(); await idle(page);
                        const s3 = await screen(page); record(`dash-${role}-site-dashboard-dest`, s3);
                        fact(`dash-${role}-site-dashboard-dest`, {url: page.url(), title: await page.title()});
                    }
                    await page.goto(app.url('/index.php/index/index')); await idle(page);
                    await page.locator('#navigationUser > li > a').filter({hasText: user}).first().click(); await idle(page);
                    fact(`dash-${role}-site-username-dest`, {url: page.url(), title: await page.title()});
                }
                // Logout from the public menu
                await page.goto(cUrl(PK, '')); await idle(page);
                await page.locator('#navigationUser > li').filter({hasText: user}).first().hover(); await sleep(300);
                await page.locator('#navigationUser > li > ul a').filter({hasText: /^\s*Logout/}).first().click(); await idle(page);
                const out = await chrome(page);
                fact(`dash-${role}-logout-dest`, {url: page.url(), user: brief({...out}).user});
            }
        }

        // ── denied: the access-denied page (td14) ───────────────────────────────────
        if (on('denied')) {
            const who = app.name === 'ops' ? ['author.alex', 'reader.rosa', 'sectioneditor.ana', 'assistant.rita'] : ['author.alex', 'reader.rosa', 'sectioneditor.ana', 'reviewer.julia', 'copyeditor.carla'];
            for (const u of who) {
                await signIn(page, u, {contextPath: PK});
                const c = await pub(page, cUrl(PK, '/management/settings/context'), `denied-${u}-settings`, {shotIt: u === 'author.alex'});
                fact(`denied-${u}-settings`, {...brief(c), main: flat(c.main, 300), links: c.mainLinks, h1raw: await page.locator('.pkp_structure_main h1').evaluateAll((e) => e.map((x) => x.outerHTML)).catch(() => null)});
                if (u === 'author.alex') {
                    const c2 = await pub(page, app.url('/index.php/index/admin'), `denied-${u}-admin`);
                    fact(`denied-${u}-admin`, {...brief(c2), main: flat(c2.main, 300)});
                    const c3 = await pub(page, cUrl(PK, '/management/settings/website'), `denied-${u}-website`);
                    fact(`denied-${u}-website`, {...brief(c3), main: flat(c3.main, 300)});
                    const c4 = await pub(page, cUrl(PK, '/stats/publications'), `denied-${u}-stats`);
                    fact(`denied-${u}-stats`, {...brief(c4), main: flat(c4.main, 300)});
                }
            }
            await signOut(page);
            const c = await pub(page, cUrl(PK, '/management/settings/context'), 'denied-signedout-settings');
            fact('denied-signedout-settings', brief(c));
        }

        // ── seed: A, B, C ───────────────────────────────────────────────────────────
        if (on('seed') && !st) {
            const isOPS = app.name === 'ops';
            const t = tag('u08k3');
            const P = (s) => `${t}${s}`;
            const U = {m: P('m'), s: P('s'), as: P('as'), au: P('au'), rd: P('rd')};
            const usersA = [
                {username: U.m, roles: ['manager'], givenName: 'Mona', familyName: 'K3Manager'},
                {username: U.s, roles: ['sectionEditor'], givenName: 'Sami', familyName: 'K3Section'},
                {username: U.as, roles: [isOPS ? 'editorialBoardMember' : 'copyeditor'], givenName: 'Asa', familyName: 'K3Assistant'},
                {username: U.au, roles: ['author'], givenName: 'Ada', familyName: 'K3Author'},
                {username: U.rd, roles: ['reader'], givenName: 'Rhea', familyName: 'K3Reader'},
            ];
            if (!isOPS) {
                U.e = P('e'); U.pe = P('pe'); U.rv = P('rv');
                usersA.push({username: U.e, roles: ['editor'], givenName: 'Eda', familyName: 'K3Editor'});
                usersA.push({username: U.pe, roles: ['productionEditor'], givenName: 'Pia', familyName: 'K3NoSettings'});
                usersA.push({username: U.rv, roles: ['externalReviewer'], givenName: 'Rev', familyName: 'K3Reviewer'});
            }
            const specA = {
                tag: `${t}a`,
                context: {name: `U08 K3 A ${t}`, acronym: 'K3A', description: `<p>About text of U08 K3 A ${t}.</p>`, supportedLocales: ['en', 'fr_CA']},
                users: usersA,
                plugins: {developedbyblockplugin: {enabled: true}},
                sidebar: ['developedbyblockplugin'],
                enableAnnouncements: true,
                numAnnouncementsHomepage: 2,
                announcements: [{title: `K3 announcement ${t}`, descriptionShort: '<p>Short text.</p>', description: '<p>Full text.</p>'}],
            };
            if (!isOPS) specA.roles = {productionEditor: {permitSettings: false}};
            const A = await app.api.createContext(specA);
            fact('seed-A', {path: A.path, users: A.users && A.users.map((u) => u.username), announcements: A.announcements});
            const subA = await app.api.createSubmission({tag: `${t}s1`, context: A.path, submitter: U.au, title: `K3 submitted ${t}`, participants: [{username: U.s, role: 'sectionEditor'}]});
            const pubA = await app.api.createSubmission({tag: `${t}p1`, context: A.path, submitter: U.au, title: `K3 published ${t}`, published: true});
            fact('seed-A-subs', {sub: subA.id || subA.submissionId || subA, pub: pubA.id || pubA.submissionId || pubA});
            const B = await app.api.createContext({tag: `${t}b`, context: {name: `U08 K3 B ${t}`, acronym: 'K3B'}, users: [{username: 'admin', roles: ['reader']}, {username: P('bm'), roles: ['manager'], givenName: 'Bo', familyName: 'K3BManager'}]});
            fact('seed-B', {path: B.path});
            const specC = {tag: `${t}c`, context: {name: `U08 K3 C ${t}`, acronym: 'K3C'}, users: [{username: P('cm'), roles: ['manager'], givenName: 'Cai', familyName: 'K3CManager'}, {username: P('ca'), roles: ['author'], givenName: 'Cal', familyName: 'K3CAuthor'}]};
            if (isOPS) specC.sections = [{abbrev: 'PRE', path: 'k3sec', title: 'Preprints'}];
            const C = await app.api.createContext(specC);
            fact('seed-C', {path: C.path});
            const pubsC = [];
            if (app.name !== 'ojs') {
                for (let i = 1; i <= 3; i++) {
                    const r = await app.api.createSubmission({tag: `${t}c${i}`, context: C.path, submitter: P('ca'), title: `K3 C item ${i} ${t}`, published: true});
                    pubsC.push(r.id || r.submissionId || null);
                }
            }
            st = {t, U: {...U, bm: P('bm'), cm: P('cm'), ca: P('ca')}, A: A.path, B: B.path, C: C.path, subA, pubA, pubsC};
            fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 1));
            fact('seed-state', {A: st.A, B: st.B, C: st.C, pubA: JSON.stringify(pubA).slice(0, 300)});
        }
        if (!st && ALL.slice(4).some(on)) throw new Error('no seed state: run PHASES=seed first');
        const U = st ? st.U : {};
        const as = async (u, ctx) => { if (!u) { await signOut(page).catch(() => {}); return; } await signIn(page, u, {contextPath: ctx || (st && st.A)}); await idle(page); };
        const snap = async (name, extra = {}, shotIt = false) => { const s = await screen(page); record(name, {...s, extra}); if (shotIt) await shot(page, name).catch(() => {}); return s; };
        const openWebsite = async (ctx, top) => { await page.goto(cUrl(ctx, '/management/settings/website')); await idle(page); await page.locator(`#${top}-button`).first().click(); await idle(page); await sleep(600); };
        const saveForm = async (inner) => {
            const form = page.locator('form').filter({has: page.locator(inner)}).first();
            const w = page.waitForResponse((r) => /\/api\/v1\/(contexts|site|_uploadPublicFile|temporaryFiles)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const resp = await w;
            const saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
            const errors = await page.locator('.pkpFieldError').allInnerTexts().catch(() => []);
            return {status: resp ? resp.status() : null, url: resp ? resp.url().replace(/^https?:\/\/[^/]+/, '') : null, saved, errors};
        };
        const hoverUser = async (name) => { await page.locator('#navigationUser > li').filter({hasText: name}).first().hover(); await sleep(300); };

        // ── edit: the "Edit" shortcut (Rule 25) ─────────────────────────────────────
        if (on('edit')) {
            const pages = [['about', '/about'], ['history', '/about/editorialHistory'], ['contact', '/about/contact'], ['announcements', '/announcement'], ['submissions', '/about/submissions'], ['masthead', '/about/editorialMasthead'], ['privacy', '/about/privacy'], ['home', '']];
            if (app.name !== 'ops') pages.push(['info-readers', '/information/readers'], ['info-authors', '/information/authors'], ['info-librarians', '/information/librarians']);
            const who = [['signedout', null], ['admin', 'admin'], ['manager', U.m], ['editor', U.e], ['noSettings', U.pe], ['sectionEditor', U.s], ['assistant', U.as], ['reviewer', U.rv], ['author', U.au], ['reader', U.rd]].filter(([, u]) => u !== undefined);
            for (const [lvl, u] of who) {
                await as(u);
                const row = {};
                for (const [k, p] of pages) {
                    const c = await pub(page, cUrl(st.A, p), `edit-${lvl}-${k}`, {shotIt: lvl === 'manager' && k === 'submissions'});
                    row[k] = {status: c.status, h1: c.h1, edit: c.edit.map((e) => `${e.text}|${e.sr}|${(e.href || '').replace(/^https?:\/\/[^/]+/, '')}|t=${e.target}|prev=${e.prev}`)};
                }
                fact(`edit-${lvl}`, row);
            }
            // press each "Edit" as the manager, and as the role without "Permit changes to Settings"
            for (const [lvl, u] of [['manager', U.m], ['noSettings', U.pe]]) {
                if (!u) continue;
                await as(u);
                const dest = {};
                for (const [k, p] of pages) {
                    await page.goto(cUrl(st.A, p)); await idle(page);
                    const n = await page.locator('a.cmp_edit_link').count();
                    for (let i = 0; i < n; i++) {
                        await page.goto(cUrl(st.A, p)); await idle(page);
                        const pagesBefore = context.pages().length;
                        await page.locator('a.cmp_edit_link').nth(i).click(); await idle(page); await sleep(800);
                        const sel = await page.locator('[role="tab"][aria-selected="true"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim())).catch(() => []);
                        dest[`${k}#${i}`] = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), title: await page.title(), tabs: sel, newWindow: context.pages().length > pagesBefore, h1: await page.locator('h1').allInnerTexts().catch(() => [])};
                        if (i === 0) await snap(`edit-press-${lvl}-${k}`);
                    }
                }
                fact(`edit-press-${lvl}`, dest);
            }
            // B: the Site Administrator with Reader alone (after admb), and B's manager
            await as(U.bm, st.B);
            const cb = await pub(page, cUrl(st.B, '/about'), 'edit-B-manager-about');
            fact('edit-B-manager-about', cb.edit);
        }

        // ── admb: the Site Administrator with Reader alone on B ─────────────────────
        if (on('admb')) {
            await as('admin', st.B);
            const before = await pub(page, cUrl(st.B, '/about'), 'admb-before-about');
            fact('admb-before', {user: brief(before).user, edit: before.edit});
            // Users & Roles › Users › Site Admin › Edit › "Remove Role" on the manager role
            await page.goto(cUrl(st.B, '/management/settings/access')); await idle(page); await sleep(800);
            const row = page.locator('tr').filter({hasText: 'admin@mail.test'}).first();
            await row.waitFor({timeout: T}).catch(() => {});
            const usersScreen = await snap('admb-users');
            if (usersScreen.text.dialog && /does not have access/.test(usersScreen.text.dialog)) {
                // the manager role is already gone (a re-run): the Users list answers "Error"
                fact('admb-users-error-dialog', flat(usersScreen.text.dialog, 200));
                await page.getByRole('dialog').getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            } else {
            await row.locator('button').last().click(); await sleep(500);
            const items = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
            await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 30000}).catch(() => {});
            await idle(page); await sleep(800);
            await snap('admb-user-edit');
            const roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            const mgrRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
            let removed = null;
            if (await mgrRow.count()) {
                await mgrRow.getByRole('button', {name: /Remove Role/i}).click(); await sleep(600);
                const dlg = page.locator('[role="dialog"]:visible').last();
                const txt = flat(await dlg.innerText().catch(() => ''), 300);
                const w = page.waitForResponse((r) => r.request().method() !== 'GET' && /\/api\/v1\//.test(r.url()), {timeout: T}).catch(() => null);
                await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
                const r = await w; await idle(page); await sleep(1000);
                removed = {dialog: txt, status: r ? r.status() : null};
            }
            fact('admb-remove', {menu: items, roleRows, removed});
            await snap('admb-user-edit-after');
            }
            // the public pages now
            for (const [k, p] of [['home', ''], ['about', '/about'], ['contact', '/about/contact'], ['submissions', '/about/submissions']]) {
                const c = await pub(page, cUrl(st.B, p), `admb-after-${k}`);
                fact(`admb-after-${k}`, {user: brief(c).user, edit: c.edit});
            }
            await page.goto(cUrl(st.B, '')); await idle(page);
            await hoverUser('admin');
            await page.locator('#navigationUser > li > ul a').filter({hasText: /Dashboard/}).first().click(); await idle(page);
            await snap('admb-dashboard-dest');
            fact('admb-dashboard-dest', {url: page.url(), title: await page.title()});
            const c2 = await pub(page, cUrl(st.B, '/management/settings/context'), 'admb-settings');
            fact('admb-settings', {url: c2.url, title: c2.title, h1: c2.h1});
        }

        // ── count: the unread number (Rule 19b) ─────────────────────────────────────
        if (on('count')) {
            for (const [lvl, u] of [['manager', U.m], ['admin', 'admin'], ['editor', U.e], ['sectionEditor', U.s], ['author', U.au], ['assistant', U.as], ['reader', U.rd]]) {
                if (!u) continue;
                await as(u);
                const c = await pub(page, cUrl(st.A, ''), `count-${lvl}-home`);
                // the editorial header's own count, for comparison
                await page.goto(cUrl(st.A, '/dashboard/editorial')); await idle(page);
                const bell = await page.locator('header').innerText().catch(() => null);
                fact(`count-${lvl}`, {user: brief(c).user, editorialHeader: flat(bell, 200)});
            }
        }

        // ── devby: the "Developed By" block (Rule 21) ───────────────────────────────
        if (on('devby')) {
            await as(null);
            const pg = [['home', ''], ['about', '/about'], ['search', '/search'], ['login', '/login'], ['announcements', '/announcement'], ['register', '/user/register'], ['lostpw', '/login/lostPassword']];
            for (const [k, p] of pg) {
                const c = await pub(page, cUrl(st.A, p), `devby-A-${k}`, {shotIt: k === 'home'});
                fact(`devby-A-${k}`, {status: c.status, sidebar: c.sidebar, besides: c.sidebarBesideMain, hasSidebarClass: c.hasSidebarClass});
            }
            // the published item's page
            const item = page.locator('.pkp_structure_main a').filter({hasText: /K3 published/}).first();
            await page.goto(cUrl(st.A, app.name === 'ojs' ? '' : app.name === 'omp' ? '/catalog' : '/preprints')); await idle(page);
            if (await item.count()) {
                await item.click(); await idle(page);
                const c = await pub(page, page.url(), 'devby-A-item', {shotIt: true});
                fact('devby-A-item', {url: c.url, sidebar: c.sidebar, besides: c.sidebarBesideMain, crumbs: brief(c).crumbs});
            } else fact('devby-A-item', 'no item link on the listing');
            // French
            const cf = await pub(page, cUrl(st.A, '/fr_CA/about'), 'devby-A-fr');
            fact('devby-A-fr', {sidebar: cf.sidebar, primary: brief(cf).primary, user: brief(cf).user});
            // access-denied and a message page carry the block too?
            await as(U.rd);
            const cd = await pub(page, cUrl(st.A, '/management/settings/context'), 'devby-A-denied');
            fact('devby-A-denied', {sidebar: cd.sidebar});
            // C: defaults, then enabled on screen, then placed on screen
            await as(null);
            const c0 = await pub(page, cUrl(st.C, ''), 'devby-C-default');
            fact('devby-C-default', {sidebar: c0.sidebar, hasSidebarClass: c0.hasSidebarClass});
            await as(U.cm, st.C);
            await openWebsite(st.C, 'plugins');
            await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            const row = page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Developed By'}).first();
            const rowText = (await row.count()) ? flat(await row.innerText(), 300) : null;
            await loc(page, 'Plugins grid: the "Developed By" Block row', row);
            const cb = row.getByRole('checkbox').first();
            const wasOn = await cb.isChecked().catch(() => null);
            const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
            await cb.click({noWaitAfter: true}).catch(() => {});
            const r = await w; await idle(page); await sleep(800);
            const toast = await page.locator('.pkpNotification, .pkp_notification, [role="status"]').allInnerTexts().catch(() => []);
            await snap('devby-C-enabled', {rowText});
            fact('devby-C-enable', {rowText, wasOn, status: r ? r.status() : null, toast: toast.map((x) => flat(x, 200)), nowOn: await cb.isChecked().catch(() => null)});
            await as(null);
            const c1 = await pub(page, cUrl(st.C, ''), 'devby-C-enabled-home');
            fact('devby-C-enabled-not-placed', {sidebar: c1.sidebar});
            await as(U.cm, st.C);
            await openWebsite(st.C, 'appearance');
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page); await sleep(600);
            const list = await page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            await snap('devby-C-sidebar-list', {list});
            const box = page.locator('input[name="sidebar"][value="developedbyblockplugin"]');
            await loc(page, 'Appearance › Setup › Sidebar: the "Developed By" box', box);
            let save = null;
            if (await box.count()) { await box.check(); save = await saveForm('input[name="sidebar"]'); }
            fact('devby-C-place', {list, save});
            await as(null);
            const c2 = await pub(page, cUrl(st.C, ''), 'devby-C-placed-home', {shotIt: true});
            const link = page.locator('.pkp_structure_sidebar a').filter({hasText: /Open (Journal|Monograph|Preprint)/}).first();
            await loc(page, 'sidebar "Developed By" link', link);
            fact('devby-C-placed', {sidebar: c2.sidebar, headingSR: await page.locator('.pkp_structure_sidebar h2').evaluateAll((e) => e.map((x) => ({text: x.textContent.trim(), cls: x.className, rect: x.getBoundingClientRect().width})))});
        }

        // ── skip: skip links on A's home (announcements; the summary on/off) ────────
        if (on('skip')) {
            await as(null);
            let c = await pub(page, cUrl(st.A, ''), 'skip-A-home-before', {shotIt: true});
            fact('skip-A-before', {skip: c.skip});
            await as(U.m);
            await openWebsite(st.A, 'appearance');
            const themeTab = page.locator('#appearance').getByRole('tab', {name: 'Theme', exact: true});
            if (await themeTab.count()) { await themeTab.click(); await idle(page); await sleep(600); }
            const optName = app.name === 'ojs' ? 'showDescriptionInJournalIndex' : app.name === 'omp' ? 'showDescriptionInPressIndex' : 'showDescriptionInServerIndex';
            const box = page.locator(`input[name="${optName}"]`).first();
            const label = await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            await loc(page, `Appearance › Theme: "${optName}" box`, box);
            let save = null;
            if (await box.count()) { await box.check(); save = await saveForm(`input[name="${optName}"]`); }
            fact('skip-theme-option', {label, save});
            await as(null);
            c = await pub(page, cUrl(st.A, ''), 'skip-A-home-after', {shotIt: true});
            fact('skip-A-after', {skip: c.skip});
            const moves = [];
            for (let i = 0; i < c.skip.length; i++) {
                await page.goto(cUrl(st.A, '')); await idle(page);
                for (let k = 0; k <= i; k++) await page.keyboard.press('Tab');
                await sleep(150);
                const before = await page.evaluate(() => (document.activeElement.textContent || '').trim());
                await page.keyboard.press('Enter'); await sleep(400);
                const hash = await page.evaluate(() => location.hash);
                await page.keyboard.press('Tab'); await sleep(150);
                const next = await page.evaluate(() => { const a = document.activeElement; const sec = a.closest('section, .homepage_about, .cmp_announcements, .current_issue, .pkp_structure_footer_wrapper, nav, .pkp_structure_main'); return {text: (a.textContent || '').trim().slice(0, 60), inside: sec ? (sec.id || sec.className) : null}; });
                moves.push({before, hash, nextTab: next});
            }
            fact('skip-A-moves', moves);
        }

        // ── imp: Login As, "Logout as" on the public user menu ──────────────────────
        if (on('imp')) {
            await as('admin');
            await page.goto(cUrl(st.A, '/management/settings/access')); await idle(page); await sleep(800);
            const row = page.locator('tr').filter({hasText: 'K3Reader'}).first();
            await row.waitFor({timeout: T}).catch(() => {});
            await row.locator('button').last().click(); await sleep(500);
            const items = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
            await page.getByRole('menuitem', {name: /Login As/i}).first().click().catch(() => {});
            await sleep(600);
            const dlg = page.getByRole('dialog').filter({hasText: /Log in as this user/}).last();
            const dlgText = flat(await dlg.innerText().catch(() => ''), 300);
            await dlg.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await sleep(1500); await idle(page);
            const landed = page.url();
            const c = await pub(page, cUrl(st.A, ''), 'imp-home', {shotIt: true});
            await hoverUser(U.rd); await shot(page, 'imp-user-menu-open');
            fact('imp-menu', {items, dlgText, landed, user: brief(c).user});
            await page.locator('#navigationUser > li > ul a').filter({hasText: /Logout/}).first().click(); await idle(page); await sleep(800);
            const c2 = await chrome(page);
            fact('imp-after-logout-as', {url: page.url(), user: brief(c2).user});
            await snap('imp-after-logout-as');
        }

        // ── look: C's header logo and "Page Footer"; the tab left unsaved ───────────
        if (on('look')) {
            await as(null);
            const c0 = await pub(page, cUrl(st.C, '/about'), 'look-C-before');
            fact('look-C-before', {site: brief(c0).site, footer: c0.footer});
            await as(U.cm, st.C);
            await openWebsite(st.C, 'appearance');
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page); await sleep(600);
            const input = page.locator('input[type=file][id*="pageHeaderLogoImage"]').first();
            const png = path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files/profile-image-400.png`);
            let upload = null;
            if (await input.count()) {
                const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await input.setInputFiles(png);
                const r = await up; upload = r ? r.status() : null; await idle(page); await sleep(800);
            }
            // the "Page Footer" rich-text box
            const fid = await page.locator('textarea[id*="pageFooter"]').first().getAttribute('id').catch(() => null);
            if (fid) {
                await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, fid, {timeout: T}).catch(() => {});
                const frame = page.frameLocator(`#${fid}_ifr`);
                await frame.locator('body').click();
                await page.keyboard.type(`K3 footer text ${st.t}`);
            }
            await loc(page, 'Appearance › Setup: "Page Footer" editor', page.locator(`#${fid}_ifr`));
            const save = await saveForm('textarea[id*="pageFooter"]');
            await snap('look-C-appearance-saved', {upload, save, fid});
            fact('look-C-save', {upload, save, fid});
            await as(null);
            for (const [k, p] of [['home', ''], ['about', '/about'], ['search', '/search']]) {
                const c = await pub(page, cUrl(st.C, p), `look-C-after-${k}`, {shotIt: k === 'home'});
                fact(`look-C-after-${k}`, {site: brief(c).site, footer: c.footer, srH1: c.srH1});
            }
            await page.goto(cUrl(st.C, '/about')); await idle(page);
            await page.locator('.pkp_site_name a').click(); await idle(page);
            fact('look-C-press-logo', page.url());
            // leaving a tabbed Settings page with an unsaved change
            await as(U.cm, st.C);
            const dialogs = [];
            const onDlg = (d) => dialogs.push({type: d.type(), message: d.message()});
            page.on('dialog', onDlg);
            await openWebsite(st.C, 'appearance');
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page); await sleep(600);
            if (fid) { await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, fid, {timeout: T}).catch(() => {}); await page.frameLocator(`#${fid}_ifr`).locator('body').click(); await page.keyboard.type(' UNSAVED'); }
            await page.locator('#setup-button').first().click(); await idle(page); await sleep(600);
            const afterTab = await snap('look-C-left-tab-unsaved');
            await page.locator('#appearance-button').first().click(); await idle(page); await sleep(600);
            const back = fid ? await page.evaluate((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).getContent(), fid).catch(() => null) : null;
            await page.goto(cUrl(st.C, '/about')); await idle(page);
            await page.goto(cUrl(st.C, '/management/settings/website')); await idle(page);
            await page.locator('#appearance-button').first().click(); await idle(page); await sleep(800);
            const reopened = fid ? await page.evaluate((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).getContent(), fid).catch(() => null) : null;
            page.off('dialog', onDlg);
            fact('look-C-leave', {dialogs, backOnTab: back, reopened, afterTabUrl: afterTab.url});
        }

        // ── reg: C closed to registration (Rule 18) and the refusal page (Rule 26) ──
        if (on('reg')) {
            await as(null);
            let c = await pub(page, cUrl(st.C, ''), 'reg-C-open');
            fact('reg-C-open', brief(c).user);
            await as(U.cm, st.C);
            await page.goto(cUrl(st.C, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(600);
            const radios = await page.locator('input[name="disableUserReg"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            const r = page.locator('input[name="disableUserReg"][value="true"]');
            await loc(page, 'Site Access Options: the "disableUserReg" choice that closes registration', r);
            let save = null;
            if (await r.count()) { await r.check(); save = await saveForm('input[name="disableUserReg"]'); }
            fact('reg-C-close', {radios, save});
            await as(null);
            c = await pub(page, cUrl(st.C, ''), 'reg-C-closed');
            fact('reg-C-closed', brief(c).user);
            c = await pub(page, cUrl(st.C, '/user/register'), 'reg-C-register-refused', {shotIt: true});
            fact('reg-C-register-refused', {...brief(c), main: flat(c.main, 400), links: c.mainLinks});
            c = await pub(page, app.url('/index.php/index/user/register'), 'reg-site-register');
            fact('reg-site-register', {user: brief(c).user, main: flat(c.main, 600)});
        }

        // ── msg: message pages (Rule 26) ────────────────────────────────────────────
        if (on('msg')) {
            await as(null);
            // lost password, C's manager
            await page.goto(cUrl(st.C, '/login/lostPassword')); await idle(page);
            await page.locator('input#email, input[name="email"]').first().fill(`${U.cm}@mail.test`);
            await page.locator('form#lostPasswordForm button[type="submit"], form button[type="submit"]').first().click();
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            await snap('msg-lostpw-sent', {}, true);
            const c = {...(await chrome(page)), url: page.url(), title: await page.title()};
            fact('msg-lostpw-sent', {...brief(c), main: flat(c.main, 400), links: c.mainLinks});
            // registration on A (open), a new account
            const rn = `k3r${Math.random().toString(36).slice(2, 7)}`;
            await page.goto(cUrl(st.A, '/user/register')); await idle(page);
            const f = page.locator('form#register');
            await f.locator('input[name="givenName"]').fill('Reg');
            await f.locator('input[name="familyName"]').fill('K3Registered');
            await f.locator('input[name="affiliation"]').fill('K3').catch(() => {});
            await f.locator('select[name="country"]').selectOption('CA').catch(() => {});
            await f.locator('input[name="email"]').fill(`${rn}@mail.test`);
            await f.locator('input[name="username"]').fill(rn);
            await f.locator('input[name="password"]').fill('k3pass12345678');
            await f.locator('input[name="password2"]').fill('k3pass12345678');
            for (const b of await f.locator('input[type="checkbox"][name="privacyConsent"], input[type="checkbox"][name^="privacyConsent"]').all()) await b.check().catch(() => {});
            await f.locator('button[type="submit"]').first().click();
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            const s = await snap('msg-register-complete', {}, true);
            const cc = await chrome(page);
            fact('msg-register-complete', {url: page.url(), title: await page.title(), crumbs: brief(cc).crumbs, h1: cc.h1, main: flat(cc.main, 500), links: cc.mainLinks, user: brief(cc).user});
        }

        // ── pages: page links (Rule 24) ─────────────────────────────────────────────
        if (on('pages')) {
            const lists = app.name === 'ojs' ? [['archive', '/issue/archive']] : app.name === 'omp' ? [['catalog', '/catalog']] : [['preprints', '/preprints'], ['section', '/preprints/section/k3sec']];
            if (app.name === 'ojs' && !st.issuesMade) {
                const {createIssue, publishIssue} = require(path.resolve(__dirname, '../../../../../apps/ojs/playwright/pages/PublicationMetadataPages.js'));
                await as(U.cm, st.C);
                for (const n of ['1', '2', '3']) {
                    await createIssue(page, st.C, {volume: '7', number: n, year: '2020', title: `K3 issue ${n}`});
                    await page.goto(cUrl(st.C, '/manageIssues')); await idle(page);
                    await publishIssue(page, `Vol. 7 No. ${n} (2020)`);
                }
                st.issuesMade = true;
                fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 1));
                // an article in an issue, for the breadcrumbs
                const r = await app.api.createSubmission({tag: `${st.t}ci`, context: st.C, submitter: U.ca, title: `K3 article in issue ${st.t}`, published: true, issue: {volume: 7, number: 1, year: 2020}});
                st.issueArticle = r.submissionId || null;
                fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 1));
                fact('pages-issues', {made: true, article: st.issueArticle});
            }
            await as(null);
            for (const [k, p] of lists) {
                const c = await pub(page, cUrl(st.C, p), `pages-C-${k}-default`);
                fact(`pages-C-${k}-default`, {status: c.status, pagination: c.pagination, main: flat(c.main, 300)});
            }
            // the Lists tab: its default, then 1
            await as(U.cm, st.C);
            await openWebsite(st.C, 'setup');
            const listsTab = page.getByRole('tab', {name: 'Lists', exact: true}).filter({visible: true}).first();
            await listsTab.click(); await idle(page); await sleep(500);
            const ipp = page.locator('input[name="itemsPerPage"]').first();
            const npl = page.locator('input[name="numPageLinks"]').first();
            const tabText = flat(await page.locator('[role="tabpanel"]:visible form').first().innerText().catch(() => ''), 600);
            const before = {itemsPerPage: await ipp.inputValue().catch(() => null), numPageLinks: await npl.inputValue().catch(() => null), tabText};
            await snap('pages-C-lists-tab', before);
            await loc(page, 'Website › Setup › "Lists": "Items per page"', ipp);
            await ipp.fill('1');
            const save = await saveForm('input[name="itemsPerPage"]');
            fact('pages-C-lists', {before, save});
            await as(null);
            for (const [k, p] of lists) {
                const seen = [];
                let url = cUrl(st.C, p);
                for (let i = 0; i < 4 && url; i++) {
                    const c = await pub(page, url, `pages-C-${k}-p${i + 1}`, {shotIt: i === 1});
                    seen.push({url: c.url, pagination: c.pagination, items: flat(c.main, 200)});
                    url = c.pagination && c.pagination.next;
                }
                fact(`pages-C-${k}-one-per-page`, seen);
                // press "Next" then "Previous" on screen
                await page.goto(cUrl(st.C, p)); await idle(page);
                const nx = page.locator('.cmp_pagination a.next');
                if (await nx.count()) {
                    await loc(page, 'page links: "Next"', nx);
                    await nx.click(); await idle(page);
                    const u1 = page.url();
                    await page.locator('.cmp_pagination a.prev').click(); await idle(page);
                    fact(`pages-C-${k}-press`, {next: u1.replace(/^https?:\/\/[^/]+/, ''), prev: page.url().replace(/^https?:\/\/[^/]+/, '')});
                }
            }
            // A's home (OJS: the home page lists published articles too?) — record for the sweep
            const ch = await pub(page, cUrl(st.C, ''), 'pages-C-home');
            fact('pages-C-home', {pagination: ch.pagination, main: flat(ch.main, 400)});
        }

        // ── crumbs: breadcrumbs with a middle step (Rule 23) ────────────────────────
        if (on('crumbs')) {
            await as(null);
            const annId = 1;
            const out = {};
            let c = await pub(page, cUrl(st.A, '/announcement'), 'crumbs-A-announcements');
            out.announcements = brief(c).crumbs;
            const annLink = page.locator('.pkp_structure_main a').filter({hasText: /K3 announcement/}).first();
            if (await annLink.count()) {
                await annLink.click(); await idle(page);
                c = await pub(page, page.url(), 'crumbs-A-announcement-view');
                out.announcementView = {url: c.url, crumbs: brief(c).crumbs, h1: c.h1};
                await page.locator('.cmp_breadcrumbs a').nth(1).click().catch(() => {}); await idle(page);
                out.pressMiddle = page.url();
            }
            // the published item's page
            const listUrl = app.name === 'ojs' ? '' : app.name === 'omp' ? '/catalog' : '/preprints';
            await page.goto(cUrl(st.A, listUrl)); await idle(page);
            const it = page.locator('.pkp_structure_main a').filter({hasText: /K3 published/}).first();
            if (await it.count()) { await it.click(); await idle(page); c = await pub(page, page.url(), 'crumbs-A-item', {shotIt: true}); out.item = {url: c.url, crumbs: brief(c).crumbs, h1: c.h1, label: c.crumbs && c.crumbs.label}; }
            if (app.name === 'ojs' && st.issueArticle) {
                c = await pub(page, cUrl(st.C, `/article/view/${st.issueArticle}`), 'crumbs-C-article-in-issue', {shotIt: true});
                out.articleInIssue = {url: c.url, crumbs: brief(c).crumbs, h1: c.h1, label: c.crumbs && c.crumbs.label};
                c = await pub(page, cUrl(st.C, '/issue/archive'), 'crumbs-C-archive');
                out.archive = brief(c).crumbs;
            }
            if (app.name === 'omp') {
                c = await pub(page, cUrl(PK, '/catalog/series/monographs'), 'crumbs-pk-series');
                out.series = {crumbs: brief(c).crumbs, h1: c.h1, title: c.title};
                c = await pub(page, cUrl(PK, '/catalog/newReleases'), 'crumbs-pk-newreleases');
                out.newReleases = brief(c).crumbs;
            }
            if (app.name === 'ops') {
                c = await pub(page, cUrl(PK, '/preprints/category/comp-sci'), 'crumbs-pk-subcategory');
                out.subcategory = {crumbs: brief(c).crumbs, h1: c.h1};
                c = await pub(page, cUrl(st.C, '/preprints/section/k3sec'), 'crumbs-C-section');
                out.section = {crumbs: brief(c).crumbs, h1: c.h1};
            }
            fact('crumbs', out);
        }

        // ── search: the "Search" item placed in C's primary menu (Rule 17) ──────────
        if (on('search')) {
            await as(U.cm, st.C);
            await page.goto(cUrl(st.C, '/management/settings/website#setup/navigationMenus')); await idle(page);
            const menus = page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]:visible').first();
            await menus.waitFor({timeout: T}).catch(() => {});
            await idle(page); await sleep(400);
            await menus.getByRole('link', {name: 'Primary Navigation Menu', exact: true}).first().click();
            const editor = page.locator('[data-cy="navigation-menu-editor"]:visible').first();
            await editor.waitFor({timeout: T}); await idle(page); await sleep(600);
            const titles = async (cy) => editor.locator(`[data-cy="panel-content-${cy}"] [data-menu-item-title]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-menu-item-title')));
            const before = {assigned: await titles('assigned'), unassigned: await titles('unassigned')};
            const src = editor.locator('[data-cy="panel-content-unassigned"] [data-menu-item-title="Search"]').first();
            const lastTop = before.assigned.includes('About') ? 'About' : before.assigned[before.assigned.length - 1];
            // drop above the first top-level item, the way K1 drags (pointer down, move, up)
            const target = editor.locator(`[data-cy="panel-content-assigned"] [data-menu-item-title="${before.assigned[0]}"]`).first();
            const handle = src.locator('[title="Drag to reorder"]').first();
            await src.scrollIntoViewIfNeeded();
            const sb = await handle.boundingBox();
            await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
            await page.mouse.down();
            await page.mouse.move(sb.x + sb.width / 2 + 10, sb.y + sb.height / 2 + 6, {steps: 5});
            const tb = await target.boundingBox();
            await page.mouse.move(tb.x + tb.width / 2, tb.y + 3, {steps: 15}); await sleep(250);
            await page.mouse.move(tb.x + tb.width / 2 + 1, tb.y + 3, {steps: 2}); await sleep(250);
            await page.mouse.up(); await sleep(600);
            const after = {assigned: await titles('assigned'), unassigned: await titles('unassigned')};
            await snap('search-C-menu-window', {before, after, lastTop});
            const win = page.locator('[role="dialog"]:visible').filter({has: page.locator('[data-cy="navigation-menu-editor"]')}).first();
            await win.getByRole('button', {name: 'Save', exact: true}).click(); await sleep(1500); await idle(page);
            fact('search-C-drag', {before, after});
            await as(null);
            for (const [k, p] of [['home', ''], ['about', '/about'], ['search', '/search']]) {
                const c = await pub(page, cUrl(st.C, p), `search-C-${k}`, {shotIt: k === 'home'});
                fact(`search-C-${k}`, {primary: brief(c).primary, primaryLinks: (c.primary || []).map((i) => [i.text, (i.href || '').replace(/^https?:\/\/[^/]+/, '')]), headerSearch: c.search && c.search.text});
            }
        }

        // ── sitedash: the user menu on the site's own pages (Rule 19c), now that ───
        //    every fleet hosts several contexts
        if (on('sitedash')) {
            for (const [lvl, u] of [['admin', 'admin'], ['manager', 'manager.maya'], ['reader', 'reader.rosa'], ['scratchManager', U.m]]) {
                await signIn(page, u); await idle(page);
                const landed = page.url();
                const c = await pub(page, app.url('/index.php/index/index'), `sitedash-${lvl}-index`);
                const top = page.locator('#navigationUser > li').filter({hasText: u}).first();
                const res = {landed, url: c.url, user: brief(c).user, site: brief(c).site};
                if (await top.count()) {
                    await top.hover(); await sleep(300);
                    await page.locator('#navigationUser > li > ul a').filter({hasText: /Dashboard/}).first().click(); await idle(page);
                    await snap(`sitedash-${lvl}-dashboard-dest`);
                    res.dashboard = {url: page.url(), title: await page.title()};
                }
                fact(`sitedash-${lvl}`, res);
            }
            await signOut(page);
            const c = await pub(page, app.url('/index.php/index/index'), 'sitedash-signedout-index', {shotIt: true});
            fact('sitedash-signedout', {url: c.url, site: brief(c).site, user: brief(c).user, primary: brief(c).primary, search: brief(c).search, footer: c.footer, h1: c.h1, srH1: c.srH1});
        }

        // ── narrow2: a narrow window signed in (the lists under the items) ──────────
        if (on('narrow2')) {
            await as(U.m);
            await page.setViewportSize({width: 375, height: 800});
            await page.goto(cUrl(st.A, '')); await idle(page);
            await page.locator('.pkp_site_nav_toggle').click(); await sleep(500);
            const c = await chrome(page);
            await shot(page, 'narrow2-A-open');
            record('narrow2-A-open', c);
            fact('narrow2-A-open', {primary: (c.primary || []).map((i) => ({t: i.text, v: i.visible, href: i.href, kids: i.children && i.children.map((k) => `${k.text}:${k.visible}`)})), user: (c.user || []).map((i) => ({t: i.text, v: i.visible, href: i.href, kids: i.children && i.children.map((k) => `${k.text}:${k.visible}`)}))});
            const aboutTop = page.locator('#navigationPrimary > li').filter({has: page.locator(':scope > ul')}).first().locator(':scope > a');
            await aboutTop.click(); await sleep(500); await idle(page);
            fact('narrow2-press-about', {url: page.url()});
            await page.setViewportSize({width: 1280, height: 900});
        }

        // ── site: the site's "Page Footer" and logo set, read, restored ─────────────
        if (on('site')) {
            await as('admin', 'index');
            await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
            await page.locator('#appearance-button').first().click(); await idle(page); await sleep(700);
            const setupTab = page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true});
            if (await setupTab.count()) { await setupTab.click(); await idle(page); await sleep(600); }
            await snap('site-appearance-setup');
            const fid = await page.locator('textarea[id*="pageFooter"]').first().getAttribute('id').catch(() => null);
            const input = page.locator('input[type=file][id*="pageHeaderLogoImage"]').first();
            const png = path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files/profile-image-400.png`);
            let upload = null;
            if (await input.count()) {
                const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await input.setInputFiles(png); const r = await up; upload = r ? r.status() : null; await idle(page); await sleep(800);
            }
            if (fid) {
                await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, fid, {timeout: T}).catch(() => {});
                await page.frameLocator(`#${fid}_ifr`).locator('body').click();
                await page.keyboard.type(`K3 site footer ${st.t}`);
            }
            const save = await saveForm('textarea[id*="pageFooter"]');
            fact('site-set', {fid, upload, save});
            await signOut(page);
            for (const [k, p] of [['index', '/index.php/index/index'], ['login', '/index.php/index/login'], ['search', '/index.php/index/search']]) {
                const c = await pub(page, app.url(p), `site-set-${k}`, {shotIt: k === 'index'});
                fact(`site-set-${k}`, {site: brief(c).site, footer: c.footer});
            }
            const cj = await pub(page, cUrl(st.C, '/about'), 'site-set-journal-C');
            fact('site-set-journal-C', {footer: cj.footer});
            // restore: empty the footer, remove the logo
            await as('admin', 'index');
            await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
            await page.locator('#appearance-button').first().click(); await idle(page); await sleep(700);
            if (await setupTab.count()) { await setupTab.click(); await idle(page); await sleep(600); }
            if (fid) {
                await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, fid, {timeout: T}).catch(() => {});
                await page.frameLocator(`#${fid}_ifr`).locator('body').click();
                await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
            }
            const logoField = page.locator('.pkpFormField').filter({has: page.locator('input[type=file][id*="pageHeaderLogoImage"]')}).first();
            const rm = logoField.getByRole('button', {name: /Remove|Delete/}).first();
            let removed = null;
            if (await rm.count()) { await rm.click(); await sleep(500); const conf = page.locator('[role="dialog"]:visible').last(); if (await conf.count()) { removed = flat(await conf.innerText(), 200); await conf.getByRole('button', {name: /^(Yes|OK|Remove|Confirm)$/}).first().click().catch(() => {}); } else removed = 'no confirm'; }
            const save2 = await saveForm('textarea[id*="pageFooter"]');
            await signOut(page);
            const c2 = await pub(page, app.url('/index.php/index/login'), 'site-restored-login');
            fact('site-restore', {removed, save2, site: brief(c2).site, footer: c2.footer});
        }

        // ── extra: a category page's trail [OJS]; French ticked on screen on C (A7) ─
        if (on('extra')) {
            await as(null);
            if (app.name === 'ojs') {
                const c = await pub(page, cUrl(PK, '/catalog/category/comp-sci'), 'extra-pk-subcategory');
                fact('extra-pk-subcategory', {status: c.status, crumbs: brief(c).crumbs, h1: c.h1});
            }
            await as(U.cm, st.C);
            await page.goto(cUrl(st.C, '/management/settings/website#setup/languages')); await idle(page);
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: T}).catch(() => {});
            await idle(page); await sleep(500);
            const rows = () => page.locator('#languageGridContainer').evaluate((c) => ({columns: [...c.querySelectorAll('thead th')].map((t) => t.innerText.trim()), rows: [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' ').slice(0, 60), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => `${b.id.replace(/^.*?-(\w+_?\w*-\w+Locale).*$/, '$1')}:${b.checked}`)}))}));
            const before = await rows();
            const ui = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-uiLocale"]').first();
            let post = null;
            if ((await ui.count()) && !(await ui.isChecked())) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /save-language-setting/.test(r.url()), {timeout: T}).catch(() => null);
                await ui.click(); const r = await w; post = r ? r.status() : null; await idle(page); await sleep(800);
            }
            const after = await rows();
            await snap('extra-C-languages', {before, after, post});
            fact('extra-C-languages', {before, after, post});
            await as(null);
            const cf = await pub(page, cUrl(st.C, '/fr_CA/about'), 'extra-C-fr-about', {shotIt: true});
            fact('extra-C-fr-about', {lang: cf.lang, primary: brief(cf).primary, user: brief(cf).user, search: cf.search && cf.search.text, toggle: cf.toggle && cf.toggle.text, crumbs: brief(cf).crumbs});
        }

        // ── sitelogo: the site's logo uploaded, read, removed (Rule 15a) ────────────
        if (on('sitelogo')) {
            const openSiteSetup = async () => {
                await as('admin', 'index');
                await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
                await page.locator('#appearance-button').first().click(); await idle(page); await sleep(700);
                const t = page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true});
                if (await t.count()) { await t.click(); await idle(page); await sleep(600); }
            };
            await openSiteSetup();
            const inputs = await page.locator('input[type=file]').evaluateAll((els) => els.map((e) => ({id: e.id, name: e.name, cls: e.className, inForm: !!e.closest('form'), field: (e.closest('.pkpFormField') || {}).className || null})));
            const logoField = page.locator('.pkpFormField').filter({hasText: /^\s*Logo/}).first();
            const input = page.locator('input[type=file][id*="pageHeaderLogo"], input[type=file][id*="ogo"]').first();
            const png = path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files/profile-image-400.png`);
            let upload = null;
            const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            if (await input.count()) await input.setInputFiles(png);
            else {
                const [chooser] = await Promise.all([page.waitForEvent('filechooser', {timeout: 10000}).catch(() => null), page.getByRole('button', {name: 'Upload File'}).first().click()]);
                if (chooser) await chooser.setFiles(png);
            }
            const r = await up; upload = r ? r.status() : null; await idle(page); await sleep(800);
            const save = await saveForm('textarea[id*="pageFooter"]');
            await snap('sitelogo-set', {inputs, upload, save});
            await signOut(page);
            const c = await pub(page, app.url('/index.php/index/login'), 'sitelogo-login', {shotIt: true});
            fact('sitelogo-set', {inputs, upload, save, site: brief(c).site});
            // remove it
            await openSiteSetup();
            const fieldTexts = flat(await page.locator('.pkpFormField').filter({has: page.locator('img')}).first().innerText().catch(() => ''), 200);
            const rm = page.getByRole('button', {name: /^(Remove|Delete)/}).first();
            let removed = null;
            if (await rm.count()) {
                await rm.click(); await sleep(600);
                const conf = page.locator('[role="dialog"]:visible').last();
                if (await conf.count()) { removed = flat(await conf.innerText(), 200); await conf.getByRole('button', {name: /^(Yes|OK|Remove|Confirm|Delete)$/}).first().click().catch(() => {}); } else removed = 'no confirm';
                await sleep(500);
            }
            const save2 = await saveForm('textarea[id*="pageFooter"]');
            await signOut(page);
            const c2 = await pub(page, app.url('/index.php/index/login'), 'sitelogo-removed-login');
            fact('sitelogo-removed', {fieldTexts, removed, save2, site: brief(c2).site});
        }

        // ── layout: where the header's parts sit in a wide window (Rule 15) ────────
        if (on('layout')) {
            for (const [lvl, u] of [['signedout', null], ['reader', 'reader.rosa']]) {
                if (u) await signIn(page, u, {contextPath: PK}); else await signOut(page).catch(() => {});
                await page.goto(cUrl(PK, '/about')); await idle(page);
                const boxes = await page.evaluate(() => {
                    const b = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)}; };
                    const order = [...document.querySelectorAll('header .cmp_skip_to_content, header .pkp_site_name, header #navigationPrimary, header .pkp_navigation_search_wrapper, header #navigationUser')].map((e) => e.id || e.className.split(' ')[0]);
                    return {vw: innerWidth, name: b('.pkp_site_name'), primary: b('#navigationPrimary'), search: b('.pkp_navigation_search_wrapper'), user: b('#navigationUser'), order};
                });
                await shot(page, `layout-${lvl}`);
                fact(`layout-${lvl}`, boxes);
            }
        }

        // ── sitename (LAST; not reversible: the form refuses an empty "Site Name") ──
        if (on('sitename')) {
            await signOut(page).catch(() => {});
            const before = await pub(page, app.url('/index.php/index/login'), 'sitename-before-login');
            await as('admin', 'index');
            await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
            await page.locator('#setup-button').first().click(); await idle(page); await sleep(600);
            const setTab = page.getByRole('tab', {name: 'Settings', exact: true}).filter({visible: true}).first();
            if (await setTab.count()) { await setTab.click(); await idle(page); await sleep(600); }
            const box = page.locator('input[name="title-en"], input[id*="title-control-en"]').first();
            const was = await box.inputValue().catch(() => null);
            let save = null;
            if (was === '' || was === null) { await box.fill('K3 Test Site'); save = await saveForm('input[id*="title-control-en"]'); }
            await snap('sitename-settings', {was, save});
            await signOut(page);
            const after = await pub(page, app.url('/index.php/index/login'), 'sitename-after-login', {shotIt: true});
            const idx = await pub(page, app.url('/index.php/index/index'), 'sitename-after-index');
            fact('sitename', {was, save, before: brief(before).site, after: brief(after).site, afterTitle: after.title, index: {site: brief(idx).site, srH1: idx.srH1, title: idx.title}});
            note(`Site "Site Name" set to "K3 Test Site" on the ${app.name} fleet by ccK3 (U08 Rule 15a, the name branch); it cannot be emptied again (the form refuses an empty name), a reset clears it.`);
        }

        // ── secount: a Section Editor with an unread task (A2's count, the N end) ──
        if (on('secount')) {
            if (!st.seTask) {
                const r = await app.api.createSubmission({tag: `${st.t}s2`, context: st.A, submitter: U.au, title: `K3 SE task ${st.t}`, participants: [{username: U.s, role: 'sectionEditor'}], tasks: [{title: `K3 discussion for SE ${st.t}`, creator: U.m, participants: [U.m, U.s]}]});
                st.seTask = r.submissionId || true;
                fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 1));
            }
            for (const [lvl, u] of [['sectionEditor', U.s], ['manager', U.m]]) {
                await as(u);
                const c = await pub(page, cUrl(st.A, ''), `secount-${lvl}-home`);
                await page.goto(cUrl(st.A, '/dashboard/editorial')); await idle(page);
                const hdr = flat(await page.locator('header').innerText().catch(() => ''), 200);
                await snap(`secount-${lvl}-editorial`);
                fact(`secount-${lvl}`, {user: brief(c).user, editorialHeader: hdr});
            }
        }

        // ── series [OMP]: why the series page's heading and last step are empty ────
        if (on('series') && app.name === 'omp') {
            await signIn(page, 'manager.maya', {contextPath: PK}); await idle(page);
            await page.goto(cUrl(PK, '/management/settings/context')); await idle(page);
            await page.getByRole('tab', {name: 'Series', exact: true}).first().click().catch(() => {}); await idle(page); await sleep(800);
            const rows = await page.locator('[role="tabpanel"]:visible tr.gridRow, [role="tabpanel"]:visible table tbody tr').allInnerTexts().catch(() => []);
            await snap('series-pk-settings');
            await signOut(page);
            const c = await pub(page, cUrl(PK, '/catalog/series/monographs'), 'series-pk-page', {shotIt: true});
            const cf = await pub(page, cUrl(PK, '/catalog/series/textbooks'), 'series-pk-page2');
            fact('series-pk', {rows: rows.map((x) => flat(x, 120)), page: {title: c.title, crumbs: brief(c).crumbs, h1: c.h1, main: flat(c.main, 200)}, page2: {title: cf.title, h1: cf.h1}});
        }

        // merge into the facts file of earlier runs (one process per phase set)
        const ff = path.join(outDir(), `facts-${app.name}.json`);
        const prev = fs.existsSync(ff) ? JSON.parse(fs.readFileSync(ff, 'utf8')) : {};
        record('facts', {...prev, ...facts});
        fs.writeFileSync(path.join(outDir(), `k3-log-${app.name}-${Date.now()}.txt`), lines.join('\n'));
    } finally {
        await close();
    }
});
