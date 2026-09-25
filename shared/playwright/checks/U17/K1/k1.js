// U17 claim check, chunk K1: who may, the tabs, both windows' fields, refused saves.
// Spec: docs/specs/U17-sections.md — Purpose and Actors (10–48), the "Sections" / "Series" tabs and both windows' field
// tables (52–107), Settings 15 (377–382), Canonical preamble (434–437), Coverage, register A6, OMP1–OMP3; footnotes
// a–m, s, td1–td6, td14, f-a6, f-omp1–f-omp3.
//
//   PROBE_FEATURE=U17 PROBE_AGENT=ccK1 node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/U17/K1/k1.js
//   PHASES=seed,roles,tabs,pkedit,window,series,series2,series3,intake,about,archives,autoassign,endrole,extra,mgrrole,words   (default: all; state in
//   k1-state-<app>.json under the output folder, so a phase can be re-run alone; delete the state file for a fresh seed).
//
// Scratch contexts (tag prefix u17k1):
//   OJS  A  form languages en + fr_CA; section ART "Articles" (policy); review forms "K1 Active Form" (active) and
//           "K1 Inactive Form" (inactive); users mg manager, ed editor, pe productionEditor, se + s2 sectionEditor,
//           ge guestEditor, fc funding, ce copyeditor, au author, rv externalReviewer, rd reader.
//           On screen (window phase): "K1 Second" (abbrev ART again), "K1 Editors Only" (editor-only box, policy),
//           "K1 Closed" (inactive box, policy); the word count "abc" then -5; editors ticked.
//        B  the new journal's own first section only; user mg. The last-active refusal from the window.
//   OPS  A  form languages en + fr_CA; section PRE "Preprints" path "preprints" (policy); users mg, se (Moderator),
//           eb editorialBoardMember, au, rd. On screen: "K1 Second" (path "preprints" again), "K1 Odd" (path "a b/c"),
//           "K1 Editors Only", "K1 Closed".   B  the first section only; user mg.
//   OMP  A  form languages en + fr_CA; categories "Kay Cat" > "Kay Sub"; users mg, ed, pe, se, fc, ce, au, rv, rd.
//           On screen: series "K1 Series" (prefix, subtitle, cover, ISSN, categories, path new-series.v2), "K1 Two",
//           "K1 Restricted" (authors may not submit), "K1 Inactive".   B  no category, no series; users mg, au.
//   OJS C (endrole) a Section editor who also holds the Author role, ticked on "Articles", then the Section editor role ended.
//   D (extra) all apps: a user holding two offered roles; OJS/OMP a Production editor with "Permit changes to Settings"
//     unticked (context key roles). OJS/OPS "K1 Words" (words phase): "Word Count" -5 and an author's draft in it.
// publicknowledge is read only: every role of the roster opens its Settings page and the sections interface address.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'roles', 'tabs', 'pkedit', 'window', 'series', 'series2', 'series3', 'intake', 'about', 'archives', 'autoassign', 'endrole', 'extra', 'mgrrole', 'words'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const PNG = path.join(REPO, 'apps/omp/playwright/fixtures/files/profile-image-400.png');
const SVG = path.join(REPO, 'apps/ojs/playwright/fixtures/files/cover.svg');

// The seeded roster per app (seed-facts "Users"), one line per account; admin first.
const ROSTER = {
    ojs: ['admin', 'manager.maya', 'editor.diana', 'sectioneditor.ana', 'copyeditor.carla', 'layouteditor.leo', 'proofreader.pia', 'assistant.rita', 'reviewer.julia', 'author.alex', 'reader.rosa'],
    omp: ['admin', 'manager.maya', 'editor.diana', 'sectioneditor.ana', 'copyeditor.carla', 'assistant.rita', 'reviewer.julia', 'reviewer.amara', 'author.alex', 'reader.rosa'],
    ops: ['admin', 'manager.maya', 'sectioneditor.ana', 'assistant.rita', 'author.alex', 'reader.rosa'],
};

// A legacy grid as data: heading, header actions, column heads, rows (cells, tick boxes), the empty line.
const GRID = (sel) => {
    const g = document.querySelector(sel);
    if (!g) return null;
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    return {
        heading: [...g.querySelectorAll('h3, h4, .pkp_grid_title, .header span.title')].filter(vis).map((h) => t(h.innerText)),
        headerActions: [...g.querySelectorAll('.header a, .header button, .pkp_linkaction_toolbar a, .actions a')].filter(vis).map((a) => t(a.innerText) || a.title).filter(Boolean),
        th: [...g.querySelectorAll('thead th')].filter(vis).map((h) => t(h.innerText)),
        rows: [...g.querySelectorAll('tbody:not(.empty) tr.gridRow')].filter(vis).map((tr) => ({
            id: tr.id,
            cells: [...tr.querySelectorAll('td')].map((td) => {
                const b = td.querySelector('input[type=checkbox]');
                return b ? {text: t(td.innerText), box: b.checked} : t(td.innerText);
            }),
        })),
        empty: [...g.querySelectorAll('tbody.empty')].filter(vis).map((b) => t(b.innerText)),
        footer: [...g.querySelectorAll('.footer, .gridPaging, .pkp_linkaction_toolbar')].filter(vis).map((f) => t(f.innerText)).filter(Boolean),
    };
};

// A legacy form as data, in screen order: its visible text, every field (name, type, label, maxlength, value, the
// select's options), the visible messages and the dialog's heading.
const FORM = (sel) => {
    const f = document.querySelector(sel);
    if (!f) return null;
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const labelOf = (e) => {
        let l = e.id ? f.querySelector(`label[for="${CSS.escape(e.id)}"]`) : null;
        if (!l) l = e.closest('label');
        return l ? t(l.innerText) : null;
    };
    const dlg = f.closest('[role=dialog]');
    return {
        dialogHeading: dlg ? [...dlg.querySelectorAll('h1, h2, .pkp_modal_panel > .header, .header h2')].filter(vis).map((h) => t(h.innerText)).slice(0, 3) : null,
        text: f.innerText,
        fields: [...f.querySelectorAll('input, select, textarea')].filter((e) => e.type !== 'hidden' || /temporaryFileId|coverImage/.test(e.name)).map((e) => {
            const o = {tag: e.tagName.toLowerCase(), type: e.type, name: e.name, visible: vis(e), label: labelOf(e)};
            if (e.getAttribute('maxlength')) o.maxlength = e.getAttribute('maxlength');
            if (e.getAttribute('accept')) o.accept = e.getAttribute('accept');
            if (e.required || e.classList.contains('required')) o.required = true;
            if (e.type === 'checkbox' || e.type === 'radio') o.checked = e.checked;
            else if (e.tagName === 'SELECT') { o.selected = e.options[e.selectedIndex] ? t(e.options[e.selectedIndex].text) : null; o.options = [...e.options].map((x) => t(x.text)); }
            else o.value = (e.value || '').slice(0, 300);
            if (e.tagName === 'TEXTAREA') o.rich = !!document.getElementById(`${e.id}_ifr`) || e.classList.contains('richContent');
            return o;
        }),
        messages: [...f.querySelectorAll('label.error, .error, .pkp_form_error, .pkp_helpers_error, [class*="Error"], [class*="error"]')].filter(vis)
            .map((e) => ({cls: String(e.className).slice(0, 60), text: t(e.innerText).slice(0, 300), for: e.getAttribute('for')})).filter((x) => x.text),
        buttons: [...f.querySelectorAll('button, a.cancelButton, a.pkp_button, input[type=submit]')].filter(vis).map((b) => t(b.innerText || b.value)),
    };
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k1-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };
    const strip = (u) => (u || '').replace(app.baseURL, '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
    const GRIDSEL = isOMP ? '#seriesGridContainer' : '#sectionsGridContainer';
    const FORMSEL = isOMP ? 'form#seriesForm' : 'form#sectionForm';
    const TAB = isOMP ? 'Series' : 'Sections';

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u17k1');
        S.t = t;
        const u = (p, k, roles, g, fam, extra = {}) => ({username: `${p}${k}`, roles, givenName: g, familyName: fam, ...extra});
        const langs = {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']};
        const mk = async (key, spec) => {
            const p = `${t}${key}`;
            try {
                const r = await app.api.createContext({tag: p, ...spec});
                log('seed', p, 'ok');
                return {path: r.path || p};
            } catch (e) { log('seed FAILED', p, String(e.message).slice(0, 800)); return {path: p, error: String(e.message).slice(0, 800)}; }
        };
        if (isOJS) {
            const p = `${t}a`;
            const users = [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'ed', ['editor'], 'Eddie', 'Editor'), u(p, 'pe', ['productionEditor'], 'Pat', 'Production'),
                u(p, 'se', ['sectionEditor'], 'Sam', 'Section'), u(p, 's2', ['sectionEditor'], 'Sid', 'Second'), u(p, 'ge', ['guestEditor'], 'Gia', 'Guest'),
                u(p, 'fc', ['funding'], 'Fay', 'Funding'), u(p, 'ce', ['copyeditor'], 'Cole', 'Copy'), u(p, 'au', ['author'], 'Amy', 'Author'),
                u(p, 'rv', ['externalReviewer'], 'Rex', 'Reviewer'), u(p, 'rd', ['reader'], 'Rae', 'Reader')];
            S.A = await mk('a', {context: {name: `U17 K1 journal ${t}`, acronym: 'KONE', ...langs},
                sections: [{abbrev: 'ART', title: 'Articles', policy: 'Articles policy K1'}], users,
                reviewForms: [{title: 'K1 Active Form'}, {title: 'K1 Inactive Form', active: false}]});
            S.B = await mk('b', {context: {name: `U17 K1 journal B ${t}`}, users: [u(`${t}b`, 'mg', ['manager'], 'Bea', 'Manager')]});
        } else if (isOPS) {
            const p = `${t}a`;
            const users = [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'se', ['sectionEditor'], 'Sam', 'Section'), u(p, 'eb', ['editorialBoardMember'], 'Eli', 'Board'),
                u(p, 'au', ['author'], 'Amy', 'Author'), u(p, 'rd', ['reader'], 'Rae', 'Reader')];
            S.A = await mk('a', {context: {name: `U17 K1 server ${t}`, acronym: 'KONE', ...langs},
                sections: [{abbrev: 'PRE', title: 'Preprints', path: 'preprints', policy: 'Preprints policy K1'}], users});
            S.B = await mk('b', {context: {name: `U17 K1 server B ${t}`}, users: [u(`${t}b`, 'mg', ['manager'], 'Bea', 'Manager')]});
        } else {
            const p = `${t}a`;
            const users = [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'ed', ['editor'], 'Eddie', 'Editor'), u(p, 'pe', ['productionEditor'], 'Pat', 'Production'),
                u(p, 'se', ['sectionEditor'], 'Sam', 'Section'), u(p, 'fc', ['funding'], 'Fay', 'Funding'), u(p, 'ce', ['copyeditor'], 'Cole', 'Copy'),
                u(p, 'au', ['author'], 'Amy', 'Author'), u(p, 'rv', ['externalReviewer'], 'Rex', 'Reviewer'), u(p, 'rd', ['reader'], 'Rae', 'Reader')];
            S.A = await mk('a', {context: {name: `U17 K1 press ${t}`, acronym: 'KONE', ...langs},
                categories: [{path: 'k1cat', title: 'Kay Cat', children: [{path: 'k1sub', title: 'Kay Sub'}]}], users});
            S.B = await mk('b', {context: {name: `U17 K1 press B ${t}`}, users: [u(`${t}b`, 'mg', ['manager'], 'Bea', 'Manager'), u(`${t}b`, 'au', ['author'], 'Ben', 'Author')]});
            // footnote s: the context scenario refuses series[]
            try { await app.api.createContext({tag: `${t}x`, series: [{path: 'x', title: 'X'}]}); S.seriesKey = 'accepted'; } catch (e) { S.seriesKey = String(e.message).slice(0, 400); }
        }
        S.seeded = true; save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const A = S.A.path;
    const B = S.B.path;
    const au = (k, ctx = A) => `${ctx}${k}`;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: strip(page.url())});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const dialogsSince = (s) => jsDialogs.filter((d) => d.at >= s);
    const consoleMsgs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({at: Date.now(), type: m.type(), t: flat(m.text(), 300)}); });
    page.on('pageerror', (e) => consoleMsgs.push({at: Date.now(), type: 'pageerror', t: flat(e.message, 300)}));
    const bad = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push({at: Date.now(), status: r.status(), m: r.request().method(), url: strip(r.url()).slice(0, 200)}); });
    const since = (arr, s) => arr.filter((x) => x.at >= s);
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, .pkp_notification, .ui-pnotify, [class*="toast"], [class*="Toast"]').forEach((e) => {
                const tx = (e.innerText || '').trim();
                if (tx && !seen.has(e)) { seen.add(e); window.__notices.push({t: tx.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (s) => page.evaluate((x) => (window.__notices || []).filter((n) => n.at >= x).map((n) => n.t), s).catch(() => []);

    async function snap(name, extra = {}, {png = false} = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(name, s);
        if (png) await shot(page, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`, {}, {png: true}).catch(() => {});
            return null;
        }
    }
    let who = 'visitor';
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); who = user; };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    const cu = (ctx, p, l = 'en') => app.url(`/index.php/${ctx}${l ? `/${l}` : ''}${p}`);
    const go = async (url) => {
        const r = await page.goto(url, {waitUntil: 'domcontentloaded'}).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        return r && r.status ? r.status() : r;
    };
    const grid = () => page.locator(GRIDSEL).first();
    const readGrid = async () => page.evaluate(GRID, GRIDSEL);
    const form = () => page.locator(FORMSEL).first();
    const readForm = async () => page.evaluate(FORM, FORMSEL);
    const top = () => page.locator('[role="dialog"]:visible').last();

    // Settings › Journal (Press, Server) › the Sections (Series) tab
    async function openTab(ctx) {
        const status = await go(cu(ctx, '/management/settings/context'));
        const tab = page.getByRole('tab', {name: TAB, exact: true}).first();
        if (!(await tab.count())) return {status, tab: false};
        await tab.click(); await idle(page);
        await grid().waitFor({timeout: T});
        await grid().locator('tr.gridRow, tbody.empty').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await sleep(400);
        return {status, tab: true};
    }
    const rowOf = (title) => grid().locator('tr.gridRow').filter({hasText: title}).first();
    async function rowLinks(title) {
        const row = rowOf(title);
        const tog = row.locator('a.show_extras');
        if (await tog.count()) { await tog.first().click(); await sleep(400); }
        const id = await row.getAttribute('id');
        const next = page.locator(`tr#${id} + tr`);
        return {next, links: (await next.locator('a:visible').allInnerTexts()).map((x) => flat(x))};
    }
    async function openEdit(title) {
        const {next} = await rowLinks(title);
        await next.getByRole('link', {name: 'Edit', exact: true}).first().click();
        await form().locator('input[name^="title"]').first().waitFor({timeout: T});
        await idle(page); await sleep(700);
    }
    async function openCreate() {
        const name = isOMP ? /Add Series/ : /Create Section/;
        await grid().getByRole('link', {name}).first().click();
        await form().locator('input[name^="title"]').first().waitFor({timeout: T});
        await idle(page); await sleep(700);
    }
    // Save and read what follows: the window (open or closed), its messages, the notices, dialogs, failed requests.
    async function pressSave(label) {
        const t0 = Date.now();
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /(update|save)(Section|Series)|sections|series/i.test(r.url()), {timeout: T}).catch(() => null);
        await form().getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        await sleep(1200); await idle(page).catch(() => {});
        const open = await form().isVisible().catch(() => false);
        const out = {label, post: r ? {status: r.status(), url: strip(r.url()).slice(0, 160)} : null, windowOpen: open,
            form: open ? await readForm() : null, notices: await noticesSince(t0), dialogs: dialogsSince(t0), failed: since(bad, t0), console: since(consoleMsgs, t0)};
        await snap(label, {save: {post: out.post, windowOpen: open, notices: out.notices, dialogs: out.dialogs, failed: out.failed}});
        return out;
    }
    async function closeWindow() {
        const btn = top().getByRole('button', {name: 'Close'}).first();
        if (await btn.count()) await btn.click().catch(() => {});
        await sleep(900);
    }
    async function fillLocale(name, locale, value) {
        const main = form().locator(`input[name="${name}[en]"]`).first();
        if (locale === 'en') { await main.fill(value); return; }
        await main.focus(); await sleep(400);
        const other = form().locator(`input[name="${name}[${locale}]"]`).first();
        await other.waitFor({state: 'visible', timeout: 5000}).catch(() => {});
        await other.fill(value);
        await main.focus();
    }
    async function typeInto(locator, text) { await locator.fill(''); await locator.pressSequentially(text, {delay: 0}); return (await locator.inputValue()).length; }

    // ================================================================== roles: who opens Settings (publicknowledge, read only)
    if (on('roles')) await sect('roles', async () => {
        const out = {};
        const list = ROSTER[app.name].map((u2) => ({user: u2, ctx: 'publicknowledge'}));
        if (isOJS) list.push({user: au('pe'), ctx: A}, {user: au('ge'), ctx: A}, {user: au('fc'), ctx: A});
        if (isOMP) list.push({user: au('pe'), ctx: A});
        if (isOPS) list.push({user: au('eb'), ctx: A}, {user: au('se'), ctx: A});
        for (const {user, ctx} of list) {
            const o = {};
            await as(user, ctx);
            const t0 = Date.now();
            o.status = await go(cu(ctx, '/management/settings/context'));
            o.url = strip(page.url());
            o.h1 = flat(await page.locator('h1').first().innerText().catch(() => null), 120);
            o.tabs = (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => flat(x));
            o.failed = since(bad, t0);
            const tab = page.getByRole('tab', {name: TAB, exact: true}).first();
            o.hasTab = (await tab.count()) > 0;
            if (o.hasTab) {
                await tab.click(); await idle(page);
                await grid().waitFor({timeout: T}).catch(() => {});
                await sleep(500);
                o.grid = await readGrid();
            } else {
                o.body = flat(await page.locator('body').innerText().catch(() => ''), 400);
            }
            await snap(`r-${user.replace(/[^a-z0-9]/gi, '-')}-settings`, {facts: o});
            out[user] = o;
            log(user, JSON.stringify({status: o.status, url: o.url, h1: o.h1, hasTab: o.hasTab}));
        }
        await visitor();
        out.visitorSettings = {status: await go(cu('publicknowledge', '/management/settings/context')), url: strip(page.url())};
        await snap('r-visitor-settings', {facts: out.visitorSettings});
        fact('roles', out);
    });

    // ================================================================== tabs: the seeded table read as manager (td1), the one-row / empty tables
    if (on('tabs')) await sect('tabs', async () => {
        const out = {};
        await as('manager.maya', 'publicknowledge');
        out.pk = await openTab('publicknowledge');
        out.pk.h1 = flat(await page.locator('h1').first().innerText().catch(() => null), 120);
        out.pk.grid = await readGrid();
        await snap('t-01-pk-grid', {grid: out.pk.grid}, {png: true});
        await loc(page, `Settings › ${TAB} tab: the grid ${GRIDSEL}`, grid());
        const first = out.pk.grid.rows[0] && out.pk.grid.rows[0].cells[0];
        if (first) {
            const row = rowOf(typeof first === 'string' ? first : first.text);
            await loc(page, `${TAB} row: arrow a.show_extras`, row.locator('a.show_extras'));
            const r = await rowLinks(typeof first === 'string' ? first : first.text);
            out.pk.rowLinks = r.links;
            await snap('t-02-pk-row-open', {rowLinks: r.links});
            await loc(page, `${TAB} row controls: "Edit" link (next tr)`, r.next.getByRole('link', {name: 'Edit', exact: true}));
            await loc(page, `${TAB} row controls: "Delete" link (next tr)`, r.next.getByRole('link', {name: 'Delete', exact: true}));
        }
        // the scratch B context: its one section (OJS, OPS) or no series (OMP)
        await as(au('mg', B), B);
        out.B = await openTab(B);
        out.B.grid = await readGrid();
        await snap('t-03-b-grid', {grid: out.B.grid}, {png: true});
        await visitor();
        fact('tabs', out);
    });

    // ================================================================== pkedit: the seeded first row's "Edit" window, read and closed unchanged
    if (on('pkedit')) await sect('pkedit', async () => {
        const out = {};
        await as('manager.maya', 'publicknowledge');
        await openTab('publicknowledge');
        const g = await readGrid();
        for (const r of g.rows) {
            const name = typeof r.cells[0] === 'string' ? r.cells[0] : r.cells[0].text;
            const tname = name.replace(/^Settings\s+/, '');
            await openEdit(tname);
            out[tname] = await readForm();
            await snap(`k-pk-edit-${tname.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, {form: out[tname]});
            await closeWindow();
            await sleep(700);
        }
        await visitor();
        fact('pkedit', out);
    });

    // ================================================================== window: the section window (OJS, OPS)
    if (on('window') && !isOMP) await sect('window', async () => {
        const out = {};
        await as(au('mg'), A);
        await openTab(A);
        out.grid0 = await readGrid();
        await snap('w-00-grid-one-row', {grid: out.grid0});
        // the new section's window as it opens
        await openCreate();
        out.create = await readForm();
        await snap('w-01-create-window', {form: out.create}, {png: true});
        await loc(page, 'Section window: form#sectionForm', form());
        await loc(page, 'Section window: "Section title" input[name="title[en]"]', form().locator('input[name="title[en]"]'));
        await loc(page, 'Section window: "Abbreviation" input[name="abbrev[en]"]', form().locator('input[name="abbrev[en]"]'));
        await loc(page, 'Section window: "Save" button', form().getByRole('button', {name: 'Save', exact: true}));
        if (isOPS) await loc(page, 'Section window: "Section URL Path" input[name="path"]', form().locator('input[name="path"]'));
        // the French twin of the title
        await form().locator('input[name="title[en]"]').focus(); await sleep(500);
        out.frenchTwin = {visible: await form().locator('input[name="title[fr_CA]"]').isVisible().catch(() => null), count: await form().locator('input[name="title[fr_CA]"]').count()};
        await snap('w-02-create-title-focused', {frenchTwin: out.frenchTwin});
        await form().locator('input[name="title[en]"]').blur().catch(() => {});
        // refused saves
        out.empty = await pressSave('w-03-save-empty');
        await fillLocale('title', 'en', ' ');
        await fillLocale('abbrev', 'en', 'Test');
        if (isOPS) await form().locator('input[name="path"]').fill('spaces');
        out.spaceTitle = await pressSave('w-04-save-space-title');
        if (!out.spaceTitle.windowOpen) { S.leftover1 = true; await openCreate(); }
        await fillLocale('title', 'en', 'Test');
        await fillLocale('abbrev', 'en', ' ');
        out.spaceAbbrev = await pressSave('w-05-save-space-abbrev');
        if (!out.spaceAbbrev.windowOpen) { S.leftover2 = true; await openCreate(); }
        // the French title alone
        await fillLocale('title', 'en', '');
        await fillLocale('title', 'fr_CA', 'Titre seulement');
        await fillLocale('abbrev', 'en', 'FRO');
        out.frenchOnly = await pressSave('w-06-save-french-only');
        if (!out.frenchOnly.windowOpen) { S.leftover3 = true; await openCreate(); }
        await fillLocale('title', 'fr_CA', '');
        // lengths: 81 characters typed
        const s81 = 'x'.repeat(81);
        out.titleTyped81 = await typeInto(form().locator('input[name="title[en]"]'), s81);
        out.abbrevTyped81 = await typeInto(form().locator('input[name="abbrev[en]"]'), s81);
        if (isOPS) {
            out.pathTyped81 = await typeInto(form().locator('input[name="path"]'), s81);
            // the path empty, the rest filled
            await fillLocale('title', 'en', 'Path Test');
            await fillLocale('abbrev', 'en', 'PT');
            await form().locator('input[name="path"]').fill('');
            out.emptyPath = await pressSave('w-07-save-empty-path');
            if (!out.emptyPath.windowOpen) { S.leftover4 = true; await openCreate(); }
        }
        // the word count box: its length
        const wc = form().locator('input[name="wordCount"]');
        out.wordCountTyped81 = (await wc.count()) ? await typeInto(wc, '9'.repeat(81)) : null;
        await wc.fill('').catch(() => {});
        // a valid save: "K1 Second", abbreviation ART again (the first section's), OPS path "preprints" again
        await fillLocale('title', 'en', 'K1 Second');
        await fillLocale('abbrev', 'en', 'ART');
        if (isOPS) await form().locator('input[name="path"]').fill('preprints');
        if (isOPS) await fillLocale('abbrev', 'en', 'PRE');
        out.valid = await pressSave('w-08-save-valid');
        out.gridAfter = await readGrid();
        await snap('w-09-grid-after-create', {grid: out.gridAfter}, {png: true});
        await page.reload(); await idle(page);
        await openTab(A);
        out.gridAfterReload = await readGrid();
        await snap('w-10-grid-after-reload', {grid: out.gridAfterReload});
        if (isOPS) {
            // the odd path
            await openCreate();
            await fillLocale('title', 'en', 'K1 Odd');
            await fillLocale('abbrev', 'en', 'ODD');
            await form().locator('input[name="path"]').fill('a b/c');
            out.oddPath = await pressSave('w-11-save-odd-path');
            if (out.oddPath.windowOpen) await closeWindow();
        }
        // the edit window: heading, word count "abc" then -5, read after the save and after a reload
        await openEdit('K1 Second');
        out.edit = await readForm();
        await snap('w-12-edit-window', {form: out.edit}, {png: true});
        await form().locator('input[name="wordCount"]').fill('abc');
        out.wcAbc = await pressSave('w-13-save-wordcount-abc');
        if (out.wcAbc.windowOpen) await closeWindow();
        await openEdit('K1 Second');
        out.wcAbcReopen = await form().locator('input[name="wordCount"]').inputValue();
        await form().locator('input[name="wordCount"]').fill('-5');
        out.wcNeg = await pressSave('w-14-save-wordcount-neg');
        if (out.wcNeg.windowOpen) await closeWindow();
        await openEdit('K1 Second');
        out.wcNegReopen = await form().locator('input[name="wordCount"]').inputValue();
        await closeWindow();
        await page.reload(); await idle(page); await openTab(A);
        await openEdit('K1 Second');
        out.wcNegAfterReload = await form().locator('input[name="wordCount"]').inputValue();
        await snap('w-15-edit-after-reload', {wordCount: out.wcNegAfterReload});
        // Editorial Assignments on "Articles": tick the Section editor and the Editor
        await closeWindow();
        await openEdit(isOPS ? 'Preprints' : 'Articles');
        out.editFirst = await readForm();
        await snap('w-16-edit-first-section', {form: out.editFirst});
        const boxes = form().locator('input[type=checkbox]');
        const ticks = isOPS ? [/Sam Section/] : [/Sam Section/, /Eddie Editor/, /Sid Second/];
        for (const rx of ticks) {
            const b = form().getByRole('checkbox', {name: rx}).first();
            if (await b.count()) await b.check();
        }
        await loc(page, 'Section window: an "Editorial Assignments" box getByRole(checkbox, {name: /Assign .* as/})', form().getByRole('checkbox', {name: /^Assign .* as /}));
        out.assignSave = await pressSave('w-17-save-assignments');
        out.gridAssigned = await readGrid();
        await snap('w-18-grid-editors', {grid: out.gridAssigned});
        S.assigned = true; save();
        // "K1 Editors Only" and "K1 Closed", each with a policy
        const policy = async (text) => {
            const ta = form().locator('textarea[name^="policy"]').first();
            const id = await ta.getAttribute('id');
            await page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, id, {timeout: 15000}).catch(() => {});
            await page.evaluate(([i, v]) => window.tinymce.get(i).setContent(`<p>${v}</p>`), [id, text]);
        };
        for (const [name, abbrev, boxRx] of [['K1 Editors Only', 'EDO', /Items can only be submitted by/], ['K1 Closed', 'CLO', /Mark this section as inactive/]]) {
            await openCreate();
            await fillLocale('title', 'en', name);
            await fillLocale('abbrev', 'en', abbrev);
            if (isOPS) await form().locator('input[name="path"]').fill(abbrev.toLowerCase());
            await policy(`${name} policy`);
            await form().getByRole('checkbox', {name: boxRx}).first().check();
            out[`save ${name}`] = await pressSave(`w-19-save-${abbrev.toLowerCase()}`);
            if (out[`save ${name}`].windowOpen) await closeWindow();
        }
        out.gridAll = await readGrid();
        await snap('w-20-grid-all', {grid: out.gridAll}, {png: true});
        // leave the window changed and unsaved: its "Close", then its "Cancel", then the page itself
        await openEdit('K1 Second');
        await fillLocale('title', 'en', 'K1 Second CHANGED');
        await form().locator('input[name="title[en]"]').blur();
        let t0 = Date.now();
        await closeWindow();
        out.leaveClose = {dialogs: dialogsSince(t0), windowOpen: await form().isVisible().catch(() => false)};
        await snap('w-21-left-by-close', {leave: out.leaveClose});
        await sleep(600);
        await openEdit('K1 Second');
        out.afterCloseTitle = await form().locator('input[name="title[en]"]').inputValue();
        await fillLocale('title', 'en', 'K1 Second CHANGED');
        await form().locator('input[name="title[en]"]').blur();
        t0 = Date.now();
        await form().getByRole('link', {name: 'Cancel'}).first().click().catch(async () => { await form().locator('a:has-text("Cancel")').first().click(); });
        await sleep(900);
        out.leaveCancel = {dialogs: dialogsSince(t0), windowOpen: await form().isVisible().catch(() => false)};
        await snap('w-22-left-by-cancel', {leave: out.leaveCancel});
        await sleep(600);
        await openEdit('K1 Second');
        await fillLocale('title', 'en', 'K1 Second CHANGED');
        await form().locator('input[name="title[en]"]').blur();
        t0 = Date.now();
        await go(cu(A, '/submissions'));
        out.leavePage = {dialogs: dialogsSince(t0), url: strip(page.url())};
        await openTab(A);
        out.gridAfterLeave = await readGrid();
        await snap('w-23-left-by-page', {leave: out.leavePage, grid: out.gridAfterLeave});
        // B: its one section: "Edit", every box as it arrives, the inactive box ticked and saved (Rule 6)
        await as(au('mg', B), B);
        await openTab(B);
        const g = await readGrid();
        const only = g.rows[0] && (typeof g.rows[0].cells[0] === 'string' ? g.rows[0].cells[0] : g.rows[0].cells[0].text);
        await openEdit(only);
        out.bFirst = await readForm();
        await snap('w-24-b-first-section', {form: out.bFirst});
        await form().getByRole('checkbox', {name: /Mark this section as inactive/}).first().check();
        out.bLastInactive = await pressSave('w-25-b-last-active-refused');
        if (out.bLastInactive.windowOpen) await closeWindow();
        out.bGridAfter = await readGrid();
        await openCreate();
        out.bCreate = await readForm();
        await snap('w-26-b-create-window', {form: out.bCreate});
        await closeWindow();
        await visitor();
        fact('window', out);
    });

    // ================================================================== series: the series window (OMP)
    if (on('series') && isOMP) await sect('series', async () => {
        const out = {};
        // B: no series, no category; one series added, deactivated, deleted (OMP1)
        await as(au('mg', B), B);
        await openTab(B);
        out.bGrid0 = await readGrid();
        await snap('s-00-b-no-series', {grid: out.bGrid0}, {png: true});
        await openCreate();
        out.bCreate = await readForm();
        await snap('s-01-b-add-window', {form: out.bCreate});
        await fillLocale('title', 'en', 'Solo');
        await form().locator('input[name="path"]').fill('solo');
        out.bSave = await pressSave('s-02-b-save-solo');
        out.bGrid1 = await readGrid();
        // the Inactive box of the only series
        let t0 = Date.now();
        await rowOf('Solo').locator('input[type=checkbox]').first().click();
        await sleep(1200);
        const conf = top();
        out.bDeactivateAsk = flat(await conf.innerText().catch(() => null), 400);
        await snap('s-03-b-deactivate-ask', {ask: out.bDeactivateAsk});
        await conf.getByRole('button', {name: 'OK', exact: true}).first().click().catch(() => {});
        await sleep(1500); await idle(page);
        out.bDeactivate = {notices: await noticesSince(t0), failed: since(bad, t0), grid: await readGrid()};
        await snap('s-04-b-deactivated', {res: out.bDeactivate});
        await page.reload(); await idle(page); await openTab(B);
        out.bGridReload = await readGrid();
        // delete the last series
        t0 = Date.now();
        const {next} = await rowLinks('Solo');
        await next.getByRole('link', {name: 'Delete', exact: true}).first().click();
        await sleep(1000);
        out.bDeleteAsk = flat(await top().innerText().catch(() => null), 400);
        await snap('s-05-b-delete-ask', {ask: out.bDeleteAsk});
        await top().getByRole('button', {name: 'OK', exact: true}).first().click().catch(() => {});
        await sleep(1500); await idle(page);
        out.bDelete = {notices: await noticesSince(t0), failed: since(bad, t0), grid: await readGrid()};
        await snap('s-06-b-deleted', {res: out.bDelete}, {png: true});

        // A: the window with categories
        await as(au('mg'), A);
        await openTab(A);
        out.grid0 = await readGrid();
        await openCreate();
        out.create = await readForm();
        await snap('s-07-add-window', {form: out.create}, {png: true});
        await loc(page, 'Series window: form#seriesForm', form());
        await loc(page, 'Series window: "Path" input[name="path"]', form().locator('input[name="path"]'));
        await loc(page, 'Series window: cover uploader input[type=file]', form().locator('input[type=file]'));
        await loc(page, 'Series window: "Online ISSN" input[name="onlineIssn"]', form().locator('input[name="onlineIssn"]'));
        out.fileInputs = await form().locator('input[type=file]').evaluateAll((els) => els.map((e) => ({accept: e.getAttribute('accept'), name: e.name, multiple: e.multiple})));
        // the plupload settings as the page configured them
        out.plupload = await page.evaluate(() => {
            const r = [];
            if (window.plupload && window.plupload.instances) for (const u of Object.values(window.plupload.instances || {})) r.push(u.settings && u.settings.filters);
            return r;
        }).catch(() => null);
        // refused saves
        out.empty = await pressSave('s-08-save-empty');
        await fillLocale('title', 'en', ' ');
        await form().locator('input[name="path"]').fill('test');
        out.spaceTitle = await pressSave('s-09-save-space-title');
        if (!out.spaceTitle.windowOpen) { S.leftover1 = true; await openCreate(); }
        await fillLocale('title', 'en', 'K1 Series');
        await form().locator('input[name="path"]').fill('new series');
        out.pathSpace = await pressSave('s-10-save-path-space');
        await form().locator('input[name="path"]').fill('');
        out.pathEmpty = await pressSave('s-11-save-path-empty');
        await form().locator('input[name="path"]').fill('new-series.v2');
        await form().locator('input[name="onlineIssn"]').fill('1234');
        out.issnBad = await pressSave('s-12-save-issn-1234');
        await form().locator('input[name="onlineIssn"]').fill('0378-5955');
        await form().locator('input[name="printIssn"]').fill('0378-5955');
        out.issnSame = await pressSave('s-13-save-issn-same');
        out.pathTyped33 = await typeInto(form().locator('input[name="path"]'), 'p'.repeat(33));
        out.issnTyped17 = await typeInto(form().locator('input[name="printIssn"]'), '1'.repeat(17));
        const sub = form().locator('input[name^="subtitle"]').first();
        out.subtitleTyped256 = await typeInto(sub, 's'.repeat(256));
        await form().locator('input[name="printIssn"]').fill('');
        // the valid series: prefix, subtitle, description, ISSN, categories, an editor, the PNG cover
        await fillLocale('prefix', 'en', 'The');
        await sub.fill('Sub K1');
        await form().locator('input[name="path"]').fill('new-series.v2');
        const desc = form().locator('textarea[name^="description"]').first();
        const did = await desc.getAttribute('id').catch(() => null);
        if (did) {
            await page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, did, {timeout: 15000}).catch(() => {});
            await page.evaluate(([i]) => window.tinymce.get(i).setContent('<p>K1 series description</p>'), [did]).catch(() => {});
        }
        for (const rx of [/Kay Cat/, /Kay Sub/]) { const b = form().getByRole('checkbox', {name: rx}).first(); if (await b.count()) await b.check(); }
        const seBox = form().getByRole('checkbox', {name: /Sam Section/}).first();
        if (await seBox.count()) await seBox.check();
        t0 = Date.now();
        await form().locator('input[type=file]').first().setInputFiles(PNG);
        await sleep(3000); await idle(page);
        out.pngUpload = {failed: since(bad, t0), text: flat(await form().innerText(), 800)};
        await snap('s-14-png-uploaded', {upload: out.pngUpload});
        out.valid = await pressSave('s-15-save-valid');
        if (out.valid.windowOpen) await closeWindow();
        out.gridValid = await readGrid();
        await snap('s-16-grid-after-save', {grid: out.gridValid}, {png: true});
        await page.reload(); await idle(page); await openTab(A);
        out.gridReload = await readGrid();
        // reopen: "Current Image" and its "Delete"
        await openEdit('K1 Series');
        out.edit = await readForm();
        await snap('s-17-edit-window', {form: out.edit}, {png: true});
        const del = form().getByRole('link', {name: 'Delete', exact: true}).first();
        out.coverDeleteLink = await del.count();
        if (out.coverDeleteLink) {
            await loc(page, 'Series window: cover "Delete" link', del);
            t0 = Date.now();
            await del.click(); await sleep(1000);
            out.coverDeleteAsk = flat(await top().innerText().catch(() => null), 400);
            await snap('s-18-cover-delete-ask', {ask: out.coverDeleteAsk, dialogs: dialogsSince(t0)});
            await top().getByRole('button', {name: 'OK', exact: true}).first().click().catch(() => {});
            await sleep(1500); await idle(page);
            out.coverDeleted = {notices: await noticesSince(t0), failed: since(bad, t0), dialogs: dialogsSince(t0), form: await readForm()};
            await snap('s-19-cover-deleted', {res: out.coverDeleted});
        }
        await closeWindow();
        await page.reload(); await idle(page); await openTab(A);
        await openEdit('K1 Series');
        out.editAfterCoverDelete = await readForm();
        await snap('s-20-edit-after-cover-delete', {form: out.editAfterCoverDelete});
        // an SVG cover
        t0 = Date.now();
        await form().locator('input[type=file]').first().setInputFiles(SVG);
        await sleep(3000); await idle(page);
        out.svgUpload = {failed: since(bad, t0), dialogs: dialogsSince(t0), notices: await noticesSince(t0), text: flat(await form().innerText(), 800)};
        await snap('s-21-svg-uploaded', {upload: out.svgUpload});
        out.svgSave = await pressSave('s-22-save-svg');
        if (out.svgSave.windowOpen) await closeWindow();
        // a second series with the same path, then its own
        await openCreate();
        await fillLocale('title', 'en', 'K1 Two');
        await form().locator('input[name="path"]').fill('new-series.v2');
        out.pathDup = await pressSave('s-23-save-path-dup');
        await form().locator('input[name="path"]').fill('k1-two');
        out.two = await pressSave('s-24-save-two');
        if (out.two.windowOpen) await closeWindow();
        // intake series: authors may not submit; inactive
        for (const [name, p, rx] of [['K1 Restricted', 'k1-restricted', /Don't allow authors to submit directly/], ['K1 Inactive', 'k1-inactive', /Mark this series as inactive/]]) {
            await openCreate();
            await fillLocale('title', 'en', name);
            await form().locator('input[name="path"]').fill(p);
            await form().getByRole('checkbox', {name: rx}).first().check();
            out[`save ${name}`] = await pressSave(`s-25-save-${p}`);
            if (out[`save ${name}`].windowOpen) await closeWindow();
        }
        out.gridAll = await readGrid();
        await snap('s-26-grid-all', {grid: out.gridAll}, {png: true});
        // leave the window changed and unsaved
        await openEdit('K1 Two');
        await fillLocale('title', 'en', 'K1 Two CHANGED');
        await form().locator('input[name="title[en]"]').blur();
        t0 = Date.now();
        await closeWindow();
        out.leaveClose = {dialogs: dialogsSince(t0), windowOpen: await form().isVisible().catch(() => false)};
        await sleep(600);
        await openEdit('K1 Two');
        out.afterCloseTitle = await form().locator('input[name="title[en]"]').inputValue();
        await fillLocale('title', 'en', 'K1 Two CHANGED');
        await form().locator('input[name="title[en]"]').blur();
        t0 = Date.now();
        await go(cu(A, '/submissions'));
        out.leavePage = {dialogs: dialogsSince(t0), url: strip(page.url())};
        await snap('s-27-left-by-page', {leave: out.leavePage});
        // the series' public page and the category page (Settings 15, OMP4 as read here)
        await visitor();
        out.seriesPage = {status: await go(cu(A, '/catalog/series/new-series.v2'))};
        out.seriesPage.text = flat(await page.locator('body').innerText().catch(() => ''), 1200);
        out.seriesPage.imgs = await page.locator('.pkp_structure_main img').evaluateAll((els) => els.map((e) => e.getAttribute('src'))).catch(() => null);
        await snap('s-28-series-page', {facts: out.seriesPage}, {png: true});
        out.categoryPage = {status: await go(cu(A, '/catalog/category/k1cat'))};
        out.categoryPage.text = flat(await page.locator('.pkp_structure_main').innerText().catch(() => ''), 800);
        await snap('s-29-category-page', {facts: out.categoryPage});
        fact('series', out);
    });

    // ================================================================== series2 {OMP}: the SVG save read with its answer, the URL preview, the row order, the series pages
    if (on('series2') && isOMP) await sect('series2', async () => {
        const out = {};
        await as(au('mg'), A);
        await openTab(A);
        await openEdit('K1 Two');
        // the URL preview while a path is typed
        await form().locator('input[name="path"]').fill('');
        await form().locator('input[name="path"]').pressSequentially('typed-path', {delay: 20});
        await sleep(500);
        out.previewWhileTyping = flat(await form().locator('input[name="path"]').locator('xpath=ancestor::*[contains(@class,"section")][1]').innerText().catch(() => null), 300);
        await form().locator('input[name="path"]').fill('k1-two');
        // an SVG cover on an existing series, with the save's answer as the browser received it
        await form().locator('input[type=file]').first().setInputFiles(SVG);
        await sleep(3000); await idle(page);
        const t0 = Date.now();
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /update-series|updateSeries/i.test(r.url()), {timeout: T}).catch(() => null);
        await form().getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        let body = null;
        if (r) { try { body = await r.text(); } catch (e) { body = String(e.message); } }
        await sleep(2500); await idle(page);
        out.svg = {status: r && r.status(), answer: body ? body.slice(0, 600) : null, open: await form().isVisible().catch(() => false), notices: await noticesSince(t0), dialogs: dialogsSince(t0), failed: since(bad, t0), console: since(consoleMsgs, t0),
            invalidAnywhere: await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /invalid image|Accepted formats/i.test(e.textContent)).map((e) => e.textContent.trim().slice(0, 200))).catch(() => null)};
        await snap('s2-01-svg-save', {svg: out.svg}, {png: true});
        await closeWindow();
        await page.reload(); await idle(page); await openTab(A);
        await openEdit('K1 Two');
        out.afterSvg = flat((await readForm()).text, 300);
        await snap('s2-02-after-svg-reopen', {afterSvg: out.afterSvg});
        await closeWindow();
        // the row order: a series whose title sorts first, added last
        await openCreate();
        await fillLocale('title', 'en', 'AAA K1 Last Added');
        await form().locator('input[name="path"]').fill('aaa-last');
        out.aaa = (await pressSave('s2-03-save-aaa')).notices;
        await page.reload(); await idle(page); await openTab(A);
        out.gridOrder = (await readGrid()).rows.map((x) => x.cells[0]);
        await snap('s2-04-grid-order', {order: out.gridOrder});
        // the series pages as a visitor
        await visitor();
        for (const [k, u2] of [['two', cu(A, '/catalog/series/k1-two')], ['dotted', cu(A, '/catalog/series/new-series.v2')], ['pk', cu('publicknowledge', '/catalog/series/monographs')]]) {
            const st = await go(u2);
            out[`page-${k}`] = {status: st, url: strip(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120), main: flat(await page.locator('.pkp_structure_main').innerText().catch(() => ''), 600)};
            await snap(`s2-05-series-page-${k}`, {facts: out[`page-${k}`]});
        }
        // the press's About › Submissions page (OMP1: no series listed)
        out.aboutPk = {status: await go(cu('publicknowledge', '/about/submissions')), main: flat(await page.locator('.pkp_structure_main').innerText().catch(() => ''), 1500)};
        await snap('s2-06-pk-about-submissions', {facts: out.aboutPk});
        fact('series2', out);
    });

    // ================================================================== series3 {OMP}: a series whose title sorts last, added last: where its row stands
    if (on('series3') && isOMP) await sect('series3', async () => {
        const out = {};
        await as(au('mg'), A);
        await openTab(A);
        await openCreate();
        await fillLocale('title', 'en', 'ZZZ K1 Added After');
        await form().locator('input[name="path"]').fill('zzz-after');
        out.save = (await pressSave('s3-01-save-zzz')).notices;
        out.orderSameView = (await readGrid()).rows.map((x) => x.cells[0]);
        await page.reload(); await idle(page); await openTab(A);
        out.orderReload = (await readGrid()).rows.map((x) => x.cells[0]);
        await snap('s3-02-grid-order', {order: out});
        await visitor();
        fact('series3', out);
    });

    // ================================================================== intake: what "Make a Submission" offers each level (Actors row 3)
    if (on('intake')) await sect('intake', async () => {
        const out = {};
        if (!isOMP) {
            for (const k of ['au', 'se', 'mg']) {
                await as(au(k), A);
                await go(cu(A, '/submission'));
                await page.locator('form, .pkpForm, main').first().waitFor({timeout: T}).catch(() => {});
                await sleep(800);
                out[k] = {radios: await page.locator('input[type=radio]').evaluateAll((els) => els.map((e) => ({name: e.name, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim(), checked: e.checked}))),
                    main: flat(await page.locator('main').innerText().catch(() => ''), 1500)};
                await snap(`i-${k}-start`, {facts: out[k]});
            }
        } else {
            // a draft per level, the wizard's "For the Editors" step
            for (const k of ['au', 'se']) {
                if (!S[`draft${k}`]) {
                    try {
                        const r = await app.api.createSubmission({tag: `${S.t}d${k}`, context: A, submitter: au(k), title: `K1 draft ${k} ${S.t}`, submitted: false});
                        S[`draft${k}`] = r.submissionId; save();
                    } catch (e) { out[`${k}Seed`] = String(e.message).slice(0, 400); continue; }
                }
                await as(au(k), A);
                await go(cu(A, `/submission?id=${S[`draft${k}`]}`));
                await page.locator('.pkpSteps').waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(800);
                const rail = page.locator('.pkpSteps button, .pkpSteps a');
                out[`${k}Rail`] = (await rail.allInnerTexts()).map((x) => flat(x));
                const ed = page.locator('.pkpSteps').getByRole('button', {name: /For the Editors$/}).first();
                if (await ed.count()) { await ed.click(); await sleep(1200); }
                out[k] = {radios: await page.locator('input[type=radio]').evaluateAll((els) => els.map((e) => ({name: e.name, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim(), checked: e.checked}))),
                    main: flat(await page.locator('.submissionWizard, main').first().innerText().catch(() => ''), 1500)};
                await snap(`i-${k}-wizard-for-the-editors`, {facts: out[k]});
            }
        }
        await visitor();
        fact('intake', out);
    });

    // ================================================================== about: the "Submissions" page per level (Actors row 4)
    if (on('about')) await sect('about', async () => {
        const out = {};
        const read = async (k) => {
            const st = await go(cu(A, '/about/submissions'));
            const o = {status: st, policies: await page.locator('.section_policy').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))).catch(() => null),
                main: flat(await page.locator('.pkp_structure_main, body').first().innerText().catch(() => ''), 2000)};
            await snap(`a-${k}-submissions-page`, {facts: o});
            return o;
        };
        await visitor();
        out.visitor = await read('visitor');
        for (const k of (isOMP ? ['mg'] : ['au', 'se', 'mg'])) { await as(au(k), A); out[k] = await read(k); }
        await visitor();
        fact('about', out);
    });

    // ================================================================== archives: the preprint listing for a visitor and a signed-in author (Actors row 5)
    if (on('archives')) await sect('archives', async () => {
        const out = {};
        await visitor();
        out.visitor = {status: await go(cu('publicknowledge', '/preprints')), url: strip(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120)};
        await snap('p-visitor-preprints', {facts: out.visitor});
        if (isOPS) {
            await as('author.alex', 'publicknowledge');
            out.author = {status: await go(cu('publicknowledge', '/preprints')), url: strip(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120)};
            await snap('p-author-preprints', {facts: out.author});
            out.section = {status: await go(cu('publicknowledge', '/preprints/section/preprints')), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120)};
            await snap('p-author-section-page', {facts: out.section});
            await visitor();
        }
        fact('archives', out);
    });

    // ================================================================== autoassign: a submission arriving in "Articles" on a scratch journal (Actors row 2)
    if (on('autoassign') && isOJS) await sect('autoassign', async () => {
        const out = {};
        if (!S.aaDraft) {
            const r = await app.api.createSubmission({tag: `${S.t}aa`, context: A, submitter: au('au'), title: `K1 arriving ${S.t}`, section: 'ART', submitted: false, files: [{file: 'article.pdf'}]});
            S.aaDraft = r.submissionId; save();
        }
        if (!S.aaSubmitted) {
            await as(au('au'), A);
            await go(cu(A, `/submission?id=${S.aaDraft}`));
            await page.locator('.pkpSteps').waitFor({timeout: T});
            await idle(page); await sleep(800);
            const {SubmissionWizardPage} = require(path.join(REPO, 'apps/ojs/playwright/pages/SubmissionWizardPage.js'));
            const wz = new SubmissionWizardPage(page, A);
            const validated = page.waitForResponse((r) => r.url().includes('/submit') && r.request().method() === 'POST', {timeout: 45000}).catch(() => null);
            for (let i = 0; i < 6; i++) {
                const cur = flat(await wz.currentStepLabel().innerText().catch(() => ''), 60);
                out[`step${i}`] = cur;
                if (/Review$/.test(cur)) break;
                await wz.continueButton().click();
                await sleep(1500); await idle(page);
            }
            await validated;
            await sleep(1500);
            out.review = flat(await page.locator('.submissionWizard, main').first().innerText().catch(() => ''), 2000);
            await snap('aa-01-review', {review: out.review});
            await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true}).click();
            const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
            await d.waitFor({timeout: 30000});
            await d.getByRole('button', {name: 'Submit', exact: true}).click();
            await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000});
            S.aaSubmitted = true; save();
            await snap('aa-02-complete');
        }
        await as(au('mg'), A);
        await go(cu(A, `/dashboard/editorial?workflowSubmissionId=${S.aaDraft}`)); await sleep(2000);
        out.participants = await page.evaluate(() => {
            const vis = (e) => e.getClientRects().length > 0;
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
            const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.textContent.trim()));
            if (!h) return {present: false};
            let box = h.parentElement;
            for (let i = 0; i < 4 && box && !box.querySelector('ul, [role=list]'); i++) box = box.parentElement;
            return {present: true, items: box ? [...box.querySelectorAll('li')].filter(vis).map((li) => li.innerText.split('\n').map((x) => x.trim()).filter(Boolean).join('/')) : []};
        });
        await snap('aa-03-participants', {participants: out.participants}, {png: true});
        await visitor();
        fact('autoassign', out);
    });

    // ================================================================== endrole: the ticked Section editor's role ended on Users & Roles (td4)
    if (on('endrole') && isOJS) await sect('endrole', async () => {
        const out = {};
        if (!S.C) {
            const p = `${S.t}c`;
            await app.api.createContext({tag: p, context: {name: `U17 K1 journal C ${S.t}`},
                users: [{username: `${p}mg`, roles: ['manager'], givenName: 'Cai', familyName: 'Manager'}, {username: `${p}s3`, roles: ['sectionEditor', 'author'], givenName: 'Tia', familyName: 'Twin'}]});
            S.C = {path: p}; save();
        }
        const C = S.C.path;
        await as(`${C}mg`, C);
        await openTab(C);
        await openEdit('Articles');
        await form().getByRole('checkbox', {name: /Tia Twin/}).first().check();
        out.tick = await pressSave('e-00-tick-tia');
        out.gridTicked = await readGrid();
        await go(cu(C, '/management/settings/access'));
        await sleep(1500);
        const row = page.locator('tr').filter({hasText: 'Tia Twin'}).first();
        await row.waitFor({timeout: T});
        await row.getByRole('button').last().click();
        await sleep(500);
        await page.getByRole('menuitem', {name: 'Edit'}).first().click();
        await page.waitForURL(/settings\/user\/\d+/, {timeout: T}).catch(() => {});
        await idle(page); await sleep(1000);
        out.userPage = flat(await page.locator('main').innerText().catch(() => ''), 1500);
        await snap('e-01-user-page', {}, {png: true});
        const t0 = Date.now();
        out.roleRows = flat(await page.locator('main').innerText().catch(() => ''), 1500);
        // the Section editor's row: its own "Remove Role"
        const rm = page.locator('tr, [role=row], .pkpTable__row, li, div').filter({hasText: /^\s*Section editor/}).getByRole('button', {name: /Remove Role/}).first();
        out.removeButtons = await page.getByRole('button', {name: /Remove Role/}).count();
        await rm.click(); await sleep(1000);
        out.ask = flat(await top().innerText().catch(() => null), 400);
        await snap('e-02-remove-ask', {ask: out.ask});
        const yes = top().getByRole('button', {name: /^(Remove|Remove Role|OK|Yes|Confirm)$/}).first();
        if (await yes.count()) await yes.click();
        await sleep(1500); await idle(page);
        out.after = {notices: await noticesSince(t0), failed: since(bad, t0), main: flat(await page.locator('main').innerText().catch(() => ''), 1200)};
        await snap('e-03-role-removed', {res: out.after}, {png: true});
        // "Save And Continue" when the page asks for it
        const sac = page.getByRole('button', {name: /Save And Continue/}).first();
        if (await sac.count() && await sac.isEnabled().catch(() => false)) {
            const t3 = Date.now();
            await sac.click(); await sleep(2000); await idle(page);
            out.saveAndContinue = {notices: await noticesSince(t3), failed: since(bad, t3), url: strip(page.url()), main: flat(await page.locator('main').innerText().catch(() => ''), 1200)};
            await snap('e-03b-save-and-continue', {res: out.saveAndContinue}, {png: true});
            const fin = page.getByRole('button', {name: /^(Update Role|Invite to Role|Save|Submit|Update)/}).first();
            if (await fin.count()) {
                const t4 = Date.now();
                await fin.click(); await sleep(2000); await idle(page);
                out.finish = {button: flat(await fin.innerText().catch(() => ''), 60), notices: await noticesSince(t4), failed: since(bad, t4), url: strip(page.url()), main: flat(await page.locator('main').innerText().catch(() => ''), 800)};
                await snap('e-03c-finish', {res: out.finish}, {png: true});
            }
        }
        await openTab(C);
        out.grid = await readGrid();
        await openEdit('Articles');
        out.form = await readForm();
        await snap('e-04-section-after-role-end', {grid: out.grid, form: out.form});
        out.resave = await pressSave('e-05-resave');
        if (out.resave.windowOpen) await closeWindow();
        out.gridAfter = await readGrid();
        await page.reload(); await idle(page); await openTab(C);
        out.gridAfterReload = await readGrid();
        await snap('e-06-grid-after-resave', {grid: out.gridAfterReload});
        await visitor();
        fact('endrole', out);
    });

    // ================================================================== extra: the "Permit changes to Settings" axis, a user with two offered roles,
    // the OPS path read back, the OMP path's other characters, the OMP side menu
    if (on('extra')) await sect('extra', async () => {
        const out = {};
        if (!S.D) {
            const p = `${S.t}d`;
            const two = isOJS ? ['sectionEditor', 'guestEditor'] : isOMP ? ['sectionEditor', 'funding'] : ['manager', 'sectionEditor'];
            const users = [{username: `${p}mg`, roles: ['manager'], givenName: 'Dee', familyName: 'Manager'}, {username: `${p}tw`, roles: two, givenName: 'Two', familyName: 'Roles'}];
            const spec = {tag: p, context: {name: `U17 K1 D ${S.t}`}, users};
            if (!isOPS) { users.push({username: `${p}np`, roles: ['productionEditor'], givenName: 'Nora', familyName: 'Nopermit'}); spec.roles = {productionEditor: {permitSettings: false}}; }
            await app.api.createContext(spec);
            S.D = {path: p}; save();
        }
        const D = S.D.path;
        if (!isOPS) {
            await as(`${D}np`, D);
            out.noPermit = {status: await go(cu(D, '/management/settings/context')), url: strip(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120), text: flat(await page.locator('body').innerText().catch(() => ''), 300)};
            await snap('x-01-no-permit-settings', {facts: out.noPermit});
        }
        await as(`${D}mg`, D);
        await openTab(D);
        await openCreate();
        out.twoRoles = (await readForm()).fields.filter((f) => f.type === 'checkbox' && /^Assign /.test(f.label || '')).map((f) => f.label);
        await snap('x-02-two-roles-boxes', {boxes: out.twoRoles});
        await closeWindow();
        if (isOPS) {
            await as(au('mg'), A);
            await openTab(A);
            await openEdit('K1 Odd');
            out.oddPath = await form().locator('input[name="path"]').inputValue();
            await snap('x-03-ops-odd-path', {path: out.oddPath});
            await closeWindow();
        }
        if (isOMP) {
            await as(au('mg'), A);
            await openTab(A);
            out.sideMenu = flat(await page.locator('nav, [role=navigation], .app__nav').first().innerText().catch(() => ''), 600);
            await openCreate();
            await fillLocale('title', 'en', 'K1 Chars');
            await form().locator('input[name="path"]').fill('a_b/c.D-1');
            out.charsSave = (await pressSave('x-04-omp-path-chars')).notices;
            out.grid = (await readGrid()).rows.map((x) => x.cells[0]);
            await openEdit('K1 Chars');
            out.charsPath = await form().locator('input[name="path"]').inputValue();
            await closeWindow();
        }
        await visitor();
        fact('extra', out);
    });

    // ================================================================== mgrrole: the Roles tab's stage boxes per role (why a manager-level role is or is not offered)
    if (on('mgrrole') && !isOPS) await sect('mgrrole', async () => {
        const out = {};
        await as(au('mg', B), B);
        await go(cu(B, '/management/settings/access'));
        await page.getByRole('tab', {name: 'Roles', exact: true}).first().click(); await idle(page); await sleep(800);
        await page.locator('tr.gridRow').first().waitFor({timeout: T});
        out.rows = await page.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => ({
            text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
            settingsControl: !!tr.querySelector('a.show_extras'),
            stages: [...tr.querySelectorAll('input[type=checkbox]')].map((b) => (b.checked ? 'x' : '-') + (b.disabled ? 'd' : '')).join(' '),
        })));
        out.th = await page.locator('thead th').allInnerTexts();
        await snap('m-01-roles-tab-stages', {facts: out}, {png: true});
        await visitor();
        fact('mgrrole', out);
    });

    // ================================================================== words (td3): a section whose "Word Count" is -5, an author's three-word abstract at "Review"
    if (on('words') && !isOMP) await sect('words', async () => {
        const out = {};
        if (!S.wordsSection) {
            await as(au('mg'), A);
            await openTab(A);
            await openCreate();
            await fillLocale('title', 'en', 'K1 Words');
            await fillLocale('abbrev', 'en', 'WDS');
            if (isOPS) await form().locator('input[name="path"]').fill('k1-words');
            await form().locator('input[name="wordCount"]').fill('-5');
            out.save = (await pressSave('d-01-save-words')).notices;
            await openEdit('K1 Words');
            out.reopened = await form().locator('input[name="wordCount"]').inputValue();
            await closeWindow();
            S.wordsSection = true; save();
        }
        if (!S.wordsDraft) {
            const spec = {tag: `${S.t}wd`, context: A, submitter: au('au'), title: `K1 words ${S.t}`, abstract: 'Three word abstract', section: 'WDS', submitted: false};
            if (isOJS) spec.files = [{file: 'article.pdf'}];
            const r = await app.api.createSubmission(spec);
            S.wordsDraft = r.submissionId; save();
        }
        await as(au('au'), A);
        await go(cu(A, `/submission?id=${S.wordsDraft}`));
        await page.locator('.pkpSteps').waitFor({timeout: T});
        await idle(page); await sleep(800);
        const cur = () => page.locator('.pkpSteps__step--current, [aria-current="step"]').first();
        const cont = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
        for (let i = 0; i < 6; i++) {
            const c = flat(await cur().innerText().catch(() => ''), 60);
            out[`step${i}`] = c;
            if (/Review$/.test(c)) break;
            if (!(await cont.count())) break;
            await cont.click(); await sleep(1500); await idle(page);
        }
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        await sleep(1500);
        out.review = flat(await page.locator('.submissionWizard, main').first().innerText().catch(() => ''), 2500);
        out.abstractMessages = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /abstract is too long|words? or less|currently \d+ words/i.test(e.textContent)).map((e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)));
        const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
        out.submit = {count: await submit.count(), enabled: (await submit.count()) ? await submit.isEnabled() : null};
        await snap('d-02-review-step', {facts: {messages: out.abstractMessages, submit: out.submit}}, {png: true});
        await visitor();
        fact('words', out);
    });

    await close();
});
