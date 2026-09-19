// U33 claim check, chunk K1: the Production stage screen by role, the author's
// view and the screenless sections on all three apps. Purpose, Actors &
// permissions (the gate and the rows), Fields, Rule 1 (what the screen shows),
// Rule 2 (arrival), Rule 12 (the author's view), the canonical preamble, the
// Coverage section and register A1 (recommend-only editor).
// Spec: docs/specs/U33-production-stage.md lines 10–109, 236–252, 380–468.
//
// OJS/OMP: one scratch context per app with one account per role of the
// registry; submissions
//   P1  at Production through review, every role assigned        → the by-role reads (Rule 1, Actors rows), the Assign form, "Send to Text Editor"
//   P2  at Production without review, se + se2 assigned           → A1 (se2 recommend-only), the skip-path notice as se
//   P3  at Copyediting through review, se assigned                → on-screen "Send To Production" with a copyedited file ticked (Rule 2)
//   P4  at Copyediting without review, se assigned                → on-screen "Send To Production" with no file (t2)
//   P5  at the Submission stage, se assigned                      → the author's "not yet been initiated" box (Rule 12)
//   P6  published                                                 → the buttons while the submission rests in Done (Actors row 5)
// OPS: a scratch server with users mgr, mod, mod2, eb, au; preprints
//   Q1 queued (mod, eb assigned), D1 declined (mod), Q2 queued (mod2 → recommend-only), Q3 posted (mod).
//
//   PROBE_FEATURE=U33 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U33/K1/k1.js
//   PHASES=seed,roles,files,a1,author,arrival,sweep,ops   (default all; later phases reuse k1-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
const ALL = ['seed', 'roles', 'files', 'a1', 'author', 'arrival', 'sweep', 'gate', 'a1solo', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const OPSPARTS = process.env.OPSPARTS ? process.env.OPSPARTS.split(',') : null;   // ops sub-sections: q1,author,d1,q2,q3
const opsOn = (p) => !OPSPARTS || OPSPARTS.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const REFUSED = /Error|sufficient privileges|do not have access|does not have access|not currently have access|denied|not authorized/i;

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
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
// The workflow dialog as data: headings (with their x position, to tell the columns apart), visible buttons with
// their emphasis class, tables, notices, the stage menu, the "Notification"/"Status" boxes, the header lines.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
        rowButtons: [...t.querySelectorAll('tbody tr button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).slice(0, 20),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const headings = hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const headingBoxes = hs.map((e) => ({h: e.innerText.trim(), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y)})).filter((x) => x.h).slice(0, 40);
    const btnEls = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis);
    const buttons = btnEls.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const actionRegion = root.querySelector('[data-cy="workflow-action-items"]');
    const actionButtons = actionRegion ? [...actionRegion.querySelectorAll('button')].filter(vis).map((b) => ({text: b.innerText.trim(), primary: /\bbg-primary\b/.test(b.className), warnable: /negative/.test(b.className), className: b.className.slice(0, 120)})) : null;
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"], .pkpBadge, [class*="badge"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const nav = [...root.querySelectorAll('nav a, nav button, [role=menuitem], [role=menubar] *[role]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 60);
    const byHeading = (re) => { const h = hs.find((x) => re.test(x.innerText.trim())); return h && h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null; };
    const lines = (dlgs[0] ? dlgs[0].innerText : '').split('\n').map((l) => l.trim()).filter(Boolean);
    const closeAt = lines.indexOf('Close');
    const header = dlgs[0] ? lines.slice(closeAt >= 0 ? closeAt + 1 : 0, (closeAt >= 0 ? closeAt + 1 : 0) + 6).join(' | ') : null;
    const descriptions = hs.map((h) => ({h: h.innerText.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 160) : null})).filter((x) => /Files|Discussions|Participants|Notification|Status/i.test(x.h)).slice(0, 12);
    return {dialogCount: dlgs.length, headings, headingBoxes, buttons, actionButtons, tables, notices, nav, notice: byHeading(/^Notification$/i), status: byHeading(/^Status$/i), header, descriptions, bodyStart: root.innerText.replace(/\s+/g, ' ').slice(0, 600)};
});
const decisionInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const main = document.querySelector('main') || document.body;
    const labelOf = (i) => {
        const l = i.id && document.querySelector(`label[for="${i.id}"]`);
        return (l ? l.innerText : (i.closest('label') || i.parentElement || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    };
    return {
        url: location.href,
        steps: [...main.querySelectorAll('[role=tab], .pkpSteps__step, [class*="steps__step"], ol li button')].filter(vis).map((e) => ({text: e.innerText.trim().replace(/\s+/g, ' '), current: e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') != null || /current/.test(e.className)})).slice(0, 12),
        headings: [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40),
        buttons: [...main.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || '').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})).filter((b) => b.text).slice(0, 60),
        checkboxes: [...main.querySelectorAll('input[type=checkbox]')].map((i) => ({label: labelOf(i), checked: i.checked, visible: vis(i), name: i.name || null, id: i.id || null})).slice(0, 40),
        text: main.innerText.slice(0, 6000),
    };
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
async function waitWindow(page) {
    await topWin(page).waitFor({timeout: 30000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
    await idle(page);
}
async function closeTop(page) {
    const top = topWin(page);
    const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
    if (await c.count()) { await c.click({timeout: 5000}).catch(() => {}); await idle(page); await page.waitForTimeout(400); }
    else { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
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
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };

    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)})), ...(extra || {})});
        const refused = REFUSED.test(dialogs.map((d) => d.text).join(' ') + ' ' + (s.text?.main || ''));
        log(`[${label}]`, app.name, 'header:', flat(info.header, 90), '| notice:', flat(info.notice, 60), '| status:', flat(info.status, 60), '| actions:', JSON.stringify((info.actionButtons || []).map((b) => `${b.text}${b.primary ? '*' : ''}`)), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)), '| headings:', JSON.stringify((info.headings || []).slice(0, 8)), refused ? '| REFUSED' : '');
        return {info, dialogs, s, refused, url: page.url()};
    }
    // The legacy three-tab upload wizard (already open).
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
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
    }
    // "Upload" above the Vue "Production Ready Files" list.
    async function uploadProductionReady(page, file, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const up = dlg.getByRole('button', {name: 'Upload', exact: true}).first();
        await loc(page, `${label}: "Upload" above Production Ready Files`, up);
        await up.click(); await idle(page);
        await driveWizard(page, file, label);
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables, notice: info.notice, buttons: info.buttons});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 500));
        return info;
    }
    // Upload one file into the nth "Upload/Select Files" list of the Copyediting stage (K4/K1 idiom of U32).
    async function uploadInto(page, nth, file, label) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        await btns.nth(nth).click(); await idle(page);
        // the legacy select window is the dialog holding the "Show files from all accessible workflow stages." box (U32 K3 note)
        const win = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
        await win.waitFor({timeout: 30000});
        const up = win.getByRole('link', {name: /Upload File/}).first();
        await up.waitFor({timeout: 30000});
        await idle(page);
        await up.click(); await idle(page);
        await driveWizard(page, file, label);
        const base = path.basename(file);
        await topWin(page).locator(`tr:has-text("${base}") input[type=checkbox]:checked`).first().waitFor({timeout: 15000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const top = topWin(page);
        let ok = top.getByRole('button', {name: /^(Save|OK|Complete|Done)$/}).last();
        if (!(await ok.count())) ok = top.getByRole('link', {name: /^(Save|OK)$/}).last();
        if (await ok.count()) { await ok.click(); await idle(page); }
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length <= 1, null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables, notice: info.notice});
        return info;
    }
    // Press a decision button and walk its wizard, skipping every email page and ticking every file offered.
    async function runDecision(page, name, label) {
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
            pages.push({n, url: d.url, steps: d.steps.map((x) => `${x.text}${x.current ? '*' : ''}`), headings: d.headings, buttons: d.buttons.map((b) => b.text), checkboxes: d.checkboxes.map((c) => `${c.label}${c.checked ? ' [x]' : ' [ ]'}`)});
            log(`[${label} page ${n}]`, JSON.stringify(pages[pages.length - 1]).slice(0, 600));
            return d;
        };
        await readPage(1);
        const cont = page.getByRole('button', {name: 'Continue', exact: true});
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        for (let i = 2; i < 8 && !(await rec.isVisible().catch(() => false)); i++) {
            const skip = page.getByRole('button', {name: /^Skip this email$/i}).first();
            if (await skip.isVisible().catch(() => false)) { await skip.click(); await idle(page); await page.waitForTimeout(400); }
            else { await cont.first().click(); await idle(page); }
            const d = await readPage(i);
            for (const c of d.checkboxes.filter((c) => c.visible && !c.checked && c.id)) { await page.locator(`#${c.id}`).check({force: true}).catch(() => {}); }
            if (d.checkboxes.length) { const d2 = await decisionInfo(page); pages[pages.length - 1].ticked = d2.checkboxes.map((c) => `${c.label}${c.checked ? ' [x]' : ' [ ]'}`); }
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
            log(`[${label} landed]`, JSON.stringify(landed), '| header:', flat(info.header, 100), '| notice:', flat(info.notice, 80), '| status:', flat(info.status, 80));
            landed.info = info;
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
        // the legacy window's form loads by AJAX after the dialog opens (patterns.md pitfall 4): wait for its form, not its Close button
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[name="recommendOnly"], form input[type=submit], form button[type=submit]'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const before = (await dialogTexts(page)).slice(-1)[0];
        const box = form.locator('input[name="recommendOnly"]');
        const present = await box.count();
        record(`${label}-participants-edit-form`, {title: before && before.name, text: flat(before && before.text, 800), recommendOnlyPresent: present, checked: present ? await box.isChecked() : null});
        if (!present) { await closeTop(page); return false; }
        await box.check();
        const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
        await ok.click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        record(`${label}-participants-after-save`, {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 400)}))});
        return true;
    }
    // The Participants panel's "Assign" form: the group list and the template list, then Cancel (or pick and keep).
    async function assignForm(page, label, {group, user, template, keep, leaveByGoto} = {}) {
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
        const tsel0 = form.locator('select[name="template"]');
        const templates = (await tsel0.count()) ? await tsel0.locator('option').evaluateAll((els) => els.map((o) => o.text.trim())) : null;
        const out = {title: top && top.name, groups, templates, text: flat(top && top.text, 600)};
        if (group) {
            await sel.selectOption({label: group}); await idle(page);
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
            if (await tsel.count() && template) {
                await tsel.selectOption({label: template}); await idle(page);
                const id = await form.locator('textarea[name="message"]').getAttribute('id').catch(() => null);
                await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).getContent().length > 20, id, {timeout: 20000}).catch(() => {});
                out.message = flat(await page.evaluate((id) => window.tinymce?.get(id)?.getContent({format: 'text'}), id), 800);
            }
        }
        record(`${label}-assign-form`, out);
        await shot(page, `${label}-assign-form`).catch(() => {});
        log(`[${label} assign]`, JSON.stringify(out.groups), '| templates:', JSON.stringify(out.templates));
        if (leaveByGoto) {
            const dialogs = [];
            const onDialog = (d) => { dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); };
            page.on('dialog', onDialog);
            let navError = null;
            try { await page.goto(ctxUrl('/dashboard/editorial'), {timeout: 20000}); } catch (e) { navError = String(e.message).slice(0, 200); }
            await page.waitForTimeout(800); await idle(page).catch(() => {});
            page.off('dialog', onDialog);
            out.leftUnsaved = {browserDialogs: dialogs, navError, url: page.url(), pageDialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 200)}))};
            record(`${label}-assign-left-unsaved`, out.leftUnsaved);
            return out;
        }
        if (keep) {
            const ok = form.getByRole('button', {name: 'OK', exact: true}).last();
            await ok.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            out.saved = {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}))};
            record(`${label}-assign-saved`, out.saved);
            return out;
        }
        const cancel = form.getByRole('link', {name: /^\s*Cancel\s*$/}).last();
        await cancel.click(); await idle(page);
        return out;
    }
    // The first row's menu of the named table: its entries.
    async function rowMenu(page, tableName, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const table = dlg.getByRole('table', {name: tableName}).first();
        if (!(await table.count())) { record(`${label}-rowmenu`, {table: 'absent'}); return {table: 'absent'}; }
        const btn = table.locator('tbody tr button').first();
        if (!(await btn.count())) { record(`${label}-rowmenu`, {rowButton: 'absent'}); return {rowButton: 'absent'}; }
        const name = await btn.getAttribute('aria-label').catch(() => null) || flat(await btn.innerText(), 60);
        await btn.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-rowmenu`, {button: name, items});
        await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300);
        log(`[${label} row menu]`, JSON.stringify(items.map((i) => i.text)));
        return {button: name, items};
    }
    // Press "Schedule For Publication" / "Post the preprint" and record the landing.
    async function pressSchedule(page, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const btn = dlg.getByRole('button', {name: /^(Schedule For Publication|Post the preprint)$/}).first();
        if (!(await btn.count())) { record(`${label}-schedule`, {absent: true}); return {absent: true}; }
        const text = flat(await btn.innerText(), 40);
        await loc(page, `${label}: "${text}"`, btn);
        await btn.click(); await idle(page);
        await page.waitForTimeout(1200); await idle(page);
        const info = await wfInfo(page);
        const s = await snap(page, `${label}-schedule-landed`, {info, pressed: text});
        const out = {pressed: text, url: page.url(), headings: info.headings.slice(0, 10), buttons: info.buttons.slice(0, 30), header: info.header, dialogs: (await dialogTexts(page)).map((d) => d.name)};
        log(`[${label} schedule]`, JSON.stringify(out).slice(0, 500));
        return out;
    }

    // ---- OPS ------------------------------------------------------------------
    if (isOPS) {
        if (on('seed') && !sc.contextPath) {
            const t = tag('u33k1');
            const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['mod', 'sectionEditor', 'Mo', 'Moderator'], ['mod2', 'sectionEditor', 'Rec', 'Recommender'], ['eb', 'editorialBoardMember', 'Eb', 'Board'], ['au', 'author', 'Ava', 'Author'], ['au2', 'author', 'Bo', 'Stranger']];
            const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
            const ctx = await app.api.createContext({tag: t, context: {name: `U33 K1 ${t}`, acronym: 'U33K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
            sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
            sc.roleKeys = Object.fromEntries(roleUsers.map(([k, role]) => [k, role]));
            sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
            const u = sc.users; const part = (k) => ({username: u[k], role: sc.roleKeys[k]});
            const seeds = {
                q1: {title: `K1 Q1 queued ${t}`, participants: [part('mod'), part('eb')]},
                d1: {title: `K1 D1 declined ${t}`, decisions: ['decline'], participants: [part('mod')]},
                q2: {title: `K1 Q2 recommend-only ${t}`, participants: [part('mod2')]},
                q3: {title: `K1 Q3 posted ${t}`, published: true, participants: [part('mod')]},
            };
            sc.subs = {};
            for (const [k, spec] of Object.entries(seeds)) {
                try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, status: r.status}; log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'status', r.status); }
                catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
            }
            save(); record('seed', sc);
        }
        const u = sc.users; const S = sc.subs || {};
        if (!u) { log('[k1 ops] no state; run the seed phase first'); return; }
        if (on('ops')) {
            const {page, close} = await launch(app);
            try {
                const summary = {};
                // Q1 queued: every level
                for (const k of opsOn('q1') ? ['admin', 'mgr', 'mod', 'eb', 'au', 'au2'] : []) {
                    await sect(`ops q1 ${k}`, async () => {
                        await signInAs(page, k === 'admin' ? 'admin' : u[k]);
                        const r = await openWorkflow(page, k === 'au' || k === 'au2' ? authorWorkflow(S.q1.id, 'workflow_5') : workflow(S.q1.id, 'workflow_5'), `q1-${k}-workflow_5`);
                        summary[`q1-${k}`] = {url: r.url, header: flat(r.info.header, 120), notice: r.info.notice, status: r.info.status, headings: r.info.headings, actions: r.info.actionButtons, tables: (r.info.tables || []).map((t) => ({name: t.name, rows: t.rows.length})), nav: r.info.nav, refused: r.refused, dialogText: flat(r.dialogs.map((d) => d.text).join(' || '), 300)};
                        if (k === 'eb') {
                            const r2 = await openWorkflow(page, workflow(S.q1.id), `q1-${k}-workflow-nokey`);
                            summary[`q1-${k}`].noKey = {url: r2.url, refused: r2.refused, dialogText: flat(r2.dialogs.map((d) => d.text).join(' || '), 300), main: flat(r2.s.text?.main, 300)};
                            const r3 = await openWorkflow(page, authorWorkflow(S.q1.id, 'workflow_5'), `q1-${k}-author-address`);
                            summary[`q1-${k}`].authorAddress = {url: r3.url, refused: r3.refused, main: flat(r3.s.text?.main, 300)};
                        }
                        if (k === 'mgr' || k === 'mod') {
                            summary[`q1-${k}`].assign = await assignForm(page, `q1-${k}`).catch((e) => ({error: String(e.message).slice(0, 200)}));
                        }
                        if (k === 'mod') {
                            await openWorkflow(page, workflow(S.q1.id, 'workflow_5'), `q1-${k}-reland`);
                            summary[`q1-${k}`].schedule = await pressSchedule(page, `q1-${k}`);
                        }
                    });
                }
                // The author's side menu, first page, last page of the "Preprint" group (Rule 12, t13)
                if (opsOn('author')) await sect('ops author view', async () => {
                    await signInAs(page, u.au);
                    const r = await openWorkflow(page, authorWorkflow(S.q1.id), 'q1-au-landing');
                    const dlg = page.locator('[role="dialog"]:visible').first();
                    const menu = await dlg.locator('nav, [role="navigation"], aside').first().evaluate((n) => n.innerText.split('\n').map((l) => l.trim()).filter(Boolean)).catch(() => null);
                    const menuAll = await dlg.locator('button, a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                    summary['q1-au-landing'] = {url: r.url, header: flat(r.info.header, 120), headings: r.info.headings, nav: r.info.nav, menu, menuAll, actions: r.info.actionButtons};
                    const last = dlg.locator('nav, aside, [role="navigation"]').getByText('Production Tasks & Discussions', {exact: true}).first();
                    let lastRead = null;
                    if (await last.count()) {
                        await last.click(); await idle(page); await page.waitForTimeout(600); await idle(page);
                        const info = await wfInfo(page);
                        await snap(page, 'q1-au-discussions-page', {info});
                        lastRead = {url: page.url(), headings: info.headings, buttons: info.buttons.slice(0, 30), notice: info.notice, status: info.status, tables: info.tables.map((t) => ({name: t.name, rows: t.rows.length}))};
                        const add = dlg.getByRole('button', {name: /^Add$/}).first();
                        if (await add.count()) {
                            await add.click(); await idle(page); await waitWindow(page).catch(() => {});
                            const top = (await dialogTexts(page)).slice(-1)[0];
                            lastRead.add = {title: top && top.name, text: flat(top && top.text, 400), buttons: top && top.buttons};
                            record('q1-au-discussion-add', lastRead.add);
                            await closeTop(page);
                        } else lastRead.add = {absent: true};
                    } else lastRead = {menuEntry: 'absent'};
                    summary['q1-au-landing'].discussionsPage = lastRead;
                    log('[ops author]', JSON.stringify(summary['q1-au-landing']).slice(0, 900));
                    // the editorial dashboard as the author
                    await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                    const s = await snap(page, 'q1-au-editorial-dashboard');
                    summary['q1-au-landing'].editorialDashboard = {url: page.url(), main: flat(s.text?.main, 300)};
                });
                // D1 declined: mgr (unassigned), mod (assigned), admin; then Delete as mgr: Cancel, then Confirm
                for (const k of opsOn('d1') ? ['mod', 'admin', 'mgr'] : []) {
                    await sect(`ops d1 ${k}`, async () => {
                        await signInAs(page, k === 'admin' ? 'admin' : u[k]);
                        const r = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), `d1-${k}-workflow_5`);
                        summary[`d1-${k}`] = {url: r.url, header: flat(r.info.header, 120), notice: r.info.notice, status: r.info.status, headings: r.info.headings, actions: r.info.actionButtons, nav: r.info.nav, notices: r.info.notices, refused: r.refused};
                        if (k === 'mgr') {
                            const dlg = page.locator('[role="dialog"]:visible').first();
                            const del = dlg.getByRole('button', {name: 'Delete', exact: true}).first();
                            if (await del.count()) {
                                await loc(page, 'd1-mgr: "Delete"', del);
                                await del.click(); await idle(page); await page.waitForTimeout(500);
                                const conf = (await dialogTexts(page)).slice(-1)[0];
                                summary['d1-mgr'].deleteDialog = {title: conf && conf.name, text: flat(conf && conf.text, 400), buttons: conf && conf.buttons};
                                await snap(page, 'd1-mgr-delete-dialog');
                                const cancel = topWin(page).getByRole('button', {name: /^Cancel$/}).first();
                                await cancel.click(); await idle(page); await page.waitForTimeout(500);
                                const after = await wfInfo(page);
                                summary['d1-mgr'].afterCancel = {header: flat(after.header, 100), actions: after.actionButtons, dialogs: (await dialogTexts(page)).map((d) => d.name)};
                                await del.click(); await idle(page); await page.waitForTimeout(500);
                                const confirm = topWin(page).getByRole('button', {name: /^(Confirm|OK|Yes)$/}).first();
                                await confirm.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
                                const s = await snap(page, 'd1-mgr-deleted-landed');
                                summary['d1-mgr'].afterConfirm = {url: page.url(), h1: flat(s.text?.main, 200), dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 200)}))};
                                await page.goto(ctxUrl('/dashboard/editorial?currentViewId=declined')); await idle(page);
                                await page.waitForTimeout(800); await idle(page);
                                const s2 = await snap(page, 'd1-mgr-declined-view');
                                summary['d1-mgr'].declinedView = {url: page.url(), lists: flat(s2.text?.main, 600), stillListed: (s2.text?.main || '').includes(S.d1.title)};
                                const r2 = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-mgr-after-delete-address');
                                summary['d1-mgr'].addressAfterDelete = {url: r2.url, main: flat(r2.s.text?.main, 200), dialogText: flat(r2.dialogs.map((d) => d.text).join(' || '), 200)};
                            } else summary['d1-mgr'].deleteDialog = {absent: true};
                        }
                    });
                }
                // Q2: mod2 recommend-only (t9 / OPS4)
                if (opsOn('q2')) await sect('ops q2 recommend-only', async () => {
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.q2.id, 'workflow_5'), 'q2-mgr-workflow_5');
                    const set = await setRecommendOnly(page, sc.names.mod2, 'q2-mgr');
                    summary['q2-recommendOnlySet'] = set;
                    await signInAs(page, u.mod2);
                    await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                    await page.waitForTimeout(800); await idle(page);
                    const s = await snap(page, 'q2-mod2-dashboard');
                    const row = page.locator('main').getByRole('button', {name: /View/}).first();
                    const link = page.locator('main').getByText(S.q2.title, {exact: false}).first();
                    let opened = null;
                    if (await link.count()) { await link.click().catch(() => {}); await idle(page); await page.waitForTimeout(1000); await idle(page); opened = 'title'; }
                    else if (await row.count()) { await row.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); opened = 'view'; }
                    const info = await wfInfo(page);
                    const dialogs = await dialogTexts(page);
                    await snap(page, 'q2-mod2-opened-from-dashboard', {info, dialogs});
                    summary['q2-mod2'] = {opened, url: page.url(), dashboardMain: flat(s.text?.main, 300), header: flat(info.header, 120), headings: info.headings, actions: info.actionButtons, dialogs: dialogs.map((d) => ({name: d.name, text: flat(d.text, 300), buttons: d.buttons})), errors: null};
                    const r = await openWorkflow(page, workflow(S.q2.id, 'workflow_5'), 'q2-mod2-workflow_5');
                    summary['q2-mod2'].byAddress = {url: r.url, header: flat(r.info.header, 120), headings: r.info.headings, actions: r.info.actionButtons, refused: r.refused, dialogs: r.dialogs.map((d) => ({name: d.name, text: flat(d.text, 300)}))};
                    log('[ops q2 mod2]', JSON.stringify(summary['q2-mod2']).slice(0, 900));
                });
                // Q3 posted: the buttons as mgr and mod
                for (const k of opsOn('q3') ? ['mgr', 'mod'] : []) {
                    await sect(`ops q3 ${k}`, async () => {
                        await signInAs(page, u[k]);
                        const r = await openWorkflow(page, workflow(S.q3.id, 'workflow_5'), `q3-${k}-workflow_5`);
                        summary[`q3-${k}`] = {url: r.url, header: flat(r.info.header, 120), status: r.info.status, notice: r.info.notice, headings: r.info.headings, actions: r.info.actionButtons, nav: r.info.nav};
                    });
                }
                record(OPSPARTS ? `ops-summary-${OPSPARTS.join('-')}` : 'ops-summary', summary);
                await signOut(page).catch(() => {});
            } finally { await close(); }
        }
        return;
    }

    // ---- seed (OJS / OMP) --------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u33k1');
        const roleUsers = [
            ['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Edda', 'Editor'],
            ['se', 'sectionEditor', 'Sid', 'Section'], ['se2', 'sectionEditor', 'Rec', 'Recommender'],
            ...(isOMP ? [] : [['ge', 'guestEditor', 'Gus', 'Guest']]),
            ['pe', 'productionEditor', 'Pat', 'Production'], ['de', 'designer', 'Dee', 'Designer'], ['ix', 'indexer', 'Ida', 'Indexer'],
            ['le', 'layoutEditor', 'Leo', 'Layout'], ['pr', 'proofreader', 'Pia', 'Proof'],
            ['ce', 'copyeditor', 'Cora', 'Copyeditor'], ['mk', 'marketing', 'Mark', 'Marketing'], ['fu', 'funding', 'Fay', 'Funding'],
            ['tr', 'translator', 'Tia', 'Translator'], ['au', 'author', 'Ava', 'Author'], ['rev', 'externalReviewer', 'Rowan', 'Reviewer'],
            ...(isOMP ? [['ve', 'volumeEditor', 'Vic', 'Volume'], ['ca', 'chapterAuthor', 'Cal', 'Chapter']] : []),
        ];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U33 K1 ${t}`, acronym: 'U33K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.roleKeys = Object.fromEntries(roleUsers.map(([k, role]) => [k, role]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        const u = sc.users;
        const part = (k) => ({username: u[k], role: sc.roleKeys[k]});
        const assigned = ['se', 'pe', 'de', 'ix', 'le', 'pr', 'ce', 'mk', 'fu', 'tr', ...(isOMP ? ['ve', 'ca'] : ['ge'])];
        const viaReview = isOMP ? ['skipInternalReview', 'sendExternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        const round = [{reviewers: [{username: u.rev, status: 'completed'}]}];
        const seeds = {
            p1: {title: `K1 P1 every role ${t}`, decisions: [...viaReview, 'sendToProduction'], reviewRounds: round, participants: assigned.map(part)},
            p2: {title: `K1 P2 no review ${t}`, decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se'), part('se2')]},
            p3: {title: `K1 P3 copyediting via review ${t}`, decisions: viaReview, reviewRounds: round, participants: [part('se')]},
            p4: {title: `K1 P4 copyediting no review ${t}`, decisions: ['skipExternalReview'], participants: [part('se')]},
            p5: {title: `K1 P5 submission stage ${t}`, participants: [part('se')]},
            p6: {title: `K1 P6 published ${t}`, decisions: ['skipExternalReview', 'sendToProduction'], published: true, participants: [part('se')]},
        };
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            const body = {tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec};
            try {
                const r = await app.api.createSubmission(body);
                sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, status: r.status, rounds: r.reviewRounds || []};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'status', r.status);
            } catch (e) {
                log(`[seed ${k} FAILED]`, String(e.message).slice(0, 700));
                sc.subs[k] = {error: String(e.message).slice(0, 700)};
                if (k === 'p1' && isOMP) {
                    try { const r = await app.api.createSubmission({...body, decisions: ['skipInternalReview', 'accept', 'sendToProduction']}); sc.subs.p1 = {id: r.submissionId, title: spec.title, stageId: r.stageId, rounds: r.reviewRounds || [], firstError: String(e.message).slice(0, 300)}; } catch (e2) { sc.subs.p1.error2 = String(e2.message).slice(0, 700); }
                }
                if (k === 'p6') {
                    try { const r = await app.api.createSubmission({...body, published: false}); sc.subs.p6 = {id: r.submissionId, title: spec.title, stageId: r.stageId, unpublished: true, firstError: String(e.message).slice(0, 300)}; } catch (e2) { sc.subs.p6.error2 = String(e2.message).slice(0, 700); }
                }
            }
        }
        save();
        record('seed', sc);
    }
    const u = sc.users; const S = sc.subs || {};
    if (!u) { log('[k1] no state; run the seed phase first'); return; }
    const authorLevel = (k) => ['au', 'tr', 've', 'ca'].includes(k);

    // ---- roles: P1's Production entry at every level, before any file ----
    if (on('roles') && S.p1 && S.p1.id) {
        const {page, close} = await launch(app);
        try {
            const order = ['admin', 'mgr', 'ed', 'se', ...(isOMP ? [] : ['ge']), 'pe', 'de', 'ix', 'le', 'pr', 'ce', 'mk', 'fu', 'tr', ...(isOMP ? ['ve', 'ca'] : []), 'au'];
            const summary = {};
            for (const k of order) {
                await sect(`roles ${k}`, async () => {
                    await signInAs(page, k === 'admin' ? 'admin' : u[k]);
                    let r = await openWorkflow(page, authorLevel(k) ? authorWorkflow(S.p1.id, 'workflow_5') : workflow(S.p1.id, 'workflow_5'), `p1-${k}-workflow_5`);
                    const entry = {role: k === 'admin' ? 'site admin' : sc.roleKeys[k], url: r.url, refused: r.refused};
                    if (authorLevel(k) && k !== 'au') {
                        // the editorial dashboard as an author-level role
                        await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                        const s = await snap(page, `p1-${k}-editorial-dashboard`);
                        entry.editorialDashboard = {url: page.url(), main: flat(s.text?.main, 300)};
                        const r2 = await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), `p1-${k}-editorial-address`);
                        entry.editorialAddress = {url: r2.url, refused: r2.refused, main: flat(r2.s.text?.main, 300), dialogText: flat(r2.dialogs.map((d) => d.text).join(' || '), 200)};
                        r = await openWorkflow(page, authorWorkflow(S.p1.id, 'workflow_5'), `p1-${k}-workflow_5-reland`);
                    }
                    if (k === 'au') {
                        const r2 = await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), `p1-${k}-editorial-address`);
                        entry.editorialAddress = {url: r2.url, refused: r2.refused, main: flat(r2.s.text?.main, 300)};
                        r = await openWorkflow(page, authorWorkflow(S.p1.id, 'workflow_5'), `p1-${k}-workflow_5-reland`);
                    }
                    const info = r.info;
                    Object.assign(entry, {header: flat(info.header, 120), notice: info.notice, status: info.status, headings: info.headings, headingBoxes: info.headingBoxes, actions: info.actionButtons, buttons: info.buttons, tables: (info.tables || []).map((t) => ({name: t.name, columns: t.columns, rows: t.rows.length, rowButtons: t.rowButtons})), nav: info.nav, notices: info.notices, descriptions: info.descriptions, dialogText: flat(r.dialogs.map((d) => d.text).join(' || '), 400)});
                    if (!r.refused && !authorLevel(k)) {
                        entry.assign = await assignForm(page, `p1-${k}`).catch((e) => ({error: String(e.message).slice(0, 200)}));
                    }
                    if (['admin', 'mgr', 'ed', 'se', 'le', 'de', 'au'].includes(k) && !r.refused) {
                        await openWorkflow(page, authorLevel(k) ? authorWorkflow(S.p1.id, 'workflow_5') : workflow(S.p1.id, 'workflow_5'), `p1-${k}-workflow_5-reland2`);
                        const dlg = page.locator('[role="dialog"]:visible').first();
                        const add = dlg.getByRole('button', {name: /^Add$/}).first();
                        if (await add.count()) {
                            await add.click(); await idle(page); await waitWindow(page).catch(() => {});
                            const top = (await dialogTexts(page)).slice(-1)[0];
                            entry.discussionAdd = {title: top && top.name, text: flat(top && top.text, 400), buttons: top && top.buttons};
                            record(`p1-${k}-discussion-add`, entry.discussionAdd);
                            await closeTop(page);
                            await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length <= 1, null, {timeout: 10000}).catch(() => {});
                        } else entry.discussionAdd = {absent: true};
                    }
                    summary[k] = entry;
                    log(`[roles ${k}]`, JSON.stringify({actions: (entry.actions || []).map((b) => `${b.text}${b.primary ? '*' : ''}`), notice: entry.notice, status: entry.status, headings: entry.headings, assign: entry.assign && (entry.assign.groups || entry.assign)}).slice(0, 600));
                });
            }
            record('p1-roles-summary', summary);
            // the stage menu and the other entries as mgr: Copyediting (workflow_4) reads "in the Production stage"
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p1.id, 'workflow_4'), 'p1-mgr-workflow_4');
            await openWorkflow(page, workflow(S.p1.id), 'p1-mgr-landing');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- files: "Upload" a Markdown file as ed on P1, then the row menu at the levels of Actors row 4 ----
    if (on('files') && S.p1 && S.p1.id) {
        const {page, close} = await launch(app);
        try {
            await sect('files upload', async () => {
                await signInAs(page, u.ed);
                const before = await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-ed-before-upload');
                const prf = (before.info.tables || []).find((t) => /Production Ready Files/.test(t.name || ''));
                const hasFiles = prf && prf.rows.some((r) => !/^No Items$/i.test(r));
                if (hasFiles) { log('[files upload] list already holds files; skipping the uploads'); return; }
                await uploadProductionReady(page, MD, 'p1-ed-upload-md');
                await uploadProductionReady(page, PDF, 'p1-ed-upload-pdf');
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-ed-after-uploads');
            });
            const menus = {};
            for (const k of ['admin', 'mgr', 'ed', 'se', 'pe', 'le', 'de']) {
                await sect(`files rowmenu ${k}`, async () => {
                    await signInAs(page, k === 'admin' ? 'admin' : u[k]);
                    const r = await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), `p1-${k}-with-files`);
                    const t = (r.info.tables || []).find((x) => /Production Ready Files/.test(x.name || ''));
                    menus[k] = {tables: (r.info.tables || []).map((x) => ({name: x.name, columns: x.columns, rows: x.rows, rowButtons: x.rowButtons})), notice: r.info.notice, buttons: r.info.buttons.filter((b) => /Upload|Download/.test(b))};
                    const dlg = page.locator('[role="dialog"]:visible').first();
                    const table = dlg.getByRole('table', {name: 'Production Ready Files'}).first();
                    if (await table.count()) {
                        const rows = table.locator('tbody tr');
                        const n = await rows.count();
                        menus[k].rowMenus = [];
                        for (let i = 0; i < n; i++) {
                            const btn = rows.nth(i).locator('button').first();
                            if (!(await btn.count())) { menus[k].rowMenus.push({row: i, button: 'absent'}); continue; }
                            const name = await btn.getAttribute('aria-label').catch(() => null) || flat(await btn.innerText(), 60);
                            await btn.click(); await idle(page);
                            const items = await menuItems(page);
                            menus[k].rowMenus.push({row: i, rowText: flat(await rows.nth(i).innerText(), 120), button: name, items: items.map((x) => x.text)});
                            // Escape closes the workflow dialog too (patterns.md pitfall 7): toggle the menu closed with its own button
                            await btn.click().catch(() => {}); await page.waitForTimeout(300);
                        }
                        record(`p1-${k}-rowmenus`, menus[k]);
                        log(`[files ${k}]`, JSON.stringify(menus[k].rowMenus.map((m) => `${m.rowText}: ${(m.items || []).join('/')}`)));
                    } else { menus[k].table = 'absent'; log(`[files ${k}] no Production Ready Files table`); }
                });
            }
            record('p1-rowmenus-summary', menus);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- a1: se2 recommend-only on P2; se's read of P2 (the seeded skip path) ----
    if (on('a1') && S.p2 && S.p2.id) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await sect('a1 set', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), 'p2-mgr-workflow_5');
                out.set = await setRecommendOnly(page, sc.names.se2, 'p2-mgr');
            });
            await sect('a1 read se2', async () => {
                await signInAs(page, u.se2);
                const r = await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), 'p2-se2-workflow_5');
                out.se2 = {url: r.url, header: flat(r.info.header, 120), notice: r.info.notice, status: r.info.status, headings: r.info.headings, actions: r.info.actionButtons, buttons: r.info.buttons, tables: (r.info.tables || []).map((t) => ({name: t.name, rows: t.rows.length})), refused: r.refused};
                out.se2.assign = await assignForm(page, 'p2-se2').catch((e) => ({error: String(e.message).slice(0, 200)}));
                await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), 'p2-se2-reland');
                out.se2.schedule = await pressSchedule(page, 'p2-se2');
            });
            await sect('a1 read se', async () => {
                await signInAs(page, u.se);
                const r = await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), 'p2-se-workflow_5');
                out.se = {url: r.url, header: flat(r.info.header, 120), notice: r.info.notice, status: r.info.status, headings: r.info.headings, actions: r.info.actionButtons};
            });
            // the P6 published submission's entry as ed (Actors row 5: the button while the submission rests in Done)
            if (S.p6 && S.p6.id) await sect('p6 ed', async () => {
                await signInAs(page, u.ed);
                const r = await openWorkflow(page, workflow(S.p6.id, 'workflow_5'), 'p6-ed-workflow_5');
                out.p6ed = {url: r.url, header: flat(r.info.header, 120), notice: r.info.notice, status: r.info.status, headings: r.info.headings, actions: r.info.actionButtons, nav: r.info.nav, unpublishedSeed: !!S.p6.unpublished};
                out.p6ed.schedule = await pressSchedule(page, 'p6-ed');
            });
            record('a1-summary', out);
            log('[a1]', JSON.stringify(out).slice(0, 1200));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- author: au on P5 (before Production) and P1; le / de press "Schedule For Publication" ----
    if (on('author')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            if (S.p5 && S.p5.id) await sect('author p5', async () => {
                await signInAs(page, u.au);
                const r = await openWorkflow(page, authorWorkflow(S.p5.id, 'workflow_5'), 'p5-au-workflow_5');
                out.p5 = {url: r.url, header: flat(r.info.header, 120), notice: r.info.notice, status: r.info.status, headings: r.info.headings, actions: r.info.actionButtons, buttons: r.info.buttons.slice(0, 30), nav: r.info.nav};
                const r2 = await openWorkflow(page, authorWorkflow(S.p5.id), 'p5-au-landing');
                out.p5.landing = {url: r2.url, headings: r2.info.headings, nav: r2.info.nav};
            });
            if (S.p3 && S.p3.id) await sect('author p3 copyediting', async () => {
                await signInAs(page, u.au);
                const r = await openWorkflow(page, authorWorkflow(S.p3.id, 'workflow_5'), 'p3-au-workflow_5');
                out.p3 = {url: r.url, header: flat(r.info.header, 120), notice: r.info.notice, status: r.info.status, headings: r.info.headings, nav: r.info.nav};
            });
            for (const k of ['le', 'de']) {
                await sect(`schedule ${k}`, async () => {
                    await signInAs(page, u[k]);
                    await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), `p1-${k}-reland-schedule`);
                    out[`schedule-${k}`] = await pressSchedule(page, `p1-${k}`);
                });
            }
            record('author-summary', out);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- arrival: as se, P3 (a copyedited file uploaded, then "Send To Production") and P4 (no file) ----
    if (on('arrival')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            if (S.p3 && S.p3.id && (!process.env.ARRIVAL || process.env.ARRIVAL.includes('p3'))) await sect('arrival p3', async () => {
                await signInAs(page, u.se);
                const before = await openWorkflow(page, workflow(S.p3.id, 'workflow_4'), 'p3-se-copyediting-before');
                out.p3 = {copyeditingBefore: {notice: before.info.notice, actions: before.info.actionButtons, tables: before.info.tables.map((t) => `${t.name}:${t.rows.length}`)}};
                await uploadInto(page, 1, PDF, 'p3-se-copyedited-upload');
                await openWorkflow(page, workflow(S.p3.id, 'workflow_4'), 'p3-se-copyediting-with-file');
                const prodBefore = await openWorkflow(page, workflow(S.p3.id, 'workflow_5'), 'p3-se-production-before');
                out.p3.productionBefore = {notice: prodBefore.info.notice, status: prodBefore.info.status, headings: prodBefore.info.headings, actions: prodBefore.info.actionButtons, tables: prodBefore.info.tables.map((t) => `${t.name}:${t.rows.length}`), header: flat(prodBefore.info.header, 120)};
                await openWorkflow(page, workflow(S.p3.id, 'workflow_4'), 'p3-se-copyediting-reland');
                const d = await runDecision(page, 'Send To Production', 'p3-se-send-to-production');
                out.p3.decision = {pages: d.pages, done: d.done, landed: d.landed && {url: d.landed.url, pressed: d.landed.pressed, header: flat(d.landed.info?.header, 120), notice: d.landed.info?.notice, status: d.landed.info?.status, headings: d.landed.info?.headings, actions: d.landed.info?.actionButtons, tables: (d.landed.info?.tables || []).map((t) => ({name: t.name, rows: t.rows})), nav: d.landed.info?.nav, notices: d.landed.info?.notices}};
                const after = await openWorkflow(page, workflow(S.p3.id, 'workflow_5'), 'p3-se-production-after');
                out.p3.productionAfter = {url: after.url, header: flat(after.info.header, 120), notice: after.info.notice, status: after.info.status, headings: after.info.headings, headingBoxes: after.info.headingBoxes, actions: after.info.actionButtons, tables: after.info.tables.map((t) => ({name: t.name, columns: t.columns, rows: t.rows})), nav: after.info.nav, notices: after.info.notices, descriptions: after.info.descriptions};
                const cp = await openWorkflow(page, workflow(S.p3.id, 'workflow_4'), 'p3-se-copyediting-after');
                out.p3.copyeditingAfter = {status: cp.info.status, notice: cp.info.notice, headings: cp.info.headings, actions: cp.info.actionButtons};
            });
            if (S.p4 && S.p4.id && (!process.env.ARRIVAL || process.env.ARRIVAL.includes('p4'))) await sect('arrival p4', async () => {
                await signInAs(page, u.se);
                const before = await openWorkflow(page, workflow(S.p4.id, 'workflow_4'), 'p4-se-copyediting-before');
                out.p4 = {copyeditingBefore: {notice: before.info.notice, actions: before.info.actionButtons, tables: before.info.tables.map((t) => `${t.name}:${t.rows.length}`)}};
                const d = await runDecision(page, 'Send To Production', 'p4-se-send-to-production');
                out.p4.decision = {pages: d.pages, done: d.done, landed: d.landed && {url: d.landed.url, header: flat(d.landed.info?.header, 120), notice: d.landed.info?.notice, status: d.landed.info?.status, headings: d.landed.info?.headings, actions: d.landed.info?.actionButtons, tables: (d.landed.info?.tables || []).map((t) => `${t.name}:${t.rows.length}`)}};
                const after = await openWorkflow(page, workflow(S.p4.id, 'workflow_5'), 'p4-se-production-after');
                out.p4.productionAfter = {url: after.url, header: flat(after.info.header, 120), notice: after.info.notice, status: after.info.status, headings: after.info.headings, actions: after.info.actionButtons, tables: after.info.tables.map((t) => `${t.name}:${t.rows.length}`)};
                // the unassigned manager's and the editor's read of the same entry (Actors row 2)
                await signInAs(page, u.mgr);
                const m = await openWorkflow(page, workflow(S.p4.id, 'workflow_5'), 'p4-mgr-production');
                out.p4.mgr = {notice: m.info.notice, status: m.info.status, headings: m.info.headings, actions: m.info.actionButtons};
                await signInAs(page, u.ed);
                const e = await openWorkflow(page, workflow(S.p4.id, 'workflow_5'), 'p4-ed-production');
                out.p4.ed = {notice: e.info.notice, status: e.info.status, headings: e.info.headings, actions: e.info.actionButtons};
            });
            record('arrival-summary', out);
            log('[arrival]', JSON.stringify(out).slice(0, 1500));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- gate: roles NOT assigned to P5 (se2, le) at its Production entry; the unassigned section editor on P1 ----
    if (on('gate') && S.p5 && S.p5.id) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            for (const k of ['se2', 'le', 'ce']) {
                await sect(`gate ${k}`, async () => {
                    await signInAs(page, u[k]);
                    const r = await openWorkflow(page, workflow(S.p5.id, 'workflow_5'), `p5-${k}-unassigned`);
                    out[k] = {url: r.url, refused: r.refused, headings: r.info.headings, dialogText: flat(r.dialogs.map((d) => d.text).join(' || '), 300), main: flat(r.s.text?.main, 200)};
                    await page.goto(ctxUrl('/dashboard/editorial')); await idle(page); await page.waitForTimeout(600); await idle(page);
                    const s = await snap(page, `p5-${k}-dashboard`);
                    out[k].dashboard = {url: page.url(), main: flat(s.text?.main, 300), listsP5: (s.text?.main || '').includes(S.p5.title), listsP1: (s.text?.main || '').includes(S.p1.title)};
                });
            }
            record('gate-summary', out);
            log('[gate]', JSON.stringify(out).slice(0, 1200));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- a1solo: a recommend-only section editor with no deciding editor beside them (P7) ----
    if (on('a1solo')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            if (!S.p7 || !S.p7.id) {
                try { const r = await app.api.createSubmission({tag: `${sc.tag}p7`, context: sc.contextPath, submitter: u.au, title: `K1 P7 recommend-only alone ${sc.tag}`, decisions: ['skipExternalReview', 'sendToProduction'], participants: [{username: u.se2, role: 'sectionEditor'}]}); sc.subs.p7 = S.p7 = {id: r.submissionId, title: `K1 P7 recommend-only alone ${sc.tag}`, stageId: r.stageId}; save(); }
                catch (e) { record('p7-seed-FAILED', {error: String(e.message).slice(0, 500)}); }
            }
            if (S.p7 && S.p7.id) {
                await sect('a1solo set', async () => {
                    await signInAs(page, u.mgr);
                    const r = await openWorkflow(page, workflow(S.p7.id, 'workflow_5'), 'p7-mgr-workflow_5');
                    out.participantsBefore = flat(r.info.bodyStart, 300);
                    out.set = await setRecommendOnly(page, sc.names.se2, 'p7-mgr');
                });
                await sect('a1solo read', async () => {
                    await signInAs(page, u.se2);
                    const r = await openWorkflow(page, workflow(S.p7.id, 'workflow_5'), 'p7-se2-workflow_5');
                    out.se2 = {url: r.url, header: flat(r.info.header, 120), notice: r.info.notice, status: r.info.status, headings: r.info.headings, actions: r.info.actionButtons, buttons: r.info.buttons, refused: r.refused};
                });
            }
            record('a1solo-summary', out);
            log('[a1solo]', JSON.stringify(out).slice(0, 1000));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- sweep: leave the Assign form with a group and user chosen (goto); the discussion "Add" window closed with text typed ----
    if (on('sweep') && S.p1 && S.p1.id) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await sect('sweep assign leave', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-se-sweep-reland');
                const groupLabel = isOMP ? 'Series editor' : 'Section editor';
                out.assignLeave = await assignForm(page, 'p1-se-sweep', {group: groupLabel, user: 'Rec', leaveByGoto: true});
                const r = await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-se-sweep-after-leave');
                out.participantsAfter = {headings: r.info.headings, bodyStart: flat(r.info.bodyStart, 600)};
            });
            await sect('sweep discussion add close', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-se-sweep-reland2');
                const dlg = page.locator('[role="dialog"]:visible').first();
                const add = dlg.getByRole('button', {name: /^Add$/}).first();
                if (!(await add.count())) { out.discussion = {absent: true}; return; }
                await add.click(); await idle(page); await waitWindow(page).catch(() => {});
                const win = topWin(page);
                const title = win.locator('input[type="text"]:visible').first();
                if (await title.count()) await title.fill('K1 sweep unsaved');
                const dialogs = [];
                const onDialog = (d) => { dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); };
                page.on('dialog', onDialog);
                const closeBtn = win.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
                const closeName = flat(await closeBtn.innerText().catch(() => ''), 20);
                await closeBtn.click().catch(() => {}); await idle(page); await page.waitForTimeout(600);
                const pageDialogs = (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300), buttons: x.buttons}));
                await snap(page, 'p1-se-discussion-add-closed');
                page.off('dialog', onDialog);
                out.discussion = {closePressed: closeName, browserDialogs: dialogs, pageDialogs};
                // confirm the discard if a confirmation stands
                const conf = topWin(page).getByRole('button', {name: /^(OK|Yes|Confirm|Discard)/}).first();
                if ((await page.locator('[role="dialog"]:visible').count()) > 1 && await conf.count()) { await conf.click(); await idle(page); }
            });
            record('sweep-summary', out);
            log('[sweep]', JSON.stringify(out).slice(0, 1200));
            await signOut(page);
        } finally { await close(); }
    }
});
