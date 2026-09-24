// U08 claim check, chunk K1: the menus on the Navigation tab, journal and site.
// Spec: docs/specs/U08-navigation-menus-and-site-chrome.md, lines 47–215
// (Fields & validation, Rules 1–9), register A4, A8, A9; footnotes c, i, j,
// k, l, m, n, o, td1–td10, f-a4, f-a8, f-a9.
//
// Run the companion onejournal.js FIRST on a fresh fleet (the site's
// Navigation side tab with publicknowledge alone); this script seeds scratch
// contexts, after which that state is gone.
//
// Seeds per app, through POST scenarios/context (state file k1-state-<app>.json):
//   A  menus: the fresh tables, both menus' windows and notices (td4, td5,
//      td8), arranging (td6), leaving (td7), the keyboard (A8), saving (Rule
//      6), "Add Menu" and its refusals (td1), a second menu, areas (Rule 8).
//      Users: <tag>mgr (manager), <tag>ed (editor, manager-level), <tag>rd (reader)
//   I  items: the item window and its refusals (td2), query parameters (td3),
//      each type's link and condition in the public header (the item types
//      table). Users as A.
//   D  deleting: an item renamed and removed, the menus removed, both
//      tables emptied (td10, Rule 9, the "Empty" column). Users: <tag>mgr
//   M  two form languages (en, fr_CA): the Title boxes, the titles in French
//      (Rule 2). Users: <tag>mgr
// Phases (PHASES=a,b,…; default all; seed only without a state file or RESEED=1):
//   seed pk fresh arrange leave keyboard save addmenu areas (here), items
//   types flips delete lang site control (k1-more.js)
// Order on a fresh fleet: onejournal.js, then k1.js (one app at a time fits
// ten minutes when split: PHASES=pk,…,areas then PHASES=items,…,control),
// then the read-only companions k1-icons.js (needs "types"), k1-fr.js and
// k1-sitepages.js.
// Run: PROBE_FEATURE=U08 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U08/K1/k1.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'pk', 'fresh', 'arrange', 'leave', 'keyboard', 'save', 'addmenu', 'areas',
    'items', 'types', 'flips', 'delete', 'lang', 'site', 'control'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

// ---------------------------------------------------------------------------
// helpers

const ctxUrl = (app, ctx, p = '', locale = '') => app.url(`/index.php/${ctx}${locale ? '/' + locale : ''}${p}`);

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

async function as(page, user, ctx) {
    await signIn(page, user, {contextPath: ctx});
    await idle(page);
}

/** Collect the dialogs the browser raises (beforeunload, confirm) instead of dismissing them. */
function watchDialogs(page) {
    const seen = [];
    seen.step = '';
    page.on('dialog', async (d) => {
        seen.push({type: d.type(), message: d.message(), step: seen.step, url: page.url()});
        await d.accept().catch(() => {});
    });
    return seen;
}

async function openNav(page, app, ctx) {
    await page.goto('about:blank');
    if (ctx === 'index') {
        await page.goto(app.url('/index.php/index/admin/settings'));
        await idle(page);
        await page.locator('#setup-button').first().click();
        await page.locator('#nav-button').click();
    } else {
        await page.goto(ctxUrl(app, ctx, '/management/settings/website#setup/navigationMenus'));
    }
    await idle(page);
    await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]').first().waitFor({timeout: T});
    await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor({timeout: T});
    await idle(page);
    await sleep(300);
}

const menusTable = (page) => page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]:visible').first();
const itemsTable = (page) => page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]:visible').first();

/** Both tables as data: menu rows {title, items}, item titles, each table's visible empty text, the heading and link above each. */
async function grids(page) {
    const read = async (table, kind) => table.evaluate((t, kind) => {
        const rows = [...t.querySelectorAll('tr.gridRow')].map((tr) => {
            const cells = [...tr.querySelectorAll('td')].map((td) => td.innerText.replace(/^\s*Settings\s*/, '').trim());
            return kind === 'menus' ? {title: cells[0], items: cells[1]} : cells[0];
        });
        const empty = [...t.querySelectorAll('tr.empty, tr[id*="emptyRow"], .empty')]
            .filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean);
        const heads = [...t.querySelectorAll('th')].map((th) => th.innerText.trim());
        const wrap = t.closest('.pkp_controllers_grid');
        const heading = wrap?.querySelector('h4, .header h4, .pkp_helpers_align_left')?.innerText.trim() ?? null;
        const actions = wrap ? [...wrap.querySelectorAll('.actions a, ul.actions a')].map((a) => a.innerText.trim()).filter(Boolean) : [];
        return {heading, actions, heads, rows, empty};
    }, kind);
    return {menus: await read(menusTable(page), 'menus'), items: await read(itemsTable(page), 'items')};
}

/** The grid row whose title cell reads `title` exactly (menus or items table). */
function gridRow(page, which, title) {
    const table = which === 'menus' ? menusTable(page) : itemsTable(page);
    return table.locator('tr.gridRow').filter({has: page.locator('td').first().filter({hasText: new RegExp(`^\\s*(Settings\\s*)?${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)})}).first();
}

/** Press the row's "Settings" arrow; returns the control row's link texts. */
async function rowControls(page, which, title) {
    const row = gridRow(page, which, title);
    const id = await row.getAttribute('id');
    // pitfall 10: an arrow already open (class hide_extras) hangs a second click
    if (await row.locator('a.show_extras').count()) {
        await row.locator('a.show_extras').first().click();
        await sleep(300);
    }
    const ctl = page.locator(`[id="${id}-control-row"]`);
    return {id, controls: await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => [])};
}

async function rowAction(page, which, title, action) {
    const {id} = await rowControls(page, which, title);
    await page.locator(`[id="${id}-control-row"]`).getByRole('link', {name: action, exact: true}).first().click();
}

const editor = (page) => page.locator('[data-cy="navigation-menu-editor"]:visible').first();
const menuWindow = (page) => page.locator('[role="dialog"]:visible').filter({has: page.locator('[data-cy="navigation-menu-editor"]')}).first();

async function waitMenuWindow(page) {
    await editor(page).waitFor({timeout: T});
    await idle(page);
    await sleep(600);
}

async function openMenu(page, title, via = 'title') {
    if (via === 'title') {
        await menusTable(page).getByRole('link', {name: title, exact: true}).first().click();
    } else {
        await rowAction(page, 'menus', title, 'Edit');
    }
    await waitMenuWindow(page);
}

/** Both panels as data: each item's title, nesting (0,1,2…), icons (warning, eye) with their titles; each panel's text when it has no item. */
async function panels(page) {
    return editor(page).evaluate((root) => {
        const read = (cy) => {
            const p = root.querySelector(`[data-cy="${cy}"]`);
            if (!p) return null;
            const items = [...p.querySelectorAll('[data-menu-item-title]')].map((el) => ({
                title: el.getAttribute('data-menu-item-title'),
                level: Math.round(parseInt(el.style.marginInlineStart || '0', 10) / 24),
                icons: [...el.querySelectorAll('button[title]')].map((b) => ({kind: b.className.includes('text-negative') ? 'warning' : 'eye', title: b.title})),
            }));
            return {items, text: items.length ? null : p.innerText.trim()};
        };
        return {assigned: read('panel-content-assigned'), unassigned: read('panel-content-unassigned')};
    });
}

const brief = (p) => ({
    assigned: p.assigned.items.length ? p.assigned.items.map((i) => '  '.repeat(i.level) + i.title + (i.icons.length ? ` [${i.icons.map((x) => x.kind).join(',')}]` : '')) : p.assigned.text,
    unassigned: p.unassigned.items.length ? p.unassigned.items.map((i) => i.title + (i.icons.length ? ` [${i.icons.map((x) => x.kind).join(',')}]` : '')) : p.unassigned.text,
});

const panelItem = (page, panel, title) => editor(page).locator(`[data-cy="panel-content-${panel}"] [data-menu-item-title="${title}"]`).first();

/** Drag an item by its handle onto a target (an item: top | center | bottom; or a panel). */
async function drag(page, srcPanel, srcTitle, target, where = 'center') {
    const src = panelItem(page, srcPanel, srcTitle);
    await src.scrollIntoViewIfNeeded();
    const handle = src.locator('[title="Drag to reorder"]').first();
    const sb = await handle.boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 + 10, sb.y + sb.height / 2 + 6, {steps: 5});
    await target.scrollIntoViewIfNeeded().catch(() => {});
    const tb = await target.boundingBox();
    const y = where === 'top' ? tb.y + 3 : where === 'bottom' ? tb.y + tb.height - 3 : where === 'panel-end' ? tb.y + tb.height - 10 : tb.y + tb.height / 2;
    await page.mouse.move(tb.x + tb.width / 2, y, {steps: 15});
    await sleep(250);
    await page.mouse.move(tb.x + tb.width / 2 + 1, y, {steps: 2});
    await sleep(250);
    await page.mouse.up();
    await sleep(500);
}

/** Every visible dialog's heading-ish text and buttons, the last first. */
async function dialogs(page) {
    return page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').evaluateAll((els) => els.map((d) => ({
        name: d.getAttribute('aria-label') || d.querySelector('h1,h2,h3')?.innerText.trim() || null,
        text: d.innerText.replace(/\s+/g, ' ').trim().slice(0, 600),
        buttons: [...d.querySelectorAll('button, a.pkpButton, a[role=button]')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim() || b.getAttribute('aria-label') || b.title).filter(Boolean),
    })));
}

/** Wait up to `ms` for a page-level notice matching `re`; return its text or null. */
async function notice(page, re, ms = 6000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const txt = await page.evaluate((src) => {
            const r = new RegExp(src);
            const cands = [...document.querySelectorAll('[role="alert"], [role="status"], .pkp_notification, [class*="otification"], [class*="toast"], [class*="Toast"]')];
            for (const c of cands) { const t = (c.innerText || '').trim(); if (r.test(t)) return t; }
            return null;
        }, re.source);
        if (txt) return txt;
        await sleep(200);
    }
    return null;
}

/** The window's field errors, footer text and the "Save" state. */
async function formState(page) {
    const win = menuWindow(page);
    return win.evaluate((w) => ({
        fieldErrors: [...w.querySelectorAll('.pkpFormField__error, .pkpFieldError, [id$="-error"], .pkpFormFieldError')].map((e) => e.innerText.trim()).filter(Boolean),
        footer: [...w.querySelectorAll('.pkpFormPage__footer, .pkpForm__footer, [class*="footer"]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-1)[0] ?? null,
        saveDisabled: [...w.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Save')?.disabled ?? null,
        footerControls: (() => { const f = [...w.querySelectorAll('.pkpFormPage__footer, .pkpForm__footer, [class*="footer"]')].slice(-1)[0]; return f ? [...f.querySelectorAll('a, button')].map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('href') ? '[href=' + e.getAttribute('href') + ']' : ''} "${e.innerText.trim()}"`) : []; })(),
        title: w.querySelector('input[name="title"]')?.value ?? null,
        area: (() => { const s = w.querySelector('select[name="areaName"]'); return s ? {value: s.value, label: s.options[s.selectedIndex]?.text, options: [...s.options].map((o) => o.text)} : null; })(),
    })).catch((e) => ({error: String(e.message || e)}));
}

async function pressWindowButton(page, name) {
    await menuWindow(page).getByRole('button', {name, exact: true}).click();
    await sleep(500);
}

async function saveMenu(page) {
    await pressWindowButton(page, 'Save');
    const n = await notice(page, /Navigation menu was successfully/);
    await idle(page);
    await sleep(500);
    const open = await editor(page).isVisible().catch(() => false);
    return {notice: n, windowOpen: open};
}

/** The public header of a context (or the site with ctx 'index'): primary and user menus as trees, what the primary row holds. */
async function header(page, app, ctx, locale = '') {
    await page.goto(ctx === 'index' ? app.url(`/index.php/index${locale ? '/' + locale : ''}`) : ctxUrl(app, ctx, '', locale));
    await idle(page);
    return page.evaluate(() => {
        const tree = (ul) => (ul ? [...ul.children].filter((li) => li.tagName === 'LI').map((li) => {
            const a = li.querySelector(':scope > a');
            const sub = li.querySelector(':scope > ul');
            const o = {title: a ? a.innerText.trim() : null, href: a ? a.getAttribute('href') : null, target: a ? a.getAttribute('target') : null};
            if (sub) o.children = tree(sub);
            return o;
        }) : null);
        const pw = document.querySelector('.pkp_navigation_primary_wrapper');
        const uw = document.querySelector('#navigationUserWrapper');
        return {
            url: location.href,
            primary: tree(document.querySelector('#navigationPrimary')),
            user: tree(document.querySelector('#navigationUser')),
            primaryRowText: pw ? pw.innerText.replace(/\s+/g, ' ').trim() : null,
            primaryRowChildren: pw ? [...pw.children].map((c) => c.tagName + (c.id ? '#' + c.id : '') + (c.className ? '.' + String(c.className).split(' ')[0] : '')) : null,
            userWrapperText: uw ? uw.innerText.replace(/\s+/g, ' ').trim() : null,
            userWrapperChildren: uw ? [...uw.children].map((c) => c.tagName + (c.id ? '#' + c.id : '')) : null,
            navLabel: document.querySelector('nav.pkp_site_nav_menu')?.getAttribute('aria-label') ?? null,
        };
    });
}

const flat = (tree) => (tree ? tree.map((n) => n.title + (n.children ? ` > [${n.children.map((c) => c.title).join(', ')}]` : '')) : null);

/** Tab through the window from its Title box; each focused element's description. */
async function tabWalk(page, n = 40) {
    await menuWindow(page).locator('input[name="title"]').focus();
    const seen = [];
    for (let i = 0; i < n; i++) {
        await page.keyboard.press('Tab');
        const d = await page.evaluate(() => {
            const e = document.activeElement;
            if (!e) return null;
            const item = e.closest('[data-menu-item-title]');
            return `${e.tagName.toLowerCase()}${e.getAttribute('title') ? '[title=' + e.getAttribute('title').slice(0, 40) + ']' : ''} "${(e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 30)}"${item ? ' in item ' + item.getAttribute('data-menu-item-title') : ''}`;
        });
        seen.push(d);
    }
    return seen;
}

// the first top-level item of the installed primary menu, per app
const firstTop = (app) => (app.name === 'omp' ? 'Catalog' : app.name === 'ops' ? 'Announcements' : 'Current');
const archivesLike = (app) => (app.name === 'omp' ? 'Catalog' : 'Archives');

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    let S = fs.existsSync(stateFile(app)) && !process.env.RESEED ? JSON.parse(fs.readFileSync(stateFile(app))) : null;

    // ---- seed ----
    if (!S) {
        const mk = async (prefix, extra = {}, users = ['mgr']) => {
            const t = tag(prefix);
            // OPS has no "editor" key: its second manager-level account is a second manager
            const roleOf = {mgr: 'manager', ed: app.name === 'ops' ? 'manager' : 'editor', rd: 'reader'};
            await app.api.createContext({tag: t, users: users.map((u) => ({username: `${t}${u}`, roles: [roleOf[u]]})), ...extra});
            return {path: t, users: Object.fromEntries(users.map((u) => [u, `${t}${u}`]))};
        };
        S = {
            A: await mk('u08k1a', {}, ['mgr', 'ed', 'rd']),
            I: await mk('u08k1i', {}, ['mgr', 'rd']),
            D: await mk('u08k1d'),
            M: await mk('u08k1m', {context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}}),
        };
        fs.writeFileSync(stateFile(app), JSON.stringify(S, null, 1));
        log(app.name, 'seeded', JSON.stringify(S));
    }
    const {A, I, D, M} = S;

    // ---- pk: the seeded journal's tables as its manager (td4, td5), both windows read and cancelled ----
    if (on('pk')) {
        const {page, close} = await launch(app);
        try {
            await as(page, 'manager.maya', 'publicknowledge');
            await openNav(page, app, 'publicknowledge');
            const g = await grids(page);
            await snap(page, '10-pk-navigation-tab', {grids: g});
            await loc(page, 'Navigation tab: the menus table', menusTable(page));
            await loc(page, 'Navigation tab: the items table', itemsTable(page));
            await loc(page, 'Navigation tab: "Add Menu"', page.getByRole('link', {name: 'Add Menu', exact: true}));
            await loc(page, 'Navigation tab: "Add item"', page.getByRole('link', {name: 'Add item', exact: true}));
            const out = {grids: g, windows: {}};
            for (const m of g.menus.rows.map((r) => r.title)) {
                await openMenu(page, m);
                out.windows[m] = {panels: await panels(page), form: await formState(page), dialogs: await dialogs(page)};
                await snap(page, `11-pk-window-${m.split(' ')[0].toLowerCase()}`, out.windows[m]);
                await pressWindowButton(page, 'Cancel');
                out.windows[m].afterCancel = await dialogs(page);
                await openNav(page, app, 'publicknowledge');
            }
            record('12-pk-summary', out);
            log(app.name, 'pk menus', JSON.stringify(g.menus.rows), 'items', JSON.stringify(g.items.rows));
            for (const [m, w] of Object.entries(out.windows)) log(app.name, 'pk window', m, JSON.stringify(brief(w.panels)), 'area', JSON.stringify(w.form.area));
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- fresh: A untouched; tables per viewer (Rule 3), row controls, both windows' icons and notices (td8), "Add Menu" (Rule 4) ----
    if (on('fresh')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            for (const who of ['mgr', 'ed']) {
                await as(page, A.users[who], A.path);
                await openNav(page, app, A.path);
                out[`grids-${who}`] = await grids(page);
                await snap(page, `20-fresh-tab-${who}`, {grids: out[`grids-${who}`]});
                log(app.name, 'fresh', who, JSON.stringify(out[`grids-${who}`].menus.rows), JSON.stringify(out[`grids-${who}`].items.rows));
            }
            // as the editor (manager-level) still: row controls on both tables
            out.menuRowControls = await rowControls(page, 'menus', 'Primary Navigation Menu');
            out.itemRowControls = await rowControls(page, 'items', 'Search');
            await snap(page, '21-fresh-row-controls', {menuRowControls: out.menuRowControls, itemRowControls: out.itemRowControls});
            await loc(page, 'menus table: a row\'s "Settings" arrow', gridRow(page, 'menus', 'User Navigation Menu').locator('a.show_extras'));
            // the "Edit" link opens the same window, headed "Edit"
            await rowAction(page, 'menus', 'Primary Navigation Menu', 'Edit');
            await waitMenuWindow(page);
            out.editViaRow = {dialogs: await dialogs(page), heading: await menuWindow(page).locator('h1').first().innerText().catch(() => null)};
            await snap(page, '22-fresh-edit-via-row', out.editViaRow);
            await pressWindowButton(page, 'Cancel');
            await as(page, A.users.mgr, A.path);
            await openNav(page, app, A.path);
            // both windows via the title link; every icon's notice
            out.windows = {};
            for (const m of ['Primary Navigation Menu', 'User Navigation Menu']) {
                await openMenu(page, m, 'title');
                const w = {heading: await menuWindow(page).locator('h1').first().innerText().catch(() => null), panels: await panels(page), form: await formState(page), notices: []};
                await snap(page, `23-fresh-window-${m.split(' ')[0].toLowerCase()}`, w);
                if (m === 'Primary Navigation Menu') {
                    await loc(page, 'menu window: an item\'s handle', panelItem(page, 'assigned', 'About').locator('[title="Drag to reorder"]'));
                    await loc(page, 'menu window: the warning icon on "About"', panelItem(page, 'assigned', 'About').locator('button.text-negative'));
                }
                // press each distinct icon once (both panels)
                const done = new Set();
                for (const panel of ['assigned', 'unassigned']) {
                    const items = w.panels[panel].items;
                    for (const it of items) {
                        for (const [k, ic] of it.icons.entries()) {
                            const key = ic.kind + '|' + ic.title;
                            if (done.has(key)) continue;
                            done.add(key);
                            const btn = panelItem(page, panel, it.title).locator('button[title]').nth(k);
                            await btn.click();
                            await sleep(400);
                            const d = await dialogs(page);
                            w.notices.push({item: it.title, panel, kind: ic.kind, dialogs: d});
                            if (w.notices.length === 1) await snap(page, `24-fresh-notice-${m.split(' ')[0].toLowerCase()}`, {d});
                            const ok = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().getByRole('button', {name: 'OK', exact: true});
                            if (await ok.count()) await ok.click(); else await page.keyboard.press('Escape');
                            await sleep(300);
                        }
                    }
                }
                w.afterNotices = await dialogs(page);
                out.windows[m] = w;
                log(app.name, 'fresh window', m, JSON.stringify(brief(w.panels)), 'area', JSON.stringify(w.form.area));
                for (const n of w.notices) log(app.name, '  notice', n.item, n.kind, JSON.stringify(n.dialogs.slice(-1)));
                await pressWindowButton(page, 'Cancel');
                await openNav(page, app, A.path);
            }
            // "Add Menu": every item unassigned
            await page.getByRole('link', {name: 'Add Menu', exact: true}).click();
            await waitMenuWindow(page);
            out.addMenu = {heading: await menuWindow(page).locator('h1').first().innerText().catch(() => null), panels: await panels(page), form: await formState(page)};
            await snap(page, '25-fresh-add-menu', out.addMenu);
            log(app.name, 'fresh add menu', out.addMenu.heading, JSON.stringify(brief(out.addMenu.panels)), JSON.stringify(out.addMenu.form));
            await pressWindowButton(page, 'Cancel');
            out.afterAddCancel = await dialogs(page);
            record('26-fresh-summary', out);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- arrange: td6 and Rule 5 on A's primary menu, then Cancel › Yes ----
    if (on('arrange')) {
        const {page, close} = await launch(app);
        const browserDialogs = watchDialogs(page);
        try {
            await as(page, A.users.mgr, A.path);
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            const steps = [];
            const step = async (label, fn) => {
                await fn();
                const p = await panels(page);
                steps.push({label, panels: brief(p), full: p});
                log(app.name, 'arrange', label, JSON.stringify(brief(p)));
            };
            const al = archivesLike(app);
            await step('0 as opened', async () => {});
            await step(`1 Search (unassigned) onto ${al}, centre`, () => drag(page, 'unassigned', 'Search', panelItem(page, 'assigned', al), 'center'));
            await snap(page, '30-arrange-1');
            // the first item under "About": "About the Journal" (press: "About the Press"; server: its own)
            const aboutCtx = (await panels(page)).assigned.items.find((i) => i.level === 1 && i.title !== 'Search').title;
            await step(`2 Search (now under ${al}) onto "${aboutCtx}", centre`, () => drag(page, 'assigned', 'Search', panelItem(page, 'assigned', aboutCtx), 'center'));
            await snap(page, '31-arrange-2');
            await step('3 About (with children) onto "' + firstTop(app) + '", centre', () => drag(page, 'assigned', 'About', panelItem(page, 'assigned', firstTop(app)), 'center'));
            await step('4 "Editorial Masthead" (a child) to the top edge of the first top-level item', async () => {
                const first = (await panels(page)).assigned.items[0].title;
                await drag(page, 'assigned', 'Editorial Masthead', panelItem(page, 'assigned', first), 'top');
            });
            await step('5 the first top-level item to the bottom edge of "About"\'s last child', async () => {
                const p = await panels(page);
                const first = p.assigned.items[0].title;
                const lastChild = [...p.assigned.items].reverse().find((i) => i.level === 1).title;
                await drag(page, 'assigned', first, panelItem(page, 'assigned', lastChild), 'bottom');
            });
            await step('6 About to "Unassigned Menu Items"', () => drag(page, 'assigned', 'About', editor(page).locator('[data-cy="panel-content-unassigned"]'), 'panel-end'));
            await snap(page, '32-arrange-6');
            await step('7 Register (unassigned) up/down within the unassigned panel: onto the top edge of its first item', async () => {
                const first = (await panels(page)).unassigned.items[0].title;
                await drag(page, 'unassigned', 'Logout', panelItem(page, 'unassigned', first), 'top');
            });
            // leave with the change: Cancel › Yes
            await pressWindowButton(page, 'Cancel');
            const warn = await dialogs(page);
            await snap(page, '33-arrange-cancel-warning', {warn});
            await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().getByRole('button', {name: 'Yes', exact: true}).click();
            await sleep(600);
            const after = await dialogs(page);
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            const reopened = brief(await panels(page));
            await snap(page, '34-arrange-reopened', {reopened});
            await pressWindowButton(page, 'Cancel');
            record('35-arrange-summary', {steps, warn, after, reopened, browserDialogs});
            log(app.name, 'arrange cancel warning', JSON.stringify(warn), 'after Yes', JSON.stringify(after), 'reopened', JSON.stringify(reopened));
        } finally { await close(); }
    }

    // ---- leave: td7 ----
    if (on('leave')) {
        const {page, close} = await launch(app);
        const browserDialogs = watchDialogs(page);
        try {
            const out = {};
            await as(page, A.users.mgr, A.path);
            const before = await header(page, app, A.path);
            out.headerBefore = {primary: flat(before.primary), user: flat(before.user)};
            await openNav(page, app, A.path);
            // (1) Cancel with nothing changed
            browserDialogs.step = '1 cancel unchanged';
            await openMenu(page, 'Primary Navigation Menu');
            await pressWindowButton(page, 'Cancel');
            out.cancelUnchanged = {dialogs: await dialogs(page), windowOpen: await editor(page).isVisible().catch(() => false)};
            // (1b) the back arrow ("Close") with nothing changed; (1c) Escape with nothing changed
            browserDialogs.step = 'leaving after 1 (cancel unchanged)';
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            await loc(page, 'menu window: the back arrow', menuWindow(page).getByRole('button', {name: 'Close', exact: true}));
            await menuWindow(page).getByRole('button', {name: 'Close', exact: true}).click();
            await sleep(500);
            out.closeUnchanged = {dialogs: await dialogs(page), windowOpen: await editor(page).isVisible().catch(() => false)};
            browserDialogs.step = 'leaving after 1b (close unchanged)';
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            await page.keyboard.press('Escape');
            await sleep(500);
            out.escUnchanged = {dialogs: await dialogs(page), windowOpen: await editor(page).isVisible().catch(() => false)};
            // (2) drag one item, Cancel › No, back arrow › Yes
            browserDialogs.step = 'leaving after 1c (escape unchanged)';
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            await drag(page, 'unassigned', 'Search', panelItem(page, 'assigned', firstTop(app)), 'top');
            out.dragged = brief(await panels(page));
            await pressWindowButton(page, 'Cancel');
            out.cancelChanged = await dialogs(page);
            await snap(page, '40-leave-cancel-warning', {d: out.cancelChanged});
            await loc(page, 'the "Warning" dialog', page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: 'The data on this form has changed'}));
            await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().getByRole('button', {name: 'No', exact: true}).click();
            await sleep(500);
            out.afterNo = {dialogs: await dialogs(page), panels: brief(await panels(page))};
            await menuWindow(page).getByRole('button', {name: 'Close', exact: true}).click();
            await sleep(500);
            out.closeChanged = await dialogs(page);
            await snap(page, '41-leave-close-warning', {d: out.closeChanged});
            await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().getByRole('button', {name: 'Yes', exact: true}).click();
            await sleep(600);
            out.afterYes = {dialogs: await dialogs(page), windowOpen: await editor(page).isVisible().catch(() => false)};
            // (3) drag one item, Escape
            browserDialogs.step = 'leaving after 2 (dragged, Cancel/No, Close/Yes)';
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            await drag(page, 'unassigned', 'Search', panelItem(page, 'assigned', firstTop(app)), 'top');
            await page.keyboard.press('Escape');
            await sleep(600);
            out.escChanged = {dialogs: await dialogs(page), windowOpen: await editor(page).isVisible().catch(() => false)};
            await snap(page, '42-leave-escape-changed', out.escChanged);
            const warnOpen = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: 'The data on this form has changed'});
            if (await warnOpen.count()) { await warnOpen.getByRole('button', {name: 'Yes', exact: true}).click(); await sleep(500); }
            else if (await editor(page).isVisible().catch(() => false)) { await pressWindowButton(page, 'Cancel'); const w = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'}); if (await w.count()) await w.getByRole('button', {name: 'Yes', exact: true}).click(); }
            // (4) only the title typed, then Cancel
            browserDialogs.step = 'leaving after 3 (dragged, Escape, then Yes)';
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            await menuWindow(page).locator('input[name="title"]').fill('Primary Navigation Menu x');
            await pressWindowButton(page, 'Cancel');
            out.cancelTitleOnly = {dialogs: await dialogs(page), windowOpen: await editor(page).isVisible().catch(() => false)};
            const w4 = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'});
            if (await w4.count()) { await w4.getByRole('button', {name: 'Yes', exact: true}).click(); await sleep(400); }
            // (4b) only the area changed, then Cancel
            browserDialogs.step = 'leaving after 4 (title typed, Cancel, Yes)';
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            await menuWindow(page).locator('select[name="areaName"]').selectOption({label: 'None'});
            await pressWindowButton(page, 'Cancel');
            out.cancelAreaOnly = {dialogs: await dialogs(page), windowOpen: await editor(page).isVisible().catch(() => false)};
            const w5 = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'});
            if (await w5.count()) { await w5.getByRole('button', {name: 'Yes', exact: true}).click(); await sleep(400); }
            // (5) drag one item and leave the page (another address) with the window open
            browserDialogs.step = 'leaving after 4b (area changed, Cancel, Yes)';
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            await drag(page, 'unassigned', 'Search', panelItem(page, 'assigned', firstTop(app)), 'top');
            const nBefore = browserDialogs.length;
            browserDialogs.step = '5 leaving with the window open and changed';
            await page.goto(ctxUrl(app, A.path, '/management/settings/context')).catch((e) => { out.leaveError = String(e.message).slice(0, 200); });
            await idle(page).catch(() => {});
            out.leavePage = {browserDialogs: browserDialogs.slice(nBefore), url: page.url()};
            await snap(page, '43-leave-page', out.leavePage);
            // afterwards: the table, the window, the public header unchanged
            browserDialogs.step = 'after 5';
            await openNav(page, app, A.path);
            out.gridsAfter = await grids(page);
            await openMenu(page, 'Primary Navigation Menu');
            out.reopened = brief(await panels(page));
            await pressWindowButton(page, 'Cancel');
            const after = await header(page, app, A.path);
            out.headerAfter = {primary: flat(after.primary), user: flat(after.user)};
            await snap(page, '44-leave-header-after', out.headerAfter);
            out.browserDialogs = browserDialogs;
            record('45-leave-summary', out);
            log(app.name, 'leave', JSON.stringify(out, null, 0).slice(0, 4000));
        } finally { await close(); }
    }

    // ---- keyboard: A8 / Rule 5c ----
    if (on('keyboard')) {
        const {page, close} = await launch(app);
        try {
            await as(page, A.users.mgr, A.path);
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            const before = brief(await panels(page));
            const walk = await tabWalk(page, 45);
            // on a focused icon button inside an item: arrows, Space, Enter
            const keys = {};
            const aboutWarn = panelItem(page, 'assigned', 'About').locator('button[title]').first();
            await aboutWarn.focus();
            for (const k of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft']) {
                await page.keyboard.press(k);
                await sleep(200);
            }
            keys.afterArrows = brief(await panels(page));
            keys.dialogsAfterArrows = await dialogs(page);
            // is any item element or its handle focusable?
            const focusables = await editor(page).evaluate((root) => [...root.querySelectorAll('[data-menu-item-title], [data-menu-item-title] [title="Drag to reorder"]')].map((e) => ({tabIndex: e.tabIndex, role: e.getAttribute('role'), aria: e.getAttribute('aria-roledescription') || e.getAttribute('aria-grabbed')})).slice(0, 4));
            await panelItem(page, 'assigned', 'About').locator('[title="Drag to reorder"]').focus().catch(() => {});
            const focusedHandle = await page.evaluate(() => document.activeElement?.getAttribute('title') || document.activeElement?.tagName);
            await page.keyboard.press('Space');
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Space');
            await sleep(300);
            keys.afterSpace = brief(await panels(page));
            await snap(page, '50-keyboard', {walk, focusables, focusedHandle, keys});
            record('51-keyboard-summary', {before, walk, focusables, focusedHandle, keys});
            log(app.name, 'keyboard walk', JSON.stringify(walk));
            log(app.name, 'keyboard focusables', JSON.stringify(focusables), 'focusedHandle', focusedHandle, 'changed', JSON.stringify(keys.afterArrows) !== JSON.stringify(before), JSON.stringify(keys.afterSpace) !== JSON.stringify(before));
            await pressWindowButton(page, 'Cancel');
            const w = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'});
            if (await w.count()) await w.getByRole('button', {name: 'Yes', exact: true}).click();
        } finally { await close(); }
    }

    // ---- save: td8 (the warning icon at once or after Save), Rule 6 (notice, table, header) ----
    if (on('save')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await as(page, A.users.mgr, A.path);
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            const al = archivesLike(app);
            await drag(page, 'unassigned', 'Search', panelItem(page, 'assigned', al), 'center');
            out.atOnce = (await panels(page)).assigned.items.find((i) => i.title === al);
            await snap(page, '60-save-dragged', {atOnce: out.atOnce});
            out.save = await saveMenu(page);
            await snap(page, '61-save-notice', out.save);
            out.grids = await grids(page);
            await openNav(page, app, A.path);
            out.gridsReload = await grids(page);
            await openMenu(page, 'Primary Navigation Menu');
            const p = await panels(page);
            out.afterReopen = p.assigned.items.find((i) => i.title === al);
            out.reopened = brief(p);
            await snap(page, '62-save-reopened', {afterReopen: out.afterReopen});
            // the new warning's notice
            const warnBtn = panelItem(page, 'assigned', al).locator('button.text-negative');
            if (await warnBtn.count()) { await warnBtn.click(); await sleep(400); out.warnNotice = await dialogs(page); const ok = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK', exact: true}); if (await ok.count()) await ok.click(); }
            await pressWindowButton(page, 'Cancel');
            const h = await header(page, app, A.path);
            out.header = {primary: h.primary, user: flat(h.user)};
            await snap(page, '63-save-header', out.header);
            await signOut(page).catch(() => {});
            const h2 = await header(page, app, A.path);
            out.headerSignedOut = {primary: flat(h2.primary), user: flat(h2.user)};
            record('64-save-summary', out);
            log(app.name, 'save', JSON.stringify({atOnce: out.atOnce, save: out.save, row: out.grids.menus.rows, afterReopen: out.afterReopen, warnNotice: out.warnNotice, header: flat(out.header.primary), headerSignedOut: out.headerSignedOut}));
        } finally { await close(); }
    }

    // ---- addmenu: td1 (refusals), a second menu saved and filled (Rules 4, 6) ----
    if (on('addmenu')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await as(page, A.users.mgr, A.path);
            await openNav(page, app, A.path);
            await page.getByRole('link', {name: 'Add Menu', exact: true}).click();
            await waitMenuWindow(page);
            // (1) empty title
            await menuWindow(page).getByRole('button', {name: 'Save', exact: true}).click();
            const n1 = await notice(page, /not saved|successfully/, 3000);
            await sleep(500);
            out.s1 = {notice: n1, form: await formState(page), dialogText: (await screen(page)).text.dialog};
            await snap(page, '70-addmenu-empty', out.s1);
            const link = menuWindow(page).locator('a, button').filter({hasText: /Go to Title/}).first();
            await loc(page, 'menu window: the footer\'s "Go to Title" link', link);
            if (await link.count()) { out.s1.linkVisible = await link.isVisible(); await link.click({timeout: 5000}).catch(async (e) => { out.s1.linkClickError = String(e.message).split('\n')[0]; const b = await link.boundingBox(); if (b) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); out.s1.linkClickedByMouse = true; } }); await sleep(300); out.s1.focusAfterLink = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.getAttribute('name')}`); }
            // (2) the title of the installed menu
            await menuWindow(page).locator('input[name="title"]').fill('Primary Navigation Menu');
            await menuWindow(page).getByRole('button', {name: 'Save', exact: true}).click();
            const n2 = await notice(page, /not saved|successfully/, 3000);
            await idle(page); await sleep(500);
            out.s2 = {notice: n2, form: await formState(page)};
            await snap(page, '71-addmenu-duplicate', out.s2);
            // (2b) the same title in other letter case
            await menuWindow(page).locator('input[name="title"]').fill('primary navigation menu');
            await menuWindow(page).getByRole('button', {name: 'Save', exact: true}).click();
            out.s2b = {notice: await notice(page, /Navigation menu was successfully|already exists/, 4000)};
            await idle(page); await sleep(500);
            out.s2b.windowOpen = await editor(page).isVisible().catch(() => false);
            out.s2b.form = out.s2b.windowOpen ? await formState(page) : null;
            if (!out.s2b.windowOpen) { await openNav(page, app, A.path); out.s2b.grids = await grids(page); await snap(page, '71b-addmenu-lowercase-saved', {grids: out.s2b.grids}); }
            // (3) a new title with "primary"
            if (!out.s2b.windowOpen) { log(app.name, 'addmenu: lower-case duplicate was accepted'); await page.getByRole('link', {name: 'Add Menu', exact: true}).click(); await waitMenuWindow(page); }
            await menuWindow(page).locator('input[name="title"]').fill('Footer links');
            await menuWindow(page).locator('select[name="areaName"]').selectOption('primary');
            await pressWindowButton(page, 'Save');
            await idle(page); await sleep(500);
            out.s3 = {form: await formState(page)};
            await snap(page, '72-addmenu-area-taken', out.s3);
            // (4) None
            await menuWindow(page).locator('select[name="areaName"]').selectOption({label: 'None'});
            out.s4 = await saveMenu(page);
            out.s4.grids = await grids(page);
            await snap(page, '73-addmenu-saved', out.s4);
            // Footer links: two items in, one already in the primary menu (Rule 4: still offered)
            await openNav(page, app, A.path);
            await openMenu(page, 'Footer links');
            out.footerOpened = brief(await panels(page));
            await drag(page, 'unassigned', 'Submissions', editor(page).locator('[data-cy="panel-content-assigned"]'), 'center');
            await drag(page, 'unassigned', 'Search', panelItem(page, 'assigned', 'Submissions'), 'bottom');
            out.footerFilled = brief(await panels(page));
            out.footerSave = await saveMenu(page);
            out.footerGrids = await grids(page);
            await openNav(page, app, A.path);
            await openMenu(page, 'Footer links');
            out.footerReopened = brief(await panels(page));
            await snap(page, '74-addmenu-footer-reopened', {footerReopened: out.footerReopened});
            // every item assigned: the right panel's text (not saved)
            let guard = 0;
            while (guard++ < 30) {
                const p = await panels(page);
                if (!p.unassigned.items.length) break;
                const last = p.assigned.items.filter((i) => i.level === 0).slice(-1)[0];
                await drag(page, 'unassigned', p.unassigned.items[0].title, panelItem(page, 'assigned', last.title), 'bottom');
            }
            out.allAssigned = brief(await panels(page));
            await snap(page, '75-addmenu-all-assigned', out.allAssigned);
            await pressWindowButton(page, 'Cancel');
            const w = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'});
            if (await w.count()) await w.getByRole('button', {name: 'Yes', exact: true}).click();
            // the primary menu's window still offers the items Footer links holds
            await openNav(page, app, A.path);
            await openMenu(page, 'Primary Navigation Menu');
            out.primaryOffers = brief(await panels(page));
            await pressWindowButton(page, 'Cancel');
            // Footer links (area None) shows nowhere
            const h = await header(page, app, A.path);
            out.header = {primary: flat(h.primary), user: flat(h.user), primaryRowText: h.primaryRowText};
            record('76-addmenu-summary', out);
            log(app.name, 'addmenu', JSON.stringify({s1: out.s1.form, focus: out.s1.focusAfterLink, s2: out.s2.form, s2b: out.s2b, s3: out.s3.form, s4: {notice: out.s4.notice, open: out.s4.windowOpen, rows: out.s4.grids.menus.rows}}));
            log(app.name, 'addmenu footer', JSON.stringify({opened: out.footerOpened, filled: out.footerFilled, save: out.footerSave, rows: out.footerGrids.menus.rows, reopened: out.footerReopened, allAssigned: out.allAssigned.unassigned, primaryOffers: out.primaryOffers.unassigned, header: out.header}));
        } finally { await close(); }
    }

    // ---- areas: Rule 8 on A (None shows nowhere; an empty area; a menu moved into an area) ----
    if (on('areas')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            const setArea = async (menu, label) => {
                await openNav(page, app, A.path);
                await openMenu(page, menu);
                await menuWindow(page).locator('select[name="areaName"]').selectOption({label});
                const r = await saveMenu(page);
                return {...r, form: r.windowOpen ? await formState(page) : null};
            };
            await as(page, A.users.mgr, A.path);
            out.primaryNone = await setArea('Primary Navigation Menu', 'None');
            out.h1 = await header(page, app, A.path);
            await snap(page, '80-areas-primary-none');
            await signOut(page).catch(() => {});
            out.h1out = await header(page, app, A.path);
            await as(page, A.users.mgr, A.path);
            out.footerPrimary = await setArea('Footer links', 'primary');
            out.h2 = await header(page, app, A.path);
            await snap(page, '81-areas-footer-primary');
            out.userNone = await setArea('User Navigation Menu', 'None');
            out.h3 = await header(page, app, A.path);
            await snap(page, '82-areas-user-none-signed-in');
            await signOut(page).catch(() => {});
            out.h3out = await header(page, app, A.path);
            await snap(page, '83-areas-user-none-signed-out');
            // back: user menu to "user" (the header's own sign-in link is gone meanwhile)
            await as(page, A.users.mgr, A.path);
            out.userBack = await setArea('User Navigation Menu', 'user');
            out.h4 = await header(page, app, A.path);
            out.grids = await grids(page).catch(() => null);
            await openNav(page, app, A.path);
            out.grids = await grids(page);
            record('84-areas-summary', out);
            const hs = (h) => ({primary: flat(h.primary), user: flat(h.user), row: h.primaryRowText, rowKids: h.primaryRowChildren, userText: h.userWrapperText, userKids: h.userWrapperChildren});
            log(app.name, 'areas', JSON.stringify({primaryNone: out.primaryNone.notice, h1: hs(out.h1), h1out: hs(out.h1out), footerPrimary: out.footerPrimary.notice, h2: hs(out.h2), userNone: out.userNone.notice, h3: hs(out.h3), h3out: hs(out.h3out), h4: hs(out.h4), rows: out.grids.menus.rows}));
        } finally { await close(); }
    }

    // the remaining phases live in k1-items.js and k1-site.js (same state file)
    if (on('items') || on('types') || on('flips') || on('delete') || on('lang') || on('site') || on('control')) {
        await require('./k1-more.js')({app, S, on, log, sleep, T, helpers: {ctxUrl, snap, as, watchDialogs, openNav, menusTable, itemsTable, grids, gridRow, rowControls, rowAction, editor, menuWindow, waitMenuWindow, openMenu, panels, brief, panelItem, drag, dialogs, notice, formState, pressWindowButton, saveMenu, header, flat, firstTop, archivesLike}});
    }
});
