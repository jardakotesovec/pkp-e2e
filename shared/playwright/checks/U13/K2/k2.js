// U13 claim check, chunk K2: galleys, readers and addresses {OJS OPS}, with read-only controls on OMP.
// Spec: docs/specs/U13-article-landing-page-and-reading.md — the PDF and HTML reader pages (110–127), Rule 1
// (184–191), Rules 10–13 (242–288), Settings 1–3 (386–395), Settings 11 (424–431), register A2, OPS2–OPS5;
// footnotes d, e, f, o, q2, q7, q8, q9, q10, q16, f-a2, f-ops2, f-ops3, f-ops4, f-ops5.
//
//   PROBE_FEATURE=U13 PROBE_AGENT=ccK2 node bin/probe.js ojs shared/playwright/checks/U13/K2/k2.js
//   PHASES=seed,plugins,components,lists,open,vprep,vread,vd,ve,vf,opsxml,omp   (default: all; later phases read
//   k2-state-<app>.json, so a phase can be re-run alone). A full run outlasts the Bash cap: run one app
//   and a few phases per process.
//
// Scratch contexts per app (OJS, OPS):
//   G  interface and submission languages en + fr_CA; OJS one published issue Vol. 1 No. 1 (2026).
//      Users mg manager, se sectionEditor (Moderator), au author (submitter), rd reader.
//      L  lists (q7): PDF, Data (Data Set), Notes (Other), HTML in French, Remote; unpublished; "Draft"
//         added on screen with its upload wizard closed; published on screen (OJS into the issue).
//      O  opening (q8, q10): PDF (URL Path "pdf"), HTML, Text (a .md / .txt file), Remote, OJS XML (the
//         JATS fixture), HTML in French (URL Path "html-fr"); published.
//      VA older versions (q9): PDF + HTML, published; new version on screen, title changed, published.
//      VB the same with the PDF's URL Path "pdf" kept into the new version (q9's second half, A2's end).
//      VC PDF URL Path "pdf", changed to "pdfnew" on the new version before it is published (Rule 13).
//      P  addresses (q2, OPS2): PDF + HTML published; new version with URL Path "probe-path" set on screen.
//      VD, VE, VF (phases vd, ve, vf) A2's last sentence: the copy's file changed with "Change File" (PDF, HTML),
//         and a new galley "New" taking the URL Path "pdf" with a file of its own; XM (OPS, opsxml) an XML galley.
//   X  a new context with defaults (q16, Settings 1–3, Settings 11): XA published PDF, HTML, OJS XML.
//   F  component flips (Settings 11's other end, Rule 10's "other component"): FA published PDF, Data
//      (Data Set), Notes (Other).
// OMP: read-only controls on `publicknowledge` (the Plugins list) as manager.maya.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'plugins', 'components', 'lists', 'open', 'vprep', 'vread', 'vd', 've', 'vf', 'opsxml', 'omp'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

// The landing page's galley lists and side column order.
const GALLEYS = () => {
    const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const sr = (e) => !!(e && (e.classList.contains('pkp_screen_reader') || e.closest('.pkp_screen_reader')));
    const root = document.querySelector('.obj_article_details, .obj_preprint_details');
    const out = {title: document.title, lang: document.documentElement.lang, h1: [...document.querySelectorAll('h1')].map((h) => f(h.innerText))};
    out.notices = [...document.querySelectorAll('.cmp_notification')].map((n) => f(n.innerText));
    if (!root) { out.root = null; out.body = f(document.body.innerText).slice(0, 300); return out; }
    out.blocks = [...root.querySelectorAll('.item.galleys')].map((b) => {
        const h = b.querySelector('h2, h3');
        return {heading: h ? f(h.textContent) : null, headingScreenReaderOnly: h ? sr(h) : null, ulClass: b.querySelector('ul')?.className || null,
            links: [...b.querySelectorAll('a')].map((a) => ({t: f(a.innerText), h: a.getAttribute('href'), cls: a.className}))};
    });
    out.sideOrder = [...(root.querySelector('.entry_details')?.children || [])].map((c) => `${c.className}${c.querySelector('h2,h3') ? ` [${f(c.querySelector('h2,h3').textContent)}]` : ''}`);
    out.versions = [...root.querySelectorAll('.item.published .versions li')].map((li) => ({t: f(li.innerText), a: li.querySelector('a')?.getAttribute('href') || null}));
    return out;
};

// A reader page (PDF or HTML) as data.
const READER = () => {
    const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const h = document.querySelector('header.header_view');
    const ret = h && h.querySelector('a.return');
    const ti = h && h.querySelector('a.title');
    const dl = h && h.querySelector('a.download');
    const notice = document.querySelector('.galley_view_notice_message');
    const ifr = document.querySelector('.galley_view iframe');
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)}; };
    return {
        title: document.title, bodyClass: document.body.className, lang: document.documentElement.lang,
        header: h ? {rect: r(h), text: f(h.innerText)} : null,
        ret: ret ? {visibleText: f(ret.innerText), srText: f(ret.querySelector('.pkp_screen_reader')?.textContent), href: ret.getAttribute('href'), rect: r(ret)} : null,
        titleLink: ti ? {t: f(ti.innerText), href: ti.getAttribute('href')} : null,
        download: dl ? {label: f(dl.querySelector('.label')?.innerText), srText: f(dl.querySelector('.pkp_screen_reader')?.textContent), href: dl.getAttribute('href'), downloadAttr: dl.getAttribute('download')} : null,
        headerLinks: h ? [...h.querySelectorAll('a')].map((a) => ({cls: a.className, t: f(a.innerText), h: a.getAttribute('href')})) : [],
        notice: notice ? {t: f(notice.innerText), role: notice.getAttribute('role'), rect: r(notice), links: [...notice.querySelectorAll('a')].map((a) => ({t: f(a.innerText), h: a.getAttribute('href')}))} : null,
        iframe: ifr ? {title: ifr.getAttribute('title'), src: ifr.getAttribute('src'), name: ifr.getAttribute('name'), rect: r(ifr)} : null,
        viewport: {w: innerWidth, h: innerHeight},
    };
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k2-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };
    const PDF = isOPS ? 'preprint.pdf' : 'article.pdf';
    const HTML = isOPS ? 'preprint.html' : 'article.html';
    const TXT = isOPS ? 'not-an-image.txt' : 'notes.md';
    const view = isOPS ? 'preprint' : 'article';
    const strip = (u) => (u || '').replace(app.baseURL, '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded && !isOMP) {
        const t = tag('u13k2');
        S.t = t;
        const ctxBase = (p, name) => ({name: `U13 K2 ${name} ${p}`, acronym: 'KTWO', contactName: 'K2 Contact', contactEmail: `${p}c@mail.test`});
        const u = (p, k, roles, g, fam) => ({username: `${p}${k}`, roles, givenName: g, familyName: fam});
        const mk = async (key, spec, users) => {
            const p = `${t}${key}`;
            const r = await app.api.createContext({tag: p, context: ctxBase(p, key), users, ...spec});
            return {path: r.path || p, issues: r.issues || null, u: Object.fromEntries(users.map((x) => [x.username.slice(p.length), x.username]))};
        };
        const pg = `${t}g`;
        const gSpec = {context: {...ctxBase(pg, 'galleys'), supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}};
        if (isOJS) gSpec.issues = [{volume: 1, number: 1, year: 2026, published: true}];
        S.G = await mk('g', gSpec, [u(pg, 'mg', ['manager'], 'Mia', 'Manager'), u(pg, 'se', ['sectionEditor'], 'Sam', isOPS ? 'Moderator' : 'Section'), u(pg, 'au', ['author'], 'Ari', 'Author'), u(pg, 'rd', ['reader'], 'Rae', 'Reader')]);
        const px = `${t}x`;
        S.X = await mk('x', {}, [u(px, 'mg', ['manager'], 'Max', 'Manager'), u(px, 'au', ['author'], 'Axe', 'Author')]);
        const pf = `${t}f`;
        S.F = await mk('f', {}, [u(pf, 'mg', ['manager'], 'Fay', 'Manager'), u(pf, 'au', ['author'], 'Fin', 'Author')]);
        save();
        const prod = isOJS ? {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']} : {};
        const inIssue = isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {};
        const sub = async (ctx, key, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${key}`, context: ctx.path, submitter: ctx.u.au, title: `K2 ${key} ${t}`, ...spec});
                log('seed', key, r.submissionId, r.publicationId, JSON.stringify(r.galleys));
                return {id: r.submissionId, pub: r.publicationId, galleys: r.galleys, status: r.status};
            } catch (e) { log('seed FAILED', key, String(e.message).slice(0, 600)); return {error: String(e.message).slice(0, 600)}; }
        };
        const G = S.G;
        const remote = (ctx) => ({label: 'Remote', urlRemote: app.url(`/index.php/${ctx.path}/about`)});
        S.s = {};
        S.s.L = await sub(G, 'lists', {...prod, participants: [{username: G.u.se, role: 'sectionEditor'}],
            galleys: [{label: 'PDF', file: PDF}, {label: 'Data', file: PDF, genre: 'Data Set'}, {label: 'Notes', file: TXT, genre: 'Other'}, {label: 'HTML', locale: 'fr_CA', file: HTML}, remote(G)]});
        const oGalleys = [{label: 'PDF', file: PDF, urlPath: 'pdf'}, {label: 'HTML', file: HTML}, {label: 'Text', file: TXT}, remote(G)];
        if (isOJS) oGalleys.push({label: 'XML', file: 'article.xml'});
        oGalleys.push({label: 'HTML', locale: 'fr_CA', file: HTML, urlPath: 'html-fr'});
        S.s.O = await sub(G, 'open', {published: true, ...inIssue, galleys: oGalleys});
        const two = (pdfPath) => [{label: 'PDF', file: PDF, ...(pdfPath ? {urlPath: pdfPath} : {})}, {label: 'HTML', file: HTML}];
        S.s.VA = await sub(G, 'va', {published: true, ...inIssue, galleys: two()});
        S.s.VB = await sub(G, 'vb', {published: true, ...inIssue, galleys: two('pdf')});
        S.s.VC = await sub(G, 'vc', {published: true, ...inIssue, galleys: two('pdf')});
        S.s.P = await sub(G, 'paths', {published: true, ...inIssue, galleys: two()});
        const xg = [{label: 'PDF', file: PDF}, {label: 'HTML', file: HTML}];
        if (isOJS) xg.push({label: 'XML', file: 'article.xml'});
        S.s.XA = await sub(S.X, 'xa', {published: true, galleys: xg});
        S.s.FA = await sub(S.F, 'fa', {published: true, galleys: [{label: 'PDF', file: PDF}, {label: 'Data', file: PDF, genre: 'Data Set'}, {label: 'Notes', file: TXT, genre: 'Other'}]});
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!isOMP && !S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    if (isOMP && !on('omp')) return;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: strip(page.url())});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const dialogsSince = (s) => jsDialogs.filter((d) => d.at >= s);
    // Every file response the page or its frames fetch (the readers' own traffic).
    const fileTraffic = [];
    page.on('response', (r) => {
        if (!/\/(download|view)\//.test(r.url())) return;
        fileTraffic.push({at: Date.now(), url: strip(r.url()), status: r.status(), type: r.headers()['content-type'] || null, disposition: r.headers()['content-disposition'] || null, location: r.headers().location || null,
            frame: r.frame() === page.mainFrame() ? 'main' : 'frame'});
    });
    const trafficSince = (s) => fileTraffic.filter((x) => x.at >= s);
    const consoleMsgs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({at: Date.now(), type: m.type(), t: flat(m.text(), 300)}); });
    page.on('pageerror', (e) => consoleMsgs.push({at: Date.now(), type: 'pageerror', t: flat(e.message, 300)}));
    const consoleSince = (s) => consoleMsgs.filter((x) => x.at >= s);
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
    let who = 'visitor';
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); who = user; };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    const vis = '[role="dialog"]:visible';
    const wf = () => page.locator(vis).first();
    const top = () => page.locator(vis).last();
    const wfUrl = (ctx, sid, key) => app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
    const pageOf = (ctx, id, rest = '', l = 'en') => `/index.php/${ctx}${l ? `/${l}` : ''}/${view}/view/${id}${rest}`;

    // Open an address as typed: the navigation chain, the final address, the page's galley lists.
    async function typed(url, name) {
        const chain = [];
        const t0 = Date.now();
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push({url: strip(r.url()), status: r.status(), location: r.headers().location || null}); } catch (e) { /* none */ } };
        page.on('response', onResp);
        const dlP = page.waitForEvent('download', {timeout: 8000}).then((d) => d, () => null);
        const resp = await page.goto(app.url(url)).catch((e) => ({err: String(e.message).slice(0, 200)}));
        let dl = null;
        if (resp && resp.err) { dl = await dlP; }
        await idle(page).catch(() => {});
        await sleep(300);
        page.off('response', onResp);
        const data = await page.evaluate(GALLEYS).catch((e) => ({err: String(e.message).slice(0, 200)}));
        const out = {typed: url, status: resp && typeof resp.status === 'function' ? resp.status() : null, gotoErr: resp && resp.err, finalUrl: strip(page.url()), chain, who,
            title: data.title, h1: data.h1, notices: data.notices, bodyStart: flat(await page.locator('body').innerText().catch(() => ''), 200),
            download: dl ? {file: dl.suggestedFilename(), failure: await dl.failure().catch(() => null)} : null, traffic: trafficSince(t0)};
        await snap(name, {typed: out, galleys: data});
        return {...out, galleys: data};
    }
    // The landing page's galley lists, read.
    async function lists(url, name) {
        await page.goto(app.url(url)); await idle(page); await sleep(300);
        const g = await page.evaluate(GALLEYS);
        await snap(name, {galleys: g, who});
        return g;
    }
    // Press a link as a person does: what opens or what downloads, and where the browser is afterwards.
    async function press(locator, name) {
        const before = page.url();
        const t0 = Date.now();
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push({url: strip(r.url()), status: r.status(), location: r.headers().location || null, disposition: r.headers()['content-disposition'] || null}); } catch (e) { /* none */ } };
        page.on('response', onResp);
        const out = {href: await locator.getAttribute('href').catch(() => null), text: flat(await locator.innerText().catch(() => null), 100), from: strip(before)};
        const dlP = page.waitForEvent('download', {timeout: 20000}).then((d) => ({d}), () => null);
        const navP = page.waitForURL((x) => x.href !== before, {timeout: 20000, waitUntil: 'load'}).then(() => ({nav: true}), () => new Promise(() => {}));
        await locator.click();
        const r = await Promise.race([dlP, navP, sleep(21000).then(() => null)]);
        if (r && r.d) {
            out.kind = 'download';
            out.file = r.d.suggestedFilename();
            out.failure = await r.d.failure().catch(() => null);
            out.downloadUrl = strip(r.d.url());
            await sleep(800);
        } else if (r && r.nav) {
            out.kind = 'navigation';
            await idle(page).catch(() => {});
            await sleep(500);
        } else {
            out.kind = 'nothing';
        }
        page.off('response', onResp);
        out.after = strip(page.url());
        out.chain = chain;
        out.title = await page.title().catch(() => null);
        out.h1 = await page.locator('h1').allInnerTexts().catch(() => []);
        out.bodyStart = flat(await page.locator('body').innerText().catch(() => ''), 200);
        out.traffic = trafficSince(t0);
        out.console = consoleSince(t0);
        await snap(name, {press: out});
        return out;
    }
    // A reader page, and inside it the pdf.js viewer or the HTML frame.
    async function reader(name) {
        const t0 = Date.now();
        await idle(page).catch(() => {});
        const d = await page.evaluate(READER).catch((e) => ({err: String(e.message).slice(0, 200)}));
        const pf = page.frames().find((x) => /pdf\.js\/web\/viewer\.html/.test(x.url()));
        if (pf) {
            let st = null;
            const until = Date.now() + 20000;
            while (Date.now() < until) {
                st = await pf.evaluate(() => {
                    const a = window.PDFViewerApplication;
                    return {ready: !!(a && a.initialized), pages: a && a.pagesCount, doc: !!(a && a.pdfDocument), url: a && a.url, rendered: document.querySelectorAll('#viewer .page canvas, #viewer .page .canvasWrapper').length};
                }).catch((e) => ({err: String(e.message).slice(0, 120)}));
                if (st && (st.pages > 0 || st.err)) break;
                await sleep(500);
            }
            d.pdfjs = st;
            d.pdfjs.frameUrl = strip(pf.url());
            d.pdfjs.controls = await pf.evaluate(() => {
                const v = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
                return [...document.querySelectorAll('#toolbarContainer button, #toolbarContainer input, #toolbarContainer select')].filter(v)
                    .map((b) => `${b.id}${b.title ? ` "${b.title}"` : ''}${b.getAttribute('aria-label') ? ` [${b.getAttribute('aria-label')}]` : ''}`);
            }).catch(() => []);
            d.pdfjs.viewerText = flat(await pf.locator('#viewer').innerText().catch(() => ''), 200);
        }
        const hf = page.frames().find((x) => x.name() === 'htmlFrame');
        if (hf) {
            await hf.waitForLoadState('load', {timeout: 15000}).catch(() => {});
            d.htmlFrame = {url: strip(hf.url()), text: flat(await hf.locator('body').innerText().catch(() => ''), 300)};
        }
        d.traffic = trafficSince(t0 - 20000);
        d.console = consoleSince(t0 - 20000);
        await snap(name, {reader: d});
        return d;
    }
    // Read a reader page reached by pressing a link, then press its return arrow, title and "Download".
    async function readerFull(openLink, pre) {
        const out = {};
        const back = page.url();
        out.open = await press(openLink, `${pre}-a-open`);
        if (out.open.kind !== 'navigation') return out;
        const readerUrl = page.url();
        out.reader = await reader(`${pre}-b-reader`);
        await loc(page, `${pre}: reader page return arrow header.header_view a.return`, page.locator('header.header_view a.return'));
        await loc(page, `${pre}: reader page title link header.header_view a.title`, page.locator('header.header_view a.title'));
        if (out.reader.download) {
            await loc(page, `${pre}: PDF reader "Download" header.header_view a.download`, page.locator('header.header_view a.download'));
            out.download = await press(page.locator('header.header_view a.download'), `${pre}-c-download`);
            if (strip(page.url()) !== strip(readerUrl)) { await page.goto(readerUrl); await idle(page); }
        }
        out.returnArrow = await press(page.locator('header.header_view a.return'), `${pre}-d-return`);
        await page.goto(readerUrl); await idle(page);
        out.titleLink = await press(page.locator('header.header_view a.title'), `${pre}-e-title`);
        await page.goto(back); await idle(page);
        return out;
    }

    // --- workflow helpers (K1's and U46 K2's, as driven there)
    async function fillVersionDetailsIfPresent(scope) {
        for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
            const el = scope.locator(sel);
            if (await el.isVisible().catch(() => false)) {
                if (!(await el.inputValue().catch(() => ''))) await el.selectOption(val).catch(() => {});
            }
        }
    }
    async function publishNow(name, {backIssue} = {}) {
        const s = {};
        const waitPublish = () => page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        if (isOJS) {
            const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
            const pub = new PublicationScreen(page, null);
            const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Schedule For Publication|Publish)$/});
            await button.waitFor({state: 'visible', timeout: T});
            s.button = flat(await button.innerText().catch(() => null), 60);
            await sleep(800);
            await button.click();
            const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
            const which = () => Promise.race([
                panel.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: 15_000}).then(() => 'panel'),
                confirm.waitFor({state: 'visible', timeout: 15_000}).then(() => 'confirm'),
            ]).catch(() => null);
            let opened = await which();
            if (!opened) { s.secondPress = true; await button.click({timeout: 5_000}).catch(() => {}); opened = await which(); }
            s.opened = opened;
            await idle(page);
            if (opened !== 'confirm') {
                await fillVersionDetailsIfPresent(panel);
                if (backIssue) {
                    const back = panel.getByRole('radio', {name: 'Assign To Current/Back Issue'});
                    await back.waitFor({state: 'visible', timeout: T});
                    await pub.awaitAssignmentPreselected(panel).catch(() => {});
                    await back.check();
                    await pub.selectIssueOption(panel, backIssue);
                }
                s.panel = flat(await panel.innerText().catch(() => ''), 800);
                await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                await confirm.waitFor({state: 'visible', timeout: T});
            }
            s.confirm = flat(await confirm.innerText().catch(() => ''), 600);
            const done = waitPublish();
            await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
            const r = await done;
            s.status = r ? r.status() : null;
            await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
        } else {
            const postControl = page.getByRole('button', {name: 'Post', exact: true});
            await postControl.first().waitFor({state: 'visible', timeout: T});
            await postControl.first().click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
            await confirm.waitFor({state: 'visible', timeout: T});
            await idle(page);
            await fillVersionDetailsIfPresent(confirm);
            s.confirm = flat(await confirm.innerText().catch(() => ''), 600);
            const done = waitPublish();
            await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
            const r = await done;
            s.status = r ? r.status() : null;
            await page.getByRole('button', {name: 'Unpost', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
        }
        await idle(page);
        await snap(name, {publish: s});
        return s;
    }
    async function createNewVersion(name) {
        const link = page.getByRole('link', {name: 'Create New Version', exact: true}).or(page.getByRole('button', {name: 'Create New Version', exact: true})).first();
        await link.waitFor({state: 'visible', timeout: T}).catch(() => {});
        if (!(await link.isVisible().catch(() => false))) return {offered: false};
        await sleep(1500);
        await link.click();
        const w = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
        await w.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
        await idle(page); await sleep(1000);
        await fillVersionDetailsIfPresent(w);
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
    async function openEntry(ctx, sid, pub, name) {
        await page.goto(wfUrl(ctx, sid, `publication_${pub}_titleAbstract`)); await idle(page); await sleep(800);
        if (name !== 'Title & Abstract') {
            const l = page.getByRole('link', {name, exact: true}).last();
            await l.waitFor({state: 'visible', timeout: T});
            await l.click();
            await idle(page); await sleep(800);
        }
        const start = Date.now();
        while (Date.now() - start < 20_000 && !(await wf().getByRole('button', {name: 'Save', exact: true}).count())) await sleep(250);
        await idle(page);
    }
    async function pressSave() {
        const button = wf().getByRole('button', {name: 'Save', exact: true}).last();
        const r = page.waitForResponse((x) => /\/publications\/\d+/.test(x.url()) && ['POST', 'PUT'].includes(x.request().method()), {timeout: T}).catch(() => null);
        await button.click();
        const resp = await r;
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
        await sleep(400);
        let body = null;
        if (resp && resp.status() >= 400) { try { body = await resp.text(); } catch (e) { /* none */ } }
        return {status: resp ? resp.status() : null, body: body ? body.slice(0, 600) : undefined, errors: await page.locator('.pkpFieldError').allInnerTexts().catch(() => [])};
    }
    async function typeRich(idPrefix, text) {
        const iframe = page.locator(`iframe[id^="${idPrefix}"]`).first();
        if (!(await iframe.count())) return {typed: false};
        const id = (await iframe.getAttribute('id')).replace(/_ifr$/, '');
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
        await page.frameLocator(`#${id}_ifr`).locator('body').click();
        await page.keyboard.press('ControlOrMeta+End');
        await page.keyboard.type(text);
        await sleep(300);
        return {typed: true, id, after: await page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null)};
    }
    // The Galleys page and its legacy window (U46 K2's helpers).
    const gm = () => page.locator('[data-cy="galley-manager"]').first();
    const galleyForm = () => page.locator('form#articleGalleyForm:visible, form#preprintGalleyForm:visible, form[id$="GalleyForm"]:visible').last();
    const wizard = () => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    async function openGalleys(ctx, sid, pub, name) {
        await page.goto(wfUrl(ctx, sid, `publication_${pub}_galleys`));
        await idle(page);
        await gm().waitFor({state: 'visible', timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        const rows = await gm().locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td,th')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()))).catch(() => []);
        if (name) await snap(name, {galleyRows: rows});
        return rows;
    }
    const rowOf = (label) => gm().locator('tbody tr').filter({has: page.locator('td').first().filter({hasText: new RegExp(`^\\s*${label}\\b`)})}).first();
    async function rowMenu(label, press_) {
        const row = rowOf(label);
        await row.waitFor({timeout: 20000});
        const btn = row.getByRole('button', {name: /More Actions/}).first();
        await btn.click(); await sleep(300);
        const items = await page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
        if (press_) {
            await page.getByRole('menuitem', {name: press_, exact: true}).first().click();
            await idle(page);
        } else { await btn.click().catch(() => {}); await sleep(200); }
        return {items};
    }
    async function waitForm() {
        await galleyForm().locator('input[name="label"]').waitFor({state: 'attached', timeout: T});
        await idle(page); await sleep(400);
    }
    async function fillField(name, value) {
        const el = galleyForm().locator(`[name="${name}"]`);
        await el.fill(value);
        await el.blur().catch(() => {});
    }
    async function formSave() {
        const t0 = Date.now();
        const form = galleyForm();
        await form.getByRole('button', {name: 'Save', exact: true}).last().click();
        await sleep(1200); await idle(page);
        return {stillOpen: await form.isVisible().catch(() => false), notices: await noticesSince(t0), dialogs: dialogsSince(t0)};
    }

    // --- Settings › Website › Plugins
    const pluginRow = (id) => page.locator(`#pluginGridContainer tr.gridRow[id$="-row-${id}"]`);
    async function gotoPlugins(ctx) {
        await page.goto(app.url(`/index.php/${ctx}/management/settings/website`));
        await idle(page);
        await page.locator('#plugins-button').first().click();
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T});
        await idle(page); await sleep(400);
    }
    async function pluginRead(ids) {
        const o = {};
        for (const id of ids) {
            const row = pluginRow(id);
            const n = await row.count();
            o[id] = n ? {text: flat(await row.innerText(), 200), checked: await row.getByRole('checkbox').first().isChecked().catch(() => null),
                category: flat(await row.evaluate((tr) => { let p = tr.closest('tbody')?.previousElementSibling; while (p && !/category/i.test(p.className || '')) p = p.previousElementSibling; return p ? p.innerText : (tr.closest('tbody')?.querySelector('tr.category')?.innerText || null); }).catch(() => null), 80)} : null;
        }
        return o;
    }
    async function setPlugin(id, want) {
        const box = pluginRow(id).getByRole('checkbox').first();
        const out = {before: await box.isChecked(), want};
        if (out.before === want) return out;
        const t0 = Date.now();
        const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true});
        await sleep(700);
        const dlg = page.locator('[role="dialog"]:visible');
        if (await dlg.count()) {
            out.confirm = flat(await dlg.last().innerText().catch(() => null), 300);
            const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const resp = await w;
        out.status = resp ? resp.status() : null;
        await sleep(1200); await idle(page);
        out.after = await pluginRow(id).getByRole('checkbox').first().isChecked().catch(() => null);
        out.notices = await noticesSince(t0);
        out.dialogs = dialogsSince(t0);
        return out;
    }

    // --- Settings › Workflow › Submission › Components
    async function componentsTab(ctx, name) {
        await page.goto(app.url(`/index.php/${ctx}/management/settings/workflow`)); await idle(page);
        const subTab = page.getByRole('tab', {name: 'Submission', exact: true}).first();
        if (await subTab.count()) { await subTab.click(); await idle(page); }
        await page.getByRole('tab', {name: 'Components', exact: true}).first().click(); await idle(page);
        await page.locator('[id^="component-grid-settings-genre"] tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        const grid = await page.evaluate(() => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const g = [...document.querySelectorAll('[id^="component-grid-settings-genre"]')].find((e) => e.getClientRects().length) || document;
            return {heading: f((g.querySelector('h4, h3, .header') || {}).innerText), rows: [...g.querySelectorAll('tr.gridRow')].map((tr) => ({id: tr.id, text: f(tr.innerText)}))};
        });
        if (name) await snap(name, {grid});
        return grid;
    }
    async function openGenre(rowId) {
        const tr = page.locator(`tr#${rowId}`);
        const tog = tr.locator('a.show_extras');
        if (await tog.count()) { await tog.first().click(); await sleep(300); }
        const acts = await page.locator(`tr#${rowId} + tr`).locator('a').allInnerTexts().catch(() => []);
        await page.locator(`tr#${rowId} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
        const form = page.locator('#genreForm').last();
        await form.waitFor({timeout: 20000}); await idle(page); await sleep(300);
        return {acts: acts.map((x) => flat(x)), form};
    }
    async function genreRead(form) {
        return form.evaluate((f0) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const lab = (e) => f((e.closest('label') || f0.querySelector(`label[for="${e.id}"]`) || {}).innerText);
            return {name: (f0.querySelector('input[name^="name"]') || {}).value, boxes: [...f0.querySelectorAll('input[type=checkbox]')].map((c) => ({name: c.name, label: lab(c), checked: c.checked})),
                buttons: [...f0.querySelectorAll('button, a')].filter((b) => b.getClientRects().length).map((b) => f(b.innerText)).filter(Boolean)};
        });
    }
    async function genreCancel() {
        const w = top();
        await w.getByRole('link', {name: 'Cancel', exact: true}).or(w.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
        await page.locator('#genreForm').last().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await idle(page); await sleep(600);
    }

    try {
        // ============================================================ OMP: read-only controls
        if (isOMP) {
            await sect('omp', async () => {
                const out = {};
                await as('manager.maya', app.contextPath);
                await gotoPlugins(app.contextPath);
                out.plugins = await pluginRead(['pdfjsviewerplugin', 'htmlmonographfileplugin', 'htmlarticlegalleyplugin', 'lensgalleyplugin', 'citationstylelanguageplugin']);
                await snap('omp-01-plugins-publicknowledge', {plugins: out.plugins});
                fact('omp', out);
            });
            return;
        }
        const G = S.G; const X = S.X; const F = S.F; const s = S.s;
        const gPage = (id, rest = '', l = 'en') => pageOf(G.path, id, rest, l);

        // ============================================================ plugins: q16, Settings 1–3, OPS4 (X)
        if (on('plugins')) await sect('plugins', async () => {
            const out = {};
            const ids = ['pdfjsviewerplugin', 'htmlarticlegalleyplugin', 'lensgalleyplugin', 'citationstylelanguageplugin', 'pflplugin', 'recommendbyauthorplugin', 'recommendbysimilarityplugin'];
            await as(X.u.mg, X.path);
            await gotoPlugins(X.path);
            out.fresh = await pluginRead(ids);
            out.genericRows = await page.locator('#pluginGridContainer tr.gridRow').evaluateAll((trs) => trs.map((tr) => tr.id.replace(/^.*-row-/, ''))).catch(() => []);
            await snap('pl-01-plugins-fresh-manager', {plugins: out.fresh});
            await loc(page, 'Settings › Website › Plugins: "PDF.JS PDF Viewer" row', pluginRow('pdfjsviewerplugin'));
            if (isOJS) {
                await loc(page, 'Settings › Website › Plugins: "HTML Article Galley" row', pluginRow('htmlarticlegalleyplugin'));
                await loc(page, 'Settings › Website › Plugins: "eLife Lens Article Viewer" row', pluginRow('lensgalleyplugin'));
            }
            // the "on" end, visitor
            await visitor();
            out.onLists = await lists(pageOf(X.path, s.XA.id), 'pl-02-xa-landing-plugins-on');
            const xl = (label) => page.locator('.item.galleys a').filter({hasText: new RegExp(`^\\s*${label}\\s*$`)}).first();
            out.on = {};
            for (const l of ['PDF', 'HTML', ...(isOJS ? ['XML'] : [])]) {
                await page.goto(app.url(pageOf(X.path, s.XA.id))); await idle(page);
                out.on[l] = await press(xl(l), `pl-03-on-press-${l}`);
            }
            // switch each reader off, as the manager
            await as(X.u.mg, X.path);
            await gotoPlugins(X.path);
            out.off = {};
            for (const id of ['pdfjsviewerplugin', ...(isOJS ? ['htmlarticlegalleyplugin', 'lensgalleyplugin'] : [])]) out.off[id] = await setPlugin(id, false);
            out.afterOff = await pluginRead(ids.slice(0, 3));
            await snap('pl-04-plugins-readers-off', {plugins: out.afterOff, off: out.off});
            await visitor();
            out.offLists = await lists(pageOf(X.path, s.XA.id), 'pl-05-xa-landing-plugins-off');
            out.offPress = {};
            for (const l of ['PDF', 'HTML', ...(isOJS ? ['XML'] : [])]) {
                await page.goto(app.url(pageOf(X.path, s.XA.id))); await idle(page);
                out.offPress[l] = await press(xl(l), `pl-06-off-press-${l}`);
            }
            fact('plugins', out);
        });

        // ============================================================ components: Settings 11 (X read), flips on F
        if (on('components')) await sect('components', async () => {
            const out = {};
            await as(X.u.mg, X.path);
            const g = await componentsTab(X.path, 'co-01-components-tab');
            out.heading = g.heading;
            await loc(page, 'Settings › Workflow › Submission › "Components" tab', page.getByRole('tab', {name: 'Components', exact: true}).first());
            out.forms = [];
            for (const r of g.rows) {
                try {
                    const {acts, form} = await openGenre(r.id);
                    const d = await genreRead(form);
                    if (!out.formShot) { await snap('co-02-component-form-first', {form: d}); out.formShot = true; }
                    out.forms.push({row: r.text, acts, ...d});
                    await genreCancel();
                } catch (e) { out.forms.push({row: r.text, error: flat(e.message, 200)}); await componentsTab(X.path).catch(() => {}); }
            }
            record('co-components-forms', out.forms);
            out.supplementaryTicked = out.forms.filter((x) => (x.boxes || []).some((b) => b.name === 'supplementary' && b.checked)).map((x) => x.name);
            out.dependentTicked = out.forms.filter((x) => (x.boxes || []).some((b) => b.name === 'dependent' && b.checked)).map((x) => x.name);
            // F: the landing page before, then "Data Set" unticked "supplementary", then "dependent" ticked
            await visitor();
            out.fBefore = await lists(pageOf(F.path, s.FA.id), 'co-03-fa-landing-defaults');
            await as(F.u.mg, F.path);
            const fg = await componentsTab(F.path);
            const ds = fg.rows.find((r) => /\bData Set$/.test(r.text));
            out.dsRow = ds;
            if (ds) {
                // the window left with a change, by its "Close"
                let {form} = await openGenre(ds.id);
                const sbox = form.locator('input[name="supplementary"]');
                await sbox.click();
                await sbox.blur().catch(() => {});
                const t0 = Date.now();
                await top().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                await sleep(1200); await idle(page);
                out.closeUnsaved = {dialogs: dialogsSince(t0), formStillOpen: await form.isVisible().catch(() => false)};
                await snap('co-04-genre-close-unsaved', {closeUnsaved: out.closeUnsaved});
                await componentsTab(F.path);
                ({form} = await openGenre(ds.id));
                out.dsReopened = await genreRead(form);
                // untick "supplementary", save
                await form.locator('input[name="supplementary"]').setChecked(false);
                let t1 = Date.now();
                await form.locator('button[type="submit"]').first().click();
                await form.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await idle(page); await sleep(600);
                out.saveUnsupp = {notices: await noticesSince(t1), dialogs: dialogsSince(t1)};
                await snap('co-05-dataset-unsupplementary-saved', {save: out.saveUnsupp});
                await visitor();
                out.fUnsupp = await lists(pageOf(F.path, s.FA.id), 'co-06-fa-landing-dataset-not-supplementary');
                // tick "dependent"
                await as(F.u.mg, F.path);
                await componentsTab(F.path);
                ({form} = await openGenre(ds.id));
                await form.locator('input[name="dependent"]').setChecked(true);
                t1 = Date.now();
                await form.locator('button[type="submit"]').first().click();
                await form.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await idle(page); await sleep(600);
                out.saveDependent = {notices: await noticesSince(t1), dialogs: dialogsSince(t1)};
                await visitor();
                out.fDependent = await lists(pageOf(F.path, s.FA.id), 'co-07-fa-landing-dataset-dependent');
            }
            fact('components', out);
        });

        // ============================================================ lists: q7, Rule 10, 10a, 10b (L)
        if (on('lists')) await sect('lists', async () => {
            const out = {};
            const L = s.L;
            await as(G.u.mg, G.path);
            if (!S.lDraft) {
                out.before = await openGalleys(G.path, L.id, L.pub, 'li-01-galleys-page-seeded');
                await gm().waitFor({timeout: T});
                await page.getByRole('button', {name: 'Add galley', exact: true}).first().click();
                await waitForm();
                await fillField('label', 'Draft');
                out.draftSave = await formSave();
                await wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}).catch(() => {});
                await snap('li-02-draft-wizard-open');
                await wizard().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                await sleep(1000);
                await wizard().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await idle(page);
                out.after = await openGalleys(G.path, L.id, L.pub, 'li-03-galleys-page-with-draft');
                S.lDraft = true; save();
            }
            if (!S.lPublished) {
                await page.goto(wfUrl(G.path, L.id, `publication_${L.pub}_titleAbstract`)); await idle(page); await sleep(800);
                out.publish = await publishNow('li-04-published', isOJS ? {backIssue: /Vol\. 1 No\. 1/} : {});
                S.lPublished = true; save();
            }
            await visitor();
            out.en = await lists(gPage(L.id), 'li-05-landing-en-visitor');
            await loc(page, 'Landing page: main galley list ul.galleys_links a.obj_galley_link', page.locator('ul.galleys_links a.obj_galley_link'));
            await loc(page, 'Landing page: additional files ul.supplementary_galleys_links a', page.locator('ul.supplementary_galleys_links a'));
            out.fr = await lists(gPage(L.id, '', 'fr_CA'), 'li-06-landing-fr-visitor');
            out.enAgain = await lists(gPage(L.id), 'li-06b-landing-en-again');
            // as the Reader
            await as(G.u.rd, G.path);
            out.reader = await lists(gPage(L.id), 'li-07-landing-en-reader');
            // the listing pages
            await visitor();
            await page.goto(app.url(`/index.php/${G.path}/en`)); await idle(page);
            const listRead = () => page.evaluate(() => [...document.querySelectorAll('.obj_article_summary, .obj_preprint_summary')].map((x) => ({
                title: (x.querySelector('.title')?.innerText || '').replace(/\s+/g, ' ').trim(), galleys: [...x.querySelectorAll('.galleys_links a, a.obj_galley_link')].map((a) => ({t: a.innerText.replace(/\s+/g, ' ').trim(), h: a.getAttribute('href')}))})));
            out.home = await listRead();
            await snap('li-08-home-visitor', {summaries: out.home});
            const draftHome = page.locator('.obj_article_summary, .obj_preprint_summary').filter({hasText: `K2 lists`}).locator('a').filter({hasText: /^\s*Draft\s*$/}).first();
            if (await draftHome.count()) out.homeDraft = await press(draftHome, 'li-09-home-press-draft');
            if (isOJS && G.issues && G.issues[0]) {
                const iid = G.issues[0].id;
                await page.goto(app.url(`/index.php/${G.path}/en/issue/view/${iid}`)); await idle(page);
                out.toc = await listRead();
                await snap('li-10-issue-toc-visitor', {summaries: out.toc});
                const draftToc = page.locator('.obj_article_summary').filter({hasText: 'K2 lists'}).locator('a').filter({hasText: /^\s*Draft\s*$/}).first();
                if (await draftToc.count()) out.tocDraft = await press(draftToc, 'li-11-toc-press-draft');
            }
            fact('lists', out);
        });

        // ============================================================ open: q8, q10, Rule 11, 13, the readers' fields (O)
        if (on('open')) await sect('open', async () => {
            const out = {};
            const O = s.O;
            await visitor();
            out.lists = await lists(gPage(O.id), 'op-01-landing-visitor');
            const links = (out.lists.blocks || []).flatMap((b) => b.links);
            out.links = links;
            const byHref = (h) => page.locator(`.item.galleys a[href="${h}"]`).first();
            const land = async () => { await page.goto(app.url(gPage(O.id))); await idle(page); };
            // PDF: the reader page, its arrow, title and "Download"
            const pdf = links.find((l) => /\/pdf$/.test(l.h || ''));
            if (pdf) { await land(); out.pdf = await readerFull(byHref(pdf.h), 'op-02-pdf'); }
            // HTML (English)
            const html = links.find((l) => /^HTML$/.test(l.t));
            if (html) { await land(); out.html = isOJS ? await readerFull(byHref(html.h), 'op-03-html') : {open: await press(byHref(html.h), 'op-03-html-a-open')}; }
            // Text, Remote, XML
            for (const [k, re] of [['text', /^Text$/], ['remote', /^Remote$/], ['xml', /^XML$/]]) {
                const l = links.find((x) => re.test(x.t));
                if (!l) continue;
                await land();
                out[k] = await press(byHref(l.h), `op-04-${k}`);
                if (k === 'xml' && out[k].kind === 'navigation') {
                    await sleep(3000);
                    out.xmlLens = {title: await page.title(), text: flat(await page.locator('body').innerText().catch(() => ''), 600),
                        lensRoot: await page.locator('.lens-article, #container, .lens').count().catch(() => 0)};
                    await snap('op-05-xml-lens', {lens: out.xmlLens});
                }
            }
            // French HTML (URL Path html-fr): on the English page, then after browsing in French
            const htmlFr = links.find((x) => /\/html-fr$/.test(x.h || ''));
            if (htmlFr) {
                await land();
                out.htmlFrOnEn = await press(byHref(htmlFr.h), 'op-06-htmlfr-from-en');
                out.frLists = await lists(gPage(O.id, '', 'fr_CA'), 'op-07-landing-fr-visitor');
                const frLink = (out.frLists.blocks || []).flatMap((b) => b.links).find((x) => /\/html-fr$/.test(x.h || ''));
                if (frLink) out.htmlFrOnFr = await press(byHref(frLink.h), 'op-08-htmlfr-from-fr');
                const pdfFr = (out.frLists.blocks || []).flatMap((b) => b.links).find((x) => /\/pdf$/.test(x.h || ''));
                if (pdfFr) { await page.goto(app.url(gPage(O.id, '', 'fr_CA'))); await idle(page); out.pdfFr = await press(byHref(pdfFr.h), 'op-09-pdf-from-fr'); out.pdfFrReader = await reader('op-09b-pdf-reader-fr'); }
                await page.goto(app.url(gPage(O.id, '', 'en'))); await idle(page);
            }
            // q10 / Rule 13: the PDF's number address, an unknown galley
            const pdfGalley = (O.galleys || []).find((x) => x.label === 'PDF');
            out.pdfGalleyId = pdfGalley ? pdfGalley.id : null;
            if (pdfGalley) out.galleyNumber = await typed(gPage(O.id, `/${pdfGalley.id}`), 'op-10-typed-galley-number');
            out.noSuchGalley = await typed(gPage(O.id, '/nosuchgalley'), 'op-11-typed-nosuchgalley');
            const htmlGalley = (O.galleys || []).find((x) => x.label === 'HTML');
            if (htmlGalley) out.htmlNumber = await typed(gPage(O.id, `/${htmlGalley.id}`), 'op-12-typed-html-galley-number');
            // as the Reader: the PDF reader
            await as(G.u.rd, G.path);
            await land();
            if (pdf) { out.readerPdf = await press(byHref(pdf.h), 'op-13-reader-pdf'); out.readerPdfPage = await reader('op-13b-reader-pdf-page'); }
            fact('open', out);
        });

        // ============================================================ vprep: new versions (VA, VB, VC, P) on screen
        if (on('vprep')) await sect('vprep', async () => {
            const out = {};
            await as(G.u.mg, G.path);
            S.v2 = S.v2 || {};
            for (const k of ['VA', 'VB', 'VC', 'P']) {
                const x = s[k];
                if (S.v2[k] && S.v2[k].published) continue;
                const o = {};
                if (!S.v2[k] || !S.v2[k].pub) {
                    await page.goto(wfUrl(G.path, x.id, `publication_${x.pub}_titleAbstract`)); await idle(page); await sleep(800);
                    o.version = await createNewVersion(`vp-${k}-01-create`);
                    S.v2[k] = {pub: o.version.newPub}; save();
                }
                const np = S.v2[k].pub;
                if (!np) { out[k] = o; continue; }
                if (k === 'VA' || k === 'VB') {
                    await openEntry(G.path, x.id, np, 'Title & Abstract');
                    o.title = await typeRich('titleAbstract-title-control-en', ' second');
                    o.titleSave = await pressSave();
                }
                if (k === 'VC') {
                    o.galleys = await openGalleys(G.path, x.id, np, 'vp-VC-02-galleys-v2');
                    o.menu = await rowMenu('PDF', 'Edit');
                    await waitForm();
                    o.pathBefore = await galleyForm().locator('[name="urlPath"]').inputValue().catch(() => null);
                    await fillField('urlPath', 'pdfnew');
                    o.pathSave = await formSave();
                    await openGalleys(G.path, x.id, np, 'vp-VC-03-galleys-v2-after');
                }
                if (k === 'P') {
                    const settingsName = isOPS ? 'Preprint entry' : 'Publication Settings';
                    await openEntry(G.path, x.id, np, settingsName);
                    const box = page.locator('input[id$="-urlPath-control"], input[name="urlPath"]').first();
                    await box.waitFor({state: 'visible', timeout: T});
                    await loc(page, `${settingsName} page: "URL Path" box`, box);
                    o.urlPathLabel = flat(await page.locator(`label[for="${await box.getAttribute('id')}"]`).innerText().catch(() => null), 200);
                    o.urlPathDesc = flat(await box.evaluate((e) => { const d = e.getAttribute('aria-describedby'); return d ? d.split(' ').map((i) => document.getElementById(i)?.innerText || '').join(' | ') : null; }).catch(() => null), 400);
                    await snap('vp-P-02-settings-page', {label: o.urlPathLabel, desc: o.urlPathDesc});
                    // left with a change, unsaved: to "Title & Abstract" and back
                    await box.fill('unsaved-path');
                    await box.blur().catch(() => {});
                    const t0 = Date.now();
                    await page.getByRole('link', {name: 'Title & Abstract', exact: true}).last().click();
                    await idle(page); await sleep(1200);
                    o.leaveUnsaved = {dialogs: dialogsSince(t0), url: strip(page.url())};
                    await snap('vp-P-03-left-unsaved', {leave: o.leaveUnsaved});
                    await openEntry(G.path, x.id, np, settingsName);
                    o.afterLeave = await page.locator('input[id$="-urlPath-control"], input[name="urlPath"]').first().inputValue().catch(() => null);
                    await page.locator('input[id$="-urlPath-control"], input[name="urlPath"]').first().fill('probe-path');
                    o.pathSave = await pressSave();
                    await snap('vp-P-04-settings-saved', {save: o.pathSave});
                }
                await page.goto(wfUrl(G.path, x.id, `publication_${np}_titleAbstract`)); await idle(page); await sleep(800);
                o.publish = await publishNow(`vp-${k}-09-published`);
                S.v2[k].published = true; save();
                out[k] = o;
            }
            fact('vprep', out);
        });

        // ============================================================ vread: Rule 12, A2, q9, Rule 13, Rule 1, q2, OPS2 (visitor)
        if (on('vread')) await sect('vread', async () => {
            const out = {};
            await visitor();
            for (const k of ['VA', 'VB']) {
                const x = s[k];
                const o = {};
                o.current = await lists(gPage(x.id), `vr-${k}-01-current`);
                const older = (o.current.versions || []).find((v) => v.a && /\/version\//.test(v.a));
                o.olderHref = older ? strip(older.a) : null;
                if (older) {
                    o.older = await lists(strip(older.a), `vr-${k}-02-older-page`);
                    const ol = (o.older.blocks || []).flatMap((b) => b.links);
                    const opdf = ol.find((l) => /^PDF/.test(l.t));
                    const ohtml = ol.find((l) => /^HTML/.test(l.t));
                    if (opdf) { await page.goto(app.url(strip(older.a))); await idle(page); o.pdf = await readerFull(page.locator(`.item.galleys a[href="${opdf.h}"]`).first(), `vr-${k}-03-older-pdf`); }
                    if (ohtml) {
                        await page.goto(app.url(strip(older.a))); await idle(page);
                        o.html = isOJS ? await readerFull(page.locator(`.item.galleys a[href="${ohtml.h}"]`).first(), `vr-${k}-04-older-html`)
                            : {open: await press(page.locator(`.item.galleys a[href="${ohtml.h}"]`).first(), `vr-${k}-04-older-html-a-open`)};
                    }
                }
                // Rule 13: the older version's galley (no URL Path) by its number, without a version part
                const v1Pdf = (x.galleys || []).find((g) => g.label === 'PDF');
                if (k === 'VA' && v1Pdf) o.oldGalleyNoVersion = await typed(gPage(x.id, `/${v1Pdf.id}`), `vr-${k}-05-typed-older-galley-number`);
                out[k] = o;
            }
            // VC: the old galley URL Path, now only on the older version
            {
                const x = s.VC; const o = {};
                o.current = await lists(gPage(x.id), 'vr-VC-01-current');
                o.oldPath = await typed(gPage(x.id, '/pdf'), 'vr-VC-02-typed-old-path');
                o.newPath = await typed(gPage(x.id, '/pdfnew'), 'vr-VC-03-typed-new-path');
                const v1Pdf = (x.galleys || []).find((g) => g.label === 'PDF');
                if (v1Pdf) o.oldNumber = await typed(gPage(x.id, `/${v1Pdf.id}`), 'vr-VC-04-typed-old-galley-number');
                out.VC = o;
            }
            // P: Rule 1 / q2 / OPS2
            {
                const x = s.P; const o = {};
                o.current = await lists(gPage(x.id), 'vr-P-01-current-by-number');
                o.byPath = await typed(gPage('probe-path'), 'vr-P-02-typed-path');
                o.byNumber = await typed(gPage(x.id), 'vr-P-03-typed-number');
                const curPdf = ((o.current.blocks || []).flatMap((b) => b.links)).find((l) => /^PDF/.test(l.t));
                o.curPdfHref = curPdf ? strip(curPdf.h) : null;
                const gid = curPdf ? (curPdf.h.match(/\/(\d+)$/) || [])[1] : null;
                if (gid) o.numberPlusGalley = await typed(gPage(x.id, `/${gid}`), 'vr-P-04-typed-number-galley');
                o.numberPlusVersion = await typed(gPage(x.id, `/version/${x.pub}`), 'vr-P-05-typed-number-version-v1');
                o.pathPlusVersion = await typed(gPage('probe-path', `/version/${x.pub}`), 'vr-P-06-typed-path-version-v1');
                o.version999999 = await typed(gPage(x.id, '/version/999999'), 'vr-P-07-typed-version-999999');
                // press each galley link on the current page
                const pl = (o.current.blocks || []).flatMap((b) => b.links);
                for (const l of pl) {
                    await page.goto(app.url(gPage('probe-path'))); await idle(page);
                    o[`press-${l.t}`] = await press(page.locator(`.item.galleys a[href="${l.h}"]`).first(), `vr-P-08-press-${l.t.replace(/[^a-z0-9]+/gi, '_')}`);
                }
                out.P = o;
            }
            fact('vread', out);
        });

        // ============================================================ vd: A2's end — the kept URL Path with a changed file
        // VD: PDF (URL Path "pdf") published; new version; the new version's PDF gets "Change File" (replacement.pdf)
        // on screen; published. The older version's PDF reader then shows which file?
        if (on('vd')) await sect('vd', async () => {
            const out = {};
            if (!s.VD) {
                const r = await app.api.createSubmission({tag: `${S.t}vd`, context: G.path, submitter: G.u.au, title: `K2 vd ${S.t}`, published: true,
                    ...(isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {}), galleys: [{label: 'PDF', file: PDF, urlPath: 'pdf'}]});
                s.VD = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys}; save();
            }
            const x = s.VD;
            if (!S.vdDone) {
                await as(G.u.mg, G.path);
                if (!S.vdPub) {
                    await page.goto(wfUrl(G.path, x.id, `publication_${x.pub}_titleAbstract`)); await idle(page); await sleep(800);
                    out.version = await createNewVersion('vd-01-create');
                    S.vdPub = out.version.newPub; save();
                }
                await openGalleys(G.path, x.id, S.vdPub, 'vd-02-galleys-v2');
                out.menu = await rowMenu('PDF', 'Change File');
                const w = wizard();
                await w.locator('input[type="file"]').waitFor({state: 'attached', timeout: T});
                await idle(page); await sleep(500);
                await snap('vd-03-change-file-wizard');
                await w.locator('input[type="file"]').setInputFiles(path.join(app.suiteDir, 'fixtures', 'files', 'replacement.pdf'));
                const cont = () => w.getByRole('button', {name: 'Continue', exact: true});
                const until = Date.now() + 30000;
                while (Date.now() < until && !(await cont().isEnabled().catch(() => false))) await sleep(200);
                await cont().click(); await idle(page); await sleep(800);
                await cont().click().catch(() => {}); await idle(page); await sleep(800);
                const complete = w.getByRole('button', {name: 'Complete', exact: true});
                await complete.waitFor({timeout: 20000}).catch(() => {});
                await complete.click().catch(() => {});
                await w.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await idle(page);
                out.after = await openGalleys(G.path, x.id, S.vdPub, 'vd-04-galleys-v2-after-change');
                await page.goto(wfUrl(G.path, x.id, `publication_${S.vdPub}_titleAbstract`)); await idle(page); await sleep(800);
                out.publish = await publishNow('vd-05-published');
                S.vdDone = true; save();
            }
            await visitor();
            out.current = await lists(gPage(x.id), 'vd-06-current');
            const cpdf = ((out.current.blocks || []).flatMap((b) => b.links)).find((l) => /^PDF/.test(l.t));
            if (cpdf) { await page.goto(app.url(gPage(x.id))); await idle(page); out.currentPdf = await readerFull(page.locator(`.item.galleys a[href="${cpdf.h}"]`).first(), 'vd-07-current-pdf'); }
            const older = (out.current.versions || []).find((v) => v.a && /\/version\//.test(v.a));
            if (older) {
                out.older = await lists(strip(older.a), 'vd-08-older-page');
                const opdf = ((out.older.blocks || []).flatMap((b) => b.links)).find((l) => /^PDF/.test(l.t));
                if (opdf) { await page.goto(app.url(strip(older.a))); await idle(page); out.olderPdf = await readerFull(page.locator(`.item.galleys a[href="${opdf.h}"]`).first(), 'vd-09-older-pdf'); }
            }
            fact('vd', out);
        });

        // ============================================================ ve: does "Change File" on a new version reach the older version's galley?
        // VE: HTML published; new version; the new version's HTML gets "Change File" (a text file); published.
        // Visitor: the older version's HTML link (versioned address, no URL Path) — reader or which download?
        if (on('ve')) await sect('ve', async () => {
            const out = {};
            if (!s.VE) {
                const r = await app.api.createSubmission({tag: `${S.t}ve`, context: G.path, submitter: G.u.au, title: `K2 ve ${S.t}`, published: true,
                    ...(isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {}), galleys: [{label: 'HTML', file: HTML}]});
                s.VE = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys}; save();
            }
            const x = s.VE;
            if (!S.veDone) {
                await as(G.u.mg, G.path);
                if (!S.vePub) {
                    await page.goto(wfUrl(G.path, x.id, `publication_${x.pub}_titleAbstract`)); await idle(page); await sleep(800);
                    out.version = await createNewVersion('ve-01-create');
                    S.vePub = out.version.newPub; save();
                }
                await openGalleys(G.path, x.id, S.vePub, 've-02-galleys-v2');
                out.menu = await rowMenu('HTML', 'Change File');
                const w = wizard();
                await w.locator('input[type="file"]').waitFor({state: 'attached', timeout: T});
                await idle(page); await sleep(500);
                out.wizardText = flat(await w.innerText().catch(() => null), 800);
                await snap('ve-03-change-file-wizard', {wizardText: out.wizardText});
                await w.locator('input[type="file"]').setInputFiles(path.join(app.suiteDir, 'fixtures', 'files', TXT));
                const cont = () => w.getByRole('button', {name: 'Continue', exact: true});
                const until = Date.now() + 30000;
                while (Date.now() < until && !(await cont().isEnabled().catch(() => false))) await sleep(200);
                await cont().click(); await idle(page); await sleep(800);
                await cont().click().catch(() => {}); await idle(page); await sleep(800);
                const complete = w.getByRole('button', {name: 'Complete', exact: true});
                await complete.waitFor({timeout: 20000}).catch(() => {});
                await complete.click().catch(() => {});
                await w.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await idle(page);
                out.after = await openGalleys(G.path, x.id, S.vePub, 've-04-galleys-v2-after-change');
                // the older (published) version's Galleys page, as the manager
                out.olderGalleysPage = await openGalleys(G.path, x.id, x.pub, 've-04b-galleys-v1-after-change');
                await page.goto(wfUrl(G.path, x.id, `publication_${S.vePub}_titleAbstract`)); await idle(page); await sleep(800);
                out.publish = await publishNow('ve-05-published');
                S.veDone = true; save();
            }
            await visitor();
            out.current = await lists(gPage(x.id), 've-06-current');
            const chtml = ((out.current.blocks || []).flatMap((b) => b.links)).find((l) => /^HTML/.test(l.t));
            if (chtml) { await page.goto(app.url(gPage(x.id))); await idle(page); out.currentHtml = await press(page.locator(`.item.galleys a[href="${chtml.h}"]`).first(), 've-07-current-html'); }
            const older = (out.current.versions || []).find((v) => v.a && /\/version\//.test(v.a));
            if (older) {
                out.older = await lists(strip(older.a), 've-08-older-page');
                const oh = ((out.older.blocks || []).flatMap((b) => b.links)).find((l) => /^HTML/.test(l.t));
                if (oh) {
                    await page.goto(app.url(strip(older.a))); await idle(page);
                    out.olderHtml = await press(page.locator(`.item.galleys a[href="${oh.h}"]`).first(), 've-09-older-html');
                    if (out.olderHtml.kind === 'navigation') out.olderHtmlReader = await reader('ve-09b-older-html-reader');
                }
            }
            fact('ve', out);
        });

        // ============================================================ vf: A2's end with a file of its own
        // VF: PDF (URL Path "pdf") published; new version; the copy's URL Path changed to "pdfold" and a new galley
        // "New" with URL Path "pdf" and replacement.pdf added; published. The older version's PDF reader shows which file?
        if (on('vf')) await sect('vf', async () => {
            const out = {};
            if (!s.VF) {
                const r = await app.api.createSubmission({tag: `${S.t}vf`, context: G.path, submitter: G.u.au, title: `K2 vf ${S.t}`, published: true,
                    ...(isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {}), galleys: [{label: 'PDF', file: PDF, urlPath: 'pdf'}]});
                s.VF = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys}; save();
            }
            const x = s.VF;
            if (!S.vfDone) {
                await as(G.u.mg, G.path);
                if (!S.vfPub) {
                    await page.goto(wfUrl(G.path, x.id, `publication_${x.pub}_titleAbstract`)); await idle(page); await sleep(800);
                    out.version = await createNewVersion('vf-01-create');
                    S.vfPub = out.version.newPub; save();
                }
                await openGalleys(G.path, x.id, S.vfPub, 'vf-02-galleys-v2');
                await rowMenu('PDF', 'Edit'); await waitForm();
                await fillField('urlPath', 'pdfold');
                out.copySave = await formSave();
                await openGalleys(G.path, x.id, S.vfPub);
                await page.getByRole('button', {name: 'Add galley', exact: true}).first().click();
                await waitForm();
                await fillField('label', 'New');
                await fillField('urlPath', 'pdf');
                out.newSave = await formSave();
                const w = wizard();
                await w.locator('input[type="file"]').waitFor({state: 'attached', timeout: T});
                await idle(page); await sleep(500);
                const g = w.locator('select[id^="genreId"]');
                if (await g.count() && await g.isVisible().catch(() => false)) await g.selectOption({label: isOPS ? 'Preprint Text' : 'Article Text'});
                await w.locator('input[type="file"]').setInputFiles(path.join(app.suiteDir, 'fixtures', 'files', 'replacement.pdf'));
                const cont = () => w.getByRole('button', {name: 'Continue', exact: true});
                const until = Date.now() + 30000;
                while (Date.now() < until && !(await cont().isEnabled().catch(() => false))) await sleep(200);
                await cont().click(); await idle(page); await sleep(800);
                await cont().click().catch(() => {}); await idle(page); await sleep(800);
                const complete = w.getByRole('button', {name: 'Complete', exact: true});
                await complete.waitFor({timeout: 20000}).catch(() => {});
                await complete.click().catch(() => {});
                await w.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await idle(page);
                out.after = await openGalleys(G.path, x.id, S.vfPub, 'vf-03-galleys-v2-after');
                await page.goto(wfUrl(G.path, x.id, `publication_${S.vfPub}_titleAbstract`)); await idle(page); await sleep(800);
                out.publish = await publishNow('vf-04-published');
                S.vfDone = true; save();
            }
            await visitor();
            out.current = await lists(gPage(x.id), 'vf-05-current');
            const older = (out.current.versions || []).find((v) => v.a && /\/version\//.test(v.a));
            if (older) {
                out.older = await lists(strip(older.a), 'vf-06-older-page');
                const opdf = ((out.older.blocks || []).flatMap((b) => b.links)).find((l) => /^PDF/.test(l.t));
                if (opdf) { await page.goto(app.url(strip(older.a))); await idle(page); out.olderPdf = await readerFull(page.locator(`.item.galleys a[href="${opdf.h}"]`).first(), 'vf-07-older-pdf'); }
            }
            fact('vf', out);
        });

        // ============================================================ opsxml: an XML galley on a preprint server (Rule 11, OPS4)
        // OPS has no XML fixture: the galley's file is uploaded on screen from the journal's JATS fixture.
        if (on('opsxml') && isOPS) await sect('opsxml', async () => {
            const out = {};
            if (!s.XM) {
                const r = await app.api.createSubmission({tag: `${S.t}xm`, context: G.path, submitter: G.u.au, title: `K2 xm ${S.t}`, participants: [{username: G.u.se, role: 'sectionEditor'}]});
                s.XM = {id: r.submissionId, pub: r.publicationId}; save();
            }
            const x = s.XM;
            if (!S.xmDone) {
                await as(G.u.mg, G.path);
                await openGalleys(G.path, x.id, x.pub, 'ox-01-galleys');
                await page.getByRole('button', {name: 'Add galley', exact: true}).first().click();
                await waitForm();
                await fillField('label', 'XML');
                out.save = await formSave();
                const w = wizard();
                await w.locator('input[type="file"]').waitFor({state: 'attached', timeout: T});
                await idle(page); await sleep(500);
                const g = w.locator('select[id^="genreId"]');
                if (await g.count() && await g.isVisible().catch(() => false)) await g.selectOption({label: 'Preprint Text'});
                await w.locator('input[type="file"]').setInputFiles(path.join(app.root, '..', '..', 'apps', 'ojs', 'playwright', 'fixtures', 'files', 'article.xml'));
                const cont = () => w.getByRole('button', {name: 'Continue', exact: true});
                const until = Date.now() + 30000;
                while (Date.now() < until && !(await cont().isEnabled().catch(() => false))) await sleep(200);
                await cont().click(); await idle(page); await sleep(800);
                await cont().click().catch(() => {}); await idle(page); await sleep(800);
                const complete = w.getByRole('button', {name: 'Complete', exact: true});
                await complete.waitFor({timeout: 20000}).catch(() => {});
                await complete.click().catch(() => {});
                await w.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await idle(page);
                out.after = await openGalleys(G.path, x.id, x.pub, 'ox-02-galleys-after');
                await page.goto(wfUrl(G.path, x.id, `publication_${x.pub}_titleAbstract`)); await idle(page); await sleep(800);
                out.publish = await publishNow('ox-03-posted');
                S.xmDone = true; save();
            }
            await visitor();
            out.lists = await lists(gPage(x.id), 'ox-04-landing');
            const l = ((out.lists.blocks || []).flatMap((b) => b.links)).find((y) => /^XML/.test(y.t));
            if (l) { await page.goto(app.url(gPage(x.id))); await idle(page); out.press = await press(page.locator(`.item.galleys a[href="${l.h}"]`).first(), 'ox-05-press-xml'); }
            fact('opsxml', out);
        });
    } finally {
        await close();
    }
});
