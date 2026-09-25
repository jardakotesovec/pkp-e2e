// U17 claim check, chunk K7: the sections programming interface, checked directly (the Frame's one exception: an
// interface the spec says no screen calls is read with the requests its claims name, as the roles they name).
// Spec: docs/specs/U17-sections.md — Actors row 6, Rule 17, the "Left out" Budget item on the interface, register
// A4 and A5, the surfaces table's address; footnotes g, f-a4, f-a5.
//
//   PROBE_FEATURE=U17 PROBE_AGENT=ccK7 node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/U17/K7/k7.js
//   PHASES=seed,roster,scratch,params,many,screens,site   (default: all; state in k7-state-<app>.json under the output
//   folder, so a phase can be re-run alone; delete the state file for a fresh seed).
//
// Every read is a typed address in the signed-in browser (page.goto), so the request carries the page's own session
// and nothing else: the status, the body (parsed when JSON) and the kit's screen() of what the browser shows.
//
// Scratch contexts (tag prefix u17k7):
//   OJS  A  sections ART "Articles", K7B "K7 Beta", K7C "K7 Gamma", K7D "K7 Delta" (policies); on screen (screens phase)
//           "K7 Gamma" is made inactive and "K7 Delta" editor-only through the section window. The role
//           productionEditor is seeded with "Permit changes to Settings" unticked (context key roles).
//           Users: mg manager, ed editor, pe productionEditor (no Settings), se sectionEditor, ge guestEditor,
//           fc funding, ce copyeditor, rv externalReviewer, au author, rd reader.
//        B  section ART "B Articles"; user mg manager (the other journal's manager, and the owner of the section id
//           read through A's address).
//        C  (many phase) 102 sections "K7 S001"…"K7 S102"; user mg manager: the default page size and the cap of count.
//   OMP  A  users mg manager, au author.   OPS  A  section PRE "Preprints"; users mg manager, se sectionEditor, au author.
// publicknowledge is read only: every account of the roster reads the list and one section there (GET only).
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'roster', 'scratch', 'params', 'many', 'screens', 'site'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k7]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k7-state-${app.name}.json`);

// The seeded roster per app (seed-facts "Users"): one account per permission level, admin first.
const ROSTER = {
    ojs: ['admin', 'manager.maya', 'editor.diana', 'sectioneditor.ana', 'copyeditor.carla', 'assistant.rita', 'reviewer.julia', 'author.alex', 'reader.rosa'],
    omp: ['admin', 'manager.maya', 'editor.diana', 'sectioneditor.ana', 'copyeditor.carla', 'assistant.rita', 'reviewer.julia', 'author.alex', 'reader.rosa'],
    ops: ['admin', 'manager.maya', 'sectioneditor.ana', 'assistant.rita', 'author.alex', 'reader.rosa'],
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k7-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 1500)); };

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u17k7');
        S.t = t;
        const u = (p, k, roles, g, fam) => ({username: `${p}${k}`, roles, givenName: g, familyName: fam});
        const mk = async (key, spec) => {
            const p = `${t}${key}`;
            try { const r = await app.api.createContext({tag: p, ...spec}); log('seed', p, 'ok'); return {path: r.path || p, contextId: r.contextId}; } catch (e) { log('seed FAILED', p, String(e.message).slice(0, 800)); return {path: p, error: String(e.message).slice(0, 800)}; }
        };
        const p = `${t}a`;
        if (isOJS) {
            S.A = await mk('a', {context: {name: `U17 K7 journal ${t}`, acronym: 'KSEV'},
                sections: [{abbrev: 'ART', title: 'Articles', policy: 'Articles policy K7'}, {abbrev: 'K7B', title: 'K7 Beta', policy: 'Beta policy K7'},
                    {abbrev: 'K7C', title: 'K7 Gamma', policy: 'Gamma policy K7'}, {abbrev: 'K7D', title: 'K7 Delta', policy: 'Delta policy K7'}],
                roles: {productionEditor: {permitSettings: false}},
                users: [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'ed', ['editor'], 'Eddie', 'Editor'), u(p, 'pe', ['productionEditor'], 'Pat', 'Production'),
                    u(p, 'se', ['sectionEditor'], 'Sam', 'Section'), u(p, 'ge', ['guestEditor'], 'Gia', 'Guest'), u(p, 'fc', ['funding'], 'Fay', 'Funding'),
                    u(p, 'ce', ['copyeditor'], 'Cole', 'Copy'), u(p, 'rv', ['externalReviewer'], 'Rex', 'Reviewer'), u(p, 'au', ['author'], 'Amy', 'Author'),
                    u(p, 'rd', ['reader'], 'Rae', 'Reader')]});
            S.B = await mk('b', {context: {name: `U17 K7 journal B ${t}`}, sections: [{abbrev: 'ART', title: 'B Articles'}],
                users: [u(`${t}b`, 'mg', ['manager'], 'Bea', 'Manager')]});
        } else if (app.name === 'ops') {
            S.A = await mk('a', {context: {name: `U17 K7 server ${t}`}, sections: [{abbrev: 'PRE', title: 'Preprints', path: 'preprints'}],
                users: [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'se', ['sectionEditor'], 'Sam', 'Section'), u(p, 'au', ['author'], 'Amy', 'Author')]});
        } else {
            S.A = await mk('a', {context: {name: `U17 K7 press ${t}`}, users: [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'au', ['author'], 'Amy', 'Author')]});
        }
        S.seeded = true; save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    const A = S.A.path;
    const B = S.B ? S.B.path : null;
    const ua = (k, ctx = A) => `${ctx}${k}`;

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => { jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)}); d.accept().catch(() => {}); });
    // Every request any screen of this run sends to a sections interface address (the Budget line's claim).
    const sectionsCalls = [];
    let typed = false;
    page.on('request', (r) => { if (/\/api\/v1\/sections\b/.test(r.url()) && !typed) sectionsCalls.push({method: r.method(), url: r.url().replace(app.baseURL, ''), page: page.url().replace(app.baseURL, '')}); });

    let who = 'visitor';
    const as = async (user, ctx) => { await signIn(page, user, ctx ? {contextPath: ctx} : {}); await idle(page).catch(() => {}); who = user; };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    const api = (ctx, p = '') => app.url(`/index.php/${ctx}/api/v1/sections${p}`);

    // One typed address: status, body, parsed JSON, and what the browser shows (screen() first).
    async function read(name, url) {
        typed = true;
        let status = null; let body = null; let err = null; let ctype = null;
        try {
            const r = await page.goto(url, {waitUntil: 'domcontentloaded'});
            status = r ? r.status() : null;
            ctype = r ? r.headers()['content-type'] : null;
            body = r ? await r.text().catch(() => null) : null;
        } catch (e) { err = String(e.message).slice(0, 300); }
        typed = false;
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        let json = null;
        try { json = JSON.parse(body); } catch { /* not JSON */ }
        const out = {who, url: url.replace(app.baseURL, ''), status, ctype, err, json, body: json ? undefined : flat(body, 1500)};
        record(name, {...out, screen: s});
        const brief = json && Array.isArray(json.items)
            ? {itemsMax: json.itemsMax, items: json.items.map((i) => `${i.id}:${i.title && (i.title.en || JSON.stringify(i.title))}${i.isInactive ? ' [inactive]' : ''}${i.editorRestricted ? ' [editorOnly]' : ''}`)}
            : json ? (json.id ? {id: json.id, title: json.title, contextId: json.contextId, keys: Object.keys(json).length} : json) : flat(body, 300);
        log(`${name}: ${who} ${out.url} -> ${status}`, JSON.stringify(brief).slice(0, 600));
        return {status, json, body, brief, ctype};
    }

    try {
        // ------------------------------------------------------------ roster: publicknowledge, every account, list + one section
        if (on('roster')) {
            const out = {};
            await visitor();
            const firstId = async () => {
                // the id of a publicknowledge section, read once as admin (OJS); other apps have no list, use 1
                return S.pkId || 1;
            };
            if (isOJS && !S.pkId) {
                await as('admin');
                const r = await read('r-00-admin-pk-list', api('publicknowledge'));
                S.pkId = r.json && r.json.items && r.json.items[0] ? r.json.items[0].id : 1; save();
            }
            for (const user of ROSTER[app.name]) {
                await as(user, 'publicknowledge');
                const l = await read(`r-${user.replace('.', '-')}-list`, api('publicknowledge'));
                const one = await read(`r-${user.replace('.', '-')}-one`, api('publicknowledge', `/${await firstId()}`));
                out[user] = {list: {status: l.status, brief: l.brief}, one: {status: one.status, brief: one.brief}};
            }
            await visitor();
            const l = await read('r-visitor-list', api('publicknowledge'));
            const one = await read('r-visitor-one', api('publicknowledge', `/${await firstId()}`));
            out.visitor = {list: {status: l.status, brief: l.brief}, one: {status: one.status, brief: one.brief}};
            fact('roster', out);
        }

        // ------------------------------------------------------------ scratch: every role of the scratch context
        if (on('scratch')) {
            const out = {};
            const keys = isOJS ? ['mg', 'ed', 'pe', 'se', 'ge', 'fc', 'ce', 'rv', 'au', 'rd'] : app.name === 'ops' ? ['mg', 'se', 'au'] : ['mg', 'au'];
            if (isOJS) {
                await as(ua('mg'), A);
                const l = await read('s-00-mg-list-ids', api(A));
                S.aIds = (l.json && l.json.items || []).map((i) => i.id); save();
                await as(`${B}mg`, B);
                const lb = await read('s-00-bmg-list-ids', api(B));
                S.bIds = (lb.json && lb.json.items || []).map((i) => i.id); save();
            }
            const one = (S.aIds && S.aIds[0]) || 1;
            for (const k of keys) {
                await as(ua(k), A);
                const l = await read(`s-${k}-list`, api(A));
                const o = await read(`s-${k}-one`, api(A, `/${one}`));
                out[k] = {list: {status: l.status, brief: l.brief}, one: {status: o.status, brief: o.brief}};
            }
            if (isOJS) {
                // the other journal's manager on A's address; A's manager on B's address
                await as(`${B}mg`, B);
                const l = await read('s-bmg-on-a-list', api(A));
                const o = await read('s-bmg-on-a-one', api(A, `/${one}`));
                out.bManagerOnA = {list: {status: l.status, brief: l.brief}, one: {status: o.status, brief: o.brief}};
                await as(ua('mg'), A);
                const l2 = await read('s-amg-on-b-list', api(B));
                out.aManagerOnB = {list: {status: l2.status, brief: l2.brief}};
                // the Production editor without "Permit changes to Settings": what the Settings page does for them
                await as(ua('pe'), A);
                const r = await page.goto(app.url(`/index.php/${A}/en/management/settings/context`), {waitUntil: 'domcontentloaded'}).catch(() => null);
                const s = await screen(page);
                record('s-pe-settings-page', {status: r && r.status(), screen: s});
                out.peSettings = {status: r && r.status(), url: s.url.replace(app.baseURL, ''), text: flat(s.text.main, 300)};
            }
            await visitor();
            const l = await read('s-visitor-list', api(A));
            const o = await read('s-visitor-one', api(A, `/${one}`));
            out.visitor = {list: {status: l.status, brief: l.brief}, one: {status: o.status, brief: o.brief}};
            fact('scratch', out);
        }

        // ------------------------------------------------------------ params: every parameter the interface accepts (OJS)
        if (on('params') && isOJS) {
            const out = {};
            await as(ua('mg'), A);
            const ids = S.aIds || [];
            const cases = [
                ['p-01-plain', ''],
                ['p-02-search-phrase', '?searchPhrase=Beta'],
                ['p-03-search-phrase-empty', '?searchPhrase='],
                ['p-04-type-ids-one', '?typeIds=1'],
                ['p-05-type-ids-list', '?typeIds=1,2'],
                ['p-06-type-ids-array', '?typeIds[]=1&typeIds[]=2'],
                ['p-07-count-2', '?count=2'],
                ['p-08-count-2-offset-2', '?count=2&offset=2'],
                ['p-09-offset-3', '?offset=3'],
                ['p-10-offset-99', '?offset=99'],
                ['p-11-count-0', '?count=0'],
                ['p-12-count-minus', '?count=-1'],
                ['p-13-count-150', '?count=150'],
                ['p-14-count-text', '?count=abc'],
                ['p-15-offset-minus', '?offset=-2'],
                ['p-16-unknown-param', '?foo=bar'],
                ['p-17-title-filter-not-offered', '?titles=Articles'],
                ['p-18-trailing-slash', '/'],
            ];
            for (const [n, q] of cases) {
                const r = await read(n, api(A, q));
                out[n] = {status: r.status, brief: r.brief};
            }
            // a single section: the journal's own, an unknown id, 0, a non-number, the other journal's section
            const singles = [
                ['p-20-one-own', `/${ids[1] || ids[0]}`],
                ['p-21-one-unknown', '/999999'],
                ['p-22-one-zero', '/0'],
                ['p-23-one-text', '/abc'],
                ['p-24-one-other-journal', `/${(S.bIds || [])[0]}`],
                ['p-25-one-with-query', `/${ids[0]}?searchPhrase=x&typeIds=1`],
            ];
            for (const [n, q] of singles) {
                const r = await read(n, api(A, q));
                out[n] = {status: r.status, brief: r.brief};
            }
            // the filters for the admin and a manager-level editor, both ends of "who asks"
            for (const who2 of ['admin', ua('ed')]) {
                await as(who2, A);
                for (const [n, q] of [['search', '?searchPhrase=Beta'], ['types', '?typeIds=1']]) {
                    const r = await read(`p-3x-${who2 === 'admin' ? 'admin' : 'ed'}-${n}`, api(A, q));
                    out[`${who2}-${n}`] = {status: r.status, brief: r.brief};
                }
            }
            // a refused role and a visitor with the failing filters: refused before or after the failure?
            await as(ua('au'), A);
            out.authorSearch = (await read('p-40-au-search', api(A, '?searchPhrase=Beta'))).status;
            await visitor();
            out.visitorSearch = (await read('p-41-visitor-search', api(A, '?searchPhrase=Beta'))).status;
            fact('params', out);
        }

        // ------------------------------------------------------------ many: the page size and the count cap (OJS)
        if (on('many') && isOJS) {
            if (!S.C) {
                const secs = Array.from({length: 102}, (_, i) => ({abbrev: `S${i + 1}`, title: `K7 S${String(i + 1).padStart(3, '0')}`}));
                try {
                    const r = await app.api.createContext({tag: `${S.t}c`, context: {name: `U17 K7 journal C ${S.t}`}, sections: secs,
                        users: [{username: `${S.t}cmg`, roles: ['manager'], givenName: 'Cal', familyName: 'Manager'}]});
                    S.C = {path: r.path || `${S.t}c`};
                } catch (e) { S.C = {path: `${S.t}c`, error: String(e.message).slice(0, 600)}; }
                save();
            }
            const out = {seed: S.C};
            await as(`${S.C.path}mg`, S.C.path);
            const span = (b) => (b && b.items ? {itemsMax: b.itemsMax, n: b.items.length, first: b.items[0], last: b.items[b.items.length - 1]} : b);
            for (const [n, q] of [['m-01-plain', ''], ['m-02-count-100', '?count=100'], ['m-03-count-101', '?count=101'], ['m-04-count-150', '?count=150'],
                ['m-05-offset-30', '?offset=30'], ['m-06-count-100-offset-100', '?count=100&offset=100']]) {
                const r = await read(n, api(S.C.path, q));
                out[n] = {status: r.status, span: span(r.brief)};
            }
            fact('many', out);
        }

        // ------------------------------------------------------------ screens: the Sections tab as a manager, a
        // section made inactive and one editor-only through the window, then the list again; the start form; and
        // every sections interface request any of these screens sent.
        if (on('screens') && isOJS) {
            const out = {};
            await as(ua('mg'), A);
            const grid = () => page.locator('#sectionsGridContainer').first();
            const form = () => page.locator('form#sectionForm').first();
            async function openTab() {
                await page.goto(app.url(`/index.php/${A}/en/management/settings/context`), {waitUntil: 'domcontentloaded'});
                await idle(page);
                await page.getByRole('tab', {name: 'Sections', exact: true}).first().click();
                await idle(page);
                await grid().locator('tr.gridRow').first().waitFor({timeout: T});
                await sleep(500);
            }
            async function openEdit(title) {
                const row = grid().locator('tr.gridRow').filter({hasText: title}).first();
                await row.locator('a.show_extras').first().click(); await sleep(400);
                const id = await row.getAttribute('id');
                await page.locator(`tr#${id} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
                await form().locator('input[name="title[en]"]').waitFor({timeout: T});
                await idle(page); await sleep(900);
            }
            async function saveWindow() {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /update-?section/i.test(r.url()), {timeout: T}).catch(() => null);
                await form().getByRole('button', {name: 'Save', exact: true}).click();
                const r = await w;
                await idle(page); await sleep(1200);
                return r ? r.status() : null;
            }
            await openTab();
            record('g-01-sections-tab', await screen(page));
            await loc(page, 'Sections tab: a row by title', grid().locator('tr.gridRow').filter({hasText: 'K7 Gamma'}));
            // K7 Gamma: "Deactivate" through the window's box
            await openEdit('K7 Gamma');
            record('g-02-gamma-window', await screen(page));
            const boxes = await form().locator('input[type=checkbox]').evaluateAll((es) => es.map((e) => ({name: e.name, checked: e.checked, label: (e.closest('li,div')?.innerText || '').trim().slice(0, 120)})));
            out.windowBoxes = boxes;
            await form().locator('input[name="isInactive"]').check();
            out.saveGamma = await saveWindow();
            record('g-03-after-gamma-save', await screen(page));
            // K7 Delta: editor-only
            await openEdit('K7 Delta');
            await form().getByRole('checkbox', {name: /Items can only be submitted by Editors/}).check();
            out.saveDelta = await saveWindow();
            record('g-04-after-delta-save', await screen(page));
            // leave the window once with a change unsaved, through "×"
            await openEdit('K7 Beta');
            await form().locator('input[name="title[en]"]').fill('K7 Beta unsaved');
            await form().locator('input[name="title[en]"]').blur();
            const t0 = Date.now();
            await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Close'}).first().click().catch(() => {});
            await sleep(1500);
            out.leaveX = {dialogs: jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message}`), windowOpen: await form().isVisible().catch(() => false)};
            await openTab();
            record('g-05-grid-after-reload', await screen(page));
            out.gridRows = await grid().locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => {
                const b = td.querySelector('input[type=checkbox]'); return b ? `box:${b.checked}` : (td.innerText || '').replace(/\s+/g, ' ').trim();
            })));
            // the interface after the change, read at once and again (no reload distinction for data)
            const l = await read('g-06-list-after-change', api(A));
            out.listAfter = l.brief;
            const inactiveId = (l.json && l.json.items || []).find((i) => i.isInactive);
            if (inactiveId) out.oneInactive = (await read('g-07-one-inactive', api(A, `/${inactiveId.id}`))).brief;
            // the start form ("Make a Submission") as the author and the manager, and the dashboard, recorded for requests
            for (const k of ['au', 'mg']) {
                await as(ua(k), A);
                await page.goto(app.url(`/index.php/${A}/en/submission`), {waitUntil: 'domcontentloaded'}); await idle(page); await sleep(1000);
                record(`g-08-${k}-start-form`, await screen(page));
                out[`startRadios-${k}`] = await page.locator('input[type=radio][name=sectionId]').evaluateAll((es) => es.map((e) => (e.closest('label')?.innerText || '').trim())).catch(() => null);
                await page.goto(app.url(`/index.php/${A}/en/dashboard/editorial`), {waitUntil: 'domcontentloaded'}).catch(() => {}); await idle(page); await sleep(1000);
                record(`g-09-${k}-dashboard`, await screen(page));
                await page.goto(app.url(`/index.php/${A}/en/about/submissions`), {waitUntil: 'domcontentloaded'}); await idle(page);
                record(`g-10-${k}-about-submissions`, await screen(page));
            }
            fact('screens', out);
        }

        // ------------------------------------------------------------ site: the same address with no journal, and
        // the other apps' address on a scratch context
        if (on('site')) {
            const out = {};
            await as('admin');
            out.siteAdmin = (await read('x-01-admin-site-list', app.url('/index.php/index/api/v1/sections'))).brief;
            out.siteAdminOne = (await read('x-02-admin-site-one', app.url('/index.php/index/api/v1/sections/1'))).brief;
            out.scratchAdmin = (await read('x-03-admin-scratch-list', api(A))).brief;
            if (!isOJS) {
                await as(ua('mg'), A);
                out.scratchManager = (await read('x-04-mg-scratch-list', api(A))).brief;
                out.scratchManagerSearch = (await read('x-05-mg-scratch-search', api(A, '?searchPhrase=a'))).brief;
            }
            await visitor();
            out.siteVisitor = (await read('x-06-visitor-site-list', app.url('/index.php/index/api/v1/sections'))).brief;
            fact('site', out);
        }
        fact('sectionsCallsFromScreens', sectionsCalls);
    } finally {
        await close();
    }
});
