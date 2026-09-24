// U46 claim check, chunk K2: the galley window {OJS OPS}, with read-only controls on OMP.
// Spec: docs/specs/U46-galleys.md — the galley window's fields (68–82), Rules 2–7 (95–153),
// Settings bullets 1–3 (222–236), register A1–A3 (348–378) and A6 (399–406); footnotes e, f, g, h, i,
// p, q, q3, q4, q6–q11, f-a1, f-a2, f-a3, f-a6.
//
//   PROBE_FEATURE=U46 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U46/K2/k2.js
//   PHASES=seed,add,unfinished,remote,path,edit,lang,lang2,lang3,lang4,pid,close2,urn,levels,moderator,author,wizgrid,recheck,publish,omp
//   (lang3 adds French to T1's submission languages, lang4 needs it; lang3 also flips T2's primary language and back.)
//   (default: all; later phases read k2-state-<app>.json). A full run outlasts the Bash cap: run it
//   detached per app (nohup … &) and poll the pid.
//
// Scratch contexts per app (OJS, OPS; OMP only read-only controls on `publicknowledge`):
//   T1  defaults (one submission language). Users mgr (manager), se (sectionEditor / Moderator),
//       au (author); OJS also le (layoutEditor). OJS: one published issue for the publish phase.
//       sA  no galleys: "Add galley" (q6), Cancel (2a), the unfinished wizard (q7), remote galleys (q8, q9, A6)
//       sB  galleys PDF + HTML (files): URL Path (q10), Edit (Rule 6, A1), Dependent Files, 6a / A2
//       sC  galley PDF: another article takes the same URL Path
//       sV  galley PDF: URL Path, publish, new version: the copy's path (q10's "another version")
//       OJS sK  se assigned with "Permissions" unticked (control for Rule 7's Moderator)
//       OPS sM  se (Moderator) with "Permissions" unticked, PDF + HTML (q3); sM2 se with it ticked;
//           sP  posted, PDF (q4); sAu unposted, PDF (the Author who may edit); sD a draft (the wizard's grid)
//   T2  submission languages en + fr_CA (q11, Settings bullet 3); OJS: URN on for articles only (bullet 2's
//       other end). sE (en, PDF galley), sF (fr_CA, no galley).
//   T3  OJS: URN on with "Galleys" only (Settings bullet 2). OPS: Author "Permit submission metadata edit."
//       off (Rule 7's Author with the permission off). One submission with a PDF galley.
// Settings bullet 1 is ticked on screen in T1 (phase pid). No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'add', 'unfinished', 'remote', 'path', 'edit', 'lang', 'lang2', 'lang3', 'lang4', 'pid', 'close2', 'urn', 'levels', 'moderator', 'author', 'wizgrid', 'recheck', 'publish', 'omp'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const fx = (app, f) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${f}`);

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k2-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };
    const PDF = isOPS ? fx('ops', 'preprint.pdf') : fx('ojs', 'article.pdf');
    const HTMLF = isOPS ? fx('ops', 'preprint.html') : fx('ojs', 'article.html');
    const REPL = isOPS ? fx('ops', 'replacement.pdf') : fx('ojs', 'replacement.pdf');
    const PDFNAME = isOPS ? 'preprint.pdf' : 'article.pdf';
    const HTMLNAME = isOPS ? 'preprint.html' : 'article.html';
    const MAIN = isOPS ? 'Preprint Text' : 'Article Text';

    // ------------------------------------------------------------------ OMP: read-only controls
    if (isOMP) {
        if (!on('omp')) return;
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'manager.maya', {contextPath: app.contextPath});
            await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/workflow`)); await idle(page);
            await page.locator('#metadata-button').click(); await idle(page);
            const group = page.getByRole('group', {name: 'Publisher ID'});
            await group.waitFor({timeout: T}).catch(() => {});
            const boxes = await group.getByRole('checkbox').evaluateAll((els) => els.map((b) => ({label: (b.closest('label')?.innerText || '').trim(), value: b.value, checked: b.checked}))).catch(() => []);
            const s = await screen(page); s.boxes = boxes; record('omp-01-settings-metadata-publisherid', s); await shot(page, 'omp-01-settings-metadata-publisherid');
            fact('omp.publisherIdBoxes', boxes);
            await loc(page, 'Settings › Workflow › Submission › Metadata: group "Publisher ID"', group);
        } finally { await close(); }
        return;
    }

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u46k2');
        S.t = t;
        const mkUsers = (p, extra = []) => [
            {username: `${p}mg`, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'},
            {username: `${p}au`, roles: ['author'], givenName: 'Ari', familyName: 'Author'},
            ...extra,
        ];
        const ctxBase = (p, name) => ({name: `U46 K2 ${name} ${p}`, acronym: 'KTWO', contactName: 'K2 Contact', contactEmail: `${p}c@mail.test`});
        // T1
        const p1 = `${t}a`;
        const extra1 = [{username: `${p1}se`, roles: ['sectionEditor'], givenName: 'Sam', familyName: isOPS ? 'Moderator' : 'Section'}];
        if (isOJS) extra1.push({username: `${p1}le`, roles: ['layoutEditor'], givenName: 'Lee', familyName: 'Layout'});
        const c1 = {tag: p1, context: ctxBase(p1, 'defaults'), users: mkUsers(p1, extra1)};
        if (isOJS) c1.issues = [{volume: 1, number: 1, year: 2026, published: true}];
        const r1 = await app.api.createContext(c1);
        S.T1 = {path: r1.path || p1, u: {mg: `${p1}mg`, au: `${p1}au`, se: `${p1}se`, le: isOJS ? `${p1}le` : null}};
        // T2
        const p2 = `${t}b`;
        const c2 = {tag: p2, context: {...ctxBase(p2, 'languages'), supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']}, users: mkUsers(p2)};
        if (isOJS) c2.plugins = {urnpubidplugin: {enabled: true, settings: {urnPrefix: 'urn:nbn:de:0000-', urnResolver: 'https://nbn-resolving.de/', urnNamespace: 'urn:nbn:de', urnCheckNo: false, urnSuffix: 'default', enablePublicationURN: true, enableIssueURN: false, enableRepresentationURN: false}}};
        const r2 = await app.api.createContext(c2);
        S.T2 = {path: r2.path || p2, u: {mg: `${p2}mg`, au: `${p2}au`}};
        // T3
        const p3 = `${t}c`;
        const c3 = {tag: p3, context: ctxBase(p3, isOJS ? 'urn-galleys' : 'author-no-edit'), users: mkUsers(p3)};
        if (isOJS) c3.plugins = {urnpubidplugin: {enabled: true, settings: {urnPrefix: 'urn:nbn:de:0000-', urnResolver: 'https://nbn-resolving.de/', urnNamespace: 'urn:nbn:de', urnCheckNo: false, urnSuffix: 'default', enablePublicationURN: false, enableIssueURN: false, enableRepresentationURN: true}}};
        if (isOPS) c3.roles = {author: {permitMetadataEdit: false}};
        const r3 = await app.api.createContext(c3);
        S.T3 = {path: r3.path || p3, u: {mg: `${p3}mg`, au: `${p3}au`}};
        save();

        const prod = isOJS ? {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']} : {};
        const g = (label, f) => ({label, file: f});
        const sub = async (ctx, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctx.path, submitter: ctx.u.au, title: `K2 ${k} ${t}`, ...spec});
                log('seed', k, r.submissionId, r.publicationId, JSON.stringify(r.galleys));
                return {id: r.submissionId, pub: r.publicationId, galleys: r.galleys, stageId: r.stageId};
            } catch (e) { log('seed FAILED', k, String(e.message).slice(0, 600)); return {error: String(e.message).slice(0, 600)}; }
        };
        const T1 = S.T1;
        const se = (can) => [{username: T1.u.se, role: 'sectionEditor', ...(can === undefined ? {} : {canChangeMetadata: can})}];
        const le = isOJS ? [{username: T1.u.le, role: 'layoutEditor'}] : [];
        S.s = {};
        S.s.A = await sub(T1, 'sa', {...prod, participants: [...se(), ...le]});
        S.s.B = await sub(T1, 'sb', {...prod, participants: [...se(), ...le], galleys: [g('PDF', PDFNAME), g('HTML', HTMLNAME)]});
        S.s.C = await sub(T1, 'sc', {...prod, participants: se(), galleys: [g('PDF', PDFNAME)]});
        S.s.V = await sub(T1, 'sv', {...prod, participants: se(), galleys: [g('PDF', PDFNAME)]});
        if (isOJS) S.s.K = await sub(T1, 'sk', {...prod, participants: se(false), galleys: [g('PDF', PDFNAME)]});
        if (isOPS) {
            S.s.M = await sub(T1, 'sm', {participants: se(false), galleys: [g('PDF', PDFNAME), g('HTML', HTMLNAME)]});
            S.s.M2 = await sub(T1, 'sm2', {participants: se(true), galleys: [g('PDF', PDFNAME)]});
            S.s.P = await sub(T1, 'sp', {participants: se(), galleys: [g('PDF', PDFNAME)], published: true});
            S.s.Au = await sub(T1, 'sau', {participants: se(), galleys: [g('PDF', PDFNAME)]});
            S.s.D = await sub(T1, 'sd', {submitted: false});
        }
        S.s.E = await sub(S.T2, 'se', {...prod, galleys: [g('PDF', PDFNAME)]});
        S.s.F = await sub(S.T2, 'sf', {...prod, locale: 'fr_CA'});
        S.s.U = await sub(S.T3, 'su', {...prod, galleys: [g('PDF', PDFNAME)]});
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const posts = [];
    page.on('request', (r) => { if (r.method() === 'POST') posts.push({at: Date.now(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 220)}); });
    const postsSince = (t0) => posts.filter((p) => p.at >= t0).map((p) => p.url);
    const jsDialogs = [];
    let dialogAnswer = 'dismiss';
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300)});
        log('[browser dialog]', d.type(), flat(d.message(), 200), d.type() === 'beforeunload' ? 'accept' : dialogAnswer);
        if (d.type() === 'beforeunload' || dialogAnswer === 'accept') d.accept().catch(() => {}); else d.dismiss().catch(() => {});
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
    const noticesSince = async (t0) => page.evaluate((s) => (window.__notices || []).filter((n) => n.at >= s).map((n) => n.t), t0).catch(() => []);

    async function snap(name, extra = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
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

    async function openGalleys(ctx, sub, name, {author, pub} = {}) {
        await page.goto(wfUrl(ctx, sub.id, `publication_${pub || sub.pub}_galleys`, author));
        await idle(page);
        await gm().waitFor({state: 'visible', timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        const info = await pageInfo();
        if (name) await snap(name, {galleys: info});
        return info;
    }
    async function pageInfo() {
        return page.evaluate(() => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const v = (e) => e && e.getClientRects().length > 0;
            const root = document.querySelector('[data-cy="galley-manager"]');
            if (!root) return {present: false};
            const dlg = root.closest('[role=dialog]') || document.body;
            const heading = [...dlg.querySelectorAll('h1,h2')].filter(v).map((h) => f(h.innerText)).filter(Boolean).slice(0, 4);
            const rows = [...root.querySelectorAll('tbody tr')].map((tr) => {
                const cells = [...tr.querySelectorAll('td,th')].map((c) => f(c.innerText));
                const a = tr.querySelector('a[href]');
                return {cells, link: a ? {text: f(a.innerText), href: a.getAttribute('href'), target: a.getAttribute('target')} : null,
                    buttons: [...tr.querySelectorAll('button')].filter(v).map((b) => f(b.getAttribute('aria-label') || b.innerText) || '(unnamed)')};
            });
            const buttons = [...root.querySelectorAll('button')].filter(v).map((b) => f(b.innerText || b.getAttribute('aria-label'))).filter(Boolean);
            const around = [...dlg.querySelectorAll('button')].filter(v).map((b) => f(b.innerText)).filter((t) => /galley|Order/i.test(t));
            return {present: true, heading, rows, buttons, around, text: f(root.innerText).slice(0, 1200)};
        }).catch((e) => ({error: String(e.message)}));
    }
    const rowOf = (label) => gm().locator('tbody tr').filter({has: page.locator('td').first().filter({hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)})}).first();
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
    // The legacy galley window as data: title, tabs, fields (label, value, visible, disabled), help, buttons, errors.
    async function winInfo() {
        return top().evaluate((d) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const lab = d.getAttribute('aria-labelledby');
            const title = d.getAttribute('aria-label') || (lab && document.getElementById(lab)?.innerText.trim()) || null;
            const headings = [...d.querySelectorAll('h1,h2,h3')].filter(v).map((h) => f(h.innerText)).filter(Boolean);
            const tabs = [...d.querySelectorAll('[role=tab]')].filter(v).map((t) => `${f(t.innerText)}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`);
            const form = [...d.querySelectorAll('form')].filter(v).pop();
            const fields = form ? [...form.querySelectorAll('input:not([type=hidden]), select, textarea')].map((e) => {
                const id = e.id;
                const lbl = id ? form.querySelector(`label[for="${id}"]`) : null;
                const sec = e.closest('.section, fieldset');
                return {name: e.name, type: e.type, visible: v(e), disabled: e.disabled, required: e.required, value: e.type === 'checkbox' ? e.checked : e.value,
                    label: lbl ? f(lbl.innerText) : null, section: sec ? f(sec.querySelector('legend, .label, label')?.innerText) : null,
                    options: e.tagName === 'SELECT' ? [...e.options].map((o) => `${f(o.text)}${o.selected ? '*' : ''}`) : undefined};
            }) : [];
            const errors = [...d.querySelectorAll('label.error, .error, .pkp_form_error, [class*="formError"], .pkp_notification')].filter(v).map((e) => f(e.innerText)).filter(Boolean);
            const buttons = [...d.querySelectorAll('button, a.pkp_button, a[role=button], input[type=submit]')].filter(v).map((b) => f(b.innerText || b.value || b.getAttribute('aria-label'))).filter(Boolean);
            const links = form ? [...form.querySelectorAll('a')].filter(v).map((a) => f(a.innerText)).filter(Boolean) : [];
            const dep = d.querySelector('#dependentFilesGridDiv, [id^="dependentFilesGridDiv"]');
            return {title, headings, tabs, fields, errors, buttons, links, formId: form ? form.id : null,
                dependentFiles: dep ? {visible: v(dep), text: f(dep.innerText).slice(0, 400)} : null,
                text: f(form ? form.innerText : d.innerText).slice(0, 2500)};
        }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    }
    async function winSnap(name, extra = {}) {
        const w = await winInfo();
        await snap(name, {win: w, ...extra});
        log(`[${name}]`, JSON.stringify({title: w.title, headings: w.headings, tabs: w.tabs, errors: w.errors, fields: (w.fields || []).map((x) => `${x.name}=${JSON.stringify(x.value)}${x.visible ? '' : '(hidden)'}${x.disabled ? '(dis)' : ''}${x.options ? ` [${x.options.join('|')}]` : ''}`)}).slice(0, 1500));
        return w;
    }
    async function formSave(t0label) {
        const t0 = Date.now();
        const form = galleyForm();
        await form.getByRole('button', {name: 'Save', exact: true}).last().click();
        await sleep(1200); await idle(page);
        const stillOpen = await form.isVisible().catch(() => false);
        return {t0, stillOpen, posts: postsSince(t0), notices: await noticesSince(t0), dialogs: dialogsSince(t0)};
    }
    async function formCancel() {
        const form = galleyForm();
        const c = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
        if (await c.count()) await c.click().catch(() => {});
        await sleep(900); await idle(page);
    }
    async function headerClose() {
        await top().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(900); await idle(page);
    }
    async function addGalley() {
        await gm().waitFor({timeout: T});
        const b = page.getByRole('button', {name: 'Add galley', exact: true}).first();
        await b.click();
        await waitForm();
    }
    // ---- the upload wizard (U36 K5's helpers)
    async function wizState() {
        const w = wizard();
        if (!(await w.count()) || !(await w.isVisible().catch(() => false))) return {open: false};
        return w.evaluate((d) => {
            const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const panel = [...d.querySelectorAll('[role=tabpanel]')].find((p) => v(p) && p.getAttribute('aria-hidden') !== 'true') || d;
            const lab = d.getAttribute('aria-labelledby');
            return {open: true,
                title: d.getAttribute('aria-label') || (lab && document.getElementById(lab)?.innerText.trim()) || null,
                headings: [...d.querySelectorAll('h1,h2')].filter(v).map((h) => f(h.innerText)).filter(Boolean),
                tabs: [...d.querySelectorAll('[role=tab]')].map((t) => `${f(t.innerText)}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`),
                genre: [...d.querySelectorAll('select[id^="genreId"]')].map((s) => ({visible: v(s), options: [...s.options].map((o) => `${o.text.trim()}${o.selected ? '*' : ''}`)})),
                revise: [...d.querySelectorAll('select[id^="revisedFileId"]')].map((s) => ({visible: v(s), options: [...s.options].map((o) => o.text.trim())})),
                labels: [...panel.querySelectorAll('label, legend, h3, h4')].filter(v).map((e) => f(e.innerText)).filter(Boolean).slice(0, 20),
                buttons: [...d.querySelectorAll('button, a')].filter(v).map((b) => f(b.innerText || b.getAttribute('aria-label'))).filter(Boolean),
                text: f(panel.innerText).slice(0, 1500)};
        }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    }
    async function wizSnap(name) {
        await wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}).catch(() => {});
        await idle(page); await sleep(400);
        const st = await wizState();
        await snap(name, {wizard: st});
        log(`[${name}]`, JSON.stringify({title: st.title, headings: st.headings, tabs: st.tabs, genre: st.genre, revise: st.revise}).slice(0, 800));
        return st;
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
        await wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}); await idle(page);
        const g = wizard().locator('select[id^="genreId"]');
        if (genre && await g.count() && await g.isVisible().catch(() => false)) await g.selectOption({label: genre});
        await wizard().locator('input[type="file"]').setInputFiles(file);
        await waitContinueEnabled();
        await toStep(2); await toStep(3);
        await wizard().getByRole('button', {name: 'Complete', exact: true}).click();
        await wizard().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page); await sleep(700); await idle(page);
    }
    async function wizClose(how = 'close') {
        if (how === 'cancel') {
            const c = wizard().getByRole('link', {name: 'Cancel', exact: true}).or(wizard().getByRole('button', {name: 'Cancel', exact: true})).first();
            await c.click().catch(() => {});
        } else {
            await wizard().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        }
        await sleep(1000);
        await wizard().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page); await sleep(700); await idle(page);
    }
    // What a file link serves: the suggested file name (the same GET the link sends).
    async function served(href) {
        if (!href) return null;
        const u = href.startsWith('http') ? href : app.url(href.startsWith('/') ? href : `/${href}`);
        const r = await page.request.get(u, {maxRedirects: 0}).catch((e) => ({err: String(e.message).slice(0, 200)}));
        if (r.err) return r;
        const h = r.headers();
        return {status: r.status(), disposition: h['content-disposition'] || null, type: h['content-type'] || null, location: h.location || null, size: Number(h['content-length'] || 0) || null};
    }
    async function fillField(name, value) {
        const el = galleyForm().locator(`[name="${name}"]`);
        await el.fill(value);
        await el.blur().catch(() => {});
    }
    const tickRemote = async (want) => {
        const b = galleyForm().locator('input[name="remotelyHostedContent"]');
        if ((await b.isChecked()) !== want) await b.click();
        await sleep(300);
    };
    const T1 = S.T1; const T2 = S.T2; const T3 = S.T3; const s = S.s;

    // Publishing on screen: OJS through the suite's PublicationScreen into the seeded issue; OPS "Post".
    async function publishOnScreen(ctx, sub, name) {
        await page.goto(wfUrl(ctx, sub.id, `publication_${sub.pub}_titleAbstract`)); await idle(page); await sleep(800);
        const out = {};
        if (isOJS) {
            const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
            const pub = new PublicationScreen(page, ctx);
            const r = page.waitForResponse((x) => x.url().includes('/publish') && x.request().method() !== 'GET', {timeout: 60000}).catch(() => null);
            await pub.publish({backIssueLabel: /Vol\. 1 No\. 1/}).catch((e) => { out.err = flat(e.message, 300); });
            const resp = await r; out.status = resp && resp.status();
        } else {
            const post = page.getByRole('button', {name: 'Post', exact: true}).first();
            await post.waitFor({timeout: T});
            await post.click();
            const conf = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
            await conf.waitFor({timeout: T});
            const r = page.waitForResponse((x) => /\/publish/.test(x.url()), {timeout: T}).catch(() => null);
            await conf.getByRole('button', {name: 'Post', exact: true}).last().click();
            const resp = await r; out.status = resp && resp.status();
            await sleep(1500); await idle(page);
        }
        await snap(name, {publish: out});
        return out;
    }
    async function createNewVersion(name) {
        const dialog = wf();
        const link = dialog.getByRole('link', {name: 'Create New Version', exact: true}).or(dialog.getByRole('button', {name: 'Create New Version', exact: true})).first();
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
        await snap(name + '-window');
        const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
        await w.getByRole('button', {name: 'Confirm', exact: true}).click();
        const resp = await r;
        let newPub = null;
        if (resp) { try { newPub = (await resp.json()).id; } catch (e) { /* none */ } }
        await w.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
        return {offered: true, status: resp && resp.status(), newPub};
    }
    const readerUrl = (ctx, sid) => app.url(`/index.php/${ctx}/${isOPS ? 'preprint' : 'article'}/view/${sid}`);
    async function readerLinks(ctx, sid, name) {
        await page.goto(readerUrl(ctx, sid)); await idle(page);
        const links = await page.locator('a.obj_galley_link').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim().replace(/\s+/g, ' '), href: a.getAttribute('href'), cls: a.className}))).catch(() => []);
        await snap(name, {galleyLinks: links});
        return links;
    }
    // Follow a reader galley link as the browser does; any off-site host is answered by a local stub.
    async function follow(href, name) {
        const offsite = [];
        await page.route((u) => !u.href.startsWith(app.baseURL), (r) => { offsite.push(r.request().url()); r.fulfill({status: 200, contentType: 'text/html', body: '<html><head><title>offsite stub</title></head><body>offsite stub</body></html>'}); });
        const chain = [];
        const onResp = (r) => { if (r.request().isNavigationRequest()) chain.push({url: r.url().replace(app.baseURL, ''), status: r.status(), location: r.headers().location || null}); };
        page.on('response', onResp);
        const resp = await page.goto(href.startsWith('http') ? href : app.url(href)).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await sleep(500);
        page.off('response', onResp);
        await page.unroute(() => true).catch(() => {});
        await page.unrouteAll({behavior: 'ignoreErrors'}).catch(() => {});
        const out = {finalUrl: page.url(), title: await page.title().catch(() => null), chain, offsite, err: resp && resp.err};
        const dl = await page.locator('a.download, a[href*="/download/"]').first().getAttribute('href').catch(() => null);
        out.downloadHref = dl;
        if (dl) out.downloadServed = await served(dl);
        await snap(name, {follow: out});
        return out;
    }

    try {
        // ============================================================ add (q6, 2a, Fields)
        if (on('add')) await sect('add', async () => {
            const out = {};
            await as(T1.u.mg, T1.path);
            out.page = await openGalleys(T1.path, s.A, 'a-01-galleys-empty');
            await loc(page, 'Galleys page: "Add galley" button', page.getByRole('button', {name: 'Add galley', exact: true}));
            await addGalley();
            out.window = await winSnap('a-02-create-new-galley');
            await loc(page, 'Create New Galley: form', galleyForm());
            await loc(page, 'Create New Galley: "Galley Label" box input[name="label"]', galleyForm().locator('input[name="label"]'));
            await loc(page, 'Create New Galley: "Language" select[name="locale"]', galleyForm().locator('select[name="locale"]'));
            await loc(page, 'Create New Galley: remote box input[name="remotelyHostedContent"]', galleyForm().locator('input[name="remotelyHostedContent"]'));
            await loc(page, 'Create New Galley: "URL Path" input[name="urlPath"]', galleyForm().locator('input[name="urlPath"]'));
            await loc(page, 'Create New Galley: header "Close"', top().getByRole('button', {name: 'Close', exact: true}));
            // empty label → Save
            const e = await formSave();
            out.emptySave = {...e, win: await winSnap('a-03-save-empty-label')};
            // the remote box's toggling: URL Path typed, tick, untick; URL typed, untick, tick
            await fillField('urlPath', 'abc');
            await tickRemote(true);
            out.tick1 = await winSnap('a-04-ticked-after-path');
            await fillField('urlRemote', 'https://example.org/x');
            await tickRemote(false);
            out.untick1 = await winSnap('a-05-unticked-after-url');
            await tickRemote(true);
            out.retick = await winSnap('a-06-reticked');
            await tickRemote(false);
            // Cancel (2a)
            await fillField('label', 'CancelMe');
            const t0 = Date.now();
            await formCancel();
            out.cancel = {posts: postsSince(t0), open: await galleyForm().isVisible().catch(() => false), dialogs: dialogsSince(t0), wizard: (await wizState()).open};
            out.afterCancel = await openGalleys(T1.path, s.A, 'a-07-after-cancel');
            // header Close with a typed label (left unsaved)
            await addGalley();
            await fillField('label', 'CloseMe');
            const t1 = Date.now();
            await headerClose();
            out.closeUnsaved = {posts: postsSince(t1), dialogs: dialogsSince(t1), open: await galleyForm().isVisible().catch(() => false)};
            out.afterClose = await openGalleys(T1.path, s.A, 'a-08-after-close-unsaved');
            // "PDF" › Save → the wizard
            await addGalley();
            await fillField('label', 'PDF');
            const sv = await formSave();
            out.pdfSave = sv;
            out.wizard1 = await wizSnap('a-09-wizard-after-save');
            await loc(page, 'Upload wizard dialog (has div[id^=fileUploadWizard])', wizard());
            await loc(page, 'Upload wizard step 1: component select[id^=genreId]', wizard().locator('select[id^="genreId"]'));
            await wizUpload(PDF);
            out.afterComplete = await openGalleys(T1.path, s.A, 'a-10-after-complete');
            const pdfRow = (out.afterComplete.rows || []).find((r) => /^PDF/.test(r.cells[0] || ''));
            out.pdfLink = pdfRow && pdfRow.link;
            out.pdfServed = await served(pdfRow && pdfRow.link && pdfRow.link.href);
            out.pdfMenu = await rowMenu('PDF');
            // Rule 3: Change File on PDF with replacement.pdf
            await rowMenu('PDF', 'Change File');
            out.changeFileStep1 = await wizSnap('a-11-changefile-step1');
            await wizUpload(REPL, {genre: null});
            out.afterChange = await openGalleys(T1.path, s.A, 'a-12-after-changefile');
            const pdfRow2 = (out.afterChange.rows || []).find((r) => /^PDF/.test(r.cells[0] || ''));
            out.pdfLink2 = pdfRow2 && pdfRow2.link;
            out.pdfServed2 = await served(pdfRow2 && pdfRow2.link && pdfRow2.link.href);
            fact('add', out);
        });

        // ============================================================ unfinished (q7, 2b)
        if (on('unfinished')) await sect('unfinished', async () => {
            const out = {};
            await as(T1.u.mg, T1.path);
            await openGalleys(T1.path, s.A);
            await addGalley();
            await fillField('label', 'Unfinished');
            out.save = await formSave();
            out.wiz = await wizSnap('u-01-wizard');
            await wizClose('close');
            out.after = await openGalleys(T1.path, s.A, 'u-02-after-wizard-close');
            out.row = (out.after.rows || []).find((r) => /^Unfinished/.test(r.cells[0] || ''));
            out.menu = await rowMenu('Unfinished');
            await rowMenu('Unfinished', 'Change File');
            out.changeFile = await wizSnap('u-03-changefile-step1');
            await wizClose('cancel');
            // the wizard's "Cancel" instead of "Close"
            await openGalleys(T1.path, s.A);
            await addGalley();
            await fillField('label', 'Unfinished2');
            await formSave();
            await wizSnap('u-04-wizard-2');
            await wizClose('cancel');
            out.after2 = await openGalleys(T1.path, s.A, 'u-05-after-wizard-cancel');
            out.menu2 = await rowMenu('Unfinished2');
            fact('unfinished', out);
        });

        // ============================================================ remote (q8, q9, A3, A6, Rule 4)
        if (on('remote')) await sect('remote', async () => {
            const out = {};
            await as(T1.u.mg, T1.path);
            await openGalleys(T1.path, s.A);
            await addGalley();
            await fillField('label', 'Remote');
            await fillField('urlPath', 'remotepath');
            await tickRemote(true);
            out.ticked = await winSnap('r-01-remote-ticked');
            await fillField('urlRemote', 'https://example.org/paper');
            out.save = await formSave();
            out.wizardOpens = await wizSnap('r-02-after-save');
            if (out.wizardOpens.open) await wizClose('close');
            out.after = await openGalleys(T1.path, s.A, 'r-03-row');
            out.row = (out.after.rows || []).find((r) => /^Remote$/.test(r.cells[0] || ''));
            out.menu = await rowMenu('Remote');
            // its Edit window on load
            await rowMenu('Remote', 'Edit');
            await waitForm();
            out.editLoad = await winSnap('r-04-remote-edit-load');
            await formCancel();
            // A6 on create: "www.example.org" and "example"
            for (const [lbl, url] of [['RemoteW', 'www.example.org'], ['RemoteX', 'example']]) {
                await openGalleys(T1.path, s.A);
                await addGalley();
                await fillField('label', lbl);
                await tickRemote(true);
                await fillField('urlRemote', url);
                const sv = await formSave();
                out[`create-${lbl}`] = {...sv, win: sv.stillOpen ? await winSnap(`r-05-create-${lbl}-refused`) : null, wizard: (await wizState()).open};
                if ((await wizState()).open) await wizClose('close');
                if (sv.stillOpen) await formCancel();
            }
            // q9: a remote galley's Edit, "example"
            await openGalleys(T1.path, s.A);
            await addGalley();
            await fillField('label', 'RemoteE');
            await tickRemote(true);
            await fillField('urlRemote', 'https://example.org/e');
            await formSave();
            if ((await wizState()).open) await wizClose('close');
            await openGalleys(T1.path, s.A);
            await rowMenu('RemoteE', 'Edit');
            await waitForm();
            await fillField('urlRemote', 'example');
            const ed = await formSave();
            out.editExample = {...ed, win: ed.stillOpen ? await winSnap('r-06-edit-example-refused') : null};
            if (ed.stillOpen) await formCancel();
            await openGalleys(T1.path, s.A);
            await rowMenu('RemoteE', 'Edit');
            await waitForm();
            out.editExampleReopen = await winSnap('r-07-edit-example-reopened');
            // untick on an existing remote galley: the address box hides and empties; save → a file galley?
            await tickRemote(false);
            out.untickOnEdit = await winSnap('r-08-untick-on-edit');
            await formCancel();
            // Change File on "Remote" › upload a PDF › Complete (q8)
            await openGalleys(T1.path, s.A);
            await rowMenu('Remote', 'Change File');
            out.remoteChangeFile = await wizSnap('r-09-remote-changefile-step1');
            await wizUpload(PDF);
            out.afterRemoteFile = await openGalleys(T1.path, s.A, 'r-10-remote-with-file');
            out.rowWithFile = (out.afterRemoteFile.rows || []).find((r) => /^Remote$/.test(r.cells[0] || ''));
            out.menuWithFile = await rowMenu('Remote');
            await rowMenu('Remote', 'Edit');
            await waitForm();
            out.editWithFile = await winSnap('r-11-remote-with-file-edit');
            await formCancel();
            fact('remote', out);
        });

        // ============================================================ path (q10, Rule 5)
        if (on('path')) await sect('path', async () => {
            const out = {};
            if (!s.V2) {
                const r = await app.api.createSubmission({tag: `${S.t}sv2`, context: T1.path, submitter: T1.u.au, title: `K2 sv2 ${S.t}`, ...(isOJS ? {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']} : {}), participants: [{username: T1.u.se, role: 'sectionEditor'}], galleys: [{label: 'PDF', file: PDFNAME}]});
                s.V2 = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys}; save();
            }
            await as(T1.u.mg, T1.path);
            out.page = await openGalleys(T1.path, s.B, 'p-01-galleys-B');
            const PL = (out.page.rows || []).map((r) => r.cells[0]).find((c) => /^PDF/.test(c)) || 'PDF';
            out.pdfLabel = PL;
            out.pdfMenu = await rowMenu(PL);
            await rowMenu(PL, 'Edit');
            await waitForm();
            out.edit = await winSnap('p-02-edit-pdf');
            await loc(page, 'Galley "Edit" window: tab "Edit Metadata"', top().getByRole('tab', {name: 'Edit Metadata'}));
            const tries = ['123', 'my galley', 'pdf-', '-pdf', 'pdf--x', 'a/b', 'pdf_v1.x'];
            out.tries = {};
            for (const v of tries) {
                await fillField('urlPath', v);
                const r = await formSave();
                out.tries[v] = {...r, win: r.stillOpen ? await winSnap(`p-03-path-${v.replace(/[^a-z0-9]+/gi, '_')}`) : null};
                if (!r.stillOpen) { await openGalleys(T1.path, s.B); await rowMenu(PL, 'Edit'); await waitForm(); out.tries[v].reopened = await winSnap(`p-03b-reopen-after-${v.replace(/[^a-z0-9]+/gi, '_')}`); }
            }
            await fillField('urlPath', '');
            out.empty = await formSave();
            if (out.empty.stillOpen) { await winSnap('p-04-empty-refused'); await formCancel(); }
            // "pdf" on PDF, then on HTML (same version)
            await openGalleys(T1.path, s.B); await rowMenu(PL, 'Edit'); await waitForm();
            await fillField('urlPath', 'pdf');
            out.pdfPath = await formSave();
            if (out.pdfPath.stillOpen) { await winSnap('p-05-pdf-refused'); await formCancel(); }
            await openGalleys(T1.path, s.B); await rowMenu('HTML', 'Edit'); await waitForm();
            out.htmlEdit = await winSnap('p-06-edit-html');
            await fillField('urlPath', 'pdf');
            const dup = await formSave();
            out.dup = {...dup, win: dup.stillOpen ? await winSnap('p-07-html-duplicate') : null};
            if (dup.stillOpen) await formCancel();
            // another article
            await openGalleys(T1.path, s.C); await rowMenu('PDF', 'Edit'); await waitForm();
            await fillField('urlPath', 'pdf');
            const other = await formSave();
            out.otherArticle = {...other, win: other.stillOpen ? await winSnap('p-08-other-article-refused') : null};
            if (other.stillOpen) await formCancel();
            await openGalleys(T1.path, s.C); await rowMenu('PDF', 'Edit'); await waitForm();
            out.otherReopen = await winSnap('p-09-other-article-reopened');
            await formCancel();
            // sV2: "pdf" before publishing (the publish phase reads it after "Create New Version")
            await openGalleys(T1.path, s.V2); await rowMenu('PDF', 'Edit'); await waitForm();
            await fillField('urlPath', 'pdf');
            out.vPath = await formSave();
            if (out.vPath.stillOpen) { await winSnap('p-10-v-refused'); await formCancel(); }
            fact('path', out);
        });

        // ============================================================ edit (Rule 6, A1, Dependent Files, Save/Cancel)
        if (on('edit')) await sect('edit', async () => {
            const out = {};
            await as(T1.u.mg, T1.path);
            await openGalleys(T1.path, s.B);
            await rowMenu('PDF', 'Edit'); await waitForm();
            out.window = await winSnap('e-01-edit-pdf');
            // Cancel after a change: nothing stored
            await fillField('label', 'PDF cancelled');
            const t0 = Date.now();
            await formCancel();
            out.cancel = {posts: postsSince(t0), dialogs: dialogsSince(t0)};
            out.afterCancel = await openGalleys(T1.path, s.B, 'e-02-after-cancel');
            // Save a new label: closes, the row at once, no notice
            await rowMenu('PDF', 'Edit'); await waitForm();
            await fillField('label', 'PDF2');
            const t1 = Date.now();
            const sv = await formSave();
            const rowsNow = await pageInfo();
            out.save = {...sv, rowsAtOnce: (rowsNow.rows || []).map((r) => r.cells.join(' | '))};
            await sleep(3000);
            out.save.noticesLater = await noticesSince(t1);
            await snap('e-03-after-save', {galleys: rowsNow});
            out.afterReload = await openGalleys(T1.path, s.B, 'e-04-after-save-reload');
            // the HTML galley: Dependent Files
            await rowMenu('HTML', 'Edit'); await waitForm();
            await top().locator('#dependentFilesGridDiv, [id^="dependentFilesGridDiv"]').first().waitFor({timeout: 15000}).catch(() => {});
            await idle(page); await sleep(600);
            out.html = await winSnap('e-05-edit-html-dependent');
            await loc(page, 'Galley "Edit" window (HTML): Dependent Files grid #dependentFilesGridDiv', top().locator('#dependentFilesGridDiv'));
            await formCancel();
            // Create New Galley: no Dependent Files (control)
            await addGalley();
            out.createDep = (await winInfo()).dependentFiles;
            await formCancel();
            fact('edit', out);
        });

        // ============================================================ lang (q11, Settings bullet 3, Rule 6 language)
        if (on('lang')) await sect('lang', async () => {
            const out = {};
            // T1 default: one language
            await as(T1.u.mg, T1.path);
            await openGalleys(T1.path, s.A);
            await addGalley();
            out.t1 = (await winSnap('l-01-t1-create-language')).fields.find((f) => f.name === 'locale');
            await formCancel();
            out.t1Grid = await languagesGrid(T1.path, 'l-02-t1-languages-grid');
            // T2: en + fr_CA
            await as(T2.u.mg, T2.path);
            out.t2Grid = await languagesGrid(T2.path, 'l-03-t2-languages-grid');
            await openGalleys(T2.path, s.E, 'l-04-t2-galleys-E');
            await addGalley();
            out.t2E = (await winSnap('l-05-t2-create-E')).fields.find((f) => f.name === 'locale');
            await fillField('label', 'French PDF');
            await galleyForm().locator('select[name="locale"]').selectOption({label: 'French'}).catch(async () => {
                const opts = await galleyForm().locator('select[name="locale"] option').allInnerTexts();
                const fr = opts.find((o) => /Fran|French/.test(o));
                if (fr) await galleyForm().locator('select[name="locale"]').selectOption({label: fr.trim()});
            });
            await formSave();
            if ((await wizState()).open) await wizClose('close');
            out.t2Eafter = await openGalleys(T2.path, s.E, 'l-06-t2-after-french');
            // Rule 6: change the PDF galley's language and label, the row at once
            await rowMenu('PDF', 'Edit'); await waitForm();
            await fillField('label', 'PDF FR');
            const fr = (await galleyForm().locator('select[name="locale"] option').allInnerTexts()).find((o) => /Fran|French/.test(o));
            if (fr) await galleyForm().locator('select[name="locale"]').selectOption({label: fr.trim()});
            const t0 = Date.now();
            const sv = await formSave();
            const now = await pageInfo();
            out.editLang = {...sv, rowsAtOnce: (now.rows || []).map((r) => r.cells.join(' | '))};
            await sleep(2500); out.editLang.noticesLater = await noticesSince(t0);
            await snap('l-07-after-language-edit', {galleys: now});
            // sF: a French submission
            await openGalleys(T2.path, s.F, 'l-08-t2-galleys-F');
            await addGalley();
            out.t2F = (await winSnap('l-09-t2-create-F')).fields.find((f) => f.name === 'locale');
            await formCancel();
            // untick French for submissions, then read the three sources
            out.untick = await languagesToggle(T2.path, 'fr_CA', 'submissionLocale', false, 'l-10-t2-untick-fr-submissions');
            await openGalleys(T2.path, s.E);
            await addGalley();
            out.afterUntickCreateE = (await winSnap('l-11-after-untick-create-E')).fields.find((f) => f.name === 'locale');
            await formCancel();
            await openGalleys(T2.path, s.E);
            await rowMenu('French PDF', 'Edit'); await waitForm();
            out.afterUntickEditFrenchGalley = (await winSnap('l-12-after-untick-edit-french-galley')).fields.find((f) => f.name === 'locale');
            await formCancel();
            await openGalleys(T2.path, s.F);
            await addGalley();
            out.afterUntickCreateF = (await winSnap('l-13-after-untick-create-F')).fields.find((f) => f.name === 'locale');
            await formCancel();
            out.retick = await languagesToggle(T2.path, 'fr_CA', 'submissionLocale', true, 'l-14-t2-retick-fr-submissions');
            // the seeded journal / server: read-only (the Languages grid only)
            await as('manager.maya', app.contextPath);
            out.pkGrid = await languagesGrid(app.contextPath, 'l-15-publicknowledge-languages-grid');
            fact('lang', out);
        });

        // ============================================================ pid (Settings bullet 1, Rule 6 tabs, 6a, A2)
        if (on('pid')) await sect('pid', async () => {
            const out = {};
            await as(T1.u.mg, T1.path);
            await openGalleys(T1.path, s.B);
            await rowMenu('PDF2', 'Edit').catch(() => rowMenu('PDF', 'Edit'));
            await waitForm();
            out.before = await winSnap('i-01-edit-before-tick');
            await formCancel();
            out.settingsBefore = await settingsMeta('i-02-settings-metadata-before');
            if (!S.pidTicked) {
                out.tick = await settingsMetaSet(['galley'], 'i-03-settings-metadata-ticked');
                S.pidTicked = true; save();
            }
            const label = (await openGalleys(T1.path, s.B)).rows.map((r) => r.cells[0]).find((c) => /^PDF/.test(c)) || 'PDF';
            await rowMenu(label, 'Edit'); await waitForm();
            out.after = await winSnap('i-04-edit-after-tick');
            await loc(page, 'Galley "Edit" window: tab "Identifiers"', top().getByRole('tab', {name: 'Identifiers'}));
            // 6a: change the label, move to "Identifiers": the question; first answer Cancel, then OK
            await fillField('label', `${label} changed`);
            dialogAnswer = 'dismiss';
            const t0 = Date.now();
            await top().getByRole('tab', {name: 'Identifiers'}).click();
            await sleep(1200); await idle(page);
            out.tabSwitchDismiss = {dialogs: dialogsSince(t0), tabs: (await winInfo()).tabs};
            await snap('i-05-tab-switch-dismissed', {tabSwitch: out.tabSwitchDismiss});
            dialogAnswer = 'accept';
            const t1 = Date.now();
            await top().getByRole('tab', {name: 'Identifiers'}).click();
            await sleep(1500); await idle(page);
            out.tabSwitchAccept = {dialogs: dialogsSince(t1), tabs: (await winInfo()).tabs};
            await snap('i-06-tab-switch-accepted', {tabSwitch: out.tabSwitchAccept});
            await top().getByRole('tab', {name: 'Edit Metadata'}).click();
            await sleep(1200); await idle(page);
            out.backToMeta = await winSnap('i-07-back-to-edit-metadata');
            dialogAnswer = 'dismiss';
            // A2: change, header Close
            await fillField('label', `${label} closed`);
            const t2 = Date.now();
            await headerClose();
            out.closeChanged = {dialogs: dialogsSince(t2), posts: postsSince(t2), open: await galleyForm().isVisible().catch(() => false)};
            out.afterClose = await openGalleys(T1.path, s.B, 'i-08-after-close-changed');
            // Save with the tab present: closes, row at once
            await rowMenu(label, 'Edit'); await waitForm();
            await fillField('label', 'PDF3');
            const sv = await formSave();
            out.saveWithTab = {...sv, rowsAtOnce: ((await pageInfo()).rows || []).map((r) => r.cells.join(' | '))};
            await snap('i-09-after-save-with-tab');
            // Create New Galley with the setting on: tabs?
            await openGalleys(T1.path, s.B);
            await addGalley();
            out.createWithPid = await winSnap('i-10-create-with-pid-on');
            await formCancel();
            fact('pid', out);
        });


        // ============================================================ lang2 (q11's other ends: the UI language, the submission-language grid)
        if (on('lang2')) await sect('lang2', async () => {
            const out = {};
            const localeOf = async (name) => (await winSnap(name)).fields.find((f) => f.name === 'locale');
            await as(T2.u.mg, T2.path);
            out.t2Grids = await languagesGrid(T2.path, 'l2-01-t2-languages-grids');
            // the UI in French: what does "Add galley" preselect on the English and on the French submission?
            for (const [k, sub] of [['E', s.E], ['F', s.F]]) {
                await page.goto(app.url(`/index.php/${T2.path}/fr_CA/dashboard/editorial?workflowSubmissionId=${sub.id}&workflowMenuKey=publication_${sub.pub}_galleys`));
                await idle(page);
                await gm().waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page); await sleep(400);
                out[`frUi${k}Lang`] = await page.evaluate(() => document.documentElement.lang).catch(() => null);
                await snap(`l2-02-fr-ui-galleys-${k}`);
                const add = page.getByRole('button', {name: /Ajouter|Add galley|galley|épreuve/i}).last();
                const addBtn = gm().locator('xpath=ancestor-or-self::*[1]').locator('..').getByRole('button').last();
                const bottom = page.locator('[data-cy="galley-manager"] button').last();
                await bottom.click().catch(async () => { await add.click(); });
                await waitForm().catch(() => {});
                out[`frUiCreate${k}`] = await localeOf(`l2-03-fr-ui-create-${k}`);
                await formCancel();
            }
            // back to English UI
            await page.goto(app.url(`/index.php/${T2.path}/en/dashboard/editorial`)).catch(() => {});
            await idle(page);
            // untick French in "Submissions", read the three sources, tick again
            out.untick = await languagesToggle(T2.path, 'fr_CA', 'submissionLocale', false, 'l2-04-t2-untick-fr-submissions');
            await openGalleys(T2.path, s.E);
            await addGalley();
            out.afterUntickCreateE = await localeOf('l2-05-after-untick-create-E');
            await formCancel();
            await openGalleys(T2.path, s.E);
            await rowMenu('French PDF', 'Edit'); await waitForm();
            out.afterUntickEditFrenchGalley = await localeOf('l2-06-after-untick-edit-french-galley');
            await formCancel();
            await openGalleys(T2.path, s.F);
            await addGalley();
            out.afterUntickCreateF = await localeOf('l2-07-after-untick-create-F');
            await formCancel();
            out.retick = await languagesToggle(T2.path, 'fr_CA', 'submissionLocale', true, 'l2-08-t2-retick-fr-submissions');
            // T1 (a new journal / server): its submission-language grid, then French ticked there if the grid lists it
            await as(T1.u.mg, T1.path);
            out.t1Grids = await languagesGrid(T1.path, 'l2-09-t1-languages-grids');
            const frRow = (out.t1Grids.submission && out.t1Grids.submission.rows || []).find((r) => /fr_CA|Fran/.test(r.text));
            out.t1HasFrenchRow = !!frRow;
            if (frRow) {
                out.t1Tick = await languagesToggle(T1.path, 'fr_CA', 'submissionLocale', true, 'l2-10-t1-tick-fr-submissions');
                await openGalleys(T1.path, s.A);
                await addGalley();
                out.t1AfterTick = await localeOf('l2-11-t1-after-tick-create');
                await formCancel();
                out.t1Untick = await languagesToggle(T1.path, 'fr_CA', 'submissionLocale', false, 'l2-12-t1-untick-fr-submissions');
            }
            fact('lang2', out);
        });

        // ============================================================ lang3 (the preselected language's axis: the primary language; a new journal adding French)
        if (on('lang3')) await sect('lang3', async () => {
            const out = {};
            const localeOf = async (name) => (await winSnap(name)).fields.find((f) => f.name === 'locale');
            // T1: "Add/Remove Languages" › French › Save; then the "Language" list
            await as(T1.u.mg, T1.path);
            await languagesGrid(T1.path, 'l3-01-t1-grids-before');
            const addLink = page.locator('#submissionLanguageGridContainer a').filter({hasText: 'Add/Remove Languages'}).first();
            await loc(page, 'Settings › Website › Setup › Languages: "Submission Languages" grid "Add/Remove Languages"', addLink);
            await addLink.click();
            const f = page.locator('form#addLanguageForm').first();
            await f.waitFor({timeout: T}).catch(() => {});
            await idle(page); await sleep(400);
            out.addWindow = await winSnap('l3-02-t1-add-remove-languages');
            const fr = f.locator('input[type=checkbox][value="fr_CA"]').first();
            out.frBox = await fr.count();
            if (out.frBox) {
                if (!(await fr.isChecked())) await fr.click();
                const t0 = Date.now();
                await f.getByRole('button', {name: 'Save', exact: true}).or(f.getByRole('button', {name: /Save|Add/})).first().click();
                await sleep(1500); await idle(page);
                out.addNotices = await noticesSince(t0);
            }
            out.t1After = await languagesGrid(T1.path, 'l3-03-t1-grids-after-add');
            await openGalleys(T1.path, s.A);
            await addGalley();
            out.t1CreateAfterAdd = await localeOf('l3-04-t1-create-after-add');
            await formCancel();
            // T2: French made the primary language (UI grid), then "Add galley" on the English submission
            await as(T2.u.mg, T2.path);
            out.t2Before = await languagesGrid(T2.path, 'l3-05-t2-grids-before');
            const formsBox = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-formLocale"]').first();
            if (await formsBox.count() && !(await formsBox.isChecked())) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /language/.test(r.url()), {timeout: 10000}).catch(() => null);
                await formsBox.click(); await w; await idle(page); await sleep(800);
            }
            const primary = page.locator('#languageGridContainer input[id*="fr_CA-contextPrimary"]').first();
            if (await primary.count()) {
                const t1 = Date.now();
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /language/.test(r.url()), {timeout: 15000}).catch(() => null);
                await primary.click();
                const r = await w; await idle(page); await sleep(1500);
                out.primaryFr = {status: r && r.status(), dialogs: dialogsSince(t1), notices: await noticesSince(t1)};
            }
            out.t2AfterPrimary = await languagesGrid(T2.path, 'l3-06-t2-grids-primary-fr');
            for (const [k, sub] of [['E', s.E], ['F', s.F]]) {
                await page.goto(app.url(`/index.php/${T2.path}/en/dashboard/editorial?workflowSubmissionId=${sub.id}&workflowMenuKey=publication_${sub.pub}_galleys`));
                await idle(page); await gm().waitFor({state: 'visible', timeout: T}).catch(() => {}); await idle(page); await sleep(300);
                await page.locator('[data-cy="galley-manager"] button').last().click();
                await waitForm().catch(() => {});
                out[`primaryFrCreate${k}`] = await localeOf(`l3-07-primary-fr-create-${k}`);
                await formCancel();
            }
            // back: English primary
            await languagesGrid(T2.path, 'l3-08-t2-grids-before-revert');
            const enPrimary = page.locator('#languageGridContainer input[id*="en-contextPrimary"]').first();
            if (await enPrimary.count()) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /language/.test(r.url()), {timeout: 15000}).catch(() => null);
                await enPrimary.click(); await w; await idle(page); await sleep(1200);
            }
            out.t2Reverted = await languagesGrid(T2.path, 'l3-09-t2-grids-reverted');
            fact('lang3', out);
        });

        // ============================================================ lang4 (T1 after lang3 added French: tick "Submissions", read the list, untick)
        if (on('lang4')) await sect('lang4', async () => {
            const out = {};
            const localeOf = async (name) => (await winSnap(name)).fields.find((f) => f.name === 'locale');
            await as(T1.u.mg, T1.path);
            out.tick = await languagesToggle(T1.path, 'fr_CA', 'submissionLocale', true, 'l4-01-t1-tick-fr-submissions');
            await openGalleys(T1.path, s.A);
            await addGalley();
            out.afterTick = await localeOf('l4-02-t1-create-after-tick');
            await formCancel();
            out.untick = await languagesToggle(T1.path, 'fr_CA', 'submissionLocale', false, 'l4-03-t1-untick-fr-submissions');
            fact('lang4', {tick: out.tick.status, afterTick: out.afterTick, untick: out.untick.status});
        });

        // ============================================================ close2 (A2's other ends: no blur before "Close"; "OK" on the question)
        if (on('close2')) await sect('close2', async () => {
            const out = {};
            await as(T1.u.mg, T1.path);
            const label = (await openGalleys(T1.path, s.B)).rows.map((r) => r.cells[0]).find((c) => /^PDF/.test(c)) || 'PDF';
            out.label = label;
            // 1: type into the box and press the header "Close" straight away (no blur of our own)
            await rowMenu(label, 'Edit'); await waitForm();
            await galleyForm().locator('input[name="label"]').click();
            await page.keyboard.type('X');
            dialogAnswer = 'dismiss';
            const t0 = Date.now();
            await top().getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(1200); await idle(page);
            out.noBlurDismiss = {dialogs: dialogsSince(t0), open: await galleyForm().isVisible().catch(() => false)};
            await snap('c2-01-close-no-blur-dismissed', {close: out.noBlurDismiss});
            // 2: the same question answered "OK"
            dialogAnswer = 'accept';
            const t1 = Date.now();
            if (out.noBlurDismiss.open) await top().getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(1200); await idle(page);
            dialogAnswer = 'dismiss';
            out.accept = {dialogs: dialogsSince(t1), open: await galleyForm().isVisible().catch(() => false), posts: postsSince(t1)};
            out.afterAccept = await openGalleys(T1.path, s.B, 'c2-02-after-close-accepted');
            // 3: a select changed (Language has one entry here), the remote box ticked, then "Close"
            await rowMenu(label, 'Edit'); await waitForm();
            await tickRemote(true);
            const t2 = Date.now();
            await top().getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(1200); await idle(page);
            out.boxClose = {dialogs: dialogsSince(t2), open: await galleyForm().isVisible().catch(() => false)};
            await snap('c2-03-close-after-box', {close: out.boxClose});
            if (out.boxClose.open) { dialogAnswer = 'accept'; await top().getByRole('button', {name: 'Close', exact: true}).first().click(); await sleep(1200); dialogAnswer = 'dismiss'; }
            // 4: the Edit window's "Cancel" after a change (no question expected per 2a's wording)
            await openGalleys(T1.path, s.B);
            await rowMenu(label, 'Edit'); await waitForm();
            await fillField('label', `${label} cancel`);
            const t3 = Date.now();
            await formCancel();
            out.cancelChanged = {dialogs: dialogsSince(t3), open: await galleyForm().isVisible().catch(() => false), posts: postsSince(t3)};
            out.afterCancel = await openGalleys(T1.path, s.B, 'c2-04-after-cancel-changed');
            fact('close2', out);
        });

        // ============================================================ urn (Settings bullet 2) — OJS; OPS: the Plugins grid control
        if (on('urn')) await sect('urn', async () => {
            const out = {};
            await as(T1.u.mg, T1.path);
            out.t1Plugins = await pluginsUrnRow(T1.path, 'n-01-t1-plugins');
            if (isOJS) {
                await as(T3.u.mg, T3.path);
                out.t3Plugins = await pluginsUrnRow(T3.path, 'n-02-t3-plugins');
                out.t3Settings = await urnSettingsBoxes(T3.path, 'n-03-t3-urn-settings');
                await openGalleys(T3.path, s.U);
                await rowMenu('PDF', 'Edit'); await waitForm();
                out.t3Edit = await winSnap('n-04-t3-edit-galley-urn-galleys');
                await formCancel();
                await as(T2.u.mg, T2.path);
                out.t2Settings = await urnSettingsBoxes(T2.path, 'n-05-t2-urn-settings');
                await openGalleys(T2.path, s.E);
                const lbl = (await pageInfo()).rows.map((r) => r.cells[0]).find((c) => /^PDF/.test(c)) || 'PDF';
                await rowMenu(lbl, 'Edit'); await waitForm();
                out.t2Edit = await winSnap('n-06-t2-edit-galley-urn-articles-only');
                await formCancel();
            }
            fact('urn', out);
        });

        // ============================================================ levels: the window per permission level; OJS controls
        if (on('levels')) await sect('levels', async () => {
            const out = {};
            const who = isOJS ? [['se', T1.u.se], ['le', T1.u.le], ['au', T1.u.au]] : [['se', T1.u.se], ['au', T1.u.au]];
            for (const [k, u] of who) {
                await as(u, T1.path);
                const author = k === 'au';
                const sub = isOPS && author ? s.Au : s.B;
                out[k] = {page: await openGalleys(T1.path, sub, `v-01-${k}-galleys`, {author})};
                const firstRow = (out[k].page.rows || [])[0];
                if (firstRow) {
                    out[k].menu = await rowMenu(firstRow.cells[0]);
                    const item = out[k].menu.items.includes('Edit') ? 'Edit' : (out[k].menu.items.includes('View') ? 'View' : null);
                    if (item) {
                        await rowMenu(firstRow.cells[0], item); await waitForm();
                        out[k].edit = await winSnap(`v-02-${k}-${item.toLowerCase()}`);
                        await formCancel();
                        if ((await galleyForm().isVisible().catch(() => false))) await headerClose();
                    }
                }
                if (await page.getByRole('button', {name: 'Add galley', exact: true}).count()) {
                    await openGalleys(T1.path, isOPS && author ? s.Au : s.A, null, {author});
                    await addGalley();
                    out[k].create = await winSnap(`v-03-${k}-create`);
                    await formCancel();
                }
            }
            if (isOJS) {
                // a section editor assigned with "Permissions" unticked: the window stays editable?
                await as(T1.u.se, T1.path);
                out.seNoPerm = {page: await openGalleys(T1.path, s.K, 'v-04-se-noperm-galleys')};
                out.seNoPerm.menu = await rowMenu('PDF');
                await rowMenu('PDF', 'Edit'); await waitForm();
                out.seNoPerm.edit = await winSnap('v-05-se-noperm-edit');
                await fillField('label', 'PDF by SE');
                out.seNoPerm.save = await formSave();
                if (out.seNoPerm.save.stillOpen) { await winSnap('v-06-se-noperm-save-refused'); await formCancel(); }
                out.seNoPerm.after = await openGalleys(T1.path, s.K, 'v-07-se-noperm-after');
            }
            fact('levels', out);
        });

        // ============================================================ moderator (OPS q3, Rule 7's Moderator)
        if (on('moderator') && isOPS) await sect('moderator', async () => {
            const out = {};
            await as(T1.u.se, T1.path);
            out.page = await openGalleys(T1.path, s.M, 'm-01-moderator-noperm-galleys');
            out.menu = await rowMenu('PDF');
            await rowMenu('PDF', 'Edit'); await waitForm();
            out.edit = await winSnap('m-02-moderator-noperm-edit');
            await formCancel(); if (await galleyForm().isVisible().catch(() => false)) await headerClose();
            // Add galley › HTML2 › Save
            await openGalleys(T1.path, s.M);
            await addGalley();
            out.create = await winSnap('m-03-moderator-noperm-create');
            await fillField('label', 'HTML2');
            const sv = await formSave();
            out.createSave = {...sv, win: sv.stillOpen ? await winSnap('m-04-moderator-noperm-create-refused') : null, wizard: (await wizState()).open};
            if ((await wizState()).open) await wizClose('close');
            if (sv.stillOpen) await formCancel();
            out.afterCreate = await openGalleys(T1.path, s.M, 'm-05-after-create');
            // Order › move › Save Order › reload
            const order = page.getByRole('button', {name: 'Order', exact: true}).first();
            if (await order.count()) {
                const before = (await pageInfo()).rows.map((r) => r.cells[0]);
                await order.click(); await sleep(500);
                const ord = await pageInfo();
                await snap('m-06-ordering-mode', {galleys: ord});
                const firstRowBtns = gm().locator('tbody tr').first().locator('button');
                const n = await firstRowBtns.count();
                if (n) await firstRowBtns.nth(n > 1 ? 1 : 0).click();
                await sleep(400);
                const moved = (await pageInfo()).rows.map((r) => r.cells[0]);
                const t0 = Date.now();
                await page.getByRole('button', {name: 'Save Order', exact: true}).first().click().catch(() => {});
                await sleep(1500); await idle(page);
                const afterSave = (await pageInfo()).rows.map((r) => r.cells[0]);
                const reload = (await openGalleys(T1.path, s.M, 'm-07-order-after-reload')).rows.map((r) => r.cells[0]);
                out.order = {before, orderingButtons: ord.rows.map((r) => r.buttons), moved, afterSave, reload, posts: postsSince(t0), notices: await noticesSince(t0)};
            }
            // Change File with replacement › Complete: does the galley serve it?
            const pdfBefore = (await pageInfo()).rows.find((r) => /^PDF/.test(r.cells[0]));
            out.pdfServedBefore = await served(pdfBefore && pdfBefore.link && pdfBefore.link.href);
            await rowMenu('PDF', 'Change File');
            out.changeFile = await wizSnap('m-08-moderator-changefile');
            await wizUpload(REPL, {genre: null});
            const pdfAfter = (await openGalleys(T1.path, s.M, 'm-09-after-changefile')).rows.find((r) => /^PDF/.test(r.cells[0]));
            out.pdfServedAfter = await served(pdfAfter && pdfAfter.link && pdfAfter.link.href);
            // Delete HTML › OK › reload
            await rowMenu('HTML', 'Delete');
            const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
            await dlg.waitFor({timeout: 15000}).catch(() => {});
            const t1 = Date.now();
            await dlg.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await sleep(1500); await idle(page);
            out.delete = {posts: postsSince(t1), notices: await noticesSince(t1)};
            out.afterDelete = await openGalleys(T1.path, s.M, 'm-10-after-delete-reload');
            // a Moderator with "Permissions" ticked (control)
            out.withPerm = {page: await openGalleys(T1.path, s.M2, 'm-11-moderator-perm-galleys')};
            await rowMenu('PDF', 'Edit'); await waitForm();
            out.withPerm.edit = await winSnap('m-12-moderator-perm-edit');
            await formCancel();
            // post (manager), then the no-permission Moderator's Edit › Save
            await as(T1.u.mg, T1.path);
            out.post = await publishOnScreen(T1.path, s.M, 'm-13-posted');
            await as(T1.u.se, T1.path);
            out.postedPage = await openGalleys(T1.path, s.M, 'm-14-posted-moderator-galleys');
            out.postedMenu = await rowMenu('PDF');
            await rowMenu('PDF', 'Edit'); await waitForm();
            out.postedEdit = await winSnap('m-15-posted-moderator-edit');
            const lblBox = galleyForm().locator('input[name="label"]');
            if (await lblBox.isEditable().catch(() => false)) {
                await fillField('label', 'PDF posted');
                out.postedSave = await formSave();
                if (out.postedSave.stillOpen) { out.postedSaveWin = await winSnap('m-16-posted-save-refused'); await formCancel(); }
                out.postedAfter = await openGalleys(T1.path, s.M, 'm-17-posted-after-save');
            } else { out.postedLabelEditable = false; await headerClose(); }
            fact('moderator', out);
        });

        // ============================================================ author (OPS q4, Rule 7's "View"; OJS control)
        if (on('author')) await sect('author', async () => {
            const out = {};
            if (isOPS) {
                // Identifiers for galleys on (T1, phase pid) makes the tab's read-only state visible
                await as(T1.u.au, T1.path);
                out.posted = {page: await openGalleys(T1.path, s.P, 'o-01-author-posted-galleys', {author: true})};
                out.posted.menu = await rowMenu('PDF');
                await rowMenu('PDF', 'View'); await waitForm();
                out.posted.view = await winSnap('o-02-author-posted-view');
                await loc(page, 'Galley "View" window (Author, posted)', top());
                const idTab = top().getByRole('tab', {name: 'Identifiers'});
                if (await idTab.count()) {
                    await idTab.click(); await sleep(1500); await idle(page);
                    out.posted.idTab = await top().evaluate((d) => {
                        const v = (e) => e && e.getClientRects().length > 0;
                        const f = [...d.querySelectorAll('form')].filter(v).pop();
                        return f ? {id: f.id, inputs: [...f.querySelectorAll('input:not([type=hidden]), button, select')].filter(v).map((e) => ({name: e.name, type: e.type, disabled: e.disabled, text: (e.innerText || e.value || '').trim().slice(0, 40)})), text: f.innerText.replace(/\s+/g, ' ').slice(0, 600)} : null;
                    });
                    await snap('o-03-author-posted-view-identifiers', {idTab: out.posted.idTab});
                }
                await headerClose();
                // the Author with the permission off, unposted (T3)
                await as(T3.u.au, T3.path);
                out.noPerm = {page: await openGalleys(T3.path, s.U, 'o-04-author-noperm-galleys', {author: true})};
                out.noPerm.menu = await rowMenu('PDF');
                if (out.noPerm.menu.items.includes('View')) {
                    await rowMenu('PDF', 'View'); await waitForm();
                    out.noPerm.view = await winSnap('o-05-author-noperm-view');
                    await headerClose();
                }
                // the Author who may edit (T1 sAu): the other end
                await as(T1.u.au, T1.path);
                out.mayEdit = {page: await openGalleys(T1.path, s.Au, 'o-06-author-mayedit-galleys', {author: true})};
                out.mayEdit.menu = await rowMenu('PDF');
            } else {
                await as(T1.u.au, T1.path);
                out.ojsAuthor = {page: await openGalleys(T1.path, s.B, 'o-07-ojs-author-galleys', {author: true})};
                const r0 = (out.ojsAuthor.page.rows || [])[0];
                out.ojsAuthor.firstRowButtons = r0 && r0.buttons;
            }
            fact('author', out);
        });

        // ============================================================ wizgrid (OPS): the submission wizard's legacy galley list
        if (on('wizgrid') && isOPS) await sect('wizgrid', async () => {
            const out = {};
            await as(T1.u.au, T1.path);
            await page.goto(app.url(`/index.php/${T1.path}/submission?id=${s.D.id}`)); await idle(page);
            const grid = page.locator('#galleysGridUrl, [id^="component-grid-preprintgalleys"]').first();
            await grid.waitFor({timeout: T}).catch(() => {});
            await idle(page); await sleep(800);
            out.step = await snap('w-01-wizard-upload-files');
            await loc(page, 'OPS submission wizard: galley grid "Add File" link', page.getByRole('link', {name: 'Add File', exact: true}));
            await page.getByRole('link', {name: 'Add File', exact: true}).first().click();
            await waitForm();
            out.add = await winSnap('w-02-wizard-add-file-window');
            await fillField('label', 'Remote');
            await tickRemote(true);
            await fillField('urlRemote', 'https://example.org/wiz');
            out.save = await formSave();
            out.afterSave = {wizard: await wizState()};
            await snap('w-03-wizard-after-remote-save', out.afterSave);
            if (out.afterSave.wizard.open) await wizClose('close');
            await sleep(800); await idle(page);
            const row = page.locator('tr.gridRow').filter({hasText: 'Remote'}).first();
            const extras = row.locator('a.show_extras').first();
            if (await extras.count()) { await extras.click(); await sleep(500); }
            out.rowActions = await page.locator('tr.gridRow').filter({hasText: 'Remote'}).first().locator('xpath=following-sibling::tr[1]').locator('a:visible').allInnerTexts().catch(() => []);
            out.rowText = flat(await row.innerText().catch(() => null), 300);
            await snap('w-04-wizard-remote-row', {rowActions: out.rowActions});
            const edit = page.locator('tr.gridRow').filter({hasText: 'Remote'}).first().locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).first();
            if (await edit.count()) {
                await edit.click(); await waitForm();
                out.edit = await winSnap('w-05-wizard-edit-window');
                await formCancel();
            }
            // a file galley in the same list: "PDF" › Save → does the wizard's upload follow?
            await page.getByRole('link', {name: 'Add File', exact: true}).first().click();
            await waitForm();
            await fillField('label', 'PDF');
            await formSave();
            await sleep(1500);
            out.fileGalley = {wizard: await wizState()};
            await snap('w-06-wizard-file-galley-after-save', out.fileGalley);
            if (out.fileGalley.wizard.open) await wizClose('close');
            fact('wizgrid', out);
        });

        // ============================================================ recheck (OPS): K2-5 and K2-8 seen a second time, on a fresh unposted preprint
        if (on('recheck') && isOPS) await sect('recheck', async () => {
            const out = {};
            if (!s.M3) {
                const r = await app.api.createSubmission({tag: `${S.t}sm3`, context: T1.path, submitter: T1.u.au, title: `K2 sm3 ${S.t}`, participants: [{username: T1.u.se, role: 'sectionEditor', canChangeMetadata: false}], galleys: [{label: 'PDF', file: PDFNAME}]});
                s.M3 = {id: r.submissionId, pub: r.publicationId}; save();
            }
            await as(T1.u.se, T1.path);
            await openGalleys(T1.path, s.M3, 'k-01-moderator-noperm-galleys');
            await rowMenu('PDF', 'Edit'); await waitForm();
            const e = await winSnap('k-02-moderator-noperm-edit');
            out.edit = {title: e.title, disabled: e.fields.map((f) => f.disabled), save: await top().getByRole('button', {name: 'Save', exact: true}).last().isDisabled().catch(() => null), cancel: await top().getByRole('link', {name: 'Cancel', exact: true}).count()};
            await headerClose();
            await openGalleys(T1.path, s.M3);
            await addGalley();
            await fillField('label', 'EPUB');
            const sv = await formSave();
            const w = sv.stillOpen ? await winSnap('k-03-moderator-noperm-create-refused') : null;
            out.create = {open: sv.stillOpen, posts: sv.posts, notices: sv.notices, text: w && w.text, disabled: w && w.fields.map((f) => f.disabled), save: await galleyForm().getByRole('button', {name: 'Save', exact: true}).last().isDisabled().catch(() => null), cancel: await galleyForm().getByRole('link', {name: 'Cancel', exact: true}).count().catch(() => null), wizard: (await wizState()).open};
            if ((await wizState()).open) await wizClose('close');
            if (sv.stillOpen) await headerClose();
            out.after = (await openGalleys(T1.path, s.M3, 'k-04-after-create')).rows.map((r) => r.cells[0]);
            await as(T3.u.au, T3.path);
            await openGalleys(T3.path, s.U, null, {author: true});
            await rowMenu('PDF', 'View'); await waitForm();
            const v = await winSnap('k-05-author-noperm-view');
            out.view = {title: v.title, save: await top().getByRole('button', {name: 'Save', exact: true}).last().isDisabled().catch(() => null), cancel: await top().getByRole('link', {name: 'Cancel', exact: true}).count()};
            fact('recheck', out);
        });

        // ============================================================ publish (q8/q9 reader, Rule 3 reader, q10 new version)
        if (on('publish')) await sect('publish', async () => {
            const out = {};
            await as(T1.u.mg, T1.path);
            if (!S.pubA) { out.pubA = await publishOnScreen(T1.path, s.A, 'x-01-publish-A'); S.pubA = true; save(); }
            out.readerA = await readerLinks(T1.path, s.A.id, 'x-02-reader-A');
            for (const l of out.readerA) {
                if (/^(Remote|RemoteE|RemoteW|RemoteX|PDF)$/.test(l.text.replace(/\s*\(.*\)$/, ''))) out[`follow-${l.text}`] = await follow(l.href, `x-03-follow-${l.text.replace(/[^a-z0-9]+/gi, '_')}`);
            }
            // sV: publish, new version, the copy's URL Path
            const V = s.V2 || s.V;
            const VK = s.V2 ? 'V2' : 'V';
            if (!S[`pub${VK}`]) { out.pubV = await publishOnScreen(T1.path, V, `x-04-publish-${VK}`); S[`pub${VK}`] = true; save(); }
            if (!S[`vNew${VK}`]) {
                await page.goto(wfUrl(T1.path, V.id, `publication_${V.pub}_titleAbstract`)); await idle(page); await sleep(800);
                out.version = await createNewVersion(`x-05-new-version-${VK}`);
                S[`vNew${VK}`] = out.version.newPub; save();
            }
            if (S[`vNew${VK}`]) {
                out.vFirst = await openGalleys(T1.path, V, `x-05b-first-version-galleys-${VK}`);
                await rowMenu('PDF', 'Edit'); await waitForm();
                out.vFirstEdit = await winSnap(`x-05c-first-version-edit-${VK}`);
                await headerClose();
                out.vPage = await openGalleys(T1.path, V, `x-06-new-version-galleys-${VK}`, {pub: S[`vNew${VK}`]});
                await rowMenu('PDF', 'Edit'); await waitForm();
                out.vEdit = await winSnap('x-07-new-version-edit');
                await fillField('urlPath', 'pdf');
                const sv = await formSave();
                out.vSave = {...sv, win: sv.stillOpen ? await winSnap(`x-08-new-version-refused-${VK}`) : null};
                if (sv.stillOpen) await formCancel();
                await openGalleys(T1.path, V, null, {pub: S[`vNew${VK}`]}); await rowMenu('PDF', 'Edit'); await waitForm();
                out.vReopen = await winSnap(`x-09-new-version-reopened-${VK}`);
                await formCancel();
            }
            fact('publish', out);
        });
    } finally {
        await close();
    }

    // ---------------------------------------------------------------- settings helpers (hoisted)
    async function languagesGrid(ctx, name) {
        await page.goto(app.url(`/index.php/${ctx}/management/settings/website`)); await idle(page);
        const setupTab = page.locator('#setup-button').first();
        if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click().catch(() => {});
        await page.getByRole('tab', {name: 'Languages', exact: true}).first().click().catch(() => {}); await idle(page);
        await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000}).catch(() => {});
        await sleep(400);
        await page.locator('#submissionLanguageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000}).catch(() => {});
        const readGrid = (c) => ({
            head: [...c.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
            title: ((c.querySelector('h4') || {}).innerText || '').trim() || null,
            actions: [...c.querySelectorAll('a')].filter((a) => a.getClientRects().length && /add/i.test(a.id + a.className + a.innerText)).map((a) => a.innerText.trim()).filter(Boolean),
            rows: [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox], input[type=radio]')].map((b) => ({id: b.id.replace(/[0-9a-f]{10,}$/, ''), checked: b.checked, disabled: b.disabled}))}))});
        const grid = await page.locator('#languageGridContainer').evaluate(readGrid).catch((e) => ({error: String(e.message)}));
        grid.submission = await page.locator('#submissionLanguageGridContainer').evaluate(readGrid).catch((e) => ({error: String(e.message)}));
        await snap(name, {grid});
        return grid;
    }
    async function languagesToggle(ctx, locale, column, want, name) {
        await languagesGrid(ctx, `${name}-before`);
        const box = page.locator(`#languageGridContainer input[type=checkbox][id*="${locale}-${column}"], #submissionLanguageGridContainer input[type=checkbox][id*="${locale}-${column}"]`).first();
        const out = {found: (await box.count()) > 0};
        if (out.found && (await box.isChecked()) !== want) {
            const t0 = Date.now();
            const w = page.waitForResponse((r) => r.request().method() === 'POST' && /language/.test(r.url()), {timeout: 10000}).catch(() => null);
            await box.click();
            const r = await w; await idle(page); await sleep(800);
            out.status = r && r.status(); out.dialogs = dialogsSince(t0); out.notices = await noticesSince(t0);
        }
        out.grid = await languagesGrid(ctx, name);
        return out;
    }
    async function settingsMeta(name) {
        await page.goto(app.url(`/index.php/${T1.path}/management/settings/workflow`)); await idle(page);
        await page.locator('#metadata-button').click(); await idle(page);
        const group = page.getByRole('group', {name: 'Publisher ID'});
        await group.waitFor({timeout: T});
        const boxes = await group.getByRole('checkbox').evaluateAll((els) => els.map((b) => ({label: (b.closest('label')?.innerText || '').trim(), value: b.value, checked: b.checked})));
        await snap(name, {boxes, groupText: flat(await group.innerText())});
        await loc(page, 'Settings › Workflow › Submission › Metadata: group "Publisher ID"', group);
        return {boxes};
    }
    async function settingsMetaSet(values, name) {
        await settingsMeta(`${name}-before`);
        const group = page.getByRole('group', {name: 'Publisher ID'});
        const form = page.locator('form').filter({has: group});
        const boxes = group.getByRole('checkbox');
        for (let i = 0; i < await boxes.count(); i++) {
            const b = boxes.nth(i);
            const want = values.includes(await b.getAttribute('value'));
            if ((await b.isChecked()) !== want) await b.click();
        }
        const r = page.waitForResponse((x) => /\/api\/v1\/contexts\/\d+$/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await r;
        const st = await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 10000}).then(() => 'Saved').catch(() => null);
        const back = await settingsMeta(name);
        return {status: resp && resp.status(), inline: st, boxes: back.boxes};
    }
    async function pluginsUrnRow(ctx, name) {
        await page.goto(app.url(`/index.php/${ctx}/management/settings/website`)); await idle(page);
        await page.locator('#plugins-button').click();
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(400);
        const data = await page.locator('#pluginGridContainer').evaluate((root) => {
            const rows = [...root.querySelectorAll('tr.gridRow')];
            const urn = rows.find((r) => /-row-urnpubidplugin$/.test(r.id));
            const pubIds = rows.filter((r) => /pubIds/i.test(r.id)).map((r) => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 120));
            return {urnRow: urn ? {text: urn.innerText.replace(/\s+/g, ' ').trim().slice(0, 200), checked: urn.querySelector('input[type=checkbox]')?.checked ?? null} : null, pubIds, rowCount: rows.length};
        }).catch((e) => ({error: String(e.message)}));
        await snap(name, {plugins: data});
        return data;
    }
    async function urnSettingsBoxes(ctx, name) {
        await pluginsUrnRow(ctx, `${name}-grid`);
        const row = page.locator('#pluginGridContainer tr.gridRow[id$="-row-urnpubidplugin"]');
        const ex = row.locator('a.show_extras').first();
        if (await ex.count()) { await ex.click(); await sleep(400); }
        await page.locator('#pluginGridContainer tr[id$="-row-urnpubidplugin"] + tr').getByRole('link', {name: 'Settings', exact: true}).first().click();
        const form = page.locator('form#urnSettingsForm, form[id^="urnSettingsForm"]').first();
        await form.waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(500);
        const boxes = await form.locator('input[type=checkbox]').evaluateAll((els) => els.map((b) => ({name: b.name, checked: b.checked, label: (b.closest('li, label')?.innerText || '').trim().slice(0, 80)}))).catch(() => []);
        await snap(name, {boxes});
        await headerClose();
        return boxes;
    }
});
