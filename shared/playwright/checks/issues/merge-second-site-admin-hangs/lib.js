// Helpers of walk.js (issue report docs/issues/U53-A21-merge-second-site-admin-hangs.md).
// Requiring this file runs nothing. Every helper presses what a person presses or types into a
// search box, except makeSiteAdmin(), the report's one database precondition (no screen makes a
// second Site Administrator).
const {idle, screen, record, sql} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/**
 * The Steps' precondition: `username` gets the site's Site Administrator group, written as
 * PKPInstall::createData() assigns the first one (Repo::userGroup()->assignUserToGroup(): the
 * group, the user, date_start now). Idempotent; returns the user's site-admin rows afterwards.
 */
function makeSiteAdmin(app, username) {
    const have = sql(app, `SELECT count(*) FROM user_user_groups uug JOIN user_groups ug ON ug.user_group_id = uug.user_group_id
        JOIN users u ON u.user_id = uug.user_id WHERE ug.role_id = 1 AND ug.context_id IS NULL AND u.username = '${username}'`);
    if (have === '0') {
        sql(app, `INSERT INTO user_user_groups (user_group_id, user_id, date_start)
            SELECT ug.user_group_id, u.user_id, CURRENT_TIMESTAMP FROM user_groups ug, users u
            WHERE ug.role_id = 1 AND ug.context_id IS NULL AND u.username = '${username}'`);
    }
    return sql(app, `SELECT uug.user_id, uug.user_group_id, uug.date_start FROM user_user_groups uug JOIN user_groups ug ON ug.user_group_id = uug.user_group_id
        JOIN users u ON u.user_id = uug.user_id WHERE ug.role_id = 1 AND ug.context_id IS NULL AND u.username = '${username}'`);
}

/** The account `username` in the database: id, disabled flag (null when it is gone). */
function account(app, username) {
    const row = sql(app, `SELECT user_id, disabled FROM users WHERE username = '${username}'`);
    return row ? row : null;
}

/** Settings > Users & Roles > "Users", opened, with the list's page object. */
async function openList(page, app) {
    const {UsersListPage} = require('../../../pages/UsersManagementPages.js');
    const list = new UsersListPage(page, app.contextPath);
    await list.goto();
    await idle(page);
    return list;
}

/** Type `phrase` in the list's search box, press Enter; the row holding `email` (may be absent). */
async function findRow(page, list, phrase, email) {
    await list.search(phrase);
    await idle(page);
    const row = list.row(email).first();
    await row.waitFor({timeout: 8000}).catch(() => {});
    return row;
}

/** A row's Roles lines and its menu's labels (the menu opened and closed again); null when absent. */
async function rowFacts(list, row) {
    if (!(await row.count())) return null;
    return {
        roles: await list.cellLines(list.rolesCell(row)),
        menu: await list.menuLabels(row),
    };
}

/**
 * "…" > "Merge user" on `row`; in the window "Search" for `intoSearch`, `into`'s row > "Merge into
 * this User" > "OK" in "Confirm". Returns the sentence, the request's status and body, and the
 * screen `waitMs` later: "Confirm" still open, its spinner, its buttons, the window, page notices.
 */
async function mergeInto(page, list, row, {intoSearch, into, label, log, waitMs = 3000}) {
    const {MergeUserWindow} = require('../../../pages/UsersManagementPages.js');
    await list.chooseAction(row, 'Merge user');
    const win = new MergeUserWindow(page);
    await win.expectOpen();
    await win.grid.search({text: intoSearch});
    await win.mergeInto(into);
    const question = flat(await win.confirmDialog.innerText(), 500);
    record(`${label}-confirm`, await screen(page));
    const from = log ? log.mark() : 0;
    const r = await win.confirm();
    let body = null;
    try { body = flat(await r.text(), 400); } catch (e) { body = null; }
    await sleep(waitMs);
    const confirmOpen = await win.confirmDialog.isVisible().catch(() => false);
    const out = {
        question,
        status: r.status(),
        body,
        confirmOpen,
        spinner: confirmOpen ? await win.confirmDialog.locator('.pkpSpinner').isVisible().catch(() => false) : false,
        confirmButtons: confirmOpen ? (await win.confirmDialog.getByRole('button').allInnerTexts()).map((b) => flat(b)).filter(Boolean) : [],
        confirmText: confirmOpen ? flat(await win.confirmDialog.innerText().catch(() => ''), 500) : null,
        windowOpen: await win.dialog.isVisible().catch(() => false),
    };
    await idle(page).catch(() => {});
    const s = await screen(page);
    record(`${label}-after-ok`, s);
    out.notices = s.notices || [];
    out.log = log ? log.since(from).map((l) => flat(l, 500)) : [];
    return out;
}

/**
 * "…" > "Login As" on `row` and "OK" in its dialog. Returns the dialog's text, where the browser
 * landed, the page's heading and text, and the name the header's user menu shows.
 */
async function loginAs(page, list, row, {label}) {
    await list.chooseAction(row, 'Login As');
    const dlg = page.getByRole('dialog', {name: 'Login As', exact: true});
    await dlg.waitFor({timeout: T});
    const dialog = flat(await dlg.innerText(), 400);
    await Promise.all([
        page.waitForLoadState('load').catch(() => {}),
        dlg.getByRole('button', {name: 'OK', exact: true}).click(),
    ]);
    await page.waitForURL((u) => !/management\/settings\/access/.test(String(u)), {timeout: 15000}).catch(() => {});
    await page.waitForLoadState('load').catch(() => {});
    await sleep(1000);
    await idle(page).catch(() => {});
    const s = await screen(page);
    record(`${label}-login-as`, s);
    return {
        dialog,
        url: new URL(page.url()).pathname,
        title: await page.title(),
        text: flat(s.text && (s.text.main || s.text.body), 600),
    };
}

module.exports = {T, sleep, flat, makeSiteAdmin, account, openList, findRow, rowFacts, mergeInto, loginAs};
