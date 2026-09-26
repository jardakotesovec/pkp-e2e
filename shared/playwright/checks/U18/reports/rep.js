// U18 team write-ups: one re-drive of the numbered steps of the three reports (register A1, A7, OPS1).
// Spec: docs/specs/U18-web-feeds.md, footnotes f-a1, f-a7, f-ops1; reports docs/reports/2026-09-26-webfeed-*.md.
//
//   PROBE_FEATURE=U18 PROBE_AGENT=rep node bin/probe.js <ojs|omp|ops> shared/playwright/checks/U18/reports/rep.js
//
// One app per process. Scratch contexts per app (tag prefix u18rep), each with a manager (mg):
//   E  "Sea Letters": nothing published, the "Latest publications" box placed (A1; OPS1 on OPS).
//   K  "Tide Notes": keywords, subjects and disciplines on; "Tidal Patterns" published 2024-03-05 with
//      keywords "tides", "moon", subject "Oceanography", discipline "Marine science" (typed on its Metadata page
//      by the builder) (A7); then, OJS only, "Display items in current published issue." with no issue (A1 variant).
// Phases (all by default): seed · a1 · a7 · a1issue (OJS) · ops1 (OPS). State in rep-state-<app>.json.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const PHASES = (process.env.PHASES || 'seed,a1,a7,a1issue,ops1').split(',');
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const log = (...a) => console.log(`[rep +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

const XML2JSON = (xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const pe = doc.getElementsByTagName('parsererror')[0];
    if (pe) return {parseError: pe.textContent.slice(0, 300)};
    const pick = (el, names) => names.flatMap((n) => [...el.getElementsByTagName(n)]);
    const t = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
    const root = doc.documentElement;
    const items = pick(root, ['entry', 'item']).map((i) => ({
        title: t(i.getElementsByTagName('title')[0]),
        summary: t(i.getElementsByTagName('summary')[0] || i.getElementsByTagName('description')[0]),
        terms: [
            ...[...i.getElementsByTagName('category')].map((c) => (c.getAttribute('term') != null ? `${c.getAttribute('label')}=${c.getAttribute('term')}` : `${(c.getAttribute('domain') || '').split('/').pop()}=${t(c)}`)),
            ...[...i.getElementsByTagName('dc:subject')].map((s) => {
                const topic = s.getElementsByTagName('taxo:topic')[0];
                return `${((topic && topic.getAttribute('rdf:resource')) || '').split('/').pop()}=${t(s.getElementsByTagName('rdf:value')[0])}`;
            }),
        ],
    }));
    const ch = root.getElementsByTagName('channel')[0] || root;
    return {root: root.tagName, title: t(ch.getElementsByTagName('title')[0]), publisher: t(root.getElementsByTagName('dc:publisher')[0]),
        pubDate: t(root.getElementsByTagName('pubDate')[0]), updated: t(root.getElementsByTagName('updated')[0]), items};
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs', isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const sp = path.join(outDir(), `rep-state-${app.name}.json`);
    const S = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : {};
    const save = () => fs.writeFileSync(sp, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('rep-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const strip = (u) => (u || '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    const feedUrl = (ctx, type) => cu(ctx, `/gateway/plugin/WebFeedGatewayPlugin/${type}`);
    const logFile = path.join(REPO, 'apps', app.name, 'playwright', '.server-logs', `server-${app.port}-probe.log`);
    const logSize = () => { try { return fs.statSync(logFile).size; } catch { return 0; } };
    const logSince = (from, needle) => {
        try {
            const fd = fs.openSync(logFile, 'r'); const len = logSize() - from; const buf = Buffer.alloc(Math.max(0, len));
            fs.readSync(fd, buf, 0, buf.length, from); fs.closeSync(fd);
            return buf.toString('utf8').split('\n').filter((l) => l.includes(needle)).map((l) => l.slice(0, 400));
        } catch (e) { return [`log read error ${e.message}`]; }
    };

    await app.api.bootstrapProbe(app.contextPath);
    const {page, close} = await launch(app);
    const gateway = [];
    page.context().on('response', (r) => { if (/\/gateway/.test(r.url())) gateway.push({at: Date.now(), url: strip(r.url()), status: r.status(), ct: r.headers()['content-type'] || null}); });
    const snap = async (name, extra = {}, png = false) => { let s; try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message)}; } Object.assign(s, extra); record(name, s); if (png) await shot(page, name).catch(() => {}); return s; };
    const go = async (url) => { const r = await page.goto(url).catch((e) => ({err: String(e.message).slice(0, 200)})); await idle(page).catch(() => {}); return r && typeof r.status === 'function' ? r.status() : r; };
    const visitor = async () => { await signOut(page).catch(() => {}); };

    /** A feed opened by pressing a box link (or by its address): page or download, status, body, parsed. */
    async function openFeed(name, {click, url}) {
        const t0 = Date.now();
        const out = {};
        const dlP = page.waitForEvent('download', {timeout: 12_000}).catch(() => null);
        let resp = null, body = null;
        if (click) {
            out.href = strip(await click.getAttribute('href'));
            out.alt = await click.locator('img').getAttribute('alt').catch(() => null);
            const nav = page.waitForNavigation({timeout: 12_000}).catch(() => null);
            await click.click();
            let n = await Promise.race([nav, dlP.then((d) => (d ? {download: d} : null))]);
            if (!n) { const d = await dlP; n = d ? {download: d} : null; }
            if (n && n.download) { out.mode = 'download'; out.file = n.download.suggestedFilename(); body = fs.readFileSync(await n.download.path(), 'utf8'); } else if (n) { resp = n; }
        } else {
            out.href = strip(url);
            try { resp = await page.goto(url); } catch (e) {
                if (/Download is starting/.test(e.message)) { const d = await dlP; out.mode = 'download'; out.file = d && d.suggestedFilename(); body = d ? fs.readFileSync(await d.path(), 'utf8') : null; } else out.err = String(e.message).slice(0, 200);
            }
        }
        if (resp) { out.mode = 'page'; body = await resp.text().catch(() => null); out.status = resp.status(); out.contentType = resp.headers()['content-type']; }
        await idle(page).catch(() => {});
        out.gateway = gateway.filter((g) => g.at >= t0);
        if (out.status == null && out.gateway.length) { out.status = out.gateway[out.gateway.length - 1].status; out.contentType = out.gateway[out.gateway.length - 1].ct; }
        out.pageUrl = strip(page.url());
        out.tabTitle = await page.title().catch(() => null);
        out.bodyLength = body ? body.length : 0;
        out.body = body ? body.slice(0, 6000) : null;
        out.parsed = body ? await page.evaluate(XML2JSON, body).catch((e) => ({parseError: String(e.message)})) : null;
        if (out.mode === 'page') { out.shownText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 1500) : null).catch(() => null); await snap(name, {feed: out}, true); } else record(name, out);
        fact(name, {href: out.href, alt: out.alt, mode: out.mode, file: out.file, status: out.status, ct: out.contentType, tabTitle: out.tabTitle, bodyLength: out.bodyLength, parsed: out.parsed});
        return out;
    }
    const boxLink = (alt) => page.locator('.block_web_feed a').filter({has: page.locator(`img[alt="${alt}"]`)}).first();
    async function homeBox(ctx, name) {
        const st = await go(cu(ctx));
        const box = await page.evaluate(() => { const b = document.querySelector('.block_web_feed'); return b ? {text: b.innerText.replace(/\s+/g, ' ').trim(), links: [...b.querySelectorAll('a')].map((a) => ({href: a.getAttribute('href'), alt: a.querySelector('img')?.getAttribute('alt')}))} : null; });
        await snap(name, {status: st, box}, true);
        fact(name, {status: st, box});
    }

    // the plugin's settings window: Settings › Website › Plugins › "Web Feed Plugin" › "Settings"
    const dialog = () => page.locator('[role="dialog"]:visible').last();
    async function setWindow(ctx, vals, name) {
        await go(cu(ctx, '/management/settings/website'));
        await page.locator('#plugins-button').click(); await idle(page); await sleep(600);
        const row = page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Web Feed Plugin'}).first();
        await row.waitFor({timeout: T});
        const exp = row.locator('a.show_extras').first();
        if (await exp.count()) { await exp.click(); await sleep(500); }
        await page.locator('#pluginGridContainer tr.row_controls:visible').first().getByRole('link', {name: 'Settings', exact: true}).first().click();
        const d = dialog();
        await d.locator('input[name="recentItems"]').waitFor({timeout: T}); await idle(page); await sleep(400);
        const labels = await d.evaluate((root) => [...root.querySelectorAll('input[type=radio], input[type=checkbox]')].map((i) => ({name: i.name, value: i.value, checked: i.checked, label: (root.querySelector(`label[for="${i.id}"]`) || i.closest('label') || {}).innerText?.replace(/\s+/g, ' ').trim()})));
        if (vals.includeIdentifiers) await d.locator('input[name="includeIdentifiers"]').check();
        if (vals.displayItems) await d.locator(`input[type=radio][name="displayItems"][value="${vals.displayItems}"]`).check();
        await snap(`${name}-filled`, {labels}, true);
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /manage/.test(r.url()), {timeout: T}).catch(() => null);
        await d.getByRole('button', {name: 'OK', exact: true}).click();
        const resp = await w;
        await sleep(1000); await idle(page);
        const notices = await page.locator('.ui-pnotify-text, .pkpNotification, [role="alert"]').allInnerTexts().then((a) => a.map((x) => flat(x, 200)).filter(Boolean)).catch(() => []);
        await snap(`${name}-after-ok`, {post: resp && resp.status(), notices}, true);
        fact(name, {labels, vals, post: resp && resp.status(), notices});
    }

    try {
        if (on('seed')) {
            if (!S.t) { S.t = tag('u18rep'); save(); }
            const t = S.t;
            const users = (p) => [{username: `${p}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}, {username: `${p}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'}];
            const mk = async (key, name, extra = {}) => {
                if (S[key]) return;
                const p = `${t}${key.toLowerCase()}`.slice(0, 32);
                const r = await app.api.createContext({tag: p, users: users(p), ...extra, context: {name: `${name} ${t}`, acronym: key === 'E' ? 'SL' : 'TN', contactName: 'Paula Principal', contactEmail: `principal${p}@mail.test`}});
                S[key] = {path: r.path, id: r.contextId}; save(); log('ctx', key, r.path);
            };
            await mk('E', 'Sea Letters', {plugins: {webfeedplugin: {enabled: true}}, sidebar: ['WebFeedBlockPlugin']});
            await mk('K', 'Tide Notes', {metadata: {keywords: 'request', subjects: 'request', disciplines: 'request'}, plugins: {webfeedplugin: {enabled: true}}, sidebar: ['WebFeedBlockPlugin']});
            if (!S.sub) {
                const r = await app.api.createSubmission({tag: `${t}tp`.slice(0, 32), context: S.K.path, submitter: `${S.K.path}au`, title: `Tidal Patterns ${t}`,
                    abstract: '<p>Tides follow the moon.</p>', published: true, datePublished: '2024-03-05',
                    ...(isOMP ? {} : {keywords: {en: ['tides', 'moon']}, subjects: {en: ['Oceanography']}, disciplines: {en: ['Marine science']}})});
                S.sub = r.submissionId; S.pub = r.publicationId; save(); log('sub', r.submissionId);
            }
            // OMP: the builder has no term lists for a press, so the Press Manager types them on the book's "Metadata" page
            if (isOMP && !S.ompTerms) {
                await signIn(page, `${S.K.path}mg`, {contextPath: S.K.path}); await idle(page);
                await go(cu(S.K.path, `/dashboard/editorial?workflowSubmissionId=${S.sub}&workflowMenuKey=publication_${S.pub}_titleAbstract`));
                await sleep(800);
                const wf = page.locator('[role="dialog"]:visible').first();
                const l = wf.getByRole('link', {name: 'Metadata', exact: true}).last();
                await l.waitFor({state: 'visible', timeout: T}); await l.click(); await idle(page); await sleep(900);
                const typed = {};
                for (const [label, terms] of [['Keywords', ['tides', 'moon']], ['Subjects', ['Oceanography']], ['Disciplines', ['Marine science']]]) {
                    const f = wf.locator('.pkpFormField').filter({has: page.locator('legend, label').filter({hasText: new RegExp(`^${label}`)})}).first();
                    const input = f.locator('input[type="text"], input:not([type])').first();
                    for (const term of terms) { await input.click(); await input.fill(term); await sleep(400); await page.keyboard.press('Enter'); await sleep(500); }
                    typed[label] = flat(await f.innerText().catch(() => null), 200);
                }
                const w = page.waitForResponse((x) => /\/publications\/\d+/.test(x.url()) && ['POST', 'PUT'].includes(x.request().method()), {timeout: T}).catch(() => null);
                await wf.getByRole('button', {name: 'Save', exact: true}).last().click();
                const resp = await w;
                await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
                await snap('seed-omp-metadata-saved', {typed, status: resp && resp.status()}, true);
                S.ompTerms = resp ? resp.status() : 'no response'; save();
                fact('seed-omp-terms', {typed, status: S.ompTerms});
                await visitor();
            }
            fact('seed', S);
        }
        const E = S.E, K = S.K;

        if (on('a1')) {
            await visitor();
            await homeBox(E.path, 'a1-01-home');
            const l0 = logSize();
            const rss2 = await openFeed('a1-02-rss2-logo', {click: boxLink('RSS2 logo')});
            await sleep(500);
            fact('a1-02-server-log', logSince(l0, `${E.path}/gateway`).concat(logSince(l0, 'TypeError')).slice(0, 8));
            await page.goBack().catch(() => {}); await idle(page).catch(() => {});
            await openFeed('a1-03-atom-logo', {click: boxLink('Atom logo')});
            await page.goBack().catch(() => {}); await idle(page).catch(() => {});
            await openFeed('a1-04-rss-logo', {click: boxLink('RSS1 logo')});
            void rss2;
        }

        if (on('a7') || on('a7page')) {
            await visitor();
            // a press's home page lists no new book: its "Catalog" lists it
            const st = await go(cu(K.path, isOMP ? '/catalog' : ''));
            const itemLink = page.getByRole('link', {name: new RegExp(`Tidal Patterns ${S.t}`)}).first();
            await itemLink.click().catch(() => {}); await idle(page);
            const kw = await page.evaluate(() => [...document.querySelectorAll('.keywords, .item.keywords, .subject, .disciplines')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
            await snap('a7-01-item-page', {homeStatus: st, kw}, true);
            fact('a7-01-item-page', {url: strip(page.url()), kw});
        }
        if (on('a7')) {
            await openFeed('a7-02-atom-before', {url: feedUrl(K.path, 'atom')});
            await signIn(page, `${K.path}mg`, {contextPath: K.path}); await idle(page);
            await setWindow(K.path, {includeIdentifiers: true}, 'a7-03-include-identifiers');
            await visitor();
            await openFeed('a7-04-atom-after', {url: feedUrl(K.path, 'atom')});
            await openFeed('a7-05-rss2-after', {url: feedUrl(K.path, 'rss2')});
            await openFeed('a7-06-rss-after', {url: feedUrl(K.path, 'rss')});
        }

        if (on('a1issue') && isOJS) {
            await signIn(page, `${K.path}mg`, {contextPath: K.path}); await idle(page);
            await setWindow(K.path, {displayItems: 'issue'}, 'a1i-01-current-issue');
            await visitor();
            await openFeed('a1i-02-atom', {url: feedUrl(K.path, 'atom')});
            const l0 = logSize();
            await openFeed('a1i-03-rss2', {url: feedUrl(K.path, 'rss2')});
            await sleep(500);
            fact('a1i-03-server-log', logSince(l0, 'TypeError').slice(0, 4));
        }

        if (on('ops1') && isOPS) {
            await visitor();
            await go(cu(E.path));
            await openFeed('ops1-01-rss-logo', {click: boxLink('RSS1 logo')});
        }
    } finally {
        await close();
    }
});
