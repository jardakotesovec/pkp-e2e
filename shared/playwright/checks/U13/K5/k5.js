// U13 claim check, chunk K5: the article summary in listings, the pointers to other specs, Coverage.
// Spec: docs/specs/U13-article-landing-page-and-reading.md — Purpose (12–36), the article summary (162–180), Rule 22
// (360–365), the relation notice (367–369), Settings 10 (419–423), Cross-feature interactions (443–484), Canonical
// preamble (488–491), Coverage (494–551), register A4 (607–613), OPS6 (701–705); footnotes a, j, q7, s, f-a4, f-ops6;
// pointer rows 79, 82, 90, 99, 101 handed on from K1, block K2-12 from K2.
//
//   PROBE_FEATURE=U13 PROBE_AGENT=ccK5 node bin/probe.js ojs shared/playwright/checks/U13/K5/k5.js
//   PHASES=seed,sections,prep,prepb,bio,jobs,read,theme,press,relation,crossmark,pk,omp   (default: all; state in k5-state-<app>.json, so a
//   phase can be re-run alone; delete the state file for a fresh seed). Run one app per process.
//
// Scratch contexts:
//   OJS J  sections ART "Articles" and OMT "Omitted" ("Omit author names…" ticked ON SCREEN in the sections phase);
//          category "Kay Category" with child "Kay Sub"; one published issue Vol. 1 No. 1 (2026); home page showing the
//          categories, "Latest Publications" and the current issue (themeOptions journalContentOrganization 1,2,3);
//          "Recommend Similar Articles" and URN plugins on. Users mg manager, au author, rd reader.
//          A  Production; PDF, Data (Data Set), Notes (Other), Remote; subtitle, keywords, cover, category, URL Path;
//             on screen: "Draft" galley with its upload wizard closed, Pages, the author's Bio Statement, a funder,
//             URN "Assign", JATS uploaded and made public, DOI prefix; published on screen into the issue.
//          B  Production; PDF, Data, Remote; "Draft" on screen; published on screen with no issue (Latest Publications).
//          C  section OMT, published into the issue (seed). D  section OMT, published with no issue (seed).
//   OPS P  sections PRE and OMT (path "omitted"); the same categories. Users mg, au, rd.
//          A  unposted; PDF, Data, Remote; subtitle, keywords, cover, category; "Draft" on screen, bio, funder, DOI
//             prefix; posted on screen.  B  posted (seed); on screen a second version with keyword "vtwo", posted.
//          C  section OMT, posted (seed); "Relations" set to published elsewhere on screen (relation phase).
//   OMP M  one published book (seed): read-only control for "a press's book page is a separate feature".
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'sections', 'prep', 'prepb', 'bio', 'jobs', 'read', 'theme', 'press', 'relation', 'crossmark', 'pk', 'omp'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k5]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k5-state-${app.name}.json`);

// Every article / preprint summary on a listing page, with the list it sits in.
const SUMMARIES = () => {
    const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const ctxHeading = (el) => {
        let n = el;
        while (n && n !== document.body) {
            let p = n.previousElementSibling;
            while (p) { if (/^H[1-4]$/.test(p.tagName) || p.querySelector && p.querySelector(':scope > h2, :scope > h3')) return f(p.innerText).slice(0, 80); p = p.previousElementSibling; }
            n = n.parentElement;
            if (n && n.matches && n.matches('section, .section, .sections, .current_issue')) { const h = n.querySelector(':scope > h2, :scope > h3'); if (h && !h.closest('.obj_article_summary, .obj_preprint_summary')) return f(h.innerText).slice(0, 80); }
        }
        return null;
    };
    return {
        url: location.pathname + location.search, title: document.title,
        h1: [...document.querySelectorAll('h1')].map((h) => f(h.innerText)),
        h2: [...document.querySelectorAll('.page h2, main h2, .pkp_structure_main h2')].map((h) => f(h.innerText)).slice(0, 20),
        pagination: f(document.querySelector('.cmp_pagination')?.innerText),
        summaries: [...document.querySelectorAll('.obj_article_summary, .obj_preprint_summary')].map((x) => {
            const t = x.querySelector('.title');
            const a = t && t.querySelector('a');
            const cov = x.querySelector('.cover');
            const meta = x.querySelector('.meta');
            return {
                list: ctxHeading(x),
                headingTag: t ? t.tagName : null,
                titleText: f(a ? a.innerText : t && t.innerText), subtitle: f(x.querySelector('.subtitle')?.innerText) || null, titleHref: a ? a.getAttribute('href') : null,
                cover: cov ? {href: cov.querySelector('a')?.getAttribute('href') || null, src: cov.querySelector('img')?.getAttribute('src') || null, alt: cov.querySelector('img')?.getAttribute('alt')} : null,
                authors: x.querySelector('.authors') ? f(x.querySelector('.authors').innerText) : null,
                pages: x.querySelector('.pages') ? f(x.querySelector('.pages').innerText) : null,
                published: x.querySelector('.published') ? f(x.querySelector('.published').innerText) : null,
                doi: x.querySelector('.doi') ? f(x.querySelector('.doi').innerText) : null,
                keywords: x.querySelector('.keywords') ? [...x.querySelectorAll('.keywords li')].map((l) => f(l.innerText)) : null,
                details: x.querySelector('.details') ? f(x.querySelector('.details').innerText) : null,
                metaText: meta ? f(meta.innerText) : null,
                galleys: [...x.querySelectorAll('ul.galleys_links a')].map((g) => ({t: f(g.innerText), h: g.getAttribute('href'), cls: g.className})),
                text: f(x.innerText).slice(0, 400),
            };
        }),
    };
};

// typed() (K2's helper) reads the page with GALLEYS; here the page's heading and notices are enough.
const GALLEYS = () => ({title: document.title, h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()), notices: [...document.querySelectorAll('.cmp_notification')].map((n) => n.innerText.trim())});

// The landing page's parts, in order, for the pointer rows.
const PARTS = () => {
    const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const root = document.querySelector('.obj_article_details, .obj_preprint_details');
    const part = (c) => ({cls: c.className, head: f(c.querySelector('h2, h3')?.textContent) || null, text: f(c.innerText).slice(0, 300),
        links: [...c.querySelectorAll('a')].map((a) => ({t: f(a.innerText).slice(0, 80), h: a.getAttribute('href')})).slice(0, 8)});
    const out = {url: location.pathname, title: document.title, h1: [...document.querySelectorAll('h1')].map((h) => f(h.innerText)), root: !!root};
    if (!root) { out.body = f(document.body.innerText).slice(0, 300); return out; }
    out.notices = [...document.querySelectorAll('.cmp_notification')].map((n) => f(n.innerText));
    out.aboveTitle = [...(root.querySelectorAll('.page_title, h1'))].map((h) => { const prev = []; let p = h.previousElementSibling; while (p) { prev.unshift(f(p.innerText).slice(0, 200)); p = p.previousElementSibling; } return prev; })[0] || [];
    out.main = [...(root.querySelector('.main_entry')?.children || [])].map(part);
    out.side = [...(root.querySelector('.entry_details')?.children || [])].map(part);
    // what follows the details object (plugins' footers: recommendations)
    const after = [];
    let n = root.nextElementSibling;
    while (n) { after.push({tag: n.tagName, id: n.id, cls: n.className, text: f(n.innerText).slice(0, 300)}); n = n.nextElementSibling; }
    out.afterDetails = after;
    out.similar = document.querySelector('#articlesBySimilarityList') ? {inside: !!root.contains(document.querySelector('#articlesBySimilarityList')), text: f(document.querySelector('#articlesBySimilarityList').innerText).slice(0, 300)} : null;
    out.byAuthor = document.querySelector('#articlesBySameAuthorList') ? {inside: !!root.contains(document.querySelector('#articlesBySameAuthorList')), text: f(document.querySelector('#articlesBySameAuthorList').innerText).slice(0, 300)} : null;
    return out;
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k5-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 4000)); };
    const PDF = isOPS ? 'preprint.pdf' : 'article.pdf';
    const TXT = isOPS ? 'not-an-image.txt' : 'notes.md';
    const view = isOPS ? 'preprint' : 'article';
    const strip = (u) => (u || '').replace(app.baseURL, '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u13k5');
        S.t = t;
        const u = (p, k, roles, g, fam) => ({username: `${p}${k}`, roles, givenName: g, familyName: fam});
        const cats = [{path: 'k5cat', title: 'Kay Category', children: [{path: 'k5sub', title: 'Kay Sub'}]}];
        const sub = async (ctx, key, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${key}`, context: ctx.path, submitter: ctx.u.au, ...spec});
                log('seed', key, r.submissionId, r.publicationId, JSON.stringify(r.galleys));
                return {id: r.submissionId, pub: r.publicationId, galleys: r.galleys, status: r.status};
            } catch (e) { log('seed FAILED', key, String(e.message).slice(0, 800)); return {error: String(e.message).slice(0, 800)}; }
        };
        if (isOMP) {
            const pm = `${t}m`;
            const users = [u(pm, 'mg', ['manager'], 'Mel', 'Manager'), u(pm, 'au', ['author'], 'Amy', 'Author')];
            const r = await app.api.createContext({tag: pm, context: {name: `U13 K5 press ${pm}`, acronym: 'KFIVE', contactName: 'K5 Contact', contactEmail: `${pm}c@mail.test`}, users});
            S.M = {path: r.path || pm, u: {mg: `${pm}mg`, au: `${pm}au`}};
            S.s = {book: await sub(S.M, 'book', {title: `K5 Book ${t}`, abstract: 'Book abstract.', published: true})};
        } else {
            const pc = `${t}${isOJS ? 'j' : 'p'}`;
            const users = [u(pc, 'mg', ['manager'], 'Mona', 'Manager'), u(pc, 'au', ['author'], 'Ann', 'Author'), u(pc, 'rd', ['reader'], 'Rob', 'Reader')];
            const spec = {context: {name: `U13 K5 ${isOJS ? 'journal' : 'server'} ${pc}`, acronym: 'KFIVE', contactName: 'K5 Contact', contactEmail: `${pc}c@mail.test`},
                users, categories: cats};
            if (isOJS) {
                spec.sections = [{abbrev: 'ART', title: 'Articles'}, {abbrev: 'OMT', title: 'Omitted'}];
                spec.issues = [{volume: 1, number: 1, year: 2026, published: true}];
                spec.themeOptions = {journalContentOrganization: [1, 2, 3]};
                spec.plugins = {recommendbysimilarityplugin: {enabled: true},
                    urnpubidplugin: {enabled: true, settings: {enablePublicationURN: true, enableRepresentationURN: true, enableIssueURN: true, urnPrefix: 'urn:nbn:de:0000-', urnSuffix: 'default', urnCheckNo: false, urnNamespace: 'urn:nbn:de', urnResolver: 'https://nbn-resolving.de/'}}};
            } else {
                spec.sections = [{abbrev: 'PRE', title: 'Preprints'}, {abbrev: 'OMT', title: 'Omitted', path: 'omitted'}];
            }
            let r;
            try { r = await app.api.createContext({tag: pc, ...spec}); } catch (e) { log('context FAILED', String(e.message).slice(0, 800)); throw e; }
            S.C = {path: r.path || pc, issues: r.issues || null, categories: r.categories || null, u: {mg: `${pc}mg`, au: `${pc}au`, rd: `${pc}rd`}};
            save();
            const C = S.C;
            const prod = isOJS ? {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']} : {};
            const inIssue = isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {};
            const remote = {label: 'Remote', urlRemote: app.url(`/index.php/${C.path}/about`)};
            const cover = {file: 'profile-image-400.png', altText: 'Alpha cover alt'};
            S.s = {};
            S.s.A = await sub(C, 'alpha', {...prod, title: `K5 Alpha ${t}`, subtitle: 'Alpha subtitle', abstract: 'Alpha abstract.', keywords: ['kfive', 'alpha'], categories: ['k5cat'], coverImage: cover,
                ...(isOJS ? {urlPath: 'k5-alpha'} : {}),
                galleys: [{label: 'PDF', file: PDF}, {label: 'Data', file: PDF, genre: 'Data Set'}, {label: 'Notes', file: TXT, genre: 'Other'}, remote]});
            S.s.B = isOJS
                ? await sub(C, 'beta', {...prod, title: `K5 Beta ${t}`, abstract: 'Beta abstract.', keywords: ['kfive', 'beta'], categories: ['k5cat'], galleys: [{label: 'PDF', file: PDF}, {label: 'Data', file: PDF, genre: 'Data Set'}, remote]})
                : await sub(C, 'beta', {title: `K5 Beta ${t}`, abstract: 'Beta abstract.', keywords: ['vone'], categories: ['k5cat'], published: true, galleys: [{label: 'PDF', file: PDF}]});
            S.s.C = await sub(C, 'gamma', {title: `K5 Gamma ${t}`, abstract: 'Gamma abstract.', section: 'OMT', categories: ['k5cat'], published: true, ...inIssue, galleys: [{label: 'PDF', file: PDF}]});
            if (isOJS) S.s.D = await sub(C, 'delta', {title: `K5 Delta ${t}`, abstract: 'Delta abstract.', section: 'OMT', categories: ['k5cat'], published: true, galleys: [{label: 'PDF', file: PDF}]});
        }
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const C = S.C;

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

    // --- workflow helpers (K1 k1.js, as driven there)
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
            // The panel can take longer than the POM's 5 s to open; a second press then hits the modal's overlay.
            const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Schedule For Publication|Publish)$/});
            await button.waitFor({state: 'visible', timeout: T});
            s.button = flat(await button.innerText().catch(() => null), 60);
            await sleep(800);
            await button.click();
            const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
            // A later version's "Publish" goes straight to the confirmation (its version details were set at "Create New Version").
            const which = () => Promise.race([
                panel.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: 15_000}).then(() => 'panel'),
                confirm.waitFor({state: 'visible', timeout: 15_000}).then(() => 'confirm'),
            ]).catch(() => null);
            let opened = await which();
            if (!opened) {
                s.secondPress = true;
                await button.click({timeout: 5_000}).catch(() => {});
                opened = await which();
            }
            s.opened = opened;
            await idle(page);
            if (opened === 'confirm') {
                s.confirm = flat(await confirm.innerText().catch(() => ''), 600);
                const done = waitPublish();
                await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
                const r = await done;
                s.status = r ? r.status() : null;
                await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page);
                await snap(name, {publish: s});
                return s;
            }
            await fillVersionDetailsIfPresent(panel);
            if (backIssue) {
                const back = panel.getByRole('radio', {name: 'Assign To Current/Back Issue'});
                await back.waitFor({state: 'visible', timeout: T});
                await pub.awaitAssignmentPreselected(panel).catch(() => {});
                await back.check();
                await pub.selectIssueOption(panel, backIssue);
            } else {
                const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
                if (await dontAssign.waitFor({state: 'visible', timeout: 5_000}).then(() => true).catch(() => false)) {
                    await pub.awaitAssignmentPreselected(panel).catch(() => {});
                    s.preselected = await panel.locator('input[name="assignment"]:checked').evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
                    await dontAssign.check();
                }
            }
            s.panel = flat(await panel.innerText().catch(() => ''), 1200);
            await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
            await confirm.waitFor({state: 'visible', timeout: T});
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


    // ------------------------------------------------------------------ K5's own helpers
    async function listing(url, name, extra = {}) {
        const t0 = Date.now();
        const resp = await page.goto(app.url(url)).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {}); await sleep(300);
        const d = await page.evaluate(SUMMARIES).catch((e) => ({err: String(e.message).slice(0, 200)}));
        d.status = resp && typeof resp.status === 'function' ? resp.status() : resp;
        d.who = who;
        d.console = consoleSince(t0);
        await snap(name, {listing: d, ...extra});
        return d;
    }
    async function landingParts(id, name, l = 'en') {
        const t0 = Date.now();
        const resp = await page.goto(app.url(pageOf(C.path, id, '', l))).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {}); await sleep(300);
        const d = await page.evaluate(PARTS).catch((e) => ({err: String(e.message).slice(0, 200)}));
        d.status = resp && typeof resp.status === 'function' ? resp.status() : resp;
        d.who = who;
        d.console = consoleSince(t0);
        await snap(name, {parts: d});
        return d;
    }
    const mine = (d) => (d && d.summaries ? d.summaries.filter((x) => x.titleText && x.titleText.includes(S.t)) : d);
    async function runJobs() {
        const root = path.resolve(REPO, app.root);
        try {
            return flat(execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: root, env: {...process.env, PKP_CONFIG_FILE: path.join(root, 'config.test.inc.php')}, encoding: 'utf8', timeout: 400000}), 400);
        } catch (e) { return `ERR ${flat(String(e.stdout || e.message), 400)}`; }
    }
    async function addDraftGalley(sid, pub, pre) {
        const out = {};
        out.before = await openGalleys(C.path, sid, pub, `${pre}-a-galleys`);
        await gm().waitFor({timeout: T});
        await page.getByRole('button', {name: 'Add galley', exact: true}).first().click();
        await waitForm();
        await fillField('label', 'Draft');
        out.save = await formSave();
        await wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}).catch(() => {});
        await snap(`${pre}-b-wizard-open`);
        await wizard().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(1000);
        await wizard().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page);
        out.after = await openGalleys(C.path, sid, pub, `${pre}-c-galleys-with-draft`);
        return out;
    }
    async function setDoiPrefix(pre) {
        await page.goto(app.url(`/index.php/${C.path}/management/settings/distribution`)); await idle(page);
        await page.getByRole('tab', {name: 'DOIs', exact: true}).first().click().catch(() => {});
        await idle(page); await sleep(800);
        const prefix = page.locator('input[name="doiPrefix"]').first();
        await prefix.fill('10.1234');
        const form = page.locator('form').filter({has: prefix}).first();
        const r1 = page.waitForResponse((x) => /\/api\/v1\/contexts/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const st = (await r1)?.status() ?? null;
        await snap(`${pre}-dois-saved`, {doiSave: st});
        return st;
    }
    async function addBio(sid, pub, pre) {
        const out = {};
        await openEntry(C.path, sid, pub, 'Contributors');
        const panel = page.locator('.listPanel--contributor');
        await panel.waitFor({timeout: T}).catch(() => {});
        await snap(`${pre}-a-contributors`);
        const row = panel.locator('li.listPanel__item').filter({hasText: 'Ann Author'}).first();
        await row.getByRole('button', {name: 'Edit', exact: true}).click();
        const dialog = page.getByRole('dialog').filter({has: page.locator('input[name="givenName-en"]')}).last();
        await dialog.waitFor({timeout: T});
        const country = dialog.locator('select[name="country"]');
        if (await country.count()) { await country.selectOption({label: 'Canada'}).catch(() => {}); out.country = await country.inputValue().catch(() => null); }
        const ifr = dialog.locator('iframe[id^="contributor-biography"]').first();
        await ifr.waitFor({state: 'attached', timeout: T}).catch(() => {});
        const id = (await ifr.getAttribute('id').catch(() => '') || '').replace(/_ifr$/, '');
        out.bioId = id;
        if (id) {
            await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
            await page.frameLocator(`#${id}_ifr`).locator('body').click();
            await page.keyboard.type('Ann writes about listings.');
            await sleep(300);
        }
        await snap(`${pre}-b-contributor-bio-typed`);
        const saved = page.waitForResponse((r) => r.url().includes('/contributors') && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        out.status = (await saved)?.status() ?? null;
        out.errors = await dialog.locator('.pkpFieldError, .pkpFormPage__errors, [role="alert"]').allInnerTexts().catch(() => []);
        await dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
        return out;
    }
    async function addFunder(sid, pub, pre) {
        const out = {};
        try {
            const {FundingScreen, stubRegistrySearch} = require(path.join(app.suiteDir, 'pages', 'FundingPages.js'));
            await stubRegistrySearch(page);
            await openEntry(C.path, sid, pub, 'Funding');
            const fs2 = new FundingScreen(page);
            await fs2.addFunder('Kay Funder', {grants: [{grantName: 'Kay Grant', grantNumber: 'K-5'}]}).catch(async (e) => {
                out.grantErr = String(e.message).slice(0, 200);
                await fs2.addFunder('Kay Funder');
            });
            out.ok = true;
        } catch (e) { out.err = String(e.message).slice(0, 300); }
        await snap(`${pre}-funding`);
        return out;
    }

    // ============================================================ sections: Settings 10 ("Omit author names…")
    if (on('sections') && !isOMP) await sect('sections', async () => {
        const out = {};
        await as(C.u.mg, C.path);
        await page.goto(app.url(`/index.php/${C.path}/en/management/settings/context`)); await idle(page);
        await page.getByRole('tab', {name: /^Sections$/}).first().click(); await idle(page);
        const grid = page.locator('#sectionsGridContainer');
        await grid.locator('tr.gridRow').first().waitFor({timeout: T});
        out.grid = flat(await grid.innerText(), 400);
        await snap('s-01-sections-grid', {grid: out.grid});
        const openEdit = async () => {
            const row = grid.locator('tr.gridRow').filter({hasText: 'Omitted'}).first();
            const tog = row.locator('a.show_extras');
            if (await tog.count()) { await tog.first().click(); await sleep(300); }
            const rowId = await row.getAttribute('id');
            await page.locator(`tr#${rowId} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
            const form = page.locator('form#sectionForm');
            await form.locator('input[name="title[en]"], input[name^="title"]').first().waitFor({timeout: T});
            await idle(page); await sleep(500);
            return form;
        };
        let form = await openEdit();
        out.boxes = await form.locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, label: ((e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || e.parentElement).innerText || '').replace(/\s+/g, ' ').trim()})));
        const box = form.locator('input[name="hideAuthor"]');
        out.hasBox = await box.count();
        await snap('s-02-section-form', {boxes: out.boxes});
        if (out.hasBox) {
            await loc(page, 'Sections › Edit: "Omit author names…" input[name="hideAuthor"]', box);
            // leave once with the box changed and unsaved: the window's "Close"
            await box.check();
            const t0 = Date.now();
            await page.locator('[role="dialog"]:visible').filter({has: form}).getByRole('button', {name: 'Close'}).first().click().catch(async () => { await page.getByRole('button', {name: 'Close'}).last().click().catch(() => {}); });
            await sleep(1500);
            out.closeDialogs = dialogsSince(t0);
            out.formAfterClose = await form.isVisible().catch(() => null);
            await snap('s-03-section-form-closed-unsaved', {closeDialogs: out.closeDialogs});
            if (out.formAfterClose) { await page.reload(); await idle(page); await page.getByRole('tab', {name: /^Sections$/}).first().click(); await idle(page); await grid.locator('tr.gridRow').first().waitFor({timeout: T}); }
            await sleep(600);
            form = await openEdit();
            out.afterCloseChecked = await form.locator('input[name="hideAuthor"]').isChecked();
            await form.locator('input[name="hideAuthor"]').check();
            const w = page.waitForResponse((r) => r.request().method() === 'POST' && /section/i.test(r.url()), {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await w;
            out.saveStatus = r ? r.status() : null;
            await form.waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
            await idle(page);
            form = await openEdit();
            out.reopenedChecked = await form.locator('input[name="hideAuthor"]').isChecked();
            await snap('s-04-section-form-reopened', {reopenedChecked: out.reopenedChecked});
            await page.locator('[role="dialog"]:visible').getByRole('button', {name: 'Close'}).first().click().catch(() => {});
            await sleep(800);
        }
        S.hideAuthorTicked = !!out.reopenedChecked; save();
        fact('sections', out);
    });

    // ============================================================ prep: A decorated on screen and published; DOI prefix
    if (on('prep') && !isOMP && !S.aPublished) await sect('prep', async () => {
        const out = {};
        const A = S.s.A;
        await as(C.u.mg, C.path);
        if (!S.doiPrefix) { out.doi = await setDoiPrefix('p-01'); S.doiPrefix = true; save(); }
        if (!S.aDraft) { out.draft = await addDraftGalley(A.id, A.pub, 'p-02-a-draft'); S.aDraft = true; save(); }
        if (!S.aBio) { out.bio = await addBio(A.id, A.pub, 'p-03-a'); S.aBio = true; save(); }
        if (!S.aFunder) { out.funder = await addFunder(A.id, A.pub, 'p-04-a'); S.aFunder = true; save(); }
        if (isOJS && !S.aSettings) {
            // Publication Settings: the issue and "Pages"
            await openEntry(C.path, A.id, A.pub, 'Publication Settings');
            const back = page.getByRole('radio', {name: 'Assign To Current/Back Issue'}).first();
            if (await back.isVisible().catch(() => false)) {
                await back.check();
                const sel = page.locator('select[name="issueId"]').first();
                await sel.waitFor({state: 'visible', timeout: T}).catch(() => {});
                const opt = sel.locator('option').filter({hasText: /Vol\. 1 No\. 1/}).first();
                const v = await opt.getAttribute('value').catch(() => null);
                if (v) await sel.selectOption(v);
            }
            const pages = page.locator('input[name="pages"]').first();
            out.pagesBox = await pages.count();
            if (out.pagesBox) { await pages.fill('12-34'); await pages.press('Tab').catch(() => {}); }
            out.settingsSave = await pressSave();
            await snap('p-05-a-publication-settings', {save: out.settingsSave});
            await loc(page, 'Publication Settings: "Pages" input[name="pages"]', pages);
            // URN: "Assign" then "Save"
            await openEntry(C.path, A.id, A.pub, 'Identifiers');
            const assign = wf().locator('.pkpFormField').filter({hasText: 'URN'}).first().getByRole('button', {name: 'Assign', exact: true});
            out.urnAssign = await assign.count();
            if (out.urnAssign) { await assign.click(); await sleep(500); out.urnSave = await pressSave(); }
            await snap('p-06-a-identifiers', {urn: out.urnSave});
            // JATS: upload and "Make available with publication"
            await page.goto(wfUrl(C.path, A.id, `publication_${A.pub}_jats`)); await idle(page); await sleep(1500);
            await snap('p-07-a-jats-before');
            try {
                const [chooser] = await Promise.all([
                    page.waitForEvent('filechooser', {timeout: 15000}),
                    page.locator('.jatsPanel').getByRole('button', {name: /^(Upload|Replace|Upload JATS)/}).first().click(),
                ]);
                const resp = page.waitForResponse((r) => /\/jats(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000}).catch(() => null);
                await chooser.setFiles(path.join(REPO, 'shared/playwright/checks/U46/K3/jats-A.xml'));
                out.jatsUpload = (await resp)?.status() ?? null;
                await idle(page); await sleep(1500);
            } catch (e) { out.jatsUploadErr = String(e.message).slice(0, 200); }
            const pub = page.getByRole('checkbox', {name: 'Make available with publication'}).first();
            out.jatsBox = await pub.count();
            if (out.jatsBox) {
                await page.locator('label').filter({hasText: 'Make available with publication'}).first().click();
                const dlg = page.getByRole('dialog').filter({hasText: /JATS XML Download/}).last();
                await dlg.waitFor({timeout: 10000}).catch(() => {});
                out.jatsDialog = flat(await dlg.innerText().catch(() => null), 300);
                const vis = page.waitForResponse((r) => /\/jats\/visibility/.test(r.url()), {timeout: T}).catch(() => null);
                await dlg.getByRole('button', {name: 'Confirm', exact: true}).click().catch(() => {});
                out.jatsVisibility = (await vis)?.status() ?? null;
                await sleep(800);
                out.jatsBoxChecked = await pub.isChecked().catch(() => null);
            }
            await snap('p-08-a-jats-after', {jats: {upload: out.jatsUpload, vis: out.jatsVisibility, checked: out.jatsBoxChecked}});
            S.aSettings = true; save();
        }
        await page.goto(wfUrl(C.path, A.id, `publication_${A.pub}_titleAbstract`)); await idle(page); await sleep(800);
        out.publish = await publishNow('p-09-a-published', isOJS ? {backIssue: /Vol\. 1 No\. 1/} : {});
        S.aPublished = true; save();
        fact('prep', out);
    });

    // ============================================================ prepb: B (OJS: Draft + no issue; OPS: a second version)
    if (on('prepb') && !isOMP && !S.bDone) await sect('prepb', async () => {
        const out = {};
        const B = S.s.B;
        await as(C.u.mg, C.path);
        if (isOJS) {
            if (!S.bDraft) { out.draft = await addDraftGalley(B.id, B.pub, 'q-01-b-draft'); S.bDraft = true; save(); }
            await page.goto(wfUrl(C.path, B.id, `publication_${B.pub}_titleAbstract`)); await idle(page); await sleep(800);
            out.publish = await publishNow('q-02-b-published-no-issue');
        } else {
            if (!S.b2) {
                await page.goto(wfUrl(C.path, B.id, `publication_${B.pub}_titleAbstract`)); await idle(page); await sleep(800);
                out.version = await createNewVersion('q-01-b-create-v2');
                S.b2 = out.version.newPub; save();
            }
            await openEntry(C.path, B.id, S.b2, 'Metadata');
            const rm = page.getByRole('button', {name: 'Remove vone'}).first();
            if (await rm.isVisible().catch(() => false)) await rm.click();
            const kw = page.locator('[id="metadata-keywords-control-en"]');
            await kw.click(); await kw.pressSequentially('vtwo', {delay: 20}); await sleep(800); await kw.press('Enter');
            await page.getByRole('button', {name: 'Remove vtwo'}).first().waitFor({timeout: 10_000}).catch(() => {});
            out.kwSave = await pressSave();
            await snap('q-02-b-v2-metadata', {kwSave: out.kwSave});
            await page.goto(wfUrl(C.path, B.id, `publication_${S.b2}_titleAbstract`)); await idle(page); await sleep(800);
            out.publish = await publishNow('q-03-b-v2-posted');
        }
        S.bDone = true; save();
        fact('prepb', out);
    });

    // ============================================================ bio: E, with a Bio Statement (row 79), published on screen
    if (on('bio') && !isOMP && !S.eDone) await sect('bio', async () => {
        const out = {};
        if (!S.s.E) {
            const prod = isOJS ? {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']} : {};
            const r = await app.api.createSubmission({tag: `${S.t}eps`, context: C.path, submitter: C.u.au, title: `K5 Epsilon ${S.t}`, abstract: 'Epsilon abstract.', ...prod, galleys: [{label: 'PDF', file: PDF}]});
            S.s.E = {id: r.submissionId, pub: r.publicationId}; save();
        }
        const E = S.s.E;
        await as(C.u.mg, C.path);
        out.bio = await addBio(E.id, E.pub, 'b-01-e');
        await snap('b-02-e-contributors-after', {bio: out.bio});
        await page.goto(wfUrl(C.path, E.id, `publication_${E.pub}_titleAbstract`)); await idle(page); await sleep(800);
        out.publish = await publishNow('b-03-e-published');
        await visitor();
        out.parts = await landingParts(E.id, 'b-04-e-landing-visitor');
        S.eDone = true; save();
        fact('bio', {bio: out.bio, publish: out.publish && out.publish.status, main: out.parts.main && out.parts.main.map((x) => `${x.cls} | ${x.head} | ${x.text.slice(0, 120)}`)});
    });

    // ============================================================ theme (OJS): the home page without the current issue's table of contents
    if (on('theme') && isOJS) await sect('theme', async () => {
        const out = {};
        const box = (panel, name) => panel.getByRole('checkbox', {name, exact: true});
        const openTheme = async () => {
            await page.goto(app.url(`/index.php/${C.path}/management/settings/website`)); await idle(page);
            const top = page.locator('#appearance-button').first();
            if ((await top.getAttribute('aria-selected')) !== 'true') { await top.click(); await idle(page); }
            const side = page.locator('#theme-button').first();
            if ((await side.getAttribute('aria-selected')) !== 'true') { await side.click(); await idle(page); }
            await sleep(500);
            const panel = page.locator('[role="tabpanel"]#theme').first();
            await panel.locator('.pkpFormField').first().waitFor({timeout: T});
            return panel;
        };
        const saveTheme = async (panel) => {
            const w = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+\/theme/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await panel.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await w;
            await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 10000}).catch(() => {});
            return r ? r.status() : null;
        };
        await as(C.u.mg, C.path);
        let panel = await openTheme();
        const TOC = "Include the current issue's table of contents";
        out.before = await box(panel, TOC).isChecked().catch(() => null);
        await box(panel, TOC).setChecked(false);
        out.saveOff = await saveTheme(panel);
        await snap('t-01-theme-toc-off', {saveOff: out.saveOff});
        await visitor();
        out.homeNoToc = await listing(`/index.php/${C.path}/en`, 't-02-home-no-toc-visitor');
        // press the latest list's "Draft" and "Data" on B
        const sumB = page.locator('.obj_article_summary').filter({has: page.locator('.title', {hasText: `K5 Beta ${S.t}`})}).first();
        out.labels = (await sumB.locator('ul.galleys_links a').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
        const draft = sumB.locator('ul.galleys_links a').filter({hasText: /^\s*Draft\s*$/}).first();
        if (await draft.count()) out.draft = await press(draft, 't-03-home-no-toc-press-draft');
        await page.goto(app.url(`/index.php/${C.path}/en`)); await idle(page);
        const data = page.locator('.obj_article_summary').filter({has: page.locator('.title', {hasText: `K5 Beta ${S.t}`})}).first().locator('ul.galleys_links a').filter({hasText: /^\s*Data\s*$/}).first();
        if (await data.count()) out.data = await press(data, 't-04-home-no-toc-press-data');
        // back on, as it was
        await as(C.u.mg, C.path);
        panel = await openTheme();
        await box(panel, TOC).setChecked(true);
        out.saveOn = await saveTheme(panel);
        await visitor();
        out.homeTocAgain = await listing(`/index.php/${C.path}/en`, 't-05-home-toc-again-visitor');
        const g = (d) => (mine(d) || []).map((x) => `${x.list} | ${x.titleText.slice(0, 9)} | ${x.galleys.map((y) => y.t).join(',')}`);
        fact('theme', {before: out.before, saveOff: out.saveOff, saveOn: out.saveOn, noToc: g(out.homeNoToc), h2NoToc: out.homeNoToc.h2, labels: out.labels,
            draft: out.draft && {kind: out.draft.kind, after: out.draft.after, title: out.draft.title, chain: out.draft.chain, body: out.draft.bodyStart}, data: out.data && {kind: out.data.kind, file: out.data.file, after: out.data.after}, tocAgain: g(out.homeTocAgain)});
    });

    // ============================================================ jobs: the search index (queued at publish)
    if (on('jobs') && !isOMP) await sect('jobs', async () => {
        fact('jobs', {out: await runJobs()});
    });

    // ============================================================ read: every listing, three levels; the landing parts
    if (on('read') && !isOMP) await sect('read', async () => {
        const out = {};
        const ids = Object.fromEntries(Object.entries(S.s).map(([k, v]) => [k, v.id]));
        const readAll = async (lvl) => {
            const r = {};
            r.home = await listing(`/index.php/${C.path}/en`, `r-${lvl}-01-home`);
            if (isOJS) {
                const iid = C.issues && C.issues[0] && C.issues[0].id;
                r.toc = await listing(`/index.php/${C.path}/en/issue/view/${iid}`, `r-${lvl}-02-issue-toc`);
                r.cat = await listing(`/index.php/${C.path}/en/catalog/category/k5cat`, `r-${lvl}-03-category`);
                r.sub = await listing(`/index.php/${C.path}/en/catalog/category/k5sub`, `r-${lvl}-04-subcategory`);
            } else {
                r.preprints = await listing(`/index.php/${C.path}/en/preprints`, `r-${lvl}-02-preprints`);
                r.sectionOmt = await listing(`/index.php/${C.path}/en/preprints/section/omitted`, `r-${lvl}-03-section-omitted`);
                r.cat = await listing(`/index.php/${C.path}/en/preprints/category/k5cat`, `r-${lvl}-04-category`);
            }
            // search: the Search page's own form
            await page.goto(app.url(`/index.php/${C.path}/en/search/search`)); await idle(page);
            const q = page.locator('input[name="query"]').first();
            await q.fill(S.t);
            await Promise.all([page.waitForNavigation({timeout: T}).catch(() => null), q.press('Enter')]);
            await idle(page);
            r.search = await page.evaluate(SUMMARIES);
            await snap(`r-${lvl}-05-search`, {listing: r.search});
            return r;
        };
        await visitor();
        out.visitor = await readAll('v');
        await loc(page, 'Listing: one summary .obj_article_summary / .obj_preprint_summary', page.locator('.obj_article_summary, .obj_preprint_summary'));
        await loc(page, 'Listing: summary galley links ul.galleys_links a', page.locator('ul.galleys_links a'));
        // the landing pages behind the summaries (pointer rows)
        out.partsA = await landingParts(ids.A, 'r-v-06-a-landing');
        out.partsB = await landingParts(ids.B, 'r-v-07-b-landing');
        await as(C.u.rd, C.path);
        out.reader = await readAll('r');
        await as(C.u.mg, C.path);
        out.manager = await readAll('m');
        const brief = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, {status: v.status, h1: v.h1, pagination: v.pagination, mine: mine(v)}]));
        fact('read', {visitor: brief(out.visitor), reader: brief(out.reader), manager: brief(out.manager), partsA: out.partsA, partsB: out.partsB});
    });

    // ============================================================ press: the summary's controls, as a visitor
    if (on('press') && !isOMP) await sect('press', async () => {
        const out = {};
        await visitor();
        const sumOf = (title) => page.locator('.obj_article_summary, .obj_preprint_summary').filter({has: page.locator('.title', {hasText: title})}).first();
        const homeUrl = `/index.php/${C.path}/en`;
        const A = `K5 Alpha ${S.t}`;
        const B = `K5 Beta ${S.t}`;
        const goHome = async () => { await page.goto(app.url(homeUrl)); await idle(page); };
        const listWith = isOJS ? B : A; // the home page's latest list holds B on a journal (no issue), A on a server
        // title, cover
        await goHome();
        out.title = await press(sumOf(listWith).locator('.title a'), 'x-01-home-press-title');
        await goHome();
        // the cover: what sits at its centre, then a press there and a press near its top edge, as a pointer does
        const coverA = sumOf(A).locator('.cover a').first();
        if (await coverA.count()) {
            const geo = await sumOf(A).evaluate((x) => {
                const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)}; };
                const img = x.querySelector('.cover img');
                const b = img.getBoundingClientRect();
                const at = (px, py) => { const e = document.elementFromPoint(px, py); return e ? `${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ').join('.') : ''}` : null; };
                return {cover: r(img), keywords: r(x.querySelector('.keywords')), meta: r(x.querySelector('.meta')), galleys: r(x.querySelector('ul.galleys_links')),
                    atCentre: at(b.x + b.width / 2, b.y + b.height / 2), atTop: at(b.x + b.width / 2, b.y + 5), atBottom: at(b.x + b.width / 2, b.y + b.height - 5)};
            });
            out.coverGeo = geo;
            await snap('x-02-home-cover-geometry', {geo});
            const pressAt = async (px, py, name) => {
                const before = page.url();
                const nav = page.waitForURL((x) => x.href !== before, {timeout: 6000}).then(() => true, () => false);
                await page.mouse.click(px, py);
                const moved = await nav;
                await idle(page).catch(() => {});
                const r = {at: [px, py], moved, after: strip(page.url())};
                await snap(name, {press: r});
                return r;
            };
            await coverA.scrollIntoViewIfNeeded();
            const g2 = await coverA.locator('img').boundingBox();
            out.coverCentre = await pressAt(g2.x + g2.width / 2, g2.y + g2.height / 2, 'x-02b-home-press-cover-centre');
            await goHome(); await coverA.scrollIntoViewIfNeeded();
            const g3 = await coverA.locator('img').boundingBox();
            out.coverTop = await pressAt(g3.x + g3.width / 2, g3.y + 5, 'x-02c-home-press-cover-top');
        }
        // each galley link of the list item that carries "Draft"
        await goHome();
        const labels = await sumOf(listWith).locator('ul.galleys_links a').allInnerTexts().catch(() => []);
        out.labels = labels.map((x) => flat(x, 60));
        out.galleys = [];
        for (let i = 0; i < labels.length; i++) {
            await goHome();
            const link = sumOf(listWith).locator('ul.galleys_links a').nth(i);
            out.galleys.push(await press(link, `x-03-home-press-galley-${i + 1}`));
        }
        if (isOJS) {
            // the table of contents' Draft (expected absent) and the issue list's A title
            const iid = C.issues && C.issues[0] && C.issues[0].id;
            await page.goto(app.url(`/index.php/${C.path}/en/issue/view/${iid}`)); await idle(page);
            out.tocLabels = (await sumOf(A).locator('ul.galleys_links a').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
            out.tocTitle = await press(sumOf(A).locator('.title a'), 'x-04-toc-press-title-a');
            // category page title and search result title
            await page.goto(app.url(`/index.php/${C.path}/en/catalog/category/k5cat`)); await idle(page);
            out.catTitle = await press(sumOf(A).locator('.title a'), 'x-05-category-press-title-a');
        } else {
            await page.goto(app.url(`/index.php/${C.path}/en/preprints`)); await idle(page);
            out.preprintsLabels = (await sumOf(A).locator('ul.galleys_links a').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
            out.preprintsTitle = await press(sumOf(A).locator('.title a'), 'x-04-preprints-press-title-a');
            // the cover on the "Archives" page too: what sits at its centre
            await page.goto(app.url(`/index.php/${C.path}/en/preprints`)); await idle(page);
            await sumOf(A).locator('.cover img').scrollIntoViewIfNeeded().catch(() => {});
            out.archivesCoverAtCentre = await sumOf(A).evaluate((x) => { const b = x.querySelector('.cover img').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e ? `${e.tagName.toLowerCase()}.${String(e.className)}` : null; }).catch((e) => String(e.message).slice(0, 100));
            await snap('x-05-preprints-cover-centre', {atCentre: out.archivesCoverAtCentre});
        }
        fact('press', out);
    });

    // ============================================================ relation (OPS, 367–369): "published elsewhere"
    if (on('relation') && isOPS) await sect('relation', async () => {
        const out = {};
        const Cc = S.s.C;
        await as(C.u.mg, C.path);
        await page.goto(wfUrl(C.path, Cc.id, `publication_${Cc.pub}_titleAbstract`)); await idle(page); await sleep(1000);
        const dd = page.getByRole('button', {name: /^Relations/}).first();
        out.offered = await dd.count();
        await snap('y-01-workflow-relations-button');
        if (out.offered) {
            await dd.click(); await sleep(800);
            await snap('y-02-relations-open');
            const pubd = page.getByRole('radio', {name: 'This preprint has been published elsewhere.'}).first();
            out.options = await page.locator('input[name="relationStatus"]').evaluateAll((els) => els.map((e) => ((e.closest('label') || e.parentElement).innerText || '').trim())).catch(() => []);
            if (await pubd.count()) {
                await pubd.check();
                const doi = page.locator('input[name="vorDoi"]').first();
                if (await doi.isVisible().catch(() => false)) {
                    await doi.fill('10.1234/elsewhere');
                    const w0 = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await page.locator('.pkpWorkflow__publicationRelation').getByRole('button', {name: 'Save', exact: true}).first().click().catch(() => {});
                    out.bareDoiSave = (await w0)?.status() ?? null;
                    await sleep(800);
                    out.bareDoiErrors = await page.locator('.pkpWorkflow__publicationRelation .pkpFieldError').allInnerTexts().catch(() => []);
                    await snap('y-03a-relations-bare-doi-refused', {save: out.bareDoiSave, errors: out.bareDoiErrors});
                    await doi.fill('https://doi.org/10.1234/elsewhere');
                }
                const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await page.locator('.pkpWorkflow__publicationRelation').getByRole('button', {name: 'Save', exact: true}).first().click().catch(() => {});
                out.save = (await w)?.status() ?? null;
                await sleep(800);
                await snap('y-03-relations-saved', {save: out.save});
            }
        }
        await visitor();
        out.page = await landingParts(Cc.id, 'y-04-c-landing-visitor');
        fact('relation', {offered: out.offered, options: out.options, bareDoiSave: out.bareDoiSave, bareDoiErrors: out.bareDoiErrors, save: out.save, notices: out.page.notices, aboveTitle: out.page.aboveTitle, h1: out.page.h1});
    });

    // ============================================================ crossmark (OJS, line 34): the Crossmark button's place, set up on screen
    if (on('crossmark') && !isOMP) await sect('crossmark', async () => {
        const out = {};
        await as(C.u.mg, C.path);
        await gotoPlugins(C.path);
        out.rows = await pluginRead(['crossrefplugin']);
        if (out.rows.crossrefplugin && !out.rows.crossrefplugin.checked) out.enable = await setPlugin('crossrefplugin', true);
        await snap('c-01-plugins-crossref', {rows: out.rows, enable: out.enable});
        await page.goto(app.url(`/index.php/${C.path}/management/settings/distribution`)); await idle(page);
        await page.getByRole('tab', {name: 'DOIs', exact: true}).first().click().catch(() => {});
        await idle(page); await sleep(800);
        const reg = page.getByRole('tab', {name: 'Registration', exact: true}).first();
        out.regTab = await reg.count();
        if (out.regTab) {
            await reg.click(); await idle(page); await sleep(800);
            const panel = page.locator('[role="tabpanel"]:visible').filter({has: page.locator('select, input')}).last();
            out.fields = await panel.locator('input, select, textarea').evaluateAll((els) => els.map((e) => ({name: e.name, type: e.type, value: e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value, label: ((e.closest('.pkpFormField') || e.parentElement).querySelector('label, legend') || {}).innerText || null}))).catch(() => []);
            await snap('c-02-registration-tab', {fields: out.fields});
            const agency = page.locator('select[name="registrationAgency"]').first();
            if (await agency.count()) {
                const opts = await agency.locator('option').allInnerTexts();
                out.agencyOptions = opts;
                const cr = opts.find((o) => /crossref/i.test(o));
                if (cr) await agency.selectOption({label: cr});
                await idle(page); await sleep(800);
            } else {
                const r = page.getByRole('radio', {name: /Crossref/i}).first();
                if (await r.count()) await r.check().catch(() => {});
                await idle(page); await sleep(800);
            }
            const fill = async (name, v) => { const el = page.locator(`input[name="${name}"]:visible`).first(); if (await el.count()) { await el.fill(v); return true; } return false; };
            out.filled = {name: await fill('depositorName', 'K5 Depositor'), email: await fill('depositorEmail', 'k5.depositor@mail.test'), username: await fill('username', ''), policy: await fill('updatePolicyDoi', '10.1234/policy')};
            const cm = page.locator('input[name="crossmark"]').first();
            out.crossmarkBox = await cm.count();
            if (out.crossmarkBox) {
                const lab = page.locator('label').filter({has: cm}).first();
                if (!(await cm.isChecked())) { if (await lab.count()) await lab.click(); else await cm.check({force: true}); }
                out.crossmarkChecked = await cm.isChecked();
                await sleep(500);
                out.filled.policyAfterTick = await fill('updatePolicyDoi', '10.1234/policy');
            }
            await snap('c-03-registration-filled', {filled: out.filled, cm: out.crossmarkChecked});
            const form = page.locator('form:visible').filter({has: page.locator('input[name="depositorName"], select[name="registrationAgency"]')}).last();
            const w = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click().catch((e) => { out.saveErr = String(e.message).slice(0, 200); });
            const r = await w;
            out.save = r ? r.status() : null;
            await sleep(800);
            out.errors = await page.locator('.pkpFieldError').allInnerTexts().catch(() => []);
            await snap('c-04-registration-saved', {save: out.save, errors: out.errors});
        }
        await visitor();
        out.parts = await landingParts(S.s.A.id, 'c-05-a-landing-crossmark');
        out.crossmark = await page.evaluate(() => { const c = document.querySelector('.crossmark, section.crossmark, [data-target="crossmark"]'); if (!c) return null; const side = document.querySelector('.entry_details'); const items = [...(side ? side.children : [])].map((x) => x.className); return {cls: c.className, inSide: !!(side && side.contains(c)), sideOrder: items, text: c.innerText.trim().slice(0, 80), img: !!c.querySelector('img')}; });
        await loc(page, 'Landing page: Crossmark block', page.locator('section.crossmark, .crossmark'));
        fact('crossmark', {rows: out.rows, enable: out.enable && out.enable.status, regTab: out.regTab, agencyOptions: out.agencyOptions, filled: out.filled, crossmarkBox: out.crossmarkBox, crossmarkChecked: out.crossmarkChecked, save: out.save, errors: out.errors, crossmark: out.crossmark, side: out.parts.side && out.parts.side.map((x) => x.cls)});
    });

    // ============================================================ pk (OJS, read-only): the seeded sections' box and the seeded home page
    if (on('pk') && isOJS) await sect('pk', async () => {
        const out = {sections: {}};
        await as('manager.maya', 'publicknowledge');
        for (const title of ['Articles', 'Reviews']) {
            await page.goto(app.url('/index.php/publicknowledge/en/management/settings/context')); await idle(page);
            await page.getByRole('tab', {name: /^Sections$/}).first().click(); await idle(page);
            const grid = page.locator('#sectionsGridContainer');
            await grid.locator('tr.gridRow').first().waitFor({timeout: T});
            const row = grid.locator('tr.gridRow').filter({hasText: title}).first();
            const tog = row.locator('a.show_extras');
            if (await tog.count()) { await tog.first().click(); await sleep(300); }
            const rowId = await row.getAttribute('id');
            await page.locator(`tr#${rowId} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
            const form = page.locator('form#sectionForm');
            await form.locator('input[name="hideAuthor"]').waitFor({timeout: T});
            out.sections[title] = await form.locator('input[name="hideAuthor"]').isChecked();
            await snap(`k-01-pk-section-${title.toLowerCase()}`, {hideAuthor: out.sections[title]});
            await form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
            await sleep(800);
        }
        await visitor();
        await page.goto(app.url('/index.php/publicknowledge/en')); await idle(page);
        out.home = await page.evaluate(() => ({h2: [...document.querySelectorAll('h2')].map((h) => h.innerText.trim()), latest: !!document.querySelector('.latest_articles'), currentIssue: !!document.querySelector('.current_issue')}));
        await snap('k-02-pk-home-visitor', {home: out.home});
        fact('pk', out);
    });

    // ============================================================ omp: the press's control (line 12, 35; the summary on a press)
    if (on('omp') && isOMP) await sect('omp', async () => {
        const out = {};
        const M = S.M;
        const bk = S.s.book;
        await visitor();
        await page.goto(app.url(`/index.php/${M.path}/en`)); await idle(page);
        out.home = await page.evaluate(() => ({h2: [...document.querySelectorAll('h2')].map((h) => h.innerText.trim()), summaries: document.querySelectorAll('.obj_article_summary, .obj_preprint_summary').length, monographs: [...document.querySelectorAll('.obj_monograph_summary')].map((x) => x.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))}));
        await snap('z-01-press-home', {home: out.home});
        await page.goto(app.url(`/index.php/${M.path}/en/catalog`)); await idle(page);
        out.catalog = await page.evaluate(() => ({summaries: document.querySelectorAll('.obj_article_summary, .obj_preprint_summary').length, monographs: [...document.querySelectorAll('.obj_monograph_summary')].map((x) => ({text: x.innerText.replace(/\s+/g, ' ').trim().slice(0, 200), href: x.querySelector('a')?.getAttribute('href')}))}));
        await snap('z-02-press-catalog', {catalog: out.catalog});
        out.articleAddress = await typed(`/index.php/${M.path}/en/article/view/${bk.id}`, 'z-03-press-article-address');
        await page.goto(app.url(`/index.php/${M.path}/en/catalog/book/${bk.id}`)); await idle(page);
        out.book = await page.evaluate(() => ({h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()), cls: document.querySelector('.obj_monograph_full') ? 'obj_monograph_full' : null, details: !!document.querySelector('.obj_article_details, .obj_preprint_details')}));
        await snap('z-04-press-book-page', {book: out.book});
        fact('omp', {home: out.home, catalog: out.catalog, articleAddress: {status: out.articleAddress.status, finalUrl: out.articleAddress.finalUrl, title: out.articleAddress.title, body: out.articleAddress.bodyStart}, book: out.book});
    });

    await signOut(page).catch(() => {});
    await close();
});
