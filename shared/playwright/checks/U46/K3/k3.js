// U46 claim check, chunk K3: who does what, and versions. Spec docs/specs/U46-galleys.md: Purpose (10–26),
// Actors & permissions (27–51), Rule 11 (178–190), Settings bullet 4 {OPS} (237–243), Cross-feature interactions
// (244–271), Canonical preamble and Coverage (272–329), register heading/summary (330–347), A4 (379–389),
// OPS1–OPS2 (407–436); footnotes a, b, c, m, q, s, q1–q4, q15, q19, f-a4, f-ops1, f-ops2.
//
//   PROBE_FEATURE=U46 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U46/K3/k3.js
//   PHASES=seed,roles,se,le,mod,modposted,mod2,author,wizard,admin,versions,jats,issues,omp (default all; state in
//   k3-state-<app>.json; delete it for a fresh seed). A full run outlasts the Bash cap: run it detached per app.
//
// Scratch contexts (OJS, OPS; OMP a scratch press as the read-only absence control):
//   OJS J1  en + fr_CA; one unpublished issue. Users mgr (manager), ed (editor), pe (productionEditor), se (sectionEditor),
//           ge (guestEditor), le (layoutEditor), de (designer), ix (indexer), pr (proofreader), ce (copyeditor), au, au2.
//           a1  Production; se, ge with "Permissions" unticked, le, de, ix, pr, pe, ce assigned; PDF + Remote → every level
//           a2  Production; se unticked; "Seed" PDF → q2's full set as the Section Editor
//           a3  Production; le; "Seed" PDF → the full set as the Layout Editor
//           va, vb, vc  published, PDF (en) [+ HTML (fr_CA) + Remote on va] → Rule 11 / A4 (q15)
//           vj  Production, PDF → JATS on v1, published on screen, new version (A4's "files of their own")
//   OJS J2  Author role's "Permit submission metadata edit." ticked; b1 Production, PDF → Settings bullet 4's journal end
//   OJS J3  admin holds Copyeditor here, the manager role removed on screen; c1 Production, PDF → the admin's other end
//   OPS P1  en + fr_CA. Users mgr, se1, se2, se3 (Moderators; se3 assigned nowhere), ebm (editorialBoardMember), au, au2.
//           m0  unposted; se1 unticked, se2 ticked; PDF + HTML → offers per level; q3 (se1)
//           m2  unposted; se2 ticked; PDF + HTML → Moderator with "Permissions", the full set
//           mp  posted; se1 unticked, se2 ticked; PDF + HTML → after posting (se1 full set), q4 (au)
//           m1  unposted; PDF + HTML → the Author's full set before posting
//           wd  a draft of au → the wizard's "Upload Files"
//           va, vb, vc  posted → Rule 11 / A4
//   OPS P2  Author role's "Permit submission metadata edit." unticked: n1 unposted PDF + HTML (q19), n2 draft
//   OPS P3  admin holds Editorial Board Member here, the manager role removed on screen; d1 unposted, d2 posted
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'roles', 'se', 'le', 'mgrfull', 'mod', 'modposted', 'mod2', 'author', 'authview', 'authown', 'authmgr', 'wizard', 'wiz2', 'admin', 'versions', 'vc2', 'delpub', 'media', 'jats', 'issues', 'omp'];
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
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k3-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3500)); };
    const PDF = isOPS ? fx('ops', 'preprint.pdf') : fx('ojs', 'article.pdf');
    const REPL = isOPS ? fx('ops', 'replacement.pdf') : fx('ojs', 'replacement.pdf');
    const PDFNAME = isOPS ? 'preprint.pdf' : 'article.pdf';
    const HTMLNAME = isOPS ? 'preprint.html' : 'article.html';
    const MAIN = isOPS ? 'Preprint Text' : 'Article Text';

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u46k3');
        S.t = t;
        const U = (p, k, role, g, f) => ({username: `${p}${k}`, roles: [role], givenName: g, familyName: f});
        const ctxBase = (p, name, extra = {}) => ({name: `U46 K3 ${name} ${p}`, acronym: 'KTHR', contactName: 'K3 Contact', contactEmail: `${p}c@mail.test`, ...extra});
        const langs = {supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']};
        const sub = async (ctx, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctx.path, submitter: ctx.u.au, title: `K3 ${k} Wombatery ${t}`, ...spec});
                log('seed', k, r.submissionId, r.publicationId, r.stageId, JSON.stringify(r.galleys));
                return {id: r.submissionId, pub: r.publicationId, galleys: r.galleys, stageId: r.stageId};
            } catch (e) { log('seed FAILED', k, String(e.message).slice(0, 700)); return {error: String(e.message).slice(0, 700)}; }
        };
        const g = (label, file, locale) => ({label, file, ...(locale ? {locale} : {})});
        S.s = {};
        if (isOMP) {
            const p = `${t}x`;
            const r = await app.api.createContext({tag: p, context: ctxBase(p, 'press'), users: [U(p, 'mgr', 'manager', 'Mira', 'Manager'), U(p, 'au', 'author', 'Ava', 'Author')]});
            S.X = {path: r.path || p, u: {mgr: `${p}mgr`, au: `${p}au`}};
            S.s.om = await sub(S.X, 'om', {decisions: ['skipExternalReview', 'sendToProduction']});
            if (S.s.om.error) S.s.om = await sub(S.X, 'om', {});
            S.s.omg = await sub(S.X, 'omg', {galleys: [g('PDF', 'article.pdf')]});
        } else if (isOJS) {
            const p1 = `${t}a`;
            const keys = [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Eda', 'Editor'], ['pe', 'productionEditor', 'Pat', 'Production'],
                ['se', 'sectionEditor', 'Sid', 'Section'], ['ge', 'guestEditor', 'Gus', 'Guest'], ['le', 'layoutEditor', 'Lee', 'Layout'],
                ['de', 'designer', 'Dee', 'Designer'], ['ix', 'indexer', 'Ixa', 'Indexer'], ['pr', 'proofreader', 'Pru', 'Proofreader'],
                ['ce', 'copyeditor', 'Cec', 'Copyeditor'], ['au', 'author', 'Ava', 'Author'], ['au2', 'author', 'Abe', 'Other']];
            const r1 = await app.api.createContext({tag: p1, context: ctxBase(p1, 'journal', langs), users: keys.map(([k, r, gn, fn]) => U(p1, k, r, gn, fn)),
                issues: [{volume: 1, number: 1, year: 2026}]});
            S.J1 = {path: r1.path || p1, u: Object.fromEntries(keys.map(([k]) => [k, `${p1}${k}`])), roles: Object.fromEntries(keys.map(([k, r]) => [k, r]))};
            const p2 = `${t}b`;
            const r2 = await app.api.createContext({tag: p2, context: ctxBase(p2, 'author-edit-on'), roles: {author: {permitMetadataEdit: true}},
                users: [U(p2, 'mgr', 'manager', 'Mira', 'Manager'), U(p2, 'au', 'author', 'Ava', 'Author')]});
            S.J2 = {path: r2.path || p2, u: {mgr: `${p2}mgr`, au: `${p2}au`}};
            const p3 = `${t}c`;
            const r3 = await app.api.createContext({tag: p3, context: ctxBase(p3, 'admin-copyeditor'),
                users: [U(p3, 'mgr', 'manager', 'Mira', 'Manager'), U(p3, 'au', 'author', 'Ava', 'Author'), {username: 'admin', roles: ['copyeditor']}]});
            S.J3 = {path: r3.path || p3, u: {mgr: `${p3}mgr`, au: `${p3}au`}};
            save();
            const J1 = S.J1;
            const P = (k, can) => ({username: J1.u[k], role: J1.roles[k], ...(can === undefined ? {} : {canChangeMetadata: can})});
            const prod = {decisions: ['skipExternalReview', 'sendToProduction']};
            S.s.a1 = await sub(J1, 'a1', {...prod, participants: [P('se', false), P('ge', false), P('le'), P('de'), P('ix'), P('pr'), P('pe'), P('ce')],
                galleys: [g('PDF', PDFNAME), {label: 'Remote', locale: 'en', urlRemote: 'https://example.org/u46k3/remote.pdf'}]});
            if (S.s.a1.error) {
                S.s.a1err = S.s.a1.error;
                S.s.a1 = await sub(J1, 'a1', {...prod, participants: [P('se', false), P('ge', false), P('le'), P('de'), P('ix'), P('pr'), P('pe')],
                    galleys: [g('PDF', PDFNAME), {label: 'Remote', locale: 'en', urlRemote: 'https://example.org/u46k3/remote.pdf'}]});
            }
            S.s.a2 = await sub(J1, 'a2', {...prod, participants: [P('se', false)], galleys: [g('Seed', PDFNAME)]});
            S.s.a3 = await sub(J1, 'a3', {...prod, participants: [P('le')], galleys: [g('Seed', PDFNAME)]});
            S.s.va = await sub(J1, 'va', {...prod, galleys: [g('PDF', PDFNAME, 'en'), g('HTML', HTMLNAME, 'fr_CA'), {label: 'Remote', locale: 'en', urlRemote: 'https://example.org/u46k3/va.pdf'}], published: true});
            S.s.vb = await sub(J1, 'vb', {...prod, galleys: [g('PDF', PDFNAME)], published: true});
            S.s.vc = await sub(J1, 'vc', {...prod, galleys: [g('PDF', PDFNAME)], published: true});
            S.s.vj = await sub(J1, 'vj', {...prod, galleys: [g('PDF', PDFNAME)]});
            S.s.b1 = await sub(S.J2, 'b1', {...prod, galleys: [g('PDF', PDFNAME)]});
            S.s.c1 = await sub(S.J3, 'c1', {...prod, galleys: [g('PDF', PDFNAME)]});
        } else {
            const p1 = `${t}a`;
            const keys = [['mgr', 'manager', 'Mira', 'Manager'], ['se1', 'sectionEditor', 'Mona', 'NoPerm'], ['se2', 'sectionEditor', 'Moe', 'Perm'],
                ['se3', 'sectionEditor', 'Mel', 'Unassigned'], ['ebm', 'editorialBoardMember', 'Ebb', 'Board'], ['au', 'author', 'Ava', 'Author'], ['au2', 'author', 'Abe', 'Other']];
            const r1 = await app.api.createContext({tag: p1, context: ctxBase(p1, 'server', langs), users: keys.map(([k, r, gn, fn]) => U(p1, k, r, gn, fn))});
            S.P1 = {path: r1.path || p1, u: Object.fromEntries(keys.map(([k]) => [k, `${p1}${k}`]))};
            const p2 = `${t}b`;
            const r2 = await app.api.createContext({tag: p2, context: ctxBase(p2, 'author-edit-off'), roles: {author: {permitMetadataEdit: false}},
                users: [U(p2, 'mgr', 'manager', 'Mira', 'Manager'), U(p2, 'au', 'author', 'Ava', 'Author')]});
            S.P2 = {path: r2.path || p2, u: {mgr: `${p2}mgr`, au: `${p2}au`}};
            const p3 = `${t}c`;
            const r3 = await app.api.createContext({tag: p3, context: ctxBase(p3, 'admin-board'),
                users: [U(p3, 'mgr', 'manager', 'Mira', 'Manager'), U(p3, 'au', 'author', 'Ava', 'Author'), {username: 'admin', roles: ['editorialBoardMember']}]});
            S.P3 = {path: r3.path || p3, u: {mgr: `${p3}mgr`, au: `${p3}au`}};
            save();
            const P1 = S.P1;
            const M = (k, can) => ({username: P1.u[k], role: 'sectionEditor', canChangeMetadata: can});
            const two = [g('PDF', PDFNAME), g('HTML', HTMLNAME)];
            S.s.m0 = await sub(P1, 'm0', {participants: [M('se1', false), M('se2', true)], galleys: two});
            S.s.m2 = await sub(P1, 'm2', {participants: [M('se2', true)], galleys: [g('Seed', PDFNAME), g('HTML', HTMLNAME)]});
            S.s.mp = await sub(P1, 'mp', {participants: [M('se1', false), M('se2', true)], galleys: [g('Seed', PDFNAME), g('HTML', HTMLNAME)], published: true});
            S.s.m1 = await sub(P1, 'm1', {galleys: [g('Seed', PDFNAME), g('HTML', HTMLNAME)]});
            S.s.ms = await sub(P1, 'ms', {participants: [M('se1', false)], galleys: [g('Seed', PDFNAME), g('HTML', HTMLNAME)]});
            S.s.wd = await sub(P1, 'wd', {submitted: false});
            S.s.va = await sub(P1, 'va', {galleys: [g('PDF', PDFNAME, 'en'), g('HTML', HTMLNAME, 'fr_CA'), {label: 'Remote', locale: 'en', urlRemote: 'https://example.org/u46k3/va.pdf'}], published: true});
            S.s.vb = await sub(P1, 'vb', {galleys: [g('PDF', PDFNAME)], published: true});
            S.s.vc = await sub(P1, 'vc', {galleys: [g('PDF', PDFNAME)], published: true});
            S.s.n1 = await sub(S.P2, 'n1', {galleys: two});
            S.s.n2 = await sub(S.P2, 'n2', {submitted: false});
            S.s.d1 = await sub(S.P3, 'd1', {galleys: [g('PDF', PDFNAME)]});
            S.s.d2 = await sub(S.P3, 'd2', {galleys: [g('PDF', PDFNAME)], published: true});
        }
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const s = S.s;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const posts = [];
    page.on('request', (r) => { if (r.method() === 'POST') posts.push({at: Date.now(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 220)}); });
    const postsSince = (t0) => posts.filter((p) => p.at >= t0).map((p) => p.url);
    const resps = [];
    page.on('response', (r) => { if (r.request().method() !== 'GET' || r.status() >= 400) resps.push({at: Date.now(), m: r.request().method(), s: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 200)}); });
    const respsSince = (t0) => resps.filter((p) => p.at >= t0).map((p) => `${p.m} ${p.s} ${p.url}`);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300)});
        log('[browser dialog]', d.type(), flat(d.message(), 200));
        d.accept().catch(() => {});
    });
    const dialogsSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message}`);
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, .pkp_notification, .ui-pnotify, [class*="toast"], [class*="Toast"]').forEach((e) => {
                const t = (e.innerText || '').trim();
                if (t && !seen.has(e)) { seen.add(e); window.__notices.push({t: t.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (t0) => page.evaluate((x) => (window.__notices || []).filter((n) => n.at >= x).map((n) => n.t), t0).catch(() => []);

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
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); };
    const vis = '[role="dialog"]:visible';
    const wf = () => page.locator(vis).first();
    const top = () => page.locator(vis).last();
    const gm = () => page.locator('[data-cy="galley-manager"]').first();
    const galleyForm = () => page.locator('form#articleGalleyForm:visible, form#preprintGalleyForm:visible, form[id$="GalleyForm"]:visible').last();
    const wizard = () => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    const wfUrl = (ctx, sid, key, author) => app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);

    async function pageInfo() {
        return page.evaluate(() => {
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const v = (e) => e && e.getClientRects().length > 0;
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
            const heading = [...dlg.querySelectorAll('h1,h2')].filter(v).map((h) => f(h.textContent)).filter(Boolean).slice(0, 4);
            const nav = [...dlg.querySelectorAll('nav a, nav button, [role=treeitem] > a, [role=treeitem] > button, [role=treeitem] > div')].filter(v).map((a) => f(a.innerText)).filter(Boolean);
            const navUniq = [...new Set(nav)].slice(0, 60);
            const root = document.querySelector('[data-cy="galley-manager"]');
            const bodyText = f(dlg.innerText).slice(0, 1500);
            if (!root || !v(root)) return {present: false, heading, nav: navUniq, text: bodyText, url: location.href.replace(/^.*\/index\.php/, '')};
            const rows = [...root.querySelectorAll('tbody tr')].map((tr) => {
                const cells = [...tr.querySelectorAll('td,th')].map((c) => f(c.innerText));
                const a = tr.querySelector('a[href]');
                return {cells, link: a ? {text: f(a.innerText), href: a.getAttribute('href'), target: a.getAttribute('target')} : null,
                    buttons: [...tr.querySelectorAll('button')].filter(v).map((b) => f(b.getAttribute('aria-label') || b.innerText) || '(unnamed)')};
            });
            const buttons = [...root.querySelectorAll('button')].filter(v).map((b) => f(b.innerText || b.getAttribute('aria-label'))).filter(Boolean);
            const around = [...dlg.querySelectorAll('button, a')].filter(v).map((b) => f(b.innerText)).filter((x) => /galley|Order|Version/i.test(x));
            return {present: true, heading, nav: navUniq, rows, buttons, around, text: f(root.innerText).slice(0, 1200), url: location.href.replace(/^.*\/index\.php/, '')};
        }).catch((e) => ({error: String(e.message)}));
    }
    async function openGalleys(ctx, sid, pid, name, {author} = {}) {
        await page.goto(wfUrl(ctx, sid, `publication_${pid}_galleys`, author));
        await idle(page);
        await Promise.race([gm().waitFor({state: 'visible', timeout: 20000}), page.getByText(/not have access|Error|not allowed/i).first().waitFor({timeout: 20000})]).catch(() => {});
        await idle(page); await sleep(400);
        const info = await pageInfo();
        if (name) await snap(name, {galleys: info});
        return info;
    }
    const labels = (info) => (info && info.rows ? info.rows.map((r) => r.cells[0]) : null);
    // a cell's text starts with whitespace (the icon), so a caller's ^-anchored regex is widened to allow it
    const rowOf = (label) => gm().locator('tbody tr').filter({has: page.locator('td').first().filter({hasText: label instanceof RegExp ? new RegExp(`^\\s*${label.source.replace(/^\^/, '')}`) : new RegExp(`^\\s*${esc(label)}\\s*$`)})}).first();
    async function rowMenu(label, press) {
        const row = rowOf(label);
        await row.waitFor({timeout: 20000});
        const btn = row.getByRole('button', {name: /More Actions/}).first();
        if (!(await btn.count())) return {items: [], noButton: true};
        await btn.click(); await sleep(300);
        const items = await page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
        if (press) {
            const it = page.getByRole('menuitem', {name: press, exact: true}).first();
            if (!(await it.count())) { await btn.click().catch(() => {}); return {items, noItem: true}; }
            await it.click();
            await idle(page);
        } else { await btn.click().catch(() => {}); await sleep(200); }
        return {items};
    }
    async function waitForm() {
        await galleyForm().locator('input[name="label"]').waitFor({state: 'attached', timeout: T});
        await idle(page); await sleep(400);
    }
    async function winInfo() {
        return top().evaluate((d) => {
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const lab = d.getAttribute('aria-labelledby');
            const title = d.getAttribute('aria-label') || (lab && document.getElementById(lab)?.innerText.trim()) || null;
            const tabs = [...d.querySelectorAll('[role=tab]')].filter(v).map((t) => `${f(t.innerText)}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`);
            const form = [...d.querySelectorAll('form')].filter(v).pop();
            const fields = form ? [...form.querySelectorAll('input:not([type=hidden]), select, textarea')].map((e) => ({name: e.name, type: e.type, visible: v(e), disabled: e.disabled,
                value: e.type === 'checkbox' ? e.checked : e.value, options: e.tagName === 'SELECT' ? [...e.options].filter((o) => o.selected).map((o) => f(o.text)) : undefined})) : [];
            const errors = [...d.querySelectorAll('label.error, .error, .pkp_form_error, [class*="formError"], .pkp_notification')].filter(v).map((e) => f(e.innerText)).filter(Boolean);
            const buttons = [...d.querySelectorAll('button, a.pkp_button, a[role=button], input[type=submit], a')].filter(v).map((b) => `${f(b.innerText || b.value || b.getAttribute('aria-label'))}${b.disabled ? '[disabled]' : ''}`).filter((x) => x && x !== '[disabled]');
            return {title, tabs, fields, errors, buttons: [...new Set(buttons)].slice(0, 30), formId: form ? form.id : null, text: f(form ? form.innerText : d.innerText).slice(0, 1500)};
        }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    }
    const fieldsLine = (w) => (w.fields || []).filter((x) => x.visible || x.name === 'urlRemote').map((x) => `${x.name}=${JSON.stringify(x.options ? x.options.join('|') : x.value)}${x.disabled ? '(dis)' : ''}`).join(' ');
    async function winSnap(name, extra = {}) {
        const w = await winInfo();
        await snap(name, {win: w, ...extra});
        log(`[${name}]`, JSON.stringify({title: w.title, tabs: w.tabs, errors: w.errors, fields: fieldsLine(w), buttons: w.buttons}).slice(0, 1200));
        return w;
    }
    async function formSave() {
        const t0 = Date.now();
        const form = galleyForm();
        await form.getByRole('button', {name: 'Save', exact: true}).last().click({timeout: 10000}).catch((e) => { log('save click failed', flat(e.message, 120)); });
        await sleep(1500); await idle(page);
        const stillOpen = await form.isVisible().catch(() => false);
        return {stillOpen, posts: postsSince(t0), resps: respsSince(t0), notices: await noticesSince(t0), dialogs: dialogsSince(t0)};
    }
    async function formCancel() {
        const form = galleyForm();
        const c = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
        if (await c.count()) await c.click().catch(() => {});
        else await top().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(900); await idle(page);
    }
    async function wizState() {
        const w = wizard();
        if (!(await w.count()) || !(await w.isVisible().catch(() => false))) return {open: false};
        return w.evaluate((d) => {
            const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const lab = d.getAttribute('aria-labelledby');
            return {open: true, title: d.getAttribute('aria-label') || (lab && document.getElementById(lab)?.innerText.trim()) || null,
                tabs: [...d.querySelectorAll('[role=tab]')].map((t) => `${f(t.innerText)}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`),
                genre: [...d.querySelectorAll('select[id^="genreId"]')].map((x) => ({visible: v(x), options: [...x.options].map((o) => `${o.text.trim()}${o.selected ? '*' : ''}`)})),
                text: f(d.innerText).slice(0, 800)};
        }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    }
    const contBtn = () => wizard().getByRole('button', {name: 'Continue', exact: true});
    async function waitContinueEnabled(timeout = 30000) {
        const until = Date.now() + timeout;
        while (Date.now() < until) { if (await contBtn().isEnabled().catch(() => false)) return true; await sleep(200); }
        return false;
    }
    async function toStep(n) {
        await contBtn().click();
        await wizard().getByRole('tab', {name: new RegExp(`^${n}\\.`)}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        if (n === 3) await wizard().getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
    }
    async function wizUpload(file, {genre = MAIN} = {}) {
        const t0 = Date.now();
        await wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}); await idle(page);
        const g = wizard().locator('select[id^="genreId"]');
        if (genre && await g.count() && await g.isVisible().catch(() => false)) await g.selectOption({label: genre});
        await wizard().locator('input[type="file"]').setInputFiles(file);
        await waitContinueEnabled();
        await toStep(2); await toStep(3);
        await wizard().getByRole('button', {name: 'Complete', exact: true}).click();
        await wizard().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page); await sleep(700); await idle(page);
        return {resps: respsSince(t0).filter((x) => !/ GET /.test(x)).slice(0, 12), notices: await noticesSince(t0)};
    }
    async function wizClose() {
        await wizard().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(1000);
        await wizard().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page); await sleep(700);
    }
    // What a file link serves: the suggested file name (the same GET the link sends).
    async function served(href) {
        if (!href) return null;
        const u = href.startsWith('http') ? href : app.url(href.startsWith('/') ? href : `/${href}`);
        const r = await page.request.get(u, {maxRedirects: 0}).catch((e) => ({err: String(e.message).slice(0, 200)}));
        if (r.err) return r;
        const h = r.headers();
        let size = Number(h['content-length'] || 0) || null;
        if (!size && r.status() === 200) size = (await r.body().catch(() => Buffer.alloc(0))).length;
        return {status: r.status(), disposition: h['content-disposition'] || null, type: h['content-type'] || null, location: h.location || null, size};
    }
    const linkOf = (info, re) => { const r = (info.rows || []).find((x) => re.test(x.cells[0])); return r && r.link ? r.link.href : null; };
    async function fillField(name, value) {
        const el = galleyForm().locator(`[name="${name}"]`);
        await el.fill(value);
        await el.blur().catch(() => {});
    }
    const readerUrl = (ctx, sid) => app.url(`/index.php/${ctx}/${isOPS ? 'preprint' : 'article'}/view/${sid}`);
    // The reader: the landing page's galley links; a galley link followed to its viewer, whose "Download" link is served.
    async function reader(ctx, sid, name, follow = /^PDF/) {
        await page.goto(readerUrl(ctx, sid)); await idle(page);
        const links = await page.locator('a.obj_galley_link').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim().replace(/\s+/g, ' '), href: a.getAttribute('href')}))).catch(() => []);
        await snap(name, {galleyLinks: links});
        const out = {links};
        const l = links.find((x) => follow.test(x.text));
        if (l) {
            await page.goto(l.href.startsWith('http') ? l.href : app.url(l.href)).catch(() => {});
            await idle(page); await sleep(400);
            const dl = await page.locator('a.download, a[href*="/download/"]').first().getAttribute('href').catch(() => null);
            out.viewer = page.url().replace(/^.*\/index\.php/, '');
            out.downloadHref = dl;
            out.download = dl ? await served(dl) : null;
            await snap(`${name}-viewer`, {reader: out});
        }
        return out;
    }

    // ---- composite actions
    async function addGalley(label, file, name) {
        const out = {};
        const b = page.getByRole('button', {name: 'Add galley', exact: true}).first();
        if (!(await b.isVisible().catch(() => false))) return {offered: false};
        await b.click();
        await waitForm();
        if (name) out.window = await winSnap(`${name}-create-window`);
        await fillField('label', label);
        const sv = await formSave();
        out.save = sv;
        const wz = await wizState();
        out.wizard = wz.open ? {title: wz.title, tabs: wz.tabs} : null;
        if (sv.stillOpen) {
            out.refused = await winSnap(`${name || 'add'}-create-after-save`);
            await formCancel();
        }
        if (wz.open) {
            if (name) await snap(`${name}-wizard`, {wizard: wz});
            if (file) out.upload = await wizUpload(file); else await wizClose();
        }
        return out;
    }
    async function orderMoveFirstDown(name) {
        const out = {};
        const order = page.getByRole('button', {name: 'Order', exact: true}).first();
        if (!(await order.isVisible().catch(() => false))) return {offered: false};
        out.before = labels(await pageInfo());
        await order.click();
        await page.getByRole('button', {name: 'Save Order', exact: true}).first().waitFor({timeout: 10000}).catch(() => {});
        await sleep(300);
        const btns = gm().locator('tbody tr').first().locator('button');
        const n = await btns.count();
        if (n) await btns.nth(n - 1).click();
        await sleep(400);
        out.moved = labels(await pageInfo());
        const t0 = Date.now();
        await page.getByRole('button', {name: 'Save Order', exact: true}).first().click().catch(() => {});
        await sleep(1500); await idle(page);
        out.afterSave = labels(await pageInfo());
        out.resps = respsSince(t0);
        out.notices = await noticesSince(t0);
        if (name) await snap(`${name}-after-save-order`);
        return out;
    }
    async function editLabel(label, newLabel, name, {urlPath} = {}) {
        const out = {};
        const m = await rowMenu(label);
        out.items = m.items;
        if (!m.items.includes('Edit')) return {...out, offered: false};
        await rowMenu(label, 'Edit'); await waitForm();
        out.win = await winSnap(`${name}-edit-window`);
        const box = galleyForm().locator('input[name="label"]');
        if (!(await box.isEditable().catch(() => false))) { out.editable = false; await formCancel(); return out; }
        out.editable = true;
        await fillField('label', newLabel);
        if (urlPath != null) await fillField('urlPath', urlPath);
        out.save = await formSave();
        if (out.save.stillOpen) { out.refused = await winSnap(`${name}-edit-after-save`); await formCancel(); }
        return out;
    }
    async function changeFile(label, name) {
        const out = {};
        const m = await rowMenu(label, 'Change File');
        if (m.noItem) return {offered: false, items: m.items};
        const t0 = Date.now();
        await Promise.race([wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}),
            page.getByText('does not have access', {exact: false}).first().waitFor({timeout: T})]).catch(() => {});
        await idle(page); await sleep(500);
        const wz = await wizState();
        out.wizard = {title: wz.title, tabs: wz.tabs};
        const dlgText = await top().innerText().catch(() => '');
        out.windowTitle = flat(dlgText, 400);
        if (name) await snap(`${name}-changefile-wizard`, {wizard: wz});
        if (/does not have access/.test(dlgText) || !wz.open) {
            out.refused = flat(dlgText.split('\n').slice(-3).join(' '), 300);
            out.resps = respsSince(t0);
            await top().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(900); await idle(page);
            return out;
        }
        out.upload = await wizUpload(REPL, {genre: null});
        return out;
    }
    async function deleteRow(label, name) {
        const out = {};
        const m = await rowMenu(label, 'Delete');
        if (m.noItem) return {offered: false, items: m.items};
        const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
        await dlg.waitFor({timeout: 15000}).catch(() => {});
        const t0 = Date.now();
        await dlg.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
        await sleep(1500); await idle(page);
        out.resps = respsSince(t0); out.notices = await noticesSince(t0);
        if (name) {
            out.screen = await pageInfo();
            out.dialogs = await page.locator(vis).evaluateAll((els) => els.map((d) => (d.innerText || '').replace(/\s+/g, ' ').trim().slice(-300))).catch(() => []);
            await snap(`${name}-right-after-ok`, {galleys: out.screen, dialogs: out.dialogs});
        }
        return out;
    }
    // The whole set, one level: page, "Add galley" (+file), "Order" › "Save Order", "Edit" › "Save", "Change File",
    // "Delete"; each read after a reload. The seeded rows are "Seed" (a file) and, where seeded, "HTML".
    async function fullSet(ctx, sub, k, {author} = {}) {
        const out = {};
        const open = (n) => openGalleys(ctx, sub.id, sub.pub, n, {author});
        out.page = await open(`${k}-01-page`);
        out.menuSeed = (await rowMenu('Seed')).items;
        out.add = await addGalley('NEW', PDF, `${k}-02`);
        out.afterAdd = labels(await open(`${k}-03-after-add-reload`));
        out.order = await orderMoveFirstDown(`${k}-04`);
        out.afterOrder = labels(await open(`${k}-05-after-order-reload`));
        out.edit = await editLabel('Seed', 'Seed v2', `${k}-06`);
        out.afterEdit = labels(await open(`${k}-07-after-edit-reload`));
        const seedLabel = (out.afterEdit || []).find((x) => /^Seed v2/.test(x)) ? 'Seed v2' : 'Seed';
        out.servedBefore = await served(linkOf(await pageInfo(), new RegExp(`^${seedLabel}`)));
        out.change = await changeFile(seedLabel, `${k}-08`);
        const i9 = await open(`${k}-09-after-changefile-reload`);
        out.servedAfter = await served(linkOf(i9, new RegExp(`^${seedLabel}`)));
        const newLabel = (labels(i9) || []).find((x) => /^NEW/.test(x)) || (labels(i9) || []).find((x) => /^HTML/.test(x));
        out.deleted = newLabel;
        out.del = newLabel ? await deleteRow(newLabel) : {skipped: 'no NEW or HTML row'};
        out.afterDelete = labels(await open(`${k}-10-after-delete-reload`));
        return out;
    }
    // Offers only: the page, its buttons, the side menu and the row menus of every row.
    async function offers(ctx, sub, k, {author} = {}) {
        const info = await openGalleys(ctx, sub.id, sub.pub, `${k}-page`, {author});
        const out = {present: info.present, heading: info.heading, nav: info.nav, rows: (info.rows || []).map((r) => ({label: r.cells[0], lang: r.cells[1], link: !!r.link, buttons: r.buttons})),
            buttons: info.buttons, around: info.around, text: info.present ? undefined : info.text, url: info.url};
        if (info.present) {
            out.menus = {};
            for (const r of info.rows || []) {
                if (!r.buttons.some((b) => /More Actions/.test(b))) continue;
                out.menus[r.cells[0]] = (await rowMenu(r.cells[0])).items;
            }
        }
        return out;
    }
    async function removeManagerRole(ctx, mgr, name) {
        const out = {};
        await as(mgr, ctx);
        await page.goto(app.url(`/index.php/${ctx}/management/settings/access`)); await idle(page); await sleep(800);
        const row = page.locator('tr').filter({hasText: 'admin@mail.test'}).first();
        await row.waitFor({timeout: T}).catch(() => {});
        await row.locator('button').last().click().catch(() => {}); await sleep(500);
        await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
        await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 30000}).catch(() => {});
        await idle(page); await sleep(800);
        await snap(`${name}-admin-user-edit`);
        const mgrRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
        if (await mgrRow.count()) {
            await mgrRow.getByRole('button', {name: /Remove Role/i}).click(); await sleep(600);
            const d = page.locator('[role="dialog"]:visible').last();
            const w = page.waitForResponse((r) => r.request().method() !== 'GET' && /\/api\/v1\//.test(r.url()), {timeout: T}).catch(() => null);
            await d.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
            const r = await w; await idle(page); await sleep(800);
            out.removed = r ? r.status() : 'no response';
        }
        out.roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
        await snap(`${name}-admin-user-after`, {roleRows: out.roleRows});
        return out;
    }
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
    // One galley's Edit window, read and cancelled.
    async function readEdit(label, name) {
        const m = await rowMenu(label);
        const item = m.items.includes('Edit') ? 'Edit' : (m.items.includes('View') ? 'View' : null);
        if (!item) return {items: m.items};
        await rowMenu(label, item); await waitForm();
        const w = await winSnap(name);
        await formCancel();
        if (await galleyForm().isVisible().catch(() => false)) { await top().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await sleep(800); }
        const get = (n) => { const x = (w.fields || []).find((f) => f.name === n); return x ? (x.options ? x.options.join('|') : x.value) : undefined; };
        return {item, title: w.title, tabs: w.tabs, label: get('label'), locale: get('locale'), urlPath: get('urlPath'), remote: get('remotelyHostedContent'), urlRemote: get('urlRemote')};
    }

    try {
        // ============================================================ OMP: a press has no "Galleys" page
        if (isOMP) {
            if (on('omp')) await sect('omp', async () => {
                const out = {};
                const X = S.X;
                await as(X.u.mgr, X.path);
                for (const [k, sub] of [['om', s.om], ['omg', s.omg]]) {
                    if (!sub || sub.error) { out[k] = sub; continue; }
                    await page.goto(wfUrl(X.path, sub.id, `publication_${sub.pub}_titleAbstract`)); await idle(page); await sleep(800);
                    out[`${k}-mgr-nav`] = (await pageInfo()).nav;
                    await snap(`omp-${k}-mgr-titleAbstract`);
                }
                out.galleysKey = await openGalleys(X.path, s.om.id, s.om.pub, 'omp-om-mgr-galleys-key');
                await as(X.u.au, X.path);
                await page.goto(wfUrl(X.path, s.om.id, `publication_${s.om.pub}_titleAbstract`, true)); await idle(page); await sleep(800);
                out.authorNav = (await pageInfo()).nav;
                await snap('omp-om-author-titleAbstract');
                fact('omp', out);
            });
            return;
        }

        // ============================================================ roles: every level's offers (+ an "Edit" › "Save")
        if (on('roles')) await sect('roles', async () => {
            const out = {};
            if (isOJS) {
                const J1 = S.J1;
                const who = ['mgr', 'ed', 'pe', 'se', 'ge', 'le', 'de', 'ix', 'pr', 'ce', 'au', 'au2', 'admin'];
                for (const k of who) {
                    const user = k === 'admin' ? 'admin' : J1.u[k];
                    await as(user, J1.path);
                    const author = k === 'au' || k === 'au2';
                    const o = await offers(J1.path, s.a1, `roles-${k}-a1`, {author});
                    if (!o.present && !author) {
                        // the workflow without a menu key: which side menu this role gets
                        await page.goto(wfUrl(J1.path, s.a1.id)); await idle(page); await sleep(800);
                        o.workflowNav = (await pageInfo()).nav;
                        await snap(`roles-${k}-a1-workflow`);
                    }
                    const pdf = (o.rows || []).find((r) => /^PDF/.test(r.label));
                    if (pdf && o.menus && (o.menus[pdf.label] || []).includes('Edit')) {
                        o.edit = await editLabel(pdf.label, `PDF ${k}`, `roles-${k}-a1`);
                        o.afterEdit = labels(await openGalleys(J1.path, s.a1.id, s.a1.pub, null, {author}));
                    }
                    out[k] = o;
                    log(`[roles ${k}]`, JSON.stringify({present: o.present, buttons: o.buttons, menus: o.menus, edit: o.edit && {editable: o.edit.editable, stillOpen: o.edit.save && o.edit.save.stillOpen, tabs: o.edit.win && o.edit.win.tabs}, afterEdit: o.afterEdit, nav: o.workflowNav}).slice(0, 1200));
                }
                // More Information from an assistant level
                await as(J1.u.le, J1.path);
                await openGalleys(J1.path, s.a1.id, s.a1.pub);
                const pdfRow = (await pageInfo()).rows.find((r) => /^PDF/.test(r.cells[0]));
                if (pdfRow) {
                    await rowMenu(pdfRow.cells[0], 'More Information'); await sleep(1500); await idle(page);
                    out.leMoreInfo = {title: (await winInfo()).title};
                    await snap('roles-le-a1-moreinfo', out.leMoreInfo);
                    await top().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await sleep(800);
                }
                // the Author of J2 (the permission ticked): Settings bullet 4's journal end
                await as(S.J2.u.au, S.J2.path);
                out.j2au = await offers(S.J2.path, s.b1, 'roles-au-j2-permit-on', {author: true});
            } else {
                const P1 = S.P1;
                for (const [sub, sk] of [[s.m0, 'm0'], [s.mp, 'mp']]) {
                    for (const k of ['mgr', 'se1', 'se2', 'se3', 'ebm', 'au', 'au2', 'admin']) {
                        const user = k === 'admin' ? 'admin' : P1.u[k];
                        await as(user, P1.path);
                        const author = k === 'au' || k === 'au2';
                        const o = await offers(P1.path, sub, `roles-${k}-${sk}`, {author});
                        if (!o.present && !author) {
                            await page.goto(wfUrl(P1.path, sub.id)); await idle(page); await sleep(800);
                            o.workflowNav = (await pageInfo()).nav;
                            await snap(`roles-${k}-${sk}-workflow`);
                        }
                        const target = sk === 'm0' ? /^PDF/ : /^HTML/;
                        const curRow = (o.rows || []).find((r) => target.test(r.label));
                        if ((k === 'mgr' || k === 'admin') && curRow && o.menus && (o.menus[curRow.label] || []).includes('Edit')) {
                            const cur = curRow.label;
                            o.edit = await editLabel(cur, `${cur.split(' ')[0]} ${k}`, `roles-${k}-${sk}`);
                            o.afterEdit = labels(await openGalleys(P1.path, sub.id, sub.pub, null));
                        }
                        out[`${k}-${sk}`] = o;
                        log(`[roles ${k} ${sk}]`, JSON.stringify({present: o.present, buttons: o.buttons, menus: o.menus, edit: o.edit && {editable: o.edit.editable, stillOpen: o.edit.save && o.edit.save.stillOpen}, afterEdit: o.afterEdit, nav: o.workflowNav, url: o.url}).slice(0, 1200));
                    }
                }
            }
            fact('roles', out);
        });

        // ============================================================ se / le (OJS): the full set per level (q2)
        if (on('se') && isOJS) await sect('se', async () => {
            await as(S.J1.u.se, S.J1.path);
            fact('se', await fullSet(S.J1.path, s.a2, 'se-a2'));
        });
        if (on('le') && isOJS) await sect('le', async () => {
            await as(S.J1.u.le, S.J1.path);
            fact('le', await fullSet(S.J1.path, s.a3, 'le-a3'));
        });

        // ============================================================ mgrfull: the whole set at manager level (OJS: the assigned Production Editor;
        // OPS: the Preprint Server Manager on a posted preprint)
        if (on('mgrfull')) await sect('mgrfull', async () => {
            const C = isOJS ? S.J1 : S.P1;
            const key = `mf${Date.now().toString(36).slice(-4)}`;
            const r = await app.api.createSubmission({tag: `${S.t}${key}`, context: C.path, submitter: C.u.au, title: `K3 ${key} Wombatery ${S.t}`,
                ...(isOJS ? {decisions: ['skipExternalReview', 'sendToProduction'], participants: [{username: C.u.pe, role: 'productionEditor'}]} : {published: true}),
                galleys: [{label: 'Seed', file: PDFNAME}, {label: 'HTML', file: HTMLNAME}]});
            const sub = {id: r.submissionId, pub: r.publicationId};
            await as(isOJS ? C.u.pe : C.u.mgr, C.path);
            fact(`mgrfull-${key}`, await fullSet(C.path, sub, `mf-${key}`));
        });

        // ============================================================ mod (OPS q3): the Moderator without "Permissions", unposted
        if (on('mod') && isOPS) await sect('mod', async () => {
            const P1 = S.P1;
            if (!s.ms2) {
                const r = await app.api.createSubmission({tag: `${S.t}ms2`, context: P1.path, submitter: P1.u.au, title: `K3 ms2 Wombatery ${S.t}`,
                    participants: [{username: P1.u.se1, role: 'sectionEditor', canChangeMetadata: false}], galleys: [{label: 'Seed', file: PDFNAME}, {label: 'HTML', file: HTMLNAME}]});
                s.ms2 = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys}; save();
            }
            await as(P1.u.se1, P1.path);
            const out = await fullSet(P1.path, s.ms2, 'mod-ms2');
            fact('mod', out);
            // the Edit window's state (heading, greyed fields, Save)
            await openGalleys(P1.path, s.ms2.id, s.ms2.pub);
            out.editWindow = await readEdit(/^Seed/, 'mod-ms2-11-edit-window');
            // the new galley's refusal a second time, "HTML2", with the message's place
            out.add2 = await addGalley('HTML2', null, 'mod-ms2-12');
            out.afterAdd2 = labels(await openGalleys(P1.path, s.ms2.id, s.ms2.pub, 'mod-ms2-13-after-add2-reload'));
            fact('mod', out);
        });
        // ============================================================ modposted (OPS): the same Moderator after posting
        if (on('modposted') && isOPS) await sect('modposted', async () => {
            const P1 = S.P1;
            await as(P1.u.se1, P1.path);
            fact('modposted', await fullSet(P1.path, s.mp, 'modp-mp'));
        });
        // ============================================================ mod2 (OPS): a Moderator with "Permissions", unposted
        if (on('mod2') && isOPS) await sect('mod2', async () => {
            await as(S.P1.u.se2, S.P1.path);
            fact('mod2', await fullSet(S.P1.path, s.m2, 'mod2-m2'));
        });

        // ============================================================ author (OPS): before posting (full set), after posting (q4), permission off (q19)
        if (on('author') && isOPS) await sect('author', async () => {
            const out = {};
            const P1 = S.P1;
            if (!s.m1b) {
                const r = await app.api.createSubmission({tag: `${S.t}m1b`, context: P1.path, submitter: P1.u.au, title: `K3 m1b Wombatery ${S.t}`,
                    galleys: [{label: 'Seed', file: PDFNAME}, {label: 'HTML', file: HTMLNAME}]});
                s.m1b = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys}; save();
            }
            await as(P1.u.au, P1.path);
            out.before = await fullSet(P1.path, s.m1b, 'au-m1b', {author: true});
            fact('author', out);
        });
        // ============================================================ authview (OPS): after posting (q4), permission off (q19)
        if (on('authview') && isOPS) await sect('authview', async () => {
            const out = {};
            const P1 = S.P1;
            await as(P1.u.au, P1.path);
            out.posted = await offers(P1.path, s.mp, 'au-mp-posted', {author: true});
            const lab = ((out.posted.rows || [])[0] || {}).label;
            if (lab) {
                out.posted.view = await readEdit(lab, 'au-mp-view-window');
                // the window's "Identifiers" tab as the Author sees it
                await rowMenu(lab, 'View'); await waitForm();
                const idTab = top().getByRole('tab', {name: 'Identifiers'});
                out.posted.idTab = await idTab.count();
                if (out.posted.idTab) { await idTab.click(); await sleep(1500); await idle(page); out.posted.idWin = await winSnap('au-mp-view-identifiers'); }
                await top().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await sleep(800);
            }
            await as(S.P2.u.au, S.P2.path);
            out.noPerm = await offers(S.P2.path, s.n1, 'au-n1-permit-off', {author: true});
            const lab2 = ((out.noPerm.rows || [])[0] || {}).label;
            if (lab2) out.noPerm.view = await readEdit(lab2, 'au-n1-view-window');
            fact('authview', out);
        });

        // ============================================================ authown (OPS): "Change File" on a galley whose file the Author uploaded on screen
        if (on('authown') && isOPS) await sect('authown', async () => {
            const out = {};
            const P1 = S.P1; const au = {author: true};
            await as(P1.u.au, P1.path);
            await openGalleys(P1.path, s.m1b.id, s.m1b.pub, null, au);
            out.ownAdd = await addGalley('OWN', PDF, 'au-own-01');
            const iOwn = await openGalleys(P1.path, s.m1b.id, s.m1b.pub, 'au-own-02-after-add', au);
            out.rows = labels(iOwn);
            out.ownServedBefore = await served(linkOf(iOwn, /^OWN/));
            out.ownChange = await changeFile('OWN', 'au-own-03');
            const iOwn2 = await openGalleys(P1.path, s.m1b.id, s.m1b.pub, 'au-own-04-after-change', au);
            out.ownServedAfter = await served(linkOf(iOwn2, /^OWN/));
            // the wizard-made galley on wd (uploaded by the Author in "Upload Files"), after submitting? wd is a draft: read its Change File too
            fact('authown', out);
        });

        // ============================================================ authmgr (OPS): the Author's "Change File" on a galley the manager built on screen
        if (on('authmgr') && isOPS) await sect('authmgr', async () => {
            const out = {};
            const P1 = S.P1; const au = {author: true};
            await as(P1.u.mgr, P1.path);
            await openGalleys(P1.path, s.m1b.id, s.m1b.pub);
            out.mgrAdd = await addGalley('MGR', PDF, 'au-mgr-01');
            await as(P1.u.au, P1.path);
            const i1 = await openGalleys(P1.path, s.m1b.id, s.m1b.pub, 'au-mgr-02-author-page', au);
            out.rows = labels(i1);
            out.menu = (await rowMenu('MGR')).items;
            out.before = await served(linkOf(i1, /^MGR/));
            out.change = await changeFile('MGR', 'au-mgr-03');
            const i2 = await openGalleys(P1.path, s.m1b.id, s.m1b.pub, 'au-mgr-04-after', au);
            out.after = await served(linkOf(i2, /^MGR/));
            fact('authmgr', out);
        });

        // ============================================================ wizard (OPS): the Author's "Upload Files" step (Purpose; Settings bullet 4)
        if (on('wizard') && isOPS) await sect('wizard', async () => {
            const out = {};
            for (const [ctx, sub, k] of [[S.P1, s.wd, 'wd'], [S.P2, s.n2, 'n2']]) {
                await as(ctx.u.au, ctx.path);
                await page.goto(app.url(`/index.php/${ctx.path}/submission?id=${sub.id}`)); await idle(page);
                await page.locator('#galleysGridUrl, [id^="component-grid-preprintgalleys"]').first().waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(800);
                const o = {};
                o.step = (await snap(`wiz-${k}-upload-files`)).text;
                const add = page.getByRole('link', {name: 'Add File', exact: true}).first();
                o.addFile = await add.isVisible().catch(() => false);
                if (o.addFile) {
                    await add.click(); await waitForm();
                    o.window = await winSnap(`wiz-${k}-add-file-window`);
                    await fillField('label', 'PDF');
                    o.save = await formSave();
                    const wz = await wizState();
                    o.wizard = wz.open ? wz.title : null;
                    if (wz.open) o.upload = await wizUpload(PDF);
                    await sleep(800); await idle(page);
                    o.rows = await page.locator('[id^="component-grid-preprintgalleys"] tr.gridRow, #galleysGridUrl tr.gridRow').allInnerTexts().catch(() => []);
                    await snap(`wiz-${k}-after-add`, {rows: o.rows});
                }
                out[k] = o;
            }
            fact('wizard', out);
        });

        // ============================================================ wiz2 (OPS): a second galley in the wizard's "Upload Files" (the page script error seen
        // on a draft that already had a galley): n2 (one galley at page load), then a fresh draft: first galley, then a second without a reload
        if (on('wiz2') && isOPS) await sect('wiz2', async () => {
            const out = {};
            const perr = [];
            page.on('pageerror', (e) => perr.push({at: Date.now(), text: String(e.message).slice(0, 200)}));
            const errsSince = (t0) => perr.filter((e) => e.at >= t0).map((e) => e.text);
            const key = `fd${Date.now().toString(36).slice(-4)}`;
            const r = await app.api.createSubmission({tag: `${S.t}${key}`, context: S.P1.path, submitter: S.P1.u.au, title: `K3 ${key} Wombatery ${S.t}`, submitted: false});
            const fd = {id: r.submissionId};
            const gridRows = () => page.locator('[id^="component-grid-preprintgalleys"] tr.gridRow, #galleysGridUrl tr.gridRow').allInnerTexts().catch(() => []);
            const addOne = async (label, name) => {
                const o = {};
                const t0 = Date.now();
                await page.getByRole('link', {name: 'Add File', exact: true}).first().click();
                await waitForm();
                await fillField('label', label);
                await galleyForm().getByRole('button', {name: 'Save', exact: true}).last().click();
                await wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: 20000}).catch(() => {});
                const hasInput = await wizard().getByText('Drag and drop a file here').first().waitFor({state: 'visible', timeout: 10000}).then(() => true).catch(() => false);
                await sleep(800);
                o.fileInput = hasInput;
                o.wizard = (await wizState()).title || null;
                o.pageErrors = errsSince(t0);
                await snap(`${name}-after-save`, {wiz2: o});
                if (hasInput) {
                    await wizUpload(PDF);
                    o.rowsAfter = await gridRows();
                } else {
                    await wizard().getByRole('link', {name: 'Cancel', exact: true}).or(wizard().getByRole('button', {name: 'Cancel', exact: true})).first().click({timeout: 5000}).catch(() => {});
                    await sleep(1500);
                    o.rowsAfterCancel = await gridRows();
                }
                o.pageErrorsAll = errsSince(t0);
                return o;
            };
            const list = (process.env.WIZ2 || 'n2,fresh').split(',');
            for (const [ctx, sub, k] of [[S.P2, s.n2, 'n2'], [S.P1, fd, 'fresh']].filter(([, , k]) => list.includes(k))) {
                await as(ctx.u.au, ctx.path);
                await page.goto(app.url(`/index.php/${ctx.path}/submission?id=${sub.id}`));
                await page.locator('#galleysGridUrl, [id^="component-grid-preprintgalleys"]').first().waitFor({timeout: T}).catch(() => {});
                await sleep(1500);
                const o = {rowsAtLoad: await gridRows()};
                await snap(`wiz2-${k}-01-load`, {rows: o.rowsAtLoad});
                o.first = await addOne('PDF', `wiz2-${k}-02-first`);
                if (k === 'fresh') o.second = await addOne('HTML', `wiz2-${k}-03-second`);
                out[k] = o;
                fact('wiz2', out);
            }
        });

        // ============================================================ admin: the Site Administrator without a manager role
        if (on('admin')) await sect('admin', async () => {
            const out = {};
            const C = isOJS ? S.J3 : S.P3;
            out.remove = await removeManagerRole(C.path, C.u.mgr, 'adm');
            await signOut(page).catch(() => {});
            await as('admin', C.path);
            const list = isOJS ? [[s.c1, 'c1']] : [[s.d1, 'd1'], [s.d2, 'd2']];
            for (const [sub, k] of list) {
                const o = await offers(C.path, sub, `adm-${k}`);
                if (!o.present) {
                    await page.goto(wfUrl(C.path, sub.id)); await idle(page); await sleep(800);
                    o.workflow = await pageInfo();
                    await snap(`adm-${k}-workflow`);
                }
                const r = (o.rows || []).find((x) => /^PDF/.test(x.label));
                if (r && o.menus && (o.menus[r.label] || []).includes('Edit')) {
                    o.edit = await editLabel(r.label, 'PDF admin', `adm-${k}`);
                    o.afterEdit = labels(await openGalleys(C.path, sub.id, sub.pub, null));
                    o.add = await addGalley('ADM', null, `adm-${k}-add`);
                    o.afterAdd = labels(await openGalleys(C.path, sub.id, sub.pub, `adm-${k}-after-add`));
                }
                out[k] = o;
            }
            fact('admin', out);
        });

        // ============================================================ versions: Rule 11 / A4 (q15)
        if (on('versions')) await sect('versions', async () => {
            const out = {};
            const C = isOJS ? S.J1 : S.P1;
            await as(C.u.mgr, C.path);
            // va: URL Path on PDF, Remote moved to the top and saved; new version; the copies; Change File on the copy
            {
                const va = s.va; const o = {};
                await openGalleys(C.path, va.id, va.pub, 'ver-va-01-v1-before');
                o.path = await editLabel('PDF', 'PDF', 'ver-va-02-v1', {urlPath: `k3p${S.t.slice(-6)}`});
                const i = await openGalleys(C.path, va.id, va.pub);
                // Remote to the top: press its row's up arrow until it is first
                await page.getByRole('button', {name: 'Order', exact: true}).first().click();
                await page.getByRole('button', {name: 'Save Order', exact: true}).first().waitFor({timeout: 10000}).catch(() => {});
                for (let n = 0; n < 3; n++) {
                    const ls = labels(await pageInfo());
                    if (ls[0] === 'Remote') break;
                    await rowOf('Remote').locator('button').first().click(); await sleep(400);
                }
                await page.getByRole('button', {name: 'Save Order', exact: true}).first().click(); await sleep(1500); await idle(page);
                const v1 = await openGalleys(C.path, va.id, va.pub, 'ver-va-03-v1-set');
                o.v1 = v1.rows.map((r) => ({label: r.cells[0], lang: r.cells[1], link: r.link && r.link.href}));
                o.v1Edit = {};
                for (const l of labels(v1)) o.v1Edit[l] = await readEdit(l, `ver-va-04-v1-edit-${l}`);
                await openGalleys(C.path, va.id, va.pub);
                o.create = await createNewVersion('ver-va-05-create');
                va.pub2 = o.create.newPub; save();
                if (va.pub2) {
                    const v2 = await openGalleys(C.path, va.id, va.pub2, 'ver-va-06-v2');
                    o.v2 = v2.rows.map((r) => ({label: r.cells[0], lang: r.cells[1], link: r.link && r.link.href}));
                    o.v2Heading = v2.heading; o.v2Nav = v2.nav;
                    o.v2Edit = {};
                    for (const l of labels(v2)) o.v2Edit[l] = await readEdit(l, `ver-va-07-v2-edit-${l}`);
                    const v2i = await openGalleys(C.path, va.id, va.pub2);
                    o.servedBefore = {v1: await served(linkOf(v1, /^PDF/)), v2: await served(linkOf(v2i, /^PDF/))};
                    o.readerBefore = await reader(C.path, va.id, 'ver-va-08-reader-before');
                    await openGalleys(C.path, va.id, va.pub2);
                    o.change = await changeFile('PDF', 'ver-va-09-v2');
                    const v2b = await openGalleys(C.path, va.id, va.pub2, 'ver-va-10-v2-after-change');
                    const v1b = await openGalleys(C.path, va.id, va.pub, 'ver-va-11-v1-after-change');
                    o.servedAfter = {v1: await served(linkOf(v1b, /^PDF/)), v2: await served(linkOf(v2b, /^PDF/))};
                    o.readerAfter = await reader(C.path, va.id, 'ver-va-12-reader-after');
                    // the copy's own changes: HTML relabelled, Remote deleted, on v2 only
                    await openGalleys(C.path, va.id, va.pub2);
                    o.v2Relabel = await editLabel('HTML', 'HTML v2', 'ver-va-13-v2');
                    await openGalleys(C.path, va.id, va.pub2);
                    o.v2DeleteRemote = await deleteRow('Remote');
                    o.v2End = labels(await openGalleys(C.path, va.id, va.pub2, 'ver-va-14-v2-end'));
                    o.v1End = labels(await openGalleys(C.path, va.id, va.pub, 'ver-va-15-v1-end'));
                }
                out.va = o;
                log('[versions va]', JSON.stringify(o).slice(0, 3500));
            }
            // vb: Change File on the ORIGINAL (the published version's galley)
            {
                const vb = s.vb; const o = {};
                await openGalleys(C.path, vb.id, vb.pub);
                o.create = await createNewVersion('ver-vb-01-create');
                vb.pub2 = o.create.newPub; save();
                if (vb.pub2) {
                    const v1 = await openGalleys(C.path, vb.id, vb.pub, 'ver-vb-02-v1');
                    const v2 = await openGalleys(C.path, vb.id, vb.pub2, 'ver-vb-03-v2');
                    o.servedBefore = {v1: await served(linkOf(v1, /^PDF/)), v2: await served(linkOf(v2, /^PDF/))};
                    await openGalleys(C.path, vb.id, vb.pub);
                    o.change = await changeFile('PDF', 'ver-vb-04-v1');
                    const v1b = await openGalleys(C.path, vb.id, vb.pub, 'ver-vb-05-v1-after');
                    const v2b = await openGalleys(C.path, vb.id, vb.pub2, 'ver-vb-06-v2-after');
                    o.servedAfter = {v1: await served(linkOf(v1b, /^PDF/)), v2: await served(linkOf(v2b, /^PDF/))};
                    o.reader = await reader(C.path, vb.id, 'ver-vb-07-reader');
                }
                out.vb = o;
                log('[versions vb]', JSON.stringify(o).slice(0, 2500));
            }
            // vc: delete the published version's galley; the copy
            {
                const vc = s.vc; const o = {};
                await openGalleys(C.path, vc.id, vc.pub);
                o.create = await createNewVersion('ver-vc-01-create');
                vc.pub2 = o.create.newPub; save();
                if (vc.pub2) {
                    const v2 = await openGalleys(C.path, vc.id, vc.pub2, 'ver-vc-02-v2-before');
                    const href = linkOf(v2, /^PDF/);
                    o.v2Before = {rows: v2.rows.map((r) => ({label: r.cells[0], link: r.link && r.link.href})), served: await served(href)};
                    await openGalleys(C.path, vc.id, vc.pub, 'ver-vc-03-v1-before');
                    o.del = await deleteRow('PDF', 'ver-vc-03b');
                    o.v1After = labels(await openGalleys(C.path, vc.id, vc.pub, 'ver-vc-04-v1-after'));
                    const v2a = await openGalleys(C.path, vc.id, vc.pub2, 'ver-vc-05-v2-after');
                    o.v2After = {rows: v2a.rows.map((r) => ({label: r.cells[0], link: r.link && r.link.href, buttons: r.buttons})), servedOldHref: await served(href), servedNow: await served(linkOf(v2a, /^PDF/))};
                    o.v2Menu = (await rowMenu('PDF')).items;
                    o.reader = await reader(C.path, vc.id, 'ver-vc-06-reader');
                }
                out.vc = o;
                log('[versions vc]', JSON.stringify(o).slice(0, 2500));
            }
            fact('versions', out);
        });

        // ============================================================ vc2: the published version's galley deleted, a second run
        if (on('vc2')) await sect('vc2', async () => {
            const C = isOJS ? S.J1 : S.P1;
            const key = `vc2${Date.now().toString(36).slice(-4)}`;
            const r = await app.api.createSubmission({tag: `${S.t}${key}`, context: C.path, submitter: C.u.au, title: `K3 ${key} Wombatery ${S.t}`,
                ...(isOJS ? {decisions: ['skipExternalReview', 'sendToProduction']} : {}), galleys: [{label: 'PDF', file: PDFNAME}], published: true});
            const vc = {id: r.submissionId, pub: r.publicationId};
            const o = {sub: vc};
            await as(C.u.mgr, C.path);
            await openGalleys(C.path, vc.id, vc.pub);
            o.create = await createNewVersion(`ver-${key}-01-create`);
            vc.pub2 = o.create.newPub;
            const v2 = await openGalleys(C.path, vc.id, vc.pub2, `ver-${key}-02-v2-before`);
            const href = linkOf(v2, /^PDF/);
            o.readerBefore = await reader(C.path, vc.id, `ver-${key}-03-reader-before`);
            await openGalleys(C.path, vc.id, vc.pub, `ver-${key}-04-v1-before`);
            o.del = await deleteRow('PDF', `ver-${key}-05`);
            o.v1After = labels(await openGalleys(C.path, vc.id, vc.pub, `ver-${key}-06-v1-after-reload`));
            const v2a = await openGalleys(C.path, vc.id, vc.pub2, `ver-${key}-07-v2-after`);
            o.v2After = {rows: v2a.rows.map((x) => ({label: x.cells[0], link: x.link && x.link.href})), servedOldHref: await served(href)};
            o.reader = await reader(C.path, vc.id, `ver-${key}-08-reader-after`);
            fact(`vc2-${key}`, o);
        });

        // ============================================================ delpub: controls for the vc delete. (1) a published galley deleted with no
        // second version; (2) a new version's copy deleted: the published version's row, file and reader download.
        if (on('delpub')) await sect('delpub', async () => {
            const C = isOJS ? S.J1 : S.P1;
            const key = `dp${Date.now().toString(36).slice(-4)}`;
            const mk = async (k) => {
                const r = await app.api.createSubmission({tag: `${S.t}${key}${k}`, context: C.path, submitter: C.u.au, title: `K3 ${key}${k} Wombatery ${S.t}`,
                    ...(isOJS ? {decisions: ['skipExternalReview', 'sendToProduction']} : {}), galleys: [{label: 'PDF', file: PDFNAME}], published: true});
                return {id: r.submissionId, pub: r.publicationId};
            };
            const o = {};
            await as(C.u.mgr, C.path);
            // (1)
            const x = await mk('x');
            o.one = {sub: x};
            await openGalleys(C.path, x.id, x.pub, `dp-${key}-01-published-before`);
            o.one.del = await deleteRow('PDF', `dp-${key}-02-published`);
            o.one.after = labels(await openGalleys(C.path, x.id, x.pub, `dp-${key}-03-published-after-reload`));
            o.one.reader = (await reader(C.path, x.id, `dp-${key}-04-reader`)).links;
            // (2)
            const y = await mk('y');
            o.two = {sub: y};
            await openGalleys(C.path, y.id, y.pub);
            const cr = await createNewVersion(`dp-${key}-05-create`);
            y.pub2 = cr.newPub;
            const v1 = await openGalleys(C.path, y.id, y.pub);
            const href = linkOf(v1, /^PDF/);
            await openGalleys(C.path, y.id, y.pub2, `dp-${key}-06-v2-before`);
            o.two.del = await deleteRow('PDF', `dp-${key}-07-v2-copy`);
            o.two.v2After = labels(await openGalleys(C.path, y.id, y.pub2, `dp-${key}-08-v2-after-reload`));
            const v1a = await openGalleys(C.path, y.id, y.pub, `dp-${key}-09-v1-after`);
            o.two.v1After = {rows: labels(v1a), servedOld: await served(href), servedNow: await served(linkOf(v1a, /^PDF/))};
            const rd = await reader(C.path, y.id, `dp-${key}-10-reader`);
            o.two.reader = {links: rd.links, download: rd.download};
            for (const k of ['one', 'two']) if (o[k].del && o[k].del.screen) o[k].del.screen = labels(o[k].del.screen);
            fact(`delpub-${key}`, o);
        });

        // ============================================================ media: A4's "its media … copied as files of their own" (OJS, OPS)
        if (on('media')) await sect('media', async () => {
            const C = isOJS ? S.J1 : S.P1;
            const key = `md${Date.now().toString(36).slice(-4)}`;
            const r = await app.api.createSubmission({tag: `${S.t}${key}`, context: C.path, submitter: C.u.au, title: `K3 ${key} Wombatery ${S.t}`,
                ...(isOJS ? {decisions: ['skipExternalReview', 'sendToProduction']} : {}), galleys: [{label: 'PDF', file: PDFNAME}], published: true});
            const m = {id: r.submissionId, pub: r.publicationId};
            const o = {sub: m};
            const mediaRows = async () => page.evaluate(() => {
                const v = (e) => e && e.getClientRects().length > 0;
                const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
                return [...dlg.querySelectorAll('table tbody tr')].filter(v).map((tr) => ({text: tr.innerText.replace(/\s+/g, ' ').trim(), links: [...tr.querySelectorAll('a[href]')].map((a) => a.getAttribute('href').replace(/^.*\?/, ''))}));
            }).catch(() => []);
            const openMedia = async (pid, name) => {
                await page.goto(wfUrl(C.path, m.id, `publication_${pid}_media`)); await idle(page);
                await wf().getByRole('button', {name: 'Add Media File'}).first().waitFor({timeout: 20000}).catch(() => {});
                await idle(page); await sleep(600);
                const rows = await mediaRows();
                await snap(name, {mediaRows: rows});
                return rows;
            };
            await as(C.u.mgr, C.path);
            o.v1Initial = await openMedia(m.pub, `media-${key}-01-v1`);
            const addBtn = wf().getByRole('button', {name: 'Add Media File'}).first();
            o.addOffered = await addBtn.isVisible().catch(() => false);
            if (o.addOffered) {
                await addBtn.click(); await sleep(800); await idle(page);
                const modal = page.getByRole('dialog', {name: 'Upload Media File'}).last();
                await modal.waitFor({timeout: T}).catch(() => {});
                await modal.locator('input[type="file"]').first().setInputFiles(fx(app.name, 'profile-image-400.png'));
                const g = modal.locator('select[id*="genreId"]').first();
                await g.waitFor({timeout: T}).catch(() => {});
                const opts = await g.locator('option').evaluateAll((els) => els.map((e) => ({v: e.value, t: e.textContent.trim()}))).catch(() => []);
                o.genreOptions = opts.map((x) => x.t);
                const pick = opts.find((x) => /image/i.test(x.t) && x.v) || opts.find((x) => x.v);
                if (pick) await g.selectOption(pick.v);
                const vt = modal.locator('select[id*="variantType"]').first();
                if (await vt.isEnabled().catch(() => false)) {
                    const vo = await vt.locator('option').evaluateAll((els) => els.map((e) => e.value).filter(Boolean)).catch(() => []);
                    if (vo.length) await vt.selectOption(vo[0]);
                }
                await snap(`media-${key}-02-upload-modal`);
                const up = modal.getByRole('button', {name: 'Upload Files', exact: true});
                const t0 = Date.now();
                await up.click().catch((e) => { o.uploadErr = flat(e.message, 200); });
                await modal.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                await sleep(1000); await idle(page);
                o.uploadResps = respsSince(t0);
                o.v1AfterAdd = await openMedia(m.pub, `media-${key}-03-v1-after-add`);
                await openGalleys(C.path, m.id, m.pub);
                o.create = await createNewVersion(`media-${key}-04-create`);
                m.pub2 = o.create.newPub;
                if (m.pub2) {
                    o.v2Initial = await openMedia(m.pub2, `media-${key}-05-v2`);
                    const row = wf().locator('table tbody tr').first();
                    const btn = row.getByRole('button').last();
                    await btn.click().catch(() => {}); await sleep(400);
                    o.v2Menu = await page.locator('[role="menuitem"]:visible').allInnerTexts().catch(() => []);
                    const del = page.getByRole('menuitem', {name: 'Delete File'}).first();
                    if (await del.count()) {
                        await del.click(); await sleep(800);
                        const dlg = page.locator('[role="dialog"]:visible').last();
                        o.delDialog = flat(await dlg.innerText().catch(() => ''), 300);
                        const t1 = Date.now();
                        await dlg.getByRole('button', {name: /^(Yes|OK|Delete|Delete File)$/}).first().click().catch(() => {});
                        await sleep(1500); await idle(page);
                        o.delResps = respsSince(t1);
                    } else await btn.click().catch(() => {});
                    o.v2AfterDelete = await openMedia(m.pub2, `media-${key}-06-v2-after-delete`);
                    o.v1AfterV2Delete = await openMedia(m.pub, `media-${key}-07-v1-after-v2-delete`);
                }
            }
            fact(`media-${key}`, o);
        });

        // ============================================================ jats (OJS): A4's "other files … copied as files of their own"
        if (on('jats') && isOJS) await sect('jats', async () => {
            const out = {};
            const C = S.J1; const vj = s.vj;
            await as(C.u.mgr, C.path);
            const jatsText = async () => {
                await page.locator('.jatsPanel .filePanel__ready').waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page); await sleep(500);
                const tx = await page.locator('.jatsPanel').first().innerText().catch(() => '');
                return {A: /marker A/.test(tx), B: /marker B/.test(tx), buttons: await page.locator('.jatsPanel .filePanel__header button').allInnerTexts().catch(() => []), text: flat(tx, 300)};
            };
            const openJats = async (pid, name) => { await page.goto(wfUrl(C.path, vj.id, `publication_${pid}_jats`)); await idle(page); const r = await jatsText(); await snap(name, {jats: r}); return r; };
            const upload = async (file) => {
                const [chooser] = await Promise.all([
                    page.waitForEvent('filechooser', {timeout: 15000}),
                    page.locator('.jatsPanel').getByRole('button', {name: /^(Upload|Replace|Upload JATS)/}).first().click(),
                ]);
                const resp = page.waitForResponse((r) => /\/jats(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000}).catch(() => null);
                await chooser.setFiles(file);
                const r = await resp; await idle(page); await sleep(1000);
                return r ? r.status() : null;
            };
            out.v1Initial = await openJats(vj.pub, 'jats-01-v1-initial');
            out.uploadA = await upload(path.join(__dirname, 'jats-A.xml'));
            out.v1AfterA = await openJats(vj.pub, 'jats-02-v1-after-A');
            // publish v1 on screen ("Don't Assign To An Issue")
            await page.goto(wfUrl(C.path, vj.id, `publication_${vj.pub}_titleAbstract`)); await idle(page); await sleep(800);
            const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
            const pub = new PublicationScreen(page, C.path);
            const panel = await pub.openPublishPanel();
            await pub.fillVersionDetails(panel);
            const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
            if (await dontAssign.waitFor({state: 'visible', timeout: 5000}).then(() => true).catch(() => false)) {
                await pub.awaitAssignmentPreselected(panel).catch(() => {});
                await dontAssign.check();
            }
            await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
            await confirm.waitFor({state: 'visible', timeout: T});
            const pr = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
            const rr = await pr; out.publish = rr && rr.status();
            await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
            await idle(page);
            await openGalleys(C.path, vj.id, vj.pub);
            out.create = await createNewVersion('jats-03-create');
            vj.pub2 = out.create.newPub; save();
            if (vj.pub2) {
                out.v2Initial = await openJats(vj.pub2, 'jats-04-v2-initial');
                out.uploadB = await upload(path.join(__dirname, 'jats-B.xml'));
                out.v2AfterB = await openJats(vj.pub2, 'jats-05-v2-after-B');
                out.v1AfterB = await openJats(vj.pub, 'jats-06-v1-after-B');
            }
            fact('jats', out);
        });

        // ============================================================ issues (OJS): an issue's own galleys (Cross-feature)
        if (on('issues') && isOJS) await sect('issues', async () => {
            const out = {};
            await as(S.J1.u.mgr, S.J1.path);
            await page.goto(app.url(`/index.php/${S.J1.path}/manageIssues`)); await idle(page);
            const row = page.locator('tr.gridRow').filter({hasText: 'Vol. 1 No. 1 (2026)'}).first();
            await row.waitFor({timeout: 20000});
            await row.locator('a.show_extras').click(); await sleep(300);
            await page.getByRole('link', {name: 'Edit', exact: true}).filter({visible: true}).first().click();
            await idle(page);
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
            out.tabs = (await top().locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
            await snap('iss-01-issue-edit', {tabs: out.tabs});
            const ig = top().getByRole('tab', {name: 'Issue Galleys', exact: true});
            if (await ig.count()) {
                await ig.click(); await idle(page); await sleep(1200);
                out.grid = await top().evaluate((d) => [...d.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()), rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())}))).catch(() => []);
                out.links = await top().locator('a:visible').allInnerTexts().catch(() => []);
                await snap('iss-02-issue-galleys', {grid: out.grid});
                const add = top().getByRole('link', {name: /Add Issue Galley/i}).first();
                if (await add.count()) {
                    await add.click(); await idle(page); await sleep(1500);
                    out.addWindow = await winInfo();
                    await snap('iss-03-add-issue-galley', {win: out.addWindow});
                }
            }
            fact('issues', out);
        });
    } finally {
        record('js-dialogs', {jsDialogs});
        await close();
    }
});
