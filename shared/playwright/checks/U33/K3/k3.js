// U33 claim check, chunk K3: the "Schedule For Publication" shortcut (Rule 6),
// "Move To Copyediting" (Rules 7–8) and its Side effects, the Settings that
// modify behavior (Stage Assignment, the email templates, the task templates,
// the app's stages) and the register's A3.
// Spec: docs/specs/U33-production-stage.md lines 167–207, 253–265, 298–334, 485–497.
//
// OJS/OMP: one scratch context per app with a manager (mgr), two Section/Series
// editors (se; se2, made recommend-only on screen), a Layout Editor (le), a
// Copyeditor (ce) and an author (au). Submissions, every one seeded
// skipExternalReview + sendToProduction (at Production):
//   P1  participants se, se2, le → "Schedule For Publication" as le and se2 (Rule 6);
//       as se: a Production Ready file, "Move To Copyediting" left with an edited
//       subject (Cancel), then recorded; the landing, the Copyediting entry, the
//       Production box, the Activity Log, the author's mail; a copyedited file and
//       "Send To Production" again → the Production Ready rows (Rules 7, 7a, 7b, A3)
//   P2  published: true, participants se, le → the Done reads at three levels (Rule 8)
//   P3  participants se, ce, le → the Stage Assignment gate both ways (ce unticked by
//       default, le ticked; then the Copyeditor's box on and the Layout Editor's off,
//       and back); the Assign form's groups; the task template's body prefill and the
//       assignee's mail subject
//   P4  participants se → the edited email template's subject prefilled on
//       "Notify Authors"; "Move To Copyediting" as mgr with "Skip this email"
// Settings (mgr): every role's "Stage Assignment" boxes; Settings › Workflow ›
// Emails; Settings › Workflow › Tasks and Discussions › "Production Stage".
// OPS: a scratch server with a manager, a Moderator and an author; preprints Q1
// queued, Q3 posted, D1 declined, read as the manager (the "Post the preprint"
// ends of Rule 6 and Rule 8's last sentence), plus the three settings reads.
//
//   PROBE_FEATURE=U33 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U33/K3/k3.js
//   PHASES=seed,schedule,published,roles,move,settings,assign,moveskip,ops,grid,gridtick,a3   (default all; later phases reuse k3-state-<app>.json)
//   grid: the Roles grid's own stage columns as a matrix; gridtick: one of its boxes pressed and read back (Copyeditor's Production,
//   OPS the Editorial Board Member's); a3: P6 accepted from a review round, sent to production and moved back (the notice both ways).
//   Order matters on OJS/OMP: `move` before `settings` (the email subject is edited there), `settings` before `moveskip` and `assign`.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, settled, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
const ALL = ['seed', 'schedule', 'published', 'roles', 'move', 'settings', 'assign', 'moveskip', 'ops', 'grid', 'gridtick', 'a3'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

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
// Visible dialogs as data (the workflow dialog is position:fixed, so visibility is getClientRects()).
const dialogTexts = (page) => page.locator('[role="dialog"]').evaluateAll((els) =>
    els.filter((d) => d.getClientRects().length).map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
// The workflow dialog as data: headings, buttons (the action region with its emphasis), tables, the notice and status boxes, the menu, the header.
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
    const headings = hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const actionRegion = root.querySelector('[data-cy="workflow-action-items"]');
    const actionButtons = actionRegion ? [...actionRegion.querySelectorAll('button')].filter(vis).map((b) => ({text: b.innerText.trim(), primary: /\bbg-primary\b/.test(b.className), warnable: /negative/.test(b.className)})) : null;
    const nav = [...root.querySelectorAll('nav a, nav button, [role=menuitem]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 60);
    const byHeading = (re) => { const h = hs.find((x) => re.test(x.innerText.trim())); return h && h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null; };
    const lines = (dlgs[0] ? dlgs[0].innerText : '').split('\n').map((l) => l.trim()).filter(Boolean);
    const closeAt = lines.indexOf('Close');
    const header = dlgs[0] ? lines.slice(closeAt >= 0 ? closeAt + 1 : 0, (closeAt >= 0 ? closeAt + 1 : 0) + 6).join(' | ') : null;
    const descriptions = hs.map((h) => ({h: h.innerText.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 200) : null})).filter((x) => /Files|Discussions|Participants|Notification|Status|approval|Catalog/i.test(x.h)).slice(0, 12);
    return {dialogCount: dlgs.length, headings, buttons, actionButtons, tables, nav, notice: byHeading(/^Notification$/i), status: byHeading(/^Status$/i), header, descriptions, bodyStart: root.innerText.replace(/\s+/g, ' ').slice(0, 700)};
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
        steps: [...main.querySelectorAll('[role=tab], .pkpSteps__step, [class*="steps__step"], ol li button, ul li button')].filter(vis).map((e) => ({text: e.innerText.trim().replace(/\s+/g, ' '), current: e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') != null || /current/.test(e.className)})).filter((s) => /^\d/.test(s.text)).slice(0, 12),
        headings: [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40),
        buttons: [...main.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || '').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})).filter((b) => b.text).slice(0, 60),
        checkboxes: [...main.querySelectorAll('input[type=checkbox]')].map((i) => ({label: labelOf(i), checked: i.checked, visible: vis(i), name: i.name || null})).slice(0, 40),
        subject: (main.querySelector('input[name="subject"], input[id*="subject" i]') || {}).value || null,
        recipients: [...main.querySelectorAll('[class*="recipient"], [class*="composer__recipients"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 10),
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
async function inbox(app, email) {
    const list = await app.mail.inboxFor(email, {timeout: 6000}).catch(() => []);
    const out = [];
    for (const m of (list || []).slice(0, 12)) {
        const f = await app.mail.fullMessage(m.ID).catch(() => null);
        out.push({id: m.ID, subject: f ? f.Subject : m.Subject, from: f ? f.From : null, to: f ? f.To : null, text: f ? flat(f.Text, 700) : null});
    }
    return out;
}
async function mailFind(app, to, contains, label) {
    try {
        const m = await app.mail.find({to, contains, timeoutMs: 25000});
        const f = await app.mail.fullMessage(m.ID).catch(() => null);
        const out = {found: true, subject: f ? f.Subject : m.Subject, from: f ? f.From : null, to: f ? f.To : null, text: f ? flat(f.Text, 1500) : null};
        record(label, out);
        log(`[${label}]`, out.subject, '|', flat(out.text, 160));
        return out;
    } catch (e) {
        const out = {found: false, error: String(e.message).slice(0, 300), inbox: await inbox(app, to)};
        record(label, out);
        log(`[${label}] NOT FOUND`, out.error, '| inbox subjects:', JSON.stringify(out.inbox.map((m) => m.subject)));
        return out;
    }
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    let curPath = sc.contextPath;   // the assign phase swaps in its own second context
    const ctxUrl = (p) => app.url(`/index.php/${curPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: curPath}); await idle(page); };
    const mail = (u) => `${u}@mail.test`;

    async function waitPanel(page) {
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => {
            const dlgs = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length);
            return dlgs.length > 1 || (dlgs[0] && (dlgs[0].querySelector('nav button, nav a') || /error|Error|not found|access/.test(dlgs[0].innerText)));
        }, null, {timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        await page.waitForTimeout(400); await idle(page);
    }
    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await waitPanel(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)})), ...(extra || {})});
        log(`[${label}]`, app.name, 'url:', page.url().replace(/^.*\/index\.php/, ''), '| header:', flat(info.header, 100), '| actions:', JSON.stringify((info.actionButtons || []).map((b) => `${b.text}${b.primary ? '*' : ''}${b.warnable ? '!' : ''}`)), '| status:', flat(info.status, 80), '| notice:', flat(info.notice, 60), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)), '| headings:', JSON.stringify((info.headings || []).slice(0, 8)), '| dialogs:', JSON.stringify(dialogs.map((d) => d.name)));
        return {info, dialogs, s, url: page.url()};
    }
    async function selectEntry(page, name, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const entry = dlg.locator('nav button, nav a').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)}).first();
        await loc(page, `${label}: the side menu's "${name}"`, entry);
        if (!(await entry.count())) { log(`[${label}] no menu entry "${name}"`); record(label, {absent: true}); return null; }
        await entry.click(); await idle(page);
        await page.waitForTimeout(600); await idle(page);
        const info = await wfInfo(page);
        const s = await snap(page, label, {info, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)}))});
        log(`[${label}]`, 'url:', page.url().replace(/^.*\/index\.php/, ''), '| actions:', JSON.stringify((info.actionButtons || []).map((b) => b.text)), '| status:', flat(info.status, 80), '| notice:', flat(info.notice, 60), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)), '| headings:', JSON.stringify(info.headings.slice(0, 8)));
        return {info, s};
    }
    // Press "Schedule For Publication" / "Post the preprint" in the open Production entry and record the landing (its form fills after idle: settled()).
    async function pressSchedule(page, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const btn = dlg.getByRole('button', {name: /^(Schedule For Publication|Post the preprint)$/}).first();
        await loc(page, `${label}: the schedule shortcut`, btn);
        if (!(await btn.count())) { record(`${label}-schedule`, {absent: true}); log(`[${label} schedule] ABSENT`); return {absent: true}; }
        const text = flat(await btn.innerText(), 40);
        await btn.click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        const form = dlg.locator('form').first();
        await settled(page, form).catch(() => null);
        const info = await wfInfo(page);
        const topRight = await dlg.locator('button, a.pkp_button').evaluateAll((els) => els.filter((b) => b.getClientRects().length).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || '').trim(), x: Math.round(b.getBoundingClientRect().x), y: Math.round(b.getBoundingClientRect().y)})).filter((b) => b.text && b.y < 260).slice(0, 30)).catch(() => []);
        const s = await snap(page, `${label}-schedule-landed`, {info, pressed: text, topRight});
        const out = {pressed: text, url: page.url().replace(/^.*\/index\.php/, ''), headings: info.headings.slice(0, 12), buttons: info.buttons.slice(0, 40), topRight, header: info.header, nav: info.nav.slice(0, 40), dialogs: (await dialogTexts(page)).map((d) => d.name)};
        log(`[${label} schedule]`, JSON.stringify(out).slice(0, 700));
        return out;
    }
    // The legacy three-step upload wizard (already open).
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
        await snap(page, `${label}-after`, {info});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 500), '| notice:', flat(info.notice, 80));
        return info;
    }
    // Upload one file into the nth "Upload/Select Files" list of the Copyediting entry (0 Draft, 1 Copyedited), tick it, OK.
    async function uploadInto(page, nth, file, label) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        await loc(page, `${label}: "Upload/Select Files" nth ${nth}`, btns.nth(nth));
        await btns.nth(nth).click(); await idle(page);
        const win = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
        await win.waitFor({timeout: 30000});
        const up = win.getByRole('link', {name: /Upload File/}).first();
        await up.waitFor({timeout: 30000});
        await idle(page);
        await up.click(); await idle(page);
        await driveWizard(page, file, label);
        const base = path.basename(file);
        await topWin(page).locator(`tr:has-text("${base}")`).first().waitFor({timeout: 15000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const box = topWin(page).locator(`tr:has-text("${base}") input[type=checkbox]`).first();
        if (await box.count()) { await box.check({force: true}); await idle(page); }
        const top = topWin(page);
        let ok = top.getByRole('button', {name: /^(Save|OK|Complete|Done)$/}).last();
        if (!(await ok.count())) ok = top.getByRole('link', {name: /^(Save|OK)$/}).last();
        if (await ok.count()) { await ok.click(); await idle(page); }
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length <= 1, null, {timeout: 15000}).catch(() => {});
        await page.waitForTimeout(600); await idle(page);
        const info = await wfInfo(page);
        await snap(page, `${label}-after`, {info});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 500), '| notice:', flat(info.notice, 80));
        return info;
    }
    // Press a decision button and walk its wizard. opts: {cancelAfterEdit, skipEmail, tickFiles}
    async function runDecision(page, name, label, opts = {}) {
        const btn = page.getByRole('button', {name, exact: true}).first();
        await loc(page, `${label}: "${name}"`, btn);
        await btn.click(); await idle(page);
        await page.waitForURL(/decision/, {timeout: 30000}).catch(() => {});
        await idle(page);
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        const pages = [];
        const readPage = async (n) => {
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page);
            const d = await decisionInfo(page);
            const s = await snap(page, `${label}-page${n}`, {decision: d});
            pages.push({n, url: d.url.replace(/^.*\/index\.php/, ''), steps: d.steps, headings: d.headings, buttons: d.buttons.map((b) => b.text), checkboxes: d.checkboxes, subject: d.subject, recipients: d.recipients});
            log(`[${label} page ${n}]`, 'url:', pages.slice(-1)[0].url, '| steps:', JSON.stringify(d.steps.map((x) => `${x.text}${x.current ? '*' : ''}`)), '| headings:', JSON.stringify(d.headings.slice(0, 5)), '| buttons:', JSON.stringify(d.buttons.map((b) => b.text)), '| subject:', d.subject, '| recipients:', JSON.stringify(d.recipients), '| boxes:', JSON.stringify(d.checkboxes.filter((c) => c.visible).map((c) => `${c.label}${c.checked ? ' [x]' : ' [ ]'}`)));
            return {d, s};
        };
        let {d} = await readPage(1);
        if (opts.cancelAfterEdit) {
            const subj = page.locator('input[name="subject"], input[id*="subject" i]').first();
            if (await subj.count()) { await subj.fill(`${d.subject || ''} edited-${label}`); }
            const cancel = page.getByRole('button', {name: 'Cancel', exact: true}).first();
            await loc(page, `${label}: the wizard's "Cancel"`, cancel);
            await cancel.click(); await idle(page);
            await page.waitForTimeout(800);
            const dl = await dialogTexts(page);
            await snap(page, `${label}-cancel`, {dialogs: dl, url: page.url()});
            log(`[${label} cancel]`, 'dialogs:', JSON.stringify(dl.map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 200)}))));
            const conf = page.locator('[role="dialog"]:visible').last();
            const yes = conf.getByRole('button', {name: /^(OK|Yes|Leave|Confirm|Discard|Cancel Decision)/}).first();
            if (await conf.count() && await yes.count()) { await yes.click(); await idle(page); }
            await waitPanel(page);
            const info = await wfInfo(page).catch(() => ({}));
            await snap(page, `${label}-cancel-landed`, {url: page.url(), info, dialogs: await dialogTexts(page)});
            log(`[${label} cancel landed]`, page.url().replace(/^.*\/index\.php/, ''), '| actions:', JSON.stringify((info.actionButtons || []).map((b) => b.text)));
            return {cancelled: true, pages};
        }
        if (opts.skipEmail) {
            const skip = page.getByRole('button', {name: /Skip this email/i}).first();
            await loc(page, `${label}: "Skip this email"`, skip);
            if (await skip.count()) { await skip.click(); await idle(page); await page.waitForTimeout(500); ({d} = await readPage('1-skipped')); }
        }
        const cont = page.getByRole('button', {name: 'Continue', exact: true});
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        for (let i = 2; i < 8 && !(await rec.isVisible().catch(() => false)); i++) {
            if (!(await cont.count())) break;
            await cont.first().click(); await idle(page);
            ({d} = await readPage(i));
            if (opts.tickFiles) {
                const boxes = page.locator('main input[type=checkbox]:visible');
                const n = await boxes.count();
                for (let k = 0; k < n; k++) { if (!(await boxes.nth(k).isChecked())) await boxes.nth(k).check({force: true}); }
                await idle(page);
                ({d} = await readPage(`${i}-ticked`));
            }
        }
        await loc(page, `${label}: "Record Decision"`, rec);
        await rec.click(); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const done = await decisionInfo(page);
        const doneDialogs = await dialogTexts(page);
        const links = await page.locator('[role="dialog"]:visible a, [role="dialog"]:visible button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => ({tag: e.tagName, text: e.innerText.trim(), href: e.getAttribute('href')}))).catch(() => []);
        await snap(page, `${label}-recorded`, {decision: done, dialogs: doneDialogs, links});
        log(`[${label} recorded]`, 'dialogs:', JSON.stringify(doneDialogs.map((x) => ({name: x.name, text: flat(x.text, 400)}))), '| links:', JSON.stringify(links));
        const dlg = page.locator('[role="dialog"]:visible').first();
        let leave = dlg.getByRole('link', {name: /View|Back|Return|Submission|Dashboard/}).first();
        if (!(await leave.count())) leave = dlg.getByRole('button', {name: /View|Back|Return|Submission|Dashboard|OK|Close/}).first();
        let landed = null;
        if (await leave.count()) {
            const lt = await leave.innerText().catch(() => '');
            await loc(page, `${label}: the completion dialog's way out`, leave);
            await leave.click(); await idle(page);
            await waitPanel(page);
            const info = await wfInfo(page).catch(() => ({}));
            landed = {pressed: lt.trim(), url: page.url().replace(/^.*\/index\.php/, ''), header: info.header, actions: info.actionButtons, nav: info.nav, notice: info.notice, status: info.status, headings: info.headings, tables: (info.tables || []).map((t) => ({name: t.name, rows: t.rows}))};
            await snap(page, `${label}-recorded-landed`, {landed, info, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 800)}))});
            log(`[${label} landed]`, JSON.stringify({pressed: lt.trim(), url: landed.url, header: flat(info.header, 100), actions: (info.actionButtons || []).map((b) => b.text), status: flat(info.status, 80), notice: flat(info.notice, 60), tables: landed.tables.map((t) => `${t.name}:${t.rows.length}`), headings: (info.headings || []).slice(0, 8)}));
        }
        return {pages, done: {headings: done.headings, buttons: done.buttons, dialogs: doneDialogs.map((x) => ({name: x.name, text: flat(x.text, 600)}))}, landed};
    }
    async function activityLog(page, name) {
        const btn = page.getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(name, {absent: true}); log(`[${name}] no Activity Log button`); return null; }
        await btn.click();
        const dlg = page.locator('[role="dialog"]:visible').last();
        await dlg.waitFor({timeout: 30000}).catch(() => {});
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))).catch(() => []);
        await snap(page, name, {rows, dialogText: flat(await dlg.innerText().catch(() => ''), 5000)});
        log(`[${name}]`, JSON.stringify(rows).slice(0, 1200));
        const close = dlg.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return rows;
    }
    // The Participants panel: the row menu of <name> → "Edit" → tick recommendOnly → OK.
    async function setRecommendOnly(page, name, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const row = dlg.locator('li, tr, div').filter({hasText: new RegExp(name)}).filter({has: page.locator('button')}).last();
        const more = row.getByRole('button', {name: /More Actions|Options|Edit/}).first();
        if (!(await more.count())) { record(`${label}-participants-row`, {absent: true}); log(`[${label}] no row menu for ${name}`); return false; }
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-participants-row-menu`, {items});
        const edit = page.getByRole('menuitem', {name: /^Edit/}).first();
        if (!(await edit.count())) return false;
        await edit.click(); await idle(page);
        const form = topWin(page);
        await form.waitFor({timeout: 30000});
        await form.locator('form input[name="recommendOnly"]').waitFor({timeout: 20000}).catch(() => {});
        await settled(page, form.locator('form').first()).catch(() => null);
        await idle(page);
        const box = form.locator('input[name="recommendOnly"]');
        const present = await box.count();
        record(`${label}-participants-edit-form`, {title: (await dialogTexts(page)).slice(-1)[0]?.name, recommendOnlyPresent: present, checked: present ? await box.isChecked() : null});
        if (!present) { await closeAll(page); return false; }
        await box.check();
        const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
        await ok.click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        const rows = await dlg.locator('[class*="participant"], li').evaluateAll((els) => els.filter((e) => e.getClientRects().length && /recommend/i.test(e.innerText)).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200))).catch(() => []);
        record(`${label}-participants-after-save`, {rows, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 400)}))});
        log(`[${label}] recommend-only saved; rows:`, JSON.stringify(rows).slice(0, 300));
        return true;
    }
    // The Participants "Assign" form on the open entry: groups, optionally pick a group/user/template, read the message prefill, save.
    async function assignForm(page, label, {group, user, template, keep} = {}) {
        const assign = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /^Assign$/}).first();
        if (!(await assign.count())) { record(`${label}-assign-form`, {absent: true}); log(`[${label}] no Assign button`); return {absent: true}; }
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
        log(`[${label} assign]`, JSON.stringify(out.groups), out.templates ? `| templates: ${JSON.stringify(out.templates)}` : '', out.message ? `| message: ${flat(out.message, 200)}` : '');
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

    // ---- Settings › Users & Roles › Roles ----
    async function gotoRoles(page) {
        await page.goto(ctxUrl('/management/settings/access')); await idle(page);
        const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
        if (await rolesTab.count()) await rolesTab.click();
        await idle(page);
        await page.locator('tr.gridRow').first().waitFor({timeout: 30000}).catch(() => {});
    }
    async function rolesGrid(page, label) {
        await gotoRoles(page);
        const s = await screen(page);
        s.rows = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => ({text: e.innerText.replace(/\s+/g, ' ').trim(), hasArrow: !!e.querySelector('a.show_extras')})));
        s.columns = await page.locator('table thead th').evaluateAll((els) => els.map((e) => e.innerText.trim())).catch(() => []);
        record(label, s);
        await shot(page, label).catch(() => {});
        return s.rows;
    }
    // The Roles grid's own stage columns: every row's boxes (checked, disabled) per column header.
    async function rolesGridMatrix(page, label) {
        await gotoRoles(page);
        const m = await page.evaluate(() => {
            const table = [...document.querySelectorAll('table')].find((t) => [...t.querySelectorAll('thead th')].some((th) => /Role Name/.test(th.innerText)));
            if (!table) return null;
            const cols = [...table.querySelectorAll('thead th')].map((th) => th.innerText.trim());
            const rows = [...table.querySelectorAll('tbody tr.gridRow')].map((tr) => {
                const cells = [...tr.querySelectorAll('td')];
                return {name: (cells[0] || {}).innerText?.trim().replace(/\s+/g, ' ').replace(/^Settings\s+/, ''), level: (cells[1] || {}).innerText?.trim(), boxes: cells.slice(2).map((td, i) => { const b = td.querySelector('input[type=checkbox]'); return b ? `${cols[i + 2]}${b.checked ? ' [x]' : ' [ ]'}${b.disabled ? ' (disabled)' : ''}` : `${cols[i + 2]} —`; })};
            });
            return {cols, rows};
        });
        record(label, m);
        await shot(page, label).catch(() => {});
        log(`[${label}]`, JSON.stringify(m && m.rows.map((r) => `${r.name} (${r.level}): ${r.boxes.join(', ')}`)));
        return m;
    }
    // The sweep: press a stage box IN the grid (not the Edit form), record what happens, read the grid and the Edit form back, then press it again.
    async function gridTick(page, roleName, col, label) {
        const out = {role: roleName, col};
        for (const step of ['tick', 'untick']) {
            await gotoRoles(page);
            const before = await rolesGridMatrix(page, `${label}-${step}-before`);
            const idx = before.cols.indexOf(col);
            const row = page.locator('tr.gridRow').filter({has: page.locator('td').first().filter({hasText: new RegExp(`(^|\\s)${roleName}\\s*$`)})}).first();
            const box = row.locator('td').nth(idx).locator('input[type=checkbox]');
            await loc(page, `${label}: the grid's ${col} box of ${roleName}`, box);
            const r = {present: await box.count(), disabled: (await box.count()) ? await box.isDisabled() : null, checkedBefore: (await box.count()) ? await box.isChecked() : null};
            if (!r.present || r.disabled) { out[step] = r; continue; }
            const seen = [];
            const onResp = (resp) => { if (/user-group|userGroup|roles|settings/i.test(resp.url())) seen.push({method: resp.request().method(), status: resp.status(), url: resp.url().replace(/^.*\/index\.php/, '').slice(0, 160)}); };
            page.on('response', onResp);
            await box.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
            page.off('response', onResp);
            r.checkedAfterClick = await box.isChecked().catch(() => null);
            r.requests = seen;
            r.statuses = await page.locator('[role="status"]:visible, .pkp_notification:visible, [class*="notif"]:visible').allInnerTexts().catch(() => []);
            r.dialogs = (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}));
            await snap(page, `${label}-${step}-clicked`, {r});
            const after = await rolesGridMatrix(page, `${label}-${step}-reloaded`);
            r.rowAfterReload = (after.rows.find((x) => x.name === roleName) || {}).boxes;
            const i = after.rows.findIndex((x) => x.name === roleName);
            const form = await openRoleEditByIndex(page, i);
            if (form) { const f = await readRoleForm(page, form); r.editFormStages = f.stages.map((x) => `${x.label || x.value}${x.checked ? ' [x]' : ' [ ]'}`); await closeAll(page); }
            out[step] = r;
            log(`[${label} ${step}]`, JSON.stringify(r).slice(0, 900));
        }
        record(`${label}-summary`, out);
        return out;
    }
    // Open row i's "Edit" (the arrow, then the link in the next row); returns the form or null (no arrow).
    async function openRoleEditByIndex(page, i) {
        const row = page.locator('tr.gridRow').nth(i);
        const arrow = row.locator('a.show_extras');
        if (!(await arrow.count())) return null;
        await arrow.click(); await idle(page);
        const edit = page.getByRole('link', {name: 'Edit', exact: true}).last();
        if (!(await edit.count())) return null;
        await edit.click();
        const form = page.locator('form#userGroupForm');
        await form.waitFor({state: 'visible', timeout: 30000});
        await form.locator('input[name="assignedStages[]"]').first().waitFor({state: 'attached', timeout: 15000}).catch(() => {});
        await idle(page);
        return form;
    }
    const readRoleForm = async (page, form) => ({
        title: (await dialogTexts(page)).slice(-1)[0]?.name || null,
        stagesHeading: await form.locator('legend, label, h3, h4, .section > label').evaluateAll((els) => els.map((e) => e.innerText.trim()).find((t) => /Stage/i.test(t)) || null).catch(() => null),
        stages: await form.locator('input[name="assignedStages[]"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim()}))).catch(() => []),
        name: await form.locator('input[name^="name"]').first().inputValue().catch(() => null),
        fields: await form.locator('input:not([type=hidden]), select').evaluateAll((els) => els.map((e) => ({type: e.type, name: e.name, value: e.type === 'checkbox' || e.type === 'radio' ? e.checked : (e.value || '').slice(0, 60), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 60)}))).catch(() => []),
        buttons: await form.locator('button:visible, a.pkp_button:visible, input[type=submit]:visible, a:visible').evaluateAll((els) => els.map((e) => (e.innerText || e.value || '').trim()).filter(Boolean).slice(0, 20)).catch(() => []),
    });
    // Every role's "Stage Assignment" boxes, one Edit window per row.
    async function allRoleStages(page, label) {
        const rows = await rolesGrid(page, `${label}-roles-grid`);
        const out = [];
        for (let i = 0; i < rows.length; i++) {
            await gotoRoles(page);
            const form = await openRoleEditByIndex(page, i);
            if (!form) { out.push({row: rows[i].text, edit: 'none'}); continue; }
            const r = await readRoleForm(page, form);
            out.push({row: rows[i].text, title: r.title, name: r.name, stagesHeading: r.stagesHeading, stages: r.stages.map((x) => `${x.label || x.value}${x.checked ? ' [x]' : ' [ ]'}`), production: (r.stages.find((x) => x.value === '5') || {}).checked ?? null});
            if (i === 1) await snap(page, `${label}-role-edit-form`, {form: r});
            await closeAll(page);
        }
        record(`${label}-role-stages`, out);
        log(`[${label} role stages]`, JSON.stringify(out.map((o) => `${flat(o.row, 40)} → Production ${o.production === null ? '(no edit)' : o.production ? 'ON' : 'off'}`)));
        return out;
    }
    // Flip Production (value 5) on the named role and save; read back.
    async function flipRoleProduction(page, roleName, label) {
        const rows = await rolesGrid(page, `${label}-grid-before`);
        const i = rows.findIndex((r) => new RegExp(`(^|\\s)${roleName}\\s`, 'i').test(r.text + ' '));
        if (i < 0) { record(label, {role: roleName, row: 'absent', rows: rows.map((r) => r.text)}); log(`[${label}] no row for ${roleName}`); return null; }
        const form = await openRoleEditByIndex(page, i);
        if (!form) { record(label, {role: roleName, edit: 'none'}); return null; }
        const before = await readRoleForm(page, form);
        const box = form.locator('input[name="assignedStages[]"][value="5"]');
        const was = await box.isChecked();
        if (was) await box.uncheck(); else await box.check();
        const saveBtn = form.getByRole('button', {name: /^(Save|OK)$/}).last();
        await loc(page, `${label}: the Roles "Edit" form's save`, saveBtn);
        await saveBtn.click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        const afterSave = {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)})), statuses: await page.locator('[role="status"]:visible').allInnerTexts().catch(() => [])};
        await closeAll(page);
        await gotoRoles(page);
        const f2 = await openRoleEditByIndex(page, i);
        const after = f2 ? await readRoleForm(page, f2) : null;
        await closeAll(page);
        const out = {role: roleName, productionBefore: was, productionAfter: after ? (after.stages.find((x) => x.value === '5') || {}).checked : null, afterSave, stagesAfter: after ? after.stages.map((x) => `${x.label || x.value}${x.checked ? ' [x]' : ' [ ]'}`) : null};
        record(label, out);
        log(`[${label}]`, roleName, 'Production', was ? 'ON→off' : 'off→ON', '| read back:', out.productionAfter, '| after save:', JSON.stringify(afterSave).slice(0, 200));
        return out;
    }
    // Settings › Workflow › Emails › Manage Emails: find templates by name; optionally edit one's subject.
    async function manageEmails(page, names, label, {editSubjectPrefix, editName} = {}) {
        await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
        const tab = page.getByRole('tab', {name: 'Emails', exact: true}).or(page.locator('#emails-button')).first();
        if (await tab.count()) { await tab.click(); await idle(page); }
        await snap(page, `${label}-workflow-emails-tab`);
        await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
        const main = page.locator('main');
        await main.locator('.listPanel__item').first().waitFor({timeout: 30000}).catch(() => {});
        const out = {url: page.url().replace(/^.*\/index\.php/, ''), heading: flat(await page.locator('h1').first().innerText().catch(() => ''), 100), templates: {}};
        for (const name of names) {
            const search = main.getByRole('searchbox', {name: /Search by name or description/}).or(main.locator('input[type="search"]')).first();
            await search.fill(name); await search.press('Enter'); await idle(page);
            await page.waitForFunction((n) => [...document.querySelectorAll('.listPanel__item')].some((i) => i.innerText.includes(n)) || document.body.innerText.includes('No items'), name, {timeout: 10000}).catch(() => {});
            await idle(page);
            const items = await main.locator('.listPanel__item').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)));
            // the item whose first line IS the name (a substring filter would take "Reinstate Submission Declined…" for "Submission Declined")
            const item = main.locator('.listPanel__item').filter({has: page.locator('h3, h4, .listPanel__itemTitle, [class*="itemTitle"]', {hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)})}).first();
            const present = (await item.count()) > 0;
            const t = {present, listed: items, listText: present ? flat(await item.innerText(), 500) : null};
            if (present) {
                const editBtn = item.getByRole('button', {name: /^Edit/}).first();
                if (await editBtn.count()) {
                    await editBtn.click(); await idle(page);
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('button, input:not([type=hidden])'); }, null, {timeout: 20000}).catch(() => {});
                    await idle(page); await page.waitForTimeout(400);
                    const outer = (await dialogTexts(page)).slice(-1)[0];
                    t.mailableWindow = {title: outer && outer.name, text: flat(outer && outer.text, 700), buttons: outer && outer.buttons};
                    const inner = topWin(page).getByRole('button', {name: /^Edit$/}).first();
                    if (await inner.count()) {
                        await inner.click(); await idle(page);
                        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[name="subject"], input[id*="subject" i], input[name^="subject"]'); }, null, {timeout: 20000}).catch(() => {});
                        await idle(page); await page.waitForTimeout(400);
                    }
                    t.window = {title: (await dialogTexts(page)).slice(-1)[0]?.name, fields: await topWin(page).locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, value: (e.value || '').slice(0, 300), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 80)})))};
                    t.window.body = await page.evaluate(() => { const ed = window.tinymce && window.tinymce.activeEditor; return ed ? ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 600) : null; }).catch(() => null);
                    await shot(page, `${label}-email-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`).catch(() => {});
                    if (editSubjectPrefix && name === editName) {
                        const subj = topWin(page).locator('input[name="subject"], input[id*="subject" i], input[name^="subject"]').first();
                        if (await subj.count() && !(await subj.inputValue()).startsWith(editSubjectPrefix)) {
                            const old = await subj.inputValue();
                            await subj.fill(`${editSubjectPrefix} ${old}`);
                            const saveBtn = topWin(page).getByRole('button', {name: /^Save$/}).first();
                            await saveBtn.click(); await idle(page);
                            await page.waitForTimeout(1000); await idle(page);
                            t.edited = {newSubject: `${editSubjectPrefix} ${old}`, dialogsAfter: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}))};
                        } else t.edited = {noSubjectField: !(await subj.count()), alreadyEdited: true};
                    }
                    await closeAll(page);
                }
            }
            out.templates[name] = t;
            log(`[${label} emails] "${name}"`, present ? 'present' : 'ABSENT', t.window ? `| subject: ${JSON.stringify((t.window.fields || []).find((f) => /subject/i.test(f.name || f.label))?.value)}` : '', t.edited ? `| edited ${JSON.stringify(t.edited).slice(0, 160)}` : '', present ? '' : `| listed: ${JSON.stringify(items.slice(0, 6))}`);
        }
        record(`${label}-manage-emails`, out);
        return out;
    }
    // Settings › Workflow › "Tasks and Discussions": the "Production Stage" group as data; optionally open a template's Edit window and prefix its body.
    async function taskTemplates(page, label, {open, editPrefix} = {}) {
        await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
        const tab = page.getByRole('tab', {name: /Tasks and Discussions|Tasks & Discussions/}).first();
        const out = {tabPresent: (await tab.count()) > 0, tabs: await page.getByRole('tab').allInnerTexts().catch(() => [])};
        if (!out.tabPresent) { record(`${label}-task-templates`, out); log(`[${label}] no Tasks and Discussions tab`); return out; }
        await tab.click(); await idle(page);
        await page.waitForFunction(() => /Production/.test(document.body.innerText) || document.body.innerText.includes('No items'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const s = await snap(page, `${label}-task-templates-tab`);
        out.mainText = flat(s.text && s.text.main, 4000);
        const main = page.locator('main');
        // Group headings and the rows under each (a legacy grid or a Vue table: read the text between headings).
        out.groups = await main.evaluate((m) => {
            const vis = (e) => e.getClientRects().length > 0;
            const hs = [...m.querySelectorAll('h2,h3,h4,caption,[class*="gridCategory"], tr.category, .pkpTable__caption')].filter(vis);
            return hs.map((h) => ({heading: h.innerText.trim().replace(/\s+/g, ' ').slice(0, 80)}));
        }).catch(() => []);
        out.tables = await main.locator('table').evaluateAll((els) => els.filter((t) => t.getClientRects().length).map((t) => ({
            caption: (t.querySelector('caption') || {}).innerText?.trim() || t.getAttribute('aria-label') || null,
            head: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
            rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
        }))).catch(() => []);
        // Rows of the Production group: the rows between the "Production" heading text and the next stage heading in main's innerText.
        const text = (s.text && s.text.main) || '';
        const m = text.match(/Production Stage[\s\S]*?(?=(Submission Stage|Review Stage|Internal Review Stage|External Review Stage|Copyediting Stage|$))/);
        out.productionGroupText = m ? flat(m[0], 1500) : null;
        // Every template of the "Production Stage" group: its Edit window's boxes (the auto-add box is the claim's axis).
        const prodRows = await main.evaluate(() => {
            const vis = (e) => e.getClientRects().length > 0;
            const rows = [...document.querySelectorAll('main tr')].filter(vis);
            const out = []; let inProd = false;
            for (const tr of rows) {
                const t = tr.innerText.trim().replace(/\s+/g, ' ');
                if (/Stage$/.test(t) || /^(Submission|Review|Internal Review|External Review|Copyediting|Production) Stage/.test(t)) { inProd = /^Production Stage/.test(t); continue; }
                if (inProd && t && !/^Add template/i.test(t) && !/^Name /.test(t)) out.push(t.slice(0, 120));
            }
            return out;
        }).catch(() => []);
        out.productionRows = prodRows;
        const openRow = async (name) => {
            const row = main.locator('tr').filter({hasText: name}).first();
            if (!(await row.count())) return null;
            const more = row.getByRole('button', {name: /More Actions|Options/}).first();
            let rowMenu = null;
            if (await more.count()) { await more.click(); await idle(page); rowMenu = (await menuItems(page)).map((x) => x.text); const edit = page.getByRole('menuitem', {name: /^Edit/}).first(); if (await edit.count()) { await edit.click(); await idle(page); } }
            else { const edit = row.getByRole('button', {name: /^Edit/}).first(); if (await edit.count()) { await edit.click(); await idle(page); } }
            await topWin(page).waitFor({timeout: 20000}).catch(() => {});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input:not([type=hidden]), textarea, .tox'); }, null, {timeout: 20000}).catch(() => {});
            await idle(page); await page.waitForTimeout(600);
            const w = (await dialogTexts(page)).slice(-1)[0];
            return {rowText: flat(await row.innerText(), 300), rowMenu, window: {title: w && w.name, text: flat(w && w.text, 1500), buttons: w && w.buttons,
                fields: await topWin(page).locator('input:visible, textarea:visible, select:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, type: e.type, value: e.type === 'checkbox' ? e.checked : (e.value || '').slice(0, 200), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 120)}))),
                body: await page.evaluate(() => { const ed = window.tinymce && window.tinymce.activeEditor; return ed ? ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 600) : null; }).catch(() => null)}};
        };
        out.templates = {};
        const names = prodRows.map((t) => t.replace(/\s*\b(More Actions|Edit|Delete)\b.*$/, '').trim()).filter(Boolean);
        for (const n of names) {
            const r = await openRow(n).catch((e) => ({error: String(e.message).slice(0, 200)}));
            if (r && r.window) { const auto = (r.window.fields || []).find((f) => /Automatically add/i.test(f.label)); r.autoAdd = auto ? auto.value : 'no box'; }
            out.templates[n] = r;
            await closeAll(page);
        }
        if (open) {
            const r = await openRow(open);
            out.open = {name: open, present: !!r, ...(r || {})};
            if (r) {
                await shot(page, `${label}-task-template-window`).catch(() => {});
                if (editPrefix && !(r.window.body || '').startsWith(editPrefix)) {
                    const changed = await page.evaluate((p) => { const ed = window.tinymce && window.tinymce.activeEditor; if (!ed) return false; ed.setContent(`<p>${p}</p>` + ed.getContent()); ed.fire('change'); ed.fire('input'); ed.save(); return true; }, editPrefix).catch(() => false);
                    const saveBtn = topWin(page).getByRole('button', {name: /^Save$/}).first();
                    out.open.edited = {changed, saveButton: (await saveBtn.count()) > 0};
                    if (changed && (await saveBtn.count())) {
                        await saveBtn.click(); await idle(page); await page.waitForTimeout(1000); await idle(page);
                        out.open.edited.dialogsAfter = (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}));
                    }
                } else if (editPrefix) out.open.edited = {alreadyEdited: true};
                await closeAll(page);
            }
        }
        record(`${label}-task-templates`, out);
        log(`[${label} task templates]`, 'production rows:', JSON.stringify(out.productionRows), '| auto-add:', JSON.stringify(Object.fromEntries(Object.entries(out.templates).map(([k, v]) => [k, v && v.autoAdd]))), out.open ? `| window "${out.open.window?.title}" fields ${JSON.stringify((out.open.window?.fields || []).map((f) => `${f.label || f.name}=${f.value}`))} ${JSON.stringify(out.open.edited || '')}` : '');
        return out;
    }

    // ================= OPS: the control reads and the settings =================
    if (isOPS) {
        if (!on('ops') && !on('grid') && !on('gridtick')) return;
        if (!sc.contextPath) {
            const t = tag('u33k3');
            const users = [
                {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: `${t}mod`, roles: ['sectionEditor'], givenName: 'Mo', familyName: 'Moderator'},
                {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            ];
            const ctx = await app.api.createContext({tag: t, context: {name: `U33 K3 ${t}`, acronym: 'U33K3', contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.users = {mgr: `${t}mgr`, mod: `${t}mod`, au: `${t}au`}; sc.subs = {};
            const seeds = {
                q1: {title: `K3 Q1 queued ${t}`, participants: [{username: sc.users.mod, role: 'sectionEditor'}]},
                q3: {title: `K3 Q3 posted ${t}`, published: true, participants: [{username: sc.users.mod, role: 'sectionEditor'}]},
                d1: {title: `K3 D1 declined ${t}`, decisions: ['decline'], participants: [{username: sc.users.mod, role: 'sectionEditor'}]},
            };
            for (const [k, spec] of Object.entries(seeds)) {
                try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: sc.users.au, ...spec}); sc.subs[k] = {id: r.submissionId, stageId: r.stageId, status: r.status, title: spec.title}; }
                catch (e) { sc.subs[k] = {error: String(e.message).slice(0, 600)}; log(`[seed ${k} FAILED]`, sc.subs[k].error); }
            }
            save();
        }
        record('seed', sc);
        curPath = sc.contextPath;
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            const out = {};
            for (const k of (on('ops') ? ['q1', 'q3', 'd1'] : [])) {
                if (!sc.subs[k] || !sc.subs[k].id) continue;
                await sect(`ops ${k}`, async () => {
                    const land = await openWorkflow(page, workflow(sc.subs[k].id), `${k}-mgr-landing`);
                    const prod = await openWorkflow(page, workflow(sc.subs[k].id, 'workflow_5'), `${k}-mgr-production`);
                    out[k] = {seed: sc.subs[k], landing: {url: land.url.replace(/^.*\/index\.php/, ''), header: land.info.header}, production: {url: prod.url.replace(/^.*\/index\.php/, ''), header: prod.info.header, actions: prod.info.actionButtons, buttons: prod.info.buttons.slice(0, 25), status: prod.info.status, headings: prod.info.headings, tables: (prod.info.tables || []).map((t) => t.name), nav: prod.info.nav}};
                    if (k === 'q1') out[k].schedule = await pressSchedule(page, 'q1-mgr');
                });
            }
            if (on('grid')) await sect('ops grid', async () => { out.grid = await rolesGridMatrix(page, 'mgr-roles-grid-matrix'); });
            if (on('gridtick')) await sect('ops gridtick', async () => { out.gridTick = await gridTick(page, 'Editorial Board Member', 'Production', 'mgr-gridtick-ebm'); });
            if (!on('ops')) { record('ops-grid-summary', out); await signOut(page); return; }
            await sect('ops roles', async () => { out.roles = await allRoleStages(page, 'mgr'); });
            await sect('ops emails', async () => { out.emails = await manageEmails(page, ['Submission Declined', 'Reinstate Submission Declined Without Review', 'Submission Moved to Copyediting', 'Moved to Copyediting'], 'mgr'); });
            await sect('ops tasks', async () => { out.tasks = await taskTemplates(page, 'mgr', {open: 'Assign Editor'}); });
            record('ops-summary', out);
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ================= OJS / OMP =================
    const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Sela', 'Deciding'], ['se2', 'sectionEditor', 'Rec', 'Recommender'], ['le', 'layoutEditor', 'Lena', 'Layout'], ['ce', 'copyeditor', 'Cora', 'Copyeditor'], ['au', 'author', 'Ava', 'Author']];
    if (on('seed') && !sc.contextPath) {
        const t = tag('u33k3');
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U33 K3 ${t}`, acronym: 'U33K3', contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.roleKeys = Object.fromEntries(roleUsers.map(([k, role]) => [k, role]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        const u = sc.users; const part = (k) => ({username: u[k], role: sc.roleKeys[k]});
        const dec = ['skipExternalReview', 'sendToProduction'];
        const seeds = {
            p1: {title: `K3 P1 move to copyediting ${t}`, decisions: dec, participants: [part('se'), part('se2'), part('le')]},
            p2: {title: `K3 P2 published ${t}`, decisions: dec, published: true, participants: [part('se'), part('le')]},
            p3: {title: `K3 P3 stage gate ${t}`, decisions: dec, participants: [part('se'), part('ce'), part('le')]},
            p4: {title: `K3 P4 skip email ${t}`, decisions: dec, participants: [part('se')]},
        };
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, stageId: r.stageId, status: r.status, title: spec.title}; }
            catch (e) { sc.subs[k] = {error: String(e.message).slice(0, 600)}; log(`[seed ${k} FAILED]`, sc.subs[k].error); }
        }
        save();
    }
    record('seed', sc);
    curPath = sc.contextPath;
    const u = sc.users || {}; const S = sc.subs || {}; const N = sc.names || {};
    if (!sc.contextPath) { log('[no context] nothing to drive'); return; }

    // ---- Rule 6: the shortcut as le (assistant) and se2 (recommend-only sub-editor) on P1; the manager too ----
    if (on('schedule') && S.p1 && S.p1.id) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await sect('recommend-only se2', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-mgr-production');
                out.se2RecommendOnly = await setRecommendOnly(page, N.se2, 'p1-mgr-se2');
                out.mgrSchedule = await pressSchedule(page, 'p1-mgr');
            });
            for (const k of ['le', 'se2']) {
                await sect(`schedule ${k}`, async () => {
                    await signInAs(page, u[k]);
                    const r = await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), `p1-${k}-production`);
                    out[`${k}Entry`] = {actions: r.info.actionButtons, buttons: r.info.buttons.slice(0, 25), headings: r.info.headings};
                    out[`${k}Schedule`] = await pressSchedule(page, `p1-${k}`);
                });
            }
            record('schedule-summary', out);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- Rule 8: P2 (published, Done) as mgr, se, le ----
    if (on('published') && S.p2 && S.p2.id) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            for (const k of ['mgr', 'se', 'le']) {
                await sect(`published ${k}`, async () => {
                    await signInAs(page, u[k]);
                    const land = await openWorkflow(page, workflow(S.p2.id), `p2-${k}-landing`);
                    const r = await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), `p2-${k}-production`);
                    out[k] = {landing: {url: land.url.replace(/^.*\/index\.php/, ''), header: land.info.header, headings: land.info.headings.slice(0, 8)}, production: {url: r.url.replace(/^.*\/index\.php/, ''), header: r.info.header, actions: r.info.actionButtons, buttons: r.info.buttons.slice(0, 30), status: r.info.status, notice: r.info.notice, headings: r.info.headings, descriptions: r.info.descriptions, tables: (r.info.tables || []).map((t) => `${t.name}:${t.rows.length}`), nav: r.info.nav}};
                    if (k === 'mgr') out[k].schedule = await pressSchedule(page, 'p2-mgr');
                });
            }
            record('published-summary', out);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- Stage Assignment gate (lines 309–313): P3 as ce (unticked by default) and le (ticked); flip both, reread, flip back ----
    if (on('roles') && S.p3 && S.p3.id) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            const readGate = async (phase) => {
                for (const k of ['ce', 'le']) {
                    await sect(`gate ${phase} ${k}`, async () => {
                        await signInAs(page, u[k]);
                        const r = await openWorkflow(page, workflow(S.p3.id, 'workflow_5'), `p3-${k}-production-${phase}`);
                        out[`${phase}-${k}`] = {url: r.url.replace(/^.*\/index\.php/, ''), header: r.info.header, actions: r.info.actionButtons, buttons: r.info.buttons.slice(0, 25), status: r.info.status, headings: r.info.headings, tables: (r.info.tables || []).map((t) => t.name), bodyStart: r.info.bodyStart, dialogs: r.dialogs.map((d) => ({name: d.name, text: flat(d.text, 300)}))};
                    });
                }
                await sect(`gate ${phase} assign form`, async () => {
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.p3.id, 'workflow_5'), `p3-mgr-production-${phase}`);
                    out[`${phase}-assignGroups`] = (await assignForm(page, `p3-mgr-${phase}`)).groups;
                });
            };
            await readGate('default');
            await sect('flip roles', async () => {
                await signInAs(page, u.mgr);
                out.flipCopyeditorOn = await flipRoleProduction(page, 'Copyeditor', 'mgr-role-copyeditor-on');
                out.flipLayoutOff = await flipRoleProduction(page, 'Layout Editor', 'mgr-role-layout-editor-off');
            });
            await readGate('flipped');
            await sect('flip roles back', async () => {
                await signInAs(page, u.mgr);
                out.flipCopyeditorBack = await flipRoleProduction(page, 'Copyeditor', 'mgr-role-copyeditor-back');
                out.flipLayoutBack = await flipRoleProduction(page, 'Layout Editor', 'mgr-role-layout-editor-back');
            });
            await readGate('restored');
            record('roles-gate-summary', out);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- Rules 7, 7a, 7b, A3, Side effects: P1 as se ----
    if (on('move') && S.p1 && S.p1.id) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await signInAs(page, u.se);
            await sect('p1 upload production ready', async () => {
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-se-production-before');
                out.uploadBefore = await uploadProductionReady(page, PDF, 'p1-se-prf-upload');
            });
            await sect('p1 move cancel', async () => {
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-se-production-reland');
                out.cancel = await runDecision(page, 'Move To Copyediting', 'p1-se-move-cancel', {cancelAfterEdit: true});
            });
            await sect('p1 move', async () => {
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-se-production-reland2');
                out.move = await runDecision(page, 'Move To Copyediting', 'p1-se-move');
            });
            await sect('p1 after move reads', async () => {
                const land = await openWorkflow(page, workflow(S.p1.id), 'p1-se-after-move-landing');
                out.afterLanding = {url: land.url.replace(/^.*\/index\.php/, ''), header: land.info.header};
                const ce = await openWorkflow(page, workflow(S.p1.id, 'workflow_4'), 'p1-se-after-move-copyediting');
                out.copyediting = {header: ce.info.header, actions: ce.info.actionButtons, buttons: ce.info.buttons.slice(0, 25), notice: ce.info.notice, status: ce.info.status, headings: ce.info.headings, descriptions: ce.info.descriptions, tables: (ce.info.tables || []).map((t) => ({name: t.name, rows: t.rows}))};
                const pr = await selectEntry(page, 'Production', 'p1-se-after-move-production');
                out.production = pr ? {actions: pr.info.actionButtons, buttons: pr.info.buttons.slice(0, 25), status: pr.info.status, notice: pr.info.notice, headings: pr.info.headings, tables: (pr.info.tables || []).map((t) => t.name), bodyStart: pr.info.bodyStart} : null;
                out.log = await activityLog(page, 'p1-se-after-move-activity-log');
                out.mail = await mailFind(app, mail(u.au), 'copyediting', 'p1-au-mail-moved');
                out.mgrView = null;
            });
            await sect('p1 mgr copyediting read', async () => {
                await signInAs(page, u.mgr);
                const ce = await openWorkflow(page, workflow(S.p1.id, 'workflow_4'), 'p1-mgr-after-move-copyediting');
                out.mgrCopyediting = {actions: ce.info.actionButtons, notice: ce.info.notice, status: ce.info.status, headings: ce.info.headings};
            });
            await sect('p1 copyedited upload and send again', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.p1.id, 'workflow_4'), 'p1-se-copyediting-reland');
                out.copyeditedUpload = await uploadInto(page, 1, MD, 'p1-se-copyedited-upload');
                out.sendAgain = await runDecision(page, 'Send To Production', 'p1-se-send-again', {tickFiles: true});
                const pr = await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-se-production-again');
                out.productionAgain = {header: pr.info.header, actions: pr.info.actionButtons, notice: pr.info.notice, status: pr.info.status, headings: pr.info.headings, tables: (pr.info.tables || []).map((t) => ({name: t.name, columns: t.columns, rows: t.rows}))};
                const ce = await selectEntry(page, 'Copyediting', 'p1-se-copyediting-after-send-again');
                out.copyeditingAgain = ce ? {actions: ce.info.actionButtons, notice: ce.info.notice, status: ce.info.status, headings: ce.info.headings, tables: (ce.info.tables || []).map((t) => ({name: t.name, rows: t.rows}))} : null;
            });
            record('move-summary', out);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- A3 on the review path: P6 accepted from a review round (the Copyediting notice existed), sent to production, then moved back ----
    if (on('a3')) {
        if (!S.p6) {
            try { const r = await app.api.createSubmission({tag: `${sc.tag}p6`, context: sc.contextPath, submitter: u.au, title: `K3 P6 review path ${sc.tag}`, decisions: ['sendExternalReview', 'accept', 'sendToProduction'], participants: [{username: u.se, role: 'sectionEditor'}]}); S.p6 = {id: r.submissionId, stageId: r.stageId, status: r.status}; }
            catch (e) { S.p6 = {error: String(e.message).slice(0, 600)}; log('[seed p6 FAILED]', S.p6.error); }
            sc.subs = S; save();
        }
        if (S.p6 && S.p6.id) {
            const {page, close} = await launch(app);
            try {
                const out = {};
                await signInAs(page, u.se);
                await sect('a3 before', async () => {
                    const ce = await openWorkflow(page, workflow(S.p6.id, 'workflow_4'), 'p6-se-copyediting-at-production');
                    out.copyeditingAtProduction = {notice: ce.info.notice, status: ce.info.status, headings: ce.info.headings};
                    const pr = await openWorkflow(page, workflow(S.p6.id, 'workflow_5'), 'p6-se-production');
                    out.production = {notice: pr.info.notice, status: pr.info.status, headings: pr.info.headings, actions: pr.info.actionButtons};
                });
                await sect('a3 move', async () => {
                    out.move = await runDecision(page, 'Move To Copyediting', 'p6-se-move-skip', {skipEmail: true});
                    const ce = await openWorkflow(page, workflow(S.p6.id, 'workflow_4'), 'p6-se-copyediting-after-move');
                    out.copyeditingAfterMove = {notice: ce.info.notice, status: ce.info.status, headings: ce.info.headings, actions: ce.info.actionButtons, descriptions: ce.info.descriptions};
                    await signInAs(page, u.mgr);
                    const m = await openWorkflow(page, workflow(S.p6.id, 'workflow_4'), 'p6-mgr-copyediting-after-move');
                    out.mgrCopyeditingAfterMove = {notice: m.info.notice, status: m.info.status, headings: m.info.headings};
                });
                record('a3-summary', out);
                await signOut(page);
            } finally { await close(); }
        }
    }

    // ---- The Roles grid's own stage columns (mgr) ----
    if (on('grid')) {
        const {page, close} = await launch(app);
        try { await signInAs(page, u.mgr); await sect('grid', async () => { await rolesGridMatrix(page, 'mgr-roles-grid-matrix'); }); await signOut(page); } finally { await close(); }
    }
    if (on('gridtick')) {
        const {page, close} = await launch(app);
        try { await signInAs(page, u.mgr); await sect('gridtick', async () => { await gridTick(page, 'Copyeditor', 'Production', 'mgr-gridtick-copyeditor'); }); await signOut(page); } finally { await close(); }
    }

    // ---- Settings (mgr): every role's Stage Assignment; the email template (read, then the subject edited); the task templates (read, "Ready for Production" body prefixed) ----
    if (on('settings')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await signInAs(page, u.mgr);
            await sect('roles all', async () => { out.roles = await allRoleStages(page, 'mgr'); });
            await sect('emails', async () => { out.emails = await manageEmails(page, ['Submission Moved to Copyediting', 'Submission Declined', 'Submission Declined (Pre-Review)', 'Reinstate Submission Declined Without Review'], 'mgr', {editSubjectPrefix: 'K3EDIT', editName: 'Submission Moved to Copyediting'}); });
            await sect('tasks', async () => { out.tasks = await taskTemplates(page, 'mgr'); });
            record('settings-summary', out);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- The edited task template's body on the Assign form and the assignee's mail subject: a second context (its Layout Editor is assigned to nothing) ----
    if (on('assign')) {
        if (!sc.ctx2) {
            const t = tag('u33k3b');
            const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}, {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Seb', familyName: 'Deciding'}, {username: `${t}le`, roles: ['layoutEditor'], givenName: 'Liv', familyName: 'Layoutist'}, {username: `${t}au`, roles: ['author'], givenName: 'Abe', familyName: 'Author'}];
            const ctx = await app.api.createContext({tag: t, context: {name: `U33 K3b ${t}`, acronym: 'U33K3B', contactName: 'K3b Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.ctx2 = {tag: t, contextPath: ctx.path || t, users: {mgr: `${t}mgr`, se: `${t}se`, le: `${t}le`, au: `${t}au`}};
            try { const r = await app.api.createSubmission({tag: `${t}p5`, context: sc.ctx2.contextPath, submitter: sc.ctx2.users.au, title: `K3 P5 assign template ${t}`, decisions: ['skipExternalReview', 'sendToProduction'], participants: [{username: sc.ctx2.users.se, role: 'sectionEditor'}]}); sc.ctx2.p5 = {id: r.submissionId, stageId: r.stageId}; }
            catch (e) { sc.ctx2.p5 = {error: String(e.message).slice(0, 600)}; log('[seed p5 FAILED]', sc.ctx2.p5.error); }
            save();
        }
        record('seed-ctx2', sc.ctx2);
        if (sc.ctx2.p5 && sc.ctx2.p5.id) {
            curPath = sc.ctx2.contextPath;
            const {page, close} = await launch(app);
            try {
                const out = {};
                await signInAs(page, sc.ctx2.users.mgr);
                await sect('ctx2 task template edit', async () => { out.tasks = await taskTemplates(page, 'ctx2-mgr', {open: 'Ready for Production', editPrefix: 'K3EDIT-RFP body'}); });
                await sect('ctx2 assign with template', async () => {
                    await openWorkflow(page, workflow(sc.ctx2.p5.id, 'workflow_5'), 'p5-mgr-production-assign');
                    out.assign = await assignForm(page, 'p5-mgr-rfp', {group: 'Layout Editor', user: 'Layoutist', template: 'Ready for Production', keep: true});
                    const after = await openWorkflow(page, workflow(sc.ctx2.p5.id, 'workflow_5'), 'p5-mgr-production-after-assign');
                    out.after = {notice: after.info.notice, headings: after.info.headings, descriptions: after.info.descriptions, tables: (after.info.tables || []).map((t) => ({name: t.name, rows: t.rows}))};
                    out.mail = await mailFind(app, mail(sc.ctx2.users.le), 'K3EDIT-RFP', 'p5-le-mail-ready-for-production');
                    if (!out.mail.found) out.mailAny = await mailFind(app, mail(sc.ctx2.users.le), 'ready', 'p5-le-mail-any');
                });
                record('assign-summary', out);
                await signOut(page);
            } finally { await close(); curPath = sc.contextPath; }
        }
    }

    // ---- P4 as mgr: the edited subject prefilled, "Skip this email", the log without the mail line, the author's inbox ----
    if (on('moveskip') && S.p4 && S.p4.id) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await signInAs(page, u.mgr);
            await sect('p4 move skip', async () => {
                const before = await openWorkflow(page, workflow(S.p4.id, 'workflow_5'), 'p4-mgr-production-before');
                out.before = {actions: before.info.actionButtons, notice: before.info.notice};
                out.inboxBefore = (await inbox(app, mail(u.au))).map((m) => m.subject);
                out.move = await runDecision(page, 'Move To Copyediting', 'p4-mgr-move-skip', {skipEmail: true});
                await openWorkflow(page, workflow(S.p4.id, 'workflow_4'), 'p4-mgr-after-move-copyediting');
                out.log = await activityLog(page, 'p4-mgr-after-move-activity-log');
                await page.waitForTimeout(4000);
                out.inboxAfter = (await inbox(app, mail(u.au))).map((m) => ({subject: m.subject, from: m.from}));
                log('[p4 author inbox after skip]', JSON.stringify(out.inboxAfter));
            });
            record('moveskip-summary', out);
            await signOut(page);
        } finally { await close(); }
    }
});
