// U32 claim check, chunk K1: the Copyediting stage screen by role, the
// screenless sections and the OPS absence. Purpose (the OPS paragraph),
// Actors & permissions (the gate and the nine rows), Rule 1 (what the screen
// shows), Rule 2 (how a submission arrives), Rule 7 (discussions and
// participants), Settings ("Stages" both ends, the three email templates, the
// app's stages), register A5 (recommend-only editor) and OPS1.
// Spec: docs/specs/U32-copyediting-stage.md lines 10–60, 69–96, 141–148, 223–344, 394–405, 418–431.
//
// OJS/OMP: one scratch context per app with one account per role of the
// registry (manager, journal editor, section editor assigned + one
// unassigned, guest editor (OJS), copyeditor, marketing, production editor,
// translator, layout editor, proofreader, funding coordinator, author; OMP
// adds volume editor and chapter author); submissions
//   S1  at Copyediting through review, every role assigned                 → the by-role reads, the files and row menus, the "Stages" other end
//   S2  accepted without review, se assigned                               → A5 recommend-only, the Assign form and its template
//   S3  at the Submission stage, se assigned                               → "Accept and Skip Review" (Rule 2), then "Send To Production" (Rule 1's Production read)
//   S4  at External Review with one completed reviewer, se assigned        → "Accept Submission" (Rule 2), the review-stage read of the recommend-only editor
// OPS: a scratch server with one preprint; the workflow, the Roles grid, the Emails list, the Assign form.
//
//   PROBE_FEATURE=U32 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U32/K1/k1.js
//   PHASES=seed,roles,arrival,files,a5,emails,stages,ops   (default all; later phases reuse k1-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
const TXT = path.join(REPO, 'apps/ojs/playwright/fixtures/files/not-an-image.txt');
const ALL = ['seed', 'roles', 'arrival', 'files', 'a5', 'a5b', 'emails', 'tasktpl', 'stages', 'rolesfix', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 800)}); }
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
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.offsetParent !== null).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
// The workflow dialog as data: headings, visible buttons, tables (name → rows), notices, the stage menu, badges,
// plus the Copyediting-specific reads: the "Notification" box, the "Status" box, the header (title + stage bubble).
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
        rowButtons: [...t.querySelectorAll('tbody tr button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).slice(0, 20),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const headings = hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"], [class*="pkpNotification"], .pkpBadge, [class*="badge"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const nav = [...root.querySelectorAll('nav a, nav button, [role=menuitem], [role=menubar] *[role]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const uploadButtons = buttons.filter((b) => /Upload/.test(b));
    const byHeading = (re) => { const h = hs.find((x) => re.test(x.innerText.trim())); return h && h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null; };
    const lines = (dlgs[0] ? dlgs[0].innerText : '').split('\n').map((l) => l.trim()).filter(Boolean);
    const closeAt = lines.indexOf('Close');
    const header = dlgs[0] ? lines.slice(closeAt >= 0 ? closeAt + 1 : 0, (closeAt >= 0 ? closeAt + 1 : 0) + 6).join(' | ') : null;
    const descriptions = hs.map((h) => ({h: h.innerText.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 160) : null})).filter((x) => /Files|Discussions|Participants|Notification|Status/i.test(x.h)).slice(0, 12);
    return {dialogCount: dlgs.length, headings, buttons, tables, notices, nav, uploadButtons, notice: byHeading(/^Notification$/i), status: byHeading(/^Status$/i), header, descriptions, bodyStart: root.innerText.replace(/\s+/g, ' ').slice(0, 500)};
});
// The decision page (a full page, not a dialog): steps, headings, buttons, checkboxes with labels, radio, main text.
const decisionInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    const main = document.querySelector('main') || document.body;
    const labelOf = (i) => {
        const l = i.id && document.querySelector(`label[for="${i.id}"]`);
        return (l ? l.innerText : (i.closest('label') || i.parentElement || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    };
    return {
        url: location.href,
        steps: [...main.querySelectorAll('[role=tab], .pkpSteps__step, [class*="steps__step"]')].filter(vis).map((e) => ({text: e.innerText.trim().replace(/\s+/g, ' '), current: e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') != null || /current/.test(e.className)})).slice(0, 12),
        headings: [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40),
        buttons: [...main.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || '').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})).filter((b) => b.text).slice(0, 60),
        checkboxes: [...main.querySelectorAll('input[type=checkbox]')].map((i) => ({label: labelOf(i), checked: i.checked, visible: vis(i), name: i.name || null})).slice(0, 40),
        subject: (main.querySelector('input[name="subject"], input[id*="subject"]') || {}).value || null,
        text: main.innerText.slice(0, 6000),
    };
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
// Close every stacked side window: the top window's visible "Cancel"/"Close" (short timeout; a covered one is skipped), then Escape as the last resort.
async function closeAll(page) {
    for (let i = 0; i < 4; i++) {
        const open = await page.locator('[role="dialog"]:visible').count();
        if (!open) return;
        const top = topWin(page);
        const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
        if (await c.count()) { await c.click({timeout: 5000}).catch(() => {}); await idle(page); await page.waitForTimeout(500); }
        if ((await page.locator('[role="dialog"]:visible').count()) >= open) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(500); }
    }
}
async function waitWindow(page) {
    await topWin(page).waitFor({timeout: 30000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
    await idle(page);
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const authorWorkflow = (id, key) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const roundKey = (rounds, stageId) => { const list = (rounds || []).filter((x) => !stageId || x.stageId === stageId); const r = list[list.length - 1]; return r ? `workflow_${r.stageId}_${r.id}` : null; };
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };

    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)})), ...(extra || {})});
        const decisionButtons = (info.buttons || []).filter((b) => /Send To Production|Move to Review|Accept|Decline|Send for Review|Send to|Request Revisions|Recommend|Schedule|Publish|Post/i.test(b));
        log(`[${label}]`, app.name, 'header:', flat(info.header, 90), '| notice:', flat(info.notice, 60), '| status:', flat(info.status, 60), '| decision buttons:', JSON.stringify(decisionButtons), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)), '| headings:', JSON.stringify((info.headings || []).slice(0, 8)));
        return {info, dialogs, s, decisionButtons};
    }

    // The three-tab upload wizard (already open).
    async function driveWizard(page, file, label) {
        const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        await wiz.waitFor({timeout: 30000});
        await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        const genre = wiz.locator('select[id^="genreId"]');
        if (await genre.count()) {
            const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
            const pick = opts.find((o) => o.value && o.value !== '' && !/^(Select|Choose)/i.test(o.text));
            if (pick) await genre.selectOption(pick.value);
        }
        await wiz.locator('input[type="file"]').setInputFiles(file);
        await wiz.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000});
        await idle(page);
        const w1 = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-wizard-step1`, {title: w1 && w1.name, text: flat(w1 && w1.text, 600)});
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('tab', {name: /2\./}).waitFor({timeout: 30000}).catch(() => {});
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
    }
    // Upload one file into the nth "Upload/Select Files" list of the open stage (0 = first list, 1 = second)
    // through the legacy select-files window's upload link, then save the window (K4's idiom).
    async function uploadInto(page, nth, file, label) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        const n = await btns.count();
        await loc(page, `${label}: "Upload/Select Files" (${n} on screen, nth ${nth})`, btns.nth(nth));
        await btns.nth(nth).click(); await idle(page);
        await waitWindow(page);
        const win = topWin(page);
        const before = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-select-window`, {title: before && before.name, text: flat(before && before.text, 800), buttons: before && before.buttons});
        let up = win.getByRole('link', {name: /Upload/}).first();
        if (!(await up.count())) up = win.getByRole('button', {name: /Upload/}).first();
        await up.click(); await idle(page);
        await driveWizard(page, file, label);
        const base = path.basename(file);
        await topWin(page).locator(`tr:has-text("${base}") input[type=checkbox]:checked`).first().waitFor({timeout: 15000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const top = topWin(page);
        let ok = top.getByRole('button', {name: /^(Save|OK|Complete|Done)$/}).last();
        if (!(await ok.count())) ok = top.getByRole('link', {name: /^(Save|OK)$/}).last();
        if (await ok.count()) { await ok.click(); await idle(page); }
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).length <= 1, null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables, notice: info.notice, buttons: info.buttons});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 500));
        return info;
    }

    // Press a decision button and walk its wizard, skipping every email page; record every page.
    async function runDecision(page, name, label, {readOnlyFirstPage = false} = {}) {
        const btn = page.getByRole('button', {name, exact: true}).first();
        await loc(page, `${label}: "${name}"`, btn);
        await btn.click(); await idle(page);
        await page.waitForURL(/decision/, {timeout: 30000}).catch(() => {});
        const pages = [];
        const readPage = async (n) => {
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page);
            const d = await decisionInfo(page);
            await snap(page, `${label}-page${n}`, {decision: d});
            pages.push({n, url: d.url, steps: d.steps.map((x) => `${x.text}${x.current ? '*' : ''}`), headings: d.headings, buttons: d.buttons.map((b) => b.text), checkboxes: d.checkboxes.map((c) => `${c.label}${c.checked ? ' [x]' : ' [ ]'}`), subject: d.subject});
            log(`[${label} page ${n}]`, JSON.stringify(pages[pages.length - 1]).slice(0, 700));
            return d;
        };
        let d = await readPage(1);
        if (readOnlyFirstPage) {
            const cancel = page.getByRole('button', {name: 'Cancel', exact: true}).first();
            await cancel.click(); await idle(page); await page.waitForTimeout(600);
            const dl = await dialogTexts(page);
            const conf = page.locator('[role="dialog"]:visible').last();
            const yes = conf.getByRole('button', {name: /^(OK|Yes|Cancel Decision)/}).first();
            if (await conf.count() && await yes.count()) { await yes.click(); await idle(page); }
            await page.waitForTimeout(800); await idle(page);
            record(`${label}-cancelled`, {dialogs: dl.map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 300)})), landed: page.url()});
            return {pages, cancelled: true};
        }
        const cont = page.getByRole('button', {name: 'Continue', exact: true});
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        for (let i = 2; i < 8 && !(await rec.isVisible().catch(() => false)); i++) {
            const skip = page.getByRole('button', {name: /^Skip this email$/i}).first();
            if (await skip.isVisible().catch(() => false)) { await skip.click(); await idle(page); await page.waitForTimeout(400); }
            else { await cont.first().click(); await idle(page); }
            d = await readPage(i);
        }
        await rec.click(); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const doneDialogs = await dialogTexts(page);
        await snap(page, `${label}-recorded`, {dialogs: doneDialogs});
        log(`[${label} recorded]`, JSON.stringify(doneDialogs.map((x) => ({name: x.name, text: flat(x.text, 300)}))));
        const dlg = page.locator('[role="dialog"]:visible').first();
        let leave = dlg.getByRole('link', {name: /View|Back|Return|Submission|Dashboard/}).first();
        if (!(await leave.count())) leave = dlg.getByRole('button', {name: /View|Back|Return|Submission|Dashboard|OK|Close/}).first();
        let landed = null;
        if (await leave.count()) {
            const lt = (await leave.innerText().catch(() => '')).trim();
            await leave.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            landed = {pressed: lt, url: page.url()};
            const info = await wfInfo(page).catch(() => ({}));
            await snap(page, `${label}-recorded-landed`, {landed, info});
            log(`[${label} landed]`, JSON.stringify(landed), '| header:', flat(info.header, 100), '| status:', flat(info.status, 80));
        }
        return {pages, done: doneDialogs.map((x) => ({name: x.name, text: flat(x.text, 400)})), landed};
    }

    // The Participants panel: the row menu of <name> → "Edit" → tick recommendOnly → OK.
    async function setRecommendOnly(page, name, label) {
        const row = page.locator('[role="dialog"]:visible').first().locator('li, tr, div').filter({hasText: new RegExp(name)}).filter({has: page.locator('button')}).last();
        const more = row.getByRole('button', {name: /More Actions|Options|Edit/}).first();
        if (!(await more.count())) { record(`${label}-participants-row`, {absent: true}); return false; }
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-participants-row-menu`, {items});
        const edit = page.getByRole('menuitem', {name: /^Edit/}).first();
        if (!(await edit.count())) return false;
        await edit.click(); await idle(page);
        const form = topWin(page);
        await form.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.querySelector('input[name="recommendOnly"], input[type=submit], button'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const before = (await dialogTexts(page)).slice(-1)[0];
        const box = form.locator('input[name="recommendOnly"]');
        const present = await box.count();
        const labelText = present ? await form.locator(`label[for="${await box.getAttribute('id')}"]`).innerText().catch(() => null) : null;
        record(`${label}-participants-edit-form`, {title: before && before.name, text: flat(before && before.text, 800), recommendOnlyPresent: present, checked: present ? await box.isChecked() : null, label: flat(labelText, 200)});
        await shot(page, `${label}-participants-edit-form`).catch(() => {});
        if (!present) { const c = form.getByRole('link', {name: /Cancel/}).first(); if (await c.count()) await c.click(); await idle(page); return false; }
        await box.check();
        const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
        await loc(page, `${label}: Edit Assignment's save`, ok);
        await ok.click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        record(`${label}-participants-after-save`, {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 400)}))});
        return true;
    }

    // The Participants panel's "Assign" form: the group list, then Cancel (or pick a group, a user and a template when asked).
    async function assignForm(page, label, {group, user, template, keep} = {}) {
        const assign = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /^Assign$/}).first();
        if (!(await assign.count())) { record(`${label}-assign`, {absent: true}); log(`[${label}] no Assign button`); return {absent: true}; }
        await loc(page, `${label}: Participants "Assign"`, assign);
        await assign.click(); await idle(page);
        const form = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        await form.waitFor({timeout: 30000});
        await idle(page);
        const sel = form.locator('select[name="filterUserGroupId"]');
        const groups = await sel.locator('option').evaluateAll((els) => els.map((o) => o.text.trim()).filter(Boolean));
        const top = (await dialogTexts(page)).slice(-1)[0];
        const out = {title: top && top.name, groups, text: flat(top && top.text, 600)};
        if (group) {
            await sel.selectOption({label: group}); await idle(page);
            // the user grid refreshes only when the search form is submitted (K2's idiom): search the wanted name
            const searchBox = form.locator('input[id^="namegrid-users-userselect-userselectgrid-"], input[name="name"]').first();
            if (await searchBox.count()) {
                await searchBox.fill(user || '');
                const submit = form.locator('form[id^="searchUserFilter"] button[id^="submitFormButton-"], form[id^="searchUserFilter"] button').first();
                if (await submit.count()) await submit.click(); else await searchBox.press('Enter');
                await idle(page);
            }
            if (user) await page.waitForFunction((n) => [...document.querySelectorAll('[role=dialog] tr')].some((tr) => tr.innerText.includes(n)), user, {timeout: 20000}).catch(() => {});
            await idle(page);
            const radios = await form.locator('input[name="userId"]').evaluateAll((els) => els.map((r) => ({value: r.value, row: (r.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 80)})));
            out.users = radios;
            const pick = radios.find((r) => user && r.row && r.row.includes(user));
            if (pick) { await form.locator(`input[name="userId"][value="${pick.value}"]`).check({force: true}); await idle(page); }
            const tsel = form.locator('select[name="template"]');
            if (await tsel.count()) {
                out.templates = await tsel.locator('option').evaluateAll((els) => els.map((o) => o.text.trim()));
                if (template) {
                    await tsel.selectOption({label: template}); await idle(page);
                    const id = await form.locator('textarea[name="message"]').getAttribute('id').catch(() => null);
                    await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).getContent().length > 20, id, {timeout: 20000}).catch(() => {});
                    out.message = flat(await page.evaluate((id) => window.tinymce?.get(id)?.getContent({format: 'text'}), id), 800);
                }
            }
        }
        record(`${label}-assign-form`, out);
        await shot(page, `${label}-assign-form`).catch(() => {});
        log(`[${label} assign]`, JSON.stringify(out.groups), out.message ? `| message: ${flat(out.message, 160)}` : '');
        if (keep) {
            const ok = form.getByRole('button', {name: 'OK', exact: true}).last();
            await loc(page, `${label}: Assign form's OK`, ok);
            await ok.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            out.saved = {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}))};
            record(`${label}-assign-saved`, out.saved);
            return out;
        }
        const cancel = form.getByRole('link', {name: /^\s*Cancel\s*$/}).last();
        await cancel.click(); await idle(page);
        return out;
    }

    // Settings › Users & Roles › Roles: the grid, each role's "Edit" form's "Stages" boxes; optionally flip one and save.
    async function rolesGrid(page, label) {
        await page.goto(ctxUrl('/management/settings/access')); await idle(page);
        const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
        if (await rolesTab.count()) await rolesTab.click();
        await idle(page);
        await page.locator('tr.gridRow').first().waitFor({timeout: 30000}).catch(() => {});
        const s = await screen(page);
        s.rows = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
        s.columns = await page.locator('table thead th').evaluateAll((els) => els.map((e) => e.innerText.trim())).catch(() => []);
        record(label, s);
        await shot(page, label).catch(() => {});
        return s.rows;
    }
    async function openRoleEdit(page, roleName) {
        const cellRe = new RegExp(`^\\s*(Settings\\s+)?${roleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
        const row = page.locator('tr.gridRow').filter({has: page.locator('td').filter({hasText: cellRe})}).first();
        if (!(await row.count())) return null;
        await row.locator('a.show_extras').click(); await idle(page);
        await page.getByRole('link', {name: 'Edit', exact: true}).last().click();
        const form = page.locator('form#userGroupForm');
        await form.waitFor({state: 'visible', timeout: 30000});
        await form.locator('input[name="assignedStages[]"]').first().waitFor({state: 'attached', timeout: 15000}).catch(() => {});
        await idle(page);
        return form;
    }
    const readRoleForm = async (page, form) => ({
        title: (await dialogTexts(page)).slice(-1)[0]?.name || null,
        stages: await form.locator('input[name="assignedStages[]"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim()}))).catch(() => []),
        fields: await form.locator('input:not([type=hidden]), select, textarea').evaluateAll((els) => els.map((e) => ({tag: e.tagName, type: e.type, name: e.name, value: e.type === 'checkbox' || e.type === 'radio' ? e.checked : (e.value || '').slice(0, 80), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 80), disabled: e.disabled}))).catch(() => []),
        buttons: await form.locator('button:visible, a.pkp_button:visible, input[type=submit]:visible, a:visible').evaluateAll((els) => els.map((e) => (e.innerText || e.value || '').trim()).filter(Boolean).slice(0, 20)).catch(() => []),
        text: flat(await form.innerText().catch(() => ''), 1500),
    });
    async function roleStages(page, roleName, label, {flip, save: doSave, leaveUnsaved} = {}) {
        const form = await openRoleEdit(page, roleName);
        if (!form) { record(label, {role: roleName, row: 'absent'}); return null; }
        const before = await readRoleForm(page, form);
        const out = {role: roleName, before};
        if (flip) {
            out.flipped = [];
            for (const v of [].concat(flip)) {
                const box = form.locator(`input[name="assignedStages[]"][value="${v}"]`);
                if (await box.count()) { if (await box.isChecked()) await box.uncheck(); else await box.check(); out.flipped.push({value: v, nowChecked: await box.isChecked()}); }
            }
            if (leaveUnsaved) {
                // the sweep: leave the form with the change unsaved through the workflow-side "Cancel" of the page (goto)
                const dialogs = [];
                const onDialog = (d) => { dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); };
                page.on('dialog', onDialog);
                let navError = null;
                try { await page.goto(ctxUrl('/management/settings/access'), {timeout: 20000}); } catch (e) { navError = String(e.message).slice(0, 200); }
                await page.waitForTimeout(800); await idle(page).catch(() => {});
                page.off('dialog', onDialog);
                out.leftUnsaved = {browserDialogs: dialogs, navError, url: page.url(), pageDialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 200)}))};
                record(label, out);
                return out;
            }
            if (doSave) {
                const saveBtn = form.getByRole('button', {name: /^(Save|OK)$/}).last();
                await loc(page, `${label}: the Roles "Edit" form's save`, saveBtn);
                await saveBtn.click(); await idle(page);
                await form.waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await page.waitForTimeout(600); await idle(page);
                out.afterSave = {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)})), statuses: await page.locator('[role="status"]:visible').allInnerTexts().catch(() => [])};
                // reopen and read back
                await page.goto(ctxUrl('/management/settings/access')); await idle(page);
                const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
                if (await rolesTab.count()) await rolesTab.click(); await idle(page);
                const f2 = await openRoleEdit(page, roleName);
                out.after = f2 ? await readRoleForm(page, f2) : null;
            }
        }
        const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
        await cancel.click().catch(() => {});
        await idle(page);
        record(label, out);
        log(`[${label}]`, roleName, 'stages:', JSON.stringify((out.after || out.before).stages.map((x) => `${x.label || x.value}${x.checked ? ' [x]' : ' [ ]'}`)));
        await page.goto(ctxUrl('/management/settings/access')); await idle(page);
        const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
        if (await rolesTab.count()) await rolesTab.click(); await idle(page);
        return out;
    }

    // Settings › Workflow › Emails › the Manage Emails page: find a template, read/edit it.
    async function manageEmails(page, names, label, {editSubjectPrefix} = {}) {
        await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
        const tab = page.getByRole('tab', {name: 'Emails', exact: true}).or(page.locator('#emails-button')).first();
        if (await tab.count()) { await tab.click(); await idle(page); }
        await snap(page, `${label}-workflow-emails-tab`);
        await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
        const main = page.locator('main');
        await main.locator('.listPanel__item').first().waitFor({timeout: 30000}).catch(() => {});
        const out = {url: page.url(), heading: flat(await page.locator('h1').first().innerText().catch(() => ''), 100), templates: {}};
        for (const name of names) {
            const search = main.getByRole('searchbox').or(main.locator('input[type="search"]')).first();
            await search.fill(name); await search.press('Enter'); await idle(page);
            await page.waitForFunction((n) => [...document.querySelectorAll('.listPanel__item')].some((i) => i.innerText.includes(n)) || document.body.innerText.includes('No items'), name, {timeout: 10000}).catch(() => {});
            await idle(page);
            const item = main.locator('.listPanel__item').filter({hasText: name}).first();
            const present = (await item.count()) > 0;
            const t = {present, listText: present ? flat(await item.innerText(), 500) : flat(await main.innerText(), 300)};
            if (present) {
                const btns = await item.locator('button:visible, a:visible').evaluateAll((els) => els.map((e) => e.innerText.trim()).filter(Boolean));
                t.itemButtons = btns;
                const editBtn = item.getByRole('button', {name: /^Edit/}).first();
                if (await editBtn.count()) {
                    await editBtn.click(); await idle(page);
                    const dlg = topWin(page);
                    await dlg.waitFor({timeout: 30000}).catch(() => {});
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.querySelector('input:not([type=hidden])'); }, null, {timeout: 20000}).catch(() => {});
                    await idle(page);
                    const outer = (await dialogTexts(page)).slice(-1)[0];
                    t.mailableWindow = {title: outer && outer.name, text: flat(outer && outer.text, 700), buttons: outer && outer.buttons};
                    const inner = dlg.getByRole('button', {name: /^Edit$/}).first();
                    if (await inner.count()) {
                        await inner.click(); await idle(page);
                        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[name="subject"], input[id*="subject" i]'); }, null, {timeout: 20000}).catch(() => {});
                        await idle(page);
                    }
                    t.window = {title: (await dialogTexts(page)).slice(-1)[0]?.name, fields: await topWin(page).locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, value: (e.value || '').slice(0, 300), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 80)})))};
                    t.window.body = await page.evaluate(() => { const ed = window.tinymce && window.tinymce.activeEditor; return ed ? ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 600) : null; }).catch(() => null);
                    t.window.buttons = await topWin(page).locator('button:visible').evaluateAll((els) => els.map((e) => e.innerText.trim()).filter(Boolean));
                    if (editSubjectPrefix) {
                        const subj = topWin(page).locator('input[name="subject"], input[id*="subject" i]').first();
                        if (await subj.count()) {
                            const old = await subj.inputValue();
                            await subj.fill(`${editSubjectPrefix} ${old}`);
                            // the body too (the Assign form prefills the body, not the subject)
                            await page.evaluate((p) => { const ed = window.tinymce && window.tinymce.activeEditor; if (ed) { ed.setContent(`<p>${p} body</p>` + ed.getContent()); ed.fire('change'); ed.fire('input'); ed.save(); } }, editSubjectPrefix).catch(() => {});
                            const saveBtn = topWin(page).getByRole('button', {name: /^Save$/}).first();
                            await saveBtn.click(); await idle(page);
                            await page.waitForTimeout(1000); await idle(page);
                            t.edited = {newSubject: `${editSubjectPrefix} ${old}`, dialogsAfter: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}))};
                            // read back: close every window, reopen the mailable and its template
                            await closeAll(page);
                            await editBtn.click().catch(() => {}); await idle(page);
                            const inner2 = topWin(page).getByRole('button', {name: /^Edit$/}).first();
                            if (await inner2.count()) { await inner2.click(); await idle(page); }
                            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.querySelector('input:not([type=hidden])'); }, null, {timeout: 20000}).catch(() => {});
                            await idle(page);
                            t.edited.readBack = {subject: await topWin(page).locator('input[name="subject"], input[id*="subject" i]').first().inputValue().catch(() => null), body: await page.evaluate(() => window.tinymce?.activeEditor?.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 300)).catch(() => null)};
                        } else t.edited = {noSubjectField: true};
                    }
                    await closeAll(page);
                    await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length === 0, null, {timeout: 10000}).catch(() => {});
                }
            }
            out.templates[name] = t;
            log(`[${label} emails] "${name}"`, present ? 'present' : 'ABSENT', t.window ? `| subject: ${JSON.stringify((t.window.fields || []).find((f) => /subject/i.test(f.name || f.label))?.value)}` : '');
        }
        record(`${label}-manage-emails`, out);
        await shot(page, `${label}-manage-emails`).catch(() => {});
        return out;
    }

    // Settings › Workflow › "Tasks and Discussions": the template named `name`, its edit window, an optional body edit.
    async function taskTemplates(page, name, label, {editPrefix} = {}) {
        await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
        const tab = page.getByRole('tab', {name: /Tasks and Discussions|Tasks & Discussions/}).first();
        const out = {tabPresent: (await tab.count()) > 0, tabs: await page.getByRole('tab').allInnerTexts().catch(() => [])};
        if (!out.tabPresent) { record(`${label}-task-templates`, out); return out; }
        await tab.click(); await idle(page);
        await page.waitForFunction((n) => document.body.innerText.includes(n) || document.body.innerText.includes('No items'), name, {timeout: 15000}).catch(() => {});
        await idle(page);
        const s = await snap(page, `${label}-task-templates-tab`);
        out.mainText = flat(s.text && s.text.main, 2500);
        const main = page.locator('main');
        const openRow = async () => {
            const item = main.locator('tr').filter({hasText: name}).first();
            if (!(await item.count())) return null;
            const more = item.getByRole('button', {name: /More Actions/}).first();
            if (!(await more.count())) return {item, items: []};
            await more.click(); await idle(page);
            const items = await menuItems(page);
            const edit = page.getByRole('menuitem', {name: /^Edit/}).first();
            if (await edit.count()) { await edit.click(); await idle(page); }
            return {item, items};
        };
        const opened = await openRow();
        out.present = !!opened;
        if (opened) {
            out.itemText = flat(await opened.item.innerText(), 400);
            out.rowMenu = opened.items.map((x) => x.text);
            out.tableHead = await main.locator('table thead th').allInnerTexts().catch(() => []);
            if (opened.items.some((x) => /^Edit/.test(x.text))) {
                await topWin(page).waitFor({timeout: 20000}).catch(() => {});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input:not([type=hidden]), textarea, .tox'); }, null, {timeout: 20000}).catch(() => {});
                await idle(page); await page.waitForTimeout(600);
                const w = (await dialogTexts(page)).slice(-1)[0];
                out.window = {title: w && w.name, text: flat(w && w.text, 1500), buttons: w && w.buttons,
                    fields: await topWin(page).locator('input:visible, textarea:visible, select:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, type: e.type, value: (e.value || '').slice(0, 200), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 80)}))),
                    body: await page.evaluate(() => { const ed = window.tinymce && window.tinymce.activeEditor; return ed ? ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 600) : null; }).catch(() => null)};
                await shot(page, `${label}-task-template-window`).catch(() => {});
                if (editPrefix) {
                    let changed = await page.evaluate((p) => { const ed = window.tinymce && window.tinymce.activeEditor; if (!ed) return false; ed.setContent(`<p>${p}</p>` + ed.getContent()); ed.fire('change'); ed.fire('input'); ed.save(); return true; }, editPrefix).catch(() => false);
                    if (!changed) { const ta = topWin(page).locator('textarea:visible').first(); if (await ta.count()) { await ta.fill(`${editPrefix} ${await ta.inputValue()}`); changed = 'textarea'; } }
                    const saveBtn = topWin(page).getByRole('button', {name: /^Save$/}).first();
                    out.edited = {changed, saveButton: (await saveBtn.count()) > 0};
                    if (changed && (await saveBtn.count())) {
                        await saveBtn.click(); await idle(page); await page.waitForTimeout(1000); await idle(page);
                        out.edited.dialogsAfter = (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}));
                        await closeAll(page);
                        await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
                        await page.getByRole('tab', {name: /Tasks and Discussions|Tasks & Discussions/}).first().click(); await idle(page);
                        await page.waitForFunction((n) => document.body.innerText.includes(n), name, {timeout: 15000}).catch(() => {});
                        await openRow();
                        await page.waitForFunction(() => window.tinymce && window.tinymce.activeEditor && window.tinymce.activeEditor.getContent().length > 10, null, {timeout: 15000}).catch(() => {});
                        out.edited.readBack = {body: await page.evaluate(() => window.tinymce?.activeEditor?.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 300)).catch(() => null), fields: await topWin(page).locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, value: (e.value || '').slice(0, 200)})))};
                    }
                }
                await closeAll(page);
            }
        }
        record(`${label}-task-templates`, out);
        log(`[${label} task templates] "${name}"`, out.present ? 'present' : 'ABSENT', out.window ? `| window "${out.window.title}" fields ${JSON.stringify((out.window.fields || []).map((f) => f.name))}` : '', out.edited ? `| edited ${JSON.stringify(out.edited).slice(0, 200)}` : '');
        return out;
    }

    // ---- OPS: the control reads -------------------------------------------------
    if (isOPS) {
        if (!on('ops')) return;
        if (!sc.contextPath) {
            const t = tag('u32k1');
            const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'}, {username: `${t}mod`, roles: ['sectionEditor'], givenName: 'Milo', familyName: 'Moderator'}, {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}];
            const ctx = await app.api.createContext({tag: t, context: {name: `U32 K1 ${t}`, acronym: 'U32K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.users = {mgr: `${t}mgr`, mod: `${t}mod`, au: `${t}au`};
            const s = await app.api.createSubmission({tag: `${t}p`, context: sc.contextPath, submitter: sc.users.au, title: `K1 OPS preprint ${t}`, participants: [{username: sc.users.mod, role: 'sectionEditor'}]});
            sc.p = s.submissionId; sc.pStage = s.stageId; save();
            // a copyeditor key as a participant is refused: record the 400's text
            try { await app.api.createSubmission({tag: `${t}q`, context: sc.contextPath, submitter: sc.users.au, title: `K1 OPS copyeditor key ${t}`, participants: [{username: sc.users.mod, role: 'copyeditor'}]}); record('ops-copyeditor-key', {accepted: true}); }
            catch (e) { record('ops-copyeditor-key', {accepted: false, error: String(e.message).slice(0, 600)}); }
        }
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            const a = await openWorkflow(page, workflow(sc.p), 'ops-mgr-landing');
            const b = await openWorkflow(page, workflow(sc.p, 'workflow_4'), 'ops-mgr-workflow_4-typed', {finalUrl: page.url()});
            const c = await openWorkflow(page, workflow(sc.p, 'workflow_5'), 'ops-mgr-workflow_5');
            await assignForm(page, 'ops-mgr');
            record('ops-summary', {landing: {nav: a.info.nav, buttons: a.info.buttons, headings: a.info.headings}, typed4: {url: page.url(), nav: b.info.nav, buttons: b.info.buttons}, prod: {buttons: c.info.buttons, headings: c.info.headings, tables: c.info.tables.map((t) => t.name)}});
            await signInAs(page, sc.users.mod);
            await openWorkflow(page, workflow(sc.p, 'workflow_4'), 'ops-mod-workflow_4-typed', {finalUrl: page.url()});
            await signInAs(page, sc.users.au);
            await openWorkflow(page, authorWorkflow(sc.p, 'workflow_4'), 'ops-au-workflow_4-typed', {finalUrl: page.url()});
            await signInAs(page, sc.users.mgr);
            const rows = await rolesGrid(page, 'ops-roles-grid');
            const stages = [];
            for (const r of rows) {
                const name = r.replace(/^Settings\s+/i, '').split(/\s{2,}|\t/)[0].trim().split(' ').slice(0, 4).join(' ');
                const roleName = (r.match(/^(?:Settings\s+)?(.+?)\s+(Manager|Preprint Server manager|Moderator|Assistant|Author|Reviewer|Reader|Site Admin)\b/i) || [])[1] || name;
                const o = await roleStages(page, roleName, `ops-role-${roleName.replace(/[^a-z]+/gi, '-').toLowerCase()}`);
                if (o) stages.push({role: roleName, stages: o.before.stages.map((x) => `${x.label || x.value}${x.checked ? ' [x]' : ' [ ]'}`)});
            }
            record('ops-roles-stages', {rows, stages});
            await manageEmails(page, ['Sent to Production', 'Submission Sent Back from Copyediting', 'Request Copyedit', 'Copyedit'], 'ops-mgr');
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u32k1');
        const roleUsers = [
            ['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Edda', 'Editor'],
            ['se', 'sectionEditor', 'Sid', 'Section'], ['se2', 'sectionEditor', 'Sol', 'Unassigned'],
            ...(isOMP ? [] : [['ge', 'guestEditor', 'Gus', 'Guest']]),
            ['ce', 'copyeditor', 'Cora', 'Copyeditor'], ['mk', 'marketing', 'Mark', 'Marketing'], ['pe', 'productionEditor', 'Pat', 'Production'],
            ['tr', 'translator', 'Tia', 'Translator'], ['le', 'layoutEditor', 'Leo', 'Layout'], ['pr', 'proofreader', 'Pia', 'Proof'], ['fu', 'funding', 'Fay', 'Funding'],
            ['au', 'author', 'Ava', 'Author'], ['rev', 'externalReviewer', 'Rowan', 'Reviewer'],
            ...(isOMP ? [['ve', 'volumeEditor', 'Vic', 'Volume'], ['ca', 'chapterAuthor', 'Cal', 'Chapter']] : []),
        ];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U32 K1 ${t}`, acronym: 'U32K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.roleKeys = Object.fromEntries(roleUsers.map(([k, role]) => [k, role]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        const u = sc.users;
        const part = (k) => ({username: u[k], role: sc.roleKeys[k]});
        const assigned = ['se', 'ce', 'mk', 'pe', 'tr', 'le', 'pr', 'fu', ...(isOMP ? ['ve', 'ca'] : ['ge'])];
        const viaReview = isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        const seeds = {
            s1: {title: `K1 S1 every role ${t}`, decisions: viaReview, participants: assigned.map(part)},
            s2: {title: `K1 S2 recommend-only ${t}`, decisions: ['skipExternalReview'], participants: [part('se')]},
            s3: {title: `K1 S3 skip review ${t}`, participants: [part('se')]},
            s4: {title: `K1 S4 via review ${t}`, decisions: isOMP ? ['skipInternalReview', 'sendExternalReview'] : ['sendExternalReview'], participants: [part('se')]},
        };
        sc.reviewer = u.rev;
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            const body = {tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec};
            if (k === 's4') body.reviewRounds = [{reviewers: [{username: sc.reviewer, status: 'completed'}]}];
            try {
                const r = await app.api.createSubmission(body);
                sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, rounds: r.reviewRounds || []};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'rounds', JSON.stringify(r.reviewRounds || []));
            } catch (e) {
                log(`[seed ${k} FAILED]`, String(e.message).slice(0, 700));
                sc.subs[k] = {error: String(e.message).slice(0, 700)};
                if (k === 's1') {
                    // retry with the editorial roles only, so the chunk still has its main submission
                    const fallback = ['se', 'ce', 'mk', 'pe', 'le', 'pr', 'fu', ...(isOMP ? [] : ['ge'])];
                    try {
                        const r = await app.api.createSubmission({...body, participants: fallback.map(part)});
                        sc.subs.s1 = {id: r.submissionId, title: spec.title, stageId: r.stageId, rounds: r.reviewRounds || [], participants: fallback, firstError: String(e.message).slice(0, 400)};
                    } catch (e2) { sc.subs.s1.error2 = String(e2.message).slice(0, 700); }
                }
            }
        }
        save();
        record('seed', sc);
    }
    const u = sc.users; const S = sc.subs || {};
    if (!u) { log('[k1] no state; run the seed phase first'); return; }
    const workflowFor = (k, id, key) => (['au'].includes(k) ? authorWorkflow(id, key) : workflow(id, key));

    // Every screen of a submission's Copyediting entry as one user: the landing and workflow_4; the author view when the
    // editorial address refuses. Returns the reads.
    async function readAs(page, k, id, label, {keys = ['workflow_4']} = {}) {
        await signInAs(page, u[k]);
        const out = {};
        for (const key of keys) {
            out[key] = await openWorkflow(page, workflowFor(k, id, key), `${label}-${key}`);
            const txt = (out[key].dialogs || []).map((d) => d.text).join(' ') + ' ' + (out[key].s.text?.main || '');
            if (k !== 'au' && /Error|sufficient privileges|do not have access|does not have access|not currently have access|denied/i.test(txt)) {
                out[`${key}-author-address`] = await openWorkflow(page, authorWorkflow(id, key), `${label}-${key}-author-address`);
            }
        }
        return out;
    }

    // ---- roles: the Copyediting screen of S1 at every level, before any file ----
    if (on('roles') && S.s1 && S.s1.id) {
        const {page, close} = await launch(app);
        try {
            const order = ['admin', 'mgr', 'ed', 'se', 'se2', ...(isOMP ? [] : ['ge']), 'ce', 'mk', 'pe', 'tr', 'le', 'pr', 'fu', ...(isOMP ? ['ve', 'ca'] : []), 'au'];
            const summary = {};
            for (const k of order) {
                await sect(`roles ${k}`, async () => {
                    const who = k === 'admin' ? 'admin' : u[k];
                    if (k === 'admin') { await signInAs(page, 'admin'); } else { await signInAs(page, who); }
                    const r = await openWorkflow(page, workflowFor(k, S.s1.id, 'workflow_4'), `s1-${k}-workflow_4`);
                    let alt = null;
                    const txt = (r.dialogs || []).map((d) => d.text).join(' ') + ' ' + (r.s.text?.main || '');
                    if (k !== 'au' && /Error|sufficient privileges|do not have access|does not have access|not currently have access|denied/i.test(txt)) {
                        alt = await openWorkflow(page, authorWorkflow(S.s1.id, 'workflow_4'), `s1-${k}-workflow_4-author-address`);
                    }
                    const info = (alt && !/Error/i.test((alt.dialogs || []).map((d) => d.text).join(' ')) ? alt : r).info;
                    summary[k] = {role: k === 'admin' ? 'site admin' : sc.roleKeys[k], url: page.url(), header: flat(info.header, 120), notice: info.notice, status: info.status, headings: info.headings, decisionButtons: r.decisionButtons, buttons: info.buttons, tables: (info.tables || []).map((t) => ({name: t.name, rows: t.rows.length, rowButtons: t.rowButtons})), nav: info.nav, dialogText: flat((alt || r).dialogs.map((d) => d.text).join(' || '), 400)};
                    // the sweep: the Preview button and the "Assign" / "Add" controls at this level
                    if (['admin', 'mgr', 'se', 'ce', 'au', 'tr', 'mk'].includes(k)) {
                        const dlg = page.locator('[role="dialog"]:visible').first();
                        const add = dlg.getByRole('button', {name: /^Add$/}).first();
                        if (await add.count()) {
                            await add.click(); await idle(page);
                            await waitWindow(page).catch(() => {});
                            const top = (await dialogTexts(page)).slice(-1)[0];
                            summary[k].discussionAdd = {title: top && top.name, text: flat(top && top.text, 500), buttons: top && top.buttons};
                            record(`s1-${k}-discussion-add`, summary[k].discussionAdd);
                            const cancel = topWin(page).getByRole('button', {name: /^Cancel$/}).first();
                            if (await cancel.count()) { await cancel.click(); await idle(page); } else { const cl = topWin(page).getByRole('link', {name: /^Cancel$/}).first(); if (await cl.count()) { await cl.click(); await idle(page); } }
                            await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).length <= 1, null, {timeout: 10000}).catch(() => {});
                        } else summary[k].discussionAdd = {absent: true};
                        if (k === 'mgr' || k === 'au' || k === 'ce') {
                            await openWorkflow(page, workflowFor(k, S.s1.id, 'workflow_4'), `s1-${k}-workflow_4-reland`);
                            const prev = dlg.locator('button, a').filter({hasText: /^\s*Preview\s*$/}).first();
                            if (await prev.count()) {
                                const popupP = page.waitForEvent('popup', {timeout: 8000}).catch(() => null);
                                await prev.click(); await idle(page);
                                const popup = await popupP;
                                const after = {url: page.url(), popup: popup ? {url: popup.url(), title: await popup.title().catch(() => null)} : null, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 200)}))};
                                if (popup) { await popup.waitForLoadState('domcontentloaded').catch(() => {}); after.popup.url = popup.url(); after.popup.title = await popup.title().catch(() => null); await popup.close().catch(() => {}); }
                                summary[k].preview = after;
                                record(`s1-${k}-preview`, after);
                            } else summary[k].preview = {absent: true};
                        }
                        if (k !== 'au' && k !== 'tr') {
                            await openWorkflow(page, workflowFor(k, S.s1.id, 'workflow_4'), `s1-${k}-workflow_4-reland2`);
                            const af = await assignForm(page, `s1-${k}`).catch((e) => ({error: String(e.message).slice(0, 200)}));
                            summary[k].assignGroups = af.groups || af;
                        }
                    }
                    log(`[roles ${k}]`, JSON.stringify({decision: summary[k].decisionButtons, notice: summary[k].notice, tables: summary[k].tables.map((t) => t.name), assign: summary[k].assignGroups && summary[k].assignGroups.length}));
                });
            }
            record('s1-roles-summary', summary);
            // Rule 1's other stages on S1 as mgr: Submission (workflow_1) and the review round, for the "Schedule For Publication" shortcut
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 's1-mgr-workflow_1');
            const rk = roundKey(S.s1.rounds, 3);
            if (rk) await openWorkflow(page, workflow(S.s1.id, rk), 's1-mgr-review-round');
            await openWorkflow(page, workflow(S.s1.id, 'workflow_5'), 's1-mgr-workflow_5');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- arrival: S3 "Accept and Skip Review" (a submission-stage file ticked); S4 "Accept Submission" (a review file ticked) ----
    if (on('arrival')) {
        const {page, close} = await launch(app);
        try {
            if (S.s3 && S.s3.id) await sect('arrival s3', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s3.id, 'workflow_1'), 's3-mgr-submission-before');
                // a submission-stage file through the files panel's upload control
                const dlg = page.locator('[role="dialog"]:visible').first();
                const up = dlg.getByRole('button', {name: /^Upload|Upload\/Select|Add File/i}).first();
                const upName = flat(await up.innerText().catch(() => ''), 60);
                await up.click(); await idle(page);
                await waitWindow(page);
                const top = (await dialogTexts(page)).slice(-1)[0];
                record('s3-mgr-submission-upload-opened', {pressed: upName, title: top && top.name});
                if (await page.locator('div[id^="fileUploadWizard"]:visible').count()) await driveWizard(page, TXT, 's3-subfile');
                else { const w = topWin(page); let l = w.getByRole('link', {name: /Upload/}).first(); await l.click(); await idle(page); await driveWizard(page, TXT, 's3-subfile'); const ok = topWin(page).getByRole('button', {name: /^(OK|Save)$/}).last(); if (await ok.count()) { await ok.click(); await idle(page); } }
                await openWorkflow(page, workflow(S.s3.id, 'workflow_1'), 's3-mgr-submission-with-file');
                // as the assigned Section editor before the decision: the Copyediting entry reads "not yet initiated"
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.s3.id, 'workflow_4'), 's3-se-copyediting-before');
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s3.id, 'workflow_1'), 's3-mgr-submission-decide');
                const r = await runDecision(page, 'Accept and Skip Review', 's3-skip-review');
                record('s3-skip-review-summary', r);
                await openWorkflow(page, workflow(S.s3.id), 's3-mgr-after-landing');
                await openWorkflow(page, workflow(S.s3.id, 'workflow_4'), 's3-mgr-after-workflow_4');
                await openWorkflow(page, workflow(S.s3.id, 'workflow_1'), 's3-mgr-after-workflow_1');
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.s3.id, 'workflow_4'), 's3-se-after-workflow_4');
                await openWorkflow(page, workflow(S.s3.id), 's3-se-after-landing');
            });
            if (S.s4 && S.s4.id) await sect('arrival s4', async () => {
                await signInAs(page, u.mgr);
                const rk = roundKey(S.s4.rounds, 3);
                await openWorkflow(page, workflow(S.s4.id, rk), 's4-mgr-round-before');
                // recommend-only for the Section editor on S4, so its review-stage offer can be read (A5's cross-reference)
                await sect('s4 recommend-only', async () => { await setRecommendOnly(page, sc.names.se, 's4'); });
                await openWorkflow(page, workflow(S.s4.id, rk), 's4-mgr-round-before-file');
                await sect('s4 review file', async () => { await uploadInto(page, 0, PDF, 's4-review-file'); });
                await sect('s4 revision', async () => {
                    await openWorkflow(page, workflow(S.s4.id, rk), 's4-mgr-round-before-revision');
                    const up = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Upload', exact: true}).first();
                    await loc(page, 's4: "Revisions Uploaded" › "Upload"', up);
                    await up.click(); await idle(page);
                    await driveWizard(page, MD, 's4-revision');
                    const info = await wfInfo(page);
                    record('s4-revision-after', {tables: info.tables});
                });
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.s4.id, rk), 's4-se-recommendonly-round');
                await openWorkflow(page, workflow(S.s4.id, 'workflow_4'), 's4-se-recommendonly-copyediting-before');
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s4.id, rk), 's4-mgr-round-decide');
                const r = await runDecision(page, 'Accept Submission', 's4-accept');
                record('s4-accept-summary', r);
                await openWorkflow(page, workflow(S.s4.id), 's4-mgr-after-landing');
                await openWorkflow(page, workflow(S.s4.id, 'workflow_4'), 's4-mgr-after-workflow_4');
                await openWorkflow(page, workflow(S.s4.id, rk), 's4-mgr-after-round');
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.s4.id, 'workflow_4'), 's4-se-after-workflow_4');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- files: S1 gets notes.md + article.pdf in "Draft Files" and notes.md in "Copyedited Files"; row menus per level; the author's view ----
    if (on('files') && S.s1 && S.s1.id) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr-before-files');
            await sect('s1 draft md', async () => { await uploadInto(page, 0, MD, 's1-draft-md'); });
            await sect('s1 draft pdf', async () => { await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr-mid-files'); await uploadInto(page, 0, PDF, 's1-draft-pdf'); });
            await sect('s1 copyedited md', async () => { await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr-mid-files-2'); await uploadInto(page, 1, MD, 's1-copyedited-md'); });
            await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr-with-files');
            // row menus at every level, both lists, every row
            const menus = {};
            for (const k of ['admin', 'mgr', 'se', 'ce', 'mk']) {
                await sect(`row menus ${k}`, async () => {
                    await signInAs(page, k === 'admin' ? 'admin' : u[k]);
                    menus[k] = [];
                    await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), `s1-${k}-with-files`);
                    const info = await wfInfo(page);
                    const lists = info.tables.filter((t) => /Draft Files|Copyedited Files/.test(t.name || ''));
                    for (const t of lists) {
                        for (let i = 0; i < t.rows.length; i++) {
                            await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), `s1-${k}-menu-reland`).catch(() => {});
                            const table = page.getByRole('table', {name: t.name});
                            const row = table.locator('tbody tr').nth(i);
                            const more = row.getByRole('button', {name: /More Actions/}).first();
                            const rowText = flat(await row.innerText().catch(() => ''), 100);
                            if (!(await more.count())) { menus[k].push({list: t.name, row: rowText, menu: 'no More Actions button'}); continue; }
                            await more.click(); await idle(page);
                            const items = await menuItems(page);
                            menus[k].push({list: t.name, row: rowText, menu: items.map((x) => x.text)});
                            if (k === 'mgr' && items.some((x) => /Send to Text Editor/.test(x.text)) && !menus.sendToTextEditorSeen) {
                                await page.getByRole('menuitem', {name: /Send to Text Editor/}).first().click(); await idle(page);
                                await waitWindow(page).catch(() => {});
                                const top = (await dialogTexts(page)).slice(-1)[0];
                                menus.sendToTextEditorSeen = {title: top && top.name, text: flat(top && top.text, 800), buttons: top && top.buttons};
                                record('s1-mgr-send-to-text-editor', menus.sendToTextEditorSeen);
                                await shot(page, 's1-mgr-send-to-text-editor').catch(() => {});
                                const c = topWin(page).getByRole('button', {name: /^(Cancel|Close)$/}).first();
                                if (await c.count()) { await c.click(); await idle(page); }
                            } else { await page.keyboard.press('Escape').catch(() => {}); }
                        }
                    }
                    log(`[menus ${k}]`, JSON.stringify(menus[k]).slice(0, 700));
                });
            }
            record('s1-row-menus', menus);
            // the author's view with files; the Copyedited Files row has no menu; the file name downloads
            await sect('files author', async () => {
                await signInAs(page, u.au);
                const r = await openWorkflow(page, authorWorkflow(S.s1.id, 'workflow_4'), 's1-au-with-files');
                const table = page.getByRole('table', {name: 'Copyedited Files'});
                const rowButtons = await table.locator('tbody tr button').evaluateAll((els) => els.map((b) => (b.getAttribute('aria-label') || b.innerText).trim()));
                record('s1-au-copyedited-row-buttons', {rowButtons, tables: r.info.tables});
            });
            // the assigned Section editor after the copyedited file: the notice
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-se-with-files');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- a5: S2 recommend-only Section editor on Copyediting; the Assign form and its "Request Copyedit" template ----
    if (on('a5') && S.s2 && S.s2.id) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-se-before');
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-mgr-before');
            await sect('s2 recommend-only', async () => { await setRecommendOnly(page, sc.names.se, 's2'); });
            await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-mgr-after-recommendonly');
            await signInAs(page, u.se);
            const r = await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-se-recommendonly-workflow_4');
            record('s2-se-recommendonly-controls', {buttons: r.info.buttons, recommend: r.info.buttons.filter((b) => /Recommend/i.test(b)), decision: r.decisionButtons});
            await assignForm(page, 's2-se-recommendonly');
            await openWorkflow(page, workflow(S.s2.id, 'workflow_1'), 's2-se-recommendonly-workflow_1');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- emails: the three templates on Settings › Workflow › Emails; an edited one prefills the Assign form and the Notify Authors page ----
    if (on('emails')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const names = ['Sent to Production', 'Submission Sent Back from Copyediting', 'Request Copyedit'];
            await sect('emails read', async () => { await manageEmails(page, [...names, 'Copyedit'], 'mgr-defaults'); });
            await sect('task template read', async () => { await taskTemplates(page, 'Request Copyedit', 'mgr-defaults'); });
            await sect('task template edit', async () => { await taskTemplates(page, 'Request Copyedit', 'mgr-edit-rc', {editPrefix: 'K1EDIT-RC body'}); });
            await sect('emails edit sent to production', async () => { await manageEmails(page, ['Sent to Production'], 'mgr-edit-stp', {editSubjectPrefix: 'K1EDIT-STP'}); });
            if (S.s2 && S.s2.id) await sect('stp first page s2', async () => {
                await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-mgr-before-stp-read');
                const r = await runDecision(page, 'Send To Production', 's2-stp-read', {readOnlyFirstPage: true});
                record('s2-stp-read-summary', r);
                await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-mgr-after-stp-cancel');
            });
            // the Assign form on S2 with the Copyeditor group, a user and the "Request Copyedit" template: the message prefill
            if (S.s2 && S.s2.id) await sect('assign template prefill', async () => {
                await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-mgr-assign-prefill-before');
                await assignForm(page, 's2-mgr-prefill', {group: 'Copyeditor', user: sc.names.ce, template: 'Request Copyedit'});
            });
            // "Send To Production" on S3 (now at Copyediting): the Notify Authors page's subject, then the decision recorded
            if (S.s3 && S.s3.id && !sc.s3InProduction) await sect('send to production s3', async () => {
                await openWorkflow(page, workflow(S.s3.id, 'workflow_4'), 's3-mgr-copyediting-before-stp');
                sc.s3InProduction = true; save();
                const r = await runDecision(page, 'Send To Production', 's3-stp');
                record('s3-stp-summary', r);
                await openWorkflow(page, workflow(S.s3.id, 'workflow_5'), 's3-mgr-after-workflow_5');
                await openWorkflow(page, workflow(S.s3.id, 'workflow_4'), 's3-mgr-after-workflow_4');
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.s3.id, 'workflow_4'), 's3-se-after-workflow_4');
                await openWorkflow(page, workflow(S.s3.id, 'workflow_5'), 's3-se-after-workflow_5');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- a5b: the recommend-only editor beside an assigned deciding editor (U26 Rule 13's condition): S5 at review, S2 at Copyediting ----
    if (on('a5b')) {
        if (!S.s5 || !S.s5.id) {
            const t = sc.tag;
            const spec = {title: `K1 S5 recommend beside deciding ${t}`, decisions: isOMP ? ['skipInternalReview', 'sendExternalReview'] : ['sendExternalReview'], participants: [{username: u.se, role: 'sectionEditor'}, {username: u.se2, role: 'sectionEditor'}], reviewRounds: [{reviewers: [{username: u.rev, status: 'completed'}]}]};
            try { const r = await app.api.createSubmission({tag: `${t}s5`, context: sc.contextPath, submitter: u.au, ...spec}); S.s5 = sc.subs.s5 = {id: r.submissionId, title: spec.title, stageId: r.stageId, rounds: r.reviewRounds || []}; save(); log('[seed s5]', r.submissionId, JSON.stringify(r.reviewRounds)); }
            catch (e) { log('[seed s5 FAILED]', String(e.message).slice(0, 400)); }
        }
        const {page, close} = await launch(app);
        try {
            if (S.s5 && S.s5.id) await sect('a5b s5', async () => {
                const rk = roundKey(S.s5.rounds, 3);
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s5.id, rk), 's5-mgr-round-before');
                await setRecommendOnly(page, sc.names.se, 's5');
                await signInAs(page, u.se);
                const r = await openWorkflow(page, workflow(S.s5.id, rk), 's5-se-recommendonly-round-with-deciding');
                record('s5-se-round-controls', {buttons: r.info.buttons, recommend: r.info.buttons.filter((b) => /Recommend/i.test(b))});
                await signInAs(page, u.se2);
                await openWorkflow(page, workflow(S.s5.id, rk), 's5-se2-deciding-round');
            });
            if (S.s2 && S.s2.id) await sect('a5b s2', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-mgr-before-deciding');
                await assignForm(page, 's2-mgr-assign-deciding', {group: isOMP ? 'Series editor' : 'Section editor', user: sc.names.se2, keep: true});
                await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-mgr-after-deciding');
                await signInAs(page, u.se);
                const r = await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-se-recommendonly-with-deciding');
                record('s2-se-recommendonly-with-deciding-controls', {buttons: r.info.buttons, recommend: r.info.buttons.filter((b) => /Recommend/i.test(b)), decision: r.decisionButtons, notice: r.info.notice});
                await signInAs(page, u.se2);
                await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-se2-deciding-workflow_4');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- rolesfix: the roles the grid loop's row parser cut short, read by their exact names ----
    if (on('rolesfix')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await rolesGrid(page, 'mgr-roles-grid-fix');
            const names = isOMP ? ['Chapter Author', 'Internal Reviewer', 'External Reviewer', 'Press manager'] : ['Journal manager', 'Subscription Manager'];
            const out = [];
            for (const n of names) { const o = await roleStages(page, n, `mgr-role-${n.replace(/[^a-z]+/gi, '-').toLowerCase()}`).catch((e) => ({role: n, error: String(e.message).slice(0, 200)})); out.push(o ? {role: n, stages: o.before ? o.before.stages.map((x) => `${x.label}${x.checked ? ' [x]' : ' [ ]'}`) : o} : {role: n, row: 'absent or no Edit'}); }
            record('mgr-roles-stages-fix', out);
            log('[rolesfix]', JSON.stringify(out).slice(0, 800));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- tasktpl: Manage Emails read, the "Request Copyedit" task template read and edited, the Assign form's prefill on S2 ----
    if (on('tasktpl')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await sect('emails read', async () => { await manageEmails(page, ['Sent to Production', 'Submission Sent Back from Copyediting', 'Request Copyedit', 'Copyedit'], 'mgr-defaults'); });
            await sect('task template read', async () => { await taskTemplates(page, 'Request Copyedit', 'mgr-defaults'); });
            await sect('task template edit', async () => { await taskTemplates(page, 'Request Copyedit', 'mgr-edit-rc', {editPrefix: 'K1EDIT-RC body'}); });
            if (S.s2 && S.s2.id) await sect('assign template prefill', async () => {
                await openWorkflow(page, workflow(S.s2.id, 'workflow_4'), 's2-mgr-assign-prefill-before');
                await assignForm(page, 's2-mgr-prefill', {group: 'Copyeditor', user: sc.names.ce, template: 'Request Copyedit'});
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- stages: the Roles grid defaults; Copyeditor loses Copyediting, Layout Editor gains it; the reads and the Assign list ----
    if (on('stages') && S.s1 && S.s1.id) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const rows = await rolesGrid(page, 'mgr-roles-grid');
            const stages = [];
            for (const r of (process.env.SKIPGRID ? [] : rows)) {
                const m = r.match(/^(?:Settings\s+)?(.+?)\s+(Journal manager|Press manager|Manager|Section editor|Series editor|Assistant|Author|Reviewer|Reader|Subscription manager|Site Admin)\b/i);
                const roleName = m ? m[1].trim() : r.replace(/^Settings\s+/i, '').trim();
                const o = await roleStages(page, roleName, `mgr-role-${roleName.replace(/[^a-z]+/gi, '-').toLowerCase()}`).catch((e) => ({error: String(e.message).slice(0, 200)}));
                stages.push({row: r, role: roleName, stages: o && o.before ? o.before.stages.map((x) => `${x.label || x.value}${x.checked ? ' [x]' : ' [ ]'}`) : o});
            }
            record('mgr-roles-stages', {rows, stages});
            // the Assign list before
            await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr-before-stage-change');
            const before = await assignForm(page, 's1-mgr-before-stage-change');
            // the sweep: leave the Layout Editor form with an unsaved tick
            await rolesGrid(page, 'mgr-roles-grid-2');
            await sect('leave unsaved', async () => { await roleStages(page, 'Layout Editor', 'mgr-role-layout-editor-leave-unsaved', {flip: '4', leaveUnsaved: true}); });
            await rolesGrid(page, 'mgr-roles-grid-3');
            await sect('copyeditor untick alone', async () => { await roleStages(page, 'Copyeditor', 'mgr-role-copyeditor-untick-alone', {flip: '4', save: true}); });
            await sect('copyeditor untick', async () => { await roleStages(page, 'Copyeditor', 'mgr-role-copyeditor-untick', {flip: ['4', '5'], save: true}); });
            await sect('layout tick', async () => { await roleStages(page, 'Layout Editor', 'mgr-role-layout-editor-tick', {flip: '4', save: true}); });
            await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr-after-stage-change');
            const after = await assignForm(page, 's1-mgr-after-stage-change');
            record('assign-groups-before-after', {before: before.groups, after: after.groups});
            log('[assign groups]', 'before:', JSON.stringify(before.groups), 'after:', JSON.stringify(after.groups));
            await readAs(page, 'ce', S.s1.id, 's1-ce-after-stage-change');
            await readAs(page, 'le', S.s1.id, 's1-le-after-stage-change');
            // back to the defaults, and the reads once more
            await signInAs(page, u.mgr);
            await rolesGrid(page, 'mgr-roles-grid-4');
            await sect('copyeditor last stage off', async () => { await roleStages(page, 'Copyeditor', 'mgr-role-copyeditor-last-stage-off', {flip: '5', save: true}); });
            await sect('copyeditor retick', async () => { await roleStages(page, 'Copyeditor', 'mgr-role-copyeditor-retick', {flip: ['4', '5'], save: true}); });
            await sect('layout untick', async () => { await roleStages(page, 'Layout Editor', 'mgr-role-layout-editor-untick', {flip: '4', save: true}); });
            await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr-after-stage-restore');
            const restored = await assignForm(page, 's1-mgr-after-stage-restore');
            record('assign-groups-restored', {groups: restored.groups});
            await readAs(page, 'ce', S.s1.id, 's1-ce-after-stage-restore');
            await signOut(page);
        } finally { await close(); }
    }
});
