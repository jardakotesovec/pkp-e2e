// U47 claim check, chunk K2: linking, details, and what readers see.
// Spec: docs/specs/U47-media-files.md — the "Edit Metadata", "Manually Link Media" and "Batch Link Media"
// windows (93–127), Rules 3–4 (184–230), Side effects (266–298), Settings bullet 6 (340–344), register OPS1
// (461–477); footnotes f, g, h, i, m, n, o, q9–q11, q13, q18–q22, q26, q27, f-ops1.
//
//   PROBE_FEATURE=U47 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U47/K2/k2.js
//   PHASES=seed,meta,supp,manual,batch,copy,log,reader   (default: all; later phases read k2-state-<app>.json)
//   A full run outlasts the Bash cap: run it detached per app (nohup … &) and poll the pid.
//
// Per app, two scratch contexts:
//   C   defaults. Users mg (manager), au (author), rd (reader); OJS: one published issue Vol. 1 No. 1 (2026).
//       sM  metadata lab: an Image, a Multimedia (not on a press), an HTML Stylesheet, a linked Image pair
//       sL  manual-link lab: web A, C; high B, D; one Multimedia (a press: HTML Stylesheet)
//       sB  batch lab: web A2, C2; high B2, D2; one Multimedia web file (a press: HTML Stylesheet)
//       sE  no web-resolution image: one high-resolution Image and one Multimedia / HTML Stylesheet
//       sC1, sC2, sC3  copy-on-link labs (Rule 3c): a web and a high-resolution Image each
//       sA  Activity Log lab: one high-resolution Image; a web Image is added on screen
//       readers: OJS R1 (published, HTML galley, web figure.png paired with a high-res file also named
//       figure.png, an HTML Stylesheet named article.css), R2 (published, only a high-res figure.png),
//       R3 (production, HTML galley + web figure.png; a dependent figure.png added on screen, then published
//       on screen). OMP P (production, web figure.png; an HTML publication format built on screen, then
//       published). OPS R (posted, HTML galley preprint.html, web figure.png).
//   C2  "Multimedia" (a press: "HTML Stylesheet") with "File Metadata" = "Supplementary Content" (q26).
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'meta', 'supp', 'manual', 'batch', 'copy', 'log', 'reader'];
// PHASES=recheck repeats the reader reads that do not build anything: OJS the plugin off/on reads, OPS the galley link.
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const fx = (app, f) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${f}`);
const vis = '[role="dialog"]:visible';

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const MM = isOMP ? 'HTML Stylesheet' : 'Multimedia';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k2-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u47k2');
        S.t = t;
        const users = (p) => [
            {username: `${p}mg`, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'},
            {username: `${p}au`, roles: ['author'], givenName: 'Ari', familyName: 'Author'},
            {username: `${p}rd`, roles: ['reader'], givenName: 'Rey', familyName: 'Reader'},
        ];
        const ctx = (p, name) => ({name: `U47 K2 ${name} ${p}`, acronym: 'KTWO', contactName: 'K2 Contact', contactEmail: `${p}c@mail.test`});
        const p1 = `${t}a`;
        const c1 = {tag: p1, context: ctx(p1, 'defaults'), users: users(p1)};
        if (isOJS) c1.issues = [{volume: 1, number: 1, year: 2026, published: true}];
        const r1 = await app.api.createContext(c1);
        S.C = {path: r1.path || p1, u: {mg: `${p1}mg`, au: `${p1}au`, rd: `${p1}rd`}};
        const p2 = `${t}b`;
        const r2 = await app.api.createContext({tag: p2, context: ctx(p2, 'supplementary'), users: users(p2), components: {[MM]: {metadata: 'supplementary'}}});
        S.C2 = {path: r2.path || p2, u: {mg: `${p2}mg`, au: `${p2}au`, rd: `${p2}rd`}};
        save();
        const sub = async (C, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: C.path, submitter: C.u.au, title: `K2 ${k} ${t}`, ...spec});
                log('seed', k, r.submissionId, r.publicationId, JSON.stringify(r.mediaFiles || []).slice(0, 300));
                return {id: r.submissionId, pub: r.publicationId, galleys: r.galleys, media: r.mediaFiles};
            } catch (e) { log('seed FAILED', k, String(e.message).slice(0, 600)); return {error: String(e.message).slice(0, 600)}; }
        };
        const img = (name, extra = {}) => ({file: 'figure.png', name, ...extra});
        const hi = (name, extra = {}) => ({file: 'profile-image-400.png', resolution: 'high_resolution', name, ...extra});
        const txt = (name, genre) => ({file: 'not-an-image.txt', genre, name});
        S.s = {};
        const mm = isOMP ? [] : [txt('mm.txt', 'Multimedia')];
        S.s.M = await sub(S.C, 'sm', {mediaFiles: [img('img-m.png'), ...mm, txt('style.css', 'HTML Stylesheet'), img('pair-web.png', {pair: 'P'}), hi('pair-high.png', {pair: 'P'})]});
        S.s.L = await sub(S.C, 'sl', {mediaFiles: [img('A-web.png'), img('C-web.png'), hi('B-high.png'), hi('D-high.png'), txt(isOMP ? 'M-css.css' : 'M-mm.txt', MM)]});
        S.s.B = await sub(S.C, 'sb', {mediaFiles: [img('A2-web.png'), img('C2-web.png'), hi('B2-high.png'), hi('D2-high.png'), txt(isOMP ? 'M2-css.css' : 'M2-mm.txt', MM)]});
        S.s.E = await sub(S.C, 'se', {mediaFiles: [hi('E-high.png'), txt(isOMP ? 'E-css.css' : 'E-mm.txt', MM)]});
        S.s.C1 = await sub(S.C, 'sc1', {mediaFiles: [img('A3-web.png'), hi('B3-high.png')]});
        S.s.C2 = await sub(S.C, 'sc2', {mediaFiles: [img('A4-web.png'), hi('B4-high.png')]});
        S.s.C3 = await sub(S.C, 'sc3', {mediaFiles: [img('A5-web.png'), hi('B5-high.png')]});
        S.s.A = await sub(S.C, 'sa', {mediaFiles: [hi('H-high.png')]});
        S.s.Q = await sub(S.C2, 'sq', {mediaFiles: [txt('q.txt', MM), img('qi.png')]});
        const prod = isOPS ? {} : {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']};
        if (isOJS) {
            const pubIssue = {published: true, issue: {volume: 1, number: 1, year: 2026}};
            const g = [{label: 'HTML', file: 'article.html'}];
            S.s.R1 = await sub(S.C, 'r1', {...prod, galleys: g, ...pubIssue, mediaFiles: [
                {file: 'figure.png', pair: 'A'}, hi('figure.png', {pair: 'A'}), txt('article.css', 'HTML Stylesheet')]});
            S.s.R2 = await sub(S.C, 'r2', {...prod, galleys: g, ...pubIssue, mediaFiles: [hi('figure.png')]});
            S.s.R3 = await sub(S.C, 'r3', {...prod, galleys: g, mediaFiles: [{file: 'figure.png'}]});
        }
        if (isOMP) S.s.P = await sub(S.C, 'p', {...prod, mediaFiles: [{file: 'figure.png'}]});
        if (isOPS) S.s.R = await sub(S.C, 'r', {galleys: [{label: 'HTML', file: 'preprint.html'}], published: true, mediaFiles: [{file: 'figure.png'}]});
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const reqs = [];
    page.on('request', (r) => {
        if (r.method() !== 'GET' && /\/api\/v1\//.test(r.url())) {
            const h = r.headers()['x-http-method-override'];
            reqs.push({at: Date.now(), method: h || r.method(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 200), body: (r.postData() || '').slice(0, 600)});
        }
    });
    const resps = [];
    page.on('response', (r) => { if (r.request().method() !== 'GET' && /\/api\/v1\//.test(r.url())) resps.push({at: Date.now(), status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 200)}); });
    const since = (t0) => ({reqs: reqs.filter((x) => x.at >= t0).map(({at, ...x}) => x), resps: resps.filter((x) => x.at >= t0).map(({at, ...x}) => x)});
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300)});
        d.accept().catch(() => {});
    });

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
    let who = null;
    const as = async (user, ctx) => { if (who === `${user}@${ctx}`) return; await signIn(page, user, {contextPath: ctx}); await idle(page); who = `${user}@${ctx}`; };
    const top = () => page.locator(vis).last();
    const cUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (ctx, sid, key) => cUrl(ctx, `/dashboard/editorial?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
    const mediaTable = () => page.locator('table').filter({has: page.locator('th', {hasText: 'Date uploaded'})}).first();

    async function openMedia(C, sub, name) {
        await page.goto(wfUrl(C.path, sub.id, `publication_${sub.pub}_media`));
        await idle(page);
        await mediaTable().waitFor({timeout: T});
        await page.waitForFunction(() => ![...document.querySelectorAll('h3')].some((h) => /Media Files/.test(h.innerText) && h.querySelector('.pkpSpinner, [class*="pinner"]')), null, {timeout: 15000}).catch(() => {});
        await idle(page); await sleep(300);
        const rows = await mediaRows();
        if (name) await snap(name, {media: rows});
        return rows;
    }
    // The "Media Files" table as data: per row its cells (the shared ID cell once per group), badges, menu button.
    async function mediaRows() {
        return page.evaluate(() => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const table = [...document.querySelectorAll('table')].find((t) => [...t.querySelectorAll('th')].some((th) => /date uploaded/i.test(th.innerText)));
            if (!table) return {present: false};
            const head = [...table.querySelectorAll('thead th')].map((th) => f(th.innerText));
            const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
                const cells = [...tr.querySelectorAll('td, th')];
                const idCell = cells.find((c) => c.hasAttribute('rowspan') && c.querySelector('svg, [class*="con"]'));
                return {
                    cells: cells.map((c) => f(c.innerText)),
                    idCell: idCell ? {text: f(idCell.innerText), rowspan: idCell.getAttribute('rowspan')} : null,
                    name: f(tr.querySelector('a')?.innerText || ''),
                    href: tr.querySelector('a')?.getAttribute('href') || null,
                    badges: [...tr.querySelectorAll('[class*="adge"]')].map((b) => f(b.innerText)).filter(Boolean),
                    menu: [...tr.querySelectorAll('button')].map((b) => f(b.getAttribute('aria-label') || b.innerText)).filter(Boolean),
                };
            });
            return {present: true, head, rows, text: f(table.innerText).slice(0, 1500)};
        }).catch((e) => ({error: String(e.message)}));
    }
    const rowOf = (name, {high} = {}) => {
        let r = mediaTable().locator('tbody tr').filter({has: page.locator('a', {hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)})});
        if (high === true) r = r.filter({hasText: 'High resolution'});
        if (high === false) r = r.filter({hasNotText: 'High resolution'});
        return r.first();
    };
    async function rowMenu(name, press, opts) {
        const row = rowOf(name, opts);
        await row.waitFor({timeout: 20000});
        const btn = row.getByRole('button', {name: /More Actions/}).first();
        if (!(await btn.count())) return {items: [], noButton: true};
        await btn.click(); await sleep(300);
        const items = await page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
        if (press) {
            const it = page.getByRole('menuitem', {name: press, exact: true}).first();
            if (!(await it.count())) { await btn.click().catch(() => {}); await sleep(200); return {items, noItem: true}; }
            await it.click();
            await idle(page);
        } else { await btn.click().catch(() => {}); await sleep(200); }
        return {items};
    }
    // The top window (a Vue side modal) as data.
    async function winInfo() {
        return top().evaluate((d) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const headings = [...d.querySelectorAll('h1,h2')].filter(v).map((h) => f(h.innerText)).filter(Boolean);
            const fields = [...d.querySelectorAll('.pkpFormField')].filter(v).map((ff) => ({
                label: f(ff.querySelector('.pkpFormFieldLabel, label, legend')?.innerText),
                help: f(ff.querySelector('.pkpFormField__description, [class*="description"]')?.innerText) || null,
                inputs: [...ff.querySelectorAll('input:not([type=hidden]), textarea, select')].map((e) => ({
                    tag: e.tagName.toLowerCase(), type: e.type, value: e.value, disabled: e.disabled, readOnly: e.readOnly,
                    options: e.tagName === 'SELECT' ? [...e.options].map((o) => `${o.text.trim()}${o.selected ? '*' : ''}`) : undefined})),
                error: f([...ff.querySelectorAll('.pkpFormFieldError, [class*="rror"]')].filter(v).map((x) => x.innerText).join(' ')) || null,
            }));
            const tables = [...d.querySelectorAll('table')].filter(v).map((t) => ({
                label: t.getAttribute('aria-label'),
                head: [...t.querySelectorAll('thead th')].map((th) => f(th.innerText)),
                rows: [...t.querySelectorAll('tbody tr')].map((tr) => ({
                    cells: [...tr.querySelectorAll('td, th')].map((c) => f(c.innerText)),
                    selects: [...tr.querySelectorAll('select')].map((s) => ({aria: s.getAttribute('aria-label'), value: s.value, options: [...s.options].map((o) => `${o.text.trim()}${o.selected ? '*' : ''}`)})),
                })),
            }));
            const buttons = [...d.querySelectorAll('button')].filter(v).map((b) => ({text: f(b.innerText || b.getAttribute('aria-label')), disabled: b.disabled, cls: (b.className || '').toString().slice(0, 160)})).filter((b) => b.text);
            return {headings, fields, tables, buttons, text: f(d.innerText).slice(0, 3000)};
        }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    }
    async function winSnap(name, extra = {}) {
        await idle(page); await sleep(400);
        const w = await winInfo();
        await snap(name, {win: w, ...extra});
        log(`[${name}]`, JSON.stringify({h: w.headings, fields: (w.fields || []).map((x) => `${x.label}=${(x.inputs || []).map((i) => (i.options ? `[${i.options.join('|')}]` : JSON.stringify(i.value)) + (i.disabled ? '(dis)' : '')).join(',')}${x.error ? ` ERR ${x.error}` : ''}`), tables: w.tables, buttons: (w.buttons || []).map((b) => b.text + (b.disabled ? '(dis)' : ''))}).slice(0, 1800));
        return w;
    }
    const windowTitle = async () => top().locator('h1, h2').first().innerText().catch(() => null);
    async function waitWindow(title) {
        await page.locator(vis).filter({has: page.locator('h1, h2', {hasText: title})}).last().waitFor({timeout: T});
        await idle(page); await sleep(500);
    }
    // After a window's own submit or close: wait until no window with that title is visible.
    async function waitClosed(title, ms = 15000) {
        const until = Date.now() + ms;
        while (Date.now() < until) {
            const open = await page.locator(vis).filter({has: page.locator('h1, h2', {hasText: title})}).count();
            if (!open) { await sleep(700); await idle(page); return true; }
            await sleep(200);
        }
        return false;
    }
    const field = (label) => top().locator('.pkpFormField').filter({has: page.locator('.pkpFormFieldLabel, label, legend', {hasText: label})}).first();
    async function fill(label, value) {
        const box = field(label).locator('input:not([type=hidden]), textarea').first();
        await box.fill(value);
        await box.blur().catch(() => {});
    }
    async function pressIn(name) { await top().getByRole('button', {name, exact: true}).last().click(); }
    // Leave the top window with its header "Close" and record the dialog; answer it with `answer` (Yes/No).
    async function closeWithChange(name, answer) {
        const t0 = Date.now();
        await top().getByRole('button', {name: /^Close/}).first().click();
        await sleep(700);
        const d = page.locator(vis).filter({hasText: 'The data on this form has changed'}).last();
        const shown = await d.isVisible().catch(() => false);
        const out = {dialogShown: shown};
        if (shown) {
            const s = await snap(name);
            out.dialogText = flat(s.text && s.text.dialog, 400);
            out.buttons = await d.getByRole('button').allInnerTexts().catch(() => []);
            if (answer) { await d.getByRole('button', {name: answer, exact: true}).click(); await sleep(800); await idle(page); }
        } else await snap(name);
        out.traffic = since(t0);
        return out;
    }

    // ---- Activity Log and "More Information"
    async function activityLog(C, sub, name) {
        await page.goto(wfUrl(C.path, sub.id)); await idle(page);
        const btn = page.getByRole('button', {name: 'Activity Log', exact: true}).first();
        await btn.waitFor({timeout: T});
        await btn.click(); await idle(page);
        const dlg = page.locator(vis).filter({hasText: 'Activity Log & Notes'}).last();
        await dlg.locator('tbody tr td').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await sleep(600);
        const rows = await dlg.locator('tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')).join(' | '))).catch(() => []);
        await snap(name, {rows});
        return rows;
    }
    async function moreInfo(C, sub, fileName, name, opts) {
        await openMedia(C, sub);
        const m = await rowMenu(fileName, 'More Information', opts);
        if (m.noItem || m.noButton) return {menu: m};
        const dlg = top();
        await dlg.locator('tbody tr td').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await sleep(800);
        const title = await windowTitle();
        const tabs = await dlg.locator('[role=tab]').allInnerTexts().catch(() => []);
        const rows = await dlg.locator('tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')).join(' | '))).catch(() => []);
        await snap(name, {rows, title, tabs});
        return {title, tabs, rows};
    }
    const bellText = async () => flat(await page.getByRole('button', {name: /^Tasks/}).first().getAttribute('aria-label').catch(() => null) || await page.getByRole('button', {name: /^Tasks/}).first().innerText().catch(() => null), 60);
    const emails = (C) => Object.values(C.u).map((u) => `${u}@mail.test`);
    async function mailCounts(C) {
        const o = {};
        for (const e of [...emails(C), 'admin@mail.test']) o[e] = await app.mail.count({to: e}).catch(() => null);
        return o;
    }

    const s = S.s;
    const C = S.C;
    try {
        // ============================================================ meta (q13; Fields, metadata window; Rules 4, 4a, 4b)
        if (on('meta')) await sect('meta', async () => {
            const out = {};
            await as(C.u.mg, C.path);
            out.page = await openMedia(C, s.M, 'm-01-page');
            const kinds = [['img-m.png', 'image'], ...(isOMP ? [] : [['mm.txt', 'multimedia']]), ['style.css', 'stylesheet']];
            for (const [n, k] of kinds) {
                const m = await rowMenu(n, 'Edit Metadata');
                await waitWindow('Edit Metadata');
                out[`window-${k}`] = {menu: m.items, win: await winSnap(`m-02-edit-${k}`)};
                const t0 = Date.now();
                await pressIn('Cancel');
                out[`window-${k}`].cancelClosed = await waitClosed('Edit Metadata');
                out[`window-${k}`].cancelTraffic = since(t0);
            }
            if (isOJS) await loc(page, 'Edit Metadata: field "Caption" (textarea)', (await (async () => { await rowMenu('img-m.png', 'Edit Metadata'); await waitWindow('Edit Metadata'); return field('Caption').locator('textarea'); })()));
            if (isOJS) { await pressIn('Cancel'); await waitClosed('Edit Metadata'); }
            // Rule 4: a new name and a caption, Save.
            await rowMenu('img-m.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            await fill('Name of the file', 'img-m-renamed.png');
            await fill('Caption', 'Cap M');
            let t0 = Date.now();
            await pressIn('Save');
            out.save = {closed: await waitClosed('Edit Metadata'), traffic: since(t0)};
            out.save.rows = (await mediaRows()).rows?.map((r) => r.cells.join(' | '));
            await snap('m-03-after-save', {rows: out.save.rows});
            // Reopen: each field arrives holding the current value (line 99).
            await openMedia(C, s.M, 'm-04-reload');
            await rowMenu('img-m-renamed.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            out.reopen = await winSnap('m-05-reopen-image');
            // Rule 4a: the name emptied.
            await fill('Name of the file', '');
            t0 = Date.now();
            await pressIn('Save');
            await sleep(1500); await idle(page);
            out.emptyName = {stillOpen: (await windowTitle()) === 'Edit Metadata', win: await winSnap('m-06-empty-name'), traffic: since(t0)};
            // Sweep: leave with the change unsaved: Close › dialog › "No", then Close › "Yes".
            out.leaveNo = await closeWithChange('m-07-leave-dialog', 'No');
            out.leaveNo.stillOpen = (await windowTitle()) === 'Edit Metadata';
            out.leaveYes = await closeWithChange('m-08-leave-dialog-2', 'Yes');
            out.leaveYes.closed = await waitClosed('Edit Metadata');
            out.afterLeave = (await openMedia(C, s.M, 'm-09-after-leave')).rows?.map((r) => r.cells.join(' | '));
            // Rule 4b: a linked file's shared details. Credit on the web file, then on the high-resolution one.
            await rowMenu('pair-web.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            await fill('Credit', 'Credit W');
            t0 = Date.now(); await pressIn('Save'); await waitClosed('Edit Metadata');
            out.pairSave1 = since(t0);
            await rowMenu('pair-high.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            out.pairHighAfterWeb = await winSnap('m-10-pair-high-after-web-credit');
            await fill('Credit', 'Credit H');
            await fill('Copyright Owner', 'Owner H');
            t0 = Date.now(); await pressIn('Save'); await waitClosed('Edit Metadata');
            out.pairSave2 = since(t0);
            await rowMenu('pair-web.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            out.pairWebAfterHigh = await winSnap('m-11-pair-web-after-high-credit');
            await pressIn('Cancel'); await waitClosed('Edit Metadata');
            out.pairRows = (await openMedia(C, s.M, 'm-12-pair-rows')).rows?.map((r) => r.cells.join(' | '));
            fact('meta', out);
        });

        // ============================================================ supp (q26; Settings bullet 3)
        if (on('supp')) await sect('supp', async () => {
            const out = {};
            const C2 = S.C2;
            await as(C2.u.mg, C2.path);
            out.page = await openMedia(C2, s.Q, 'q-01-page');
            await rowMenu('q.txt', 'Edit Metadata'); await waitWindow('Edit Metadata');
            out.window = await winSnap('q-02-edit-supplementary');
            const dateBox = field('Date').locator('input').first();
            out.dateInput = await dateBox.evaluate((e) => ({type: e.type, placeholder: e.placeholder, cls: e.className})).catch(() => null);
            await loc(page, 'Edit Metadata (Supplementary Content): "Date" input', dateBox);
            await fill('Description', 'Desc Q');
            await dateBox.fill('2026-01-15').catch(async () => { await dateBox.click(); await page.keyboard.type('2026-01-15'); });
            await field('Description').locator('textarea, input').first().click();
            await sleep(300);
            out.beforeSave = await winSnap('q-03-filled');
            const t0 = Date.now();
            await pressIn('Save');
            out.save = {closed: await waitClosed('Edit Metadata'), traffic: since(t0)};
            await openMedia(C2, s.Q, 'q-04-after-save');
            await rowMenu('q.txt', 'Edit Metadata'); await waitWindow('Edit Metadata');
            out.reopen = await winSnap('q-05-reopen');
            await pressIn('Cancel'); await waitClosed('Edit Metadata');
            // the Image on the same context still has the artwork fields (control)
            await rowMenu('qi.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            out.imageControl = await winSnap('q-06-image-control');
            await pressIn('Cancel'); await waitClosed('Edit Metadata');
            fact('supp', out);
        });

        // ============================================================ manual (q9; Rules 3, 3a; manual link window)
        if (on('manual')) await sect('manual', async () => {
            const out = {};
            const W = 'Manually Link Media';
            await as(C.u.mg, C.path);
            out.page = await openMedia(C, s.L, 'l-01-page');
            let m = await rowMenu('A-web.png', W); await waitWindow(W);
            out.aWindow = {menu: m.items, win: await winSnap('l-02-A-window')};
            await loc(page, 'Manually Link Media: "Select the media file to link as its counterpart"', top().getByLabel(/Select the media file to link/));
            const sel = () => top().getByLabel(/Select the media file to link/);
            await sel().selectOption({label: 'B-high.png'});
            let t0 = Date.now();
            await pressIn('Link Media');
            out.linkAB = {closed: await waitClosed(W), traffic: since(t0)};
            out.linkAB.page = await openMedia(C, s.L, 'l-03-after-A-B');
            m = await rowMenu('C-web.png', W); await waitWindow(W);
            out.cWindow = await winSnap('l-04-C-window');
            await pressIn('Cancel'); await waitClosed(W);
            m = await rowMenu('B-high.png', W); await waitWindow(W);
            out.bWindow = {menu: m.items, win: await winSnap('l-05-B-window')};
            await pressIn('Cancel'); await waitClosed(W);
            out.mMenu = await rowMenu(isOMP ? 'M-css.css' : 'M-mm.txt');
            await snap('l-06-M-menu', {mMenu: out.mMenu});
            // Relink A to D from A's own row.
            await rowMenu('A-web.png', W); await waitWindow(W);
            out.aWindow2 = await winSnap('l-07-A-window-linked');
            await sel().selectOption({label: 'D-high.png'});
            t0 = Date.now();
            await pressIn('Link Media');
            out.linkAD = {closed: await waitClosed(W), traffic: since(t0)};
            out.linkAD.page = await openMedia(C, s.L, 'l-08-after-A-D');
            // Unlink: "No high-resolution file".
            await rowMenu('A-web.png', W); await waitWindow(W);
            await sel().selectOption({label: 'No high-resolution file'});
            t0 = Date.now();
            await pressIn('Link Media');
            out.unlink = {closed: await waitClosed(W), traffic: since(t0)};
            out.unlink.page = await openMedia(C, s.L, 'l-09-after-unlink');
            // From a high-resolution row: link B to C.
            await rowMenu('B-high.png', W); await waitWindow(W);
            await sel().selectOption({label: 'C-web.png'});
            t0 = Date.now();
            await pressIn('Link Media');
            out.linkBC = {closed: await waitClosed(W), traffic: since(t0)};
            out.linkBC.page = await openMedia(C, s.L, 'l-10-after-B-C');
            // Sweep: leave with a change (Close › No › still open; its own Cancel › Yes › closed, nothing saved).
            await rowMenu('A-web.png', W); await waitWindow(W);
            await sel().selectOption({label: 'D-high.png'});
            out.leaveNo = await closeWithChange('l-11-leave-dialog', 'No');
            out.leaveNo.stillOpen = (await windowTitle()) === W;
            t0 = Date.now();
            await pressIn('Cancel'); await sleep(700);
            const d = page.locator(vis).filter({hasText: 'The data on this form has changed'}).last();
            out.cancelDialog = await d.isVisible().catch(() => false);
            if (out.cancelDialog) { await snap('l-12-cancel-dialog'); await d.getByRole('button', {name: 'Yes', exact: true}).click(); }
            out.cancelClosed = await waitClosed(W);
            out.cancelTraffic = since(t0);
            out.afterLeave = await openMedia(C, s.L, 'l-13-after-leave');
            fact('manual', out);
        });

        // ============================================================ batch (q11; Rule 3b; batch window)
        if (on('batch')) await sect('batch', async () => {
            const out = {};
            const W = 'Batch Link Media';
            await as(C.u.mg, C.path);
            out.page = await openMedia(C, s.B, 'b-01-page');
            const open = async () => {
                await page.getByRole('button', {name: W, exact: true}).click();
                await waitWindow(W);
                await top().locator('table').first().waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(500);
            };
            const rowSel = (n) => top().locator('tbody tr').filter({hasText: n}).locator('select').first();
            await open();
            out.first = await winSnap('b-02-window');
            await rowSel('A2-web.png').selectOption({label: 'B2-high.png'});
            await sleep(300);
            out.afterPickB2 = await winSnap('b-03-after-pick-B2');
            await rowSel('C2-web.png').selectOption({label: 'D2-high.png'});
            await sleep(300);
            out.afterPickD2 = await winSnap('b-03b-after-pick-D2');
            let t0 = Date.now();
            await pressIn('Link Media');
            out.link = {closed: await waitClosed(W), traffic: since(t0)};
            out.link.page = await openMedia(C, s.B, 'b-04-after-link');
            await open();
            out.reopen = await winSnap('b-05-reopen');
            await rowSel('C2-web.png').selectOption({label: 'No high-resolution file'});
            t0 = Date.now();
            await pressIn('Link Media');
            out.unlink = {closed: await waitClosed(W), traffic: since(t0)};
            out.unlink.page = await openMedia(C, s.B, 'b-06-after-unlink');
            // Sweep: leave with a change.
            await open();
            await rowSel('A2-web.png').selectOption({label: 'No high-resolution file'});
            out.leaveNo = await closeWithChange('b-07-leave-dialog', 'No');
            out.leaveNo.stillOpen = (await windowTitle()) === W;
            out.leaveYes = await closeWithChange('b-08-leave-dialog-2', 'Yes');
            out.leaveYes.closed = await waitClosed(W);
            out.afterLeave = await openMedia(C, s.B, 'b-09-after-leave');
            // Without a change: Cancel closes at once.
            await open();
            t0 = Date.now();
            await pressIn('Cancel');
            out.cancelNoChange = {closed: await waitClosed(W), traffic: since(t0)};
            // No web-resolution image.
            out.empty = {page: await openMedia(C, s.E, 'b-10-empty-page')};
            await open();
            out.empty.win = await winSnap('b-11-empty-window');
            await pressIn('Cancel'); await waitClosed(W);
            fact('batch', out);
        });

        // ============================================================ copy (q10; Rule 3c)
        if (on('copy')) await sect('copy', async () => {
            const out = {};
            await as(C.u.mg, C.path);
            const setCaption = async (sub, n, v) => {
                await rowMenu(n, 'Edit Metadata'); await waitWindow('Edit Metadata');
                await fill('Caption', v); await pressIn('Save'); await waitClosed('Edit Metadata');
            };
            const readCaption = async (sub, n, name) => {
                await rowMenu(n, 'Edit Metadata'); await waitWindow('Edit Metadata');
                const w = await winSnap(name);
                await pressIn('Cancel'); await waitClosed('Edit Metadata');
                const pick = (lab) => (w.fields || []).find((x) => x.label.startsWith(lab))?.inputs?.[0]?.value;
                return {name: pick('Name of the file'), caption: pick('Caption')};
            };
            // C1: from B's "Manually Link Media".
            await openMedia(C, s.C1, 'c-01-c1-page');
            await setCaption(s.C1, 'A3-web.png', 'Web caption');
            await setCaption(s.C1, 'B3-high.png', 'High caption');
            await rowMenu('B3-high.png', 'Manually Link Media'); await waitWindow('Manually Link Media');
            await top().getByLabel(/Select the media file to link/).selectOption({label: 'A3-web.png'});
            await pressIn('Link Media'); await waitClosed('Manually Link Media');
            await openMedia(C, s.C1, 'c-02-c1-linked');
            out.c1 = {A: await readCaption(s.C1, 'A3-web.png', 'c-03-c1-A'), B: await readCaption(s.C1, 'B3-high.png', 'c-04-c1-B')};
            // C2: from "Batch Link Media".
            await openMedia(C, s.C2, 'c-05-c2-page');
            await setCaption(s.C2, 'A4-web.png', 'Web caption');
            await setCaption(s.C2, 'B4-high.png', 'High caption');
            await page.getByRole('button', {name: 'Batch Link Media', exact: true}).click(); await waitWindow('Batch Link Media');
            await top().locator('tbody tr').filter({hasText: 'A4-web.png'}).locator('select').first().selectOption({label: 'B4-high.png'});
            await pressIn('Link Media'); await waitClosed('Batch Link Media');
            await openMedia(C, s.C2, 'c-06-c2-linked');
            out.c2 = {A: await readCaption(s.C2, 'A4-web.png', 'c-07-c2-A'), B: await readCaption(s.C2, 'B4-high.png', 'c-08-c2-B')};
            // C3: batch with the web file's caption empty.
            await openMedia(C, s.C3, 'c-09-c3-page');
            await setCaption(s.C3, 'B5-high.png', 'High caption');
            await page.getByRole('button', {name: 'Batch Link Media', exact: true}).click(); await waitWindow('Batch Link Media');
            await top().locator('tbody tr').filter({hasText: 'A5-web.png'}).locator('select').first().selectOption({label: 'B5-high.png'});
            await pressIn('Link Media'); await waitClosed('Batch Link Media');
            await openMedia(C, s.C3, 'c-10-c3-linked');
            out.c3 = {A: await readCaption(s.C3, 'A5-web.png', 'c-11-c3-A'), B: await readCaption(s.C3, 'B5-high.png', 'c-12-c3-B')};
            fact('copy', out);
        });

        // ============================================================ log (q21, q22; Activity Log, no email)
        if (on('log')) await sect('log', async () => {
            const out = {};
            await as(C.u.mg, C.path);
            out.mailBefore = await mailCounts(C);
            await page.goto(cUrl(C.path, '/dashboard/editorial')); await idle(page);
            out.bellBefore = await bellText();
            out.log0 = await activityLog(C, s.A, 'g-01-log-before');
            // add a web Image on screen
            await openMedia(C, s.A, 'g-02-page');
            await page.getByRole('button', {name: 'Add Media File', exact: true}).click();
            await waitWindow('Upload Media File');
            const chooserP = page.waitForEvent('filechooser');
            await top().getByRole('button', {name: 'Click to upload files', exact: true}).click();
            await (await chooserP).setFiles([fx(app.name, 'figure.png')]);
            await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] select[id*="-genreId-"]').length === 1, null, {timeout: T});
            await top().locator('select[id*="-genreId-"]').selectOption({label: 'Image'});
            await sleep(300);
            await snap('g-03-upload-window');
            let t0 = Date.now();
            await pressIn('Upload Files');
            await waitClosed('Upload Media File');
            out.add = {traffic: since(t0)};
            await openMedia(C, s.A, 'g-04-after-add');
            out.log1 = await activityLog(C, s.A, 'g-05-log-after-add');
            out.info1 = await moreInfo(C, s.A, 'figure.png', 'g-06-info-after-add');
            // edit its details
            await openMedia(C, s.A);
            await rowMenu('figure.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            await fill('Caption', 'Log caption');
            t0 = Date.now(); await pressIn('Save'); await waitClosed('Edit Metadata');
            out.edit = {traffic: since(t0)};
            out.log2 = await activityLog(C, s.A, 'g-07-log-after-edit');
            out.info2 = await moreInfo(C, s.A, 'figure.png', 'g-08-info-after-edit');
            // link it to H
            await openMedia(C, s.A);
            await rowMenu('figure.png', 'Manually Link Media'); await waitWindow('Manually Link Media');
            await top().getByLabel(/Select the media file to link/).selectOption({label: 'H-high.png'});
            t0 = Date.now(); await pressIn('Link Media'); await waitClosed('Manually Link Media');
            out.link = {traffic: since(t0)};
            out.log3 = await activityLog(C, s.A, 'g-09-log-after-link');
            out.info3 = await moreInfo(C, s.A, 'figure.png', 'g-10-info-after-link');
            out.info3h = await moreInfo(C, s.A, 'H-high.png', 'g-11-info-H-after-link');
            // unlink
            await openMedia(C, s.A);
            await rowMenu('figure.png', 'Manually Link Media'); await waitWindow('Manually Link Media');
            await top().getByLabel(/Select the media file to link/).selectOption({label: 'No high-resolution file'});
            t0 = Date.now(); await pressIn('Link Media'); await waitClosed('Manually Link Media');
            out.unlink = {traffic: since(t0)};
            out.log4 = await activityLog(C, s.A, 'g-12-log-after-unlink');
            out.info4 = await moreInfo(C, s.A, 'figure.png', 'g-13-info-after-unlink');
            out.info4h = await moreInfo(C, s.A, 'H-high.png', 'g-14-info-H-after-unlink');
            // delete it
            await openMedia(C, s.A);
            await rowMenu('figure.png', 'Delete File');
            const dd = page.locator(vis).filter({hasText: 'Delete media file?'}).last();
            await dd.waitFor({timeout: T});
            t0 = Date.now();
            await dd.getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(1500); await idle(page);
            out.del = {traffic: since(t0)};
            await openMedia(C, s.A, 'g-15-after-delete');
            out.log5 = await activityLog(C, s.A, 'g-16-log-after-delete');
            // no email, no task: counts after, the bell, then a positive control (a lost-password email to mg)
            await sleep(3000);
            out.mailAfter = await mailCounts(C);
            await page.goto(cUrl(C.path, '/dashboard/editorial')); await idle(page);
            out.bellAfter = await bellText();
            await snap('g-17-dashboard-bell', {bell: out.bellAfter});
            await signOut(page).catch(() => {}); who = null;
            await page.goto(cUrl(C.path, '/login/lostPassword')); await idle(page);
            await snap('g-18-lost-password');
            await page.locator('input[name="email"]').fill(`${C.u.mg}@mail.test`);
            await page.getByRole('button', {name: /Reset password|Submit|Send/i}).first().click();
            await idle(page);
            out.control = await app.mail.find({to: `${C.u.mg}@mail.test`, timeoutMs: 20000}).then((m) => ({subject: m.Subject})).catch((e) => ({error: String(e.message).slice(0, 200)}));
            out.mailAfterControl = await mailCounts(C);
            fact('log', out);
        });

        // ============================================================ reader (q18, q19, q20, q27; OPS1)
        if (on('reader') || on('recheck')) await sect(on('reader') ? 'reader' : 'recheck', async () => {
            const out = {};
            const RE = !on('reader');
            const figResp = [];
            page.on('response', (r) => { if (/figure[^/]*\.png|article\.css|preprint\.css/.test(r.url())) figResp.push({at: Date.now(), status: r.status(), type: r.headers()['content-type'], url: r.url().replace(/^.*\/index\.php/, '')}); });
            const figSince = (t0) => figResp.filter((x) => x.at >= t0).map(({at, ...x}) => x);
            // Read an iframe-hosted or plain HTML reader page: the figure and the style sheet.
            async function readRender(name) {
                await idle(page); await sleep(800);
                const frames = page.frames();
                const res = {url: page.url().replace(/^.*\/index\.php/, ''), frames: frames.length};
                for (const fr of frames) {
                    const d = await fr.evaluate(() => {
                        const img = document.querySelector('img[alt="Figure 1"]');
                        const css = document.querySelector('link[rel="stylesheet"][href*="css"]');
                        if (!img) return null;
                        return {src: img.getAttribute('src'), complete: img.complete, naturalWidth: img.naturalWidth, css: css ? css.getAttribute('href') : null, h1: document.querySelector('h1')?.innerText, ctype: document.contentType};
                    }).catch(() => null);
                    if (d) { res.figure = d; res.frameUrl = fr.url().replace(/^.*\/index\.php/, ''); break; }
                }
                if (res.figure && !res.figure.complete) { await sleep(1500); }
                await snap(name, {render: res});
                return res;
            }
            if (isOJS) {
                await as(C.u.rd, C.path);
                const galleyView = async (sub, name) => {
                    await page.goto(cUrl(C.path, `/article/view/${sub.id}`)); await idle(page);
                    const links = await page.locator('a.obj_galley_link').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href').replace(/^.*\/index\.php/, '')})));
                    await snap(`${name}-article`, {links});
                    const t0 = Date.now();
                    await page.locator('a.obj_galley_link', {hasText: 'HTML'}).first().click();
                    await page.waitForLoadState('load').catch(() => {});
                    const r = await readRender(name);
                    r.links = links; r.fig = figSince(t0);
                    return r;
                };
                if (!RE) out.r1 = await galleyView(s.R1, 'r-01-r1-reader');
                if (!RE) out.r2 = await galleyView(s.R2, 'r-02-r2-reader');
                // R3: a dependent figure.png (400 px) on the HTML galley, then publish.
                if (!RE) out.r3build = await sect('r3build', async () => {
                    const o = {};
                    const alt = path.join(outDir(), 'alt'); fs.mkdirSync(alt, {recursive: true});
                    const altFile = path.join(alt, 'figure.png'); fs.copyFileSync(fx('ojs', 'profile-image-400.png'), altFile);
                    await as(C.u.mg, C.path);
                    await page.goto(wfUrl(C.path, s.R3.id, `publication_${s.R3.pub}_galleys`)); await idle(page);
                    const gm = page.locator('[data-cy="galley-manager"]').first();
                    await gm.waitFor({timeout: T}); await idle(page);
                    const row = gm.locator('tbody tr').filter({hasText: 'HTML'}).first();
                    await row.getByRole('button', {name: /More Actions/}).first().click(); await sleep(300);
                    await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click(); await idle(page);
                    const form = page.locator('form[id$="GalleyForm"]:visible').last();
                    await form.waitFor({timeout: T});
                    const dep = page.locator('[id^="dependentFilesGridDiv"]:visible').last();
                    await dep.waitFor({timeout: T}); await idle(page);
                    await snap('r-03-r3-galley-edit');
                    await dep.getByRole('link', {name: /Upload/}).first().click();
                    const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
                    await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: T}); await idle(page);
                    const g = wiz.locator('select[id^="genreId"]'); if (await g.count()) await g.selectOption({label: 'Image'});
                    await wiz.locator('input[type="file"]').setInputFiles(altFile);
                    const cont = wiz.getByRole('button', {name: 'Continue', exact: true});
                    await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length); return b && !b.disabled; }, null, {timeout: T});
                    await cont.click(); await idle(page); await sleep(800);
                    await cont.click(); await idle(page); await sleep(800);
                    await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page); await sleep(1500); await idle(page);
                    o.dep = flat(await dep.innerText().catch(() => null), 400);
                    await snap('r-04-r3-dependent-added', {dep: o.dep});
                    await form.getByRole('button', {name: 'Save', exact: true}).last().click(); await sleep(1200); await idle(page);
                    await page.goto(wfUrl(C.path, s.R3.id, `publication_${s.R3.pub}_titleAbstract`)); await idle(page);
                    const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
                    await new PublicationScreen(page, C.path).publish({backIssueLabel: /Vol\. 1 No\. 1/});
                    await snap('r-05-r3-published');
                    o.published = true;
                    return o;
                });
                await as(C.u.rd, C.path);
                if (!RE) out.r3 = await galleyView(s.R3, 'r-06-r3-reader');
                // Settings bullet 6: the plugin off, then on again (the grid on Settings › Website › Plugins).
                const plugin = async (want, name) => {
                    await as(C.u.mg, C.path);
                    await page.goto(cUrl(C.path, '/management/settings/website')); await idle(page);
                    await page.locator('#plugins-button').click(); await idle(page);
                    const row = page.locator('#pluginGridContainer tr.gridRow[id$="-row-htmlarticlegalleyplugin"]');
                    await row.waitFor({timeout: T});
                    const box = row.getByRole('checkbox').first();
                    const o = {row: flat(await row.innerText(), 200), before: await box.isChecked()};
                    if (o.before !== want) {
                        const t0 = Date.now();
                        await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
                        await sleep(800);
                        const dlg = page.locator(vis).last();
                        if (await dlg.count()) {
                            o.question = flat(await dlg.innerText().catch(() => null), 300);
                            const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first();
                            if (await ok.count()) await ok.click();
                        }
                        await sleep(1200); await idle(page);
                        o.traffic = since(t0);
                    }
                    o.after = await row.getByRole('checkbox').first().isChecked().catch(() => null);
                    await snap(name, {plugin: o});
                    return o;
                };
                out.pluginOff = await plugin(false, RE ? 'r-07-plugin-off-recheck' : 'r-07-plugin-off');
                await as(C.u.rd, C.path);
                out.r1off = await sect('r1off', async () => {
                    await page.goto(cUrl(C.path, `/article/view/${s.R1.id}`)); await idle(page);
                    const links = await page.locator('a.obj_galley_link').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href').replace(/^.*\/index\.php/, ''), cls: a.className})));
                    await snap('r-08-r1-article-plugin-off', {links});
                    const t0 = Date.now();
                    const dl = page.waitForEvent('download', {timeout: 8000}).then((d) => ({suggested: d.suggestedFilename(), url: d.url().replace(/^.*\/index\.php/, '')})).catch(() => null);
                    await page.locator('a.obj_galley_link', {hasText: 'HTML'}).first().click().catch(() => {});
                    const d = await dl;
                    await page.waitForLoadState('load').catch(() => {});
                    const r = await readRender(RE ? 'r-09-r1-reader-plugin-off-recheck' : 'r-09-r1-reader-plugin-off');
                    r.download = d; r.links = links; r.fig = figSince(t0);
                    r.pageText = flat(await page.locator('body').innerText().catch(() => null), 300);
                    return r;
                });
                out.pluginOn = await plugin(true, RE ? 'r-10-plugin-on-recheck' : 'r-10-plugin-on');
                await as(C.u.rd, C.path);
                if (RE) {
                    // An anonymous reader (no session) of R1, then the web file renamed back to figure.png: anonymous and signed in again.
                    const anon = async (name) => { await page.context().clearCookies(); who = null; return galleyView(s.R1, name); };
                    out.anon1 = await anon('r-15-r1-anonymous');
                    await as(C.u.mg, C.path);
                    await openMedia(C, s.R1);
                    await rowMenu('figure-renamed.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
                    await fill('Name of the file', 'figure.png'); await pressIn('Save'); await waitClosed('Edit Metadata');
                    out.renamedBack = await openMedia(C, s.R1, 'r-16-r1-media-renamed-back');
                    out.anon2 = await anon('r-17-r1-anonymous-after-rename-back');
                    await as(C.u.rd, C.path);
                    out.signed2 = await galleyView(s.R1, 'r-18-r1-signed-in-after-rename-back');
                    fact('recheck', out); return;
                }
                out.r1on = await galleyView(s.R1, 'r-11-r1-reader-plugin-on');
                // Rename the web figure.png on the published version, then read again.
                out.rename = await sect('rename', async () => {
                    await as(C.u.mg, C.path);
                    await openMedia(C, s.R1, 'r-12-r1-media');
                    await rowMenu('figure.png', 'Edit Metadata', {high: false}); await waitWindow('Edit Metadata');
                    await fill('Name of the file', 'figure-renamed.png');
                    const t0 = Date.now();
                    await pressIn('Save');
                    const o = {closed: await waitClosed('Edit Metadata'), traffic: since(t0)};
                    o.page = await openMedia(C, s.R1, 'r-13-r1-media-renamed');
                    return o;
                });
                await as(C.u.rd, C.path);
                out.r1renamed = await galleyView(s.R1, 'r-14-r1-reader-renamed');
            }
            if (isOPS) {
                await as(C.u.rd, C.path);
                await page.goto(cUrl(C.path, `/preprint/view/${s.R.id}`)); await idle(page);
                const links = await page.locator('a.obj_galley_link').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href').replace(/^.*\/index\.php/, ''), cls: a.className})));
                await snap('r-01-ops-preprint', {links});
                const t0 = Date.now();
                const dl = page.waitForEvent('download', {timeout: 8000}).then((d) => ({suggested: d.suggestedFilename(), url: d.url().replace(/^.*\/index\.php/, '')})).catch(() => null);
                const nav = page.waitForResponse((r) => /\/preprint\/(view|download)\//.test(r.url()) && r.request().resourceType() === 'document', {timeout: 10000}).then((r) => ({status: r.status(), type: r.headers()['content-type'], disposition: r.headers()['content-disposition'] || null, url: r.url().replace(/^.*\/index\.php/, '')})).catch(() => null);
                await page.locator('a.obj_galley_link', {hasText: 'HTML'}).first().click().catch(() => {});
                const d = await dl;
                const n = await nav;
                await page.waitForLoadState('load').catch(() => {});
                const r = await readRender(RE ? 'r-02-ops-galley-opened-recheck' : 'r-02-ops-galley-opened');
                r.download = d; r.nav = n; r.links = links; r.fig = figSince(t0);
                r.pageText = flat(await page.locator('body').innerText().catch(() => null), 300);
                out.ops = r;
                if (RE) { fact('recheck', out); return; }
                // OPS1 / Settings bullet 6 control: the Plugins list offers no HTML galley plugin.
                await as(C.u.mg, C.path);
                await page.goto(cUrl(C.path, '/management/settings/website')); await idle(page);
                await page.locator('#plugins-button').click(); await idle(page);
                await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T});
                const names = await page.locator('#pluginGridContainer tr.gridRow').evaluateAll((els) => els.map((tr) => ({id: tr.id.replace(/^.*-row-/, ''), text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)})));
                out.opsPlugins = names;
                await snap('r-03-ops-plugins', {plugins: names});
                // The Media page is offered on the posted preprint (OPS1's premise).
                out.opsMedia = await openMedia(C, s.R, 'r-04-ops-media-posted');
            }
            if (isOMP && !RE) out.omp = await sect('omp-reader', async () => ompReader(readRender, figSince));
            fact('reader', out);
        });

        // ---- OMP: an HTML publication format, published, read from the book page; the plugin off and on.
        async function ompReader(readRender, figSince) {
            const o = {};
            const P = s.P;
            const wf = () => page.locator(vis).first();
            await as(C.u.mg, C.path);
            if (!S.ompBuilt) {
                await page.goto(wfUrl(C.path, P.id, `publication_${P.pub}_publicationFormats`)); await idle(page);
                await snap('p-01-formats');
                await wf().getByRole('link', {name: 'Add publication format'}).first().click();
                await top().locator('input[name^="name"]').first().waitFor({timeout: T}); await idle(page);
                await top().locator('input[name^="name"]').first().fill('HTML');
                await snap('p-02-format-window');
                await top().getByRole('button', {name: 'OK', exact: true}).click();
                await idle(page); await sleep(1500); await idle(page);
                const cat = () => wf().locator('tr').filter({hasText: 'HTML'}).filter({has: page.locator('.onix_code')}).first();
                await cat().getByRole('link', {name: 'Change File', exact: true}).first().click();
                const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
                await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: T}); await idle(page);
                const genre = wiz.locator('select[id^="genreId"]');
                if (await genre.count()) {
                    const opts = await genre.locator('option').evaluateAll((els) => els.map((x) => ({v: x.value, t: x.text.trim()})).filter((x) => x.v));
                    await genre.selectOption(opts[0].v);
                }
                await wiz.locator('input[type="file"]').setInputFiles(fx('omp', 'article.html'));
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length); return b && !b.disabled; }, null, {timeout: T});
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
                await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page); await sleep(1500); await idle(page);
                await snap('p-03-format-file');
                // the file row: approve the proof, then "Set Terms" › Open Access
                const fileRow = () => wf().locator('tr.gridRow').filter({hasText: 'article.html'}).first();
                o.fileRow = flat(await fileRow().innerText().catch(() => null), 200);
                const approve = fileRow().getByRole('link', {name: /Not Approved/}).first();
                if (await approve.count()) {
                    await approve.click(); await idle(page); await sleep(700);
                    o.approveQ = flat(await top().innerText().catch(() => null), 300);
                    await top().getByRole('button', {name: /^(OK|Yes|Approve)$/}).first().click().catch(() => {});
                    await idle(page); await sleep(1200);
                }
                const terms = fileRow().getByRole('link', {name: /Set Terms|Not Available|Open Access/}).first();
                if (await terms.count()) {
                    await terms.click(); await idle(page); await sleep(900);
                    await snap('p-04-terms-window');
                    const oa = top().locator('input[type="radio"][value="openAccess"]').first();
                    if (await oa.count()) await oa.check();
                    await top().getByRole('button', {name: /^(Save|OK)$/}).first().click().catch(() => {});
                    await idle(page); await sleep(1200);
                }
                o.fileRowAfter = flat(await fileRow().innerText().catch(() => null), 200);
                const fmtApprove = cat().getByRole('link', {name: /Awaiting Approval|Not Approved|Incomplete/i}).first();
                if (await fmtApprove.count()) {
                    await fmtApprove.click(); await idle(page); await sleep(700);
                    o.fmtApproveQ = flat(await top().innerText().catch(() => null), 300);
                    await top().getByRole('button', {name: /^(OK|Yes|Approve)$/}).first().click().catch(() => {});
                    await idle(page); await sleep(1200);
                }
                o.formatRow = flat(await cat().innerText().catch(() => null), 300);
                await snap('p-05-format-ready', {o});
                // publish
                await page.goto(wfUrl(C.path, P.id, `publication_${P.pub}_titleAbstract`)); await idle(page);
                await page.getByRole('button', {name: 'Publish', exact: true}).first().click();
                const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
                await modal.waitFor({state: 'visible', timeout: T}); await idle(page);
                const stage = modal.locator('select[name="versionStage"]');
                if (await stage.isVisible().catch(() => false)) { if (!(await stage.inputValue())) await stage.selectOption('VoR'); }
                const minor = modal.locator('select[name="versionIsMinor"]');
                if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
                await snap('p-06-publish-window');
                const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await modal.getByRole('button', {name: 'Publish', exact: true}).click();
                o.publish = await w.then((r) => (r ? r.status() : null));
                await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page);
                // make the format "Available"
                await page.goto(wfUrl(C.path, P.id, `publication_${P.pub}_publicationFormats`)); await idle(page);
                const avail = cat().getByRole('link', {name: /^Not Available$/}).first();
                if (await avail.count()) {
                    await avail.click(); await idle(page); await sleep(700);
                    o.availQ = flat(await top().innerText().catch(() => null), 300);
                    await top().getByRole('button', {name: /^(OK|Yes)$/}).first().click().catch(() => {});
                    await idle(page); await sleep(1200);
                }
                o.formatRowFinal = flat(await cat().innerText().catch(() => null), 300);
                await snap('p-07-format-available', {o});
                S.ompBuilt = true; save();
            }
            const bookView = async (name) => {
                await as(C.u.rd, C.path);
                await page.goto(cUrl(C.path, `/catalog/book/${P.id}`)); await idle(page);
                const links = await page.locator('a[href*="/catalog/view/"], a[href*="/catalog/download/"]').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim().replace(/\s+/g, ' '), href: a.getAttribute('href').replace(/^.*\/index\.php/, '')})));
                await snap(`${name}-book`, {links});
                const t0 = Date.now();
                const link = page.locator('a[href*="/catalog/view/"]').filter({hasText: /HTML|article/}).first();
                if (!(await link.count())) return {links, noLink: true};
                const dl = page.waitForEvent('download', {timeout: 8000}).then((d) => ({suggested: d.suggestedFilename()})).catch(() => null);
                await link.click().catch(() => {});
                const d = await dl;
                await page.waitForLoadState('load').catch(() => {});
                const r = await readRender(name);
                r.links = links; r.download = d; r.fig = figSince(t0);
                return r;
            };
            o.on = await bookView('p-08-reader');
            const plugin = async (want, name) => {
                await as(C.u.mg, C.path);
                await page.goto(cUrl(C.path, '/management/settings/website')); await idle(page);
                await page.locator('#plugins-button').click(); await idle(page);
                const row = page.locator('#pluginGridContainer tr.gridRow[id$="-row-htmlmonographfileplugin"]');
                await row.waitFor({timeout: T});
                const box = row.getByRole('checkbox').first();
                const p = {row: flat(await row.innerText(), 200), before: await box.isChecked()};
                if (p.before !== want) {
                    await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
                    await sleep(800);
                    const dlg = page.locator(vis).last();
                    if (await dlg.count()) {
                        p.question = flat(await dlg.innerText().catch(() => null), 300);
                        const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first();
                        if (await ok.count()) await ok.click();
                    }
                    await sleep(1200); await idle(page);
                }
                p.after = await row.getByRole('checkbox').first().isChecked().catch(() => null);
                await snap(name, {plugin: p});
                return p;
            };
            o.pluginOff = await plugin(false, 'p-09-plugin-off');
            o.off = await bookView('p-10-reader-plugin-off');
            o.pluginOn = await plugin(true, 'p-11-plugin-on');
            o.onAgain = await bookView('p-12-reader-plugin-on');
            // A high-resolution file also named figure.png (added on screen), then the web file renamed.
            await as(C.u.mg, C.path);
            await openMedia(C, P, 'p-13-media');
            await page.getByRole('button', {name: 'Add Media File', exact: true}).click();
            await waitWindow('Upload Media File');
            const chooserP = page.waitForEvent('filechooser');
            await top().getByRole('button', {name: 'Click to upload files', exact: true}).click();
            await (await chooserP).setFiles([fx('omp', 'profile-image-400.png')]);
            await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] select[id*="-genreId-"]').length === 1, null, {timeout: T});
            await top().locator('select[id*="-genreId-"]').selectOption({label: 'Image'});
            await top().locator('select[id*="-variantType-"]').selectOption({label: 'High resolution'});
            await pressIn('Upload Files'); await waitClosed('Upload Media File');
            await openMedia(C, P);
            await rowMenu('profile-image-400.png', 'Edit Metadata'); await waitWindow('Edit Metadata');
            await fill('Name of the file', 'figure.png'); await pressIn('Save'); await waitClosed('Edit Metadata');
            o.twoNamed = await openMedia(C, P, 'p-14-media-two-named');
            o.twoView = await bookView('p-15-reader-two-named');
            await as(C.u.mg, C.path);
            await openMedia(C, P);
            await rowMenu('figure.png', 'Edit Metadata', {high: false}); await waitWindow('Edit Metadata');
            await fill('Name of the file', 'figure-renamed.png'); await pressIn('Save'); await waitClosed('Edit Metadata');
            o.renamed = await openMedia(C, P, 'p-16-media-renamed');
            o.renamedView = await bookView('p-17-reader-renamed');
            return o;
        }
    } finally {
        await close();
    }
});
