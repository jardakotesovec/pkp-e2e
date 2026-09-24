// U08 claim check, chunk K2: the items. The "Navigation Menu Items" table,
// the item window, where each item type leads and when it shows, and the
// settings that show or hide items and side-menu entries.
// Spec: docs/specs/U08-navigation-menus-and-site-chrome.md, lines 216–254
// (Rules 10–14), 432–519 (Side effects, Settings 1–18), register A5, A6;
// footnotes b, g, h, i, k, l, m, o, p, r, s, v, x, td5, td10, td11, td12,
// f-a5, f-a6.
//
// Seeds per app through POST scenarios/context (state file k2-state-<app>.json
// in the output folder; RESEED=1 makes new ones):
//   B  Rule 10, Rule 11, side effects. Users mgr, ed (editor), pe
//      (productionEditor), rd (reader); OPS: mgr, rd
//   D  Rule 13, td10 (2)(3). Users mgr
//   C  Rule 14a/14b, td12, A5, A6, Settings 1. Users mgr
//   L  Rule 12, td11, Settings 12–13 (en + fr_CA as UI and Forms). Users mgr
//   S  Settings 2–9, 15–18. Users mgr, rd
//   P  Settings 11 (Permit changes to Settings). Users mgr, ed / mgr2 (OPS)
//   L2 (made by lang2) French as a UI language only, then ticked under "Forms"
// Phases (PHASES=a,b; default: seed items edit delete cond lang lang2 flips
//   permit depth site; opt-in: posting inst pktypes notice). RESEED_KEYS=C,D
//   makes fresh contexts for the phases that consume theirs (edit B, delete D,
//   cond C, flips S, permit P).
//   site and inst change the SITE: the site's "Enable institutional
//   statistics" is ticked and unticked again, and the site item "Login" is
//   renamed and named back (it keeps a typed English title "Login").
// Run: PROBE_FEATURE=U08 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U08/K2/k2.js
// (a full run passes 600 s: run one app per process, or a few phases at a time)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signOut, record, loc, note, idle, tag, outDir} = require('../../../probe');
const H = require('./lib');
const {T, sleep, log, flat1, ctxUrl, snap, as, watchDialogs, openNav, grids, rowControls, rowAction, editor, menuWindow, openMenu, panels, brief, panelItem, drag, assignTop, dialogs, notice, pressWindowButton, saveMenu, itemWindow, openItemWindow, itemState, itemSave, closeItemWindow, setType, fillTitle, addItem, header, flat, hflat, readNav, sideMenu, openSettings, saveForm, mceSet, visibleBoxes} = H;

const ALL = ['seed', 'items', 'edit', 'delete', 'cond', 'lang', 'lang2', 'flips', 'permit', 'depth', 'site'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const archivesLike = (app) => (app.name === 'omp' ? 'Catalog' : 'Archives');

/** Remove a table row through its "Remove" and answer the confirmation. */
async function removeRow(page, which, title, answer) {
    await rowAction(page, which, title, 'Remove');
    await sleep(600);
    const d = await dialogs(page);
    const cd = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible, [data-cy="dialog"]:visible').filter({hasText: /Are you sure/}).last();
    const btn = cd.getByRole('button', {name: answer, exact: true}).or(cd.getByRole('link', {name: answer, exact: true})).first();
    await btn.click();
    const n = answer === 'OK' ? await notice(page, /successfully removed/, 6000) : null;
    await idle(page);
    await sleep(700);
    return {dialogs: d, notice: n, dialogsAfter: await dialogs(page)};
}

/** Press every icon in both panels of the open menu window; the notice each opens. */
async function pressIcons(page, name) {
    const p = await panels(page);
    const out = [];
    let first = true;
    for (const panel of ['assigned', 'unassigned']) {
        for (const it of p[panel].items) {
            for (const [k, ic] of it.icons.entries()) {
                const btn = panelItem(page, panel, it.title).locator('button[title]').nth(k);
                await btn.click();
                await sleep(400);
                const d = await dialogs(page);
                const top = d[d.length - 1];
                out.push({item: it.title, panel, kind: ic.kind, iconTitle: ic.title, notice: top ? {name: top.name, text: top.text, buttons: top.buttons} : null});
                if (first) { await snap(page, name, {d}); first = false; }
                const ok = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().getByRole('button', {name: 'OK', exact: true});
                if (await ok.count()) await ok.click(); else await page.keyboard.press('Escape');
                await sleep(300);
            }
        }
    }
    return out;
}

/** The editorial header's text on the dashboard (the notifications/tasks count lives there). */
async function editorialHeader(page, app, ctx) {
    await page.goto(ctxUrl(app, ctx, '/submissions'));
    await idle(page);
    await sleep(500);
    return page.evaluate(() => {
        const h = document.querySelector('header, .app__header, [class*="app__header"]');
        return h ? h.innerText.replace(/\s+/g, ' ').trim() : null;
    });
}

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs';
    const isOps = app.name === 'ops';
    let S = fs.existsSync(stateFile(app)) && !process.env.RESEED ? JSON.parse(fs.readFileSync(stateFile(app))) : null;

    // ---- seed ----
    if (!S || on('reseed')) {
        const roleOf = {mgr: 'manager', mgr2: 'manager', ed: 'editor', pe: 'productionEditor', rd: 'reader', se: 'sectionEditor'};
        const mk = async (prefix, users, extra = {}) => {
            const t = tag(prefix);
            await app.api.createContext({tag: t, users: users.map((u) => ({username: `${t}${u}`, roles: [roleOf[u]]})), ...extra});
            return {path: t, users: Object.fromEntries(users.map((u) => [u, `${t}${u}`]))};
        };
        S = {
            B: await mk('u08k2b', isOps ? ['mgr', 'rd', 'se'] : ['mgr', 'ed', 'pe', 'rd', 'se']),
            D: await mk('u08k2d', ['mgr']),
            C: await mk('u08k2c', ['mgr', 'rd']),
            L: await mk('u08k2l', ['mgr'], {context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}}),
            S: await mk('u08k2s', ['mgr', 'rd']),
            P: await mk('u08k2p', isOps ? ['mgr', 'mgr2'] : ['mgr', 'ed', 'pe']),
        };
        fs.writeFileSync(stateFile(app), JSON.stringify(S, null, 1));
        log(app.name, 'seeded', JSON.stringify(S));
    }
    // RESEED_KEYS=D,C: fresh contexts for those keys only (a phase that consumed its context)
    if (process.env.RESEED_KEYS) {
        const roleOf = {mgr: 'manager', mgr2: 'manager', ed: 'editor', pe: 'productionEditor', rd: 'reader', se: 'sectionEditor'};
        for (const k of process.env.RESEED_KEYS.split(',')) {
            const users = Object.keys(S[k].users);
            const t = tag(`u08k2${k.toLowerCase()}`);
            const extra = k === 'L' ? {context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}} : {};
            await app.api.createContext({tag: t, users: users.map((u) => ({username: `${t}${u}`, roles: [roleOf[u]]})), ...extra});
            S[k] = {path: t, users: Object.fromEntries(users.map((u) => [u, `${t}${u}`]))};
        }
        fs.writeFileSync(stateFile(app), JSON.stringify(S, null, 1));
        log(app.name, 'reseeded', process.env.RESEED_KEYS, JSON.stringify(S));
    }
    const {B, D, C, L, P} = S;
    const SS = S.S;

    // ---- items: Rule 10, td5 (the items table per viewer, against the header they see) ----
    if (on('items')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            // the seeded journal, read only, English and French
            await as(page, 'manager.maya', 'publicknowledge');
            await openNav(page, app, 'publicknowledge', 'en');
            out.pk = await grids(page);
            await snap(page, 'i0-pk-tables-en', {g: out.pk});
            await loc(page, 'Navigation tab: the "Navigation Menu Items" table', H.itemsTable(page));
            out.pkRowControls = await rowControls(page, 'items', 'Search');
            await snap(page, 'i0b-pk-item-row-controls', {c: out.pkRowControls});
            out.pkRowToggle = await H.gridRow(page, 'items', 'Search').locator('a.show_extras, a.hide_extras').first().evaluate((a) => ({text: a.innerText.trim(), title: a.title, aria: a.getAttribute('aria-label')})).catch(() => null);
            out.pkHeaderEn = hflat(await header(page, app, 'publicknowledge', 'en'));
            await openNav(page, app, 'publicknowledge', 'fr_CA');
            out.pkFr = await grids(page);
            await snap(page, 'i1-pk-tables-fr', {g: out.pkFr});
            out.pkHeaderFr = hflat(await header(page, app, 'publicknowledge', 'fr_CA'));
            await page.goto(ctxUrl(app, 'publicknowledge', '', 'en'));
            await signOut(page).catch(() => {});
            // B as each manager-level user
            for (const who of Object.keys(B.users).filter((u) => ['mgr', 'ed', 'pe'].includes(u))) {
                await as(page, B.users[who], B.path);
                await openNav(page, app, B.path);
                out[`B-${who}`] = await grids(page);
                await snap(page, `i2-b-tables-${who}`, {g: out[`B-${who}`]});
                out[`B-${who}-header`] = hflat(await header(page, app, B.path));
            }
            await signOut(page).catch(() => {});
            record('i9-items-summary', out);
            log(app.name, 'pk items en', JSON.stringify(out.pk.items.rows), 'menus', JSON.stringify(out.pk.menus.rows));
            log(app.name, 'pk items fr', JSON.stringify(out.pkFr.items.rows), 'menus', JSON.stringify(out.pkFr.menus.rows));
            log(app.name, 'pk header en', JSON.stringify(out.pkHeaderEn), 'fr', JSON.stringify(out.pkHeaderFr));
            log(app.name, 'pk row controls', JSON.stringify(out.pkRowControls), JSON.stringify(out.pkRowToggle));
            for (const who of ['mgr', 'ed', 'pe']) if (out[`B-${who}`]) log(app.name, 'B', who, JSON.stringify(out[`B-${who}`].items.rows), JSON.stringify(out[`B-${who}`].menus.rows), 'header', JSON.stringify(out[`B-${who}-header`]));
        } finally { await close(); }
    }

    // ---- edit: Rule 11, td10 (1), side effects ----
    if (on('edit')) {
        const {page, close} = await launch(app);
        const bd = watchDialogs(page);
        try {
            const out = {};
            const mgrMail = `${B.users.mgr}@mail.test`;
            out.mailBefore = await app.mail.count({to: mgrMail}).catch((e) => 'err ' + e.message);
            out.headerOutBefore = hflat(await header(page, app, B.path));
            await as(page, B.users.mgr, B.path);
            out.editorialBefore = await editorialHeader(page, app, B.path);
            await snap(page, 'e0-b-dashboard-before');
            await openNav(page, app, B.path);
            out.gridsBefore = await grids(page);
            // add an item
            await openItemWindow(page, 'add');
            out.addOpened = await itemState(page);
            await snap(page, 'e1-b-add-item-window', out.addOpened);
            await fillTitle(page, 'K2 link');
            await setType(page, 'Remote URL');
            await itemWindow(page).locator('input[name="remoteUrl[en]"]').fill('https://pkp.sfu.ca/k2');
            out.addSave = await itemSave(page);
            await snap(page, 'e2-b-add-item-saved', out.addSave);
            out.gridsAfterAdd = await grids(page);
            // the new item in each menu's window
            await openNav(page, app, B.path);
            for (const m of ['Primary Navigation Menu', 'User Navigation Menu']) {
                await openMenu(page, m);
                out[`panels-${m}`] = brief(await panels(page));
                await snap(page, `e3-b-window-${m.split(' ')[0].toLowerCase()}-new-item`, {p: out[`panels-${m}`]});
                await pressWindowButton(page, 'Cancel');
                await openNav(page, app, B.path);
            }
            // K2 link and Contact into the user menu, K2 link into the primary menu
            await openMenu(page, 'User Navigation Menu');
            await assignTop(page, 'K2 link');
            await assignTop(page, 'Contact');
            out.userArranged = brief(await panels(page));
            out.userSave = await saveMenu(page);
            await openNav(page, app, B.path);
            await openMenu(page, 'Primary Navigation Menu');
            await assignTop(page, 'K2 link');
            out.primaryArranged = brief(await panels(page));
            out.primarySave = await saveMenu(page);
            out.headerInPlaced = hflat(await header(page, app, B.path));
            // rename Contact (td10 1), change K2 link's address
            await openNav(page, app, B.path);
            await openItemWindow(page, 'edit', 'Contact');
            out.contactOpened = await itemState(page);
            await snap(page, 'e4-b-edit-contact-window', out.contactOpened);
            await fillTitle(page, 'Reach us');
            out.renameSave = await itemSave(page);
            await snap(page, 'e5-b-contact-renamed', out.renameSave);
            out.gridsAfterRename = await grids(page);
            await openItemWindow(page, 'edit', 'K2 link');
            await itemWindow(page).locator('input[name="remoteUrl[en]"]').fill('https://example.org/k2b');
            out.urlSave = await itemSave(page);
            // an item window left with a change unsaved (sweep)
            await openNav(page, app, B.path);
            await openItemWindow(page, 'edit', 'Search');
            await fillTitle(page, 'Search changed');
            bd.step = 'item window close with change';
            await itemWindow(page).getByRole('button', {name: 'Close', exact: true}).click();
            await sleep(700);
            out.leaveChanged = await dialogs(page);
            await snap(page, 'e6-b-item-window-leave-changed', {d: out.leaveChanged});
            const yes = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'}).getByRole('button', {name: 'Yes', exact: true});
            if (await yes.count()) { await yes.click(); await sleep(500); }
            out.afterLeave = await dialogs(page);
            await openNav(page, app, B.path);
            out.gridsAfterLeave = await grids(page);
            // the header after the rename, signed in and signed out
            const hin = await header(page, app, B.path);
            out.headerInAfter = hflat(hin);
            out.k2HrefIn = hin.servedHrefs.filter((h) => /K2 link/.test(h.text));
            await snap(page, 'e7-b-header-signed-in-after');
            out.editorialAfter = await editorialHeader(page, app, B.path);
            await snap(page, 'e8-b-dashboard-after');
            await signOut(page).catch(() => {});
            const hout = await header(page, app, B.path);
            out.headerOutAfter = hflat(hout);
            out.k2HrefOut = hout.servedHrefs.filter((h) => /K2 link/.test(h.text));
            await snap(page, 'e9-b-header-signed-out-after');
            // a reader signed in
            await as(page, B.users.rd, B.path);
            out.headerReader = hflat(await header(page, app, B.path));
            await signOut(page).catch(() => {});
            await sleep(2000);
            out.mailAfter = await app.mail.count({to: mgrMail}).catch((e) => 'err ' + e.message);
            out.browserDialogs = bd;
            record('e9-edit-summary', out);
            log(app.name, 'edit', JSON.stringify({addOpened: {heading: out.addOpened.heading, typeLine: out.addOpened.typeLine}, addSave: {n: out.addSave.notice, open: out.addSave.windowOpen, posts: out.addSave.posts}, itemsAfterAdd: out.gridsAfterAdd.items.rows, primary: out['panels-Primary Navigation Menu'], user: out['panels-User Navigation Menu']}));
            log(app.name, 'edit placed', JSON.stringify({userSave: out.userSave, primarySave: out.primarySave, userArranged: out.userArranged, primaryArranged: out.primaryArranged, headerInPlaced: out.headerInPlaced}));
            log(app.name, 'edit rename', JSON.stringify({contact: {heading: out.contactOpened.heading, typeLine: out.contactOpened.typeLine, type: out.contactOpened.type}, rename: {n: out.renameSave.notice, open: out.renameSave.windowOpen}, url: {n: out.urlSave.notice, open: out.urlSave.windowOpen}, itemsAfterRename: out.gridsAfterRename.items.rows, menusAfterRename: out.gridsAfterRename.menus.rows}));
            log(app.name, 'edit leave', JSON.stringify({leave: out.leaveChanged.map((d) => d.name + ': ' + d.text.slice(0, 150) + ' ' + d.buttons.join('/')), after: out.afterLeave.map((d) => d.name), browserDialogs: bd, searchStill: out.gridsAfterLeave.items.rows.includes('Search')}));
            log(app.name, 'edit header', JSON.stringify({outBefore: out.headerOutBefore, inAfter: out.headerInAfter, outAfter: out.headerOutAfter, reader: out.headerReader, k2In: out.k2HrefIn, k2Out: out.k2HrefOut}));
            log(app.name, 'edit side effects', JSON.stringify({mailBefore: out.mailBefore, mailAfter: out.mailAfter, edBefore: out.editorialBefore, edAfter: out.editorialAfter}));
        } finally { await close(); }
    }

    // ---- delete: Rule 13, td10 (2) and (3) ----
    if (on('delete')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await as(page, D.users.mgr, D.path);
            // About also in the user menu (an item in two menus)
            await openNav(page, app, D.path);
            await openMenu(page, 'User Navigation Menu');
            await assignTop(page, 'About');
            out.userArranged = brief(await panels(page));
            out.userSave = await saveMenu(page);
            out.headerIn0 = hflat(await header(page, app, D.path));
            await signOut(page).catch(() => {});
            out.headerOut0 = hflat(await header(page, app, D.path));
            await as(page, D.users.mgr, D.path);
            // Remove › Cancel, then Remove › OK
            await openNav(page, app, D.path);
            out.cancel = await removeRow(page, 'items', 'About', 'Cancel');
            await snap(page, 'd0-d-remove-about-cancelled', out.cancel);
            out.gridsAfterCancel = await grids(page);
            out.ok = await removeRow(page, 'items', 'About', 'OK');
            await snap(page, 'd1-d-remove-about-ok', out.ok);
            out.gridsAfterOk = await grids(page);
            await openNav(page, app, D.path);
            out.gridsAfterOkReload = await grids(page);
            out.headerIn1 = hflat(await header(page, app, D.path));
            await snap(page, 'd2-d-header-in-after-about');
            await signOut(page).catch(() => {});
            out.headerOut1 = hflat(await header(page, app, D.path));
            await snap(page, 'd3-d-header-out-after-about');
            await as(page, D.users.mgr, D.path);
            await openNav(page, app, D.path);
            for (const m of ['Primary Navigation Menu', 'User Navigation Menu']) {
                await openMenu(page, m);
                out[`after-${m}`] = brief(await panels(page));
                await snap(page, `d4-d-window-${m.split(' ')[0].toLowerCase()}-after-about`, {p: out[`after-${m}`]});
                await pressWindowButton(page, 'Cancel');
                await openNav(page, app, D.path);
            }
            // td10 (3): remove the primary menu
            out.menuOk = await removeRow(page, 'menus', 'Primary Navigation Menu', 'OK');
            await snap(page, 'd5-d-remove-primary-menu', out.menuOk);
            out.gridsAfterMenu = await grids(page);
            out.headerIn2 = hflat(await header(page, app, D.path));
            await signOut(page).catch(() => {});
            out.headerOut2 = hflat(await header(page, app, D.path));
            await snap(page, 'd6-d-header-out-after-menu');
            record('d9-delete-summary', out);
            log(app.name, 'delete setup', JSON.stringify({userSave: out.userSave, userArranged: out.userArranged, in0: out.headerIn0, out0: out.headerOut0}));
            log(app.name, 'delete cancel', JSON.stringify({d: out.cancel.dialogs.map((d) => ({n: d.name, t: d.text.slice(0, 200), b: d.buttons})), stillThere: out.gridsAfterCancel.items.rows.includes('About')}));
            log(app.name, 'delete ok', JSON.stringify({n: out.ok.notice, items: out.gridsAfterOk.items.rows, menus: out.gridsAfterOk.menus.rows, menusReload: out.gridsAfterOkReload.menus.rows, in1: out.headerIn1, out1: out.headerOut1, primary: out['after-Primary Navigation Menu'], user: out['after-User Navigation Menu']}));
            log(app.name, 'delete menu', JSON.stringify({d: out.menuOk.dialogs.map((d) => ({n: d.name, t: d.text.slice(0, 200), b: d.buttons})), n: out.menuOk.notice, menus: out.gridsAfterMenu.menus.rows, items: out.gridsAfterMenu.items.rows, in2: out.headerIn2, out2: out.headerOut2}));
        } finally { await close(); }
    }

    // ---- cond: Rule 14a/14b, td12, A5, A6, Settings bullet 1 ----
    if (on('cond')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            // signed-out header and the About page before anything (warms the signed-out cache)
            out.headerOut0 = hflat(await header(page, app, C.path));
            await page.goto(ctxUrl(app, C.path, '/about'));
            await idle(page);
            out.aboutPage0 = {url: page.url(), text: flat1(await page.locator('.pkp_structure_main').first().innerText().catch(() => ''), 600)};
            await snap(page, 'c0-c-about-page-empty', out.aboutPage0);
            await as(page, C.users.mgr, C.path);
            out.nav0 = (await sideMenu(page, app, C.path)).groupLabels;
            await snap(page, 'c0b-c-side-menu-announcements-off');
            // td12: the Announcements item's window
            await openNav(page, app, C.path);
            await openItemWindow(page, 'edit', 'Announcements');
            out.annWindow = await itemState(page);
            await snap(page, 'c1-c-announcements-item-window', out.annWindow);
            await closeItemWindow(page);
            // every type's line under the list (Rule 14b "description only")
            await openNav(page, app, C.path);
            await openItemWindow(page, 'add');
            const types = (await itemState(page)).typeOptions;
            out.typeLines = {};
            out.typeLines['Choose a type...'] = (await itemState(page)).typeLine;
            for (const t of types.slice(1)) { await setType(page, t); out.typeLines[t] = (await itemState(page)).typeLine; }
            await snap(page, 'c1b-c-add-item-type-lines', {typeLines: out.typeLines});
            await closeItemWindow(page);
            // sweep: the item window closed untouched, from "Add item" and from "Edit"
            const bdC = watchDialogs(page);
            for (const how of ['add', 'edit']) {
                await openNav(page, app, C.path);
                bdC.step = `close untouched ${how}`;
                await openItemWindow(page, how, 'Search');
                await itemWindow(page).getByRole('button', {name: 'Close', exact: true}).click();
                await sleep(800);
                out[`closeUntouched-${how}`] = {pageDialogs: await dialogs(page), windowOpen: await itemWindow(page).isVisible().catch(() => false)};
            }
            out.closeUntouchedBrowser = bdC.slice();
            // the menu window's notices (td12, A5, A6)
            await openNav(page, app, C.path);
            await openMenu(page, 'Primary Navigation Menu');
            out.primaryIcons = await pressIcons(page, 'c2-c-primary-notice');
            await pressWindowButton(page, 'Cancel');
            await openNav(page, app, C.path);
            await openMenu(page, 'User Navigation Menu');
            out.userIcons = await pressIcons(page, 'c3-c-user-notice');
            await pressWindowButton(page, 'Cancel');
            // 14a: Search under Announcements; a new parent with Login alone under it
            await openNav(page, app, C.path);
            out.addParent = await addItem(page, 'K2 parent', 'Remote URL', {url: 'https://pkp.sfu.ca/k2parent'});
            await openNav(page, app, C.path);
            await openMenu(page, 'Primary Navigation Menu');
            await drag(page, 'unassigned', 'Search', panelItem(page, 'assigned', 'Announcements'), 'center');
            await assignTop(page, 'K2 parent');
            await drag(page, 'unassigned', 'Login', panelItem(page, 'assigned', 'K2 parent'), 'center');
            out.arranged = brief(await panels(page));
            await snap(page, 'c4-c-primary-arranged', {p: out.arranged});
            out.arrangeSave = await saveMenu(page);
            const hin = await header(page, app, C.path);
            out.headerIn1 = {tree: hin.primary, served: hin.servedHrefs.filter((h) => /K2 parent|Search|Announce|Login/.test(h.text))};
            await snap(page, 'c5-c-header-in-announcements-off');
            await signOut(page).catch(() => {});
            const hout = await header(page, app, C.path);
            out.headerOut1 = {tree: hout.primary, served: hout.servedHrefs.filter((h) => /K2 parent|Search|Announce|Login/.test(h.text))};
            await snap(page, 'c6-c-header-out-announcements-off');
            // Settings bullet 1: announcements on
            await as(page, C.users.mgr, C.path);
            await openSettings(page, app, C.path, 'website', 'setup', null);
            await page.locator('[id="announcements-button"]').first().click();
            await idle(page); await sleep(500);
            await snap(page, 'c7-c-announcements-tab');
            out.annBoxes = await visibleBoxes(page);
            await page.locator('input[name="enableAnnouncements"]').first().check({force: true});
            out.annSave = await saveForm(page, 'input[name="enableAnnouncements"]');
            out.nav1 = (await sideMenu(page, app, C.path)).groupLabels;
            await snap(page, 'c8-c-side-menu-announcements-on');
            const hin2 = await header(page, app, C.path);
            out.headerIn2 = {tree: hin2.primary};
            await snap(page, 'c9-c-header-in-announcements-on');
            await openNav(page, app, C.path);
            await openItemWindow(page, 'edit', 'Announcements');
            out.annWindowOn = (await itemState(page)).typeLine;
            await closeItemWindow(page);
            await signOut(page).catch(() => {});
            const hout2 = await header(page, app, C.path);
            out.headerOut2 = {tree: hout2.primary};
            await snap(page, 'ca-c-header-out-announcements-on');
            // A5: the About item with "About the Journal" filled
            await as(page, C.users.mgr, C.path);
            await openSettings(page, app, C.path, 'context', 'masthead', null);
            const aboutEd = await page.evaluate(() => (window.tinymce ? window.tinymce.get().map((e) => e.id) : []));
            out.mastheadEditors = aboutEd;
            const aboutId = aboutEd.find((id) => /about/i.test(id) && /-en$/.test(id)) || aboutEd.find((id) => /about/i.test(id));
            if (aboutId) {
                await page.locator('[id^="masthead-acronym-control"]').first().fill('K2C').catch(() => {});
                await page.locator('#masthead-country-control').selectOption({label: 'Canada'}).catch(() => {});
                await mceSet(page, aboutId, 'K2 about text');
                out.aboutSave = await saveForm(page, `[id="${aboutId}"]`);
            }
            await signOut(page).catch(() => {});
            out.headerOut3 = hflat(await header(page, app, C.path));
            await page.goto(ctxUrl(app, C.path, '/about'));
            await idle(page);
            out.aboutPage1 = {url: page.url(), text: flat1(await page.locator('.pkp_structure_main').first().innerText().catch(() => ''), 600)};
            await snap(page, 'cb-c-about-page-filled', out.aboutPage1);
            record('c9-cond-summary', out);
            log(app.name, 'cond close untouched', JSON.stringify({add: out['closeUntouched-add'], edit: out['closeUntouched-edit'], browser: out.closeUntouchedBrowser}));
            log(app.name, 'cond td12', JSON.stringify({line: out.annWindow.typeLine, type: out.annWindow.type, heading: out.annWindow.heading, lineOn: out.annWindowOn}));
            for (const [k, v] of Object.entries(out.typeLines)) log(app.name, 'type line', k, '|', v);
            for (const i of [...out.primaryIcons, ...out.userIcons]) log(app.name, 'icon', i.panel, i.item, i.kind, JSON.stringify(i.iconTitle), '→', JSON.stringify(i.notice));
            log(app.name, 'cond 14a', JSON.stringify({addParent: out.addParent.notice, arranged: out.arranged, save: out.arrangeSave, in1: out.headerIn1, out1: out.headerOut1}));
            log(app.name, 'cond ann', JSON.stringify({boxes: out.annBoxes, save: out.annSave, nav0: out.nav0, nav1: out.nav1, in2: flat(out.headerIn2.tree), out2: flat(out.headerOut2.tree), out0: out.headerOut0}));
            log(app.name, 'cond A5', JSON.stringify({about0: out.aboutPage0, eds: out.mastheadEditors, save: out.aboutSave, out3: out.headerOut3, about1: out.aboutPage1}));
        } finally { await close(); }
    }

    if (on('lang') || on('lang2') || on('posting') || on('inst') || on('pktypes') || on('notice') || on('closeask') || on('flips') || on('permit') || on('depth') || on('site')) {
        await require('./k2-more.js')({app, S, on, isOjs, isOps, removeRow, pressIcons, editorialHeader, archivesLike});
    }
});
