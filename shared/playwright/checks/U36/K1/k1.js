// U36 claim check, chunk K1: the workflow file lists by role and stage, what a list and its row
// menu offer, downloading and deleting (OJS, OMP), OPS's absence of workflow lists and its
// galleys' "Change File" / "More Information".
// Spec: docs/specs/U36-submission-files.md lines 10–74, 108–151, 431–513, 560–584.
//
// OJS/OMP: one scratch context per app (mgr, ed, pe, se, ge {OJS}, ce, le, pr, fu, au, rv, rd) and
// two small review contexts (C2 "open", C3 "anonymous") that re-enrol se, au, rv; submissions:
//   s0  Submission stage, no files                          → empty list, no "Download All Files"
//   s1  Submission stage: article.pdf (author), notes.md (se) → lists and menus by role (d1, d10), downloads (d19)
//   s2  Review, round file article.pdf, rv accepted          → Files for Review / Revisions Uploaded; reviewer download (d9)
//   s2r Review, revisions requested                           → the author's Upload, own revision's menu, Delete
//   s3  Copyediting: article.pdf (note), notes.md             → Draft / Copyedited Files; More Information (d2); Rule 4 copies
//   s4  Production (OJS: a PDF galley)                        → Production Ready Files, Download All; galley windows
//   dr  a draft with article.pdf                              → the submission wizard's "Files" panel
//   c2/c3: s2 in an "open" and an "anonymous" review          → the reviewer's download name at the other ends
// OPS: a scratch server (mgr, mod, au, rd): p1 submitted with a galley, pd a draft → no workflow lists,
// the galley's "Change File" / "More Information", the wizard's first step.
//
//   PROBE_FEATURE=U36 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U36/K1/k1.js
//   PHASES=seed,roles,s0,s1,d1,d19,d10,s2,rev,s2r,s3,s4,wiz,ops   (default all; later phases reuse k1-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const fx = (app, f) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${f}`);
const ALL = ['seed', 'roles', 's0', 's1', 'd1', 'd19', 'd10', 'rev1', 's2', 'rev', 's2r', 's3', 's4', 'wiz', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | ')); record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1200)}); }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const dialogTexts = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
        links: [...d.querySelectorAll('a')].filter((a) => a.getClientRects().length).map((a) => a.innerText.trim()).filter(Boolean).slice(0, 40),
    }))).catch(() => []);
// The workflow dialog as data: headings, buttons, every visible table (name, columns, rows, the row buttons' names, the row links).
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
        rowButtons: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim())),
        rowLinks: [...t.querySelectorAll('tbody tr a')].filter(vis).map((a) => ({text: a.innerText.trim(), target: a.getAttribute('target'), href: (a.getAttribute('href') || '').replace(/^.*\/index\.php/, '').slice(0, 200)})).slice(0, 20),
        numCells: [...t.querySelectorAll('tbody tr')].map((tr) => { const td = tr.querySelector('td'); return td ? {text: td.innerText.trim(), icon: !!td.querySelector('svg, img, [class*=icon], [class*=Icon]')} : null; }),
        after: (() => { let n = t.closest('[class*=FileManager], section, div'); const b = n ? [...n.querySelectorAll('button, a')].filter(vis).map((x) => (x.innerText || x.getAttribute('aria-label') || '').trim()).filter((x) => /Download All|Upload/.test(x)) : []; return b; })(),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const headings = hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 100);
    const links = [...root.querySelectorAll('a')].filter(vis).map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 60);
    const descriptions = hs.map((h) => ({h: h.innerText.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 200) : null})).filter((x) => /Files|Uploaded|Discussions|Participants|Galleys/i.test(x.h)).slice(0, 12);
    const lines = (dlgs[0] ? dlgs[0].innerText : document.body.innerText).split('\n').map((l) => l.trim()).filter(Boolean);
    return {url: location.href, dialogCount: dlgs.length, headings, buttons, links, tables, descriptions, top: lines.slice(0, 40)};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const PDF = isOPS ? fx('ops', 'preprint.pdf') : fx(app.name, 'article.pdf');
    const MD = fx(isOPS ? 'ojs' : app.name, 'notes.md');
    const HTML = isOPS ? fx('ops', 'preprint.html') : fx(app.name, 'article.html');
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.contextPath}${p}`);
    const workflow = (id, key, cp) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const authorWorkflow = (id, key, cp) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const signInAs = async (page, u, cp) => { await signIn(page, u, {contextPath: cp || sc.contextPath}); await idle(page); };
    const u = sc.users || {};
    const S = sc.subs || {};

    async function openWorkflow(page, url, label) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message), tables: [], buttons: [], headings: []}));
        await snap(page, label, {info});
        log(`[${label}]`, 'url:', page.url().replace(/^.*\/index\.php/, '').slice(0, 120), '| headings:', JSON.stringify((info.headings || []).slice(0, 14)), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}[${t.columns.join('/')}]: ${t.rows.join(' || ')}`)).slice(0, 900), '| btns:', JSON.stringify((info.buttons || []).filter((b) => /Upload|Download|Select/.test(b))));
        return info;
    }
    const tableOf = (page, name) => page.locator('[role="dialog"]:visible').first().getByRole('table', {name, exact: true}).first();
    // Every row's "More Actions" entries of a list (the menu opened by its button, read, and closed by the same button).
    async function listMenus(page, tableName, label) {
        const t = tableOf(page, tableName);
        const out = {table: tableName, present: await t.count(), rows: []};
        if (!out.present) { record(`${label}-menus`, out); return out; }
        const rows = t.locator('tbody tr');
        const n = await rows.count();
        for (let i = 0; i < n; i++) {
            const row = rows.nth(i);
            const text = flat(await row.innerText(), 160);
            const btn = row.getByRole('button').first();
            if (!(await btn.count())) { out.rows.push({text, button: null}); continue; }
            const name = await btn.evaluate((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).catch(() => null);
            await btn.click(); await page.waitForTimeout(250);
            const items = await menuItems(page);
            out.rows.push({text, button: name, items: items.map((x) => x.text + (x.disabled ? ' (disabled)' : ''))});
            await btn.click().catch(() => {}); await page.waitForTimeout(200);
            if (await page.locator('[role="menuitem"]:visible').count()) { await page.mouse.click(5, 5).catch(() => {}); await page.waitForTimeout(200); }
        }
        out.aria = await t.ariaSnapshot().catch(() => null);
        record(`${label}-menus`, out);
        log(`[${label} menus ${tableName}]`, JSON.stringify(out.rows.map((r) => `${r.text.slice(0, 40)} => ${r.button}: ${(r.items || []).join(', ')}`)));
        return out;
    }
    async function pressItem(page, tableName, rowText, item, label) {
        const t = tableOf(page, tableName);
        const row = t.locator('tbody tr').filter({hasText: rowText}).first();
        const btn = row.getByRole('button').first();
        await loc(page, `${label}: "${tableName}" row "${rowText}" row menu button`, btn);
        if (!(await btn.count())) return {noButton: true};
        await btn.click(); await page.waitForTimeout(250);
        const mi = page.getByRole('menuitem', {name: item, exact: true}).first();
        await loc(page, `${label}: menu item "${item}"`, mi);
        if (!(await mi.count())) { const items = await menuItems(page); await btn.click().catch(() => {}); return {noItem: true, items}; }
        await mi.click(); await idle(page); await page.waitForTimeout(700); await idle(page);
        return {pressed: true};
    }
    async function waitWindow(page) {
        await topWin(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
    }
    async function closeTop(page) {
        const top = topWin(page);
        const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
        if (await c.count()) { await c.click({timeout: 5000}).catch(() => {}); } else { const x = top.getByRole('button', {name: /Close/}).last(); if (await x.count()) await x.click().catch(() => {}); }
        await idle(page); await page.waitForTimeout(600);
    }
    // A download started by a click: new tab or not, the name, the response headers, the file saved (zip listed).
    async function download(page, locator, label) {
        const ctx = page.context();
        const pagesBefore = ctx.pages().length;
        let dl = null; let popup = null; let resp = null;
        const onDl = (d) => { if (!dl) dl = d; };
        const onPage = (p) => { popup = popup || p; p.on('download', onDl); };
        const onResp = (r) => { if (!resp && /download/i.test(r.url()) && !/\/api\//.test(r.url())) resp = r; };
        page.on('download', onDl); ctx.on('page', onPage); ctx.on('response', onResp);
        await locator.click();
        for (let i = 0; i < 60 && !dl; i++) await page.waitForTimeout(250);
        page.off('download', onDl); ctx.off('page', onPage); ctx.off('response', onResp);
        const out = {newTab: !!popup, pagesBefore, pagesAfter: ctx.pages().length, popupUrl: popup ? popup.url().replace(/^.*\/index\.php/, '').slice(0, 200) : null};
        if (resp) { const h = resp.headers(); out.response = {status: resp.status(), url: resp.url().replace(/^.*\/index\.php/, '').slice(0, 200), contentDisposition: h['content-disposition'] || null, contentType: h['content-type'] || null}; }
        if (dl) {
            out.fileName = dl.suggestedFilename();
            out.url = dl.url().replace(/^.*\/index\.php/, '').slice(0, 200);
            const dir = path.join(outDir(), 'downloads'); fs.mkdirSync(dir, {recursive: true});
            const file = path.join(dir, `${label}-${app.name}-${out.fileName}`.replace(/[^A-Za-z0-9_.-]+/g, '_'));
            await dl.saveAs(file).catch(() => {});
            if (fs.existsSync(file)) {
                out.bytes = fs.statSync(file).size;
                if (/\.zip$/i.test(out.fileName)) { try { out.entries = execSync(`unzip -Z1 ${JSON.stringify(file)}`).toString().trim().split('\n'); } catch (e) { out.entries = String(e.message).slice(0, 200); } }
                if (/\.tar\.gz$/i.test(out.fileName)) { try { out.entries = execSync(`tar tzf ${JSON.stringify(file)}`).toString().trim().split('\n'); } catch (e) { out.entries = String(e.message).slice(0, 200); } }
            }
        } else out.noDownload = true;
        if (popup) { out.popupTitle = await popup.title().catch(() => null); await popup.close().catch(() => {}); }
        record(`${label}-download`, out);
        log(`[${label} download]`, JSON.stringify(out));
        return out;
    }
    // The legacy three-step upload wizard already open: optionally a revision target, a component, the file,
    // a summary of changes, then Continue / Continue / Complete. Records each step.
    async function driveWizard(page, file, label, {component, revise, summary, stopAfterStep, name} = {}) {
        const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        await wiz.waitFor({timeout: 30000});
        await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        await idle(page);
        const w0 = (await dialogTexts(page)).slice(-1)[0];
        const tabs = await wiz.locator('[role=tab]').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), selected: e.getAttribute('aria-selected')}))).catch(() => []);
        const selects = await wiz.locator('select').evaluateAll((els) => els.map((s) => ({id: s.id, name: s.name, label: (document.querySelector(`label[for="${s.id}"]`) || {}).innerText || null, options: [...s.options].map((o) => o.text.trim())}))).catch(() => []);
        const out = {title: w0 && w0.name, tabs, selects, step1Text: flat(w0 && w0.text, 900)};
        if (revise) {
            const rs = wiz.locator('select[id^="revisedFileId"], select[name="revisedFileId"]').first();
            if (await rs.count()) { const o = await rs.locator('option').evaluateAll((els) => els.map((x) => ({t: x.text, v: x.value}))); const p = o.find((x) => x.t.includes(revise)); if (p) await rs.selectOption(p.v); await idle(page); out.revised = p || null; }
        }
        const genre = wiz.locator('select[id^="genreId"]');
        if (!revise && await genre.count()) {
            const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
            const pick = component ? opts.find((o) => o.text === component) : opts.find((o) => o.value && !/^Select/i.test(o.text));
            if (pick) await genre.selectOption(pick.value);
            out.component = pick && pick.text;
        }
        await wiz.locator('input[type="file"]').setInputFiles(file);
        await wiz.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000});
        await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length); return b && !b.disabled; }, null, {timeout: 30000}).catch(() => {});
        await idle(page);
        if (stopAfterStep === 1) { record(`${label}-wizard`, out); return out; }
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
        const w2 = (await dialogTexts(page)).slice(-1)[0];
        out.step2Text = flat(w2 && w2.text, 900);
        if (name) { const nb = wiz.locator('input[name^="name"]').first(); if (await nb.count()) await nb.fill(name); }
        if (summary) {
            const ta = wiz.locator('textarea[id*="summaryOfChanges"]').first();
            out.summaryBox = await ta.count();
            if (await ta.count()) {
                const id = await ta.getAttribute('id');
                await page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, id, {timeout: 20000}).catch(() => {});
                await wiz.frameLocator(`iframe[id^="${id}"]`).locator('body').click();
                await page.keyboard.type(summary); await page.waitForTimeout(300);
                out.summaryTyped = await page.evaluate((i) => window.tinymce.get(i).getContent({format: 'text'}), id).catch(() => null);
            }
        }
        if (stopAfterStep === 2) { record(`${label}-wizard`, out); return out; }
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
        const w3 = (await dialogTexts(page)).slice(-1)[0];
        out.step3Text = flat(w3 && w3.text, 600);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        out.done = true;
        record(`${label}-wizard`, out);
        log(`[${label} wizard]`, JSON.stringify(out.title), JSON.stringify(tabs.map((t) => t.text)), 'component:', out.component, 'revised:', JSON.stringify(out.revised || null));
        return out;
    }
    async function uploadAbove(page, tableName, file, label, opts) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        // the "Upload" button of the named list: the one inside the list's own section
        const sec = dlg.locator('div, section').filter({has: page.getByRole('table', {name: tableName, exact: true})}).filter({has: page.getByRole('button', {name: 'Upload', exact: true})}).last();
        let up = sec.getByRole('button', {name: 'Upload', exact: true}).first();
        if (!(await up.count())) up = dlg.getByRole('button', {name: 'Upload', exact: true}).first();
        await loc(page, `${label}: "Upload" above "${tableName}"`, up);
        if (!(await up.count())) return {noUpload: true};
        await up.click(); await idle(page);
        const w = await driveWizard(page, file, label, opts);
        const info = await wfInfo(page);
        return {wizard: w, tables: info.tables};
    }
    // The legacy "Upload/Select Files" window of the nth such button: record, optionally tick a file (showing all
    // stages when needed) or upload one through its link, then OK.
    async function selectWindow(page, nth, label, {tick, upload} = {}) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        await loc(page, `${label}: "Upload/Select Files" nth ${nth}`, btns.nth(nth));
        await btns.nth(nth).click(); await idle(page); await waitWindow(page);
        await topWin(page).locator('table tr').nth(1).waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(500);
        const grid = async () => topWin(page).evaluate((d) => ({title: d.getAttribute('aria-label'), rows: [...d.querySelectorAll('table tr')].filter((e) => e.offsetParent !== null).map((tr) => { const cb = tr.querySelector('input[type=checkbox]'); return tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 120) + (cb ? (cb.checked ? ' [x]' : ' [ ]') : ''); })})).catch(() => null);
        const g0 = await grid();
        await snap(page, `${label}-selectwin`, {grid: g0});
        if (tick) {
            let row = topWin(page).locator('tr').filter({hasText: tick}).filter({has: page.locator('input[type=checkbox]')}).first();
            if (!(await row.count())) {
                const all = topWin(page).locator('label:has-text("all accessible workflow stages") input[type=checkbox], input[type=checkbox]:not(table input)').first();
                if (await all.count()) { await all.click(); await idle(page); await page.waitForTimeout(800); await idle(page); }
                row = topWin(page).locator('tr').filter({hasText: tick}).filter({has: page.locator('input[type=checkbox]')}).first();
            }
            if (await row.count()) await row.locator('input[type=checkbox]').first().check({force: true});
        }
        if (upload) {
            let up = topWin(page).getByRole('link', {name: /Upload/}).first();
            if (!(await up.count())) up = topWin(page).getByRole('button', {name: /Upload/}).first();
            await up.click(); await idle(page);
            await driveWizard(page, upload, `${label}-up`);
            await page.waitForTimeout(800); await idle(page);
        }
        const g1 = await grid();
        const ok = topWin(page).getByRole('button', {name: /^(OK|Save)$/}).last();
        if (await ok.count()) { await ok.click(); await idle(page); }
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length <= 1, null, {timeout: 15000}).catch(() => {});
        await page.waitForTimeout(600); await idle(page);
        record(`${label}-selectwin`, {before: g0, beforeOk: g1});
        return {before: g0, beforeOk: g1};
    }
    // The legacy "More Information" window already open: title, tabs, the selected one, its text; then Notes.
    async function readInfoCenter(page, label, {addNote} = {}) {
        await waitWindow(page);
        const win = topWin(page);
        const d = (await dialogTexts(page)).slice(-1)[0];
        const tabs = await win.locator('[role=tab]').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), selected: e.getAttribute('aria-selected')}))).catch(() => []);
        await page.waitForTimeout(800); await idle(page);
        const first = (await dialogTexts(page)).slice(-1)[0];
        const out = {title: d && d.name, tabs, historyText: flat(first && first.text, 1500)};
        await snap(page, `${label}-info-history`, {out});
        const notesTab = win.getByRole('tab', {name: /Notes/}).first();
        if (await notesTab.count()) {
            await notesTab.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            const n = (await dialogTexts(page)).slice(-1)[0];
            out.notesText = flat(n && n.text, 1500);
            out.noteDeletes = await win.locator('a:visible, button:visible').filter({hasText: /^\s*Delete\s*$/}).count();
            if (addNote) {
                const ta = win.locator('textarea[name="newNote"], textarea').first();
                if (await ta.count()) {
                    await ta.fill(addNote);
                    const add = win.getByRole('button', {name: 'Add Note', exact: true}).first();
                    await add.click(); await idle(page);
                    const msg = await page.getByText(/Note posted|Note added|posted/i).first().textContent({timeout: 5000}).catch(() => null);
                    await page.waitForTimeout(1000); await idle(page);
                    const n2 = (await dialogTexts(page)).slice(-1)[0];
                    out.afterNote = {message: msg && msg.trim(), text: flat(n2 && n2.text, 1500), deletes: await win.locator('a:visible, button:visible').filter({hasText: /^\s*Delete\s*$/}).count()};
                }
            }
            await snap(page, `${label}-info-notes`, {out});
        }
        record(`${label}-info`, out);
        log(`[${label} info]`, JSON.stringify(out.title), JSON.stringify(tabs), '| history:', flat(out.historyText, 250), '| notes:', flat(out.notesText, 200), '| after:', JSON.stringify(out.afterNote || null).slice(0, 300));
        return out;
    }

    // ---- seed ------------------------------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u36k1');
        const roleUsers = isOPS
            ? [['mgr', 'manager', 'Mira', 'Manager'], ['mod', 'sectionEditor', 'Mo', 'Moderator'], ['au', 'author', 'Ava', 'Author'], ['rd', 'reader', 'Rex', 'Reader']]
            : [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Eddie', 'Editor'], ['pe', 'productionEditor', 'Pat', 'Prodeditor'], ['se', 'sectionEditor', 'Sam', 'Sectioneditor'],
                ...(isOJS ? [['ge', 'guestEditor', 'Gus', 'Guesteditor']] : []), ['ce', 'copyeditor', 'Cleo', 'Copyeditor'], ['le', 'layoutEditor', 'Lee', 'Layouteditor'], ['pr', 'proofreader', 'Pia', 'Proofreader'],
                ['fu', 'funding', 'Fay', 'Funding'], ['au', 'author', 'Ava', 'Author'], ['rv', 'externalReviewer', 'Rae', 'Reviewer'], ['rd', 'reader', 'Rex', 'Reader']];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U36 K1 ${t}`, acronym: 'KONE', contactName: 'K1 Contact', contactEmail: `${t}c@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        save();
        const U = sc.users;
        const part = (k, role) => ({username: U[k], role});
        const subs = {};
        const mk = async (k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: U.au, title: `K1 ${k.toUpperCase()} ${t}`, ...spec});
                subs[k] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, rounds: r.reviewRounds, ras: r.reviewAssignments, files: r.files, galleys: r.galleys};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'files', JSON.stringify(r.files), 'rounds', JSON.stringify(r.reviewRounds), 'ras', JSON.stringify(r.reviewAssignments).slice(0, 300), 'galleys', JSON.stringify(r.galleys));
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); subs[k] = {error: String(e.message).slice(0, 600)}; }
        };
        if (isOPS) {
            await mk('p1', {participants: [part('mod', 'sectionEditor')], galleys: [{label: 'PDF', file: 'preprint.pdf'}]});
            await mk('pd', {submitted: false});
            await mk('pf', {files: [{file: 'preprint.pdf'}]}); // expected 400: OPS has no workflow list
        } else {
            const se = part('se', 'sectionEditor');
            await mk('s0', {participants: [se]});
            await mk('s1', {files: [{file: 'article.pdf'}, {file: 'notes.md', uploader: U.se}], participants: [se, ...(isOJS ? [part('ge', 'guestEditor')] : []), part('fu', 'funding')]});
            await mk('s2', {decisions: ['sendExternalReview'], files: [{file: 'article.pdf'}], reviewRounds: [{files: [{file: 'article.pdf'}], reviewers: [{username: U.rv, status: 'accepted'}]}], participants: [se, part('fu', 'funding')]});
            await mk('s2r', {decisions: ['sendExternalReview', 'requestRevisions'], files: [{file: 'article.pdf'}], reviewRounds: [{files: [{file: 'article.pdf'}]}], participants: [se]});
            await mk('s3', {decisions: ['skipExternalReview'], files: [{file: 'article.pdf', note: 'Seeded note on the source file'}, {file: 'notes.md'}], participants: [se, part('ce', 'copyeditor')]});
            await mk('s4', {decisions: ['skipExternalReview', 'sendToProduction'], files: [{file: 'article.pdf'}], participants: [se, part('pe', 'productionEditor'), part('le', 'layoutEditor'), part('pr', 'proofreader')], ...(isOJS ? {galleys: [{label: 'PDF', file: 'article.pdf'}]} : {})});
            await mk('dr', {submitted: false, files: [{file: 'article.pdf'}]});
            // the other ends of the review mode: an "open" and an "anonymous" review context
            for (const [ck, mode] of [['c2', 'open'], ['c3', 'anonymous']]) {
                const t2 = `${t}${ck}`;
                try {
                    const c = await app.api.createContext({tag: t2, context: {name: `U36 K1 ${ck} ${t}`, acronym: ck.toUpperCase(), contactName: 'K1 Contact', contactEmail: `${t}c@mail.test`}, review: {defaultReviewMode: mode}, users: [{username: U.se, roles: ['sectionEditor']}, {username: U.au, roles: ['author']}, {username: U.rv, roles: ['externalReviewer']}]});
                    const r = await app.api.createSubmission({tag: `${t2}s`, context: c.path || t2, submitter: U.au, title: `K1 ${ck} ${mode} ${t}`, decisions: ['sendExternalReview'], files: [{file: 'article.pdf'}], reviewRounds: [{files: [{file: 'article.pdf'}], reviewers: [{username: U.rv, status: 'accepted'}]}], participants: [se]});
                    subs[ck] = {contextPath: c.path || t2, mode, id: r.submissionId, rounds: r.reviewRounds, ras: r.reviewAssignments, files: r.files};
                    log(`[seed ${ck}]`, JSON.stringify(subs[ck]).slice(0, 500));
                } catch (e) { log(`[seed ${ck} FAILED]`, String(e.message).slice(0, 600)); subs[ck] = {error: String(e.message).slice(0, 600)}; }
            }
        }
        sc.subs = subs; save();
        record('seed', sc);
        return;
    }
    if (!sc.contextPath) { log('[no state: run PHASES=seed first]'); return; }

    // ---- roles: the Roles grid (stage sets) and the Components tab, as the manager ------------
    if (on('roles')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await sect('roles grid', async () => {
                await page.goto(ctxUrl('/management/settings/access')); await idle(page);
                const tab = page.getByRole('tab', {name: 'Roles', exact: true}).first();
                if (await tab.count()) { await tab.click(); await idle(page); }
                await page.locator('table').filter({hasText: /Permission level|Stage|Submission/}).first().waitFor({timeout: 20000}).catch(() => {});
                await idle(page);
                const grid = await page.evaluate(() => [...document.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({head: [...t.querySelectorAll('th')].map((x) => x.innerText.trim()), rows: [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => { const cb = td.querySelector('input[type=checkbox]'); return cb ? (cb.checked ? '[x]' : '[ ]') : td.innerText.trim().replace(/\s+/g, ' '); })).filter((r) => r.length)})));
                await snap(page, 'roles-grid', {grid});
                log('[roles grid]', JSON.stringify(grid).slice(0, 3000));
            });
            await sect('components tab', async () => {
                await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
                const sub = page.getByRole('tab', {name: 'Submission', exact: true}).first();
                if (await sub.count()) { await sub.click(); await idle(page); }
                const comp = page.getByRole('tab', {name: 'Components', exact: true}).first();
                await loc(page, 'Settings › Workflow › Submission › "Components" tab', comp);
                const tabs = await page.getByRole('tab').allInnerTexts();
                if (await comp.count()) { await comp.click(); await idle(page); await page.waitForTimeout(800); await idle(page); }
                const s = await snap(page, 'components-tab', {tabs});
                log('[components]', JSON.stringify(tabs), flat(s.text && s.text.main, 700));
            });
        } finally { await close(); }
    }

    if (isOPS) {
        if (on('ops')) {
            const {page, close} = await launch(app);
            try {
                const p1 = S.p1; const pd = S.pd;
                for (const k of ['mgr', 'mod', 'au']) await sect(`ops ${k}`, async () => {
                    await signInAs(page, u[k]);
                    const url = k === 'au' ? authorWorkflow(p1.id) : workflow(p1.id);
                    const info = await openWorkflow(page, url, `ops-p1-${k}-workflow`);
                    record(`ops-p1-${k}-summary`, {headings: info.headings, tables: info.tables, fileButtons: info.buttons.filter((b) => /Upload|Download|Select Files/.test(b)), stageNav: info.links.slice(0, 30)});
                    // the typed address of another stage's lists
                    for (const key of ['workflow_1', 'workflow_3', 'workflow_4']) {
                        const i2 = await openWorkflow(page, k === 'au' ? authorWorkflow(p1.id, key) : workflow(p1.id, key), `ops-p1-${k}-${key}`);
                        record(`ops-p1-${k}-${key}-summary`, {url: page.url(), headings: i2.headings, tables: i2.tables.map((t) => t.name)});
                    }
                });
                await sect('ops galleys mgr', async () => {
                    await signInAs(page, u.mgr);
                    const info = await openWorkflow(page, workflow(p1.id, `publication_${p1.publicationId}_galleys`), 'ops-p1-mgr-galleys');
                    const gt = info.tables.find((t) => /Galley/i.test(t.name || '')) || info.tables[0];
                    record('ops-p1-mgr-galleys-summary', {tables: info.tables, buttons: info.buttons});
                    const tname = gt && gt.name;
                    if (tname) {
                        const m = await listMenus(page, tname, 'ops-p1-mgr-galley');
                        // "Change File": the upload wizard for the galley's file, left at step 1 with Cancel
                        const r = await pressItem(page, tname, 'PDF', 'Change File', 'ops-p1-mgr-changefile');
                        if (r.pressed) {
                            const w = await driveWizard(page, PDF, 'ops-p1-mgr-changefile', {stopAfterStep: 1}).catch((e) => ({error: String(e.message).slice(0, 200)}));
                            await snap(page, 'ops-p1-mgr-changefile-step1', {w});
                            const dl = (await dialogTexts(page)).slice(-1)[0];
                            record('ops-p1-mgr-changefile', {w, dialog: dl && {name: dl.name, buttons: dl.buttons, text: flat(dl.text, 1500)}});
                            const cancel = topWin(page).getByRole('button', {name: 'Cancel', exact: true}).last();
                            if (await cancel.count()) { await cancel.click(); await idle(page); await page.waitForTimeout(800); }
                            else await closeTop(page);
                            const after = await wfInfo(page);
                            record('ops-p1-mgr-changefile-after', {tables: after.tables, dialogs: (await dialogTexts(page)).map((d) => d.name)});
                        }
                        await openWorkflow(page, workflow(p1.id, `publication_${p1.publicationId}_galleys`), 'ops-p1-mgr-galleys-2');
                        const r2 = await pressItem(page, tname, 'PDF', 'More Information', 'ops-p1-mgr-moreinfo');
                        if (r2.pressed) { await readInfoCenter(page, 'ops-p1-mgr-moreinfo'); await closeTop(page); }
                        log('[ops galley menu]', JSON.stringify(m.rows));
                    }
                });
                await sect('ops wizard', async () => {
                    await signInAs(page, u.au);
                    await page.goto(ctxUrl(`/submission?id=${pd.id}`)); await idle(page);
                    await page.waitForTimeout(1000); await idle(page);
                    const s = await snap(page, 'ops-pd-au-wizard');
                    const steps = await page.locator('nav, [class*=steps], [class*=Steps]').first().innerText().catch(() => null);
                    const heads = await page.locator('h1, h2, h3').allInnerTexts().catch(() => []);
                    record('ops-pd-au-wizard-summary', {steps: flat(steps, 400), heads, fileKind: await page.getByText('What kind of file is this?').count(), filesHeading: heads.filter((h) => /^Files$|Galley/i.test(h.trim()))});
                    log('[ops wizard]', flat(steps, 200), JSON.stringify(heads).slice(0, 400));
                });
                await signOut(page).catch(() => {});
            } finally { await close(); }
        }
        return;
    }

    // ---- s0: an empty "Submission Files" ----------------------------------------------------------
    if (on('s0')) {
        const {page, close} = await launch(app);
        try {
            for (const k of ['mgr', 'au']) await sect(`s0 ${k}`, async () => {
                await signInAs(page, u[k]);
                const info = await openWorkflow(page, k === 'au' ? authorWorkflow(S.s0.id, 'workflow_1') : workflow(S.s0.id, 'workflow_1'), `s0-${k}-submission`);
                const t = info.tables.find((x) => x.name === 'Submission Files');
                const dla = await page.locator('[role="dialog"]:visible').first().getByText('Download All Files', {exact: true}).count();
                const upl = await page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Upload', exact: true}).count();
                record(`s0-${k}-summary`, {table: t, downloadAll: dla, upload: upl});
                log(`[s0 ${k}]`, JSON.stringify(t), 'downloadAll', dla, 'upload', upl);
            });
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- s1: "Submission Files" (article.pdf by the author, notes.md by se) by role ----------------
    if (on('s1')) {
        const {page, close} = await launch(app);
        try {
            const roles = ['admin', 'mgr', 'ed', 'pe', 'se', ...(isOJS ? ['ge'] : []), 'fu', 'ce', 'le', 'au', 'rv', 'rd'];
            const sum = {};
            for (const k of roles) await sect(`s1 ${k}`, async () => {
                const user = k === 'admin' ? 'admin' : u[k];
                await signInAs(page, user);
                const url = k === 'au' ? authorWorkflow(S.s1.id, 'workflow_1') : workflow(S.s1.id, 'workflow_1');
                const info = await openWorkflow(page, url, `s1-${k}-submission`);
                const dlg = page.locator('[role="dialog"]:visible').first();
                const t = info.tables.find((x) => x.name === 'Submission Files');
                sum[k] = {landed: page.url().replace(/^.*\/index\.php/, ''), headings: info.headings.slice(0, 12), table: t ? {columns: t.columns, rows: t.rows, rowButtons: t.rowButtons, rowLinks: t.rowLinks, numCells: t.numCells} : null, otherTables: info.tables.filter((x) => x.name !== 'Submission Files').map((x) => x.name), upload: await dlg.getByRole('button', {name: 'Upload', exact: true}).count(), uploadSelect: await dlg.getByRole('button', {name: 'Upload/Select Files', exact: true}).count(), downloadAll: await dlg.getByText('Download All Files', {exact: true}).count(), top: info.top.slice(0, 12)};
                if (t) sum[k].menus = (await listMenus(page, 'Submission Files', `s1-${k}`)).rows;
                log(`[s1 ${k}]`, JSON.stringify({landed: sum[k].landed, upload: sum[k].upload, downloadAll: sum[k].downloadAll, menus: (sum[k].menus || []).map((r) => `${r.text.slice(0, 25)}: ${r.button} → ${(r.items || []).join('|')}`)}));
            });
            record('s1-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- d1: the Author's "Update File Details" on their own row and on se's row; rename to "Manuscript" ----
    if (on('d1')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await sect('d1 au', async () => {
                await signInAs(page, u.au);
                for (const [rk, rowText] of [['own', 'article.pdf'], ['others', 'notes.md']]) {
                    await openWorkflow(page, authorWorkflow(S.s1.id, 'workflow_1'), `d1-au-${rk}-before`);
                    const r = await pressItem(page, 'Submission Files', rowText, 'Update File Details', `d1-au-${rk}`);
                    if (!r.pressed) { out[rk] = r; continue; }
                    await waitWindow(page);
                    await page.waitForTimeout(800); await idle(page);
                    const d = (await dialogTexts(page)).slice(-1)[0];
                    const nameBox = topWin(page).locator('input[name^="name"]:visible').first();
                    out[rk] = {title: d && d.name, text: flat(d && d.text, 1200), buttons: d && d.buttons, nameBox: await nameBox.count(), nameValue: (await nameBox.count()) ? await nameBox.inputValue() : null};
                    await snap(page, `d1-au-${rk}-editwindow`, {out: out[rk]});
                    if (rk === 'own' && out[rk].nameBox) {
                        await nameBox.fill('Manuscript');
                        const saveBtn = topWin(page).getByRole('button', {name: 'Save', exact: true}).last();
                        await saveBtn.click(); await idle(page); await page.waitForTimeout(1200); await idle(page);
                        const after = await wfInfo(page);
                        out.ownAfterSave = {dialogs: (await dialogTexts(page)).map((x) => x.name), table: after.tables.find((x) => x.name === 'Submission Files')};
                        const i2 = await openWorkflow(page, authorWorkflow(S.s1.id, 'workflow_1'), 'd1-au-own-after-relanded');
                        out.ownRelanded = i2.tables.find((x) => x.name === 'Submission Files');
                    } else await closeTop(page);
                    log(`[d1 au ${rk}]`, JSON.stringify(out[rk]).slice(0, 700));
                }
                // "Download All Files" under the author's list
                await openWorkflow(page, authorWorkflow(S.s1.id, 'workflow_1'), 'd1-au-downloadall-before');
                const dla = page.locator('[role="dialog"]:visible').first().getByText('Download All Files', {exact: true}).first();
                await loc(page, 'd1-au: "Download All Files" under Submission Files', dla);
                out.auDownloadAll = (await dla.count()) ? await download(page, dla, 'd1-au-downloadall') : {absent: true};
            });
            record('d1-summary', out);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- d19: downloads as the manager: the renamed file, a file whose name keeps its extension, the zip ----
    if (on('d19')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await sect('d19 mgr', async () => {
                await signInAs(page, u.mgr);
                let info = await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 'd19-mgr-before');
                let t = info.tables.find((x) => x.name === 'Submission Files');
                if (t && !t.rows.some((r) => /Manuscript/.test(r))) {
                    // the author's rename did not take: rename as the manager
                    const r = await pressItem(page, 'Submission Files', 'article.pdf', 'Update File Details', 'd19-mgr-rename');
                    if (r.pressed) { await waitWindow(page); await page.waitForTimeout(800); const nb = topWin(page).locator('input[name^="name"]:visible').first(); await nb.fill('Manuscript'); await topWin(page).getByRole('button', {name: 'Save', exact: true}).last().click(); await idle(page); await page.waitForTimeout(1200); }
                    out.renamedByManager = true;
                    info = await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 'd19-mgr-before-2');
                    t = info.tables.find((x) => x.name === 'Submission Files');
                }
                out.rows = t && t.rows; out.links = t && t.rowLinks;
                const table = tableOf(page, 'Submission Files');
                const l1 = table.locator('tbody tr').filter({hasText: 'Manuscript'}).locator('a').first();
                await loc(page, 'd19: the "Manuscript" name link', l1);
                out.manuscript = await download(page, l1, 'd19-mgr-manuscript');
                const l2 = table.locator('tbody tr').filter({hasText: 'notes.md'}).locator('a').first();
                out.notes = await download(page, l2, 'd19-mgr-notes');
                const dla = page.locator('[role="dialog"]:visible').first().getByText('Download All Files', {exact: true}).first();
                await loc(page, 'd19: "Download All Files" under Submission Files', dla);
                out.all = (await dla.count()) ? await download(page, dla, 'd19-mgr-downloadall') : {absent: true};
                out.pageAfter = page.url().replace(/^.*\/index\.php/, '');
            });
            record('d19-summary', out);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- rev1: a revision keeps its number (Rule 1), as the manager on s1 ----
    if (on('rev1')) {
        const {page, close} = await launch(app);
        try {
            await sect('rev1 mgr', async () => {
                await signInAs(page, u.mgr);
                const b = await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 'rev1-mgr-before');
                const r = await uploadAbove(page, 'Submission Files', HTML, 'rev1-mgr', {revise: 'notes.md'});
                const a = await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 'rev1-mgr-after');
                record('rev1-summary', {before: b.tables.find((x) => x.name === 'Submission Files'), wizard: r.wizard, after: a.tables.find((x) => x.name === 'Submission Files')});
            });
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    const rkey = (s) => { const r = (s.rounds || [])[0]; return r ? `workflow_${r.stageId}_${r.id}` : 'workflow_3'; };
    const dlgBtn = (page, name) => page.locator('[role="dialog"]:visible').first().getByRole('button', {name, exact: true});
    const dlgText = (page, text) => page.locator('[role="dialog"]:visible').first().getByText(text, {exact: true});
    async function listsSummary(page, label) {
        const info = await wfInfo(page);
        const out = {tables: info.tables.filter((t) => !/Discussions/.test(t.name || '')).map((t) => ({name: t.name, columns: t.columns, rows: t.rows, rowButtons: t.rowButtons, links: t.rowLinks.length})), upload: await dlgBtn(page, 'Upload').count(), uploadSelect: await dlgBtn(page, 'Upload/Select Files').count(), downloadAll: await dlgText(page, 'Download All Files').count(), uploadRevisions: await page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /Upload revisions/i}).count(), headings: info.headings.slice(0, 14)};
        record(`${label}-lists`, out);
        return out;
    }

    // "OK" in the open "Delete" dialog, watching the page for any message that appears (for a few seconds) and the request's answer.
    async function confirmDelete(page, label) {
        await page.evaluate(() => {
            window.__k1seen = [];
            window.__k1obs && window.__k1obs.disconnect();
            window.__k1obs = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const t = (n.innerText || n.textContent || '').trim(); if (t && t.length < 300) window.__k1seen.push(t.replace(/\s+/g, ' ')); } });
            window.__k1obs.observe(document.body, {childList: true, subtree: true});
        });
        const resp = page.waitForResponse((r) => /delete-file|deleteFile/.test(r.url()), {timeout: 15000}).catch(() => null);
        await topWin(page).getByRole('button', {name: 'OK', exact: true}).first().click();
        const r = await resp;
        await page.waitForTimeout(4000); await idle(page);
        const seen = await page.evaluate(() => { window.__k1obs && window.__k1obs.disconnect(); return window.__k1seen; });
        const out = {response: r ? {status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 200), body: flat(await r.text().catch(() => ''), 300)} : null, seen: [...new Set(seen)].filter((t) => !/^\d+$/.test(t)).slice(0, 30), removedFileSeen: seen.some((t) => /Removed file/.test(t))};
        record(`${label}-confirm`, out);
        return out;
    }
    // ---- s2: a review round (round file article.pdf, rv accepted) by role; the editor's download ----
    if (on('s2')) {
        const {page, close} = await launch(app);
        try {
            const sum = {};
            for (const k of ['mgr', 'se', 'fu', 'ce', 'au']) await sect(`s2 ${k}`, async () => {
                await signInAs(page, u[k]);
                await openWorkflow(page, k === 'au' ? authorWorkflow(S.s2.id, rkey(S.s2)) : workflow(S.s2.id, rkey(S.s2)), `s2-${k}-review`);
                sum[k] = await listsSummary(page, `s2-${k}`);
                for (const t of sum[k].tables) sum[k][`menus:${t.name}`] = (await listMenus(page, t.name, `s2-${k}-${String(t.name).replace(/\W+/g, '')}`)).rows;
                log(`[s2 ${k}]`, JSON.stringify(sum[k]).slice(0, 900));
                if (k === 'au') {
                    // the author's "Upload" above "Revisions Uploaded" on a round that asked for no revisions
                    const up = dlgBtn(page, 'Upload').first();
                    await loc(page, 's2-au: "Upload" above "Revisions Uploaded" (no revisions requested)', up);
                    if (await up.count()) {
                        await up.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
                        const d0 = (await dialogTexts(page)).slice(-1)[0];
                        sum.auUpload = {opened: {name: d0 && d0.name, text: flat(d0 && d0.text, 900), buttons: d0 && d0.buttons}};
                        await snap(page, 's2-au-upload-opened', sum.auUpload);
                        const w = await driveWizard(page, PDF, 's2-au-upload', {stopAfterStep: 1}).catch((e) => ({error: String(e.message).slice(0, 300)}));
                        const d1 = (await dialogTexts(page)).slice(-1)[0];
                        sum.auUpload.step1 = {w, text: flat(d1 && d1.text, 900), buttons: d1 && d1.buttons};
                        await snap(page, 's2-au-upload-step1', sum.auUpload.step1);
                        const cancel = topWin(page).getByRole('button', {name: 'Cancel', exact: true}).last();
                        if (await cancel.count()) { await cancel.click(); await idle(page); await page.waitForTimeout(800); } else await closeTop(page);
                        await openWorkflow(page, authorWorkflow(S.s2.id, rkey(S.s2)), 's2-au-after-upload-try');
                        sum.auUpload.after = await listsSummary(page, 's2-au-after-upload-try');
                        log('[s2 au upload]', JSON.stringify(sum.auUpload).slice(0, 2000));
                    }
                }
                if (k === 'se') {
                    const l = tableOf(page, 'Files for Review').locator('tbody tr a').first();
                    await loc(page, 's2-se: the file name link in "Files for Review"', l);
                    sum.seDownload = (await l.count()) ? await download(page, l, 's2-se-filesforreview') : {absent: true};
                }
            });
            record('s2-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- rev: the reviewer's download name, double-anonymous (s2), open (c2), anonymous (c3); editors' control on c2/c3 ----
    if (on('rev')) {
        const {page, close} = await launch(app);
        try {
            const sum = {};
            for (const [k, sub, cp] of [['s2', S.s2, null], ['c2', S.c2, S.c2 && S.c2.contextPath], ['c3', S.c3, S.c3 && S.c3.contextPath]]) await sect(`rev ${k}`, async () => {
                if (!sub || sub.error) return;
                await signInAs(page, u.rv, cp);
                const ra = (sub.ras || [])[0];
                await page.goto(ctxUrl(`/reviewer/submission?submissionId=${sub.id}&reviewId=${ra.id}`, cp)); await idle(page);
                await page.waitForTimeout(800); await idle(page);
                const s = await snap(page, `rev-${k}-rv-step1`);
                const links = await page.locator('a:visible').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: (a.getAttribute('href') || '').replace(/^.*\/index\.php/, '').slice(0, 200), target: a.getAttribute('target')})).filter((a) => /download|\.pdf|article/i.test(a.href + a.text)));
                sum[k] = {mode: sub.mode || 'default (Anonymous Reviewer/Anonymous Author)', links, reviewType: (s.text.main || '').match(/Review Type[\s\S]{0,80}/) ? (s.text.main || '').match(/Review Type[\s\S]{0,80}/)[0].replace(/\s+/g, ' ') : null};
                const l = page.locator('a:visible').filter({hasText: /article|\.pdf/i}).first();
                await loc(page, `rev-${k}: the review file's name link on step 1`, l);
                if (await l.count()) sum[k].download = await download(page, l, `rev-${k}-rv`);
                if (cp) {
                    await signInAs(page, u.se, cp);
                    await openWorkflow(page, workflow(sub.id, rkey(sub), cp), `rev-${k}-se-review`);
                    const l2 = tableOf(page, 'Files for Review').locator('tbody tr a').first();
                    if (await l2.count()) sum[k].seDownload = await download(page, l2, `rev-${k}-se`);
                }
                log(`[rev ${k}]`, JSON.stringify(sum[k]).slice(0, 800));
            });
            record('rev-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- s2r: revisions requested: the author's "Upload" on "Revisions Uploaded", their row's menu, Delete ----
    if (on('s2r')) {
        const {page, close} = await launch(app);
        try {
            const sum = {};
            await sect('s2r au', async () => {
                await signInAs(page, u.au);
                await openWorkflow(page, authorWorkflow(S.s2r.id, rkey(S.s2r)), 's2r-au-before');
                sum.before = await listsSummary(page, 's2r-au-before');
                sum.up1 = await uploadAbove(page, 'Revisions Uploaded', PDF, 's2r-au-up1', {summary: 'Corrected figures in section 2.'});
                sum.up2 = await uploadAbove(page, 'Revisions Uploaded', MD, 's2r-au-up2');
                await openWorkflow(page, authorWorkflow(S.s2r.id, rkey(S.s2r)), 's2r-au-after-uploads');
                sum.after = await listsSummary(page, 's2r-au-after');
                sum.menus = (await listMenus(page, 'Revisions Uploaded', 's2r-au')).rows;
                // Delete: Cancel first, then OK
                const r = await pressItem(page, 'Revisions Uploaded', 'notes.md', 'Delete', 's2r-au-delete');
                if (r.pressed) {
                    const d = (await dialogTexts(page)).slice(-1)[0];
                    sum.deleteDialog = {name: d && d.name, text: flat(d && d.text, 400), buttons: d && d.buttons};
                    await snap(page, 's2r-au-delete-dialog', {d: sum.deleteDialog});
                    await topWin(page).getByRole('button', {name: 'Cancel', exact: true}).first().click(); await idle(page); await page.waitForTimeout(500);
                    sum.afterCancel = (await wfInfo(page)).tables.find((x) => x.name === 'Revisions Uploaded');
                    await pressItem(page, 'Revisions Uploaded', 'notes.md', 'Delete', 's2r-au-delete2');
                    sum.confirm = await confirmDelete(page, 's2r-au-delete2');
                    await snap(page, 's2r-au-after-delete');
                    sum.afterOk = (await wfInfo(page)).tables.find((x) => x.name === 'Revisions Uploaded');
                } else sum.deleteMissing = r;
                log('[s2r au]', JSON.stringify(sum).slice(0, 2500));
            });
            await sect('s2r se', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.s2r.id, rkey(S.s2r)), 's2r-se-review');
                sum.se = await listsSummary(page, 's2r-se');
                sum.seMenus = (await listMenus(page, 'Revisions Uploaded', 's2r-se')).rows;
                log('[s2r se]', JSON.stringify({se: sum.se, menus: sum.seMenus}).slice(0, 1500));
            });
            record('s2r-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- s3: Copyediting: copies into "Draft Files", an upload into "Copyedited Files", More Information (d2), Rule 4 ----
    if (on('s3')) {
        const k3 = process.env.S3KEY || 's3';
        if (!S[k3]) {
            const U = sc.users;
            const r = await app.api.createSubmission({tag: `${sc.tag}${k3}`, context: sc.contextPath, submitter: U.au, title: `K1 ${k3.toUpperCase()} ${sc.tag}`, decisions: ['skipExternalReview'], files: [{file: 'article.pdf', note: 'Seeded note on the source file'}, {file: 'notes.md'}], participants: [{username: U.se, role: 'sectionEditor'}, {username: U.ce, role: 'copyeditor'}]});
            S[k3] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, files: r.files}; sc.subs = S; save();
            log(`[seed ${k3}]`, JSON.stringify(S[k3]));
        }
        const S3 = S[k3];
        const {page, close} = await launch(app);
        try {
            const sum = {key: k3};
            await sect('s3 mgr setup', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S3.id, 'workflow_4'), 's3-mgr-before');
                sum.before = await listsSummary(page, 's3-mgr-before');
                if (!(sum.before.tables.find((t) => t.name === 'Draft Files') || {rows: []}).rows.some((r) => /article\.pdf/.test(r))) {
                    sum.copy1 = await selectWindow(page, 0, 's3-mgr-draft-copy-pdf', {tick: 'article.pdf'});
                    await openWorkflow(page, workflow(S3.id, 'workflow_4'), 's3-mgr-after-copy1');
                    sum.copy2 = await selectWindow(page, 0, 's3-mgr-draft-copy-md', {tick: 'notes.md'});
                    await openWorkflow(page, workflow(S3.id, 'workflow_4'), 's3-mgr-after-copy2');
                    sum.upCe = await selectWindow(page, 1, 's3-mgr-copyedited-upload', {upload: PDF});
                }
                await openWorkflow(page, workflow(S3.id, 'workflow_4'), 's3-mgr-after');
                sum.after = await listsSummary(page, 's3-mgr-after');
                sum.mgrDraftMenus = (await listMenus(page, 'Draft Files', 's3-mgr-draft')).rows;
                sum.mgrCeMenus = (await listMenus(page, 'Copyedited Files', 's3-mgr-copyedited')).rows;
                log('[s3 mgr]', JSON.stringify({after: sum.after, draft: sum.mgrDraftMenus, ce: sum.mgrCeMenus}).slice(0, 2500));
            });
            await sect('s3 ce', async () => {
                await signInAs(page, u.ce);
                await openWorkflow(page, workflow(S3.id, 'workflow_4'), 's3-ce-copyediting');
                sum.ce = await listsSummary(page, 's3-ce');
                sum.ceDraftMenus = (await listMenus(page, 'Draft Files', 's3-ce-draft')).rows;
                sum.ceCeMenus = (await listMenus(page, 'Copyedited Files', 's3-ce-copyedited')).rows;
                const r = await pressItem(page, 'Draft Files', 'article.pdf', 'More Information', 's3-ce-moreinfo');
                if (r.pressed) sum.ceInfo = await readInfoCenter(page, 's3-ce-moreinfo', {addNote: 'Checked'});
                await closeTop(page);
                // the Submission stage, outside the Copyeditor's stage set
                await openWorkflow(page, workflow(S3.id, 'workflow_1'), 's3-ce-submission');
                sum.ceAtSubmission = await listsSummary(page, 's3-ce-submission');
                log('[s3 ce]', JSON.stringify({ce: sum.ce, draft: sum.ceDraftMenus, info: sum.ceInfo, atSub: sum.ceAtSubmission}).slice(0, 3000));
            });
            for (const k of ['mgr', 'se']) await sect(`s3 ${k} info`, async () => {
                await signInAs(page, u[k]);
                await openWorkflow(page, workflow(S3.id, 'workflow_4'), `s3-${k}-info-before`);
                const r = await pressItem(page, 'Draft Files', 'article.pdf', 'More Information', `s3-${k}-moreinfo`);
                if (r.pressed) sum[`${k}Info`] = await readInfoCenter(page, `s3-${k}-moreinfo`);
                await closeTop(page);
            });
            await sect('s3 au', async () => {
                await signInAs(page, u.au);
                await openWorkflow(page, authorWorkflow(S3.id, 'workflow_4'), 's3-au-copyediting');
                sum.au = await listsSummary(page, 's3-au');
                sum.auCeMenus = (await listMenus(page, 'Copyedited Files', 's3-au-copyedited')).rows;
                log('[s3 au]', JSON.stringify({au: sum.au, menus: sum.auCeMenus}).slice(0, 1500));
            });
            // Rule 4 on "Submission Files": the dialog, Cancel, OK, "Removed file."; the copy in "Draft Files"
            await sect('s3 rule4', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S3.id, 'workflow_1'), 's3-mgr-r4-before');
                const r = await pressItem(page, 'Submission Files', 'article.pdf', 'Delete', 's3-mgr-r4-delete');
                if (!r.pressed) { sum.r4 = r; return; }
                const d = (await dialogTexts(page)).slice(-1)[0];
                sum.r4 = {dialog: {name: d && d.name, text: flat(d && d.text, 400), buttons: d && d.buttons}};
                await snap(page, 's3-mgr-r4-dialog', {d: sum.r4.dialog});
                await loc(page, 's3-r4: the Delete dialog', page.getByRole('dialog', {name: 'Delete'}));
                await topWin(page).getByRole('button', {name: 'Cancel', exact: true}).first().click(); await idle(page); await page.waitForTimeout(500);
                sum.r4.afterCancel = (await wfInfo(page)).tables.find((x) => x.name === 'Submission Files');
                await pressItem(page, 'Submission Files', 'article.pdf', 'Delete', 's3-mgr-r4-delete2');
                sum.r4.confirm = await confirmDelete(page, 's3-mgr-r4-delete2');
                await snap(page, 's3-mgr-r4-after-ok');
                sum.r4.afterOk = (await wfInfo(page)).tables.find((x) => x.name === 'Submission Files');
                await openWorkflow(page, workflow(S3.id, 'workflow_4'), 's3-mgr-r4-draft-after');
                sum.r4.draftAfter = await listsSummary(page, 's3-mgr-r4-draft-after');
                const r2 = await pressItem(page, 'Draft Files', 'article.pdf', 'More Information', 's3-mgr-r4-copyinfo');
                if (r2.pressed) { sum.r4.copyInfo = await readInfoCenter(page, 's3-mgr-r4-copyinfo'); await closeTop(page); }
                // empty the list: the last file deleted
                await openWorkflow(page, workflow(S3.id, 'workflow_1'), 's3-mgr-r4-before-last');
                await pressItem(page, 'Submission Files', 'notes.md', 'Delete', 's3-mgr-r4-delete-last');
                sum.r4.confirmLast = await confirmDelete(page, 's3-mgr-r4-delete-last');
                sum.r4.emptySamePage = await listsSummary(page, 's3-mgr-r4-empty-samepage');
                await openWorkflow(page, workflow(S3.id, 'workflow_1'), 's3-mgr-r4-empty-relanded');
                sum.r4.emptyRelanded = await listsSummary(page, 's3-mgr-r4-empty-relanded');
                log('[s3 rule4]', JSON.stringify(sum.r4).slice(0, 3000));
            });
            record(`${k3}-summary`, sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- ctl: the unassigned control: a submitted submission with one file and no participants, read by se, ge {OJS}, fu, pe ----
    if (on('ctl')) {
        if (!S.s5) {
            const r = await app.api.createSubmission({tag: `${sc.tag}s5`, context: sc.contextPath, submitter: u.au, title: `K1 S5 unassigned ${sc.tag}`, files: [{file: 'article.pdf'}]});
            S.s5 = {id: r.submissionId, publicationId: r.publicationId}; sc.subs = S; save();
        }
        const {page, close} = await launch(app);
        try {
            const sum = {};
            for (const k of ['se', ...(isOJS ? ['ge'] : []), 'fu', 'pe']) await sect(`ctl ${k}`, async () => {
                await signInAs(page, u[k]);
                await openWorkflow(page, workflow(S.s5.id, 'workflow_1'), `ctl-${k}-unassigned-submission`);
                const d = (await dialogTexts(page)).slice(-1)[0];
                sum[k] = {lists: await listsSummary(page, `ctl-${k}`), dialog: d && {name: d.name, text: flat(d.text, 300)}};
                log(`[ctl ${k}]`, JSON.stringify(sum[k]).slice(0, 700));
            });
            record('ctl-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- dep: Rule 4's "its dependent files go with it": a dependent file on s1's HTML file, the HTML file deleted, the Activity Log read ----
    if (on('dep')) {
        if (!S.s6) {
            const r = await app.api.createSubmission({tag: `${sc.tag}s6`, context: sc.contextPath, submitter: u.au, title: `K1 S6 html ${sc.tag}`, files: [{file: 'article.html'}]});
            S.s6 = {id: r.submissionId, publicationId: r.publicationId}; sc.subs = S; save();
        }
        const {page, close} = await launch(app);
        try {
            const sum = {};
            await sect('dep mgr', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s6.id, 'workflow_1'), 'dep-mgr-before');
                const r = await pressItem(page, 'Submission Files', 'article.html', 'Update File Details', 'dep-mgr-edit');
                if (!r.pressed) { sum.edit = r; return; }
                await waitWindow(page); await page.waitForTimeout(800); await idle(page);
                const d0 = (await dialogTexts(page)).slice(-1)[0];
                sum.edit = {name: d0 && d0.name, text: flat(d0 && d0.text, 900), links: d0 && d0.links};
                await snap(page, 'dep-mgr-edit-window', sum.edit);
                let up = topWin(page).locator('[id^="component-grid-files-dependent"]').getByRole('link', {name: /Upload/}).first();
                if (!(await up.count())) up = topWin(page).getByRole('link', {name: /^\s*Upload File\s*$/}).first();
                await loc(page, 'dep: "Upload a Dependent File" in the "Edit a file" window', up);
                if (await up.count()) {
                    await up.click(); await idle(page);
                    sum.depWizard = await driveWizard(page, fx(app.name, 'profile-image-400.png'), 'dep-mgr-depwizard').catch((e) => ({error: String(e.message).slice(0, 300)}));
                    await page.waitForTimeout(800); await idle(page);
                    const d1 = (await dialogTexts(page)).slice(-1)[0];
                    sum.editAfter = {name: d1 && d1.name, text: flat(d1 && d1.text, 900)};
                    await snap(page, 'dep-mgr-edit-after-dependent', sum.editAfter);
                }
                await closeTop(page);
                await openWorkflow(page, workflow(S.s6.id, 'workflow_1'), 'dep-mgr-before-delete');
                const r2 = await pressItem(page, 'Submission Files', 'article.html', 'Delete', 'dep-mgr-delete');
                if (r2.pressed) sum.confirm = await confirmDelete(page, 'dep-mgr-delete');
                await openWorkflow(page, workflow(S.s6.id, 'workflow_1'), 'dep-mgr-after-delete');
                const al = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Activity Log', exact: true}).first();
                await loc(page, 'dep: the workflow header\'s "Activity Log"', al);
                if (await al.count()) {
                    await al.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
                    const d2 = (await dialogTexts(page)).slice(-1)[0];
                    const lines = (d2 && d2.text || '').split('\n').map((l) => l.trim()).filter((l) => /deleted|removed|dependent|profile-image|article\.html/i.test(l));
                    sum.activity = {name: d2 && d2.name, lines: lines.slice(0, 40)};
                    await snap(page, 'dep-mgr-activitylog', sum.activity);
                }
                log('[dep]', JSON.stringify(sum).slice(0, 3000));
            });
            record('dep-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- alog: the Activity Log of the Rule 4 submission (does the vanished Draft copy leave a line?) ----
    if (on('alog')) {
        const S3 = S[process.env.S3KEY || 's3b'];
        const {page, close} = await launch(app);
        try {
            await sect('alog', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S3.id, 'workflow_4'), 'alog-mgr-copyediting');
                const al = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Activity Log', exact: true}).first();
                await al.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
                const d2 = (await dialogTexts(page)).slice(-1)[0];
                const lines = (d2 && d2.text || '').split('\n').map((l) => l.trim()).filter((l) => /\d{4}-\d\d-\d\d\t/.test(l));
                record('alog-summary', {key: process.env.S3KEY || 's3b', lines});
                await snap(page, 'alog-mgr-activitylog');
                log('[alog]', JSON.stringify(lines).slice(0, 3000));
            });
        } finally { await close(); }
    }

    // ---- leave: windows left with something typed and unsaved ("Edit a file" name, a "Notes" text); the file link's answer headers ----
    if (on('leave')) {
        const {page, close} = await launch(app);
        try {
            const sum = {};
            const browserDialogs = [];
            page.on('dialog', (d) => { browserDialogs.push({type: d.type(), message: d.message()}); d.dismiss().catch(() => {}); });
            await sect('leave mgr', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 'leave-mgr-before');
                // the file link's GET, as the link sends it: status and headers only
                const href = await tableOf(page, 'Submission Files').locator('tbody tr a').first().getAttribute('href');
                const resp = await page.context().request.get(href);
                sum.linkAnswer = {status: resp.status(), contentType: resp.headers()['content-type'], contentDisposition: resp.headers()['content-disposition']};
                // "Edit a file": the name changed, then the window's "Cancel"
                let r = await pressItem(page, 'Submission Files', 'Manuscript', 'Update File Details', 'leave-mgr-edit');
                if (r.pressed) {
                    await waitWindow(page); await page.waitForTimeout(600);
                    const nb = topWin(page).locator('input[name^="name"]:visible').first();
                    await nb.fill('Changed but not saved');
                    await topWin(page).getByRole('button', {name: 'Cancel', exact: true}).last().click(); await idle(page); await page.waitForTimeout(800);
                    sum.editCancel = {dialogs: (await dialogTexts(page)).map((d) => d.name), browserDialogs: [...browserDialogs]};
                    const i = await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 'leave-mgr-after-edit-cancel');
                    sum.editCancel.rows = (i.tables.find((t) => t.name === 'Submission Files') || {}).rows;
                }
                // "More Information" › "Notes": text typed, then the window closed with its back arrow / Close
                r = await pressItem(page, 'Submission Files', 'Manuscript', 'More Information', 'leave-mgr-info');
                if (r.pressed) {
                    await waitWindow(page);
                    const win = topWin(page);
                    await win.getByRole('tab', {name: /Notes/}).first().click(); await idle(page); await page.waitForTimeout(800);
                    await win.locator('textarea').first().fill('Typed and not added');
                    await closeTop(page);
                    sum.infoLeave = {dialogs: (await dialogTexts(page)).map((d) => d.name), browserDialogs: [...browserDialogs]};
                    await snap(page, 'leave-mgr-info-closed-unsaved', sum.infoLeave);
                    // leaving the page: the first attempt answers the browser's prompt with "Stay" (dismiss), the second with "Leave"
                    try { await page.goto(workflow(S.s1.id, 'workflow_1')); sum.infoLeave.firstGoto = 'navigated'; } catch (e) { sum.infoLeave.firstGoto = String(e.message).split('\n')[0].slice(0, 160); }
                    sum.infoLeave.browserDialogsOnLeave = [...browserDialogs];
                    page.removeAllListeners('dialog');
                    page.on('dialog', (d) => { browserDialogs.push({type: d.type(), message: d.message(), accepted: true}); d.accept().catch(() => {}); });
                    await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 'leave-mgr-after-info');
                    sum.infoLeave.browserDialogsAfter = [...browserDialogs];
                    const r2 = await pressItem(page, 'Submission Files', 'Manuscript', 'More Information', 'leave-mgr-info2');
                    if (r2.pressed) { sum.infoAfter = await readInfoCenter(page, 'leave-mgr-info2'); await closeTop(page); }
                }
                log('[leave]', JSON.stringify(sum).slice(0, 2500));
            });
            record('leave-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- hist: the Copyeditor's "History" tab, watched for 10 s with its request's answer; the Draft copies after the sources went ----
    if (on('hist')) {
        const S3 = S[process.env.S3KEY || 's3b'];
        const {page, close} = await launch(app);
        try {
            const sum = {};
            await sect('hist', async () => {
                for (const k of ['ce', 'mgr']) {
                    await signInAs(page, u[k]);
                    await openWorkflow(page, workflow(S3.id, 'workflow_4'), `hist-${k}-copyediting`);
                    sum[`${k}Lists`] = await listsSummary(page, `hist-${k}-copyediting`);
                    const resps = [];
                    const onR = async (r) => { if (/event-?log/i.test(r.url())) resps.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 220), body: flat(await r.text().catch(() => ''), 400)}); };
                    page.on('response', onR);
                    const r = await pressItem(page, 'Copyedited Files', 'article.pdf', 'More Information', `hist-${k}`);
                    if (r.pressed) {
                        await waitWindow(page);
                        const t0 = Date.now();
                        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && !/Loading/.test(d.innerText); }, null, {timeout: 10000}).catch(() => {});
                        const d = (await dialogTexts(page)).slice(-1)[0];
                        sum[k] = {waitedMs: Date.now() - t0, text: flat(d && d.text, 1200), responses: resps};
                        await snap(page, `hist-${k}-history-10s`, sum[k]);
                        await closeTop(page);
                    }
                    page.off('response', onR);
                    log(`[hist ${k}]`, JSON.stringify(sum[k]).slice(0, 1500), '| lists:', JSON.stringify(sum[`${k}Lists`].tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)));
                }
            });
            record('hist-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- s4: Production: "Production Ready Files" empty then with files; Download All; menus by role; galleys (OJS) ----
    if (on('s4')) {
        const {page, close} = await launch(app);
        try {
            const sum = {};
            await sect('s4 mgr', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s4.id, 'workflow_5'), 's4-mgr-before');
                sum.before = await listsSummary(page, 's4-mgr-before');
                const t = sum.before.tables.find((x) => x.name === 'Production Ready Files');
                if (t && !t.rows.some((r) => /article\.pdf/.test(r))) {
                    sum.up1 = (await uploadAbove(page, 'Production Ready Files', PDF, 's4-mgr-up1')).wizard;
                    sum.up2 = (await uploadAbove(page, 'Production Ready Files', MD, 's4-mgr-up2')).wizard;
                }
                await openWorkflow(page, workflow(S.s4.id, 'workflow_5'), 's4-mgr-after');
                sum.after = await listsSummary(page, 's4-mgr-after');
                sum.mgrMenus = (await listMenus(page, 'Production Ready Files', 's4-mgr')).rows;
                const dla = dlgText(page, 'Download All Files').first();
                await loc(page, 's4-mgr: "Download All Files" under Production Ready Files', dla);
                sum.downloadAll = (await dla.count()) ? await download(page, dla, 's4-mgr-downloadall') : {absent: true};
                log('[s4 mgr]', JSON.stringify(sum).slice(0, 2500));
            });
            for (const k of ['pe', 'se', 'le', 'pr', 'au']) await sect(`s4 ${k}`, async () => {
                await signInAs(page, u[k]);
                await openWorkflow(page, k === 'au' ? authorWorkflow(S.s4.id, 'workflow_5') : workflow(S.s4.id, 'workflow_5'), `s4-${k}-production`);
                sum[k] = await listsSummary(page, `s4-${k}`);
                if (sum[k].tables.some((x) => x.name === 'Production Ready Files')) sum[`${k}Menus`] = (await listMenus(page, 'Production Ready Files', `s4-${k}`)).rows;
                if (k === 'pe') { await openWorkflow(page, workflow(S.s4.id, 'workflow_1'), 's4-pe-assigned-submission'); sum.peAssignedAtSubmission = await listsSummary(page, 's4-pe-assigned-submission'); }
                log(`[s4 ${k}]`, JSON.stringify({lists: sum[k], menus: sum[`${k}Menus`], peSub: k === 'pe' ? sum.peAssignedAtSubmission : undefined}).slice(0, 1500));
            });
            if (isOJS) await sect('s4 galleys', async () => {
                await signInAs(page, u.mgr);
                const info = await openWorkflow(page, workflow(S.s4.id, `publication_${S.s4.publicationId}_galleys`), 's4-mgr-galleys');
                const gt = info.tables.find((t) => /Galley/i.test(t.name || '')) || info.tables[0];
                sum.galleyTables = info.tables;
                if (gt) {
                    sum.galleyMenus = (await listMenus(page, gt.name, 's4-mgr-galley')).rows;
                    const r = await pressItem(page, gt.name, 'PDF', 'Change File', 's4-mgr-changefile');
                    if (r.pressed) {
                        const w = await driveWizard(page, PDF, 's4-mgr-changefile', {stopAfterStep: 1}).catch((e) => ({error: String(e.message).slice(0, 200)}));
                        const dl = (await dialogTexts(page)).slice(-1)[0];
                        sum.changeFile = {w, dialog: dl && {name: dl.name, buttons: dl.buttons, text: flat(dl.text, 1500)}};
                        await snap(page, 's4-mgr-changefile-step1', sum.changeFile);
                        const cancel = topWin(page).getByRole('button', {name: 'Cancel', exact: true}).last();
                        if (await cancel.count()) { await cancel.click(); await idle(page); await page.waitForTimeout(800); } else await closeTop(page);
                    }
                    await openWorkflow(page, workflow(S.s4.id, `publication_${S.s4.publicationId}_galleys`), 's4-mgr-galleys-2');
                    const r2 = await pressItem(page, gt.name, 'PDF', 'More Information', 's4-mgr-galley-moreinfo');
                    if (r2.pressed) { sum.galleyInfo = await readInfoCenter(page, 's4-mgr-galley-moreinfo'); await closeTop(page); }
                }
                log('[s4 galleys]', JSON.stringify({menus: sum.galleyMenus, cf: sum.changeFile && sum.changeFile.dialog && sum.changeFile.dialog.name}).slice(0, 800));
            });
            record('s4-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- wiz: the submission wizard's "Files" panel on a draft; the wizard address of a submitted submission ----
    if (on('wiz')) {
        const {page, close} = await launch(app);
        try {
            const sum = {};
            await sect('wiz au', async () => {
                await signInAs(page, u.au);
                await page.goto(ctxUrl(`/submission?id=${S.dr.id}`)); await idle(page); await page.waitForTimeout(1000); await idle(page);
                const s = await snap(page, 'wiz-au-draft');
                sum.draft = {url: page.url().replace(/^.*\/index\.php/, ''), heads: await page.locator('h1, h2, h3').allInnerTexts().catch(() => []), text: flat(s.text && s.text.main, 1500), kindPrompt: await page.getByText('What kind of file is this?').count()};
                const edit = page.getByRole('button', {name: /^Edit/}).first();
                await loc(page, 'wiz: the file row\'s "Edit" in the "Files" panel', edit);
                if (await edit.count()) {
                    await edit.click(); await idle(page); await page.waitForTimeout(800);
                    const d = (await dialogTexts(page)).slice(-1)[0];
                    sum.editPanel = {name: d && d.name, text: flat(d && d.text, 800), buttons: d && d.buttons};
                    await snap(page, 'wiz-au-draft-edit', sum.editPanel);
                    await closeTop(page);
                }
                await page.goto(ctxUrl(`/submission?id=${S.s1.id}`)); await idle(page); await page.waitForTimeout(800);
                const s2 = await snap(page, 'wiz-au-submitted');
                sum.submitted = {url: page.url().replace(/^.*\/index\.php/, ''), title: s2.title, text: flat(s2.text && s2.text.main, 600)};
                log('[wiz]', JSON.stringify(sum).slice(0, 2500));
            });
            record('wiz-summary', sum);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    log('[done]', app.name);
});
