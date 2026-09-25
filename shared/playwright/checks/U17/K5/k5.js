// U17 claim check, chunk K5: the OPS "Archives" page, the archive header and a section's page.
// Spec: docs/specs/U17-sections.md lines 244–277 (Rules 14–16), 374–376 (Settings 14), 385–389
// (Settings 17), register OPS1, OPS2, OPS4; footnotes f, q, td13, td14, f-ops1, f-ops2, f-ops4.
//
//   PROBE_FEATURE=U17 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U17/K5/k5.js
//   PHASES=seed,pk,empty,posted,many,twin,menu,links,leave,controls (default: all). OPS runs every phase but
//   `controls`; OJS and OMP run `controls` only (read-only, on `publicknowledge`). Later phases read
//   k5-state-ops.json, so a phase can be re-run alone (one-time changes are marked done there; P's
//   "Items per page" (25 <-> 2) and T's first two sections swap on screen every run, reads labelled by the state).
//
// Scratch preprint servers (tag prefix u17k5):
//   E  nothing posted, no category, the default section untouched: the empty "Archives" page, the
//      home page's header with no category, the section window (Settings 14, OPS2), a description
//      typed and saved, the path changed.
//   P  three sections (Preprints "preprints", Letters "letters", Old Section "old"), two top-level
//      categories and a child, five preprints posted on different days (seeded out of date order),
//      one submitted but not posted, one scheduled: order, sections' pages, inactive, "Items per
//      page" 25 → 2 on screen, paging, links to a section's page, a menu item added by hand (OPS4).
//   M  26 posted preprints in the one section: paging at the default 25.
//   T  "Preprints" (path "preprints") plus "Twin" (path "preprints") and "Odd" (path "a b/c") made on
//      screen: which section owns a shared path, before and after the order is changed.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');
const nav = require('../../U08/K2/lib.js');

const T = 20_000;
const ALL = ['seed', 'pk', 'empty', 'posted', 'many', 'twin', 'menu', 'links', 'leave', 'controls'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k5]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k5-state-${app.name}.json`);

// The public page as data: headings, trail, archive header, the list, page links, the section's
// description, every link to a section's page, the primary menu.
function READ() {
    const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
    const rel = (h) => (h == null ? null : String(h).replace(/^https?:\/\/[^/]+/, ''));
    const ah = document.querySelector('.archiveHeader');
    const before = (a, b) => (a && b ? !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : null);
    const lists = [...document.querySelectorAll('ul.cmp_preprint_list')];
    const items = (ul) => [...ul.children].filter((li) => li.tagName === 'LI').map((li) => ({
        title: txt(li.querySelector('.title')) || txt(li.querySelector('h3, h2, h4')),
        href: rel(li.querySelector('.title a, a')?.getAttribute('href')),
        text: (txt(li) || '').slice(0, 400),
        links: [...li.querySelectorAll('a')].map((a) => ({t: txt(a), href: rel(a.getAttribute('href'))})),
        cls: [...li.querySelectorAll('[class]')].slice(0, 12).map((e) => e.className),
    }));
    const pag = document.querySelector('.cmp_pagination');
    const main = document.querySelector('.pkp_structure_main') || document.body;
    const latest = document.querySelector('.homepage_latest_preprints');
    const sd = document.querySelector('.about_section');
    return {
        url: rel(location.href),
        title: document.title,
        h1: [...document.querySelectorAll('h1')].map(txt),
        h2: [...document.querySelectorAll('.pkp_structure_main h2, .page h2')].map(txt),
        breadcrumbs: (() => { const bc = document.querySelector('.cmp_breadcrumbs'); return bc ? {text: txt(bc), items: [...bc.querySelectorAll('li')].map((li) => ({t: txt(li), href: rel(li.querySelector('a')?.getAttribute('href'))}))} : null; })(),
        archiveHeader: ah ? {
            search: (() => { const f = ah.querySelector('form'); return f ? {action: rel(f.getAttribute('action')), method: f.getAttribute('method'), role: f.getAttribute('role'), label: f.getAttribute('aria-label'), inputs: [...f.querySelectorAll('input')].map((i) => ({name: i.name, type: i.type, aria: i.getAttribute('aria-label'), value: i.value})), button: txt(f.querySelector('button'))} : null; })(),
            categories: [...ah.querySelectorAll('.archiveHeader_categories a')].map((a) => ({t: txt(a), href: rel(a.getAttribute('href'))})),
            categoriesListItems: ah.querySelectorAll('.archiveHeader_categories li').length,
            text: txt(ah),
            beforeFirstList: lists[0] ? before(ah, lists[0]) : null,
            beforeLatest: latest ? before(ah, latest) : null,
            visible: ah.offsetParent !== null,
        } : null,
        lists: lists.map((ul) => ({cls: ul.className, inLatest: !!ul.closest('.homepage_latest_preprints'), items: items(ul)})),
        latestHeading: latest ? txt(latest.querySelector('h2')) : null,
        pagination: pag ? {text: txt(pag), prev: rel(pag.querySelector('a.prev')?.getAttribute('href')), next: rel(pag.querySelector('a.next')?.getAttribute('href')), current: txt(pag.querySelector('.current')), label: pag.getAttribute('aria-label')} : null,
        sectionDescription: sd ? {cls: sd.className, html: (sd.querySelector('.description')?.innerHTML || '').trim(), text: txt(sd)} : null,
        emptyTexts: [...document.querySelectorAll('.page > p, p.section_empty, .page_issue_archive > p')].map(txt),
        rawKeys: (main.innerText.match(/##[^#\s]+##/g) || []),
        sectionLinks: [...document.querySelectorAll('a[href*="/preprints/section"]')].map((a) => ({t: txt(a), href: rel(a.getAttribute('href')), in: (a.closest('header, nav, footer, .archiveHeader, .pkp_structure_sidebar, .cmp_breadcrumbs, .page, .obj_preprint_details, .obj_preprint_summary') || {}).className || null})),
        primaryMenu: [...document.querySelectorAll('#navigationPrimary > li')].map((li) => ({t: txt(li.querySelector(':scope > a')), href: rel(li.querySelector(':scope > a')?.getAttribute('href')), children: [...li.querySelectorAll(':scope > ul > li > a')].map((a) => ({t: txt(a), href: rel(a.getAttribute('href'))}))})),
        mainText: (txt(main) || '').slice(0, 2500),
    };
}

forEachApp(async (app) => {
    const isOPS = app.name === 'ops';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k5-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };
    const cUrl = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);

    // ------------------------------------------------------------------ seed (OPS)
    if (isOPS && on('seed') && !S.seeded) {
        const t = tag('u17k5');
        S.t = t;
        const ctx = (p, name) => ({name: `U17 K5 ${name}`, acronym: 'KFIVE', contactName: 'K5 Contact', contactEmail: `${p}c@mail.test`});
        const people = (p) => [
            {username: `${p}mg`, roles: ['manager'], givenName: 'Kay', familyName: 'Manager'},
            {username: `${p}au`, roles: ['author'], givenName: 'Kim', familyName: 'Author'},
            {username: `${p}rd`, roles: ['reader'], givenName: 'Kit', familyName: 'Reader'},
        ];
        const mk = async (key, name, extra = {}) => {
            const p = `${t}${key}`;
            const r = await app.api.createContext({tag: p, context: ctx(p, name), users: people(p), ...extra});
            return {path: r.path || p, mg: `${p}mg`, au: `${p}au`, rd: `${p}rd`, sections: r.sections || null, categories: r.categories || null};
        };
        S.E = await mk('e', 'empty server');
        S.P = await mk('p', 'posted server', {
            sections: [
                {abbrev: 'PRE', path: 'preprints', title: 'Preprints'},
                {abbrev: 'LTR', path: 'letters', title: 'Letters'},
                {abbrev: 'OLD', path: 'old', title: 'Old Section'},
            ],
            categories: [
                {path: 'applied-science', title: 'Applied Science', children: [{path: 'comp-sci', title: 'Computer Science'}]},
                {path: 'social-sciences', title: 'Social Sciences'},
            ],
        });
        S.M = await mk('m', 'many server', {sections: [{abbrev: 'PRE', path: 'preprints', title: 'Preprints'}]});
        S.T = await mk('t', 'twin server', {sections: [{abbrev: 'PRE', path: 'preprints', title: 'Preprints'}]});
        save();
        const sub = async (C, key, title, section, date, extra = {}) => {
            const spec = {tag: `${t}${key}`, context: C.path, submitter: C.au, title, section, ...extra};
            if (date) spec.datePublished = date;
            const r = await app.api.createSubmission(spec);
            return {key, title, section, date, id: r.submissionId || r.id || null, status: r.status || null};
        };
        // P: seeded out of date order, so id order and date order differ
        S.P.subs = [];
        S.P.subs.push(await sub(S.P, 'p5', 'K5 Posted fifth (Mar 5)', 'PRE', '2024-03-05', {published: true}));
        S.P.subs.push(await sub(S.P, 'p1', 'K5 Posted first (Mar 1)', 'PRE', '2024-03-01', {published: true}));
        S.P.subs.push(await sub(S.P, 'l4', 'K5 Letter (Mar 4)', 'LTR', '2024-03-04', {published: true}));
        S.P.subs.push(await sub(S.P, 'p3', 'K5 Posted third (Mar 3)', 'PRE', '2024-03-03', {published: true}));
        S.P.subs.push(await sub(S.P, 'o2', 'K5 Old section item (Mar 2)', 'OLD', '2024-03-02', {published: true}));
        S.P.subs.push(await sub(S.P, 'un', 'K5 Submitted not posted', 'PRE', null, {}));
        S.P.subs.push(await sub(S.P, 'sc', 'K5 Scheduled (Dec 1 2026)', 'PRE', '2026-12-01', {published: true}));
        save();
        // M: 26 posted preprints, one a day
        S.M.subs = [];
        for (let i = 1; i <= 26; i++) {
            const d = `2024-01-${String(i).padStart(2, '0')}`;
            S.M.subs.push(await sub(S.M, `m${i}`, `K5 Many ${String(i).padStart(2, '0')} (${d})`, 'PRE', d, {published: true}));
        }
        // T: one posted preprint in the first section
        S.T.subs = [await sub(S.T, 'tp', 'K5 In Preprints (Feb 1)', 'PRE', '2024-02-01', {published: true})];
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (isOPS && !S.seeded) { log('no state; run seed first'); return; }

    const {page, close} = await launch(app);
    const dialogsSeen = nav.watchDialogs(page);
    const as = async (user, ctx) => {
        if (!user) { await signOut(page).catch(() => {}); return; }
        await signIn(page, user, {contextPath: ctx});
        await idle(page);
    };
    const go = async (url) => {
        const resp = await page.goto(url, {waitUntil: 'load'}).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        return resp && resp.status ? resp.status() : resp;
    };
    const pub = async (url, name, {shotIt = false} = {}) => {
        const status = await go(url);
        const s = await screen(page);
        const dom = await page.evaluate(READ).catch((e) => ({error: String(e.message)}));
        record(name, {status, ...s, dom});
        if (shotIt) await shot(page, name).catch(() => {});
        return {status, ...dom};
    };
    const brief = (c) => ({
        status: c.status, url: c.url, title: c.title, h1: c.h1, crumbs: c.breadcrumbs && c.breadcrumbs.text,
        header: c.archiveHeader && {search: c.archiveHeader.search && {action: c.archiveHeader.search.action, button: c.archiveHeader.search.button, box: c.archiveHeader.search.inputs.map((i) => `${i.name}/${i.type}/${i.aria}`)}, cats: c.archiveHeader.categories.map((x) => `${x.t} → ${x.href}`), beforeList: c.archiveHeader.beforeFirstList, beforeLatest: c.archiveHeader.beforeLatest},
        lists: (c.lists || []).map((l) => ({latest: l.inLatest, items: l.items.map((i) => i.title)})),
        latest: c.latestHeading, pages: c.pagination && c.pagination.text, next: c.pagination && c.pagination.next, prev: c.pagination && c.pagination.prev,
        desc: c.sectionDescription && c.sectionDescription.html, empty: c.emptyTexts, raw: c.rawKeys, sectionLinks: c.sectionLinks, main: flat(c.mainText, 400),
    });

    // ---- the Sections tab (legacy grid) and its window ----
    const secDialog = () => page.getByRole('dialog').filter({has: page.locator('#sectionForm')});
    const openSections = async (ctx) => {
        await go(cUrl(ctx, '/management/settings/context'));
        await page.getByRole('tab', {name: 'Sections'}).click();
        await idle(page);
        await page.getByRole('link', {name: 'Create Section'}).waitFor({timeout: T});
        await idle(page);
        await sleep(400);
    };
    const gridRows = async () => page.locator('[id^="component-grid-settings-sections-sectiongrid"] tr.gridRow').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => { const c = td.cloneNode(true); c.querySelectorAll('a.show_extras, a.hide_extras, script').forEach((a) => a.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); }).join(' | '))).catch((e) => [`ERR ${e.message}`]);
    const openLegacy = async (trigger) => {
        await idle(page);
        for (let i = 0; ; i++) {
            await trigger.click();
            try { await secDialog().first().waitFor({timeout: 6000}); break; } catch (e) { if (i >= 2) throw e; }
        }
        await page.locator('#sectionForm input[name="path"]').waitFor({timeout: T});
        await idle(page);
        await sleep(800);
    };
    const openCreate = async () => openLegacy(page.getByRole('link', {name: 'Create Section'}));
    const openEdit = async (title) => {
        const row = page.locator('[id^="component-grid-settings-sections-sectiongrid"] tr.gridRow').filter({hasText: title}).first();
        const ext = row.locator('a.show_extras');
        if (await ext.count()) { await ext.click(); await sleep(300); }
        await openLegacy(row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}));
    };
    const windowState = async () => secDialog().first().evaluate((w) => {
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const q = (s) => w.querySelector(s);
        const fieldHelp = (name) => { const i = q(`[name="${name}"]`); if (!i) return null; const sec = i.closest('.section'); return sec ? t(sec) : null; };
        return {
            heading: t(w.querySelector('h1, .pkp_modal_panel > .header')),
            labels: [...w.querySelectorAll('label, legend, .label')].filter(vis).map(t).filter(Boolean),
            path: q('input[name="path"]') ? {value: q('input[name="path"]').value, required: q('input[name="path"]').required || q('input[name="path"]').getAttribute('aria-required'), sectionText: fieldHelp('path')} : null,
            description: q('textarea[name="description[en]"]') ? {id: q('textarea[name="description[en]"]').id, value: q('textarea[name="description[en]"]').value, sectionText: t(q('textarea[name="description[en]"]').closest('.section'))} : null,
            identifyType: q('input[name="identifyType[en]"]') ? {value: q('input[name="identifyType[en]"]').value, sectionText: t(q('input[name="identifyType[en]"]').closest('.section'))} : null,
            isInactive: q('input[name="isInactive"]') ? q('input[name="isInactive"]').checked : null,
            errors: [...w.querySelectorAll('label.error, .pkp_form_error, #formErrors, .error')].filter(vis).map(t).filter(Boolean),
            text: t(w).slice(0, 3000),
        };
    }).catch((e) => ({error: String(e.message)}));
    const mceId = async () => secDialog().first().locator('textarea[name="description[en]"]').getAttribute('id');
    const saveWindow = async () => {
        const posts = [];
        const onResp = (r) => { if (/update-?section/i.test(r.url())) posts.push({status: r.status()}); };
        page.on('response', onResp);
        await secDialog().first().getByRole('button', {name: 'Save', exact: true}).click();
        const end = Date.now() + 12_000;
        let open = true;
        while (Date.now() < end) {
            await sleep(400);
            open = await secDialog().first().isVisible().catch(() => false);
            if (!open) break;
            const errs = await secDialog().first().locator('label.error:visible, .pkp_form_error:visible, #formErrors:visible').count().catch(() => 0);
            if (posts.length && errs) break;
            if (posts.length && Date.now() > end - 6000) break;
        }
        await idle(page).catch(() => {});
        page.off('response', onResp);
        const state = open ? await windowState() : null;
        const n = await nav.notice(page, /./, 1500);
        return {windowOpen: open, posts, state, notice: n, rows: await gridRows()};
    };
    const closeWindow = async (how = 'Cancel') => {
        const w = secDialog().first();
        if (!(await w.isVisible().catch(() => false))) return {closed: true};
        let pressed;
        if (how === 'Cancel') {
            const c = w.getByRole('link', {name: 'Cancel', exact: true});
            if (await c.count()) { await c.first().click(); pressed = 'Cancel link'; } else { await w.getByRole('button', {name: 'Cancel'}).first().click(); pressed = 'Cancel button'; }
        } else {
            await w.getByRole('button', {name: 'Close', exact: true}).first().click(); pressed = 'Close';
        }
        await sleep(700);
        const ds = await nav.dialogs(page);
        const confirmBox = page.locator('[role="dialog"]:visible, [data-cy="dialog"]:visible').filter({hasText: /changed|unsaved|discard/i});
        let confirmed = null;
        if (await confirmBox.count()) {
            confirmed = flat(await confirmBox.first().innerText(), 300);
            const yes = confirmBox.first().getByRole('button', {name: /^(Yes|OK|Discard|Leave)/});
            if (await yes.count()) await yes.first().click();
            await sleep(600);
        }
        return {pressed, dialogsAfterPress: ds, confirm: confirmed, stillOpen: await w.isVisible().catch(() => false)};
    };

    try {
        // ============================================================== OPS
        if (isOPS) {
            const PK = app.contextPath;
            // -------------------------------------------------------- pk: the seeded server, signed out
            if (on('pk')) {
                await as(null);
                const home = await pub(cUrl(PK), 'pk-home', {shotIt: true});
                fact('pk-home', brief(home));
                await loc(page, 'home: archive header', page.locator('.archiveHeader'));
                await loc(page, 'home: archive header search box', page.locator('.archiveHeader form[role="search"] input[name="query"]'));
                await loc(page, 'home: archive header category links', page.locator('.archiveHeader_categories a'));
                // the main menu's "Archives"
                const menuLink = page.locator('#navigationPrimary').getByRole('link', {name: 'Archives', exact: true});
                await loc(page, 'main menu "Archives"', menuLink);
                let viaMenu = null;
                if (await menuLink.count()) { await menuLink.first().click(); await idle(page); viaMenu = page.url().replace(/^https?:\/\/[^/]+/, ''); }
                const arch = await pub(cUrl(PK, '/preprints'), 'pk-archives', {shotIt: true});
                fact('pk-archives', {viaMenu, ...brief(arch)});
                await loc(page, 'Archives: heading', page.locator('h1'));
                await loc(page, 'Archives: the empty text', page.locator('.page_issue_archive > p'));
                // a category link, pressed
                const cat = page.locator('.archiveHeader_categories a').first();
                if (await cat.count()) {
                    const label = flat(await cat.innerText());
                    await cat.click(); await idle(page);
                    const c = await page.evaluate(READ);
                    record('pk-archives-category-pressed', {...(await screen(page)), dom: c});
                    fact('pk-archives-category-pressed', {label, url: c.url, h1: c.h1, crumbs: c.breadcrumbs && c.breadcrumbs.text});
                }
                // the search box, used
                await go(cUrl(PK, '/preprints'));
                const box = page.locator('.archiveHeader form[role="search"] input[name="query"]');
                await box.fill('preprint');
                await page.locator('.archiveHeader form[role="search"] button').click();
                await page.waitForLoadState('load'); await idle(page);
                const sr = await page.evaluate(READ);
                record('pk-archives-search-pressed', {...(await screen(page)), dom: sr});
                fact('pk-archives-search-pressed', {url: sr.url, h1: sr.h1, main: flat(sr.mainText, 300)});
                // Enter in the box
                await go(cUrl(PK, '/preprints'));
                await box.fill('knowledge'); await box.press('Enter'); await page.waitForLoadState('load'); await idle(page);
                fact('pk-archives-search-enter', {url: page.url().replace(/^https?:\/\/[^/]+/, '')});
                // the seeded section's page, a page past the end, odd page arguments
                for (const [k, p] of [['section-preprints', '/preprints/section/preprints'], ['section-pre', '/preprints/section/pre'], ['archives-2', '/preprints/2'], ['archives-abc', '/preprints/abc'], ['archives-0', '/preprints/0']]) {
                    const c = await pub(cUrl(PK, p), `pk-${k}`);
                    fact(`pk-${k}`, brief(c));
                }
                // signed in: a reader and the manager see the same Archives page?
                for (const u of ['reader.rosa', 'manager.maya']) {
                    await as(u, PK);
                    const c = await pub(cUrl(PK, '/preprints'), `pk-archives-${u.split('.')[0]}`);
                    fact(`pk-archives-${u.split('.')[0]}`, brief(c));
                }
                await as(null);
            }

            // -------------------------------------------------------- empty: server E
            if (on('empty')) {
                const E = S.E;
                await as(null);
                const home = await pub(cUrl(E.path), 'E-home', {shotIt: true});
                fact('E-home', brief(home));
                const arch = await pub(cUrl(E.path, '/preprints'), 'E-archives', {shotIt: true});
                fact('E-archives', brief(arch));
                const sp = S.E.secPath || 'preprints';
                for (const [k, p] of [['archives-2', '/preprints/2'], ['archives-index-2', '/preprints/index/2'], ['section-preprints', `/preprints/section/${sp}`], ['section-nosuch', '/preprints/section/nosuch'], ['section-preprints-1', `/preprints/section/${sp}/1`], ['section-preprints-2', `/preprints/section/${sp}/2`], ['section-none', '/preprints/section']]) {
                    const c = await pub(cUrl(E.path, p), `E-${k}`, {shotIt: k === 'section-preprints'});
                    fact(`E-${k}`, brief(c));
                }
                if (!S.E.windowDone) {
                    await as(E.mg, E.path);
                    await openSections(E.path);
                    const rows0 = await gridRows();
                    await loc(page, 'Settings › Server › Sections: "Create Section"', page.getByRole('link', {name: 'Create Section'}));
                    record('E-sections-tab', {...(await screen(page)), rows: rows0});
                    await openEdit('Preprints');
                    const w0 = await windowState();
                    record('E-window-default', {...(await screen(page)), w: w0});
                    await shot(page, 'E-window-default');
                    await loc(page, 'section window: "Section URL Path" box', secDialog().first().locator('input[name="path"]'));
                    await loc(page, 'section window: "Section archive Description" box', secDialog().first().locator('textarea[name="description[en]"]'));
                    await loc(page, 'section window: "Identify items…" box', secDialog().first().locator('input[name="identifyType[en]"]'));
                    fact('E-window-default', {rows: rows0, path: w0.path, description: w0.description, identifyType: w0.identifyType, labels: w0.labels});
                    // leave once with something changed and unsaved
                    await secDialog().first().locator('input[name="path"]').fill('unsaved-path');
                    await secDialog().first().locator('input[name="path"]').blur();
                    const leave = await closeWindow('Cancel');
                    fact('E-window-leave-unsaved', {...leave, dialogs: dialogsSeen.slice(-3)});
                    await sleep(700);
                    await openEdit('Preprints');
                    fact('E-window-after-unsaved-leave', {path: (await windowState()).path});
                    // the description, typed and saved
                    const id = await mceId();
                    const typed = await nav.mceSet(page, id, 'About these preprints');
                    const sv = await saveWindow();
                    fact('E-window-save-description', {typed, ...sv});
                    // the same page, reopened, then after a reload
                    await sleep(700);
                    await openEdit('Preprints');
                    const samePage = await windowState();
                    const mceSame = await page.evaluate((i) => window.tinymce?.get(i)?.getContent(), await mceId()).catch(() => null);
                    await closeWindow('Cancel');
                    await openSections(E.path);
                    await openEdit('Preprints');
                    const afterReload = await windowState();
                    const mceReload = await page.evaluate((i) => window.tinymce?.get(i)?.getContent(), await mceId()).catch(() => null);
                    record('E-window-after-description', {...(await screen(page)), samePage, afterReload});
                    fact('E-window-after-description', {samePage: {path: samePage.path && samePage.path.value, mce: mceSame}, afterReload: {path: afterReload.path && afterReload.path.value, mce: mceReload}});
                    await closeWindow('Cancel');
                    S.E.windowDone = true; save();
                }
                await as(null);
                const withDesc = await pub(cUrl(E.path, `/preprints/section/${S.E.secPath || 'preprints'}`), 'E-section-with-description', {shotIt: true});
                fact('E-section-with-description', brief(withDesc));
                await loc(page, 'section page: heading', page.locator('h1.page_title'));
                await loc(page, 'section page: description', page.locator('.about_section .description'));
                await loc(page, 'section page: empty sentence', page.locator('p.section_empty'));
                // the path changed on screen: the old address and the new one
                if (!S.E.pathDone) {
                    await as(E.mg, E.path);
                    await openSections(E.path);
                    await openEdit('Preprints');
                    await secDialog().first().locator('input[name="path"]').fill('papers');
                    const sv = await saveWindow();
                    fact('E-window-save-path', sv);
                    S.E.pathDone = true; S.E.secPath = 'papers'; save();
                    await as(null);
                }
                for (const [k, p] of [['after-path-old', '/preprints/section/preprints'], ['after-path-new', '/preprints/section/papers']]) {
                    const c = await pub(cUrl(E.path, p), `E-${k}`);
                    fact(`E-${k}`, brief(c));
                }
            }

            // -------------------------------------------------------- posted: server P
            if (on('posted')) {
                const P = S.P;
                // "Items per page" toggles 25 ↔ 2 each run, on screen: every run reads both ends, each read
                // labelled by the value in force (ipp25 / ipp2), so no run overwrites the other end's evidence.
                const cur = S.P.ipp || 25;
                const next = cur === 25 ? 2 : 25;
                const A = `ipp${cur}`;
                const B = `ipp${next}`;
                await as(null);
                const home = await pub(cUrl(P.path), `P-home-${A}`, {shotIt: true});
                fact(`P-home-${A}`, brief(home));
                const a1 = await pub(cUrl(P.path, '/preprints'), `P-archives-${A}`, {shotIt: true});
                fact(`P-archives-${A}`, brief(a1));
                fact(`P-archives-${A}-items`, (a1.lists[0] || {items: []}).items.map((i) => ({title: i.title, text: i.text, links: i.links})));
                await loc(page, 'Archives: a preprint summary', page.locator('ul.cmp_preprint_list > li').first());
                // a category link from the header, pressed; the child category is not linked
                const cat = page.locator('.archiveHeader_categories a', {hasText: 'Applied Science'});
                if (await cat.count()) {
                    await cat.first().click(); await idle(page);
                    const c = await page.evaluate(READ);
                    record('P-archives-category-pressed', {...(await screen(page)), dom: c});
                    fact('P-archives-category-pressed', {url: c.url, h1: c.h1, header: c.archiveHeader && c.archiveHeader.categories});
                }
                for (const [k, p] of [['section-preprints', '/preprints/section/preprints'], ['section-letters', '/preprints/section/letters'], ['section-old', '/preprints/section/old'], ['section-PRE', '/preprints/section/PRE'], ['section-Preprints-case', '/preprints/section/Preprints']]) {
                    const c = await pub(cUrl(P.path, p), `P-${k}-${A}`, {shotIt: k === 'section-preprints'});
                    fact(`P-${k}-${A}`, brief(c));
                }
                // a preprint's page: any link to its section's page?
                const first = (a1.lists[0] || {items: []}).items[0];
                if (first && first.href) {
                    const c = await pub(app.url(first.href), 'P-preprint-page', {shotIt: true});
                    fact('P-preprint-page', {url: c.url, h1: c.h1, crumbs: c.breadcrumbs, sectionLinks: c.sectionLinks, main: flat(c.mainText, 900)});
                }
                // signed in: a reader and the server's manager
                for (const [who, u] of [['reader', P.rd], ['manager', P.mg]]) {
                    await as(u, P.path);
                    const c = await pub(cUrl(P.path, '/preprints'), `P-archives-${who}-${A}`);
                    const s = await pub(cUrl(P.path, '/preprints/section/preprints'), `P-section-${who}-${A}`);
                    fact(`P-as-${who}-${A}`, {archives: brief(c), section: brief(s)});
                }
                // the manager, once: the window left unsaved through "×", "Old Section" marked inactive
                await as(P.mg, P.path);
                if (!S.P.changed) {
                    await openSections(P.path);
                    fact('P-sections-rows', await gridRows());
                    // leave the window once more with a change unsaved, through its "×" (Close) this time
                    await openEdit('Letters');
                    await secDialog().first().locator('input[name="path"]').fill('unsaved-close');
                    await secDialog().first().locator('input[name="path"]').blur();
                    dialogsSeen.step = 'window-close-unsaved';
                    const lv = await closeWindow('Close');
                    fact('P-window-close-unsaved', {...lv, dialogs: dialogsSeen.filter((d) => d.step === 'window-close-unsaved')});
                    dialogsSeen.step = '';
                    await sleep(700);
                    if (!lv.stillOpen) { await openEdit('Letters'); fact('P-window-after-close-unsaved', {path: (await windowState()).path}); await closeWindow('Cancel'); await sleep(700); }
                    await openEdit('Old Section');
                    await secDialog().first().locator('input[name="isInactive"]').check();
                    fact('P-old-inactive-save', await saveWindow());
                    S.P.changed = true; save();
                }
                {
                    await nav.openSettings(page, app, P.path, 'website', 'setup', 'Lists');
                    const ipp = page.locator('input[name="itemsPerPage"]').first();
                    const npl = page.locator('input[name="numPageLinks"]').first();
                    const before = {itemsPerPage: await ipp.inputValue().catch(() => null), numPageLinks: await npl.inputValue().catch(() => null), tab: flat(await page.locator('[role="tabpanel"]:visible form').first().innerText().catch(() => ''), 600)};
                    record(`P-lists-tab-${A}`, {...(await screen(page)), before});
                    await shot(page, `P-lists-tab-${A}`);
                    await loc(page, 'Website › Setup › "Lists": "Items per page"', ipp);
                    // leave the tab once with a change unsaved: another side tab, then back; then away
                    await ipp.fill('7');
                    dialogsSeen.step = 'lists-unsaved-sidetab';
                    const other = page.getByRole('tab', {name: 'Privacy Statement', exact: true}).filter({visible: true}).first();
                    let sideTab = null;
                    if (await other.count()) { await other.click(); await sleep(500); await page.getByRole('tab', {name: 'Lists', exact: true}).filter({visible: true}).first().click(); await sleep(500); sideTab = await ipp.inputValue().catch(() => null); }
                    dialogsSeen.step = 'lists-unsaved-leave';
                    await ipp.fill('7'); await ipp.blur();
                    await go(cUrl(P.path, '/management/settings/context'));
                    await nav.openSettings(page, app, P.path, 'website', 'setup', 'Lists');
                    const afterLeave = await page.locator('input[name="itemsPerPage"]').first().inputValue().catch(() => null);
                    fact(`P-lists-unsaved-${A}`, {valueBackOnSideTab: sideTab, valueAfterLeaving: afterLeave, dialogs: dialogsSeen.filter((d) => /lists-unsaved/.test(d.step))});
                    dialogsSeen.step = '';
                    await page.locator('input[name="itemsPerPage"]').first().fill(String(next));
                    const sv = await nav.saveForm(page, 'input[name="itemsPerPage"]');
                    const sameRead = await page.locator('input[name="itemsPerPage"]').first().inputValue().catch(() => null);
                    await nav.openSettings(page, app, P.path, 'website', 'setup', 'Lists');
                    const reloadRead = await page.locator('input[name="itemsPerPage"]').first().inputValue().catch(() => null);
                    fact(`P-lists-save-${next}`, {before, save: sv, sameRead, reloadRead});
                    S.P.ipp = next; save();
                }
                await as(null);
                // paged: Archives 1..4, the section pages
                const seen = [];
                let url = cUrl(P.path, '/preprints');
                for (let i = 0; i < 4 && url; i++) {
                    const c = await pub(url, `P-archives-${B}-p${i + 1}`, {shotIt: i === 1});
                    seen.push(brief(c));
                    url = c.pagination && c.pagination.next ? app.url(c.pagination.next) : null;
                }
                fact(`P-archives-${B}`, seen);
                for (const [k, p] of [['archives-p3', '/preprints/3'], ['archives-p4', '/preprints/4'], ['archives-p1', '/preprints/1'], ['archives-index-1', '/preprints/index/1'], ['archives-index-4', '/preprints/index/4'], ['archives-index-x', '/preprints/index/x'], ['archives-index', '/preprints/index']]) {
                    const c = await pub(cUrl(P.path, p), `P-${k}-${B}`);
                    fact(`P-${k}-${B}`, brief(c));
                }
                // press "Next" and "Previous"
                await go(cUrl(P.path, '/preprints'));
                const nx = page.locator('.cmp_pagination a.next');
                await loc(page, 'Archives page links: "Next"', nx);
                if (await nx.count()) {
                    await nx.click(); await idle(page);
                    const u1 = page.url().replace(/^https?:\/\/[^/]+/, '');
                    const h1 = await page.locator('h1').first().innerText().catch(() => null);
                    await page.locator('.cmp_pagination a.prev').click(); await idle(page);
                    fact(`P-archives-press-next-prev-${B}`, {next: u1, nextH1: h1, prev: page.url().replace(/^https?:\/\/[^/]+/, ''), prevH1: await page.locator('h1').first().innerText().catch(() => null)});
                }
                for (const [k, p] of [['section-preprints', '/preprints/section/preprints'], ['section-preprints-2', '/preprints/section/preprints/2'], ['section-preprints-1', '/preprints/section/preprints/1'], ['section-preprints-3', '/preprints/section/preprints/3'], ['section-preprints-x', '/preprints/section/preprints/x'], ['section-old', '/preprints/section/old'], ['section-letters', '/preprints/section/letters']]) {
                    const c = await pub(cUrl(P.path, p), `P-${k}-${B}`, {shotIt: k === 'section-preprints' || k === 'section-old'});
                    fact(`P-${k}-${B}`, brief(c));
                }
                await go(cUrl(P.path, '/preprints/section/preprints'));
                const snx = page.locator('.cmp_pagination a.next');
                await loc(page, 'section page links: "Next"', snx);
                if (await snx.count()) {
                    await snx.click(); await idle(page);
                    const u1 = page.url().replace(/^https?:\/\/[^/]+/, '');
                    const pv = page.locator('.cmp_pagination a.prev');
                    let u2 = null;
                    if (await pv.count()) { await pv.click(); await idle(page); u2 = page.url().replace(/^https?:\/\/[^/]+/, ''); }
                    fact(`P-section-press-next-prev-${B}`, {next: u1, prev: u2});
                }
            }

            // -------------------------------------------------------- many: server M, default 25
            if (on('many')) {
                const M = S.M;
                await as(null);
                for (const [k, p] of [['archives', '/preprints'], ['archives-2', '/preprints/2'], ['archives-3', '/preprints/3'], ['section', '/preprints/section/preprints'], ['section-2', '/preprints/section/preprints/2'], ['section-3', '/preprints/section/preprints/3'], ['home', '']]) {
                    const c = await pub(cUrl(M.path, p), `M-${k}`, {shotIt: k === 'archives' || k === 'archives-2'});
                    const b = brief(c);
                    b.count = (c.lists || []).map((l) => l.items.length);
                    b.firstLast = (c.lists || []).map((l) => [l.items[0] && l.items[0].title, l.items[l.items.length - 1] && l.items[l.items.length - 1].title]);
                    delete b.lists;
                    fact(`M-${k}`, b);
                }
                await as(M.mg, M.path);
                await nav.openSettings(page, app, M.path, 'website', 'setup', 'Lists');
                fact('M-lists-tab', {itemsPerPage: await page.locator('input[name="itemsPerPage"]').first().inputValue().catch(() => null)});
                await as(null);
            }

            // -------------------------------------------------------- twin: server T
            if (on('twin')) {
                const Tt = S.T;
                if (!S.T.made) {
                    await as(Tt.mg, Tt.path);
                    await openSections(Tt.path);
                    const out = {rows0: await gridRows()};
                    for (const [title, abbrev, p] of [['Twin', 'TWN', 'preprints'], ['Odd', 'ODD', 'a b/c']]) {
                        await openCreate();
                        const w = secDialog().first();
                        out[`${title}-empty-window`] = (await windowState()).path;
                        await w.locator('input[name="title[en]"]').fill(title);
                        await w.locator('input[name="abbrev[en]"]').fill(abbrev);
                        await w.locator('input[name="path"]').fill(p);
                        out[title] = await saveWindow();
                        if (out[title].windowOpen) { out[`${title}-close`] = await closeWindow('Cancel'); }
                        await sleep(700);
                    }
                    await openSections(Tt.path);
                    out.rowsAfterReload = await gridRows();
                    record('T-sections-tab', {...(await screen(page)), rows: out.rowsAfterReload});
                    await shot(page, 'T-sections-tab');
                    fact('T-made', out);
                    if (!out.Twin.windowOpen) {
                        const r = await app.api.createSubmission({tag: `${S.t}tw`, context: Tt.path, submitter: Tt.au, title: 'K5 In Twin (Feb 2)', section: 'TWN', datePublished: '2024-02-02', published: true});
                        S.T.twinSub = r.submissionId || r.id || true;
                    }
                    S.T.made = true; save();
                    await as(null);
                }
                // Read the shared address under the order in force, then swap the first two rows on screen
                // ("Order", drag, "Done") and read again: each run drives both ends, and every read is
                // labelled by the section then first in the order, so no run overwrites the other end.
                const readUnder = async () => {
                    await as(Tt.mg, Tt.path);
                    await openSections(Tt.path);
                    const rows = await gridRows();
                    await as(null);
                    const firstRow = (rows[0] || '').split(' | ')[0].toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
                    const r = {rows};
                    for (const [k, p] of [['preprints', '/preprints/section/preprints'], ['odd-typed', '/preprints/section/a b/c'], ['odd-enc', '/preprints/section/a%20b%2Fc'], ['archives', '/preprints']]) {
                        const c = await pub(cUrl(Tt.path, p), `T-${k}-${firstRow}-first`, {shotIt: k === 'preprints'});
                        r[k] = brief(c);
                    }
                    fact(`T-read-${firstRow}-first`, r);
                    return r;
                };
                await readUnder();
                {
                    await as(Tt.mg, Tt.path);
                    await openSections(Tt.path);
                    const grid = page.locator('[id^="component-grid-settings-sections-sectiongrid"]').first();
                    const actions = await grid.locator('a:visible, button:visible').evaluateAll((els) => els.map((e) => (e.innerText || e.title || '').trim()).filter(Boolean)).catch(() => []);
                    const order = grid.getByRole('link', {name: 'Order', exact: true}).first();
                    await loc(page, 'Sections grid: "Order"', order);
                    const out = {actions, rowsBefore: await gridRows()};
                    if (await order.count()) {
                        await order.click(); await sleep(700);
                        const rowA = grid.locator('tr.gridRow').nth(1); // the second row goes on top
                        const rowB = grid.locator('tr.gridRow').nth(0);
                        out.orderingControls = await grid.locator('a:visible, button:visible').evaluateAll((els) => els.map((e) => (e.innerText || e.title || e.getAttribute('aria-label') || '').trim()).filter(Boolean)).catch(() => []);
                        const sb = await rowA.boundingBox();
                        const tb = await rowB.boundingBox();
                        await page.mouse.move(sb.x + 40, sb.y + sb.height / 2);
                        await page.mouse.down();
                        await page.mouse.move(sb.x + 40, sb.y + sb.height / 2 - 5, {steps: 5});
                        await page.mouse.move(tb.x + 40, tb.y + 3, {steps: 20});
                        await sleep(300);
                        await page.mouse.move(tb.x + 40, tb.y + 2, {steps: 2});
                        await page.mouse.up();
                        await sleep(600);
                        out.rowsWhileOrdering = await gridRows();
                        const done = grid.getByRole('link', {name: 'Done', exact: true}).first(); // an <a class="saveButton">, not a button
                        await loc(page, 'Sections grid ordering: "Done"', done);
                        const posts = [];
                        const onResp = (r) => { if (r.request().method() === 'POST' && /sequence/i.test(r.url())) posts.push({status: r.status(), url: r.url().replace(/^.*\$\$\$call\$\$\$/, '')}); };
                        page.on('response', onResp);
                        if (await done.count()) { await done.click(); await sleep(1200); await idle(page); }
                        page.off('response', onResp);
                        out.posts = posts;
                        out.rowsSamePage = await gridRows();
                        await openSections(Tt.path);
                        out.rowsAfterReload = await gridRows();
                    }
                    fact(`T-reorder-${Date.now()}`, out);
                    await as(null);
                }
                await readUnder();
            }

            // -------------------------------------------------------- menu: a menu item added by hand (OPS4), server P
            if (on('menu')) {
                const P = S.P;
                if (!S.P.menuDone) {
                    await as(P.mg, P.path);
                    await nav.openNav(page, app, P.path);
                    await nav.openItemWindow(page, 'add');
                    const st = await nav.itemState(page);
                    record('P-nav-add-item', {...(await screen(page)), st});
                    await shot(page, 'P-nav-add-item');
                    fact('P-nav-item-types', st.typeOptions);
                    await nav.closeItemWindow(page);
                    await sleep(700);
                    const sectionUrl = cUrl(P.path, '/preprints/section/letters');
                    const add = await nav.addItem(page, 'Letters section', 'Remote URL', {url: sectionUrl});
                    fact('P-nav-add-remote', {notice: add.notice, windowOpen: add.windowOpen, posts: add.posts});
                    await sleep(700);
                    await nav.openMenu(page, 'Primary Navigation Menu');
                    const assigned = await nav.assignTop(page, 'Letters section');
                    const sm = await nav.saveMenu(page);
                    fact('P-nav-assign', {assigned, save: sm});
                    S.P.menuDone = true; save();
                }
                await as(null);
                const h = await pub(cUrl(P.path), 'P-home-with-menu-item', {shotIt: true});
                fact('P-home-with-menu-item', {primaryMenu: h.primaryMenu, sectionLinks: h.sectionLinks});
                const link = page.locator('#navigationPrimary').getByRole('link', {name: 'Letters section', exact: true});
                await loc(page, 'main menu: the hand-added "Letters section" item', link);
                if (await link.count()) {
                    await link.first().click(); await idle(page);
                    const c = await page.evaluate(READ);
                    record('P-menu-item-pressed', {...(await screen(page)), dom: c});
                    fact('P-menu-item-pressed', {url: c.url, h1: c.h1, items: (c.lists[0] || {items: []}).items.map((i) => i.title)});
                }
            }

            // -------------------------------------------------------- links: does any page of server P link to a section's page? (OPS4)
            if (on('links')) {
                const P = S.P;
                const first = S.P.subs.find((x) => x.key === 'p5');
                const pages = [['home', ''], ['archives', '/preprints'], ['archives-p2', '/preprints/index/2'], ['about', '/about'], ['submissions', '/about/submissions'], ['masthead', '/about/editorialMasthead'], ['contact', '/about/contact'], ['search', '/search/search?query=K5'], ['category', '/preprints/category/applied-science'], ['subcategory', '/preprints/category/comp-sci'], ['preprint', `/preprint/view/${first.id}`], ['section', '/preprints/section/preprints'], ['announcements', '/announcement']];
                const out = {};
                for (const who of [null, P.rd]) {
                    if (who) await as(who, P.path); else await as(null);
                    for (const [k, p] of pages) {
                        const c = await pub(cUrl(P.path, p), `L-${who ? 'reader' : 'visitor'}-${k}`);
                        out[`${who ? 'reader' : 'visitor'}-${k}`] = {status: c.status, h1: c.h1, crumbs: c.breadcrumbs && c.breadcrumbs.items, sectionLinks: c.sectionLinks.filter((l) => !/Letters section/.test(l.t || ''))};
                    }
                }
                fact('L-section-links', out);
                await as(null);
            }

            // -------------------------------------------------------- leave: the section window left unsaved, both ways, on server T (nothing saved)
            if (on('leave')) {
                const Tt = S.T;
                await as(Tt.mg, Tt.path);
                const out = {};
                for (const how of ['Cancel', 'Close']) {
                    await openSections(Tt.path);
                    await openEdit('Odd');
                    const before = (await windowState()).path;
                    await secDialog().first().locator('input[name="title[en]"]').fill(`Odd unsaved ${how}`);
                    await secDialog().first().locator('input[name="title[en]"]').blur();
                    dialogsSeen.step = `leave-${how}`;
                    const r = await closeWindow(how);
                    await sleep(700);
                    const rows = await gridRows();
                    out[how] = {before: before && before.value, ...r, browserDialogs: dialogsSeen.filter((d) => d.step === `leave-${how}`), rowsAfter: rows};
                    dialogsSeen.step = '';
                }
                fact('LV-window-leave', out);
                await as(null);
            }
        }

        // ============================================================== OJS and OMP: read-only controls
        if (!isOPS && on('controls')) {
            const PK = app.contextPath;
            await as(null);
            const pages = [['home', ''], ['preprints', '/preprints'], ['preprints-section', '/preprints/section/preprints'], ['preprints-section-articles', '/preprints/section/articles']];
            if (app.name === 'ojs') pages.push(['archive', '/issue/archive'], ['current', '/issue/current']);
            if (app.name === 'omp') pages.push(['catalog', '/catalog'], ['series', '/catalog/series/monographs']);
            for (const [k, p] of pages) {
                const c = await pub(cUrl(PK, p), `C-${k}`, {shotIt: k === 'home'});
                fact(`C-${k}`, {status: c.status, url: c.url, title: c.title, h1: c.h1, archiveHeader: !!c.archiveHeader, searchForms: await page.locator('form[role="search"]').count(), primaryMenu: (c.primaryMenu || []).map((m) => `${m.t} → ${m.href}`), sectionishLinks: await page.locator('a[href*="/section/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href'))), main: flat(c.mainText, 300)});
            }
            // the main menu's "Archives" (OJS) / "Catalog" (OMP)
            await go(cUrl(PK));
            const m = page.locator('#navigationPrimary').getByRole('link', {name: app.name === 'ojs' ? 'Archives' : 'Catalog', exact: true});
            if (await m.count()) { await m.first().click(); await idle(page); fact('C-menu-pressed', {url: page.url().replace(/^https?:\/\/[^/]+/, ''), h1: await page.locator('h1').allInnerTexts()}); }
            // the section (series) window, opened and cancelled: its fields and the "Identify…" help (OPS2 control)
            await as('manager.maya', PK);
            await go(cUrl(PK, '/management/settings/context'));
            const tabName = app.name === 'ojs' ? 'Sections' : 'Series';
            await page.getByRole('tab', {name: tabName}).click();
            await idle(page); await sleep(800);
            const firstTitle = app.name === 'ojs' ? 'Articles' : 'Monographs';
            const gridSel = app.name === 'ojs' ? '[id^="component-grid-settings-sections-sectiongrid"]' : '[id^="component-grid-settings-series-seriesgrid"]';
            const row = page.locator(`${gridSel} tr.gridRow`).filter({hasText: firstTitle}).first();
            const out = {tab: tabName, rows: await page.locator(`${gridSel} tr.gridRow`).allInnerTexts().catch(() => [])};
            if (await row.count()) {
                const ext = row.locator('a.show_extras');
                if (await ext.count()) { await ext.click(); await sleep(300); }
                await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
                const dlg = page.getByRole('dialog').filter({has: page.locator('form')}).first();
                await dlg.locator('form input[name^="title"]').first().waitFor({timeout: T});
                await idle(page); await sleep(800);
                out.window = await dlg.evaluate((w) => {
                    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
                    const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
                    const it = w.querySelector('input[name="identifyType[en]"]');
                    return {labels: [...w.querySelectorAll('label, legend, .label')].filter(vis).map(t).filter(Boolean), hasPath: !!w.querySelector('input[name="path"]'), identifyTypeSection: it ? t(it.closest('.section')) : null, text: t(w).slice(0, 2500)};
                });
                record(`C-${tabName}-window`, {...(await screen(page)), w: out.window});
                await shot(page, `C-${tabName}-window`);
                const cancel = dlg.getByRole('link', {name: 'Cancel', exact: true});
                if (await cancel.count()) await cancel.first().click(); else await dlg.getByRole('button', {name: 'Close'}).first().click();
                await sleep(600);
            }
            fact(`C-${tabName}-window`, out);
            await as(null);
        }
    } finally {
        record('k5-dialogs', {dialogs: dialogsSeen}, {merge: true});
        await close();
    }
});
