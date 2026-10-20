// PR review of pkp/pkp-lib#13521 round 2 (head f37a174626): Site Settings › "Navigation Menus"
// gates its menus grid at the head, but the grid's "Add Menu" and a menu's "Edit" open a Vue modal
// (NavigationMenuManagerFormModal, pkp-lib#12177) that loads and saves through
// `index/api/v1/navigationMenus` (PKPNavigationMenuController), which adds no
// ReauthenticationRequiredPolicy. On PKP's default dataset, `[security] password_timeout = 1`:
//   1. admin: Site Settings (Confirm Access, the password); the site's menu ids from the menus grid
//   2. two minutes untouched (twice the window)
//   3. from the same page, as the modal sends them: GET navigationMenus/items (what the modal loads
//      first; a 500 on main at the site level, so the screen's modal does not open there today),
//      POST navigationMenus (Title `r2 Menu`, "Add Menu" › "Save") and PUT navigationMenus/<the
//      site's menu> (Title `r2 Renamed`, "Edit" › "Save"); the menus grid's fetch, for comparison
//      (gated at the head)
//   4. Site Settings again (Confirm Access, the password): POST navigationMenus `r2 Menu
//      Reconfirmed` (the control: goes through inside the period); the menus grid's rows
//   Reset first: npm run fleet-prep -- --feature <feature> --dataset 1 --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=<base|head> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13521/navmenu-api.js
// Facts: .reports/<feature>/<agent>/navmenu-<app>.json
const {forEachApp, launch, signIn, record} = require('../../../probe');
const L = require('../../issues/admin-changes-skip-confirm-access/lib.js');

const SETTINGS = '/index.php/index/en/admin/settings';
const API = '/index.php/index/api/v1/navigationMenus';
const GRID = '/index.php/index/$$$call$$$/grid/navigation-menus/navigation-menus-grid/fetch-grid';

/** Send one request from the open page, with its cookies and CSRF token. */
function send(page, url, method = 'GET', json = null) {
    return page.evaluate(
        async ({url, method, json}) => {
            const headers = {'X-Csrf-Token': pkp.currentUser.csrfToken};
            if (json) headers['Content-Type'] = 'application/json';
            const r = await fetch(url, {method, headers, body: json ? JSON.stringify(json) : undefined});
            const text = await r.text();
            let j = null;
            try {
                j = JSON.parse(text);
            } catch (e) {}
            return {status: r.status, json: j, text: j ? null : text.replace(/\s+/g, ' ').slice(0, 200)};
        },
        {url, method, json},
    );
}

async function menus(page, app) {
    const r = await send(page, app.url(GRID));
    const html = r.json ? String(r.json.content || '') : '';
    const rows = [...new Set([...html.matchAll(/navigationmenusgrid-row-(\d+)/gi)].map((m) => Number(m[1])))].map((id) => ({id}));
    return {status: r.status, ok: r.json ? r.json.status : null, said: r.json && r.json.status === false ? L.flat(r.json.content, 200) : null, rows, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')};
}

async function openSettings(page, app) {
    const r = await L.openAdmin(page, app, SETTINGS);
    if (r.confirmAccess) await L.answerConfirmAccess(page);
    return {asked: !!r.confirmAccess, landed: L.path(page)};
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('navmenu-api.js runs on a dataset fleet');
    const facts = {app: app.name};
    const cfg = L.setPasswordTimeout(app, 1);
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin');
        facts.open = await openSettings(page, app);
        facts.before = await menus(page, app);
        const target = facts.before.rows[0];
        await L.sleep(120_000);
        facts.expired = {menusGridFetch: await menus(page, app)};
        delete facts.expired.menusGridFetch.rows;
        delete facts.expired.menusGridFetch.text;
        // The modal's own requests, from the open page. (On main the site-level modal does not
        // open: its GET items answers 500, getAllMenuItems() given the site's null context id.)
        facts.expired.items = await send(page, app.url(`${API}/items`));
        facts.expired.items = {status: facts.expired.items.status, said: L.flat(JSON.stringify(facts.expired.items.json), 200)};
        const add = await send(page, app.url(API), 'POST', {title: 'r2 Menu', areaName: ''});
        facts.expired.add = {status: add.status, said: add.json ? L.flat(JSON.stringify(add.json), 200) : add.text};
        if (target) {
            const put = await send(page, app.url(`${API}/${target.id}`), 'PUT', {title: 'r2 Renamed'});
            facts.expired.edit = {menu: target.id, status: put.status, said: put.json ? L.flat(JSON.stringify(put.json), 200) : put.text};
        }
        facts.reopen = await openSettings(page, app);
        const again = await send(page, app.url(API), 'POST', {title: 'r2 Menu Reconfirmed', areaName: ''});
        facts.reconfirmedAdd = {status: again.status, said: again.json ? L.flat(JSON.stringify(again.json), 200) : again.text};
        facts.after = await menus(page, app);
        facts.added = facts.after.text.includes('r2 Menu');
        facts.renamed = facts.after.text.includes('r2 Renamed');
        facts.after.text = L.flat(facts.after.text, 300);
    } finally {
        record('navmenu', facts);
        cfg.restore();
        await close();
    }
});
