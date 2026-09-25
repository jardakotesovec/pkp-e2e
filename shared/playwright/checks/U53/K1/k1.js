// U53 claim check, chunk K1: the "Current Users" list on Settings › Users & Roles
// and finding an account in it, on all three apps.
// Spec: docs/specs/U53-users-management.md — Purpose and Actors (10–47), the list's
// and the "Email" window's fields (48–70), Rules 1–9 (112–173), Rule 25 (296–303),
// register A3, A4, A5, A11, OPS1; footnotes n, a, b, c, d, e, f, g, i, o, k, p, q,
// td1, td3, td4, td13, td14, u, f-a3, f-a4, f-a5, f-a11, f-ops1.
//
// Seeds per app (tag prefix u53k1):
//   B  a second journal: y (Author, also in A: out of A's manager's reach), e (Author,
//      Reader in A; B's role removed on screen later), z (Reader, B only).
//   A  the main scratch journal: m (manager), ed (editor) and pe (production editor)
//      [OJS/OMP], w (section editor, affiliation, verified ORCID, own email word),
//      v (unverified ORCID), d (disabled), r (to "Remove User"), p (Reader + an
//      ended Author role), tr (two roles, "Remove Role"), mh (masthead change),
//      s1 (one role), em (Email target), q1/q2 (search words), sp (profile words),
//      plus y and e from B. admin is enrolled as manager by the context factory.
//   P  paging: 30 readers, "Items per page" 3.
//   C  [OJS/OMP] editor role with "Permit changes to Settings" unticked.
//   R  td1: admin given Reader beside the manager role (manager ended on screen).
// Phases (PHASES=a,b narrows; seed kept in k1-state-<app>.json, RESEED=1 re-seeds):
//   pk       publicknowledge, read-only: every level of the roster (list, menus, denial)
//   levels   A: m, ed, pe, admin: the list and each row's menu; C: permit off
//   fields   A as m: columns, icons, roles, dates, placeholder, button name, z absent
//   profile  sp sets a preferred public name, a bio and a reviewing interest
//   search   A as m: Rule 6
//   paging   P as admin and A: Rule 5
//   email    A as m: the Email window (td4, Rule 9)
//   edit     A as m: "Edit" (Rule 8, td e): heading, "Remove Role", masthead change, last role
//   addrole  A as m: a role added on the Edit page goes out as an invitation
//   remove   A as m: "Remove User" on r (Rule 3/A3), y (out of reach), admin (A2)
//   disable  A as m: "Disable User" window on y, admin and w (Actors row 4)
//   ended    admin removes e from B; m's menu for e in A (reach with ended roles)
//   edis     A as m: "Disable User" › "OK" on e (its only other role has ended)
//   tabs     A as m: a tab left with an unsaved change
//   notify   admin: Site Settings "Bulk Emails" on A, the "Notify" tab; restored
//   td1      R: admin with Reader only
//   fr       publicknowledge as manager.maya in French (td13, td14); back to English
//   admin    Administration › Hosted Journals › "Settings wizard" › "Users" (Actors row 8)
//   adduser  the wizard's "Add User" creates an account with a role, no invitation (Purpose)
//
//   PROBE_FEATURE=U53 PROBE_AGENT=ccK1 node bin/probe.js <app|all> shared/playwright/checks/U53/K1/k1.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['pk', 'levels', 'fields', 'profile', 'search', 'paging', 'email', 'edit', 'addrole', 'remove', 'disable', 'ended', 'edis', 'tabs', 'notify', 'td1', 'fr', 'admin', 'adduser'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[u53k1]', new Date().toISOString().slice(11, 19), ...a);
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const factsFile = (app) => path.join(outDir(), `k1-facts-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;
const flat = (s, n = 4000) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const DENIED_ROLE = /does not have access to this operation/i;
const OPTIONS_RE = /management\.options|options/i;

// ---------------------------------------------------------------------------
// Reading helpers

async function snap(page, name, extra = {}) {
    let s;
    try {
        s = await screen(page);
    } catch (e) {
        s = {url: page.url(), title: await page.title().catch(() => null), error: String(e.message).slice(0, 300)};
    }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

/** The editorial side menu (PrimeVue panelmenu), read without clicking (U07 K1). */
async function readNav(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    if (!(await nav.count().catch(() => 0))) return {present: false, groupLabels: [], settingsGroup: null};
    const groups = await nav.locator('[role="button"][aria-controls]').evaluateAll((els) => els.map((e) => {
        const region = document.getElementById(e.getAttribute('aria-controls') || '');
        return {
            label: e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim(),
            items: region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => li.getAttribute('aria-label') || li.textContent.replace(/\s+/g, ' ').trim()) : [],
        };
    })).catch(() => []);
    const settings = groups.find((g) => /^(Settings|Paramètres)$/i.test(g.label)) || null;
    return {present: true, groupLabels: groups.map((g) => `${g.label}${g.items.length ? ' › ' + g.items.join(', ') : ''}`), settingsGroup: settings ? settings.items : null};
}

async function classify(page) {
    const text = (await page.locator('body').innerText().catch(() => '')) || '';
    return {
        url: page.url(),
        title: await page.title().catch(() => null),
        h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)),
        deniedRole: DENIED_ROLE.test(text),
        deniedSnippet: (text.match(/[^\n]*(access|denied|not found|Error|Erreur)[^\n]*/gi) || []).slice(0, 5),
        usersTable: (await page.getByRole('table', {name: /Current Users|##grid\.user\.currentUsers##|Utilisateurs/}).count().catch(() => 0)),
        dialogs: (await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 300)),
    };
}

function usersTable(page) {
    return page.getByRole('table', {name: /Current Users \(|Utilisateurs-trices actuel|##grid\.user\.currentUsers##/});
}
function userRow(page, text) {
    return usersTable(page).locator('tbody tr').filter({hasText: text});
}

/** Open a context's Users & Roles page and wait for the list. */
async function gotoAccess(page, app, ctx, {locale = 'en', wait = true} = {}) {
    const resp = await page.goto(app.url(`/index.php/${ctx}/${locale}/management/settings/access`));
    if (wait) {
        await usersTable(page).waitFor({timeout: T});
        await usersTable(page).locator('tbody tr').first().waitFor({timeout: T}).catch(() => {});
    }
    await idle(page);
    return resp ? resp.status() : null;
}

/** The list as data: heading, columns, rows (cells, role lines, icons, button name), line under it. */
async function readList(page) {
    const out = {};
    out.heading = flat(await page.getByRole('heading', {name: /Current Users|Utilisateurs-trices actuel|##grid\.user\.currentUsers##/}).first().innerText().catch(() => null), 200);
    const table = usersTable(page);
    if (!(await table.count())) return {...out, table: null};
    const data = await table.evaluate((tb) => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const heads = [...tb.querySelectorAll('thead th')].map((th) => ({text: th.textContent.replace(/\s+/g, ' ').trim(), visible: txt(th)}));
        const rows = [...tb.querySelectorAll('tbody tr')].map((tr) => {
            const tds = [...tr.querySelectorAll('td')];
            const lines = (td) => (td ? [...td.querySelectorAll(':scope > div, :scope div.flex')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()) : []);
            const b = tr.querySelector('button');
            return {
                cells: tds.map((td) => td.innerText.replace(/[ \t]+/g, ' ').trim()),
                roleLines: lines(tds[2]),
                dateLines: lines(tds[3]),
                nameIcons: tds[0] ? [...tds[0].querySelectorAll('svg')].map((s) => ({cls: (s.getAttribute('class') || '').slice(0, 120), parentCls: (s.parentElement.getAttribute('class') || '').slice(0, 120), aria: s.getAttribute('aria-label'), hidden: s.getAttribute('aria-hidden')})) : [],
                nameHtml: tds[0] ? tds[0].innerHTML.replace(/\s+/g, ' ').slice(0, 600) : null,
                button: b ? {aria: b.getAttribute('aria-label'), text: txt(b), title: b.getAttribute('title')} : null,
            };
        });
        return {heads, rows};
    });
    out.table = data;
    // The line under the list and the page buttons.
    out.under = await page.evaluate(() => {
        const t = [...document.querySelectorAll('main *')].filter((e) => e.children.length < 6 && /^(Showing|Résultats|Affichage|##common\.showingXofX##)/.test((e.innerText || '').trim()));
        const navs = [...document.querySelectorAll('main nav')].map((n) => ({aria: n.getAttribute('aria-label'), text: n.innerText.replace(/\s+/g, ' ').trim(), buttons: [...n.querySelectorAll('button, a')].map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim())}));
        return {showing: t.length ? t[t.length - 1].innerText.replace(/\s+/g, ' ').trim() : null, navs};
    }).catch((e) => ({error: String(e.message)}));
    out.search = await page.getByRole('searchbox').first().evaluate((i) => ({placeholder: i.getAttribute('placeholder'), aria: i.getAttribute('aria-label'), value: i.value, labelText: i.closest('label') ? i.closest('label').innerText.replace(/\s+/g, ' ').trim() : null})).catch(() => null);
    out.clearButton = await page.getByRole('button', {name: /Clear search phrase|##common\.clearSearch##|Effacer/}).count().catch(() => null);
    out.invitationsHeading = flat(await page.getByRole('heading', {name: /Invitations|##invitation\.header##/}).first().innerText().catch(() => null), 200);
    out.tabs = (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
    out.pageHeading = flat(await page.locator('h1').first().innerText().catch(() => null), 200);
    out.optionsButtonName = await page.getByRole('button', {name: '##userAccess.management.options##'}).count().catch(() => null);
    return out;
}

/** A row's menu items (opens the "…" menu, reads, closes with Escape). */
async function rowMenu(page, text) {
    const row = userRow(page, text).first();
    if (!(await row.count())) return {missing: true};
    const btn = row.locator('button').last();
    const name = await btn.evaluate((b) => b.getAttribute('aria-label')).catch(() => null);
    await btn.click();
    const items = page.getByRole('menuitem');
    await items.first().waitFor({timeout: 10_000}).catch(() => {});
    const labels = (await items.allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
    await closeMenus(page);
    return {button: name, items: labels};
}

/** Close an open row menu: Escape, then the heading clicked, until no menuitem is left. */
async function closeMenus(page) {
    const items = page.getByRole('menuitem');
    for (let i = 0; i < 3 && (await items.count()) > 0; i++) {
        await page.keyboard.press('Escape');
        await sleep(250);
        if ((await items.count()) > 0) await page.locator('h1').first().click({force: true}).catch(() => {});
        await sleep(250);
    }
}

async function pressMenu(page, text, item) {
    await closeMenus(page);
    const row = userRow(page, text).first();
    await row.locator('button').last().click();
    const mi = page.getByRole('menuitem', {name: item, exact: true});
    await mi.waitFor({timeout: 10_000});
    await mi.click();
}

async function dialogInfo(page) {
    const dl = page.locator('[role="dialog"]:visible');
    const n = await dl.count();
    const out = [];
    for (let i = 0; i < n; i++) {
        const d = dl.nth(i);
        out.push({
            text: flat(await d.innerText().catch(() => ''), 1500),
            buttons: (await d.getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)),
            links: (await d.getByRole('link').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)),
        });
    }
    return out;
}

async function notices(page) {
    const a = (await page.locator('.pkp_notification:visible, .ui-pnotify:visible, [role="alert"]:visible, label.error:visible, .pkpFormError:visible, .error:visible, [class*="notif"]:visible, [class*="pnotify"]:visible, [role="status"]:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 300)).filter(Boolean);
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    const b = (body.match(/[^\n]*(Please provide|required|cannot|not have|sufficient permissions|unexpected error|Error)[^\n]*/gi) || []).map((x) => flat(x, 200));
    return [...new Set([...a, ...b])];
}

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const isOps = app.name === 'ops', isOmp = app.name === 'omp';
    const t = tag('u53k1');
    const sec = app.name === 'ojs' ? {sections: ['ART']} : isOps ? {sections: ['PRE']} : {};
    const rev = isOps ? 'author' : 'externalReviewer';
    const S = {t, B: `${t}b`, A: `${t}a`, P: `${t}p`, C: isOps ? null : `${t}c`, R: `${t}r`, u: {}};
    const u = (k) => `${t}${k}`;
    for (const k of ['y', 'e', 'z', 'm', 'ed', 'pe', 'w', 'v', 'd', 'r', 'p', 'tr', 'mh', 's1', 'em', 'q1', 'q2', 'sp']) S.u[k] = u(k);
    S.email = {w: `fennimore${t}@mail.test`, q2: `${t}zz@mail.test`};
    S.orcid = {w: '0000-0002-7453-1916', v: '0000-0003-1419-2405'};
    await app.api.createContext({tag: S.B, users: [
        {username: u('y'), roles: ['author'], givenName: 'Yara', familyName: 'Twohomes'},
        {username: u('e'), roles: ['author'], givenName: 'Emil', familyName: 'Endedelsewhere'},
        {username: u('z'), roles: ['reader'], givenName: 'Zeno', familyName: 'Onlyinb'},
    ]});
    const usersA = [
        {username: u('m'), roles: ['manager'], givenName: 'Mara', familyName: 'Scratchmanager'},
        ...(isOps ? [] : [
            {username: u('ed'), roles: ['editor'], givenName: 'Edda', familyName: 'Leveleditor'},
            {username: u('pe'), roles: ['productionEditor'], givenName: 'Pero', familyName: 'Prodeditor'},
        ]),
        {username: u('w'), roles: ['sectionEditor'], givenName: 'Walter', familyName: 'Inreach', email: S.email.w, affiliation: 'Kestrel Institute', orcid: S.orcid.w, orcidIsVerified: true, ...sec},
        {username: u('v'), roles: ['author'], givenName: 'Vera', familyName: 'Unverified', orcid: S.orcid.v, orcidIsVerified: false},
        {username: u('d'), roles: ['author'], givenName: 'Dora', familyName: 'Disabled', disabled: true},
        {username: u('r'), roles: ['author'], givenName: 'Remy', familyName: 'Toberemoved'},
        {username: u('p'), roles: ['reader'], givenName: 'Pia', familyName: 'Pastrole', pastRoles: [{role: 'author'}]},
        {username: u('tr'), roles: ['author', 'reader'], givenName: 'Tomas', familyName: 'Tworoles'},
        {username: u('mh'), roles: ['sectionEditor'], givenName: 'Mira', familyName: 'Mastheadchange', ...sec},
        {username: u('s1'), roles: ['author'], givenName: 'Sol', familyName: 'Singlerole'},
        {username: u('em'), roles: ['author'], givenName: 'Emma', familyName: 'Emailtarget'},
        {username: u('q1'), roles: ['author'], givenName: 'Quillon', familyName: 'Brightwater'},
        {username: u('q2'), roles: ['author'], givenName: 'Marrowby', familyName: 'Stillwater', email: S.email.q2},
        {username: u('sp'), roles: [rev], givenName: 'Sasha', familyName: 'Profilefields'},
        {username: u('y'), roles: ['author']},
        {username: u('e'), roles: ['reader']},
    ];
    S.resA = await app.api.createContext({tag: S.A, users: usersA});
    const pUsers = [];
    for (let i = 1; i <= 30; i++) pUsers.push({username: `${t}n${i}`, roles: ['reader'], givenName: `Page${String(i).padStart(2, '0')}`, familyName: 'Filler'});
    await app.api.createContext({tag: S.P, itemsPerPage: 3, users: pUsers});
    if (S.C) await app.api.createContext({tag: S.C, roles: {editor: {permitSettings: false}}, users: [{username: `${t}ce`, roles: ['editor'], givenName: 'Cato', familyName: 'Nopermit'}]});
    await app.api.createContext({tag: S.R, users: [{username: 'admin', roles: ['reader']}]});
    return S;
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    const PK = app.contextPath;
    await app.api.bootstrapProbe(PK);
    let S = null;
    if (!process.env.RESEED && fs.existsSync(stateFile(app))) S = JSON.parse(fs.readFileSync(stateFile(app), 'utf8'));
    if (!S) {
        S = await seed(app);
        fs.writeFileSync(stateFile(app), JSON.stringify(S, null, 2));
        log(app.name, 'seeded', S.t);
    }
    const F = fs.existsSync(factsFile(app)) ? JSON.parse(fs.readFileSync(factsFile(app), 'utf8')) : {app: app.name};
    F.errors = F.errors || [];
    const save = () => fs.writeFileSync(factsFile(app), JSON.stringify(F, null, 2));
    const em = (k) => (S.email[k] || `${S.u[k]}@mail.test`);
    const {page, close} = await launch(app);
    const api = [];
    page.on('response', (r) => {
        const url = r.url();
        if (/\/api\/v1\/(users|invitations)|user-grid|\$\$\$call\$\$\$/.test(url)) api.push({phase: F._phase, m: r.request().method(), s: r.status(), url: url.replace(/^.*index\.php/, '').slice(0, 260)});
    });
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({phase: F._phase, type: d.type(), message: d.message()});
        await d.accept().catch(() => {});
    });
    const step = async (name, fn) => {
        F._phase = name;
        log(app.name, 'phase', name);
        try { await fn(); } catch (e) {
            F.errors.push({phase: name, error: String(e.message || e).slice(0, 600)});
            log(app.name, 'ERROR', name, String(e.message || e).slice(0, 300));
            await snap(page, `err-${name}`).catch(() => {});
        }
        F.api = api; F.dialogs = dialogs;
        save();
    };
    const as = async (user, ctx) => { await signIn(page, user, ctx ? {contextPath: ctx} : {}); await idle(page).catch(() => {}); };

    try {
        // ── pk: publicknowledge, every roster level (read-only) ─────────────
        if (on('pk')) await step('pk', async () => {
            const o = F.pk = {};
            // Openers: admin, manager, editor (OJS/OMP).
            const openers = ['admin', 'manager.maya', ...(isOps ? [] : ['editor.diana'])];
            for (const who of openers) {
                await as(who);
                await page.goto(app.url(`/index.php/${PK}/en/submissions`)); await idle(page);
                const nav = await readNav(page);
                const st = await gotoAccess(page, app, PK);
                const s = await snap(page, `pk-${who}-list`);
                const L = await readList(page);
                const rows = L.table ? L.table.rows : [];
                const me = who === 'admin' ? 'admin admin' : `${who}@mail.test`;
                const menus = {};
                menus.own = await rowMenu(page, who === 'admin' ? /admin admin/ : me);
                if (who !== 'admin') menus.admin = await rowMenu(page, /admin admin/);
                menus.reader = await rowMenu(page, 'reader.rosa@mail.test');
                menus.author = await rowMenu(page, 'author.alex@mail.test');
                o[who] = {status: st, nav: nav.settingsGroup, heading: L.heading, first3: rows.slice(0, 3).map((r) => r.cells.slice(0, 2).join(' | ')), rowCount: rows.length, under: L.under, search: L.search, button: rows[0] && rows[0].button, optionsButtonName: L.optionsButtonName, tabs: L.tabs, pageHeading: L.pageHeading, invitationsHeading: L.invitationsHeading, heads: L.table && L.table.heads, menus};
                if (who === 'admin') {
                    await loc(page, 'Users & Roles: the Current Users table', usersTable(page));
                    await loc(page, 'Users & Roles: the "Current Users (n)" heading', page.getByRole('heading', {name: /^Current Users \(/}));
                    await loc(page, 'Users & Roles: the search box', page.getByRole('searchbox'));
                    await loc(page, 'Users & Roles: a row "…" button by accessible name', page.getByRole('button', {name: '##userAccess.management.options##'}));
                    await loc(page, 'Users & Roles: the "Invite to a role" button', page.getByRole('button', {name: 'Invite to a role'}));
                }
            }
            // Non-openers: side menu and the address.
            const others = isOps ? ['sectioneditor.ana', 'assistant.rita', 'author.alex', 'reader.rosa']
                : ['sectioneditor.ana', 'reviewer.julia', 'copyeditor.carla', 'assistant.rita', 'author.alex', 'reader.rosa'];
            o.denied = {};
            for (const who of others) {
                await as(who);
                await page.goto(app.url(`/index.php/${PK}/en/submissions`)); await idle(page);
                const nav = await readNav(page);
                await page.goto(app.url(`/index.php/${PK}/en/management/settings/access`)).catch(() => {});
                await idle(page).catch(() => {});
                const c = await classify(page);
                await snap(page, `pk-denied-${who}`);
                o.denied[who] = {navGroups: nav.groupLabels, settings: nav.settingsGroup, ...c};
            }
            await signOut(page);
        });

        // ── levels: A as m, ed, pe, admin; C with permit off ──────────────────
        if (on('levels')) await step('levels', async () => {
            const o = F.levels = {};
            const rowsOf = {own: null, admin: /admin admin/, m: em('m'), w: em('w'), y: em('y'), e: em('e'), d: em('d'), p: em('p')};
            const who = [['m', S.u.m], ...(isOps ? [] : [['ed', S.u.ed], ['pe', S.u.pe]]), ['admin', 'admin']];
            for (const [k, user] of who) {
                await as(user, S.A);
                await page.goto(app.url(`/index.php/${S.A}/en/submissions`)); await idle(page);
                const nav = await readNav(page);
                const st = await gotoAccess(page, app, S.A);
                await snap(page, `lv-${k}-list`);
                const L = await readList(page);
                const menus = {};
                for (const [rk, sel] of Object.entries(rowsOf)) {
                    if (rk === 'own') { menus.own = await rowMenu(page, k === 'admin' ? /admin admin/ : em(k)); continue; }
                    if (rk === k) continue;
                    if (k === 'admin' && rk === 'admin') continue;
                    menus[rk] = await rowMenu(page, sel);
                }
                o[k] = {status: st, settingsNav: nav.settingsGroup, heading: L.heading, order: (L.table ? L.table.rows : []).map((r) => r.cells[1]), menus};
            }
            // Snapshot of an open menu (m on w's row).
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            await userRow(page, em('w')).locator('button').last().click();
            await page.getByRole('menuitem').first().waitFor({timeout: 10_000});
            await snap(page, 'lv-m-menu-open-w');
            await loc(page, 'Users & Roles: row menu items (portal, page-scoped)', page.getByRole('menuitem'));
            await page.keyboard.press('Escape');
            // C: the editor role with permitSettings off (OJS/OMP).
            if (S.C) {
                await as(`${S.t}ce`, S.C);
                await page.goto(app.url(`/index.php/${S.C}/en/submissions`)); await idle(page);
                const nav = await readNav(page);
                await page.goto(app.url(`/index.php/${S.C}/en/management/settings/access`)).catch(() => {});
                await idle(page).catch(() => {});
                o.permitOff = {nav: nav.groupLabels, settings: nav.settingsGroup, ...(await classify(page))};
                await snap(page, 'lv-permitoff-access');
            }
            await signOut(page);
        });

        // ── fields: A as m ─────────────────────────────────────────────────────
        if (on('fields')) await step('fields', async () => {
            const o = F.fields = {};
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            await snap(page, 'fd-list');
            const L = await readList(page);
            o.list = L;
            const pick = (mail) => (L.table.rows.find((r) => r.cells[1] === mail) || null);
            for (const k of ['w', 'v', 'd', 'p', 'tr', 'y', 'e', 'm']) o[k] = pick(em(k));
            o.adminRow = L.table.rows.find((r) => /admin admin/.test(r.cells[0])) || null;
            o.zListed = L.table.rows.some((r) => r.cells[1] === em('z'));
            await loc(page, 'Users & Roles: the ORCID icon in a Name cell', userRow(page, em('w')).locator('td').first().locator('svg'));
            await loc(page, 'Users & Roles: the disabled icon in a Name cell', userRow(page, em('d')).locator('td').first().locator('svg'));
            // The Invitations block and the "Invite to a role" button.
            o.inviteButton = await page.getByRole('button', {name: 'Invite to a role'}).count();
            o.mainOrder = flat(await page.locator('main').innerText().catch(() => ''), 1200);
            await signOut(page);
        });

        // ── profile: sp sets words the search should find ──────────────────────
        if (on('profile')) await step('profile', async () => {
            const o = F.profile = {};
            const {ProfilePage} = require(path.resolve(__dirname, '../../../pages/ProfilePage.js'));
            await as(S.u.sp, S.A);
            const pr = new ProfilePage(page, S.A);
            await pr.goto('identity');
            await pr.preferredPublicName('en').fill('Ptolemaic Sasha');
            await pr.save();
            o.identity = await notices(page);
            await pr.open('public');
            await pr.expectBioEditorReady();
            await pr.bioEditorBody('en').click();
            await page.keyboard.type('Xylographer by trade');
            await pr.save();
            o.public = await notices(page);
            await pr.open('roles');
            o.interestsBox = await pr.interestsInput().count();
            if (o.interestsBox) {
                await pr.addInterest('Heliotropism');
                await pr.save();
                o.roles = await notices(page);
            }
            await snap(page, 'pf-roles-tab');
            await signOut(page);
        });

        // ── search: Rule 6 on A as m ──────────────────────────────────────────
        if (on('search')) await step('search', async () => {
            const o = F.search = {};
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            const box = page.getByRole('searchbox').first();
            const read = async () => {
                await idle(page);
                const L = await readList(page);
                return {heading: L.heading, emails: (L.table ? L.table.rows : []).map((r) => r.cells[1]), under: L.under && L.under.showing, value: L.search && L.search.value};
            };
            o.initial = await read();
            const run = async (phrase, name) => {
                const before = api.length;
                await box.fill(phrase);
                await box.press('Enter');
                await page.waitForResponse((r) => /\/api\/v1\/users/.test(r.url()) && /searchPhrase/.test(r.url()), {timeout: 10_000}).catch(() => {});
                const r = await read();
                r.requests = api.slice(before).filter((x) => /api\/v1\/users/.test(x.url)).map((x) => `${x.s} ${x.url}`);
                if (name) await snap(page, `se-${name}`);
                return r;
            };
            // 6a: typing alone.
            const before = api.length;
            await box.fill('Quillon');
            await sleep(2500);
            o.typedNoEnter = await read();
            o.typedNoEnter.requests = api.slice(before).filter((x) => /api\/v1\/users/.test(x.url)).map((x) => `${x.s} ${x.url}`);
            await snap(page, 'se-typed-no-enter');
            await box.press('Enter');
            await page.waitForResponse((r) => /\/api\/v1\/users/.test(r.url()), {timeout: 10_000}).catch(() => {});
            o.enter = await read();
            await snap(page, 'se-enter-quillon');
            // × clears.
            const clear = page.getByRole('button', {name: 'Clear search phrase'});
            o.clearCount = await clear.count();
            await loc(page, 'Users & Roles: the × "Clear search phrase" button', clear);
            if (o.clearCount) {
                await clear.first().click();
                await page.waitForResponse((r) => /\/api\/v1\/users/.test(r.url()), {timeout: 10_000}).catch(() => {});
                o.cleared = await read();
                await snap(page, 'se-cleared');
            }
            // 6b: fields, case, part of a word, two words.
            const phrases = {
                caseUpper: 'qUILLON', part: 'uillo', family: 'Brightwater', sameAccount: 'Quillon Brightwater',
                username: S.u.q2, email: 'fennimore', affiliation: 'Kestrel', orcid: '7453-1916',
                preferred: 'Ptolemaic', bio: 'Xylographer', interest: 'Heliotropism',
                role: isOjs ? 'Section' : isOmp ? 'Series' : 'Moderator', roleWordB: 'Author',
                twoAccounts: 'Quillon Marrowby', zzqq: 'zzqq',
            };
            for (const [k, ph] of Object.entries(phrases)) o[k] = await run(ph, ['zzqq', 'twoAccounts', 'roleWordB'].includes(k) ? k : null);
            // 6c: what shows in place of rows.
            await run('zzqq');
            o.zzqqMain = flat(await page.locator('main').innerText().catch(() => ''), 1500);
            o.zzqqTbody = await usersTable(page).locator('tbody').evaluate((b) => b.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
            await signOut(page);
        });

        // ── paging: P as admin; A for the one-page end ────────────────────────
        if (on('paging')) await step('paging', async () => {
            const o = F.paging = {};
            await as('admin');
            await gotoAccess(page, app, S.P);
            await snap(page, 'pg-p-page1');
            let L = await readList(page);
            o.p1 = {heading: L.heading, rows: L.table.rows.length, under: L.under, first: L.table.rows[0].cells[0], last: L.table.rows[L.table.rows.length - 1].cells[0]};
            const nav = page.locator('main nav').last();
            await loc(page, 'Users & Roles: the page buttons', nav);
            // Go to page 2.
            const p2 = page.locator('main nav').last().getByRole('button', {name: /Go to Page 2/i}).first();
            if (await p2.count()) {
                await p2.click();
            } else {
                await page.locator('main nav').last().getByRole('button').filter({hasText: /^2$/}).first().click();
            }
            await page.waitForResponse((r) => /\/api\/v1\/users/.test(r.url()) && /offset=25/.test(r.url()), {timeout: 10_000}).catch(() => {});
            await idle(page);
            L = await readList(page);
            o.p2 = {heading: L.heading, rows: L.table.rows.length, under: L.under, names: L.table.rows.map((r) => r.cells[0])};
            await snap(page, 'pg-p-page2');
            // A new search on page 2 starts at page 1.
            const box = page.getByRole('searchbox').first();
            await box.fill('Filler');
            await box.press('Enter');
            await page.waitForResponse((r) => /\/api\/v1\/users/.test(r.url()) && /searchPhrase=Filler/.test(r.url()), {timeout: 10_000}).catch(() => {});
            await idle(page);
            L = await readList(page);
            o.searchFromP2 = {heading: L.heading, rows: L.table.rows.length, under: L.under, first: L.table.rows[0] && L.table.rows[0].cells[0], req: api.filter((x) => /searchPhrase=Filler/.test(x.url)).map((x) => x.url)};
            await snap(page, 'pg-p-search-from-page2');
            // A: one page.
            await gotoAccess(page, app, S.A);
            L = await readList(page);
            o.a = {heading: L.heading, rows: L.table.rows.length, under: L.under};
            await snap(page, 'pg-a-one-page');
            // The journal's own "Items per page" on P (read on its Setup › Lists tab).
            await page.goto(app.url(`/index.php/${S.P}/en/management/settings/website#setup/lists`));
            await idle(page); await sleep(800);
            o.itemsPerPage = await page.locator('input[name="itemsPerPage"]').first().inputValue().catch(() => null);
            await snap(page, 'pg-p-items-per-page');
            await signOut(page);
        });

        // ── email: the Email window (td4, Rule 9) ─────────────────────────────
        if (on('email')) await step('email', async () => {
            const o = F.email = {};
            const to = em('em');
            const mark = `${S.t}mail`;
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            const openEmail = async () => {
                await pressMenu(page, to, 'Email');
                const form = page.locator('#sendEmailForm');
                await form.waitFor({timeout: T});
                await idle(page);
                await page.waitForFunction(() => ((window.tinymce && window.tinymce.get()) || []).some((e) => /^message/.test(e.id) && e.initialized), undefined, {timeout: T}).catch(() => {});
                return form;
            };
            const typeBody = async (form, text) => {
                await form.frameLocator('iframe').first().locator('body').click();
                await page.keyboard.type(text);
            };
            let form = await openEmail();
            await snap(page, 'em-window');
            o.window = await dialogInfo(page);
            o.toField = await form.locator('input[name="user"]').evaluate((i) => ({value: i.value, disabled: i.disabled, readOnly: i.readOnly})).catch((e) => String(e.message));
            o.subjectValue = await form.locator('input[name="subject"]').inputValue().catch(() => null);
            await loc(page, 'Email window: the form', form);
            await loc(page, 'Email window: "Send Email"', form.getByRole('button', {name: 'Send Email'}));
            await loc(page, 'Email window: "Cancel" (a link)', form.getByRole('link', {name: 'Cancel'}));
            // Empty subject, body "Hello".
            await typeBody(form, `Hello ${mark}a`);
            let before = api.length;
            await form.getByRole('button', {name: 'Send Email'}).click();
            await sleep(1500); await idle(page);
            o.emptySubject = {notices: await notices(page), dialog: await dialogInfo(page), requests: api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`)};
            await snap(page, 'em-empty-subject');
            // Subject Hello, body empty.
            await page.evaluate(() => { const e = (window.tinymce.get() || []).find((x) => /^message/.test(x.id)); if (e) { e.setContent(''); e.fire('change'); } });
            await form.frameLocator('iframe').first().locator('body').click();
            await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Delete');
            await form.locator('input[name="subject"]').fill(`Hello ${mark}b`);
            before = api.length;
            await form.getByRole('button', {name: 'Send Email'}).click();
            await sleep(1500); await idle(page);
            o.emptyBody = {notices: await notices(page), dialog: await dialogInfo(page), requests: api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`)};
            await snap(page, 'em-empty-body');
            // Now a full send.
            await form.locator('input[name="subject"]').fill(`Subject ${mark}c`);
            await form.frameLocator('iframe').first().locator('body').click();
            await page.keyboard.type(`Body text ${mark}c`);
            before = api.length;
            await form.getByRole('button', {name: 'Send Email'}).click();
            await sleep(2000); await idle(page);
            o.sent = {windowOpen: await page.locator('#sendEmailForm').isVisible().catch(() => false), notices: await notices(page), requests: api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`)};
            await snap(page, 'em-after-send');
            try {
                const msg = await app.mail.find({to, contains: `${mark}c`, timeoutMs: 20_000});
                const full = await app.mail.fullMessage(msg.ID);
                o.sent.mail = {from: full.From, to: full.To, replyTo: full.ReplyTo, subject: full.Subject, text: flat(full.Text, 400)};
            } catch (e) { o.sent.mail = String(e.message).slice(0, 300); }
            o.mailA = await app.mail.count({to, contains: `${mark}a`});
            o.mailB = await app.mail.count({to, contains: `${mark}b`});
            // Cancel sends nothing.
            await gotoAccess(page, app, S.A);
            form = await openEmail();
            await form.locator('input[name="subject"]').fill(`Cancelled ${mark}d`);
            await typeBody(form, `Cancelled body ${mark}d`);
            await form.getByRole('link', {name: 'Cancel'}).click();
            await sleep(1500);
            o.cancel = {windowOpen: await page.locator('#sendEmailForm').isVisible().catch(() => false), dialog: await dialogInfo(page)};
            await snap(page, 'em-after-cancel');
            // Bounded negative: a control mail after the cancel (a second full send to m's own row).
            await gotoAccess(page, app, S.A);
            await pressMenu(page, em('m'), 'Email');
            form = page.locator('#sendEmailForm'); await form.waitFor({timeout: T}); await idle(page);
            await page.waitForFunction(() => ((window.tinymce && window.tinymce.get()) || []).some((e) => /^message/.test(e.id) && e.initialized), undefined, {timeout: T}).catch(() => {});
            o.ownRowTo = await form.locator('input[name="user"]').inputValue().catch(() => null);
            await form.locator('input[name="subject"]').fill(`Control ${mark}e`);
            await typeBody(form, `Control ${mark}e`);
            await form.getByRole('button', {name: 'Send Email'}).click();
            await sleep(1500);
            try { await app.mail.find({to: em('m'), contains: `${mark}e`, timeoutMs: 20_000}); o.control = 'arrived'; } catch (e) { o.control = 'none'; }
            o.mailD = await app.mail.count({to, contains: `${mark}d`});
            o.mailCountTo = await app.mail.count({to});
            await signOut(page);
        });

        // ── edit: Rule 8 ──────────────────────────────────────────────────────
        if (on('edit')) await step('edit', async () => {
            const o = F.edit = {};
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            await pressMenu(page, em('tr'), 'Edit');
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T});
            await idle(page); await sleep(800);
            await page.getByRole('button', {name: /Remove Role/}).first().waitFor({timeout: T}).catch(() => {});
            const s = await snap(page, 'ed-tr-page');
            o.url = page.url().replace(/^.*index\.php/, '');
            o.headings = (await page.locator('main h1, main h2, main h3, h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 200));
            o.mainTop = flat(s.text && s.text.main, 700);
            o.roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            // Remove Role on Author.
            const authorRow = page.locator('tr').filter({hasText: /Author/}).filter({has: page.getByRole('button', {name: /Remove Role/})}).first();
            await authorRow.getByRole('button', {name: /Remove Role/}).click();
            const dlg = page.getByRole('dialog').filter({hasText: /Remove Role/}).last();
            await dlg.waitFor({timeout: T});
            o.removeDialog = await dialogInfo(page);
            await snap(page, 'ed-tr-remove-dialog');
            let before = api.length;
            await dlg.getByRole('button', {name: /^Remove Role$/}).click();
            await sleep(1500); await idle(page);
            o.removeReq = api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`);
            o.roleRowsAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            o.afterDialogs = await dialogInfo(page);
            await snap(page, 'ed-tr-after-remove');
            try { const m = await app.mail.find({to: em('tr'), timeoutMs: 20_000}); o.removeMail = {subject: m.Subject, from: m.From && m.From.Address}; } catch (e) { o.removeMail = 'none'; }
            await page.reload(); await idle(page); await sleep(800);
            o.roleRowsReload = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            // Masthead change on mh.
            await gotoAccess(page, app, S.A);
            await pressMenu(page, em('mh'), 'Edit');
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T});
            await idle(page);
            await page.getByRole('button', {name: /Remove Role/}).first().waitFor({timeout: T}).catch(() => {});
            const mrow = page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/})}).first();
            const sel = mrow.getByRole('combobox');
            o.mastheadOptions = await sel.evaluate((s) => [...s.options].map((x) => `${x.value}:${x.text.trim()}`)).catch(() => null);
            o.mastheadBefore = await sel.inputValue().catch(() => null);
            await sel.selectOption({index: o.mastheadBefore === 'true' ? 1 : 0}).catch(async () => { await sel.selectOption('false'); });
            await sleep(600);
            o.mastheadDialog = await dialogInfo(page);
            await snap(page, 'ed-mh-masthead-dialog');
            const mdlg = page.getByRole('dialog').last();
            before = api.length;
            const btns = await mdlg.getByRole('button').allInnerTexts().catch(() => []);
            const confirm = btns.find((b) => !/cancel|close/i.test(b));
            if (confirm) await mdlg.getByRole('button', {name: confirm.trim(), exact: true}).click();
            await sleep(1500); await idle(page);
            o.mastheadReq = api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`);
            o.mastheadAfter = {dialogs: await dialogInfo(page), value: await sel.inputValue().catch(() => null)};
            await snap(page, 'ed-mh-after-masthead');
            try { const m = await app.mail.find({to: em('mh'), timeoutMs: 20_000}); o.mastheadMail = {subject: m.Subject}; } catch (e) { o.mastheadMail = 'none'; }
            await page.reload(); await idle(page); await sleep(800);
            o.mastheadReload = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/})}).first().getByRole('combobox').inputValue().catch(() => null);
            // s1: the only role.
            await gotoAccess(page, app, S.A);
            await pressMenu(page, em('s1'), 'Edit');
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T});
            await idle(page); await sleep(1000);
            const onlyBtn = page.getByRole('button', {name: /Remove Role/});
            o.s1RemoveRole = {count: await onlyBtn.count(), disabled: await onlyBtn.first().isDisabled().catch(() => null)};
            await snap(page, 'ed-s1-page');
            if (o.s1RemoveRole.count && !o.s1RemoveRole.disabled) {
                await onlyBtn.first().click();
                const d2 = page.getByRole('dialog').filter({hasText: /Remove Role/}).last();
                await d2.waitFor({timeout: 10_000}).catch(() => {});
                before = api.length;
                await d2.getByRole('button', {name: /^Remove Role$/}).click().catch(() => {});
                await sleep(1500); await idle(page);
                o.s1RemoveRole.req = api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`);
                o.s1RemoveRole.after = await dialogInfo(page);
                o.s1RemoveRole.notices = await notices(page);
                await snap(page, 'ed-s1-after-remove-last');
                await page.reload(); await idle(page); await sleep(800);
                o.s1RemoveRole.reloadRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            }
            await signOut(page);
        });

        // ── addrole: adding a role on the Edit page leads to an invitation ───
        if (on('addrole')) await step('addrole', async () => {
            const o = F.addrole = {};
            let before;
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            await pressMenu(page, em('s1'), 'Edit');
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T});
            await idle(page); await sleep(800);
            const addBtn = page.getByRole('button', {name: 'Add Another Role'});
            o.addBtn = await addBtn.count();
            if (o.addBtn) {
                await addBtn.click();
                const newRow = page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
                await newRow.waitFor({timeout: 10_000});
                await newRow.getByLabel(/^Select a new role/).selectOption({label: 'Reader'});
                const d = new Date().toISOString().slice(0, 10);
                await newRow.getByRole('textbox').fill(d).catch(() => {});
                await newRow.getByRole('combobox').last().selectOption({label: 'Appear on the masthead'}).catch(() => {});
                await snap(page, 'ed-s1-new-role-row');
                await page.getByRole('button', {name: 'Save And Continue'}).click();
                await page.getByLabel(/^Subject/).waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(800);
                await snap(page, 'ed-s1-compose');
                o.compose = {headings: (await page.locator('h1, h2').allInnerTexts().catch(() => [])).map((x) => flat(x, 120)), send: await page.getByRole('button', {name: 'Invite user to the role'}).count()};
                if (o.compose.send) {
                    await page.getByRole('button', {name: 'Invite user to the role'}).click();
                    await page.getByRole('dialog').filter({hasText: 'Invitation Sent'}).waitFor({timeout: T}).catch(() => {});
                    o.sentDialog = await dialogInfo(page);
                    await snap(page, 'ed-s1-invitation-sent');
                    try { const m = await app.mail.find({to: em('s1'), timeoutMs: 20_000}); o.inviteMail = {subject: m.Subject}; } catch (e) { o.inviteMail = 'none'; }
                }
            }
            await signOut(page);
        });

        // ── remove: Rule 3 / A3, Actors row 5 ─────────────────────────────────
        if (on('remove')) await step('remove', async () => {
            const o = F.remove = {};
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            let L = await readList(page);
            o.before = {heading: L.heading, r: L.table.rows.find((x) => x.cells[1] === em('r'))};
            o.menuBefore = await rowMenu(page, em('r'));
            await pressMenu(page, em('r'), 'Remove User');
            const dlg = page.getByRole('dialog').last();
            await dlg.waitFor({timeout: T});
            o.dialog = await dialogInfo(page);
            await snap(page, 'rm-r-dialog');
            let before = api.length;
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(1500); await idle(page);
            o.req = api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`);
            o.afterDialogs = await dialogInfo(page);
            L = await readList(page);
            o.after = {heading: L.heading, r: L.table.rows.find((x) => x.cells[1] === em('r'))};
            o.menuAfter = await rowMenu(page, em('r'));
            await snap(page, 'rm-r-after');
            await page.reload(); await usersTable(page).waitFor({timeout: T}); await idle(page);
            L = await readList(page);
            o.reload = {heading: L.heading, r: L.table.rows.find((x) => x.cells[1] === em('r'))};
            o.menuReload = await rowMenu(page, em('r'));
            await snap(page, 'rm-r-reload');
            try { await app.mail.find({to: em('r'), timeoutMs: 5000}); o.mailToR = 'some'; } catch (e) { o.mailToR = 'none within 5 s'; }
            // y: out of m's reach.
            o.yMenu = await rowMenu(page, em('y'));
            await pressMenu(page, em('y'), 'Remove User');
            await page.getByRole('dialog').last().waitFor({timeout: T});
            before = api.length;
            await page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(1500); await idle(page);
            o.yReq = api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`);
            o.yDialogs = await dialogInfo(page);
            L = await readList(page);
            o.yAfter = L.table.rows.find((x) => x.cells[1] === em('y'));
            await snap(page, 'rm-y-after');
            // admin's row.
            o.adminMenu = await rowMenu(page, /admin admin/);
            if (o.adminMenu.items && o.adminMenu.items.includes('Remove User')) {
                await pressMenu(page, /admin admin/, 'Remove User');
                await page.getByRole('dialog').last().waitFor({timeout: T});
                before = api.length;
                await page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true}).click();
                await sleep(1500); await idle(page);
                o.adminReq = api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`);
                o.adminDialogs = await dialogInfo(page);
                await snap(page, 'rm-admin-after');
                const close = page.getByRole('dialog').last().getByRole('button').first();
                if (await close.count()) await close.click().catch(() => {});
                await page.reload(); await usersTable(page).waitFor({timeout: T}); await idle(page);
                L = await readList(page);
                o.adminReload = L.table.rows.find((x) => /admin admin/.test(x.cells[0]));
            }
            // y's roles in B, read by admin.
            await as('admin');
            await gotoAccess(page, app, S.B);
            L = await readList(page);
            o.yInB = L.table.rows.find((x) => x.cells[1] === em('y'));
            await snap(page, 'rm-y-in-b');
            await signOut(page);
        });

        // ── disable: the window on rows in and out of reach ───────────────────
        if (on('disable')) await step('disable', async () => {
            const o = F.disable = {};
            await as(S.u.m, S.A);
            for (const [k, sel] of [['y', em('y')], ['admin', /admin admin/], ['w', em('w')]]) {
                await gotoAccess(page, app, S.A);
                const before = api.length;
                await pressMenu(page, sel, 'Disable User');
                await page.getByRole('dialog').last().waitFor({timeout: T});
                await idle(page); await sleep(1200);
                o[k] = {dialogs: await dialogInfo(page), notices: await notices(page), form: await page.locator('#userDisableForm').count(), req: api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`)};
                await snap(page, `ds-${k}-window`);
                if (k === 'y' && o[k].form) {
                    const b2 = api.length;
                    await page.locator('#userDisableForm').getByRole('button', {name: 'OK', exact: true}).click();
                    await sleep(1500); await idle(page);
                    o.yOk = {dialogs: await dialogInfo(page), notices: await notices(page), req: api.slice(b2).map((x) => `${x.m} ${x.s} ${x.url}`)};
                    await snap(page, 'ds-y-after-ok');
                }
                const cancel = page.locator('#userDisableForm').getByRole('link', {name: 'Cancel'});
                if (await cancel.count()) await cancel.click().catch(() => {});
                else await page.getByRole('dialog').last().getByRole('button', {name: /Close/}).first().click().catch(() => {});
                await sleep(800);
            }
            await gotoAccess(page, app, S.A);
            const L = await readList(page);
            o.yRowAfter = L.table.rows.find((x) => x.cells[1] === em('y'));
            await signOut(page);
        });

        // ── ended: reach with a role ended in another journal ─────────────────
        if (on('ended')) await step('ended', async () => {
            const o = F.ended = {};
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            o.eBefore = await rowMenu(page, em('e'));
            o.pMenu = await rowMenu(page, em('p'));
            await as('admin');
            await gotoAccess(page, app, S.B);
            await pressMenu(page, em('e'), 'Remove User');
            await page.getByRole('dialog').last().waitFor({timeout: T});
            await page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(1500); await idle(page);
            const L = await readList(page);
            o.eInB = L.table.rows.find((x) => x.cells[1] === em('e'));
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            o.eAfter = await rowMenu(page, em('e'));
            await snap(page, 'en-a-after');
            // The Disable window on e now (opened, then cancelled).
            await pressMenu(page, em('e'), 'Disable User');
            await page.getByRole('dialog').last().waitFor({timeout: T});
            await idle(page); await sleep(1200);
            o.eDisableWindow = {form: await page.locator('#userDisableForm').count(), notices: await notices(page)};
            await snap(page, 'en-e-disable-window');
            const cancel = page.locator('#userDisableForm').getByRole('link', {name: 'Cancel'});
            if (await cancel.count()) await cancel.click().catch(() => {});
            await signOut(page);
        });

        // ── edis: "Disable User" on e (only an ended role elsewhere) as m ─────
        if (on('edis')) await step('edis', async () => {
            const o = F.edis = {};
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            o.menu = await rowMenu(page, em('e'));
            await pressMenu(page, em('e'), 'Disable User');
            await page.locator('#userDisableForm').waitFor({timeout: T});
            await idle(page);
            const before = api.length;
            await page.locator('#userDisableForm').getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(1500); await idle(page);
            o.req = api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`);
            o.dialogs = await dialogInfo(page);
            o.notices = await notices(page);
            const L = await readList(page);
            o.row = L.table.rows.find((x) => x.cells[1] === em('e'));
            o.menuAfter = await rowMenu(page, em('e'));
            await snap(page, 'ed-e-disabled');
            await signOut(page);
        });

        // ── tabs: left with an unsaved change ─────────────────────────────────
        if (on('tabs')) await step('tabs', async () => {
            const o = F.tabs = {};
            await as(S.u.m, S.A);
            await gotoAccess(page, app, S.A);
            await page.getByRole('tab', {name: 'Site Access Options'}).click();
            await idle(page); await sleep(800);
            await snap(page, 'tb-site-access');
            const radios = page.locator('[role="tabpanel"]:visible input[type="radio"], [role="tabpanel"]:visible input[type="checkbox"]');
            o.inputs = await radios.count();
            const target = radios.first();
            o.firstBefore = await target.isChecked().catch(() => null);
            await target.click({force: true}).catch(() => {});
            o.firstAfterClick = await target.isChecked().catch(() => null);
            const d0 = dialogs.length;
            await page.getByRole('tab', {name: 'Users'}).click();
            await idle(page); await sleep(800);
            o.switchDialogs = dialogs.slice(d0);
            o.switchPage = await dialogInfo(page);
            await snap(page, 'tb-after-switch');
            await page.getByRole('tab', {name: 'Site Access Options'}).click();
            await sleep(600);
            o.firstBackOnTab = await target.isChecked().catch(() => null);
            const d1 = dialogs.length;
            await page.goto(app.url(`/index.php/${S.A}/en/submissions`)).catch((e) => { o.leaveError = String(e.message).slice(0, 200); });
            await idle(page).catch(() => {});
            o.leaveDialogs = dialogs.slice(d1);
            await gotoAccess(page, app, S.A);
            await page.getByRole('tab', {name: 'Site Access Options'}).click();
            await idle(page); await sleep(800);
            o.firstAfterReturn = await page.locator('[role="tabpanel"]:visible input[type="radio"], [role="tabpanel"]:visible input[type="checkbox"]').first().isChecked().catch(() => null);
            await snap(page, 'tb-after-return');
            // The ORCID tab on a context with ORCID off.
            await page.getByRole('tab', {name: 'ORCID'}).click();
            await idle(page); await sleep(600);
            await snap(page, 'tb-orcid');
            await signOut(page);
        });

        // ── notify: the "Notify" tab both ends ────────────────────────────────
        if (on('notify')) await step('notify', async () => {
            const o = F.notify = {};
            await as('admin');
            const tabsOf = async (ctx) => { await gotoAccess(page, app, ctx); return (await page.getByRole('tab').allInnerTexts()).map((x) => flat(x, 60)); };
            o.before = await tabsOf(S.A);
            const setBox = async (value) => {
                await page.goto(app.url('/index.php/index/en/admin/settings'));
                await idle(page);
                await page.locator('#setup-button').first().click().catch(() => {});
                await page.locator('#bulkEmails-button').first().click();
                await idle(page); await sleep(600);
                const box = page.getByRole('checkbox', {name: new RegExp(S.A)});
                const n = await box.count();
                const lab = n ? null : (await page.locator('[role="tabpanel"]:visible label').allInnerTexts()).map((x) => flat(x, 80));
                if (!n) return {n, labels: lab};
                const was = await box.isChecked();
                if (value) await box.check(); else await box.uncheck();
                const form = page.locator('form').filter({has: box}).last();
                const w = page.waitForResponse((r) => /\/api\/v1\/site/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                const r = await w;
                await sleep(800);
                return {n, was, status: r ? r.status() : null};
            };
            o.tick = await setBox(true);
            await snap(page, 'nt-site-bulk-ticked');
            o.ticked = await tabsOf(S.A);
            await snap(page, 'nt-a-tabs-ticked');
            o.untick = await setBox(false);
            o.after = await tabsOf(S.A);
            await signOut(page);
        });

        // ── td1: admin with Reader only in R ──────────────────────────────────
        if (on('td1')) await step('td1', async () => {
            const o = F.td1 = {};
            await as('admin');
            if (!S.td1Ended) {
            await gotoAccess(page, app, S.R);
            await pressMenu(page, /admin admin/, 'Edit');
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T});
            await idle(page);
            await page.getByRole('button', {name: /Remove Role/}).first().waitFor({timeout: T}).catch(() => {});
            o.rowsBefore = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            const mrow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/})}).first();
            if (await mrow.count()) {
                await mrow.getByRole('button', {name: /Remove Role/}).click();
                const dlg = page.getByRole('dialog').filter({hasText: /Remove Role/}).last();
                await dlg.waitFor({timeout: T});
                await dlg.getByRole('button', {name: /^Remove Role$/}).click();
                await sleep(1500); await idle(page).catch(() => {});
            }
            o.rowsAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            await snap(page, 'td1-admin-edit-after');
            S.td1Ended = true; fs.writeFileSync(stateFile(app), JSON.stringify(S, null, 2));
            }
            // Sign in afresh.
            await signOut(page).catch(() => {});
            await as('admin');
            await page.goto(app.url(`/index.php/${S.R}/en/submissions`)).catch(() => {});
            await idle(page).catch(() => {});
            o.nav = await readNav(page);
            await snap(page, 'td1-dashboard');
            for (const [k, p] of [['settingsAccess', 'management/settings/access'], ['access', 'management/access']]) {
                const before = api.length;
                const d0 = dialogs.length;
                const r = await page.goto(app.url(`/index.php/${S.R}/en/${p}`)).catch(() => null);
                await idle(page).catch(() => {}); await sleep(2500);
                o[k] = {status: r ? r.status() : null, ...(await classify(page)), rows: await page.locator('table tbody tr').filter({hasText: '@mail.test'}).count().catch(() => 0), rowText: (await page.locator('table tbody tr').filter({hasText: '@mail.test'}).allInnerTexts().catch(() => [])).map((x) => flat(x, 200)), api: api.slice(before).map((x) => `${x.m} ${x.s} ${x.url}`), browserDialogs: dialogs.slice(d0)};
                await snap(page, `td1-${k}`);
                const ok = page.getByRole('dialog').getByRole('button', {name: 'OK', exact: true});
                if (await ok.count()) { await ok.first().click(); await sleep(800); }
                o[k].navOnPage = await readNav(page);
                o[k].afterOk = await classify(page);
                if (k === 'settingsAccess') {
                    o[k].ownMenu = await rowMenu(page, /admin admin/).catch((e) => String(e.message).slice(0, 200));
                    const b2 = api.length;
                    await page.getByRole('tab', {name: 'Roles'}).click().catch(() => {});
                    await idle(page).catch(() => {}); await sleep(1500);
                    o[k].rolesTab = {...(await classify(page)), api: api.slice(b2).map((x) => `${x.m} ${x.s} ${x.url}`)};
                    await snap(page, 'td1-roles-tab');
                    const ok2 = page.getByRole('dialog').getByRole('button', {name: 'OK', exact: true});
                    if (await ok2.count()) { await ok2.first().click(); await sleep(500); }
                    await page.getByRole('tab', {name: 'Site Access Options'}).click().catch(() => {});
                    await idle(page).catch(() => {}); await sleep(1000);
                    o[k].siteAccessTab = await classify(page);
                    await snap(page, 'td1-site-access-tab');
                }
            }
            await signOut(page);
        });

        // ── fr: French interface on publicknowledge (td13, td14) ──────────────
        if (on('fr')) await step('fr', async () => {
            const o = F.fr = {};
            await as('manager.maya');
            await gotoAccess(page, app, PK, {locale: 'fr_CA', wait: false});
            await page.getByRole('searchbox').first().waitFor({timeout: T});
            await usersTable(page).locator('tbody tr').first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            await snap(page, 'fr-access');
            const L = await readList(page);
            o.list = {heading: L.heading, invitations: L.invitationsHeading, search: L.search, under: L.under, heads: L.table && L.table.heads, button: L.table && L.table.rows[0] && L.table.rows[0].button, tabs: L.tabs, pageHeading: L.pageHeading};
            const rowOf = (mail) => L.table && L.table.rows.find((x) => x.cells[1] === mail);
            o.maya = rowOf('manager.maya@mail.test');
            o.ana = rowOf('sectioneditor.ana@mail.test');
            o.diana = rowOf('editor.diana@mail.test');
            o.menu = await rowMenu(page, 'reader.rosa@mail.test');
            // Another editorial page without a language in the address.
            await page.goto(app.url(`/index.php/${PK}/submissions`)); await idle(page);
            o.nextPage = {nav: (await readNav(page)).groupLabels.slice(0, 4), h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 100)), lang: await page.locator('html').getAttribute('lang').catch(() => null)};
            await snap(page, 'fr-next-page');
            // Back to English.
            await page.goto(app.url(`/index.php/${PK}/en/submissions`)); await idle(page);
            await page.goto(app.url(`/index.php/${PK}/management/settings/access`)); await idle(page);
            o.backLang = await page.locator('html').getAttribute('lang').catch(() => null);
            o.backHeading = flat(await page.locator('h1').first().innerText().catch(() => null), 100);
            await signOut(page);
        });

        // ── admin: the older grid is the Site Administrator's alone ───────────
        if (on('admin')) await step('admin', async () => {
            const o = F.admin = {};
            await as('admin');
            await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page); await sleep(600);
            await snap(page, 'ad-hosted');
            const row = page.locator('tr.gridRow').filter({hasText: S.A}).first();
            o.rowFound = await row.count();
            let href = null;
            if (o.rowFound) {
                await row.locator('a.show_extras').click().catch(() => {});
                await sleep(500);
                const wz = row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: /Settings wizard/i});
                href = await wz.getAttribute('href').catch(() => null);
                await wz.click().catch(() => {});
            }
            await page.waitForURL(/admin\/wizard/, {timeout: T}).catch(() => {});
            await idle(page); await sleep(800);
            o.wizardUrl = page.url().replace(/^.*index\.php/, '');
            await page.locator('#users-button').first().click().catch(() => {});
            await idle(page); await sleep(1500);
            await snap(page, 'ad-wizard-users');
            o.addUser = await page.getByRole('link', {name: 'Add User'}).or(page.getByRole('button', {name: 'Add User'})).count();
            o.tabs = (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
            o.gridTitle = (await page.locator('.pkp_controllers_grid .header h4, .pkp_controllers_grid h4').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
            for (const who of ['manager.maya', S.u.m]) {
                await as(who, who === S.u.m ? S.A : undefined);
                for (const [k, p] of [['contexts', '/index.php/index/en/admin/contexts'], ['wizard', o.wizardUrl && /wizard/.test(o.wizardUrl) ? `/index.php${o.wizardUrl}` : null]]) {
                    if (!p) continue;
                    await page.goto(app.url(p)).catch(() => {});
                    await idle(page).catch(() => {});
                    o[`${who === 'manager.maya' ? 'maya' : 'm'}-${k}`] = await classify(page);
                    await snap(page, `ad-${who === 'manager.maya' ? 'maya' : 'm'}-${k}`);
                }
            }
            await signOut(page);
        });
        // ── adduser: the older grid creates an account and gives a role directly ──
        if (on('adduser')) await step('adduser', async () => {
            const o = F.adduser = {};
            const nu = `${S.t}nu`;
            await as('admin');
            await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page);
            const row = page.locator('tr.gridRow').filter({hasText: S.A}).first();
            await row.locator('a.show_extras').click();
            await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: /Settings wizard/i}).click();
            await page.waitForURL(/admin\/wizard/, {timeout: T});
            await idle(page);
            await page.locator('#users-button').first().click();
            await idle(page); await sleep(1200);
            await page.getByRole('link', {name: 'Add User'}).first().click();
            const form = page.locator('form#userDetailsForm, form[id^="userDetailsForm"]').first();
            await form.waitFor({timeout: T});
            await idle(page); await sleep(500);
            await form.locator('input[name="givenName[en]"]').fill('Nina');
            await form.locator('input[name="familyName[en]"]').fill('Directadd');
            await form.locator('input[name="email"]').fill(`${nu}@mail.test`);
            await form.locator('input[name="username"]').fill(nu);
            await form.locator('input[name="password"]').fill(`${nu}${nu}`.slice(0, 30));
            await form.locator('input[name="password2"]').fill(`${nu}${nu}`.slice(0, 30));
            await snap(page, 'au-step1');
            await form.getByRole('button', {name: /^(OK|Save|Next)$/}).first().click();
            const rform = page.locator('form#userRoleForm');
            await rform.waitFor({timeout: T});
            await idle(page); await sleep(500);
            o.roleBoxes = (await rform.locator('label').allInnerTexts()).map((x) => flat(x, 60)).slice(0, 60);
            await rform.getByRole('checkbox', {name: 'Reader', exact: true}).first().check();
            await snap(page, 'au-step2');
            await rform.getByRole('button', {name: /^(OK|Save)$/}).first().click();
            await sleep(1500); await idle(page);
            o.gridRow = flat(await page.locator('tr.gridRow').filter({hasText: nu}).first().innerText().catch(() => null), 300);
            await snap(page, 'au-after');
            await gotoAccess(page, app, S.A);
            const L = await readList(page);
            o.listRow = (L.table.rows.find((x) => x.cells[1] === `${nu}@mail.test`) || {}).cells || null;
            o.mailCount = await app.mail.count({to: `${nu}@mail.test`});
            await signOut(page);
        });
    } finally {
        F.api = api; F.dialogs = dialogs;
        save();
        await close();
    }
});
