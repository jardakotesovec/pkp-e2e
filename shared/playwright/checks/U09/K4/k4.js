// U09 claim check, chunk K4: who may do what, the settings that gate the
// whole feature, the cross-feature pointers, the Coverage rows.
// Spec: docs/specs/U09-custom-pages-and-blocks.md lines 1–62 (Purpose, Actors
// & permissions), 344–348 (Settings 6), 352–357 (Settings 8), 359–389
// (Cross-feature interactions, scenarios preamble), 390–456 (Coverage, the
// register table); footnotes a, b, c, d, f, g, h, i, m, y, td1, td7, td9,
// td19, td32.
//
// Seeds per app (POST scenarios/context, tag prefix u09k4; state file
// k4-state-<app>.json in the output folder; RESEED=1 makes new ones):
//   A  en only; "Custom Block Manager" on through the harness key; "Static
//      Pages Plugin" as a new journal has it (ticked ON SCREEN by `build`,
//      td9). One throwaway account per permission level: m manager, e editor
//      and p productionEditor (OJS, OMP), s sectionEditor, c assistant
//      (copyeditor; OPS editorialBoardMember), u author, v externalReviewer
//      (OJS, OMP), r reader. `admin` is enrolled by the API.
//   N  (OJS, OMP) the Editor role with "Permit changes to Settings" unticked
//      (roles key), "Static Pages Plugin" seeded on; user e (editor).
//   O  nothing enabled (the "while enabled" axis); user m (manager).
// Phases (PHASES=a,b; default all, in this order), one app per process:
//   build   td9, td1, td19: the manager ticks "Static Pages Plugin", adds a
//           static page "about-us", the "Custom Page" items "our-page" and
//           "info/fees", the block "Our Partners" (placed afterwards); the
//           public reads; "Our page" dragged into the Primary Navigation Menu
//   roles   every level: landing, side menu, a Settings address, the two
//           preview addresses (td7), the public pages and the sidebar; the
//           manager-level accounts' whole offer (tabs, plugin rows, windows)
//   editor  the Editor (OJS, OMP; OPS: the manager) adds a page, a static page
//           and a block, places it, previews, uploads a picture (Actors rows
//           1, 2, 4–9); the Site Administrator's "Preview" in the journal
//   upload  a picture button on a screen a non-manager opens (Profile), and
//           a Vue box's upload address (Actors row 9, Cross-feature bullet 7)
//   closed  td32: "Users must be registered…" ticked, the addresses signed
//           out, the reader signing in there; unticked again; the tab left
//           with an unsaved change; Appearance › Setup left unsaved
//   site    the Site Administrator: Site Settings tabs, the Navigation item
//           window's "Custom Page", the site Plugins row and its window, the
//           site "Sidebar", Hosted Journals (read-only, nothing saved)
//   site2   the Site Administrator ticks the site's "Custom Block Manager" (and "Static Pages
//           Plugin", OJS, OMP), reads what each adds, and unticks it again (the site as found)
//   xfeat   the screens the cross-feature pointers name: Settings › Journal › "Contact",
//           Settings › Website › Setup › "Languages" (its "Forms" column)
//   off     O: no "Static Pages" tab, no "Manage Custom Blocks" while the
//           plugins are off (Actors rows 5, 6)
// Run: PROBE_FEATURE=U09 PROBE_AGENT=ccK4 node bin/probe.js <app> shared/playwright/checks/U09/K4/k4.js
//      PHASES=roles,editor … to run some phases on the existing seeds.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');
const H = require('../K1/lib');
const {openNav, openMenu, panels, brief, assignTop, saveMenu, itemWindow, openItemWindow, itemState, itemSave, closeItemWindow, setType, fillTitle, readNav, grids} = H;

const ALL = ['build', 'roles', 'editor', 'upload', 'closed', 'site', 'site2', 'off', 'xfeat'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const log = (...a) => console.log('[k4]', ...a);
const J = (o) => JSON.stringify(o);
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);

// a small PNG for the upload drives
function crc32(buf) {
    let c;
    const table = crc32.t || (crc32.t = Array.from({length: 256}, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = (x * 5 + y * 3) & 0xff;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

forEachApp(async (app) => {
    const isOps = app.name === 'ops';
    const hasStatic = !isOps;
    const ctxUrl = (ctx, p = '', locale = 'en') => app.url(`/index.php/${ctx}${locale ? '/' + locale : ''}${p}`);

    // ---- seeds ---------------------------------------------------------------
    const sf = stateFile(app);
    let S = fs.existsSync(sf) && !process.env.RESEED ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null;
    const seedFacts = {};
    if (!S) {
        const t = tag('u09k4');
        const A = `${t}a`; const N = `${t}n`; const O = `${t}o`;
        const levels = isOps
            ? {m: 'manager', s: 'sectionEditor', c: 'editorialBoardMember', u: 'author', r: 'reader'}
            : {m: 'manager', e: 'editor', p: 'productionEditor', s: 'sectionEditor', c: 'copyeditor', u: 'author', v: 'externalReviewer', r: 'reader'};
        const users = Object.entries(levels).map(([k, role]) => ({username: `${A}${k}`, roles: [role]}));
        const rA = await app.api.createContext({tag: A, context: {name: `U09 K4 A ${A}`, acronym: 'K4A'}, plugins: {customblockmanagerplugin: {enabled: true}}, users});
        seedFacts.A = {ok: true, keys: Object.keys(rA || {})};
        if (hasStatic) {
            const rN = await app.api.createContext({tag: N, context: {name: `U09 K4 N ${N}`, acronym: 'K4N'}, roles: {editor: {permitSettings: false}},
                plugins: {staticpagesplugin: {enabled: true}}, users: [{username: `${N}e`, roles: ['editor']}]});
            seedFacts.N = {ok: true, keys: Object.keys(rN || {})};
        }
        await app.api.createContext({tag: O, context: {name: `U09 K4 O ${O}`, acronym: 'K4O'}, users: [{username: `${O}m`, roles: ['manager']}]});
        S = {t, A, N: hasStatic ? N : null, O, levels};
        fs.writeFileSync(sf, JSON.stringify(S, null, 2));
        record('seed', {S, seedFacts}, {merge: true});
    }
    const {A, N, O, levels} = S;
    const U = (k) => `${A}${k}`;
    log(app.name, 'contexts', A, N, O);

    const M = await launch(app);   // the signed-in browser
    const V = await launch(app);   // a signed-out visitor
    const page = M.page;
    const vis = V.page;
    const asked = [];
    for (const [who, p] of [['m', page], ['v', vis]]) {
        p.on('dialog', async (d) => { asked.push({who, type: d.type(), message: d.message().slice(0, 300), url: p.url()}); await d.accept().catch(() => {}); });
    }
    const askedSince = (n) => asked.slice(n);
    const facts = {};
    const fact = (k, v) => { facts[k] = v; record('facts', {[k]: v}, {merge: true}); log(app.name, k, J(v).slice(0, 1600)); };
    const snap = async (p, name, extra = {}) => {
        const s = await screen(p).catch((e) => ({error: String(e.message || e)}));
        record(name, {...s, ...extra});
        await shot(p, name).catch(() => {});
        return s;
    };
    const step = async (name, fn) => {
        try { return await fn(); } catch (e) {
            fact(`ERROR-${name}`, String(e.stack || e).slice(0, 900));
            await shot(page, `error-${name}`).catch(() => {});
            if (process.env.STOP === '1') throw e;
            return null;
        }
    };
    const as = async (user, ctx = A) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); };
    const toastSel = '.pkpNotification, .pkp_notification, [role="alert"], .pkpToast, [class*="toast"], [class*="Toast"], .ui-pnotify';
    const toasts = async (p = page, ms = 3000) => {
        const seen = new Set();
        const end = Date.now() + ms;
        while (Date.now() < end) {
            for (const x of await p.locator(toastSel).allInnerTexts().catch(() => [])) { const s = flat(x, 200); if (s) seen.add(s); }
            await sleep(250);
        }
        return [...seen];
    };

    // ---- reading ---------------------------------------------------------------
    const readPage = async (p) => p.evaluate(() => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const q = (s) => document.querySelector(s);
        const main = q('.pkp_structure_main') || q('main');
        const side = q('.pkp_structure_sidebar');
        return {
            url: location.href.replace(/^https?:\/\/[^/]+/, ''),
            title: document.title,
            h1s: [...document.querySelectorAll('h1')].map(t).filter(Boolean).slice(0, 4),
            headings: [...(main || document).querySelectorAll('h1, h2, h3')].map((h) => `${h.tagName} ${t(h)}`).slice(0, 8),
            breadcrumbs: t(q('.cmp_breadcrumbs')),
            publicHeader: !!q('.pkp_structure_head'),
            publicFooter: !!q('.pkp_structure_footer'),
            loginForm: !!q('form#login, form.cmp_form.login, input[name="username"]'),
            blocks: side ? [...side.querySelectorAll('.pkp_block')].map((b) => b.id || b.className.replace(/\s+/g, ' ')) : null,
            customBlocks: [...document.querySelectorAll('.block_custom')].map((b) => ({id: b.id, text: t(b).slice(0, 120)})),
            primaryMenu: [...document.querySelectorAll('#navigationPrimary > li > a')].map((a) => ({text: t(a), href: a.getAttribute('href')})),
            editLinks: [...document.querySelectorAll('.cmp_edit_link, a')].filter((a) => a.classList.contains('cmp_edit_link') || /^\s*Edit\s*$/.test(a.innerText || '')).map((a) => ({text: t(a), href: a.getAttribute('href')})).slice(0, 4),
            mainText: main ? t(main).slice(0, 500) : null,
            bodyText: t(document.body) ? t(document.body).slice(0, 400) : null,
        };
    });
    const pub = async (p, url, name) => {
        let status = null; let err = null;
        const r = await p.goto(url).catch((e) => { err = String(e.message).split('\n')[0]; return null; });
        if (r) status = r.status();
        await idle(p).catch(() => {});
        const d = await readPage(p).catch((e) => ({error: String(e.message || e)}));
        const out = {status, gotoError: err, ...d};
        await snap(p, name, {read: out});
        return out;
    };
    const short = (x) => (x ? {status: x.status, url: x.url, title: x.title, h1: x.h1s, crumbs: x.breadcrumbs, hdr: x.publicHeader, login: x.loginForm, blocks: x.blocks, custom: x.customBlocks && x.customBlocks.map((b) => b.id), edit: x.editLinks && x.editLinks.length, main: flat(x.mainText || x.bodyText, 160)} : x);

    // ---- Settings › Website ---------------------------------------------------
    const openWebsite = async (ctx, top) => {
        await page.goto('about:blank');
        const r = await page.goto(ctxUrl(ctx, '/management/settings/website'));
        await idle(page);
        if (top) { await page.locator(`[id="${top}-button"]`).first().click({timeout: 10_000}); await idle(page); await sleep(700); }
        return r ? r.status() : null;
    };
    const topTabs = async () => page.evaluate(() => {
        const tl = [...document.querySelectorAll('[role="tablist"]')].find((x) => x.querySelector('#setup-button, #appearance-button, #plugins-button'));
        if (!tl) return null;
        return [...tl.querySelectorAll(':scope [role="tab"]')].filter((t) => t.closest('[role="tablist"]') === tl).map((t) => t.innerText.trim());
    }).catch(() => null);
    const pluginRow = (id) => page.locator(`tr.gridRow[id$="-row-${id}"]`).first();
    const pluginState = async (id) => {
        const row = pluginRow(id);
        if (!(await row.count())) return {present: false};
        return row.evaluate((tr) => {
            const box = tr.querySelector('input[type=checkbox]');
            let cat = null;
            let p = tr.closest('tbody');
            // the category: the nearest earlier category row
            let r = tr.previousElementSibling;
            while (r && !cat) { if (/category/.test(r.className)) cat = r.innerText.trim(); r = r.previousElementSibling; }
            if (!cat && p) { let pb = p.previousElementSibling; while (pb && !cat) { const c = pb.querySelector && pb.querySelector('tr.category, tr[class*="category"]'); if (c) cat = c.innerText.trim(); else if (/category/.test(pb.className || '')) cat = pb.innerText.trim(); pb = pb.previousElementSibling; } }
            return {present: true, text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), checked: box ? box.checked : null, disabled: box ? box.disabled : null, arrow: !!tr.querySelector('a.show_extras, a.hide_extras'), category: cat};
        });
    };
    const rowLinks = async (id) => {
        const row = pluginRow(id);
        if (!(await row.count())) return null;
        const rid = await row.getAttribute('id');
        const opener = row.locator('a.show_extras');
        if (await opener.count()) { await opener.first().click(); await sleep(500); }
        return {rid, links: await page.locator(`[id="${rid}-control-row"] a`).evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => [])};
    };
    const tickPlugin = async (id, want) => {
        const box = pluginRow(id).getByRole('checkbox').first();
        const was = await box.isChecked();
        if (was === want) return {was, changed: false};
        const w = page.waitForResponse((r) => /plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
        await sleep(800);
        const dlg = page.locator('[role="dialog"]:visible').last();
        let ask = null;
        if (await dlg.count()) {
            ask = flat(await dlg.innerText().catch(() => ''), 300);
            const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const r = await w;
        const ts = await toasts(page, 2500);
        await idle(page);
        return {was, changed: true, ask, status: r ? r.status() : null, toasts: ts, now: await box.isChecked().catch(() => null)};
    };
    // the Static Pages tab
    const spContainer = () => page.locator('#staticPageGridContainer').first();
    const spGrid = async () => {
        await spContainer().locator('.pkp_controllers_grid').first().waitFor({timeout: T});
        await idle(page); await sleep(300);
        return spContainer().evaluate((root) => {
            const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const grid = root.querySelector('.pkp_controllers_grid');
            return {
                heading: txt(grid && grid.querySelector('.header h4, h4')),
                actions: grid ? [...grid.querySelectorAll('.header a, .actions a')].map(txt).filter(Boolean) : [],
                rows: [...root.querySelectorAll('tr.gridRow')].map((tr) => [...tr.querySelectorAll(':scope > td')].map((td) => { const c = td.cloneNode(true); c.querySelectorAll('a.show_extras, a.hide_extras, script').forEach((a) => a.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); }).filter(Boolean).join(' | ')),
                empty: [...root.querySelectorAll('tr.empty, .empty')].filter((e) => e.offsetParent !== null).map(txt).filter(Boolean),
            };
        });
    };
    const spWin = () => page.locator('[role="dialog"]:visible').filter({has: page.locator('form#staticPageForm')}).last();
    const waitEditors = async (sel) => {
        await page.locator(sel).first().waitFor({state: 'attached', timeout: T});
        await idle(page);
        const id = await page.locator(sel).first().getAttribute('id');
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
        await sleep(700);
        return id;
    };
    const mceGet = async (id) => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id).catch(() => null);
    const mceType = async (id, text) => {
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T});
        await page.frameLocator(`[id="${id}_ifr"]`).locator('body').click();
        await page.keyboard.press('Control+End');
        if (text) await page.keyboard.type(text);
        await sleep(200);
        return mceGet(id);
    };
    const barButtons = async (id) => page.locator(`[id="${id}"] ~ .tox-tinymce`).first().locator('.tox-editor-header button, .tox-editor-header [role="button"]').evaluateAll((els) => els.map((b) => b.getAttribute('aria-label') || b.title || b.innerText.trim()).filter(Boolean)).catch(() => []);
    const addStatic = async (ctx, {p, title, text}, name) => {
        await openWebsite(ctx, 'staticPages');
        const before = await spGrid();
        await spContainer().getByRole('link', {name: 'Add Static Page', exact: true}).first().click();
        const id = await waitEditors('form#staticPageForm textarea[name="content[en]"]');
        await spWin().locator('input[name="path"]').fill(p);
        await spWin().locator('input[name="title[en]"]').fill(title);
        await mceType(id, text);
        await spWin().locator('input[name="path"]').click(); await sleep(400);
        if (name) await snap(page, `${name}-typed`);
        const posts = [];
        const onResp = (r) => { if (/update-?static-?page/i.test(r.url())) posts.push(r.status()); };
        page.on('response', onResp);
        await spWin().getByRole('button', {name: 'Save', exact: true}).click();
        const ts = await toasts(page, 3000);
        await idle(page); await sleep(500);
        page.off('response', onResp);
        const open = await spWin().isVisible().catch(() => false);
        if (open) { await spWin().getByRole('button', {name: /^Close/}).first().click().catch(() => {}); await sleep(600); }
        const after = await spGrid();
        if (name) await snap(page, name, {before, after, toasts: ts});
        return {posts, toasts: ts, windowOpen: open, before: before.rows, after: after.rows};
    };
    // "Custom Page" items
    const addCustom = async (ctx, {title, p, text}, name, {preview = false} = {}) => {
        await openNav(page, app, ctx, 'en');
        await openItemWindow(page, 'add');
        await fillTitle(page, title);
        await setType(page, 'Custom Page');
        await itemWindow(page).locator('input[name="path"]').fill(p);
        const id = await itemWindow(page).locator('textarea[name="content[en]"]').getAttribute('id');
        await mceType(id, text);
        await itemWindow(page).locator('input[name="path"]').click();
        await sleep(400);
        const out = {};
        if (preview) out.preview = await doPreview(itemWindow(page), `${name}-preview`);
        if (name) await snap(page, `${name}-typed`, {window: await itemState(page)});
        const r = await itemSave(page);
        Object.assign(out, {notice: r.notice, windowOpen: r.windowOpen, posts: r.posts, errors: r.state && r.state.errors});
        if (r.windowOpen) out.close = await closeItemWindow(page);
        return out;
    };
    const doPreview = async (win, name) => {
        const out = {};
        const btn = win.locator('#previewButton');
        out.button = flat(await btn.innerText().catch(() => ''));
        const [popup] = await Promise.all([
            page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null),
            btn.click().catch((e) => { out.clickError = String(e.message).split('\n')[0]; }),
        ]);
        out.newTab = !!popup;
        if (popup) {
            await popup.waitForLoadState('load').catch(() => {});
            await sleep(2500);
            out.page = await readPage(popup).catch((e) => ({error: String(e.message || e)}));
            record(name, {...(await screen(popup).catch(() => ({}))), preview: out});
            await shot(popup, name).catch(() => {});
            await popup.close();
        }
        return out;
    };
    // custom blocks
    const managerDialog = () => page.locator('[role="dialog"]:visible').filter({has: page.locator('[id*="customblockgrid"], table[id*="customblock"]')}).first();
    const managerState = async () => {
        const d = managerDialog();
        if (!(await d.count())) return {open: false};
        await d.locator('.pkp_controllers_grid').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        return d.evaluate((root) => {
            const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
            return {
                open: true,
                heading: txt(root.querySelector('h1, h2')),
                actions: [...root.querySelectorAll('.pkp_controllers_grid .header a, .actions a')].map(txt).filter(Boolean),
                rows: [...root.querySelectorAll('tr.gridRow')].map((tr) => { const td = tr.querySelector('td'); const c = td ? td.cloneNode(true) : null; if (c) c.querySelectorAll('a.show_extras, a.hide_extras, script').forEach((a) => a.remove()); return c ? c.textContent.replace(/\s+/g, ' ').trim() : null; }),
                empty: [...root.querySelectorAll('tr.empty, .empty')].filter((e) => e.offsetParent !== null).map(txt).filter(Boolean),
            };
        });
    };
    const openManager = async (ctx) => {
        await openWebsite(ctx, 'plugins');
        const rl = await rowLinks('customblockmanagerplugin');
        const link = page.locator(`[id="${rl.rid}-control-row"]`).getByRole('link', {name: 'Manage Custom Blocks', exact: true}).first();
        if (!(await link.count())) return {rowLinks: rl.links, manager: {open: false}};
        await link.click();
        await managerDialog().waitFor({timeout: T});
        return {rowLinks: rl.links, manager: await managerState()};
    };
    const blockForm = () => page.locator('form#customBlockForm:visible').first();
    const closeDialogs = async () => {
        for (let i = 0; i < 3 && (await page.locator('[role="dialog"]:visible').count()); i++) {
            const d = page.locator('[role="dialog"]:visible').last();
            const cancel = d.getByRole('link', {name: 'Cancel', exact: true}).first();
            if (await cancel.count() && await cancel.isVisible().catch(() => false)) await cancel.click();
            else await d.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
            await sleep(700);
        }
    };
    const addBlock = async (ctx, title, text, name, {upload} = {}) => {
        const o = await openManager(ctx);
        await managerDialog().getByRole('link', {name: 'Add Block', exact: true}).first().click();
        const id = await waitEditors('form#customBlockForm textarea[name="blockContent[en]"]');
        await blockForm().locator('input[name="blockTitle[en]"]').fill(title);
        await mceType(id, text);
        const out = {rowLinks: o.rowLinks, managerBefore: o.manager};
        if (upload) out.upload = await uploadPicture(id, upload, `${name}-upload`);
        await page.locator('[role="dialog"]:visible').filter({has: page.locator('form#customBlockForm')}).last().locator('h1, h2').first().click().catch(() => {});
        await sleep(300);
        const w = page.waitForResponse((r) => /update-?custom-?block/i.test(r.url()), {timeout: T}).catch(() => null);
        await blockForm().locator('button[id^="submitFormButton"], button[type=submit]').first().click();
        const r = await w;
        out.status = r ? r.status() : null;
        out.toasts = await toasts(page, 2500);
        await idle(page); await sleep(600);
        out.windowStillOpen = (await blockForm().count()) > 0;
        out.manager = await managerState();
        if (name) await snap(page, name, out);
        await closeDialogs();
        return out;
    };
    // Appearance › Setup › Sidebar
    const openAppearanceSetup = async (ctx) => {
        await openWebsite(ctx, 'appearance');
        await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click();
        await idle(page); await sleep(700);
    };
    const sidebarList = async () => page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
    const saveAppearance = async () => {
        const form = page.locator('form').filter({has: page.locator('input[name="sidebar"]')}).first();
        const w = page.waitForResponse((r) => /\/api\/v1\/(contexts|site)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        const saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
        return {status: r ? r.status() : null, saved, errors: (await page.locator('.pkpFieldError').allInnerTexts().catch(() => [])).map((x) => flat(x, 200))};
    };
    // pictures
    const pngFile = path.join(outDir(), 'k4-picture.png');
    if (!fs.existsSync(pngFile)) fs.writeFileSync(pngFile, png(60, 40));
    const imgDlg = () => page.locator('.tox-dialog:visible').first();
    const uploadPicture = async (taId, file, name) => {
        const bar = page.locator(`[id="${taId}"] ~ .tox-tinymce`).first();
        const btn = bar.getByRole('button', {name: /Insert\/edit image/i}).first();
        if (!(await btn.count())) return {imageButton: false, bar: await barButtons(taId)};
        await btn.click();
        await imgDlg().waitFor({timeout: T});
        await sleep(400);
        const tabs = await imgDlg().locator('[role="tab"], .tox-dialog__body-nav-item').allInnerTexts().catch(() => []);
        const tab = imgDlg().locator('.tox-dialog__body-nav-item').filter({hasText: 'Upload'}).first();
        if (await tab.count()) { await tab.click(); await sleep(400); }
        const resps = [];
        const onResp = async (r) => { if (/_uploadPublicFile/.test(r.url())) { const body = await r.text().catch(() => ''); resps.push({status: r.status(), method: r.request().method(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), body: body.slice(0, 300)}); } };
        page.on('response', onResp);
        const input = imgDlg().locator('input[type="file"]').first();
        const hasInput = await input.count();
        if (hasInput) await input.setInputFiles(file);
        const end = Date.now() + 12_000;
        while (hasInput && Date.now() < end && !resps.length) await sleep(250);
        await sleep(1500);
        page.off('response', onResp);
        const source = await imgDlg().locator('input[type="url"], input.tox-textfield').first().inputValue().catch(() => null);
        const nts = (await page.locator('.tox-notification:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 300));
        if (name) await snap(page, name);
        let inserted = null;
        if (source) {
            await imgDlg().getByRole('button', {name: 'Save', exact: true}).first().click().catch(() => {});
            await sleep(600);
            inserted = flat(await mceGet(taId), 300);
        }
        for (let i = 0; i < 3 && (await page.locator('.tox-dialog:visible').count()); i++) {
            const d = page.locator('.tox-dialog:visible').last();
            await d.getByRole('button', {name: /^(OK|Ok|Close|Cancel)$/}).first().click().catch(() => page.keyboard.press('Escape'));
            await sleep(400);
        }
        return {imageButton: true, tabs, hasInput, requests: resps, source, notices: nts, inserted};
    };

    // the side menu and the Settings address, for one signed-in account
    const levelRead = async (key, user, ctx, {manager = false} = {}) => {
        const o = {user};
        await as(user, ctx);
        o.landing = page.url().replace(/^https?:\/\/[^/]+/, '');
        await page.goto(ctxUrl(ctx, '/submissions')); await idle(page); await sleep(500);
        o.dashboardUrl = page.url().replace(/^https?:\/\/[^/]+/, '');
        const nav = await readNav(page);
        o.sideMenu = nav.groupLabels;
        o.settingsInMenu = nav.groups.some((g) => /^Settings/.test(g.label));
        await snap(page, `r-${key}-dashboard`, {nav});
        const st = await openWebsite(ctx);
        o.settings = {status: st, ...(await readPage(page)), tabs: await topTabs()};
        o.settings.mainText = flat(o.settings.mainText || o.settings.bodyText, 200);
        await snap(page, `r-${key}-settings-website`, {read: o.settings});
        if (manager && o.settings.tabs) {
            // the Plugins tab: the two rows
            await page.locator('#plugins-button').first().click(); await idle(page); await sleep(800);
            o.plugins = {};
            for (const id of ['staticpagesplugin', 'customblockmanagerplugin']) {
                o.plugins[id] = await pluginState(id);
                if (o.plugins[id].present) o.plugins[id].links = (await rowLinks(id)).links;
            }
            o.pluginTabs = await page.locator('#plugins [role="tab"]').allInnerTexts().catch(() => []);
            await snap(page, `r-${key}-plugins`, {plugins: o.plugins});
            // Setup › Navigation: "Add item" and the "Custom Page" type
            await openNav(page, app, ctx, 'en');
            const g = await grids(page);
            o.navigation = {itemsHeading: g.items.heading, itemsActions: g.items.actions, itemRows: g.items.rows};
            await snap(page, `r-${key}-navigation`, {navigation: o.navigation});
            // "Static Pages" tab
            if (o.settings.tabs.includes('Static Pages')) {
                await openWebsite(ctx, 'staticPages');
                o.staticPages = await spGrid().catch((e) => ({error: String(e.message || e)}));
                await snap(page, `r-${key}-static-pages`, {grid: o.staticPages});
            }
            // "Manage Custom Blocks"
            const mg = await openManager(ctx).catch((e) => ({error: String(e.message || e)}));
            o.customBlocks = mg;
            await snap(page, `r-${key}-custom-blocks`, {manager: mg});
            await closeDialogs();
            // Appearance › Setup › Sidebar
            await openAppearanceSetup(ctx);
            o.sidebar = await sidebarList();
            await snap(page, `r-${key}-appearance-setup`, {sidebar: o.sidebar});
        }
        // the preview addresses typed
        o.preview = await pub(page, ctxUrl(ctx, '/navigationMenu/preview'), `r-${key}-nav-preview`);
        if (hasStatic) o.staticPreview = await pub(page, ctxUrl(ctx, '/pages/preview'), `r-${key}-pages-preview`);
        // the public side
        o.ourPage = await pub(page, ctxUrl(ctx, '/our-page'), `r-${key}-our-page`);
        if (hasStatic) o.aboutUs = await pub(page, ctxUrl(ctx, '/about-us'), `r-${key}-about-us`);
        o.home = await pub(page, ctxUrl(ctx, ''), `r-${key}-home`);
        return o;
    };
    const lvl = (o) => (o ? {landing: o.landing, dash: o.dashboardUrl, settingsInMenu: o.settingsInMenu, side: o.sideMenu, settings: {status: o.settings.status, url: o.settings.url, h1: o.settings.h1s, tabs: o.settings.tabs, main: o.settings.mainText}, plugins: o.plugins, nav: o.navigation && o.navigation.itemsActions, sp: o.staticPages && {actions: o.staticPages.actions, rows: o.staticPages.rows}, cb: o.customBlocks && {links: o.customBlocks.rowLinks, rows: o.customBlocks.manager && o.customBlocks.manager.rows, actions: o.customBlocks.manager && o.customBlocks.manager.actions}, sidebar: o.sidebar && o.sidebar.map((s) => `${s.label}${s.checked ? ' [x]' : ''}`), preview: short(o.preview), staticPreview: short(o.staticPreview), ourPage: short(o.ourPage), aboutUs: short(o.aboutUs), home: short(o.home)} : o);

    try {
        // =====================================================================
        if (on('build')) await step('build', async () => {
            const o = {};
            await as(U('m'));
            // td9: the Plugins row as a new journal has it, ticked on screen
            await openWebsite(A, 'plugins');
            o.tabsBefore = await topTabs();
            o.staticRowBefore = await pluginState('staticpagesplugin');
            o.cbmRow = await pluginState('customblockmanagerplugin');
            await snap(page, 'b01-plugins-before', {o});
            if (hasStatic) {
                o.tick = await tickPlugin('staticpagesplugin', true);
                o.tabsAtOnce = await topTabs();
                await snap(page, 'b02-plugins-ticked', {tick: o.tick, tabs: o.tabsAtOnce});
                await page.reload(); await idle(page); await sleep(800);
                o.tabsAfterReload = await topTabs();
                await page.locator('#plugins-button').first().click(); await idle(page); await sleep(800);
                const rl = await rowLinks('staticpagesplugin');
                o.staticRowLinks = rl.links;
                const edit = page.locator(`[id="${rl.rid}-control-row"]`).getByRole('link', {name: 'Edit/Add Content', exact: true}).first();
                if (await edit.count()) {
                    await loc(page, 'Plugins: the Static Pages Plugin row\'s "Edit/Add Content"', edit);
                    await edit.click(); await idle(page); await sleep(1200);
                    o.editAddContentLands = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), selected: await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => [])};
                    await snap(page, 'b03-edit-add-content', {lands: o.editAddContentLands});
                }
                o.static = await addStatic(A, {p: 'about-us', title: 'About us', text: 'About us text.'}, 'b04-static-about-us');
            }
            // td1: the two "Custom Page" items, in no menu
            o.our = await addCustom(A, {title: 'Our page', p: 'our-page', text: 'Welcome to our page.'}, 'b05-item-our-page');
            o.fees = await addCustom(A, {title: 'Fees', p: 'info/fees', text: 'Fees text.'}, 'b06-item-fees');
            // td19: the block
            o.block = await addBlock(A, 'Our Partners', 'Partner list', 'b07-block-our-partners');
            await openAppearanceSetup(A);
            o.sidebarAfterAdd = await sidebarList();
            await snap(page, 'b08-appearance-setup-after-add', {sidebar: o.sidebarAfterAdd});
            o.homeUnplaced = short(await pub(vis, ctxUrl(A, ''), 'b09-home-signed-out-unplaced'));
            // place it
            const opt = o.sidebarAfterAdd.find((s) => /partners/i.test(s.value + s.label));
            if (opt) {
                await page.locator(`input[name="sidebar"][value="${opt.value}"]`).first().check();
                o.placeSave = await saveAppearance();
            }
            // the public reads, signed out
            o.anon = {
                our: short(await pub(vis, ctxUrl(A, '/our-page'), 'b10-our-page-signed-out')),
                fees: short(await pub(vis, ctxUrl(A, '/info/fees'), 'b11-info-fees-signed-out')),
                home: short(await pub(vis, ctxUrl(A, ''), 'b12-home-signed-out-placed')),
            };
            if (hasStatic) o.anon.about = short(await pub(vis, ctxUrl(A, '/about-us'), 'b13-about-us-signed-out'));
            o.mgrOur = short(await pub(page, ctxUrl(A, '/our-page'), 'b14-our-page-manager'));
            // the menu
            o.menu = await step('menu', async () => {
                await openNav(page, app, A, 'en');
                await openMenu(page, 'Primary Navigation Menu');
                const before = brief(await panels(page));
                const ok = await assignTop(page, 'Our page');
                const saved = await saveMenu(page);
                const h = await pub(vis, ctxUrl(A, ''), 'b15-home-with-menu-link');
                return {before, assigned: ok, saved, link: h.primaryMenu.find((m) => m.text === 'Our page')};
            });
            o.dialogs = asked.slice();
            fact('build', o);
        });

        // =====================================================================
        if (on('roles')) await step('roles', async () => {
            const o = {};
            const mgrLevel = new Set(['m', 'e', 'p']);
            const only = process.env.LEVELS ? process.env.LEVELS.split(',') : null;
            const want = (k) => !only || only.includes(k);
            for (const k of Object.keys(levels).filter(want)) {
                o[k] = await step(`roles-${k}`, async () => levelRead(k, U(k), A, {manager: mgrLevel.has(k)}));
                fact(`roles-${k}`, lvl(o[k]));
            }
            if (want('admin')) o.admin = await step('roles-admin', async () => levelRead('admin', 'admin', A, {manager: true}));
            if (want('admin')) fact('roles-admin', lvl(o.admin));
            if (N && want('n')) {
                o.nEditor = await step('roles-nEditor', async () => levelRead('n-editor', `${N}e`, N, {manager: true}));
                fact('roles-n-editor', lvl(o.nEditor));
            }
            // signed out
            if (!want('anon')) return;
            const anon = {};
            anon.settings = short(await pub(vis, ctxUrl(A, '/management/settings/website'), 'r-anon-settings-website'));
            anon.preview = short(await pub(vis, ctxUrl(A, '/navigationMenu/preview'), 'r-anon-nav-preview'));
            if (hasStatic) anon.staticPreview = short(await pub(vis, ctxUrl(A, '/pages/preview'), 'r-anon-pages-preview'));
            anon.ourPage = short(await pub(vis, ctxUrl(A, '/our-page'), 'r-anon-our-page'));
            if (hasStatic) anon.aboutUs = short(await pub(vis, ctxUrl(A, '/about-us'), 'r-anon-about-us'));
            anon.login = short(await pub(vis, ctxUrl(A, '/login'), 'r-anon-login'));
            anon.about = short(await pub(vis, ctxUrl(A, '/about'), 'r-anon-about'));
            anon.search = short(await pub(vis, ctxUrl(A, '/search'), 'r-anon-search'));
            anon.notFound = short(await pub(vis, ctxUrl(A, '/no-such-page'), 'r-anon-not-found'));
            fact('roles-anon', anon);
        });

        // =====================================================================
        if (on('editor')) await step('editor', async () => {
            const o = {};
            const who = isOps ? U('m') : U('e');
            await as(who);
            o.who = who;
            o.page = await addCustom(A, {title: 'Editor page', p: 'editor-page', text: 'Written by the editor.'}, 'e01-item-editor-page', {preview: true});
            if (hasStatic) o.static = await addStatic(A, {p: 'editor-static', title: 'Editor static', text: 'Static by the editor.'}, 'e02-static-editor');
            o.block = await addBlock(A, 'Editor Box', 'Box by the editor.', 'e03-block-editor-box', {upload: pngFile});
            await openAppearanceSetup(A);
            const sl = await sidebarList();
            const opt = sl.find((s) => /editor-box/i.test(s.value));
            if (opt) { await page.locator(`input[name="sidebar"][value="${opt.value}"]`).first().check(); o.place = await saveAppearance(); }
            o.sidebar = (await sidebarList()).map((s) => `${s.label}${s.checked ? ' [x]' : ''}`);
            await snap(page, 'e04-editor-sidebar', {sidebar: o.sidebar});
            o.pub = {
                page: short(await pub(vis, ctxUrl(A, '/editor-page'), 'e05-editor-page-signed-out')),
                home: short(await pub(vis, ctxUrl(A, ''), 'e06-home-two-blocks')),
            };
            if (hasStatic) o.pub.static = short(await pub(vis, ctxUrl(A, '/editor-static'), 'e07-editor-static-signed-out'));
            if (!isOps) {
                // the Production Editor: the item window's Preview
                await as(U('p'));
                await openNav(page, app, A, 'en');
                await openItemWindow(page, 'add');
                await fillTitle(page, 'PE preview');
                await setType(page, 'Custom Page');
                const id = await itemWindow(page).locator('textarea[name="content[en]"]').getAttribute('id');
                await mceType(id, 'Production editor preview.');
                await itemWindow(page).locator('input[name="path"]').fill('pe-preview');
                await itemWindow(page).locator('input[name="path"]').click(); await sleep(300);
                o.pePreview = await doPreview(itemWindow(page), 'e08-pe-preview');
                o.peClose = await closeItemWindow(page);
            }
            // the Site Administrator's Preview in the journal's item window
            await as('admin');
            await openNav(page, app, A, 'en');
            await openItemWindow(page, 'add');
            await fillTitle(page, 'Admin preview');
            await setType(page, 'Custom Page');
            const aid = await itemWindow(page).locator('textarea[name="content[en]"]').getAttribute('id');
            await mceType(aid, 'Admin preview text.');
            await itemWindow(page).locator('input[name="path"]').fill('admin-preview');
            await itemWindow(page).locator('input[name="path"]').click(); await sleep(300);
            o.adminPreview = await doPreview(itemWindow(page), 'e09-admin-preview');
            o.adminClose = await closeItemWindow(page);
            o.dialogs = asked.slice();
            fact('editor', o);
        });

        // =====================================================================
        if (on('upload')) await step('upload', async () => {
            const o = {};
            // a non-manager's formatted text box: Profile › Public "Bio Statement"
            for (const k of ['r', 'u']) {
                await as(U(k));
                await page.goto(ctxUrl(A, '/user/profile')); await idle(page); await sleep(800);
                const pubTab = page.getByRole('tab', {name: /^Public$/}).first();
                if (await pubTab.count()) { await pubTab.click(); await idle(page); await sleep(1000); }
                const tas = await page.locator('textarea').evaluateAll((els) => els.map((e) => ({id: e.id, name: e.name})));
                const bio = tas.find((t) => /biography/i.test(t.name + t.id));
                const r = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), textareas: tas};
                if (bio && bio.id) {
                    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), bio.id, {timeout: T}).catch(() => {});
                    r.bar = await barButtons(bio.id);
                    await snap(page, `u01-profile-public-${k}`, {r});
                    if (k === 'r') r.upload = await uploadPicture(bio.id, pngFile, `u02-profile-upload-${k}`);
                } else {
                    await snap(page, `u01-profile-public-${k}`, {r});
                }
                o[`profile-${k}`] = r;
            }
            // a Vue box: Appearance › Setup "Page Footer" (the manager)
            await as(U('m'));
            await openAppearanceSetup(A);
            const fid = await page.locator('textarea[id*="pageFooter"]').first().getAttribute('id').catch(() => null);
            if (fid) {
                await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), fid, {timeout: T}).catch(() => {});
                o.footerBar = await barButtons(fid);
                o.footerUpload = await uploadPicture(fid, pngFile, 'u03-footer-upload');
            }
            // leave Appearance › Setup with the footer changed and unsaved: another tab, then another address
            const n0 = asked.length;
            await page.locator('#plugins-button').first().click(); await idle(page); await sleep(800);
            o.leaveTab = {dialogs: askedSince(n0), selected: await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => [])};
            await snap(page, 'u04-left-appearance-for-plugins', {leave: o.leaveTab});
            await page.locator('#appearance-button').first().click(); await idle(page); await sleep(800);
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page); await sleep(800);
            o.footerAfterReturn = fid ? flat(await mceGet(fid), 300) : null;
            const n1 = asked.length;
            await page.goto(ctxUrl(A, '/submissions')).catch((e) => { o.leaveGotoError = String(e.message).split('\n')[0]; });
            await idle(page).catch(() => {});
            o.leaveAddress = {dialogs: askedSince(n1), url: page.url().replace(/^https?:\/\/[^/]+/, '')};
            await openAppearanceSetup(A);
            o.footerAfterReload = fid ? flat(await mceGet(await page.locator('textarea[id*="pageFooter"]').first().getAttribute('id')), 300) : null;
            fact('upload', o);
        });

        // =====================================================================
        if (on('closed')) await step('closed', async () => {
            const o = {};
            await as(U('m'));
            await page.goto(ctxUrl(A, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(600);
            const box = page.getByRole('checkbox', {name: /Users must be registered and log in to view the/}).first();
            o.label = await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            o.default = await box.isChecked().catch(() => null);
            o.tabs = await page.locator('[role="tab"]').allInnerTexts().catch(() => []);
            await loc(page, 'Site Access Options: "Users must be registered and log in to view the … site."', box);
            await snap(page, 'c01-site-access', {label: o.label, default: o.default});
            // leave the tab once with the box ticked and unsaved
            await box.check();
            const n0 = asked.length;
            const other = page.getByRole('tab', {name: 'Roles', exact: true}).first();
            if (await other.count()) { await other.click(); await idle(page); await sleep(700); }
            o.leaveTab = {dialogs: askedSince(n0)};
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(500);
            o.leaveTab.boxAfterReturn = await box.isChecked().catch(() => null);
            await snap(page, 'c02-site-access-after-tab-switch', {leave: o.leaveTab});
            const n1 = asked.length;
            await page.goto(ctxUrl(A, '/submissions')).catch(() => {});
            await idle(page).catch(() => {});
            o.leaveAddress = {dialogs: askedSince(n1)};
            await page.goto(ctxUrl(A, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(600);
            o.leaveAddress.boxAfterReload = await box.isChecked().catch(() => null);
            // tick and save
            await box.check();
            o.save = await H.saveForm(page, 'input[name="restrictSiteAccess"]');
            await snap(page, 'c03-site-access-saved', {save: o.save});
            // signed out: the addresses
            const addrs = {our: '/our-page', fees: '/info/fees', home: '', preview: '/navigationMenu/preview', editorPage: '/editor-page'};
            if (hasStatic) addrs.about = '/about-us';
            o.anon = {};
            for (const [k, p] of Object.entries(addrs)) o.anon[k] = short(await pub(vis, ctxUrl(A, p), `c04-closed-${k}-signed-out`));
            // the reader signs in on the page the custom page sent them to
            await vis.goto(ctxUrl(A, '/our-page')); await idle(vis);
            o.landedOn = vis.url().replace(/^https?:\/\/[^/]+/, '');
            if (await vis.locator('input[name="username"]').count()) {
                const pw = vis.locator('input[name="password"]').first();
                await vis.locator('input[name="username"]').first().fill(U('r'));
                await pw.evaluate((e) => e.removeAttribute('maxlength'));
                await pw.fill(`${U('r')}${U('r')}`);
                await Promise.all([vis.waitForNavigation({timeout: T}).catch(() => {}), vis.locator('form button[type="submit"], form input[type="submit"]').filter({visible: true}).first().click()]);
                await vis.waitForLoadState().catch(() => {}); await idle(vis).catch(() => {}); await sleep(800);
                o.afterSignIn = short(await readPage(vis));
                await snap(vis, 'c05-closed-reader-after-sign-in', {read: o.afterSignIn});
                if (hasStatic) o.readerAbout = short(await pub(vis, ctxUrl(A, '/about-us'), 'c06-closed-about-us-reader'));
                await signOut(vis);
            }
            // untick and save again: the other end
            await as(U('m'));
            await page.goto(ctxUrl(A, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(600);
            await box.uncheck();
            o.restore = await H.saveForm(page, 'input[name="restrictSiteAccess"]');
            o.reopened = short(await pub(vis, ctxUrl(A, '/our-page'), 'c07-open-again-our-page-signed-out'));
            o.dialogs = asked.slice();
            fact('closed', o);
        });

        // =====================================================================
        if (on('site')) await step('site', async () => {
            const o = {};
            await as('admin', 'index');
            await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page); await sleep(800);
            o.hostedRows = await page.locator('table tbody tr, [role="row"]').count().catch(() => null);
            o.hostedText = flat(await page.locator('main').innerText().catch(() => ''), 300);
            await snap(page, 's01-hosted-journals');
            await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page); await sleep(800);
            o.siteTabs = await page.evaluate(() => [...document.querySelectorAll('[role="tablist"]')].map((tl) => [...tl.querySelectorAll('[role="tab"]')].map((t) => t.innerText.trim())));
            await snap(page, 's02-site-settings', {tabs: o.siteTabs});
            // Navigation: "Add item" › type list
            await openNav(page, app, 'index');
            const g = await grids(page);
            o.navActions = g.items.actions;
            await openItemWindow(page, 'add');
            const st = await itemState(page);
            o.itemTypes = st.typeOptions;
            await setType(page, 'Custom Page');
            o.customPageFields = (await itemState(page)).inputs.filter((i) => i.visible).map((i) => i.name);
            await snap(page, 's03-site-item-window-custom', {types: o.itemTypes, fields: o.customPageFields});
            await fillTitle(page, 'Unsaved');
            o.closeUnsaved = await closeItemWindow(page);
            // Plugins: the site's rows
            await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
            await page.locator('#plugins-button').first().click(); await idle(page); await sleep(1000);
            o.sitePlugins = {};
            for (const id of ['customblockmanagerplugin', 'staticpagesplugin']) {
                o.sitePlugins[id] = await pluginState(id);
                if (o.sitePlugins[id].present) o.sitePlugins[id].links = (await rowLinks(id)).links;
            }
            await snap(page, 's04-site-plugins', {plugins: o.sitePlugins});
            const rid = await pluginRow('customblockmanagerplugin').getAttribute('id').catch(() => null);
            const manage = rid ? page.locator(`[id="${rid}-control-row"]`).getByRole('link', {name: 'Manage Custom Blocks', exact: true}).first() : null;
            if (manage && await manage.count()) {
                await manage.click();
                await managerDialog().waitFor({timeout: T}).catch(() => {});
                o.siteManager = await managerState();
                await snap(page, 's05-site-custom-blocks', {manager: o.siteManager});
                await closeDialogs();
            }
            // Appearance › Setup: the site's "Sidebar"
            await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
            await page.locator('#appearance-button').first().click(); await idle(page); await sleep(700);
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click().catch(() => {});
            await idle(page); await sleep(700);
            o.siteSidebar = await sidebarList();
            await snap(page, 's06-site-appearance-setup', {sidebar: o.siteSidebar});
            o.dialogs = asked.slice();
            fact('site', o);
        });

        // =====================================================================
        if (on('site2')) await step('site2', async () => {
            const o = {};
            await as('admin', 'index');
            const openSitePlugins = async () => {
                await page.goto('about:blank');
                await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
                await page.locator('#plugins-button').first().click(); await idle(page); await sleep(1000);
            };
            for (const id of ['customblockmanagerplugin', 'staticpagesplugin']) {
                await openSitePlugins();
                const before = await pluginState(id);
                if (!before.present) { o[id] = {before}; continue; }
                const r = {before};
                if (before.checked) { r.skipped = 'already ticked; left as found'; o[id] = r; continue; }
                r.tick = await tickPlugin(id, true);
                await openSitePlugins();
                r.after = await pluginState(id);
                r.links = (await rowLinks(id)).links;
                r.siteTabs = await page.evaluate(() => [...document.querySelectorAll('[role="tablist"]')].map((tl) => [...tl.querySelectorAll('[role="tab"]')].map((t) => t.innerText.trim())));
                await snap(page, `s10-site-${id}-ticked`, {r});
                if (id === 'customblockmanagerplugin') {
                    const rid = await pluginRow(id).getAttribute('id');
                    const manage = page.locator(`[id="${rid}-control-row"]`).getByRole('link', {name: 'Manage Custom Blocks', exact: true}).first();
                    if (await manage.count()) {
                        await manage.click();
                        await managerDialog().waitFor({timeout: T}).catch(() => {});
                        r.manager = await managerState();
                        await snap(page, 's11-site-custom-blocks', {manager: r.manager});
                        await closeDialogs();
                    }
                    await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
                    await page.locator('#appearance-button').first().click(); await idle(page); await sleep(700);
                    await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click().catch(() => {});
                    await idle(page); await sleep(700);
                    r.siteSidebar = (await sidebarList()).map((s) => `${s.value}${s.checked ? ' [x]' : ''}`);
                    await snap(page, 's12-site-sidebar-cbm-on', {sidebar: r.siteSidebar});
                }
                if (id === 'staticpagesplugin') {
                    const rid = await pluginRow(id).getAttribute('id');
                    const edit = page.locator(`[id="${rid}-control-row"]`).getByRole('link', {name: 'Edit/Add Content', exact: true}).first();
                    if (await edit.count()) {
                        await edit.click(); await idle(page); await sleep(1500);
                        r.editAddContent = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), h1: await page.locator('h1').allInnerTexts().catch(() => []), selected: await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => []), text: flat(await page.locator('main').innerText().catch(() => ''), 300)};
                        await snap(page, 's13-site-static-edit-add-content', {r: r.editAddContent});
                    }
                }
                await openSitePlugins();
                r.untick = await tickPlugin(id, false);
                await openSitePlugins();
                r.restored = await pluginState(id);
                o[id] = r;
            }
            o.dialogs = asked.slice();
            fact('site2', o);
        });

        // =====================================================================
        if (on('off')) await step('off', async () => {
            const o = {};
            await as(`${O}m`, O);
            await openWebsite(O, 'plugins');
            o.tabs = await topTabs();
            o.static = await pluginState('staticpagesplugin');
            o.cbm = await pluginState('customblockmanagerplugin');
            o.cbmLinks = o.cbm.present ? (await rowLinks('customblockmanagerplugin')).links : null;
            o.staticLinks = o.static.present ? (await rowLinks('staticpagesplugin')).links : null;
            await snap(page, 'o01-plugins-off', {o});
            await openAppearanceSetup(O);
            o.sidebar = (await sidebarList()).map((s) => `${s.label}${s.checked ? ' [x]' : ''}`);
            await snap(page, 'o02-appearance-setup-off', {sidebar: o.sidebar});
            o.pagesPreview = short(await pub(page, ctxUrl(O, '/pages/preview'), 'o03-pages-preview-plugin-off'));
            fact('off', o);
        });
        // =====================================================================
        if (on('xfeat')) await step('xfeat', async () => {
            const o = {};
            await as(U('m'));
            await page.goto(ctxUrl(A, '/management/settings/context')); await idle(page); await sleep(800);
            o.journalTabs = await page.locator('[role="tab"]').allInnerTexts().then((a) => a.map((x) => x.trim()).filter(Boolean)).catch(() => []);
            const contact = page.getByRole('tab', {name: 'Contact', exact: true}).first();
            if (await contact.count()) { await contact.click(); await idle(page); await sleep(700); }
            o.contactLabels = await page.locator('[role="tabpanel"]:visible label, [role="tabpanel"]:visible legend').allInnerTexts().then((a) => a.map((x) => flat(x, 80)).filter(Boolean).slice(0, 12)).catch(() => []);
            await snap(page, 'x01-settings-journal-contact', {o});
            await openWebsite(A, 'setup');
            o.setupTabs = await page.locator('#setup [role="tab"]').allInnerTexts().then((a) => a.map((x) => x.trim())).catch(() => []);
            const langs = page.locator('#setup').getByRole('tab', {name: 'Languages', exact: true}).first();
            if (await langs.count()) { await langs.click(); await idle(page); await sleep(1200); }
            o.languageColumns = await page.locator('[role="tabpanel"]:visible th, [role="tabpanel"]:visible [role="columnheader"]').allInnerTexts().then((a) => a.map((x) => flat(x, 40)).filter(Boolean)).catch(() => []);
            await snap(page, 'x02-website-setup-languages', {o});
            fact('xfeat', o);
        });

    } finally {
        await M.close();
        await V.close();
    }
});
