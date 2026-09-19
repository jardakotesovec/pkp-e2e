// U33 claim check, chunk K4: the preprint server's Production stage and its
// decisions, plus the cross-app controls. Rules 9–11 ("Decline Submission",
// "Revert Decline", "Delete"), their Side effects (the author emails, the
// Activity Log lines), the register's OPS1 (no file list, no notice box), OPS2
// (the "Revert Decline" wording and the email template's name), OPS3 ("Post the
// preprint" on a declined preprint) and OPS4 (a recommend-only Moderator's
// preprint). The Cross-feature pointers (fn-q) claim no screen.
// Spec: docs/specs/U33-production-stage.md lines 208–235, 266–275, 335–379, 529–580.
//
// OPS: one scratch server with a manager (mgr, assigned to nothing), two
// Moderators (mod, mod2), an author (au) and the installer's admin; preprints
//   D1  queued, mod a participant   → read as mgr/mod; Decline by mgr; reads as mgr/mod/admin; "Post the preprint"; Revert Decline by mgr; reads
//   D2  queued, mod a participant   → the wizard left with an edited subject (Cancel); Decline with "Skip this email"; "Delete" › Cancel, then › Confirm
//   D3  queued, mod2 a participant  → mod2 made recommend-only on screen by mgr; opened as mod2 (OPS4)
// OJS/OMP: a scratch context with one submission at Production, read as its
// manager: the control for the decision buttons' exclusivity (multi-app rule 4).
//
//   PROBE_FEATURE=U33 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U33/K4/k4.js
//   PHASES=seed,queued,decline,declined,fromview,revert,delete,emails,recommend,mod2post,notes,control   (default all; later phases reuse k4-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, settled, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'queued', 'decline', 'declined', 'fromview', 'revert', 'delete', 'emails', 'recommend', 'mod2post', 'notes', 'control'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
// Visible dialogs as data. The workflow dialog is position:fixed (offsetParent null), so visibility is getClientRects().
const dialogTexts = (page) => page.locator('[role="dialog"]').evaluateAll((els) =>
    els.filter((d) => d.getClientRects().length).map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
// The first (outermost) visible dialog, the workflow page: head lines, headings, buttons, tables, notices, the side menu.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
    }));
    const headings = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"], .pkpBadge, [class*="badge"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const nav = [...root.querySelectorAll('nav a, nav button, [role=menuitem], [role=menubar] *[role], [class*="sideMenu"] a, [class*="sideMenu"] button')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const head = root.innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10);
    return {dialogCount: dlgs.length, head, headings, buttons, tables, notices, nav};
});
const decisionInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const main = document.querySelector('main') || document.body;
    const labelOf = (i) => {
        const l = i.id && document.querySelector(`label[for="${i.id}"]`);
        return (l ? l.innerText : (i.closest('label') || i.parentElement || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    };
    const stepList = main.querySelector('[aria-label*="Complete the following steps"], ol, ul');
    return {
        url: location.href,
        steps: [...main.querySelectorAll('[role=tab], .pkpSteps__step, [class*="steps__step"], li button')].filter(vis).map((e) => ({text: e.innerText.trim().replace(/\s+/g, ' '), current: e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') != null || /current/.test(e.className)})).filter((s) => /^\d/.test(s.text)).slice(0, 12),
        stepListLabel: stepList ? (stepList.getAttribute('aria-label') || null) : null,
        headings: [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40),
        buttons: [...main.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || '').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})).filter((b) => b.text).slice(0, 60),
        checkboxes: [...main.querySelectorAll('input[type=checkbox]')].map((i) => ({label: labelOf(i), checked: i.checked, visible: vis(i), name: i.name || null})).slice(0, 40),
        subject: (main.querySelector('input[name="subject"], input[id*="subject"]') || {}).value || null,
        recipients: [...main.querySelectorAll('[class*="recipient"], [class*="composer__recipients"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 10),
        text: main.innerText.slice(0, 6000),
    };
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
async function inbox(app, email) {
    const list = await app.mail.inboxFor(email, {timeout: 8000}).catch(() => []);
    const out = [];
    for (const m of (list || []).slice(0, 10)) {
        const f = await app.mail.fullMessage(m.ID).catch(() => null);
        out.push({id: m.ID, subject: f ? f.Subject : m.Subject, from: f ? f.From : null, to: f ? f.To : null, text: f ? flat(f.Text, 900) : null});
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
        log(`[${label}] NOT FOUND`, out.error);
        return out;
    }
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };
    const mail = (u) => `${u}@mail.test`;

    // The workflow dialog's side menu renders after its submission fetch: wait for it (or an error dialog) before reading.
    async function waitPanel(page) {
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => {
            const dlgs = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length);
            return dlgs.length > 1 || (dlgs[0] && (dlgs[0].querySelector('nav button, nav a, [class*="sideMenu"] button') || /error|Error|not found/.test(dlgs[0].innerText)));
        }, null, {timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
    }
    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await waitPanel(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)})), ...(extra || {})});
        const decisionButtons = (info.buttons || []).filter((b) => /Send To Production|Move To Copyediting|Move to Review|Accept|Decline|Delete|Send for Review|Request Revisions|Recommend|Schedule|Publish|Post/i.test(b));
        log(`[${label}]`, app.name, 'url:', page.url(), 'head:', JSON.stringify((info.head || []).slice(0, 5)), 'decision buttons:', JSON.stringify(decisionButtons), 'tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)), 'notices:', JSON.stringify((info.notices || []).slice(0, 6)));
        return {info, dialogs, s, decisionButtons};
    }
    // Select a side-menu entry of the open workflow dialog by its visible text.
    async function selectEntry(page, name, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const entry = dlg.locator('nav button, nav a, [class*="sideMenu"] button, [class*="sideMenu"] a').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)}).first();
        await loc(page, `${label}: the side menu's "${name}"`, entry);
        if (!(await entry.count())) { log(`[${label}] no menu entry "${name}"`); return null; }
        await entry.click(); await idle(page);
        await page.waitForTimeout(500); await idle(page);
        const info = await wfInfo(page);
        const s = await snap(page, label, {info, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)}))});
        log(`[${label}]`, 'url:', page.url(), 'buttons:', JSON.stringify(info.buttons.slice(0, 20)));
        return {info, s};
    }

    // Press a decision button and walk its wizard. opts: {cancelAfterEdit, skipEmail}
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
            pages.push({n, url: d.url, steps: d.steps, headings: d.headings, buttons: d.buttons.map((b) => b.text), checkboxes: d.checkboxes, subject: d.subject, recipients: d.recipients});
            log(`[${label} page ${n}]`, 'steps:', JSON.stringify(d.steps.map((x) => `${x.text}${x.current ? '*' : ''}`)), 'headings:', JSON.stringify(d.headings.slice(0, 5)), 'buttons:', JSON.stringify(d.buttons.map((b) => b.text)), 'subject:', d.subject);
            return {d, s};
        };
        let {d} = await readPage(1);
        if (opts.cancelAfterEdit) {
            const subj = page.locator('input[name="subject"], input[id*="subject"]').first();
            if (await subj.count()) { await subj.fill(`${d.subject || ''} edited-${label}`); }
            const cancel = page.getByRole('button', {name: 'Cancel', exact: true}).first();
            await loc(page, `${label}: the wizard's "Cancel"`, cancel);
            await cancel.click(); await idle(page);
            await page.waitForTimeout(800);
            const dl = await dialogTexts(page);
            await snap(page, `${label}-cancel`, {dialogs: dl, url: page.url()});
            log(`[${label} cancel]`, page.url(), 'dialogs:', JSON.stringify(dl.map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 200)}))));
            const conf = page.locator('[role="dialog"]:visible').last();
            const yes = conf.getByRole('button', {name: /^(OK|Yes|Leave|Confirm|Discard|Cancel Decision)/}).first();
            if (await conf.count() && await yes.count()) { await yes.click(); await idle(page); }
            await page.waitForTimeout(800); await idle(page);
            const info = await wfInfo(page).catch(() => ({}));
            await snap(page, `${label}-cancel-landed`, {url: page.url(), info, dialogs: await dialogTexts(page)});
            log(`[${label} cancel landed]`, page.url(), 'buttons:', JSON.stringify((info.buttons || []).slice(0, 12)));
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
        }
        await loc(page, `${label}: "Record Decision"`, rec);
        await rec.click(); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const done = await decisionInfo(page);
        const doneDialogs = await dialogTexts(page);
        const links = await page.locator('[role="dialog"]:visible a, [role="dialog"]:visible button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => ({tag: e.tagName, text: e.innerText.trim(), href: e.getAttribute('href')}))).catch(() => []);
        await snap(page, `${label}-recorded`, {decision: done, dialogs: doneDialogs, links});
        log(`[${label} recorded]`, page.url(), 'dialogs:', JSON.stringify(doneDialogs.map((x) => ({name: x.name, text: flat(x.text, 400)}))), 'links:', JSON.stringify(links));
        const dlg = page.locator('[role="dialog"]:visible').first();
        let leave = dlg.getByRole('link', {name: /View|Back|Return|Submission|Dashboard/}).first();
        if (!(await leave.count())) leave = dlg.getByRole('button', {name: /View|Back|Return|Submission|Dashboard|OK|Close/}).first();
        let landed = null;
        if (await leave.count()) {
            const lt = await leave.innerText().catch(() => '');
            await loc(page, `${label}: the completion dialog's way out`, leave);
            await leave.click(); await idle(page);
            await waitPanel(page);
            await page.waitForTimeout(800); await idle(page);
            const info = await wfInfo(page).catch(() => ({}));
            landed = {pressed: lt.trim(), url: page.url(), head: info.head, buttons: info.buttons, nav: info.nav, notices: info.notices};
            await snap(page, `${label}-recorded-landed`, {landed, info, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 800)}))});
            log(`[${label} landed]`, JSON.stringify({pressed: lt.trim(), url: page.url(), head: (info.head || []).slice(0, 5), buttons: (info.buttons || []).slice(0, 15)}));
        }
        return {pages, done: {headings: done.headings, buttons: done.buttons, dialogs: doneDialogs.map((x) => ({name: x.name, text: flat(x.text, 600)}))}, landed};
    }

    async function activityLog(page, name) {
        const btn = page.getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(name, {absent: true, buttons: (await dialogTexts(page)).map((d) => d.buttons)}); log(`[${name}] no Activity Log button`); return null; }
        await btn.click();
        const dlg = page.locator('[role="dialog"]:visible').last();
        await dlg.waitFor({timeout: 30000}).catch(() => {});
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))).catch(() => []);
        await snap(page, name, {rows, dialogText: flat(await dlg.innerText().catch(() => ''), 5000)});
        log(`[${name}]`, JSON.stringify(rows).slice(0, 1500));
        const close = dlg.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return rows;
    }
    // The dashboard's "Declined" view as data: the heading and the rows, and whether a title is listed.
    async function declinedView(page, label, title) {
        await page.goto(ctxUrl('/dashboard/editorial?currentViewId=declined')); await idle(page);
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const s = await snap(page, label);
        const main = s.text && s.text.main ? s.text.main : '';
        const views = await page.locator('nav a, nav button, [role=navigation] a, [role=navigation] button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
        const out = {url: page.url(), heading: flat((main.match(/Declined[^\n]*/) || [])[0], 120), listed: title ? main.includes(title) : null, views: views.slice(0, 40), main: flat(main, 1200)};
        record(`${label}-summary`, out);
        log(`[${label}]`, JSON.stringify({heading: out.heading, listed: out.listed, views: out.views.filter((v) => /Declined|Active|Assigned|Archived|All/i.test(v))}));
        return out;
    }
    // The Participants panel: the row menu of <name> → "Edit" → tick recommendOnly → OK.
    async function setRecommendOnly(page, name, label) {
        const row = page.locator('[role="dialog"]:visible').first().locator('li, tr, div').filter({hasText: new RegExp(name)}).filter({has: page.locator('button')}).last();
        const more = row.getByRole('button', {name: /More Actions|Options|Edit/}).first();
        if (!(await more.count())) { record(`${label}-participants-row`, {absent: true}); log(`[${label}] no row menu for ${name}`); return false; }
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-participants-row-menu`, {items});
        log(`[${label}] row menu:`, JSON.stringify(items));
        const edit = page.getByRole('menuitem', {name: /^Edit/}).first();
        if (!(await edit.count())) return false;
        await edit.click(); await idle(page);
        const form = topWin(page);
        await form.waitFor({timeout: 30000});
        // a legacy side window: its form arrives by AJAX after the window opens, so wait for a field, not a button
        await form.locator('form input:not([type=hidden]), form select, form textarea').first().waitFor({timeout: 20000}).catch(() => {});
        await settled(page, form.locator('form').first()).catch(() => null);
        await idle(page);
        const before = (await dialogTexts(page)).slice(-1)[0];
        const fields = await form.locator('form input:not([type=hidden]), form select, form textarea').evaluateAll((els) => els.map((e) => ({tag: e.tagName, type: e.type, name: e.name, id: e.id, checked: e.checked, label: (e.id && document.querySelector(`label[for="${e.id}"]`) || e.closest('label') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 120) || null}))).catch(() => []);
        record(`${label}-participants-edit-fields`, {fields});
        log(`[${label}] edit form fields:`, JSON.stringify(fields));
        const box = form.locator('input[name="recommendOnly"]');
        const present = await box.count();
        const labelText = present ? await form.locator(`label[for="${await box.getAttribute('id')}"]`).innerText().catch(() => null) : null;
        record(`${label}-participants-edit-form`, {title: before && before.name, text: flat(before && before.text, 800), recommendOnlyPresent: present, checked: present ? await box.isChecked() : null, label: flat(labelText, 200)});
        await shot(page, `${label}-participants-edit-form`).catch(() => {});
        log(`[${label}] edit form:`, before && before.name, 'recommendOnly present:', present, 'label:', flat(labelText, 120));
        if (!present) { const c = form.getByRole('link', {name: /Cancel/}).first(); if (await c.count()) await c.click(); await idle(page); return false; }
        await box.check();
        const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
        await loc(page, `${label}: Edit Assignment's save`, ok);
        await ok.click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        record(`${label}-participants-after-save`, {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 600)}))});
        return true;
    }

    // ---- OJS / OMP: the control read ---------------------------------------
    if (!isOPS) {
        if (!on('control')) return;
        if (!sc.contextPath) {
            const t = tag('u33k4');
            const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}];
            const ctx = await app.api.createContext({tag: t, context: {name: `U33 K4 ${t}`, acronym: 'U33K4', contactName: 'K4 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.users = {mgr: `${t}mgr`, au: `${t}au`};
            const tries = [['skipExternalReview', 'sendToProduction'], ['skipExternalReview', 'sendtoproduction']];
            for (const decisions of tries) {
                try {
                    const s = await app.api.createSubmission({tag: `${t}p`, context: sc.contextPath, submitter: sc.users.au, title: `K4 control at Production ${t}`, decisions});
                    sc.p = s.submissionId; sc.pStage = s.stageId; sc.decisions = decisions; break;
                } catch (e) { log('[seed control FAILED]', JSON.stringify(decisions), String(e.message).slice(0, 700)); sc.seedError = String(e.message).slice(0, 700); }
            }
            save();
        }
        record('seed', sc);
        if (!sc.p) { log('[control] no submission at Production; nothing to read'); return; }
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            const a = await openWorkflow(page, workflow(sc.p), 'ctl-landing');
            const b = await openWorkflow(page, workflow(sc.p, 'workflow_5'), 'ctl-production');
            record('ctl-summary', {stage: sc.pStage, landing: {head: a.info.head, buttons: a.info.buttons, nav: a.info.nav}, production: {head: b.info.head, buttons: b.info.buttons, decisionButtons: b.decisionButtons, tables: (b.info.tables || []).map((x) => x.name), nav: b.info.nav}});
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ---- OPS: seed ----------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u33k4');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}mod`, roles: ['sectionEditor'], givenName: 'Mo', familyName: 'Moderator'},
            {username: `${t}mod2`, roles: ['sectionEditor'], givenName: 'Rec', familyName: 'Recommender'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
        ];
        const ctx = await app.api.createContext({tag: t, context: {name: `U33 K4 ${t}`, acronym: 'U33K4', contactName: 'K4 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]));
        sc.names = {mgr: 'Mira Manager', mod: 'Mo Moderator', mod2: 'Rec Recommender', au: 'Ava Author'};
        const u = sc.users;
        const seeds = {
            d1: {title: `K4 D1 decline and revert ${t}`, participants: [{username: u.mod, role: 'sectionEditor'}]},
            d2: {title: `K4 D2 decline and delete ${t}`, participants: [{username: u.mod, role: 'sectionEditor'}]},
            d3: {title: `K4 D3 recommend only ${t}`, participants: [{username: u.mod2, role: 'sectionEditor'}]},
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
    if (!u) { log('[k4] no state; run the seed phase first'); return; }
    const au = mail(u.au);

    const {page, close} = await launch(app);
    try {
        // ---- queued: the entry as mgr and as the assigned Moderator (OPS1; t7's second half before the decline) ----
        if (on('queued')) await sect('queued', async () => {
            await signInAs(page, u.mgr);
            const a = await openWorkflow(page, workflow(S.d1.id), 'd1-mgr-queued-landing');
            const b = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-mgr-queued-production');
            // OPS1: the "Preprint" group's "Galleys" entry
            const g = await selectEntry(page, 'Galleys', 'd1-mgr-queued-galleys');
            record('d1-mgr-queued-summary', {landing: {url: a.s.url, head: a.info.head, nav: a.info.nav}, production: {url: b.s.url, head: b.info.head, buttons: b.info.buttons, headings: b.info.headings, tables: b.info.tables, notices: b.info.notices, nav: b.info.nav}, galleys: g && {url: g.s.url, buttons: g.info.buttons, headings: g.info.headings, tables: g.info.tables}});
            await signInAs(page, u.mod);
            const c = await openWorkflow(page, workflow(S.d1.id), 'd1-mod-queued-landing');
            const d = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-mod-queued-production');
            record('d1-mod-queued-summary', {landing: {url: c.s.url, head: c.info.head, nav: c.info.nav}, production: {url: d.s.url, buttons: d.info.buttons, headings: d.info.headings, tables: d.info.tables, notices: d.info.notices, nav: d.info.nav}});
            await signInAs(page, 'admin');
            const e = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-admin-queued-production');
            record('d1-admin-queued-summary', {url: e.s.url, buttons: e.info.buttons, nav: e.info.nav});
        });

        // ---- decline: Rule 9 on D1 as mgr, the wizard, the closing window, the landing ----
        if (on('decline')) await sect('decline', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-mgr-before-decline');
            const r = await runDecision(page, 'Decline Submission', 'd1-decline');
            record('d1-decline-summary', r);
            sc.d1Declined = true; save();
        });

        // ---- declined: the state after Rule 9; Delete offered per role (t8); reopen from the Declined view; OPS3; log; mail ----
        if (on('declined')) await sect('declined', async () => {
            await signInAs(page, u.mgr);
            const a = await openWorkflow(page, workflow(S.d1.id), 'd1-mgr-declined-landing');
            const b = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-mgr-declined-production');
            record('d1-mgr-declined-summary', {landing: {url: a.s.url, head: a.info.head, nav: a.info.nav, buttons: a.info.buttons}, production: {url: b.s.url, head: b.info.head, buttons: b.info.buttons, headings: b.info.headings, tables: b.info.tables, notices: b.info.notices, nav: b.info.nav}});
            await activityLog(page, 'd1-declined-activity-log');
            // OPS3: "Post the preprint" on the declined preprint
            const post = page.getByRole('button', {name: 'Post the preprint', exact: true}).first();
            await loc(page, 'd1 declined: "Post the preprint"', post);
            if (await post.count()) {
                await post.click(); await idle(page);
                await page.waitForTimeout(800);
                const dl = await dialogTexts(page);
                const footer = page.locator('[role="dialog"]:visible').first().locator('form button, form a.pkp_button, [class*="pkpFormPage__footer"] button, button').filter({hasText: /^(Post|Schedule|Save|Publish|Unschedule|Unpost)/}).first();
                const t = await settled(page, footer).catch(() => null);
                const info = await wfInfo(page);
                await snap(page, 'd1-mgr-declined-post-pressed', {info, settledButton: t, dialogs: dl.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)}))});
                log('[d1 Post the preprint pressed]', page.url(), 'headings:', JSON.stringify(info.headings.slice(0, 6)), 'buttons:', JSON.stringify(info.buttons.slice(0, 20)), 'dialogs:', dl.length);
            }
            await mailFind(app, au, 'declined', 'd1-decline-mail');
            record('d1-au-inbox-after-decline', await inbox(app, au));
            // the assigned Moderator and the Site Administrator on the declined preprint (Rule 11, t8)
            await signInAs(page, u.mod);
            const c = await openWorkflow(page, workflow(S.d1.id), 'd1-mod-declined-landing');
            const d = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-mod-declined-production');
            record('d1-mod-declined-summary', {landing: {url: c.s.url, head: c.info.head, nav: c.info.nav}, production: {url: d.s.url, buttons: d.info.buttons, headings: d.info.headings, nav: d.info.nav}});
            const modDeclinedView = await declinedView(page, 'd1-mod-declined-view', S.d1.title);
            record('d1-mod-declined-view-summary', modDeclinedView);
            await signInAs(page, 'admin');
            const e = await openWorkflow(page, workflow(S.d1.id), 'd1-admin-declined-landing');
            const f = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-admin-declined-production');
            record('d1-admin-declined-summary', {landing: {url: e.s.url, head: e.info.head, nav: e.info.nav}, production: {url: f.s.url, buttons: f.info.buttons, nav: f.info.nav}});
            // the author's view of the declined preprint (the sweep)
            await signInAs(page, u.au);
            const g = await openWorkflow(page, ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${S.d1.id}`), 'd1-au-declined-landing');
            record('d1-au-declined-summary', {url: g.s.url, head: g.info.head, buttons: g.info.buttons, nav: g.info.nav, notices: g.info.notices});
        });

        // ---- fromview: the Declined view, the row opened from there, the "Production" entry selected (Rule 9's last sentence) ----
        if (on('fromview')) await sect('fromview', async () => {
            await signInAs(page, u.mgr);
            // the dashboard's "Declined" view, and the row opened from there
            const dv = await declinedView(page, 'd1-mgr-declined-view', S.d1.title);
            const row = page.locator('tr, li, [role=row]').filter({hasText: S.d1.title}).first();
            const open = row.getByRole('button', {name: /View|Open/}).first();
            await loc(page, 'd1: the Declined view row\'s open button', open);
            if (await open.count()) {
                await open.click(); await idle(page);
                await waitPanel(page);
                const info = await wfInfo(page);
                await snap(page, 'd1-mgr-declined-opened-from-view', {info, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)}))});
                log('[d1 opened from Declined view]', page.url(), 'head:', JSON.stringify(info.head.slice(0, 5)), 'headings:', JSON.stringify(info.headings.slice(0, 4)), 'buttons:', JSON.stringify(info.buttons.slice(0, 12)));
                const p = await selectEntry(page, 'Production', 'd1-mgr-declined-production-selected');
                record('d1-mgr-declined-from-view-summary', {view: dv, landed: {url: page.url(), head: info.head, headings: info.headings, buttons: info.buttons, nav: info.nav}, production: p && {url: p.s.url, buttons: p.info.buttons}});
            }
        });

        // ---- revert: Rule 10 on D1 as mgr ----
        if (on('revert')) await sect('revert', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-mgr-before-revert');
            const r = await runDecision(page, 'Revert Decline', 'd1-revert');
            record('d1-revert-summary', r);
            const a = await openWorkflow(page, workflow(S.d1.id), 'd1-mgr-reverted-landing');
            const b = await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'd1-mgr-reverted-production');
            record('d1-mgr-reverted-summary', {landing: {url: a.s.url, head: a.info.head, nav: a.info.nav}, production: {url: b.s.url, head: b.info.head, buttons: b.info.buttons, headings: b.info.headings, tables: b.info.tables, notices: b.info.notices}});
            await activityLog(page, 'd1-reverted-activity-log');
            await declinedView(page, 'd1-mgr-reverted-declined-view', S.d1.title);
            await mailFind(app, au, 'reversed', 'd1-revert-mail');
            record('d1-au-inbox-after-revert', await inbox(app, au));
        });

        // ---- delete: D2, the wizard left with an edit (Cancel), the decline with the email skipped, Rule 11's dialog ----
        if (on('delete')) await sect('delete', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.d2.id, 'workflow_5'), 'd2-mgr-queued-production');
            const c = await runDecision(page, 'Decline Submission', 'd2-decline-cancel', {cancelAfterEdit: true});
            record('d2-decline-cancel-summary', c);
            await openWorkflow(page, workflow(S.d2.id, 'workflow_5'), 'd2-mgr-after-cancel');
            const inboxBefore = await inbox(app, au);
            const r = await runDecision(page, 'Decline Submission', 'd2-decline-skip', {skipEmail: true});
            record('d2-decline-skip-summary', r);
            await openWorkflow(page, workflow(S.d2.id, 'workflow_5'), 'd2-mgr-declined-production');
            await activityLog(page, 'd2-declined-activity-log');
            record('d2-au-inbox-after-skip', {before: inboxBefore.map((m) => m.subject), after: (await inbox(app, au)).map((m) => m.subject)});
            // "Delete": the dialog, Cancel, then Confirm
            const del = page.getByRole('button', {name: 'Delete', exact: true}).first();
            await loc(page, 'd2 declined: "Delete"', del);
            if (!(await del.count())) { log('[d2] no Delete button'); return; }
            await del.click(); await idle(page);
            await page.waitForTimeout(500);
            let dl = await dialogTexts(page);
            await snap(page, 'd2-delete-dialog', {dialogs: dl});
            log('[d2 Delete dialog]', JSON.stringify(dl.slice(1).map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 300)}))));
            const conf = topWin(page);
            const cancel = conf.getByRole('button', {name: 'Cancel', exact: true}).first();
            await loc(page, 'd2 Delete dialog: "Cancel"', cancel);
            if (await cancel.count()) { await cancel.click(); await idle(page); }
            await page.waitForTimeout(500); await idle(page);
            const infoAfterCancel = await wfInfo(page);
            await snap(page, 'd2-delete-cancelled', {info: infoAfterCancel, dialogs: await dialogTexts(page)});
            log('[d2 Delete cancelled]', page.url(), 'buttons:', JSON.stringify(infoAfterCancel.buttons.slice(0, 12)));
            await del.click(); await idle(page);
            await page.waitForTimeout(500);
            const confirm = topWin(page).getByRole('button', {name: 'Confirm', exact: true}).first();
            await loc(page, 'd2 Delete dialog: "Confirm"', confirm);
            if (await confirm.count()) { await confirm.click(); await idle(page); }
            await page.waitForTimeout(1500); await idle(page);
            dl = await dialogTexts(page);
            const s = await snap(page, 'd2-delete-confirmed', {dialogs: dl, url: page.url()});
            log('[d2 Delete confirmed]', page.url(), 'dialogs:', dl.length, 'main:', flat(s.text && s.text.main, 300));
            await declinedView(page, 'd2-mgr-declined-view-after-delete', S.d2.title);
            const gone = await openWorkflow(page, workflow(S.d2.id, 'workflow_5'), 'd2-mgr-stale-address');
            record('d2-delete-summary', {after: {url: s.url, dialogs: dl.length}, staleAddress: {url: gone.s.url, main: flat(gone.s.text && gone.s.text.main, 400), dialogs: gone.dialogs.length}});
            record('d2-au-inbox-after-delete', (await inbox(app, au)).map((m) => m.subject));
            sc.d2Deleted = true; save();
        });

        // ---- emails: OPS2's template names on Settings › Workflow › Emails ----
        if (on('emails')) await sect('emails', async () => {
            await signInAs(page, u.mgr);
            await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
            await page.locator('.listPanel__item').first().waitFor({timeout: 30000}).catch(() => {});
            await idle(page);
            const items = await page.locator('.listPanel__item').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)));
            const hits = items.filter((x) => /Declin|Reinstate|Revert/i.test(x));
            await snap(page, 'manage-emails', {count: items.length, hits});
            log('[manage emails]', items.length, 'items; decline-related:', JSON.stringify(hits));
            const search = page.getByRole('searchbox', {name: 'Search by name or description'}).first();
            if (await search.count()) {
                await search.fill('Reinstate'); await search.press('Enter'); await idle(page);
                await page.waitForTimeout(800); await idle(page);
                const found = await page.locator('.listPanel__item').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)));
                await snap(page, 'manage-emails-search-reinstate', {found});
                log('[manage emails search Reinstate]', JSON.stringify(found));
                const edit = page.locator('.listPanel__item').first().getByRole('button', {name: /^Edit/}).first();
                if (await edit.count()) {
                    await edit.click(); await idle(page);
                    await page.waitForTimeout(800); await idle(page);
                    const dl = await dialogTexts(page);
                    await snap(page, 'manage-emails-reinstate-window', {dialogs: dl});
                    log('[reinstate window]', JSON.stringify(dl.slice(-1).map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 600)}))));
                    const close = topWin(page).getByRole('button', {name: /^(Close|Cancel)$/}).first();
                    if (await close.count()) { await close.click(); await idle(page); }
                }
            }
        });

        // ---- recommend: OPS4, mod2 made recommend-only on D3, then D3 opened as mod2 ----
        if (on('recommend')) await sect('recommend', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.d3.id, 'workflow_5'), 'd3-mgr-queued-production');
            const ok = await setRecommendOnly(page, sc.names.mod2, 'd3');
            record('d3-recommend-only-set', {ok});
            await openWorkflow(page, workflow(S.d3.id, 'workflow_5'), 'd3-mgr-after-recommend-only');
            await signInAs(page, u.mod2);
            await snap(page, 'd3-mod2-dashboard');
            const a = await openWorkflow(page, workflow(S.d3.id), 'd3-mod2-landing');
            const b = await openWorkflow(page, workflow(S.d3.id, 'workflow_5'), 'd3-mod2-production');
            record('d3-mod2-summary', {landing: {url: a.s.url, head: a.info.head, headings: a.info.headings, buttons: a.info.buttons, nav: a.info.nav, dialogs: a.dialogs.map((d) => ({name: d.name, text: flat(d.text, 600)}))}, production: {url: b.s.url, head: b.info.head, headings: b.info.headings, buttons: b.info.buttons, nav: b.info.nav, dialogs: b.dialogs.map((d) => ({name: d.name, text: flat(d.text, 600)}))}});
            // the unlimited Moderator on the same preprint: the sweep's control for the row's "Edit" flag
            await signInAs(page, u.mod);
            const c = await openWorkflow(page, workflow(S.d3.id, 'workflow_5'), 'd3-mod-unassigned-production');
            record('d3-mod-unassigned-summary', {url: c.s.url, head: c.info.head, buttons: c.info.buttons, dialogs: c.dialogs.map((d) => ({name: d.name, text: flat(d.text, 400)}))});
        });
        // ---- mod2post: the sweep, "Post the preprint" pressed by the recommend-only Moderator (nothing posted) ----
        if (on('mod2post')) await sect('mod2post', async () => {
            await signInAs(page, u.mod2);
            await openWorkflow(page, workflow(S.d3.id, 'workflow_5'), 'd3-mod2-before-post');
            const post = page.getByRole('button', {name: 'Post the preprint', exact: true}).first();
            await loc(page, 'd3 mod2: "Post the preprint"', post);
            if (!(await post.count())) return;
            await post.click(); await idle(page);
            const footer = page.locator('[role="dialog"]:visible').first().locator('button').filter({hasText: /^(Post|Schedule|Save)$/}).first();
            await footer.waitFor({timeout: 15000}).catch(() => {});
            await idle(page);
            const info = await wfInfo(page);
            await snap(page, 'd3-mod2-post-pressed', {info, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)}))});
            log('[d3 mod2 Post the preprint pressed]', page.url(), 'headings:', JSON.stringify(info.headings.slice(0, 6)), 'buttons:', JSON.stringify(info.buttons.slice(0, 20)));
        });

        // ---- notes: what the drive taught, for the next agent on these screens ----
        if (on('notes')) {
            note('ccK4 · OPS decision wizard: "Decline Submission" navigates to decision/record/{id}?decision=8, "Revert Decline" to ?decision=16; each has the one step "1 Notify Authors" (list "Complete the following steps…", no role=tab); the completion dialog is named "Submission Declined" / "Submission Reactivated" and its only control is the LINK "View Submission Summary"; after a decline it lands on workflowMenuKey=publication_{id}_titleAbstract (the Production entry must be selected from the side menu), after a revert on workflow_5.');
            note('ccK4 · OPS "Delete" (declined preprint, manager or admin): a reka dialog named "Delete" reading "Are you sure you want to permanently delete this submission?" with "Confirm" then "Cancel"; Cancel keeps the panel; Confirm POSTs api/v1/_submissions/{id} (a tunneled DELETE, 200), closes the panel and drops workflowSubmissionId from the address, landing on the dashboard list; the stale address afterwards opens the panel shell with an "Error" dialog "Invalid submission." / "OK" and GET submissions/{id} 404.');
            note('ccK4 · Participants row menu (OPS Moderator): "Edit", "Notify", "Login As", "Remove". "Edit" opens the legacy window "Edit Assignment" whose form arrives by AJAX: wait for form input[name=recommendOnly] (a wait keyed on any button matches the window\'s "Close" at once and reads an empty form); boxes recommendOnly and canChangeMetadata (ticked); after OK the row reads "Only allowed to recommend an editorial decision" and that Moderator\'s Production entry drops "Decline Submission" but keeps "Post the preprint" (no error dialog, GET submissions/{id} 200).');
            note('ccK4 · A Moderator not assigned to a preprint who types its workflow address gets the panel shell with an "Error" dialog "The current role does not have access to this operation." / "OK" (GET submissions/{id} 401); a Moderator typing currentViewId=declined lands on "Assigned to me" (no Declined view for the role).');
            note('ccK4 · Settings › Workflow › Emails (management/settings/manageEmails) has TWO search boxes: the header\'s "Search submissions" and the list\'s getByRole("searchbox", {name: "Search by name or description"}); a bare getByRole("searchbox") is a strict-mode violation. Items are .listPanel__item; "Edit <name>" opens the mailable window with "Add Template" and the per-template "Edit".');
            note('ccK4 · The workflow dialog and its inner windows are position:fixed: read visibility with getClientRects().length, never offsetParent (offsetParent drops the workflow dialog and a wfInfo read falls through to the dashboard body).');
        }
        await signOut(page).catch(() => {});
    } finally { await close(); }
});
