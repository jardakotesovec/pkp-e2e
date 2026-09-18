// U32 claim check, chunk K3: the two file lists of the Copyediting stage, the
// legacy "Upload/Select Files" window and the author's view.
// Rule 4 "Draft Files" (columns, the row menu "Update File Details" / "More
// Information" / "Delete" with its confirmation, the top button, no notice
// change on upload), Rule 5 the select window (title per list, A2; the stage
// groups and the "Show files from all accessible workflow stages." box; the
// window's upload control and its wizard; ticking a file from another stage,
// unticking a listed file, at both ends), Rule 6 "Copyedited Files" (same
// controls; the author's read-only rows; the notice cleared; the My Submissions
// cell "Copyedited Files Uploaded: {count}" at 0, 1 and back), Rule 11 the
// author's view (the panels present and absent; the "has not yet been
// initiated." box before the stage), Rule 12 the old author-dashboard address.
// Spec: docs/specs/U32-copyediting-stage.md lines 61–68, 115–140, 181–198, 360–367.
//
// OJS/OMP: one scratch context per app with a manager (mgr), an assigned
// Section/Series editor (se), an assigned Copyeditor (ce), the submitting
// author (au) and a second author (au2, a stranger); `admin` is enrolled as a
// manager of every scratch context (seed-facts) and stands for the Site
// Administrator level. Submissions:
//   S1  at Copyediting through review, se + ce assigned  → every file drive
//   S2  at the Submission stage (no decision)           → the author's "not yet initiated" read
// OPS: a scratch server with one preprint, the author's typed addresses as the
// cross-app control of the exclusivity claims.
//
// Run: PROBE_FEATURE=U32 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U32/K3/k3.js
// PHASES=seed,subfile,draft,copyedited,roles,press,cross,notice,author,delete,ops narrows (state in k3-state-<app>.json).
'use strict';

const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
const TXT = path.join(REPO, 'apps/ojs/playwright/fixtures/files/not-an-image.txt');
const ALL = ['seed', 'subfile', 'draft', 'copyedited', 'roles', 'press', 'cross', 'notice', 'author', 'delete', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); record(`FAILED-${name}`, {error: String(e.stack || e).slice(0, 1500)}); }
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
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.offsetParent !== null).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
        links: [...d.querySelectorAll('a')].filter((b) => b.offsetParent !== null).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
// The workflow dialog as data: headings, visible buttons, tables (name → rows, header cells, row buttons), notices.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        headers: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim().replace(/\s+/g, ' ')),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
        rowButtons: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('button, a')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter(Boolean)),
    }));
    const headings = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"], [class*="pkpNotification"], .pkpBadge, [class*="badge"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const nav = [...root.querySelectorAll('nav a, nav button, [role=menuitem], [role=menubar] *[role]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    return {url: location.href, dialogCount: dlgs.length, headings, buttons, tables, notices, nav};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
// The legacy select window's grid as data: the category (stage) rows, the file rows with their ticks, the "show all" box.
const windowGrid = (page) => page.locator('[role="dialog"]:visible').last().evaluate((d) => {
    const vis = (e) => e.offsetParent !== null;
    const rows = [...d.querySelectorAll('table tr')].filter(vis).map((tr) => {
        const cb = tr.querySelector('input[type=checkbox]');
        return {text: tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 160), category: /gridCategory|category/.test(tr.className), checked: cb ? cb.checked : null, hasBox: !!cb, cls: tr.className.slice(0, 80)};
    });
    const showAll = [...d.querySelectorAll('input[type=checkbox]')].filter((i) => !i.closest('table')).map((i) => ({name: i.name, checked: i.checked, label: (i.closest('label') || document.querySelector(`label[for="${i.id}"]`) || {}).innerText?.trim()}));
    const headers = [...d.querySelectorAll('table th')].map((th) => th.innerText.trim());
    const links = [...d.querySelectorAll('a, button')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean);
    return {title: d.getAttribute('aria-label') || null, headers, rows, showAll, controls: links.slice(0, 40), text: d.innerText.replace(/\s+/g, ' ').slice(0, 1500)};
}).catch((e) => ({error: String(e.message)}));

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const authorWorkflow = (id, key) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };

    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 2000)})), ...(extra || {})});
        log(`[${label}]`, app.name, 'headings:', JSON.stringify((info.headings || []).slice(0, 8)), 'tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)), 'buttons:', JSON.stringify((info.buttons || []).filter((b) => /Upload|Send|Move|Assign|Add|Decision/i.test(b))), 'notices:', JSON.stringify((info.notices || []).slice(0, 6)));
        return {info, dialogs, s};
    }
    const table = (page, name) => page.getByRole('table', {name, exact: true});
    const topWin = (page) => page.locator('[role="dialog"]:visible').last();
    async function waitWindow(page) {
        await topWin(page).waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
    }
    // Press the nth "Upload/Select Files" (0 Draft, 1 Copyedited) and record the window as it lands.
    async function openSelectWindow(page, nth, label) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        const n = await btns.count();
        await loc(page, `${label}: "Upload/Select Files" (${n} on screen, nth ${nth})`, btns.nth(nth));
        await btns.nth(nth).click(); await idle(page);
        await waitWindow(page);
        const grid = await windowGrid(page);
        const dlg = (await dialogTexts(page)).slice(-1)[0];
        await snap(page, `${label}-window`, {grid, dialog: dlg});
        log(`[${label}-window]`, 'title:', JSON.stringify(dlg && dlg.name), 'rows:', JSON.stringify(grid.rows.map((r) => `${r.category ? '#' : ''}${r.text}${r.hasBox ? (r.checked ? ' [x]' : ' [ ]') : ''}`)), 'showAll:', JSON.stringify(grid.showAll), 'controls:', JSON.stringify(grid.controls));
        return {grid, dlg};
    }
    // Tick "Show files from all accessible workflow stages." in the open window and record the regrouped grid.
    async function showAllStages(page, label) {
        const win = topWin(page);
        const box = win.locator('input[type=checkbox]').filter({has: page.locator('xpath=ancestor::*[not(self::table) and not(ancestor::table)][1]')}).first();
        let target = win.getByRole('checkbox', {name: /all accessible workflow stages/i}).first();
        if (!(await target.count())) target = win.locator('label:has-text("all accessible workflow stages") input[type=checkbox], input[type=checkbox]:not(table input)').first();
        if (!(await target.count())) target = box;
        await loc(page, `${label}: "Show files from all accessible workflow stages."`, target);
        await target.click(); await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && !/Loading/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
        await page.waitForTimeout(600); await idle(page);
        const grid = await windowGrid(page);
        await snap(page, `${label}-window-allstages`, {grid});
        log(`[${label}-window-allstages]`, 'rows:', JSON.stringify(grid.rows.map((r) => `${r.category ? '#' : ''}${r.text}${r.hasBox ? (r.checked ? ' [x]' : ' [ ]') : ''}`)));
        return grid;
    }
    // Drive the 3-step upload wizard already open on the page; returns the step titles seen.
    async function driveWizard(page, file, label, {cancelAtStep} = {}) {
        const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        await wiz.waitFor({timeout: 30000});
        await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        const w0 = (await dialogTexts(page)).slice(-1)[0];
        const steps = [];
        steps.push({title: w0 && w0.name, text: flat(w0 && w0.text, 700)});
        const genre = wiz.locator('select[id^="genreId"]');
        if (await genre.count()) {
            const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
            const pick = opts.find((o) => o.value && o.value !== '' && !/^(Select|Choose)/i.test(o.text));
            if (pick) await genre.selectOption(pick.value);
            record(`${label}-wizard-genres`, {opts, picked: pick});
        }
        await wiz.locator('input[type="file"]').setInputFiles(file);
        await wiz.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000});
        await idle(page);
        await snap(page, `${label}-wizard-step1`, {dialog: (await dialogTexts(page)).slice(-1)[0]});
        if (cancelAtStep === 1) {
            const c = wiz.getByRole('link', {name: /Cancel/}).first();
            const cb = wiz.getByRole('button', {name: /Cancel/}).first();
            await loc(page, `${label}: the wizard's Cancel`, (await c.count()) ? c : cb);
            await ((await c.count()) ? c : cb).click(); await idle(page);
            await page.waitForTimeout(800); await idle(page);
            const after = await dialogTexts(page);
            await snap(page, `${label}-wizard-cancelled`, {dialogs: after.map((d) => ({name: d.name, buttons: d.buttons, text: flat(d.text, 800)})), grid: await windowGrid(page)});
            return {steps, cancelled: true};
        }
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('tab', {name: /2\./}).waitFor({timeout: 30000}).catch(() => {});
        const w2 = (await dialogTexts(page)).slice(-1)[0]; steps.push({title: w2 && w2.name, text: flat(w2 && w2.text, 500)});
        await snap(page, `${label}-wizard-step2`, {dialog: w2});
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        const w3 = (await dialogTexts(page)).slice(-1)[0]; steps.push({title: w3 && w3.name, text: flat(w3 && w3.text, 500)});
        await snap(page, `${label}-wizard-step3`, {dialog: w3});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        return {steps};
    }
    // The select window's upload control, then the wizard, then wait for the redraw (K4: "OK" before the redraw saves nothing).
    async function uploadInWindow(page, file, label) {
        const win = topWin(page);
        let up = win.getByRole('link', {name: /Upload|Add/}).first();
        if (!(await up.count())) up = win.getByRole('button', {name: /Upload|Add/}).first();
        const upLabel = flat(await up.innerText().catch(() => ''), 60);
        await loc(page, `${label}: the window's upload control ("${upLabel}")`, up);
        await up.click(); await idle(page);
        const r = await driveWizard(page, file, label);
        const base = path.basename(file);
        await topWin(page).locator(`tr:has-text("${base}") input[type=checkbox]:checked`).first().waitFor({timeout: 15000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const grid = await windowGrid(page);
        await snap(page, `${label}-window-after-upload`, {grid, uploadControl: upLabel, wizard: r.steps});
        log(`[${label}-window-after-upload]`, 'upload control:', JSON.stringify(upLabel), 'wizard titles:', JSON.stringify(r.steps.map((s) => s.title)), 'rows:', JSON.stringify(grid.rows.map((x) => `${x.text}${x.hasBox ? (x.checked ? ' [x]' : ' [ ]') : ''}`)));
        return {upLabel, wizard: r.steps, grid};
    }
    // Save (OK) or leave (Cancel) the select window and record the screen after.
    async function closeWindow(page, how, label) {
        const win = topWin(page);
        let ctl = how === 'ok' ? win.getByRole('button', {name: /^(OK|Save)$/}).last() : win.getByRole('link', {name: /^\s*Cancel\s*$/}).last();
        if (!(await ctl.count())) ctl = how === 'ok' ? win.getByRole('link', {name: /^(OK|Save)$/}).last() : win.getByRole('button', {name: /^Cancel$/}).last();
        await loc(page, `${label}: the window's ${how === 'ok' ? '"OK"' : '"Cancel"'}`, ctl);
        await ctl.click(); await idle(page);
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).length <= 1, null, {timeout: 15000}).catch(() => {});
        await page.waitForTimeout(500); await idle(page);
        const info = await wfInfo(page);
        await snap(page, `${label}-after-${how}`, {info, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))});
        log(`[${label}-after-${how}]`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 700), 'notices:', JSON.stringify(info.notices));
        return info;
    }
    // Tick or untick the row of `fileText` in the open window.
    async function setTick(page, fileText, checked, label) {
        const row = topWin(page).locator(`tr:has-text("${fileText}")`).filter({has: page.locator('input[type=checkbox]')}).first();
        const box = row.locator('input[type=checkbox]').first();
        await loc(page, `${label}: the tick box of "${fileText}"`, box);
        if (checked) await box.check({force: true}); else await box.uncheck({force: true});
        await idle(page);
        record(`${label}-tick`, {fileText, checked, now: await box.isChecked()});
    }
    // Open a row's "More Actions" menu in the named list and record the items; optionally press one.
    async function rowMenu(page, listName, rowText, label, pressItem) {
        const t = table(page, listName);
        const row = t.locator('tbody tr').filter({hasText: rowText}).first();
        const more = row.getByRole('button', {name: /More Actions/}).first();
        const cnt = await more.count();
        await loc(page, `${label}: "${listName}" row "${rowText}" More Actions`, more);
        if (!cnt) { record(`${label}-menu`, {absent: true, rowButtons: await row.locator('button, a').allInnerTexts().catch(() => [])}); log(`[${label}-menu] no More Actions on "${rowText}"`); return {absent: true}; }
        const moreName = await more.getAttribute('aria-label').catch(() => null);
        await more.click(); await idle(page);
        const items = await menuItems(page);
        await snap(page, `${label}-menu`, {items, moreName});
        log(`[${label}-menu]`, JSON.stringify(moreName), JSON.stringify(items));
        if (pressItem) {
            const it = page.getByRole('menuitem', {name: pressItem, exact: true}).first();
            if (!(await it.count())) { await page.keyboard.press('Escape'); return {items, pressed: null}; }
            await it.click(); await idle(page);
            await page.waitForTimeout(600); await idle(page);
            await waitWindow(page).catch(() => {});
            const dl = await dialogTexts(page);
            const top = dl.slice(-1)[0];
            await snap(page, `${label}-${pressItem.replace(/\W+/g, '').toLowerCase()}`, {dialogs: dl.map((d) => ({name: d.name, buttons: d.buttons, links: d.links, text: flat(d.text, 1500)}))});
            log(`[${label}-${pressItem}]`, 'title:', JSON.stringify(top && top.name), 'buttons:', JSON.stringify(top && top.buttons), 'links:', JSON.stringify(top && top.links.slice(0, 12)), 'text:', flat(top && top.text, 300));
            return {items, pressed: pressItem, top};
        }
        await page.keyboard.press('Escape'); await idle(page);
        return {items};
    }
    async function leaveTopWindow(page, label) {
        const win = topWin(page);
        const dl = await dialogTexts(page);
        if (dl.length <= 1) return;
        let c = win.getByRole('button', {name: /^(Cancel|Close)$/}).last();
        if (!(await c.count())) c = win.getByRole('link', {name: /^\s*(Cancel|Close)\s*$/}).last();
        if (await c.count()) { await c.click(); await idle(page); }
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).length <= 1, null, {timeout: 10000}).catch(() => {});
        await idle(page);
    }
    // Press a file-name link/button in the named list and record whether a download or a popup follows.
    async function pressFileName(page, listName, rowText, label) {
        const t = table(page, listName);
        const row = t.locator('tbody tr').filter({hasText: rowText}).first();
        let link = row.getByRole('link').filter({hasText: rowText}).first();
        if (!(await link.count())) link = row.getByRole('button').filter({hasText: rowText}).first();
        if (!(await link.count())) { record(`${label}-filename`, {absent: true, rowHtml: flat(await row.innerHTML().catch(() => ''), 600)}); return; }
        const href = await link.getAttribute('href').catch(() => null);
        await loc(page, `${label}: the file name in "${listName}"`, link);
        const dlP = page.waitForEvent('download', {timeout: 8000}).then((d) => ({download: d.suggestedFilename(), url: d.url()})).catch(() => null);
        const popP = page.waitForEvent('popup', {timeout: 8000}).then(async (p) => { const u = p.url(); await p.close().catch(() => {}); return {popup: u}; }).catch(() => null);
        await link.click(); await idle(page);
        const [dl, pop] = await Promise.all([dlP, popP]);
        const dialogs = (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}));
        record(`${label}-filename`, {href, download: dl, popup: pop, dialogsAfter: dialogs, url: page.url()});
        log(`[${label}-filename]`, JSON.stringify({href, dl, pop, dialogs: dialogs.length}));
    }
    // The author's My Submissions list row for a title: its cells.
    async function mySubmissionsRow(page, title, label) {
        await page.goto(ctxUrl('/dashboard/mySubmissions')); await idle(page);
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const rows = await page.locator('main table tbody tr, table tbody tr').evaluateAll((els, t) => els.filter((tr) => tr.innerText.includes(t)).map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' '))), title).catch(() => []);
        const s = await snap(page, label, {rows});
        log(`[${label}]`, JSON.stringify(rows));
        return rows;
    }

    // ---- OPS: the control read -------------------------------------------------
    if (isOPS) {
        if (!on('ops')) return;
        if (!sc.contextPath) {
            const t = tag('u32k3');
            const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}];
            const ctx = await app.api.createContext({tag: t, context: {name: `U32 K3 ${t}`, acronym: 'U32K3', contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.users = {mgr: `${t}mgr`, au: `${t}au`};
            const s = await app.api.createSubmission({tag: `${t}p`, context: sc.contextPath, submitter: sc.users.au, title: `K3 OPS preprint ${t}`});
            sc.p = s.submissionId; save();
        }
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.au);
            await openWorkflow(page, authorWorkflow(sc.p), 'ops-au-landing');
            await openWorkflow(page, authorWorkflow(sc.p, 'workflow_4'), 'ops-au-workflow_4-typed');
            await page.goto(ctxUrl(`/authorDashboard/submission/${sc.p}`)); await idle(page);
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            await snap(page, 'ops-au-authorDashboard', {landed: page.url(), info: await wfInfo(page), dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 800)}))});
            log('[ops-au-authorDashboard]', page.url());
            await mySubmissionsRow(page, `K3 OPS preprint`, 'ops-au-mysubmissions');
            await signOut(page);
            await signInAs(page, sc.users.mgr);
            await openWorkflow(page, workflow(sc.p), 'ops-mgr-landing');
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u32k3');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Section'},
            {username: `${t}ce`, roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copyeditor'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${t}au2`, roles: ['author'], givenName: 'Bo', familyName: 'Stranger'},
        ];
        const ctx = await app.api.createContext({tag: t, context: {name: `U32 K3 ${t}`, acronym: 'U32K3', contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]));
        const u = sc.users;
        const se = {username: u.se, role: 'sectionEditor'};
        const ce = {username: u.ce, role: 'copyeditor'};
        const viaReview = isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        const seeds = {
            s1: {title: `K3 S1 at copyediting ${t}`, decisions: viaReview, participants: [se, ce]},
            s2: {title: `K3 S2 at submission ${t}`, decisions: [], participants: [se]},
        };
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec});
                sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId);
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
        }
        save();
        record('seed', sc);
    }
    const u = sc.users; const S = sc.subs || {};
    if (!u || !S.s1 || !S.s1.id) { log('[k3] no state; run the seed phase first'); return; }
    const S1 = S.s1.id;

    // ---- subfile: mgr puts one file on the Submission stage ("Submission Files"), the file for Rule 5's tick-from-another-stage ----
    if (on('subfile')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await sect('subfile', async () => {
                const a = await openWorkflow(page, workflow(S1, 'workflow_1'), 's1-mgr-submission-stage');
                const dlg = page.locator('[role="dialog"]:visible').first();
                let up = dlg.getByRole('button', {name: /^Upload|Upload\/Select|Add File/i}).first();
                const upName = flat(await up.innerText().catch(() => ''), 60);
                await loc(page, `Submission stage: the files panel's upload control ("${upName}")`, up);
                await up.click(); await idle(page);
                await waitWindow(page);
                const top = (await dialogTexts(page)).slice(-1)[0];
                record('s1-mgr-submission-upload-opened', {pressed: upName, title: top && top.name, text: flat(top && top.text, 600)});
                const isWizard = await page.locator('div[id^="fileUploadWizard"]:visible').count();
                if (isWizard) {
                    await driveWizard(page, TXT, 's1-subfile');
                } else {
                    await uploadInWindow(page, TXT, 's1-subfile');
                    await closeWindow(page, 'ok', 's1-subfile');
                }
                await openWorkflow(page, workflow(S1, 'workflow_1'), 's1-mgr-submission-stage-after');
                sc.subFile = path.basename(TXT); save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- draft: Rule 4 + Rule 5 on "Draft Files" as mgr ----
    if (on('draft')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await sect('draft-window', async () => {
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-before-draft');
                // the window as it lands, then the "show all" box, then a wizard cancel, then a real upload
                await openSelectWindow(page, 0, 's1-draft');
                await showAllStages(page, 's1-draft');
                // sweep: the wizard cancelled on its first step
                const win = topWin(page);
                let up = win.getByRole('link', {name: /Upload|Add/}).first();
                if (!(await up.count())) up = win.getByRole('button', {name: /Upload|Add/}).first();
                await up.click(); await idle(page);
                await driveWizard(page, MD, 's1-draft-cancelled', {cancelAtStep: 1});
                // the real upload: article.pdf into Draft Files
                await uploadInWindow(page, PDF, 's1-draft');
                await closeWindow(page, 'ok', 's1-draft-upload');
            });
            await sect('draft-tick-other-stage', async () => {
                if (!sc.subFile) return;
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-before-tick');
                await openSelectWindow(page, 0, 's1-draft-tick');
                let grid = await windowGrid(page);
                if (!grid.rows.some((r) => r.text.includes(sc.subFile))) await showAllStages(page, 's1-draft-tick');
                await setTick(page, sc.subFile, true, 's1-draft-tick');
                // sweep: leave with the change unsaved first
                await closeWindow(page, 'cancel', 's1-draft-tick-unsaved');
                await openSelectWindow(page, 0, 's1-draft-tick2');
                grid = await windowGrid(page);
                if (!grid.rows.some((r) => r.text.includes(sc.subFile))) await showAllStages(page, 's1-draft-tick2');
                await setTick(page, sc.subFile, true, 's1-draft-tick2');
                await closeWindow(page, 'ok', 's1-draft-tick2');
                // the Submission stage still holds it
                await openWorkflow(page, workflow(S1, 'workflow_1'), 's1-mgr-submission-after-tick');
                // untick it again
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-before-untick');
                await openSelectWindow(page, 0, 's1-draft-untick');
                await setTick(page, sc.subFile, false, 's1-draft-untick');
                await closeWindow(page, 'ok', 's1-draft-untick');
                await openWorkflow(page, workflow(S1, 'workflow_1'), 's1-mgr-submission-after-untick');
                // the other end: untick the file uploaded straight into the list
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-before-untick-own');
                await openSelectWindow(page, 0, 's1-draft-untick-own');
                await setTick(page, path.basename(PDF), false, 's1-draft-untick-own');
                await closeWindow(page, 'ok', 's1-draft-untick-own');
                await openSelectWindow(page, 0, 's1-draft-untick-own-reopen');
                const g = await windowGrid(page);
                const own = g.rows.find((r) => r.text.includes(path.basename(PDF)));
                if (own && own.checked === false) { await setTick(page, path.basename(PDF), true, 's1-draft-retick-own'); await closeWindow(page, 'ok', 's1-draft-retick-own'); }
                else await closeWindow(page, 'cancel', 's1-draft-untick-own-reopen');
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-after-draft-phase');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- copyedited: Rule 6 + A2 as mgr; the author's My Submissions cell at 0 and 1 ----
    if (on('copyedited')) {
        const {page, close} = await launch(app);
        try {
            await sect('count-before', async () => {
                await signInAs(page, u.au);
                await mySubmissionsRow(page, S.s1.title, 's1-au-mysubmissions-0');
            });
            await sect('copyedited-window', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-se-before-copyedited');
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-before-copyedited');
                await openSelectWindow(page, 1, 's1-copyedited');
                await showAllStages(page, 's1-copyedited');
                await uploadInWindow(page, MD, 's1-copyedited');
                await closeWindow(page, 'ok', 's1-copyedited-upload');
                // a second copyedited file, the spare for the Delete drive
                await openSelectWindow(page, 1, 's1-copyedited2');
                await uploadInWindow(page, MD, 's1-copyedited2');
                await closeWindow(page, 'ok', 's1-copyedited2-upload');
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-with-files');
            });
            await sect('count-after', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-se-with-files');
                await signInAs(page, u.au);
                await mySubmissionsRow(page, S.s1.title, 's1-au-mysubmissions-2');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- roles: the two lists at every permission level; row menus; the window title per list ----
    if (on('roles')) {
        const {page, close} = await launch(app);
        try {
            const pdf = path.basename(PDF), md = path.basename(MD);
            for (const [who, user, author] of [['admin', 'admin', false], ['mgr', u.mgr, false], ['se', u.se, false], ['ce', u.ce, false], ['au', u.au, true]]) {
                await sect(`roles-${who}`, async () => {
                    await signInAs(page, user);
                    await openWorkflow(page, author ? authorWorkflow(S1) : workflow(S1), `s1-${who}-landing`);
                    const {info} = await openWorkflow(page, author ? authorWorkflow(S1, 'workflow_4') : workflow(S1, 'workflow_4'), `s1-${who}-copyediting`);
                    const upl = await page.getByRole('button', {name: 'Upload/Select Files', exact: true}).count();
                    record(`s1-${who}-summary`, {uploadSelectButtons: upl, tables: info.tables, headings: info.headings, buttons: info.buttons, notices: info.notices});
                    if (await table(page, 'Draft Files').count()) await rowMenu(page, 'Draft Files', pdf, `s1-${who}-draft`);
                    if (await table(page, 'Copyedited Files').count()) await rowMenu(page, 'Copyedited Files', md, `s1-${who}-copyedited`);
                    if (upl) {
                        await openSelectWindow(page, 0, `s1-${who}-draft`);
                        await showAllStages(page, `s1-${who}-draft`).catch(() => {});
                        await closeWindow(page, 'cancel', `s1-${who}-draft-window`);
                        if (upl > 1) { await openSelectWindow(page, 1, `s1-${who}-copyedited`); await closeWindow(page, 'cancel', `s1-${who}-copyedited-window`); }
                    }
                    if (who === 'au') await pressFileName(page, 'Copyedited Files', md, 's1-au-copyedited');
                });
            }
        } finally { await close(); }
    }

    // ---- press: the row menu's entries pressed, as the Copyeditor (the lowest editorial level); the screen re-landed between presses (a closed side window hides the table behind it) ----
    if (on('press')) {
        const {page, close} = await launch(app);
        try {
            const pdf = path.basename(PDF);
            await sect('press', async () => {
                await signInAs(page, u.ce);
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-ce-menu-press-before');
                await rowMenu(page, 'Draft Files', pdf, 's1-ce-draft-update', 'Update File Details');
                await leaveTopWindow(page, 's1-ce-draft-update');
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-ce-menu-press-2');
                await rowMenu(page, 'Draft Files', pdf, 's1-ce-draft-info', 'More Information');
                await leaveTopWindow(page, 's1-ce-draft-info');
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-ce-menu-press-3');
                await rowMenu(page, 'Draft Files', pdf, 's1-ce-draft-delete', 'Delete');
                const conf = topWin(page);
                const cancel = conf.getByRole('button', {name: /^Cancel$/}).first();
                if (await cancel.count()) { await loc(page, 'Delete confirmation: "Cancel"', cancel); await cancel.click(); await idle(page); }
                await page.waitForTimeout(500); await idle(page);
                const info = await wfInfo(page);
                await snap(page, 's1-ce-draft-delete-cancelled', {info});
                log('[delete cancelled]', JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 500));
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-ce-menu-press-4');
                await pressFileName(page, 'Draft Files', pdf, 's1-ce-draft');
                await signOut(page);
            });
        } finally { await close(); }
    }

    // ---- cross: the other list's files, listed under the same stage in the window: ticked and saved (the sweep of Rule 5's "file from another stage") ----
    if (on('cross')) {
        const {page, close} = await launch(app);
        try {
            const pdf = path.basename(PDF), md = path.basename(MD);
            await sect('cross', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-before-cross');
                await openSelectWindow(page, 0, 's1-cross-draft');
                await setTick(page, md, true, 's1-cross-draft');
                await closeWindow(page, 'ok', 's1-cross-draft');
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-cross-2');
                await openSelectWindow(page, 1, 's1-cross-copyedited');
                await setTick(page, pdf, true, 's1-cross-copyedited');
                await closeWindow(page, 'ok', 's1-cross-copyedited');
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-after-cross');
                await signOut(page);
            });
        } finally { await close(); }
    }

    // ---- notice: on a fresh S3, the assigned Section editor's notice before and after a Draft upload (Rule 4 "changes no notice") and after the first copyedited file (Rule 6) ----
    if (on('notice')) {
        if (!S.s3 || !S.s3.id) {
            const t = sc.tag;
            const viaReview = isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
            try {
                const r = await app.api.createSubmission({tag: `${t}s3`, context: sc.contextPath, submitter: u.au, title: `K3 S3 notice ${t}`, decisions: viaReview, participants: [{username: u.se, role: 'sectionEditor'}, {username: u.ce, role: 'copyeditor'}]});
                sc.subs.s3 = {id: r.submissionId, title: `K3 S3 notice ${t}`, stageId: r.stageId}; save();
            } catch (e) { log('[seed s3 FAILED]', String(e.message).slice(0, 400)); }
        }
        const S3 = sc.subs.s3 && sc.subs.s3.id;
        if (S3) {
            const {page, close} = await launch(app);
            try {
                await sect('notice', async () => {
                    await signInAs(page, u.se);
                    await openWorkflow(page, workflow(S3, 'workflow_4'), 's3-se-0-fresh');
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S3, 'workflow_4'), 's3-mgr-0-fresh');
                    await openSelectWindow(page, 0, 's3-draft');
                    await uploadInWindow(page, PDF, 's3-draft');
                    await closeWindow(page, 'ok', 's3-draft-upload');
                    await signInAs(page, u.se);
                    await openWorkflow(page, workflow(S3, 'workflow_4'), 's3-se-1-after-draft');
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S3, 'workflow_4'), 's3-mgr-1');
                    await openSelectWindow(page, 1, 's3-copyedited');
                    await uploadInWindow(page, MD, 's3-copyedited');
                    await closeWindow(page, 'ok', 's3-copyedited-upload');
                    await signInAs(page, u.se);
                    await openWorkflow(page, workflow(S3, 'workflow_4'), 's3-se-2-after-copyedited');
                    await signInAs(page, u.ce);
                    await openWorkflow(page, workflow(S3, 'workflow_4'), 's3-ce-2-after-copyedited');
                    await signOut(page);
                });
            } finally { await close(); }
        }
    }

    // ---- author: Rule 11 before the stage (S2) and Rule 12 the old address, with the mgr and the stranger as controls ----
    if (on('author')) {
        const {page, close} = await launch(app);
        try {
            const S2 = S.s2 && S.s2.id;
            const oldAddr = (id) => ctxUrl(`/authorDashboard/submission/${id}`);
            const typed = async (who, id, label) => {
                await page.goto(oldAddr(id)); await idle(page);
                await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 8000}).catch(() => {});
                await idle(page);
                const info = await wfInfo(page);
                const dialogs = (await dialogTexts(page)).map((d) => ({name: d.name, buttons: d.buttons, text: flat(d.text, 1500)}));
                await snap(page, label, {typed: oldAddr(id), landed: page.url(), info, dialogs});
                log(`[${label}]`, who, '→', page.url(), 'headings:', JSON.stringify(info.headings.slice(0, 6)), 'nav:', JSON.stringify(info.nav.slice(0, 12)));
            };
            await sect('author-s2', async () => {
                if (!S2) return;
                await signInAs(page, u.au);
                await openWorkflow(page, authorWorkflow(S2), 's2-au-landing');
                await openWorkflow(page, authorWorkflow(S2, 'workflow_4'), 's2-au-workflow_4');
                await typed('au', S2, 's2-au-authorDashboard');
                await typed('au', S1, 's1-au-authorDashboard');
                await mySubmissionsRow(page, S.s2.title, 's2-au-mysubmissions');
            });
            await sect('author-controls', async () => {
                await signInAs(page, u.au2);
                await typed('au2', S1, 's1-au2-authorDashboard');
                await openWorkflow(page, authorWorkflow(S1, 'workflow_4'), 's1-au2-workflow_4');
                await signInAs(page, u.mgr);
                await typed('mgr', S1, 's1-mgr-authorDashboard');
                await signInAs(page, u.ce);
                await typed('ce', S1, 's1-ce-authorDashboard');
                await signOut(page);
            });
        } finally { await close(); }
    }

    // ---- delete: Rule 4's "Delete" carried through on the spare copyedited file; the count and the notice after ----
    if (on('delete')) {
        const {page, close} = await launch(app);
        try {
            const md = path.basename(MD);
            await sect('delete-ok', async () => {
                await signInAs(page, u.mgr);
                const before = await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-mgr-before-delete');
                const rows = (before.info.tables.find((t) => t.name === 'Copyedited Files') || {}).rows || [];
                record('s1-copyedited-rows-before-delete', {rows});
                const r = await rowMenu(page, 'Copyedited Files', md, 's1-mgr-copyedited-delete', 'Delete');
                const conf = topWin(page);
                const ok = conf.getByRole('button', {name: /^(OK|Delete|Yes)$/}).first();
                await loc(page, 'Delete confirmation: "OK"', ok);
                if (await ok.count()) { await ok.click(); await idle(page); }
                await page.waitForTimeout(800); await idle(page);
                const info = await wfInfo(page);
                await snap(page, 's1-mgr-after-delete', {info});
                log('[after delete]', JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 500));
                // the other copyedited file too, so the list is empty: the notice's return is K2's, the count's return to 0 is this chunk's
                const rows2 = (info.tables.find((t) => t.name === 'Copyedited Files') || {}).rows || [];
                if (rows2.length) {
                    await rowMenu(page, 'Copyedited Files', md, 's1-mgr-copyedited-delete2', 'Delete');
                    const ok2 = topWin(page).getByRole('button', {name: /^(OK|Delete|Yes)$/}).first();
                    if (await ok2.count()) { await ok2.click(); await idle(page); }
                    await page.waitForTimeout(800); await idle(page);
                    await snap(page, 's1-mgr-after-delete2', {info: await wfInfo(page)});
                }
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S1, 'workflow_4'), 's1-se-after-delete');
                await signInAs(page, u.au);
                await openWorkflow(page, authorWorkflow(S1, 'workflow_4'), 's1-au-after-delete');
                await mySubmissionsRow(page, S.s1.title, 's1-au-mysubmissions-after-delete');
                await signOut(page);
            });
        } finally { await close(); }
    }
});
