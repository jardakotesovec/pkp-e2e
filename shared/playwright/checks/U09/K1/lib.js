// U09 claim check K1: helpers copied from U08 K2 lib.js (the Navigation tab, the menu and
// item windows, the public header, the side menu, settings forms). Most are
// the K1 helpers (shared/playwright/checks/U08/K1/k1.js, k1-more.js), kept
// here so this chunk runs on its own.
const path = require('path');
const {screen, shot, record, idle, signIn, outDir} = require('../../../probe');

const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[k1]', ...a);
const flat1 = (t, n = 300) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

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

async function openNav(page, app, ctx, locale = '') {
    await page.goto('about:blank');
    if (ctx === 'index') {
        await page.goto(app.url('/index.php/index/admin/settings'));
        await idle(page);
        await page.locator('#setup-button').first().click();
        await page.locator('#nav-button').click();
    } else {
        await page.goto(ctxUrl(app, ctx, '/management/settings/website#setup/navigationMenus', locale));
    }
    await idle(page);
    await page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]').first().waitFor({timeout: T});
    await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor({timeout: T});
    await idle(page);
    await sleep(300);
}

const menusTable = (page) => page.locator('table[id^="component-grid-navigationmenus-navigationmenusgrid-"]:visible').first();
const itemsTable = (page) => page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]:visible').first();

/** Both tables as data: menu rows {title, items}, item titles, the empty text, the heading and links above each. */
async function grids(page) {
    const read = async (table, kind) => table.evaluate((t, kind) => {
        const rows = [...t.querySelectorAll('tr.gridRow')].map((tr) => {
            const cells = [...tr.querySelectorAll('td')].map((td) => { const c = td.cloneNode(true); c.querySelectorAll('a.show_extras, a.hide_extras, script').forEach((a) => a.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
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

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function gridRow(page, which, title) {
    const table = which === 'menus' ? menusTable(page) : itemsTable(page);
    return table.locator('tr.gridRow').filter({has: page.locator('td').first().filter({hasText: new RegExp(`^\\s*(Settings\\s*)?${esc(title)}\\s*$`)})}).first();
}

async function rowControls(page, which, title) {
    const row = gridRow(page, which, title);
    const id = await row.getAttribute('id', {timeout: T});
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

async function openMenu(page, title) {
    await menusTable(page).getByRole('link', {name: title, exact: true}).first().click();
    await waitMenuWindow(page);
}

/** Both panels as data: each item's title, level, icons. */
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

/** Drag an item by its handle onto a target (an item: top | center | bottom; or a panel: panel-end). */
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

/** Move an unassigned item into the assigned panel as a top-level item (before the first one); verified, one retry at the panel's end. */
async function assignTop(page, title) {
    const inAssigned = async () => (await panels(page)).assigned.items.some((i) => i.title === title && i.level === 0);
    const p = await panels(page);
    const tops = p.assigned.items.filter((i) => i.level === 0);
    if (!tops.length) await drag(page, 'unassigned', title, editor(page).locator('[data-cy="panel-content-assigned"]'), 'center');
    else await drag(page, 'unassigned', title, panelItem(page, 'assigned', tops[0].title), 'top');
    if (await inAssigned()) return true;
    await drag(page, 'unassigned', title, editor(page).locator('[data-cy="panel-content-assigned"]'), 'panel-end');
    return inAssigned();
}

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

// ---- the item window ----
const itemWindow = (page) => page.locator('[role="dialog"]:visible').filter({has: page.locator('form#navigationMenuItemsForm')}).first();
async function openItemWindow(page, how, title) {
    if (how === 'add') await page.getByRole('link', {name: 'Add item', exact: true}).click();
    else await rowAction(page, 'items', title, 'Edit');
    await itemWindow(page).locator('select[name="menuItemType"]').waitFor({timeout: T});
    await idle(page);
    await sleep(600);
}
async function itemState(page) {
    return itemWindow(page).evaluate((w) => {
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        const sel = w.querySelector('select[name="menuItemType"]');
        return {
            heading: w.querySelector('h1')?.innerText.trim() ?? null,
            type: sel ? sel.options[sel.selectedIndex]?.text : null,
            typeOptions: sel ? [...sel.options].map((o) => o.text) : null,
            typeLine: w.querySelector('#menuItemTypeSection .sub_label, #menuItemTypeSection label.sub_label')?.innerText.trim() ?? null,
            inputs: [...w.querySelectorAll('input[name], textarea[name], select[name]')].filter((e) => e.type !== 'hidden').map((e) => ({name: e.name, visible: vis(e), maxlength: e.getAttribute('maxlength'), value: (e.value || '').slice(0, 60)})),
            labels: [...w.querySelectorAll('label')].filter(vis).map((l) => l.innerText.trim()).filter(Boolean),
            errors: [...w.querySelectorAll('label.error, .pkp_form_error, #formErrors, [class*="error"]')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
            text: w.innerText.replace(/\s+/g, ' ').trim().slice(0, 1500),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}
async function itemSave(page) {
    const posts = [];
    const onResp = (r) => { if (/update-navigation-menu-item/.test(r.url())) posts.push({status: r.status()}); };
    page.on('response', onResp);
    await itemWindow(page).getByRole('button', {name: 'Save', exact: true}).click();
    const n = await notice(page, /successfully|not saved|error/i, 5000);
    await idle(page);
    await sleep(700);
    page.off('response', onResp);
    const open = await itemWindow(page).isVisible().catch(() => false);
    return {notice: n, windowOpen: open, posts, state: open ? await itemState(page) : null};
}
async function closeItemWindow(page) {
    if (!(await itemWindow(page).isVisible().catch(() => false))) return null;
    await itemWindow(page).getByRole('button', {name: 'Close', exact: true}).click();
    await sleep(600);
    const d = await dialogs(page);
    const w = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'});
    if (await w.count()) { await w.getByRole('button', {name: 'Yes', exact: true}).click(); await sleep(400); }
    return d;
}
const setType = async (page, label) => { await itemWindow(page).locator('select[name="menuItemType"]').selectOption({label}); await sleep(400); };
const fillTitle = (page, v, loc = 'en') => itemWindow(page).locator(`input[name="title[${loc}]"]`).fill(v);

/** Add an item through "Add item" and save it; returns the save result. */
async function addItem(page, title, type, extra = {}) {
    await openItemWindow(page, 'add');
    await fillTitle(page, title);
    await setType(page, type);
    if (extra.url) await itemWindow(page).locator('input[name="remoteUrl[en]"]').fill(extra.url);
    if (extra.path) await itemWindow(page).locator('input[name="path"]').fill(extra.path);
    const r = await itemSave(page);
    if (r.windowOpen) await closeItemWindow(page);
    return r;
}

// ---- the public header ----
async function header(page, app, ctx, locale = '') {
    const resp = await page.goto(ctx === 'index' ? app.url(`/index.php/index${locale ? '/' + locale : ''}`) : ctxUrl(app, ctx, '', locale));
    await idle(page);
    const served = resp ? await resp.text().catch(() => '') : '';
    const dom = await page.evaluate(() => {
        const tree = (ul) => (ul ? [...ul.children].filter((li) => li.tagName === 'LI').map((li) => {
            const a = li.querySelector(':scope > a');
            const sub = li.querySelector(':scope > ul');
            const o = {title: a ? a.textContent.replace(/\s+/g, ' ').trim() : null, href: a ? a.getAttribute('href') : null};
            if (sub) o.children = tree(sub);
            return o;
        }) : null);
        return {url: location.href, primary: tree(document.querySelector('#navigationPrimary')), user: tree(document.querySelector('#navigationUser'))};
    });
    // the served HTML's hrefs (the theme script rewrites a parent item's href to "#")
    const servedHrefs = [...served.matchAll(/<a[^>]+href="([^"]*)"[^>]*>\s*([^<]{1,80}?)\s*<\/a>/g)].map((m) => ({href: m[1], text: m[2].trim()}));
    dom.servedHrefs = servedHrefs;
    return dom;
}
const flat = (tree) => (tree ? tree.map((n) => n.title + (n.children ? ` > [${n.children.map((c) => c.title + (c.children ? ` > [${c.children.map((d) => d.title).join(', ')}]` : '')).join(', ')}]` : '')) : null);
const hflat = (h) => ({primary: flat(h.primary), user: flat(h.user)});

// ---- the side menu (PrimeVue panelmenu), read without clicking (U07 K1) ----
async function readNav(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    if (!(await nav.count().catch(() => 0))) return {present: false, groups: [], groupLabels: []};
    const groups = await nav.locator('[role="button"][aria-controls]').evaluateAll((els) => els.map((e) => {
        const region = document.getElementById(e.getAttribute('aria-controls') || '');
        return {
            label: e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim(),
            items: region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => li.getAttribute('aria-label') || li.textContent.replace(/\s+/g, ' ').trim()) : [],
        };
    })).catch(() => []);
    return {present: true, groups, groupLabels: groups.map((g) => `${g.label}${g.items.length ? ' › ' + g.items.join(', ') : ''}`)};
}
async function sideMenu(page, app, ctx) {
    await page.goto(ctxUrl(app, ctx, '/submissions'));
    await idle(page);
    await sleep(500);
    return readNav(page);
}

// ---- settings forms ----
async function openSettings(page, app, ctx, section, top, side) {
    await page.goto('about:blank');
    await page.goto(ctxUrl(app, ctx, `/management/settings/${section}`));
    await idle(page);
    if (top) { await page.locator(`[id="${top}-button"]`).first().click(); await idle(page); await sleep(400); }
    if (side) { await page.getByRole('tab', {name: side, exact: true}).filter({visible: true}).first().click(); await idle(page); await sleep(500); }
}
async function saveForm(page, field) {
    const form = page.locator('form').filter({has: typeof field === 'string' ? page.locator(field) : field}).first();
    const save = form.getByRole('button', {name: 'Save', exact: true});
    const out = {requests: []};
    const onResp = (r) => { if (/\/api\/v1\/(contexts|site)/.test(r.url()) && r.request().method() !== 'GET') out.requests.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '')}); };
    page.on('response', onResp);
    await save.click({timeout: 10_000}).catch((e) => { out.clickError = e.message.slice(0, 120); });
    const start = Date.now();
    const seen = new Set();
    while (Date.now() - start < 7_000) {
        for (const t of (await page.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean)) seen.add(t);
        if (seen.has('Saved') && out.requests.length) break;
        await sleep(300);
    }
    out.statuses = [...seen];
    out.fieldErrors = await form.locator('.pkpFieldError, .pkpFormField__error').allInnerTexts().catch(() => []);
    out.formErrors = await page.locator('.pkpFormErrors, .pkpFormPage__errors, [role="alert"]').allInnerTexts().catch(() => []);
    page.off('response', onResp);
    return out;
}
async function waitMce(page, id) {
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T});
}
async function mceSet(page, id, text) {
    await waitMce(page, id);
    const body = page.frameLocator(`[id="${id}_ifr"]`).locator('body');
    await body.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    if (text) await page.keyboard.type(text);
    await sleep(300);
    return page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null);
}
async function visibleBoxes(page) {
    return page.locator('[role="tabpanel"]:visible input[type="checkbox"], [role="tabpanel"]:visible input[type="radio"]').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => ({name: e.name, value: e.value, checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 140)})));
}

module.exports = {T, sleep, log, flat1, ctxUrl, snap, as, watchDialogs, openNav, menusTable, itemsTable, grids, gridRow, rowControls, rowAction, editor, menuWindow, waitMenuWindow, openMenu, panels, brief, panelItem, drag, assignTop, dialogs, notice, pressWindowButton, saveMenu, itemWindow, openItemWindow, itemState, itemSave, closeItemWindow, setType, fillTitle, addItem, header, flat, hflat, readNav, sideMenu, openSettings, saveForm, waitMce, mceSet, visibleBoxes, outDir, path};
