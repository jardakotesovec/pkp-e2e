// U16 claim check, chunk K5: the "Browse" block (the block's fields, Rules 14 and 15), Settings bullets 7–9
// ("Browse Block" on Plugins and its "Sidebar" box, the press's block "Settings", OJS "Include a listing of
// categories"), register A10 and OMP2. Spec: docs/specs/U16-categories.md lines 121–128, 221–237, 306–321,
// 510–516, 542–551; footnotes h, m, td12, f-a10, f-omp2.
//
//   PROBE_FEATURE=U16 PROBE_AGENT=ccK5 node bin/probe.js <app|all> shared/playwright/checks/U16/K5/k5.js
//   PHASES=seed,fresh,tree,many,omp,series,theme,controls (default: all; later phases read
//   k5-state-<app>.json, so a phase can be re-run alone).
//
// Scratch contexts per app (tag prefix u16k5):
//   E  no category, a manager: the Plugins row and "Sidebar" box as a new context has them, enabled and
//      placed through the screens (A10, the press's empty block), the unsaved leave of "Setup".
//   T  the seeded press's tree plus Zoology, Arts, Science › Physics › Optics › Lasers and Science ›
//      Astronomy (created in that order, so creation order and name order differ), the block enabled and
//      placed by the harness; a manager and a reader (Rules 14, 15, OMP2, the press's "Settings",
//      OJS "Include a listing of categories").
//   M  thirty top-level categories, the block placed (the count axis of "every category").
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'fresh', 'tree', 'many', 'omp', 'series', 'theme', 'controls'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k5]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k5-state-${app.name}.json`);

// What the page's "Browse" block holds, as the visitor sees it, plus every `.current` element's look.
function READ_BLOCK() {
    const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
    const rel = (h) => (h || '').replace(/^https?:\/\/[^/]+/, '');
    const cs = (e) => { if (!e) return null; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), color: s.color, paddingLeft: s.paddingLeft, marginLeft: s.marginLeft, borderLeft: `${s.borderLeftWidth} ${s.borderLeftStyle} ${s.borderLeftColor}`, cursor: s.cursor, display: s.display, visibility: s.visibility}; };
    const side = document.querySelector('.pkp_structure_sidebar');
    const b = document.querySelector('.block_browse');
    const walk = (ul, depth) => [...ul.children].filter((li) => li.tagName === 'LI').map((li) => {
        const a = li.querySelector(':scope > a');
        const sub = li.querySelector(':scope > ul');
        const own = [...li.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(' ');
        const hdr = li.querySelector(':scope > .category_header');
        return {depth, liCls: li.className || null, own: own || txt(hdr) || null, a: a ? {t: txt(a), href: rel(a.getAttribute('href')), cls: a.className.trim() || null, style: cs(a)} : null, liStyle: cs(li), children: sub ? walk(sub, depth + 1) : []};
    });
    const nav = b && b.querySelector('nav');
    const topUl = nav && nav.querySelector(':scope > ul');
    const links = b ? [...b.querySelectorAll('a')].map((a) => ({t: txt(a), href: rel(a.getAttribute('href')), cls: a.className.trim() || null, liCls: a.parentElement.className || null, x: Math.round(a.getBoundingClientRect().x), color: getComputedStyle(a).color, border: getComputedStyle(a).borderLeftWidth, pad: getComputedStyle(a).paddingLeft, liX: Math.round(a.parentElement.getBoundingClientRect().x)})) : [];
    return {
        url: rel(location.href),
        title: document.title,
        sidebarPresent: !!side,
        sidebarBlocks: side ? [...side.querySelectorAll('.pkp_block')].map((x) => x.className) : [],
        block: b ? {
            text: b.innerText,
            headingTag: (b.querySelector('.title') || {}).tagName || null,
            heading: txt(b.querySelector('.title')),
            navLabel: nav ? nav.getAttribute('aria-label') : null,
            tree: topUl ? walk(topUl, 0) : [],
            links,
            html: b.outerHTML.replace(/\s+/g, ' ').slice(0, 3000),
            visible: b.offsetParent !== null,
            box: cs(b),
        } : null,
        currents: [...document.querySelectorAll('.current')].map((e) => ({tag: e.tagName, cls: e.className, text: txt(e) && txt(e).slice(0, 80), inBlock: !!e.closest('.block_browse'), inBreadcrumb: !!e.closest('.cmp_breadcrumbs'), style: cs(e)})),
        breadcrumb: (() => { const bc = document.querySelector('.cmp_breadcrumbs'); if (!bc) return null; return {text: txt(bc), items: [...bc.querySelectorAll('li')].map((li) => ({t: txt(li), cls: li.className || null, style: cs(li)}))}; })(),
        homeCategories: (() => { const r = document.querySelector('.categoryHeader_categories, .archiveHeader_categories, .cmp_categories, .homepage_categories'); return r ? {cls: r.className, text: txt(r), links: [...r.querySelectorAll('a')].map((a) => ({t: txt(a), href: rel(a.getAttribute('href'))}))} : null; })(),
        h1: [...document.querySelectorAll('h1')].map(txt),
    };
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k5-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const catOp = isOPS ? 'preprints' : 'catalog';

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u16k5');
        S.t = t;
        const ctx = (p, name) => ({name: `U16 K5 ${name} ${p}`, acronym: 'KFIVE', contactName: 'K5 Contact', contactEmail: `${p}c@mail.test`});
        // E: nothing but a manager
        const pe = `${t}e`;
        const re = await app.api.createContext({tag: pe, context: ctx(pe, 'empty'), users: [{username: `${pe}mg`, roles: ['manager'], givenName: 'Ema', familyName: 'Manager'}]});
        S.E = {path: re.path || pe, mg: `${pe}mg`};
        // T: the tree; creation order differs from name order on purpose
        const pt = `${t}t`;
        const tree = [
            {path: 'zoo', title: 'Zoology'},
            {path: 'applied-science', title: 'Applied Science', children: [
                {path: 'comp-sci', title: 'Computer Science', children: [{path: 'computer-vision', title: 'Computer Vision'}]},
                {path: 'eng', title: 'Engineering'}]},
            {path: 'social-sciences', title: 'Social Sciences', children: [{path: 'sociology', title: 'Sociology'}, {path: 'anthropology', title: 'Anthropology'}]},
            {path: 'arts', title: 'Arts'},
            {path: 'sci', title: 'Science', children: [
                {path: 'phys', title: 'Physics', children: [{path: 'optics', title: 'Optics', children: [{path: 'lasers', title: 'Lasers'}]}]},
                {path: 'astro', title: 'Astronomy'}]},
        ];
        const rt = await app.api.createContext({tag: pt, context: ctx(pt, 'tree'), categories: tree,
            plugins: {browseblockplugin: {enabled: true}}, sidebar: ['browseblockplugin'],
            users: [{username: `${pt}mg`, roles: ['manager'], givenName: 'Tia', familyName: 'Manager'}, {username: `${pt}rd`, roles: ['reader'], givenName: 'Ted', familyName: 'Reader'}]});
        S.T = {path: rt.path || pt, mg: `${pt}mg`, rd: `${pt}rd`, cats: rt.categories};
        // M: thirty top-level categories
        const pm = `${t}m`;
        const many = Array.from({length: 30}, (_, i) => ({path: `c${String(i + 1).padStart(2, '0')}`, title: `Topic ${String(i + 1).padStart(2, '0')}`}));
        const rm = await app.api.createContext({tag: pm, context: ctx(pm, 'many'), categories: many,
            plugins: {browseblockplugin: {enabled: true}}, sidebar: ['browseblockplugin'], users: [{username: `${pm}mg`, roles: ['manager'], givenName: 'Moe', familyName: 'Manager'}]});
        S.M = {path: rm.path || pm, mg: `${pm}mg`};
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    // ------------------------------------------------------------------ browser and helpers
    const B = await launch(app);
    const page = B.page;
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: flat(d.message(), 300), url: page.url().replace(app.baseURL, '')}); d.accept().catch(() => {}); });
    const V = await launch(app);
    const vis = V.page;
    const cu = (p, rest = '') => app.url(`/index.php/${p}/en${rest}`);
    const catPage = (p, c) => cu(p, `/${catOp}/category/${c}`);
    const snap = async (pg, name, extra = {}) => {
        const s = await screen(pg).catch((e) => ({error: String(e.message || e)}));
        record(name, {...s, ...extra});
        await shot(pg, name).catch(() => {});
        return s;
    };
    const sect = async (name, fn) => {
        log(app.name, '== phase', name);
        try { await fn(); } catch (e) {
            fact(`ERROR-${name}`, String(e.stack || e).slice(0, 1200));
            await shot(page, `zz-error-${name}`).catch(() => {});
        }
    };
    const asMgr = async (C) => { await signIn(page, C.mg, {contextPath: C.path}); await idle(page); };
    const land = async (pg, url, name) => {
        let status = null;
        try { const r = await pg.goto(url); status = r ? r.status() : null; } catch (e) { status = String(e.message || e).slice(0, 200); }
        await idle(pg).catch(() => {});
        await snap(pg, name);
        const d = await pg.evaluate(READ_BLOCK).catch((e) => ({error: String(e.message || e)}));
        record(name, {status, read: d}, {merge: true});
        return {status, ...d};
    };
    const brief = (d) => ({status: d.status, url: d.url, h1: d.h1, sidebar: d.sidebarBlocks, heading: d.block && d.block.heading, headingTag: d.block && d.block.headingTag,
        text: d.block && flat(d.block.text, 800), links: d.block && d.block.links.map((l) => `${l.t}|${l.href}|${l.liCls || ''}|${l.cls || ''}|x${l.x}|li${l.liX}|${l.color}|b${l.border}|p${l.pad}`)});

    // Settings › Website: a top tab, then an Appearance side tab
    const openTab = async (C, top, side) => {
        await page.goto('about:blank');
        await page.goto(cu(C.path, '/management/settings/website'));
        await idle(page);
        const t = page.locator(`#${top}-button`).first();
        await t.waitFor({timeout: T});
        if ((await t.getAttribute('aria-selected')) !== 'true') { await t.click(); await idle(page); }
        if (side) {
            const s = page.locator(`#${side}-button`).first();
            await s.waitFor({timeout: T});
            if ((await s.getAttribute('aria-selected')) !== 'true') { await s.click(); await idle(page); }
        }
        await sleep(700);
        return page.locator(`[role="tabpanel"]#${side || top}`).first();
    };
    const pluginRow = () => page.locator('tr.gridRow[id$="-row-browseblockplugin"]').first();
    const readRow = async () => {
        const row = pluginRow();
        await row.waitFor({timeout: T}).catch(() => {});
        if (!(await row.count())) return {present: false};
        return row.evaluate((tr) => {
            const box = tr.querySelector('input[type=checkbox]');
            const next = tr.nextElementSibling;
            return {present: true, id: tr.id, text: tr.innerText.replace(/\s+/g, ' ').trim(), checked: box ? box.checked : null, boxDisabled: box ? box.disabled : null,
                arrow: !!tr.querySelector('a.show_extras'), nextRowLinks: next && /row_controls|row_actions/.test(next.className) ? [...next.querySelectorAll('a')].map((a) => a.innerText.trim()).filter(Boolean) : null};
        });
    };
    const setPlugin = async (want) => {
        const row = pluginRow();
        await row.waitFor({timeout: T});
        const box = row.getByRole('checkbox').first();
        const was = await box.isChecked();
        if (was === want) return {was, changed: false};
        const w = page.waitForResponse((r) => /plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true});
        await sleep(800);
        let ask = null;
        const dlg = page.locator('[role="dialog"]:visible').last();
        if (await dlg.count()) {
            ask = flat(await dlg.innerText().catch(() => ''), 400);
            const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const r = await w;
        await sleep(900); await idle(page);
        const toast = (await page.locator('.pkp_notification, .pkpNotification, [class*="toast"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
        return {was, changed: true, ask, status: r ? r.status() : null, toast, now: await box.isChecked().catch(() => null)};
    };
    const sidebarList = async () => page.locator('#appearance-setup input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: ((e.closest('label') || e.parentElement).querySelector('.pkpFormField--options__optionLabel') || e.closest('label') || {}).textContent?.trim()})));
    const saveIn = async (scope) => {
        const resp = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()) && !/temporaryFiles/.test(r.url()), {timeout: T}).catch(() => null);
        await scope.getByRole('button', {name: 'Save', exact: true}).last().click();
        const r = await resp;
        const saved = await scope.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
        await idle(page);
        const errors = await scope.locator('.pkpFieldError').allInnerTexts().catch(() => []);
        return {status: r ? r.status() : null, url: r ? r.url().replace(/^.*\/index\.php/, '') : null, saved, errors};
    };
    const formFields = async (panel) => panel.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        return [...root.querySelectorAll('.pkpFormField')].filter((f) => f.offsetParent !== null).map((f) => ({
            label: txt(f.querySelector('.pkpFormFieldLabel, legend, .pkpFormField__heading, label')),
            options: [...f.querySelectorAll('input[type=radio], input[type=checkbox]')].map((i) => `${i.checked ? '[x]' : '[ ]'} ${txt(i.closest('label')) || i.value}`),
        }));
    }).catch((e) => ({error: String(e.message || e)}));

    // ------------------------------------------------------------------ fresh: a new context's Plugins row and "Sidebar" box, placed through the screens (Settings 7, A10, Rule 15's empty press)
    if (on('fresh')) await sect('fresh', async () => {
        const out = {};
        const C = S.E;
        await asMgr(C);
        await openTab(C, 'plugins');
        out.row0 = await readRow();
        await snap(page, 'f-01-plugins-fresh', {row: out.row0});
        await loc(page, 'Plugins: the "Browse Block" row', pluginRow());
        await loc(page, 'Plugins: the "Browse Block" row\'s "Enabled" box', pluginRow().getByRole('checkbox'));
        let panel = await openTab(C, 'appearance', 'appearance-setup');
        await panel.locator('input[name="sidebar"]').first().waitFor({timeout: T}).catch(() => {});
        out.sidebar0 = await sidebarList();
        await snap(page, 'f-02-setup-sidebar-fresh', {sidebar: out.sidebar0});
        // the visitor's home and About before (the About breadcrumb's look, for the `.current` read)
        out.home0 = brief(await land(vis, cu(C.path), 'f-03-home-before'));
        const about0 = await land(vis, cu(C.path, '/about'), 'f-04-about-before');
        out.about0Crumb = about0.breadcrumb;
        // enable on Plugins (OJS/OPS; a press arrives enabled)
        await openTab(C, 'plugins');
        out.enable = await setPlugin(true);
        out.row1 = await readRow();
        await snap(page, 'f-05-plugins-enabled', {enable: out.enable, row: out.row1});
        // enabled, not placed: the visitor's home
        out.home1 = brief(await land(vis, cu(C.path), 'f-06-home-enabled-unplaced'));
        // "Setup": tick the box, leave unsaved (side tab and back, then another page)
        panel = await openTab(C, 'appearance', 'appearance-setup');
        await panel.locator('input[name="sidebar"]').first().waitFor({timeout: T}).catch(() => {});
        out.sidebar1 = await sidebarList();
        const bx = page.locator('#appearance-setup input[name="sidebar"][value="browseblockplugin"]').first();
        out.boxCount = await bx.count();
        await loc(page, 'Appearance › Setup: the "Browse Block" box in "Sidebar"', bx);
        if (out.boxCount) {
            await bx.setChecked(true); await sleep(300);
            const n0 = dialogs.length;
            await page.locator('#theme-button').first().click(); await idle(page); await sleep(400);
            await page.locator('#appearance-setup-button').first().click(); await idle(page); await sleep(400);
            out.unsavedAfterSideTab = await bx.isChecked().catch(() => null);
            await page.locator('#plugins-button').first().click(); await idle(page); await sleep(400);
            await page.locator('#appearance-button').first().click(); await idle(page); await sleep(400);
            out.unsavedAfterTopTab = await bx.isChecked().catch(() => null);
            await snap(page, 'f-07-setup-unsaved-back');
            await page.goto(cu(C.path, '/dashboard/editorial')).catch(() => {}); await idle(page);
            out.leaveDialogs = dialogs.slice(n0);
            panel = await openTab(C, 'appearance', 'appearance-setup');
            await panel.locator('input[name="sidebar"]').first().waitFor({timeout: T}).catch(() => {});
            out.afterLeave = await bx.isChecked().catch(() => null);
            await snap(page, 'f-08-setup-after-leave', {afterLeave: out.afterLeave, dialogs: out.leaveDialogs});
            // now tick and save
            await bx.setChecked(true); await sleep(300);
            out.saveSetup = await saveIn(panel);
            out.sidebar2 = await sidebarList();
            await snap(page, 'f-09-setup-saved', {save: out.saveSetup, sidebar: out.sidebar2});
        }
        // placed, no category: A10 / Rule 15's empty press
        out.home2 = brief(await land(vis, cu(C.path), 'f-10-home-placed-empty'));
        const about2 = await land(vis, cu(C.path, '/about'), 'f-11-about-placed');
        out.about2Crumb = about2.breadcrumb;
        out.about2Currents = about2.currents;
        const bl = vis.locator('.block_browse');
        out.blockAria = await bl.ariaSnapshot({timeout: 3000}).catch(() => null);
        await loc(vis, 'Sidebar: the "Browse" block', bl);
        await signOut(page);
        fact('fresh', out);
    });

    // ------------------------------------------------------------------ tree: Rules 14, 15, OMP2, links, the marked link, signed-in reads
    if (on('tree')) await sect('tree', async () => {
        const out = {};
        const C = S.T;
        const home = await land(vis, cu(C.path), 't-01-home-visitor');
        out.home = brief(home);
        out.tree = home.block && home.block.tree;
        out.blockAria = await vis.locator('.block_browse').ariaSnapshot({timeout: 3000}).catch(() => null);
        await loc(vis, 'Browse block: category links', vis.locator('.block_browse nav a'));
        await loc(vis, 'Browse block: the marked link', vis.locator('.block_browse a.current, .block_browse li.current > a'));
        // every link lands on its category's page
        out.linkLandings = [];
        for (const l of (home.block ? home.block.links : [])) {
            const r = await vis.goto(app.url(l.href)).catch(() => null);
            await idle(vis).catch(() => {});
            const h = await vis.evaluate(() => ({h1: [...document.querySelectorAll('h1')].map((e) => e.innerText.trim()), crumb: (document.querySelector('.cmp_breadcrumbs') || {}).innerText})).catch(() => ({}));
            out.linkLandings.push({t: l.t, href: l.href, status: r ? r.status() : null, h1: h.h1, crumb: flat(h.crumb, 200)});
        }
        await snap(vis, 't-02-last-link-landed', {landings: out.linkLandings});
        // the marked link on a category's page: depth 1, 2, 4; a top-level with children
        for (const [key, c] of [['phys', 'phys'], ['lasers', 'lasers'], ['sci', 'sci'], ['arts', 'arts'], ['vision', 'computer-vision']]) {
            const d = await land(vis, catPage(C.path, c), `t-03-page-${key}`);
            out[`page_${key}`] = {status: d.status, h1: d.h1, marked: d.block ? d.block.links.filter((x) => /current/.test(`${x.cls || ''} ${x.liCls || ''}`)) : null,
                currents: d.currents.map((x) => ({tag: x.tag, text: x.text, inBlock: x.inBlock, inBreadcrumb: x.inBreadcrumb, color: x.style.color, pad: x.style.paddingLeft, border: x.style.borderLeft, cursor: x.style.cursor})),
                links: brief(d).links};
        }
        // a signed-in reader and the manager see the same block
        await signIn(vis, C.rd, {contextPath: C.path}); await idle(vis);
        out.reader = brief(await land(vis, cu(C.path), 't-04-home-reader'));
        await signOut(vis);
        await signIn(vis, C.mg, {contextPath: C.path}); await idle(vis);
        out.manager = brief(await land(vis, cu(C.path), 't-05-home-manager'));
        await signOut(vis);
        // another page (an ordinary page with a breadcrumb): the block and the breadcrumb's current step
        const about = await land(vis, cu(C.path, '/about'), 't-06-about-visitor');
        out.aboutCurrents = about.currents;
        fact('tree', out);
    });

    // ------------------------------------------------------------------ many: thirty categories
    if (on('many')) await sect('many', async () => {
        const d = await land(vis, cu(S.M.path), 'm-01-home-thirty');
        fact('many', {count: d.block ? d.block.links.length : null, first: d.block && d.block.links.slice(0, 3).map((l) => l.t), last: d.block && d.block.links.slice(-3).map((l) => l.t), box: d.block && d.block.box, text: d.block && flat(d.block.text, 400)});
    });

    // ------------------------------------------------------------------ omp: the press's block "Settings" (Settings 8, Rule 15); controls on OJS/OPS (no arrow, no "Settings")
    if (on('omp')) await sect('omp', async () => {
        const out = {};
        const C = S.T;
        await asMgr(C);
        await openTab(C, 'plugins');
        out.row = await readRow();
        await snap(page, 'o-01-plugins-row', {row: out.row});
        if (!isOMP) { fact('omp-control', out); await signOut(page); return; }
        const openSettings = async () => {
            await openTab(C, 'plugins');
            const row = pluginRow();
            await row.locator('a.show_extras').click(); await sleep(700);
            const link = row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Settings', exact: true});
            await link.click(); await sleep(1200); await idle(page);
            const w = page.locator('[role=dialog]:visible').last();
            await w.locator('input[type=checkbox]').first().waitFor({timeout: T});
            await sleep(500);
            return w;
        };
        const boxes = (w) => w.locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, label: e.labels && e.labels[0] ? e.labels[0].innerText.trim() : null})));
        const submit = async (w) => {
            const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /manage/.test(r.url()), {timeout: T}).catch(() => null);
            await w.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await resp;
            await sleep(1200); await idle(page);
            const toast = (await page.locator('.pkp_notification, .pkpNotification, [class*="toast"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
            return {status: r ? r.status() : null, url: r ? r.url().replace(app.baseURL, '').slice(0, 200) : null, windowOpen: await w.isVisible().catch(() => false), toast};
        };
        let w = await openSettings();
        out.window = {text: flat(await w.innerText().catch(() => ''), 800), boxes: await boxes(w), buttons: (await w.locator('button:visible, a:visible').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean)};
        await snap(page, 'o-02-settings-window', {window: out.window});
        await loc(page, 'Browse Block settings window', page.locator('[role=dialog]:visible').last());
        await loc(page, 'Browse Block settings: the "Categories" box', w.getByRole('checkbox', {name: 'Categories', exact: true}));
        // sweep: untick "Categories", "Cancel", reopen
        await w.getByRole('checkbox', {name: 'Categories', exact: true}).setChecked(false);
        const n0 = dialogs.length;
        await w.getByRole('link', {name: 'Cancel'}).or(w.getByRole('button', {name: 'Cancel'})).first().click().catch(() => {});
        await sleep(900);
        out.cancelDialogs = dialogs.slice(n0);
        w = await openSettings();
        out.afterCancel = await boxes(w);
        await snap(page, 'o-03-reopened-after-cancel', {boxes: out.afterCancel});
        // untick "Categories" and save
        await w.getByRole('checkbox', {name: 'Categories', exact: true}).setChecked(false);
        out.saveOff = await submit(w);
        await snap(page, 'o-04-saved-categories-off', {save: out.saveOff});
        w = await openSettings();
        out.afterSaveOff = await boxes(w);
        await w.getByRole('link', {name: 'Cancel'}).or(w.getByRole('button', {name: 'Cancel'})).first().click().catch(() => {});
        await sleep(600);
        out.homeOff = brief(await land(vis, cu(C.path), 'o-05-home-categories-off'));
        out.pageOff = brief(await land(vis, catPage(C.path, 'phys'), 'o-06-phys-categories-off'));
        // the other end: all three unticked
        w = await openSettings();
        for (const n of ['New releases', 'Series']) await w.getByRole('checkbox', {name: n, exact: true}).setChecked(false);
        out.saveNone = await submit(w);
        out.homeNone = brief(await land(vis, cu(C.path), 'o-07-home-all-off'));
        // back to all three ticked
        w = await openSettings();
        for (const n of ['New releases', 'Categories', 'Series']) await w.getByRole('checkbox', {name: n, exact: true}).setChecked(true);
        out.saveAll = await submit(w);
        w = await openSettings();
        out.afterAll = await boxes(w);
        await w.getByRole('link', {name: 'Cancel'}).or(w.getByRole('button', {name: 'Cancel'})).first().click().catch(() => {});
        out.homeAll = brief(await land(vis, cu(C.path), 'o-08-home-all-on'));
        await signOut(page);
        fact('omp', out);
    });

    // ------------------------------------------------------------------ series {OMP}: a series added through the screens, then the block's "Series" list
    if (on('series') && isOMP) await sect('series', async () => {
        const out = {};
        const C = S.T;
        await asMgr(C);
        await page.goto(cu(C.path, '/management/settings/context')); await idle(page);
        out.tabs = (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => x.trim());
        const st = page.getByRole('tab', {name: 'Series', exact: true}).first();
        await st.click(); await idle(page); await sleep(1000);
        await snap(page, 's-01-series-tab');
        const add = page.getByRole('link', {name: /Add Series/}).or(page.getByRole('button', {name: /Add Series/})).first();
        out.addCount = await add.count();
        if (out.addCount) {
            await add.click(); await sleep(1500); await idle(page);
            const w = page.locator('[role=dialog]:visible').last();
            await w.locator('input[name^="title"]').first().waitFor({timeout: T}).catch(() => {});
            await snap(page, 's-02-add-series-window');
            await w.locator('input[name^="title"]').first().fill('Handbooks');
            const p = w.locator('input[name="path"]');
            if (await p.count()) await p.fill('handbooks');
            const resp = page.waitForResponse((r) => r.request().method() !== 'GET' && /series|section/i.test(r.url()), {timeout: T}).catch(() => null);
            await w.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await resp;
            await sleep(1500); await idle(page);
            out.save = {status: r ? r.status() : null, url: r ? r.url().replace(app.baseURL, '').slice(0, 160) : null, open: await w.isVisible().catch(() => false), errors: flat(await w.innerText().catch(() => ''), 300)};
            await snap(page, 's-03-after-save', {save: out.save});
        }
        out.home = brief(await land(vis, cu(C.path), 's-04-home-with-series'));
        await signOut(page);
        fact('series', out);
    });

    // ------------------------------------------------------------------ theme: OJS "Include a listing of categories" (Settings 9); controls on OMP/OPS
    if (on('theme')) await sect('theme', async () => {
        const out = {};
        const C = S.T;
        await asMgr(C);
        const panel = await openTab(C, 'appearance', 'theme');
        await panel.locator('.pkpFormField').first().waitFor({timeout: T}).catch(() => {});
        out.before = await formFields(panel);
        await snap(page, 'h-01-theme-before', {fields: out.before});
        out.homeBefore = await land(vis, cu(C.path), 'h-02-home-before');
        out.homeBefore = {cats: out.homeBefore.homeCategories};
        const box = panel.getByRole('checkbox', {name: 'Include a listing of categories', exact: true});
        out.boxCount = await box.count();
        if (out.boxCount) {
            await loc(page, 'Theme: "Include a listing of categories"', box);
            await box.setChecked(true);
            out.save = await saveIn(panel);
            const p2 = await openTab(C, 'appearance', 'theme');
            await p2.locator('.pkpFormField').first().waitFor({timeout: T}).catch(() => {});
            out.after = await formFields(p2);
            await snap(page, 'h-03-theme-after', {save: out.save});
            const h = await land(vis, cu(C.path), 'h-04-home-ticked');
            out.homeAfter = {cats: h.homeCategories};
            await loc(vis, 'Home: the row of categories', vis.locator('.categoryHeader_categories, .archiveHeader_categories').first());
        }
        await signOut(page);
        fact('theme', out);
    });

    // ------------------------------------------------------------------ controls: the seeded context's Plugins row as its manager (read only)
    if (on('controls')) await sect('controls', async () => {
        await signIn(page, 'manager.maya', {contextPath: app.contextPath}); await idle(page);
        await page.goto(cu(app.contextPath, '/management/settings/website')); await idle(page);
        await page.locator('#plugins-button').first().click(); await idle(page); await sleep(800);
        const row = await readRow();
        await snap(page, 'c-01-publicknowledge-plugins', {row});
        const home = brief(await land(vis, cu(app.contextPath), 'c-02-publicknowledge-home'));
        await signOut(page);
        fact('controls', {row, home});
    });

    fact('dialogs', dialogs);
    await B.close();
    await V.close();
});
