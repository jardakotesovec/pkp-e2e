// U36 claim check, chunk K3: "More Information" (History, Notes), "Upload/Select Files", the older
// file lists inside other windows, and the side effects of upload, revision, edit, delete and note.
// Spec: docs/specs/U36-submission-files.md lines 96–101, 234–280, 309–329, 535–551.
//
// OJS/OMP: one scratch context per app (mgr, se, ce, le, pr, au, rv) and submissions:
//   a   Submission stage, empty list      → mgr uploads, notes (d14), renames, revises, reads History (d16, Rule 13a),
//                                            downloads, reads the Activity Log, deletes (d20); mail counted throughout
//   b   Copyediting: article.pdf (note "From submission"), notes.md
//                                          → "Upload/Select Files" windows (Rule 15), the copy and its revision (d3, A4),
//                                            "Earlier Revision Notes" (d18); se and ce (A3, the ce's note)
//   c   Review round: article.pdf + notes.md, rv accepted (OMP also ci: an internal round)
//                                          → "Files for Review" window; the older lists (Rule 16): the reviewer's
//                                            "Review Files", the reviewer row's "Edit" and "Add Reviewer" windows
//   d   Production                        → "Production Ready Files" with an HTML file and a dependent (d13); le, pr (A3)
//   e   Review, revisions requested       → the author's revision: email, round status, task; an editor's upload
// OPS: a scratch server (mgr, mod, au): p1 with a PDF and an HTML galley → the galley's "More Information",
//   "Change File" (a revision) and its History, the Activity Log; no "Upload/Select Files".
//
//   PROBE_FEATURE=U36 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U36/K3/k3.js
//   PHASES=seed,up,sel,rev,prod,arev,ops   (default all; later phases reuse k3-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const fx = (app, f) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${f}`);
const ALL = ['seed', 'up', 'sel', 'selx', 'rev', 'prod', 'arev', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        text: d.innerText.slice(0, 6000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
        links: [...d.querySelectorAll('a')].filter((a) => a.getClientRects().length).map((a) => a.innerText.trim()).filter(Boolean).slice(0, 40),
    }))).catch(() => []);
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 100);
    return {url: location.href, dialogCount: dlgs.length, headings: hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60), buttons, tables};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
// Every text node added to the page between watchStart and watchEnd (toasts that leave before a later read).
const watchStart = (page) => page.evaluate(() => {
    window.__k3seen = [];
    window.__k3obs && window.__k3obs.disconnect();
    window.__k3obs = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const t = (n.innerText || n.textContent || '').trim(); if (t && t.length < 300) window.__k3seen.push(t.replace(/\s+/g, ' ')); } });
    window.__k3obs.observe(document.body, {childList: true, subtree: true});
}).catch(() => {});
const watchEnd = (page) => page.evaluate(() => { window.__k3obs && window.__k3obs.disconnect(); return [...new Set(window.__k3seen || [])]; })
    .then((a) => a.filter((t) => !/^\d+$/.test(t) && !/^(v-if|Loading)$/.test(t)).slice(0, 40)).catch(() => []);

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
    const PNG = fx(app.name, 'profile-image-400.png');
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const authorWorkflow = (id, key) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };
    const u = sc.users || {};
    const S = sc.subs || {};
    const rkey = (s) => { const r = (s.rounds || [])[0]; return r ? `workflow_${r.stageId}_${r.id}` : 'workflow_3'; };

    // Mail: messages per scratch user (recipient-scoped), and the deltas since a baseline.
    async function mailCounts() {
        const out = {};
        for (const [k, name] of Object.entries(u)) out[k] = await app.mail.count({to: `${name}@mail.test`}).catch(() => -1);
        return out;
    }
    async function mailDelta(base, label) {
        await sleep(2500);
        const now = await mailCounts();
        const delta = {};
        for (const k of Object.keys(now)) if (now[k] !== base[k]) delta[k] = now[k] - base[k];
        const subjects = {};
        for (const k of Object.keys(delta)) {
            const r = await app.mail._search({to: `${u[k]}@mail.test`}).catch(() => ({messages: []}));
            subjects[k] = (r.messages || []).slice(0, delta[k]).map((m) => m.Subject);
        }
        const out = {label, delta, subjects};
        record(`mail-${label}`, out);
        log(`[mail ${label}]`, JSON.stringify(out));
        return {now, out};
    }

    async function openWorkflow(page, url, label) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message), tables: [], buttons: [], headings: []}));
        await snap(page, label, {info});
        log(`[${label}]`, '| tables:', JSON.stringify((info.tables || []).filter((t) => !/Discussion/i.test(t.name || '')).map((t) => `${t.name}: ${t.rows.join(' || ')}`)).slice(0, 900), '| btns:', JSON.stringify((info.buttons || []).filter((b) => /Upload|Download|Select|Activity/.test(b))));
        return info;
    }
    const tableOf = (page, name) => page.locator('[role="dialog"]:visible').first().getByRole('table', {name, exact: true}).first();
    const rowsOf = async (page, name) => ((await wfInfo(page)).tables.find((t) => t.name === name) || {rows: []}).rows;
    async function pressItem(page, tableName, rowText, item, label) {
        const t = tableOf(page, tableName);
        const row = t.locator('tbody tr').filter({hasText: rowText}).first();
        await row.waitFor({timeout: 15000}).catch(() => {});
        const btn = row.getByRole('button').first();
        await loc(page, `${label}: "${tableName}" row menu button`, btn);
        if (!(await btn.count())) return {noButton: true};
        await btn.click(); await page.waitForTimeout(300);
        const mi = page.getByRole('menuitem', {name: item, exact: true}).first();
        await loc(page, `${label}: menu item "${item}"`, mi);
        if (!(await mi.count())) { const items = await menuItems(page); await btn.click().catch(() => {}); return {noItem: true, items}; }
        await mi.click(); await idle(page); await page.waitForTimeout(700); await idle(page);
        return {pressed: true};
    }
    async function waitWindow(page) {
        await topWin(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
    }
    async function closeTop(page) {
        const top = topWin(page);
        const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
        if (await c.count()) { await c.click({timeout: 5000}).catch(() => {}); } else { const x = top.getByRole('button', {name: /Close/}).last(); if (await x.count()) await x.click().catch(() => {}); }
        await idle(page); await page.waitForTimeout(700);
    }
    // A download started by a click (new tab or not): the file's suggested name.
    async function download(page, locator, label) {
        const ctx = page.context();
        let dl = null; let popup = null;
        const onDl = (d) => { if (!dl) dl = d; };
        const onPage = (p) => { popup = popup || p; p.on('download', onDl); };
        page.on('download', onDl); ctx.on('page', onPage);
        await locator.click();
        for (let i = 0; i < 60 && !dl; i++) await page.waitForTimeout(250);
        page.off('download', onDl); ctx.off('page', onPage);
        const out = {newTab: !!popup, fileName: dl ? dl.suggestedFilename() : null, url: dl ? dl.url().replace(/^.*\/index\.php/, '').slice(0, 220) : null};
        if (dl) await dl.cancel().catch(() => {});
        if (popup) await popup.close().catch(() => {});
        record(`${label}-download`, out);
        log(`[${label} download]`, JSON.stringify(out));
        return out;
    }
    // The legacy upload wizard already open.
    async function driveWizard(page, file, label, {component, revise, stopAfterStep, name, dependent} = {}) {
        const wiz = dependent ? page.locator('[role="dialog"]:visible').last() : page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        await wiz.waitFor({timeout: 30000});
        await wiz.locator('input[type="file"]').first().waitFor({state: 'attached', timeout: 30000});
        await idle(page);
        const w0 = (await dialogTexts(page)).slice(-1)[0];
        const selects = await wiz.locator('select').evaluateAll((els) => els.map((s) => ({id: s.id, options: [...s.options].map((o) => o.text.trim())}))).catch(() => []);
        const out = {title: w0 && w0.name, selects, step1Text: flat(w0 && w0.text, 900)};
        if (revise) {
            const rs = wiz.locator('select[id^="revisedFileId"]').first();
            if (await rs.count()) { const o = await rs.locator('option').evaluateAll((els) => els.map((x) => ({t: x.text, v: x.value}))); const p = o.find((x) => x.t.includes(revise)); if (p) await rs.selectOption(p.v); await idle(page); out.revised = p || null; out.reviseOptions = o.map((x) => x.t); }
        }
        const genre = wiz.locator('select[id^="genreId"]');
        if (!revise && await genre.count()) {
            const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
            const pick = component ? opts.find((o) => o.text === component) : opts.find((o) => o.value && !/^Select/i.test(o.text));
            if (pick) await genre.selectOption(pick.value);
            out.component = pick && pick.text;
        }
        out.fileInputs = await wiz.locator('input[type="file"]').count();
        await wiz.locator('input[type="file"]').first().setInputFiles(file);
        await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].filter((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length).pop(); return b && !b.disabled; }, null, {timeout: 30000}).catch(() => {});
        await idle(page);
        await snap(page, `${label}-step1-filled`, {out});
        if (stopAfterStep === 1) { record(`${label}-wizard`, out); return out; }
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(800); await idle(page);
        const w2 = (await dialogTexts(page)).slice(-1)[0];
        out.step2Text = flat(w2 && w2.text, 1500);
        if (name) { const nb = wiz.locator('input[name^="name"]').first(); if (await nb.count()) await nb.fill(name); }
        if (stopAfterStep === 2) { record(`${label}-wizard`, out); return out; }
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await page.waitForTimeout(900); await idle(page);
        out.done = true;
        record(`${label}-wizard`, out);
        log(`[${label} wizard]`, JSON.stringify(out.title), 'component:', out.component, 'revised:', JSON.stringify(out.revised || null));
        return out;
    }
    async function uploadAbove(page, tableName, file, label, opts) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const sec = dlg.locator('div, section').filter({has: page.getByRole('table', {name: tableName, exact: true})}).filter({has: page.getByRole('button', {name: 'Upload', exact: true})}).last();
        let up = sec.getByRole('button', {name: 'Upload', exact: true}).first();
        if (!(await up.count())) up = dlg.getByRole('button', {name: 'Upload', exact: true}).first();
        await loc(page, `${label}: "Upload" above "${tableName}"`, up);
        if (!(await up.count())) return {noUpload: true};
        await up.click(); await idle(page);
        return driveWizard(page, file, label, opts);
    }

    // ---- "More Information": the window as data, History (optionally ticking the prior-versions box), Notes ----
    async function historyRead(page, win) {
        const t0 = Date.now();
        await page.waitForFunction(() => {
            const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop();
            const p = d && [...d.querySelectorAll('[role=tabpanel]')].find((x) => x.getClientRects().length);
            return p && !/Loading/.test(p.innerText) && p.innerText.trim().length > 0;
        }, null, {timeout: 10000}).catch(() => {});
        await idle(page);
        return win.evaluate((d) => {
            const vis = (e) => e.getClientRects().length > 0;
            const p = [...d.querySelectorAll('[role=tabpanel]')].find(vis) || d;
            const t = p.querySelector('table');
            const cb = [...p.querySelectorAll('input[type=checkbox]')].map((c) => ({label: (c.closest('label') || document.querySelector(`label[for="${c.id}"]`) || c.parentElement).innerText.trim(), checked: c.checked, visible: vis(c), name: c.name}));
            return {
                text: p.innerText.slice(0, 3000),
                columns: t ? [...t.querySelectorAll('th')].filter(vis).map((x) => x.innerText.trim()) : null,
                rows: t ? [...t.querySelectorAll('tr')].filter((tr) => tr.querySelector('td') && vis(tr)).map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' '))) : [],
                rowLinks: t ? [...t.querySelectorAll('tr')].filter((tr) => tr.querySelector('td') && vis(tr)).map((tr) => [...tr.querySelectorAll('a')].filter(vis).map((a) => a.innerText.trim())) : [],
                checkboxes: cb,
                formButtons: [...p.querySelectorAll('form button, form input[type=submit], form a')].filter(vis).map((b) => (b.innerText || b.value || '').trim()).filter(Boolean),
            };
        }).then((r) => ({...r, waitedMs: Date.now() - t0})).catch((e) => ({error: String(e.message).slice(0, 200)}));
    }
    async function notesRead(page, win) {
        await page.waitForFunction(() => {
            const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop();
            const p = d && [...d.querySelectorAll('[role=tabpanel]')].find((x) => x.getClientRects().length);
            return p && /Add Note/.test(p.innerText);
        }, null, {timeout: 15000}).catch(() => {});
        await idle(page);
        return win.evaluate((d) => {
            const vis = (e) => e.getClientRects().length > 0;
            const p = [...d.querySelectorAll('[role=tabpanel]')].find(vis) || d;
            const past = [...p.querySelectorAll('a')].find((a) => /Earlier Revision Notes/.test(a.innerText));
            return {
                text: p.innerText.slice(0, 3000),
                deletes: [...p.querySelectorAll('a, button')].filter((b) => vis(b) && b.innerText.trim() === 'Delete').length,
                earlier: past ? {text: past.innerText.trim(), tag: past.tagName} : null,
                textarea: [...p.querySelectorAll('textarea')].filter(vis).map((t) => ({name: t.name, label: (document.querySelector(`label[for="${t.id}"]`) || {}).innerText || null, value: t.value})),
                buttons: [...p.querySelectorAll('button, input[type=submit]')].filter(vis).map((b) => (b.innerText || b.value || '').trim()).filter(Boolean),
            };
        }).catch((e) => ({error: String(e.message).slice(0, 200)}));
    }
    async function openNotesTab(page) {
        const win = topWin(page);
        const nt = win.getByRole('tab', {name: /Notes/}).first();
        await nt.click(); await idle(page); await page.waitForTimeout(600);
        return notesRead(page, win);
    }
    async function openHistoryTab(page) {
        const win = topWin(page);
        const ht = win.getByRole('tab', {name: /History/}).first();
        if (!(await ht.count())) return {absent: true};
        await ht.click(); await idle(page); await page.waitForTimeout(600);
        return historyRead(page, win);
    }
    async function infoWindow(page, label) {
        await waitWindow(page);
        const win = topWin(page);
        const d = (await dialogTexts(page)).slice(-1)[0];
        const tabs = await win.locator('[role=tab]').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), selected: e.getAttribute('aria-selected')}))).catch(() => []);
        const hist = await historyRead(page, win);
        const out = {title: d && d.name, tabs, history: hist};
        await snap(page, `${label}-history`, {out});
        log(`[${label}]`, JSON.stringify(out.title), JSON.stringify(tabs), '| cols', JSON.stringify(hist.columns), '| rows', JSON.stringify(hist.rows).slice(0, 900), '| box', JSON.stringify(hist.checkboxes), '| text', flat(hist.text, 200));
        return out;
    }
    async function tickPriorVersions(page, label) {
        const win = topWin(page);
        const reqs = [];
        const onR = (r) => { if (/event-?log|history/i.test(r.url())) reqs.push({status: r.status(), method: r.request().method(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 260), post: flat(r.request().postData(), 200)}); };
        page.on('response', onR);
        const panel = win.locator('[role=tabpanel]:visible');
        const box = panel.locator('input[type=checkbox]').first();
        await loc(page, `${label}: History "Show events from prior versions" box`, box);
        if (!(await box.count())) { page.off('response', onR); return {absent: true}; }
        // the box sits in a collapsed filter form behind the grid's "Search" link
        const pre = {boxVisible: await box.isVisible()};
        const toggle = panel.locator('a:visible').filter({hasText: /^\s*Search\s*$/}).first();
        await loc(page, `${label}: History grid "Search" toggle`, toggle);
        if (!pre.boxVisible && await toggle.count()) { await toggle.click(); await page.waitForTimeout(700); pre.expanded = true; }
        if (!(await box.isVisible()) && await toggle.count()) { await toggle.click(); await page.waitForTimeout(900); pre.expandedTwice = true; }
        pre.boxVisibleAfterToggle = await box.isVisible();
        pre.formText = flat(await panel.locator('form').first().innerText().catch(() => ''), 300);
        pre.formControls = await panel.locator('form').first().evaluate((f) => [...f.querySelectorAll('input, select, button')].filter((e) => e.getClientRects().length).map((e) => ({tag: e.tagName, type: e.type, name: e.name, text: (e.innerText || e.value || '').trim()}))).catch(() => []);
        await snap(page, `${label}-history-filter-open`, {pre});
        await box.check({force: true}).catch(() => box.click({force: true}));
        await page.waitForTimeout(1500); await idle(page);
        let hist = await historyRead(page, win);
        const btn = panel.locator('form').getByRole('button', {name: /Search/}).first();
        const btn2 = panel.locator('form button:visible, form input[type=submit]:visible').first();
        const b = (await btn.count()) ? btn : btn2;
        await loc(page, `${label}: History filter submit`, b);
        if (!reqs.length && await b.count()) { const pressed = (await b.innerText().catch(() => '')).trim() || 'submit'; await b.click(); await page.waitForTimeout(2000); await idle(page); hist = {...(await historyRead(page, win)), pressed}; }
        hist.pre = pre;
        page.off('response', onR);
        hist.requests = reqs;
        await snap(page, `${label}-history-ticked`, {hist});
        log(`[${label} ticked]`, JSON.stringify(hist.rows).slice(0, 900), JSON.stringify(reqs));
        return hist;
    }
    // History rows carrying row controls ("Settings" arrow): open each, record its links, press "Download".
    async function historyDownloads(page, label) {
        const panel = topWin(page).locator('[role=tabpanel]:visible');
        const arrows = panel.locator('tr a.show_extras');
        await loc(page, `${label}: History row "show extras" arrows`, arrows);
        const rows = panel.locator('tr.gridRow');
        const n = await rows.count();
        const out = [];
        for (let i = 0; i < n; i++) {
            const row = rows.nth(i);
            const arrow = row.locator('a.show_extras');
            if (!(await arrow.count())) continue;
            const event = flat(await row.innerText().catch(() => ''), 200);
            await arrow.first().click(); await page.waitForTimeout(500);
            const next = row.locator('xpath=following-sibling::tr[1]');
            const links = await next.locator('a').evaluateAll((els) => els.filter((a) => a.getClientRects().length).map((a) => a.innerText.trim())).catch(() => []);
            const dl = next.getByRole('link', {name: /Download/}).first();
            await loc(page, `${label}: History row ${i} "Download"`, dl);
            const r = {event, links};
            if (await dl.count()) r.download = await download(page, dl, `${label}-dl${i}`);
            out.push(r);
        }
        await snap(page, `${label}-downloads`, {out});
        log(`[${label} downloads]`, JSON.stringify(out));
        return out;
    }
    async function addNote(page, text, label) {
        const win = topWin(page);
        const ta = win.locator('[role=tabpanel]:visible textarea').first();
        await loc(page, `${label}: Notes text box`, ta);
        await ta.fill(text);
        const add = win.getByRole('button', {name: 'Add Note', exact: true}).first();
        await loc(page, `${label}: "Add Note" button`, add);
        await watchStart(page);
        const resp = page.waitForResponse((r) => /add-note|addNote/i.test(r.url()), {timeout: 10000}).catch(() => null);
        await add.click();
        const r = await resp;
        await page.waitForTimeout(2500); await idle(page);
        const seen = await watchEnd(page);
        const n = await notesRead(page, win);
        const out = {typed: text, response: r ? {status: r.status(), body: flat(await r.text().catch(() => ''), 300)} : null, seen, after: n};
        await snap(page, `${label}-notes-after-add`, {out});
        log(`[${label} add "${text}"]`, JSON.stringify({resp: out.response, seen, deletes: n.deletes, text: flat(n.text, 400)}));
        return out;
    }
    async function deleteNote(page, label, {confirm = true} = {}) {
        const win = topWin(page);
        const del = win.locator('[role=tabpanel]:visible').locator('a:visible, button:visible').filter({hasText: /^\s*Delete\s*$/}).first();
        await loc(page, `${label}: a note's "Delete"`, del);
        if (!(await del.count())) return {noDelete: true};
        const browser = [];
        const onD = (d) => { browser.push({type: d.type(), message: d.message()}); (confirm ? d.accept() : d.dismiss()).catch(() => {}); };
        page.on('dialog', onD);
        await watchStart(page);
        await del.click(); await page.waitForTimeout(1200);
        const dl = (await dialogTexts(page)).filter((x) => /Are you sure|delete this note/i.test(x.text));
        let modal = null;
        if (dl.length) {
            modal = {name: dl[0].name, text: flat(dl[0].text, 300), buttons: dl[0].buttons};
            await snap(page, `${label}-note-delete-question`, {modal});
            const b = page.locator('[role="dialog"]:visible').filter({hasText: /delete this note/}).last().getByRole('button', {name: confirm ? /^(OK|Yes|Delete)$/ : /^(Cancel|No)$/}).first();
            await loc(page, `${label}: note delete confirmation button`, b);
            await b.click().catch(() => {});
        }
        await page.waitForTimeout(2500); await idle(page);
        page.off('dialog', onD);
        const seen = await watchEnd(page);
        const n = await notesRead(page, win);
        const out = {browser, modal, seen, after: n};
        await snap(page, `${label}-notes-after-delete`, {out});
        log(`[${label} delete note]`, JSON.stringify({browser, modal, seen, text: flat(n.text, 300)}));
        return out;
    }
    async function expandEarlier(page, label) {
        const win = topWin(page);
        const link = win.locator('[role=tabpanel]:visible a').filter({hasText: 'Earlier Revision Notes'}).first();
        await loc(page, `${label}: "Earlier Revision Notes" toggle`, link);
        if (!(await link.count())) return {absent: true};
        const before = await notesRead(page, win);
        await link.click(); await page.waitForTimeout(1000); await idle(page);
        const after = await notesRead(page, win);
        const out = {before: {text: before.text, deletes: before.deletes}, after: {text: after.text, deletes: after.deletes}};
        await snap(page, `${label}-earlier-open`, {out});
        log(`[${label} earlier]`, flat(before.text, 300), '=>', flat(after.text, 400), 'deletes', before.deletes, '->', after.deletes);
        return out;
    }
    async function activityLog(page, label) {
        const al = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Activity Log', exact: true}).first();
        await loc(page, `${label}: the workflow header's "Activity Log"`, al);
        if (!(await al.count())) return {absent: true};
        await al.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
        const d = (await dialogTexts(page)).slice(-1)[0];
        const lines = await topWin(page).locator('table tbody tr').evaluateAll((trs) => trs.filter((tr) => tr.getClientRects().length).map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')).join(' | '))).catch(() => []);
        const cols = await topWin(page).locator('table thead th').allInnerTexts().catch(() => []);
        const out = {name: d && d.name, cols, lines};
        await snap(page, `${label}-activitylog`, out);
        log(`[${label} activity]`, JSON.stringify(lines).slice(0, 2500));
        await closeTop(page);
        return out;
    }
    async function tasksCount(page) {
        return (await page.getByRole('button', {name: /^Tasks/}).first().innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
    }
    async function tasksPanel(page, label) {
        const bell = page.getByRole('button', {name: /^Tasks/}).first();
        if (!(await bell.count())) { record(label, {absent: true}); return null; }
        await bell.click();
        const d = page.locator('[role="dialog"]:visible').last();
        await page.waitForTimeout(1500); await idle(page);
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return x && !/Loading/.test(x.innerText); }, null, {timeout: 15000}).catch(() => {});
        const text = flat(await d.innerText().catch(() => ''), 2500);
        await snap(page, label, {text});
        log(`[${label}]`, text.slice(0, 800));
        const close = d.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return text;
    }
    // A legacy grid inside a window: its header, rows, row controls (after "show extras"), and filter controls.
    async function gridRead(scope) {
        return scope.evaluate((root) => {
            const vis = (e) => e.getClientRects().length > 0;
            return [...root.querySelectorAll('.pkp_controllers_grid')].filter(vis).map((g) => {
                const t = g.querySelector('table');
                return {
                    id: g.id,
                    title: (g.querySelector('.header h4, .header .pkp_helpers_align_left, h4, h3') || {}).innerText || null,
                    headerLinks: [...g.querySelectorAll('.header a, .header button')].filter(vis).map((a) => a.innerText.trim()).filter(Boolean),
                    filter: [...g.querySelectorAll('form input, form select, form button')].map((e) => ({tag: e.tagName, type: e.type, name: e.name, visible: vis(e), value: e.value, placeholder: e.placeholder || null, options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.text) : undefined})),
                    columns: t ? [...t.querySelectorAll('thead th')].map((x) => x.innerText.trim()) : null,
                    rows: t ? [...t.querySelectorAll('tbody tr')].filter(vis).map((tr) => ({cls: tr.className, cells: [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')), links: [...tr.querySelectorAll('a')].filter(vis).map((a) => ({text: a.innerText.trim(), cls: a.className, target: a.getAttribute('target'), href: (a.getAttribute('href') || '').replace(/^.*\/index\.php/, '').slice(0, 160)})), boxes: [...tr.querySelectorAll('input[type=checkbox]')].map((c) => c.checked)})) : [],
                };
            });
        }).catch((e) => [{error: String(e.message).slice(0, 200)}]);
    }
    // A legacy grid's search control: expand it (the "Search" link), type, press its search button; the rows after.
    async function gridSearch(page, scope, text, label) {
        const g = scope.locator('.pkp_controllers_grid:visible').first();
        const toggle = g.locator('a.pkp_linkaction_search').first();
        const input = g.locator('form input[name="search"]').first();
        let expanded = false;
        if (!(await input.isVisible().catch(() => false)) && await toggle.count()) { await toggle.dispatchEvent('click'); await page.waitForTimeout(800); expanded = true; }
        await loc(page, `${label}: grid search box`, input);
        const inputVisible = await input.isVisible().catch(() => false);
        if (!(await input.count())) return {noInput: true};
        const reqs = [];
        const onR = async (r) => { if (/fetch-grid/.test(r.url())) reqs.push({status: r.status(), method: r.request().method(), post: flat(r.request().postData(), 200), rows: ((await r.text().catch(() => '')).match(/gridRow/g) || []).length}); };
        page.on('response', onR);
        await input.fill(text);
        const b = g.locator('form button[name="submitFormButton"], form button[type=submit]').first();
        await loc(page, `${label}: grid search submit`, b);
        const bText = (await b.innerText().catch(() => '')).trim();
        let how = 'click';
        if (await b.isVisible().catch(() => false)) await b.click({timeout: 5000}).catch(async () => { how = 'dispatch'; await b.dispatchEvent('click'); }); else { how = 'enter'; await input.press('Enter'); }
        await page.waitForTimeout(2000); await idle(page);
        page.off('response', onR);
        const after = await gridRead(scope);
        const out = {text, expanded, inputVisible, submitText: bText, how, requests: reqs, rows: (after[0] || {}).rows && after[0].rows.map((r) => r.cells.join(' | ')).filter(Boolean)};
        log(`[${label} search "${text}"]`, JSON.stringify(out));
        return out;
    }

    // ---- seed ------------------------------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u36k3');
        const roleUsers = isOPS
            ? [['mgr', 'manager', 'Mira', 'Manager'], ['mod', 'sectionEditor', 'Mo', 'Moderator'], ['au', 'author', 'Ava', 'Author']]
            : [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Sam', 'Sectioneditor'], ['ce', 'copyeditor', 'Cleo', 'Copyeditor'],
                ['le', 'layoutEditor', 'Lee', 'Layouteditor'], ['pr', 'proofreader', 'Pia', 'Proofreader'], ['au', 'author', 'Ava', 'Author'],
                ['rv', 'externalReviewer', 'Rae', 'Reviewer'], ['rv2', 'externalReviewer', 'Ray', 'Spare']];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U36 K3 ${t}`, acronym: 'KTHREE', contactName: 'K3 Contact', contactEmail: `${t}c@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        save();
        const U = sc.users;
        const part = (k, role) => ({username: U[k], role});
        const subs = {};
        const mk = async (k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: U.au, title: `K3 ${k.toUpperCase()} ${t}`, ...spec});
                subs[k] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, rounds: r.reviewRounds, ras: r.reviewAssignments, files: r.files, galleys: r.galleys};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'files', JSON.stringify(r.files), 'rounds', JSON.stringify(r.reviewRounds), 'galleys', JSON.stringify(r.galleys));
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); subs[k] = {error: String(e.message).slice(0, 600)}; }
        };
        if (isOPS) {
            await mk('p1', {participants: [part('mod', 'sectionEditor')], galleys: [{label: 'PDF', file: 'preprint.pdf'}, {label: 'HTML', file: 'preprint.html'}]});
        } else {
            const se = part('se', 'sectionEditor');
            await mk('a', {participants: [se]});
            await mk('b', {decisions: ['skipExternalReview'], files: [{file: 'article.pdf', note: 'From submission'}, {file: 'notes.md'}], participants: [se, part('ce', 'copyeditor')]});
            await mk('c', {decisions: ['sendExternalReview'], files: [{file: 'article.pdf'}], reviewRounds: [{files: [{file: 'article.pdf'}, {file: 'notes.md'}], reviewers: [{username: U.rv, status: 'accepted'}]}], participants: [se]});
            if (isOMP) await mk('ci', {decisions: ['sendInternalReview'], files: [{file: 'article.pdf'}], reviewRounds: [{stage: 'internal', files: [{file: 'article.pdf'}]}], participants: [se]});
            await mk('d', {decisions: ['skipExternalReview', 'sendToProduction'], files: [{file: 'article.pdf'}], participants: [se, part('le', 'layoutEditor'), part('pr', 'proofreader')]});
            await mk('e', {decisions: ['sendExternalReview', 'requestRevisions'], files: [{file: 'article.pdf'}], reviewRounds: [{files: [{file: 'article.pdf'}]}], participants: [se]});
        }
        sc.subs = subs; save();
        record('seed', sc);
        return;
    }
    if (!sc.contextPath) { log('[no state: run PHASES=seed first]'); return; }

    // ---- up: Submission Files: upload, note, rename, revise; History, Notes, downloads, Activity Log, delete; mail ----
    if (!isOPS && on('up')) {
        if (S.a.used) {
            const r = await app.api.createSubmission({tag: `${sc.tag}a${Date.now() % 100000}`, context: sc.contextPath, submitter: u.au, title: `K3 A-again ${sc.tag}`, participants: [{username: u.se, role: 'sectionEditor'}]});
            S.a = {id: r.submissionId, publicationId: r.publicationId}; sc.subs = S; save();
        }
        S.a.used = true; save();
        const A = S.a;
        const {page, close} = await launch(app);
        const sum = {};
        try {
            await sect('up se tasks before', async () => { await signInAs(page, u.se); await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-se-before'); sum.seTasksBefore = await tasksCount(page); });
            await signInAs(page, u.mgr);
            let base = await mailCounts(); sum.mailStart = base;
            let fileNo = null;
            await sect('up upload', async () => {
                const b = await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-mgr-before');
                sum.rowsBefore = (b.tables.find((t) => t.name === 'Submission Files') || {}).rows;
                sum.upload = await uploadAbove(page, 'Submission Files', PDF, 'up-mgr-upload');
                await page.waitForTimeout(800);
                sum.rowsAfterUpload = await rowsOf(page, 'Submission Files');
                fileNo = (String(sum.rowsAfterUpload[0] || '').match(/^(\d+)/) || [])[1];
                sum.fileNo = fileNo;
                ({now: base} = await mailDelta(base, 'up-after-upload'));
            });
            const rowSel = () => new RegExp(`^\\s*${fileNo}(?!\\d)`);
            // d16 + d14: the window; Notes empty, empty add, "First check", delete
            await sect('up info notes', async () => {
                await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-mgr-info-land');
                sum.tasksBeforeNotes = await tasksCount(page);
                const r = await pressItem(page, 'Submission Files', rowSel(), 'More Information', 'up-mgr-info');
                if (!r.pressed) { sum.info = r; return; }
                sum.info1 = await infoWindow(page, 'up-mgr-info1');
                const n0 = await openNotesTab(page);
                await snap(page, 'up-mgr-notes-empty', {n0});
                sum.notesEmpty = n0;
                sum.addEmpty = await addNote(page, '', 'up-mgr-empty');
                sum.addFirst = await addNote(page, 'First check', 'up-mgr-first');
                sum.deleteFirst = await deleteNote(page, 'up-mgr-first');
                sum.addSecond = await addNote(page, 'Kept note', 'up-mgr-second');
                sum.earlierNotCopied = await expandEarlier(page, 'up-mgr-notcopied');
                await closeTop(page);
                sum.tasksAfterNotes = await tasksCount(page);
                ({now: base} = await mailDelta(base, 'up-after-notes'));
            });
            // rename through "Update File Details"
            await sect('up rename', async () => {
                await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-mgr-rename-land');
                const r = await pressItem(page, 'Submission Files', rowSel(), 'Update File Details', 'up-mgr-edit');
                if (!r.pressed) { sum.rename = r; return; }
                await waitWindow(page); await page.waitForTimeout(600);
                const nb = topWin(page).locator('input[name^="name"]:visible').first();
                await nb.fill('Renamed manuscript');
                await watchStart(page);
                await topWin(page).getByRole('button', {name: 'Save', exact: true}).last().click(); await idle(page); await page.waitForTimeout(2000);
                sum.rename = {seen: await watchEnd(page), rows: await rowsOf(page, 'Submission Files')};
                log('[up rename]', JSON.stringify(sum.rename));
                ({now: base} = await mailDelta(base, 'up-after-rename'));
            });
            // a revision of it with notes.md
            await sect('up revise', async () => {
                await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-mgr-revise-land');
                sum.revise = await uploadAbove(page, 'Submission Files', MD, 'up-mgr-revise', {revise: 'Renamed manuscript'});
                sum.rowsAfterRevise = await rowsOf(page, 'Submission Files');
                ({now: base} = await mailDelta(base, 'up-after-revise'));
            });
            // History after upload, note, rename, revision; Download links; the prior-versions box
            await sect('up history', async () => {
                await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-mgr-history-land');
                const r = await pressItem(page, 'Submission Files', rowSel(), 'More Information', 'up-mgr-info2');
                if (!r.pressed) { sum.history = r; return; }
                sum.info2 = await infoWindow(page, 'up-mgr-info2');
                sum.historyDownloads = await historyDownloads(page, 'up-mgr-history');
                sum.ticked = await tickPriorVersions(page, 'up-mgr-info2');
                await closeTop(page);
                // the list's own download
                const l = tableOf(page, 'Submission Files').locator('tbody tr a').first();
                if (await l.count()) sum.listDownload = await download(page, l, 'up-mgr-list');
                ({now: base} = await mailDelta(base, 'up-after-downloads'));
            });
            await sect('up activity before delete', async () => {
                await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-mgr-alog-land');
                sum.alog1 = await activityLog(page, 'up-mgr-alog1');
            });
            await sect('up delete', async () => {
                await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-mgr-delete-land');
                const r = await pressItem(page, 'Submission Files', rowSel(), 'Delete', 'up-mgr-delete');
                if (!r.pressed) { sum.delete = r; return; }
                await watchStart(page);
                const resp = page.waitForResponse((x) => /delete-file/.test(x.url()), {timeout: 15000}).catch(() => null);
                await topWin(page).getByRole('button', {name: 'OK', exact: true}).first().click();
                const rr = await resp;
                await page.waitForTimeout(3000); await idle(page);
                sum.delete = {status: rr && rr.status(), seen: await watchEnd(page), rows: await rowsOf(page, 'Submission Files')};
                log('[up delete]', JSON.stringify(sum.delete));
                ({now: base} = await mailDelta(base, 'up-after-delete'));
                await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-mgr-after-delete');
                sum.alog2 = await activityLog(page, 'up-mgr-alog2');
            });
            await sect('up se tasks after', async () => { await signInAs(page, u.se); await openWorkflow(page, workflow(A.id, 'workflow_1'), 'up-se-after'); sum.seTasksAfter = await tasksCount(page); });
            record('up-summary', sum);
            await signOut(page).catch(() => {});
        } finally { record('up-summary', sum); await close(); }
    }

    // ---- sel: "Upload/Select Files" at Copyediting; the copy, its revision, History (A4), Earlier Revision Notes (d18); se, ce ----
    async function selectWindowOpen(page, nth, label) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        await loc(page, `${label}: "Upload/Select Files" nth ${nth}`, btns.nth(nth));
        if (!(await btns.nth(nth).count())) return null;
        await btns.nth(nth).click(); await idle(page);
        const win = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
        await win.waitFor({timeout: 30000}).catch(() => {});
        await win.locator('table tr').nth(1).waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(700);
        await loc(page, `${label}: the select window`, win);
        return win;
    }
    async function selectWindowRead(page, win, label) {
        const d = await win.evaluate((w) => {
            const vis = (e) => e.getClientRects().length > 0;
            const all = w.querySelector('input[name="allStages"]');
            return {
                title: w.getAttribute('aria-label') || (w.querySelector('h1,h2') || {}).innerText || null,
                text: w.innerText.slice(0, 3000),
                allStages: all ? {label: (all.closest('label') || document.querySelector(`label[for="${all.id}"]`) || all.parentElement).innerText.trim(), checked: all.checked, visible: vis(all)} : null,
                rows: [...w.querySelectorAll('table tr')].filter(vis).map((tr) => { const cb = tr.querySelector('input[type=checkbox]'); return tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 140) + (cb ? (cb.checked ? ' [x]' : ' [ ]') : ''); }),
                categories: [...w.querySelectorAll('tr.category, tbody.category_grid_body tr:first-child, .category')].filter(vis).map((x) => x.innerText.trim().replace(/\s+/g, ' ').slice(0, 80)),
                links: [...w.querySelectorAll('a')].filter(vis).map((a) => a.innerText.trim()).filter(Boolean),
                buttons: [...w.querySelectorAll('button, input[type=submit]')].filter(vis).map((b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').trim()).filter(Boolean),
            };
        }).catch((e) => ({error: String(e.message).slice(0, 200)}));
        await snap(page, label, {win: d});
        log(`[${label}]`, JSON.stringify(d.title), '| all:', JSON.stringify(d.allStages), '| rows:', JSON.stringify(d.rows).slice(0, 900), '| links:', JSON.stringify(d.links), '| buttons:', JSON.stringify(d.buttons));
        return d;
    }
    async function selectAllStages(page, win, label) {
        const all = win.locator('input[name="allStages"]').first();
        await loc(page, `${label}: "Show files from all accessible workflow stages." box`, all);
        await all.click(); await idle(page); await page.waitForTimeout(1200); await idle(page);
        return selectWindowRead(page, win, `${label}-allstages`);
    }
    // a row's controls in the select window ("show extras"), and optionally press one
    async function selectRowControls(page, win, rowText, label, press) {
        const row = win.locator('tr.gridRow, tr[id*="row"]').filter({hasText: rowText}).first();
        await loc(page, `${label}: select window row "${rowText}"`, row);
        if (!(await row.count())) return {noRow: true};
        const ex = row.locator('a.show_extras').first();
        await loc(page, `${label}: the row's "show extras" arrow`, ex);
        if (await ex.count()) { await ex.click(); await page.waitForTimeout(600); }
        const links = await row.evaluate((tr) => { const n = tr.nextElementSibling; const L = [...tr.querySelectorAll('a'), ...(n ? n.querySelectorAll('a') : [])]; return L.filter((a) => a.getClientRects().length).map((a) => a.innerText.trim()).filter(Boolean); }).catch(() => []);
        const out = {links};
        log(`[${label} row controls]`, JSON.stringify(links));
        if (press) {
            const next = row.locator('xpath=following-sibling::tr[1]');
            let l = next.getByRole('link', {name: press, exact: true}).first();
            if (!(await l.count())) l = row.getByRole('link', {name: press, exact: true}).first();
            await loc(page, `${label}: row control "${press}"`, l);
            if (await l.count()) {
                const browser = [];
                const onD = (d) => { browser.push({type: d.type(), message: d.message()}); d.dismiss().catch(() => {}); };
                page.on('dialog', onD);
                await l.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
                page.off('dialog', onD);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.pressed = {press, browser, top: d && {name: d.name, text: flat(d.text, 1200), buttons: d.buttons}};
                await snap(page, `${label}-pressed-${press.replace(/\W+/g, '')}`, out.pressed);
                log(`[${label} pressed ${press}]`, JSON.stringify(out.pressed).slice(0, 900));
            }
        }
        return out;
    }
    async function selectOk(page, win) {
        await win.getByRole('button', {name: /^(OK|Save)$/}).last().click(); await idle(page);
        await page.waitForFunction(() => ![...document.querySelectorAll('input[name="allStages"]')].some((e) => e.getClientRects().length), null, {timeout: 15000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
    }
    async function selectCancel(page, win) {
        const c = win.locator('a:visible, button:visible').filter({hasText: /^\s*Cancel\s*$/}).last();
        await loc(page, 'select window "Cancel"', c);
        await c.click(); await idle(page); await page.waitForTimeout(900);
    }
    if (!isOPS && on('sel')) {
        const B = S.b;
        const {page, close} = await launch(app);
        const sum = {};
        try {
            await signInAs(page, u.mgr);
            let base = await mailCounts();
            await sect('sel mgr draft window', async () => {
                const w0 = await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-copyediting');
                sum.listsBefore = w0.tables.filter((t) => /Files/.test(t.name || '')).map((t) => ({name: t.name, rows: t.rows}));
                sum.buttons = w0.buttons.filter((b) => /Upload|Select/.test(b));
                let win = await selectWindowOpen(page, 0, 'sel-mgr-draft');
                sum.draftWin = await selectWindowRead(page, win, 'sel-mgr-draft-win');
                sum.draftWinAll = await selectAllStages(page, win, 'sel-mgr-draft-win');
                sum.draftRowCtl = await selectRowControls(page, win, 'article.pdf', 'sel-mgr-draft-row');
                // tick then Cancel: nothing copied
                const cb = win.locator('tr').filter({hasText: 'article.pdf'}).locator('input[type=checkbox]').first();
                await cb.check({force: true}).catch(() => {});
                await selectCancel(page, win);
                const c1 = await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-after-cancel');
                sum.afterCancel = c1.tables.filter((t) => /Files/.test(t.name || '')).map((t) => ({name: t.name, rows: t.rows}));
                // tick then OK: the copy
                win = await selectWindowOpen(page, 0, 'sel-mgr-draft2');
                await selectAllStages(page, win, 'sel-mgr-draft2-win');
                await win.locator('tr').filter({hasText: 'article.pdf'}).locator('input[type=checkbox]').first().check({force: true});
                await selectOk(page, win);
                const c2 = await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-after-copy');
                sum.afterCopy = c2.tables.filter((t) => /Files/.test(t.name || '')).map((t) => ({name: t.name, rows: t.rows}));
                const c3 = await openWorkflow(page, workflow(B.id, 'workflow_1'), 'sel-mgr-submission-after-copy');
                sum.submissionAfterCopy = c3.tables.filter((t) => /Files/.test(t.name || '')).map((t) => ({name: t.name, rows: t.rows}));
                ({now: base} = await mailDelta(base, 'sel-after-copy'));
            });
            // d18: the copy's Notes (Earlier Revision Notes), the original's as control
            await sect('sel earlier notes', async () => {
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-copy-land');
                const r = await pressItem(page, 'Draft Files', 'article.pdf', 'More Information', 'sel-mgr-copyinfo');
                if (r.pressed) {
                    sum.copyInfo0 = await infoWindow(page, 'sel-mgr-copyinfo0');
                    sum.copyNotes = await openNotesTab(page);
                    await snap(page, 'sel-mgr-copy-notes', {n: sum.copyNotes});
                    sum.copyEarlier = await expandEarlier(page, 'sel-mgr-copy');
                    await closeTop(page);
                }
                await openWorkflow(page, workflow(B.id, 'workflow_1'), 'sel-mgr-orig-land');
                const r2 = await pressItem(page, 'Submission Files', 'article.pdf', 'More Information', 'sel-mgr-originfo');
                if (r2.pressed) {
                    await infoWindow(page, 'sel-mgr-originfo');
                    sum.origNotes = await openNotesTab(page);
                    sum.origEarlier = await expandEarlier(page, 'sel-mgr-orig');
                    await closeTop(page);
                }
            });
            // revise the copy through the window's "Upload File"
            await sect('sel revise copy', async () => {
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-revise-land');
                const win = await selectWindowOpen(page, 0, 'sel-mgr-draft3');
                let up = win.getByRole('link', {name: /Upload/}).first();
                await loc(page, 'sel: the select window\'s upload link', up);
                sum.uploadLinkText = (await up.innerText().catch(() => '')).trim();
                await up.click(); await idle(page);
                sum.reviseCopy = await driveWizard(page, PDF, 'sel-mgr-revise-copy', {revise: 'article.pdf'});
                sum.afterReviseWin = await selectWindowRead(page, win, 'sel-mgr-draft3-after-upload');
                await selectOk(page, win);
                const c = await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-after-revise');
                sum.afterRevise = c.tables.filter((t) => /Files/.test(t.name || '')).map((t) => ({name: t.name, rows: t.rows}));
            });
            // d3 / A4: the copy's History, then the box ticked
            await sect('sel history', async () => {
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-hist-land');
                const r = await pressItem(page, 'Draft Files', 'article.pdf', 'More Information', 'sel-mgr-copyinfo2');
                if (!r.pressed) { sum.copyHistory = r; return; }
                sum.copyHistory = await infoWindow(page, 'sel-mgr-copyinfo2');
                sum.copyHistoryTicked = await tickPriorVersions(page, 'sel-mgr-copyinfo2');
                await closeTop(page);
                // the original's History for comparison
                await openWorkflow(page, workflow(B.id, 'workflow_1'), 'sel-mgr-orighist-land');
                const r2 = await pressItem(page, 'Submission Files', 'article.pdf', 'More Information', 'sel-mgr-originfo2');
                if (r2.pressed) { sum.origHistory = await infoWindow(page, 'sel-mgr-originfo2'); await closeTop(page); }
            });
            // "Copyedited Files" window: its rows' controls, and each control pressed (Delete answered Cancel)
            await sect('sel copyedited window', async () => {
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-ce-land');
                let win = await selectWindowOpen(page, 1, 'sel-mgr-copyedited');
                sum.ceWin = await selectWindowRead(page, win, 'sel-mgr-copyedited-win');
                sum.ceWinAll = await selectAllStages(page, win, 'sel-mgr-copyedited-win');
                sum.ceRowInfo = await selectRowControls(page, win, 'notes.md', 'sel-mgr-ce-row', 'More Information');
                await closeTop(page);
                sum.ceRowEdit = await selectRowControls(page, win, 'notes.md', 'sel-mgr-ce-row2', 'Edit');
                await closeTop(page);
                sum.ceRowDelete = await selectRowControls(page, win, 'notes.md', 'sel-mgr-ce-row3', 'Delete');
                const cancel = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(Cancel|No)$/}).first();
                if (await cancel.count()) { await cancel.click(); await idle(page); await page.waitForTimeout(600); }
                sum.ceWinAfter = await selectWindowRead(page, win, 'sel-mgr-copyedited-win-after');
                await selectCancel(page, win);
            });
            // se: the copy's History (the box), Notes
            await sect('sel se', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-se-land');
                const win = await selectWindowOpen(page, 0, 'sel-se-draft');
                if (win) { sum.seWin = await selectWindowRead(page, win, 'sel-se-draft-win'); sum.seWinAll = await selectAllStages(page, win, 'sel-se-draft-win'); await selectCancel(page, win); }
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-se-land2');
                const r = await pressItem(page, 'Draft Files', 'article.pdf', 'More Information', 'sel-se-copyinfo');
                if (r.pressed) {
                    sum.seHistory = await infoWindow(page, 'sel-se-copyinfo');
                    sum.seTicked = await tickPriorVersions(page, 'sel-se-copyinfo');
                    sum.seNotes = await openNotesTab(page);
                    await snap(page, 'sel-se-notes', {n: sum.seNotes});
                    await closeTop(page);
                }
            });
            // ce: the window (which stages), the copy's History (A3), Notes: add "Checked"
            await sect('sel ce', async () => {
                await signInAs(page, u.ce);
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-ce-land');
                const win = await selectWindowOpen(page, 0, 'sel-ce-draft');
                if (win) { sum.ceSelWin = await selectWindowRead(page, win, 'sel-ce-draft-win'); sum.ceSelWinAll = await selectAllStages(page, win, 'sel-ce-draft-win'); sum.ceSelRowCtl = await selectRowControls(page, win, 'article.pdf', 'sel-ce-draft-row'); await selectCancel(page, win); }
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-ce-land2');
                const resps = [];
                const onR = async (r) => { if (/event-?log|history/i.test(r.url())) resps.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 220), body: flat(await r.text().catch(() => ''), 300)}); };
                page.on('response', onR);
                const r = await pressItem(page, 'Draft Files', 'article.pdf', 'More Information', 'sel-ce-copyinfo');
                if (r.pressed) {
                    sum.ceHistory = await infoWindow(page, 'sel-ce-copyinfo');
                    await page.waitForTimeout(8000);
                    sum.ceHistory10s = await historyRead(page, topWin(page));
                    await snap(page, 'sel-ce-copyinfo-history-10s', {h: sum.ceHistory10s});
                    sum.ceHistoryResponses = [...resps];
                    sum.ceNotes = await openNotesTab(page);
                    sum.ceAdd = await addNote(page, 'Checked', 'sel-ce');
                    sum.ceEarlier = await expandEarlier(page, 'sel-ce');
                    await closeTop(page);
                }
                page.off('response', onR);
                log('[sel ce history responses]', JSON.stringify(resps));
            });
            // mgr control: the ce's note offers "Delete" to the manager
            await sect('sel mgr control', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'sel-mgr-ctl-land');
                const r = await pressItem(page, 'Draft Files', 'article.pdf', 'More Information', 'sel-mgr-ctl');
                if (r.pressed) { await infoWindow(page, 'sel-mgr-ctl'); sum.mgrCtlNotes = await openNotesTab(page); await snap(page, 'sel-mgr-ctl-notes', {n: sum.mgrCtlNotes}); await closeTop(page); }
                ({now: base} = await mailDelta(base, 'sel-end'));
            });
            record('sel-summary', sum);
            await signOut(page).catch(() => {});
        } finally { record('sel-summary', sum); await close(); }
    }

    // ---- selx: the select windows' row controls pressed on a row of the list's own stage and on one from another stage ----
    if (!isOPS && on('selx')) {
        const B = S.b;
        const {page, close} = await launch(app);
        const sum = {};
        try {
            await signInAs(page, u.mgr);
            const cases = [
                ['draft-own', 0, false, /^\s*(Settings)?\s*\d+\s*article\.pdf/, 'Copyediting'],
                ['draft-other', 0, true, /notes\.md/, 'Submission'],
                ['copyedited-own', 1, false, /article\.pdf/, 'Copyediting'],
            ];
            for (const [key, nth, all, rowRe, cat] of cases) for (const press of ['More Information', 'Edit']) await sect(`selx ${key} ${press}`, async () => {
                await openWorkflow(page, workflow(B.id, 'workflow_4'), `selx-${key}-land`);
                const win = await selectWindowOpen(page, nth, `selx-${key}`);
                if (all) await win.locator('input[name="allStages"]').first().click().then(() => page.waitForTimeout(1500)).then(() => idle(page));
                const r = await selectRowControls(page, win, rowRe, `selx-${key}-${press.replace(/\W+/g, '')}`, press);
                if (r.pressed && press === 'More Information') { await page.waitForTimeout(6000); const h = await historyRead(page, topWin(page)); r.pressed.history10s = {text: flat(h.text, 300), rows: h.rows}; await snap(page, `selx-${key}-info-10s`, {h}); }
                sum[`${key}-${press}`] = {category: cat, ...r};
                log(`[selx ${key} ${press}]`, JSON.stringify(sum[`${key}-${press}`]).slice(0, 900));
                await page.goto(ctxUrl('/dashboard/editorial')).catch(() => {}); await idle(page);
            });
            record('selx-summary', sum);
            await signOut(page).catch(() => {});
        } finally { record('selx-summary', sum); await close(); }
    }

    // ---- selxdel: the Copyedited window's "Delete" on a Submission-stage row, confirmed ----
    if (!isOPS && on('selxdel')) {
        const B = S.b;
        const {page, close} = await launch(app);
        const sum = {};
        try {
            await signInAs(page, u.mgr);
            await sect('selxdel', async () => {
                await openWorkflow(page, workflow(B.id, 'workflow_4'), 'selxdel-land');
                const win = await selectWindowOpen(page, 1, 'selxdel');
                await win.locator('input[name="allStages"]').first().click(); await page.waitForTimeout(1500); await idle(page);
                const r = await selectRowControls(page, win, /notes\.md/, 'selxdel-row', 'Delete');
                sum.dialog = r.pressed;
                await watchStart(page);
                const resp = page.waitForResponse((x) => /delete/.test(x.url()), {timeout: 15000}).catch(() => null);
                await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK', exact: true}).first().click();
                const rr = await resp;
                await page.waitForTimeout(3000); await idle(page);
                sum.response = rr ? {status: rr.status(), url: rr.url().replace(/^.*\/index\.php/, '').slice(0, 200), body: flat(await rr.text().catch(() => ''), 300)} : null;
                await page.waitForTimeout(10000);
                sum.seen = await watchEnd(page);
                sum.dialogsAfter15s = (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 200)}));
                sum.winAfter = await selectWindowRead(page, win, 'selxdel-win-after');
                const dc = page.locator('[role="dialog"]:visible').filter({hasText: 'Are you sure you wish to delete this item?'}).last().getByRole('button', {name: 'Cancel', exact: true});
                if (await dc.count()) { await dc.click().catch(() => {}); await page.waitForTimeout(800); sum.dialogCancelled = true; }
                await selectCancel(page, win);
                const i = await openWorkflow(page, workflow(B.id, 'workflow_1'), 'selxdel-submission-after');
                sum.submissionAfter = (i.tables.find((t) => t.name === 'Submission Files') || {}).rows;
                log('[selxdel]', JSON.stringify(sum).slice(0, 1500));
            });
            record('selxdel-summary', sum);
        } finally { record('selxdel-summary', sum); await close(); }
    }

    // ---- rev: "Files for Review" window; Rule 16's older lists: the reviewer's, the reviewer row's "Edit", "Add Reviewer" ----
    if (!isOPS && on('rev')) {
        const C = S.c;
        const {page, close} = await launch(app);
        const sum = {};
        try {
            await signInAs(page, u.mgr);
            for (const key of ['c', ...(isOMP && S.ci && !S.ci.error ? ['ci'] : [])]) await sect(`rev window ${key}`, async () => {
                const X = S[key];
                await openWorkflow(page, workflow(X.id, rkey(X)), `rev-mgr-${key}-round`);
                const win = await selectWindowOpen(page, 0, `rev-mgr-${key}-ffr`);
                if (!win) { sum[`${key}Win`] = {absent: true}; return; }
                sum[`${key}Win`] = await selectWindowRead(page, win, `rev-mgr-${key}-ffr-win`);
                sum[`${key}WinAll`] = await selectAllStages(page, win, `rev-mgr-${key}-ffr-win`);
                sum[`${key}RowCtl`] = await selectRowControls(page, win, 'notes.md', `rev-mgr-${key}-ffr-row`);
                if (!sum[`${key}RowCtl`].links || !sum[`${key}RowCtl`].links.length) sum[`${key}RowCtl`] = await selectRowControls(page, win, 'article.pdf', `rev-mgr-${key}-ffr-row`);
                await selectCancel(page, win);
                // "More Information" pressed on a row of the round and on a Submission-stage row
                const roundNo = String(((X.files || []).find((f) => f.reviewRoundId) || {}).submissionFileId);
                const subNo = String(((X.files || []).find((f) => !f.reviewRoundId) || {}).submissionFileId);
                for (const [which, no, all] of [['round', roundNo, false], ['submission', subNo, true]]) {
                    await openWorkflow(page, workflow(X.id, rkey(X)), `rev-mgr-${key}-press-${which}-land`);
                    const w2 = await selectWindowOpen(page, 0, `rev-mgr-${key}-press-${which}`);
                    if (all) { await w2.locator('input[name="allStages"]').first().click(); await page.waitForTimeout(1500); await idle(page); }
                    const r = await selectRowControls(page, w2, new RegExp(`(^|\\s)${no}\\s`), `rev-mgr-${key}-${which}-info`, 'More Information');
                    if (r.pressed) { await page.waitForTimeout(5000); const h = await historyRead(page, topWin(page)); r.pressed.history = {text: flat(h.text, 300), rows: h.rows}; await snap(page, `rev-mgr-${key}-${which}-info-5s`, {h}); }
                    sum[`${key}Press-${which}`] = r;
                    log(`[rev ${key} ${which} More Information]`, JSON.stringify(r).slice(0, 700));
                    await page.goto(ctxUrl('/dashboard/editorial')).catch(() => {}); await idle(page);
                }
            });
            // the reviewer row's "Edit" window: its file list and search
            await sect('rev edit window', async () => {
                await openWorkflow(page, workflow(C.id, rkey(C)), 'rev-mgr-edit-land');
                const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: /Rae Reviewer/}).first();
                await row.getByRole('button', {name: /More Actions/}).first().click(); await page.waitForTimeout(300);
                sum.reviewerMenu = await menuItems(page);
                await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
                const edit = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
                await edit.waitFor({timeout: 30000}); await edit.locator('.pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
                await idle(page); await page.waitForTimeout(800);
                await loc(page, 'rev: the reviewer row\'s "Edit" window', edit);
                sum.editGrid = await gridRead(edit);
                await snap(page, 'rev-mgr-edit-window', {grid: sum.editGrid});
                log('[rev edit grid]', JSON.stringify(sum.editGrid).slice(0, 1800));
                sum.editSearch1 = await gridSearch(page, edit, 'notes', 'rev-mgr-edit');
                await snap(page, 'rev-mgr-edit-search-notes', {s: sum.editSearch1});
                sum.editSearch2 = await gridSearch(page, edit, 'zzzz', 'rev-mgr-edit');
                sum.editSearch3 = await gridSearch(page, edit, '', 'rev-mgr-edit');
                const cancel = edit.locator('a:visible, button:visible').filter({hasText: /^\s*Cancel\s*$/}).last();
                if (await cancel.count()) await cancel.click(); else await closeTop(page);
                await idle(page);
            });
            // "Add Reviewer": its file list
            await sect('rev add reviewer window', async () => {
                await openWorkflow(page, workflow(C.id, rkey(C)), 'rev-mgr-add-land');
                const add = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Add Reviewer', exact: true}).first();
                await loc(page, 'rev: "Add Reviewer" button', add);
                await add.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
                const sel = page.getByRole('button', {name: /^Select /}).first();
                await sel.waitFor({timeout: 30000}).catch(() => {});
                await loc(page, 'rev: Add Reviewer "Select <name>"', sel);
                if (await sel.count()) { await sel.click(); await idle(page); await page.waitForTimeout(1500); await idle(page); }
                const w = topWin(page);
                await w.locator('.pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
                sum.addGrid = await gridRead(w);
                await snap(page, 'rev-mgr-addreviewer-window', {grid: sum.addGrid});
                log('[rev add grid]', JSON.stringify(sum.addGrid).slice(0, 1800));
                sum.addSearch = await gridSearch(page, w, 'notes', 'rev-mgr-add');
                await closeTop(page);
            });
            // the reviewer's step 1 "Review Files"
            await sect('rev reviewer', async () => {
                await signInAs(page, u.rv);
                const ra = (C.ras || [])[0];
                await page.goto(ctxUrl(`/reviewer/submission?submissionId=${C.id}&reviewId=${ra.id}`)); await idle(page);
                await page.locator('.pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
                await page.waitForTimeout(800); await idle(page);
                sum.rvGrid = await gridRead(page.locator('body'));
                await snap(page, 'rev-rv-step1', {grid: sum.rvGrid});
                log('[rev rv grid]', JSON.stringify(sum.rvGrid).slice(0, 1800));
                const scope = page.locator('.pkp_controllers_grid').filter({hasText: /Review Files|notes\.md/}).first().locator('xpath=..');
                sum.rvSearch1 = await gridSearch(page, scope, 'notes', 'rev-rv');
                await snap(page, 'rev-rv-search-notes', {s: sum.rvSearch1});
                sum.rvSearch2 = await gridSearch(page, scope, 'zzzz', 'rev-rv');
                await snap(page, 'rev-rv-search-none', {s: sum.rvSearch2});
                const l = page.locator('.pkp_controllers_grid a').filter({hasText: /article\.pdf|notes\.md/}).first();
                await gridSearch(page, scope, '', 'rev-rv');
                const l2 = page.locator('.pkp_controllers_grid a').filter({hasText: /\.pdf|\.md/}).first();
                if (await l2.count()) sum.rvDownload = await download(page, l2, 'rev-rv');
            });
            record('rev-summary', sum);
            await signOut(page).catch(() => {});
        } finally { record('rev-summary', sum); await close(); }
    }

    // ---- prod: d13 on "Production Ready Files"; le and pr: More Information (A3) ----
    if (!isOPS && on('prod')) {
        if (S.d.used) {
            const r = await app.api.createSubmission({tag: `${sc.tag}d${Date.now() % 100000}`, context: sc.contextPath, submitter: u.au, title: `K3 D-again ${sc.tag}`, decisions: ['skipExternalReview', 'sendToProduction'], files: [{file: 'article.pdf'}], participants: [{username: u.se, role: 'sectionEditor'}, {username: u.le, role: 'layoutEditor'}, {username: u.pr, role: 'proofreader'}]});
            S.d = {id: r.submissionId, publicationId: r.publicationId}; sc.subs = S; save();
        }
        S.d.used = true; save();
        const D = S.d;
        const {page, close} = await launch(app);
        const sum = {};
        try {
            await signInAs(page, u.mgr);
            let base = await mailCounts();
            await sect('prod upload pdf', async () => {
                await openWorkflow(page, workflow(D.id, 'workflow_5'), 'prod-mgr-before');
                sum.pdf = await uploadAbove(page, 'Production Ready Files', PDF, 'prod-mgr-pdf');
                sum.rowsAfterPdf = await rowsOf(page, 'Production Ready Files');
            });
            await sect('prod html', async () => {
                await openWorkflow(page, workflow(D.id, 'workflow_5'), 'prod-mgr-html-land');
                const w = await uploadAbove(page, 'Production Ready Files', HTML, 'prod-mgr-html', {stopAfterStep: 2});
                sum.htmlStep2 = w;
                const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
                await wiz.locator('.pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
                await idle(page);
                sum.depGrid0 = await gridRead(wiz);
                await snap(page, 'prod-mgr-html-step2', {grid: sum.depGrid0});
                log('[prod dep grid 0]', JSON.stringify(sum.depGrid0).slice(0, 1500));
                const up = wiz.locator('.pkp_controllers_grid').getByRole('link', {name: /Upload/}).first();
                await loc(page, 'prod: step 2 "Dependent Files" upload link', up);
                sum.depUploadLink = (await up.innerText().catch(() => '')).trim();
                await up.click(); await idle(page);
                sum.depWizard = await driveWizard(page, PNG, 'prod-mgr-depwizard', {component: 'Image', dependent: true});
                await page.waitForTimeout(800); await idle(page);
                sum.depGrid1 = await gridRead(wiz);
                await snap(page, 'prod-mgr-html-step2-with-dep', {grid: sum.depGrid1});
                log('[prod dep grid 1]', JSON.stringify(sum.depGrid1).slice(0, 1500));
                sum.depSearch1 = await gridSearch(page, wiz, 'profile', 'prod-mgr-dep');
                sum.depSearch2 = await gridSearch(page, wiz, 'zzzz', 'prod-mgr-dep');
                await snap(page, 'prod-mgr-dep-search-none', {s: sum.depSearch2});
                sum.depSearch3 = await gridSearch(page, wiz, '', 'prod-mgr-dep');
                // the dependent's name link
                const dl = wiz.locator('.pkp_controllers_grid tbody a').filter({hasText: /profile/}).first();
                await loc(page, 'prod: the dependent file\'s name link', dl);
                if (await dl.count()) sum.depDownload = await download(page, dl, 'prod-mgr-dep');
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(600);
                await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
                await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await page.waitForTimeout(800);
                const a = await openWorkflow(page, workflow(D.id, 'workflow_5'), 'prod-mgr-after-html');
                sum.rowsAfterHtml = (a.tables.find((t) => t.name === 'Production Ready Files') || {}).rows;
                ({now: base} = await mailDelta(base, 'prod-after-uploads'));
            });
            await sect('prod edit html', async () => {
                await openWorkflow(page, workflow(D.id, 'workflow_5'), 'prod-mgr-edit-land');
                const r = await pressItem(page, 'Production Ready Files', 'article.html', 'Update File Details', 'prod-mgr-edit');
                if (!r.pressed) { sum.edit = r; return; }
                await waitWindow(page); await page.waitForTimeout(800);
                sum.editGrid = await gridRead(topWin(page));
                await snap(page, 'prod-mgr-edit-window', {grid: sum.editGrid});
                await closeTop(page);
            });
            await sect('prod delete html', async () => {
                await openWorkflow(page, workflow(D.id, 'workflow_5'), 'prod-mgr-del-land');
                const r = await pressItem(page, 'Production Ready Files', 'article.html', 'Delete', 'prod-mgr-delete');
                if (!r.pressed) { sum.delete = r; return; }
                await watchStart(page);
                await topWin(page).getByRole('button', {name: 'OK', exact: true}).first().click();
                await page.waitForTimeout(3000); await idle(page);
                sum.delete = {seen: await watchEnd(page), rows: await rowsOf(page, 'Production Ready Files')};
                await openWorkflow(page, workflow(D.id, 'workflow_5'), 'prod-mgr-reup-land');
                const w = await uploadAbove(page, 'Production Ready Files', HTML, 'prod-mgr-reup', {stopAfterStep: 2});
                const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
                await wiz.locator('.pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
                sum.reupGrid = await gridRead(wiz);
                await snap(page, 'prod-mgr-reup-step2', {grid: sum.reupGrid, w});
                log('[prod reup grid]', JSON.stringify(sum.reupGrid).slice(0, 1000));
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(600);
                await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
                await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                ({now: base} = await mailDelta(base, 'prod-after-delete'));
                await openWorkflow(page, workflow(D.id, 'workflow_5'), 'prod-mgr-alog-land');
                sum.alog = await activityLog(page, 'prod-mgr-alog');
            });
            for (const k of ['le', 'pr']) await sect(`prod ${k}`, async () => {
                await signInAs(page, u[k]);
                await openWorkflow(page, workflow(D.id, 'workflow_5'), `prod-${k}-land`);
                const resps = [];
                const onR = async (r) => { if (/event-?log|history/i.test(r.url())) resps.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 220), body: flat(await r.text().catch(() => ''), 300)}); };
                page.on('response', onR);
                const r = await pressItem(page, 'Production Ready Files', 'article.pdf', 'More Information', `prod-${k}-info`);
                if (r.pressed) {
                    sum[`${k}Info`] = await infoWindow(page, `prod-${k}-info`);
                    await page.waitForTimeout(8000);
                    sum[`${k}History10s`] = await historyRead(page, topWin(page));
                    await snap(page, `prod-${k}-info-history-10s`, {h: sum[`${k}History10s`]});
                    sum[`${k}Notes`] = await openNotesTab(page);
                    if (k === 'le') sum.leAdd = await addNote(page, 'Layout checked', 'prod-le');
                    sum[`${k}HistoryAgain`] = await openHistoryTab(page);
                    await closeTop(page);
                }
                page.off('response', onR);
                sum[`${k}Responses`] = resps;
                log(`[prod ${k} responses]`, JSON.stringify(resps));
            });
            record('prod-summary', sum);
            await signOut(page).catch(() => {});
        } finally { record('prod-summary', sum); await close(); }
    }

    if (!isOPS && on('prodlog')) {
        const {page, close} = await launch(app);
        try { await signInAs(page, u.mgr); await openWorkflow(page, workflow(S.d.id, 'workflow_5'), 'prodlog-land'); record('prodlog-summary', await activityLog(page, 'prodlog-mgr')); } finally { await close(); }
    }

    // ---- dlx: "More Information" closed with and without a History "Download" first (page script errors watched) ----
    if (!isOPS && on('dlx')) {
        const {page, close} = await launch(app);
        const sum = {};
        const errs = [];
        page.on('pageerror', (e) => errs.push({at: new Date().toISOString(), text: String(e.message).slice(0, 200)}));
        try {
            await signInAs(page, u.mgr);
            for (const leg of ['control', 'download']) await sect(`dlx ${leg}`, async () => {
                await openWorkflow(page, workflow(S.b.id, 'workflow_1'), `dlx-${leg}-land`);
                const before = errs.length;
                const r = await pressItem(page, 'Submission Files', 'article.pdf', 'More Information', `dlx-${leg}`);
                if (!r.pressed) return;
                await infoWindow(page, `dlx-${leg}`);
                if (leg === 'download') sum.downloads = await historyDownloads(page, 'dlx-history');
                const mark = errs.length;
                await closeTop(page); await page.waitForTimeout(2000);
                sum[leg] = {errorsBeforeClose: mark - before, errorsOnClose: errs.slice(mark)};
                log(`[dlx ${leg}]`, JSON.stringify(sum[leg]));
            });
            record('dlx-summary', sum);
        } finally { record('dlx-summary', sum); await close(); }
    }

    // ---- leave: "More Information" › "Notes" with text typed, then the History tab, the window closed, the page left ----
    if (on('leave')) {
        const {page, close} = await launch(app);
        const sum = {};
        const browser = [];
        page.on('dialog', (d) => { browser.push({at: new Date().toISOString(), type: d.type(), message: d.message()}); d.accept().catch(() => {}); });
        try {
            await signInAs(page, u.mgr);
            await sect('leave', async () => {
                const url = isOPS ? workflow(S.p1.id, `publication_${S.p1.publicationId}_galleys`) : workflow(S.b.id, 'workflow_1');
                await openWorkflow(page, url, 'leave-mgr-land');
                const tn = isOPS ? 'Galleys' : 'Submission Files';
                const r = await pressItem(page, tn, isOPS ? 'PDF' : 'notes.md', 'More Information', 'leave-mgr');
                if (!r.pressed) { sum.r = r; return; }
                await infoWindow(page, 'leave-mgr');
                await openNotesTab(page);
                await topWin(page).locator('[role=tabpanel]:visible textarea').first().fill('Typed and not added');
                sum.afterType = browser.length;
                sum.history = await openHistoryTab(page);
                sum.afterTabSwitch = [...browser];
                const n2 = await openNotesTab(page);
                sum.notesBackText = n2.textarea;
                await snap(page, 'leave-mgr-notes-back', {n2});
                await closeTop(page);
                sum.afterClose = [...browser];
                await page.goto(ctxUrl('/dashboard/editorial')).catch((e) => { sum.gotoError = String(e.message).split('\n')[0]; });
                await idle(page);
                sum.afterLeave = [...browser];
                await openWorkflow(page, url, 'leave-mgr-back');
                const r2 = await pressItem(page, tn, isOPS ? 'PDF' : 'notes.md', 'More Information', 'leave-mgr2');
                if (r2.pressed) { await infoWindow(page, 'leave-mgr2'); sum.notesAfter = await openNotesTab(page); await closeTop(page); }
                log('[leave]', JSON.stringify(sum).slice(0, 1500));
            });
            record('leave-summary', sum);
        } finally { record('leave-summary', sum); await close(); }
    }

    // ---- arev: the author's revision: email to the assigned editors, round status, the author's task; an editor's upload ----
    if (!isOPS && on('arev')) {
        const E = S.e;
        const {page, close} = await launch(app);
        const sum = {};
        try {
            let base = await mailCounts();
            await sect('arev se before', async () => {
                await signInAs(page, u.se);
                const i = await openWorkflow(page, workflow(E.id, rkey(E)), 'arev-se-before');
                sum.seBefore = (await dialogTexts(page)).slice(0, 1).map((d) => flat(d.text, 1500))[0];
            });
            await sect('arev au', async () => {
                await signInAs(page, u.au);
                await openWorkflow(page, authorWorkflow(E.id, rkey(E)), 'arev-au-before');
                sum.auBefore = (await dialogTexts(page)).slice(0, 1).map((d) => flat(d.text, 1500))[0];
                sum.auTasksBefore = await tasksPanel(page, 'arev-au-tasks-before');
                await openWorkflow(page, authorWorkflow(E.id, rkey(E)), 'arev-au-up-land');
                sum.auUpload = await uploadAbove(page, 'Revisions Uploaded', PDF, 'arev-au-upload');
                await openWorkflow(page, authorWorkflow(E.id, rkey(E)), 'arev-au-after');
                sum.auAfter = (await dialogTexts(page)).slice(0, 1).map((d) => flat(d.text, 1500))[0];
                sum.auTasksAfter = await tasksPanel(page, 'arev-au-tasks-after');
            });
            ({now: base, out: sum.mailAuthor} = await mailDelta(base, 'arev-after-author'));
            await sect('arev se after', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(E.id, rkey(E)), 'arev-se-after');
                sum.seAfter = (await dialogTexts(page)).slice(0, 1).map((d) => flat(d.text, 1500))[0];
                const m = await app.mail._search({to: `${u.se}@mail.test`}).catch(() => ({messages: []}));
                sum.seMail = (m.messages || []).slice(0, 3).map((x) => ({subject: x.Subject, snippet: flat(x.Snippet, 300)}));
            });
            await sect('arev mgr upload', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(E.id, rkey(E)), 'arev-mgr-land');
                sum.mgrUpload = await uploadAbove(page, 'Revisions Uploaded', MD, 'arev-mgr-upload');
                ({now: base, out: sum.mailMgr} = await mailDelta(base, 'arev-after-editor'));
            });
            record('arev-summary', sum);
            await signOut(page).catch(() => {});
        } finally { record('arev-summary', sum); await close(); }
    }

    // ---- ops: a galley's "More Information", "Change File" (revision) and History, Activity Log; no "Upload/Select Files" ----
    if (isOPS && on('ops')) {
        const P = S.p1;
        const gkey = `publication_${P.publicationId}_galleys`;
        const {page, close} = await launch(app);
        const sum = {};
        try {
            await signInAs(page, u.mgr);
            let base = await mailCounts();
            const galleyTable = async () => { const i = await wfInfo(page); const t = i.tables.find((x) => /Galley/i.test(x.name || '')) || i.tables[0]; return t && t.name; };
            await sect('ops production', async () => {
                const i = await openWorkflow(page, workflow(P.id, 'workflow_5'), 'ops-mgr-production');
                sum.productionButtons = i.buttons;
                sum.selectButtons = await page.getByRole('button', {name: 'Upload/Select Files', exact: true}).count();
            });
            await sect('ops info notes', async () => {
                await openWorkflow(page, workflow(P.id, gkey), 'ops-mgr-galleys');
                const tn = await galleyTable(); sum.galleyTable = tn;
                sum.tasksBefore = await tasksCount(page);
                const r = await pressItem(page, tn, 'PDF', 'More Information', 'ops-mgr-info');
                if (!r.pressed) { sum.info = r; return; }
                sum.info1 = await infoWindow(page, 'ops-mgr-info1');
                sum.ticked1 = await tickPriorVersions(page, 'ops-mgr-info1');
                sum.notesEmpty = await openNotesTab(page);
                await snap(page, 'ops-mgr-notes-empty', {n: sum.notesEmpty});
                sum.addEmpty = await addNote(page, '', 'ops-mgr-empty');
                sum.addFirst = await addNote(page, 'First check', 'ops-mgr-first');
                sum.deleteFirst = await deleteNote(page, 'ops-mgr-first');
                sum.addSecond = await addNote(page, 'Kept note', 'ops-mgr-second');
                sum.earlier = await expandEarlier(page, 'ops-mgr');
                await closeTop(page);
                sum.tasksAfter = await tasksCount(page);
                ({now: base} = await mailDelta(base, 'ops-after-notes'));
            });
            await sect('ops change file', async () => {
                await openWorkflow(page, workflow(P.id, gkey), 'ops-mgr-galleys2');
                const tn = await galleyTable();
                const r = await pressItem(page, tn, 'PDF', 'Change File', 'ops-mgr-change');
                if (!r.pressed) { sum.change = r; return; }
                sum.change = await driveWizard(page, PDF, 'ops-mgr-change');
                await openWorkflow(page, workflow(P.id, gkey), 'ops-mgr-galleys3');
                const r2 = await pressItem(page, tn, 'PDF', 'More Information', 'ops-mgr-info2');
                if (r2.pressed) {
                    sum.info2 = await infoWindow(page, 'ops-mgr-info2');
                    sum.historyDownloads = await historyDownloads(page, 'ops-mgr-history');
                    await closeTop(page);
                }
                ({now: base} = await mailDelta(base, 'ops-after-change'));
            });
            await sect('ops html change', async () => {
                await openWorkflow(page, workflow(P.id, gkey), 'ops-mgr-galleys4');
                const tn = await galleyTable();
                const r = await pressItem(page, tn, 'HTML', 'Change File', 'ops-mgr-htmlchange');
                if (!r.pressed) { sum.htmlChange = r; return; }
                sum.htmlChange = await driveWizard(page, HTML, 'ops-mgr-htmlchange', {stopAfterStep: 2});
                const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
                await wiz.locator('.pkp_controllers_grid').first().waitFor({timeout: 15000}).catch(() => {});
                sum.htmlDepGrid = await gridRead(wiz);
                await snap(page, 'ops-mgr-htmlchange-step2', {grid: sum.htmlDepGrid});
                log('[ops html dep grid]', JSON.stringify(sum.htmlDepGrid).slice(0, 1200));
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(600);
                await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
                await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            });
            await sect('ops activity', async () => {
                await openWorkflow(page, workflow(P.id, 'workflow_5'), 'ops-mgr-alog-land');
                sum.alog = await activityLog(page, 'ops-mgr-alog');
            });
            await sect('ops mod', async () => {
                await signInAs(page, u.mod);
                await openWorkflow(page, workflow(P.id, gkey), 'ops-mod-galleys');
                const tn = await galleyTable();
                const r = await pressItem(page, tn, 'PDF', 'More Information', 'ops-mod-info');
                if (!r.pressed) { sum.mod = r; return; }
                sum.modInfo = await infoWindow(page, 'ops-mod-info');
                sum.modTicked = await tickPriorVersions(page, 'ops-mod-info');
                sum.modNotes = await openNotesTab(page);
                await snap(page, 'ops-mod-notes', {n: sum.modNotes});
                sum.modAdd = await addNote(page, 'Moderator note', 'ops-mod');
                await closeTop(page);
                ({now: base} = await mailDelta(base, 'ops-end'));
            });
            record('ops-summary', sum);
            await signOut(page).catch(() => {});
        } finally { record('ops-summary', sum); await close(); }
    }
});
