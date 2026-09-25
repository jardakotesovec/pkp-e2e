// U17 claim check, chunk K6: the OMP public series page for a series with every field set on screen.
// Spec: docs/specs/U17-sections.md — Rule 10 (259–263), Settings 15 (466–472), register summary row OMP9 (992),
// register OMP9 and OPS1's opening lines (1185–1200); footnotes m, td5, f-omp9, f-ops1.
//
//   PROBE_FEATURE=U17 PROBE_AGENT=ccK6 node bin/probe.js <omp|ops> shared/playwright/checks/U17/K6/k6.js
//   OMP phases, in order (one or a few per process; state in k6-state-<app>.json under the output folder, delete it
//   for a fresh seed): seed series books page wizard cat order uniq path td5 book again. OPS: seed ops1. OJS: nothing (the page is {OMP}).
// Scratch contexts (tag prefix u17k6):
//   OMP  A  category "K6 Cat"; users mg (manager), se (Series editor), au (author), rd (reader).
//           On screen as mg: series "K6 Series" (prefix "The", subtitle "K6 Subtitle", description "K6 series description",
//           PNG cover, Online ISSN 0378-5955, Print ISSN 2049-3630, "Order of monographs" "Title (A-Z)", "K6 Cat" ticked,
//           Sam Section assigned, path k6series), "K6 Plain" (title and path k6plain only).
//           Seeded into k6series, published: "Alpha K6 Book" (2025-01-10, position 2), "Mike K6 Book" (2023-01-10, 3),
//           "Zulu K6 Book" (2024-01-10, 1); a draft by au for the wizard's "Series" choice.
//   OPS  S  a server with nothing posted (the empty "Archives" page).
// publicknowledge is read only (its "Monographs" and "Textbooks" pages visited as a visitor).
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const PHASES = (process.env.PHASES || 'seed').split(',');
const on = (p) => PHASES.includes(p);
const T0 = Date.now();
const log = (...a) => console.log(`[k6 +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k6-state-${app.name}.json`);
const PNG = path.join(REPO, 'apps/omp/playwright/fixtures/files/profile-image-400.png');
const ORDERS = ['Title (A-Z)', 'Title (Z-A)', 'Publication date (oldest first)', 'Publication date (newest first)', 'Series position (lowest first)', 'Series position (highest first)'];
const BOOKS = [['Alpha', '2025-01-10', 2], ['Mike', '2023-01-10', 3], ['Zulu', '2024-01-10', 1]];

const GRID = (sel) => {
    const g = document.querySelector(sel);
    if (!g) return null;
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    return {
        th: [...g.querySelectorAll('thead th')].filter(vis).map((h) => t(h.innerText)),
        rows: [...g.querySelectorAll('tbody:not(.empty) tr.gridRow')].filter(vis).map((tr) => ({id: tr.id, cells: [...tr.querySelectorAll('td')].map((td) => {
            const b = td.querySelector('input[type=checkbox]');
            return b ? {text: t(td.innerText), box: b.checked} : t(td.innerText);
        })})),
        empty: [...g.querySelectorAll('tbody.empty')].filter(vis).map((b) => t(b.innerText)),
    };
};
const FORM = (sel) => {
    const f = document.querySelector(sel);
    if (!f) return null;
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const labelOf = (e) => {
        let l = e.id ? f.querySelector(`label[for="${CSS.escape(e.id)}"]`) : null;
        if (!l) l = e.closest('label');
        return l ? t(l.innerText) : null;
    };
    return {
        text: f.innerText,
        images: [...f.querySelectorAll('img')].map((i) => ({alt: i.alt, src: (i.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, ''), w: i.naturalWidth})),
        fields: [...f.querySelectorAll('input, select, textarea')].filter((e) => e.type !== 'hidden').map((e) => {
            const o = {tag: e.tagName.toLowerCase(), type: e.type, name: e.name, visible: vis(e), label: labelOf(e)};
            if (e.type === 'checkbox' || e.type === 'radio') o.checked = e.checked;
            else if (e.tagName === 'SELECT') { o.selected = e.options[e.selectedIndex] ? t(e.options[e.selectedIndex].text) : null; o.options = [...e.options].map((x) => t(x.text)); }
            else if (e.type !== 'file') o.value = (e.value || '').slice(0, 300);
            if (e.tagName === 'TEXTAREA' && window.tinymce && window.tinymce.get(e.id)) o.rich = t(window.tinymce.get(e.id).getContent()).slice(0, 300);
            return o;
        }),
        messages: [...f.querySelectorAll('label.error, .pkp_form_error')].filter(vis).map((e) => t(e.innerText).slice(0, 300)).filter(Boolean),
    };
};
// The public series page as data: every place a series field could show.
const SERIESPAGE = (want) => {
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const q = (s) => document.querySelector(s);
    const body = document.body.innerText;
    const html = document.documentElement.outerHTML;
    const img = q('.page_catalog_series .about_section img, .about_section .cover img');
    return {
        docTitle: document.title,
        pageClass: (q('.page') || {}).className || null,
        h1: q('.page h1, h1') ? {text: t(q('.page h1, h1').innerText), html: q('.page h1, h1').innerHTML.slice(0, 200)} : null,
        breadcrumb: [...document.querySelectorAll('.cmp_breadcrumbs li, nav.cmp_breadcrumbs li')].map((li) => t(li.innerText)),
        breadcrumbCurrent: q('.cmp_breadcrumbs .current') ? {text: t(q('.cmp_breadcrumbs .current').innerText), html: q('.cmp_breadcrumbs .current').innerHTML.slice(0, 200)} : null,
        count: q('.monograph_count') ? t(q('.monograph_count').innerText) : null,
        about: q('.about_section') ? {cls: q('.about_section').className, text: t(q('.about_section').innerText), html: q('.about_section').innerHTML.replace(/\s+/g, ' ').slice(0, 800)} : null,
        cover: q('.about_section .cover') ? {href: q('.about_section .cover').getAttribute('href'), isLink: q('.about_section .cover').tagName} : null,
        img: img ? {src: (img.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, ''), alt: img.getAttribute('alt'), complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
            box: [img.getBoundingClientRect().width, img.getBoundingClientRect().height].map(Math.round)} : null,
        description: q('.about_section .description') ? t(q('.about_section .description').innerText) : null,
        onlineISSN: q('.onlineISSN') ? t(q('.onlineISSN').innerText) : null,
        printISSN: q('.printISSN') ? t(q('.printISSN').innerText) : null,
        h2: [...document.querySelectorAll('.page h2')].map((h) => t(h.innerText)),
        books: [...document.querySelectorAll('.cmp_monographs_list .obj_monograph_summary .title, .obj_monograph_summary .title')].map((e) => t(e.innerText)),
        seriesPositions: [...document.querySelectorAll('.obj_monograph_summary .seriesPosition')].map((e) => t(e.innerText)),
        noTitles: [...document.querySelectorAll('.page p')].map((p) => t(p.innerText)).filter((x) => /No titles/.test(x)),
        pagination: q('.cmp_pagination') ? t(q('.cmp_pagination').innerText) : null,
        found: Object.fromEntries(Object.entries(want).map(([k, v]) => [k, {body: body.includes(v), html: html.includes(v), title: document.title.includes(v)}])),
        sidebar: q('.pkp_structure_sidebar') ? t(q('.pkp_structure_sidebar').innerText).slice(0, 600) : null,
    };
};

forEachApp(async (app) => {
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    if (!isOMP && !isOPS) { log(app.name, 'nothing to drive (the page is {OMP}; OPS1 on OPS)'); return; }
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k6-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 5000)); };
    const strip = (u) => (u || '').replace(app.baseURL, '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
    const LOG = path.join(REPO, 'apps', app.name, 'playwright', '.server-logs', `server-${app.port}-probe.log`);
    const logSize = () => { try { return fs.statSync(LOG).size; } catch (e) { return null; } };
    const logSince = (off) => {
        if (off == null) return {log: 'absent'};
        try {
            const fd = fs.openSync(LOG, 'r'); const n = fs.statSync(LOG).size - off; const b = Buffer.alloc(Math.max(0, n));
            fs.readSync(fd, b, 0, b.length, off); fs.closeSync(fd);
            return b.toString('utf8').split('\n').filter((l) => /Warning|Error|Fatal|Notice|Deprecated/i.test(l)).map((l) => flat(l, 260)).slice(0, 20);
        } catch (e) { return {err: String(e.message)}; }
    };

    // ------------------------------------------------------------------ seed
    if (on('seed')) {
        S.t = S.t || tag('u17k6');
        const t = S.t;
        const u = (p, k, roles, g, fam) => ({username: `${p}${k}`, roles, givenName: g, familyName: fam});
        const p = `${t}a`;
        if (!S.A || S.A.error) {
            try {
                if (isOMP) {
                    await app.api.createContext({tag: p, context: {name: `U17 K6 press ${t}`, acronym: 'KSIX'}, categories: [{path: 'k6cat', title: 'K6 Cat'}],
                        users: [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'se', ['sectionEditor'], 'Sam', 'Section'), u(p, 'au', ['author'], 'Amy', 'Author'), u(p, 'rd', ['reader'], 'Rae', 'Reader')]});
                } else {
                    await app.api.createContext({tag: p, context: {name: `U17 K6 server ${t}`, acronym: 'KSIX'}, users: [u(p, 'mg', ['manager'], 'Mia', 'Manager')]});
                }
                S.A = {path: p}; log('seed', p, 'ok');
            } catch (e) { S.A = {path: p, error: String(e.message).slice(0, 1200)}; log('seed FAILED', S.A.error); }
        }
        S.seeded = !S.A.error; save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run PHASES=seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const A = S.A.path;
    const au = (k) => `${A}${k}`;
    const seedSub = async (key, spec) => {
        if (S.subs && S.subs[key]) return;
        try {
            const r = await app.api.createSubmission({tag: `${S.t}${key}`.slice(0, 32), context: A, submitter: au('au'), ...spec});
            S.subs = S.subs || {}; S.subs[key] = r.submissionId; log('sub', key, r.submissionId);
        } catch (e) { S.subErr = S.subErr || {}; S.subErr[key] = String(e.message).slice(0, 900); log('sub FAILED', key, S.subErr[key]); }
        save();
    };
    if (on('books') && isOMP) {
        for (const [n, d, pos] of BOOKS) await seedSub(`b${n}`, {series: 'k6series', seriesPosition: String(pos), title: `${n} K6 Book`, published: true, datePublished: d, files: [{file: 'article.pdf'}]});
        await seedSub('dWiz', {title: 'K6 Wizard Draft', submitted: false, files: [{file: 'article.pdf'}]});
        fact('books', {subs: S.subs, subErr: S.subErr});
    }

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: strip(page.url())});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const dialogsSince = (s) => jsDialogs.filter((d) => d.at >= s);
    const consoleMsgs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({at: Date.now(), type: m.type(), t: flat(m.text(), 300)}); });
    page.on('pageerror', (e) => consoleMsgs.push({at: Date.now(), type: 'pageerror', t: flat(e.message, 300)}));
    const bad = [];
    const imgs = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (/catalog\/(thumbnail|fullSize)|\/public\/presses\/.*series/.test(u)) imgs.push({at: Date.now(), status: r.status(), url: strip(u).slice(0, 200), type: (r.headers()['content-type'] || '').slice(0, 40)});
        if (r.status() < 400) return;
        bad.push({at: Date.now(), status: r.status(), m: r.request().method(), url: strip(u).slice(0, 200)});
    });
    const since = (arr, s) => arr.filter((x) => x.at >= s);
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('.app__notifications .pkpNotification, [role="alert"], .pkp_notification, .ui-pnotify').forEach((e) => {
                const tx = (e.innerText || '').trim();
                if (tx && !seen.has(e)) { seen.add(e); window.__notices.push({t: tx.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (s) => [...new Set(await page.evaluate((x) => (window.__notices || []).filter((n) => n.at >= x).map((n) => n.t), s).catch(() => []))];

    async function snap(name, extra = {}, {png = false} = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(name, s);
        if (png) await shot(page, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name}`, {}, {png: true}).catch(() => {});
            return null;
        }
    }
    const as = async (user) => { await signIn(page, user, {contextPath: A}); await idle(page).catch(() => {}); };
    const visitor = async () => { await signOut(page).catch(() => {}); };
    const cu = (ctx, p) => app.url(`/index.php/${ctx}/en${p}`);
    const go = async (url) => {
        const r = await page.goto(url, {waitUntil: 'domcontentloaded'}).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        return r && r.status ? r.status() : r;
    };
    const GRIDSEL = '#seriesGridContainer';
    const FORMSEL = 'form#seriesForm';
    const grid = () => page.locator(GRIDSEL).first();
    const readGrid = async () => page.evaluate(GRID, GRIDSEL);
    const form = () => page.locator(FORMSEL).first();
    const readForm = async () => page.evaluate(FORM, FORMSEL);
    const top = () => page.locator('[role="dialog"]:visible').last();
    async function openTab() {
        const status = await go(cu(A, '/management/settings/context'));
        await page.getByRole('tab', {name: 'Series', exact: true}).first().click(); await idle(page);
        await grid().waitFor({timeout: T});
        await grid().locator('tr.gridRow, tbody.empty').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await sleep(400);
        return status;
    }
    const rowOf = (title) => grid().locator('tr.gridRow').filter({hasText: title}).first();
    async function openEdit(title) {
        const row = rowOf(title);
        const tog = row.locator('a.show_extras');
        if (await tog.count()) { await tog.first().click(); await sleep(400); }
        const id = await row.getAttribute('id');
        await page.locator(`tr#${id} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
        await form().locator('input[name="path"]').first().waitFor({timeout: T});
        await idle(page); await sleep(900);
    }
    async function openCreate() {
        await grid().getByRole('link', {name: /Add Series/}).first().click();
        await form().locator('input[name="path"]').first().waitFor({timeout: T});
        await idle(page); await sleep(900);
    }
    async function pressSave(label) {
        const t0 = Date.now(); const off = logSize();
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /update-?series/i.test(r.url()), {timeout: T}).catch(() => null);
        await form().getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        await sleep(1500); await idle(page).catch(() => {});
        const open = await form().isVisible().catch(() => false);
        const out = {label, post: r ? {status: r.status(), url: strip(r.url()).slice(0, 160)} : null, windowOpen: open,
            form: open ? await readForm() : null, notices: await noticesSince(t0), dialogs: dialogsSince(t0), failed: since(bad, t0), console: since(consoleMsgs, t0), serverLog: logSince(off)};
        await snap(label, {save: {post: out.post, windowOpen: open, notices: out.notices, dialogs: out.dialogs, failed: out.failed, serverLog: out.serverLog}});
        return out;
    }
    async function closeWindow() {
        const c = form().getByRole('link', {name: 'Cancel', exact: true}).first();
        if (await c.count()) await c.click().catch(() => {});
        await sleep(900);
    }
    async function waitRich(prefix) {
        const iframe = page.locator(`iframe[id^="${prefix}"]`).first();
        await iframe.waitFor({state: 'attached', timeout: T}).catch(() => {});
        const id = (await iframe.getAttribute('id').catch(() => '') || '').replace(/_ifr$/, '');
        if (id) await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
        return id;
    }
    async function typeRich(prefix, text) {
        const id = await waitRich(prefix);
        if (!id) return {typed: false};
        await page.frameLocator(`#${id}_ifr`).locator('body').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(text);
        await sleep(300);
        return {typed: true, id, content: await page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null)};
    }
    const WANT = {prefixTitle: 'The K6 Series', title: 'K6 Series', subtitle: 'K6 Subtitle', description: 'K6 series description', onlineIssn: '0378-5955', printIssn: '2049-3630'};
    async function readPage(label, p, {png = false, want = WANT} = {}) {
        const t0 = Date.now(); const off = logSize();
        const status = await go(cu(A, p));
        await sleep(600);
        const facts = await page.evaluate(SERIESPAGE, want);
        const o = {status, url: strip(page.url()), ...facts, images: since(imgs, t0), failed: since(bad, t0), console: since(consoleMsgs, t0), serverLog: logSince(off)};
        await snap(label, {facts: o}, {png});
        return o;
    }

    // ================================================================== series (OMP): both series made on screen as manager; read after save and after reload
    if (on('series') && isOMP) await sect('series', async () => {
        const out = {};
        await as(au('mg'));
        await openTab();
        out.grid0 = await readGrid();
        await snap('s-00-grid', {grid: out.grid0});
        if (!S.seriesMade) {
            await openCreate();
            out.create = await readForm();
            await snap('s-01-add-window', {form: out.create}, {png: true});
            await loc(page, 'Series window: Prefix input[name="prefix[en]"]', form().locator('input[name="prefix[en]"]'));
            await loc(page, 'Series window: Order of monographs select[name="sortOption"]', form().locator('select[name="sortOption"]'));
            await form().locator('input[name="prefix[en]"]').fill('The');
            await form().locator('input[name="title[en]"]').fill('K6 Series');
            await form().locator('input[name="subtitle[en]"]').fill('K6 Subtitle');
            const taId = await form().locator('textarea[name="description[en]"]').getAttribute('id');
            out.desc = await typeRich(taId, 'K6 series description');
            await form().locator('input[name="onlineIssn"]').fill('0378-5955');
            await form().locator('input[name="printIssn"]').fill('2049-3630');
            await form().locator('select[name="sortOption"]').selectOption({label: 'Title (A-Z)'});
            await form().getByRole('checkbox', {name: 'K6 Cat', exact: true}).first().check().catch((e) => { out.catErr = String(e.message).slice(0, 200); });
            await form().getByRole('checkbox', {name: /Sam Section/}).first().check().catch((e) => { out.seErr = String(e.message).slice(0, 200); });
            await form().locator('input[name="path"]').fill('k6series');
            const t0 = Date.now();
            await form().locator('input[type=file]').first().setInputFiles(PNG);
            await sleep(3000); await idle(page);
            out.upload = {failed: since(bad, t0), text: flat(await form().innerText(), 600)};
            out.filled = await readForm();
            await snap('s-02-filled', {form: out.filled}, {png: true});
            out.save1 = await pressSave('s-03-save-k6series');
            if (out.save1.windowOpen) await closeWindow();
            out.gridAfterSave = await readGrid();
            await snap('s-04-grid-after-save', {grid: out.gridAfterSave});
            await openCreate();
            await form().locator('input[name="title[en]"]').fill('K6 Plain');
            await form().locator('input[name="path"]').fill('k6plain');
            out.save2 = await pressSave('s-05-save-k6plain');
            if (out.save2.windowOpen) await closeWindow();
            S.seriesMade = true; save();
        }
        await page.reload(); await idle(page); await openTab();
        out.grid1 = await readGrid();
        await snap('s-06-grid-reloaded', {grid: out.grid1}, {png: true});
        await openEdit('K6 Series');
        out.reopened = await readForm();
        await snap('s-07-k6series-reopened', {form: out.reopened}, {png: true});
        // leave once with a change unsaved: the "×" Close
        const t1 = Date.now();
        await form().locator('input[name="subtitle[en]"]').fill('K6 Unsaved');
        await form().locator('input[name="subtitle[en]"]').blur();
        const x = top().getByRole('button', {name: /Close/}).first();
        out.closeCount = await x.count();
        if (out.closeCount) await x.click().catch(() => {});
        await sleep(1200);
        out.leave = {dialogs: dialogsSince(t1), windowOpen: await form().isVisible().catch(() => false)};
        await snap('s-08-left-unsaved', {leave: out.leave});
        await page.reload(); await idle(page); await openTab();
        await openEdit('K6 Series');
        out.afterLeave = (await readForm()).fields.filter((f) => /subtitle|prefix|title/.test(f.name)).map((f) => [f.name, f.value]);
        await snap('s-09-reopened-after-leave', {fields: out.afterLeave});
        await closeWindow();
        await visitor();
        fact('series', {grid0: out.grid0, save1: out.save1 && {post: out.save1.post, windowOpen: out.save1.windowOpen, notices: out.save1.notices, failed: out.save1.failed, serverLog: out.save1.serverLog},
            save2: out.save2 && {post: out.save2.post, windowOpen: out.save2.windowOpen, notices: out.save2.notices, serverLog: out.save2.serverLog}, upload: out.upload, desc: out.desc, catErr: out.catErr, seErr: out.seErr,
            gridAfterSave: out.gridAfterSave, grid1: out.grid1,
            reopened: out.reopened && {images: out.reopened.images, fields: out.reopened.fields.map((f) => [f.name, f.checked ?? f.selected ?? f.value ?? f.rich, f.rich].filter((v) => v !== undefined))},
            leave: out.leave, afterLeave: out.afterLeave});
    });

    // ================================================================== page (OMP): the series page as a visitor, a reader and the manager; the other routes to it
    if (on('page') && isOMP) await sect('page', async () => {
        const out = {};
        await visitor();
        out.visitor = await readPage('p-01-visitor-k6series', '/catalog/series/k6series', {png: true});
        await loc(page, 'Series page: heading .page_catalog_series h1', page.locator('.page_catalog_series h1'));
        await loc(page, 'Series page: breadcrumb current step .cmp_breadcrumbs .current', page.locator('.cmp_breadcrumbs .current'));
        await loc(page, 'Series page: count .monograph_count', page.locator('.monograph_count'));
        await loc(page, 'Series page: cover image .about_section .cover img', page.locator('.about_section .cover img'));
        await loc(page, 'Series page: description .about_section .description', page.locator('.about_section .description'));
        await loc(page, 'Series page: ISSN .onlineISSN / .printISSN', page.locator('.onlineISSN, .printISSN'));
        await loc(page, 'Series page: book titles .obj_monograph_summary .title', page.locator('.obj_monograph_summary .title'));
        out.visitorPlain = await readPage('p-02-visitor-k6plain', '/catalog/series/k6plain', {want: {title: 'K6 Plain'}});
        // the page's cover image read directly as the browser shows it (the img's own address)
        if (out.visitor.img && out.visitor.img.src) {
            const t0 = Date.now();
            const st = await go(app.url(out.visitor.img.src));
            out.thumbDirect = {status: st, url: strip(page.url()), images: since(imgs, t0)};
            await snap('p-03-cover-image-address', {facts: out.thumbDirect});
        }
        // the routes a visitor has to the page: the book page's series line, the catalog, the press home page
        const bid = S.subs && S.subs.bAlpha;
        if (bid) {
            await go(cu(A, `/catalog/book/${bid}`)); await sleep(500);
            out.book = await page.evaluate(() => {
                const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
                const links = [...document.querySelectorAll('a')].filter((a) => /catalog\/series/.test(a.href)).map((a) => ({text: t(a.innerText), href: a.getAttribute('href').replace(/^https?:\/\/[^/]+/, ''), parent: t(a.parentElement.innerText).slice(0, 200)}));
                const series = document.querySelector('.item.series');
                return {links, seriesItem: series ? t(series.innerText) : null, h1: t((document.querySelector('h1') || {}).innerText)};
            });
            await snap('p-04-book-page', {facts: out.book}, {png: true});
            const link = page.locator('.item.series a, a[href*="catalog/series"]').first();
            if (await link.count()) {
                await link.click(); await page.waitForLoadState('domcontentloaded'); await idle(page);
                out.fromBook = {url: strip(page.url()), facts: await page.evaluate(SERIESPAGE, WANT)};
                await snap('p-05-series-from-book-link', {facts: out.fromBook});
            }
        }
        for (const [k, p] of [['catalog', '/catalog'], ['home', '']]) {
            await go(cu(A, p)); await sleep(400);
            out[k] = await page.evaluate(() => {
                const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
                return {links: [...document.querySelectorAll('a')].filter((a) => /catalog\/series/.test(a.href)).map((a) => ({text: t(a.innerText), href: a.getAttribute('href').replace(/^https?:\/\/[^/]+/, '')})),
                    sidebar: document.querySelector('.pkp_structure_sidebar') ? t(document.querySelector('.pkp_structure_sidebar').innerText).slice(0, 400) : null,
                    nav: [...document.querySelectorAll('.pkp_navigation_primary a')].map((a) => t(a.innerText))};
            });
            await snap(`p-06-${k}`, {facts: out[k]});
        }
        // the same page signed in: a reader, the manager
        for (const k of ['rd', 'mg']) {
            await as(au(k));
            out[k] = await readPage(`p-07-${k}-k6series`, '/catalog/series/k6series', {png: k === 'mg'});
        }
        await visitor();
        // publicknowledge (read only): the seeded series
        for (const [k, p] of [['pkMono', 'monographs'], ['pkText', 'textbooks']]) {
            const t0 = Date.now(); const off = logSize();
            const st = await go(app.url(`/index.php/publicknowledge/en/catalog/series/${p}`)); await sleep(500);
            out[k] = {status: st, ...(await page.evaluate(SERIESPAGE, {title: k === 'pkMono' ? 'Monographs' : 'Textbooks'})), failed: since(bad, t0), serverLog: logSince(off)};
            await snap(`p-08-${k}`, {facts: out[k]}, {png: k === 'pkMono'});
        }
        const pick = (o) => o && {status: o.status, url: o.url, docTitle: o.docTitle, h1: o.h1, breadcrumb: o.breadcrumb, breadcrumbCurrent: o.breadcrumbCurrent, count: o.count, about: o.about, cover: o.cover, img: o.img,
            description: o.description, onlineISSN: o.onlineISSN, printISSN: o.printISSN, h2: o.h2, books: o.books, seriesPositions: o.seriesPositions, noTitles: o.noTitles, found: o.found, images: o.images, failed: o.failed, console: o.console, serverLog: o.serverLog};
        fact('page', {visitor: pick(out.visitor), visitorPlain: pick(out.visitorPlain), thumbDirect: out.thumbDirect, book: out.book, fromBook: out.fromBook && {url: out.fromBook.url, h1: out.fromBook.facts.h1, count: out.fromBook.facts.count},
            catalog: out.catalog, home: out.home, rd: pick(out.rd), mg: pick(out.mg), pkMono: pick(out.pkMono), pkText: pick(out.pkText)});
    });

    // ================================================================== wizard (OMP): the series' name in the author's "Series" choice (prefix and subtitle)
    if (on('wizard') && isOMP) await sect('wizard', async () => {
        const out = {};
        await as(au('au'));
        const sid = S.subs && S.subs.dWiz;
        await go(cu(A, `/submission?id=${sid}`));
        await page.locator('.pkpSteps, h1').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(900);
        for (let i = 0; i < 6; i++) {
            const h = flat(await page.locator('h1').first().innerText().catch(() => ''), 80);
            if (/For the Editors/.test(h) || (await page.locator('input[type=radio][name*="series" i]').count())) break;
            const c = page.getByRole('button', {name: 'Continue', exact: true}).first();
            if (!(await c.count())) break;
            await c.click().catch(() => {}); await sleep(1500); await idle(page);
        }
        out.heading = flat(await page.locator('h1').first().innerText().catch(() => ''), 80);
        out.radios = await page.locator('input[type=radio]').evaluateAll((els) => els.map((e) => ({name: e.name, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim(), checked: e.checked})));
        out.selects = await page.locator('select').evaluateAll((els) => els.map((e) => ({name: e.name, options: [...e.options].map((o) => o.text.trim())})));
        await snap('w-01-wizard-series', {facts: out}, {png: true});
        await visitor();
        fact('wizard', out);
    });

    // ================================================================== cat (OMP, line 472): the category ticked on the series, after the background jobs
    if (on('cat') && isOMP) await sect('cat', async () => {
        const out = {};
        const {runJobs} = require('../../../support/jobs');
        process.env.PKP_CONFIG_FILE = app.configFile || path.join(app.root, 'config.test.inc.php');
        if (!process.env.TEST_API_KEY) {
            const envFile = path.join(REPO, app.root || `checkouts/${app.name}`, '.env.playwright');
            const m = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').match(/^TEST_API_KEY=(.*)$/m) : null;
            process.env.TEST_API_KEY = app.testApiKey || (m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '');
        }
        const keep = process.env.PLAYWRIGHT_BASE_PORT;
        process.env.PLAYWRIGHT_BASE_PORT = String(app.port);
        try { out.drain = runJobs({appRoot: app.root}).split('\n').filter((l) => l.trim()).slice(-4).join(' | '); } catch (e) { out.drain = `error: ${String(e.message).slice(0, 300)}`; } finally { process.env.PLAYWRIGHT_BASE_PORT = keep; }
        await visitor();
        await go(cu(A, '/catalog/category/k6cat')); await sleep(500);
        out.category = await page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            return {h1: t((document.querySelector('h1') || {}).innerText), count: t((document.querySelector('.monograph_count') || {}).innerText),
                books: [...document.querySelectorAll('.obj_monograph_summary .title')].map((e) => t(e.innerText)), text: t((document.querySelector('.page') || document.body).innerText).slice(0, 400)};
        });
        await snap('c-01-category-k6cat', {facts: out.category}, {png: true});
        await go(cu(A, '/catalog')); await sleep(400);
        out.catalogBooks = await page.locator('.obj_monograph_summary .title').allInnerTexts().catch(() => []);
        await snap('c-02-catalog', {facts: {books: out.catalogBooks}});
        fact('cat', out);
    });

    // ================================================================== order (OMP): each "Order of monographs" saved, then the page's book order as a visitor
    if (on('order') && isOMP) await sect('order', async () => {
        const out = [];
        for (const label of (process.env.ORDERS ? process.env.ORDERS.split('|') : ORDERS)) {
            await as(au('mg'));
            await openTab();
            await openEdit('K6 Series');
            await form().locator('select[name="sortOption"]').selectOption({label});
            const r = await pressSave(`o-save-${ORDERS.indexOf(label)}`);
            if (r.windowOpen) await closeWindow();
            await page.reload(); await idle(page); await openTab(); await openEdit('K6 Series');
            const kept = (await readForm()).fields.find((f) => f.name === 'sortOption');
            await closeWindow();
            await visitor();
            const p = await readPage(`o-page-${ORDERS.indexOf(label)}`, '/catalog/series/k6series');
            out.push({order: label, post: r.post, notices: r.notices, reopened: kept && kept.selected, books: p.books, positions: p.seriesPositions});
        }
        fact('order', out);
    });

    // ================================================================== uniq (OMP, f-omp9): the series window's path check and the server log
    if (on('uniq') && isOMP) await sect('uniq', async () => {
        const out = {};
        await as(au('mg'));
        await openTab();
        await openEdit('K6 Plain');
        out.unchanged = await pressSave('u-01-save-unchanged-path');
        if (out.unchanged.windowOpen) await closeWindow();
        await openTab(); await openEdit('K6 Plain');
        await form().locator('input[name="path"]').fill('k6series');
        out.taken = await pressSave('u-02-save-taken-path');
        if (out.taken.windowOpen) await closeWindow();
        await openTab(); await openEdit('K6 Plain');
        await form().locator('input[name="path"]').fill('k6plainnew');
        out.fresh = await pressSave('u-03-save-new-path');
        if (out.fresh.windowOpen) await closeWindow();
        await visitor();
        const pick = (o) => ({post: o.post, windowOpen: o.windowOpen, notices: o.notices, messages: o.form && o.form.messages, serverLog: o.serverLog, failed: o.failed});
        fact('uniq', {unchanged: pick(out.unchanged), taken: pick(out.taken), fresh: pick(out.fresh)});
    });

    // ================================================================== path (OMP): the series moved to a new path; the old and new addresses as a visitor
    if (on('path') && isOMP) await sect('path', async () => {
        const out = {};
        await as(au('mg'));
        await openTab(); await openEdit('K6 Series');
        out.help = flat(await form().locator('input[name="path"]').locator('xpath=ancestor::*[contains(@class,"section")][1]').innerText().catch(() => null), 300);
        await form().locator('input[name="path"]').fill('k6moved');
        out.save = await pressSave('m-01-save-moved-path');
        if (out.save.windowOpen) await closeWindow();
        await visitor();
        out.old = await readPage('m-02-old-address', '/catalog/series/k6series');
        out.new = await readPage('m-03-new-address', '/catalog/series/k6moved', {png: true});
        const bid = S.subs && S.subs.bAlpha;
        if (bid) {
            await go(cu(A, `/catalog/book/${bid}`));
            out.bookLink = await page.locator('a[href*="catalog/series"]').evaluateAll((as2) => as2.map((a) => a.getAttribute('href').replace(/^https?:\/\/[^/]+/, '')));
            await snap('m-04-book-after-move', {facts: {links: out.bookLink}});
        }
        fact('path', {help: out.help, save: {post: out.save.post, notices: out.save.notices, serverLog: out.save.serverLog}, old: {status: out.old.status, url: out.old.url, h1: out.old.h1},
            new: {status: out.new.status, url: out.new.url, count: out.new.count, books: out.new.books, h1: out.new.h1}, bookLink: out.bookLink});
    });

    // ================================================================== td5 (OMP, footnote td5): the cover uploader's accepted files, an SVG, a PNG and its "Delete", on "K6 Plain"
    if (on('td5') && isOMP) await sect('td5', async () => {
        const out = {};
        const SVG = path.join(REPO, 'apps/ojs/playwright/fixtures/files/cover.svg');
        const coverOf = async () => (await readForm()).images;
        await as(au('mg'));
        await openTab(); await openEdit('K6 Plain');
        out.accept = await form().locator('input[type=file]').first().getAttribute('accept').catch(() => null);
        out.before = await coverOf();
        let t0 = Date.now();
        await form().locator('input[type=file]').first().setInputFiles(SVG);
        await sleep(3000); await idle(page);
        out.svgUpload = {text: flat(await form().innerText(), 200), failed: since(bad, t0)};
        const wsv = page.waitForResponse((r) => r.request().method() === 'POST' && /update-?series/i.test(r.url()), {timeout: T}).catch(() => null);
        out.svgSave = await pressSave('t-01-save-svg');
        const rs = await wsv; out.svgBody = rs ? flat(await rs.text().catch(() => null), 200) : null;
        if (out.svgSave.windowOpen) await closeWindow();
        await page.reload(); await idle(page); await openTab(); await openEdit('K6 Plain');
        out.afterSvg = await coverOf();
        await snap('t-02-reopened-after-svg', {images: out.afterSvg});
        t0 = Date.now();
        await form().locator('input[type=file]').first().setInputFiles(PNG);
        await sleep(3000); await idle(page);
        out.pngSave = await pressSave('t-03-save-png');
        if (out.pngSave.windowOpen) await closeWindow();
        await page.reload(); await idle(page); await openTab(); await openEdit('K6 Plain');
        out.afterPng = await coverOf();
        await snap('t-04-reopened-with-png', {images: out.afterPng}, {png: true});
        const del = form().getByRole('link', {name: 'Delete', exact: true}).first();
        out.deleteLink = await del.count();
        if (out.deleteLink) {
            t0 = Date.now();
            await del.click(); await sleep(1200);
            out.ask = {heading: flat(await page.locator('[role="dialog"]:visible').last().getByRole('heading').first().innerText().catch(() => null), 80),
                text: flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), 300), dialogs: dialogsSince(t0)};
            await snap('t-05-delete-ask', {ask: out.ask});
            await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK', exact: true}).click().catch((e) => { out.okErr = String(e.message).slice(0, 200); });
            await sleep(1500); await idle(page);
            out.afterOk = {windowOpen: await form().isVisible().catch(() => false), images: await coverOf().catch(() => null), notices: await noticesSince(t0), failed: since(bad, t0)};
            await snap('t-06-after-ok', {res: out.afterOk});
            if (out.afterOk.windowOpen) await closeWindow();
            await page.reload(); await idle(page); await openTab(); await openEdit('K6 Plain');
            out.afterReload = await coverOf();
            await snap('t-07-reopened-after-delete', {images: out.afterReload});
            await closeWindow();
        }
        await visitor();
        fact('td5', {accept: out.accept, before: out.before, svgUpload: out.svgUpload, svgSave: {post: out.svgSave.post, windowOpen: out.svgSave.windowOpen, notices: out.svgSave.notices, messages: out.svgSave.form && out.svgSave.form.messages},
            svgBody: out.svgBody, afterSvg: out.afterSvg, pngSave: {post: out.pngSave.post, notices: out.pngSave.notices}, afterPng: out.afterPng, deleteLink: out.deleteLink, ask: out.ask, okErr: out.okErr, afterOk: out.afterOk, afterReload: out.afterReload});
    });

    // ================================================================== book (OMP): each book page's "Series" line as a visitor (the series' name, ISSNs, description)
    if (on('book') && isOMP) await sect('book', async () => {
        const out = {};
        await visitor();
        for (const k of ['bAlpha', 'bMike', 'bZulu']) {
            await go(cu(A, `/catalog/book/${S.subs[k]}`)); await sleep(400);
            out[k] = await page.evaluate((w) => {
                const t = (x) => (x || '').replace(/\s+/g, ' ').trim();
                const it = document.querySelector('.item.series');
                return {series: it ? t(it.innerText) : null, html: it ? it.innerHTML.replace(/\s+/g, ' ').slice(0, 600) : null, descriptionAnywhere: document.body.innerText.includes(w)};
            }, 'K6 series description');
            await snap(`b-${k}`, {facts: out[k]}, {png: k === 'bMike'});
        }
        await loc(page, 'Book page: series line .item.series', page.locator('.item.series'));
        fact('book', out);
    });

    // ================================================================== again (OMP): second-run reads of the path facts (old address; a re-save with the series' own path)
    if (on('again') && isOMP) await sect('again', async () => {
        const out = {};
        await visitor();
        const st = await go(cu(A, '/catalog/series/k6series'));
        out.old = {status: st, url: strip(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 80), notices: flat(await page.locator('.pkp_notification, .cmp_notification').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 200)};
        await snap('r-01-old-address-again', {facts: out.old});
        await as(au('mg'));
        await openTab(); await openEdit('K6 Series');
        const r = await pressSave('r-02-resave-own-path');
        out.resave = {post: r.post, notices: r.notices, serverLog: r.serverLog};
        if (r.windowOpen) await closeWindow();
        await visitor();
        fact('again', out);
    });

    // ================================================================== ops1 (OPS): the empty "Archives" page and an empty section page, as a visitor
    if (on('ops1') && isOPS) await sect('ops1', async () => {
        const out = {};
        await visitor();
        for (const [k, p] of [['archives', '/preprints'], ['section', '/preprints/section/preprints']]) {
            const t0 = Date.now();
            const st = await go(cu(A, p)); await sleep(500);
            out[k] = {status: st, url: strip(page.url()), ...(await page.evaluate(() => {
                const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
                const pg = document.querySelector('.page') || document.body;
                const hdr = document.querySelector('.archiveHeader');
                const after = [];
                if (hdr) { let n = hdr.nextElementSibling; while (n) { after.push({tag: n.tagName, cls: n.className, text: t(n.innerText).slice(0, 200), children: n.children.length}); n = n.nextElementSibling; } }
                return {h1: t((document.querySelector('h1') || {}).innerText), pageText: t(pg.innerText).slice(0, 600), afterHeader: after,
                    items: document.querySelectorAll('.cmp_preprint_list > li').length, empty: [...document.querySelectorAll('.section_empty, p')].map((e) => t(e.innerText)).filter((x) => /Nothing|No /.test(x))};
            })), failed: since(bad, t0), console: since(consoleMsgs, t0)};
            await snap(`a-0${k === 'archives' ? 1 : 2}-${k}`, {facts: out[k]}, {png: true});
        }
        // publicknowledge (read only): the seeded server's "Archives" (f-ops1: not empty once suites have posted)
        await go(app.url('/index.php/publicknowledge/en/preprints')); await sleep(400);
        out.pk = {items: await page.locator('.cmp_preprint_list > li').count(), titles: (await page.locator('.cmp_preprint_list > li .title').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)).slice(0, 5)};
        await snap('a-03-publicknowledge-archives', {facts: out.pk});
        fact('ops1', out);
    });

    await close();
});
