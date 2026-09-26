// U32 claim check, chunk K4: the two decisions of the Copyediting stage and
// their mails. Rule 8 "Send To Production" (the wizard's two pages, the ticks
// on "Select Files", the move, "Production Ready Files", the closing label and
// message, the notices gone), Rule 9 "Move to Review" (one page, the landing
// stage per history: last review round / Internal Review on a press / the
// Submission stage when never reviewed, A1 and OMP1; the files kept and a
// second acceptance), Rule 10 (no buttons off the active stage, the status
// box), the Side effects (the two author emails, the "Production process
// started." notification, the Activity Log lines) and footnote c's
// recommend-only question on the Participants panel.
// Spec: docs/specs/U32-copyediting-stage.md lines 149–180, 199–211, 345–359, 406–417.
//
// OJS/OMP: one scratch context per app with a manager (mgr), a section editor
// (se), a copyeditor (ce) and an author (au); submissions
//   P1  at Copyediting through review, one draft + one copyedited file, ce assigned  → "Send To Production" by mgr
//   P2  accepted without review, no copyeditor                                       → "Send To Production" with "Skip this email"; the recommend-only read
//   R1  at Copyediting through review, files as P1                                   → the back decision by se, then "Accept Submission" again by mgr
//   R2  accepted without review                                                      → the back decision by mgr (A1: the Submission stage)
//   I1  (OMP) internal round only, accepted from it                                  → the back decision (OMP1: Internal Review)
//   I2  (OMP) internal then external round, accepted                                 → the back decision (OMP1: External Review)
//   S1  at Copyediting through review, an Editor (ed) and a recommend-only
//       section editor (rc) assigned, mgr not assigned                               → scenario 1's three reads (s1 phase)
// The back decision is pressed by whichever label the screen offers (BACK:
// "Move to Review" or, since pkp/pkp-lib#12798, "Move to Submission" when the
// submission never had a review round); each move records the label pressed,
// the wizard page's h1, the breadcrumb's last item, the browser title, the
// "Notify Authors" text, the labels the browser's own traffic carried (the
// submission GET's availableEditorialDecisions, the decision POST's answer),
// the author's email (subject and body; the first moves append "{$decision}"
// to the body so the variable's value reaches the mail) and the landing.
// OPS: a scratch server with one preprint; the workflow read as manager and
// the typed "workflow_4" address (the cross-app control of the exclusivity claims).
//
//   PROBE_FEATURE=U32 PROBE_AGENT=ccK4s26 node bin/probe.js all shared/playwright/checks/U32/K4/k4.js
//   PHASES=seed,files,roles,s1,prod,skip,back,again,r3,a12,var,omp,ops   (default all; later phases reuse k4-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
const ALL = ['seed', 'files', 'roles', 's1', 'prod', 'skip', 'back', 'again', 'r3', 'a12', 'var', 'omp', 'ops']; // plus cefix on demand (CEFIX=<sub>)
// The Copyediting stage's back decision, by either label (pkp/pkp-lib#12798).
const BACK = /^(Move to Review|Move to Submission)$/;
const DECISION_TEXT = /Send To Production|Move to Review|Move to Submission|Accept|Decline|Send for Review|Send to|Request Revisions|Recommend|Schedule|Publish/i;
const DECISION_BODY_MARK = 'K4 decision variable: {$decision}.';

// The browser's own traffic, per page: the submission GET's decision labels and the decision POST's answer.
function traffic(page) {
    if (page.__k4) return page.__k4;
    const t = page.__k4 = {subs: [], decisions: []};
    page.on('response', async (r) => {
        const url = r.url();
        const m = url.match(/\/api\/v1\/submissions\/(\d+)(?:\?|$)/);
        const d = url.match(/\/api\/v1\/submissions\/(\d+)\/decisions(?:\?|$)/);
        if (!m && !d) return;
        try {
            const method = r.request().method();
            const status = r.status();
            const body = await r.json().catch(() => null);
            if (m && method === 'GET' && body) {
                t.subs.push({id: Number(m[1]), status, stageId: body.stageId, availableEditorialDecisions: body.availableEditorialDecisions || null, at: Date.now()});
            } else if (d && method === 'POST') {
                t.decisions.push({id: Number(d[1]), status, decision: body && body.decision, label: body && body.label, stageId: body && body.stageId, errors: body && !body.id ? body : undefined, at: Date.now()});
            }
        } catch (e) { /* the page moved on */ }
    });
    return t;
}
const lastSub = (page, id) => { const l = traffic(page).subs.filter((s) => s.id === Number(id)); return l[l.length - 1] || null; };
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
const dialogTexts = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.offsetParent !== null).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
// The workflow dialog as data: headings, visible buttons, tables (name → rows), notices, the stage menu, badges.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
    }));
    const headings = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"], [class*="pkpNotification"], .pkpBadge, [class*="badge"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const nav = [...root.querySelectorAll('nav a, nav button, [role=menuitem], [role=menubar] *[role]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const uploadButtons = buttons.filter((b) => /Upload/.test(b));
    return {dialogCount: dlgs.length, headings, buttons, tables, notices, nav, uploadButtons};
});

// The decision page (a full page, not a dialog): steps, headings, buttons, checkboxes with labels, radio, main text.
const decisionInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    const main = document.querySelector('main') || document.body;
    const labelOf = (i) => {
        const l = i.id && document.querySelector(`label[for="${i.id}"]`);
        return (l ? l.innerText : (i.closest('label') || i.parentElement || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    };
    const bc = [...document.querySelectorAll('.app__breadcrumbs li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim());
    return {
        url: location.href,
        title: document.title,
        h1: (document.querySelector('h1.app__pageHeading') || document.querySelector('main h1') || {}).innerText?.replace(/\s+/g, ' ').trim() || null,
        pageDescription: (document.querySelector('.app__pageDescription') || {}).innerText?.trim() || null,
        breadcrumbs: bc,
        breadcrumbLast: (document.querySelector('.app__breadcrumbs [aria-current="page"]') || {}).innerText?.replace(/\s+/g, ' ').trim() || null,
        steps: [...main.querySelectorAll('[role=tab], .pkpSteps__step, [class*="steps__step"]')].filter(vis).map((e) => ({text: e.innerText.trim().replace(/\s+/g, ' '), current: e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') != null || /current/.test(e.className)})).slice(0, 12),
        headings: [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40),
        buttons: [...main.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || '').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})).filter((b) => b.text).slice(0, 60),
        checkboxes: [...main.querySelectorAll('input[type=checkbox]')].map((i) => ({label: labelOf(i), checked: i.checked, visible: vis(i), name: i.name || null})).slice(0, 40),
        radios: [...main.querySelectorAll('input[type=radio]')].filter(vis).map((i) => ({label: labelOf(i), checked: i.checked})).slice(0, 20),
        subject: (main.querySelector('input[name="subject"], input[id*="subject"]') || {}).value || null,
        text: main.innerText.slice(0, 6000),
    };
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
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
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const authorWorkflow = (id, key) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const roundKey = (rounds, stageId) => { const list = (rounds || []).filter((x) => !stageId || x.stageId === stageId); const r = list[list.length - 1]; return r ? `workflow_${r.stageId}_${r.id}` : null; };
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };
    const mail = (u) => `${u}@mail.test`;

    async function openWorkflow(page, url, label, extra) {
        traffic(page);
        const sid = (url.match(/workflowSubmissionId=(\d+)/) || [])[1];
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const decisionButtons = (info.buttons || []).filter((b) => DECISION_TEXT.test(b));
        const api = sid ? lastSub(page, sid) : null;
        const apiLabels = api && api.availableEditorialDecisions ? api.availableEditorialDecisions.map((x) => `${x.id}:${x.label}`) : null;
        const s = await snap(page, label, {info, decisionButtons, apiSubmission: api, apiLabels, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1200)})), ...(extra || {})});
        log(`[${label}]`, app.name, 'headings:', JSON.stringify((info.headings || []).slice(0, 6)), 'decision buttons:', JSON.stringify(decisionButtons), 'api labels:', JSON.stringify(apiLabels), 'tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)), 'notices:', JSON.stringify((info.notices || []).slice(0, 6)));
        return {info, dialogs, s, decisionButtons};
    }

    // Upload one file into the nth "Upload/Select Files" list of the Copyediting screen (0 = "Draft Files", 1 = "Copyedited Files")
    // through the legacy select-files window's upload link and the 3-tab wizard, then save the window.
    async function uploadInto(page, nth, file, label) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        const n = await btns.count();
        await loc(page, `${label}: "Upload/Select Files" (${n} on screen, nth ${nth})`, btns.nth(nth));
        await btns.nth(nth).click(); await idle(page);
        const win = page.locator('[role="dialog"]:visible').last();
        await win.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const before = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-select-window`, {dialog: before});
        await shot(page, `${label}-select-window`).catch(() => {});
        let up = win.getByRole('link', {name: /Upload/}).first();
        if (!(await up.count())) up = win.getByRole('button', {name: /Upload/}).first();
        await loc(page, `${label}: the window's upload control`, up);
        await up.click(); await idle(page);
        const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        await wiz.waitFor({timeout: 30000});
        await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
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
        const w1 = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-wizard-step1`, {dialog: w1, title: w1 && w1.name});
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('tab', {name: /2\./}).waitFor({timeout: 30000}).catch(() => {});
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        // the window's grid redraws after the wizard closes: wait for the new row and its tick
        const base = path.basename(typeof file === 'string' ? file : file.name);
        await page.locator('[role="dialog"]:visible').last().locator(`tr:has-text("${base}") input[type=checkbox]:checked`).first().waitFor({timeout: 15000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const after = (await dialogTexts(page)).slice(-1)[0];
        const ticks = await page.locator('[role="dialog"]:visible').last().locator('tr input[type=checkbox]').evaluateAll((els) => els.map((e) => ({row: (e.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 80), checked: e.checked}))).catch(() => []);
        record(`${label}-select-window-after-upload`, {dialog: after, ticks});
        // the select window's own save
        const top = page.locator('[role="dialog"]:visible').last();
        let save = top.getByRole('button', {name: /^(Save|OK|Complete|Done)$/}).last();
        if (!(await save.count())) save = top.getByRole('link', {name: /^(Save|OK)$/}).last();
        if (await save.count()) { await loc(page, `${label}: the select window's save`, save); await save.click(); await idle(page); }
        else { const c = top.getByRole('button', {name: /^(Close|Cancel)$/}).last(); if (await c.count()) { await c.click(); await idle(page); } }
        await page.waitForFunction(() => document.querySelectorAll('[role=dialog]').length <= 1 || ![...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).slice(1).length, null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables, notices: info.notices, buttons: info.buttons});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 600));
        return info;
    }

    // Press a decision button and walk its wizard. opts: {cancelAfterEdit, skipEmail, tick: (info) => [labels to toggle]}
    async function runDecision(page, name, label, opts = {}) {
        const t = traffic(page);
        const btn = name instanceof RegExp ? page.getByRole('button', {name}).first() : page.getByRole('button', {name, exact: true}).first();
        const pressedLabel = (await btn.innerText().catch(() => '')).trim();
        const offered = await page.getByRole('button', {name: name instanceof RegExp ? name : new RegExp(`^${name}$`)}).allInnerTexts().catch(() => []);
        await loc(page, `${label}: "${pressedLabel || name}"`, btn);
        record(`${label}-pressed`, {pressedLabel, offered: offered.map((x) => x.trim())});
        log(`[${label}] pressing "${pressedLabel}"`, 'offered:', JSON.stringify(offered));
        const decisionsBefore = t.decisions.length;
        await btn.click(); await idle(page);
        const pre = await dialogTexts(page);
        await page.waitForURL(/decision/, {timeout: 30000}).catch(() => {});
        await idle(page);
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        const pages = [];
        const readPage = async (n) => {
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page);
            const d = await decisionInfo(page);
            const s = await snap(page, `${label}-page${n}`, {decision: d, pressedLabel});
            pages.push({n, url: d.url, title: d.title, h1: d.h1, breadcrumbLast: d.breadcrumbLast, pageDescription: d.pageDescription, steps: d.steps, headings: d.headings, buttons: d.buttons.map((b) => b.text), checkboxes: d.checkboxes, subject: d.subject});
            log(`[${label} page ${n}]`, 'h1:', JSON.stringify(d.h1), 'breadcrumb:', JSON.stringify(d.breadcrumbLast), 'title:', JSON.stringify(d.title), 'steps:', JSON.stringify(d.steps.map((x) => `${x.text}${x.current ? '*' : ''}`)), 'headings:', JSON.stringify(d.headings.slice(0, 5)), 'buttons:', JSON.stringify(d.buttons.map((b) => b.text)), 'boxes:', JSON.stringify(d.checkboxes.map((c) => `${c.label}${c.checked ? ' [x]' : ' [ ]'}`)));
            return {d, s};
        };
        let {d} = await readPage(1);
        if (opts.showAll) {
            // the sweep: the one-page wizard's "Show all steps" toggle
            const sa = page.getByRole('button', {name: /Show all steps|Hide/}).first();
            if (await sa.count()) {
                const before = (await sa.innerText()).trim();
                await loc(page, `${label}: "${before}"`, sa);
                await sa.click(); await idle(page);
                const after = await decisionInfo(page);
                await snap(page, `${label}-show-all`, {decision: after, toggleBefore: before, toggleAfter: (await page.getByRole('button', {name: /Show all steps|Hide|Show/}).first().innerText().catch(() => '')).trim()});
                log(`[${label} show all]`, before, '->', JSON.stringify(after.steps), JSON.stringify(after.buttons.map((x) => x.text)).slice(0, 300));
            }
        }
        if (opts.cancelAfterEdit) {
            const subj = page.locator('input[name="subject"], input[id*="subject"]').first();
            if (await subj.count()) { await subj.fill(`${d.subject || ''} edited-${label}`); }
            const cancel = page.getByRole('button', {name: 'Cancel', exact: true}).first();
            await loc(page, `${label}: the wizard's "Cancel"`, cancel);
            await cancel.click(); await idle(page);
            await page.waitForTimeout(800);
            const dl = await dialogTexts(page);
            const s = await snap(page, `${label}-cancel`, {dialogs: dl, url: page.url()});
            log(`[${label} cancel]`, page.url(), 'dialogs:', JSON.stringify(dl.map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 200)}))));
            const conf = page.locator('[role="dialog"]:visible').last();
            const yes = conf.getByRole('button', {name: /^(OK|Yes|Leave|Confirm|Discard|Cancel Decision)/}).first();
            if (await conf.count() && await yes.count()) { await yes.click(); await idle(page); }
            await page.waitForTimeout(800); await idle(page);
            await snap(page, `${label}-cancel-landed`, {url: page.url(), dialogs: await dialogTexts(page), browserDialogs: 'see run record dialogs'});
            log(`[${label} cancel landed]`, page.url());
            return {cancelled: true, pressedLabel, pages, preDialogs: pre};
        }
        if (opts.skipEmail) {
            const skip = page.getByRole('button', {name: /Skip this email/i}).first();
            await loc(page, `${label}: "Skip this email"`, skip);
            if (await skip.count()) { await skip.click(); await idle(page); await page.waitForTimeout(500); ({d} = await readPage('1-skipped')); }
        }
        if (opts.appendBody) {
            // type the mark at the end of the email body (TinyMCE, in its iframe), as a person would
            try {
                await page.waitForFunction(() => window.tinymce && window.tinymce.get().length && window.tinymce.get().every((e) => e.initialized), null, {timeout: 20000});
                const edId = await page.evaluate(() => window.tinymce.get().map((e) => e.id).pop());
                const frame = page.frameLocator(`#${edId}_ifr`);
                await frame.locator('body').click();
                await page.keyboard.press('Control+End');
                await page.keyboard.press('Enter');
                await page.keyboard.type(opts.appendBody);
                await idle(page);
                const bodyNow = await page.evaluate((id) => window.tinymce.get(id).getContent(), edId);
                record(`${label}-body-typed`, {typed: opts.appendBody, bodyNow: bodyNow.slice(0, 3000)});
                log(`[${label}] body typed`, flat(bodyNow, 200));
            } catch (e) { record(`${label}-body-typed`, {error: String(e.message).slice(0, 300)}); log(`[${label}] body type FAILED`, String(e.message).slice(0, 200)); }
        }
        const cont = page.getByRole('button', {name: 'Continue', exact: true});
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        for (let i = 2; i < 8 && !(await rec.isVisible().catch(() => false)); i++) {
            await cont.first().click(); await idle(page);
            ({d} = await readPage(i));
        }
        if (opts.tick && d.checkboxes.length) {
            for (const lbl of opts.tick(d)) {
                const box = page.getByRole('checkbox', {name: lbl}).first();
                if (await box.count()) { await box.click(); await idle(page); }
            }
            ({d} = await readPage('last-ticked'));
        }
        await rec.click(); await idle(page);
        // the completion is a dialog over the wizard page
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const done = await decisionInfo(page);
        const doneDialogs = await dialogTexts(page);
        const links = await page.locator('[role="dialog"]:visible a, [role="dialog"]:visible button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({tag: e.tagName, text: e.innerText.trim(), href: e.getAttribute('href')}))).catch(() => []);
        const posted = t.decisions.slice(decisionsBefore);
        const s = await snap(page, `${label}-recorded`, {decision: done, dialogs: doneDialogs, links, pressedLabel, decisionPosts: posted});
        log(`[${label} POST]`, JSON.stringify(posted));
        log(`[${label} recorded]`, page.url(), 'dialogs:', JSON.stringify(doneDialogs.map((x) => ({name: x.name, text: flat(x.text, 300)}))), 'links:', JSON.stringify(links));
        // leave the completed page through the dialog's own link
        const dlg = page.locator('[role="dialog"]:visible').first();
        let leave = dlg.getByRole('link', {name: /View|Back|Return|Submission|Dashboard/}).first();
        if (!(await leave.count())) leave = dlg.getByRole('button', {name: /View|Back|Return|Submission|Dashboard|OK|Close/}).first();
        let landed = null;
        if (await leave.count()) {
            const lt = await leave.innerText().catch(() => '');
            await loc(page, `${label}: the completion dialog's way out`, leave);
            await leave.click(); await idle(page);
            await page.waitForTimeout(800); await idle(page);
            landed = {pressed: lt.trim(), url: page.url()};
            await snap(page, `${label}-recorded-landed`, {landed, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, buttons: x.buttons, text: flat(x.text, 600)}))});
            log(`[${label} landed]`, JSON.stringify(landed));
        }
        return {pressedLabel, offered, pages, decisionPosts: posted, done: {headings: done.headings, buttons: done.buttons, text: flat(done.text, 800)}, landed, preDialogs: pre};
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
        const s = await snap(page, name, {rows, dialogText: flat(await dlg.innerText().catch(() => ''), 5000)});
        log(`[${name}]`, JSON.stringify(rows).slice(0, 1200));
        const close = dlg.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return rows;
    }
    async function tasksPanel(page, name) {
        const tasksBtn = page.getByRole('button', {name: /Tasks/}).first();
        if (!(await tasksBtn.count())) { record(name, {absent: true}); return null; }
        const tasksLabel = (await tasksBtn.innerText().catch(() => '')).trim();
        await tasksBtn.click();
        const tdlg = page.locator('[role="dialog"]:visible').last();
        await tdlg.waitFor({timeout: 30000}).catch(() => {});
        await tdlg.locator('table tbody tr').first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
        const text = flat(await tdlg.innerText().catch(() => ''), 4000);
        await snap(page, name, {tasksLabel, dialogText: text});
        log(`[${name}]`, tasksLabel, '|', flat(text, 400));
        const close = tdlg.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return {tasksLabel, text};
    }
    // Every screen of a submission's Copyediting entry and the default landing, as one user.
    async function readAs(page, user, id, label, {author = false, keys = ['workflow_4']} = {}) {
        await signInAs(page, user);
        const out = {};
        out.landing = await openWorkflow(page, author ? authorWorkflow(id) : workflow(id), `${label}-landing`);
        for (const k of keys) out[k] = await openWorkflow(page, author ? authorWorkflow(id, k) : workflow(id, k), `${label}-${k}`);
        return out;
    }

    // ---- OPS: the control read ----------------------------------------------
    if (isOPS) {
        if (!on('ops')) return;
        if (!sc.contextPath) {
            const t = tag('u32k4');
            const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}];
            const ctx = await app.api.createContext({tag: t, context: {name: `U32 K4 ${t}`, acronym: 'U32K4', contactName: 'K4 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.users = {mgr: `${t}mgr`, au: `${t}au`};
            const s = await app.api.createSubmission({tag: `${t}p`, context: sc.contextPath, submitter: sc.users.au, title: `K4 OPS preprint ${t}`});
            sc.p = s.submissionId; sc.pStage = s.stageId; save();
        }
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            const a = await openWorkflow(page, workflow(sc.p), 'ops-landing');
            const b = await openWorkflow(page, workflow(sc.p, 'workflow_4'), 'ops-workflow_4-typed');
            const c = await openWorkflow(page, workflow(sc.p, 'workflow_5'), 'ops-workflow_5');
            record('ops-summary', {landing: {nav: a.info.nav, buttons: a.decisionButtons, headings: a.info.headings}, typed4: {nav: b.info.nav, buttons: b.decisionButtons, headings: b.info.headings, url: page.url()}, prod: {buttons: c.decisionButtons, headings: c.info.headings}});
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u32k4');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Section'},
            {username: `${t}ce`, roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copyeditor'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${t}ed`, roles: ['editor'], givenName: 'Edda', familyName: 'Editor'},
            {username: `${t}rc`, roles: ['sectionEditor'], givenName: 'Rhea', familyName: 'Recommend'},
        ];
        const ctx = await app.api.createContext({tag: t, context: {name: `U32 K4 ${t}`, acronym: 'U32K4', contactName: 'K4 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]));
        const u = sc.users;
        const se = {username: u.se, role: 'sectionEditor'};
        const ce = {username: u.ce, role: 'copyeditor'};
        const viaReview = isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        const seeds = {
            p1: {title: `K4 P1 to production ${t}`, decisions: viaReview, participants: [se, ce]},
            p2: {title: `K4 P2 skip email ${t}`, decisions: ['skipExternalReview'], participants: [se]},
            r1: {title: `K4 R1 back to review ${t}`, decisions: viaReview, participants: [se, ce]},
            r2: {title: `K4 R2 never reviewed ${t}`, decisions: ['skipExternalReview'], participants: [se]},
            s1: {title: `K4 S1 scenario one ${t}`, decisions: viaReview, participants: [{username: u.ed, role: 'editor'}, {username: u.rc, role: 'sectionEditor'}]},
        };
        if (isOMP) {
            seeds.i1 = {title: `K4 I1 internal only ${t}`, decisions: ['sendInternalReview', 'acceptFromInternal'], participants: [se]};
            seeds.i2 = {title: `K4 I2 both rounds ${t}`, decisions: ['sendInternalReview', 'sendExternalReview', 'accept'], participants: [se]};
        }
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec});
                sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, rounds: r.reviewRounds || []};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'rounds', JSON.stringify(r.reviewRounds || []));
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
        }
        save();
        record('seed', sc);
    }
    const u = sc.users; const S = sc.subs || {};
    if (!u) { log('[k4] no state; run the seed phase first'); return; }

    // ---- files: mgr uploads one draft and one copyedited file on P1 and R1 ----
    if (on('files')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            for (const k of ['p1', 'r1']) {
                if (!S[k] || !S[k].id) continue;
                await sect(`files ${k}`, async () => {
                    await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-mgr-before-files`);
                    await uploadInto(page, 0, PDF, `${k}-draft-upload`);
                    await uploadInto(page, 1, MD, `${k}-copyedited-upload`);
                    await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-mgr-with-files`);
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- cefix: one copyedited file more on a submission whose first upload did not land (CEFIX=p1) ----
    if (on('cefix') && process.env.CEFIX && S[process.env.CEFIX] && S[process.env.CEFIX].id) {
        const k = process.env.CEFIX;
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-mgr-cefix-before`);
            await uploadInto(page, 1, MD, `${k}-copyedited-upload-2`);
            await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-mgr-with-files`);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- roles: the Copyediting screen at every level before any decision; footnote c's recommend-only read on P2 ----
    if (on('roles')) {
        const {page, close} = await launch(app);
        try {
            if (S.p1 && S.p1.id) {
                await readAs(page, u.se, S.p1.id, 'p1-se-before');
                await readAs(page, u.ce, S.p1.id, 'p1-ce-before');
                await readAs(page, u.au, S.p1.id, 'p1-au-before', {author: true});
            }
            if (S.p2 && S.p2.id) {
                await sect('recommendOnly', async () => {
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.p2.id, 'workflow_4'), 'p2-mgr-before');
                    // the Participants panel: the section editor's row menu → "Edit"
                    const row = page.locator('[role="dialog"]:visible').first().locator('li, tr, div').filter({hasText: /Sid Section/}).filter({has: page.locator('button')}).last();
                    const more = row.getByRole('button', {name: /More Actions|Options|Edit/}).first();
                    if (!(await more.count())) { record('p2-participants-row', {absent: true}); return; }
                    await loc(page, 'Participants: the Section Editor row menu', more);
                    await more.click(); await idle(page);
                    const items = await menuItems(page);
                    record('p2-participants-row-menu', {items});
                    log('[participants menu]', JSON.stringify(items));
                    const edit = page.getByRole('menuitem', {name: /^Edit/}).first();
                    if (await edit.count()) { await edit.click(); await idle(page); } else { await page.keyboard.press('Escape'); return; }
                    const form = page.locator('[role="dialog"]:visible').last();
                    await form.waitFor({timeout: 30000});
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.querySelector('input[name="recommendOnly"], input[type=submit], button'); }, null, {timeout: 20000}).catch(() => {});
                    await idle(page);
                    const before = (await dialogTexts(page)).slice(-1)[0];
                    const box = form.locator('input[name="recommendOnly"]');
                    const present = await box.count();
                    record('p2-participants-edit-form', {dialog: before, recommendOnlyPresent: present, checked: present ? await box.isChecked() : null});
                    await shot(page, 'p2-participants-edit-form').catch(() => {});
                    if (present) {
                        await box.check();
                        const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
                        await loc(page, 'Edit assignment: the form\'s save', ok);
                        await ok.click(); await idle(page);
                        await page.waitForTimeout(800); await idle(page);
                        record('p2-participants-after-save', {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 400)}))});
                        sc.p2RecommendOnly = true; save();
                    } else {
                        const c = form.getByRole('link', {name: /Cancel/}).first();
                        if (await c.count()) await c.click(); else { const cb = form.getByRole('button', {name: /Cancel|Close/}).first(); if (await cb.count()) await cb.click(); }
                        await idle(page);
                    }
                    await openWorkflow(page, workflow(S.p2.id, 'workflow_4'), 'p2-mgr-after-recommendonly');
                });
                await readAs(page, u.se, S.p2.id, 'p2-se-recommendonly');
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- s1: scenario 1 — the assigned Editor (notice, buttons), the unassigned manager, the recommend-only section editor ----
    if (on('s1') && S.s1 && S.s1.id) {
        const {page, close} = await launch(app);
        try {
            await readAs(page, u.ed, S.s1.id, 's1-ed');
            await sect('s1 recommendOnly', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr');
                const row = page.locator('[role="dialog"]:visible').first().locator('li, tr, div').filter({hasText: /Rhea Recommend/}).filter({has: page.locator('button')}).last();
                const more = row.getByRole('button', {name: /More Actions|Options|Edit/}).first();
                if (!(await more.count())) { record('s1-participants-row', {absent: true}); return; }
                await loc(page, 'Participants: the recommending editor row menu', more);
                await more.click(); await idle(page);
                const items = await menuItems(page);
                record('s1-participants-row-menu', {items});
                const edit = page.getByRole('menuitem', {name: /^Edit/}).first();
                if (await edit.count()) { await edit.click(); await idle(page); } else { await more.click(); return; }
                const form = page.locator('[role="dialog"]:visible').last();
                await form.waitFor({timeout: 30000});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.querySelector('input[name="recommendOnly"]'); }, null, {timeout: 20000}).catch(() => {});
                await idle(page);
                const box = form.locator('input[name="recommendOnly"]');
                const present = await box.count();
                record('s1-participants-edit-form', {dialog: (await dialogTexts(page)).slice(-1)[0], recommendOnlyPresent: present});
                if (!present) return;
                await box.check();
                const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
                await ok.click(); await idle(page);
                await page.waitForTimeout(800); await idle(page);
                sc.s1RecommendOnly = true; save();
                await openWorkflow(page, workflow(S.s1.id, 'workflow_4'), 's1-mgr-after-recommendonly');
            });
            await readAs(page, u.rc, S.s1.id, 's1-rc');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- prod: P1 "Send To Production" by mgr; the sweep's Cancel first ----
    if (on('prod') && S.p1 && S.p1.id) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p1.id, 'workflow_4'), 'p1-mgr-before');
            await sect('p1 cancel sweep', async () => { await runDecision(page, 'Send To Production', 'p1-stp-cancel', {cancelAfterEdit: true}); });
            await openWorkflow(page, workflow(S.p1.id, 'workflow_4'), 'p1-mgr-after-cancel');
            await sect('p1 send to production', async () => {
                const r = await runDecision(page, 'Send To Production', 'p1-stp');
                record('p1-stp-summary', r);
            });
            await openWorkflow(page, workflow(S.p1.id), 'p1-mgr-after-landing');
            await openWorkflow(page, workflow(S.p1.id, 'workflow_4'), 'p1-mgr-after-workflow_4');
            await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'p1-mgr-after-workflow_5');
            await activityLog(page, 'p1-activity-log');
            await readAs(page, u.se, S.p1.id, 'p1-se-after', {keys: ['workflow_4', 'workflow_5']});
            await readAs(page, u.ce, S.p1.id, 'p1-ce-after');
            // the author: mail, the dashboard's Tasks panel, the workflow
            await mailFind(app, mail(u.au), S.p1.title, 'p1-author-mail');
            await signInAs(page, u.au);
            await page.goto(ctxUrl('/dashboard/mySubmissions')); await idle(page);
            await snap(page, 'p1-au-dashboard');
            await tasksPanel(page, 'p1-au-tasks');
            await openWorkflow(page, authorWorkflow(S.p1.id), 'p1-au-after-landing');
            await openWorkflow(page, authorWorkflow(S.p1.id, 'workflow_4'), 'p1-au-after-workflow_4');
            await openWorkflow(page, authorWorkflow(S.p1.id, 'workflow_5'), 'p1-au-after-workflow_5');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- skip: P2 "Send To Production" with "Skip this email"; no copyeditor, no files ----
    if (on('skip') && S.p2 && S.p2.id) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p2.id, 'workflow_4'), 'p2-mgr-before-decision');
            await sect('p2 send to production skip', async () => {
                const r = await runDecision(page, 'Send To Production', 'p2-stp-skip', {skipEmail: true});
                record('p2-stp-skip-summary', r);
            });
            await openWorkflow(page, workflow(S.p2.id, 'workflow_4'), 'p2-mgr-after-workflow_4');
            await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), 'p2-mgr-after-workflow_5');
            await activityLog(page, 'p2-activity-log');
            await readAs(page, u.se, S.p2.id, 'p2-se-after');
            // no mail for P2, with P1's mail as the control
            try {
                await app.mail.expectNone({to: mail(u.au), contains: S.p2.title, afterControl: {to: mail(u.au), contains: S.p1.title}});
                record('p2-author-mail-none', {none: true, inbox: await inbox(app, mail(u.au))});
                log('[p2 mail] none, control found');
            } catch (e) { record('p2-author-mail-none', {none: false, error: String(e.message).slice(0, 400), inbox: await inbox(app, mail(u.au))}); log('[p2 mail]', String(e.message).slice(0, 200)); }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- back: R1 "Move to Review" by se, then "Accept Submission" again by mgr; R2 by mgr (A1) ----
    if (on('back')) {
        const {page, close} = await launch(app);
        try {
            if (S.r1 && S.r1.id) {
                await sect('r1 move to review (se)', async () => {
                    await signInAs(page, u.se);
                    await openWorkflow(page, workflow(S.r1.id, 'workflow_4'), 'r1-se-before');
                    const r = await runDecision(page, BACK, 'r1-mtr', {appendBody: DECISION_BODY_MARK});
                    record('r1-mtr-summary', r);
                    await openWorkflow(page, workflow(S.r1.id), 'r1-se-after-landing');
                    const rk = roundKey(S.r1.rounds, 3);
                    if (rk) await openWorkflow(page, workflow(S.r1.id, rk), `r1-se-after-round`);
                    await openWorkflow(page, workflow(S.r1.id, 'workflow_4'), 'r1-se-after-workflow_4');
                    await openWorkflow(page, workflow(S.r1.id, 'workflow_1'), 'r1-se-after-workflow_1');
                });
                await mailFind(app, mail(u.au), S.r1.title, 'r1-author-mail');
                await sect('r1 accept again (mgr)', async () => {
                    await signInAs(page, u.mgr);
                    await activityLog(page, 'r1-activity-log').catch(() => {});
                    const rk = roundKey(S.r1.rounds, 3);
                    await openWorkflow(page, workflow(S.r1.id, rk), 'r1-mgr-round-before-accept');
                    // a revision on the round, if the round offers an upload, so the second acceptance has a file to tick
                    await sect('r1 revision upload', async () => {
                        const btns = page.getByRole('button', {name: /Upload/}).filter({visible: true});
                        const names = await btns.allInnerTexts();
                        record('r1-round-upload-buttons', {names});
                        const target = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
                        if (await target.count()) await uploadInto(page, (await target.count()) - 1, MD, 'r1-revision-upload');
                    });
                    const r = await runDecision(page, 'Accept Submission', 'r1-accept', {tick: (d) => d.checkboxes.filter((c) => c.visible && !c.checked && /notes|article|\.md|\.pdf/i.test(c.label)).map((c) => c.label)});
                    record('r1-accept-summary', r);
                    await openWorkflow(page, workflow(S.r1.id, 'workflow_4'), 'r1-mgr-copyediting-after-reaccept');
                    await activityLog(page, 'r1-activity-log-after');
                });
            }
            if (S.r2 && S.r2.id) {
                await sect('r2 move to review (mgr, never reviewed)', async () => {
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_4'), 'r2-mgr-before');
                    await sect('r2 cancel sweep', async () => { await runDecision(page, BACK, 'r2-mtr-cancel', {cancelAfterEdit: true}); });
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_4'), 'r2-mgr-after-cancel');
                    const r = await runDecision(page, BACK, 'r2-mtr', {appendBody: DECISION_BODY_MARK});
                    record('r2-mtr-summary', r);
                    await openWorkflow(page, workflow(S.r2.id), 'r2-mgr-after-landing');
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_1'), 'r2-mgr-after-workflow_1');
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_3'), 'r2-mgr-after-workflow_3');
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_4'), 'r2-mgr-after-workflow_4');
                    await activityLog(page, 'r2-activity-log');
                });
                await mailFind(app, mail(u.au), S.r2.title, 'r2-author-mail');
                await sect('r2 author', async () => {
                    await signInAs(page, u.au);
                    await openWorkflow(page, authorWorkflow(S.r2.id), 'r2-au-after-landing');
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // A list's own "Upload" control that opens the 3-tab wizard directly (the round's "Revisions Uploaded").
    async function uploadDirect(page, buttonName, file, label) {
        const btn = page.getByRole('button', {name: buttonName, exact: true}).first();
        await loc(page, `${label}: "${buttonName}"`, btn);
        await btn.click(); await idle(page);
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
        record(`${label}-wizard-step1`, {dialog: w1, title: w1 && w1.name});
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('tab', {name: /2\./}).waitFor({timeout: 30000}).catch(() => {});
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 600));
    }

    // ---- again: R1 back once more, a revision on the round, "Accept Submission" ticking it; R2 "Accept and Skip Review", the notice as se, then "Send To Production" and the notice gone ----
    if (on('again')) {
        const {page, close} = await launch(app);
        try {
            if (S.r1 && S.r1.id) {
                await sect('again r1', async () => {
                    await signInAs(page, u.se);
                    await openWorkflow(page, workflow(S.r1.id, 'workflow_4'), 'r1b-se-copyediting-before');
                    const r = await runDecision(page, BACK, 'r1b-mtr', {skipEmail: true, showAll: true});
                    record('r1b-mtr-summary', r);
                    await signInAs(page, u.mgr);
                    const rk = roundKey(S.r1.rounds, 3);
                    await openWorkflow(page, workflow(S.r1.id, rk), 'r1b-mgr-round');
                    await uploadDirect(page, 'Upload', MD, 'r1b-revision-upload');
                    const a = await runDecision(page, 'Accept Submission', 'r1b-accept', {skipEmail: true, tick: (d) => d.checkboxes.filter((c) => c.visible && !c.checked).map((c) => c.label)});
                    record('r1b-accept-summary', a);
                    await openWorkflow(page, workflow(S.r1.id, 'workflow_4'), 'r1b-mgr-copyediting-after');
                    await signInAs(page, u.se);
                    await openWorkflow(page, workflow(S.r1.id, 'workflow_4'), 'r1b-se-copyediting-after');
                });
            }
            if (S.r2 && S.r2.id) {
                await sect('again r2', async () => {
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_1'), 'r2b-mgr-submission');
                    const a = await runDecision(page, 'Accept and Skip Review', 'r2b-accept', {skipEmail: true});
                    record('r2b-accept-summary', a);
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_4'), 'r2b-mgr-copyediting');
                    await signInAs(page, u.se);
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_4'), 'r2b-se-copyediting-notice');
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_4'), 'r2b-mgr-copyediting-before-stp');
                    const p = await runDecision(page, 'Send To Production', 'r2b-stp', {skipEmail: true});
                    record('r2b-stp-summary', p);
                    await signInAs(page, u.se);
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_4'), 'r2b-se-copyediting-after-stp');
                    await openWorkflow(page, workflow(S.r2.id, 'workflow_5'), 'r2b-se-production-after-stp');
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- r3: a second scratch context with a reviewer; R3 reached Copyediting after a completed review → "Move to Review": the round's status with a reviewer on it ----
    if (on('r3')) {
        if (!sc.ctx2) {
            const t = tag('u32k4b');
            const users = [
                {username: `${t}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
                {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Reviewer'},
                {username: `${t}au`, roles: ['author'], givenName: 'Abe', familyName: 'Author'},
            ];
            const ctx = await app.api.createContext({tag: t, context: {name: `U32 K4b ${t}`, acronym: 'U32K4B', contactName: 'K4b Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.ctx2 = {tag: t, contextPath: ctx.path || t, users: {mgr: `${t}mgr`, rev: `${t}rev`, au: `${t}au`}};
            try {
                const r = await app.api.createSubmission({tag: `${t}r3`, context: sc.ctx2.contextPath, submitter: sc.ctx2.users.au, title: `K4 R3 reviewed ${t}`, decisions: isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'], reviewRounds: [{reviewers: [{username: sc.ctx2.users.rev, status: 'completed', ...(isOMP ? {} : {recommendation: 'accept'})}]}]});
                sc.ctx2.r3 = {id: r.submissionId, title: `K4 R3 reviewed ${t}`, stageId: r.stageId, rounds: r.reviewRounds || []};
                log('[seed r3]', r.submissionId, 'stage', r.stageId, JSON.stringify(r.reviewRounds));
            } catch (e) { log('[seed r3 FAILED]', String(e.message).slice(0, 600)); sc.ctx2.r3 = {error: String(e.message).slice(0, 600)}; }
            save();
        }
        const c2 = sc.ctx2;
        if (c2.r3 && c2.r3.id) {
            const wf2 = (id, key) => app.url(`/index.php/${c2.contextPath}/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
            const {page, close} = await launch(app);
            try {
                await signIn(page, c2.users.mgr, {contextPath: c2.contextPath}); await idle(page);
                const rk = roundKey(c2.r3.rounds, 3);
                await openWorkflow(page, wf2(c2.r3.id, rk), 'r3-mgr-round-before');
                // confirm the completed review if the row offers it ("Read Review" → "Confirm"), so the returned-back sentence has its condition
                await sect('r3 confirm review', async () => {
                    const rr = page.getByRole('button', {name: /Read Review/}).first();
                    if (!(await rr.count())) { record('r3-read-review', {absent: true}); return; }
                    await rr.click(); await idle(page);
                    const dlg = page.locator('[role="dialog"]:visible').last();
                    await dlg.waitFor({timeout: 30000});
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.innerText.length > 100 && !/Loading/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
                    const before = (await dialogTexts(page)).slice(-1)[0];
                    record('r3-read-review', {dialog: before});
                    const confirm = dlg.getByRole('button', {name: /^Confirm/}).first();
                    if (await confirm.count()) { await confirm.click(); await idle(page); await page.waitForTimeout(800); await idle(page); }
                    else { const c = dlg.getByRole('button', {name: /^(Close|Cancel)$/}).last(); if (await c.count()) { await c.click(); await idle(page); } }
                    await openWorkflow(page, wf2(c2.r3.id, rk), 'r3-mgr-round-confirmed');
                });
                await openWorkflow(page, wf2(c2.r3.id, 'workflow_4'), 'r3-mgr-copyediting-before');
                const r = await runDecision(page, BACK, 'r3-mtr', {skipEmail: true});
                record('r3-mtr-summary', r);
                await openWorkflow(page, wf2(c2.r3.id), 'r3-mgr-after-landing');
                await openWorkflow(page, wf2(c2.r3.id, rk), 'r3-mgr-after-round');
                await signOut(page);
            } finally { await close(); }
        }
    }

    // ---- a12: after "Send To Production", the "Copyediting" entry reached by the menu (same page) and by its address (fresh load) ----
    if (on('a12')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            for (const k of ['p1', 'r2']) {
                if (!S[k] || !S[k].id) continue;
                await sect(`a12 ${k}`, async () => {
                    await openWorkflow(page, workflow(S[k].id), `a12-${k}-landing`);
                    const item = page.locator('[role="dialog"]:visible').first().getByRole('link', {name: 'Copyediting', exact: true}).or(page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Copyediting', exact: true})).first();
                    await loc(page, 'workflow menu: "Copyediting"', item);
                    await item.click(); await idle(page);
                    await page.waitForFunction(() => /WORKFLOW: COPYEDITING/i.test(document.body.innerText), null, {timeout: 15000}).catch(() => {});
                    await idle(page);
                    const viaMenu = await wfInfo(page);
                    await snap(page, `a12-${k}-via-menu`, {info: viaMenu, url: page.url()});
                    log(`[a12 ${k} via menu]`, page.url(), JSON.stringify(viaMenu.headings.slice(0, 8)));
                    await page.reload(); await idle(page);
                    await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
                    await page.waitForFunction(() => /WORKFLOW: COPYEDITING/i.test(document.body.innerText), null, {timeout: 15000}).catch(() => {});
                    await idle(page);
                    const reloaded = await wfInfo(page);
                    await snap(page, `a12-${k}-reloaded`, {info: reloaded, url: page.url()});
                    log(`[a12 ${k} reloaded]`, page.url(), JSON.stringify(reloaded.headings.slice(0, 8)));
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- var: the "{$decision}" email variable on the back decision, a reviewed (V1) and a never-reviewed (V2) submission ----
    if (on('var')) {
        const viaReview = isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        for (const [k, decisions] of [['v1', viaReview], ['v2', ['skipExternalReview']]]) {
            if (S[k] && S[k].id) continue;
            const title = `K4 ${k.toUpperCase()} variable ${sc.tag}`;
            const r = await app.api.createSubmission({tag: `${sc.tag}${k}`, context: sc.contextPath, submitter: u.au, title, decisions, participants: [{username: u.se, role: 'sectionEditor'}]});
            S[k] = {id: r.submissionId, title, stageId: r.stageId, rounds: r.reviewRounds || []};
            sc.subs = S; save();
            log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, JSON.stringify(r.reviewRounds || []));
        }
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            for (const k of ['v1', 'v2']) {
                await sect(`${k} back with {$decision}`, async () => {
                    await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-mgr-before`);
                    const r = await runDecision(page, BACK, `${k}-mtr`, {appendBody: DECISION_BODY_MARK});
                    record(`${k}-mtr-summary`, r);
                    await openWorkflow(page, workflow(S[k].id), `${k}-mgr-after-landing`);
                });
                await mailFind(app, mail(u.au), S[k].title, `${k}-author-mail`);
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- omp: I1 (internal only) and I2 (both rounds) "Move to Review" ----
    if (on('omp') && isOMP) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            for (const k of ['i1', 'i2']) {
                if (!S[k] || !S[k].id) continue;
                await sect(`${k} move to review`, async () => {
                    await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-mgr-before`);
                    const r = await runDecision(page, BACK, `${k}-mtr`, {appendBody: DECISION_BODY_MARK});
                    record(`${k}-mtr-summary`, r);
                    await openWorkflow(page, workflow(S[k].id), `${k}-mgr-after-landing`);
                    const ik = roundKey(S[k].rounds, 2); const ek = roundKey(S[k].rounds, 3);
                    if (ik) await openWorkflow(page, workflow(S[k].id, ik), `${k}-mgr-after-internal-round`);
                    if (ek) await openWorkflow(page, workflow(S[k].id, ek), `${k}-mgr-after-external-round`);
                    await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-mgr-after-workflow_4`);
                });
                await mailFind(app, mail(u.au), S[k].title, `${k}-author-mail`);
            }
            await signOut(page);
        } finally { await close(); }
    }
});
