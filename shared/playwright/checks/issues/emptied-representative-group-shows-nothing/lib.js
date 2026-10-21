// Helpers for the U74 A21 walk {OMP}: a book's "Marketing" › "Representatives" table read as drawn
// (each group's rows and whether its "No Items" line shows), an agent added, a row deleted, a
// reload. Requiring this file runs nothing; the suite page objects are required inside the calls
// (they read PKP_APP_ROOT, which forEachApp sets). Adapted from the U74 claim check H13D
// (shared/playwright/checks/U74/H13D/h13d.js), copied so this folder stands alone.
const {idle, screen, shot, record, sql} = require('../../../probe');

const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run one step: its result, or `{error}` with a screenshot, so a walk goes on through the state a fix brings. */
async function step(page, name, fn) {
    try {
        const out = await fn();
        return out === undefined ? {ok: true} : out;
    } catch (e) {
        const error = flat(e && e.message);
        console.log(`[step ${name}] ${error}`);
        await shot(page, `a21-error-${name}`).catch(() => {});
        record(`a21-error-${name}`, {error, screen: await screen(page).catch(() => null)});
        return {error};
    }
}

/** Collect the page notices that show from now on (they expire after 5 s). */
function watchNotices(page) {
    const seen = [];
    const t = setInterval(async () => {
        for (const x of await page.locator('.app__notifications .pkpNotification').allInnerTexts().catch(() => [])) {
            const s = flat(x, 200);
            if (s && !seen.includes(s)) seen.push(s);
        }
    }, 150);
    return {seen, stop: () => clearInterval(t)};
}

/** Every request of the representatives table (save, delete, redraws) with its status and the start of its answer. */
function watchTable(page) {
    const seen = [];
    const on = (r) => {
        const m = r.url().match(/representatives-grid\/(fetch-row|fetch-category|fetch-grid|update-representative|delete-representative)\b/);
        if (!m) return;
        const q = new URL(r.url()).searchParams;
        seen.push(r.text().then((t) => ({op: m[1], rowId: q.get('rowId'), cat: q.get('rowCategoryId'), status: r.status(), body: flat(t, 300)})).catch(() => ({op: m[1], status: r.status()})));
    };
    page.on('response', on);
    return {take: () => Promise.all(seen.splice(0)), stop: () => page.off('response', on)};
}

/** The table as drawn: each group's rows ([name, role]) and its "No Items" line's text when it shows (false when not). */
async function table(app, rp) {
    const {rowCells} = require(`${app.suiteDir}/pages/OnixPages.js`);
    const out = {};
    for (const g of ['Agents', 'Suppliers']) {
        const rows = rp.rows(g);
        const n = await rows.count();
        out[g] = [];
        for (let i = 0; i < n; i++) out[g].push(await rowCells(rows.nth(i)).catch(() => null));
        const line = rp.groupEmpty(g);
        out[`${g} "No Items" shown`] = (await line.count()) > 0 ? flat(await line.first().innerText()) : false;
    }
    out.bodies = await rp.grid().locator('table > tbody').evaluateAll((bs) => bs.map((b) => ({
        cls: b.getAttribute('class'),
        visible: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length),
        text: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    })));
    return out;
}

/** The book's "Representatives" page (Marketing › Representatives, opened by address). */
async function openReps(app, page, id) {
    const {RepresentativesPage} = require(`${app.suiteDir}/pages/OnixPages.js`);
    const rp = new RepresentativesPage(page, app.contextPath);
    await rp.gotoEditorial(id);
    await idle(page).catch(() => {});
    return rp;
}

/** "Add Representative": "Agent", the role, the name, "OK"; the notices, the table's requests and the table after. */
async function addAgent(app, page, rp, watch, name, role) {
    const n = watchNotices(page);
    await watch.take();
    const win = await rp.openAdd();
    await win.chooseType('agent');
    await win.roleList('agent').selectOption({label: role});
    await win.nameBox().fill(name);
    await win.ok();
    await pause(1500);
    await idle(page).catch(() => {});
    n.stop();
    return {notices: n.seen, requests: await watch.take(), table: await table(app, rp)};
}

/**
 * "Add Representative" for a supplier: the window shows both role lists and saves a supplier only
 * after "Agent" and then "Supplier" are clicked (U74 A12), so those two first; then the role, the
 * name, "OK".
 */
async function addSupplier(app, page, rp, watch, name, role) {
    const n = watchNotices(page);
    await watch.take();
    const win = await rp.openAdd();
    await win.chooseType('agent');
    await win.chooseType('supplier');
    await win.roleList('supplier').selectOption({label: role});
    await win.nameBox().fill(name);
    await win.ok();
    await pause(1500);
    await idle(page).catch(() => {});
    n.stop();
    return {notices: n.seen, requests: await watch.take(), table: await table(app, rp)};
}

/** A row's arrow › "Delete" › "OK"; the notices, the table's requests and the table after the row's fade. */
async function deleteRow(app, page, rp, watch, group, name) {
    const {DeleteDialog} = require(`${app.suiteDir}/pages/PublicationFormatPages.js`);
    const n = watchNotices(page);
    await watch.take();
    await rp.openDelete(group, name);
    const d = new DeleteDialog(page);
    await d.ok();
    await pause(2000);
    await idle(page).catch(() => {});
    n.stop();
    return {notices: n.seen, requests: await watch.take(), table: await table(app, rp)};
}

/** Reload the page; the table after. */
async function reload(app, page, rp, watch) {
    await rp.reload();
    await idle(page).catch(() => {});
    await watch.take();
    return {table: await table(app, rp)};
}

/** The install's representatives as stored (Evidence only). */
function stored(app) {
    return sql(app, 'select representative_id, submission_id, name, role, is_supplier from representatives order by representative_id');
}

module.exports = {flat, pause, step, watchNotices, watchTable, table, openReps, addAgent, addSupplier, deleteRow, reload, stored};
