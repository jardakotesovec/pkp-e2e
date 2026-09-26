// U20 claim check, chunk K2: the sitemap and the site's index.
// Spec: docs/specs/U20-search-engine-metadata-and-analytics.md — Fields "What the
// sitemap lists" (99–119), Rules 1–6 (185–231), Settings 7 and 9–13 (383–419),
// register A4, OJS2; footnotes e, q2–q8, f-a4, f-ojs2.
//
// Seeds per app (tag prefix u20k2):
//   A  the main scratch context (acronym set, one announcement current and one
//      expired, announcements off): OJS issues Vol 1 No 1 2025 published and
//      Vol 1 No 2 2026 not; items
//        x1 published (OJS in No 1 with a PDF galley, URL Path "sea-study";
//           OPS with a galley and URL Path "sea-study"; OMP a format "PDF" with a file)
//        x2 published (OJS in No 1 with a galley): unpublished and republished on screen
//        x3 submitted, in the workflow
//        x4 scheduled (OJS into Vol 1 No 2; OMP / OPS a date after today)
//        x5 OJS: unpublished, galley; published on screen with "Don't Assign To An Issue"
//           OMP: unpublished, a format "PDF" with a file; two chapters (one with its own
//           page), URL Path "sea-study" and "Publish" all on screen
//   B  a second context with one published item (another journal's work; the site
//      index row unticked on screen by the Site Administrator)
//   C  a context with one published item; "Users must be registered…" ticked on screen
//   D  a context not enabled publicly, one published item
//   N  a context created with an empty principal contact name (the "Contact" other end)
// Phases (PHASES=a,b; default all, in this order):
//   seed read0 visit publish settings closed index lang link newver extra format a4
// Run: PROBE_FEATURE=U20 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U20/K2/k2.js
//   RESEED=1 seeds afresh (a new tag).
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'read0', 'visit', 'publish', 'settings', 'closed', 'index', 'lang', 'link', 'newver', 'extra', 'format', 'a4'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const short = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/index\.php\//, '');
const vis = '[role="dialog"]:visible';
const topWin = (page) => page.locator(vis).last();
const wf = (page) => page.locator(vis).first();
const HASH_MS = 1500;
const CTX_TABLE = {ojs: ['journals', 'journal_id', 'journal_settings'], omp: ['presses', 'press_id', 'press_settings'], ops: ['servers', 'server_id', 'server_settings']};

function psql(app, sql) {
    const cfg = fs.readFileSync(app.configFile, 'utf8');
    const db = cfg.split(/^\[database\]/m)[1] || '';
    const get = (k) => ((db.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
    try {
        return execFileSync('psql', ['-h', get('host') || '127.0.0.1', '-U', get('username'), get('name'), '-At', '-F', '|', '-c', sql],
            {env: {...process.env, PGPASSWORD: get('password')}, encoding: 'utf8', timeout: 20_000}).trim().split('\n').filter(Boolean);
    } catch (e) { return [`ERROR ${String(e.message).slice(0, 300)}`]; }
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs', isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const log = (...a) => console.log(`[k2 ${app.name}]`, ...a);
    const sf = path.join(outDir(), `k2-state-${app.name}.json`);
    let S = (!process.env.RESEED && fs.existsSync(sf)) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k2-facts', {[k]: v}, {merge: true}); log(k, JSON.stringify(v).slice(0, 3000)); };
    const FILE = isOPS ? 'preprint.pdf' : 'article.pdf';
    const J = {ojs: 'journal', omp: 'press', ops: 'server'}[app.name];

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u20k2');
        S = {t, ctx: {}};
        const people = (p) => [
            {username: `${p}m`, roles: ['manager'], givenName: 'Kim', familyName: 'Manager'},
            {username: `${p}r`, roles: ['reader'], givenName: 'Rae', familyName: 'Reader'},
            {username: `${p}a`, roles: ['author'], givenName: 'Ari', familyName: 'Author'},
        ];
        const mk = async (k, extra = {}, ctxExtra = {}) => {
            const p = `${t}${k.toLowerCase()}`;
            const c = await app.api.createContext({tag: p, context: {name: `U20 K2 ${k} ${p}`, acronym: `K2${k}`, ...ctxExtra}, users: people(p), ...extra});
            S.ctx[k] = {path: c.path, m: `${p}m`, r: `${p}r`, a: `${p}a`, subs: {}, issues: c.issues || null, announcements: c.announcements || null};
            return S.ctx[k];
        };
        const sub = async (k, s, extra = {}) => {
            const c = S.ctx[k];
            const r = await app.api.createSubmission({tag: `${t}${k.toLowerCase()}${s}`, context: c.path, submitter: c.a, title: `K2 ${k}${s} ${t}`, ...extra});
            c.subs[s] = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys || null, formats: r.publicationFormats || null, status: r.status};
        };
        const gal = isOMP ? {} : {galleys: [{label: 'PDF', file: FILE}]};
        const fmt = isOMP ? {publicationFormats: [{name: 'PDF', file: 'article.pdf'}]} : {};
        const future = '2027-06-01';
        const ann = {announcements: [
            {title: `K2 current ${t}`, descriptionShort: '<p>Current.</p>', description: '<p>Current announcement.</p>'},
            {title: `K2 expired ${t}`, descriptionShort: '<p>Expired.</p>', description: '<p>Expired announcement.</p>', dateExpire: '2020-01-31'},
        ]};
        // A
        await mk('A', {...ann, ...(isOJS ? {issues: [{volume: 1, number: 1, year: 2025, published: true}, {volume: 1, number: 2, year: 2026}]} : {})});
        const inNo1 = isOJS ? {issue: {volume: 1, number: 1, year: 2025}} : {};
        await sub('A', 'x1', {published: true, ...inNo1, ...gal, ...fmt, ...(isOMP ? {} : {urlPath: 'sea-study'})});
        await sub('A', 'x2', {published: true, ...inNo1, ...gal, ...fmt});
        await sub('A', 'x3', {});
        if (isOJS) await sub('A', 'x4', {published: true, issue: {volume: 1, number: 2, year: 2026}, ...gal});
        else await sub('A', 'x4', {published: true, datePublished: future, ...gal, ...fmt});
        if (isOJS) await sub('A', 'x5', {...gal});
        if (isOMP) await sub('A', 'x5', {files: [{file: 'article.pdf'}], ...fmt});
        // B, C, D
        for (const k of ['B', 'C', 'D']) {
            const extra = isOJS ? {issues: [{volume: 9, number: 1, year: 2025, published: true}]} : {};
            await mk(k, extra, k === 'D' ? {enabled: false} : {});
            await sub(k, 'x1', {published: true, ...(isOJS ? {issue: {volume: 9, number: 1, year: 2025}} : {}), ...gal, ...fmt});
        }
        try { await mk('N', {}, {contactName: ''}); } catch (e) { S.nError = flat(e.message, 600); }
        S.seeded = true;
        save();
        fact('seed', S);
    }
    if (!S.seeded) { log('no state: run the seed phase'); return; }
    const A = S.ctx.A, B = S.ctx.B, C = S.ctx.C, D = S.ctx.D;
    const cUrl = (c, p = '') => app.url(`/index.php/${c}${p}`);
    const wfUrl = (c, id, key) => cUrl(c, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const itemPath = (c, s) => (isOJS ? `${c}/article/view/${s}` : isOMP ? `${c}/catalog/book/${s}` : `${c}/preprint/view/${s}`);

    const {page, close} = await launch(app);
    const visitor = await launch(app);
    const vpage = visitor.page;
    const bad = [], pageErrors = [], dialogs = [];
    for (const [who, pg] of [['m', page], ['v', vpage]]) {
        pg.on('response', (r) => { if (r.status() >= 400) bad.push({at: Date.now(), who, status: r.status(), m: r.request().method(), url: short(r.url()).slice(0, 180)}); });
        pg.on('pageerror', (e) => pageErrors.push({at: Date.now(), who, text: flat(e.message, 200), url: pg.url()}));
        pg.on('dialog', async (d) => { dialogs.push({at: Date.now(), who, type: d.type(), message: d.message().slice(0, 200)}); await d.accept().catch(() => {}); });
    }
    const since = (arr, t0) => arr.filter((e) => e.at >= t0).map(({at, ...x}) => x);

    let snapN = 0;
    async function snap(name, extra, {png = false, pg = page} = {}) {
        let s;
        try { s = await screen(pg); } catch (e) { s = {url: pg.url(), screenError: flat(e.message, 200)}; }
        if (extra) s.facts = extra;
        const n = `k2-${String(++snapN).padStart(3, '0')}-${name}`;
        record(n, s);
        if (png) await shot(pg, n).catch(() => {});
        return n;
    }
    async function sect(name, fn) {
        if (!on(name)) return;
        const t0 = Date.now();
        log(`== ${name}`);
        try { await fn(); } catch (e) {
            fact(`${name}.FAILED`, flat(e.stack || e, 1200));
            await snap(`zz-failed-${name}`, null, {png: true}).catch(() => {});
        }
        const b = since(bad, t0).filter((r) => r.status >= 500), pe = since(pageErrors, t0);
        if (b.length || pe.length) fact(`${name}.crashes`, {server: b, script: pe});
        const d = since(dialogs, t0);
        if (d.length) fact(`${name}.dialogs`, d);
    }
    const as = async (u, ctx) => { await signIn(page, u, ctx ? {contextPath: ctx} : {}); await idle(page).catch(() => {}); };
    const vAs = async (u, ctx) => { await signIn(vpage, u, ctx ? {contextPath: ctx} : {}); await idle(vpage).catch(() => {}); };
    const vOut = async () => { await signOut(vpage).catch(() => {}); await idle(vpage).catch(() => {}); };

    // ------------------------------------------------------------ the sitemap as read
    const last = {};
    /** Open a sitemap address in a browser and read it: the chain, the headers, the entries, what the browser shows. */
    async function sitemap(name, ctx, {pg = vpage, sub = '/sitemap', png = false, key} = {}) {
        const url = ctx === 'index' ? app.url('/index.php/index/sitemap') : cUrl(ctx, sub);
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === pg.mainFrame()) chain.push({url: short(r.url()), status: r.status(), type: (r.headers()['content-type'] || '').split(';')[0]}); } catch { /* */ } };
        pg.on('response', onResp);
        let resp = null, err = null;
        try { resp = await pg.goto(url); } catch (e) { err = flat(e.message, 200); }
        await pg.waitForLoadState('load').catch(() => {});
        pg.off('response', onResp);
        const out = {asked: short(url), landed: short(pg.url()), chain, err};
        if (resp) {
            const h = resp.headers();
            out.status = resp.status();
            out.contentType = h['content-type'] || null;
            out.disposition = h['content-disposition'] || null;
            out.cache = h['cache-control'] || null;
            const body = await resp.text().catch(() => '');
            out.isXml = /^<\?xml/.test(body.trim());
            if (out.isXml) {
                out.root = (body.match(/<(urlset|sitemapindex)\b[^>]*>/) || [])[0] || null;
                const blocks = [...body.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
                out.childTags = [...new Set(blocks.flatMap((b) => [...b.matchAll(/<([a-zA-Z:]+)>/g)].map((m) => m[1])))];
                out.entries = blocks.map((b) => short(((b.match(/<loc>([\s\S]*?)<\/loc>/) || [])[1] || '').replace(/&amp;/g, '&')));
                out.rawHead = body.slice(0, 300);
            }
        }
        out.shown = flat(await pg.evaluate(() => (document.body ? document.body.innerText : document.documentElement.textContent)).catch(() => ''), 300);
        out.docTitle = await pg.title().catch(() => null);
        const k = key || `${ctx}${sub}`;
        if (out.entries && last[k]) {
            out.added = out.entries.filter((e) => !last[k].includes(e));
            out.removed = last[k].filter((e) => !out.entries.includes(e));
        }
        if (out.entries) last[k] = out.entries;
        out.snap = await snap(name, out, {png, pg});
        return out;
    }
    const brief = (o) => (o.entries ? {status: o.status, landed: o.landed, n: o.entries.length, added: o.added, removed: o.removed, entries: o.entries} : {status: o.status, landed: o.landed, chain: o.chain, shown: flat(o.shown, 120)});
    /** Open every entry as a signed-out visitor: status, landing, title. */
    async function visitAll(entries, name) {
        const out = [];
        for (const e of entries) {
            let r = null;
            try { r = await vpage.goto(app.url(`/index.php/${e}`)); } catch (x) { out.push({e, err: flat(x.message, 100)}); continue; }
            await idle(vpage).catch(() => {});
            const h1 = flat(await vpage.locator('h1, h2').first().innerText({timeout: 1500}).catch(() => ''), 80);
            const o = {e, status: r ? r.status() : null, landed: short(vpage.url()), title: flat(await vpage.title().catch(() => ''), 90), h1};
            if (o.landed !== e) o.moved = true;
            out.push(o);
        }
        const odd = out.filter((o) => o.err || (o.status && o.status >= 400) || o.moved);
        await snap(name, {visits: out, odd});
        return {n: out.length, odd, all: out};
    }

    // ------------------------------------------------------------ settings helpers
    async function openTab(ctx, slug, topId, sideId) {
        await page.goto(cUrl(ctx, `/management/settings/${slug}`));
        await idle(page);
        if (topId) { await page.locator(`[id="${topId}-button"]`).first().click().catch(() => {}); await idle(page); await sleep(HASH_MS); }
        if (sideId) { await page.locator(`[id="${sideId}-button"]`).first().click().catch(() => {}); await idle(page); await sleep(HASH_MS); }
    }
    async function saveForm(field, name) {
        const form = page.locator('form').filter({has: field}).first();
        const btn = form.getByRole('button', {name: 'Save', exact: true});
        const out = {requests: []};
        const onResp = (r) => { if (/\/api\/v1\//.test(r.url()) && r.request().method() !== 'GET') out.requests.push({m: r.request().method(), o: r.request().headers()['x-http-method-override'] || null, status: r.status(), url: short(r.url()), body: flat(decodeURIComponent(r.request().postData() || ''), 400)}); };
        page.on('response', onResp);
        await btn.click({timeout: 10_000}).catch((e) => { out.clickError = flat(e.message, 120); });
        const seen = new Set();
        const t0 = Date.now();
        while (Date.now() - t0 < 6000) {
            for (const x of (await page.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => [])).map((y) => y.trim()).filter(Boolean)) seen.add(x);
            if (seen.has('Saved')) break;
            await sleep(300);
        }
        await sleep(400);
        page.off('response', onResp);
        out.statuses = [...seen];
        out.fieldErrors = await form.locator('.pkpFieldError, .pkpFormField__error').allInnerTexts().catch(() => []);
        out.pageErrors = await page.locator('.pkpFormPage__errors, .pkpFormErrors, [role="alert"]').allInnerTexts().catch(() => []);
        out.snap = await snap(name, out);
        return out;
    }
    async function typeRich(editorId, text, {replace = false} = {}) {
        await page.waitForFunction((id) => !!(window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized), editorId, {timeout: T}).catch(() => {});
        const body = page.frameLocator(`[id="${editorId}_ifr"]`).locator('body');
        await body.click();
        if (replace) { await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); } else await page.keyboard.press('Control+End');
        if (text) await page.keyboard.type(text);
        await sleep(300);
        return page.evaluate((id) => window.tinymce.get(id).getContent(), editorId).catch(() => null);
    }
    const ctxRows = (ctx, names) => {
        const [tb, idc, st] = CTX_TABLE[app.name];
        return psql(app, `select setting_name, coalesce(locale,''), setting_value from ${st} s join ${tb} c on c.${idc}=s.${idc} where c.path='${ctx}' and setting_name in (${names.map((n) => `'${n}'`).join(',')}) order by 1,2`);
    };

    // ------------------------------------------------------------ workflow helpers
    async function openWf(ctx, id, key, name) {
        await page.goto(wfUrl(ctx, id, key));
        await idle(page);
        await wf(page).waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        await sleep(500);
        if (name) return snap(name);
        return null;
    }
    const controls = () => page.locator('[data-cy="workflow-controls-right"]');
    async function statusLine() { return flat(await page.locator('[data-cy="workflow-controls-left"]').innerText().catch(() => ''), 150); }
    /** OJS: publish through "Review Publishing Details" with the given assignment. */
    async function publishOJS(sub, mode, name, issueRe) {
        await openWf(A.path, sub.id, `publication_${sub.pub}_titleAbstract`);
        const button = controls().getByRole('button', {name: /^(Schedule For Publication|Publish)$/});
        await button.waitFor({timeout: T});
        await button.click();
        const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
        const stageSel = panel.locator('select[name="versionStage"]');
        if (!(await stageSel.waitFor({state: 'visible', timeout: 5000}).then(() => true).catch(() => false))) { await button.click(); await stageSel.waitFor({state: 'visible', timeout: T}); }
        await idle(page);
        if (!(await stageSel.inputValue().catch(() => ''))) await stageSel.selectOption('VoR').catch(() => {});
        const minor = panel.locator('select[name="versionIsMinor"]');
        if (await minor.isVisible().catch(() => false) && !(await minor.inputValue().catch(() => ''))) await minor.selectOption('false').catch(() => {});
        const radioName = {none: "Don't Assign To An Issue", back: 'Assign To Current/Back Issue'}[mode];
        const radio = panel.getByRole('radio', {name: radioName});
        const out = {};
        if (await radio.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false)) {
            await panel.locator('input[name="assignment"]:checked').first().waitFor({timeout: T}).catch(() => {});
            out.preselected = await panel.locator('input[name="assignment"]:checked').first().evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            await radio.check();
            if (issueRe) {
                const sel = panel.locator('select[name="issueId"]');
                await sel.waitFor({state: 'visible', timeout: T});
                const opt = sel.locator('option').filter({hasText: issueRe});
                await opt.first().waitFor({state: 'attached', timeout: T});
                await sel.selectOption((await opt.first().getAttribute('value')) || '');
            }
        }
        await sleep(300);
        await snap(`${name}-panel`);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const win = page.getByRole('dialog').filter({hasText: /Are you sure you want to/}).last();
        await win.waitFor({timeout: T});
        await idle(page);
        out.window = flat(await win.innerText().catch(() => ''), 400);
        const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await win.getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).last().click();
        const r = await w;
        out.status = r ? r.status() : null;
        await controls().getByRole('button', {name: /^(Unpublish|Unschedule)$/}).first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        out.statusLine = await statusLine();
        out.snap = await snap(name, out);
        return out;
    }
    /** OMP / OPS: the publish control and its window. */
    async function publishOther(ctx, sub, name) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_titleAbstract`);
        const out = {};
        if (isOPS) {
            const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
            const postControl = controls().getByRole('button', {name: 'Post', exact: true});
            await stageAction.or(postControl).first().waitFor({state: 'visible', timeout: T});
            if (!(await postControl.isVisible().catch(() => false)) && await stageAction.isVisible()) await stageAction.click();
            await postControl.waitFor({state: 'visible', timeout: T});
            await postControl.click();
        } else {
            await controls().getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).click();
        }
        const win = page.getByRole('dialog').filter({hasText: /Are you sure you want to/}).last();
        await win.waitFor({timeout: T});
        await idle(page);
        await sleep(600);
        for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
            const x = win.locator(sel);
            if (await x.isVisible().catch(() => false) && !(await x.inputValue().catch(() => ''))) await x.selectOption(val).catch(() => {});
        }
        out.window = flat(await win.innerText().catch(() => ''), 500);
        await snap(`${name}-window`, out);
        const w = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await win.getByRole('button', {name: /^(Publish|Post)$/}).last().click();
        const r = await w;
        out.status = r ? r.status() : null;
        await controls().getByRole('button', {name: /^(Unpublish|Unpost|Unschedule)$/}).first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        out.statusLine = await statusLine();
        out.snap = await snap(name, out);
        return out;
    }
    async function unpublish(ctx, sub, name) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_titleAbstract`);
        const label = isOPS ? 'Unpost' : 'Unpublish';
        await controls().getByRole('button', {name: label, exact: true}).click();
        const win = page.getByRole('dialog').filter({hasText: /Are you sure you don't want this to be/}).last();
        await win.waitFor({timeout: T});
        const out = {window: flat(await win.innerText().catch(() => ''), 300)};
        const w = page.waitForResponse((r) => /\/unpublish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await win.getByRole('button', {name: label, exact: true}).click();
        const r = await w;
        out.status = r ? r.status() : null;
        await sleep(1500);
        await idle(page);
        out.statusLine = await statusLine();
        out.snap = await snap(name, out);
        return out;
    }
    async function newVersion(ctx, sub, name) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_titleAbstract`);
        await page.getByRole('link', {name: 'Create New Version', exact: true}).or(page.getByRole('button', {name: 'Create New Version', exact: true})).first().click();
        const dlg = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
        await dlg.locator('select[name="versionStage"]').waitFor({timeout: T});
        await idle(page);
        await sleep(1200);
        const st = dlg.locator('select[name="versionStage"]');
        if (!(await st.inputValue())) await st.selectOption('VoR');
        const minor = dlg.locator('select[name="versionIsMinor"]');
        if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
        const w = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name: 'Confirm', exact: true}).click();
        const r = await w;
        let id = null;
        try { id = (await r.json()).id; } catch { /* */ }
        await idle(page);
        await sleep(800);
        const out = {status: r ? r.status() : null, newPub: id, statusLine: await statusLine()};
        out.snap = await snap(name, out);
        return out;
    }

    try {
        // ============================================================ read0: the sitemaps as seeded
        await sect('read0', async () => {
            const r = {};
            await vOut();
            r.A = await sitemap('r0-A', A.path, {png: true});
            r.B = brief(await sitemap('r0-B', B.path));
            r.C = brief(await sitemap('r0-C', C.path));
            r.D = brief(await sitemap('r0-D', D.path, {png: true}));
            if (S.ctx.N) r.N = brief(await sitemap('r0-N', S.ctx.N.path));
            r.pk = brief(await sitemap('r0-publicknowledge', app.contextPath));
            // a reader and the manager of A read the same list
            await vAs(A.r, A.path);
            r.Areader = brief(await sitemap('r0-A-reader', A.path, {key: 'A-reader'}));
            await vAs(A.m, A.path);
            r.Amanager = brief(await sitemap('r0-A-manager', A.path, {key: 'A-manager'}));
            await vOut();
            r.ids = Object.fromEntries(Object.entries(A.subs).map(([k, s]) => [k, s.id]));
            r.rowsA = ctxRows(A.path, ['contactName', 'mailingAddress', 'about', 'disableUserReg', 'enableAnnouncements', 'publishingMode']);
            if (S.ctx.N) r.rowsN = ctxRows(S.ctx.N.path, ['contactName', 'mailingAddress']);
            r.statuses = psql(app, `select submission_id, status from submissions where submission_id in (${Object.values(A.subs).map((s) => s.id).join(',')}) order by 1`);
            fact('read0', {...r, A: {...r.A, snap: undefined}});
        });

        // ============================================================ visit: every entry opened signed out
        await sect('visit', async () => {
            await vOut();
            const a = await sitemap('v-A', A.path);
            fact('visitA', await visitAll(a.entries, 'v-A-entries'));
            const pk = await sitemap('v-pk', app.contextPath);
            fact('visitPK', await visitAll(pk.entries, 'v-pk-entries'));
        });

        // ============================================================ publish: publish, unpublish, republish on screen
        await sect('publish', async () => {
            const r = {};
            await vOut();
            await sitemap('p-00-before', A.path);
            await as(A.m, A.path);
            if (isOJS) {
                r.publishNoIssue = await publishOJS(A.subs.x5, 'none', 'p-01-x5-published-no-issue');
                r.afterNoIssue = brief(await sitemap('p-02-after-no-issue', A.path));
                r.x5page = (await visitAll([itemPath(A.path, A.subs.x5.id)], 'p-02b-x5-page')).all;
                r.x5issue = psql(app, `select publication_id, issue_id, status from publications where submission_id=${A.subs.x5.id}`);
            }
            if (isOMP) {
                // chapters (one with its own page), URL Path, then Publish, all on screen
                const s = A.subs.x5;
                r.chapters = [];
                for (const [title, own] of [['K2 Chapter Own Page', true], ['K2 Chapter Plain', false]]) {
                    await openWf(A.path, s.id, `publication_${s.pub}_chapters`);
                    await wf(page).getByRole('link', {name: 'Add Chapter'}).first().click();
                    await topWin(page).locator('input[name^="title"]').first().waitFor({timeout: T});
                    await idle(page);
                    await topWin(page).locator('input[name^="title"]').first().fill(title);
                    const box = topWin(page).locator('input[name="isPageEnabled"]');
                    const label = await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
                    if (own) await box.check();
                    await snap(`p-01-chapter-window-${own ? 'own' : 'plain'}`, {label, checked: await box.isChecked().catch(() => null)});
                    await topWin(page).getByRole('button', {name: 'Save', exact: true}).click();
                    await idle(page); await sleep(1500); await idle(page);
                    r.chapters.push({title, own, label});
                }
                r.chapterRows = psql(app, `select c.chapter_id, cs.setting_value, (select setting_value from submission_chapter_settings where chapter_id=c.chapter_id and setting_name='isPageEnabled') from submission_chapters c join submission_chapter_settings cs on cs.chapter_id=c.chapter_id and cs.setting_name='title' where c.publication_id=${s.pub}`);
                await openWf(A.path, s.id, `publication_${s.pub}_catalogEntry`);
                const up = page.locator('input[name="urlPath"]').first();
                await up.waitFor({timeout: T});
                await up.fill('sea-study');
                const w = page.waitForResponse((x) => /\/publications\/\d+/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await page.locator('form').filter({has: up}).first().getByRole('button', {name: 'Save', exact: true}).click();
                const wr = await w;
                r.urlPathSave = wr ? wr.status() : null;
                await sleep(1000);
                await snap('p-02-catalog-entry-url-path', {urlPathSave: r.urlPathSave});
                r.publishM = await publishOther(A.path, s, 'p-03-x5-published');
                r.afterM = brief(await sitemap('p-04-after-x5', A.path));
            }
            // x2: unpublish, reload, republish, reload
            r.unpub = await unpublish(A.path, A.subs.x2, 'p-05-x2-unpublished');
            r.afterUnpub = brief(await sitemap('p-06-after-unpublish', A.path));
            if (isOJS) r.repub = await publishOJS(A.subs.x2, 'back', 'p-07-x2-republished', /Vol\. 1 No\. 1/);
            else r.repub = await publishOther(A.path, A.subs.x2, 'p-07-x2-republished');
            r.afterRepub = brief(await sitemap('p-08-after-republish', A.path));
            const fin = await sitemap('p-09-final', A.path, {png: true});
            r.visitFinal = await visitAll(fin.entries, 'p-10-final-entries');
            fact('publish', r);
        });

        // ============================================================ settings: entries other settings decide
        await sect('settings', async () => {
            const r = {};
            await vOut();
            await sitemap('s-00-before', A.path);
            await as(A.m, A.path);
            // announcements on, then off
            await openTab(A.path, 'website', 'setup', 'announcements');
            const annBox = page.locator('input[name="enableAnnouncements"]');
            await annBox.waitFor({state: 'attached', timeout: T});
            await snap('s-01-announcements-tab');
            await loc(page, 'Website › Setup › Announcements: "Enable announcements"', annBox);
            await annBox.check();
            r.annOnSave = await saveForm(annBox, 's-02-announcements-on-saved');
            r.annOn = brief(await sitemap('s-03-sitemap-announcements-on', A.path));
            r.annPages = (await visitAll(r.annOn.added || [], 's-03b-announcement-pages')).all;
            await openTab(A.path, 'website', 'setup', 'announcements');
            await annBox.waitFor({state: 'attached', timeout: T});
            await annBox.uncheck();
            r.annOffSave = await saveForm(annBox, 's-04-announcements-off-saved');
            r.annOff = brief(await sitemap('s-05-sitemap-announcements-off', A.path));

            // User Registration: the manager registers all accounts, then back
            await page.goto(cUrl(A.path, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(500);
            const reg = page.locator('input[name="disableUserReg"]');
            r.regLabels = await reg.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim()})));
            await snap('s-06-site-access-options', {regLabels: r.regLabels});
            await loc(page, 'Users & Roles › Site Access Options: "User Registration" radios', reg);
            await reg.nth(1).check();
            r.regCloseSave = await saveForm(reg.first(), 's-07-registration-closed-saved');
            r.regClosed = brief(await sitemap('s-08-sitemap-registration-closed', A.path));
            await page.goto(cUrl(A.path, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(500);
            await reg.nth(0).check();
            r.regOpenSave = await saveForm(reg.first(), 's-09-registration-open-saved');
            r.regOpen = brief(await sitemap('s-10-sitemap-registration-open', A.path));
            // the tab left once with a change unsaved
            await page.goto(cUrl(A.path, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(500);
            await reg.nth(1).check();
            const d0 = Date.now();
            const tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
            const other = tabs.map((x) => x.trim()).find((x) => x && x !== 'Site Access Options');
            if (other) { await page.getByRole('tab', {name: other, exact: true}).first().click().catch(() => {}); await sleep(800); }
            await snap('s-11-access-left-unsaved-tab', {other});
            await page.goto(cUrl(A.path, '/management/settings/website')).catch(() => {}); await idle(page);
            r.leaveUnsaved = {tabs, other, dialogs: since(dialogs, d0), rowsAfter: ctxRows(A.path, ['disableUserReg'])};
            r.regAfterLeave = brief(await sitemap('s-12-sitemap-after-unsaved-leave', A.path));

            // About the Journal: text typed, then emptied
            await openTab(A.path, 'context', 'masthead');
            const country = page.locator('#masthead-country-control');
            await country.selectOption({label: 'Canada'}).catch((e) => { r.countryErr = flat(e.message, 100); });
            const aboutId = await page.locator('textarea[id^="masthead-about-control"]').first().getAttribute('id').catch(() => 'masthead-about-control-en');
            r.aboutTyped = await typeRich(aboutId, 'K2 about text.');
            r.aboutSave = await saveForm(page.locator('#masthead-country-control'), 's-13-about-saved');
            r.aboutRows = ctxRows(A.path, ['about']);
            r.aboutSet = brief(await sitemap('s-14-sitemap-about-set', A.path));
            await openTab(A.path, 'context', 'masthead');
            r.aboutCleared = await typeRich(aboutId, '', {replace: true});
            r.aboutClearSave = await saveForm(page.locator('#masthead-country-control'), 's-15-about-cleared-saved');
            r.aboutRowsCleared = ctxRows(A.path, ['about']);
            r.aboutEmpty = brief(await sitemap('s-16-sitemap-about-emptied', A.path));
            await vpage.goto(cUrl(A.path, '/about')); await idle(vpage);
            r.aboutPageEmptied = {url: short(vpage.url()), text: flat(await vpage.locator('.page_about, .pkp_structure_main').first().innerText().catch(() => ''), 200)};
            await snap('s-16b-about-page-emptied', r.aboutPageEmptied, {pg: vpage});

            // Contact: the principal contact's name cannot be emptied on screen
            await openTab(A.path, 'context', 'contact');
            const cn = page.locator('#contact-contactName-control');
            await cn.waitFor({timeout: T});
            r.contactBefore = await cn.inputValue().catch(() => null);
            await snap('s-17-contact-tab', {contactName: r.contactBefore});
            await cn.fill('');
            await page.locator('#contact-supportName-control').fill('K2 Support');
            await page.locator('#contact-supportEmail-control').fill(`support${S.t}@mail.test`);
            r.contactEmptySave = await saveForm(cn, 's-18-contact-name-emptied-save');
            r.contactRows = ctxRows(A.path, ['contactName', 'mailingAddress']);
            // mailing address typed with the name restored: the entry stays
            await openTab(A.path, 'context', 'contact');
            await cn.fill('Site Admin');
            await page.locator('#contact-supportName-control').fill('K2 Support');
            await page.locator('#contact-supportEmail-control').fill(`support${S.t}@mail.test`);
            await page.locator('#contact-mailingAddress-control').fill('1 Sea Road');
            r.contactAddressSave = await saveForm(cn, 's-19-contact-address-saved');
            r.contactRows2 = ctxRows(A.path, ['contactName', 'mailingAddress']);
            r.contact = brief(await sitemap('s-20-sitemap-contact', A.path));

            // a Custom Page item placed in no menu
            await page.goto(cUrl(A.path, '/management/settings/website#setup/navigationMenus')); await idle(page);
            await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor({timeout: T});
            await idle(page); await sleep(500);
            await page.getByRole('link', {name: 'Add item', exact: true}).click();
            const iw = page.locator(vis).filter({has: page.locator('form#navigationMenuItemsForm')}).first();
            await iw.locator('select[name="menuItemType"]').waitFor({timeout: T});
            await idle(page); await sleep(600);
            await iw.locator('input[name="title[en]"]').fill('K2 Hidden Page');
            await iw.locator('select[name="menuItemType"]').selectOption({label: 'Custom Page'}); await sleep(400);
            await iw.locator('input[name="path"]').fill('k2-hidden');
            await iw.locator('input[name="path"]').click(); await sleep(400);
            await snap('s-21-custom-page-window');
            const cw = page.waitForResponse((x) => /update-navigation-menu-item/.test(x.url()), {timeout: T}).catch(() => null);
            await iw.getByRole('button', {name: 'Save', exact: true}).click();
            const cr = await cw;
            await idle(page); await sleep(900);
            r.customSave = {status: cr ? cr.status() : null, windowOpen: await iw.isVisible().catch(() => false)};
            await snap('s-22-custom-page-saved', r.customSave);
            r.menus = psql(app, `select i.navigation_menu_item_id, i.path, i.type, (select count(*) from navigation_menu_item_assignments a where a.navigation_menu_item_id=i.navigation_menu_item_id) from navigation_menu_items i where i.path='k2-hidden'`);
            r.custom = brief(await sitemap('s-23-sitemap-custom-page', A.path));
            r.customVisit = (await visitAll((r.custom.added || []), 's-23b-custom-page')).all;

            // Publishing Mode {OJS}: "will not be used…", then open access again
            if (isOJS) {
                await page.goto(cUrl(A.path, '/management/settings/distribution')); await idle(page);
                await page.getByRole('tab', {name: 'Access', exact: true}).click(); await idle(page); await sleep(500);
                const radios = page.locator('input[name="publishingMode"]');
                r.modeLabels = await radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim()})));
                await snap('s-24-access-tab', {modeLabels: r.modeLabels});
                await page.locator('input[name="publishingMode"][value="2"]').check();
                r.modeNoneSave = await saveForm(radios.first(), 's-25-mode-none-saved');
                r.modeNone = brief(await sitemap('s-26-sitemap-mode-none', A.path));
                await page.goto(cUrl(A.path, '/management/settings/distribution')); await idle(page);
                await page.getByRole('tab', {name: 'Access', exact: true}).click(); await idle(page); await sleep(500);
                await page.locator('input[name="publishingMode"][value="0"]').check();
                r.modeOpenSave = await saveForm(radios.first(), 's-27-mode-open-saved');
                r.modeOpen = brief(await sitemap('s-28-sitemap-mode-open', A.path));
            }
            // the "Contact" other end: a context created with no principal contact name
            if (S.ctx.N) r.N = brief(await sitemap('s-29-sitemap-no-contact-name', S.ctx.N.path));
            fact('settings', r);
        });

        // ============================================================ closed: Rule 6, Setting 7
        await sect('closed', async () => {
            const r = {};
            await vOut();
            r.Copen = brief(await sitemap('c-01-C-open', C.path));
            await as(C.m, C.path);
            await page.goto(cUrl(C.path, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(500);
            const box = page.locator('input[name="restrictSiteAccess"]');
            r.boxLabel = await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            await box.check();
            r.save = await saveForm(box, 'c-02-restrict-saved');
            r.rows = ctxRows(C.path, ['restrictSiteAccess']);
            await vOut();
            r.Cclosed = await sitemap('c-03-C-closed-signed-out', C.path, {png: true});
            r.Cclosed = {...brief(r.Cclosed), chain: r.Cclosed.chain};
            await vAs(C.r, C.path);
            r.Creader = brief(await sitemap('c-04-C-closed-reader', C.path, {key: 'C-reader'}));
            await vOut();
            // the site index keeps C
            r.index = brief(await sitemap('c-05-index-with-C-closed', 'index'));
            r.indexHasC = (r.index.entries || []).some((e) => e.startsWith(`${C.path}/`));
            // D, never enabled
            r.Dout = await sitemap('c-06-D-signed-out', D.path, {png: true});
            r.Dout = {...brief(r.Dout), chain: r.Dout.chain};
            await vAs(D.m, D.path);
            r.Dmanager = brief(await sitemap('c-07-D-manager', D.path, {key: 'D-m'}));
            r.DmanagerLanded = short(vpage.url());
            await vAs(D.r, D.path).catch((e) => { r.DreaderSignIn = flat(e.message, 200); });
            r.DreaderAfterSignIn = short(vpage.url());
            r.Dreader = brief(await sitemap('c-08-D-reader', D.path, {key: 'D-r'}));
            await vOut();
            fact('closed', r);
        });

        // ============================================================ index: Rule 5
        await sect('index', async () => {
            const r = {};
            await vOut();
            const i0 = await sitemap('i-01-index', 'index', {png: true});
            r.i0 = {status: i0.status, root: i0.root, childTags: i0.childTags, disposition: i0.disposition, n: (i0.entries || []).length,
                ours: (i0.entries || []).filter((e) => Object.values(S.ctx).some((c) => e.startsWith(`${c.path}/`))), pk: (i0.entries || []).filter((e) => e.startsWith(`${app.contextPath}/`) || e.startsWith(`${app.contextPath}`)), first: (i0.entries || []).slice(0, 5)};
            r.hasD = (i0.entries || []).some((e) => e.startsWith(`${D.path}/`));
            r.enabledCount = psql(app, `select count(*) from ${CTX_TABLE[app.name][0]} where enabled=1`);
            // admin unticks B on Hosted Journals › Edit
            await as('admin');
            await page.goto(app.url('/index.php/index/admin/contexts')); await idle(page); await sleep(500);
            const row = page.locator('tr.gridRow').filter({hasText: `U20 K2 B ${B.path}`}).first();
            await row.waitFor({timeout: T});
            await row.locator('a.show_extras').click(); await idle(page); await sleep(400);
            await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
            const cb = page.getByRole('checkbox', {name: /appear publicly on the site/});
            await cb.waitFor({timeout: T});
            await idle(page); await sleep(600);
            r.label = await cb.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            await cb.uncheck();
            const dlg = page.locator(vis).filter({has: cb}).last();
            const country = dlg.getByRole('combobox', {name: /Country/});
            if (await country.count()) await country.selectOption({label: 'Canada'}).catch(() => {});
            await snap('i-02-hosted-edit-unticked', {label: r.label});
            const w = page.waitForResponse((x) => /\/api\/v1\/contexts\/\d+/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await dlg.getByRole('button', {name: 'Save', exact: true}).click();
            const wr = await w;
            await sleep(1500); await idle(page);
            r.save = {status: wr ? wr.status() : null, open: await cb.isVisible().catch(() => false), errors: await dlg.locator('.pkpFieldError, .pkpFormField__error').allInnerTexts().catch(() => [])};
            await snap('i-03-hosted-saved', r.save);
            r.enabledB = psql(app, `select enabled from ${CTX_TABLE[app.name][0]} where path='${B.path}'`);
            const i1 = await sitemap('i-04-index-B-unticked', 'index');
            r.i1 = {n: (i1.entries || []).length, removed: i1.removed, added: i1.added, hasB: (i1.entries || []).some((e) => e.startsWith(`${B.path}/`))};
            r.Bout = brief(await sitemap('i-05-B-signed-out', B.path));
            await signOut(page).catch(() => {});
            fact('index', r);
        });

        // ============================================================ lang: Rule 4's second half on publicknowledge
        await sect('lang', async () => {
            const r = {};
            await vOut();
            r.plain = brief(await sitemap('l-01-pk-plain', app.contextPath, {key: 'pk-plain'}));
            r.en = brief(await sitemap('l-02-pk-en', app.contextPath, {sub: '/en/sitemap', key: 'pk-en'}));
            r.fr = brief(await sitemap('l-03-pk-fr', app.contextPath, {sub: '/fr_CA/sitemap', key: 'pk-fr'}));
            // the visitor's way: the language switch on the home page, then the plain address
            await vpage.goto(cUrl(app.contextPath)); await idle(vpage);
            const fr = vpage.getByRole('link', {name: /Français/}).first();
            r.switchLink = await fr.getAttribute('href').catch(() => null);
            if (await fr.count()) { await fr.click(); await idle(vpage); }
            r.afterSwitch = short(vpage.url());
            await snap('l-04-home-after-switch', {afterSwitch: r.afterSwitch}, {pg: vpage});
            r.plainAfterSwitch = brief(await sitemap('l-05-pk-plain-after-switch', app.contextPath, {key: 'pk-plain2'}));
            r.index = brief(await sitemap('l-06-index', 'index', {key: 'index-l'}));
            r.indexPk = (r.index.entries || []).filter((e) => e.startsWith(app.contextPath));
            const en = vpage.getByRole('link', {name: /English/}).first();
            await vpage.goto(cUrl(app.contextPath)); await idle(vpage);
            if (await en.count()) { await en.click(); await idle(vpage); }
            // a single-language scratch context: no language in its addresses
            r.Aplain = (await sitemap('l-07-A-plain', A.path, {key: 'A-l'})).entries?.slice(0, 3);
            fact('lang', {...r, plain: {...r.plain, entries: r.plain.entries}, en: {...r.en}, fr: {...r.fr}});
        });

        // ============================================================ link: Rule 1's "only link"
        await sect('link', async () => {
            const r = {};
            await as(A.m, A.path);
            await page.goto(cUrl(A.path, '/management/settings/distribution')); await idle(page);
            const tab = page.getByRole('tab', {name: 'Search Indexing', exact: true});
            r.tab = await tab.count();
            if (r.tab) { await tab.click(); await idle(page); await sleep(600); }
            const links = page.locator('a[href*="sitemap"]:visible');
            r.tabLinks = await links.evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), target: a.getAttribute('target')})));
            r.tabText = flat(await page.locator('[role="tabpanel"]:visible').first().innerText().catch(() => ''), 600);
            await snap('k-01-search-indexing-tab', r, {png: true});
            await loc(page, 'Distribution › Search Indexing: the "sitemap" link', links);
            if (r.tabLinks.length) {
                const [pop] = await Promise.all([page.context().waitForEvent('page', {timeout: 8000}).catch(() => null), links.first().click().catch(() => {})]);
                const tgt = pop || page;
                await tgt.waitForLoadState('load').catch(() => {});
                r.clicked = {newTab: !!pop, url: short(tgt.url())};
                if (pop) await pop.close();
            }
            // any other screen linking to it
            const scan = async (pg, u) => { await pg.goto(u).catch(() => {}); await idle(pg).catch(() => {}); return {u: short(u), links: await pg.locator('a[href*="sitemap"]').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => [])}; };
            r.scan = [];
            for (const p of ['/management/settings/website', '/management/settings/context', `/dashboard/editorial`]) r.scan.push(await scan(page, cUrl(A.path, p)));
            await as('admin');
            for (const p of ['/index.php/index/admin', '/index.php/index/admin/settings', '/index.php/index/admin/contexts']) r.scan.push(await scan(page, app.url(p)));
            await vOut();
            for (const p of ['', '/about', '/about/submissions', '/about/contact', '/search', '/login', '/user/register']) r.scan.push(await scan(vpage, cUrl(A.path, p)));
            r.scan.push(await scan(vpage, app.url('/index.php/index')));
            r.scanHits = r.scan.filter((x) => x.links.length);
            await snap('k-02-scan', {scan: r.scan}, {pg: vpage});
            await signOut(page).catch(() => {});
            fact('link', {...r, scan: undefined});
        });

        // ============================================================ newver: a new version not yet published (sweep)
        await sect('newver', async () => {
            const r = {};
            await vOut();
            const before = await sitemap('n-00-before', A.path);
            await as(A.m, A.path);
            const s = isOMP ? A.subs.x5 : A.subs.x1;
            r.version = await newVersion(A.path, s, 'n-01-new-version');
            const after = await sitemap('n-02-after-new-version', A.path);
            r.added = after.added; r.removed = after.removed;
            r.visitChanged = (await visitAll([...(after.added || [])], 'n-03-changed-entries')).all;
            r.pubs = psql(app, `select publication_id, status from publications where submission_id=${s.id} order by 1`);
            if (isOMP) r.chapters = psql(app, `select chapter_id, publication_id from submission_chapters where publication_id in (select publication_id from publications where submission_id=${s.id}) order by 1`);
            if (isOJS) r.galleys = psql(app, `select galley_id, publication_id, url_path from publication_galleys where publication_id in (select publication_id from publications where submission_id=${s.id}) order by 1`);
            r.before = before.entries.filter((e) => e.includes(`/${s.id}`) || e.includes('sea-study'));
            r.afterItem = after.entries.filter((e) => e.includes(`/${s.id}`) || e.includes('sea-study'));
            await signOut(page).catch(() => {});
            fact('newver', r);
        });
        // ============================================================ extra: the issue page beside the sitemap {OJS}
        await sect('extra', async () => {
            const r = {};
            await vOut();
            if (isOJS) {
                const issueId = A.issues[0].id;
                await vpage.goto(cUrl(A.path, `/issue/view/${issueId}`)); await idle(vpage);
                r.issueLinks = await vpage.locator('a[href*="/article/view/"]').evaluateAll((els) => [...new Set(els.map((a) => a.getAttribute('href').replace(/^https?:\/\/[^/]+\/index\.php\//, '')))]);
                await snap('e-01-issue-page', r, {pg: vpage, png: true});
                r.sitemap = brief(await sitemap('e-02-sitemap-beside-issue-page', A.path, {key: 'A-e'}));
                r.articlesInSitemap = (r.sitemap.entries || []).filter((e) => /article\/view/.test(e));
            }
            await vOut();
            fact('extra', r);
        });
        // ============================================================ format {OMP}: a file's entry against its format's availability and its terms
        await sect('format', async () => {
            if (!isOMP) return;
            const r = {};
            const s = A.subs.x2;
            const cat = () => wf(page).locator('tr.gridRow').filter({has: page.locator('.onix_code')}).first();
            const fileRow = () => wf(page).locator('tr.gridRow').filter({has: page.locator('a.pkp_linkaction_downloadFile')}).first();
            const go = async () => { await openWf(A.path, s.id, `publication_${s.pub}_publicationFormats`); await cat().waitFor({timeout: T}); await idle(page); };
            const toggle = async (label) => {
                const a = cat().getByRole('link', {name: new RegExp(`^${label}$`)}).first();
                const out = {offered: await a.count()};
                if (!out.offered) { out.rowLinks = await cat().getByRole('link').allInnerTexts().catch(() => []); return out; }
                await a.click(); await idle(page); await sleep(700);
                out.question = flat(await topWin(page).innerText().catch(() => ''), 300);
                await topWin(page).getByRole('button', {name: /^(OK|Yes)$/}).first().click().catch(() => {});
                await idle(page); await sleep(1500);
                out.rowAfter = flat(await cat().innerText().catch(() => ''), 200);
                return out;
            };
            await vOut();
            await sitemap('f-00-before', A.path);
            await as(A.m, A.path);
            await go();
            r.row = flat(await cat().innerText().catch(() => ''), 200);
            r.fileRow = flat(await fileRow().innerText().catch(() => ''), 200);
            await snap('f-01-formats-page', {row: r.row, fileRow: r.fileRow}, {png: true});
            r.off = await toggle('Available');
            await snap('f-02-format-not-available', r.off);
            r.sitemapOff = brief(await sitemap('f-03-sitemap-format-not-available', A.path));
            await go();
            r.on = await toggle('Not Available');
            r.sitemapOn = brief(await sitemap('f-04-sitemap-format-available', A.path));
            // the file's terms: the window's choices, one that is neither open access nor priced
            await go();
            const terms = fileRow().getByRole('link', {name: /Set Terms|Not Available|Open Access|Direct Sales/}).first();
            r.termsLink = await terms.innerText().catch(() => null);
            if (await terms.count()) {
                await terms.click(); await idle(page); await sleep(900);
                r.termsChoices = await topWin(page).locator('input[type="radio"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim()})));
                await snap('f-05-terms-window', {choices: r.termsChoices}, {png: true});
                const na = topWin(page).locator('input[type="radio"][value="notAvailable"]');
                if (await na.count()) {
                    await na.check();
                    await topWin(page).getByRole('button', {name: /^(Save|OK)$/}).first().click().catch(() => {});
                    await idle(page); await sleep(1500);
                    r.fileRowNA = flat(await fileRow().innerText().catch(() => ''), 200);
                    r.priceRow = psql(app, `select submission_file_id, direct_sales_price, sales_type from submission_files where submission_file_id=${s.formats[0].submissionFileId}`);
                    r.sitemapNA = brief(await sitemap('f-06-sitemap-file-not-available', A.path));
                    await go();
                    await fileRow().getByRole('link', {name: /Set Terms|Not Available|Open Access|Direct Sales/}).first().click(); await idle(page); await sleep(900);
                    await topWin(page).locator('input[type="radio"][value="openAccess"]').check().catch(() => {});
                    await topWin(page).getByRole('button', {name: /^(Save|OK)$/}).first().click().catch(() => {});
                    await idle(page); await sleep(1500);
                    r.sitemapOA = brief(await sitemap('f-07-sitemap-file-open-access-again', A.path));
                } else {
                    await topWin(page).getByRole('button', {name: /^(Cancel|Close)$/}).first().click().catch(() => {});
                }
            }
            await signOut(page).catch(() => {});
            fact('format', r);
        });

        // ============================================================ a4: the listing pages no sitemap lists (register A4)
        await sect('a4', async () => {
            await vOut();
            const pk = app.contextPath;
            const urls = isOJS ? [`${pk}/catalog/category/applied-science`, `${pk}/search`, `${pk}/issue/archive`]
                : isOMP ? [`${pk}/search/search`, `${pk}/search`, `${pk}/catalog/category/applied-science`]
                    : [`${pk}/preprints`, `${pk}/preprints/category/applied-science`, `${pk}/search`];
            const v = await visitAll(urls, 'a-01-unlisted-listing-pages');
            const sm = await sitemap('a-02-pk-sitemap', pk, {key: 'pk-a4'});
            fact('a4', {visits: v.all, listed: urls.map((u) => ({u, listed: (sm.entries || []).some((e) => e.replace('/en/', '/') === u || e === u)}))});
            if (isOMP) {
                await vpage.goto(cUrl(pk, '/catalog/series/monographs')); await idle(vpage);
                await snap('a-03-series-page', {title: await vpage.title(), heads: await vpage.locator('h1, h2').allInnerTexts().catch(() => [])}, {pg: vpage});
            }
        });
    } finally {
        await close();
        await visitor.close();
    }
});
