// U47 claim check, chunk K3: who does what, and versions.
// Spec: docs/specs/U47-media-files.md — Purpose (10–24), Actors & permissions (25–51), Rules 7–9 (242–260),
// Settings bullets 4–5 (324–339), Cross-feature interactions (345–369), Canonical preamble and Coverage (370–420),
// register heading/summary and A1 (421–450); footnotes a, b, c, d, l, m, r, s, q1–q4, q16, q17, q24, f-a1.
//
//   PROBE_FEATURE=U47 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U47/K3/k3.js
//   PHASES=seed,roles,assign,offers,q3,refuse,assist,hold,admin,pub,reader,versions,moreinfo,leave,q3b,mi2,body,pe,hires,leave2 (default all;
//   state in k3-state-<app>.json in the output dir; the mutating phases run once per seed: delete the state file
//   for a fresh run). A full run outlasts the Bash cap: run it detached per app (nohup … &) and poll the pid.
//
// Per app, scratch context C (users per level; OJS one published issue Vol. 1 No. 1 (2026)) and, on a journal or
// press, context D whose Copyeditor role's stages include Production (Settings bullet 5's other end).
// Every submission's submitter is C's author `au`; media sets:
//   FULL = figure.png (web) + fig-hi.png (high) linked as a pair, lone.png + lone-hi.png, solo.png + solo-hi.png
//          (unlinked, web + high), style.css (HTML Stylesheet)
//   a1   Production, FULL; every level assigned (OJS se, ge, le, de, ix, pr, pe, ce, fu; OMP se, le, de, ix, pr, pe,
//        ce, fu, mk; OPS se, se2 unticked, ebm) → what each level is offered (q1, q2, q4 reads), the file link
//   aR   OJS Review / OMP External Review, FULL; fu, ce (OMP also mk), se assigned → q3 and its journal control
//   aLE  le "Permissions" unticked (the default)  → Rule 7 for every change (q2)
//   aGE  OJS ge unticked                          → Rule 7 (q2's Guest Editor)
//   aSU  se with "Permissions" unticked           → A1's Section Editor / Moderator
//   aLT  le2 ticked                                → Settings bullet 4's other end (q2 "Repeat with the box ticked")
//   aSE  se default (ticked)                       → Coverage row "Assigned Section Editor or Moderator"
//   aCE  D: ce ticked, whose role's stages include Production → Settings bullet 5's other end
//   aAD  nobody assigned                           → the Site Administrator unassigned (q4)
//   pub1, pub2 published (posted), FULL; pub2 se assigned → Rule 8 (q16) as the manager and as se
//   rp   OJS published HTML galley, no media        → Rule 8 "reach readers at once"
//   op   OMP Production, no media; an HTML format built on screen and published → the same on a press
//   v    published, FULL → Rule 9 (q17)
//   aC   (phase q3b, seeded there) OJS/OMP Copyediting, FULL; ce, fu (OMP also mk), se assigned → q3's copyediting end
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'roles', 'assign', 'offers', 'q3', 'refuse', 'assist', 'hold', 'admin', 'pub', 'reader', 'versions', 'moreinfo', 'leave', 'q3b', 'mi2', 'body', 'pe', 'hires', 'leave2'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k3]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const fx = (app, f) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${f}`);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k3-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };
    const done = (p) => (S.done || []).includes(p);
    const markDone = (p) => { S.done = [...(S.done || []), p]; save(); };

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u47k3');
        S.t = t;
        const U = (p, k, role, g, f) => ({username: `${p}${k}`, roles: [role], givenName: g, familyName: f});
        const keys = isOPS
            ? [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Moe', 'Perm'], ['se2', 'sectionEditor', 'Mona', 'NoPerm'],
                ['seu', 'sectionEditor', 'Mel', 'Unassigned'], ['ebm', 'editorialBoardMember', 'Ebb', 'Board'], ['au', 'author', 'Ava', 'Author'],
                ['rd', 'reader', 'Rey', 'Reader']]
            : [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Eda', 'Editor'], ['pe', 'productionEditor', 'Pat', 'Production'],
                ['se', 'sectionEditor', 'Sid', 'Section'], ['se2', 'sectionEditor', 'Sam', 'NoPerm'], ['seu', 'sectionEditor', 'Sue', 'Unassigned'],
                ...(isOJS ? [['ge', 'guestEditor', 'Gus', 'Guest']] : []),
                ['le', 'layoutEditor', 'Lee', 'Layout'], ['le2', 'layoutEditor', 'Lia', 'Ticked'], ['de', 'designer', 'Dee', 'Designer'],
                ['ix', 'indexer', 'Ixa', 'Indexer'], ['pr', 'proofreader', 'Pru', 'Proofreader'], ['ce', 'copyeditor', 'Cec', 'Copyeditor'],
                ['fu', 'funding', 'Fay', 'Funding'], ...(isOMP ? [['mk', 'marketing', 'Mak', 'Marketing']] : []),
                ['au', 'author', 'Ava', 'Author'], ['rd', 'reader', 'Rey', 'Reader']];
        const p1 = `${t}c`;
        const c1 = {tag: p1, context: {name: `U47 K3 ${p1}`, acronym: 'KTHR', contactName: 'K3 Contact', contactEmail: `${p1}c@mail.test`},
            users: keys.map(([k, r, g, f]) => U(p1, k, r, g, f))};
        if (isOJS) c1.issues = [{volume: 1, number: 1, year: 2026, published: true}];
        const r1 = await app.api.createContext(c1);
        S.C = {path: r1.path || p1, u: Object.fromEntries(keys.map(([k]) => [k, `${p1}${k}`])), roles: Object.fromEntries(keys.map(([k, r]) => [k, r]))};
        if (!isOPS) {
            const p2 = `${t}d`;
            try {
                const r2 = await app.api.createContext({tag: p2, context: {name: `U47 K3 D ${p2}`, acronym: 'KTHD', contactName: 'K3 Contact', contactEmail: `${p2}c@mail.test`},
                    roles: {copyeditor: {stages: {production: true}}},
                    users: [U(p2, 'mgr', 'manager', 'Mira', 'Manager'), U(p2, 'ce', 'copyeditor', 'Cid', 'Copyeditor'), U(p2, 'au', 'author', 'Ava', 'Author')]});
                S.D = {path: r2.path || p2, u: {mgr: `${p2}mgr`, ce: `${p2}ce`, au: `${p2}au`}};
            } catch (e) { S.Derr = String(e.message).slice(0, 700); log('[seed D FAILED]', S.Derr); }
        }
        save();
        const C = S.C;
        const sub = async (ctx, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctx.path, submitter: ctx.u.au, title: `K3 ${k} Wombatery ${t}`, ...spec});
                log('seed', k, r.submissionId, r.publicationId, r.stageId, JSON.stringify(r.mediaFiles || []).slice(0, 200));
                return {id: r.submissionId, pub: r.publicationId, stageId: r.stageId, galleys: r.galleys, media: r.mediaFiles};
            } catch (e) { log('seed FAILED', k, String(e.message).slice(0, 700)); return {error: String(e.message).slice(0, 700)}; }
        };
        const hi = (name, pair) => ({file: 'profile-image-400.png', resolution: 'high_resolution', name, ...(pair ? {pair} : {})});
        const FULL = [{file: 'figure.png', pair: 'A'}, hi('fig-hi.png', 'A'), {file: 'figure.png', name: 'lone.png'}, hi('lone-hi.png'),
            {file: 'figure.png', name: 'solo.png'}, hi('solo-hi.png'), {file: 'not-an-image.txt', genre: 'HTML Stylesheet', name: 'style.css'}];
        const P = (k, can) => ({username: C.u[k], role: C.roles[k], ...(can === undefined ? {} : {canChangeMetadata: can})});
        const prod = isOPS ? {} : {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']};
        const pubd = isOJS ? {published: true, issue: {volume: 1, number: 1, year: 2026}} : {published: true};
        S.s = {};
        const a1parts = isOPS ? [P('se'), P('se2', false), P('ebm')]
            : [P('se'), ...(isOJS ? [P('ge')] : []), P('le'), P('de'), P('ix'), P('pr'), P('pe'), P('ce'), P('fu'), ...(isOMP ? [P('mk')] : [])];
        S.s.a1 = await sub(C, 'a1', {...prod, participants: a1parts, mediaFiles: FULL});
        if (S.s.a1.error && isOPS) { S.s.a1err = S.s.a1.error; S.s.a1 = await sub(C, 'a1', {...prod, participants: [P('se'), P('se2', false)], mediaFiles: FULL}); }
        if (!isOPS) {
            S.s.aR = await sub(C, 'aR', {files: [{file: 'article.pdf'}], decisions: ['sendExternalReview'], participants: [P('se'), P('fu'), P('ce'), ...(isOMP ? [P('mk')] : [])], mediaFiles: FULL});
            S.s.aLE = await sub(C, 'aLE', {...prod, participants: [P('le')], mediaFiles: FULL});
            S.s.aLT = await sub(C, 'aLT', {...prod, participants: [P('le2', true)], mediaFiles: FULL});
        }
        if (isOJS) S.s.aGE = await sub(C, 'aGE', {...prod, participants: [P('ge')], mediaFiles: FULL});
        S.s.aSU = await sub(C, 'aSU', {...prod, participants: [P('se2', false)], mediaFiles: FULL});
        S.s.aSE = await sub(C, 'aSE', {...prod, participants: [P('se')], mediaFiles: FULL});
        S.s.aAD = await sub(C, 'aAD', {...prod, participants: [], mediaFiles: FULL});
        if (S.D) {
            const D = S.D;
            S.s.aCE = await sub(D, 'aCE', {...prod, participants: [{username: D.u.ce, role: 'copyeditor', canChangeMetadata: true}], mediaFiles: FULL});
            S.s.aCEu = await sub(D, 'aCEu', {...prod, participants: [{username: D.u.ce, role: 'copyeditor'}], mediaFiles: FULL});
        }
        S.s.pub1 = await sub(C, 'pub1', {...prod, ...pubd, mediaFiles: FULL});
        S.s.pub2 = await sub(C, 'pub2', {...prod, ...pubd, participants: [P('se')], mediaFiles: FULL});
        S.s.v = await sub(C, 'v', {...prod, ...pubd, mediaFiles: FULL});
        if (isOJS) S.s.rp = await sub(C, 'rp', {...prod, ...pubd, galleys: [{label: 'HTML', file: 'article.html'}]});
        if (isOMP) S.s.op = await sub(C, 'op', {...prod});
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const s = S.s;
    const C = S.C;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const writes = [];
    page.on('response', (r) => {
        const m = r.request().method();
        if ((m !== 'GET' && /\/api\/v1\//.test(r.url())) || r.status() >= 400) {
            writes.push({at: Date.now(), m: r.request().headers()['x-http-method-override'] || m, s: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 200)});
        }
    });
    const trafficSince = (t0) => writes.filter((x) => x.at >= t0).map((x) => `${x.m} ${x.s} ${x.url}`);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300)});
        log('[browser dialog]', d.type(), flat(d.message(), 200));
        d.accept().catch(() => {});
    });
    const dialogsSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message}`);

    async function snap(name, extra = {}) {
        let sc;
        try { sc = await screen(page); } catch (e) { sc = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(sc, extra);
        record(name, sc);
        await shot(page, name).catch(() => {});
        return sc;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
            return null;
        }
    }
    let who = null;
    const as = async (user, ctx) => { if (who === `${user}@${ctx}`) return; await signIn(page, user, {contextPath: ctx}); await idle(page); who = `${user}@${ctx}`; };
    const vis = '[role="dialog"]:visible, [role="alertdialog"]:visible';
    const wf = () => page.locator('[role="dialog"]:visible').first();
    const top = () => page.locator(vis).last();
    const openCount = () => page.locator(vis).count();
    const cUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (ctx, sid, key, author) => cUrl(ctx, `/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
    const mKey = (pid) => `publication_${pid}_media`;
    const mediaTable = () => page.locator('table').filter({has: page.locator('th', {hasText: /Date uploaded/i})}).first();

    // The workflow dialog as data: side menu, headings, the Media table with its controls and rows.
    const mediaInfo = () => page.evaluate(() => {
        const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
        const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
        const heads = [...dlg.querySelectorAll('h1,h2,h3')].filter(v).map((h) => `${h.tagName}:${f(h.textContent)}`).slice(0, 8);
        const nav = [...new Set([...dlg.querySelectorAll('nav a, nav button, [role=treeitem] a, [role=treeitem] button, [role=treeitem] > div, [role=treeitem] span')].filter(v).map((a) => f(a.innerText)).filter(Boolean))].slice(0, 80);
        const t = [...dlg.querySelectorAll('table')].filter(v).find((x) => [...x.querySelectorAll('th')].some((th) => /date uploaded/i.test(th.innerText)));
        const bodyText = f(dlg.innerText).slice(0, 1500);
        // a Review stage page has its own "Date uploaded" table: the Media page is known by its H2
        if (!t || !heads.some((h) => /^H2:(Publication|Preprint): Media$/i.test(h))) return {present: false, heads, nav, text: bodyText, url: location.href.replace(/^.*\/index\.php/, '')};
        let wrap = t.parentElement;
        for (let i = 0; i < 6 && wrap && !wrap.querySelector('button:not(table button)'); i++) wrap = wrap.parentElement;
        const controls = wrap ? [...wrap.querySelectorAll('button')].filter(v).filter((b) => !t.contains(b)).map((b) => ({text: f(b.innerText || b.getAttribute('aria-label')), disabled: b.disabled})) : [];
        const rows = [...t.querySelectorAll('tbody tr')].map((tr) => {
            const cells = [...tr.querySelectorAll('td, th')];
            const a = tr.querySelector('a[href]');
            const idCell = cells.find((c) => c.getAttribute('rowspan'));
            return {
                cells: cells.map((c) => f(c.innerText)),
                name: a ? {text: f(a.innerText), href: a.getAttribute('href'), target: a.getAttribute('target')} : null,
                buttons: [...tr.querySelectorAll('button')].filter(v).map((b) => f(b.getAttribute('aria-label') || b.innerText) || '(unnamed)'),
                idCell: idCell ? {text: f(idCell.innerText), rowspan: idCell.getAttribute('rowspan')} : null,
            };
        });
        return {present: true, heads, nav, controls, rows, text: f(t.innerText).slice(0, 1500), url: location.href.replace(/^.*\/index\.php/, '')};
    }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    const rowsText = (mi) => ((mi && mi.rows) || []).map((r) => r.cells.join(' | '));
    const names = (mi) => ((mi && mi.rows) || []).map((r) => (r.name ? r.name.text : r.cells.join('|')));

    async function openMedia(ctx, sub, name, {author, pub} = {}) {
        await page.goto(wfUrl(ctx, sub.id, mKey(pub || sub.pub), author));
        await idle(page);
        await Promise.race([mediaTable().waitFor({timeout: 20000}), page.getByText(/not have access|not allowed|does not have access/i).first().waitFor({timeout: 20000})]).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length)[0]; return !d || !d.querySelector('table .pkpSpinner, h3 .pkpSpinner'); }, null, {timeout: 10000}).catch(() => {});
        await idle(page); await sleep(400);
        const mi = await mediaInfo();
        if (name) {
            await snap(name, {media: mi});
            log(`[${name}]`, JSON.stringify({present: mi.present, heads: mi.heads, ctrl: mi.controls, rows: rowsText(mi).slice(0, 8), text: mi.present ? undefined : flat(mi.text, 300)}).slice(0, 1400));
        }
        return mi;
    }
    const rowOf = (text, {high} = {}) => {
        let r = mediaTable().locator('tbody tr').filter({has: page.locator('a', {hasText: new RegExp(`^\\s*${esc(text)}\\s*$`)})});
        if (high === true) r = r.filter({hasText: 'High resolution'});
        if (high === false) r = r.filter({hasNotText: 'High resolution'});
        return r.first();
    };
    async function rowMenu(text, press, opts) {
        const row = rowOf(text, opts);
        await row.waitFor({timeout: 20000});
        const btn = row.getByRole('button', {name: /More Actions/}).first();
        if (!(await btn.count())) return {items: [], noButton: true, buttons: await row.getByRole('button').count()};
        await btn.click(); await sleep(300);
        const items = await page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
        if (press) {
            const it = page.getByRole('menuitem', {name: press, exact: true}).first();
            if (!(await it.count())) { await btn.click().catch(() => {}); await sleep(200); return {items, noItem: true}; }
            await it.click(); await idle(page); await sleep(500);
        } else { await btn.click().catch(() => {}); await sleep(200); }
        return {items};
    }
    // The topmost window as data.
    const winInfo = () => page.evaluate(() => {
        const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
        const ds = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter(v);
        const d = ds[ds.length - 1];
        if (!d) return {open: false, count: 0};
        const lab = d.getAttribute('aria-labelledby');
        return {open: true, count: ds.length, role: d.getAttribute('role'),
            title: lab ? f(document.getElementById(lab)?.innerText) : (d.getAttribute('aria-label') || null),
            headings: [...d.querySelectorAll('h1,h2,h3,h4')].filter(v).map((h) => f(h.innerText)).filter(Boolean).slice(0, 6),
            tabs: [...d.querySelectorAll('[role=tab]')].filter(v).map((x) => f(x.innerText)),
            text: f(d.innerText).slice(0, 2000),
            buttons: [...d.querySelectorAll('button')].filter(v).map((b) => `${f(b.innerText) || b.getAttribute('aria-label')}${b.disabled ? '(dis)' : ''}`).filter(Boolean)};
    }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    async function waitWindow(title) {
        await page.locator(vis).filter({has: page.locator('h1, h2', {hasText: title})}).last().waitFor({timeout: T});
        await idle(page); await sleep(500);
    }
    // Close every window above the workflow dialog: an Error's "OK", an unsaved-changes "Yes", else the top "Close".
    async function closeAll(label) {
        const seen = [];
        for (let i = 0; i < 8; i++) {
            if ((await openCount()) <= 1) break;
            const w = await winInfo();
            seen.push({title: w.title, headings: w.headings, text: flat(w.text, 240), buttons: w.buttons});
            const t = top();
            const pick = async (re) => { const b = t.getByRole('button', {name: re}).last(); if (await b.count()) { await b.click(); return true; } return false; };
            if (/The data on this form has changed|unsaved|Are you sure you want to leave/i.test(w.text || '') && (await pick(/^Yes$/))) { /* answered */ }
            else if ((w.title === 'Error' || (w.headings || []).includes('Error')) && (await pick(/^OK$/))) { /* answered */ }
            else if (!(await pick(/^Close/))) { if (!(await pick(/^Cancel$/))) break; }
            await sleep(800); await idle(page);
        }
        if (label) seen.label = label;
        return seen;
    }
    // After a write: wait for the media API's answer, then read the window on top.
    function writeWatch() {
        return page.waitForResponse((r) => /\/api\/v1\/.*mediaFiles/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000})
            .then((r) => ({status: r.status(), url: r.url().replace(/^.*\/api\/v1/, '').slice(0, 160)})).catch(() => null);
    }
    async function outcome(t0, respP, name) {
        const resp = await respP;
        await sleep(1200); await idle(page);
        const w = await winInfo();
        const o = {resp, top: {title: w.title, headings: w.headings, text: flat(w.text, 400), buttons: w.buttons, count: w.count}, traffic: trafficSince(t0), dialogs: dialogsSince(t0)};
        if (name) await snap(name, {outcome: o});
        o.closed = await closeAll();
        return o;
    }
    // Pick a fixture under a new name for the upload (so each role's row is its own).
    function namedCopy(base, as) {
        const dir = path.join(outDir(), 'files'); fs.mkdirSync(dir, {recursive: true});
        const p = path.join(dir, as); fs.copyFileSync(fx(app.name, base), p); return p;
    }
    async function upload(k, name) {
        const btn = page.getByRole('button', {name: 'Add Media File', exact: true});
        if (!(await btn.count())) return {offered: false};
        await btn.click();
        await waitWindow('Upload Media File');
        const chooserP = page.waitForEvent('filechooser', {timeout: T});
        await top().getByRole('button', {name: 'Click to upload files', exact: true}).click();
        await (await chooserP).setFiles([namedCopy('figure.png', `k3-${k}.png`)]);
        await page.waitForFunction(() => { const ds = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); const d = ds[ds.length - 1]; return d && (d.querySelector('select[id*="-genreId-"]') || d.querySelector('.pkpFieldError__message')); }, null, {timeout: 60000}).catch(() => {});
        await idle(page);
        const g = top().locator('select[id*="-genreId-"]').first();
        if (await g.count()) await g.selectOption({label: 'Image'});
        await sleep(300);
        const t0 = Date.now();
        const respP = writeWatch();
        await top().getByRole('button', {name: 'Upload Files', exact: true}).click();
        return {offered: true, ...(await outcome(t0, respP, name))};
    }
    async function editSave(file, newName, name) {
        const m = await rowMenu(file, 'Edit Metadata');
        if (m.noButton || m.noItem) return {offered: false, menu: m};
        await waitWindow('Edit Metadata');
        const box = top().locator('.pkpFormField').filter({has: page.locator('.pkpFormFieldLabel, label, legend', {hasText: 'Name of the file'})}).first().locator('input').first();
        await box.fill(newName); await box.blur().catch(() => {});
        const t0 = Date.now();
        const respP = writeWatch();
        await top().getByRole('button', {name: 'Save', exact: true}).last().click();
        return {offered: true, ...(await outcome(t0, respP, name))};
    }
    async function manualLink(web, high, name) {
        const W = 'Manually Link Media';
        const m = await rowMenu(web, W);
        if (m.noButton || m.noItem) return {offered: false, menu: m};
        await waitWindow(W);
        await top().getByLabel(/Select the media file to link/).selectOption({label: high});
        const t0 = Date.now();
        const respP = writeWatch();
        await top().getByRole('button', {name: 'Link Media', exact: true}).last().click();
        return {offered: true, ...(await outcome(t0, respP, name))};
    }
    async function batchLink(web, high, name) {
        const btn = page.getByRole('button', {name: 'Batch Link Media', exact: true});
        if (!(await btn.count())) return {offered: false};
        await btn.click();
        await waitWindow('Batch Link Media');
        const sel = top().locator('tbody tr').filter({hasText: web}).locator('select').first();
        const opts = await sel.locator('option').allInnerTexts().catch(() => []);
        await sel.selectOption({label: high});
        const t0 = Date.now();
        const respP = writeWatch();
        await top().getByRole('button', {name: 'Link Media', exact: true}).last().click();
        return {offered: true, options: opts, ...(await outcome(t0, respP, name))};
    }
    async function del(file, name) {
        const m = await rowMenu(file, 'Delete File');
        if (m.noButton || m.noItem) return {offered: false, menu: m};
        await sleep(400);
        const d = page.locator(vis).filter({has: page.getByRole('button', {name: 'OK', exact: true})}).last();
        const q = flat(await d.innerText().catch(() => null), 300);
        const t0 = Date.now();
        const respP = writeWatch();
        await d.getByRole('button', {name: 'OK', exact: true}).click();
        return {offered: true, question: q, ...(await outcome(t0, respP, name))};
    }
    // Every change the page offers, in turn, each followed by a reload of the list.
    async function fullSet(ctx, sub, k, {pub} = {}) {
        const out = {};
        const open = (n) => openMedia(ctx, sub, n, {pub});
        out.page = await open(`${k}-01-page`);
        out.menus = {};
        for (const r of (out.page.rows || [])) if (r.name && r.buttons.some((b) => /More Actions/.test(b))) out.menus[r.name.text + (/High resolution/.test(r.cells.join(' ')) ? ' (high)' : '')] = (await rowMenu(r.name.text, null, {high: /High resolution/.test(r.cells.join(' '))})).items;
        out.upload = await upload(k, `${k}-02-upload`);
        out.afterUpload = names(await open(`${k}-03-after-upload`));
        out.edit = await editSave('style.css', `style-${k}.css`, `${k}-04-edit`);
        out.afterEdit = names(await open(`${k}-05-after-edit`));
        out.manual = await manualLink('solo.png', 'solo-hi.png', `${k}-06-manual`);
        out.afterManual = rowsText(await open(`${k}-07-after-manual`));
        out.batch = await batchLink('lone.png', 'lone-hi.png', `${k}-08-batch`);
        out.afterBatch = rowsText(await open(`${k}-09-after-batch`));
        const cssName = (out.afterBatch || []).some((x) => x.includes(`style-${k}.css`)) ? `style-${k}.css` : 'style.css';
        out.del = await del(cssName, `${k}-10-delete`);
        out.afterDelete = rowsText(await open(`${k}-11-after-delete`));
        const sum = (o) => (o && o.offered === false ? 'not offered' : o ? `${o.resp ? o.resp.status : 'no-resp'} top=${o.top && (o.top.title || (o.top.headings || [])[0])} ${o.top && /not allowed/.test(o.top.text || '') ? 'NOT-ALLOWED' : ''}` : null);
        out.summary = {controls: out.page.controls, menus: out.menus, upload: sum(out.upload), edit: sum(out.edit), manual: sum(out.manual), batch: sum(out.batch), del: sum(out.del),
            listBefore: names(out.page), listAfter: names(await mediaInfo())};
        return out;
    }
    // Offers only: the page, its controls, each row's menu, and what pressing the first file name does.
    async function offers(ctx, sub, k, {author, pub, link = true} = {}) {
        const mi = await openMedia(ctx, sub, `${k}-page`, {author, pub});
        const out = {present: mi.present, heads: mi.heads, nav: mi.nav, controls: mi.controls, rows: rowsText(mi), text: mi.present ? undefined : flat(mi.text, 400), url: mi.url};
        if (mi.present) {
            out.menus = {};
            for (const r of mi.rows || []) {
                if (!r.name) continue;
                const high = /High resolution/.test(r.cells.join(' '));
                const key = r.name.text + (high ? ' (high)' : '');
                out.menus[key] = r.buttons.some((b) => /More Actions/.test(b)) ? (await rowMenu(r.name.text, null, {high})).items : `no menu (${r.buttons.join(',') || 'no buttons'})`;
            }
            if (link) out.link = await openName(mi.rows.find((r) => r.name && r.name.text === 'lone.png') || mi.rows.find((r) => r.name), `${k}-link`);
        }
        return out;
    }
    // Press a row's file name: record the new tab (or download) and the server's answer.
    async function openName(row, name) {
        if (!row || !row.name) return {none: true};
        const t0 = Date.now();
        const ctxt = page.context();
        const respP = ctxt.waitForEvent('response', {predicate: (r) => /download-file|downloadFile|file-api/i.test(r.url()), timeout: 15000}).catch(() => null);
        const popupP = page.waitForEvent('popup', {timeout: 10000}).catch(() => null);
        const dlP = page.waitForEvent('download', {timeout: 6000}).then((d) => d.suggestedFilename()).catch(() => null);
        const hi = /High resolution/.test(row.cells.join(' '));
        await rowOf(row.name.text, {high: hi}).locator('a').first().click();
        const popup = await popupP;
        const resp = await respP;
        let popupInfo = null;
        if (popup) {
            await popup.waitForLoadState('load', {timeout: 10000}).catch(() => {});
            popupInfo = {url: popup.url().replace(/^.*\/index\.php/, '').slice(0, 220), text: flat(await popup.locator('body').innerText({timeout: 3000}).catch(() => null), 200)};
            await popup.close().catch(() => {});
        }
        const o = {file: row.name.text, href: row.name.href && row.name.href.replace(/^.*\/index\.php/, '').slice(0, 200), target: row.name.target,
            resp: resp ? {status: resp.status(), type: resp.headers()['content-type'], disposition: resp.headers()['content-disposition'] || null} : null,
            popup: popupInfo, download: await dlP, traffic: trafficSince(t0)};
        record(name, o);
        return o;
    }
    async function moreInfo(file, name, {high} = {}) {
        const m = await rowMenu(file, 'More Information', {high});
        if (m.noButton || m.noItem) return {menu: m, offered: false};
        const dlg = top();
        await dlg.locator('tbody tr td').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await sleep(900);
        const w = await winInfo();
        const rows = await dlg.locator('tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')).join(' | '))).catch(() => []);
        const tabs = await dlg.locator('[role=tab], .ui-tabs-nav li a').allInnerTexts().catch(() => []);
        const o = {offered: true, title: w.title, headings: w.headings, tabs, rows, buttons: w.buttons};
        await snap(name, {moreInfo: o});
        // each tab: its content
        o.tabContents = {};
        for (const tb of tabs.map((x) => x.trim()).filter(Boolean)) {
            const tl = dlg.locator('[role=tab], .ui-tabs-nav li a').filter({hasText: tb}).first();
            await tl.click().catch(() => {}); await idle(page); await sleep(900);
            o.tabContents[tb] = flat(await dlg.innerText().catch(() => null), 700);
        }
        o.closed = await closeAll();
        return o;
    }
    async function sideNav(ctx, sub, name, {author} = {}) {
        await page.goto(wfUrl(ctx, sub.id, null, author)); await idle(page); await sleep(900);
        const mi = await mediaInfo();
        await snap(name, {nav: mi.nav, heads: mi.heads});
        return {nav: mi.nav, heads: mi.heads, text: flat(mi.text, 300)};
    }

    try {
        // ============================================================ roles: Settings bullets 4 and 5 (Roles › Edit)
        if (on('roles') && !done('roles')) await sect('roles', async () => {
            const out = {rows: [], forms: []};
            await as(C.u.mgr, C.path);
            const land = async () => {
                await page.goto(cUrl(C.path, '/management/settings/access')); await idle(page);
                const tab = page.locator('#roles-button').first();
                if (await tab.count()) await tab.click();
                await idle(page);
                await page.locator('tr.gridRow').first().waitFor({timeout: T});
                await sleep(500);
            };
            await land();
            out.rows = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => ({id: e.id, text: e.innerText.replace(/\s+/g, ' ').trim(),
                boxes: [...e.querySelectorAll('input[type=checkbox]')].map((i) => `${i.checked ? 'x' : 'o'}${i.disabled ? 'd' : ''}`).join('')})));
            await snap('roles-01-grid', {rows: out.rows});
            const n = out.rows.length;
            for (let i = 0; i < n; i++) {
                const row = page.locator('tr.gridRow').nth(i);
                const text = (await row.innerText()).replace(/\s+/g, ' ').trim();
                const arrow = row.locator('a.show_extras');
                if (!(await arrow.count())) { out.forms.push({row: text, noArrow: true}); continue; }
                await arrow.click(); await idle(page);
                const edit = page.getByRole('link', {name: 'Edit', exact: true}).last();
                if (!(await edit.isVisible().catch(() => false))) { out.forms.push({row: text, noEdit: true}); await land(); continue; }
                await edit.click();
                const form = page.locator('form#userGroupForm');
                await form.waitFor({state: 'visible', timeout: T}).catch(() => {});
                await form.locator('input[name="assignedStages[]"], input[name="permitMetadataEdit"]').first().waitFor({timeout: 10000}).catch(() => {});
                await sleep(300);
                const f = await form.evaluate((el) => {
                    const g = (n) => el.querySelector(`input[name="${n}"]`);
                    const lab = (i) => (i && (el.querySelector(`label[for="${i.id}"]`) || i.closest('label'))) ? (el.querySelector(`label[for="${i.id}"]`) || i.closest('label')).innerText.trim() : null;
                    const pm = g('permitMetadataEdit');
                    return {name: (el.querySelector('input[name^="name"]') || {}).value || null,
                        level: (() => { const s = el.querySelector('select[name="roleId"]'); return s ? s.options[s.selectedIndex].text.trim() + (s.disabled ? ' (disabled)' : '') : null; })(),
                        permitMetadataEdit: pm ? {checked: pm.checked, disabled: pm.disabled, label: lab(pm)} : 'absent',
                        stages: [...el.querySelectorAll('input[name="assignedStages[]"]')].map((i) => `${lab(i)}:${i.checked ? 'x' : 'o'}${i.disabled ? 'd' : ''}`)};
                }).catch((e) => ({error: String(e.message).slice(0, 200)}));
                f.row = text;
                out.forms.push(f);
                if (/Layout Editor/i.test(f.name || '')) {
                    await snap('roles-02-layout-editor-form', {form: f});
                    await loc(page, 'Roles › Edit › "Permit submission metadata edit." box', form.locator('input[name="permitMetadataEdit"]'));
                    await loc(page, 'Roles › Edit › "Stage Assignment" boxes', form.locator('input[name="assignedStages[]"]'));
                }
                if (/^(Section editor|Series editor|Moderator)$/i.test(f.name || '')) await snap('roles-03-section-editor-form', {form: f});
                const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
                await cancel.click().catch(() => {});
                await form.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
                await land();
            }
            fact('roles', {grid: out.rows.map((r) => `${r.text} [${r.boxes}]`), forms: out.forms.map((f) => `${f.name || f.row} | level ${f.level} | permit ${JSON.stringify(f.permitMetadataEdit)} | ${(f.stages || []).join(' ')}${f.skipped ? ' | ' + f.skipped : ''}`)});
            if (S.D) {
                await as(S.D.u.mgr, S.D.path);
                await page.goto(cUrl(S.D.path, '/management/settings/access')); await idle(page);
                const tab = page.locator('#roles-button').first(); if (await tab.count()) await tab.click();
                await idle(page); await page.locator('tr.gridRow').first().waitFor({timeout: T}); await sleep(500);
                const rowsD = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => `${e.innerText.replace(/\s+/g, ' ').trim()} [${[...e.querySelectorAll('input[type=checkbox]')].map((i) => (i.checked ? 'x' : 'o')).join('')}]`));
                await snap('roles-04-context-D-grid', {rows: rowsD});
                fact('rolesD', rowsD.filter((r) => /Copyeditor/i.test(r)));
            }
            markDone('roles');
        });

        // ============================================================ assign: the "Permissions" box the Assign window pre-ticks
        if (on('assign') && !done('assign') && !isOPS) await sect('assign', async () => {
            const out = {};
            await as(C.u.mgr, C.path);
            await page.goto(wfUrl(C.path, s.aAD.id, 'workflow_5')); await idle(page); await sleep(800);
            const assignWin = () => page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
            const want = isOJS ? ['Section editor', 'Guest editor', 'Layout Editor', 'Designer', 'Proofreader', 'Copyeditor'] : ['Series editor', 'Layout Editor', 'Designer', 'Proofreader', 'Copyeditor'];
            for (const w of want) {
                const btn = page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true});
                if (!(await btn.count())) { out.noAssign = true; break; }
                await btn.click();
                const win = assignWin();
                await win.locator('select[name="filterUserGroupId"]').waitFor({timeout: T}); await idle(page);
                const opts = await win.locator('select[name="filterUserGroupId"] option').allInnerTexts();
                const label = opts.find((o) => o.trim().toLowerCase() === w.toLowerCase());
                if (!label) { out[w] = {absent: true, options: opts}; await win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click().catch(() => {}); await sleep(900); continue; }
                await win.locator('select[name="filterUserGroupId"]').selectOption({label});
                await idle(page); await sleep(200);
                const resp = page.waitForResponse((r) => /fetchGrid|fetch-grid/i.test(r.url()), {timeout: 15000}).catch(() => null);
                await win.getByRole('button', {name: 'Search', exact: true}).click();
                await resp; await idle(page); await sleep(400);
                const radio = win.locator('input[name="userId"]').first();
                if (await radio.count()) { await radio.check(); await idle(page); await sleep(300); }
                out[w] = await win.evaluate((d) => {
                    const box = (n) => { const i = d.querySelector(`input[name="${n}"]`); if (!i) return 'absent'; const l = d.querySelector(`label[for="${i.id}"]`) || i.closest('label'); return {checked: i.checked, visible: i.getClientRects().length > 0, label: l ? l.innerText.trim().replace(/\s+/g, ' ') : null}; };
                    return {person: (d.querySelector('input[name="userId"]:checked') || {}).value || null, canChangeMetadata: box('canChangeMetadata'), recommendOnly: box('recommendOnly')};
                });
                if (w === 'Layout Editor') await snap('assign-01-layout-editor', {assign: out[w]});
                if (/Section|Series/.test(w)) await snap('assign-02-section-editor', {assign: out[w]});
                await win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click().catch(() => {});
                await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
                await idle(page); await sleep(900);
            }
            fact('assign', out);
            markDone('assign');
        });

        // ============================================================ offers: what each level is offered on a1 (q1, q2, q4 reads)
        if (on('offers') && !done('offers')) await sect('offers', async () => {
            const out = {};
            const whoList = isOPS ? ['mgr', 'admin', 'se', 'se2', 'ebm', 'seu', 'au'] : ['mgr', 'ed', 'pe', 'admin', 'se', ...(isOJS ? ['ge'] : []), 'le', 'de', 'ix', 'pr', 'ce', 'fu', ...(isOMP ? ['mk'] : []), 'seu', 'au'];
            for (const k of whoList) {
                const user = k === 'admin' ? 'admin' : C.u[k];
                await as(user, C.path);
                const author = k === 'au';
                const o = await offers(C.path, s.a1, `off-${k}`, {author});
                if (!o.present) o.side = await sideNav(C.path, s.a1, `off-${k}-workflow`, {author});
                out[k] = o;
                log(`[offers ${k}]`, JSON.stringify({present: o.present, controls: o.controls, menus: o.menus, link: o.link && {status: o.link.resp && o.link.resp.status, type: o.link.resp && o.link.resp.type, popup: !!o.link.popup, dl: o.link.download}, side: o.side && o.side.nav, text: o.text}).slice(0, 1500));
            }
            fact('offers', Object.fromEntries(Object.entries(out).map(([k, o]) => [k, {present: o.present, controls: (o.controls || []).map((c) => c.text + (c.disabled ? '(dis)' : '')), menus: o.menus, rows: (o.rows || []).length,
                link: o.link && {file: o.link.file, target: o.link.target, status: o.link.resp && o.link.resp.status, type: o.link.resp && o.link.resp.type, disp: o.link.resp && o.link.resp.disposition, popup: o.link.popup, dl: o.link.download},
                nav: (o.nav || []).filter((x) => /Media|Galleys|Publication|Preprint|Title|Version|Create/.test(x)), side: o.side && o.side.nav, text: o.text}])));
            markDone('offers');
        });

        // ============================================================ q3: a press's roles that reach "Media" without Production; the journal control
        if (on('q3') && !done('q3') && !isOPS) await sect('q3', async () => {
            const out = {};
            for (const k of ['fu', 'ce', ...(isOMP ? ['mk'] : []), 'se']) {
                await as(C.u[k], C.path);
                const o = await offers(C.path, s.aR, `q3-${k}`);
                o.side = await sideNav(C.path, s.aR, `q3-${k}-workflow`);
                out[k] = {present: o.present, controls: o.controls, menus: o.menus, link: o.link && {status: o.link.resp && o.link.resp.status, popup: o.link.popup, dl: o.link.download}, nav: o.side.nav, text: o.text};
            }
            fact('q3', out);
            markDone('q3');
        });

        // ============================================================ refuse: Rule 7 / A1 for each unticked level
        if (on('refuse') && !done('refuse')) await sect('refuse', async () => {
            const out = {};
            const legs = isOPS ? [['se2', s.aSU]] : [['le', s.aLE], ...(isOJS ? [['ge', s.aGE]] : []), ['se2', s.aSU]];
            for (const [k, sub] of legs) {
                await as(C.u[k], C.path);
                out[k] = await sect(`refuse-${k}`, () => fullSet(C.path, sub, `ref-${k}`));
                if (out[k]) log(`[refuse ${k}]`, JSON.stringify(out[k].summary).slice(0, 2000));
                if (k === 'le' && out[k]) {
                    const o = out[k].upload;
                    if (o && o.top) note(`ccK3: (ccK3, 2026-09-24) Refused media write (Rule 7): the "Error" window is a dialog whose title reads "${o.top.title || (o.top.headings || [])[0]}"; its button "OK". Detect it after the media API's non-GET answer (page.waitForResponse on /mediaFiles, 401) plus ~1 s; the action window stays open under it; a refused "Edit Metadata" Save opens no Error window at all and closes by its own "Close"/"Cancel" (unsaved dialog "Yes").`);
                }
            }
            fact('refuse', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v && v.summary])));
            markDone('refuse');
        });

        // ============================================================ assist: every other assistant level's one change (on a1, after the offers)
        if (on('assist') && !done('assist') && !isOPS) await sect('assist', async () => {
            const out = {};
            for (const k of ['de', 'ix', 'pr']) {
                await as(C.u[k], C.path);
                await openMedia(C.path, s.a1, `as-${k}-01-page`);
                out[k] = {upload: await upload(`as${k}`, `as-${k}-02-upload`)};
                out[k].after = names(await openMedia(C.path, s.a1, `as-${k}-03-after`));
                out[k] = {status: out[k].upload.resp && out[k].upload.resp.status, top: out[k].upload.top, after: out[k].after};
            }
            fact('assist', out);
            markDone('assist');
        });

        // ============================================================ hold: the ticked levels' changes
        if (on('hold') && !done('hold')) await sect('hold', async () => {
            const out = {};
            const legs = isOPS ? [['se', s.aSE, C]] : [['le2', s.aLT, C], ['se', s.aSE, C], ...(S.D && s.aCE && !s.aCE.error ? [['dce', s.aCE, S.D]] : [])];
            for (const [k, sub, ctx] of legs) {
                const user = k === 'dce' ? ctx.u.ce : ctx.u[k];
                await as(user, ctx.path);
                out[k] = await sect(`hold-${k}`, () => fullSet(ctx.path, sub, `hold-${k}`));
                if (out[k]) log(`[hold ${k}]`, JSON.stringify(out[k].summary).slice(0, 2000));
            }
            // D: the same Copyeditor with "Permissions" at the role default (unticked): offered, refused?
            if (S.D && s.aCEu && !s.aCEu.error) {
                await as(S.D.u.ce, S.D.path);
                out.dceDefault = await sect('hold-dceu', async () => {
                    const o = await offers(S.D.path, s.aCEu, 'hold-dceu-offers', {link: false});
                    await openMedia(S.D.path, s.aCEu);
                    const up = await upload('dceu', 'hold-dceu-upload');
                    return {present: o.present, controls: o.controls, menus: o.menus, upload: {status: up.resp && up.resp.status, top: up.top}, after: names(await openMedia(S.D.path, s.aCEu, 'hold-dceu-after'))};
                });
            }
            fact('hold', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v && (v.summary || v)])));
            markDone('hold');
        });

        // ============================================================ admin: the Site Administrator, not assigned (q4)
        if (on('admin') && !done('admin')) await sect('admin', async () => {
            await as('admin', C.path);
            const o = await fullSet(C.path, s.aAD, 'adm');
            fact('admin', o.summary);
            markDone('admin');
        });

        // ============================================================ pub: Rule 8 on a published (posted) version (q16)
        if (on('pub') && !done('pub')) await sect('pub', async () => {
            const out = {};
            await as(C.u.mgr, C.path);
            out.mgr = await sect('pub-mgr', () => fullSet(C.path, s.pub1, 'pub-mgr'));
            await as(C.u.se, C.path);
            out.se = await sect('pub-se', () => fullSet(C.path, s.pub2, 'pub-se'));
            // the Author's list on the published version (control)
            await as(C.u.au, C.path);
            out.au = await offers(C.path, s.pub1, 'pub-au', {author: true});
            fact('pub', {mgr: out.mgr && out.mgr.summary, se: out.se && out.se.summary, au: {present: out.au.present, controls: out.au.controls, menus: out.au.menus, link: out.au.link && out.au.link.resp}});
            markDone('pub');
        });

        // ============================================================ reader: Rule 8 "They reach readers at once"
        const figResp = [];
        page.on('response', (r) => { if (/figure[^/]*\.png/.test(r.url())) figResp.push({at: Date.now(), status: r.status(), type: r.headers()['content-type'], url: r.url().replace(/^.*\/index\.php/, '').slice(0, 200)}); });
        const figSince = (t0) => figResp.filter((x) => x.at >= t0).map(({at, ...x}) => x);
        async function readRender(name) {
            await idle(page); await sleep(800);
            const res = {url: page.url().replace(/^.*\/index\.php/, '')};
            for (const fr of page.frames()) {
                const d = await fr.evaluate(() => {
                    const img = document.querySelector('img[alt="Figure 1"]');
                    if (!img) return null;
                    return {src: img.getAttribute('src'), complete: img.complete, naturalWidth: img.naturalWidth};
                }).catch(() => null);
                if (d) { res.figure = d; res.frameUrl = fr.url().replace(/^.*\/index\.php/, ''); break; }
            }
            if (res.figure && !res.figure.complete) await sleep(1500);
            await snap(name, {render: res});
            return res;
        }
        async function mgrAddFigure(sub, name) {
            await as(C.u.mgr, C.path);
            await openMedia(C.path, sub, `${name}-media-before`);
            const btn = page.getByRole('button', {name: 'Add Media File', exact: true});
            await btn.click(); await waitWindow('Upload Media File');
            const chooserP = page.waitForEvent('filechooser', {timeout: T});
            await top().getByRole('button', {name: 'Click to upload files', exact: true}).click();
            await (await chooserP).setFiles([fx(app.name, 'figure.png')]);
            await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] select[id*="-genreId-"]').length >= 1, null, {timeout: 60000});
            await top().locator('select[id*="-genreId-"]').first().selectOption({label: 'Image'});
            const t0 = Date.now(); const respP = writeWatch();
            await top().getByRole('button', {name: 'Upload Files', exact: true}).click();
            const o = await outcome(t0, respP);
            o.list = names(await openMedia(C.path, sub, `${name}-media-after`));
            return {status: o.resp && o.resp.status, list: o.list, at: Date.now()};
        }
        if (on('reader') && !done('reader') && isOJS) await sect('reader', async () => {
            const out = {};
            const view = async (name) => {
                await as(C.u.rd, C.path);
                await page.goto(cUrl(C.path, `/article/view/${s.rp.id}`)); await idle(page);
                const t0 = Date.now();
                await page.locator('a.obj_galley_link', {hasText: 'HTML'}).first().click();
                await page.waitForLoadState('load').catch(() => {});
                const r = await readRender(name); r.fig = figSince(t0);
                return r;
            };
            out.before = await view('rd-01-reader-no-media');
            out.add = await mgrAddFigure(s.rp, 'rd-02');
            out.afterAdd = await view('rd-03-reader-after-add');
            await as(C.u.mgr, C.path);
            await openMedia(C.path, s.rp);
            out.del = await del('figure.png', 'rd-04-delete');
            out.afterDel = await view('rd-05-reader-after-delete');
            fact('reader', {before: out.before.figure, add: out.add, afterAdd: out.afterAdd.figure, del: out.del && (out.del.resp || {}).status, afterDel: out.afterDel.figure});
            markDone('reader');
        });
        if (on('reader') && !done('reader') && isOMP) await sect('reader-omp', async () => {
            const o = {};
            const P = s.op;
            await as(C.u.mgr, C.path);
            if (!S.ompBuilt) {
                await page.goto(wfUrl(C.path, P.id, `publication_${P.pub}_publicationFormats`)); await idle(page);
                await wf().getByRole('link', {name: 'Add publication format'}).first().click();
                await top().locator('input[name^="name"]').first().waitFor({timeout: T}); await idle(page);
                await top().locator('input[name^="name"]').first().fill('HTML');
                await top().getByRole('button', {name: 'OK', exact: true}).click();
                await idle(page); await sleep(1500); await idle(page);
                const cat = () => wf().locator('tr').filter({hasText: 'HTML'}).filter({has: page.locator('.onix_code')}).first();
                await cat().getByRole('link', {name: 'Change File', exact: true}).first().click();
                const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
                await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: T}); await idle(page);
                const genre = wiz.locator('select[id^="genreId"]');
                if (await genre.count()) {
                    const opts = await genre.locator('option').evaluateAll((els) => els.map((x) => ({v: x.value, t: x.text.trim()})).filter((x) => x.v));
                    await genre.selectOption(opts[0].v);
                }
                await wiz.locator('input[type="file"]').setInputFiles(fx('omp', 'article.html'));
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length); return b && !b.disabled; }, null, {timeout: T});
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
                await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page); await sleep(1500); await idle(page);
                const fileRow = () => wf().locator('tr.gridRow').filter({hasText: 'article.html'}).first();
                const approve = fileRow().getByRole('link', {name: /Not Approved/}).first();
                if (await approve.count()) { await approve.click(); await idle(page); await sleep(700); await top().getByRole('button', {name: /^(OK|Yes|Approve)$/}).first().click().catch(() => {}); await idle(page); await sleep(1200); }
                const terms = fileRow().getByRole('link', {name: /Set Terms|Not Available|Open Access/}).first();
                if (await terms.count()) {
                    await terms.click(); await idle(page); await sleep(900);
                    const oa = top().locator('input[type="radio"][value="openAccess"]').first();
                    if (await oa.count()) await oa.check();
                    await top().getByRole('button', {name: /^(Save|OK)$/}).first().click().catch(() => {});
                    await idle(page); await sleep(1200);
                }
                const fmtApprove = cat().getByRole('link', {name: /Awaiting Approval|Not Approved|Incomplete/i}).first();
                if (await fmtApprove.count()) { await fmtApprove.click(); await idle(page); await sleep(700); await top().getByRole('button', {name: /^(OK|Yes|Approve)$/}).first().click().catch(() => {}); await idle(page); await sleep(1200); }
                o.formatRow = flat(await cat().innerText().catch(() => null), 300);
                await page.goto(wfUrl(C.path, P.id, `publication_${P.pub}_titleAbstract`)); await idle(page);
                await page.getByRole('button', {name: 'Publish', exact: true}).first().click();
                const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
                await modal.waitFor({state: 'visible', timeout: T}); await idle(page);
                const stage = modal.locator('select[name="versionStage"]');
                if (await stage.isVisible().catch(() => false)) { if (!(await stage.inputValue())) await stage.selectOption('VoR'); }
                const minor = modal.locator('select[name="versionIsMinor"]');
                if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
                const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await modal.getByRole('button', {name: 'Publish', exact: true}).click();
                o.publish = await w.then((r) => (r ? r.status() : null));
                await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page);
                await page.goto(wfUrl(C.path, P.id, `publication_${P.pub}_publicationFormats`)); await idle(page);
                const avail = cat().getByRole('link', {name: /^Not Available$/}).first();
                if (await avail.count()) { await avail.click(); await idle(page); await sleep(700); await top().getByRole('button', {name: /^(OK|Yes)$/}).first().click().catch(() => {}); await idle(page); await sleep(1200); }
                o.formatRowFinal = flat(await cat().innerText().catch(() => null), 300);
                await snap('rd-omp-01-format-ready', {o});
                S.ompBuilt = true; save();
            }
            const bookView = async (name) => {
                await as(C.u.rd, C.path);
                await page.goto(cUrl(C.path, `/catalog/book/${P.id}`)); await idle(page);
                const link = page.locator('a[href*="/catalog/view/"]').filter({hasText: /HTML|article/}).first();
                if (!(await link.count())) { await snap(`${name}-book`); return {noLink: true}; }
                const t0 = Date.now();
                await link.click().catch(() => {});
                await page.waitForLoadState('load').catch(() => {});
                const r = await readRender(name); r.fig = figSince(t0);
                return r;
            };
            o.before = await bookView('rd-omp-02-reader-no-media');
            o.add = await mgrAddFigure(P, 'rd-omp-03');
            o.afterAdd = await bookView('rd-omp-04-reader-after-add');
            await as(C.u.mgr, C.path);
            await openMedia(C.path, P);
            o.del = await del('figure.png', 'rd-omp-05-delete');
            o.afterDel = await bookView('rd-omp-06-reader-after-delete');
            fact('reader', {build: {publish: o.publish, format: o.formatRowFinal}, before: o.before.figure || o.before, add: o.add, afterAdd: o.afterAdd.figure || o.afterAdd, del: o.del && (o.del.resp || {}).status, afterDel: o.afterDel.figure || o.afterDel});
            markDone('reader');
        });

        // ============================================================ versions: Rule 9 (q17)
        async function createNewVersion(name) {
            const link = wf().getByRole('link', {name: 'Create New Version', exact: true}).or(wf().getByRole('button', {name: 'Create New Version', exact: true})).first();
            await link.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
            if (!(await link.isVisible().catch(() => false))) return {offered: false};
            await link.click();
            const w = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
            await w.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
            await idle(page); await sleep(1500);
            const stage = w.locator('select[name="versionStage"]');
            if (!(await stage.inputValue())) await stage.selectOption('VoR');
            const minor = w.locator('select[name="versionIsMinor"]');
            if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
            await snap(`${name}-window`);
            const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
            await w.getByRole('button', {name: 'Confirm', exact: true}).click();
            const resp = await r;
            let newPub = null;
            if (resp) { try { newPub = (await resp.json()).id; } catch (e) { /* none */ } }
            await w.waitFor({state: 'detached', timeout: T}).catch(() => {});
            await idle(page);
            return {offered: true, status: resp && resp.status(), newPub};
        }
        async function readMeta(file, name, opts) {
            const m = await rowMenu(file, 'Edit Metadata', opts);
            if (m.noButton || m.noItem) return {menu: m};
            await waitWindow('Edit Metadata');
            const fields = await top().locator('.pkpFormField').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((ff) => `${(ff.querySelector('.pkpFormFieldLabel, label, legend') || {}).innerText || '?'}=${[...ff.querySelectorAll('input:not([type=hidden]), textarea, select')].map((e) => e.value).join(',')}`.replace(/\s+/g, ' ')));
            await snap(name, {fields});
            await closeAll();
            return fields;
        }
        async function fillMeta(file, vals, opts) {
            await rowMenu(file, 'Edit Metadata', opts); await waitWindow('Edit Metadata');
            for (const [label, v] of Object.entries(vals)) {
                const box = top().locator('.pkpFormField').filter({has: page.locator('.pkpFormFieldLabel, label, legend', {hasText: label})}).first().locator('input:not([type=hidden]), textarea').first();
                await box.fill(v); await box.blur().catch(() => {});
            }
            const t0 = Date.now(); const respP = writeWatch();
            await top().getByRole('button', {name: 'Save', exact: true}).last().click();
            const o = await outcome(t0, respP);
            return o.resp && o.resp.status;
        }
        if (on('versions') && !done('versions')) await sect('versions', async () => {
            const out = {};
            const v = s.v;
            await as(C.u.mgr, C.path);
            // details on the pair's web file and on the lone file before versioning
            await openMedia(C.path, v);
            out.detail1 = await fillMeta('figure.png', {Caption: 'Cap V1', Credit: 'Credit V1'}, {high: false});
            out.detail2 = await fillMeta('lone.png', {Caption: 'Lone cap V1'});
            out.v1Before = await openMedia(C.path, v, 'ver-01-v1-before');
            out.v1BeforeRows = rowsText(out.v1Before);
            out.cnv = await createNewVersion('ver-02-cnv');
            if (!out.cnv.newPub) { fact('versions', out); return; }
            S.vNew = out.cnv.newPub; save();
            const V2 = {pub: out.cnv.newPub};
            const v2 = await openMedia(C.path, v, 'ver-03-v2-list', V2);
            out.v2Rows = rowsText(v2); out.v2Nav = (v2.nav || []).slice(0, 40);
            out.v2Meta = {fig: await readMeta('figure.png', 'ver-04-v2-meta-figure', {high: false}), figHi: await readMeta('fig-hi.png', 'ver-05-v2-meta-fighi'), lone: await readMeta('lone.png', 'ver-06-v2-meta-lone')};
            out.v2Links = (v2.rows || []).map((r) => r.name && r.name.href && r.name.href.replace(/^.*\?/, '')).filter(Boolean);
            out.v1Links = (out.v1Before.rows || []).map((r) => r.name && r.name.href && r.name.href.replace(/^.*\?/, '')).filter(Boolean);
            // on the new version: rename lone.png, unlink the pair (Manually Link Media › "No high-resolution file"), delete style.css
            await openMedia(C.path, v, null, V2);
            out.v2Rename = await editSave('lone.png', 'lone-v2.png', 'ver-07-v2-rename');
            await openMedia(C.path, v, null, V2);
            out.v2Unlink = await sect('v2unlink', async () => {
                const m = await rowMenu('figure.png', 'Manually Link Media', {high: false});
                if (m.noItem || m.noButton) return {menu: m};
                await waitWindow('Manually Link Media');
                const sel = top().getByLabel(/Select the media file to link/);
                const opts = await sel.locator('option').allInnerTexts();
                const none = opts.find((x) => /No high-resolution/i.test(x));
                if (none) await sel.selectOption({label: none});
                const t0 = Date.now(); const respP = writeWatch();
                await top().getByRole('button', {name: 'Link Media', exact: true}).last().click();
                const o = await outcome(t0, respP, 'ver-08-v2-unlink');
                return {options: opts, status: o.resp && o.resp.status};
            });
            await openMedia(C.path, v, null, V2);
            out.v2Delete = await del('style.css', 'ver-09-v2-delete');
            const v2after = await openMedia(C.path, v, 'ver-10-v2-after', V2);
            out.v2After = rowsText(v2after);
            // the earlier version: its list, and its style.css still opening from its name link
            const v1after = await openMedia(C.path, v, 'ver-11-v1-after');
            out.v1After = rowsText(v1after);
            out.v1Meta = await readMeta('figure.png', 'ver-12-v1-meta-figure', {high: false});
            await openMedia(C.path, v);
            out.v1CssOpens = await openName((await mediaInfo()).rows.find((r) => r.name && r.name.text === 'style.css'), 'ver-13-v1-style-link');
            // the other direction: delete lone.png on the earlier (published) version; the new version's lone-v2.png still opens
            await openMedia(C.path, v);
            out.v1Delete = await del('lone.png', 'ver-14-v1-delete-lone');
            out.v1AfterDelete = rowsText(await openMedia(C.path, v, 'ver-15-v1-after-delete'));
            const v2b = await openMedia(C.path, v, 'ver-16-v2-after-v1-delete', V2);
            out.v2AfterV1Delete = rowsText(v2b);
            out.v2LoneOpens = await openName((v2b.rows || []).find((r) => r.name && r.name.text === 'lone-v2.png'), 'ver-17-v2-lone-link');
            // the side menu's version nodes
            out.nav = (v2b.nav || []).filter((x) => /Version|Create|Media/.test(x));
            fact('versions', {v1Before: out.v1BeforeRows, cnv: out.cnv, v2Rows: out.v2Rows, v2Meta: out.v2Meta, v1Links: out.v1Links, v2Links: out.v2Links,
                v2Rename: out.v2Rename && out.v2Rename.resp, v2Unlink: out.v2Unlink, v2Delete: out.v2Delete && out.v2Delete.resp, v2After: out.v2After, v1After: out.v1After, v1Meta: out.v1Meta,
                v1CssOpens: out.v1CssOpens && out.v1CssOpens.resp, v1Delete: out.v1Delete && out.v1Delete.resp, v1AfterDelete: out.v1AfterDelete, v2AfterV1Delete: out.v2AfterV1Delete,
                v2LoneOpens: out.v2LoneOpens && out.v2LoneOpens.resp, nav: out.nav, details: [out.detail1, out.detail2]});
            markDone('versions');
        });

        // ============================================================ moreinfo: "More Information" (q24), per level
        if (on('moreinfo') && !done('moreinfo')) await sect('moreinfo', async () => {
            const out = {};
            const legs = isOPS ? [['mgr', s.a1], ['se', s.a1], ['se2', s.a1]] : [['mgr', s.a1], ['se', s.a1], ['le', s.a1]];
            for (const [k, sub] of legs) {
                await as(C.u[k], C.path);
                await openMedia(C.path, sub);
                out[k] = {web: await moreInfo('figure.png', `mi-${k}-01-web`, {high: false})};
                await openMedia(C.path, sub);
                out[k].high = await moreInfo('fig-hi.png', `mi-${k}-02-high`);
                await openMedia(C.path, sub);
                out[k].css = await moreInfo('style.css', `mi-${k}-03-css`);
            }
            // the uploaded-on-screen file of the admin leg (a History with an upload line)
            if (done('admin')) {
                await as(C.u.mgr, C.path);
                await openMedia(C.path, s.aAD);
                out.admUpload = await moreInfo('k3-adm.png', 'mi-mgr-04-onscreen-upload');
            }
            fact('moreinfo', out);
            markDone('moreinfo');
        });

        // ============================================================ leave: the Media page left with a window changed and unsaved
        if (on('leave') && !done('leave')) await sect('leave', async () => {
            const out = {};
            await as(C.u.mgr, C.path);
            await openMedia(C.path, s.aSE, 'lv-01-page');
            await rowMenu('lone.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            const box = top().locator('.pkpFormField').filter({has: page.locator('.pkpFormFieldLabel, label, legend', {hasText: 'Caption'})}).first().locator('textarea, input').first();
            await box.fill('unsaved caption'); await box.blur().catch(() => {});
            const t0 = Date.now();
            // a side-menu page of the workflow behind, pressed while the window is open
            const other = page.locator('[role="dialog"]:visible').first().getByRole('link', {name: /^Title & Abstract$/}).or(page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /^Title & Abstract$/})).first();
            out.otherVisible = await other.isVisible().catch(() => false);
            await other.click({timeout: 5000}).catch((e) => { out.clickErr = flat(e.message, 200); });
            await sleep(1200); await idle(page);
            out.afterClick = await winInfo();
            await snap('lv-02-after-side-menu-click', {w: out.afterClick});
            out.closed = await closeAll();
            // then another address altogether
            await rowMenu('lone.png', 'Edit Metadata').catch(() => {}); await waitWindow('Edit Metadata').catch(() => {});
            await top().locator('.pkpFormField').filter({has: page.locator('.pkpFormFieldLabel, label, legend', {hasText: 'Caption'})}).first().locator('textarea, input').first().fill('unsaved caption 2').catch(() => {});
            await page.goto(cUrl(C.path, '/dashboard/editorial')).catch((e) => { out.gotoErr = flat(e.message, 200); });
            await idle(page);
            out.dialogs = dialogsSince(t0);
            out.traffic = trafficSince(t0);
            out.after = names(await openMedia(C.path, s.aSE, 'lv-03-page-after'));
            fact('leave', {otherVisible: out.otherVisible, clickErr: out.clickErr, afterClick: {title: out.afterClick.title, headings: out.afterClick.headings, count: out.afterClick.count, text: flat(out.afterClick.text, 300)}, closed: out.closed, dialogs: out.dialogs, gotoErr: out.gotoErr, traffic: out.traffic});
            markDone('leave');
        });

        // ============================================================ q3b: the press bullet's Copyediting end (and the journal control)
        if (on('q3b') && !done('q3b') && !isOPS) await sect('q3b', async () => {
            if (!s.aC) {
                const P = (k) => ({username: C.u[k], role: C.roles[k]});
                const hi = (name, pair) => ({file: 'profile-image-400.png', resolution: 'high_resolution', name, ...(pair ? {pair} : {})});
                const r = await app.api.createSubmission({tag: `${S.t}aC`, context: C.path, submitter: C.u.au, title: `K3 aC Wombatery ${S.t}`,
                    files: [{file: 'article.pdf'}], decisions: ['skipExternalReview'], participants: [P('se'), P('ce'), P('fu'), ...(isOMP ? [P('mk')] : [])],
                    mediaFiles: [{file: 'figure.png', pair: 'A'}, hi('fig-hi.png', 'A'), {file: 'figure.png', name: 'lone.png'}]});
                s.aC = {id: r.submissionId, pub: r.publicationId, stageId: r.stageId}; save();
                log('seed aC', JSON.stringify(s.aC));
            }
            const out = {stageId: s.aC.stageId};
            for (const k of ['ce', 'fu', ...(isOMP ? ['mk'] : []), 'se']) {
                await as(C.u[k], C.path);
                const o = await offers(C.path, s.aC, `q3b-${k}`);
                o.side = await sideNav(C.path, s.aC, `q3b-${k}-workflow`);
                out[k] = {present: o.present, url: o.url, controls: o.controls, menus: o.menus, link: o.link && {status: o.link.resp && o.link.resp.status, dl: o.link.download}, nav: o.side.nav.filter((x) => x.length < 40), text: o.text};
            }
            fact('q3b', out);
            markDone('q3b');
        });

        // ============================================================ mi2: "More Information" History, per level, waited out
        if (on('mi2') && !done('mi2')) await sect('mi2', async () => {
            const out = {};
            const legs = isOPS ? [['mgr'], ['se2']] : [['mgr'], ['le'], ['pr'], ['se']];
            for (const [k] of legs) {
                await as(C.u[k], C.path);
                await openMedia(C.path, s.a1);
                const seen = [];
                const h = (r) => { if (/informationCenter|eventlog|fetch-grid|fetchGrid|file-information-center|FileInformationCenter/i.test(r.url())) seen.push(r); };
                page.on('response', h);
                const m = await rowMenu('figure.png', 'More Information', {high: false});
                const dlg = top();
                const t0 = Date.now();
                let rows = [];
                while (Date.now() - t0 < 45000) {
                    rows = await dlg.locator('tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')).join(' | ')).filter((x) => x && !/pkpHandler/.test(x))).catch(() => []);
                    if (rows.length && !(await dlg.getByText('Loading', {exact: true}).isVisible().catch(() => false))) break;
                    await sleep(1000);
                }
                page.off('response', h);
                const resps = [];
                for (const r of seen) {
                    let body = null;
                    try { const t = await r.text(); body = {len: t.length, status: (t.match(/"status":\s*(true|false)/) || [])[1] || null, content: flat(t.replace(/<[^>]+>/g, ' '), 200)}; } catch (e) { body = null; }
                    resps.push({status: r.status(), url: r.url().replace(/^.*\$\$\$call\$\$\$/, '').slice(0, 160), body});
                }
                const w = await winInfo();
                await snap(`mi2-${k}-history`, {rows, resps});
                out[k] = {menu: m.items, title: w.title, waitedMs: Date.now() - t0, rows, loading: /Loading/.test(w.text || ''), resps};
                await closeAll();
            }
            fact('mi2', out);
            markDone('mi2');
        });

        // ============================================================ body: the OJS "Body Text" page (Cross-feature line 365–366)
        if (on('body') && !done('body') && isOJS) await sect('body', async () => {
            await as(C.u.mgr, C.path);
            await page.goto(wfUrl(C.path, s.aSE.id, `publication_${s.aSE.pub}_jatsBodyText`)); await idle(page); await sleep(1500);
            let mi = await mediaInfo();
            if (!(mi.heads || []).some((h) => /Body Text/.test(h))) {
                const link = wf().getByRole('link', {name: 'Body Text', exact: true}).or(wf().getByRole('button', {name: 'Body Text', exact: true})).first();
                await link.click().catch(() => {}); await idle(page); await sleep(1500);
            }
            const info = await page.evaluate(() => {
                const v = (e) => e && e.getClientRects().length > 0;
                const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
                const d = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
                return {heads: [...d.querySelectorAll('h1,h2,h3')].filter(v).map((h) => f(h.innerText)),
                    buttons: [...d.querySelectorAll('button')].filter(v).map((b) => f(b.innerText || b.getAttribute('aria-label') || b.getAttribute('title'))).filter(Boolean).slice(0, 80),
                    text: f(d.innerText).slice(0, 1500), url: location.href.replace(/^.*\/index\.php/, '')};
            });
            await snap('body-01-page', {info});
            fact('body', info);
            markDone('body');
        });

        // ============================================================ pe: the Production editor, not assigned (Actors: "count without an assignment")
        if (on('pe') && !done('pe') && !isOPS) await sect('pe', async () => {
            await as(C.u.pe, C.path);
            const o = await offers(C.path, s.aAD, 'pe-01-unassigned', {link: false});
            await openMedia(C.path, s.aAD);
            const up = await upload('pe', 'pe-02-upload');
            const after = names(await openMedia(C.path, s.aAD, 'pe-03-after'));
            fact('pe', {present: o.present, controls: o.controls, menus: o.menus, text: o.text, upload: up.resp, top: up.top && up.top.title, after});
            markDone('pe');
        });

        // ============================================================ hires: a high-resolution file named as the HTML names it; a style sheet
        if (on('hires') && !done('hires') && !isOPS) await sect('hires', async () => {
            const out = {};
            const sub = isOJS ? s.rp : s.op;
            const read = async (name) => {
                await as(C.u.rd, C.path);
                const t0 = Date.now();
                if (isOJS) {
                    await page.goto(cUrl(C.path, `/article/view/${sub.id}`)); await idle(page);
                    await page.locator('a.obj_galley_link', {hasText: 'HTML'}).first().click();
                } else {
                    await page.goto(cUrl(C.path, `/catalog/book/${sub.id}`)); await idle(page);
                    await page.locator('a[href*="/catalog/view/"]').filter({hasText: /HTML|article/}).first().click();
                }
                await page.waitForLoadState('load').catch(() => {});
                await idle(page); await sleep(1200);
                let r = null;
                for (const fr of page.frames()) {
                    const d = await fr.evaluate(() => {
                        const img = document.querySelector('img[alt="Figure 1"]');
                        if (!img) return null;
                        const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
                        return {src: img.getAttribute('src'), naturalWidth: img.naturalWidth, css};
                    }).catch(() => null);
                    if (d) { r = d; break; }
                }
                await snap(name, {render: r, fig: figSince(t0)});
                return r;
            };
            // 1. a high-resolution Image named figure.png, no web file of that name
            await as(C.u.mgr, C.path);
            await openMedia(C.path, sub);
            await page.getByRole('button', {name: 'Add Media File', exact: true}).click(); await waitWindow('Upload Media File');
            let chooserP = page.waitForEvent('filechooser', {timeout: T});
            await top().getByRole('button', {name: 'Click to upload files', exact: true}).click();
            await (await chooserP).setFiles([namedCopy('profile-image-400.png', 'figure.png')]);
            await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] select[id*="-genreId-"]').length >= 1, null, {timeout: 60000});
            await top().locator('select[id*="-genreId-"]').first().selectOption({label: 'Image'});
            await top().locator('select[id*="-variantType-"]').first().selectOption({label: 'High resolution'});
            let t0 = Date.now(); let respP = writeWatch();
            await top().getByRole('button', {name: 'Upload Files', exact: true}).click();
            out.hiUpload = (await outcome(t0, respP)).resp;
            out.hiList = rowsText(await openMedia(C.path, sub, 'hr-01-media-high-only'));
            out.hiRead = await read('hr-02-reader-high-only');
            // 2. a web figure.png beside it, and a style sheet named as the HTML names it (OJS article.css)
            await as(C.u.mgr, C.path);
            await openMedia(C.path, sub);
            await page.getByRole('button', {name: 'Add Media File', exact: true}).click(); await waitWindow('Upload Media File');
            chooserP = page.waitForEvent('filechooser', {timeout: T});
            await top().getByRole('button', {name: 'Click to upload files', exact: true}).click();
            const cssPath = path.join(outDir(), 'files', 'article.css'); fs.writeFileSync(cssPath, 'body { color: #123456; }\n');
            await (await chooserP).setFiles([fx(app.name, 'figure.png'), cssPath]);
            await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] select[id*="-genreId-"]').length >= 2, null, {timeout: 60000});
            const g = top().locator('select[id*="-genreId-"]');
            await g.nth(0).selectOption({label: 'Image'});
            await g.nth(1).selectOption({label: 'HTML Stylesheet'});
            t0 = Date.now(); respP = writeWatch();
            await top().getByRole('button', {name: 'Upload Files', exact: true}).click();
            out.webUpload = (await outcome(t0, respP)).resp;
            out.bothList = rowsText(await openMedia(C.path, sub, 'hr-03-media-both'));
            out.bothRead = await read('hr-04-reader-both');
            fact('hires', out);
            markDone('hires');
        });

        // ============================================================ leave2: the browser's page-leave question, with and without a change
        if (on('leave2') && !done('leave2')) await sect('leave2', async () => {
            const out = {};
            await as(C.u.mgr, C.path);
            const away = async (k) => { const t0 = Date.now(); await page.goto(cUrl(C.path, '/dashboard/editorial')).catch((e) => { out[`${k}Err`] = flat(e.message, 150); }); await idle(page); return dialogsSince(t0); };
            await openMedia(C.path, s.aSE);
            out.noWindow = await away('noWindow');
            await openMedia(C.path, s.aSE);
            await rowMenu('lone.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            out.windowNoChange = await away('windowNoChange');
            await openMedia(C.path, s.aSE);
            await rowMenu('lone.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            const box = top().locator('.pkpFormField').filter({has: page.locator('.pkpFormFieldLabel, label, legend', {hasText: 'Caption'})}).first().locator('textarea, input').first();
            await box.fill('unsaved caption'); await box.blur().catch(() => {});
            await snap('lv2-01-window-changed');
            out.windowChanged = await away('windowChanged');
            fact('leave2', out);
            markDone('leave2');
        });
    } finally {
        await close();
    }
});
