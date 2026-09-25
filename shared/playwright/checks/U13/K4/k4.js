// U13 claim check, chunk K4: the "Downloads" chart, "References", the Publication Facts Label and the recommendations.
// Spec: docs/specs/U13-article-landing-page-and-reading.md lines 104 (handed on from K1), 150–160 (the Publication Facts
// settings window), 315–356 (Rules 17–20), 373–377 (Side effects, usage statistics), 403–418 (Settings 6–9), register
// A3, OJS2, OJS3, OJS4; footnotes k, l, m, n, o, q6, q13, q14, q15, f-a3, f-ojs2, f-ojs3, f-ojs4.
//
// Per app one scratch context J (OJS journal, OPS server, OMP press), the theme and every plugin as a new context has
// them, except "Citation Style Language" seeded on (line 104 reads the side column with "How to Cite" and the panel).
// OJS and OPS also get a context R whose "References" metadata item is off, holding one item with references.
// Users (J): mgr (manager), se (sectionEditor), au1 "Ada Quillfeather", au2 "Bo Lindqvist", au3 "Cy Moreau",
// au4 "Dee Novak" (authors), rd (reader).
// Items on J (OJS into the published Vol. 1 No. 1 (2026)):
//   A1  au1, keywords kestrelwing + ridgeline, five references, a PDF galley
//   A2  au1, keywords kestrelwing + ridgeline (same author as A1: Rule 20a's crash; a similarity match for A1)
//   B   au2, no keywords, no references (an author of one article)
//   N   au4, keyword zzqunique (no similarity match)
//   S1–S11 (OJS) au3, keywords kestrelwing + ridgeline (A1's similar list passes ten)
//   OMP: one published book (the chart's control).
//
//   PROBE_FEATURE=U13 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U13/K4/k4.js
//   PHASES=seed,chart,refs,off,opssum,pflon,pflwin,pfldate,pflsection,pflfr,rbs,rba,roles,k1look (default all; state in
//   k4-state-<app>.json; the mutating phases expect this order on one seed: delete the state file for a fresh run).
//   rbs runs the fleet's queued jobs (php lib/pkp/tools/jobs.php run, the app's own worker) so the search index holds
//   the items; no request the screens would not send is constructed.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, settled, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const ALL = ['seed', 'chart', 'refs', 'off', 'opssum', 'pflon', 'pflwin', 'pfldate', 'pflsection', 'pflfr', 'rbs', 'rba', 'roles', 'k1look'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 600));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30000;
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);

const REFS = [
    'Quillfeather, A. (2019). Kestrel flight. Journal of Birds, 3(2), 10-20. https://doi.org/10.1234/kestrel.2019.',
    'Smith & Jones (2020). Values < 5 and > 3 matter. Ridge Press.',
    'Archive of ridge data (ftp://files.example.org/ridge/data.csv) accessed 2026.',
    'Plain reference with no address, 1999.',
    'Web page, see https://example.org/path?x=1&y=2, retrieved 2025.',
];

async function sect(name, fn) {
    try { await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 6).join(' | '));
        record(`${name}-FAILED`, {error: String(e.stack || e).slice(0, 2000)});
    }
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const S = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(S, null, 1));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const fact = (k, v) => { record('k4-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, flat(JSON.stringify(v), 2500)); };
    const PDF = isOPS ? 'preprint.pdf' : 'article.pdf';

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u13k4');
        S.t = t;
        const u = (p, k, roles, g, f) => ({username: `${p}${k}`, roles, givenName: g, familyName: f});
        const base = (p, what, acr) => ({name: `U13 K4 ${what} ${p}`, acronym: acr, contactName: 'K4 Contact', contactEmail: `${p}c@mail.test`});
        const pj = `${t}j`;
        const users = [u(pj, 'mgr', ['manager'], 'Mira', 'Manager'), u(pj, 'au1', ['author'], 'Ada', 'Quillfeather'), u(pj, 'rd', ['reader'], 'Rex', 'Reader')];
        if (!isOMP) users.push(u(pj, 'se', ['sectionEditor'], 'Sid', isOPS ? 'Moderator' : 'Section'), u(pj, 'au2', ['author'], 'Bo', 'Lindqvist'),
            u(pj, 'au3', ['author'], 'Cy', 'Moreau'), u(pj, 'au4', ['author'], 'Dee', 'Novak'));
        const j = {tag: pj, context: {...base(pj, isOPS ? 'server' : isOMP ? 'press' : 'journal', 'KFJ'), supportedLocales: ['en', 'fr_CA']}, users,
            plugins: {citationstylelanguageplugin: {enabled: true}}};
        if (isOJS) j.issues = [{volume: 1, number: 1, year: 2026, published: true}];
        const rj = await app.api.createContext(j);
        S.J = {path: rj.path || pj, u: Object.fromEntries(users.map((x) => [x.username.slice(pj.length), x.username]))};
        save();
        const inIssue = isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {};
        const sub = async (ctx, key, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${key}`, context: ctx.path, published: true, ...inIssue, ...spec});
                log('seed', key, r.submissionId, r.publicationId, r.status);
                return {id: r.submissionId, pub: r.publicationId, status: r.status, title: spec.title};
            } catch (e) { log('seed FAILED', key, flat(e.message, 700)); return {error: flat(e.message, 700)}; }
        };
        const J = S.J;
        S.s = {};
        if (isOMP) {
            S.s.BK = await sub(J, 'bk', {submitter: J.u.au1, title: `K4 Book ${t}`});
        } else {
            const kw = ['kestrelwing', 'ridgeline'];
            S.s.A1 = await sub(J, 'a1', {submitter: J.u.au1, title: `K4 Kestrel One ${t}`, keywords: kw, citationsRaw: REFS, galleys: [{label: 'PDF', file: PDF}]});
            S.s.A2 = await sub(J, 'a2', {submitter: J.u.au1, title: `K4 Kestrel Two ${t}`, keywords: kw});
            S.s.B = await sub(J, 'b', {submitter: J.u.au2, title: `K4 Lone Author ${t}`});
            S.s.N = await sub(J, 'n', {submitter: J.u.au4, title: `K4 No Match ${t}`, keywords: ['zzqunique']});
            if (isOJS) {
                for (let i = 1; i <= 11; i++) S.s[`S${i}`] = await sub(J, `s${i}`, {submitter: J.u.au3, title: `K4 Similar ${i} ${t}`, keywords: kw});
            }
            // R: the References item switched off, references kept
            const pr = `${t}r`;
            const rUsers = [u(pr, 'mgr', ['manager'], 'Mira', 'Manager'), u(pr, 'au', ['author'], 'Ada', 'Quillfeather')];
            const r = {tag: pr, context: base(pr, 'refs off', 'KFR'), users: rUsers, metadata: {citations: 'off'}};
            if (isOJS) r.issues = [{volume: 1, number: 1, year: 2026, published: true}];
            const rr = await app.api.createContext(r);
            S.R = {path: rr.path || pr, u: Object.fromEntries(rUsers.map((x) => [x.username.slice(pr.length), x.username]))};
            S.s.RA = await sub(S.R, 'ra', {submitter: S.R.u.au, title: `K4 Refs Off ${t}`, citationsRaw: REFS.slice(0, 2)});
        }
        S.seeded = true; save(); record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const J = S.J;
    const s = S.s;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: page.url().replace(/^.*\/index\.php/, '')});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const dialogsSince = (x) => jsDialogs.filter((d) => d.at >= x);
    const consoleMsgs = [];
    page.on('console', (m) => { if (/PFL|pfl/.test(m.text())) consoleMsgs.push({at: Date.now(), type: m.type(), text: flat(m.text(), 300)}); });
    const navs = [];
    page.on('response', (r) => {
        if (r.request().isNavigationRequest() || /pfl\/locale\/|pflStatistics/.test(r.url())) navs.push({at: Date.now(), url: r.url().replace(/^.*\/index\.php/, '').replace(/^https?:\/\/[^/]+/, ''), status: r.status()});
    });
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
    const noticesSince = async (x) => page.evaluate((y) => (window.__notices || []).filter((n) => n.at >= y).map((n) => n.t), x).catch(() => []);

    async function snap(name, extra) {
        let sc;
        try { sc = await screen(page); } catch (e) { sc = {url: page.url(), error: flat(e.message, 200)}; }
        if (extra) Object.assign(sc, extra);
        record(name, sc);
        await shot(page, name).catch(() => {});
        return sc;
    }
    const as = async (who, ctx = J.path) => {
        if (!who) { await signOut(page).catch(() => {}); return; }
        await signIn(page, who, {contextPath: ctx}); await idle(page);
    };
    const itemUrl = (id, {ctx = J.path, locale = 'en'} = {}) => app.url(isOMP ? `/index.php/${ctx}/${locale}/catalog/book/${id}` : `/index.php/${ctx}/${locale}/${isOPS ? 'preprint' : 'article'}/view/${id}`);

    // Everything this chunk reads on an item page.
    async function readItem() {
        await page.waitForFunction(() => {
            const el = document.querySelector('publication-facts-label');
            return !el || (el.shadowRoot && el.shadowRoot.textContent.trim().length > 0) || (window.__pflWaited = (window.__pflWaited || 0) + 1) > 40;
        }, null, {timeout: 12000, polling: 250}).catch(() => {});
        return page.evaluate(() => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
            const out = {url: location.href, title: document.title, h1: t(document.querySelector('h1'))};
            const parts = (sel) => { const c = document.querySelector(sel); return c ? [...c.children].map((ch) => ({cls: String(ch.className), heads: [...ch.querySelectorAll('h2, h3')].map((h) => h.innerText.trim()), text: t(ch).slice(0, 200)})) : null; };
            out.main = parts('.main_entry');
            out.side = parts('.entry_details');
            // Rule 17: the chart
            const chartSec = document.querySelector('.downloads_chart');
            const canvas = document.querySelector('canvas.usageStatsGraph');
            const un = document.querySelector('.usageStatsUnavailable');
            const pus = window.pkpUsageStats;
            let chart = null;
            try {
                const c = pus && pus.charts ? Object.values(pus.charts)[0] : null;
                chart = c ? {type: c.config && (c.config.type || (c.config._config && c.config._config.type)), labels: c.data && c.data.labels, data: c.data && c.data.datasets && c.data.datasets.map((d) => d.data)} : null;
            } catch (e) { chart = {error: String(e)}; }
            out.chart = {
                section: chartSec ? {heading: t(chartSec.querySelector('h2, h3')), column: chartSec.closest('.main_entry') ? 'main' : chartSec.closest('.entry_details') ? 'side' : (chartSec.parentElement && String(chartSec.parentElement.className)), visible: vis(chartSec), text: t(chartSec)} : null,
                canvas: canvas ? {visible: vis(canvas), h: canvas.getBoundingClientRect().height, w: canvas.getBoundingClientRect().width} : null,
                unavailable: un ? {text: t(un), visible: vis(un)} : null,
                config: pus && pus.config ? {chartType: pus.config.chartType, datasetMaxCount: pus.config.datasetMaxCount} : null,
                data: pus && pus.data ? JSON.stringify(pus.data).slice(0, 600) : null,
                chart,
            };
            // Rule 18: references
            const refs = document.querySelector('.item.references');
            out.references = refs ? {
                heading: t(refs.querySelector('h2, h3')), column: refs.closest('.main_entry') ? 'main' : 'other',
                paragraphs: [...refs.querySelectorAll('.value > p')].map((p) => ({text: t(p), html: p.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 500), links: [...p.querySelectorAll('a')].map((a) => ({text: t(a), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel')}))})),
                valueHtml: (refs.querySelector('.value') || refs).innerHTML.replace(/\s+/g, ' ').trim().slice(0, 1500),
            } : null;
            // Rule 19: the Publication Facts panel
            const pfl = document.querySelector('.pflPlugin');
            const el = document.querySelector('publication-facts-label');
            out.pfl = pfl ? {
                column: pfl.closest('.entry_details') ? 'side' : pfl.closest('.main_entry') ? 'main' : String(pfl.parentElement && pfl.parentElement.className),
                indexInSide: pfl.closest('.entry_details') ? [...pfl.closest('.entry_details').children].indexOf(pfl) : null,
                sideCount: pfl.closest('.entry_details') ? pfl.closest('.entry_details').children.length : null,
                visible: vis(pfl), h: pfl.getBoundingClientRect().height,
                lightText: t(pfl),
                shadow: el && el.shadowRoot ? {text: (el.shadowRoot.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1500),
                    inner: (() => { try { const d = document.createElement('div'); d.innerHTML = el.shadowRoot.innerHTML; return null; } catch (e) { return null; } })(),
                    rows: [...el.shadowRoot.querySelectorAll('tr, [role=row], th, td, h1, h2, h3, h4, caption, a')].map((x) => ({tag: x.tagName.toLowerCase(), text: (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140), href: x.getAttribute('href')})).slice(0, 80),
                    links: [...el.shadowRoot.querySelectorAll('a')].map((a) => ({text: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), target: a.getAttribute('target')}))} : null,
                hasData: el ? !!el.data : null,
            } : null;
            // Rule 20: recommendations
            const rb = document.querySelector('#articlesBySameAuthorList');
            out.byAuthor = rb ? {heading: t(rb.querySelector('h2, h3')), items: [...rb.querySelectorAll('li')].map(t), pages: t(rb.querySelector('#articlesBySameAuthorPages'))} : null;
            const rs = document.querySelector('#articlesBySimilarityList');
            out.similar = rs ? {heading: t(rs.querySelector('h2, h3')), column: rs.closest('.main_entry') ? 'main' : rs.closest('.entry_details') ? 'side' : String(rs.parentElement && rs.parentElement.className),
                items: [...rs.querySelectorAll('ul > li')].map(t), pages: t(rs.querySelector('#articlesBySimilarityPages')),
                pageLinks: [...rs.querySelectorAll('#articlesBySimilarityPages a')].map((a) => ({text: t(a), href: a.getAttribute('href')})),
                search: t(rs.querySelector('#articlesBySimilaritySearch')), searchLink: (() => { const a = rs.querySelector('#articlesBySimilaritySearch a'); return a ? {text: t(a), href: a.getAttribute('href')} : null; })()} : null;
            const pa = document.querySelector('.page_article, .page.page_article');
            out.pageParts = pa ? [...pa.children].map((c) => ({tag: c.tagName.toLowerCase(), id: c.id || null, cls: String(c.className), text: t(c).slice(0, 120)})) : null;
            out.headingsAll = [...document.querySelectorAll('h1, h2, h3')].map((h) => h.innerText.trim()).filter(Boolean);
            out.bodyStart = t(document.body).slice(0, 300);
            return out;
        });
    }
    async function openItem(id, name, opts = {}) {
        const t0 = Date.now();
        const resp = await page.goto(itemUrl(id, opts)).catch((e) => ({error: String(e.message)}));
        await idle(page);
        const status = resp && resp.status ? resp.status() : resp;
        const item = await readItem().catch((e) => ({error: flat(e.message, 300)}));
        const extra = {status, item, pflFetches: navs.filter((n) => n.at >= t0 && /pfl/.test(n.url)), console: consoleMsgs.filter((c) => c.at >= t0)};
        await snap(name, extra);
        log(`[${name}]`, status, flat(JSON.stringify({chart: item.chart && {sec: !!item.chart.section, canvas: item.chart.canvas, un: item.chart.unavailable, type: item.chart.config}, refs: item.references && item.references.paragraphs && item.references.paragraphs.length, pfl: item.pfl && {col: item.pfl.column, idx: item.pfl.indexInSide, shadow: item.pfl.shadow && item.pfl.shadow.text.slice(0, 200)}, byAuthor: item.byAuthor, similar: item.similar && {n: item.similar.items.length, pages: item.similar.pages}}), 1200));
        return {status, item, ...extra};
    }

    // ---- Settings › Website › Plugins -------------------------------------------------------------
    const row = (id) => page.locator(`#pluginGridContainer tr.gridRow[id$="-row-${id}"]`);
    async function gotoPlugins() {
        await page.goto(app.url(`/index.php/${J.path}/en/management/settings/website`));
        await idle(page);
        await page.locator('#plugins-button').first().click();
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T});
        await idle(page); await sleep(400);
    }
    async function rowRead(id) {
        const r = row(id);
        const o = {count: await r.count()};
        if (!o.count) return o;
        o.text = flat(await r.innerText());
        o.checked = await r.getByRole('checkbox').first().isChecked().catch(() => null);
        const exp = r.locator('a.show_extras').first();
        o.expander = await exp.count();
        if (o.expander) { await exp.click(); await sleep(500); }
        o.links = await page.locator(`#pluginGridContainer tr[id$="-row-${id}"] + tr`).locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        if (o.expander) { await r.locator('a.hide_extras').first().click().catch(() => {}); await sleep(300); }
        return o;
    }
    async function setPlugin(id, want) {
        const box = row(id).getByRole('checkbox').first();
        const o = {id, before: await box.isChecked(), want};
        if (o.before === want) return o;
        const t0 = Date.now();
        const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true});
        await sleep(700);
        const dlg = page.locator('[role="dialog"]:visible');
        if (await dlg.count()) {
            o.confirm = flat(await dlg.last().innerText().catch(() => null), 400);
            const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const resp = await w;
        o.status = resp ? resp.status() : null;
        await sleep(1200); await idle(page);
        o.after = await row(id).getByRole('checkbox').first().isChecked().catch(() => null);
        o.notices = await noticesSince(t0);
        o.dialogs = dialogsSince(t0);
        return o;
    }
    const PLUG = {pfl: 'pflplugin', rba: 'recommendbyauthorplugin', rbs: 'recommendbysimilarityplugin', csl: 'citationstylelanguageplugin'};
    async function plugin(key, want, name) {
        await gotoPlugins();
        const o = await setPlugin(PLUG[key], want);
        o.row = await rowRead(PLUG[key]);
        await snap(name, {toggle: o});
        log(`[${name}]`, flat(JSON.stringify(o), 600));
        return o;
    }

    // ---- the "Publication Facts Label plugin" settings window --------------------------------------
    const pform = () => page.locator('#pflPluginSettingsForm');
    async function openPfl() {
        await gotoPlugins();
        const r = row(PLUG.pfl);
        const exp = r.locator('a.show_extras').first();
        if (await exp.count()) { await exp.click(); await sleep(500); }
        const link = page.locator(`#pluginGridContainer tr[id$="-row-${PLUG.pfl}"] + tr`).getByRole('link', {name: 'Settings', exact: true}).first();
        await loc(page, 'Website › Plugins: the "Publication Facts Label plugin" row\'s "Settings" (after the row\'s arrow)', link);
        await link.click();
        await pform().locator('input[name="academicSociety"]').waitFor({state: 'visible', timeout: T});
        await settled(page, pform().locator('label').first());
        await idle(page); await sleep(400);
    }
    async function pflState() {
        const dialog = page.locator('[role="dialog"]:visible').filter({has: pform()}).last();
        const data = await pform().evaluate((root) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const lab = (i) => { const l = root.querySelector(`label[for="${i.id}"]`) || i.closest('label'); return l ? t(l) : null; };
            return {
                areas: [...root.querySelectorAll('fieldset, .section')].map((x) => ({legend: t(x.querySelector('legend, .label')), text: t(x).slice(0, 600)})),
                inputs: [...root.querySelectorAll('input:not([type=hidden])')].map((i) => ({name: i.name, type: i.type, label: lab(i), value: i.type === 'checkbox' ? i.checked : i.value, cls: i.className})),
                errors: [...root.querySelectorAll('.error, .pkp_form_error, label.error, .pkpFormError, [class*="error"]')].filter((e) => e.offsetParent !== null).map(t).filter(Boolean),
                buttons: [...root.querySelectorAll('button, input[type=submit], a')].filter((b) => b.offsetParent !== null).map((b) => (b.innerText || b.value || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
                text: t(root),
            };
        });
        return {open: await pform().isVisible().catch(() => false),
            title: flat(await dialog.locator('h1, h2, .pkp_modal_title, [class*="title"]').first().innerText().catch(() => null), 200), ...data};
    }
    // set: {society, societyUrl, dateStart, doaj, scholar, latindex, medline, scopus, wos}
    async function pflFill(set) {
        const f = pform();
        const text = {society: 'academicSociety', societyUrl: 'academicSocietyUrl', scopus: 'scopusUrl', wos: 'wosUrl'};
        for (const [k, n] of Object.entries(text)) if (set[k] !== undefined) await f.locator(`input[name="${n}"]`).fill(set[k]);
        if (set.dateStart !== undefined) {
            const d = f.locator('input[id^="dateStart"]:not([type=hidden])').first();
            // typed key by key, as a person types: the datepicker copies a parsed date into its hidden field on keyup
            await d.click(); await d.fill(''); if (set.dateStart) await d.pressSequentially(set.dateStart, {delay: 40});
            await page.keyboard.press('Tab').catch(() => {});
            await sleep(300);
            await page.locator('#ui-datepicker-div').evaluate((e) => { e.style.display = 'none'; }).catch(() => {});
        }
        const box = {doaj: 'includeDoaj', scholar: 'includeScholar', latindex: 'includeLatindex', medline: 'includeMedline'};
        for (const [k, n] of Object.entries(box)) {
            if (set[k] === undefined) continue;
            const b = f.locator(`input[name="${n}"]`);
            if ((await b.isChecked()) !== set[k]) await b.click();
        }
    }
    async function pflSave(set, name) {
        await openPfl();
        await pflFill(set);
        const dateFields = async () => pform().locator('input[id^="dateStart"]').evaluateAll((els) => els.map((e) => ({name: e.name, type: e.type, value: e.value}))).catch(() => null);
        const datesBefore = await dateFields();
        const t0 = Date.now();
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /pflplugin|manage/.test(r.url()), {timeout: 45000}).catch(() => null);
        await pform().getByRole('button', {name: /^(OK|Save)$/}).click();
        const resp = await w;
        await sleep(1500); await idle(page); await sleep(800);
        const o = {set, datesBefore, status: resp ? resp.status() : null, ms: Date.now() - t0, stillOpen: await pform().isVisible().catch(() => false), notices: await noticesSince(t0), dialogs: dialogsSince(t0)};
        if (set.dateStart !== undefined && !o.stillOpen) {
            await openPfl();
            o.datesReopened = await dateFields();
            await snap(`${name}-reopened`, {dates: o.datesReopened});
            await pflClose('cancel');
        }
        if (o.stillOpen) o.win = await pflState();
        await snap(name, {save: o});
        log(`[${name}]`, flat(JSON.stringify({status: o.status, open: o.stillOpen, notices: o.notices, errors: o.win && o.win.errors, text: o.win && o.win.text.slice(0, 400)}), 1500));
        if (o.stillOpen) await pflClose('cancel');
        return o;
    }
    async function pflClose(how) {
        const f = pform();
        if (how === 'cancel') {
            await f.getByRole('link', {name: 'Cancel', exact: true}).or(f.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
        } else {
            await page.locator('[role="dialog"]:visible').filter({has: f}).last().getByRole('button', {name: /Close/}).first().click().catch(() => {});
        }
        await f.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await idle(page); await sleep(700);
    }

    // ---- Settings › Website › Appearance › Theme ---------------------------------------------------
    const themePanel = () => page.locator('[role="tabpanel"]#theme').first();
    async function openTheme() {
        await page.goto(app.url(`/index.php/${J.path}/en/management/settings/website`));
        await idle(page);
        for (const id of ['appearance', 'theme']) {
            const b = page.locator(`#${id}-button`).first();
            await b.waitFor({timeout: T});
            if ((await b.getAttribute('aria-selected')) !== 'true') { await b.click(); await idle(page); }
        }
        await themePanel().getByRole('radio').first().waitFor({timeout: T});
        await sleep(300);
        return themePanel();
    }
    async function statsField() {
        return themePanel().locator('.pkpFormField').filter({hasText: /Usage statistics display options/}).first().evaluate((f) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            return {label: t(f.querySelector('legend, .pkpFormFieldLabel, label')), description: t(f.querySelector('.pkpFormField__description')),
                options: [...f.querySelectorAll('input[type=radio]')].map((i) => ({value: i.value, checked: i.checked, label: t(i.closest('label')) || (i.labels && i.labels[0] ? t(i.labels[0]) : null)}))};
        }).catch((e) => ({error: flat(e.message, 200)}));
    }
    async function themeSave() {
        const panel = themePanel();
        const w = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()) && !/temporaryFiles/.test(r.url()), {timeout: T}).catch(() => null);
        await panel.getByRole('button', {name: 'Save', exact: true}).last().click();
        const r = await w;
        const saved = await page.locator('[role="status"]').filter({hasText: /Saved/}).first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
        await idle(page);
        return {status: r ? r.status() : null, saved};
    }

    // ================================================================== chart (Rule 17, Settings 6, A3, Side effects)
    if (on('chart')) await sect('chart', async () => {
        const item = isOMP ? s.BK : s.A1;
        const res = {};
        await as(null);
        res.none0 = await openItem(item.id, 'c-01-item-default-visitor');
        await as(J.u.mgr);
        await openTheme();
        res.field0 = await statsField();
        await snap('c-02-theme-default', {field: res.field0});
        await loc(page, 'Appearance › Theme: the "Usage statistics display options" field', themePanel().locator('.pkpFormField').filter({hasText: /Usage statistics display options/}).first());
        for (const [k, re] of [['bar', /^Use bar type/], ['line', /^Use line type/]]) {
            await openTheme();
            await themePanel().getByRole('radio', {name: re}).check();
            res[`${k}Save`] = await themeSave();
            res[`${k}Field`] = await statsField();
            await snap(`c-03-theme-${k}-saved`, {save: res[`${k}Save`], field: res[`${k}Field`]});
            await as(null);
            res[k] = await openItem(item.id, `c-04-item-${k}-visitor`);
            // Side effects: a galley opened, then the page again (the chart reads processed statistics only)
            if (k === 'bar' && !isOMP) {
                const t0 = Date.now();
                const g = page.locator('.obj_galley_link').first();
                if (await g.count()) {
                    await loc(page, 'Item page: the first galley link', g);
                    await g.click().catch(() => {});
                    await idle(page); await sleep(1500);
                    await snap('c-05-galley-opened-visitor', {since: navs.filter((n) => n.at >= t0)});
                    const dl = page.locator('a.download, a:has-text("Download")').first();
                    if (await dl.count()) {
                        const dlw = page.waitForEvent('download', {timeout: 15000}).catch(() => null);
                        await dl.click().catch(() => {});
                        const d = await dlw;
                        res.download = d ? {name: d.suggestedFilename()} : null;
                    }
                }
                res.barAgain = await openItem(item.id, 'c-06-item-bar-after-galley-visitor');
            }
            await as(J.u.mgr);
        }
        // the usage event log the page and galley openings write (read from the install's files, no request)
        try {
            const cfg = fs.readFileSync(path.join(REPO, `checkouts/${app.name}/config.test.inc.php`), 'utf8');
            const dir = (cfg.match(/^files_dir\s*=\s*"?([^"\n]+)"?/m) || [])[1];
            const logDir = path.join(dir.trim(), 'usageStats', 'usageEventLogs');
            const files = fs.readdirSync(logDir).sort();
            const last = fs.readFileSync(path.join(logDir, files[files.length - 1]), 'utf8').split('\n').filter((l) => l.includes(J.path));
            res.usageLog = {file: files[files.length - 1], lines: last.length, sample: last.slice(-6).map((l) => { try { const o = JSON.parse(l); return {canonicalUrl: o.canonicalUrl, assocType: o.assocType, submissionId: o.submissionId, representationId: o.representationId, submissionFileId: o.submissionFileId}; } catch (e) { return flat(l, 200); } })};
            res.processed = fs.existsSync(path.join(dir.trim(), 'usageStats', 'processing')) ? fs.readdirSync(path.join(dir.trim(), 'usageStats', 'processing')) : null;
            res.archive = fs.existsSync(path.join(dir.trim(), 'usageStats', 'archive')) ? fs.readdirSync(path.join(dir.trim(), 'usageStats', 'archive')).slice(-3) : null;
        } catch (e) { res.usageLogError = flat(e.message, 300); }
        // leave the Theme tab with an unsaved change: Setup tab, then another page
        await openTheme();
        await themePanel().getByRole('radio', {name: /^Use bar type/}).check();
        const t0 = Date.now();
        await page.locator('#setup-button').last().click().catch(() => {});
        await idle(page); await sleep(500);
        res.leaveTab = {dialogs: dialogsSince(t0), notices: await noticesSince(t0), url: page.url()};
        await snap('c-07-theme-unsaved-then-setup', {leave: res.leaveTab});
        await page.locator('#appearance-button').first().click().catch(() => {});
        await page.locator('#theme-button').first().click().catch(() => {});
        await sleep(400);
        res.backOnTheme = await statsField();
        const t1 = Date.now();
        await page.goto(app.url(`/index.php/${J.path}/en/management/settings/context`)).catch((e) => { res.leavePageErr = flat(e.message, 200); });
        await idle(page);
        res.leavePage = {dialogs: dialogsSince(t1), url: page.url()};
        await snap('c-08-theme-unsaved-left-page', {leave: res.leavePage, backOnTheme: res.backOnTheme});
        await openTheme();
        res.afterLeave = await statsField();
        // none again: the chart goes
        await themePanel().getByRole('radio', {name: /^Do not display submission usage/}).check();
        res.noneSave = await themeSave();
        await as(null);
        res.none1 = await openItem(item.id, 'c-09-item-none-again-visitor');
        // bar again for the later phases' pages
        await as(J.u.mgr);
        await openTheme();
        await themePanel().getByRole('radio', {name: /^Use bar type/}).check();
        res.barFinal = await themeSave();
        await as(null);
        const brief = (x) => x && x.item ? {status: x.status, chart: x.item.chart, mainOrder: (x.item.main || []).map((m) => m.cls)} : x;
        fact('chart', {field0: res.field0, none0: brief(res.none0), bar: brief(res.bar), line: brief(res.line), barAgain: brief(res.barAgain), download: res.download,
            none1: brief(res.none1), usageLog: res.usageLog, processed: res.processed, archive: res.archive, usageLogError: res.usageLogError,
            leaveTab: res.leaveTab, backOnTheme: res.backOnTheme, leavePage: res.leavePage, afterLeave: res.afterLeave, saves: [res.barSave, res.lineSave, res.noneSave, res.barFinal]});
    });

    // ================================================================== refs (Rule 18)
    if (on('refs') && !isOMP) await sect('refs', async () => {
        await as(null);
        const a = await openItem(s.A1.id, 'r-01-a1-refs-visitor');
        await loc(page, 'Item page: the "References" section', page.locator('.item.references'));
        await loc(page, 'Item page: a reference\'s links', page.locator('.item.references .value a'));
        const b = await openItem(s.B.id, 'r-02-b-no-refs-visitor');
        const r = await openItem(s.RA.id, 'r-03-refs-item-off-visitor', {ctx: S.R.path});
        // the R context's metadata screen, to show the item is off there
        await as(S.R.u.mgr, S.R.path);
        await page.goto(app.url(`/index.php/${S.R.path}/en/management/settings/workflow`)); await idle(page);
        const mdTab = page.getByRole('tab', {name: 'Metadata', exact: true}).first();
        if (await mdTab.count()) { await mdTab.click(); await idle(page); await sleep(500); }
        const refsBox = await page.locator('.pkpFormField').filter({hasText: /References/}).first().evaluate((f) => ({text: f.innerText.replace(/\s+/g, ' ').trim().slice(0, 400), boxes: [...f.querySelectorAll('input')].map((i) => ({type: i.type, value: i.value, checked: i.checked}))})).catch((e) => ({error: flat(e.message, 200)}));
        await snap('r-04-refs-off-metadata-setting', {refsBox});
        // a signed-in reader sees the same block
        await as(J.u.rd);
        const ar = await openItem(s.A1.id, 'r-05-a1-refs-reader');
        await as(null);
        fact('refs', {a1: a.item.references, a1Order: (a.item.main || []).map((m) => m.cls), b: b.item.references, bMain: (b.item.main || []).map((m) => m.cls),
            rOff: r.item.references, refsBox, readerSame: JSON.stringify(ar.item.references) === JSON.stringify(a.item.references)});
    });

    // ================================================================== off (Settings 7–9 on a new context; OMP/OPS controls)
    if (on('off')) await sect('off', async () => {
        await as(J.u.mgr);
        await gotoPlugins();
        const rows = {};
        for (const [k, id] of Object.entries(PLUG)) rows[k] = await rowRead(id);
        const names = await page.locator('#pluginGridContainer tr.gridRow').evaluateAll((els) => els.map((e) => (e.querySelector('td') || e).innerText.replace(/\s+/g, ' ').trim().slice(0, 60)));
        const hits = names.filter((n) => /Publication Facts|Recommend/i.test(n));
        await snap('o-01-plugins-new-context', {rows, hits});
        for (const [k, id] of Object.entries(PLUG)) await loc(page, `Website › Plugins: the ${k} row`, row(id));
        let pageRead = null;
        if (!isOMP) {
            await as(null);
            pageRead = await openItem(s.A1.id, 'o-02-a1-plugins-off-visitor');
        }
        fact('off', {rows, hits, pfl: pageRead && pageRead.item.pfl, byAuthor: pageRead && pageRead.item.byAuthor, similar: pageRead && pageRead.item.similar, side: pageRead && (pageRead.item.side || []).map((x) => x.cls)});
    });

    // ================================================================== opssum (Side effects: the preprint summary's "Downloads: {count}" after openings)
    if (on('opssum') && isOPS) await sect('opssum', async () => {
        await as(null);
        await page.goto(app.url(`/index.php/${J.path}/en`)); await idle(page);
        const sums = await page.locator('.obj_preprint_summary').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 200)));
        await snap('u-01-server-home-summaries-visitor', {sums});
        fact('opssum', {sums});
    });

    if (!isOJS) { await close(); return; }

    // ================================================================== pflon (Settings 7, Rule 19, OJS2, line 104)
    if (on('pflon')) await sect('pflon', async () => {
        await as(J.u.mgr);
        const tog = await plugin('pfl', true, 'p-01-pfl-enabled');
        await openPfl();
        const win = await pflState();
        await snap('p-02-pfl-settings-window', {win});
        await loc(page, 'PFL settings window: the form', pform());
        await loc(page, 'PFL settings window: "Society name or acronym"', pform().locator('input[name="academicSociety"]'));
        await loc(page, 'PFL settings window: "Start Date"', pform().locator('input[id^="dateStart"]:not([type=hidden])'));
        await loc(page, 'PFL settings window: DOAJ box', pform().locator('input[name="includeDoaj"]'));
        await loc(page, 'PFL settings window: Scopus URL', pform().locator('input[name="scopusUrl"]'));
        await loc(page, 'PFL settings window: Web of Science URL', pform().locator('input[name="wosUrl"]'));
        // Close after a change: what asks
        await pform().locator('input[name="academicSociety"]').fill('Unsaved society');
        await pform().locator('input[name="academicSociety"]').blur();
        const t0 = Date.now();
        await pflClose('close');
        const closeAsk = {dialogs: dialogsSince(t0), stillOpen: await pform().isVisible().catch(() => false)};
        await snap('p-03-pfl-window-closed-after-change', {closeAsk});
        await openPfl();
        const reopened = await pflState();
        await pflClose('cancel');
        await as(null);
        const a = await openItem(s.A1.id, 'p-04-a1-pfl-on-visitor');
        await loc(page, 'Item page: the Publication Facts section', page.locator('.pflPlugin'));
        await as(J.u.rd);
        const ar = await openItem(s.A1.id, 'p-05-a1-pfl-on-reader');
        await as(null);
        fact('pflon', {tog, win: {title: win.title, areas: win.areas, inputs: win.inputs, text: win.text}, closeAsk, reopenedSociety: (reopened.inputs.find((i) => i.name === 'academicSociety') || {}).value,
            status: a.status, pfl: a.item.pfl, side: (a.item.side || []).map((x) => ({cls: x.cls, heads: x.heads})), pflFetches: a.pflFetches, console: a.console, readerPfl: ar.item.pfl && ar.item.pfl.shadow && ar.item.pfl.shadow.text});
    });

    // ================================================================== pflwin (the window's fields and messages; q15)
    if (on('pflwin')) await sect('pflwin', async () => {
        const res = {};
        await as(J.u.mgr);
        // each refusal on its own
        res.societyUrl = await pflSave({societyUrl: 'not a url'}, 'w-01-society-url-invalid');
        res.societyUrl2 = await pflSave({societyUrl: 'http://nodot'}, 'w-01b-society-url-nodot');
        res.scopus = await pflSave({societyUrl: '', scopus: 'https://example.org/x'}, 'w-02-scopus-invalid');
        res.wos = await pflSave({scopus: '', wos: 'https://example.org/y'}, 'w-03-wos-invalid');
        res.date = await pflSave({wos: '', dateStart: 'notadate'}, 'w-04-date-invalid');
        res.doajNoIssn = await pflSave({dateStart: '', doaj: true}, 'w-05-doaj-no-issn');
        res.latindex = await pflSave({doaj: false, latindex: true}, 'w-06-latindex-no-issn');
        res.medline = await pflSave({latindex: false, medline: true}, 'w-07-medline-no-issn');
        // the journal's online ISSN typed on Settings › Journal › Masthead, then DOAJ again
        await page.goto(app.url(`/index.php/${J.path}/en/management/settings/context`)); await idle(page);
        const mt = page.getByRole('tab', {name: 'Masthead', exact: true}).first();
        if ((await mt.getAttribute('aria-selected').catch(() => null)) !== 'true') await mt.click().catch(() => {});
        const issn = page.locator('[id^="masthead-onlineIssn-control"]').first();
        await issn.waitFor({timeout: T});
        await issn.fill('0378-5955');
        const mf = page.locator('form').filter({has: issn}).first();
        // a scratch journal has no country, which the form requires
        const country = mf.locator('select[id^="masthead-country-control"]').first();
        if (!(await country.inputValue().catch(() => ''))) await country.selectOption({label: 'Iceland'});
        const w = page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await mf.getByRole('button', {name: 'Save', exact: true}).click();
        const mr = await w;
        res.issnSave = {status: mr ? mr.status() : null, saved: await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false)};
        await snap('w-08-masthead-issn-saved', {save: res.issnSave});
        res.doajIssn = await pflSave({medline: false, doaj: true}, 'w-09-doaj-with-issn');
        res.allThree = await pflSave({doaj: true, latindex: true, medline: true}, 'w-10-three-indexes-with-issn');
        // the valid save
        res.valid = await pflSave({doaj: false, latindex: false, medline: false, scholar: true, society: 'K4 Ornithological Society', societyUrl: 'https://society.example.org',
            scopus: 'https://www.scopus.com/sourceid/12345', wos: 'https://mjl.clarivate.com/search-results?issn=0378-5955'}, 'w-11-valid-save');
        await openPfl();
        res.validReopened = await pflState();
        await snap('w-12-valid-reopened', {win: res.validReopened});
        // Cancel after a change stores nothing
        await pflFill({society: 'Cancelled society'});
        await pflClose('cancel');
        await openPfl();
        res.afterCancel = (await pflState()).inputs.find((i) => i.name === 'academicSociety');
        await pflClose('cancel');
        await as(null);
        const a = await openItem(s.A1.id, 'w-13-a1-panel-after-valid-save-visitor');
        const pick = (o) => ({status: o.status, stillOpen: o.stillOpen, notices: o.notices, ms: o.ms, errors: o.win && o.win.errors, formText: o.win && o.win.text && o.win.text.slice(0, 500)});
        fact('pflwin', {societyUrl: pick(res.societyUrl), societyUrl2: res.societyUrl2 && pick(res.societyUrl2), scopus: pick(res.scopus), wos: pick(res.wos), date: {...pick(res.date), datesBefore: res.date.datesBefore, datesReopened: res.date.datesReopened}, doajNoIssn: pick(res.doajNoIssn), latindex: pick(res.latindex),
            medline: pick(res.medline), issnSave: res.issnSave, doajIssn: pick(res.doajIssn), allThree: pick(res.allThree), valid: pick(res.valid),
            validReopened: res.validReopened.inputs, afterCancel: res.afterCancel, panel: a.item.pfl && a.item.pfl.shadow, status: a.status});
    });

    // ================================================================== pfldate (Start Date both ends)
    if (on('pfldate')) await sect('pfldate', async () => {
        await as(J.u.mgr);
        const typedBad = await pflSave({dateStart: 'notadate'}, 'd-00-start-notadate-typed');
        const typedBad2 = await pflSave({dateStart: '2026-99-99'}, 'd-00b-start-impossible-typed');
        const future = await pflSave({dateStart: '2099-01-01'}, 'd-01-start-2099');
        await as(null);
        const f = await openItem(s.A1.id, 'd-02-a1-start-future-visitor');
        await as(J.u.mgr);
        const past = await pflSave({dateStart: '2020-01-01'}, 'd-03-start-2020');
        await as(null);
        const p = await openItem(s.A1.id, 'd-04-a1-start-past-visitor');
        await as(J.u.mgr);
        const cleared = await pflSave({dateStart: ''}, 'd-05-start-cleared');
        fact('pfldate', {typedBad2: {status: typedBad2.status, open: typedBad2.stillOpen, notices: typedBad2.notices, errors: typedBad2.win && typedBad2.win.errors, datesBefore: typedBad2.datesBefore, datesReopened: typedBad2.datesReopened}, typedBad: {status: typedBad.status, open: typedBad.stillOpen, notices: typedBad.notices, errors: typedBad.win && typedBad.win.errors, datesBefore: typedBad.datesBefore, datesReopened: typedBad.datesReopened}, future: {status: future.status, open: future.stillOpen, datesBefore: future.datesBefore, datesReopened: future.datesReopened}, futurePage: {status: f.status, pfl: !!f.item.pfl, pflText: f.item.pfl && f.item.pfl.shadow && f.item.pfl.shadow.text.slice(0, 200)},
            past: {status: past.status, datesReopened: past.datesReopened}, pastPage: {status: p.status, pfl: !!p.item.pfl}, cleared: {status: cleared.status, datesReopened: cleared.datesReopened}});
    });

    // ================================================================== pflsection ("Will not be peer-reviewed")
    async function sectionReviewed(notReviewed, name) {
        await page.goto(app.url(`/index.php/${J.path}/en/management/settings/context`)); await idle(page);
        await page.getByRole('tab', {name: /^Sections$/}).first().click(); await idle(page);
        const grid = page.locator('#sectionsGridContainer');
        await grid.locator('tr.gridRow').first().waitFor({timeout: T});
        const gridText = flat(await grid.innerText(), 300);
        await grid.locator('tr.gridRow a.show_extras').first().click(); await idle(page);
        await grid.getByRole('link', {name: 'Edit', exact: true}).first().click();
        const form = page.locator('form#sectionForm');
        const box = form.locator('input[name="metaReviewed"]');
        await box.waitFor({timeout: T});
        const label = flat(await form.locator('label[for^="metaReviewed"], label:has(input[name="metaReviewed"])').first().innerText().catch(() => null), 200);
        const before = await box.isChecked();
        if (before !== notReviewed) await box.click();
        await snap(`${name}-form`, {label, before});
        await loc(page, 'Sections › Edit: "Will not be peer-reviewed"', box);
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /section/i.test(r.url()), {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        await form.waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        await idle(page);
        return {gridText, label, before, status: r ? r.status() : null};
    }
    if (on('pflsection')) await sect('pflsection', async () => {
        await as(J.u.mgr);
        const tick = await sectionReviewed(true, 's-01-section-not-reviewed');
        await as(null);
        const a = await openItem(s.A1.id, 's-02-a1-section-not-reviewed-visitor');
        await as(J.u.mgr);
        const untick = await sectionReviewed(false, 's-03-section-reviewed');
        await as(null);
        const b = await openItem(s.A1.id, 's-04-a1-section-reviewed-visitor');
        fact('pflsection', {tick, page: {status: a.status, pfl: !!a.item.pfl}, untick, pageBack: {status: b.status, pfl: !!b.item.pfl}});
    });

    // ================================================================== pflfr (OJS3: the French page)
    if (on('pflfr')) await sect('pflfr', async () => {
        await as(null);
        const fr = await openItem(s.A1.id, 'f-01-a1-french-visitor', {locale: 'fr_CA'});
        const en = await openItem(s.A1.id, 'f-02-a1-english-again-visitor', {locale: 'en'});
        fact('pflfr', {status: fr.status, pfl: fr.item.pfl, pflFetches: fr.pflFetches, console: fr.console, enShadow: en.item.pfl && en.item.pfl.shadow && en.item.pfl.shadow.text.slice(0, 300)});
    });

    // ================================================================== rbs (Settings 9, Rule 20b)
    if (on('rbs')) await sect('rbs', async () => {
        const res = {};
        await as(J.u.mgr);
        res.tog = await plugin('rbs', true, 'm-01-rbs-enabled');
        await as(null);
        res.before = await openItem(s.A1.id, 'm-02-a1-similar-before-jobs-visitor');
        const root = path.resolve(REPO, `checkouts/${app.name}`);
        try {
            res.jobs = flat(execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: root, env: {...process.env, PKP_CONFIG_FILE: path.join(root, 'config.test.inc.php')}, encoding: 'utf8', timeout: 400000}), 400);
        } catch (e) { res.jobsErr = flat(String(e.stdout || e.message), 400); }
        res.a1 = await openItem(s.A1.id, 'm-03-a1-similar-after-jobs-visitor');
        await loc(page, 'Item page: the "Similar Articles" section', page.locator('#articlesBySimilarityList'));
        await loc(page, 'Item page: the similarity search link', page.locator('#articlesBySimilaritySearch a'));
        // page 2 through the list's own pagination link
        const next = page.locator('#articlesBySimilarityPages a').filter({hasText: /Next|next|›|»/}).first();
        if (await next.count()) {
            await next.click(); await idle(page);
            res.page2 = {url: page.url(), item: await readItem()};
            await snap('m-04-a1-similar-page2-visitor', {item: res.page2.item});
        }
        // the advanced similarity search link
        await page.goto(itemUrl(s.A1.id)); await idle(page);
        const link = page.locator('#articlesBySimilaritySearch a').first();
        if (await link.count()) {
            await link.click(); await idle(page);
            res.search = {url: page.url(), query: await page.locator('input[name="query"]').first().inputValue().catch(() => null),
                results: flat(await page.locator('.search_results, .cmp_article_list').first().innerText().catch(() => null), 800), heading: flat(await page.locator('h1').first().innerText().catch(() => null))};
            await snap('m-05-similarity-search-page-visitor', {search: res.search});
        }
        res.b = await openItem(s.B.id, 'm-06-b-no-keywords-visitor');
        res.n = await openItem(s.N.id, 'm-07-n-no-match-visitor');
        await as(J.u.rd);
        res.a1Reader = await openItem(s.A1.id, 'm-08-a1-similar-reader');
        await as(J.u.mgr);
        res.off = await plugin('rbs', false, 'm-09-rbs-disabled');
        await as(null);
        res.a1Off = await openItem(s.A1.id, 'm-10-a1-similar-off-visitor');
        fact('rbs', {tog: res.tog, before: res.before.item.similar, jobs: res.jobs, jobsErr: res.jobsErr, a1: res.a1.item.similar, a1MainOrder: (res.a1.item.main || []).map((m) => m.cls),
            page2: res.page2 && {url: res.page2.url, similar: res.page2.item.similar}, search: res.search, b: res.b.item.similar, n: res.n.item.similar,
            reader: res.a1Reader.item.similar && res.a1Reader.item.similar.items.length, a1Off: res.a1Off.item.similar, statuses: [res.before.status, res.a1.status, res.b.status, res.n.status, res.a1Off.status]});
    });

    // ================================================================== rba (Settings 8, Rule 20a, OJS4)
    if (on('rba')) await sect('rba', async () => {
        const res = {};
        await as(J.u.mgr);
        res.tog = await plugin('rba', true, 'a-01-rba-enabled');
        await as(null);
        res.a1 = await openItem(s.A1.id, 'a-02-a1-shared-author-visitor');
        res.a2 = await openItem(s.A2.id, 'a-03-a2-shared-author-visitor');
        res.b = await openItem(s.B.id, 'a-04-b-lone-author-visitor');
        res.s1 = await openItem(s.S1.id, 'a-05-s1-author-of-eleven-visitor');
        await as(J.u.rd);
        res.a1Reader = await openItem(s.A1.id, 'a-06-a1-shared-author-reader');
        await as(J.u.mgr);
        res.a1Mgr = await openItem(s.A1.id, 'a-07-a1-shared-author-manager');
        res.off = await plugin('rba', false, 'a-08-rba-disabled');
        await as(null);
        res.a1Off = await openItem(s.A1.id, 'a-09-a1-rba-off-visitor');
        const b = (x) => ({status: x.status, h1: x.item.h1, title: x.item.title, byAuthor: x.item.byAuthor, bodyStart: x.item.bodyStart && x.item.bodyStart.slice(0, 200)});
        fact('rba', {tog: res.tog, a1: b(res.a1), a2: b(res.a2), b: b(res.b), s1: b(res.s1), a1Reader: b(res.a1Reader), a1Mgr: b(res.a1Mgr), off: res.off, a1Off: b(res.a1Off)});
    });

    // ================================================================== roles (who reaches the plugin windows)
    if (on('roles')) await sect('roles', async () => {
        const res = {};
        for (const who of ['se', 'au1', 'rd']) {
            await as(J.u[who]);
            const t0 = Date.now();
            const r = await page.goto(app.url(`/index.php/${J.path}/en/management/settings/website`)).catch((e) => ({error: flat(e.message, 200)}));
            await idle(page);
            res[who] = {status: r && r.status ? r.status() : r, url: page.url(), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 200), plugins: await page.locator('#plugins-button').count(), navs: navs.filter((n) => n.at >= t0).map((n) => `${n.status} ${n.url}`).slice(0, 4)};
            await snap(`x-01-website-settings-${who}`, {res: res[who]});
        }
        await as(null);
        fact('roles', res);
    });

    // ================================================================== k1look (read only: K1's "everything" journal, plugins seeded on)
    if (on('k1look')) await sect('k1look', async () => {
        const k1 = path.join(REPO, '.reports/U13/ccK1/k1-state-ojs.json');
        if (!fs.existsSync(k1)) { fact('k1look', {missing: true}); return; }
        const K = JSON.parse(fs.readFileSync(k1, 'utf8')).K;
        if (!K) { fact('k1look', {noK: true}); return; }
        await signIn(page, K.u.mg, {contextPath: K.path}); await idle(page);
        await page.goto(app.url(`/index.php/${K.path}/en/management/settings/website`)); await idle(page);
        await page.locator('#plugins-button').first().click();
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T});
        await idle(page); await sleep(400);
        const rows = {};
        for (const k of ['pfl', 'rba', 'rbs']) {
            const r = row(PLUG[k]);
            rows[k] = {count: await r.count(), checked: await r.getByRole('checkbox').first().isChecked().catch(() => null)};
        }
        await snap('k-01-k1-journal-plugins', {rows});
        await as(null);
        fact('k1look', {path: K.path, rows});
    });

    await close();
});
