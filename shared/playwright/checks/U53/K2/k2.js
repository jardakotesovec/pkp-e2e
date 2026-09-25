// U53 claim check, chunk K2: acting on an account from Settings › Users & Roles ›
// "Users" (disable, enable, refused outside reach, remove, the Site Administrator's
// row, merge), on all three apps.
// Spec: docs/specs/U53-users-management.md — Fields 71–87, Rules 10–18 (174–250),
// Side effects 304–321, register A1, A2, A6–A10; footnotes c, f, g, h, i, j, k,
// td5, td6, td8, td9, td10, td11, f-a1, f-a2, f-a6–f-a10.
//
// Seeds per app (tag prefix u53k2):
//   A  a first scratch context: Xena (Author, also enrolled in B: outside B's
//      manager's reach), Xavi (Author, seeded disabled, also in B), Yara (Author,
//      also in B), Max (Journal manager of A only).
//   B  the context under test: Mona (manager), Eve (Journal/Press editor; OJS, OMP),
//      Xena, Xavi, Yara (Author + Reader), Dina (Author + Section editor; td5),
//      Dirk (Author; td6), Rhea (Author, Reader ended; A6), Olaf (the account
//      merged: Author, Section editor of the section, Copyeditor / OPS Editorial
//      Board Member "Does not appear", Reviewer on OJS/OMP, Reader 2020–2021 ended),
//      Nell (the chosen account: Author + Section editor, no section), Abe (Author,
//      submitter of the reviewed submission). Submissions: S1 by Olaf, published,
//      with one approved comment of his; S2 (OJS, OMP) by Abe in review, Olaf a
//      reviewer. OMP: a scratch press has no series, so the merge phase adds one on
//      screen (Settings › Press › "Series" › "Add Series") with Olaf ticked.
// Phases (PHASES=a,b to narrow; seed kept in k2-state-<app>.json, RESEED=1):
//   menus    row menus on B for the manager, the editor and the Site Administrator
//   a6       Rhea's "Disable User" window (A6), Dina's as the default end
//   disable  Dina: Cancel with a typed reason, then "Test"; her open session (td5);
//            the Login page; her Edit page; masthead before/after (Side effects)
//   reason   Dirk: Spam → "Enable User" (td6, A7) → "Appeal accepted" → disable
//            again → Login page; then an empty reason both ways
//   reach    td8 / A1: "Disable User" / "Enable User" outside reach and on admin's row
//   remove   Yara: "Remove User" (Rule 14), roles page, A's list, sign-in, mail (A8)
//   admrow   td9 / A2: "Remove User" on the Site Administrator's row
//   merge    Rules 16–18, td10 / A9: the "Merge user" window, its filters, the merge
//   msess    a second merge on a fresh context (session, masthead choice, comments)
//   mall     roles in two journals, participants, activity log (admin merges)
//   mtask    merging the creator of a discussion (fails) and a participant (works)
//   dsess    td5 again: the disabled user's open session, a link that needs signing in
//   wizard   Administration › Hosted Journals › B › "Settings wizard" › "Users" (A10, td11)
// Run: PROBE_FEATURE=U53 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U53/K2/k2.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['menus', 'a6', 'disable', 'reason', 'reach', 'remove', 'admrow', 'merge', 'msess', 'mall', 'mtask', 'dsess', 'wizard'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const flat = (s, n = 4000) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const TODAY = new Date().toISOString().slice(0, 10);
const log = (...a) => console.log('[k2]', new Date().toISOString().slice(11, 19), ...a);
const mail = (u) => `${u}@mail.test`;

// ---------------------------------------------------------------------------
// Reading

let CUR = 'init';
const CRASH = {};
function watch(page) {
    page.on('response', (r) => { if (r.status() >= 500) (CRASH[CUR] = CRASH[CUR] || []).push(`server ${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}`); });
    page.on('pageerror', (e) => { (CRASH[CUR] = CRASH[CUR] || []).push(`script ${String(e.message || e).slice(0, 200)}`); });
    return page;
}

async function snap(page, name, extra = {}) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 300)}; }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

async function gotoAccess(page, app, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/en/management/settings/access`));
    await page.getByRole('table', {name: /Current Users/}).waitFor({timeout: T});
    await idle(page);
    await page.getByRole('table', {name: /Current Users/}).getByRole('row').nth(1).waitFor({timeout: T}).catch(() => {});
}
function table(page) { return page.getByRole('table', {name: /Current Users/}); }
function userRow(page, email) { return table(page).getByRole('row').filter({hasText: email}); }
async function rowFacts(page, email) {
    const row = userRow(page, email);
    if (!(await row.count())) return {present: false};
    const cells = (await row.first().getByRole('cell').allInnerTexts()).map((c) => flat(c, 200));
    const disabledIcon = await row.first().getByRole('cell').first().locator('.text-negative').count();
    return {present: true, cells, disabledIcon};
}
let MENU_BTN = null;
async function openRowMenu(page, email) {
    const row = userRow(page, email).first();
    MENU_BTN = row.getByRole('button', {name: /options/i});
    await MENU_BTN.click();
    await page.getByRole('menuitem').first().waitFor({timeout: T});
    return (await page.getByRole('menuitem').allInnerTexts()).map((t) => flat(t));
}
async function closeMenu(page) {
    // Escape leaves the headlessui menu open here: press its own button again
    if (MENU_BTN && (await page.getByRole('menuitem').count())) await MENU_BTN.click().catch(() => {});
    await page.getByRole('menuitem').first().waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
}
async function menuOf(page, email) {
    const items = await openRowMenu(page, email);
    await closeMenu(page);
    return items;
}
async function pickMenu(page, email, item) {
    await openRowMenu(page, email);
    await page.getByRole('menuitem', {name: item, exact: true}).click();
}
/** The legacy side window opened from the row menu: waits for its form or a message. */
async function legacyWindow(page) {
    const dlg = page.getByRole('dialog').last();
    await dlg.waitFor({timeout: T});
    await dlg.locator('textarea[name="disableReason"], form, .pkp_form_error, p').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    await sleep(400);
    return dlg;
}
async function windowFacts(dlg) {
    return dlg.evaluate((d) => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const ta = d.querySelector('textarea[name="disableReason"]');
        return {
            text: txt(d),
            heading: [...d.querySelectorAll('h1,h2,h3')].map(txt),
            labels: [...d.querySelectorAll('label, legend, .label')].map(txt).filter(Boolean),
            reason: ta ? ta.value : null,
            buttons: [...d.querySelectorAll('button, a.cancelButton, a[role=button], input[type=submit]')].map((b) => txt(b) || b.getAttribute('aria-label')).filter(Boolean),
        };
    }).catch((e) => ({error: String(e.message)}));
}
async function cancelLegacy(page, dlg) {
    const c = dlg.getByRole('link', {name: 'Cancel', exact: true}).or(dlg.getByRole('button', {name: 'Cancel', exact: true}));
    if (await c.count()) await c.first().click(); else await dlg.getByRole('button', {name: /Close/}).first().click();
    await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await sleep(600); // the modal store keeps the slot ~450 ms (patterns.md pitfall 4)
}

/** A login attempt that may be refused: returns where it lands and what the page says. */
async function tryLogin(page, app, ctx, username, name) {
    await signOut(page).catch(() => {});
    await page.goto(app.url(`/index.php/${ctx}/en/login`));
    await page.locator('input#username').fill(username);
    await page.locator('input#password').evaluate((el) => el.removeAttribute('maxlength'));
    await page.locator('input#password').fill(`${username}${username}`);
    await Promise.all([page.waitForLoadState('load'), page.locator('form#login button[type="submit"]').click()]);
    await page.waitForURL(() => true, {timeout: 3000}).catch(() => {});
    await idle(page).catch(() => {});
    const s = await snap(page, name);
    const err = await page.locator('.pkp_form_error, .cmp_notification, [role="alert"], .pkp_notification').allInnerTexts().catch(() => []);
    return {url: page.url(), onLogin: /\/login/.test(page.url()), messages: err.map((m) => flat(m, 400)), main: flat(s.text && s.text.main, 600)};
}

/** The Edit page's roles table: role, start, end, masthead choice. */
async function editRoles(page) {
    return page.locator('table tr').evaluateAll((trs) => trs.map((tr) => {
        const tds = [...tr.querySelectorAll('td')];
        if (!tds.length) return null;
        const sel = tr.querySelector('select');
        return {
            cells: tds.slice(0, 3).map((td) => td.innerText.replace(/\s+/g, ' ').trim()),
            masthead: sel ? (sel.options[sel.selectedIndex] || {}).text : tds.map((td) => td.innerText.trim()).find((t) => /masthead/i.test(t)) || null,
            action: tr.innerText.includes('Remove Role') ? 'Remove Role' : tr.innerText.includes('User Removed From Role') ? 'User Removed From Role' : null,
        };
    }).filter(Boolean));
}
/** A signed-in page of a session whose account changed: reload, then a page that needs signing in. */
async function sessionReads(op, app, ctx, prefix) {
    const out = {};
    await op.reload({timeout: 15000}).catch((e) => { out.reloadError = String(e.message).slice(0, 120); });
    await op.waitForLoadState('load', {timeout: 15000}).catch(() => {});
    await sleep(800);
    let s = await snap(op, `${prefix}-reload`);
    out.reload = {url: op.url(), onLogin: /\/login/.test(op.url()), header: flat(s.text && s.text.header, 200), main: flat(s.text && s.text.main, 300)};
    await op.goto(app.url(`/index.php/${ctx}/en/dashboard/mySubmissions`), {timeout: 15000}).catch(() => {});
    await op.waitForLoadState('load', {timeout: 15000}).catch(() => {});
    await sleep(1200);
    s = await snap(op, `${prefix}-dashboard`);
    out.dashboard = {url: op.url(), onLogin: /\/login/.test(op.url()), header: flat(s.text && s.text.header, 200), main: flat(s.text && s.text.main, 300)};
    return out;
}

// Legacy grids (the merge window and the older grid) -------------------------

async function gridRows(scope) {
    return scope.locator('tr.gridRow').evaluateAll((rows) => rows.filter((r) => r.offsetParent !== null).map((r) => ({
        id: r.id, cells: [...r.querySelectorAll('td')].map((td) => td.innerText.replace(/\s+/g, ' ').trim()),
        arrow: !!r.querySelector('a.show_extras'),
    })));
}
async function gridHeaders(scope) {
    return scope.locator('th').evaluateAll((ths) => ths.filter((t) => t.offsetParent !== null).map((t) => t.innerText.replace(/\s+/g, ' ').trim()));
}
async function filterForm(scope) {
    return scope.locator('form.filter').first().evaluate((f) => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const sel = f.querySelector('select[name="userGroup"]');
        const cb = f.querySelector('input[name="includeNoRole"]');
        const lab = cb ? (cb.closest('label') || f.querySelector(`label[for="${cb.id}"]`)) : null;
        return {
            text: txt(f),
            search: (() => { const s = f.querySelector('input[name="search"]'); return s ? {type: s.type, value: s.value, placeholder: s.placeholder} : null; })(),
            select: sel ? {value: sel.value, selected: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : null, options: [...sel.options].map((o) => o.text.trim())} : null,
            checkbox: cb ? {checked: cb.checked, label: txt(lab)} : null,
            submit: [...f.querySelectorAll('button')].map(txt),
        };
    }).catch((e) => ({error: String(e.message)}));
}
async function openFilter(page, scope) {
    const f = scope.locator('form.filter').first();
    if (!(await f.locator('input[name="search"]').isVisible())) {
        // the grid header's "Search" link reveals the filter form
        await scope.getByRole('link', {name: /Search$/}).first().click();
        await f.locator('input[name="search"]').waitFor({state: 'visible', timeout: T});
    }
    return f;
}
async function filterRun(page, scope, {search = '', role = null, noRole = false}) {
    const f = await openFilter(page, scope);
    await f.locator('input[name="search"]').fill(search);
    const sel = f.locator('select[name="userGroup"]');
    if (role) await sel.selectOption({label: role}); else await sel.selectOption({index: 0});
    await f.locator('input[name="includeNoRole"]').setChecked(noRole);
    await f.getByRole('button', {name: 'Search'}).click();
    await idle(page); await sleep(700);
    return (await gridRows(scope)).map((r) => r.cells.slice(0, 5).join(' | '));
}
async function rowActions(page, scope, rowText) {
    const row = scope.locator('tr.gridRow').filter({hasText: rowText}).first();
    if (!(await row.count())) return {present: false};
    const arrow = row.locator('a.show_extras');
    if (!(await arrow.count())) return {present: true, arrow: false, links: []};
    await arrow.click();
    const next = row.locator('xpath=following-sibling::tr[1]');
    await next.getByRole('link').first().waitFor({timeout: 5000}).catch(() => {});
    const links = (await next.getByRole('link').allInnerTexts()).map((t) => flat(t));
    return {present: true, arrow: true, links};
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    const SE = isOjs ? 'Section editor' : isOmp ? 'Series editor' : 'Moderator';
    const EXTRA = isOps ? 'editorialBoardMember' : 'copyeditor';
    await app.api.bootstrapProbe(app.contextPath);
    const F = {app: app.name, errors: []};
    const factsName = 'k2-facts';
    const step = async (name, fn) => {
        CUR = `${app.name}:${name}`;
        log(app.name, 'step', name);
        F[name] = {};
        try { await fn(F[name]); } catch (e) { F.errors.push({step: name, error: String(e.message || e).slice(0, 500)}); log(app.name, 'ERROR', name, String(e.message || e).slice(0, 300)); }
        F[name].crashes = CRASH[CUR] || [];
        record(factsName, {[name]: F[name], errors: F.errors}, {merge: true});
    };

    // ── seed ────────────────────────────────────────────────────────────────
    let st = null;
    if (!process.env.RESEED && fs.existsSync(stateFile(app))) st = JSON.parse(fs.readFileSync(stateFile(app), 'utf8'));
    if (!st) {
        const t = tag('u53k2');
        const A = `${t}a`, B = `${t}b`;
        const sec = isOjs ? 'ART' : isOps ? 'PRE' : null;
        const secSpec = sec ? {sections: [{abbrev: sec, title: isOjs ? 'Articles' : 'Preprints'}]} : {};
        const u = (k, g, f, roles, extra = {}) => ({username: `${t}${k}`, givenName: g, familyName: f, roles, ...extra});
        const ctxA = await app.api.createContext({tag: A, context: {name: `K2 Other ${t}`, acronym: 'K2A'}, ...secSpec, users: [
            u('x', 'Xena', 'Outside', ['author']),
            u('xd', 'Xavi', 'Disabledout', ['author'], {disabled: true}),
            u('y', 'Yara', 'Removed', ['author']),
            u('ma', 'Max', 'Amanager', ['manager']),
        ]});
        const oldRoles = ['author', 'sectionEditor', EXTRA, ...(isOps ? [] : ['externalReviewer'])];
        const usersB = [
            u('mgr', 'Mona', 'Manager', ['manager']),
            ...(isOps ? [] : [u('ed', 'Eve', 'Editor', ['editor'])]),
            {username: `${t}x`, roles: ['author']},
            {username: `${t}xd`, roles: ['author']},
            {username: `${t}y`, roles: ['author', 'reader']},
            u('d1', 'Dina', 'Disabled', ['author', 'sectionEditor']),
            u('d2', 'Dirk', 'Reason', ['author']),
            u('r6', 'Rhea', 'Ended', ['author'], {pastRoles: [{role: 'reader'}]}),
            u('old', 'Olaf', 'Merged', oldRoles, {
                ...(sec ? {sections: [sec]} : {}),
                masthead: {[EXTRA]: false},
                pastRoles: [{role: 'reader', dateStart: '2020-01-01', dateEnd: '2021-06-30'}],
            }),
            u('new', 'Nell', 'Chosen', ['author', 'sectionEditor']),
            u('abe', 'Abe', 'Submitter', ['author']),
        ];
        const ctxB = await app.api.createContext({tag: B, context: {name: `K2 Journal ${t}`, acronym: 'K2B'}, ...secSpec, users: usersB});
        const s1 = await app.api.createSubmission({tag: `${t}s1`, context: B, submitter: `${t}old`, published: true, title: `K2 Olaf article ${t}`,
            userComments: [{user: `${t}old`, text: `K2 comment by Olaf ${t}.`, approved: true}]});
        let s2 = null;
        if (!isOps) {
            s2 = await app.api.createSubmission({tag: `${t}s2`, context: B, submitter: `${t}abe`, title: `K2 reviewed by Olaf ${t}`,
                decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: `${t}old`, status: 'accepted'}]}]});
        }
        const ids = {};
        for (const x of [...ctxA.users, ...ctxB.users]) ids[x.username.replace(t, '')] = x.id;
        st = {t, A, B, idA: ctxA.contextId, idB: ctxB.contextId, ids, s1: s1.submissionId, s2: s2 && s2.submissionId, sec};
        fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
        record('seed', {st, ctxA, ctxB, s1, s2});
        log(app.name, 'seeded', t);
    }
    const {t, A, B} = st;
    const U = (k) => `${t}${k}`;
    const E = (k) => mail(U(k));

    const {page, close} = await launch(app);
    watch(page);
    const OPEN = [];
    const extra = async () => { const x = await launch(app); watch(x.page); OPEN.push(x); return x; };
    try {
        // ── menus ───────────────────────────────────────────────────────────
        if (on('menus')) await step('menus', async (R) => {
            await signIn(page, U('mgr'), {contextPath: B});
            await gotoAccess(page, app, B);
            await snap(page, 'm01-list-mgr');
            await loc(page, 'Users list: table', table(page));
            await loc(page, 'Users list: a row by email', userRow(page, E('d1')));
            await loc(page, 'Users list: the row menu button', userRow(page, E('d1')).getByRole('button').last());
            R.mgr = {};
            for (const k of ['mgr', 'x', 'xd', 'y', 'd1', 'old', 'new']) R.mgr[k] = {menu: await menuOf(page, E(k)), row: await rowFacts(page, E(k))};
            R.mgr.admin = {menu: await menuOf(page, 'admin@mail.test'), row: await rowFacts(page, 'admin@mail.test')};
            await openRowMenu(page, E('x'));
            await snap(page, 'm02-menu-x-mgr');
            await loc(page, 'Users list: row menu items', page.getByRole('menuitem'));
            await closeMenu(page);
            if (!isOps) {
                await signIn(page, U('ed'), {contextPath: B});
                await gotoAccess(page, app, B);
                await snap(page, 'm03-list-ed');
                R.ed = {};
                for (const k of ['ed', 'x', 'xd', 'd1']) R.ed[k] = await menuOf(page, E(k));
                R.ed.admin = await menuOf(page, 'admin@mail.test');
            }
            await signIn(page, 'admin');
            await gotoAccess(page, app, B);
            await snap(page, 'm04-list-admin');
            R.admin = {};
            for (const k of ['mgr', 'x', 'xd', 'd1']) R.admin[k] = await menuOf(page, E(k));
            R.admin.admin = await menuOf(page, 'admin@mail.test');
        });

        // ── a6 ──────────────────────────────────────────────────────────────
        if (on('a6')) await step('a6', async (R) => {
            await signIn(page, U('mgr'), {contextPath: B});
            await gotoAccess(page, app, B);
            R.r6row = await rowFacts(page, E('r6'));
            R.d1row = await rowFacts(page, E('d1'));
            for (const k of ['r6', 'd1']) {
                await pickMenu(page, E(k), 'Disable User');
                const dlg = await legacyWindow(page);
                await snap(page, `a6-${k}-disable-window`);
                R[k] = await windowFacts(dlg);
                await cancelLegacy(page, dlg);
            }
            // the Edit page's roles table for Rhea (the ended Reader row)
            await pickMenu(page, E('r6'), 'Edit');
            await page.waitForURL(/management\/settings\/user\//, {timeout: T});
            await idle(page); await sleep(800);
            const s = await snap(page, 'a6-r6-edit-page');
            R.r6edit = flat(s.text && s.text.main, 1500);
        });

        // ── disable (Rule 10, 11, td5, Side effects) ────────────────────────
        if (on('disable')) await step('disable', async (R) => {
            // the masthead read before (signed out, a separate browser)
            const anon = await extra();
            const mh = async (name) => {
                const r = await anon.page.goto(app.url(`/index.php/${B}/en/about/editorialMasthead`));
                await idle(anon.page).catch(() => {});
                await snap(anon.page, name);
                return {status: r ? r.status() : null, text: flat(await anon.page.locator('body').innerText().catch(() => ''), 600)};
            };
            R.mastheadBefore = await mh('d00-masthead-before');
            // Dina signs in elsewhere and opens her profile
            const other = await extra();
            await signIn(other.page, U('d1'), {contextPath: B});
            await other.page.goto(app.url(`/index.php/${B}/en/user/profile`));
            await idle(other.page);
            await snap(other.page, 'd01-d1-profile-before');
            // the manager: Disable User, type, Cancel
            await signIn(page, U('mgr'), {contextPath: B});
            await gotoAccess(page, app, B);
            await pickMenu(page, E('d1'), 'Disable User');
            let dlg = await legacyWindow(page);
            await snap(page, 'd02-disable-window');
            await loc(page, 'Disable window: reason box', dlg.locator('textarea[name="disableReason"]'));
            await loc(page, 'Disable window: OK', dlg.getByRole('button', {name: 'OK', exact: true}));
            await loc(page, 'Disable window: Cancel', dlg.getByRole('link', {name: 'Cancel', exact: true}));
            R.window = await windowFacts(dlg);
            const dialogs = [];
            const onDialog = (d) => { dialogs.push({type: d.type(), message: d.message()}); d.dismiss().catch(() => {}); };
            page.on('dialog', onDialog);
            await dlg.locator('textarea[name="disableReason"]').fill('K2 typed then cancelled');
            await dlg.locator('textarea[name="disableReason"]').blur();
            await cancelLegacy(page, dlg);
            R.cancelDialogs = dialogs.slice();
            R.cancelStillOpen = await page.getByRole('dialog').filter({hasText: 'Reason for disabling user'}).count();
            await snap(page, 'd03-after-cancel');
            page.off('dialog', onDialog);
            if (R.cancelStillOpen) { // a "discard?" question kept it open: note and close
                note('ccK2: the Disable window, closed by "Cancel" with a typed reason, stayed open (see d03-after-cancel)');
                await page.goto('about:blank');
            }
            await gotoAccess(page, app, B);
            R.afterCancel = {row: await rowFacts(page, E('d1')), menu: await menuOf(page, E('d1'))};
            // reopen: does the typed text come back? then Test, OK
            await pickMenu(page, E('d1'), 'Disable User');
            dlg = await legacyWindow(page);
            R.reopenReason = (await windowFacts(dlg)).reason;
            await dlg.locator('textarea[name="disableReason"]').fill('Test');
            const w = page.waitForResponse((r) => r.url().includes('disable-user') && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            const resp = await w;
            R.okStatus = resp ? resp.status() : null;
            await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await idle(page); await sleep(800);
            R.windowOpenAfterOk = await page.getByRole('dialog').filter({hasText: 'Reason for disabling user'}).count();
            await snap(page, 'd04-list-after-disable');
            R.afterOkSamePage = {row: await rowFacts(page, E('d1')), menu: await menuOf(page, E('d1'))};
            await gotoAccess(page, app, B);
            R.afterOkReload = {row: await rowFacts(page, E('d1')), menu: await menuOf(page, E('d1'))};
            await loc(page, 'Users list: the disabled icon in the name cell', userRow(page, E('d1')).locator('.text-negative'));
            // Dina's open session: click a link
            const op = other.page;
            const links = await op.getByRole('link').evaluateAll((as) => as.filter((a) => a.offsetParent !== null && a.href && !a.href.includes('#') && !/signOut/.test(a.href)).map((a) => ({text: a.innerText.trim(), href: a.href})).slice(0, 40));
            R.sessionLinkCandidates = links.slice(0, 12);
            const target = links.find((l) => /Submissions|Dashboard|View Site|Profile/i.test(l.text)) || links[0];
            R.sessionClicked = target;
            if (target) {
                await op.getByRole('link', {name: target.text, exact: true}).first().click({timeout: 10000}).catch(async () => { await op.goto(target.href); });
            }
            await op.waitForLoadState('load', {timeout: 15000}).catch(() => {});
            await sleep(1500);
            const s1 = await snap(op, 'd05-d1-session-after-click');
            R.sessionAfter = {url: op.url(), onLogin: /\/login/.test(op.url()), text: flat(s1.text && s1.text.main, 400)};
            // then a page that needs signing in (her profile, where she was)
            await op.goto(app.url(`/index.php/${B}/en/user/profile`)).catch(() => {});
            await op.waitForLoadState('load', {timeout: 15000}).catch(() => {});
            await snap(op, 'd05b-d1-profile-after');
            R.sessionProfile = {url: op.url(), onLogin: /\/login/.test(op.url())};
            // sign in again
            R.loginRefused = await tryLogin(op, app, B, U('d1'), 'd06-d1-login-refused');
            await other.close();
            // Rule 11: the disabled account's menu, Edit page
            R.disabledMenu = await menuOf(page, E('d1'));
            await pickMenu(page, E('d1'), 'Edit');
            await page.waitForURL(/management\/settings\/user\//, {timeout: T});
            await idle(page); await sleep(1000);
            const se = await snap(page, 'd07-d1-edit-page');
            R.editPage = flat(se.text && se.text.main, 1500);
            R.editButtons = await page.getByRole('button').evaluateAll((bs) => bs.filter((b) => b.offsetParent !== null).map((b) => ({t: b.innerText.replace(/\s+/g, ' ').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})));
            // masthead after
            R.mastheadAfter = await mh('d08-masthead-after-disable');
            await anon.close();
        });

        // ── reason (Rule 12, td6, A7; Rule 11 bullet 1 both ends) ───────────
        if (on('reason')) await step('reason', async (R) => {
            const other = await extra();
            await signIn(page, U('mgr'), {contextPath: B});
            await gotoAccess(page, app, B);
            const act = async (verb, text, snapName) => {
                await gotoAccess(page, app, B);
                await pickMenu(page, E('d2'), verb);
                const dlg = await legacyWindow(page);
                await snap(page, snapName);
                const facts = await windowFacts(dlg);
                if (text !== undefined) await dlg.locator('textarea[name="disableReason"]').fill(text);
                await dlg.getByRole('button', {name: 'OK', exact: true}).click();
                await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                await idle(page); await sleep(800);
                const same = {row: await rowFacts(page, E('d2')), menu: await menuOf(page, E('d2'))};
                return {facts, same};
            };
            R.dis1 = await act('Disable User', 'Spam', 'r01-disable-spam');
            R.login1 = await tryLogin(other.page, app, B, U('d2'), 'r02-login-spam');
            R.en1 = await act('Enable User', 'Appeal accepted', 'r03-enable-window');
            await gotoAccess(page, app, B);
            R.en1reload = {row: await rowFacts(page, E('d2')), menu: await menuOf(page, E('d2'))};
            // the user can sign in
            R.login2 = await tryLogin(other.page, app, B, U('d2'), 'r04-login-enabled');
            R.dis2 = await act('Disable User', undefined, 'r05-disable-again');
            R.login3 = await tryLogin(other.page, app, B, U('d2'), 'r06-login-after-appeal');
            // the other end: cleared on enable, then disabled with an empty box
            R.en2 = await act('Enable User', '', 'r07-enable-clear');
            R.dis3 = await act('Disable User', undefined, 'r08-disable-empty');
            R.login4 = await tryLogin(other.page, app, B, U('d2'), 'r09-login-no-reason');
            // leave Dirk enabled
            R.en3 = await act('Enable User', undefined, 'r10-enable-final');
            await other.close();
        });

        // ── reach (td8, A1) ─────────────────────────────────────────────────
        if (on('reach')) await step('reach', async (R) => {
            const tryAct = async (who, email, verb, snapName) => {
                await gotoAccess(page, app, B);
                const menu = await openRowMenu(page, email);
                const has = menu.includes(verb);
                if (!has) { await closeMenu(page); return {menu, offered: false}; }
                const dialogs = [];
                const onD = (d) => { dialogs.push({type: d.type(), message: d.message()}); d.dismiss().catch(() => {}); };
                page.on('dialog', onD);
                await page.getByRole('menuitem', {name: verb, exact: true}).click();
                await sleep(1500);
                await idle(page);
                const dlgCount = await page.getByRole('dialog').count();
                const s = await snap(page, snapName);
                const dlg = page.getByRole('dialog').last();
                const facts = dlgCount ? await windowFacts(dlg) : null;
                const hasForm = dlgCount ? await dlg.locator('textarea[name="disableReason"]').count() : 0;
                if (dlgCount) {
                    // never press OK here: close the window
                    const c = dlg.getByRole('link', {name: 'Cancel', exact: true}).or(dlg.getByRole('button', {name: /^(Cancel|Close|OK)$/}));
                    if (await c.count()) await c.first().click().catch(() => {});
                    await dlg.waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
                    await sleep(600);
                }
                page.off('dialog', onD);
                await gotoAccess(page, app, B);
                return {menu, offered: true, dialogs, dlgCount, hasForm, facts, dialogText: flat(s.text && s.text.dialog, 800), rowAfter: await rowFacts(page, email)};
            };
            await signIn(page, U('mgr'), {contextPath: B});
            R.mgr = {
                x: await tryAct('mgr', E('x'), 'Disable User', 'h01-mgr-x-disable'),
                xd: await tryAct('mgr', E('xd'), 'Enable User', 'h02-mgr-xd-enable'),
                admin: await tryAct('mgr', 'admin@mail.test', 'Disable User', 'h03-mgr-admin-disable'),
            };
            if (!isOps) {
                await signIn(page, U('ed'), {contextPath: B});
                R.ed = {x: await tryAct('ed', E('x'), 'Disable User', 'h04-ed-x-disable')};
            }
            // the Site Administrator reaches Xena: the window opens with its form (control); Cancel
            await signIn(page, 'admin');
            R.admin = {x: await tryAct('admin', E('x'), 'Disable User', 'h05-admin-x-disable')};
        });

        // ── remove (Rule 14, A8, Side effects) ──────────────────────────────
        if (on('remove')) await step('remove', async (R) => {
            await signIn(page, U('mgr'), {contextPath: B});
            await gotoAccess(page, app, B);
            R.before = await rowFacts(page, E('y'));
            await pickMenu(page, E('y'), 'Remove User');
            await page.getByRole('dialog').last().waitFor({timeout: T});
            await sleep(300);
            let s = await snap(page, 'v01-remove-dialog');
            R.dialog = flat(s.text && s.text.dialog, 600);
            R.dialogButtons = (await page.getByRole('dialog').last().getByRole('button').allInnerTexts()).map((x) => flat(x));
            await loc(page, 'Remove dialog: OK', page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true}));
            await page.getByRole('dialog').last().getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(700);
            R.afterCancel = await rowFacts(page, E('y'));
            await pickMenu(page, E('y'), 'Remove User');
            await page.getByRole('dialog').last().waitFor({timeout: T});
            const w = page.waitForResponse((r) => r.url().includes('remove-user'), {timeout: T}).catch(() => null);
            await page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true}).click();
            const resp = await w;
            R.okStatus = resp ? resp.status() : null;
            await idle(page); await sleep(1000);
            s = await snap(page, 'v02-list-after-remove');
            R.dialogAfterOk = flat(s.text && s.text.dialog, 300);
            R.afterSame = await rowFacts(page, E('y'));
            await gotoAccess(page, app, B);
            R.afterReload = {row: await rowFacts(page, E('y')), menu: await menuOf(page, E('y'))};
            // the roles page
            await pickMenu(page, E('y'), 'Edit');
            await page.waitForURL(/management\/settings\/user\//, {timeout: T});
            await idle(page); await sleep(1000);
            s = await snap(page, 'v03-y-edit-page');
            R.editPage = flat(s.text && s.text.main, 1500);
            // Email from the row (the control, and Side effect "Email")
            await gotoAccess(page, app, B);
            await pickMenu(page, E('y'), 'Email');
            const dlg = page.getByRole('dialog').last();
            await dlg.locator('input[name="subject"]').waitFor({timeout: T});
            await idle(page);
            await snap(page, 'v04-email-window');
            const subj = `K2 control ${t}`;
            await dlg.locator('input[name="subject"]').fill(subj);
            const body = dlg.locator('textarea[name="message"]');
            if (await body.count()) {
                await page.evaluate(() => { const ed = window.tinymce && window.tinymce.activeEditor; if (ed) ed.setContent('<p>K2 control body</p>'); });
                await body.fill('K2 control body').catch(() => {});
            }
            await dlg.getByRole('button', {name: 'Send Email'}).click();
            await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await idle(page);
            const m = await app.mail.find({to: E('y'), contains: subj, timeoutMs: 20000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
            R.controlMail = m && m.ID ? {id: m.ID, from: m.From, subject: m.Subject, to: m.To} : m;
            if (m && m.ID) {
                const full = await app.mail.fullMessage(m.ID);
                R.controlMail.text = flat(full.Text, 300);
            }
            const inbox = await app.mail.inboxFor(E('y')).catch(() => []);
            R.inboxY = inbox.map((x) => ({subject: x.Subject, from: x.From && x.From.Address, created: x.Created}));
            // A's list: Yara still an Author there (as A's manager)
            await signIn(page, U('ma'), {contextPath: A});
            await gotoAccess(page, app, A);
            await snap(page, 'v05-list-A');
            R.inA = await rowFacts(page, E('y'));
            // Yara signs in
            R.ySignIn = await tryLogin(page, app, B, U('y'), 'v06-y-signin');
        });

        // ── admrow (td9, A2) ────────────────────────────────────────────────
        if (on('admrow')) await step('admrow', async (R) => {
            await signIn(page, U('mgr'), {contextPath: B});
            await gotoAccess(page, app, B);
            R.before = await rowFacts(page, 'admin@mail.test');
            R.menu = await openRowMenu(page, 'admin@mail.test');
            await page.getByRole('menuitem', {name: 'Remove User', exact: true}).click();
            await page.getByRole('dialog').last().waitFor({timeout: T});
            let s = await snap(page, 'w01-admin-remove-dialog');
            R.dialog = flat(s.text && s.text.dialog, 600);
            const w = page.waitForResponse((r) => r.url().includes('remove-user'), {timeout: T}).catch(() => null);
            await page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true}).click();
            const resp = await w;
            R.okStatus = resp ? resp.status() : null;
            R.okBody = resp ? flat(await resp.text().catch(() => ''), 400) : null;
            await sleep(1200); await idle(page);
            s = await snap(page, 'w02-after-ok');
            R.after = flat(s.text && s.text.dialog, 600);
            R.afterButtons = (await page.getByRole('dialog').last().getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x));
            const ok = page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true});
            if (await ok.count()) { await ok.click(); await sleep(700); }
            R.sameRow = await rowFacts(page, 'admin@mail.test');
            await gotoAccess(page, app, B);
            await snap(page, 'w03-list-reload');
            R.reloadRow = await rowFacts(page, 'admin@mail.test');
        });

        // ── merge (Rules 16–18, td10, A9, Side effects) ─────────────────────
        if (on('merge')) await step('merge', async (R) => {
            const editPage = async (id, name) => {
                await page.goto(app.url(`/index.php/${B}/en/management/settings/user/${id}`));
                await idle(page); await sleep(1200);
                const s = await snap(page, name);
                return flat(s.text && s.text.main, 2000);
            };
            const sectionForm = async (name) => {
                await page.goto(app.url(`/index.php/${B}/en/management/settings/context`));
                const tab = page.getByRole('tab', {name: isOmp ? 'Series' : 'Sections', exact: true}).first();
                await tab.waitFor({timeout: T});
                await tab.click();
                const grid = page.locator(isOmp ? '#seriesGridContainer' : '#sectionsGridContainer');
                await grid.locator('tr.gridRow').first().waitFor({timeout: T});
                await grid.locator('tr.gridRow').first().locator('a.show_extras').click();
                await grid.getByRole('link', {name: 'Edit', exact: true}).first().click();
                const form = page.locator('form#sectionForm, form#seriesForm').first();
                await form.locator('input[name^="subEditors"]').first().waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(500);
                await snap(page, name);
                const boxes = await form.locator('input[name^="subEditors"]').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, checked: e.checked, label: ((e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText || '').trim()})));
                await form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
                await sleep(600);
                return boxes;
            };
            await signIn(page, U('mgr'), {contextPath: B});
            // OMP: a scratch press has no series; add one on screen with Olaf ticked
            if (isOmp && !st.seriesMade) {
                await page.goto(app.url(`/index.php/${B}/en/management/settings/context`));
                const tab = page.getByRole('tab', {name: 'Series', exact: true}).first();
                await tab.waitFor({timeout: T}); await tab.click();
                const grid = page.locator('#seriesGridContainer');
                await grid.getByRole('link', {name: /Add Series/}).click();
                const form = page.locator('form#seriesForm');
                await form.locator('input[name^="title"]').first().waitFor({timeout: T});
                await idle(page); await sleep(500);
                await form.locator('input[name^="title"]').first().fill('K2 Series');
                await form.locator('input[name="path"]').fill(`k2s${t.slice(-4)}`).catch(() => {});
                const boxes = await form.locator('input[name^="subEditors"]').evaluateAll((els) => els.map((e) => ({id: e.id, label: ((e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText || '').trim()})));
                const mine = boxes.find((b) => /Olaf/.test(b.label));
                if (mine) await form.getByRole("checkbox", {name: /Assign Olaf Merged/}).check();
                await form.getByRole('button', {name: 'Save'}).click();
                await form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                await idle(page);
                R.seriesMade = {boxes, ticked: mine ? mine.label : null};
                st.seriesMade = true;
                fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
            }
            R.sectionBefore = await sectionForm('g00-section-before');
            await page.goto(app.url(`/index.php/${B}/en/management/settings/userComments`));
            await idle(page); await sleep(1200);
            R.commentsBefore = flat((await snap(page, 'g00b-comments-before')).text.main, 800);
            await page.goto(app.url(`/index.php/${B}/en/management/settings/user/${st.ids.old}`));
            await idle(page); await sleep(1200);
            R.oldRolesBefore = await editRoles(page);
            R.oldEditBefore = await editPage(st.ids.old, 'g01-old-edit-before');
            R.newEditBefore = await editPage(st.ids.new, 'g02-new-edit-before');
            // Olaf's open session
            const other = await extra();
            await signIn(other.page, U('old'), {contextPath: B});
            await other.page.goto(app.url(`/index.php/${B}/en/user/profile`));
            await idle(other.page);
            // the window
            await gotoAccess(page, app, B);
            await pickMenu(page, E('old'), 'Merge user');
            const dlg = page.getByRole('dialog').last();
            await dlg.locator('tr.gridRow').first().waitFor({timeout: T});
            await idle(page); await sleep(600);
            let s = await snap(page, 'g03-merge-window');
            R.filterVisibleAtFirst = await dlg.locator('form.filter input[name="search"]').isVisible();
            await openFilter(page, dlg);
            await snap(page, 'g03b-merge-window-filter-open');
            R.window = {
                text: flat(s.text && s.text.dialog, 1500),
                headings: (await dlg.locator('h1, h2, h3, .pkp_controllers_grid .header h4, caption').allInnerTexts()).map((x) => flat(x)),
                columns: await gridHeaders(dlg),
                form: await filterForm(dlg),
                rows: (await gridRows(dlg)).map((r) => ({cells: r.cells.slice(0, 5).join(' | '), arrow: r.arrow})),
            };
            await loc(page, 'Merge window: rows', dlg.locator('tr.gridRow'));
            await loc(page, 'Merge window: search box', dlg.locator('form.filter input[name="search"]'));
            await loc(page, 'Merge window: role select', dlg.locator('form.filter select[name="userGroup"]'));
            await loc(page, 'Merge window: no-role box', dlg.locator('form.filter input[name="includeNoRole"]'));
            await loc(page, 'Merge window: Search button', dlg.locator('form.filter').getByRole('button', {name: 'Search'}));
            // filters, both ends
            R.filter = {
                search: await filterRun(page, dlg, {search: 'Chosen'}),
                searchEmail: await filterRun(page, dlg, {search: E('abe')}),
                role: await filterRun(page, dlg, {role: SE}),
                // the box's ticked end is read in phase mtask, on an account left with no role
                reset: await filterRun(page, dlg, {}),
            };
            await snap(page, 'g04-merge-window-reset');
            R.actionsOld = await rowActions(page, dlg, E('old'));
            R.actionsD1 = await rowActions(page, dlg, E('d1'));
            R.actionsNew = await rowActions(page, dlg, E('new'));
            await loc(page, 'Merge window: "Merge into this User" on a row', dlg.getByRole('link', {name: 'Merge into this User'}));
            // confirm: Cancel first
            const newRow = dlg.locator('tr.gridRow').filter({hasText: E('new')}).first();
            const mergeLink = newRow.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Merge into this User'});
            await mergeLink.click();
            const conf = page.locator('[data-cy="dialog"], .ui-dialog, [role="dialog"]').filter({hasText: 'will not exist afterwards'}).last();
            await conf.waitFor({timeout: T});
            s = await snap(page, 'g05-merge-confirm');
            R.confirm = flat(await conf.innerText(), 800);
            R.confirmButtons = (await conf.getByRole('button').allInnerTexts()).map((x) => flat(x));
            await conf.getByRole('button', {name: 'Cancel', exact: true}).click();
            await conf.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await sleep(700);
            R.afterCancelWindowOpen = await dlg.isVisible();
            await mergeLink.click();
            await conf.waitFor({timeout: T});
            const w = page.waitForResponse((r) => r.url().includes('merge-users') && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await conf.getByRole('button', {name: 'OK', exact: true}).click();
            const resp = await w;
            R.okStatus = resp ? resp.status() : null;
            await sleep(1500); await idle(page);
            s = await snap(page, 'g06-after-merge');
            R.windowOpenAfter = await page.locator('tr.gridRow').filter({hasText: 'Merge into this User'}).count();
            R.dialogAfter = flat(s.text && s.text.dialog, 400);
            R.listAfterSame = {old: await rowFacts(page, E('old')), neu: await rowFacts(page, E('new'))};
            await gotoAccess(page, app, B);
            await snap(page, 'g07-list-reload');
            R.listAfterReload = {old: await rowFacts(page, E('old')), neu: await rowFacts(page, E('new')), newMenu: await menuOf(page, E('new'))};
            // Olaf's session
            const op = other.page;
            R.oldSession = await sessionReads(op, app, B, 'g08-old-session');
            R.oldLogin = await tryLogin(op, app, B, U('old'), 'g09-old-login');
            await other.close();
            // what Nell holds now
            R.newEditAfter = await editPage(st.ids.new, 'g10-new-edit-after');
            R.newRolesAfter = await editRoles(page);
            R.sectionAfter = await sectionForm('g11-section-after');
            // the submissions: participants
            const wf = async (id, name) => {
                if (!id) return null;
                await page.goto(app.url(`/index.php/${B}/en/dashboard/editorial?workflowSubmissionId=${id}`));
                await page.getByRole('dialog').first().waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(1500);
                const ss = await snap(page, name);
                return flat(ss.text && (ss.text.dialog || ss.text.main), 2500);
            };
            R.s1 = await wf(st.s1, 'g12-s1-workflow');
            R.s2 = await wf(st.s2, 'g13-s2-workflow');
            // the Comments page (Side effect: public comments)
            await page.goto(app.url(`/index.php/${B}/en/management/settings/userComments`));
            await idle(page); await sleep(1200);
            s = await snap(page, 'g14-comments-page');
            R.comments = flat(s.text && s.text.main, 1200);
        });

        // ── msess: a second merge on a fresh context C (session, masthead choice, comments) ──
        if (on('msess')) await step('msess', async (R) => {
            const c = tag('u53k2m');
            const EX = isOps ? 'Editorial Board Member' : 'Copyeditor';
            await app.api.createContext({tag: c, context: {name: `K2 Merge ${c}`, acronym: 'K2M'}, users: [
                {username: `${c}mgr`, givenName: 'Mia', familyName: 'Mgr', roles: ['manager']},
                {username: `${c}o2`, givenName: 'Otto', familyName: 'Gone', roles: ['author', EXTRA], masthead: {[EXTRA]: false}},
                {username: `${c}n2`, givenName: 'Nina', familyName: 'Kept', roles: ['author']},
            ]});
            const sub = await app.api.createSubmission({tag: `${c}s`, context: c, submitter: `${c}o2`, published: true, title: `K2 Otto article ${c}`,
                userComments: [{user: `${c}o2`, text: `K2 comment by Otto ${c}.`, approved: true}]});
            R.ctx = c; R.sub = sub.submissionId;
            const other = await extra();
            await signIn(other.page, `${c}o2`, {contextPath: c});
            await other.page.goto(app.url(`/index.php/${c}/en/user/profile`));
            await idle(other.page);
            await snap(other.page, 'q01-o2-profile-before');
            await signIn(page, `${c}mgr`, {contextPath: c});
            await page.goto(app.url(`/index.php/${c}/en/management/settings/userComments`));
            await idle(page); await sleep(1200);
            R.commentsBefore = flat((await snap(page, 'q02-comments-before')).text.main, 800);
            await gotoAccess(page, app, c);
            await pickMenu(page, mail(`${c}o2`), 'Edit');
            await page.waitForURL(/management\/settings\/user\//, {timeout: T});
            await idle(page); await sleep(1200);
            await snap(page, 'q03-o2-edit');
            R.o2Roles = await editRoles(page);
            await gotoAccess(page, app, c);
            await pickMenu(page, mail(`${c}o2`), 'Merge user');
            const dlg = page.getByRole('dialog').last();
            await dlg.locator('tr.gridRow').first().waitFor({timeout: T});
            await idle(page);
            await rowActions(page, dlg, mail(`${c}n2`));
            const row = dlg.locator('tr.gridRow').filter({hasText: mail(`${c}n2`)}).first();
            await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Merge into this User'}).click();
            const conf = page.locator('[data-cy="dialog"], .ui-dialog, [role="dialog"]').filter({hasText: 'will not exist afterwards'}).last();
            await conf.waitFor({timeout: T});
            const w = page.waitForResponse((r) => r.url().includes('merge-users') && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await conf.getByRole('button', {name: 'OK', exact: true}).click();
            const resp = await w;
            R.okStatus = resp ? resp.status() : null;
            await sleep(1500); await idle(page);
            await snap(page, 'q04-after-merge');
            R.o2Session = await sessionReads(other.page, app, c, 'q05-o2-session');
            R.o2Login = await tryLogin(other.page, app, c, `${c}o2`, 'q06-o2-login');
            await gotoAccess(page, app, c);
            await pickMenu(page, mail(`${c}n2`), 'Edit');
            await page.waitForURL(/management\/settings\/user\//, {timeout: T});
            await idle(page); await sleep(1200);
            await snap(page, 'q07-n2-edit');
            R.n2Roles = await editRoles(page);
            await page.goto(app.url(`/index.php/${c}/en/management/settings/userComments`));
            await idle(page); await sleep(1200);
            R.commentsAfter = flat((await snap(page, 'q08-comments-after')).text.main, 800);
        });

        // ── mall: roles in every journal, participations, notes, activity log (Rule 17) ──
        if (on('mall')) await step('mall', async (R) => {
            const c = tag('u53k2j');
            const D = `${c}d`;
            await app.api.createContext({tag: D, context: {name: `K2 Second ${c}`, acronym: 'K2D'}, users: [
                {username: `${c}o3`, givenName: 'Oona', familyName: 'Twojournals', roles: ['author']},
            ]});
            await app.api.createContext({tag: c, context: {name: `K2 First ${c}`, acronym: 'K2C'}, users: [
                {username: `${c}o3`, roles: ['author', 'sectionEditor']},
                {username: `${c}n3`, givenName: 'Noel', familyName: 'Target', roles: ['author']},
                {username: `${c}m3`, givenName: 'Mae', familyName: 'Mgr', roles: ['manager']},
            ]});
            // No discussion created by Oona here: that makes the merge fail (phase mtask); MALL_TASK=1 adds one.
            const sub = await app.api.createSubmission({tag: `${c}s`, context: c, submitter: `${c}o3`, title: `K2 Oona submission ${c}`,
                ...(process.env.MALL_TASK ? {tasks: [{title: `K2 talk ${c}`, creator: `${c}o3`, participants: [`${c}o3`, `${c}m3`], message: `K2 note by Oona ${c}.`}]} : {})});
            R.withTask = !!process.env.MALL_TASK;
            R.ctx = c; R.sub = sub.submissionId;
            await signIn(page, 'admin');
            const wf = async (name) => {
                await page.goto(app.url(`/index.php/${c}/en/dashboard/editorial?workflowSubmissionId=${sub.submissionId}`));
                await page.getByRole('dialog').first().waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(1500);
                const s1 = await snap(page, name);
                const out = {workflow: flat(s1.text && (s1.text.dialog || s1.text.main), 2500)};
                const log = page.getByRole('button', {name: 'Activity Log'}).first();
                if (await log.count()) {
                    await log.click(); await sleep(1500); await idle(page);
                    const s2 = await snap(page, `${name}-log`);
                    out.log = flat(s2.text && s2.text.dialog, 2000);
                    await page.getByRole('dialog').last().getByRole('button', {name: 'Close'}).first().click().catch(() => {});
                    await sleep(700);
                }
                return out;
            };
            R.before = await wf('j01-workflow-before');
            await gotoAccess(page, app, c);
            await pickMenu(page, mail(`${c}o3`), 'Merge user');
            const dlg = page.getByRole('dialog').last();
            await dlg.locator('tr.gridRow').first().waitFor({timeout: T});
            await idle(page);
            await rowActions(page, dlg, mail(`${c}n3`));
            const row = dlg.locator('tr.gridRow').filter({hasText: mail(`${c}n3`)}).first();
            await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Merge into this User'}).click();
            const conf = page.locator('[data-cy="dialog"], .ui-dialog, [role="dialog"]').filter({hasText: 'will not exist afterwards'}).last();
            await conf.waitFor({timeout: T});
            const w = page.waitForResponse((r) => r.url().includes('merge-users') && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await conf.getByRole('button', {name: 'OK', exact: true}).click();
            const resp = await w;
            R.okStatus = resp ? resp.status() : null;
            await sleep(1500); await idle(page);
            R.after = await wf('j02-workflow-after');
            // the other journal's list: Noel holds Oona's Author role there now
            await gotoAccess(page, app, D);
            await snap(page, 'j03-other-journal-list');
            R.otherN3 = await rowFacts(page, mail(`${c}n3`));
            R.otherO3 = await rowFacts(page, mail(`${c}o3`));
        });

        // ── dsess: td5 again on a fresh context — the disabled user's open session, both kinds of page ──
        if (on('dsess')) await step('dsess', async (R) => {
            const c = tag('u53k2s');
            await app.api.createContext({tag: c, context: {name: `K2 Session ${c}`, acronym: 'K2S'}, users: [
                {username: `${c}m6`, givenName: 'Mel', familyName: 'Mgr', roles: ['manager']},
                {username: `${c}u6`, givenName: 'Ugo', familyName: 'Session', roles: ['author']},
            ]});
            const other = await extra();
            await signIn(other.page, `${c}u6`, {contextPath: c});
            await other.page.goto(app.url(`/index.php/${c}/en/user/profile`));
            await idle(other.page);
            await snap(other.page, 's01-u6-profile');
            await signIn(page, `${c}m6`, {contextPath: c});
            await gotoAccess(page, app, c);
            await pickMenu(page, mail(`${c}u6`), 'Disable User');
            const dlg = await legacyWindow(page);
            await dlg.locator('textarea[name="disableReason"]').fill('Test');
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await idle(page);
            // a link on the profile page to a page that needs signing in ("Start A New Submission"), clicked
            const op = other.page;
            const link = op.getByRole('link', {name: 'Start A New Submission'}).first();
            R.linkPresent = await link.count();
            if (R.linkPresent) {
                await Promise.all([op.waitForNavigation({timeout: 15000}).catch(() => {}), link.click()]);
            }
            await op.waitForLoadState('load', {timeout: 15000}).catch(() => {});
            await sleep(1000);
            const s1 = await snap(op, 's02-u6-after-click');
            R.afterClick = {url: op.url(), onLogin: /\/login/.test(op.url()), header: flat(s1.text && s1.text.header, 200), main: flat(s1.text && s1.text.main, 300)};
            R.reads = await sessionReads(op, app, c, 's03-u6-session');
        });

        // ── mtask: merging the creator of a discussion, and a participant of one ──
        if (on('mtask')) await step('mtask', async (R) => {
            const c = tag('u53k2t');
            await app.api.createContext({tag: c, context: {name: `K2 Tasks ${c}`, acronym: 'K2T'}, users: [
                {username: `${c}m4`, givenName: 'Moe', familyName: 'Mgr', roles: ['manager']},
                {username: `${c}o4`, givenName: 'Cora', familyName: 'Creator', roles: ['author']},
                {username: `${c}n4`, givenName: 'Nico', familyName: 'Intocreator', roles: ['author']},
                {username: `${c}o5`, givenName: 'Pete', familyName: 'Participant', roles: ['author']},
                {username: `${c}n5`, givenName: 'Nils', familyName: 'Intoparticipant', roles: ['author']},
            ]});
            const s4 = await app.api.createSubmission({tag: `${c}a`, context: c, submitter: `${c}o4`, title: `K2 Cora submission ${c}`,
                tasks: [{title: `K2 Cora talk ${c}`, creator: `${c}o4`, participants: [`${c}o4`, `${c}m4`]}]});
            const s5 = await app.api.createSubmission({tag: `${c}b`, context: c, submitter: `${c}o5`, title: `K2 Pete submission ${c}`,
                tasks: [{title: `K2 Pete talk ${c}`, creator: `${c}m4`, participants: [`${c}m4`, `${c}o5`]}]});
            R.ctx = c; R.s4 = s4.submissionId; R.s5 = s5.submissionId;
            await signIn(page, `${c}m4`, {contextPath: c});
            const merge = async (o, n, name) => {
                const out = {};
                await gotoAccess(page, app, c);
                await pickMenu(page, mail(`${c}${o}`), 'Merge user');
                const dlg = page.getByRole('dialog').last();
                await dlg.locator('tr.gridRow').first().waitFor({timeout: T});
                await idle(page);
                await rowActions(page, dlg, mail(`${c}${n}`));
                const row = dlg.locator('tr.gridRow').filter({hasText: mail(`${c}${n}`)}).first();
                await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Merge into this User'}).click();
                const conf = page.locator('[data-cy="dialog"], .ui-dialog, [role="dialog"]').filter({hasText: 'will not exist afterwards'}).last();
                await conf.waitFor({timeout: T});
                const alerts = [];
                const onD = (d) => { alerts.push({type: d.type(), message: d.message()}); d.dismiss().catch(() => {}); };
                page.on('dialog', onD);
                const w = page.waitForResponse((r) => r.url().includes('merge-users') && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await conf.getByRole('button', {name: 'OK', exact: true}).click();
                const resp = await w;
                out.okStatus = resp ? resp.status() : null;
                await sleep(2500); await idle(page);
                const sa = await snap(page, `${name}-after-ok`);
                out.alerts = alerts.slice();
                out.dialogsOpen = await page.getByRole('dialog').count();
                out.dialogText = flat(sa.text && sa.text.dialog, 800);
                out.mergeWindowStillOpen = await page.locator('tr.gridRow').filter({hasText: mail(`${c}${n}`)}).count();
                page.off('dialog', onD);
                await gotoAccess(page, app, c);
                await snap(page, `${name}-list`);
                out.oldRow = await rowFacts(page, mail(`${c}${o}`));
                out.newRow = await rowFacts(page, mail(`${c}${n}`));
                // the account merged: still findable with no role? (the merge window of the new account, box ticked)
                await pickMenu(page, mail(`${c}${n}`), 'Merge user');
                const d2 = page.getByRole('dialog').last();
                await d2.locator('tr.gridRow').first().waitFor({timeout: T});
                out.oldInNoRoleList = await filterRun(page, d2, {search: `${c}${o}`, noRole: true});
                out.oldInRoleList = await filterRun(page, d2, {search: `${c}${o}`, noRole: false});
                await snap(page, `${name}-norole-search`);
                await d2.getByRole('button', {name: 'Close'}).first().click().catch(() => {});
                await sleep(700);
                return out;
            };
            R.creator = await merge('o4', 'n4', 't01-creator');
            R.creatorLogin = await (async () => { const x = await extra(); return tryLogin(x.page, app, c, `${c}o4`, 't02-creator-login'); })();
            R.participant = await merge('o5', 'n5', 't03-participant');
            R.participantLogin = await (async () => { const x = await extra(); return tryLogin(x.page, app, c, `${c}o5`, 't04-participant-login'); })();
            for (const [k, id] of [['s4', s4.submissionId], ['s5', s5.submissionId]]) {
                await page.goto(app.url(`/index.php/${c}/en/dashboard/editorial?workflowSubmissionId=${id}`));
                await page.getByRole('dialog').first().waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(1500);
                const sw = await snap(page, `t05-${k}-workflow`);
                R[`${k}Workflow`] = flat(sw.text && (sw.text.dialog || sw.text.main), 2000);
            }
        });

        // ── wizard (A10, td11; the older grid's filter, Fields 78–86) ────────
        if (on('wizard')) await step('wizard', async (R) => {
            await signIn(page, 'admin');
            await page.goto(app.url(`/index.php/index/admin/wizard/${st.idB}`));
            await idle(page);
            const tab = page.getByRole('tab', {name: 'Users', exact: true}).first();
            await tab.waitFor({timeout: T});
            await snap(page, 'z01-wizard');
            R.tabs = (await page.getByRole('tab').allInnerTexts()).map((x) => flat(x));
            await tab.click();
            const panel = page.locator('[role="tabpanel"]:visible').last();
            await panel.locator('tr.gridRow').first().waitFor({timeout: T});
            await idle(page); await sleep(500);
            await snap(page, 'z02-wizard-users');
            R.columns = await gridHeaders(panel);
            R.form = await filterForm(panel);
            R.rows = (await gridRows(panel)).map((r) => ({cells: r.cells.slice(0, 5).join(' | '), arrow: r.arrow}));
            R.filter = {
                search: await filterRun(page, panel, {search: 'Chosen'}),
                role: await filterRun(page, panel, {role: SE}),
                noRole: await filterRun(page, panel, {search: 'Amanager', noRole: true}),
                noRoleOff: await filterRun(page, panel, {search: 'Amanager', noRole: false}),
                reset: await filterRun(page, panel, {}),
            };
            R.adminRow = await rowActions(page, panel, 'admin@mail.test');
            R.x = await rowActions(page, panel, E('x'));
            R.d2 = await rowActions(page, panel, E('d2'));
            await snap(page, 'z03-wizard-rows-open');
            await loc(page, 'Settings wizard Users grid: rows', panel.locator('tr.gridRow'));
            // leave with something changed and unsaved: type in the search box, switch tab
            const dialogs = [];
            const onD = (d) => { dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); };
            page.on('dialog', onD);
            await (await openFilter(page, panel)).locator('input[name="search"]').fill('unsaved K2');
            await page.getByRole('tab').first().click();
            await sleep(800);
            await snap(page, 'z04-wizard-tab-switch');
            await page.goto(app.url(`/index.php/index/admin/contexts`));
            await idle(page);
            page.off('dialog', onD);
            R.leaveDialogs = dialogs;
        });
    } finally {
        record(factsName, {errors: F.errors, crashIndex: CRASH}, {merge: true});
        for (const x of OPEN) await x.close().catch(() => {});
        await close();
    }
});
