// U09 claim check, chunk K1: custom pages. The "Custom Page" item's page, its
// preview, its tags and languages, the site's own custom pages, and the
// formatted text boxes' bars (the item window, the static page window, the
// custom block window).
// Spec: docs/specs/U09-custom-pages-and-blocks.md, lines 63–76 (the formatted
// text boxes), 119–164 (Rules 1–8), 334–343 (Settings 4, 5); footnotes c, d,
// g, j, m, td1–td6, td8, td28.
//
// Seeds per app through POST scenarios/context (state file k1-state-<app>.json
// in the output folder; RESEED=1 makes new ones):
//   A  English alone under "Forms" (French a UI language), the Information
//      block in the sidebar (OPS, which has none: the Language block), Custom Block Manager on, Static Pages Plugin on
//      (OJS, OMP). Users m (manager), r (reader).
//   B  English and French under "Forms", the Language block in the sidebar,
//      the same plugins. User m.
// Phases (PHASES=a,b; default all, in this order):
//   bars     td28: each "Content" box's bar, "Insert Tag", a tag in the box,
//            the item window left with an unsaved change (A); the boxes per
//            form language on A and B (Settings 4)
//   preview  td6: "Preview" of the item window (A), and of the static page
//            window (OJS, OMP)
//   page     td1: "Our page", "Fees" at info/fees, "Tag page" with the five
//            tags; each page signed out, as reader, as manager; the menu link
//   contact  td3: the Contact tab's arrival (Settings 5), the principal
//            contact renamed, the tag page read again
//   move     td4: a changed "Path", a removed item, a never-used address
//   builtin  td5: "about" and "search" as a "Path", then removed
//   lang     td2 on B: English only, then French typed
//   blocklang Settings 4's "a visitor reads the texts of their language" for a
//            custom block (Rule 21) on B: a block with English and French texts
//            and one with English alone, placed in the sidebar, read in each language
//   site     td8 as admin: a site "Custom Page" item, its page, removed again
//            (the site is left as it was)
//   preview2 Rule 7's "interface language" on B: English and French typed, the
//            window in English and in French; French left empty, window in French
//   forms    Settings 4 on A: the Languages grid's "Forms" column as it
//            arrives, French ticked there, then the boxes of the three windows
// Run: PROBE_FEATURE=U09 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U09/K1/k1.js
// (a full run passes 600 s: run one app per process)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signOut, record, loc, note, idle, tag, outDir, screen, shot} = require('../../../probe');
const H = require('./lib');
const {T, sleep, log, flat1, ctxUrl, snap, as, openNav, grids, rowControls, rowAction, openMenu, panels, brief, assignTop, dialogs, notice, saveMenu, itemWindow, openItemWindow, itemState, itemSave, closeItemWindow, setType, fillTitle, header, openSettings, saveForm} = H;

const ALL = ['bars', 'preview', 'preview2', 'page', 'contact', 'move', 'builtin', 'lang', 'blocklang', 'site', 'forms'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const hasStatic = (app) => app.name !== 'ops';

// ---------------------------------------------------------------------------
// TinyMCE boxes

/** Every visible editor on the page: its textarea id and its bar, group by group. */
async function bars(page) {
    return page.locator('.tox-tinymce').evaluateAll((eds) => eds.filter((e) => e.offsetParent !== null).map((e) => {
        let ta = e.previousElementSibling;
        while (ta && ta.tagName !== 'TEXTAREA') ta = ta.previousElementSibling;
        return {
            id: ta ? ta.id : null,
            groups: [...e.querySelectorAll('.tox-toolbar__group')].map((g) => [...g.querySelectorAll('button, [role=button]')].map((b) => b.getAttribute('aria-label') + (b.innerText.trim() ? ` "${b.innerText.trim()}"` : ''))),
        };
    }));
}
/** The editors TinyMCE holds (all, visible or not), with their textarea's name. */
async function editors(page) {
    return page.evaluate(() => (window.tinymce ? window.tinymce.get().map((e) => {
        const ta = document.getElementById(e.id);
        const box = e.getContainer();
        return {id: e.id, name: ta ? ta.name : null, visible: !!(box && box.offsetParent !== null), init: e.initialized};
    }) : []));
}
const edBox = (page, id) => page.locator(`[id="${id}"] ~ .tox-tinymce`).first();
async function waitMce(page, id) {
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T});
}
async function mceGet(page, id) {
    return page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id).catch(() => null);
}
/** Click into the box, go to its end, type. */
async function mceType(page, id, text) {
    await waitMce(page, id);
    const body = page.frameLocator(`[id="${id}_ifr"]`).locator('body');
    await body.click();
    await page.keyboard.press('Control+End');
    if (text) await page.keyboard.type(text);
    await sleep(200);
    return mceGet(page, id);
}
/** Open "Insert Tag" on the box's bar; its menu's items (or what opened instead). */
async function tagMenu(page, id) {
    const btn = edBox(page, id).getByRole('button', {name: 'Insert Tag'});
    const out = {button: await btn.count()};
    if (!out.button) return out;
    await btn.click();
    await sleep(700);
    out.items = await page.locator('.tox-menu:visible .tox-collection__item, .tox-menu:visible [role="menuitem"]').allInnerTexts().catch(() => []);
    out.items = [...new Set(out.items.map((s) => s.replace(/\s+/g, ' ').trim()))];
    out.menuText = await page.locator('.tox-menu:visible, .tox-tinymce-aux .tox-collection:visible').allInnerTexts().catch(() => []);
    out.notifications = await page.locator('.tox-notification:visible').allInnerTexts().catch(() => []);
    return out;
}
async function pickTag(page, id, re) {
    const m = await tagMenu(page, id);
    const item = page.locator('.tox-menu:visible .tox-collection__item').filter({hasText: re}).first();
    if (await item.count()) { await item.click(); await sleep(400); } else { await closeMenu(page, id); }
    return m;
}
/** Close an open TinyMCE menu by clicking into the box (Escape would close the whole window). */
async function closeMenu(page, id) {
    if (await page.locator('.tox-menu:visible').count()) {
        await page.frameLocator(`[id="${id}_ifr"]`).locator('body').click({position: {x: 5, y: 5}}).catch(() => {});
        await sleep(300);
    }
}
/** The tags in the box as the editor shows them. */
async function tagsInBox(page, id) {
    return page.evaluate((i) => {
        const ed = window.tinymce.get(i);
        return [...ed.getBody().querySelectorAll('.pkpTag, [data-symbolic], .mceNonEditable')].map((s) => {
            const cs = ed.getWin().getComputedStyle(s);
            return {html: s.outerHTML.slice(0, 200), text: s.textContent, contenteditable: s.getAttribute('contenteditable'), background: cs.backgroundColor, color: cs.color};
        });
    }, id).catch((e) => String(e.message || e));
}

// ---------------------------------------------------------------------------
// Public pages

async function readPublic(p) {
    return p.evaluate(() => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const q = (s) => document.querySelector(s);
        const pageEl = q('.pkp_structure_main .page') || q('.page');
        return {
            url: location.href,
            title: document.title,
            lang: document.documentElement.lang,
            h1s: [...document.querySelectorAll('h1')].map(t),
            breadcrumbs: t(q('.cmp_breadcrumbs')),
            header: !!q('.pkp_structure_head'),
            siteName: t(q('.pkp_site_name')),
            primaryMenu: [...document.querySelectorAll('#navigationPrimary > li')].map((li) => {
                const a = li.querySelector(':scope > a');
                return {text: t(a), href: a ? a.getAttribute('href') : null, children: [...li.querySelectorAll(':scope > ul a')].map((c) => ({text: t(c), href: c.getAttribute('href')}))};
            }),
            userMenu: [...document.querySelectorAll('#navigationUser a')].map((a) => t(a)).slice(0, 8),
            footer: !!q('.pkp_structure_footer'),
            sidebar: q('.pkp_structure_sidebar') ? [...document.querySelectorAll('.pkp_structure_sidebar .pkp_block')].map((b) => ({id: b.id, cls: b.className, text: t(b).slice(0, 160)})) : null,
            pageText: t(pageEl) ? t(pageEl).slice(0, 900) : null,
            pageHtml: pageEl ? pageEl.innerHTML.replace(/\s+/g, ' ').slice(0, 1500) : null,
            editLinks: [...document.querySelectorAll('a, button')].filter((a) => /^\s*Edit\s*$/i.test(a.innerText || '') || a.closest('.cmp_edit_link')).map((a) => ({text: t(a), href: a.getAttribute('href'), cls: a.className})),
            bodyText: t(document.body) ? t(document.body).slice(0, 500) : null,
            bodyLength: (document.body ? document.body.innerHTML.length : 0),
        };
    });
}
/** Open an address and read it as data; snapshot and shot under `name`. */
async function pub(page, url, name, extra = {}) {
    let status = null;
    let err = null;
    const resp = await page.goto(url).catch((e) => { err = String(e.message).split('\n')[0]; return null; });
    if (resp) status = resp.status();
    await idle(page).catch(() => {});
    const d = await readPublic(page).catch((e) => ({error: String(e.message || e)}));
    const out = {status, gotoError: err, ...d, ...extra};
    await snap(page, name, out).catch(() => {});
    return out;
}
const short = (p) => ({status: p.status, url: p.url && p.url.replace(/^https?:\/\/[^/]+/, ''), title: p.title, h1s: p.h1s, breadcrumbs: p.breadcrumbs, header: p.header, footer: p.footer, sidebar: p.sidebar && p.sidebar.map((b) => b.id || b.cls), pageText: p.pageText && p.pageText.slice(0, 240), edit: p.editLinks, body: p.header ? undefined : p.bodyText});

/** "Preview" of an open window: the new tab as data, then closed. */
async function preview(page, win, name) {
    const out = {};
    const btn = win.getByRole('button', {name: 'Preview', exact: true}).or(win.getByRole('link', {name: 'Preview', exact: true})).first();
    out.button = await btn.count();
    await loc(page, `${name}: "Preview"`, btn);
    const pagesBefore = page.context().pages().length;
    const [popup] = await Promise.all([
        page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null),
        btn.click().catch((e) => { out.clickError = String(e.message).split('\n')[0]; }),
    ]);
    out.newTab = !!popup;
    out.pagesBefore = pagesBefore;
    if (popup) {
        await popup.waitForLoadState('load').catch(() => {});
        await sleep(2500);
        out.page = await readPublic(popup).catch((e) => ({error: String(e.message || e)}));
        out.page.urlNow = popup.url();
        record(name, {...(await screen(popup).catch(() => ({}))), preview: out});
        await shot(popup, name).catch(() => {});
        await popup.close();
    }
    out.pagesAfter = page.context().pages().length;
    return out;
}

// ---------------------------------------------------------------------------
// The item window

async function contentIds(page) {
    const ids = await itemWindow(page).locator('textarea[name^="content["]').evaluateAll((els) => els.map((e) => ({id: e.id, name: e.name})));
    const by = (n) => (ids.find((i) => i.name === n) || {}).id;
    return {en: by('content[en]'), fr: by('content[fr_CA]'), all: ids};
}
/** Boxes per language in the open item window: Title inputs, Content textareas and editors. */
async function itemBoxes(page) {
    return itemWindow(page).evaluate((w) => {
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        return {
            title: [...w.querySelectorAll('input[name^="title["]')].map((e) => ({name: e.name, placeholder: e.placeholder, visible: vis(e)})),
            content: [...w.querySelectorAll('textarea[name^="content["], textarea[id^="content-"]')].map((e) => ({id: e.id, placeholder: e.placeholder, name: e.name})),
            note: [...w.querySelectorAll('p, .description, label.sub_label, span.sub_label')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter((s) => /accessible at|Create a custom page/.test(s)),
        };
    });
}
const pathBox = (page) => itemWindow(page).locator('input[name="path"]');
/** Leave the boxes, so a language popover (the other form language's box, open while a box has focus) closes over "Save". */
async function blurBoxes(page) {
    await pathBox(page).click().catch(() => {});
    await sleep(500);
}

/** Add a "Custom Page" item: title, path, text typed into the English box, tags picked from "Insert Tag". */
async function addCustom(page, {title, path: p, text, tags = [], after = ''}) {
    await openItemWindow(page, 'add');
    await fillTitle(page, title);
    await setType(page, 'Custom Page');
    await pathBox(page).fill(p);
    const ids = await contentIds(page);
    if (text) await mceType(page, ids.en, text);
    // after a tag the caret stays in the box, right after it: type on without clicking
    // (a click into the box can land on a tag and select it, and the next key replaces it)
    for (const [label, re] of tags) {
        await page.keyboard.press('End');
        await page.keyboard.type(` ${label}=`);
        await pickTag(page, ids.en, re);
    }
    if (after) { await page.keyboard.press('End'); await page.keyboard.type(after); }
    const content = await mceGet(page, ids.en);
    await blurBoxes(page);
    const r = await itemSave(page);
    if (r.windowOpen) await closeItemWindow(page);
    return {...r, content};
}

async function removeItem(page, title) {
    await rowAction(page, 'items', title, 'Remove');
    await sleep(600);
    const d = await dialogs(page);
    const cd = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible, [data-cy="dialog"]:visible').filter({hasText: /Are you sure/}).last();
    await cd.getByRole('button', {name: 'OK', exact: true}).or(cd.getByRole('link', {name: 'OK', exact: true})).first().click();
    const n = await notice(page, /successfully removed|removed/i, 6000);
    await idle(page);
    await sleep(700);
    return {confirm: d.map((x) => x.text).slice(-1)[0], notice: n};
}

// ---------------------------------------------------------------------------
// Settings › Website tabs

async function websiteTab(page, app, ctx, name) {
    await page.goto('about:blank');
    await page.goto(ctxUrl(app, ctx, '/management/settings/website'));
    await idle(page);
    await page.getByRole('tab', {name, exact: true}).first().click();
    await idle(page);
    await sleep(800);
}
const lastDialog = (page) => page.locator('[role="dialog"]:visible').last();

async function openAddStatic(page, app, ctx) {
    await websiteTab(page, app, ctx, 'Static Pages');
    await page.getByRole('link', {name: 'Add Static Page'}).click();
    await page.locator('[role="dialog"]:visible textarea[name^="content"]').first().waitFor({state: 'attached', timeout: T});
    await idle(page);
    await page.waitForFunction(() => window.tinymce && window.tinymce.get().filter((e) => /content/.test(e.id)).every((e) => e.initialized), undefined, {timeout: T}).catch(() => {});
    await sleep(1200);
    return lastDialog(page);
}
async function openAddBlock(page, app, ctx) {
    await websiteTab(page, app, ctx, 'Plugins');
    const row = page.getByRole('row', {name: /Custom Block Manager This Plugin/});
    await row.getByRole('link', {name: 'Settings'}).click();
    await sleep(500);
    await page.getByRole('link', {name: 'Manage Custom Blocks'}).first().click();
    await page.getByRole('link', {name: 'Add Block'}).waitFor({timeout: T});
    await idle(page);
    await sleep(600);
    await page.getByRole('link', {name: 'Add Block'}).click();
    await page.locator('input[name^="blockTitle"]').first().waitFor({timeout: T});
    await idle(page);
    await page.waitForFunction(() => window.tinymce && window.tinymce.get().filter((e) => /blockContent/.test(e.id)).every((e) => e.initialized), undefined, {timeout: T}).catch(() => {});
    await sleep(1200);
    return lastDialog(page);
}
async function windowBoxes(win) {
    return win.evaluate((w) => {
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        return {
            heading: w.querySelector('h1, h2')?.innerText.trim() ?? null,
            inputs: [...w.querySelectorAll('input[name], textarea[name]')].filter((e) => e.type !== 'hidden').map((e) => ({name: e.name, id: e.id, placeholder: e.placeholder, visible: vis(e), maxlength: e.getAttribute('maxlength')})),
            buttons: [...w.querySelectorAll('button, a.cancelButton, a.pkp_button')].filter(vis).map((b) => b.innerText.trim() || b.getAttribute('aria-label')).filter(Boolean),
            text: w.innerText.replace(/\s+/g, ' ').trim().slice(0, 1200),
        };
    });
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const sf = stateFile(app);
    let S = fs.existsSync(sf) && !process.env.RESEED ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null;
    if (!S) {
        const t = tag('u09k1');
        const plugins = {customblockmanagerplugin: {enabled: true}};
        if (hasStatic(app)) plugins.staticpagesplugin = {enabled: true};
        const A = `${t}a`;
        const B = `${t}b`;
        await app.api.createContext({tag: A, context: {supportedLocales: ['en', 'fr_CA']}, plugins, sidebar: [app.name === 'ops' ? 'languagetoggleblockplugin' : 'informationblockplugin'],
            users: [{username: `${A}m`, roles: ['manager']}, {username: `${A}r`, roles: ['reader']}]});
        await app.api.createContext({tag: B, context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}, plugins, sidebar: ['languagetoggleblockplugin'],
            users: [{username: `${B}m`, roles: ['manager']}]});
        S = {t, A, B, siteTag: t};
        fs.writeFileSync(sf, JSON.stringify(S, null, 2));
    }
    const {A, B} = S;
    const U = {am: `${A}m`, ar: `${A}r`, bm: `${B}m`};
    log(app.name, 'contexts', A, B);
    const P = (ctx, p, locale = '') => ctxUrl(app, ctx, p, locale);
    const {page, close} = await launch(app);
    const bd = [];
    let cur = '';
    page.on('dialog', async (d) => { bd.push({type: d.type(), message: d.message(), url: page.url(), step: cur}); await d.accept().catch(() => {}); });
    page.context().on('page', (p) => p.on('dialog', async (d) => { bd.push({type: d.type(), message: d.message(), url: p.url(), popup: true, step: cur}); await d.accept().catch(() => {}); }));
    const step = async (name, fn) => { cur = name; try { return await fn(); } catch (e) { log(app.name, 'STEP FAILED', name, String(e.message || e).split('\n')[0]); await shot(page, `err-${name}`).catch(() => {}); return {error: String(e.message || e).split('\n')[0]}; } };
    try {
        // ------------------------------------------------------------ bars
        if (on('bars')) {
            const o = {};
            await as(page, U.am, A);
            await openNav(page, app, A);
            await openItemWindow(page, 'add');
            await setType(page, 'Custom Page');
            await sleep(800);
            const ids = await contentIds(page);
            await snap(page, 'b01-item-window-custom-A');
            o.item = {boxes: await itemBoxes(page), editors: await editors(page), bars: await bars(page), state: await itemState(page)};
            await loc(page, 'item window: the "Content" box\'s bar (English)', edBox(page, ids.en));
            await loc(page, 'item window: "Insert Tag"', edBox(page, ids.en).getByRole('button', {name: 'Insert Tag'}));
            o.item.blocks = await step('blocks', async () => {
                await edBox(page, ids.en).getByRole('button', {name: /^Block/}).first().click();
                await sleep(500);
                const items = await page.locator('.tox-menu:visible .tox-collection__item').allInnerTexts();
                await closeMenu(page, ids.en);
                return items.map((s) => s.trim());
            });
            o.item.tagMenu = await step('tagMenu', () => tagMenu(page, ids.en));
            await snap(page, 'b02-item-insert-tag-menu-A', {tagMenu: o.item.tagMenu});
            await closeMenu(page, ids.en);
            // a tag in the box: how it shows, and one Backspace after it
            o.item.tagInBox = await step('tagInBox', async () => {
                await mceType(page, ids.en, 'Name: ');
                await pickTag(page, ids.en, /^Principal Contact Name/);
                const before = await mceGet(page, ids.en);
                const shown = await tagsInBox(page, ids.en);
                await snap(page, 'b03-item-tag-in-box-A');
                await page.keyboard.press('Backspace');
                await sleep(300);
                const afterBackspace = await mceGet(page, ids.en);
                // the tag again, then the caret moved into it and a letter typed
                await pickTag(page, ids.en, /^Principal Contact Name/);
                await page.keyboard.press('ArrowLeft');
                await page.keyboard.type('X');
                await sleep(300);
                const afterTypeInside = await mceGet(page, ids.en);
                return {before, shown, afterBackspace, afterTypeInside};
            });
            // copy and paste buttons: what a press does
            o.item.copyPaste = await step('copyPaste', async () => {
                const r = {};
                const body = page.frameLocator(`[id="${ids.en}_ifr"]`).locator('body');
                await body.click();
                await page.keyboard.press('Control+a');
                await edBox(page, ids.en).getByRole('button', {name: 'Copy', exact: true}).click();
                await sleep(800);
                r.afterCopy = {notifications: await page.locator('.tox-notification:visible').allInnerTexts().catch(() => []), dialogs: (await dialogs(page)).map((d) => d.name), content: await mceGet(page, ids.en)};
                // what "Copy" put on the clipboard: paste it with the keyboard at the end
                await page.keyboard.press('End');
                await page.keyboard.press('Control+v');
                await sleep(500);
                r.afterKeyboardPaste = await mceGet(page, ids.en);
                await edBox(page, ids.en).getByRole('button', {name: 'Paste', exact: true}).click();
                await sleep(800);
                r.afterPaste = {notifications: await page.locator('.tox-notification:visible').allInnerTexts().catch(() => []), dialogs: (await dialogs(page)).map((d) => d.name), content: await mceGet(page, ids.en)};
                await snap(page, 'b04-item-copy-paste-A', r);
                return r;
            });
            // the window left with the unsaved change
            o.item.leave = await step('leave', async () => {
                await fillTitle(page, 'Unsaved title');
                return closeItemWindow(page);
            });
            await snap(page, 'b05-item-window-left-unsaved-A', {leave: o.item.leave});
            // B: the boxes per form language
            cur = 'to B';
            await as(page, U.bm, B);
            await openNav(page, app, B);
            await openItemWindow(page, 'add');
            await setType(page, 'Custom Page');
            await sleep(800);
            await snap(page, 'b06-item-window-custom-B');
            o.itemB = {boxes: await itemBoxes(page), editors: (await editors(page)).filter((e) => /^content-/.test(e.id))};
            o.itemB.frOnFocus = await step('frOnFocus', async () => {
                const idsB = await contentIds(page);
                await page.frameLocator(`[id="${idsB.en}_ifr"]`).locator('body').click();
                await sleep(800);
                const r = {editors: (await editors(page)).filter((e) => /^content-/.test(e.id)), bars: (await bars(page)).map((b) => b.id)};
                await itemWindow(page).locator('input[name="title[en]"]').click();
                await sleep(500);
                r.titleBoxes = await itemBoxes(page).then((b) => b.title);
                await snap(page, 'b07-item-window-B-focused', r);
                return r;
            });
            cur = 'close B window';
            o.itemB.close = await closeItemWindow(page);
            // static page window (OJS, OMP), A then B
            if (hasStatic(app)) {
                o.static = await step('static', async () => {
                    await as(page, U.am, A);
                    const w = await openAddStatic(page, app, A);
                    await snap(page, 'b08-static-window-A');
                    const idS = (await editors(page)).find((e) => /content/.test(e.id) && e.visible)?.id;
                    const r = {boxes: await windowBoxes(w), editors: (await editors(page)).filter((e) => /content/i.test(e.id)), bars: await bars(page)};
                    r.tagMenu = idS ? await tagMenu(page, idS) : null;
                    await snap(page, 'b09-static-insert-tag-menu-A', {tagMenu: r.tagMenu});
                    if (idS) await closeMenu(page, idS);
                    await as(page, U.bm, B);
                    const wB = await openAddStatic(page, app, B);
                    r.boxesB = await windowBoxes(wB);
                    r.editorsB = (await editors(page)).filter((e) => /content/i.test(e.id));
                    await snap(page, 'b10-static-window-B', {boxes: r.boxesB, editors: r.editorsB});
                    return r;
                });
            }
            // custom block window, A then B
            o.block = await step('block', async () => {
                await as(page, U.am, A);
                const w = await openAddBlock(page, app, A);
                await snap(page, 'b11-block-window-A');
                const idB = (await editors(page)).find((e) => /blockContent/.test(e.id) && e.visible)?.id;
                const r = {boxes: await windowBoxes(w), editors: (await editors(page)).filter((e) => /blockContent/.test(e.id)), bars: await bars(page)};
                r.tagMenu = idB ? await tagMenu(page, idB) : null;
                await snap(page, 'b12-block-insert-tag-A', {tagMenu: r.tagMenu});
                if (idB) await closeMenu(page, idB);
                await as(page, U.bm, B);
                const wB = await openAddBlock(page, app, B);
                r.boxesB = await windowBoxes(wB);
                r.editorsB = (await editors(page)).filter((e) => /blockContent/.test(e.id));
                await snap(page, 'b13-block-window-B', {boxes: r.boxesB, editors: r.editorsB});
                return r;
            });
            record('b00-bars-summary', {...o, browserDialogs: bd});
            log(app.name, 'bars item', JSON.stringify(o.item.bars), 'blocks', JSON.stringify(o.item.blocks));
            log(app.name, 'bars item tagMenu', JSON.stringify(o.item.tagMenu));
            log(app.name, 'bars item tagInBox', JSON.stringify(o.item.tagInBox));
            log(app.name, 'bars copyPaste', JSON.stringify(o.item.copyPaste));
            log(app.name, 'bars leave', JSON.stringify(o.item.leave && o.item.leave.map ? o.item.leave.map((d) => d.text.slice(0, 160)) : o.item.leave));
            log(app.name, 'bars A boxes', JSON.stringify(o.item.boxes), 'B boxes', JSON.stringify(o.itemB.boxes), 'B editors', JSON.stringify(o.itemB.editors), 'B focus', JSON.stringify(o.itemB.frOnFocus));
            if (o.static) log(app.name, 'bars static', JSON.stringify({bars: o.static.bars, tagMenu: o.static.tagMenu, inputs: o.static.boxes && o.static.boxes.inputs.map((i) => i.name), eds: o.static.editors, inputsB: o.static.boxesB && o.static.boxesB.inputs.map((i) => i.name), edsB: o.static.editorsB, error: o.static.error}));
            log(app.name, 'bars block', JSON.stringify({bars: o.block.bars, tagMenu: o.block.tagMenu, inputs: o.block.boxes && o.block.boxes.inputs.map((i) => i.name), eds: o.block.editors, inputsB: o.block.boxesB && o.block.boxesB.inputs.map((i) => i.name), edsB: o.block.editorsB, buttons: o.block.boxes && o.block.boxes.buttons, error: o.block.error}));
        }

        // ------------------------------------------------------------ preview
        if (on('preview')) {
            const o = {};
            await as(page, U.am, A);
            await openNav(page, app, A);
            o.gridBefore = (await grids(page)).items.rows;
            await openItemWindow(page, 'add');
            await fillTitle(page, 'Preview title');
            await setType(page, 'Custom Page');
            await pathBox(page).fill('preview-page');
            const ids = await contentIds(page);
            await mceType(page, ids.en, 'Preview text. Contact: ');
            await pickTag(page, ids.en, /^Principal Contact Name/);
            o.typed = await mceGet(page, ids.en);
            await blurBoxes(page);
            await snap(page, 'p01-item-before-preview');
            o.item = await preview(page, itemWindow(page), 'p02-item-preview-tab');
            await sleep(500);
            o.after = {windowOpen: await itemWindow(page).isVisible().catch(() => false), title: await itemWindow(page).locator('input[name="title[en]"]').inputValue().catch(() => null), path: await pathBox(page).inputValue().catch(() => null), content: await mceGet(page, ids.en)};
            await snap(page, 'p03-item-after-preview', o.after);
            await closeItemWindow(page);
            await openNav(page, app, A);
            o.gridAfter = (await grids(page)).items.rows;
            // preview from an existing item's "Edit" (a saved item, the text changed and not saved)
            if (hasStatic(app)) {
                o.static = await step('staticPreview', async () => {
                    const w = await openAddStatic(page, app, A);
                    const r = {};
                    await w.locator('input[name="path"]').fill('static-preview');
                    await w.locator('input[name="title[en]"]').fill('Static preview title');
                    const idS = (await editors(page)).find((e) => /content/.test(e.id) && e.visible)?.id;
                    await mceType(page, idS, 'Static preview text. Contact: ');
                    await pickTag(page, idS, /^Principal Contact Name/);
                    r.typed = await mceGet(page, idS);
                    r.preview = await preview(page, w, 'p04-static-preview-tab');
                    r.after = {open: await w.isVisible().catch(() => false), title: await w.locator('input[name="title[en]"]').inputValue().catch(() => null), content: await mceGet(page, idS)};
                    await snap(page, 'p05-static-after-preview', r.after);
                    // the window left with the unsaved change
                    await w.getByRole('button', {name: 'Close'}).first().click();
                    await sleep(800);
                    r.leave = await dialogs(page);
                    const yes = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'});
                    if (await yes.count()) { await yes.getByRole('button', {name: 'Yes', exact: true}).click(); await sleep(500); }
                    await idle(page);
                    r.list = await page.locator('table:visible').first().innerText().catch(() => null);
                    await snap(page, 'p06-static-list-after', {list: r.list});
                    return r;
                });
            }
            record('p00-preview-summary', {...o, browserDialogs: bd});
            log(app.name, 'preview item', JSON.stringify({newTab: o.item.newTab, click: o.item.clickError, page: o.item.page && short(o.item.page), urlNow: o.item.page && o.item.page.urlNow, pages: [o.item.pagesBefore, o.item.pagesAfter]}));
            log(app.name, 'preview after', JSON.stringify(o.after), 'grid', JSON.stringify(o.gridBefore), '->', JSON.stringify(o.gridAfter));
            if (o.static) log(app.name, 'preview static', JSON.stringify({error: o.static.error, newTab: o.static.preview && o.static.preview.newTab, page: o.static.preview && o.static.preview.page && short(o.static.preview.page), urlNow: o.static.preview && o.static.preview.page && o.static.preview.page.urlNow, after: o.static.after, leave: o.static.leave && o.static.leave.map((d) => d.text.slice(0, 160)), list: o.static.list}));
        }

        // ------------------------------------------------------------ page
        if (on('page')) {
            const o = {};
            await as(page, U.am, A);
            await openNav(page, app, A);
            o.our = await addCustom(page, {title: 'Our page', path: 'our-page', text: 'Welcome to our page.'});
            await openNav(page, app, A);
            o.fees = await addCustom(page, {title: 'Fees', path: 'info/fees', text: 'Our fees.'});
            await openNav(page, app, A);
            o.tagp = await addCustom(page, {title: 'Tag page', path: 'tag-page', text: 'Tags:', after: ' end.', tags: [
                ['PN', /^Principal Contact Name/], ['PE', /^Principal Contact Email/], ['SN', /^Support Contact Name/], ['SP', /^Support Contact Phone/], ['SE', /^Support Contact Email/]]});
            await openNav(page, app, A);
            o.grid = await grids(page);
            await snap(page, 'g01-items-after-adds', {grid: o.grid.items});
            // the tag page's saved content as the window shows it again
            o.tagReopen = await step('tagReopen', async () => {
                await openItemWindow(page, 'edit', 'Tag page');
                const ids = await contentIds(page);
                await waitMce(page, ids.en);
                const r = {content: await mceGet(page, ids.en), shown: await tagsInBox(page, ids.en), raw: await page.locator(`[id="${ids.en}"]`).inputValue().catch(() => null)};
                await snap(page, 'g02-tag-page-reopened', r);
                await closeItemWindow(page);
                return r;
            });
            // open and close untouched: "Our page" (no tag) then "Tag page" (five tags); the browser dialogs each raises
            o.untouched = {};
            for (const title of ['Our page', 'Tag page']) {
                o.untouched[title] = await step(`untouched ${title}`, async () => {
                    await openNav(page, app, A);
                    await openItemWindow(page, 'edit', title);
                    const ids = await contentIds(page);
                    await waitMce(page, ids.en);
                    await sleep(800);
                    const n0 = bd.length;
                    const inWindow = await closeItemWindow(page);
                    await sleep(500);
                    return {browserDialogs: bd.slice(n0).map((d) => d.message), windowDialogs: (inWindow || []).map((d) => d.text.slice(0, 120)), stillOpen: await itemWindow(page).isVisible().catch(() => false)};
                });
            }
            cur = '';
            // manager reads the page
            o.mgr = await pub(page, P(A, '/our-page'), 'g03-our-page-manager');
            await signOut(page);
            o.anon = {
                our: await pub(page, P(A, '/our-page'), 'g04-our-page-signed-out'),
                fees: await pub(page, P(A, '/info/fees'), 'g05-info-fees-signed-out'),
                tag: await pub(page, P(A, '/tag-page'), 'g06-tag-page-signed-out'),
                ourFr: await pub(page, P(A, '/our-page', 'fr_CA'), 'g07-our-page-fr-signed-out'),
                home: await pub(page, P(A, ''), 'g08-home-signed-out'),
            };
            await as(page, U.ar, A);
            o.reader = await pub(page, P(A, '/our-page'), 'g09-our-page-reader');
            // the menu: "Our page" into the Primary Navigation Menu
            await as(page, U.am, A);
            o.menu = await step('menu', async () => {
                await openNav(page, app, A);
                await openMenu(page, 'Primary Navigation Menu');
                const before = brief(await panels(page));
                const ok = await assignTop(page, 'Our page');
                const saved = await saveMenu(page);
                await signOut(page);
                const h = await pub(page, P(A, ''), 'g10-home-with-menu-link');
                const link = h.primaryMenu.find((m) => m.text === 'Our page');
                let followed = null;
                if (link) {
                    await page.locator('#navigationPrimary > li > a', {hasText: 'Our page'}).first().click();
                    await page.waitForLoadState();
                    await idle(page);
                    followed = short(await readPublic(page));
                    await snap(page, 'g11-menu-link-followed');
                }
                return {before, assigned: ok, saved, link, followed};
            });
            record('g00-page-summary', {...o, browserDialogs: bd});
            log(app.name, 'page saves', JSON.stringify({our: o.our.notice, fees: o.fees.notice, tag: o.tagp.notice, tagContent: o.tagp.content, rows: o.grid.items.rows}));
            log(app.name, 'page tagReopen', JSON.stringify(o.tagReopen));
            log(app.name, 'page untouched close', JSON.stringify(o.untouched));
            for (const [k, v] of Object.entries(o.anon)) log(app.name, 'page anon', k, JSON.stringify(short(v)));
            log(app.name, 'page mgr', JSON.stringify(short(o.mgr)), 'userMenu', JSON.stringify(o.mgr.userMenu));
            log(app.name, 'page reader', JSON.stringify(short(o.reader)));
            log(app.name, 'page menu', JSON.stringify(o.menu));
        }

        // ------------------------------------------------------------ contact
        if (on('contact')) {
            const o = {};
            await as(page, U.am, A);
            await page.goto(P(A, '/management/settings/context'));
            await idle(page);
            await page.getByRole('tab', {name: 'Contact', exact: true}).first().click();
            await page.locator('#contact-contactName-control').waitFor({timeout: T});
            await idle(page);
            await sleep(600);
            const val = async () => {
                const r = {};
                for (const k of ['contactName', 'contactEmail', 'contactPhone', 'supportName', 'supportEmail', 'supportPhone']) r[k] = await page.locator(`#contact-${k}-control`).inputValue().catch(() => '(none)');
                return r;
            };
            o.arrival = await val();
            await snap(page, 'c01-contact-arrival', {values: o.arrival});
            await page.locator('#contact-contactName-control').fill('Ada Lovelace');
            await page.locator('#contact-supportName-control').fill('Sam Support');
            await page.locator('#contact-supportEmail-control').fill(`${S.t}sam@mail.test`);
            o.save = await saveForm(page, '#contact-contactName-control');
            o.after = await val();
            await snap(page, 'c02-contact-saved', {save: o.save, values: o.after});
            await signOut(page);
            o.tag = await pub(page, P(A, '/tag-page'), 'c03-tag-page-after-contact-change');
            record('c00-contact-summary', o);
            log(app.name, 'contact arrival', JSON.stringify(o.arrival), 'save', JSON.stringify(o.save), 'after', JSON.stringify(o.after));
            log(app.name, 'contact tag page', JSON.stringify(short(o.tag)));
        }

        // ------------------------------------------------------------ move
        if (on('move')) {
            const o = {};
            await as(page, U.am, A);
            await openNav(page, app, A);
            await openItemWindow(page, 'edit', 'Our page');
            o.pathBefore = await pathBox(page).inputValue();
            await pathBox(page).fill('our-new-page');
            o.save = await itemSave(page);
            if (o.save.windowOpen) await closeItemWindow(page);
            await signOut(page);
            o.old = await pub(page, P(A, '/our-page'), 'm01-old-address');
            o.new = await pub(page, P(A, '/our-new-page'), 'm02-new-address');
            o.never = await pub(page, P(A, '/never-used-u09'), 'm03-never-used-address');
            o.homeMenu = (await pub(page, P(A, ''), 'm04-home-menu-after-move')).primaryMenu;
            await as(page, U.am, A);
            await openNav(page, app, A);
            o.remove = await removeItem(page, 'Our page');
            o.gridAfter = (await grids(page)).items.rows;
            await signOut(page);
            o.removed = await pub(page, P(A, '/our-new-page'), 'm05-removed-address');
            o.homeMenu2 = (await pub(page, P(A, ''), 'm06-home-menu-after-remove')).primaryMenu;
            record('m00-move-summary', o);
            log(app.name, 'move save', JSON.stringify({pathBefore: o.pathBefore, notice: o.save.notice, open: o.save.windowOpen}));
            for (const k of ['old', 'new', 'never', 'removed']) log(app.name, 'move', k, JSON.stringify(short(o[k])), 'len', o[k].bodyLength);
            log(app.name, 'move remove', JSON.stringify(o.remove), 'rows', JSON.stringify(o.gridAfter), 'menus', JSON.stringify(o.homeMenu.map((m) => m.text)), JSON.stringify(o.homeMenu2.map((m) => m.text)));
        }

        // ------------------------------------------------------------ builtin
        if (on('builtin')) {
            const o = {};
            await signOut(page);
            o.aboutBefore = await pub(page, P(A, '/about'), 'x01-about-before');
            o.searchBefore = await pub(page, P(A, '/search'), 'x02-search-before');
            await as(page, U.am, A);
            await openNav(page, app, A);
            await openItemWindow(page, 'add');
            await setType(page, 'Custom Page');
            o.note = ((await itemState(page)).text || '').match(/This page will be accessible at:.*?functions\./)?.[0] || null;
            await closeItemWindow(page);
            await openNav(page, app, A);
            o.addAbout = await addCustom(page, {title: 'About replacement', path: 'about', text: 'Replacement'});
            await openNav(page, app, A);
            o.addSearch = await addCustom(page, {title: 'Search replacement', path: 'search', text: 'Search replacement text'});
            o.mgrAbout = await pub(page, P(A, '/about'), 'x03-about-manager');
            await signOut(page);
            o.about = await pub(page, P(A, '/about'), 'x04-about-signed-out');
            // the header's About › About the Journal (press, server)
            o.aboutMenu = await step('aboutMenu', async () => {
                const about = o.about.primaryMenu.find((m) => /^About/.test(m.text || ''));
                const child = about && about.children.find((c) => /^About the /.test(c.text));
                const r = {about, child};
                if (child) {
                    // the submenu opens on hover or focus; a click that cannot land falls back to the link's own address
                    await page.locator('#navigationPrimary > li > a', {hasText: /^About$/}).first().hover().catch(() => {});
                    await sleep(600);
                    const link = page.locator('#navigationPrimary ul a:visible', {hasText: child.text}).first();
                    r.clicked = await link.click({timeout: 5000}).then(() => true).catch(() => false);
                    if (!r.clicked) await page.goto(child.href);
                    await page.waitForLoadState();
                    await idle(page);
                    r.followed = short(await readPublic(page));
                    await snap(page, 'x05-about-the-journal-followed');
                }
                return r;
            });
            o.masthead = await pub(page, P(A, '/about/editorialMasthead'), 'x06-editorial-masthead');
            o.search = await pub(page, P(A, '/search'), 'x07-search-signed-out');
            o.searchSearch = await pub(page, P(A, '/search/search'), 'x08-search-search-signed-out');
            o.searchLink = await step('searchLink', async () => {
                await page.goto(P(A, ''));
                await idle(page);
                const a = page.locator('a.pkp_search, .pkp_navigation_search_wrapper a, a[href*="/search"]').first();
                const href = await a.getAttribute('href').catch(() => null);
                const text = await a.innerText().catch(() => null);
                await a.click();
                await page.waitForLoadState();
                await idle(page);
                const r = {href, text, followed: short(await readPublic(page))};
                await snap(page, 'x09-header-search-followed', r);
                return r;
            });
            await as(page, U.ar, A);
            o.readerAbout = await pub(page, P(A, '/about'), 'x10-about-reader');
            await as(page, U.am, A);
            await openNav(page, app, A);
            o.rm1 = await removeItem(page, 'About replacement');
            await openNav(page, app, A);
            o.rm2 = await removeItem(page, 'Search replacement');
            await signOut(page);
            o.aboutAfter = await pub(page, P(A, '/about'), 'x11-about-after-remove');
            o.searchAfter = await pub(page, P(A, '/search'), 'x12-search-after-remove');
            record('x00-builtin-summary', o);
            log(app.name, 'builtin note', JSON.stringify(o.note), 'saves', JSON.stringify([o.addAbout.notice, o.addAbout.windowOpen, o.addSearch.notice, o.addSearch.windowOpen]));
            for (const k of ['aboutBefore', 'searchBefore', 'mgrAbout', 'about', 'masthead', 'search', 'searchSearch', 'readerAbout', 'aboutAfter', 'searchAfter']) log(app.name, 'builtin', k, JSON.stringify(short(o[k])));
            log(app.name, 'builtin aboutMenu', JSON.stringify(o.aboutMenu));
            log(app.name, 'builtin searchLink', JSON.stringify(o.searchLink));
        }

        // ------------------------------------------------------------ lang
        if (on('lang')) {
            const o = {};
            await as(page, U.bm, B);
            await openNav(page, app, B);
            o.add = await addCustom(page, {title: 'English title', path: 'lang-page', text: 'English text.'});
            await signOut(page);
            o.en1 = await pub(page, P(B, '/lang-page', 'en'), 'l01-en-before-french');
            o.fr1 = await pub(page, P(B, '/lang-page', 'fr_CA'), 'l02-fr-before-french');
            // the language block's link, from the English page
            o.toggle = await step('toggle', async () => {
                await page.goto(P(B, '/lang-page', 'en'));
                await idle(page);
                const links = await page.locator('.pkp_structure_sidebar a').evaluateAll((as) => as.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})));
                const fr = page.locator('.pkp_structure_sidebar a', {hasText: /fran/i}).first();
                let followed = null;
                if (await fr.count()) { await fr.click(); await page.waitForLoadState(); await idle(page); followed = short(await readPublic(page)); await snap(page, 'l03-fr-by-language-block'); }
                // control: the same link from a built-in page (About the Journal)
                let control = null;
                await page.goto(P(B, '/about', 'en'));
                await idle(page);
                const fr2 = page.locator('.pkp_structure_sidebar a', {hasText: /fran/i}).first();
                if (await fr2.count()) { await fr2.click(); await page.waitForLoadState(); await idle(page); control = short(await readPublic(page)); }
                // back to English for the rest of the session
                await page.goto(P(B, '/lang-page', 'en'));
                await idle(page);
                return {links, followed, control};
            });
            await as(page, U.bm, B);
            await openNav(page, app, B);
            await openItemWindow(page, 'edit', 'English title');
            o.frEdit = await step('frEdit', async () => {
                const w = itemWindow(page);
                await w.locator('input[name="title[en]"]').click();
                await sleep(400);
                const frTitle = w.locator('input[name="title[fr_CA]"]');
                const frTitleVisible = await frTitle.isVisible();
                await frTitle.fill('Titre français');
                const ids = await contentIds(page);
                await page.frameLocator(`[id="${ids.en}_ifr"]`).locator('body').click();
                await sleep(800);
                const frBoxVisible = await edBox(page, ids.fr).isVisible().catch(() => false);
                await snap(page, 'l04-item-french-boxes-open', {frTitleVisible, frBoxVisible});
                await mceType(page, ids.fr, 'Texte français.');
                const r = {frTitleVisible, frBoxVisible, frContent: await mceGet(page, ids.fr), enContent: await mceGet(page, ids.en)};
                await blurBoxes(page);
                r.save = await itemSave(page);
                if (r.save.windowOpen) await closeItemWindow(page);
                return r;
            });
            await signOut(page);
            o.en2 = await pub(page, P(B, '/lang-page', 'en'), 'l05-en-after-french');
            o.fr2 = await pub(page, P(B, '/lang-page', 'fr_CA'), 'l06-fr-after-french');
            record('l00-lang-summary', o);
            log(app.name, 'lang add', JSON.stringify({notice: o.add.notice}), 'toggle', JSON.stringify(o.toggle));
            for (const k of ['en1', 'fr1', 'en2', 'fr2']) log(app.name, 'lang', k, JSON.stringify(short(o[k])), o[k].lang);
            log(app.name, 'lang frEdit', JSON.stringify(o.frEdit && {...o.frEdit, save: o.frEdit.save && {notice: o.frEdit.save.notice, open: o.frEdit.save.windowOpen}}));
        }


        // ------------------------------------------------------------ blocklang
        if (on('blocklang')) {
            const o = {};
            await as(page, U.bm, B);
            const blockForm = () => page.locator('[role="dialog"]:visible form#customBlockForm').last();
            const typeTitle = async (locale, value) => {
                const box = blockForm().locator(`input[name="blockTitle[${locale}]"]`).first();
                if (!(await box.isVisible().catch(() => false))) { await blockForm().locator('input[name^="blockTitle["]:visible').first().click(); await sleep(400); }
                await box.fill(value);
            };
            const typeContent = async (locale, value) => {
                const id = await blockForm().locator(`textarea[name="blockContent[${locale}]"]`).first().getAttribute('id');
                if (!(await page.locator(`[id="${id}_ifr"]`).isVisible().catch(() => false))) { await blockForm().locator('iframe:visible').first().contentFrame().locator('body').click(); await sleep(500); }
                await mceType(page, id, value);
            };
            const add = async (title, content) => {
                await openAddBlock(page, app, B);
                for (const [l, v] of Object.entries(title)) await typeTitle(l, v);
                for (const [l, v] of Object.entries(content)) await typeContent(l, v);
                // the French boxes open in a popover over the window's foot while a box has focus: click the heading to close it
                await page.locator('[role="dialog"]:visible').filter({has: page.locator('form#customBlockForm')}).last().locator('h1, h2').first().click().catch(() => {});
                await sleep(400);
                await blockForm().locator('input[name="showName"]').check();
                const w = page.waitForResponse((r) => /update-?custom-?block/i.test(r.url()), {timeout: T}).catch(() => null);
                await blockForm().locator('button[type=submit]').first().click();
                const r = await w;
                await sleep(1200);
                await idle(page);
                return {status: r ? r.status() : null, open: (await blockForm().count()) > 0};
            };
            // a rerun on the same state (KEEP_BLOCKS=1) places and reads the blocks added before
            if (!process.env.KEEP_BLOCKS) o.both = await step('block both', () => add({en: 'Partners EN', fr_CA: 'Partenaires FR'}, {en: 'EN block text', fr_CA: 'FR texte du bloc'}));
            if (!process.env.KEEP_BLOCKS) o.enOnly = await step('block en only', () => add({en: 'Links EN'}, {en: 'EN only block text'}));
            o.sidebar = await step('block sidebar', async () => {
                await websiteTab(page, app, B, 'Appearance');
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click();
                await idle(page);
                await sleep(700);
                const list = await page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
                for (const it of list.filter((x) => /^(partners|links)-en/i.test(x.label))) await page.locator(`input[name="sidebar"][value="${it.value}"]`).first().setChecked(true);
                const form = page.locator('form').filter({has: page.locator('input[name="sidebar"]')}).first();
                const w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                const r = await w;
                await sleep(1000);
                await snap(page, 'k01-sidebar-saved-B', {list});
                return {list, status: r ? r.status() : null};
            });
            await signOut(page);
            const readBlocks = async () => page.locator('.pkp_structure_sidebar .pkp_block').evaluateAll((bs) => bs.map((b) => ({id: b.id, heading: (b.querySelector('h2, .title') || {}).innerText || null, text: b.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)})));
            await pub(page, P(B, '', 'en'), 'k02-home-en-blocks-B');
            o.en = await readBlocks();
            await pub(page, P(B, '', 'fr_CA'), 'k03-home-fr-blocks-B');
            o.fr = await readBlocks();
            await page.goto(P(B, '', 'en'));
            record('k00-blocklang-summary', o);
            log(app.name, 'blocklang', JSON.stringify({both: o.both, enOnly: o.enOnly, sidebar: o.sidebar && (o.sidebar.error || o.sidebar.status), list: o.sidebar && o.sidebar.list && o.sidebar.list.map((x) => `${x.value}:${x.label}`)}));
            log(app.name, 'blocklang en', JSON.stringify(o.en));
            log(app.name, 'blocklang fr', JSON.stringify(o.fr));
        }
        // ------------------------------------------------------------ site
        if (on('site')) {
            const o = {};
            const sp = `site-page-${S.t.slice(-6)}`;
            o.path = sp;
            await as(page, 'admin', 'index');
            await openNav(page, app, 'index');
            o.gridBefore = await grids(page);
            await snap(page, 's01-site-navigation', {grid: o.gridBefore});
            await openItemWindow(page, 'add');
            await fillTitle(page, 'Site page');
            await setType(page, 'Custom Page');
            await pathBox(page).fill(sp);
            const ids = await contentIds(page);
            o.window = {boxes: await itemBoxes(page), bars: await bars(page), editors: (await editors(page)).filter((e) => /^content-/.test(e.id))};
            await mceType(page, ids.en, 'Site text. Contact: ');
            o.tagMenu = await pickTag(page, ids.en, /^Principal Contact Name/);
            o.content = await mceGet(page, ids.en);
            await snap(page, 's02-site-item-window', {window: o.window, tagMenu: o.tagMenu});
            await blurBoxes(page);
            o.preview = await step('sitePreview', () => preview(page, itemWindow(page), 's03-site-item-preview-tab'));
            await blurBoxes(page);
            o.save = await itemSave(page);
            if (o.save.windowOpen) await closeItemWindow(page);
            await signOut(page);
            o.page = await pub(page, app.url(`/index.php/index/${sp}`), 's04-site-page-signed-out');
            o.pageEn = await pub(page, app.url(`/index.php/index/en/${sp}`), 's05-site-page-en-signed-out');
            o.home = await pub(page, app.url('/index.php/index'), 's06-site-home');
            o.inJournal = await pub(page, P(A, `/${sp}`), 's07-site-path-in-a-journal');
            // restore: remove the site item
            await as(page, 'admin', 'index');
            await openNav(page, app, 'index');
            o.remove = await removeItem(page, 'Site page');
            o.gridAfter = await grids(page);
            await signOut(page);
            o.removed = await pub(page, app.url(`/index.php/index/${sp}`), 's08-site-page-removed');
            record('s00-site-summary', o);
            log(app.name, 'site window', JSON.stringify({boxes: o.window.boxes, bars: o.window.bars.map((b) => b.groups.flat().join(',')), tagMenu: o.tagMenu.items}));
            log(app.name, 'site preview', JSON.stringify(o.preview && {newTab: o.preview.newTab, click: o.preview.clickError, page: o.preview.page && short(o.preview.page), error: o.preview.error}));
            log(app.name, 'site save', JSON.stringify({notice: o.save.notice, open: o.save.windowOpen, content: o.content}));
            for (const k of ['page', 'pageEn', 'home', 'inJournal', 'removed']) log(app.name, 'site', k, JSON.stringify(short(o[k])));
            log(app.name, 'site restore', JSON.stringify(o.remove), 'items before', JSON.stringify(o.gridBefore.items.rows), 'after', JSON.stringify(o.gridAfter.items.rows));
        }

        // ------------------------------------------------------------ preview2
        if (on('preview2')) {
            const o = {};
            await as(page, U.bm, B);
            const addWindow = async (locale) => {
                await openNav(page, app, B, locale);
                const grid = page.locator('div.pkp_controllers_grid').filter({has: page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]')}).first();
                await grid.locator('.actions a').first().click();
                await itemWindow(page).locator('select[name="menuItemType"]').waitFor({timeout: T});
                await idle(page);
                await sleep(600);
                await itemWindow(page).locator('select[name="menuItemType"]').selectOption('NMI_TYPE_CUSTOM');
                await sleep(500);
            };
            const typeBoth = async (fr) => {
                const w = itemWindow(page);
                await w.locator('input[name="title[en]"]').fill('EN title');
                await w.locator('input[name="title[en]"]').click();
                await sleep(300);
                if (fr) await w.locator('input[name="title[fr_CA]"]').fill('FR titre');
                await pathBox(page).fill('preview-lang');
                const ids = await contentIds(page);
                await mceType(page, ids.en, 'EN text');
                await sleep(500);
                if (fr) await mceType(page, ids.fr, 'FR texte');
                await blurBoxes(page);
                return {en: await mceGet(page, ids.en), fr: await mceGet(page, ids.fr)};
            };
            const pressPreview = async (name) => {
                const btn = itemWindow(page).locator('#previewButton');
                const [popup] = await Promise.all([page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null), btn.click()]);
                const r = {label: (await btn.innerText()).trim(), newTab: !!popup};
                if (popup) {
                    await popup.waitForLoadState('load').catch(() => {});
                    await sleep(2500);
                    r.page = short(await readPublic(popup));
                    r.lang = await popup.evaluate(() => document.documentElement.lang).catch(() => null);
                    record(name, {...(await screen(popup).catch(() => ({}))), preview: r});
                    await shot(popup, name).catch(() => {});
                    await popup.close();
                }
                return r;
            };
            for (const [key, locale, fr] of [['enUiBoth', 'en', true], ['frUiBoth', 'fr_CA', true], ['frUiEnOnly', 'fr_CA', false]]) {
                o[key] = await step(`preview2 ${key}`, async () => {
                    await addWindow(locale);
                    const typed = await typeBoth(fr);
                    await snap(page, `q01-item-window-${key}`);
                    const r = await pressPreview(`q02-preview-${key}`);
                    // the window's back arrow reads "Fermer" in French
                    await itemWindow(page).getByRole('button', {name: /^(Close|Fermer)$/}).first().click();
                    await sleep(800);
                    return {typed, ...r};
                });
            }
            await page.goto(P(B, '/management/settings/website', 'en'));
            record('q00-preview2-summary', o);
            for (const k of Object.keys(o)) log(app.name, 'preview2', k, JSON.stringify(o[k]));
        }

        // ------------------------------------------------------------ forms
        if (on('forms')) {
            const o = {};
            await as(page, U.am, A);
            const readGrid = async () => page.locator('tr.gridRow').evaluateAll((rows) => rows.filter((r) => r.offsetParent !== null).map((r) => ({
                text: r.innerText.replace(/\s+/g, ' ').trim().slice(0, 60),
                boxes: [...r.querySelectorAll('input[type="checkbox"]')].map((b) => ({id: b.id.replace(/-[0-9a-f]{10,}$/, ''), checked: b.checked, disabled: b.disabled})),
            })));
            await page.goto(P(A, '/management/settings/website'));
            await idle(page);
            await page.locator('#setup-button').first().click();
            await idle(page);
            await page.getByRole('tab', {name: 'Languages', exact: true}).filter({visible: true}).first().click();
            await idle(page);
            await sleep(600);
            o.headers = await page.locator('table:visible th').allInnerTexts();
            o.before = await readGrid();
            await snap(page, 'f01-languages-arrival-A', {grid: o.before});
            const row = page.locator('tr.gridRow').filter({hasText: 'fr_CA'}).first();
            const formsBox = row.locator('input[type="checkbox"][id*="formLocale"]').first();
            await loc(page, 'Languages grid: the French row\'s "Forms" box', formsBox);
            const w = page.waitForResponse((r) => /manage-language-grid/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await formsBox.click({noWaitAfter: true});
            const resp = await w;
            o.tickStatus = resp ? resp.status() : null;
            await sleep(1500);
            await idle(page);
            o.after = await readGrid();
            await snap(page, 'f02-languages-french-forms-ticked-A', {grid: o.after, tickStatus: o.tickStatus});
            await openNav(page, app, A);
            await openItemWindow(page, 'add');
            await setType(page, 'Custom Page');
            await sleep(600);
            o.item = await itemBoxes(page);
            await snap(page, 'f03-item-window-after-french-forms-A', {boxes: o.item});
            await closeItemWindow(page);
            if (hasStatic(app)) {
                o.static = await step('forms static', async () => { const w2 = await openAddStatic(page, app, A); const b = (await windowBoxes(w2)).inputs.map((i) => i.name); await snap(page, 'f04-static-window-after-french-forms-A', {inputs: b}); return b; });
            }
            o.block = await step('forms block', async () => { const w3 = await openAddBlock(page, app, A); const b = (await windowBoxes(w3)).inputs.map((i) => i.name); await snap(page, 'f05-block-window-after-french-forms-A', {inputs: b}); return b; });
            record('f00-forms-summary', o);
            log(app.name, 'forms headers', JSON.stringify(o.headers), 'before', JSON.stringify(o.before.filter((r) => /en|fr_CA|English|Fran/i.test(r.text))), 'tick', o.tickStatus);
            log(app.name, 'forms after', JSON.stringify(o.after.filter((r) => /fr_CA|Fran/i.test(r.text))));
            log(app.name, 'forms boxes', JSON.stringify({item: o.item.title.map((t) => t.name).concat(o.item.content.map((c) => c.name)), static: o.static, block: o.block}));
        }
        if (bd.length) log(app.name, 'browser dialogs', JSON.stringify(bd));
    } finally {
        await close();
    }
});
