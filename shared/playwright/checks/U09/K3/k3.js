// U09 claim check, chunk K3: custom blocks. The "Custom Block Manager" row of
// Settings › Website › "Plugins", its "Manage Custom Blocks" window, the block
// window ("Block Name", "Content", "Show Name"), Settings › Website ›
// "Appearance" › "Setup" › "Sidebar", the public sidebar for a visitor in each
// language, the plugin unticked and ticked again, and the site's own blocks on
// Administration › "Site Settings". All three apps.
// Spec: docs/specs/U09-custom-pages-and-blocks.md lines 100–118, 202–257,
// 324–333; register A1, A2, A4; footnotes g, h, l, m, td18–td27, f-a1, f-a2, f-a4.
//
// Seeds per app (scratch, tag prefix u09k3):
//   A  en + fr_CA (UI and Forms), plugin left as a new journal has it, one manager
//   B  en + fr_CA (UI and Forms), plugin on through the harness key: the name
//      made while the manager's interface is French
//   C  en only, plugin on through the harness key: the empty "Block Name", the
//      name's shape at its other end (digits, "&"), the unsaved-leave check
// Phases (PHASES=a,…; default all): seed, a, b, c, site
//   a     Rule 17 (tick the plugin, the window), 18 (Our Partners), 19–20 (place,
//         Show Name), 21 (French), 22 (rename), 23 (same name), 19 untick,
//         25 (plugin off / on, the Appearance save meanwhile), 24 (Delete, the
//         Appearance save, a new block of the deleted name)
//   b     the interface-language axis of Rule 18
//   c     Rule 26, the name shape, the Appearance tab left unsaved
//   site  Rule 27 as admin (restores the site afterwards)
// Run: PROBE_FEATURE=U09 PROBE_AGENT=ccK3 node bin/probe.js <app|all> shared/playwright/checks/U09/K3/k3.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'a', 'b', 'c', 'site'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const log = (...a) => console.log('[k3]', ...a);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

forEachApp(async (app) => {
    const ctxUrl = (ctx, p = '', locale = '') => app.url(`/index.php/${ctx}${locale ? '/' + locale : ''}${p}`);
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const facts = {};
    const fact = (k, v) => { facts[k] = v; record('facts', {[k]: v}, {merge: true}); log(app.name, k, JSON.stringify(v).slice(0, 700)); };

    // ---- seed -------------------------------------------------------------
    if (on('seed') || !st) {
        const t = tag('u09k3');
        const mk = async (suffix, extra) => {
            const tg = `${t}${suffix}`;
            await app.api.createContext({tag: tg, context: {name: `U09 K3 ${suffix.toUpperCase()} ${tg}`, acronym: `K3${suffix.toUpperCase()}`, ...(extra.context || {})},
                users: [{username: `${tg}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}], ...(extra.rest || {})});
            return {path: tg, mgr: `${tg}mgr`};
        };
        const bi = {primaryLocale: 'en', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']};
        st = {
            t,
            A: await mk('a', {context: bi}),
            B: await mk('b', {context: bi, rest: {plugins: {customblockmanagerplugin: {enabled: true}}}}),
            C: await mk('c', {rest: {plugins: {customblockmanagerplugin: {enabled: true}}}}),
        };
        fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
        fact('seed', st);
    }

    const mgrB = await launch(app);
    const visB = await launch(app);
    const page = mgrB.page;
    const vis = visB.page;
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); d.accept().catch(() => {}); });

    const snap = async (p, name, extra = {}) => {
        const s = await screen(p).catch((e) => ({error: String(e.message || e)}));
        record(name, {...s, ...extra});
        await shot(p, name).catch(() => {});
        return s;
    };
    const STEPS = process.env.STEPS ? process.env.STEPS.split(',') : null;   // rerun named steps of a phase on its existing contexts
    const step = async (name, fn) => {
        if (STEPS && !STEPS.includes(name)) return null;
        try { return await fn(); } catch (e) {
            fact(`ERROR-${name}`, String(e.stack || e).slice(0, 800));
            await shot(page, `error-${name}`).catch(() => {});
            if (process.env.STOP === '1') throw e;
            return null;
        }
    };
    const toasts = async (p = page) => (await p.locator('.pkpNotification, .pkp_notification, [role="alert"], .pkpToast, [class*="toast"], [class*="Notification"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);

    // ---- Settings › Website ------------------------------------------------
    const openWebsite = async (ctx, top) => {
        // the interface language named: the session keeps the last one typed in an address
        await page.goto(ctx === 'index' ? app.url('/index.php/index/en/admin/settings') : ctxUrl(ctx, '/management/settings/website', 'en'));
        await idle(page);
        await page.locator(`#${top}-button`).first().click();
        await idle(page);
        await sleep(600);
    };
    const pluginRow = () => page.locator('tr.gridRow[id$="-row-customblockmanagerplugin"]').first();
    const pluginRowState = async () => {
        const row = pluginRow();
        await row.waitFor({timeout: T});
        const data = await row.evaluate((tr) => {
            const box = tr.querySelector('input[type=checkbox]');
            // the category: the category row of the same tbody, else the nearest earlier category row
            let cat = null;
            const tb = tr.closest('tbody');
            const catRow = tb && tb.querySelector('tr.category, tr[class*="category"]');
            if (catRow) cat = catRow.innerText.replace(/\s+/g, ' ').trim();
            if (!cat) { let p = tr.previousElementSibling; while (p && !cat) { if (/category/.test(p.className)) cat = p.innerText.trim(); p = p.previousElementSibling; } }
            return {id: tr.id, text: tr.innerText.replace(/\s+/g, ' ').trim(), checked: box ? box.checked : null, tbodyId: tb ? tb.id : null, category: cat,
                arrow: !!tr.querySelector('a.show_extras, a.hide_extras')};
        });
        return data;
    };
    const rowControls = async (row) => {
        const id = await row.getAttribute('id', {timeout: T});
        const opener = row.locator('a.show_extras');
        if (await opener.count()) { await opener.first().click(); await sleep(400); }
        const ctl = page.locator(`[id="${id}-control-row"]`);
        const links = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        return {id, links, ctl};
    };
    const setPlugin = async (want) => {
        const box = pluginRow().getByRole('checkbox').first();
        const was = await box.isChecked();
        if (was === want) return {was, changed: false};
        const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)|admin-plugin-grid\/(enable|disable)|plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
        await sleep(700);
        // a disable asks first
        const dlg = page.locator('[role="dialog"]:visible').last();
        let ask = null;
        if (await dlg.count()) {
            ask = flat(await dlg.innerText().catch(() => ''), 400);
            await snap(page, `plugin-ask-${want ? 'on' : 'off'}`);
            const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const r = await w;
        await sleep(900); await idle(page);
        return {was, changed: true, ask, status: r ? r.status() : null, url: r ? r.url().replace(/^https?:\/\/[^/]+/, '').replace(/csrfToken=[^&]+/, 'csrfToken=…') : null, toast: await toasts(), now: await pluginRow().getByRole('checkbox').first().isChecked().catch(() => null)};
    };

    // ---- the manager window --------------------------------------------------
    const topDialog = () => page.locator('[role="dialog"]:visible').last();
    const managerDialog = () => page.locator('[role="dialog"]:visible').filter({has: page.locator('table[id*="customblock"], [id*="customblockgrid"], [id*="customBlockGrid"]')}).first();
    const managerState = async () => {
        const d = managerDialog();
        if (!(await d.count())) return {open: false};
        await d.locator('.pkp_controllers_grid').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        return d.evaluate((root) => {
            const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
            const grid = root.querySelector('.pkp_controllers_grid');
            const rows = [...root.querySelectorAll('tr.gridRow')].map((tr) => {
                const td = tr.querySelector('td');
                const c = td ? td.cloneNode(true) : null;
                if (c) c.querySelectorAll('a.show_extras, a.hide_extras, script').forEach((a) => a.remove());
                return {id: tr.id, cell: c ? c.textContent.replace(/\s+/g, ' ').trim() : null, arrow: !!tr.querySelector('a.show_extras, a.hide_extras')};
            });
            return {
                open: true,
                heading: txt(root.querySelector('h1, h2, .pkp_modal_title, [class*="modal"] [class*="title"]')),
                headings: [...root.querySelectorAll('h1, h2, h3, h4')].map(txt).filter(Boolean),
                gridTitle: txt(grid && grid.querySelector('.header h4, h4, .pkp_helpers_align_left')),
                columns: [...root.querySelectorAll('th')].map(txt),
                actions: grid ? [...grid.querySelectorAll('.header a, .actions a, ul.actions a')].map(txt).filter(Boolean) : [],
                rows,
                empty: [...root.querySelectorAll('tr.empty, tr[id*="emptyRow"], .empty')].filter((e) => e.offsetParent !== null).map(txt).filter(Boolean),
                buttons: [...root.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => txt(b) || b.getAttribute('aria-label')).filter(Boolean),
            };
        });
    };
    const openManager = async (ctx, name) => {
        await openWebsite(ctx, 'plugins');
        const {links, ctl} = await rowControls(pluginRow());
        const manage = ctl.getByRole('link', {name: 'Manage Custom Blocks', exact: true}).first();
        await loc(page, 'Plugins: the Custom Block Manager row\'s "Manage Custom Blocks"', manage);
        await manage.click();
        await managerDialog().waitFor({timeout: T});
        const s = await managerState();
        if (name) await snap(page, name, {rowLinks: links, manager: s});
        return {rowLinks: links, manager: s};
    };
    const closeTop = async () => {
        const d = topDialog();
        if (!(await d.count())) return;
        const cancel = d.getByRole('link', {name: 'Cancel', exact: true}).first();
        if (await cancel.count() && await cancel.isVisible().catch(() => false)) await cancel.click();
        else await d.getByRole('button', {name: /^Close/}).first().click().catch(() => page.keyboard.press('Escape'));
        await sleep(700); await idle(page);
    };
    const closeAll = async () => { for (let i = 0; i < 3 && (await page.locator('[role="dialog"]:visible').count()); i++) await closeTop(); };

    // ---- the block window ---------------------------------------------------
    const blockForm = () => page.locator('form#customBlockForm:visible').first();
    const blockWindowState = async () => {
        const f = blockForm();
        if (!(await f.count())) return {open: false};
        const d = page.locator('[role="dialog"]:visible').filter({has: page.locator('form#customBlockForm')}).last();
        const heading = flat(await d.locator('h1, h2').first().innerText().catch(() => null), 120);
        const data = await f.evaluate((root) => {
            const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
            return {
                labels: [...root.querySelectorAll('label, legend, .label, .pkp_form_section_title, h3')].filter((e) => e.offsetParent !== null).map(txt).filter(Boolean),
                required: [...root.querySelectorAll('.req, .required, abbr, [class*="required"]')].filter((e) => e.offsetParent !== null).map((e) => ({cls: e.className, text: txt(e)})),
                inputs: [...root.querySelectorAll('input:not([type=hidden]), textarea')].map((i) => ({tag: i.tagName, type: i.type, name: i.name, value: i.type === 'checkbox' ? null : (i.value || '').slice(0, 80), checked: i.type === 'checkbox' ? i.checked : undefined, visible: i.offsetParent !== null})),
                editors: [...root.querySelectorAll('iframe')].map((fr) => ({id: fr.id, visible: fr.offsetParent !== null})),
                buttons: [...root.querySelectorAll('button, a')].filter((b) => b.offsetParent !== null).map(txt).filter(Boolean),
                errors: [...root.querySelectorAll('.error, .pkp_form_error, label.error, [class*="error"]')].filter((e) => e.offsetParent !== null).map(txt).filter(Boolean),
            };
        });
        return {open: true, heading, ...data};
    };
    const waitBlockForm = async () => {
        await blockForm().waitFor({timeout: T});
        await idle(page);
        const ta = blockForm().locator('textarea[name^="blockContent"]').first();
        const id = await ta.getAttribute('id').catch(() => null);
        if (id) await page.waitForFunction((x) => window.tinymce && window.tinymce.get(x) && window.tinymce.get(x).initialized, id, {timeout: T}).catch(() => {});
        await sleep(500);
    };
    const typeTitle = async (locale, value) => {
        const f = blockForm();
        const box = f.locator(`input[name="blockTitle[${locale}]"]`).first();
        if (!(await box.isVisible().catch(() => false))) {
            // the other languages' boxes open while the visible box has the focus
            await f.locator('input[name^="blockTitle["]:visible').first().click();
            await sleep(400);
        }
        await box.fill(value);
    };
    const typeContent = async (locale, value) => {
        const f = blockForm();
        const ta = f.locator(`textarea[name="blockContent[${locale}]"]`).first();
        const id = await ta.getAttribute('id');
        let frame = page.locator(`[id="${id}_ifr"]`);
        if (!(await frame.isVisible().catch(() => false))) {
            const firstVisible = f.locator('iframe:visible').first();
            await firstVisible.contentFrame().locator('body').click();
            await sleep(500);
        }
        frame = page.locator(`[id="${id}_ifr"]`);
        const vis = await frame.isVisible().catch(() => false);
        if (vis) {
            const body = frame.contentFrame().locator('body');
            await body.click();
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Delete');
            if (value) await page.keyboard.type(value);
            return {typed: true};
        }
        return {typed: false, id};
    };
    // the other languages' boxes open in a popover over the window's foot while a box has the focus: click the window's heading to close it
    const blurForm = async () => {
        const d = page.locator('[role="dialog"]:visible').filter({has: page.locator('form#customBlockForm')}).last();
        await d.locator('h1, h2').first().click().catch(() => {});
        await sleep(400);
    };
    const saveBlock = async (name) => {
        await blurForm();
        const f = blockForm();
        const w = page.waitForResponse((r) => /update-?custom-?block/i.test(r.url()), {timeout: T}).catch(() => null);
        await f.locator('button[id^="submitFormButton"], button[type=submit]').first().click();
        const r = await w;
        let json = null;
        try { json = r ? await r.json() : null; } catch { json = null; }
        await sleep(1200); await idle(page);
        const out = {status: r ? r.status() : null, jsonStatus: json ? json.status : null, content: json && typeof json.content === 'string' ? flat(json.content, 200) : null,
            windowStillOpen: (await blockForm().count()) > 0, toast: await toasts()};
        if (out.windowStillOpen) out.window = await blockWindowState();
        out.manager = await managerState();
        if (name) await snap(page, name, out);
        return out;
    };
    const addBlock = async ({title = {}, content = {}, showName = false}, name) => {
        const d = managerDialog();
        const add = d.getByRole('link', {name: 'Add Block', exact: true}).first();
        await add.click();
        await waitBlockForm();
        const before = await blockWindowState();
        if (name) await snap(page, `${name}-window`, {window: before});
        for (const [l, v] of Object.entries(title)) await typeTitle(l, v);
        const typed = {};
        for (const [l, v] of Object.entries(content)) typed[l] = await typeContent(l, v);
        if (showName) await blockForm().locator('input[name="showName"]').check();
        const saved = await saveBlock(name ? `${name}-saved` : null);
        return {window: before, typed, saved};
    };
    const managerRow = (index) => managerDialog().locator('tr.gridRow').nth(index);
    const managerRowByCell = (cell) => managerDialog().locator(`tr.gridRow[id$="-row-${cell}"]`).first();
    const editBlock = async (cell, {title, content, showName}, name) => {
        const {ctl, links} = await rowControls(managerRowByCell(cell));
        await ctl.getByRole('link', {name: 'Edit', exact: true}).first().click();
        await waitBlockForm();
        const before = await blockWindowState();
        if (name) await snap(page, `${name}-window`, {window: before, rowLinks: links});
        for (const [l, v] of Object.entries(title || {})) await typeTitle(l, v);
        for (const [l, v] of Object.entries(content || {})) await typeContent(l, v);
        if (showName !== undefined) await blockForm().locator('input[name="showName"]').setChecked(showName);
        const saved = await saveBlock(name ? `${name}-saved` : null);
        return {rowLinks: links, window: before, saved};
    };

    // ---- Appearance › Setup › Sidebar -------------------------------------------
    const openAppearanceSetup = async (ctx) => {
        await openWebsite(ctx, 'appearance');
        await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click();
        await idle(page); await sleep(700);
    };
    const sidebarList = async () => page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim(), visible: e.offsetParent !== null})));
    const saveAppearance = async () => {
        const form = page.locator('form').filter({has: page.locator('input[name="sidebar"]')}).first();
        const w = page.waitForResponse((r) => /\/api\/v1\/(contexts|site)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        let body = null;
        try { body = r ? await r.json() : null; } catch { body = null; }
        const saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
        await sleep(400);
        const errors = (await page.locator('.pkpFieldError').allInnerTexts().catch(() => [])).map((x) => flat(x, 300));
        const notice = (await page.locator('.pkpFormPage__errors, .pkpFormPage__status, [role="alert"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 300)).filter(Boolean);
        return {status: r ? r.status() : null, url: r ? r.url().replace(/^https?:\/\/[^/]+/, '') : null, saved, errors, notice, sidebarError: body && body.sidebar ? body.sidebar : null};
    };
    const tickSidebar = async (value, want) => {
        const box = page.locator(`input[name="sidebar"][value="${value}"]`).first();
        await box.setChecked(want);
    };
    const typeFooter = async (text) => {
        const fid = await page.locator('textarea[id*="pageFooter"]').first().getAttribute('id').catch(() => null);
        if (!fid) return false;
        await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, fid, {timeout: T}).catch(() => {});
        await page.locator(`[id="${fid}_ifr"]`).contentFrame().locator('body').click();
        await page.keyboard.press('End');
        await page.keyboard.type(text);
        return true;
    };

    // ---- the public side ------------------------------------------------------
    const pub = async (ctx, p, name, locale = 'en') => {   // the locale always named: the visitor's session keeps the last one
        let status = null;
        try { const r = await vis.goto(ctx === 'index' ? app.url(`/index.php/index${locale ? '/' + locale : ''}${p}`) : ctxUrl(ctx, p, locale)); status = r ? r.status() : null; } catch (e) { status = String(e.message || e); }
        await idle(vis).catch(() => {});
        const sb = await vis.evaluate(() => {
            const side = document.querySelector('.pkp_structure_sidebar');
            return {
                hasSidebar: !!side,
                lang: document.documentElement.lang,
                blocks: side ? [...side.querySelectorAll('.pkp_block')].map((b) => {
                    const h = b.querySelector('h2, h3, .title');
                    const r = h ? h.getBoundingClientRect() : null;
                    return {id: b.id, cls: b.className, heading: h ? h.textContent.trim() : null, headingCls: h ? h.className : null, headingOnScreen: r ? r.width > 2 && r.height > 2 && r.right > 0 && getComputedStyle(h).clip === 'auto' : null,
                        content: (b.querySelector('.content') || b).innerText.replace(/\s+/g, ' ').trim().slice(0, 200)};
                }) : [],
            };
        });
        const aria = sb.hasSidebar ? await vis.locator('.pkp_structure_sidebar').first().ariaSnapshot().catch(() => null) : null;
        const s = await screen(vis).catch(() => null);
        record(name, {status, url: vis.url(), sidebar: sb, sidebarAria: aria, screen: s});
        return {status, url: vis.url().replace(/^https?:\/\/[^/]+/, ''), ...sb, aria};
    };
    const brief = (x) => ({status: x.status, url: x.url, lang: x.lang, blocks: x.blocks.map((b) => `${b.id || b.cls}|h=${b.heading}${b.headingOnScreen ? '(shown)' : '(hidden)'}|${b.content.slice(0, 60)}`)});

    const asMgr = async (ctx) => { await signIn(page, st[ctx].mgr, {contextPath: st[ctx].path}); await idle(page); };

    try {
        // ======================= phase a ======================================
        if (on('a')) {
            const A = st.A.path;
            await asMgr('A');
            // Rule 17: the row as a new journal has it
            await step('a17', async () => {
                await openWebsite(A, 'plugins');
                const before = await pluginRowState();
                await loc(page, 'Plugins: the Custom Block Manager row', pluginRow());
                await loc(page, 'Plugins: the Custom Block Manager row\'s Enabled box', pluginRow().getByRole('checkbox'));
                const offLinks = (await rowControls(pluginRow())).links;
                await snap(page, 'a17-plugins-new-journal', {row: before, offLinks});
                const en = await setPlugin(true);
                const afterNoReload = (await rowControls(pluginRow())).links;
                await snap(page, 'a17-plugins-ticked', {en, afterNoReload});
                fact('a17', {before, offLinks, en, afterNoReload});
                const m = await openManager(A, 'a17-manager-empty');
                fact('a17-manager', m);
            });
            // Rule 18: Add Block "Our Partners"
            await step('a18', async () => {
                const r = await addBlock({title: {en: 'Our Partners'}, content: {en: 'Partner list'}}, 'a18-add');
                fact('a18-window', r.window);
                fact('a18-saved', {status: r.saved.status, jsonStatus: r.saved.jsonStatus, windowStillOpen: r.saved.windowStillOpen, toast: r.saved.toast, rows: r.saved.manager.rows, typed: r.typed});
                const rc = await rowControls(managerRow(0));
                await loc(page, 'manager window: a row\'s arrow', managerRow(0).locator('a.show_extras, a.hide_extras'));
                fact('a18-row-links', rc.links);
                await closeAll();
                await openAppearanceSetup(A);
                const list = await sidebarList();
                await snap(page, 'a18-sidebar-list', {list});
                await loc(page, 'Appearance › Setup › Sidebar: the custom block\'s box', page.locator('input[name="sidebar"][value="our-partners"]'));
                fact('a18-sidebar', list);
                const home = await pub(A, '', 'a18-public-home');
                fact('a18-public', brief(home));
            });
            // Rules 19–20: placed; the other sidebar block first for the order
            await step('a19', async () => {
                await openAppearanceSetup(A);
                const listBefore = await sidebarList();
                const toggle = listBefore.find((o) => /languagetoggle/i.test(o.value));
                if (toggle) await tickSidebar(toggle.value, true);
                await tickSidebar('our-partners', true);
                const save = await saveAppearance();
                const listAfter = await sidebarList();
                await snap(page, 'a19-sidebar-saved', {save, listAfter});
                fact('a19-save', {save, listAfter});
                for (const [k, p] of [['home', ''], ['about', '/about'], ['search', '/search'], ['login', '/login'], ['announcement', '/announcement']]) {
                    const x = await pub(A, p, `a19-public-${k}`);
                    fact(`a19-public-${k}`, {...brief(x), aria: flat(x.aria, 400)});
                }
                await shot(vis, 'a19-public-home-shot');
            });
            await step('a20', async () => {
                await openManager(A);
                const e = await editBlock('our-partners', {showName: true}, 'a20-showname');
                fact('a20-edit', {rowLinks: e.rowLinks, window: {heading: e.window.heading, labels: e.window.labels, inputs: e.window.inputs}, saved: {status: e.saved.status, windowStillOpen: e.saved.windowStillOpen, toast: e.saved.toast}});
                await closeAll();
                const x = await pub(A, '', 'a20-public-home');
                fact('a20-public', {...brief(x), aria: flat(x.aria, 400)});
                await shot(vis, 'a20-public-home-shot');
            });
            // Rule 21: French
            await step('a21', async () => {
                const x = await pub(A, '', 'a21-public-fr-before', 'fr_CA');
                fact('a21-fr-before', brief(x));
                await openManager(A);
                const e = await editBlock('our-partners', {title: {fr_CA: 'Nos partenaires'}, content: {fr_CA: 'Liste des partenaires'}}, 'a21-french');
                fact('a21-edit', {inputs: e.window.inputs, editors: e.window.editors, saved: {status: e.saved.status, windowStillOpen: e.saved.windowStillOpen}});
                await closeAll();
                const y = await pub(A, '', 'a21-public-fr-after', 'fr_CA');
                const z = await pub(A, '', 'a21-public-en-after', 'en');
                fact('a21-fr-after', brief(y));
                fact('a21-en-after', brief(z));
                // the other end: a French name alone, no French content
                await openManager(A);
                const e2 = await editBlock('our-partners', {content: {fr_CA: ''}}, 'a21-french-nocontent');
                await closeAll();
                const w = await pub(A, '', 'a21-public-fr-nocontent', 'fr_CA');
                fact('a21-fr-name-only', {saved: e2.saved.status, pub: brief(w)});
            });
            // Rule 22: rename
            await step('a22', async () => {
                await openManager(A);
                const e = await editBlock('our-partners', {title: {en: 'Friends'}, content: {en: 'Friend list'}}, 'a22-rename');
                fact('a22-saved', {status: e.saved.status, rows: e.saved.manager.rows});
                await snap(page, 'a22-manager-after');
                await closeAll();
                const x = await pub(A, '', 'a22-public-home');
                fact('a22-public', brief(x));
                await openAppearanceSetup(A);
                const list = await sidebarList();
                await snap(page, 'a22-sidebar-list', {list});
                fact('a22-sidebar', list);
            });
            // Rule 23: the same name twice
            await step('a23', async () => {
                await openManager(A);
                const r = await addBlock({title: {en: 'Our Partners'}, content: {en: 'Second partner list'}}, 'a23-add');
                fact('a23-rows', r.saved.manager.rows);
                await closeAll();
                await openAppearanceSetup(A);
                const list = await sidebarList();
                await snap(page, 'a23-sidebar-list', {list});
                fact('a23-sidebar', list);
                st.A.second = (r.saved.manager.rows.find((x) => x.cell && x.cell.startsWith('our-partners') && x.cell !== 'our-partners') || {}).cell || null;
                fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
            });
            // Rule 19 other end: place the second, then untick it
            await step('a19b', async () => {
                if (!st.A.second) return;
                await openAppearanceSetup(A);
                await tickSidebar(st.A.second, true);
                const s1 = await saveAppearance();
                const x = await pub(A, '', 'a19b-public-both');
                await openAppearanceSetup(A);
                await tickSidebar(st.A.second, false);
                const s2 = await saveAppearance();
                const list = await sidebarList();
                await snap(page, 'a19b-sidebar-unticked', {list});
                const y = await pub(A, '', 'a19b-public-unticked');
                fact('a19b', {placeBoth: s1, both: brief(x), untick: s2, list, after: brief(y)});
            });
            // Rule 25: plugin off, the Appearance save meanwhile, plugin on again
            await step('a25', async () => {
                await openWebsite(A, 'plugins');
                const off = await setPlugin(false);
                await snap(page, 'a25-plugins-off', {off});
                const rowOff = await pluginRowState();
                const offLinks = (await rowControls(pluginRow())).links;
                const x = await pub(A, '', 'a25-public-off');
                await openAppearanceSetup(A);
                const list = await sidebarList();
                await snap(page, 'a25-sidebar-list-off', {list});
                await typeFooter(' Footer text');
                const save = await saveAppearance();
                await snap(page, 'a25-appearance-save-off', {save});
                fact('a25-off', {off, rowOff, offLinks, public: brief(x), list, save});
                await openWebsite(A, 'plugins');
                const onAgain = await setPlugin(true);
                const y = await pub(A, '', 'a25-public-on-again');
                await openAppearanceSetup(A);
                const list2 = await sidebarList();
                await snap(page, 'a25-sidebar-list-on-again', {list: list2});
                fact('a25-on-again', {onAgain, public: brief(y), list: list2});
            });
            // Rule 25, the other end: the plugin off, the "Sidebar" list changed on screen and saved, the plugin on again
            await step('a25b', async () => {
                await openWebsite(A, 'plugins');
                const off = await setPlugin(false);
                await openAppearanceSetup(A);
                const other = (await sidebarList()).find((o) => !o.checked && !/partners|custom/i.test(o.value + o.label));
                await tickSidebar(other.value, true);
                const save = await saveAppearance();
                const list = await sidebarList();
                await snap(page, 'a25b-appearance-save-changed', {save, list, ticked: other.value});
                await openWebsite(A, 'plugins');
                const onAgain = await setPlugin(true);
                const x = await pub(A, '', 'a25b-public-on-again');
                await openAppearanceSetup(A);
                const list2 = await sidebarList();
                await snap(page, 'a25b-sidebar-list-on-again', {list: list2});
                fact('a25b', {off: off.now, save, list, onAgain: onAgain.now, public: brief(x), list2});
                // put it back where a24 expects it
                if (!list2.find((o) => o.value === 'our-partners' && o.checked)) { await tickSidebar('our-partners', true); fact('a25b-replace', await saveAppearance()); }
            });
            // Rule 24: Delete the placed block, the Appearance save, a new block of the deleted name
            await step('a24', async () => {
                await openManager(A);
                const {ctl, links} = await rowControls(managerRowByCell('our-partners'));
                await ctl.getByRole('link', {name: 'Delete', exact: true}).first().click();
                await sleep(700);
                const conf = page.locator('[role="dialog"]:visible').last();
                const confText = flat(await conf.innerText().catch(() => ''), 400);
                const confButtons = await conf.locator('button, a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                await snap(page, 'a24-delete-ask', {confText, confButtons});
                await loc(page, 'Delete confirmation: OK', conf.getByRole('button', {name: 'OK', exact: true}));
                // Cancel first, then Delete again and OK
                await conf.getByRole('button', {name: 'Cancel', exact: true}).first().click().catch(() => {});
                await sleep(800);
                const afterCancel = await managerState();
                const rc2 = await rowControls(managerRowByCell('our-partners'));
                await rc2.ctl.getByRole('link', {name: 'Delete', exact: true}).first().click();
                await sleep(700);
                const conf2 = page.locator('[role="dialog"]:visible').last();
                const w = page.waitForResponse((r) => /delete-?custom-?block/i.test(r.url()), {timeout: T}).catch(() => null);
                await conf2.getByRole('button', {name: 'OK', exact: true}).first().click();
                const r = await w;
                await sleep(1200); await idle(page);
                const after = await managerState();
                const confStill = flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => ''), 300);
                await snap(page, 'a24-deleted', {after, confStill, toast: await toasts()});
                await closeTop();
                // an unplaced block's "Delete" too
                let other = null;
                if (st.A.second) {
                    const rc3 = await rowControls(managerRowByCell(st.A.second));
                    await rc3.ctl.getByRole('link', {name: 'Delete', exact: true}).first().click();
                    await sleep(700);
                    const w3 = page.waitForResponse((r) => /delete-?custom-?block/i.test(r.url()), {timeout: T}).catch(() => null);
                    await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK', exact: true}).first().click();
                    const r3 = await w3;
                    await sleep(1200); await idle(page);
                    const m3 = await managerState();
                    await snap(page, 'a24-deleted-unplaced', {m3});
                    other = {status: r3 ? r3.status() : null, rows: m3.rows.map((x) => x.cell), confStill: flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => ''), 200)};
                    await closeTop();
                }
                fact('a24-unplaced', other);
                await closeAll();
                const x = await pub(A, '', 'a24-public-after-delete');
                await openAppearanceSetup(A);
                const list = await sidebarList();
                await snap(page, 'a24-sidebar-list', {list});
                await typeFooter(' Footer two');
                const save = await saveAppearance();
                await snap(page, 'a24-appearance-save', {save});
                fact('a24-delete', {rowLinks: links, confText, confButtons, afterCancelRows: afterCancel.rows, status: r ? r.status() : null, after: after.rows, empty: after.empty, public: brief(x), list, save});
                await openManager(A);
                const nb = await addBlock({title: {en: 'Our Partners'}, content: {en: 'Reborn list'}}, 'a24-readd');
                await closeAll();
                const y = await pub(A, '', 'a24-public-readd');
                await openAppearanceSetup(A);
                const list2 = await sidebarList();
                await snap(page, 'a24-sidebar-list-readd', {list: list2});
                fact('a24-readd', {rows: nb.saved.manager.rows, public: brief(y), list: list2});
            });
            await signOut(page).catch(() => {});
        }

        // ======================= phase b: the empty name and the interface language (B, two form languages) ==
        if (on('b')) {
            const B = st.B.path;
            await asMgr('B');
            // a blank row, wherever one arises: its arrow, the "Sidebar" label, placing it
            const blankRowChecks = async (label) => {
                const m = await managerState();
                const idx = m.rows.findIndex((x) => !x.cell);
                if (idx < 0) return {blank: false, rows: m.rows};
                const rc = await rowControls(managerRow(idx));
                await snap(page, `${label}-blank-row-open`, {links: rc.links});
                return {blank: true, rowId: rc.id, arrow: m.rows[idx].arrow, links: rc.links, rows: m.rows};
            };
            await step('b26', async () => {
                await openManager(B, 'b26-manager-empty');
                // "Block Name" empty in both languages, "x" in "Content"
                const r = await addBlock({title: {}, content: {en: 'x'}}, 'b26-empty');
                fact('b26-window', {heading: r.window.heading, labels: r.window.labels, required: r.window.required, inputs: r.window.inputs});
                fact('b26-saved', {status: r.saved.status, jsonStatus: r.saved.jsonStatus, windowStillOpen: r.saved.windowStillOpen, errors: r.saved.window && r.saved.window.errors, rows: r.saved.manager.rows, toast: r.saved.toast});
                if (r.saved.windowStillOpen) await closeTop();
                fact('b26-blank', await blankRowChecks('b26'));
                // a second one, the same way
                const r2 = await addBlock({title: {}, content: {en: 'y'}}, 'b26-empty-2');
                if (r2.saved.windowStillOpen) await closeTop();
                fact('b26-second', {status: r2.saved.status, windowStillOpen: r2.saved.windowStillOpen, errors: r2.saved.window && r2.saved.window.errors, rows: r2.saved.manager.rows});
                const named = r2.saved.manager.rows.filter((x) => x.cell && /^[0-9a-f]{13}$/.test(x.cell));
                if (named.length) { const i = r2.saved.manager.rows.indexOf(named[0]); const rc = await rowControls(managerRow(i)); fact('b26-second-row-links', rc.links); await snap(page, 'b26-second-row-open', {links: rc.links}); }
                // English empty, French typed, the interface in English
                const r3 = await addBlock({title: {fr_CA: 'Seulement en français'}, content: {en: 'z'}}, 'b26-french-only');
                if (r3.saved.windowStillOpen) await closeTop();
                fact('b26-french-only', {status: r3.saved.status, windowStillOpen: r3.saved.windowStillOpen, errors: r3.saved.window && r3.saved.window.errors, rows: r3.saved.manager.rows});
                await closeAll();
                await openAppearanceSetup(B);
                const list = await sidebarList();
                await snap(page, 'b26-sidebar-list', {list});
                fact('b26-sidebar', list);
                const blank = list.find((o) => o.value === '');
                if (blank) {
                    await page.locator('input[name="sidebar"][value=""]').first().check();
                    const save = await saveAppearance();
                    await snap(page, 'b26-place-blank', {save});
                    const y = await pub(B, '', 'b26-public-blank');
                    fact('b26-place-blank', {save, public: brief(y)});
                }
            });
            await step('b18', async () => {
                // the manager's interface in French: the address with the fr_CA segment
                await page.goto(ctxUrl(B, '/management/settings/website', 'fr_CA'));
                await idle(page);
                await page.locator('#plugins-button').first().click(); await idle(page); await sleep(600);
                const uiLang = await page.evaluate(() => document.documentElement.lang);
                const rowText = flat(await pluginRow().innerText().catch(() => null), 200);
                const {ctl, links} = await rowControls(pluginRow());
                const manage = ctl.locator('a:visible').first();
                const manageText = await manage.innerText().catch(() => null);
                await manage.click();
                await managerDialog().waitFor({timeout: T});
                const m0 = await managerState();
                await snap(page, 'b18-manager-fr', {uiLang, links, m0});
                const add = managerDialog().locator('.pkp_controllers_grid .header a, .actions a').first();
                await add.click();
                await waitBlockForm();
                const win = await blockWindowState();
                await snap(page, 'b18-window-fr', {win});
                await typeTitle('en', 'Only English');
                await typeContent('en', 'English only content');
                const saved = await saveBlock('b18-saved-fr');
                if (saved.windowStillOpen) await closeTop();
                fact('b18-fr', {uiLang, rowText, rowLinks: links, manageText, manager: m0, window: win, saved: {status: saved.status, jsonStatus: saved.jsonStatus, windowStillOpen: saved.windowStillOpen, errors: saved.window && saved.window.errors, rows: saved.manager.rows}});
                await closeAll();
                // the English control
                await openManager(B);
                const r = await addBlock({title: {en: 'Only English'}, content: {en: 'English UI content'}}, 'b18-en');
                fact('b18-en', {rows: r.saved.manager.rows});
                await closeAll();
                await openAppearanceSetup(B);
                const list = await sidebarList();
                await snap(page, 'b18-sidebar-list', {list});
                fact('b18-sidebar', list);
                // the blank block placed
                if (list.find((o) => o.value === '')) {
                    await page.locator('input[name="sidebar"][value=""]').first().check();
                    const save = await saveAppearance();
                    await snap(page, 'b18-place-blank', {save});
                    const y = await pub(B, '', 'b18-public-blank');
                    fact('b18-place-blank', {save, public: brief(y)});
                }
            });
            await signOut(page).catch(() => {});
        }

        // the blank block of phase b placed on its own (a rerun on B as phase b left it)
        if (on('bblank')) {
            await asMgr('B');
            await step('bblank', async () => {
                await openAppearanceSetup(st.B.path);
                const list = await sidebarList();
                if (!list.find((o) => o.value === '')) return fact('b18-place-blank', {blank: false});
                await page.locator('input[name="sidebar"][value=""]').first().check();
                const save = await saveAppearance();
                await snap(page, 'b18-place-blank', {save});
                const y = await pub(st.B.path, '', 'b18-public-blank');
                fact('b18-place-blank', {save, public: brief(y)});
            });
        }

        // ======================= phase c: one form language: empty name, name shape, unsaved leave ===
        if (on('c')) {
            const C = st.C.path;
            await asMgr('C');
            await step('c26', async () => {
                const m = await openManager(C, 'c26-manager-empty');
                fact('c26-manager-empty', m);
                const r = await addBlock({title: {}, content: {en: 'x'}}, 'c26-empty');
                fact('c26-window', {heading: r.window.heading, labels: r.window.labels, required: r.window.required, inputs: r.window.inputs});
                fact('c26-saved', {status: r.saved.status, jsonStatus: r.saved.jsonStatus, windowStillOpen: r.saved.windowStillOpen, errors: r.saved.window && r.saved.window.errors, rows: r.saved.manager.rows, toast: r.saved.toast});
                if (r.saved.windowStillOpen) await closeTop();
                // the name's other end: digits and "&"
                const r3 = await addBlock({title: {en: 'News 2026 & Events'}, content: {en: 'Shape check'}}, 'c18-shape');
                if (r3.saved.windowStillOpen) await closeTop();
                fact('c18-shape', {status: r3.saved.status, rows: r3.saved.manager.rows});
                // the shaped row's arrow and its "Edit" / "Delete"
                const shapedCell = (r3.saved.manager.rows.find((x) => /news/.test(x.cell || '')) || {}).cell;
                if (shapedCell) {
                    const i = r3.saved.manager.rows.findIndex((x) => x.cell === shapedCell);
                    const rc = await rowControls(managerRow(i));
                    const out = {links: rc.links};
                    for (const action of ['Edit', 'Delete']) {
                        const before = await page.locator('[role="dialog"]:visible').count();
                        await rc.ctl.getByRole('link', {name: action, exact: true}).first().click().catch((e) => { out[`${action}Error`] = String(e.message || e).slice(0, 120); });
                        await sleep(2500); await idle(page);
                        const after = await page.locator('[role="dialog"]:visible').count();
                        out[action] = {dialogsBefore: before, dialogsAfter: after, top: after > before ? flat(await topDialog().innerText().catch(() => ''), 200) : null, url: page.url()};
                        await snap(page, `c18-shape-${action.toLowerCase()}`, out[action]);
                        if (after > before) await closeTop();
                    }
                    fact('c18-shape-row', out);
                }
                // and an accented name
                const r4 = await addBlock({title: {en: 'Événements à venir'}, content: {en: 'Accent check'}}, 'c18-accent');
                if (r4.saved.windowStillOpen) await closeTop();
                fact('c18-accent', {status: r4.saved.status, rows: r4.saved.manager.rows.map((x) => x.cell)});
                await closeAll();
                await openAppearanceSetup(C);
                const list = await sidebarList();
                await snap(page, 'c18-sidebar-list', {list});
                fact('c18-sidebar', list);
                const accent = list.find((o) => /venir/.test(o.value));
                if (accent) {
                    await tickSidebar(accent.value, true);
                    const saveA = await saveAppearance();
                    await snap(page, 'c18-accent-place', {saveA});
                    fact('c18-accent-placed', {value: accent.value, save: saveA});
                    await openAppearanceSetup(C);
                }
                const shaped = list.find((o) => /news/.test(o.value));
                if (shaped) {
                    await tickSidebar(shaped.value, true);
                    const save1 = await saveAppearance();
                    await snap(page, 'c18-shape-place', {save1});
                    const x = await pub(C, '', 'c18-shape-public');
                    fact('c18-shape-placed', {value: shaped.value, save: save1, public: brief(x)});
                }
            });
            // the Appearance tab left with a change unsaved
            await step('cleave', async () => {
                const before = dialogs.length;
                await openAppearanceSetup(C);
                const first = (await sidebarList()).find((o) => !o.checked);
                if (first) await tickSidebar(first.value, true);
                await page.locator('#plugins-button').first().click(); await idle(page); await sleep(600);
                const tabSwitch = await snap(page, 'cleave-tab-switched');
                await page.locator('#appearance-button').first().click(); await idle(page); await sleep(600);
                const back = await sidebarList();
                await page.goto(ctxUrl(C, '/about')); await idle(page);
                await page.goto(ctxUrl(C, '/management/settings/website')); await idle(page);
                await page.locator('#appearance-button').first().click(); await idle(page); await sleep(600);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page); await sleep(600);
                const reopened = await sidebarList();
                await snap(page, 'cleave-reopened', {reopened});
                fact('cleave', {ticked: first && first.value, dialogs: dialogs.slice(before), backOnTab: back.filter((o) => o.checked).map((o) => o.value), reopened: reopened.filter((o) => o.checked).map((o) => o.value), tabSwitchUrl: tabSwitch.url});
            });
            await signOut(page).catch(() => {});
        }
        // ======================= site: Rule 27 ==================================
        if (on('site')) {
            await signIn(page, 'admin'); await idle(page);
            const siteState = {};
            await step('s27', async () => {
                await openWebsite('index', 'plugins');
                const row = await pluginRowState().catch((e) => ({error: String(e.message || e)}));
                await snap(page, 's27-site-plugins', {row});
                siteState.wasOn = row.checked;
                if (st.siteWasOn === undefined) { st.siteWasOn = row.checked; fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2)); }
                const en = row.checked ? null : await setPlugin(true);
                const {links, ctl} = await rowControls(pluginRow());
                await ctl.getByRole('link', {name: 'Manage Custom Blocks', exact: true}).first().click();
                await managerDialog().waitFor({timeout: T});
                const m = await managerState();
                await snap(page, 's27-site-manager', {m});
                fact('s27-site-plugin', {row, en, links, manager: m});
                const r = await addBlock({title: {en: 'Site news'}, content: {en: 'Site text'}}, 's27-site-add');
                fact('s27-site-add', {rows: r.saved.manager.rows, status: r.saved.status});
                await closeAll();
                // the site's Appearance › Setup
                await openWebsite('index', 'appearance');
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page); await sleep(700);
                const list = await sidebarList();
                siteState.sidebarBefore = list.filter((o) => o.checked).map((o) => o.value);
                await snap(page, 's27-site-sidebar-list', {list});
                await tickSidebar('site-news', true);
                const save = await saveAppearance();
                fact('s27-site-sidebar', {list, save});
                const siteHome = await pub('index', '', 's27-public-site-home');
                const jHome = await pub(st.A.path, '', 's27-public-journal-home');
                const pk = await pub(app.contextPath, '', 's27-public-publicknowledge-home');
                fact('s27-public', {site: brief(siteHome), journalA: brief(jHome), publicknowledge: brief(pk)});
            });
        }
        if (on('site') || on('sitejournal')) {
            // the journal's list, as its manager, while the site holds a block
            await step('s27-journal', async () => {
                await asMgr('B');
                const m = await openManager(st.B.path, 's27-journal-manager');
                await closeAll();
                await openAppearanceSetup(st.B.path);
                const list = await sidebarList();
                fact('s27-journal', {rows: m.manager.rows, sidebar: list.map((o) => o.value)});
            });
        }
        if (on('site') || on('siterestore')) {
            // restore the site (the site's blocks cannot be deleted where "Delete" fails; they are left unplaced with the plugin as found)
            await signIn(page, 'admin'); await idle(page);
            const siteState = {wasOn: st.siteWasOn};
            await step('s27-restore', async () => {
                await openWebsite('index', 'appearance');
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page); await sleep(700);
                if (await page.locator('input[name="sidebar"][value="site-news"]').count()) await tickSidebar('site-news', false);
                const save = await saveAppearance();
                await openWebsite('index', 'plugins');
                const {ctl} = await rowControls(pluginRow());
                await ctl.getByRole('link', {name: 'Manage Custom Blocks', exact: true}).first().click();
                await managerDialog().waitFor({timeout: T});
                const rc = await rowControls(managerRowByCell('site-news'));
                await rc.ctl.getByRole('link', {name: 'Delete', exact: true}).first().click();
                await sleep(700);
                const wd = page.waitForResponse((r) => /delete-?custom-?block/i.test(r.url()), {timeout: T}).catch(() => null);
                await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK', exact: true}).first().click();
                const rd = await wd;
                await sleep(1200); await idle(page);
                const m = await managerState();
                m.deleteStatus = rd ? rd.status() : null;
                await snap(page, 's27-site-delete', {m});
                await closeAll();
                let off = null;
                if (siteState.wasOn === false) { await openWebsite('index', 'plugins'); off = await setPlugin(false); }
                const siteHome = await pub('index', '', 's27-public-site-home-restored');
                fact('s27-restore', {save, rows: m.rows, off, site: brief(siteHome)});
            });
            await signOut(page).catch(() => {});
        }
    } finally {
        fact('browserDialogs', dialogs);
        await mgrB.close();
        await visB.close();
    }
});
