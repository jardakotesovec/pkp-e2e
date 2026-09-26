// U20 claim check, chunk K3: the bibliographic tags on article, preprint, book, chapter and file pages.
// Spec: docs/specs/U20-search-engine-metadata-and-analytics.md — Fields (120–180: the Google Scholar and Dublin
// Core tag tables), Rules 12–17 (262–307), Settings 3–4 (368–375), Setting 15 (425–430), register OJS1, OMP1–OMP3;
// footnotes a, e, h, i, j, q14–q19, f-ojs1, f-omp1–3.
//
//   PROBE_FEATURE=U20 PROBE_AGENT=ccK3 node bin/probe.js <ojs|omp|ops> shared/playwright/checks/U20/K3/k3.js
//   PHASES=a,b (default: all, in the order of ALL). State in k3-state-<app>.json under the output folder, so a
//   phase re-runs alone; RESEED=1 seeds afresh (a new tag). One app per process keeps a run under the Bash cap.
//
// Scratch context per app (tag prefix u20k3), "M": English and French (UI, forms, submission languages); the
// metadata items keywords, subjects, disciplines, agencies, coverage, rights, source, type, citations offered;
// OJS section ART "Sea Articles", issue Vol. 3 No. 7 (2024) published; OMP a series "K3 Series" with an online
// ISSN made on screen. Users: <p>mg manager, <p>au author (affiliation "Harbour University"), <p>rd reader.
// Items:
//   rich  submitted, NOT published by the seed: title/subtitle/abstract (with markup) in English and French,
//         keywords/subjects/agencies in both, a discipline, two references, datePublished 2024-03-05;
//         OJS/OPS galleys PDF + HTML, URL Path "sea-study"; OMP formats "PDF", "PDF Two" (two whole-book PDFs),
//         "HTML", "Notes" (a Markdown file), "Chapter PDF" (given to chapter 1 on screen).
//         On screen (prep): a second contributor; Coverage, Type (en, fr), Rights, Source; OJS Pages "12-20";
//         OMP the Metadata terms, URL Path, chapter dates on, two chapters with their own page; a licence URL and a
//         DOI prefix (OMP: "Chapters" ticked too); then Publish on screen (OJS into Vol. 3 No. 7).
//   plain published by the seed: one contributor, no DOI, no licence; OJS Article Number "7", no Pages, today's
//         date in the 2024 issue (citation_date's other end).
//   fr    published by the seed with French as its submission language (Rule 14's other end).
// Phases (in this order): seed · survey (the workflow pages' fields, dumped) · prep (an unsaved leave on Metadata, the
//   contributor, Metadata, licence, Pages / Catalog Entry, OMP chapter dates and chapters, DOI prefix, publish) · read ·
//   lang · journal (OJS ISSN, abbreviation, the issue's volume and number hidden) · isbn (OMP) · chapdate (OMP chapter
//   dates off and on) · plugins (Rule 15, Settings 3–4) · version (the published version edited; Rule 13) · pk (publicknowledge's
//   Plugins grid, read only) · urn (OJS, OMP: a URN context) · chapbox (OMP Setting 15 both ends).
//   Each mutating step is guarded in the state file, so a phase re-run re-reads without re-doing.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'survey', 'prep', 'read', 'lang', 'journal', 'isbn', 'chapdate', 'plugins', 'version', 'pk', 'urn', 'chapbox'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Every tag in the page source's head the two plugins (and the version rules) could write, in source order. */
function headTags(html) {
    const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
    const out = [];
    for (const m of head.matchAll(/<(meta|link)\b[^>]*>/gi)) {
        const raw = m[0];
        const attr = (n) => { const x = raw.match(new RegExp(`\\s${n}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')); return x ? (x[2] ?? x[3]) : null; };
        const name = attr('name'), rel = attr('rel');
        if (m[1].toLowerCase() === 'meta' && name && /^(citation_|gs_|DC\.|robots$|description$)/i.test(name)) out.push({tag: 'meta', name, content: attr('content'), lang: attr('xml:lang'), scheme: attr('scheme'), raw});
        if (m[1].toLowerCase() === 'link' && rel && /^(schema\.DC|canonical)$/i.test(rel)) out.push({tag: 'link', rel, href: attr('href'), raw});
    }
    return out;
}
const pick = (tags, re) => tags.filter((x) => re.test(x.name || x.rel || '')).map((x) => (x.tag === 'meta' ? `${x.name}${x.lang ? `[${x.lang}]` : ''}${x.scheme ? `{${x.scheme}}` : ''}=${x.content}` : `${x.rel}->${x.href}`));

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs', isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const log = (...a) => console.log(`[k3 ${app.name} +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
    const sf = path.join(outDir(), `k3-state-${app.name}.json`);
    let S = (!process.env.RESEED && fs.existsSync(sf)) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k3-facts', {[k]: v}, {merge: true}); log(k, JSON.stringify(v).slice(0, 2500)); };
    const J = {ojs: 'journal', omp: 'press', ops: 'server'}[app.name];
    const strip = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/index\.php\//, '');
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    const TABLE = isOJS ? 'journals' : isOMP ? 'presses' : 'servers';
    const IDCOL = isOJS ? 'journal_id' : isOMP ? 'press_id' : 'server_id';
    function db(sql) {
        const cfg = fs.readFileSync(app.configFile, 'utf8');
        const sec = cfg.split(/^\[database\]/m)[1] || '';
        const get = (k) => ((sec.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
        try {
            return execFileSync('psql', ['-h', get('host') || '127.0.0.1', '-U', get('username'), get('name'), '-At', '-F', '|', '-c', sql],
                {env: {...process.env, PGPASSWORD: get('password')}, encoding: 'utf8', timeout: 20_000}).trim().split('\n').filter(Boolean);
        } catch (e) { return [`ERROR ${flat(e.message, 300)}`]; }
    }

    await app.api.bootstrapProbe(app.contextPath);

    // ================================================================== seed (API; the on-screen parts are in prep)
    if (on('seed') && !S.seeded) {
        const t = tag('u20k3');
        S = {t, subs: {}, pubs: {}, errs: {}};
        const p = `${t}m`;
        const ctx = await app.api.createContext({
            tag: p,
            context: {name: `U20 K3 Sea ${J} ${t}`, acronym: 'K3S', primaryLocale: 'en', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA'], contactName: 'Paula Principal', contactEmail: `principal${p}@mail.test`},
            users: [
                {username: `${p}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
                {username: `${p}rd`, roles: ['reader'], givenName: 'Rita', familyName: 'Reader'},
                {username: `${p}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author', affiliation: 'Harbour University'},
            ],
            metadata: {keywords: 'enable', subjects: 'enable', disciplines: 'enable', agencies: 'enable', coverage: 'enable', rights: 'enable', source: 'enable', type: 'enable', citations: 'enable'},
            ...(isOJS ? {sections: [{abbrev: 'ART', title: {en: 'Sea Articles', fr_CA: 'Articles de mer'}}], issues: [{volume: 3, number: 7, year: 2024, published: true}]} : {}),
            ...(isOPS ? {sections: [{abbrev: 'PRE', title: {en: 'Sea Preprints', fr_CA: 'Prépublications de mer'}}]} : {}),
        });
        S.M = {path: ctx.path, id: ctx.contextId, issues: ctx.issues || null, mg: `${p}mg`, rd: `${p}rd`, au: `${p}au`};
        save();
        fact('seed-context', S.M);
    }
    if (!S.M) { log('no state: run the seed phase'); return; }
    const M = S.M;

    const {page, close} = await launch(app);
    const visitorBrowser = await launch(app);
    const vpage = visitorBrowser.page;
    const bad = [], pageErrors = [], dialogs = [];
    for (const [w, pg] of [['m', page], ['v', vpage]]) {
        pg.on('response', (r) => { if (r.status() >= 400) bad.push({at: Date.now(), w, status: r.status(), m: r.request().method(), url: strip(r.url()).slice(0, 180)}); });
        pg.on('pageerror', (e) => pageErrors.push({at: Date.now(), w, text: flat(e.message, 200), url: strip(pg.url())}));
        pg.on('dialog', async (d) => { dialogs.push({at: Date.now(), w, type: d.type(), message: d.message().slice(0, 200)}); await d.accept().catch(() => {}); });
    }
    const since = (arr, t0) => arr.filter((e) => e.at >= t0).map(({at, ...x}) => x);
    let snapN = S.snapN || 0;
    async function snap(name, extra, {png = false, pg = page} = {}) {
        let s;
        try { s = await screen(pg); } catch (e) { s = {url: pg.url(), screenError: flat(e.message, 200)}; }
        if (extra) s.facts = extra;
        const n = `k3-${String(++snapN).padStart(3, '0')}-${name}`;
        S.snapN = snapN;
        record(n, s);
        if (png) await shot(pg, n).catch(() => {});
        return n;
    }
    async function sect(name, fn) {
        if (!on(name)) return;
        const t0 = Date.now();
        log(`== ${name}`);
        try { await fn(); } catch (e) {
            fact(`${name}.FAILED`, flat(e.stack || e, 1500));
            await snap(`zz-failed-${name}`, null, {png: true}).catch(() => {});
        }
        const b = since(bad, t0).filter((r) => r.status >= 500), pe = since(pageErrors, t0);
        if (b.length || pe.length) fact(`${name}.crashes`, {server: b, script: pe});
        const d = since(dialogs, t0);
        if (d.length) fact(`${name}.dialogs`, d);
        save();
    }
    let who = 'visitor';
    const as = async (u) => { await signIn(page, u, {contextPath: M.path}); await idle(page).catch(() => {}); who = u; };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    const vis = '[role="dialog"]:visible';
    const wf = () => page.locator(vis).first();
    const topWin = () => page.locator(vis).last();
    const wfUrl = (sid, key) => cu(M.path, `/dashboard/editorial?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
    const go = async (url) => { const r = await page.goto(url).catch((e) => ({err: flat(e.message, 200)})); await idle(page).catch(() => {}); return r; };

    // ------------------------------------------------------------------ the page source, read the way "View page source" shows it
    /** Open an address as the current user; the navigation's own HTML is the page source. */
    async function source(name, url, {png = false, pg = vpage, whoIs} = {}) {
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === pg.mainFrame()) chain.push({url: strip(r.url()), status: r.status()}); } catch { /* */ } };
        pg.on('response', onResp);
        let resp = null, err = null;
        try { resp = await pg.goto(url); } catch (e) { err = flat(e.message, 200); }
        await idle(pg).catch(() => {});
        pg.off('response', onResp);
        const html = resp ? await resp.text().catch(() => '') : '';
        const tags = headTags(html);
        const out = {who: whoIs || (pg === vpage ? 'visitor' : who), asked: strip(url), landed: strip(pg.url()), status: resp ? resp.status() : null, err, chain,
            contentType: resp ? resp.headers()['content-type'] : null, htmlLang: (html.match(/<html[^>]*\slang="([^"]+)"/) || [])[1] || null,
            h1: flat(await pg.locator('h1').first().innerText({timeout: 1500}).catch(() => ''), 160),
            tags, gs: pick(tags, /^(citation_|gs_)/), dc: pick(tags, /^DC\./), other: pick(tags, /^(robots|description|schema\.DC|canonical)$/i)};
        out.links = await pg.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({text: a.innerText.replace(/\s+/g, ' ').trim().slice(0, 60), href: a.getAttribute('href'), cls: a.className})).filter((a) => /\/(article|preprint)\/(view|download)\/|\/catalog\/(view|download|book)\/|\/chapter\//.test(a.href))).catch(() => []);
        out.snap = await snap(name, {source: {...out, tags: undefined}}, {png, pg});
        return out;
    }
    const brief = (o) => ({who: o.who, asked: o.asked, landed: o.landed, status: o.status, h1: o.h1, gs: o.gs, dc: o.dc, other: o.other, snap: o.snap});

    // ------------------------------------------------------------------ workflow helpers (U18 K1, U20 K2)
    async function openPub(sid, pub, entry) {
        await go(wfUrl(sid, `publication_${pub}_titleAbstract`));
        await wf().waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await sleep(800);
        if (entry && entry !== 'Title & Abstract') {
            const l = wf().getByRole('link', {name: entry, exact: true}).last();
            await l.waitFor({state: 'visible', timeout: T});
            await l.click();
            await idle(page); await sleep(1000);
        }
    }
    async function menuLinks() { return (await wf().locator('nav a, [role="navigation"] a, aside a').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)).filter(Boolean); }
    /** Every field of the visible form(s): label, id, name, type, value; and the buttons. */
    async function dumpForms(scope) {
        return scope.evaluate((root) => {
            const lab = (el) => { const f = el.closest('.pkpFormField, .section, fieldset, li, div'); const l = el.id && root.querySelector(`label[for="${CSS.escape(el.id)}"]`); return (l && l.innerText) || (f && f.querySelector('label, legend') && f.querySelector('label, legend').innerText) || null; };
            return {
                fields: [...root.querySelectorAll('input, textarea, select')].filter((e) => e.type !== 'hidden').map((e) => ({id: e.id || null, name: e.name || null, type: e.type, value: (e.type === 'checkbox' || e.type === 'radio') ? e.checked : (e.value || '').slice(0, 80), visible: !!e.getClientRects().length, label: (lab(e) || '').replace(/\s+/g, ' ').trim().slice(0, 90)})),
                buttons: [...root.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60),
                iframes: [...root.querySelectorAll('iframe')].map((f) => f.id),
            };
        }).catch((e) => ({err: flat(e.message, 200)}));
    }
    const controls = () => page.locator('[data-cy="workflow-controls-right"]');
    async function statusLine() { return flat(await page.locator('[data-cy="workflow-controls-left"]').innerText().catch(() => ''), 150); }
    async function pressPubSave(name, scope) {
        const button = (scope || wf()).getByRole('button', {name: 'Save', exact: true}).last();
        const r = page.waitForResponse((x) => /\/api\/v1\//.test(x.url()) && ['POST', 'PUT'].includes(x.request().method()), {timeout: T}).catch(() => null);
        await button.click();
        const resp = await r;
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
        await sleep(500);
        let body = null; if (resp && resp.status() >= 400) body = flat(await resp.text().catch(() => ''), 600);
        const out = {status: resp ? resp.status() : null, url: resp ? strip(resp.url()) : null, body, errors: await page.locator('.pkpFieldError').allInnerTexts().catch(() => [])};
        if (name) out.snap = await snap(name, {save: out});
        return out;
    }

    async function typeRich(id, text, {replace = true, pg = page} = {}) {
        await pg.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
        await pg.frameLocator(`[id="${id}_ifr"]`).locator('body').click();
        if (replace) { await pg.keyboard.press('ControlOrMeta+A'); await pg.keyboard.press('Delete'); } else await pg.keyboard.press('ControlOrMeta+End');
        await pg.keyboard.type(text);
        await sleep(300);
        return pg.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null);
    }
    /** A Vue form's French twins are shown by the form's own language toggle. */
    async function showFrench(scope) {
        const b = scope.getByRole('button', {name: /^French/}).first();
        if (await b.count()) { const pressed = await b.getAttribute('aria-pressed').catch(() => null); if (pressed !== 'true') { await b.click().catch(() => {}); await sleep(500); } }
    }
    /** A term chip typed into a Vue controlled-vocabulary box by its control id. */
    async function typeChips(id, terms) {
        const input = page.locator(`[id="${id}"]`);
        if (!(await input.count())) return {field: false, id};
        for (const t of terms) { await input.click(); await input.fill(t); await sleep(500); await page.keyboard.press('Enter'); await sleep(500); }
        return {field: true, id};
    }
    async function openSettingsTab(slug, tabName) {
        await go(cu(M.path, `/management/settings/${slug}`));
        await page.getByRole('tab', {name: tabName, exact: true}).first().click();
        await idle(page); await sleep(900);
        return page.locator('[role="tabpanel"]:visible').first();
    }
    async function saveVue(field, name) {
        const form = page.locator('form').filter({has: field}).first();
        const r = page.waitForResponse((x) => /\/api\/v1\//.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await r;
        const seen = new Set(); const start = Date.now();
        while (Date.now() - start < 6_000) { for (const x of await page.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => [])) if (x.trim()) seen.add(x.trim()); if (seen.has('Saved')) break; await sleep(250); }
        let body = null; if (resp && resp.status() >= 400) body = flat(await resp.text().catch(() => ''), 600);
        const out = {status: resp ? resp.status() : null, statuses: [...seen], body, fieldErrors: await form.locator('.pkpFieldError').allInnerTexts().catch(() => []), pageErrors: await page.locator('.pkpFormPage__errors, [role="alert"]').allInnerTexts().catch(() => [])};
        out.snap = await snap(name, {save: out});
        return out;
    }
    async function fillVersionIfPresent(scope) {
        for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
            const el = scope.locator(sel);
            if (await el.isVisible().catch(() => false)) { if (!(await el.inputValue().catch(() => ''))) await el.selectOption(val).catch(() => {}); }
        }
    }
    /** Publish (OJS: into the issue named by issueRe through "Assign To Current/Back Issue"; OPS "Post") on the open workflow. */
    async function publishOnScreen(name, issueRe) {
        const out = {};
        const button = controls().getByRole('button', {name: /^(Schedule For Publication|Publish|Post)$/}).first();
        await button.waitFor({state: 'visible', timeout: T});
        out.button = flat(await button.innerText().catch(() => ''), 60);
        await sleep(800);
        await button.click();
        const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
        const confirm = page.getByRole('dialog').filter({hasText: /Are you sure you want to|make this catalog entry public/}).last();
        const which = () => Promise.race([
            panel.locator('select[name="versionStage"], input[name="assignment"]').first().waitFor({state: 'visible', timeout: 15_000}).then(() => 'panel'),
            confirm.waitFor({state: 'visible', timeout: 15_000}).then(() => 'confirm'),
        ]).catch(() => null);
        let opened = await which();
        if (!opened) { out.secondPress = true; await button.click({timeout: 5_000}).catch(() => {}); opened = await which(); }
        out.opened = opened;
        await idle(page); await sleep(600);
        if (opened === 'panel') {
            await fillVersionIfPresent(panel);
            const back = panel.getByRole('radio', {name: 'Assign To Current/Back Issue'});
            if (issueRe && await back.isVisible().catch(() => false)) {
                await back.check();
                const sel = panel.locator('select[name="issueId"]');
                await sel.waitFor({state: 'visible', timeout: T});
                const opt = sel.locator('option').filter({hasText: issueRe});
                await opt.first().waitFor({state: 'attached', timeout: T});
                await sel.selectOption((await opt.first().getAttribute('value')) || '');
            }
            await sleep(400);
            out.panel = flat(await panel.innerText().catch(() => ''), 900);
            await snap(`${name}-panel`);
            await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
            await confirm.waitFor({state: 'visible', timeout: T});
        }
        await idle(page); await sleep(600);
        await fillVersionIfPresent(confirm);
        out.confirm = flat(await confirm.innerText().catch(() => ''), 600);
        const w = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await confirm.getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/}).last().click();
        const r = await w;
        out.status = r ? r.status() : null;
        if (r && r.status() >= 400) out.body = flat(await r.text().catch(() => ''), 500);
        await controls().getByRole('button', {name: /^(Unpublish|Unpost|Unschedule)$/}).first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        out.statusLine = await statusLine();
        out.controls = await controls().getByRole('button').allInnerTexts().catch(() => []);
        out.snap = await snap(name, {publish: out}, {png: true});
        return out;
    }
    async function createNewVersion(name) {
        const link = page.getByRole('link', {name: 'Create New Version', exact: true}).or(page.getByRole('button', {name: 'Create New Version', exact: true})).first();
        await link.waitFor({state: 'visible', timeout: T}).catch(() => {});
        if (!(await link.isVisible().catch(() => false))) return {offered: false};
        await sleep(1200);
        await link.click();
        const w = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
        await w.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
        await idle(page); await sleep(800);
        await fillVersionIfPresent(w);
        await snap(`${name}-window`);
        const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
        await w.getByRole('button', {name: 'Confirm', exact: true}).click();
        const resp = await r;
        let newPub = null; if (resp) { try { newPub = (await resp.json()).id; } catch { /* none */ } }
        await w.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
        return {offered: true, status: resp && resp.status(), newPub};
    }
    // ------------------------------------------------------------------ plugin rows (Settings › Website › Plugins)
    const pRow = (name) => page.locator('tr.gridRow').filter({hasText: name}).first();
    async function openPlugins() {
        await go(cu(M.path, '/management/settings/website'));
        await page.locator('#plugins-button').click().catch(() => page.getByRole('tab', {name: 'Plugins', exact: true}).first().click());
        await idle(page); await sleep(800);
        await page.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
    }
    async function readRow(name) {
        const row = pRow(name);
        if (!(await row.count())) return {present: false};
        return row.evaluate((el) => {
            const box = el.querySelector('input[type=checkbox]');
            return {present: true, text: el.innerText.replace(/\s+/g, ' ').trim(), enabled: box ? box.checked : null};
        }).catch((e) => ({error: String(e.message)}));
    }
    async function setRow(name, want) {
        const box = pRow(name).getByRole('checkbox').first();
        const was = await box.isChecked();
        if (was === want) return {changed: false, checked: was};
        const t0 = Date.now();
        const w = page.waitForResponse((r) => /plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
        await sleep(900);
        let dialogText = null;
        const dlg = page.locator('[role="dialog"]:visible');
        if (await dlg.count()) {
            dialogText = flat(await dlg.last().innerText(), 400);
            const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const resp = await w;
        await sleep(900); await idle(page);
        const notices = await page.locator('.pkpNotification, .pkp_notification, .ui-pnotify-text').allInnerTexts().then((a) => a.map((x) => flat(x, 150))).catch(() => []);
        return {changed: true, status: resp ? resp.status() : null, dialogText, notices, checked: await pRow(name).getByRole('checkbox').first().isChecked().catch(() => null), crashes: since(bad, t0).filter((x) => x.status >= 500)};
    }
    const authorsOf = (pub) => db(`select a.author_id, a.seq, (select string_agg(setting_value, ' ' order by setting_name desc) from author_settings where author_id=a.author_id and setting_name in ('givenName','familyName') and locale='en') from authors a where a.publication_id=${pub} order by a.seq`);
    const itemPath = (sid) => (isOJS ? `/article/view/${sid}` : isOMP ? `/catalog/book/${sid}` : `/preprint/view/${sid}`);
    const PATHNAME = isOJS ? 'article' : isOMP ? 'catalog/book' : 'preprint';

    try {
        // ============================================================== seed: the items (the context is made above)
        await sect('seed', async () => {
            if (S.itemsSeeded) return;
            const t = S.t;
            // OMP: the series, made on screen (the context scenario has no series key), with an online ISSN
            if (isOMP && !S.series) {
                await as(M.mg);
                await go(cu(M.path, '/management/settings/context'));
                await page.getByRole('tab', {name: 'Series', exact: true}).first().click(); await idle(page);
                const grid = page.locator('#seriesGridContainer');
                await grid.waitFor({timeout: T});
                await grid.getByRole('link', {name: /Add Series/}).first().click();
                const form = page.locator('form#seriesForm');
                await form.locator('input[name^="title"]').first().waitFor({timeout: T});
                await idle(page); await sleep(800);
                const fields = await dumpForms(form);
                await form.locator('input[name="title[en]"]').fill('K3 Series');
                await form.locator('input[name="path"]').fill('k3series');
                const issn = form.locator('input[name="onlineIssn"]');
                if (await issn.count()) await issn.fill('2049-3630');
                await snap('seed-omp-series-form', {fields});
                const r = page.waitForResponse((x) => x.request().method() === 'POST' && /(update|save)-?series/i.test(x.url()), {timeout: T}).catch(() => null);
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                const resp = await r;
                await sleep(1200);
                S.series = resp ? resp.status() : 'no response'; save();
                await snap('seed-omp-series-saved', {status: S.series}, {png: true});
                await visitor();
            }
            const seedSub = async (key, spec) => {
                try {
                    const r = await app.api.createSubmission({tag: `${t}${key}`, context: M.path, submitter: M.au, ...spec});
                    S.subs[key] = r.submissionId; S.pubs[key] = r.publicationId;
                    S[`${key}Resp`] = {galleys: r.galleys || null, formats: r.publicationFormats || null, status: r.status, stageId: r.stageId};
                    delete S.errs[key];
                } catch (e) { S.errs[key] = flat(e.message, 800); }
                save();
                log('sub', key, S.subs[key] || S.errs[key]);
            };
            const PDF = isOPS ? 'preprint.pdf' : 'article.pdf', HTML = isOPS ? 'preprint.html' : 'article.html';
            const terms = isOMP ? {} : {
                subtitle: {en: 'tides and shores', fr_CA: 'marées et rivages'},
                keywords: {en: ['tides', 'shore birds'], fr_CA: ['marées']},
                subjects: {en: ['oceanography'], fr_CA: ['océanographie']},
                disciplines: {en: ['marine science']},
                supportingAgencies: {en: ['Sea Fund'], fr_CA: ['Fonds de la mer']},
            };
            const rich = {
                title: {en: `Sea study ${t}`, fr_CA: `Étude de la mer ${t}`},
                abstract: {en: '<p>The <strong>sea</strong> &amp; its <em>tides</em>, "quoted".</p>', fr_CA: '<p>La <strong>mer</strong> et ses marées.</p>'},
                citationsRaw: ['Alpha, A. (2020). First reference. Sea Letters, 1(2), 3-4.', 'Beta, B. (2021). Second reference. Shore Notes.'],
                datePublished: '2024-03-05',
                ...terms,
                ...(isOJS ? {section: 'ART', urlPath: 'sea-study'} : {}),
                ...(isOPS ? {section: 'PRE', urlPath: 'sea-study'} : {}),
                ...(isOMP ? {series: 'k3series', publicationFormats: [{name: 'PDF', file: 'article.pdf'}, {name: 'PDF Two', file: 'article.pdf'}, {name: 'HTML', file: 'article.html'}, {name: 'Notes', file: 'notes.md'}, {name: 'Chapter PDF', file: 'article.pdf'}]}
                    : {galleys: [{label: 'PDF', file: PDF}, {label: 'HTML', file: HTML}]}),
            };
            if (!S.subs.rich) await seedSub('rich', rich);
            if (!S.subs.plain) {
                await seedSub('plain', {
                    title: `Plain item ${t}`, abstract: '<p>Plain abstract.</p>', published: true,
                    ...(isOJS ? {section: 'ART', issue: {volume: 3, number: 7, year: 2024}, articleNumber: '7', galleys: [{label: 'PDF', file: PDF}]} : {}),
                    ...(isOPS ? {section: 'PRE', galleys: [{label: 'PDF', file: PDF}]} : {}),
                    ...(isOMP ? {publicationFormats: [{name: 'PDF', file: 'article.pdf'}]} : {}),
                });
            }
            if (!S.subs.fr) {
                await seedSub('fr', {
                    locale: 'fr_CA', title: {fr_CA: `Article en français ${t}`, en: `French-language item ${t}`},
                    abstract: {fr_CA: '<p>Résumé en <em>français</em>.</p>', en: '<p>English abstract of a French item.</p>'},
                    published: true, datePublished: '2023-05-06',
                    ...(isOMP ? {} : {keywords: {fr_CA: ['mot français'], en: ['english word']}, subjects: {fr_CA: ['sujet'], en: ['subject']}}),
                    ...(isOJS ? {section: 'ART', issue: {volume: 3, number: 7, year: 2024}} : {}),
                    ...(isOPS ? {section: 'PRE'} : {}),
                });
            }
            S.itemsSeeded = !Object.keys(S.errs).length;
            fact('seed-items', {subs: S.subs, pubs: S.pubs, errs: S.errs, richResp: S.richResp, series: S.series});
            fact('seed-db', db(`select s.submission_id, s.status, s.locale, p.publication_id, p.status, p.date_published, p.url_path from submissions s join publications p on p.submission_id=s.submission_id where s.context_id=${M.id} order by 1,4`));
        });

        // ============================================================== survey: the workflow pages the prep drives, as fields
        await sect('survey', async () => {
            if (S.surveyed && !process.env.RESURVEY) return;
            const out = {};
            await as(M.mg);
            await openPub(S.subs.rich, S.pubs.rich);
            out.menu = await menuLinks();
            out.controls = await controls().getByRole('button').allInnerTexts().catch(() => []);
            await snap('survey-00-workflow', {menu: out.menu, controls: out.controls}, {png: true});
            const pages = ['Title & Abstract', 'Contributors', 'Metadata', 'References', 'Identifiers', 'License', 'Permissions & Disclosure', 'Publication Settings', 'Issue', 'Catalog Entry', 'Chapters', 'Publication Formats', 'Galleys', 'Preprint entry', 'Preprint Entry'];
            out.pages = {};
            for (const p of pages) {
                if (!out.menu.some((m) => m === p)) continue;
                try {
                    await openPub(S.subs.rich, S.pubs.rich, p);
                    out.pages[p] = await dumpForms(wf());
                    await snap(`survey-page-${p.replace(/\W+/g, '-')}`, {fields: out.pages[p]});
                } catch (e) { out.pages[p] = {err: flat(e.message, 200)}; }
            }
            if (isOMP) {
                await go(wfUrl(S.subs.rich, 'marketing_publicationDates'));
                await sleep(1500);
                out.pages.publicationDates = await dumpForms(wf());
                await snap('survey-omp-publication-dates', {fields: out.pages.publicationDates});
            }
            // the Add Contributor window
            if (out.menu.includes('Contributors')) {
                await openPub(S.subs.rich, S.pubs.rich, 'Contributors');
                const add = wf().getByRole('button', {name: 'Add Contributor', exact: true});
                if (await add.count()) {
                    await add.click();
                    const d = page.getByRole('dialog', {name: 'Add Contributor'});
                    await d.waitFor({state: 'visible', timeout: T}).catch(() => {});
                    await sleep(1200);
                    out.contributorWindow = await dumpForms(d);
                    await snap('survey-add-contributor', {fields: out.contributorWindow}, {png: true});
                }
            }
            // DOIs and License tabs
            for (const [slug, tab] of [['distribution', 'DOIs'], ['distribution', 'License'], ['context', 'Masthead']]) {
                await go(cu(M.path, `/management/settings/${slug}`));
                await page.getByRole('tab', {name: tab, exact: true}).first().click().catch(() => {});
                await idle(page); await sleep(900);
                out[`tab-${tab}`] = await dumpForms(page.locator('[role="tabpanel"]:visible').first());
                await snap(`survey-tab-${tab}`, {fields: out[`tab-${tab}`]});
            }
            fact('survey', out);
            S.surveyed = true;
        });
        // ============================================================== prep: the rich item decorated and published on screen
        await sect('prep', async () => {
            const out = S.prep || {};
            const done = (k, v) => { out[k] = v; S.prep = out; save(); };
            const sid = S.subs.rich, pub = S.pubs.rich;
            await as(M.mg);
            // a tabbed screen left with an unsaved change: Metadata "Coverage" typed, then the Contributors entry, then back
            if (!out.leave) {
                await openPub(sid, pub, 'Metadata');
                const cov = wf().locator('[id="metadata-coverage-control-en"]');
                await cov.waitFor({timeout: T});
                await cov.fill('UNSAVED coverage');
                const t0 = Date.now();
                await wf().getByRole('link', {name: 'Contributors', exact: true}).last().click();
                await idle(page); await sleep(1200);
                const leftTo = await snap('prep-00a-left-metadata-unsaved', {dialogs: since(dialogs, t0)});
                await wf().getByRole('link', {name: 'Metadata', exact: true}).last().click();
                await idle(page); await sleep(1200);
                const back = await cov.inputValue().catch(() => null);
                const s2 = await snap('prep-00b-back-on-metadata');
                await page.reload(); await idle(page); await sleep(1500);
                await openPub(sid, pub, 'Metadata');
                const afterReload = await wf().locator('[id="metadata-coverage-control-en"]').inputValue().catch(() => null);
                done('leave', {dialogs: since(dialogs, t0), valueWhenBack: back, valueAfterReload: afterReload, snaps: [leftTo, s2]});
            }
            // a second contributor, with a typed affiliation
            if (!out.contrib) {
                const o = {};
                await openPub(sid, pub, 'Contributors');
                o.before = await wf().locator('.listPanel__item, li').filter({hasText: /@|Author/}).allInnerTexts().then((a) => a.map((x) => flat(x, 150))).catch(() => []);
                await wf().getByRole('button', {name: 'Add Contributor', exact: true}).click();
                const d = page.getByRole('dialog', {name: 'Add Contributor'});
                await d.waitFor({state: 'visible', timeout: T});
                await sleep(800);
                await d.locator('[id="contributor-givenName-control-en"]').fill('Bo');
                await d.locator('[id="contributor-familyName-control-en"]').fill('Second');
                await d.locator('[id="contributor-email-control"]').fill(`bo${S.t}@mail.test`);
                await d.locator('[id="contributor-country-control"]').selectOption({label: 'Canada'}).catch(() => {});
                await d.locator('input[name="contributorRoles"]').first().check().catch((e) => { o.roleErr = flat(e.message, 100); });
                // affiliation: type, pick the typed text, "Add"
                const aff = d.locator('input[id^="headlessui-combobox-input"]').first();
                o.affiliation = [];
                for (const inst of ['Tide Institute', 'Shore College']) {
                    const a = {inst};
                    try {
                        await aff.click(); await aff.fill(inst); await sleep(2500);
                        a.options = await page.getByRole('option').allInnerTexts().then((x) => x.map((y) => flat(y, 80))).catch(() => []);
                        const opt = page.getByRole('option').filter({hasText: inst}).first();
                        if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
                        await sleep(600);
                        const rorDlg = page.getByRole('dialog').filter({hasText: /ROR API Error/}).last();
                        if (await rorDlg.isVisible().catch(() => false)) { a.rorDialog = flat(await rorDlg.innerText(), 200); await rorDlg.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {}); await sleep(500); }
                        const addB = d.getByRole('button', {name: 'Add', exact: true}).first();
                        a.addOffered = await addB.count();
                        if (a.addOffered) { await addB.click(); await sleep(700); }
                    } catch (e) { a.err = flat(e.message, 150); }
                    o.affiliation.push(a);
                }
                // any typed entry needs its French twin? leave it; the save says
                o.form = await snap('prep-01-contributor-form', {facts: o}, {png: true});
                const r = page.waitForResponse((x) => x.url().includes('/contributors') && x.request().method() === 'POST', {timeout: T}).catch(() => null);
                await d.getByRole('button', {name: 'Save', exact: true}).click();
                const resp = await r;
                o.status = resp ? resp.status() : null;
                if (resp && resp.status() >= 400) o.body = flat(await resp.text().catch(() => ''), 500);
                await d.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
                o.stillOpen = await d.isVisible().catch(() => false);
                if (o.stillOpen) { o.errors = await d.locator('.pkpFieldError, .pkpFormErrors').allInnerTexts().catch(() => []); await snap('prep-01b-contributor-refused', {facts: o}, {png: true}); await d.getByRole('button', {name: /Cancel|Close/}).first().click().catch(() => {}); }
                await sleep(800);
                o.authors = authorsOf(pub);
                o.affRows = db(`select aa.author_id, aas.locale, aas.setting_value from author_affiliations aa join author_affiliation_settings aas on aas.author_affiliation_id=aa.author_affiliation_id where aa.author_id in (select author_id from authors where publication_id=${pub}) order by 1`);
                o.snap = await snap('prep-02-contributors-after', {facts: o}, {png: true});
                done('contrib', o);
            }
            // Metadata: Coverage, Type (en, fr), Rights, Source; OMP also the term lists
            if (!out.meta) {
                const o = {};
                await openPub(sid, pub, 'Metadata');
                const form = wf().locator('form').filter({has: page.locator('[id="metadata-coverage-control-en"]')}).first();
                await showFrench(form);
                const fill = async (id, v) => { const f = page.locator(`[id="${id}"]`); if (await f.count()) { await f.fill(v); return true; } return false; };
                if (isOMP) {
                    o.kw = await typeChips('metadata-keywords-control-en', ['tides', 'shore birds']);
                    o.kwFr = await typeChips('metadata-keywords-control-fr_CA', ['marées']);
                    o.subj = await typeChips('metadata-subjects-control-en', ['oceanography']);
                    o.subjFr = await typeChips('metadata-subjects-control-fr_CA', ['océanographie']);
                    o.disc = await typeChips('metadata-disciplines-control-en', ['marine science']);
                    o.ag = await typeChips('metadata-supportingAgencies-control-en', ['Sea Fund']);
                    o.agFr = await typeChips('metadata-supportingAgencies-control-fr_CA', ['Fonds de la mer']);
                }
                o.filled = {
                    coverage: await fill('metadata-coverage-control-en', 'North Atlantic coast'),
                    coverageFr: await fill('metadata-coverage-control-fr_CA', 'Côte nord-atlantique'),
                    type: await fill('metadata-type-control-en', 'Field study'),
                    typeFr: await fill('metadata-type-control-fr_CA', 'Étude de terrain'),
                    rights: await fill('metadata-rights-control-en', 'K3 rights statement'),
                    source: await fill('metadata-source-control-en', 'K3 source statement'),
                };
                await snap('prep-03-metadata-filled', {facts: o}, {png: true});
                o.save = await pressPubSave('prep-04-metadata-saved', form);
                await page.reload(); await idle(page); await sleep(1500);
                await openPub(sid, pub, 'Metadata');
                o.afterReload = await snap('prep-05-metadata-after-reload');
                o.db = db(`select setting_name, locale, left(setting_value, 120) from publication_settings where publication_id=${pub} and setting_name in ('coverage','type','rights','source') order by 1,2`);
                o.terms = db(`select cv.symbolic, cves.locale, cves.setting_value from controlled_vocabs cv join controlled_vocab_entries cve on cve.controlled_vocab_id=cv.controlled_vocab_id join controlled_vocab_entry_settings cves on cves.controlled_vocab_entry_id=cve.controlled_vocab_entry_id where cv.assoc_id=${pub} order by 1,2,cve.seq`);
                done('meta', o);
            }
            // Permissions & Disclosure: what an unpublished version offers; the licence is set on Distribution › License
            if (!out.license) {
                const o = {};
                await openPub(sid, pub, 'Permissions & Disclosure');
                const h = page.locator('[id="publicationLicense-copyrightHolder-control-en"]');
                await h.waitFor({timeout: T});
                o.pubPage = await page.evaluate(() => ['publicationLicense-copyrightHolder-control-en', 'publicationLicense-copyrightYear-control', 'publicationLicense-licenseUrl-control'].map((i) => { const e = document.getElementById(i); return e ? {id: i, value: e.value, disabled: e.disabled} : {id: i, absent: true}; }));
                o.pubPageText = flat(await wf().locator('form').filter({has: h}).first().innerText().catch(() => ''), 600);
                o.pubSnap = await snap('prep-06a-permissions-page-unpublished', {facts: o}, {png: true});
                const panel = await openSettingsTab('distribution', 'License');
                o.holderTypes = await panel.locator('input[name="copyrightHolderType"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
                o.licenses = await panel.locator('input[name="licenseUrl"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked})));
                await panel.locator('input[name="copyrightHolderType"][value="context"]').check({force: true}).catch((e) => { o.holderErr = flat(e.message, 100); });
                await panel.locator('input[name="licenseUrl"][value*="by/4.0"]').first().check({force: true}).catch((e) => { o.licErr = flat(e.message, 100); });
                o.save = await saveVue(page.locator('input[name="licenseUrl"]').first(), 'prep-06b-distribution-license-saved');
                o.ctxRows = db(`select setting_name, locale, setting_value from ${{ojs: 'journal_settings', omp: 'press_settings', ops: 'server_settings'}[app.name]} where ${IDCOL}=${M.id} and setting_name in ('copyrightHolderType','licenseUrl','copyrightYearBasis','copyrightHolderOther') order by 1`);
                done('license', o);
            }
            // OJS: Pages; OMP: URL Path, series check
            if (isOJS && !out.pages) {
                await openPub(sid, pub, 'Publication Settings');
                const pg = page.locator('[id="issueEntry-pages-control"]');
                await pg.waitFor({timeout: T});
                await pg.fill('12-20');
                done('pages', await pressPubSave('prep-07-pages-saved', wf().locator('form').filter({has: pg}).first()));
            }
            if (isOMP && !out.catalog) {
                await openPub(sid, pub, 'Catalog Entry');
                const up = page.locator('[id="catalogEntry-urlPath-control"]');
                await up.waitFor({timeout: T});
                await up.fill('sea-study');
                const o = {series: await page.locator('[id="catalogEntry-seriesId-control"]').evaluate((s) => s.options[s.selectedIndex] && s.options[s.selectedIndex].text).catch(() => null)};
                o.save = await pressPubSave('prep-07-catalog-entry-saved', wf().locator('form').filter({has: up}).first());
                done('catalog', o);
            }
            // OMP: chapter dates on, then two chapters with their own page
            if (isOMP && !out.chapDates) {
                await go(wfUrl(sid, 'marketing_publicationDates'));
                await sleep(1500);
                const r = wf().getByRole('radio', {name: 'Each chapter may have its own publication date.'});
                await r.waitFor({timeout: T});
                await r.check();
                done('chapDates', await pressPubSave('prep-08-chapter-dates-on', wf().locator('form').filter({has: page.locator('input[name="enableChapterPublicationDates"]')}).first()));
            }
            if (isOMP && !out.chapters) {
                const o = [];
                const authors = authorsOf(pub).map((l) => l.split('|'));
                const second = (authors.find((a) => /Second/.test(a[2])) || [])[0], first = (authors.find((a) => /Author/.test(a[2])) || [])[0];
                const chapterFileId = S.richResp.formats.find((f) => f.name === 'Chapter PDF').submissionFileId;
                for (const ch of [
                    {title: 'Chapter One Tides', abstract: 'Chapter one abstract with bold words.', pages: '5-9', date: '2023-11-02', author: second, file: chapterFileId},
                    {title: 'Chapter Two Shores', abstract: '', pages: '', date: '', author: first, file: null},
                ]) {
                    const c = {title: ch.title};
                    await openPub(sid, pub, 'Chapters');
                    await wf().getByRole('link', {name: 'Add Chapter'}).first().click();
                    const f = page.locator('form#editChapterForm');
                    await f.locator('input[name="title[en]"]').waitFor({timeout: T});
                    await idle(page); await sleep(900);
                    c.fields = await dumpForms(f);
                    await f.locator('input[name="title[en]"]').fill(ch.title);
                    if (ch.abstract) {
                        const ifr = await f.locator('iframe[id^="abstract-en"]').first().getAttribute('id').catch(() => null);
                        if (ifr) c.abstract = await typeRich(ifr.replace(/_ifr$/, ''), ch.abstract);
                    }
                    if (ch.pages) await f.locator('input[name="pages"]').fill(ch.pages);
                    if (ch.date) {
                        const dp = f.locator('input[id^="datePublished"]:visible').first();
                        c.dateBox = await dp.count();
                        if (c.dateBox) { await dp.click(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Delete'); await page.keyboard.type(ch.date); await page.keyboard.press('Tab'); await sleep(300); c.dateValue = await dp.inputValue(); c.datePosted = await f.locator('input[name="datePublished"]').inputValue().catch(() => null); }
                    }
                    await f.locator('input[name="isPageEnabled"]').check();
                    c.pageLabel = await f.locator('input[name="isPageEnabled"]').evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
                    for (const b of await f.locator('input[name="authors[]"]').all()) { const v = await b.getAttribute('value'); if (v === String(ch.author)) await b.check(); else await b.uncheck(); }
                    if (ch.file) await f.locator(`input[name="files[]"][value="${ch.file}"]`).check().catch((e) => { c.fileErr = flat(e.message, 100); });
                    c.snap = await snap(`prep-09-chapter-${o.length + 1}-form`, {facts: c}, {png: true});
                    const r = page.waitForResponse((x) => x.request().method() === 'POST' && /update-chapter|updateChapter/i.test(x.url()), {timeout: T}).catch(() => null);
                    await f.getByRole('button', {name: 'Save', exact: true}).click();
                    const resp = await r;
                    c.status = resp ? resp.status() : null;
                    await idle(page); await sleep(1500);
                    o.push(c);
                }
                await snap('prep-10-chapters-page', null, {png: true});
                done('chapters', {o, rows: db(`select c.chapter_id, c.seq, (select string_agg(setting_name || ':' || coalesce(locale, '') || '=' || left(setting_value, 50), '; ') from submission_chapter_settings where chapter_id=c.chapter_id) from submission_chapters c where c.publication_id=${pub} order by c.seq`),
                    authors: db(`select chapter_id, author_id from submission_chapter_authors where chapter_id in (select chapter_id from submission_chapters where publication_id=${pub})`),
                    files: db(`select submission_file_id, setting_value from submission_file_settings where setting_name='chapterId' and submission_file_id in (select submission_file_id from submission_files where submission_id=${sid})`)});
            }
            // Settings: a DOI prefix (and OMP "Chapters"), before the publish
            if (!out.doi) {
                const o = {};
                const panel = await openSettingsTab('distribution', 'DOIs');
                if (isOMP) { const ch = panel.getByRole('checkbox', {name: 'Chapters', exact: true}); if (await ch.count()) { await ch.check(); o.chapters = true; } }
                const prefix = page.locator('[id="doiSetupSettings-doiPrefix-control"]');
                await prefix.fill('10.1234');
                o.save = await saveVue(prefix, 'prep-11-doi-prefix-saved');
                done('doi', o);
            }
            // Publish on screen
            if (!out.publish) {
                await openPub(sid, pub);
                const o = await publishOnScreen('prep-12-published', isOJS ? /Vol\. 3 No\. 7/ : null);
                o.db = db(`select p.publication_id, p.status, p.date_published, p.doi_id, (select doi from dois where doi_id=p.doi_id), p.url_path, (select setting_value from publication_settings where publication_id=p.publication_id and setting_name='copyrightYear') from publications p where p.submission_id=${sid}`);
                if (isOMP) o.chapterDois = db(`select chapter_id, doi_id, (select doi from dois where doi_id=c.doi_id) from submission_chapters c where publication_id=${pub}`);
                done('publish', o);
            }
            fact('prep', out);
        });
        // ------------------------------------------------------------------ reading helpers
        const abs = (href) => (/\/index\.php\//.test(href) ? app.url(`/index.php/${strip(href)}`) : (abs(href)));
        const richPath = () => cu(M.path, isOMP ? '/catalog/book/sea-study' : `/${PATHNAME}/view/sea-study`);
        const numPath = (sid) => cu(M.path, itemPath(sid));
        /** Follow the addresses the tags name, the way a crawler (or a tester pasting them) would. */
        async function follow(tags, names) {
            const out = [];
            for (const t of tags.filter((x) => names.includes(x.name))) {
                try {
                    const r = await vpage.request.get(abs(t.content), {maxRedirects: 5});
                    out.push({name: t.name, url: strip(t.content), status: r.status(), type: (r.headers()['content-type'] || '').split(';')[0], disposition: r.headers()['content-disposition'] || null});
                } catch (e) { out.push({name: t.name, url: strip(t.content), err: flat(e.message, 120)}); }
            }
            return out;
        }
        const galleyLinks = (o) => [...new Set((o.links || []).filter((l) => (isOMP ? /\/catalog\/view\//.test(l.href) : /obj_galley_link/.test(l.cls))).map((l) => l.href))];
        const chapterLinks = (o) => [...new Set((o.links || []).filter((l) => /\/chapter\/\d+/.test(l.href)).map((l) => l.href))];
        const itemOf = (o) => ({...brief(o), htmlLang: o.htmlLang});

        // ============================================================== read: the item pages' source, signed out (and signed in)
        await sect('read', async () => {
            const r = {};
            const rich = await source('read-01-rich-landing', richPath(), {png: true});
            r.rich = itemOf(rich);
            r.richByNumber = itemOf(await source('read-02-rich-by-number', numPath(S.subs.rich)));
            r.plain = itemOf(await source('read-03-plain-landing', numPath(S.subs.plain)));
            r.fr = itemOf(await source('read-04-fr-landing', numPath(S.subs.fr)));
            r.follow = await follow(rich.tags, ['citation_pdf_url', 'citation_fulltext_html_url', 'citation_abstract_html_url', 'DC.Identifier.URI', 'DC.Source.URI']);
            // galley / file pages linked from the landing page
            r.galleyPages = [];
            for (const href of galleyLinks(rich)) r.galleyPages.push(itemOf(await source(`read-05-galley-${r.galleyPages.length + 1}`, abs(href))));
            if (isOMP) {
                r.chapterPages = [];
                for (const href of chapterLinks(rich)) {
                    const c = await source(`read-06-chapter-${r.chapterPages.length + 1}`, abs(href), {png: true});
                    const ci = itemOf(c);
                    ci.fileLinks = galleyLinks(c);
                    ci.follow = await follow(c.tags, ['citation_pdf_url', 'citation_fulltext_html_url', 'DC.Identifier.URI', 'DC.Source.URI']);
                    ci.filePages = [];
                    for (const fh of ci.fileLinks) ci.filePages.push(itemOf(await source(`read-07-chapter-${r.chapterPages.length + 1}-file-${ci.filePages.length + 1}`, abs(fh))));
                    r.chapterPages.push(ci);
                }
                r.bookLinks = rich.links;
            }
            // signed in: a reader and the manager read the same page
            await as(M.rd);
            r.asReader = itemOf(await source('read-08-rich-as-reader', richPath(), {pg: page}));
            await as(M.mg);
            r.asManager = itemOf(await source('read-09-rich-as-manager', richPath(), {pg: page}));
            r.sameForReader = JSON.stringify([r.asReader.gs, r.asReader.dc]) === JSON.stringify([r.rich.gs, r.rich.dc]);
            r.sameForManager = JSON.stringify([r.asManager.gs, r.asManager.dc]) === JSON.stringify([r.rich.gs, r.rich.dc]);
            await visitor();
            r.db = {
                pubs: db(`select p.submission_id, p.publication_id, p.status, p.date_published, p.last_modified, p.url_path, (select string_agg(setting_name || '=' || coalesce(locale,'') || ':' || left(setting_value, 60), '; ') from publication_settings where publication_id=p.publication_id and setting_name in ('copyrightYear','copyrightHolder','licenseUrl','pages')), (select doi from dois where doi_id=p.doi_id) from publications p join submissions s on s.submission_id=p.submission_id where s.context_id=${M.id} order by 1,2`),
                submitted: db(`select submission_id, date_submitted, last_modified, locale from submissions where context_id=${M.id} order by 1`),
                holder: db(`select publication_id, locale, setting_value from publication_settings where setting_name='copyrightHolder' and publication_id in (select publication_id from publications p join submissions s on s.submission_id=p.submission_id where s.context_id=${M.id})`),
            };
            if (isOJS) r.db.issue = db(`select issue_id, volume, number, year, show_volume, show_number, show_year, show_title, date_published from issues where journal_id=${M.id}`);
            if (isOMP) r.db.files = db(`select sf.submission_file_id, sf.assoc_id, (select setting_value from submission_file_settings where submission_file_id=sf.submission_file_id and setting_name='chapterId'), f.mimetype, sf.file_stage from submission_files sf join files f on f.file_id=sf.file_id where sf.submission_id=${S.subs.rich} order by 1`);
            fact('read', r);
        });

        // ============================================================== lang: the interface in French (Rule 14)
        await sect('lang', async () => {
            const r = {};
            const fr = (p) => cu(M.path, `/fr_CA${p}`), en = (p) => cu(M.path, `/en${p}`);
            const rp = isOMP ? '/catalog/book/sea-study' : `/${PATHNAME}/view/sea-study`;
            r.richFr = itemOf(await source('lang-01-rich-fr-interface', fr(rp), {png: true}));
            r.richEn = itemOf(await source('lang-02-rich-en-interface', en(rp)));
            r.frItemFr = itemOf(await source('lang-03-fr-item-fr-interface', fr(itemPath(S.subs.fr))));
            r.frItemEn = itemOf(await source('lang-04-fr-item-en-interface', en(itemPath(S.subs.fr))));
            r.sameAcrossInterface = JSON.stringify([r.richFr.gs, r.richFr.dc]) === JSON.stringify([r.richEn.gs, r.richEn.dc]);
            fact('lang', r);
        });

        // ============================================================== journal (OJS): ISSN, abbreviation, the issue's volume and number hidden
        await sect('journal', async () => {
            if (!isOJS) return;
            const r = S.journal || {};
            const done = (k, v) => { r[k] = v; S.journal = r; save(); };
            const read = async (n) => { const o = await source(n, richPath()); return {gs: pick(o.tags, /^citation_(issn|journal_abbrev|journal_title|volume|issue|date)$/), dc: pick(o.tags, /^DC\.(Source|Date\.issued)/), snap: o.snap}; };
            await as(M.mg);
            for (const [k, vals] of [['print', {country: 'Canada', printIssn: '0378-5955'}], ['online', {onlineIssn: '2049-3630'}], ['abbrev', {abbreviation: 'K3 Sea J.'}]]) {
                if (r[k]) continue;
                await openSettingsTab('context', 'Masthead');
                if (vals.country) await page.locator('[id="masthead-country-control"]').selectOption({label: vals.country}).catch(() => {});
                if (vals.printIssn) await page.locator('[id="masthead-printIssn-control"]').fill(vals.printIssn);
                if (vals.onlineIssn) await page.locator('[id="masthead-onlineIssn-control"]').fill(vals.onlineIssn);
                if (vals.abbreviation) await page.locator('[id="masthead-abbreviation-control-en"]').fill(vals.abbreviation);
                const sv = await saveVue(page.locator('[id="masthead-name-control-en"]'), `journal-${k}-masthead-saved`);
                done(k, {vals, save: {status: sv.status, statuses: sv.statuses, fieldErrors: sv.fieldErrors}, tags: await read(`journal-${k}-rich`)});
            }
            // the issue's "Issue Data": Volume and Number unticked, then ticked again
            const W = () => page.locator('[role="dialog"]:visible').last();
            const openIssueData = async () => {
                await go(cu(M.path, '/manageIssues'));
                await page.getByRole('tab', {name: 'Back Issues', exact: true}).click(); await idle(page);
                const panel = page.getByRole('tabpanel', {name: 'Back Issues'});
                await panel.getByRole('link', {name: /Vol\. 3 No\. 7 \(2024\)|Vol\. 3|2024/}).first().click();
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: T}).catch(() => {});
                await idle(page); await sleep(500);
                await W().getByRole('tab', {name: 'Issue Data', exact: true}).click();
                await idle(page); await sleep(600);
                const f = W().locator('form#issueForm');
                await f.locator('input[name=volume]').waitFor({timeout: T});
                return f;
            };
            for (const [k, want] of [['hidden', false], ['shown', true]]) {
                if (r[`issue-${k}`]) continue;
                const f = await openIssueData();
                for (const nm of ['Volume', 'Number']) { const b = f.getByRole('checkbox', {name: nm, exact: true}); if ((await b.isChecked()) !== want) await b.click(); }
                const resp = page.waitForResponse((x) => x.request().method() === 'POST' && /update-issue|updateIssue/.test(x.url()), {timeout: T}).catch(() => null);
                await f.getByRole('button', {name: 'Save', exact: true}).click();
                const rr = await resp; await idle(page); await sleep(900);
                const s = await snap(`journal-issue-${k}-saved`, {status: rr ? rr.status() : null});
                if (await W().isVisible().catch(() => false)) { const c = W().getByRole('link', {name: 'Cancel', exact: true}); if (await c.count()) await c.first().click().catch(() => {}); else await W().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); }
                const issueRow = db(`select show_volume, show_number, show_year, show_title from issues where journal_id=${M.id}`);
                const page1 = await source(`journal-issue-${k}-rich`, richPath());
                done(`issue-${k}`, {save: rr ? rr.status() : null, snap: s, issueRow, gs: pick(page1.tags, /^citation_(volume|issue|date)$/), dc: pick(page1.tags, /^DC\.Source\.(Volume|Issue)$|^DC\.Date\.issued$/), shownOnPage: flat(await vpage.locator('.issue, .breadcrumbs, .obj_article_details .item.issue').allInnerTexts().then((a) => a.join(' | ')).catch(() => ''), 300)});
            }
            await visitor();
            fact('journal', r);
        });

        // ============================================================== isbn (OMP): an ISBN-13 on the format "PDF"
        await sect('isbn', async () => {
            if (!isOMP) return;
            const r = {};
            await as(M.mg);
            if (!S.isbnDone) {
                await openPub(S.subs.rich, S.prep && S.prep.publish ? S.pubs.rich : S.pubs.rich, 'Publication Formats');
                await snap('isbn-01-formats-page', null, {png: true});
                const rows = wf().locator('tr.gridRow');
                const n = await rows.count();
                let row = null;
                for (let i = 0; i < n; i++) { const tx = flat(await rows.nth(i).innerText().catch(() => ''), 80); if (/^(Settings )?PDFDigital/.test(tx)) { row = rows.nth(i); r.rowText = tx; break; } }
                if (!row) { r.noRow = true; fact('isbn', r); return; }
                await row.getByRole('link', {name: 'Settings', exact: true}).first().click().catch(() => row.locator('a.show_extras').first().click());
                await sleep(700);
                const rowId = await row.getAttribute('id');
                r.rowActions = await page.locator(`tr#${rowId} + tr`).getByRole('link').allInnerTexts().then((a) => a.map((x) => x.trim())).catch(() => []);
                await page.locator(`tr#${rowId} + tr`).getByRole('link', {name: /^Edit/}).first().click();
                const d = page.locator('[role="dialog"]:visible').last();
                await d.getByRole('tab').first().waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(800);
                r.tabs = await d.getByRole('tab').allInnerTexts().catch(() => []);
                const codes = d.getByRole('tab', {name: /Identification Code|^Metadata$/}).first();
                await codes.click(); await idle(page); await sleep(900);
                const add = page.locator('[role="dialog"]:visible').last().getByRole('link', {name: /Add Code|Add Identification/}).first();
                await add.click(); await sleep(1200); await idle(page);
                const f = page.locator('form#identificationCodeForm, form[id*="dentificationCode"]').last();
                await f.waitFor({timeout: T});
                const sel = f.locator('select').first();
                r.codeOptions = await sel.locator('option').allInnerTexts().catch(() => []);
                const isbn13 = r.codeOptions.find((o) => /^ISBN-13/.test(o.trim()));
                if (isbn13) await sel.selectOption({label: isbn13});
                await f.locator('input[name="value"]').fill('9780306406157');
                await snap('isbn-02-code-form', {codeOptions: r.codeOptions}, {png: true});
                const rq = page.waitForResponse((x) => x.request().method() === 'POST' && /identification-code/i.test(x.url()), {timeout: T}).catch(() => null);
                await f.getByRole('button', {name: /^(Save|OK)$/}).first().click();
                const resp = await rq;
                r.codeSave = resp ? resp.status() : null;
                await sleep(1200); await idle(page);
                await snap('isbn-03-code-saved', {codeSave: r.codeSave}, {png: true});
                S.isbnDone = true; save();
            }
            r.codes = db(`select ic.code, ic.value, pf.publication_format_id, pf.publication_id from identification_codes ic join publication_formats pf on pf.publication_format_id=ic.publication_format_id where pf.publication_id in (select publication_id from publications where submission_id=${S.subs.rich})`);
            await visitor();
            const b = await source('isbn-04-book-with-isbn', richPath());
            r.book = itemOf(b);
            r.filePages = [];
            for (const fh of galleyLinks(b)) r.filePages.push(itemOf(await source(`isbn-05-file-${r.filePages.length + 1}`, abs(fh))));
            fact('isbn', r);
        });

        // ============================================================== chapdate (OMP): chapter dates off, then on again (Rule 16)
        await sect('chapdate', async () => {
            if (!isOMP) return;
            const r = {};
            const setDates = async (label, n) => {
                await as(M.mg);
                await go(wfUrl(S.subs.rich, 'marketing_publicationDates'));
                await sleep(1500);
                const radio = wf().getByRole('radio', {name: label});
                await radio.waitFor({timeout: T});
                await radio.check();
                return pressPubSave(n, wf().locator('form').filter({has: page.locator('input[name="enableChapterPublicationDates"]')}).first());
            };
            const book = await source('chapdate-00-book', richPath());
            const ch = chapterLinks(book);
            r.off = await setDates('All chapters will use the publication date of the monograph.', 'chapdate-01-off-saved');
            r.offPages = [];
            for (const h of ch) { const c = await source(`chapdate-02-off-chapter-${r.offPages.length + 1}`, abs(h)); r.offPages.push({asked: c.asked, gs: pick(c.tags, /^citation_(publication_date|title)$/), dc: pick(c.tags, /^DC\.(Date|Title)/)}); }
            r.on = await setDates('Each chapter may have its own publication date.', 'chapdate-03-on-saved');
            r.onPages = [];
            for (const h of ch) { const c = await source(`chapdate-04-on-chapter-${r.onPages.length + 1}`, abs(h)); r.onPages.push({asked: c.asked, gs: pick(c.tags, /^citation_(publication_date|title)$/), dc: pick(c.tags, /^DC\.(Date|Title)/)}); }
            await visitor();
            fact('chapdate', r);
        });

        // ============================================================== plugins: the rows, then each indexing plugin off and on (Rule 15, Settings 3–4)
        await sect('plugins', async () => {
            const r = {};
            const NAMES = ['Dublin Core Indexing Plugin', 'Google Scholar Indexing Plugin', 'Google Analytics Plugin'];
            await as(M.mg);
            await openPlugins();
            r.rows = {};
            for (const n of NAMES) r.rows[n] = await readRow(n);
            r.allRows = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 60)));
            r.snap = await snap('plugins-01-grid', {rows: r.rows}, {png: true});
            for (const n of NAMES) await loc(page, `Website › Plugins: the "${n}" row`, pRow(n));
            const readAll = async (k) => {
                const o = {};
                const b = await source(`plugins-${k}-rich`, richPath());
                o.rich = {gs: b.gs.length, dc: b.dc.length, schema: pick(b.tags, /^schema\.DC$/), gsFirst: b.gs.slice(0, 3), dcFirst: b.dc.slice(0, 3), snap: b.snap};
                const p = await source(`plugins-${k}-plain`, numPath(S.subs.plain));
                o.plain = {gs: p.gs.length, dc: p.dc.length};
                if (isOMP) {
                    const ch = chapterLinks(b)[0];
                    if (ch) { const c = await source(`plugins-${k}-chapter`, abs(ch)); o.chapter = {gs: c.gs.length, dc: c.dc.length}; }
                    const fl = galleyLinks(b)[0];
                    if (fl) { const f = await source(`plugins-${k}-file`, abs(fl)); o.file = {gs: f.gs.length, dc: f.dc.length}; }
                }
                return o;
            };
            r.both = await readAll('00-both-on');
            const hasDC = r.rows['Dublin Core Indexing Plugin'].present;
            if (hasDC) {
                await openPlugins();
                r.dcOff = await setRow('Dublin Core Indexing Plugin', false);
                await snap('plugins-02-dc-off', {set: r.dcOff});
                r.readDcOff = await readAll('03-dc-off');
                await openPlugins();
                r.dcOn = await setRow('Dublin Core Indexing Plugin', true);
            }
            await openPlugins();
            r.gsOff = await setRow('Google Scholar Indexing Plugin', false);
            await snap('plugins-04-gs-off', {set: r.gsOff});
            r.readGsOff = await readAll('05-gs-off');
            await openPlugins();
            r.gsOn = await setRow('Google Scholar Indexing Plugin', true);
            await openPlugins();
            r.rowsAfter = {};
            for (const n of NAMES) r.rowsAfter[n] = await readRow(n);
            await snap('plugins-06-grid-restored', {rows: r.rowsAfter});
            r.readRestored = await readAll('07-both-on-again');
            r.db = db(`select plugin_name, setting_name, setting_value from plugin_settings where context_id=${M.id} and plugin_name in ('dublincoremetaplugin','googlescholarplugin','googleanalyticsplugin') order by 1,2`);
            await visitor();
            fact('plugins', r);
        });

        // ============================================================== version: the published version's forms; a second version (Rule 12's "follow a change", Rule 13)
        await sect('version', async () => {
            const r = S.version || {};
            const done = (k, v) => { r[k] = v; S.version = r; save(); };
            const sid = S.subs.rich, pub1 = S.pubs.rich;
            await as(M.mg);
            if (!r.published) {
                await openPub(sid, pub1);
                const o = {};
                o.fields = await dumpForms(wf().locator('form').first());
                o.notice = flat(await wf().locator('.pkpNotification, [role="alert"], .pkpPublication__versionPublished, .pkpFormLocales + *').allInnerTexts().then((a) => a.join(' | ')).catch(() => ''), 300);
                o.abstractEditable = await page.evaluate(() => { const e = window.tinymce && window.tinymce.get('titleAbstract-abstract-control-en'); return e ? {mode: e.mode && e.mode.get ? e.mode.get() : null, editable: e.getBody().isContentEditable} : null; }).catch(() => null);
                o.saveButton = await wf().getByRole('button', {name: 'Save', exact: true}).count();
                o.warning = flat(await wf().getByText(/This version has been published/).first().innerText().catch(() => ''), 200);
                o.snap = await snap('version-01-published-title-abstract', {facts: o}, {png: true});
                // the published version's abstract changed and saved: does the page's source follow at the next load?
                if (o.saveButton && o.abstractEditable && o.abstractEditable.editable) {
                    o.typed = await typeRich('titleAbstract-abstract-control-en', 'Edited published abstract.');
                    o.save = await pressPubSave('version-01b-published-abstract-saved');
                    await page.reload(); await idle(page); await sleep(1200);
                    await openPub(sid, pub1);
                    o.afterReload = await page.evaluate(() => { const e = window.tinymce && window.tinymce.get('titleAbstract-abstract-control-en'); return e ? e.getContent() : null; }).catch(() => null);
                    const land = await source('version-01c-landing-after-abstract-edit', richPath());
                    o.landing = pick(land.tags, /^(citation_abstract|DC\.Description|DC\.Date\.modified)$/);
                }
                done('published', o);
            }
            if (!r.v2) {
                await openPub(sid, pub1);
                const nv = await createNewVersion('version-02-new-version');
                const o = {nv};
                if (nv.newPub) {
                    await openPub(sid, nv.newPub);
                    o.title = await typeRich('titleAbstract-title-control-en', `Sea study version two ${S.t}`);
                    o.abstract = await typeRich('titleAbstract-abstract-control-en', 'Version two abstract.');
                    if (isOMP) { const st = page.locator('[id="titleAbstract-subtitle-control-en"]'); o.subtitleBox = await st.count(); if (o.subtitleBox) o.subtitle = await typeRich('titleAbstract-subtitle-control-en', 'tides and shores').catch(async () => { await st.fill('tides and shores'); return 'filled'; }); }
                    o.save = await pressPubSave('version-03-v2-saved');
                    await openPub(sid, nv.newPub);
                    o.publish = await publishOnScreen('version-04-v2-published', isOJS ? /Vol\. 3 No\. 7/ : null);
                }
                o.db = db(`select publication_id, status, version_stage, version_major, version_minor, date_published, (select doi from dois where doi_id=p.doi_id), url_path from publications p where submission_id=${sid} order by 1`);
                done('v2', o);
            }
            await visitor();
            const v2 = r.v2.nv.newPub;
            const cur = await source('version-05-current-landing', richPath(), {png: true});
            r.current = itemOf(cur);
            const verPath = (p) => cu(M.path, `/${isOMP ? 'catalog/book' : `${PATHNAME}/view`}/${sid}/version/${p}`);
            const old = await source('version-06-v1-page', verPath(pub1), {png: true});
            r.v1 = itemOf(old);
            r.v1Links = old.links;
            r.v1ByUrlPath = itemOf(await source('version-06b-v1-page-by-url-path', cu(M.path, `/${isOMP ? 'catalog/book' : `${PATHNAME}/view`}/sea-study/version/${pub1}`)));
            r.v2ByVersion = itemOf(await source('version-07-v2-page-by-version', verPath(v2)));
            r.v1Galleys = [];
            const oldU = await source('version-06c-v1-page-by-url-path-links', cu(M.path, `/${isOMP ? 'catalog/book' : `${PATHNAME}/view`}/sea-study/version/${pub1}`));
            for (const h of [...new Set([...galleyLinks(old), ...galleyLinks(oldU)])]) r.v1Galleys.push(itemOf(await source(`version-08-v1-galley-${r.v1Galleys.length + 1}`, abs(h))));
            r.currentGalleys = [];
            for (const h of galleyLinks(cur)) r.currentGalleys.push(itemOf(await source(`version-09-current-galley-${r.currentGalleys.length + 1}`, abs(h))));
            if (isOMP) {
                r.v1Chapters = [];
                for (const h of chapterLinks(old)) r.v1Chapters.push(itemOf(await source(`version-10-v1-chapter-${r.v1Chapters.length + 1}`, abs(h))));
                r.currentChapters = [];
                for (const h of chapterLinks(cur)) r.currentChapters.push(itemOf(await source(`version-11-current-chapter-${r.currentChapters.length + 1}`, abs(h))));
            }
            fact('version', r);
        });

        // ============================================================== pk: publicknowledge, read only (the seeded plugin state)
        await sect('pk', async () => {
            const r = {};
            const t2 = isOJS ? 'journals' : isOMP ? 'presses' : 'servers';
            const sid = (db(`select s.submission_id from submissions s join ${t2} c on c.${IDCOL}=s.context_id where c.path='${app.contextPath}' and s.status=3 order by 1 limit 1`)[0] || '').trim();
            r.sid = sid;
            if (sid) {
                const o = await source('pk-01-landing', app.url(`/index.php/${app.contextPath}${itemPath(sid)}`));
                r.landing = {status: o.status, landed: o.landed, gsCount: o.gs.length, dcCount: o.dc.length, gs: o.gs.slice(0, 6), dc: o.dc.slice(0, 6), snap: o.snap};
            }
            // the seeded plugin state on publicknowledge, read only (its Plugins grid as its manager; no box is pressed)
            await signIn(page, 'manager.maya', {contextPath: app.contextPath}); await idle(page).catch(() => {});
            await go(app.url(`/index.php/${app.contextPath}/management/settings/website`));
            await page.locator('#plugins-button').click().catch(() => page.getByRole('tab', {name: 'Plugins', exact: true}).first().click());
            await idle(page); await sleep(800);
            await page.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            r.rows = {};
            for (const n of ['Dublin Core Indexing Plugin', 'Google Scholar Indexing Plugin', 'Google Analytics Plugin']) r.rows[n] = await readRow(n);
            r.snap = await snap('pk-02-plugins-grid', {rows: r.rows});
            await signOut(page).catch(() => {});
            fact('pk', r);
        });
        // ============================================================== urn (OJS, OMP): a URN assigned on screen, then published (citation_urn, DC.Identifier.URN)
        await sect('urn', async () => {
            if (isOPS) { fact('urn', {skipped: 'a preprint server has no URN plugin (the context scenario refuses urnpubidplugin on OPS)'}); return; }
            const r = S.urn || {};
            const done = (k, v) => { r[k] = v; S.urn = r; save(); };
            if (!r.ctx) {
                const p = `${S.t}u`;
                const settings = {enablePublicationURN: true, urnPrefix: 'urn:nbn:de:0000-', urnSuffix: 'default', urnCheckNo: false, urnNamespace: 'urn:nbn:de', urnResolver: 'https://nbn-resolving.de/',
                    ...(isOJS ? {enableRepresentationURN: false, enableIssueURN: false} : {enableChapterURN: false, enableRepresentationURN: false, enableSubmissionFileURN: false})};
                const c = await app.api.createContext({tag: p, context: {name: `U20 K3 URN ${J} ${S.t}`, acronym: 'K3U'},
                    users: [{username: `${p}mg`, roles: ['manager'], givenName: 'Uma', familyName: 'Manager'}, {username: `${p}au`, roles: ['author'], givenName: 'Una', familyName: 'Author'}],
                    plugins: {urnpubidplugin: {enabled: true, settings}},
                    ...(isOJS ? {issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {})});
                const s = await app.api.createSubmission({tag: `${p}x`, context: c.path, submitter: `${p}au`, title: `URN item ${S.t}`, ...(isOJS ? {galleys: [{label: 'PDF', file: 'article.pdf'}]} : {})});
                done('ctx', {path: c.path, mg: `${p}mg`, sid: s.submissionId, pub: s.publicationId});
            }
            const U = r.ctx;
            if (!r.assigned) {
                await signIn(page, U.mg, {contextPath: U.path}); await idle(page).catch(() => {});
                await go(cu(U.path, `/dashboard/editorial?workflowSubmissionId=${U.sid}&workflowMenuKey=publication_${U.pub}_titleAbstract`));
                await wf().waitFor({timeout: T}).catch(() => {}); await sleep(1500);
                const menu = await menuLinks();
                const entry = menu.includes('Identifiers') ? 'Identifiers' : (isOMP ? 'Catalog Entry' : 'Identifiers');
                await wf().getByRole('link', {name: entry, exact: true}).last().click().catch(() => {});
                await idle(page); await sleep(1200);
                const assign = wf().locator('.pkpFormField').filter({hasText: 'URN'}).first().getByRole('button', {name: 'Assign', exact: true});
                const o = {menu, entry, assignOffered: await assign.count()};
                if (o.assignOffered) { await assign.click(); await sleep(600); o.save = await pressPubSave('urn-01-assigned'); }
                else o.snap = await snap('urn-01-no-assign', {menu});
                await go(cu(U.path, `/dashboard/editorial?workflowSubmissionId=${U.sid}&workflowMenuKey=publication_${U.pub}_titleAbstract`));
                await wf().waitFor({timeout: T}).catch(() => {}); await sleep(1200);
                o.publish = await publishOnScreen('urn-02-published', isOJS ? /Vol\. 1 No\. 1/ : null);
                o.db = db(`select setting_name, setting_value from publication_settings where publication_id=${U.pub} and setting_name like 'pub-id%'`);
                done('assigned', o);
                await visitor();
            }
            // OJS: "You can not generate a URN until this publication has been assigned to an issue." — assign it on the published version
            if (isOJS && !r.assignedAfter && r.assigned && !r.assigned.assignOffered) {
                await signIn(page, U.mg, {contextPath: U.path}); await idle(page).catch(() => {});
                await go(cu(U.path, `/dashboard/editorial?workflowSubmissionId=${U.sid}&workflowMenuKey=publication_${U.pub}_titleAbstract`));
                await wf().waitFor({timeout: T}).catch(() => {}); await sleep(1500);
                await wf().getByRole('link', {name: 'Identifiers', exact: true}).last().click().catch(() => {});
                await idle(page); await sleep(1200);
                const assign = wf().locator('.pkpFormField').filter({hasText: 'URN'}).first().getByRole('button', {name: 'Assign', exact: true});
                const o = {assignOffered: await assign.count()};
                if (o.assignOffered) { await assign.click(); await sleep(600); o.save = await pressPubSave('urn-02b-assigned-after-publish'); }
                else o.snap = await snap('urn-02b-no-assign-after-publish');
                o.db = db(`select setting_name, setting_value from publication_settings where publication_id=${U.pub} and setting_name like 'pub-id%'`);
                done('assignedAfter', o);
                await visitor();
            }
            const land = await source('urn-03-landing', cu(U.path, itemPath(U.sid)));
            r.landing = {status: land.status, landed: land.landed, urn: pick(land.tags, /urn/i), gsCount: land.gs.length, dcCount: land.dc.length, snap: land.snap};
            fact('urn', r);
        });
        // ============================================================== chapbox (OMP): Setting 15 at both ends, on the published plain book
        await sect('chapbox', async () => {
            if (!isOMP) return;
            const r = S.chapbox || {};
            const done = (k, v) => { r[k] = v; S.chapbox = r; save(); };
            const sid = S.subs.plain, pub = S.pubs.plain;
            const chapUrl = (id) => cu(M.path, `/catalog/book/${sid}/chapter/${id}`);
            if (!r.added) {
                await as(M.mg);
                await openPub(sid, pub, 'Chapters');
                await wf().getByRole('link', {name: 'Add Chapter'}).first().click();
                const f = page.locator('form#editChapterForm');
                await f.locator('input[name="title[en]"]').waitFor({timeout: T});
                await idle(page); await sleep(900);
                await f.locator('input[name="title[en]"]').fill('Chapter Unticked');
                const box = f.locator('input[name="isPageEnabled"]');
                const o = {boxDefault: await box.isChecked()};
                await snap('chapbox-01-add-chapter-form', {facts: o}, {png: true});
                const rq = page.waitForResponse((x) => x.request().method() === 'POST' && /update-chapter|updateChapter/i.test(x.url()), {timeout: T}).catch(() => null);
                await f.getByRole('button', {name: 'Save', exact: true}).click();
                const resp = await rq; o.status = resp ? resp.status() : null;
                await idle(page); await sleep(1500);
                o.row = db(`select chapter_id from submission_chapters where publication_id=${pub} order by chapter_id desc limit 1`)[0];
                done('added', o);
                await visitor();
            }
            const id = r.added.row;
            const book = await source('chapbox-02-book-unticked', numPath(sid));
            r.unticked = {bookChapterLinks: chapterLinks(book), bookChapterText: flat(await vpage.locator('.chapters, .item.chapters').first().innerText().catch(() => ''), 200)};
            const c0 = await source('chapbox-03-chapter-address-unticked', chapUrl(id));
            r.unticked.chapter = {status: c0.status, landed: c0.landed, gs: c0.gs.length, dc: c0.dc.length, h1: c0.h1, title: pick(c0.tags, /^(citation_title|DC\.Title)$/)};
            if (!r.ticked) {
                await as(M.mg);
                await openPub(sid, pub, 'Chapters');
                const link = wf().getByRole('link', {name: 'Chapter Unticked'}).first();
                const o = {};
                if (await link.count()) { await link.click(); } else {
                    const row = wf().locator('tr.gridRow').filter({hasText: 'Chapter Unticked'}).first();
                    await row.locator('a.show_extras').first().click().catch(() => {}); await sleep(500);
                    await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).first().click();
                }
                const f = page.locator('form#editChapterForm');
                await f.locator('input[name="isPageEnabled"]').waitFor({timeout: T});
                await idle(page); await sleep(800);
                await f.locator('input[name="isPageEnabled"]').check();
                const rq = page.waitForResponse((x) => x.request().method() === 'POST' && /update-chapter|updateChapter/i.test(x.url()), {timeout: T}).catch(() => null);
                await f.getByRole('button', {name: 'Save', exact: true}).click();
                const resp = await rq; o.status = resp ? resp.status() : null;
                await idle(page); await sleep(1500);
                o.db = db(`select setting_value from submission_chapter_settings where chapter_id=${id} and setting_name='isPageEnabled'`);
                done('ticked', o);
                await visitor();
            }
            const book2 = await source('chapbox-04-book-ticked', numPath(sid));
            r.tickedRead = {bookChapterLinks: chapterLinks(book2)};
            const c1 = await source('chapbox-05-chapter-ticked', chapUrl(id));
            r.tickedRead.chapter = {status: c1.status, landed: c1.landed, gs: c1.gs, dc: c1.dc.length, h1: c1.h1};
            fact('chapbox', r);
        });
    } finally {
        save();
        await close();
        await visitorBrowser.close();
    }
});
