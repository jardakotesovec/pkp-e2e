// U09 claim check, chunk K2: static pages {OJS OMP}, and their absence on OPS.
// Spec: docs/specs/U09-custom-pages-and-blocks.md, lines 77–99 (the "Static
// Pages" tab and the static page window), 165–201 (Rules 9–16), 319–323
// (Settings 1), register A3 and A6; footnotes c, e, f, l, f-a3, f-a6, td6,
// td9–td16.
//
// Seeds per app through POST scenarios/context (state file k2-state-<app>.json
// in the output folder; RESEED=1 makes new ones):
//   A  English alone under "Forms" (French a UI language), nothing enabled:
//      "Static Pages Plugin" is ticked ON SCREEN by the `plugin` phase (td9).
//      Users m (manager), r (reader).
//   B  English and French under "Forms", "Static Pages Plugin" seeded on
//      (plugins key). User m. (OJS, OMP only.)
//   OPS: A alone; the `ops` phase reads the plugin's absence with controls.
// Phases (PHASES=a,b; default all, in this order), one app per process:
//   plugin   td9: the Plugins row, ticking it, the tabs at once / after a reload, "Edit/Add Content"
//   list     td10, td13: the empty list, the window, "About us", "Fees", "Zeta", order, Edit, the row
//            controls, the "Path" link; the window left once with a change unsaved
//   refuse   td11: refused paths, 41 characters, 40, the allowed characters, empty "Title", 256 characters
//   page     td12, A3: the page signed out / as reader / as manager, the tags; on B the languages and
//            the list in the manager's language (French interface)
//   preview  td6 (static): "Preview" on A, then on B in each interface language
//   delete   td14: "Delete" › "Cancel", "Delete" › "OK", the address after
//   shared   td16, A6: a static page and a "Custom Page" item on one path, both orders; a static page on "about"
//   disable  td15, Settings 1: untick, tabs, the addresses; tick again
//   stale    the refusal message shown at the top right on the next save / page load
//   deep     "Path" shapes: "/", capitals, "." and "_" (DEEP=a,b narrows the list)
//   extra    on B: "Title" in French alone; static page then item on one path; the "Static Pages" tab
//            still on screen after unticking, and its "Add Static Page"
//   content  "Content" left empty
//   ops      OPS: no row, no tab (controls: the Custom Block Manager row, the other tabs)
// Run: PROBE_FEATURE=U09 PROBE_AGENT=ccK2 PHASES=plugin,list,refuse,page,preview node bin/probe.js ojs shared/playwright/checks/U09/K2/k2.js
//      PROBE_FEATURE=U09 PROBE_AGENT=ccK2 PHASES=delete,shared,disable node bin/probe.js ojs shared/playwright/checks/U09/K2/k2.js
//      (the same for omp); PHASES=ops node bin/probe.js ops …
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signOut, record, loc, note, idle, tag, outDir, screen, shot} = require('../../../probe');
const H = require('../K1/lib');
const {T, sleep, ctxUrl, as, openNav, rowAction, dialogs, itemWindow, openItemWindow, itemSave, closeItemWindow, setType, fillTitle, watchDialogs} = H;

const ALL = ['plugin', 'list', 'refuse', 'stale', 'deep', 'page', 'preview', 'delete', 'shared', 'disable', 'extra', 'content', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const hasStatic = (app) => app.name !== 'ops';
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const log = (...a) => console.log('[k2]', ...a);
const J = (o) => JSON.stringify(o);

forEachApp(async (app) => {
    // ---- seeds ---------------------------------------------------------------
    const sf = stateFile(app);
    let S = fs.existsSync(sf) && !process.env.RESEED ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null;
    if (!S) {
        const t = tag('u09k2');
        const A = `${t}a`;
        const B = `${t}b`;
        await app.api.createContext({tag: A, context: {supportedLocales: ['en', 'fr_CA']},
            users: [{username: `${A}m`, roles: ['manager']}, {username: `${A}r`, roles: ['reader']}]});
        if (hasStatic(app)) {
            await app.api.createContext({tag: B, context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
                plugins: {staticpagesplugin: {enabled: true}}, users: [{username: `${B}m`, roles: ['manager']}]});
        }
        S = {t, A, B: hasStatic(app) ? B : null};
        fs.writeFileSync(sf, JSON.stringify(S, null, 2));
    }
    const {A, B} = S;
    const U = {am: `${A}m`, ar: `${A}r`, bm: B ? `${B}m` : null};
    log(app.name, 'contexts', A, B);

    const M = await launch(app);   // the manager's browser
    const V = await launch(app);   // a visitor's browser (signed out unless said)
    const page = M.page;
    const vis = V.page;
    const seenDialogs = watchDialogs(page);
    const visDialogs = watchDialogs(vis);
    const facts = {};
    const fact = (k, v) => { facts[k] = v; log(app.name, k, J(v).slice(0, 1500)); };
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

    // ---- Settings › Website ---------------------------------------------------
    const toastSel = '.pkpNotification, .pkp_notification, [role="alert"], .pkpToast, [class*="toast"], [class*="Toast"], .ui-pnotify, [class*="notify"]';
    let toastShot = null;   // set a name to snapshot the screen the first time a message shows
    const watchToasts = async (p, ms = 3500) => {
        const seen = new Set();
        const end = Date.now() + ms;
        while (Date.now() < end) {
            for (const x of await p.locator(toastSel).allInnerTexts().catch(() => [])) { const s = flat(x, 200); if (s) seen.add(s); }
            if (seen.size && toastShot) { const n = toastShot; toastShot = null; await snap(p, n, {toasts: [...seen]}); }
            await sleep(250);
        }
        return [...seen];
    };
    const openWebsite = async (ctx, top, locale = 'en') => {
        await page.goto('about:blank');
        await page.goto(ctxUrl(app, ctx, '/management/settings/website', locale));
        await idle(page);
        if (top) { await page.locator(`[id="${top}-button"]`).first().click(); await idle(page); await sleep(700); }
    };
    const topTabs = async (p = page) => p.evaluate(() => {
        const pb = document.querySelector('#plugins-button') || document.querySelector('#setup-button');
        const tl = pb ? pb.closest('[role="tablist"]') : document.querySelector('[role="tablist"]');
        if (!tl) return null;
        return [...tl.querySelectorAll('[role="tab"]')].map((t) => `${t.innerText.trim()}${t.getAttribute('aria-selected') === 'true' ? ' [selected]' : ''} #${t.id}`);
    }).catch((e) => String(e.message || e));

    // ---- the Plugins row --------------------------------------------------------
    const pluginRow = (id = 'staticpagesplugin') => page.locator(`tr.gridRow[id$="-row-${id}"]`).first();
    const pluginRowState = async (id = 'staticpagesplugin') => {
        const row = pluginRow(id);
        if (!(await row.count())) return {present: false};
        return row.evaluate((tr) => {
            const box = tr.querySelector('input[type=checkbox]');
            let cat = null;
            let p = tr;
            while (p && !cat) { p = p.previousElementSibling || (p.parentElement && p.parentElement.previousElementSibling && p.parentElement.previousElementSibling.lastElementChild); if (p && /category/.test(p.className)) cat = p.innerText.replace(/\s+/g, ' ').trim(); if (!p) break; }
            const tb = tr.closest('tbody');
            return {present: true, id: tr.id, text: tr.innerText.replace(/\s+/g, ' ').trim(), checked: box ? box.checked : null, tbodyId: tb ? tb.id : null, category: cat, arrow: !!tr.querySelector('a.show_extras, a.hide_extras')};
        });
    };
    const allPluginRows = async () => page.evaluate(() => {
        const out = [];
        let cat = null;
        for (const tr of document.querySelectorAll('[id^="component-grid-settings-plugins-settingsplugingrid"] tr')) {
            if (/category/.test(tr.className)) cat = tr.innerText.replace(/\s+/g, ' ').trim();
            else if (tr.classList.contains('gridRow')) out.push({category: cat, id: tr.id.replace(/^.*-row-/, ''), name: (tr.querySelector('td') || tr).innerText.replace(/\s+/g, ' ').trim().slice(0, 60), checked: tr.querySelector('input[type=checkbox]') ? tr.querySelector('input[type=checkbox]').checked : null});
        }
        return out;
    });
    const ctlLinks = async (p, rowId) => {
        const row = p.locator(`[id="${rowId}"]`);
        const opener = row.locator('a.show_extras');
        const arrow = {count: await opener.count()};
        if (arrow.count) {
            arrow.text = flat(await opener.first().innerText().catch(() => ''));
            arrow.title = await opener.first().getAttribute('title').catch(() => null);
            arrow.firstCell = await opener.first().evaluate((a) => { const td = a.closest('td'); return td ? td.cellIndex : null; }).catch(() => null);
            await opener.first().click();
            await sleep(400);
        }
        const ctl = p.locator(`[id="${rowId}-control-row"]`);
        const links = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        return {arrow, links, ctl};
    };
    const setPlugin = async (want, name) => {
        const box = pluginRow().getByRole('checkbox').first();
        const was = await box.isChecked();
        if (was === want) return {was, changed: false};
        const w = page.waitForResponse((r) => /plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
        await sleep(800);
        const dlg = page.locator('[role="dialog"]:visible').last();
        let ask = null;
        if (await dlg.count()) {
            ask = {text: flat(await dlg.innerText().catch(() => ''), 500), buttons: (await dlg.locator('button, a').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean)};
            await snap(page, `${name}-ask`, {ask});
            const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).or(dlg.getByRole('link', {name: /^(OK|Yes)$/})).first();
            if (await ok.count()) await ok.click();
        }
        const r = await w;
        const toasts = await watchToasts(page, 3000);
        await idle(page);
        return {was, changed: true, ask, status: r ? r.status() : null, url: r ? r.url().replace(/^https?:\/\/[^/]+/, '').replace(/csrfToken=[^&]+/, 'csrfToken=…') : null, toasts, now: await box.isChecked().catch(() => null)};
    };

    // ---- the "Static Pages" list -------------------------------------------------
    const spContainer = () => page.locator('#staticPageGridContainer').first();
    const openStaticTab = async (ctx, locale = 'en') => {
        await openWebsite(ctx, 'staticPages', locale);
        await spContainer().locator('.pkp_controllers_grid').first().waitFor({timeout: T});
        await idle(page);
        await sleep(400);
    };
    const spGrid = async () => {
        await spContainer().locator('.pkp_controllers_grid').first().waitFor({timeout: T});
        await idle(page);
        await sleep(300);
        return spContainer().evaluate((root) => {
            const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const grid = root.querySelector('.pkp_controllers_grid');
            const rows = [...root.querySelectorAll('tr.gridRow')].map((tr) => {
                const tds = [...tr.querySelectorAll(':scope > td')];
                const cells = tds.map((td) => { const c = td.cloneNode(true); c.querySelectorAll('a.show_extras, a.hide_extras, script').forEach((a) => a.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
                const a = tds[1] ? tds[1].querySelector('a') : null;
                return {id: tr.id, cells, pathLink: a ? {text: txt(a), href: a.getAttribute('href'), target: a.getAttribute('target')} : null, arrow: !!tr.querySelector('a.show_extras, a.hide_extras')};
            });
            return {
                heading: txt(grid && grid.querySelector('.header h4, h4')),
                actions: grid ? [...grid.querySelectorAll('.header a, .actions a')].map(txt).filter(Boolean) : [],
                columns: [...root.querySelectorAll('th')].map(txt),
                rows,
                empty: [...root.querySelectorAll('tr.empty, tr[id*="emptyRow"], .empty')].filter((e) => e.offsetParent !== null).map(txt).filter(Boolean),
            };
        });
    };
    const rowIdBy = async (cellIndex, text) => (await spGrid()).rows.find((r) => r.cells[cellIndex] === text)?.id;
    const brief = (g) => ({heading: g.heading, actions: g.actions, columns: g.columns, rows: g.rows.map((r) => r.cells.filter(Boolean).join(' | ')), empty: g.empty});

    // ---- the static page window ----------------------------------------------------
    const spWin = () => page.locator('[role="dialog"]:visible').filter({has: page.locator('form#staticPageForm')}).last();
    const waitSpWin = async () => {
        await page.locator('form#staticPageForm textarea[name^="content"]').first().waitFor({state: 'attached', timeout: T});
        await idle(page);
        await page.waitForFunction(() => {
            const eds = window.tinymce ? window.tinymce.get().filter((e) => /^content/.test(e.id) && document.getElementById(e.id)) : [];
            return eds.length > 0 && eds.every((e) => e.initialized);
        }, undefined, {timeout: T}).catch(() => {});
        await sleep(900);
    };
    const spState = async () => spWin().evaluate((w) => {
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const f = w.querySelector('form#staticPageForm');
        const fTop = f.getBoundingClientRect().top;
        const pathBox = f.querySelector('input[name="path"]');
        const pTop = pathBox ? pathBox.getBoundingClientRect().top : null;
        return {
            heading: txt(w.querySelector('h1, h2, .pkp_modal_title')),
            inputs: [...f.querySelectorAll('input[name], textarea[name]')].filter((e) => e.type !== 'hidden').map((e) => ({name: e.name, id: e.id, visible: vis(e), maxlength: e.getAttribute('maxlength'), len: (e.value || '').length, value: (e.value || '').slice(0, 60), required: e.required || e.getAttribute('aria-required') || null})),
            labels: [...w.querySelectorAll('label, legend')].filter(vis).map(txt).filter(Boolean),
            requiredMarks: [...w.querySelectorAll('.req, .required, abbr, span[class*="req"]')].filter(vis).map((e) => ({text: txt(e), near: txt(e.closest('label'))})),
            buttons: [...w.querySelectorAll('button, a, input[type=submit]')].filter(vis).map((b) => txt(b) || b.value || b.getAttribute('aria-label') || b.title).filter(Boolean),
            note: [...f.querySelectorAll('p, blockquote, .section')].filter(vis).map(txt).filter((s) => /accessible at/.test(s)).slice(0, 1),
            errors: [...w.querySelectorAll('label.error, .error, #formErrors, .pkp_form_error, [class*="rror"]')].filter(vis).filter((e) => txt(e)).map((e) => ({text: txt(e), tag: e.tagName, cls: e.className, id: e.id, for: e.getAttribute('for'), top: Math.round(e.getBoundingClientRect().top - fTop), pathTop: pTop === null ? null : Math.round(pTop - fTop)})),
            text: txt(w).slice(0, 2000),
        };
    }).catch((e) => ({error: String(e.message || e)}));
    const openAddStatic = async () => {
        const add = spContainer().getByRole('link', {name: 'Add Static Page', exact: true}).or(spContainer().getByRole('link', {name: /Ajouter une page statique/})).first();
        await add.click();
        await waitSpWin();
        return spState();
    };
    const openEditStatic = async (pathCell) => {
        const id = await rowIdBy(2, pathCell) || await rowIdBy(1, pathCell);
        const c = await ctlLinks(page, id);
        await c.ctl.getByRole('link', {name: 'Edit', exact: true}).first().click();
        await waitSpWin();
        return {controls: {arrow: c.arrow, links: c.links}, state: await spState()};
    };
    const contentId = async (loc2 = 'en') => spWin().locator(`textarea[name="content[${loc2}]"]`).getAttribute('id');
    const mceGet = async (id) => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id).catch(() => null);
    const mceType = async (id, text) => {
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T});
        const body = page.frameLocator(`[id="${id}_ifr"]`).locator('body');
        await body.click();
        await page.keyboard.press('Control+End');
        if (text) await page.keyboard.type(text);
        await sleep(200);
        return mceGet(id);
    };
    const mceClear = async (id) => {
        const body = page.frameLocator(`[id="${id}_ifr"]`).locator('body');
        await body.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await sleep(200);
    };
    const pickTag = async (id, re) => {
        const btn = page.locator(`[id="${id}"] ~ .tox-tinymce`).first().getByRole('button', {name: 'Insert Tag'});
        await btn.click();
        await sleep(700);
        const items = (await page.locator('.tox-menu:visible .tox-collection__item').allInnerTexts().catch(() => [])).map((s) => flat(s));
        const item = page.locator('.tox-menu:visible .tox-collection__item').filter({hasText: re}).first();
        if (await item.count()) { await item.click(); await sleep(400); } else {
            await page.frameLocator(`[id="${id}_ifr"]`).locator('body').click({position: {x: 5, y: 5}}).catch(() => {});
        }
        return items;
    };
    const blur = async () => { await spWin().locator('input[name="path"]').click().catch(() => {}); await sleep(500); };
    const fillStatic = async ({p, title, frTitle, text, frText, tags = []}) => {
        const w = spWin();
        if (p !== undefined) await w.locator('input[name="path"]').fill(p);
        if (title !== undefined) await w.locator('input[name="title[en]"]').fill(title);
        if (frTitle !== undefined) {
            await w.locator('input[name="title[en]"]').click();
            await sleep(400);
            await w.locator('input[name="title[fr_CA]"]').fill(frTitle);
        }
        const id = await contentId('en');
        if (text !== undefined) await mceType(id, text);
        for (const [label, re] of tags) {
            await page.keyboard.press('End');
            await page.keyboard.type(` ${label}=`);
            await pickTag(id, re);
        }
        if (frText !== undefined) {
            await page.frameLocator(`[id="${id}_ifr"]`).locator('body').click();
            await sleep(800);
            await mceType(await contentId('fr_CA'), frText);
        }
        await blur();
        return {en: await mceGet(id)};
    };
    const spSave = async () => {
        const posts = [];
        const onResp = async (r) => {
            if (/static-page-grid\/update-static-page/.test(r.url())) {
                const body = await r.text().catch(() => '');
                let js = null;
                try { js = JSON.parse(body); } catch { /* not JSON */ }
                posts.push({status: r.status(), jsonStatus: js ? js.status : null, event: js && js.event ? js.event.name || J(js.event).slice(0, 80) : null, bytes: body.length});
            }
        };
        page.on('response', onResp);
        await spWin().getByRole('button', {name: 'Save', exact: true}).click();
        const toasts = await watchToasts(page, 3500);
        await idle(page);
        await sleep(500);
        page.off('response', onResp);
        const open = await spWin().isVisible().catch(() => false);
        return {posts, toasts, windowOpen: open, state: open ? await spState() : null};
    };
    const spClose = async (name) => {
        if (!(await spWin().isVisible().catch(() => false))) return null;
        const before = seenDialogs.length;
        const btn = spWin().getByRole('button', {name: /^(Close|Fermer)/}).first();
        const label = {text: flat(await btn.innerText().catch(() => '')), aria: await btn.getAttribute('aria-label').catch(() => null)};
        await btn.click();
        await sleep(800);
        const inPage = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'});
        let inPageAsk = null;
        if (await inPage.count()) {
            inPageAsk = flat(await inPage.innerText());
            if (name) await snap(page, name);
            await inPage.getByRole('button', {name: /^(Yes|OK)$/}).first().click();
            await sleep(500);
        }
        return {closeControl: label, browserDialogs: seenDialogs.slice(before), inPageAsk, stillOpen: await spWin().isVisible().catch(() => false)};
    };
    const addStatic = async (fields, name) => {
        await openAddStatic();
        const typed = await fillStatic(fields);
        if (name) await snap(page, `${name}-typed`, {typed});
        const r = await spSave();
        if (r.windowOpen) r.close = await spClose();
        r.grid = brief(await spGrid());
        return r;
    };
    const deleteStatic = async (pathCell, {cancelFirst = false, name} = {}) => {
        const out = {};
        const id = await rowIdBy(2, pathCell) || await rowIdBy(1, pathCell);
        const confirmWin = () => page.locator('[role="dialog"]:visible, [data-cy="dialog"]:visible').filter({hasText: /Are you sure/}).last();
        const press = async (label) => {
            const c = await ctlLinks(page, id);
            out.controls = c.links;
            await c.ctl.getByRole('link', {name: 'Delete', exact: true}).first().click();
            await confirmWin().waitFor({timeout: T});
            await sleep(400);
            const w = confirmWin();
            const d = await w.evaluate((el) => {
                const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
                const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
                return {heading: txt(el.querySelector('h1, h2, .pkp_modal_title')), text: txt(el), buttons: [...el.querySelectorAll('button, a')].filter(vis).map((b) => ({tag: b.tagName, text: txt(b) || b.getAttribute('aria-label')}))};
            });
            if (name) await snap(page, `${name}-confirm-${label}`, {confirm: d});
            if (label === 'OK') await loc(page, 'Delete confirmation: OK', w.getByRole('button', {name: 'OK', exact: true}));
            await w.getByRole('button', {name: label, exact: true}).or(w.getByRole('link', {name: label, exact: true})).first().click();
            const toasts = await watchToasts(page, 3000);
            await idle(page);
            await sleep(500);
            return {confirm: d, toasts, grid: brief(await spGrid())};
        };
        if (cancelFirst) out.cancel = await press('Cancel');
        out.ok = await press('OK');
        return out;
    };

    // ---- public pages ----------------------------------------------------------------
    const readPublic = async (p) => p.evaluate(() => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const q = (s) => document.querySelector(s);
        const main = q('.pkp_structure_main');
        return {
            url: location.href,
            title: document.title,
            lang: document.documentElement.lang,
            h1s: [...document.querySelectorAll('h1')].map(t),
            headings: [...(main || document).querySelectorAll('h1, h2, h3')].map((h) => `${h.tagName} ${t(h)}`).slice(0, 12),
            breadcrumbs: t(q('.cmp_breadcrumbs')),
            header: !!q('.pkp_structure_head'),
            siteName: t(q('.pkp_site_name')),
            footer: !!q('.pkp_structure_footer'),
            sidebar: q('.pkp_structure_sidebar') ? [...document.querySelectorAll('.pkp_structure_sidebar .pkp_block')].map((b) => b.className.replace(/\s+/g, ' ')) : null,
            mainText: main ? t(main).slice(0, 700) : null,
            editLinks: [...document.querySelectorAll('a, button')].filter((a) => /^\s*(Edit|Modifier)\s*$/i.test(a.innerText || '') || a.closest('.cmp_edit_link')).map((a) => ({text: t(a), href: a.getAttribute('href')})),
            aboutLinks: [...document.querySelectorAll('#navigationPrimary a')].map((a) => ({text: t(a), href: a.getAttribute('href')})).filter((a) => /about|propos/i.test(a.href || '') || /About|propos/i.test(a.text || '')).slice(0, 6),
            bodyText: t(document.body) ? t(document.body).slice(0, 300) : null,
            bodyLength: document.body ? document.body.innerHTML.length : 0,
        };
    });
    const pub = async (p, url, name, extra = {}) => {
        let status = null;
        let err = null;
        const resp = await p.goto(url).catch((e) => { err = String(e.message).split('\n')[0]; return null; });
        if (resp) status = resp.status();
        await idle(p).catch(() => {});
        const d = await readPublic(p).catch((e) => ({error: String(e.message || e)}));
        const out = {status, gotoError: err, ...d, ...extra};
        await snap(p, name, out).catch(() => {});
        return out;
    };
    const short = (x) => (x ? {status: x.status, url: x.url && x.url.replace(/^https?:\/\/[^/]+/, ''), title: x.title, h1s: x.h1s, headings: x.headings, breadcrumbs: x.breadcrumbs, header: x.header, footer: x.footer, sidebar: x.sidebar && x.sidebar.length, main: x.mainText && x.mainText.slice(0, 200), edit: x.editLinks && x.editLinks.length, body: x.header ? undefined : x.bodyText, bodyLength: x.header ? undefined : x.bodyLength} : x);
    const P = (ctx, p, locale = '') => ctxUrl(app, ctx, p, locale);

    /** "Preview" of the open window: the new tab as data, then closed. */
    const preview = async (name) => {
        const out = {};
        const btn = spWin().locator('#previewButton');
        out.button = flat(await btn.innerText().catch(() => ''));
        await loc(page, 'static page window: "Preview"', btn);
        const [popup] = await Promise.all([
            page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null),
            btn.click().catch((e) => { out.clickError = String(e.message).split('\n')[0]; }),
        ]);
        out.newTab = !!popup;
        if (popup) {
            await popup.waitForLoadState('load').catch(() => {});
            await sleep(2500);
            out.page = await readPublic(popup).catch((e) => ({error: String(e.message || e)}));
            out.addressBar = popup.url();
            record(name, {...(await screen(popup).catch(() => ({}))), preview: out});
            await shot(popup, name).catch(() => {});
            await popup.close();
        }
        return out;
    };

    // ---- "Custom Page" items (Settings › Website › Setup › Navigation) ---------------------
    const addCustom = async (ctx, {title, p, text}) => {
        await openNav(page, app, ctx, 'en');
        await openItemWindow(page, 'add');
        await fillTitle(page, title);
        await setType(page, 'Custom Page');
        await itemWindow(page).locator('input[name="path"]').fill(p);
        const id = await itemWindow(page).locator('textarea[name="content[en]"]').getAttribute('id');
        await mceType(id, text);
        await itemWindow(page).locator('input[name="path"]').click();
        await sleep(400);
        const r = await itemSave(page);
        const out = {notice: r.notice, windowOpen: r.windowOpen, posts: r.posts, errors: r.state && r.state.errors};
        if (r.windowOpen) out.close = await closeItemWindow(page);
        return out;
    };
    const removeCustom = async (ctx, title) => {
        await openNav(page, app, ctx, 'en');
        await rowAction(page, 'items', title, 'Remove');
        await sleep(600);
        const cd = page.locator('[role="dialog"]:visible, [data-cy="dialog"]:visible').filter({hasText: /Are you sure/}).last();
        await cd.getByRole('button', {name: 'OK', exact: true}).or(cd.getByRole('link', {name: 'OK', exact: true})).first().click();
        const toasts = await watchToasts(page, 3000);
        await idle(page);
        return {toasts};
    };

    try {
        // =====================================================================
        if (hasStatic(app) && on('plugin')) {
            const o = {};
            await as(page, U.am, A);
            await openWebsite(A, null);
            o.tabsBefore = await topTabs();
            await snap(page, 'p01-website-before');
            await openWebsite(A, 'plugins');
            await pluginRow().waitFor({timeout: T});
            o.rowBefore = await pluginRowState();
            o.allRows = await allPluginRows();
            await loc(page, 'Plugins: the "Static Pages Plugin" row', pluginRow());
            await loc(page, 'Plugins: the "Static Pages Plugin" row\'s Enabled box', pluginRow().getByRole('checkbox'));
            o.linksOff = (await ctlLinks(page, o.rowBefore.id)).links;
            await snap(page, 'p02-plugins-row-off', {row: o.rowBefore, links: o.linksOff});
            o.tick = await setPlugin(true, 'p03-tick');
            o.tabsAtOnce = await topTabs();
            await openWebsite(A, 'plugins');   // the row's controls are redrawn on the same page too; read them on a fresh one below
            o.rowAfter = await pluginRowState();
            const c = await ctlLinks(page, o.rowAfter.id);
            o.linksOn = c.links;
            o.tabsNextLoad = await topTabs();
            await snap(page, 'p04-plugins-row-on', {row: o.rowAfter, links: o.linksOn});
            const edit = c.ctl.getByRole('link', {name: 'Edit/Add Content', exact: true}).first();
            await loc(page, 'Plugins: the Static Pages row\'s "Edit/Add Content"', edit);
            await edit.click();
            await page.waitForLoadState('load');
            await idle(page);
            await sleep(1200);
            o.landing = {url: page.url().replace(/^https?:\/\/[^/]+/, '').replace(/uid=[^&#]+/, 'uid=…'), tabs: await topTabs(), gridVisible: await spContainer().isVisible().catch(() => false)};
            await snap(page, 'p05-edit-add-content-landing', o.landing);
            await loc(page, 'Settings › Website: the "Static Pages" tab', page.locator('#staticPages-button'));
            // tick-then-look without leaving: the tab list on the page where the box was ticked
            fact('plugin', o);
        }

        // =====================================================================
        if (hasStatic(app) && on('list')) {
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            o.empty = await spGrid();
            await snap(page, 'l01-static-list-empty', {grid: o.empty});
            await loc(page, 'Static Pages: the list', spContainer());
            await loc(page, 'Static Pages: "Add Static Page"', spContainer().getByRole('link', {name: 'Add Static Page', exact: true}));
            o.window = await openAddStatic();
            await snap(page, 'l02-add-window', {window: o.window});
            await loc(page, 'static page window: the form', page.locator('form#staticPageForm'));
            await loc(page, 'static page window: "Path"', spWin().locator('input[name="path"]'));
            await loc(page, 'static page window: "Title" (English)', spWin().locator('input[name="title[en]"]'));
            await loc(page, 'static page window: "Save"', spWin().getByRole('button', {name: 'Save', exact: true}));
            await loc(page, 'static page window: the close control', spWin().getByRole('button', {name: /^Close/}));
            const typed = await fillStatic({p: 'about-us', title: 'About us', text: 'Welcome'});
            o.save1 = await spSave();
            o.list1 = await spGrid();
            await snap(page, 'l03-after-save-about-us', {save: o.save1, grid: o.list1, typed});
            o.save2 = await addStatic({p: 'fees', title: 'Fees', text: 'Fee text'}, 'l04-fees');
            o.save3 = await addStatic({p: 'aardvark', title: 'Aardvark', text: 'A text'}, 'l05-aardvark');
            o.list3 = brief(await spGrid());
            await snap(page, 'l06-list-three', {grid: o.list3});
            // Edit "About us": the window's heading, then a changed content saved
            o.edit = await openEditStatic('about-us');
            await snap(page, 'l07-edit-window', o.edit);
            await loc(page, 'Static Pages: a row\'s "Edit"', page.locator('[id$="-control-row"]').getByRole('link', {name: 'Edit', exact: true}).first());
            await fillStatic({text: ' Edited.'});
            o.editSave = await spSave();
            if (o.editSave.windowOpen) o.editSave.close = await spClose();
            o.listAfterEdit = brief(await spGrid());
            await snap(page, 'l08-list-after-edit', {grid: o.listAfterEdit, save: o.editSave});
            // reload: the order as stored
            await openStaticTab(A);
            o.listReload = brief(await spGrid());
            // the window left once with a change unsaved (a new page), then an untouched Edit
            await openAddStatic();
            await fillStatic({p: 'left-unsaved', title: 'Left unsaved'});
            o.leaveChanged = await spClose('l09-leave-changed-ask');
            await sleep(600);
            o.listAfterLeave = brief(await spGrid());
            await openEditStatic('fees');
            o.leaveUntouched = await spClose('l10-leave-untouched-ask');
            await snap(page, 'l10-after-leave', {leaveChanged: o.leaveChanged, leaveUntouched: o.leaveUntouched, grid: o.listAfterLeave});
            // the "Path" link (td13)
            const g = await spGrid();
            const row = g.rows.find((r) => r.cells.includes('about-us'));
            o.pathLink = row && row.pathLink;
            const link = page.locator(`[id="${row.id}"]`).getByRole('link', {name: 'about-us', exact: true}).first();
            await loc(page, 'Static Pages: the "Path" cell link', link);
            const pagesBefore = page.context().pages().length;
            const [popup] = await Promise.all([page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null), link.click()]);
            o.pathClick = {newTab: !!popup, pagesBefore, managerPageUrl: page.url().replace(/^https?:\/\/[^/]+/, '').replace(/uid=[^&#]+/, 'uid=…')};
            if (popup) {
                await popup.waitForLoadState('load').catch(() => {});
                await idle(popup).catch(() => {});
                o.pathClick.tab = short(await readPublic(popup));
                record('l11-path-link-tab', {...(await screen(popup).catch(() => ({}))), click: o.pathClick});
                await shot(popup, 'l11-path-link-tab').catch(() => {});
                await popup.close();
            } else {
                await snap(page, 'l11-path-link-same-tab', o.pathClick);
            }
            fact('list', o);
        }

        // =====================================================================
        if (hasStatic(app) && on('refuse')) {
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            const tryPath = async (key, fields) => {
                await openAddStatic();
                await fillStatic(fields);
                const r = await spSave();
                await snap(page, `r-${key}`, {save: r});
                if (r.windowOpen) r.close = await spClose();
                r.grid = brief(await spGrid());
                return {windowOpen: r.windowOpen, posts: r.posts, toasts: r.toasts, errors: r.state && r.state.errors, stateAfter: r.state && r.state.inputs && r.state.inputs.filter((i) => /path|title/.test(i.name)).map((i) => `${i.name}=${i.value}`), rows: r.grid.rows, close: r.close && r.close.browserDialogs};
            };
            o.space = await tryPath('01-path-space', {p: 'about us', title: 'Space', text: 'x'});
            o.empty = await tryPath('02-path-empty', {p: '', title: 'Empty path', text: 'x'});
            o.dup = await tryPath('03-path-duplicate', {p: 'about-us', title: 'Duplicate', text: 'x'});
            o.upper = await tryPath('04-path-allowed-chars', {p: 'Info/Fees_2.x-y', title: 'Allowed characters', text: 'Deep text'});
            o.other = await tryPath('05-path-accent', {p: 'café', title: 'Accent', text: 'x'});
            // 41 characters typed, then 40 saved
            await openAddStatic();
            const box = spWin().locator('input[name="path"]');
            await box.click();
            const s41 = 'abcdefghij'.repeat(4) + 'X';
            await box.pressSequentially(s41, {delay: 5});
            o.typed41 = {typed: s41.length, kept: (await box.inputValue()).length, value: await box.inputValue()};
            await fillStatic({title: 'Forty', text: 'Forty text'});
            const r40 = await spSave();
            o.save40 = {windowOpen: r40.windowOpen, posts: r40.posts, toasts: r40.toasts, errors: r40.state && r40.state.errors};
            if (r40.windowOpen) await spClose();
            // Title: every box empty (A: English alone)
            o.noTitle = await tryPath('06-title-empty', {p: 'no-title', title: '', text: 'No title text'});
            // Title: 256 characters typed
            await openAddStatic();
            const tb = spWin().locator('input[name="title[en]"]');
            await tb.click();
            const t256 = 'T'.repeat(250) + 'abcdef';
            await tb.fill('');
            await tb.pressSequentially(t256, {delay: 0});
            o.title256 = {typed: 256, kept: (await tb.inputValue()).length};
            await spClose();
            await sleep(500);
            o.grid = brief(await spGrid());
            await snap(page, 'r-07-list-after', {grid: o.grid});
            fact('refuse', o);
            // the saved pages at their addresses
            o.pages = {
                deep: short(await pub(vis, P(A, '/Info/Fees_2.x-y'), 'r-08-deep-page')),
                forty: short(await pub(vis, P(A, `/${o.typed41.value}`), 'r-09-forty-page')),
                noTitle: short(await pub(vis, P(A, '/no-title'), 'r-10-no-title-page')),
            };
            fact('refusePages', o.pages);
        }

        // =====================================================================
        if (hasStatic(app) && on('stale')) {
            // what shows at the top right on the save after a refused save
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            o.toastsOnLanding = await watchToasts(page, 2000);
            await openAddStatic();
            await fillStatic({p: 'bad path', title: 'Bad', text: 'x'});
            const r1 = await spSave();
            o.refused = {windowOpen: r1.windowOpen, toasts: r1.toasts, errors: r1.state && r1.state.errors && r1.state.errors.map((e) => e.text)};
            await spWin().locator('input[name="path"]').fill('stale-ok');
            await blur();
            toastShot = 't01-save-after-refusal-toast';
            const r2 = await spSave();
            toastShot = null;
            o.savedAfterRefusal = {windowOpen: r2.windowOpen, posts: r2.posts, toasts: r2.toasts, grid: brief(await spGrid()).rows};
            // a refusal, the window closed unsaved, then the page loaded again
            await openAddStatic();
            await fillStatic({p: 'stale-ok', title: 'Dup', text: 'x'});
            const r3 = await spSave();
            o.refused2 = {windowOpen: r3.windowOpen, errors: r3.state && r3.state.errors && r3.state.errors.map((e) => e.text)};
            await spClose();
            await page.goto('about:blank');
            await page.goto(ctxUrl(app, A, '/management/settings/website', 'en'));
            toastShot = 't02-reload-after-refusal-toast';
            o.toastsOnReload = await watchToasts(page, 5000);
            toastShot = null;
            await openStaticTab(A);
            o.toastsOnTab = await watchToasts(page, 2000);
            // a plain save with no refusal before it
            await openAddStatic();
            await fillStatic({p: 'stale-plain', title: 'Plain', text: 'x'});
            const r4 = await spSave();
            o.plainSave = {windowOpen: r4.windowOpen, toasts: r4.toasts};
            await snap(page, 't03-after-plain-save', o);
            fact('stale', o);
        }

        // =====================================================================
        if (hasStatic(app) && on('deep')) {
            // the page of a "Path" with "/", capitals, "." and "_", each typed with and without the language
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            const DEEP = process.env.DEEP ? process.env.DEEP.split(',') : ['info/fees', 'Upper', 'a.b_c-d', 'deep/Mixed_1.x', 'dot.only', 'under_score', 'one/two/three.x'];
            for (const p of DEEP) {
                const r = await addStatic({p, title: `Page ${p}`, text: `Text of ${p}`});
                o[p] = {saved: !r.windowOpen, toasts: r.toasts};
            }
            o.grid = brief(await spGrid());
            for (const p of [...DEEP, 'Info/Fees_2.x-y']) {
                const k = p.replace(/[^a-z0-9]/gi, '_');
                o[`${p} plain`] = short(await pub(vis, P(A, `/${p}`), `e-${k}-plain`));
                o[`${p} en`] = short(await pub(vis, P(A, `/${p}`, 'en'), `e-${k}-en`));
            }
            // the list's own link for "info/fees"
            const g = await spGrid();
            const row = g.rows.find((r) => r.cells.includes('info/fees'));
            o.link = row && row.pathLink;
            if (row) {
            const [popup] = await Promise.all([page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null), page.locator(`[id="${row.id}"]`).getByRole('link', {name: 'info/fees', exact: true}).first().click()]);
            if (popup) {
                await popup.waitForLoadState('load').catch(() => {});
                o.linkTab = short(await readPublic(popup));
                o.linkTab.status = null;
                record('e-link-info-fees', {...(await screen(popup).catch(() => ({}))), tab: o.linkTab});
                await shot(popup, 'e-link-info-fees').catch(() => {});
                await popup.close();
            }
            }
            fact('deep', o);
        }

        // =====================================================================
        if (hasStatic(app) && on('page')) {
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            o.tag = await addStatic({p: 'tag-page', title: 'Tag page', text: 'Contact:', tags: [['principal', /Principal Contact Name/], ['support', /Support Contact Name/]]}, 'g01-tag-page');
            // signed out
            o.plain = short(await pub(vis, P(A, '/about-us'), 'g02-about-us-signed-out'));
            o.en = short(await pub(vis, P(A, '/about-us', 'en'), 'g03-about-us-en'));
            o.fr = short(await pub(vis, P(A, '/about-us', 'fr_CA'), 'g04-about-us-fr-signed-out'));
            o.tagPage = short(await pub(vis, P(A, '/tag-page', 'en'), 'g05-tag-page'));
            o.tagHtml = await vis.locator('.pkp_structure_main').innerHTML().then((h) => flat(h, 900)).catch(() => null);
            // as the reader, then as the manager
            await as(vis, U.ar, A);
            o.reader = short(await pub(vis, P(A, '/about-us', 'en'), 'g06-about-us-reader'));
            await signOut(vis);
            o.manager = short(await pub(page, P(A, '/about-us', 'en'), 'g07-about-us-manager'));
            fact('page', o);

            // B: the languages, and the list in the manager's language
            const b = {};
            await as(page, U.bm, B);
            await openStaticTab(B);
            b.window = await openAddStatic();
            b.both = await (async () => { const t = await fillStatic({p: 'both', title: 'About us EN', frTitle: 'À propos FR', text: 'EN text', frText: 'FR texte'}); const r = await spSave(); if (r.windowOpen) r.close = await spClose(); return {typed: t, windowOpen: r.windowOpen, errors: r.state && r.state.errors}; })();
            b.enOnly = await addStatic({p: 'en-only', title: 'English only', text: 'English text only'}, 'g08-en-only');
            b.noTitle = await (async () => { await openAddStatic(); await fillStatic({p: 'no-title-b', text: 'No title B'}); const r = await spSave(); await snap(page, 'g09-no-title-both-empty', {save: r}); if (r.windowOpen) r.close = await spClose(); return {windowOpen: r.windowOpen, errors: r.state && r.state.errors, posts: r.posts}; })();
            b.listEn = brief(await spGrid());
            await snap(page, 'g10-list-en-ui', {grid: b.listEn});
            await openStaticTab(B, 'fr_CA');
            b.listFr = brief(await spGrid());
            b.tabsFr = await topTabs();
            await snap(page, 'g11-list-fr-ui', {grid: b.listFr});
            await openWebsite(B, null, 'en');   // back to English for the rest
            b.pages = {
                bothEn: short(await pub(vis, P(B, '/both', 'en'), 'g12-both-en')),
                bothFr: short(await pub(vis, P(B, '/both', 'fr_CA'), 'g13-both-fr')),
                enOnlyFr: short(await pub(vis, P(B, '/en-only', 'fr_CA'), 'g14-en-only-fr')),
                noTitleFr: short(await pub(vis, P(B, '/no-title-b', 'fr_CA'), 'g15-no-title-b-fr')),
            };
            fact('pageB', b);
        }

        // =====================================================================
        if (hasStatic(app) && on('preview')) {
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            const listBefore = brief(await spGrid());
            await openAddStatic();
            o.typed = await fillStatic({p: 'static-preview', title: 'Preview title', text: 'Preview text. Contact:', tags: [['p', /Principal Contact Name/]]});
            o.preview = await preview('v01-static-preview-tab');
            o.after = await spState();
            await snap(page, 'v02-window-after-preview', {after: o.after});
            o.contentAfter = await mceGet(await contentId('en'));
            o.close = await spClose();
            o.listSame = J(brief(await spGrid()).rows) === J(listBefore.rows);
            o.addressAfter = short(await pub(vis, P(A, '/static-preview', 'en'), 'v03-address-after-preview'));
            // B: the interface language, both ends
            await as(page, U.bm, B);
            for (const [key, locale] of [['enUi', 'en'], ['frUi', 'fr_CA']]) {
                await openStaticTab(B, locale);
                await openAddStatic();
                await fillStatic({p: `prev-${key}`, title: 'EN title', frTitle: 'FR titre', text: 'EN text', frText: 'FR texte'});
                o[key] = await preview(`v04-preview-${key}`);
                o[key].buttonLabel = o[key].button;
                await spClose();
            }
            await openWebsite(B, null, 'en');
            fact('preview', {...o, preview: {newTab: o.preview.newTab, addressBar: o.preview.addressBar, page: short(o.preview.page), locHref: o.preview.page && o.preview.page.url}, enUi: short(o.enUi.page), frUi: short(o.frUi.page)});
        }

        // =====================================================================
        if (hasStatic(app) && on('delete')) {
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            o.del = await deleteStatic('aardvark', {cancelFirst: true, name: 'd01-delete'});
            await snap(page, 'd02-after-delete', o.del);
            o.address = short(await pub(vis, P(A, '/aardvark'), 'd03-deleted-address'));
            o.never = short(await pub(vis, P(A, '/never-used-k2'), 'd04-never-used-address'));
            fact('delete', o);
        }

        // =====================================================================
        if (hasStatic(app) && on('shared')) {
            const o = {};
            await as(page, U.am, A);
            // item first, then the static page
            o.item1 = await addCustom(A, {title: 'Shared custom', p: 'shared', text: 'Custom page content'});
            o.customOnly = short(await pub(vis, P(A, '/shared', 'en'), 's01-shared-custom-only'));
            await openStaticTab(A);
            o.static1 = await addStatic({p: 'shared', title: 'Shared static', text: 'Static page content'}, 's02-static-shared');
            o.both1 = short(await pub(vis, P(A, '/shared', 'en'), 's03-shared-both'));
            // the static page first, then the item
            await openStaticTab(A);
            o.static2 = await addStatic({p: 'shared2', title: 'Second static', text: 'Second static content'}, 's04-static-shared2');
            o.staticOnly2 = short(await pub(vis, P(A, '/shared2', 'en'), 's04b-shared2-static-only'));
            o.item2 = await addCustom(A, {title: 'Second custom', p: 'shared2', text: 'Second custom content'});
            await snap(page, 's05-item-shared2-saved', {item2: o.item2});
            o.both2 = short(await pub(vis, P(A, '/shared2', 'en'), 's06-shared2-both'));
            // the static page on "shared" deleted
            await openStaticTab(A);
            o.del = await deleteStatic('shared');
            o.afterDelete = short(await pub(vis, P(A, '/shared', 'en'), 's07-shared-after-static-deleted'));
            // a static page on a built-in address
            o.aboutBefore = short(await pub(vis, P(A, '/about', 'en'), 's08-about-before'));
            await openStaticTab(A);
            o.staticAbout = await addStatic({p: 'about', title: 'About static', text: 'About static content'}, 's09-static-about');
            o.about = short(await pub(vis, P(A, '/about', 'en'), 's10-about-static'));
            o.aboutLinks = (await readPublic(vis)).aboutLinks;
            o.masthead = short(await pub(vis, P(A, '/about/editorialMasthead', 'en'), 's11-about-masthead'));
            o.aboutContact = short(await pub(vis, P(A, '/about/contact', 'en'), 's12-about-contact'));
            await openStaticTab(A);
            o.delAbout = await deleteStatic('about');
            o.aboutAfter = short(await pub(vis, P(A, '/about', 'en'), 's13-about-after'));
            fact('shared', o);
        }

        // =====================================================================
        if (hasStatic(app) && on('disable')) {
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            o.listBefore = brief(await spGrid());
            o.pageBefore = short(await pub(vis, P(A, '/about-us', 'en'), 'x01-about-us-before'));
            await openWebsite(A, 'plugins');
            await pluginRow().waitFor({timeout: T});
            o.untick = await setPlugin(false, 'x02-untick');
            o.tabsAtOnce = await topTabs();
            await snap(page, 'x03-after-untick-same-page', {untick: o.untick, tabs: o.tabsAtOnce});
            await openWebsite(A, null);
            o.tabsReload = await topTabs();
            await snap(page, 'x04-website-reloaded', {tabs: o.tabsReload});
            await page.goto(P(A, '/management/settings/website#staticPages', 'en'));
            await idle(page);
            await sleep(800);
            o.anchor = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), tabs: await topTabs()};
            await snap(page, 'x05-website-anchor-staticPages', o.anchor);
            o.rowOff = await (async () => { await openWebsite(A, 'plugins'); const r = await pluginRowState(); return {...r, links: (await ctlLinks(page, r.id)).links}; })();
            o.pages = {
                aboutUs: short(await pub(vis, P(A, '/about-us', 'en'), 'x06-about-us-off')),
                shared2: short(await pub(vis, P(A, '/shared2', 'en'), 'x07-shared2-off')),
                fees: short(await pub(vis, P(A, '/fees'), 'x08-fees-off')),
            };
            await openWebsite(A, 'plugins');
            o.tick = await setPlugin(true, 'x09-tick');
            await openStaticTab(A);
            o.listAgain = brief(await spGrid());
            await snap(page, 'x10-list-again', {grid: o.listAgain});
            o.pageAgain = short(await pub(vis, P(A, '/about-us', 'en'), 'x11-about-us-again'));
            o.shared2Again = short(await pub(vis, P(A, '/shared2', 'en'), 'x12-shared2-again'));
            fact('disable', o);
        }

        // =====================================================================
        if (hasStatic(app) && on('extra')) {
            // on B: "Title" in French alone; a static page then an item on one path; the tab left on screen after unticking
            const o = {};
            await as(page, U.bm, B);
            await openStaticTab(B);
            await openAddStatic();
            await fillStatic({p: 'fr-title-only', frTitle: 'Titre seul', text: 'Text'});
            const r1 = await spSave();
            await snap(page, 'y01-french-title-only', {save: r1});
            o.frOnly = {windowOpen: r1.windowOpen, posts: r1.posts, errors: r1.state && r1.state.errors && r1.state.errors.map((e) => e.text)};
            if (r1.windowOpen) await spClose();
            o.solo = await addStatic({p: 'solo3', title: 'Solo static', text: 'Solo static content'});
            o.soloStatic = short(await pub(vis, P(B, '/solo3', 'en'), 'y02-solo3-static-only'));
            o.soloItem = await addCustom(B, {title: 'Solo custom', p: 'solo3', text: 'Solo custom content'});
            o.soloBoth = short(await pub(vis, P(B, '/solo3', 'en'), 'y03-solo3-both'));
            // untick, then press the "Static Pages" tab still on screen
            await openWebsite(B, 'plugins');
            await pluginRow().waitFor({timeout: T});
            const bad = [];
            const onResp = (r) => { if (r.status() >= 400) bad.push({status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '').replace(/csrfToken=[^&]+/, 'csrfToken=…').slice(0, 160)}); };
            page.on('response', onResp);
            o.untick = await setPlugin(false, 'y04-untick');
            await page.locator('#staticPages-button').click();
            await idle(page);
            await sleep(1500);
            o.staleTab = {tabs: await topTabs(), panel: flat(await page.locator('#staticPages').innerText().catch(() => null), 500), bad: [...bad]};
            await snap(page, 'y05-stale-static-tab-pressed', o.staleTab);
            // "Add Static Page" on that stale list, if it is there
            const add = page.locator('#staticPageGridContainer').getByRole('link', {name: 'Add Static Page', exact: true});
            if (await add.count()) {
                await add.click();
                await sleep(2500);
                await idle(page);
                o.staleAdd = {dialogs: await dialogs(page), bad: [...bad]};
                await snap(page, 'y06-stale-add-pressed', o.staleAdd);
            }
            page.off('response', onResp);
            await openWebsite(B, 'plugins');
            o.tick = await setPlugin(true, 'y07-tick');
            fact('extra', o);
        }

        // =====================================================================
        if (hasStatic(app) && on('content')) {
            // "Content" left empty
            const o = {};
            await as(page, U.am, A);
            await openStaticTab(A);
            await openAddStatic();
            await fillStatic({p: 'no-content', title: 'No content'});
            const r = await spSave();
            await snap(page, 'z01-no-content-saved', {save: r});
            o.save = {windowOpen: r.windowOpen, posts: r.posts, toasts: r.toasts, errors: r.state && r.state.errors && r.state.errors.map((e) => e.text)};
            if (r.windowOpen) await spClose();
            o.grid = brief(await spGrid()).rows.filter((x) => /no-content/.test(x));
            o.page = short(await pub(vis, P(A, '/no-content', 'en'), 'z02-no-content-page'));
            fact('content', o);
        }

        // =====================================================================
        if (!hasStatic(app) && on('ops')) {
            const o = {};
            await as(page, U.am, A);
            await openWebsite(A, null);
            o.tabs = await topTabs();
            await snap(page, 'o01-website-tabs');
            await openWebsite(A, 'plugins');
            await pluginRow('customblockmanagerplugin').waitFor({timeout: T});
            o.rows = await allPluginRows();
            o.staticRow = await pluginRowState('staticpagesplugin');
            o.control = await pluginRowState('customblockmanagerplugin');
            o.anyStatic = o.rows.filter((r) => /static/i.test(r.name + r.id));
            await snap(page, 'o02-plugins', {rows: o.rows});
            await loc(page, 'OPS Plugins: the Custom Block Manager row (control)', pluginRow('customblockmanagerplugin'));
            await page.goto(P(A, '/management/settings/website#staticPages', 'en'));
            await idle(page);
            await sleep(800);
            o.anchor = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), tabs: await topTabs()};
            await snap(page, 'o03-website-anchor-staticPages', o.anchor);
            fact('ops', o);
        }
    } finally {
        fact('dialogs', {manager: seenDialogs, visitor: visDialogs});
        record(`k2-facts-${PHASES.join('_')}`, facts);
        await M.close();
        await V.close();
    }
});
