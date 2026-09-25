// U48 claim check, chunk K2: the published "JATS XML" and versions. Spec docs/specs/U48-jats-and-body-text.md:
// Actors rows 54–55, Rules 10–13 (158–189), Settings bullets 1–2 (270–286), register A4, A8, A9; footnotes
// e, m, u, d12–d15, d25–d27, f-a4, f-a8, f-a9.
//
//   PROBE_FEATURE=U48 PROBE_AGENT=ccK2 node bin/probe.js ojs shared/playwright/checks/U48/K2/k2.js
//   PROBE_FEATURE=U48 PROBE_AGENT=ccK2 ONLY=omp,ops node bin/probe.js all shared/playwright/checks/U48/K2/k2.js
//   PHASES=seed,access,link,preview,cache,stale,urlpath,fresh,prevau,rerun,versions,ver2,media,bodyleave,plugin,edplug,restrict,
//   control (default all, in that order: later phases read the state earlier ones leave; state in k2-state-<app>.json in
//   the output folder; delete it for a fresh seed). Phases mutate their submissions: rerun from a fresh seed. The OJS run outlasts the Bash cap: run it
//   detached (nohup … & echo $! > pid).
//
// Scratch contexts (OJS; OMP and OPS one scratch press / server each as the read-only absence control):
//   J1  users mgr (manager), ed (editor), au, au2 (author), rd (reader).
//       p1 published, PDF, box ticked, generated XML        → Rule 10 name/content, per-role download, untick (d12)
//       p2 published, PDF, box ticked, article.xml uploaded  → Rule 10 uploaded content
//       p3 published, no galley, box ticked                 → link placement without galleys
//       p4 published, PDF, box ticked                       → Rule 12 / A8 (d14)
//       p5 published, PDF, no jats key                      → the box's default, link absent
//       p6 published, PDF, box ticked                       → A9 URL path (d27), both ends
//       q1 Production, PDF, box ticked                      → Rule 11 Preview and roles (d13)
//       q2 Production, box ticked, article.xml uploaded     → Rule 12 Delete / Upload start afresh (preview route)
//       q3 Production, box ticked                           → a preview download, then publish: what readers get
//       v1 Production, PDF, box ticked, article.xml         → Rule 13 / A4 (d15): Body Text, publish, new version
//       v2 published, box ticked, generated                 → Rule 13 second sentence
//   J2  restrictArticleAccess on; users mgr, rd, au; r1 published, PDF, box ticked (d26)
//   J3  "JATS Template Plugin" off; users mgr, ed, se, au; s1 published PDF box ticked, s2 Production (d25)
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'access', 'link', 'preview', 'cache', 'stale', 'urlpath', 'fresh', 'prevau', 'rerun', 'versions', 'ver2', 'media', 'bodyleave', 'plugin', 'edplug', 'restrict', 'control'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

function xmlFacts(x) {
    const m = x.match(/<article-title[^>]*>([\s\S]*?)<\/article-title>/);
    const bodyM = x.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    return {
        len: x.length,
        title: m ? flat(m[1], 200) : null,
        fixture: /A JATS fixture article/.test(x),
        replacement: /K2 replacement JATS/.test(x),
        pubDate: (x.match(/<pub-date[^>]*>[\s\S]*?<\/pub-date>/g) || []).map((s) => flat(s, 200)),
        body: bodyM ? flat(bodyM[1], 300) : null,
        head: flat(x.slice(0, 160), 160),
    };
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k2-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u48k2');
        S.t = t;
        const U = (p, k, role, g, f) => ({username: `${p}${k}`, roles: [role], givenName: g, familyName: f});
        const ctxBase = (p, name) => ({name: `U48 K2 ${name} ${p}`, acronym: 'KTWO', contactName: 'K2 Contact', contactEmail: `${p}c@mail.test`});
        const sub = async (ctx, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctx.path, submitter: ctx.u.au, title: `K2 ${k} Quokka ${t}`, ...spec});
                log('seed', k, r.submissionId, r.publicationId, r.stageId, JSON.stringify(r.jats));
                return {id: r.submissionId, pub: r.publicationId, title: `K2 ${k} Quokka ${t}`, jats: r.jats || null};
            } catch (e) { log('seed FAILED', k, String(e.message).slice(0, 700)); return {error: String(e.message).slice(0, 700)}; }
        };
        S.s = {};
        if (isOJS) {
            const PDF = 'article.pdf';
            const prod = {decisions: ['skipExternalReview', 'sendToProduction']};
            const gal = {galleys: [{label: 'PDF', file: PDF}]};
            const p1 = `${t}a`;
            const keys = [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Eda', 'Editor'],
                ['au', 'author', 'Ava', 'Author'], ['au2', 'author', 'Abe', 'Other'], ['rd', 'reader', 'Rae', 'Reader']];
            const r1 = await app.api.createContext({tag: p1, context: ctxBase(p1, 'journal'), users: keys.map(([k, r, g, f]) => U(p1, k, r, g, f))});
            S.J1 = {path: r1.path || p1, u: Object.fromEntries(keys.map(([k]) => [k, `${p1}${k}`]))};
            save();
            const J1 = S.J1;
            S.s.p1 = await sub(J1, 'p1', {...prod, ...gal, jats: {makePublic: true}, published: true});
            S.s.p2 = await sub(J1, 'p2', {...prod, ...gal, jats: {file: 'article.xml', makePublic: true}, published: true});
            S.s.p3 = await sub(J1, 'p3', {...prod, jats: {makePublic: true}, published: true});
            S.s.p4 = await sub(J1, 'p4', {...prod, ...gal, jats: {makePublic: true}, published: true});
            S.s.p5 = await sub(J1, 'p5', {...prod, ...gal, published: true});
            S.s.p6 = await sub(J1, 'p6', {...prod, ...gal, jats: {makePublic: true}, published: true});
            S.s.q1 = await sub(J1, 'q1', {...prod, ...gal, jats: {makePublic: true}});
            S.s.q2 = await sub(J1, 'q2', {...prod, jats: {file: 'article.xml', makePublic: true}});
            S.s.q3 = await sub(J1, 'q3', {...prod, jats: {makePublic: true}});
            S.s.v1 = await sub(J1, 'v1', {...prod, ...gal, jats: {file: 'article.xml', makePublic: true}});
            S.s.v2 = await sub(J1, 'v2', {...prod, jats: {makePublic: true}, published: true});
            const p2 = `${t}b`;
            const r2 = await app.api.createContext({tag: p2, context: ctxBase(p2, 'restricted'), restrictArticleAccess: true,
                users: [U(p2, 'mgr', 'manager', 'Mira', 'Manager'), U(p2, 'rd', 'reader', 'Rae', 'Reader'), U(p2, 'au', 'author', 'Ava', 'Author')]});
            S.J2 = {path: r2.path || p2, u: {mgr: `${p2}mgr`, rd: `${p2}rd`, au: `${p2}au`}};
            S.s.r1 = await sub(S.J2, 'r1', {...prod, ...gal, jats: {makePublic: true}, published: true});
            const p3 = `${t}c`;
            const r3 = await app.api.createContext({tag: p3, context: ctxBase(p3, 'plugin-off'), plugins: {jatstemplateplugin: {enabled: false}},
                users: [U(p3, 'mgr', 'manager', 'Mira', 'Manager'), U(p3, 'ed', 'editor', 'Eda', 'Editor'), U(p3, 'se', 'sectionEditor', 'Sid', 'Section'), U(p3, 'au', 'author', 'Ava', 'Author')]});
            S.J3 = {path: r3.path || p3, u: {mgr: `${p3}mgr`, ed: `${p3}ed`, se: `${p3}se`, au: `${p3}au`}};
            S.s.s1 = await sub(S.J3, 's1', {...prod, ...gal, jats: {makePublic: true}, published: true});
            S.s.s2 = await sub(S.J3, 's2', {...prod});
        } else {
            const p = `${t}x`;
            const r = await app.api.createContext({tag: p, context: ctxBase(p, app.name === 'omp' ? 'press' : 'server'),
                users: [U(p, 'mgr', 'manager', 'Mira', 'Manager'), U(p, 'au', 'author', 'Ava', 'Author')]});
            S.X = {path: r.path || p, u: {mgr: `${p}mgr`, au: `${p}au`}};
            const spec = isOPS ? {galleys: [{label: 'PDF', file: 'preprint.pdf'}], published: true} : {decisions: ['skipExternalReview', 'sendToProduction'], published: true};
            S.s.x1 = await sub(S.X, 'x1', spec);
            if (S.s.x1.error) S.s.x1 = await sub(S.X, 'x1', {published: true});
            // the jats key on this app: the harness says 400
            try { await app.api.createSubmission({tag: `${t}xj`, context: S.X.path, submitter: S.X.u.au, jats: {makePublic: true}}); S.jatsKey = 'accepted'; } catch (e) { S.jatsKey = String(e.message).slice(0, 300); }
        }
        S.seeded = true;
        save();
        fact('seed', {t: S.t, J1: S.J1, J2: S.J2, J3: S.J3, X: S.X, s: S.s, jatsKey: S.jatsKey});
    }
    const s = S.s || {};

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', async (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300)});
        try { if (d.type() === 'beforeunload') await d.accept(); else await d.dismiss(); } catch (e) { /* gone */ }
    });
    const resps = [];
    page.on('response', (r) => { if (r.request().method() !== 'GET' || r.status() >= 400 || /\/jats|bodyText/.test(r.url())) resps.push({at: Date.now(), m: r.request().method(), s: r.status(), url: rel(r.url()).slice(0, 200)}); });
    const respsSince = (t0) => resps.filter((p) => p.at >= t0).map((p) => `${p.m} ${p.s} ${p.url}`);
    const dialogsSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message}`);

    async function snap(name, extra = {}, pg = page) {
        let sc;
        try { sc = await screen(pg); } catch (e) { sc = {url: pg.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(sc, extra);
        record(name, sc);
        await shot(pg, name).catch(() => {});
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
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); };
    const out = async () => { await signOut(page).catch(() => {}); };
    const vis = '[role="dialog"]:visible';
    const wf = () => page.locator(vis).first();
    const wfUrl = (ctx, sid, key, author) => app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
    const articleUrl = (ctx, idOrPath) => app.url(`/index.php/${ctx}/article/view/${idOrPath}`);
    const pubScreen = (ctx) => { const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js')); return new PublicationScreen(page, ctx); };

    // ---- the reader side: the article page and its "JATS XML" link
    async function articlePage(ctx, idOrPath, name) {
        let status = null;
        try { const r = await page.goto(articleUrl(ctx, idOrPath)); status = r ? r.status() : null; } catch (e) { status = flat(e.message, 120); }
        await idle(page).catch(() => {});
        const links = await page.evaluate(() => [...document.querySelectorAll('a.obj_galley_link')].map((a) => ({
            text: a.innerText.trim().replace(/\s+/g, ' '), cls: a.className, block: (a.closest('.item') || {}).className || null, href: a.getAttribute('href'),
        }))).catch(() => []);
        const title = await page.locator('h1.page_title, h1').first().innerText().catch(() => null);
        const sc = await snap(name, {status, links, articleTitle: flat(title, 200)});
        return {status, links: links.map((l) => ({...l, href: rel(l.href)})), title: flat(title, 200), url: rel(sc.url)};
    }
    // Trigger something that reaches the public download (a click, a goto) and record what the browser got.
    async function follow(trigger, name, pg = page) {
        const t0 = Date.now();
        const respP = pg.waitForResponse((r) => /\/jats\/download/.test(r.url()), {timeout: 20000}).catch(() => null);
        const dlP = pg.waitForEvent('download', {timeout: 20000}).catch(() => null);
        let navErr = null;
        try { await trigger(); } catch (e) { navErr = flat(e.message, 200); }
        const resp = await respP;
        const o = {};
        if (resp) {
            const h = resp.headers();
            Object.assign(o, {status: resp.status(), url: rel(resp.url()), disposition: h['content-disposition'] || null, type: h['content-type'] || null, cacheControl: h['cache-control'] || null, location: rel(h.location) || null});
        }
        const dl = resp && resp.status() === 200 ? await dlP : null;
        if (dl) {
            o.download = {filename: dl.suggestedFilename()};
            const p = await dl.path().catch(() => null);
            if (p) {
                const x = fs.readFileSync(p, 'utf8');
                Object.assign(o.download, xmlFacts(x));
                fs.writeFileSync(path.join(outDir(), `${name}-${app.name}.xml`), x);
            }
        } else {
            await pg.waitForLoadState('domcontentloaded').catch(() => {});
            await idle(pg).catch(() => {});
            o.landed = rel(pg.url());
            o.text = flat(await pg.locator('body').innerText().catch(() => ''), 400);
        }
        if (navErr) o.navErr = navErr;
        o.traffic = respsSince(t0).slice(0, 8);
        await snap(name, {follow: o}, pg);
        return o;
    }
    async function pressJats(name, pg = page) {
        const link = pg.locator('a.obj_galley_link.xml');
        const n = await link.count();
        if (!n) { await snap(name, {follow: {present: false}}, pg); return {present: false}; }
        const href = await link.first().getAttribute('href');
        const r = await follow(() => link.first().click(), name, pg);
        return {present: true, href: rel(href), ...r};
    }
    const gotoAddr = (href, name) => follow(() => page.goto(href.startsWith('http') ? href : app.url(href)), name);

    // ---- the workflow's "JATS XML" page
    async function jatsPage(ctx, sid, pid, name) {
        await page.goto(wfUrl(ctx, sid, `publication_${pid}_jats`));
        await idle(page).catch(() => {});
        await page.locator('.jatsPanel .filePanel__ready').waitFor({state: 'visible', timeout: T}).catch(() => {});
        await page.locator('.jatsPanel .filePanel__items').waitFor({timeout: 10000}).catch(() => {});
        await idle(page).catch(() => {}); await sleep(600);
        const r = await page.evaluate(() => {
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const v = (e) => e && e.getClientRects().length > 0;
            const p = document.querySelector('.jatsPanel');
            if (!p) return {present: false, heading: [...document.querySelectorAll('h1,h2')].filter(v).map((h) => f(h.innerText)).slice(0, 4)};
            const content = f((p.querySelector('.filePanel__fileContent') || {}).innerText || '');
            const m = content.match(/<article-title[^>]*>(.*?)<\/article-title>/);
            return {
                present: true,
                buttons: [...p.querySelectorAll('.filePanel__header button')].filter(v).map((b) => f(b.innerText)),
                footer: f([...p.querySelectorAll('.filePanel__defaultContentFooter, .filePanel__fileContentFooter')].map((e) => e.innerText).join(' | ')),
                contentLen: content.length, title: m ? m[1] : null, fixture: /A JATS fixture article/.test(content), replacement: /K2 replacement JATS/.test(content),
                pubDate: /<pub-date/.test(content), error: f((p.querySelector('.filePanel__fileContent > div') || {}).innerText || '').slice(0, 300),
            };
        }).catch((e) => ({error: String(e.message)}));
        r.checked = await page.getByRole('checkbox', {name: 'Make available with publication'}).first().isChecked().catch(() => null);
        r.headerButtons = (await wf().locator('[data-cy="workflow-controls-right"] button, [data-cy="workflow-controls-right"] a').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
        await snap(name, {jats: r});
        return r;
    }
    // The page's own "Download": the file it hands over, kept for comparison with the public copy.
    async function wfDownload(name) {
        const dlP = page.waitForEvent('download', {timeout: 20000}).catch(() => null);
        await page.locator('.jatsPanel .filePanel__header').getByRole('button', {name: 'Download', exact: true}).first().click().catch(() => {});
        const dl = await dlP;
        if (!dl) return {download: null};
        const o = {filename: dl.suggestedFilename()};
        const p = await dl.path().catch(() => null);
        if (p) { const x = fs.readFileSync(p, 'utf8'); Object.assign(o, xmlFacts(x)); fs.writeFileSync(path.join(outDir(), `${name}-${app.name}.xml`), x); }
        return o;
    }
    async function setTick(want, name) {
        const cb = page.getByRole('checkbox', {name: 'Make available with publication'}).first();
        const was = await cb.isChecked().catch(() => null);
        if (was === want) return {was, changed: false};
        await page.locator('.jatsPanel').getByText('Make available with publication', {exact: true}).first().click();
        const dlg = page.getByRole('dialog').filter({hasText: want ? 'Enable JATS XML Download' : 'Disable JATS XML Download'}).last();
        await dlg.waitFor({timeout: 15000}).catch(() => {});
        const text = flat(await dlg.innerText().catch(() => null), 400);
        if (name) await snap(name, {dialogText: text});
        const t0 = Date.now();
        const respP = page.waitForResponse((r) => /\/jats\/visibility/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name: 'Confirm', exact: true}).click().catch(() => {});
        const resp = await respP; await idle(page).catch(() => {}); await sleep(600);
        return {was, dialog: text, status: resp && resp.status(), now: await cb.isChecked().catch(() => null), traffic: respsSince(t0)};
    }
    async function deleteJats(name) {
        await page.locator('.jatsPanel .filePanel__header').getByRole('button', {name: 'Delete', exact: true}).first().click();
        const dlg = page.getByRole('dialog').filter({hasText: 'Confirm deleting JATS XML'}).last();
        await dlg.waitFor({timeout: 15000}).catch(() => {});
        const text = flat(await dlg.innerText().catch(() => null), 400);
        if (name) await snap(name, {dialogText: text});
        const t0 = Date.now();
        const respP = page.waitForResponse((r) => /\/jats(\?|$)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name: 'Delete JATS File', exact: true}).click().catch(() => {});
        const resp = await respP; await idle(page).catch(() => {}); await sleep(800);
        return {dialog: text, status: resp && resp.status(), traffic: respsSince(t0)};
    }
    async function uploadJats(file) {
        const t0 = Date.now();
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', {timeout: 15000}),
            page.locator('.jatsPanel .filePanel__header').getByRole('button', {name: 'Upload', exact: true}).first().click(),
        ]);
        const respP = page.waitForResponse((r) => /\/jats(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await chooser.setFiles(file);
        const r = await respP; await idle(page).catch(() => {}); await sleep(1000);
        return {status: r && r.status(), traffic: respsSince(t0)};
    }
    // The header's "Preview": opens the reader's page of the version; returns the tab.
    async function openPreview(ctx, sid, {author} = {}) {
        await page.goto(wfUrl(ctx, sid, null, author));
        await idle(page).catch(() => {});
        await page.getByRole('link', {name: 'Publication', exact: true}).first().waitFor({timeout: T}).catch(() => {});
        const btns = page.getByRole('button', {name: 'Preview', exact: true});
        const count = await btns.count();
        const offered = [];
        for (let i = 0; i < count; i++) offered.push(await btns.nth(i).isVisible().catch(() => false));
        if (!offered.some(Boolean)) return {offered, tab: null};
        const popP = page.context().waitForEvent('page', {timeout: 10000}).catch(() => null);
        await btns.filter({visible: true}).last().click();
        const pop = await popP;
        const tab = pop || page;
        await tab.waitForLoadState('domcontentloaded').catch(() => {});
        await idle(tab).catch(() => {});
        return {offered, tab, popup: !!pop, url: rel(tab.url())};
    }
    async function previewAndPress(ctx, sid, name, opts) {
        const pv = await openPreview(ctx, sid, opts);
        if (!pv.tab) { await snap(`${name}-nopreview`, {preview: pv}); return {preview: {offered: pv.offered}}; }
        const links = await pv.tab.evaluate(() => [...document.querySelectorAll('a.obj_galley_link')].map((a) => ({text: a.innerText.trim(), cls: a.className, href: a.getAttribute('href')}))).catch(() => []);
        await snap(`${name}-page`, {links}, pv.tab);
        const pr = await pressJats(`${name}-press`, pv.tab);
        if (pv.popup) await pv.tab.close().catch(() => {});
        return {preview: {offered: pv.offered, popup: pv.popup, url: pv.url}, links: links.map((l) => ({...l, href: rel(l.href)})), press: pr};
    }
    async function bodyText(ctx, sid, pid, name) {
        await page.goto(wfUrl(ctx, sid, `publication_${pid}_bodyText`));
        await idle(page).catch(() => {});
        await page.locator('sciflow-editor').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await idle(page).catch(() => {}); await sleep(2500);
        await page.locator('sciflow-editor [contenteditable]').first().waitFor({state: 'visible', timeout: 15000}).catch(() => {});
        const txt = flat(await page.locator('sciflow-editor [contenteditable]').first().innerText().catch(() => null), 500);
        await snap(name, {editorText: txt});
        return txt;
    }

    try {
        if (isOJS) {
            const J1 = S.J1; const J2 = S.J2; const J3 = S.J3;

            // ============================================================ access: Settings bullet 2's box, per journal
            if (on('access')) await sect('access', async () => {
                const o = {};
                const read = async (user, ctx, name) => {
                    await as(user, ctx);
                    await page.goto(app.url(`/index.php/${ctx}/management/settings/access`)); await idle(page).catch(() => {});
                    const tab = page.getByRole('tab', {name: 'Site Access Options', exact: true}).first();
                    if (await tab.count()) { await tab.click(); await idle(page).catch(() => {}); await sleep(600); }
                    const box = page.getByRole('checkbox', {name: 'Users must be registered and log in to view open access content.'}).first();
                    const r = {tabs: (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)), boxCount: await box.count(), checked: await box.isChecked().catch(() => null),
                        group: flat(await page.getByText('View Article Content', {exact: true}).first().innerText().catch(() => null), 80)};
                    await snap(name, {access: r});
                    if (name === 'access-J1') await loc(page, 'Site Access Options: "Users must be registered and log in to view open access content."', box);
                    return r;
                };
                o.J1 = await read(J1.u.mgr, J1.path, 'access-J1');
                o.J2 = await read(J2.u.mgr, J2.path, 'access-J2');
                o.pk = await read('manager.maya', 'publicknowledge', 'access-publicknowledge');
                fact('access', o);
            });

            // ============================================================ link: Rule 10, Actors row 54 (d12)
            if (on('link')) await sect('link', async () => {
                const o = {};
                await out();
                o.p1Page = await articlePage(J1.path, s.p1.id, 'link-01-p1-signedout');
                o.p1Out = await pressJats('link-02-p1-press-signedout');
                o.p2Page = await articlePage(J1.path, s.p2.id, 'link-03-p2-signedout');
                o.p2Out = await pressJats('link-04-p2-press-signedout');
                o.p3Page = await articlePage(J1.path, s.p3.id, 'link-05-p3-nogalley');
                o.p3Out = await pressJats('link-06-p3-press');
                o.p5Page = await articlePage(J1.path, s.p5.id, 'link-07-p5-nojatskey');
                await loc(page, 'Article page: the "JATS XML" link', page.locator('a.obj_galley_link.xml'));
                // per role
                for (const k of ['rd', 'au2', 'au', 'mgr']) {
                    await as(J1.u[k], J1.path);
                    await articlePage(J1.path, s.p1.id, `link-08-p1-${k}`);
                    o[`p1_${k}`] = await pressJats(`link-09-p1-press-${k}`);
                }
                // the workflow page's XML for comparison, then untick
                o.p2Wf = await jatsPage(J1.path, s.p2.id, s.p2.pub, 'link-11-p2-jatspage');
                o.p2WfDl = await wfDownload('link-11-p2-wf-download');
                o.p5Wf = await jatsPage(J1.path, s.p5.id, s.p5.pub, 'link-12-p5-jatspage');
                o.p1Wf = await jatsPage(J1.path, s.p1.id, s.p1.pub, 'link-10-p1-jatspage');
                o.p1WfDl = await wfDownload('link-10-p1-wf-download');
                o.p1Untick = await setTick(false, 'link-13-p1-untick-dialog');
                o.p1AfterUntick = await jatsPage(J1.path, s.p1.id, s.p1.pub, 'link-14-p1-jatspage-unticked');
                await out();
                o.p1PageUnticked = await articlePage(J1.path, s.p1.id, 'link-15-p1-unticked-signedout');
                if (o.p1Out && o.p1Out.href) o.p1AddrUnticked = await gotoAddr(o.p1Out.href, 'link-16-p1-addr-unticked-signedout');
                fact('link', o);
            });

            // ============================================================ preview: Rule 11 (d13)
            if (on('preview')) await sect('preview', async () => {
                const o = {};
                await as(J1.u.mgr, J1.path);
                o.mgr = await previewAndPress(J1.path, s.q1.id, 'prev-01-mgr');
                const href = o.mgr.press && o.mgr.press.href;
                S.q1href = href; S.q1preview = o.mgr.preview.url; save();
                // author (assigned: the submitter): the author view's Preview
                await as(J1.u.au, J1.path);
                o.au = await previewAndPress(J1.path, s.q1.id, 'prev-02-au', {author: true});
                // everyone: the copied address, and the preview page's own address
                const whoAll = ['au', 'au2', 'rd', 'ed'];
                for (const k of whoAll) {
                    await as(J1.u[k], J1.path);
                    if (href) o[`addr_${k}`] = await gotoAddr(href, `prev-03-addr-${k}`);
                    if (S.q1preview && ['au2', 'rd'].includes(k)) {
                        let st = null; try { const r = await page.goto(app.url(S.q1preview)); st = r && r.status(); } catch (e) { st = flat(e.message, 100); }
                        await idle(page).catch(() => {});
                        o[`previewPage_${k}`] = {status: st, text: flat(await page.locator('body').innerText().catch(() => ''), 300)};
                        await snap(`prev-04-previewpage-${k}`, {status: st});
                    }
                }
                await out();
                if (href) o.addr_out = await gotoAddr(href, 'prev-05-addr-signedout');
                if (S.q1preview) {
                    let st = null; try { const r = await page.goto(app.url(S.q1preview)); st = r && r.status(); } catch (e) { st = flat(e.message, 100); }
                    await idle(page).catch(() => {});
                    o.previewPage_out = {status: st, url: rel(page.url()), text: flat(await page.locator('body').innerText().catch(() => ''), 300)};
                    await snap('prev-06-previewpage-signedout', {status: st});
                }
                // untick: the preview page and the address, as the manager
                await as(J1.u.mgr, J1.path);
                await jatsPage(J1.path, s.q1.id, s.q1.pub, 'prev-07-q1-jatspage');
                o.untick = await setTick(false, 'prev-08-untick-dialog');
                o.mgrUnticked = await previewAndPress(J1.path, s.q1.id, 'prev-09-mgr-unticked');
                if (href) o.addr_mgr_unticked = await gotoAddr(href, 'prev-10-addr-mgr-unticked');
                // re-tick so the preview address downloads again (and the state reads as seeded)
                await jatsPage(J1.path, s.q1.id, s.q1.pub);
                o.retick = await setTick(true, null);
                fact('preview', o);
            });

            // ============================================================ cache: Rule 12, A8 (d14) on p4; Delete / Upload on q2
            if (on('cache')) await sect('cache', async () => {
                const o = {};
                const P = pubScreen(J1.path);
                await out();
                await articlePage(J1.path, s.p4.id, 'cache-01-p4-signedout');
                o.d0 = await pressJats('cache-02-p4-press0');
                // a metadata edit of the published version
                await as(J1.u.mgr, J1.path);
                await P.gotoVersionPage(s.p4.id, s.p4.pub, 'titleAbstract', 'Title & Abstract');
                await idle(page).catch(() => {});
                const newTitle = `K2 p4 Retitled ${S.t}`;
                await P.setRichText('titleAbstract-title-control-en', newTitle);
                await P.save();
                await snap('cache-03-p4-title-saved');
                o.newTitle = newTitle;
                o.wfAfterEdit = await jatsPage(J1.path, s.p4.id, s.p4.pub, 'cache-04-p4-jatspage-after-edit');
                await out();
                o.pageAfterEdit = await articlePage(J1.path, s.p4.id, 'cache-05-p4-page-after-edit');
                o.d1 = await pressJats('cache-06-p4-press-after-edit');
                // as a signed-in manager too (the same cache?)
                await as(J1.u.mgr, J1.path);
                await articlePage(J1.path, s.p4.id, 'cache-07-p4-page-mgr');
                o.d1mgr = await pressJats('cache-08-p4-press-mgr');
                // untick and re-tick
                await jatsPage(J1.path, s.p4.id, s.p4.pub);
                o.untick = await setTick(false, null);
                await jatsPage(J1.path, s.p4.id, s.p4.pub);
                o.retick = await setTick(true, null);
                await out();
                await articlePage(J1.path, s.p4.id, 'cache-09-p4-page-after-retick');
                o.d2 = await pressJats('cache-10-p4-press-after-retick');

                // q2 (unpublished, uploaded file): the preview's download before and after Delete and Upload
                await as(J1.u.mgr, J1.path);
                o.q2a = await previewAndPress(J1.path, s.q2.id, 'cache-11-q2-preview-uploaded');
                o.q2wfA = await jatsPage(J1.path, s.q2.id, s.q2.pub, 'cache-12-q2-jatspage');
                o.q2del = await deleteJats('cache-13-q2-delete-dialog');
                o.q2wfB = await jatsPage(J1.path, s.q2.id, s.q2.pub, 'cache-14-q2-jatspage-after-delete');
                o.q2b = await previewAndPress(J1.path, s.q2.id, 'cache-15-q2-preview-after-delete');
                await jatsPage(J1.path, s.q2.id, s.q2.pub);
                o.q2up = await uploadJats(path.join(__dirname, 'jats-k2.xml'));
                o.q2wfC = await jatsPage(J1.path, s.q2.id, s.q2.pub, 'cache-16-q2-jatspage-after-upload');
                o.q2c = await previewAndPress(J1.path, s.q2.id, 'cache-17-q2-preview-after-upload');
                // q2: a metadata edit of the unpublished version, then the preview again
                await P.gotoVersionPage(s.q2.id, s.q2.pub, 'titleAbstract', 'Title & Abstract');
                await P.setRichText('titleAbstract-title-control-en', `K2 q2 Retitled ${S.t}`);
                await P.save();
                fact('cache', o);
            });

            // ============================================================ stale: a preview download, then publish (sweep of Rule 12)
            if (on('stale')) await sect('stale', async () => {
                const o = {};
                const P = pubScreen(J1.path);
                await as(J1.u.mgr, J1.path);
                o.pre = await previewAndPress(J1.path, s.q3.id, 'stale-01-q3-preview');
                await P.gotoVersionPage(s.q3.id, s.q3.pub, 'titleAbstract', 'Title & Abstract');
                const t2 = `K2 q3 Retitled ${S.t}`;
                await P.setRichText('titleAbstract-title-control-en', t2);
                await P.save();
                o.newTitle = t2;
                await P.publish();
                await snap('stale-02-q3-published');
                o.wf = await jatsPage(J1.path, s.q3.id, s.q3.pub, 'stale-03-q3-jatspage');
                await out();
                o.page = await articlePage(J1.path, s.q3.id, 'stale-04-q3-page-signedout');
                o.post = await pressJats('stale-05-q3-press-signedout');
                fact('stale', o);
            });

            // ============================================================ urlpath: A9 (d27) on p6, both ends
            if (on('urlpath')) await sect('urlpath', async () => {
                const o = {};
                const P = pubScreen(J1.path);
                await as(J1.u.mgr, J1.path);
                const setPath = async (value, name) => {
                    await page.goto(wfUrl(J1.path, s.p6.id, `publication_${s.p6.pub}_issue`)); await idle(page).catch(() => {});
                    const f = page.locator('input[name="urlPath"]').first();
                    await f.waitFor({state: 'visible', timeout: T});
                    await sleep(800);
                    const before = await f.inputValue();
                    await f.fill(value);
                    const t0 = Date.now();
                    await P.saveButton().first().click();
                    await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 20000}).catch(() => {});
                    await idle(page).catch(() => {});
                    const errors = (await page.locator('.pkpFieldError, .pkpFormPage__status').allInnerTexts().catch(() => [])).map((x) => flat(x, 200));
                    await snap(name, {urlPath: {before, value, errors, traffic: respsSince(t0)}});
                    return {before, value, errors, traffic: respsSince(t0)};
                };
                o.p1Name = S.p1Name || null;
                o.set = await setPath('my-article', 'url-01-p6-set');
                await loc(page, 'Publication Settings: "URL Path"', page.locator('input[name="urlPath"]'));
                await out();
                o.pageById = await articlePage(J1.path, s.p6.id, 'url-02-p6-page-by-id');
                o.pageByPath = await articlePage(J1.path, 'my-article', 'url-03-p6-page-by-path');
                o.dSet = await pressJats('url-04-p6-press-with-path');
                await as(J1.u.mgr, J1.path);
                o.clear = await setPath('', 'url-05-p6-clear');
                await out();
                await articlePage(J1.path, s.p6.id, 'url-06-p6-page-cleared');
                o.dClear = await pressJats('url-07-p6-press-cleared');
                // leave once with an unsaved change: type a path, then choose "JATS XML" in the side menu
                await as(J1.u.mgr, J1.path);
                await page.goto(wfUrl(J1.path, s.p6.id, `publication_${s.p6.pub}_issue`)); await idle(page).catch(() => {});
                const f = page.locator('input[name="urlPath"]').first();
                await f.waitFor({state: 'visible', timeout: T}); await sleep(800);
                await f.fill('unsaved-path'); await f.blur().catch(() => {});
                const t0 = Date.now();
                await page.getByRole('link', {name: 'JATS XML', exact: true}).first().click().catch(() => {});
                await sleep(1500); await idle(page).catch(() => {});
                const dlg = page.getByRole('dialog').filter({hasText: /unsaved|leave|discard/i}).last();
                o.leave = {jsDialogs: dialogsSince(t0), vueDialog: (await dlg.count()) ? flat(await dlg.innerText().catch(() => null), 300) : null, url: rel(page.url()).replace(/^.*workflowMenuKey=/, '')};
                await snap('url-08-leave-unsaved', {leave: o.leave});
                await page.goto(wfUrl(J1.path, s.p6.id, `publication_${s.p6.pub}_issue`)); await idle(page).catch(() => {});
                await f.waitFor({state: 'visible', timeout: T}).catch(() => {}); await sleep(800);
                o.leave.after = await f.inputValue().catch(() => null);
                fact('urlpath', o);
            });

            // ============================================================ fresh: a first-time visitor (a new browser) after urlpath and cache
            if (on('fresh')) await sect('fresh', async () => {
                const o = {};
                const second = await launch(app);
                const p2 = second.page;
                try {
                    for (const [k, sub] of [['p6', s.p6], ['p4', s.p4], ['q3', s.q3]]) {
                        await p2.goto(articleUrl(J1.path, sub.id)); await idle(p2).catch(() => {});
                        await snap(`fresh-${k}-page`, {}, p2);
                        o[k] = await pressJats(`fresh-${k}-press`, p2);
                    }
                } finally { await second.close(); }
                fact('fresh', o);
            });

            // ============================================================ prevau: the author's view of an unpublished version's pages
            if (on('prevau')) await sect('prevau', async () => {
                const o = {};
                for (const [who, author] of [['au', true], ['mgr', false]]) {
                    await as(J1.u[who], J1.path);
                    await page.goto(wfUrl(J1.path, s.q1.id, `publication_${s.q1.pub}_titleAbstract`, author)); await idle(page).catch(() => {});
                    await page.getByRole('heading', {name: 'Publication: Title & Abstract'}).waitFor({timeout: T}).catch(() => {});
                    await idle(page).catch(() => {});
                    const btns = page.getByRole('button', {name: 'Preview', exact: true});
                    o[who] = {previewButtons: await btns.count(), visible: await btns.filter({visible: true}).count(),
                        menu: (await wf().getByRole('treeitem').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)).slice(0, 20)};
                    await snap(`prevau-${who}-titleabstract`, {prevau: o[who]});
                    if (o[who].visible) {
                        const popP = page.context().waitForEvent('page', {timeout: 8000}).catch(() => null);
                        await btns.filter({visible: true}).last().click();
                        const pop = await popP; const tab = pop || page;
                        await tab.waitForLoadState('domcontentloaded').catch(() => {}); await idle(tab).catch(() => {});
                        o[who].previewUrl = rel(tab.url());
                        o[who].press = await pressJats(`prevau-${who}-press`, tab);
                        if (pop) await pop.close().catch(() => {});
                    }
                }
                fact('prevau', o);
            });

            // ============================================================ rerun: a second run of A8 and A9 on p3, a returning and a first-time visitor
            if (on('rerun')) await sect('rerun', async () => {
                const o = {};
                const P = pubScreen(J1.path);
                const fresh = async (name) => {
                    const b = await launch(app);
                    try { await b.page.goto(articleUrl(J1.path, s.p3.id)); await idle(b.page).catch(() => {}); return await pressJats(name, b.page); } finally { await b.close(); }
                };
                const setPath = async (value, name) => {
                    await page.goto(wfUrl(J1.path, s.p3.id, `publication_${s.p3.pub}_issue`)); await idle(page).catch(() => {});
                    const f = page.locator('input[name="urlPath"]').first();
                    await f.waitFor({state: 'visible', timeout: T}); await sleep(800);
                    await f.fill(value);
                    await P.saveButton().first().click();
                    await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 20000}).catch(() => {});
                    await idle(page).catch(() => {});
                    await snap(name);
                };
                await out();
                await articlePage(J1.path, s.p3.id, 'rerun-01-p3-page');
                o.a0 = await pressJats('rerun-02-p3-press-A0');
                await as(J1.u.mgr, J1.path);
                await setPath('k2-second', 'rerun-03-p3-path-set');
                await P.gotoVersionPage(s.p3.id, s.p3.pub, 'titleAbstract', 'Title & Abstract');
                await P.setRichText('titleAbstract-title-control-en', `K2 p3 Retitled ${S.t}`);
                await P.save();
                o.wf = await jatsPage(J1.path, s.p3.id, s.p3.pub, 'rerun-04-p3-jatspage');
                await out();
                await articlePage(J1.path, s.p3.id, 'rerun-05-p3-page-after');
                o.a1 = await pressJats('rerun-06-p3-press-A1-returning');
                o.b1 = await fresh('rerun-07-p3-press-B1-firsttime');
                await as(J1.u.mgr, J1.path);
                await setPath('', 'rerun-08-p3-path-cleared');
                await out();
                await articlePage(J1.path, s.p3.id, 'rerun-09-p3-page-cleared');
                o.a2 = await pressJats('rerun-10-p3-press-A2-returning');
                o.c2 = await fresh('rerun-11-p3-press-C2-firsttime');
                fact('rerun', o);
            });

            // ============================================================ edplug: the Journal Editor turns the plugin on and off (J3)
            if (on('edplug')) await sect('edplug', async () => {
                const o = {};
                await as(J3.u.ed, J3.path);
                await page.goto(app.url(`/index.php/${J3.path}/management/settings/website`)); await idle(page).catch(() => {});
                await page.locator('#plugins-button').first().click(); await idle(page).catch(() => {});
                const row = page.locator('tr.gridRow[id$="-row-jatstemplateplugin"]').first();
                await row.waitFor({timeout: T});
                const box = row.getByRole('checkbox').first();
                for (const want of [true, false]) {
                    const t0 = Date.now();
                    const was = await box.isChecked();
                    const w = page.waitForResponse((r) => /plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
                    await box.click({noWaitAfter: true}); await sleep(800);
                    const dlg = page.locator('[role="dialog"]:visible').last();
                    let ask = null;
                    if (await dlg.count()) { ask = flat(await dlg.innerText().catch(() => ''), 300); const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first(); if (await ok.count()) await ok.click(); }
                    const r = await w; await sleep(900); await idle(page).catch(() => {});
                    o[want ? 'on' : 'off'] = {was, ask, status: r && r.status(), now: await box.isChecked().catch(() => null),
                        toast: (await page.locator('.pkp_notification, .pkpNotification').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean), traffic: respsSince(t0)};
                    await snap(`edplug-${want ? 'on' : 'off'}`, {edplug: o[want ? 'on' : 'off']});
                }
                fact('edplug', o);
            });

            // ============================================================ bodyleave: an untouched Body Text page, left through the side menu
            if (on('bodyleave')) await sect('bodyleave', async () => {
                const o = {};
                await as(J1.u.mgr, J1.path);
                for (const [k, sid, pid] of [['v1new', s.v1.id, S.v1new], ['q1', s.q1.id, s.q1.pub]]) {
                    if (!pid) continue;
                    const txt = await bodyText(J1.path, sid, pid, `bodyleave-${k}-arrive`);
                    const badge = await page.locator('.sciflow-body-text__unsaved').first().isVisible().catch(() => null);
                    const t0 = Date.now();
                    await page.getByRole('link', {name: 'JATS XML', exact: true}).first().click().catch(() => {});
                    await sleep(1500); await idle(page).catch(() => {});
                    o[k] = {editorText: txt, unsavedBadge: badge, jsDialogs: dialogsSince(t0), after: rel(page.url()).replace(/^.*workflowMenuKey=/, '')};
                    await snap(`bodyleave-${k}-after-leave`, {bodyleave: o[k]});
                }
                fact('bodyleave', o);
            });

            // ============================================================ ver2: a second new version, made by another user than the file's uploader (q2)
            if (on('ver2')) await sect('ver2', async () => {
                const o = {};
                const P = pubScreen(J1.path);
                await as(J1.u.ed, J1.path);
                o.before = await jatsPage(J1.path, s.q2.id, s.q2.pub, 'ver2-01-q2-jats');
                if (!S.q2new) {
                    await P.gotoVersionPage(s.q2.id, s.q2.pub, 'titleAbstract', 'Title & Abstract');
                    await P.publish();
                    S.q2new = await P.createNewVersionUntouched(); save();
                }
                o.newPub = S.q2new;
                o.after = await jatsPage(J1.path, s.q2.id, S.q2new, 'ver2-02-q2new-jats');
                o.body = await bodyText(J1.path, s.q2.id, S.q2new, 'ver2-03-q2new-bodytext');
                fact('ver2', o);
            });

            // ============================================================ media: A4's "and the media files" (m1, seeded here)
            if (on('media')) await sect('media', async () => {
                const o = {};
                const P = pubScreen(J1.path);
                if (!s.m1) {
                    const r = await app.api.createSubmission({tag: `${S.t}m1`, context: J1.path, submitter: J1.u.au, title: `K2 m1 Quokka ${S.t}`,
                        decisions: ['skipExternalReview', 'sendToProduction'], jats: {file: 'article.xml', makePublic: true},
                        mediaFiles: [{file: 'figure.png', name: 'k2-figure.png'}], published: true});
                    s.m1 = {id: r.submissionId, pub: r.publicationId}; save();
                }
                const media = async (pid, name) => {
                    await page.goto(wfUrl(J1.path, s.m1.id, `publication_${pid}_media`)); await idle(page).catch(() => {});
                    const tbl = wf().getByRole('table', {name: 'Media Files', exact: true}).first();
                    await tbl.waitFor({timeout: T}).catch(() => {});
                    await idle(page).catch(() => {}); await sleep(500);
                    const rows = (await tbl.locator('tbody tr').allInnerTexts().catch(() => [])).map((x) => flat(x, 120));
                    await snap(name, {rows});
                    return rows;
                };
                await as(J1.u.mgr, J1.path);
                o.v1Media = await media(s.m1.pub, 'media-01-m1-v1');
                if (!S.m1new) {
                    await page.goto(wfUrl(J1.path, s.m1.id, `publication_${s.m1.pub}_titleAbstract`)); await idle(page).catch(() => {});
                    await page.getByRole('heading', {name: 'Publication: Title & Abstract'}).waitFor({timeout: T}).catch(() => {});
                    S.m1new = await P.createNewVersionUntouched(); save();
                }
                o.newPub = S.m1new;
                o.v2Media = await media(S.m1new, 'media-02-m1-v2');
                o.v2Jats = await jatsPage(J1.path, s.m1.id, S.m1new, 'media-03-m1-v2-jats');
                fact('media', o);
            });

            // ============================================================ versions: Rule 13, A4 (d15)
            if (on('versions')) await sect('versions', async () => {
                const o = {};
                const P = pubScreen(J1.path);
                await as(J1.u.mgr, J1.path);
                // v1: Body Text typed and saved, then published on screen (skipped when an earlier run got that far)
                if (!S.v1new) {
                    o.v1Body0 = await bodyText(J1.path, s.v1.id, s.v1.pub, 'ver-01-v1-bodytext');
                    const ed = page.locator('sciflow-editor [contenteditable="true"]').first();
                    await ed.waitFor({state: 'visible', timeout: T});
                    await ed.click();
                    await page.keyboard.type('Version one text');
                    await sleep(800);
                    const t0 = Date.now();
                    const respP = page.waitForResponse((r) => /\/bodyText/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await page.locator('.sciflow-body-text__save-row').getByRole('button').first().click();
                    const br = await respP; await idle(page).catch(() => {}); await sleep(800);
                    o.v1Save = {status: br && br.status(), label: flat(await page.locator('.sciflow-body-text__save-row').innerText().catch(() => null), 80), traffic: respsSince(t0)};
                    await loc(page, 'Body Text: the editor\'s editable area', ed);
                    o.v1Body1 = await bodyText(J1.path, s.v1.id, s.v1.pub, 'ver-02-v1-bodytext-saved');
                    o.v1Jats = await jatsPage(J1.path, s.v1.id, s.v1.pub, 'ver-03-v1-jats');
                    await P.gotoVersionPage(s.v1.id, s.v1.pub, 'titleAbstract', 'Title & Abstract');
                    await P.publish();
                    S.v1new = await P.createNewVersionUntouched(); save();
                    await snap('ver-04-v1-new-version');
                }
                o.v1New = S.v1new;
                o.v1Body1 = await bodyText(J1.path, s.v1.id, s.v1.pub, 'ver-02b-v1-bodytext-published');
                o.v2Jats = await jatsPage(J1.path, s.v1.id, o.v1New, 'ver-05-v1new-jats');
                o.v2Body = await bodyText(J1.path, s.v1.id, o.v1New, 'ver-06-v1new-bodytext');
                await jatsPage(J1.path, s.v1.id, o.v1New);
                o.v2Del = await deleteJats('ver-07-v1new-delete-dialog');
                o.v2JatsAfterDel = await jatsPage(J1.path, s.v1.id, o.v1New, 'ver-08-v1new-jats-after-delete');
                o.v1JatsAfterDel = await jatsPage(J1.path, s.v1.id, s.v1.pub, 'ver-09-v1-jats-after-v2-delete');
                o.v1BodyAfter = await bodyText(J1.path, s.v1.id, s.v1.pub, 'ver-10-v1-bodytext-after');
                // v2 (generated, published by seed): new version
                await page.goto(wfUrl(J1.path, s.v2.id, `publication_${s.v2.pub}_titleAbstract`)); await idle(page).catch(() => {});
                await page.getByRole('heading', {name: 'Publication: Title & Abstract'}).waitFor({timeout: T}).catch(() => {});
                o.w1Jats = await jatsPage(J1.path, s.v2.id, s.v2.pub, 'ver-11-v2-jats');
                await page.goto(wfUrl(J1.path, s.v2.id, `publication_${s.v2.pub}_titleAbstract`)); await idle(page).catch(() => {});
                o.w2New = await P.createNewVersionUntouched();
                o.w2Jats = await jatsPage(J1.path, s.v2.id, o.w2New, 'ver-12-v2new-jats');
                fact('versions', o);
            });

            // ============================================================ plugin: Settings bullet 1, Actors row 55 (d25)
            if (on('plugin')) await sect('plugin', async () => {
                const o = {};
                const pluginRow = (id) => page.locator(`tr.gridRow[id$="-row-${id}"]`).first();
                const openPlugins = async (ctx, name) => {
                    let st = null;
                    try { const r = await page.goto(app.url(`/index.php/${ctx}/management/settings/website`)); st = r && r.status(); } catch (e) { st = flat(e.message, 100); }
                    await idle(page).catch(() => {});
                    const tab = page.locator('#plugins-button').first();
                    if (!(await tab.count())) { const sc = await snap(name, {status: st}); return {status: st, noTab: true, url: rel(sc.url), text: flat(sc.text && sc.text.main, 200)}; }
                    await tab.click(); await idle(page).catch(() => {});
                    await page.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
                    await sleep(800);
                    const rows = await page.locator('tr.gridRow').evaluateAll((trs) => trs.filter((tr) => /jats/i.test(tr.id + tr.innerText)).map((tr) => {
                        const box = tr.querySelector('input[type=checkbox]');
                        const tb = tr.closest('tbody');
                        return {id: tr.id.replace(/^.*-row-/, ''), category: tb ? tb.id.replace(/^.*-category-/, '').replace(/-.*$/, '') : null,
                            text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 240), checked: box ? box.checked : null, disabled: box ? box.disabled : null};
                    }));
                    await snap(name, {status: st, rows});
                    return {status: st, rows};
                };
                const setPlugin = async (id, want) => {
                    const row = pluginRow(id);
                    await row.waitFor({timeout: T});
                    const box = row.getByRole('checkbox').first();
                    const was = await box.isChecked();
                    if (was === want) return {was, changed: false};
                    const t0 = Date.now();
                    const w = page.waitForResponse((r) => /plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
                    await box.click({noWaitAfter: true});
                    await sleep(800);
                    let ask = null;
                    const dlg = page.locator('[role="dialog"]:visible').last();
                    if (await dlg.count()) {
                        ask = flat(await dlg.innerText().catch(() => ''), 400);
                        const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first();
                        if (await ok.count()) await ok.click();
                    }
                    const r = await w;
                    await sleep(900); await idle(page).catch(() => {});
                    const toast = (await page.locator('.pkp_notification, .pkpNotification, [class*="toast"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
                    return {was, changed: true, ask, status: r ? r.status() : null, toast, now: await box.isChecked().catch(() => null), traffic: respsSince(t0)};
                };
                const stats = async (ctx, name) => {
                    let st = null;
                    try { const r = await page.goto(app.url(`/index.php/${ctx}/stats/publications/publications`)); st = r && r.status(); } catch (e) { st = flat(e.message, 100); }
                    await idle(page).catch(() => {}); await sleep(1200);
                    const cols = (await page.locator('table th').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)).filter(Boolean);
                    const heading = flat(await page.locator('h1').first().innerText().catch(() => null), 80);
                    await snap(name, {status: st, cols});
                    return {status: st, heading, cols};
                };
                // J3 (plugin off) as its manager
                await as(J3.u.mgr, J3.path);
                o.J3grid = await openPlugins(J3.path, 'plug-01-J3-grid');
                await loc(page, 'Plugins: the "JATS Template Plugin" row\'s box', pluginRow('jatstemplateplugin').getByRole('checkbox'));
                o.J3s2Jats = await jatsPage(J3.path, s.s2.id, s.s2.pub, 'plug-02-J3-s2-jatspage');
                o.J3s1Jats = await jatsPage(J3.path, s.s1.id, s.s1.pub, 'plug-03-J3-s1-jatspage');
                o.J3stats = await stats(J3.path, 'plug-04-J3-stats');
                await out();
                o.J3s1Page = await articlePage(J3.path, s.s1.id, 'plug-05-J3-s1-page');
                o.J3s1Press = await pressJats('plug-06-J3-s1-press');
                // J1 (default) and publicknowledge (read-only) as controls
                await as(J1.u.mgr, J1.path);
                o.J1grid = await openPlugins(J1.path, 'plug-07-J1-grid');
                o.J1stats = await stats(J1.path, 'plug-08-J1-stats');
                await as('manager.maya', 'publicknowledge');
                o.pkGrid = await openPlugins('publicknowledge', 'plug-09-pk-grid');
                o.pkStats = await stats('publicknowledge', 'plug-10-pk-stats');
                // roles on J3's Plugins tab
                await as(J3.u.ed, J3.path);
                o.J3gridEd = await openPlugins(J3.path, 'plug-11-J3-grid-editor');
                await as(J3.u.se, J3.path);
                o.J3gridSe = await openPlugins(J3.path, 'plug-12-J3-grid-sectioneditor');
                await as('admin', J3.path);
                o.J3gridAdmin = await openPlugins(J3.path, 'plug-13-J3-grid-admin');
                // the manager turns it on, reads the stats, turns it off again
                await as(J3.u.mgr, J3.path);
                await openPlugins(J3.path);
                o.on = await setPlugin('jatstemplateplugin', true);
                o.J3gridOn = await openPlugins(J3.path, 'plug-14-J3-grid-on');
                o.J3statsOn = await stats(J3.path, 'plug-15-J3-stats-on');
                await openPlugins(J3.path);
                o.off = await setPlugin('jatstemplateplugin', false);
                o.J3statsOff = await stats(J3.path, 'plug-16-J3-stats-off');
                o.J3s2JatsOff = await jatsPage(J3.path, s.s2.id, s.s2.pub, 'plug-17-J3-s2-jatspage-off');
                fact('plugin', o);
            });

            // ============================================================ restrict: Settings bullet 2 (d26)
            if (on('restrict')) await sect('restrict', async () => {
                const o = {};
                await out();
                o.page = await articlePage(J2.path, s.r1.id, 'restr-01-r1-signedout');
                o.press = await pressJats('restr-02-r1-press-signedout');
                // on the Login page it led to (when it did): sign in there
                const onLogin = await page.locator('input#username').count();
                o.onLogin = onLogin;
                if (onLogin) {
                    const {LoginPage} = require(path.join(app.suiteDir, '..', '..', '..', 'shared', 'playwright', 'pages', 'LoginPage.js'));
                    const lp = new LoginPage(page);
                    o.signInThere = await follow(async () => {
                        await lp.usernameInput.fill(J2.u.rd);
                        await lp.fillPassword(`${J2.u.rd}${J2.u.rd}`);
                        await lp.submitButton.click();
                    }, 'restr-03-signin-there');
                    o.afterSignIn = rel(page.url());
                }
                // galley link signed out, for comparison
                await out();
                await articlePage(J2.path, s.r1.id, 'restr-04-r1-signedout-again');
                const g = page.locator('a.obj_galley_link.pdf').first();
                if (await g.count()) {
                    await g.click().catch(() => {}); await idle(page).catch(() => {});
                    o.galleySignedOut = {url: rel(page.url()), text: flat(await page.locator('body').innerText().catch(() => ''), 200)};
                    await snap('restr-05-galley-signedout', {galley: o.galleySignedOut});
                }
                // signed in from the start
                await as(J2.u.rd, J2.path);
                await articlePage(J2.path, s.r1.id, 'restr-06-r1-reader');
                o.pressReader = await pressJats('restr-07-r1-press-reader');
                fact('restrict', o);
            });
        } else if (on('control')) {
            // ============================================================ OMP / OPS: read-only absence controls
            await sect('control', async () => {
                const o = {jatsKey: S.jatsKey};
                const X = S.X;
                await out();
                const landing = app.url(`/index.php/${X.path}/${isOPS ? 'preprint/view' : 'catalog/book'}/${s.x1.id}`);
                let st = null; try { const r = await page.goto(landing); st = r && r.status(); } catch (e) { st = flat(e.message, 100); }
                await idle(page).catch(() => {});
                const txt = await page.locator('body').innerText().catch(() => '');
                o.landing = {status: st, url: rel(page.url()), jats: /JATS/i.test(txt), links: await page.locator('a.obj_galley_link').allInnerTexts().catch(() => [])};
                await snap('ctl-01-landing', {landing: o.landing});
                await as(X.u.mgr, X.path);
                await page.goto(app.url(`/index.php/${X.path}/management/settings/website`)); await idle(page).catch(() => {});
                await page.locator('#plugins-button').first().click().catch(() => {});
                await page.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {}); await idle(page).catch(() => {}); await sleep(800);
                o.pluginRows = await page.locator('tr.gridRow').evaluateAll((trs) => trs.filter((tr) => /jats/i.test(tr.id + tr.innerText)).map((tr) => tr.id.replace(/^.*-row-/, '') + ': ' + tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)));
                o.pluginCount = await page.locator('tr.gridRow').count();
                await snap('ctl-02-plugins', {pluginRows: o.pluginRows});
                await page.goto(app.url(`/index.php/${X.path}/management/settings/access`)); await idle(page).catch(() => {});
                const tab = page.getByRole('tab', {name: 'Site Access Options', exact: true}).first();
                if (await tab.count()) { await tab.click(); await idle(page).catch(() => {}); await sleep(600); }
                const main = await page.locator('main').innerText().catch(() => '');
                o.access = {viewArticleContent: /View Article Content/.test(main), box: /open access content/.test(main), text: flat(main, 600)};
                await snap('ctl-03-access', {access: o.access});
                fact('control', o);
            });
        }
    } finally {
        record('js-dialogs', {jsDialogs});
        await close();
    }
});
