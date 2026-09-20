// U34 claim check, chunk K4: recommendations and the review-stage entry.
// Rule 13 (recording a recommendation: the "Notify Editors" page, the discussion, the
// "Recommendation" box and "Change decision"), Rule 14 (the "Request Revisions" choice
// window, decision and recommendation variants), Rule 15 (the minimum-reviews warning),
// Rule 16 ("Request Payment", OJS), Side effects "A recommendation" and "The publication
// fee", the settings bullets "Minimum Confirmed Reviews Required", Payments and "Limit to
// recommendations", register A4. Spec: docs/specs/U34-editorial-decision-recording.md
// lines 299–345, 406–409, 420–422, 444–458, 609–618.
//
// OJS/OMP: one scratch context (review.numReviewsPerSubmission = 2) with mgr, ed (manager-level
// editor), se1 (deciding), se2 (made recommend-only on screen), reviewers and an author:
//   S1  external round: rv1 completed, rv2 accepted; se1 + se2   → Rules 13, 14 (recommend), 15 (warning), A4
//   S2  external round: rv3 invited; se1 + ed                    → "Cancel Review Round" never asks, Rule 14 (decision), ed recommend-only
//   S3  external round: rv1, rv2 completed; se1                  → the minimum met: "Accept Submission" opens the wizard at once
//   M2  {OMP} internal round: ri1 invited; se1 + se2             → the internal round's buttons and warnings
// A second context without the review key (install default 0) with one submission in review (D1)
// → no warning; on OJS it is also the payments journal (P1 fee requested, P2 waived, P3 "Accept and Skip Review").
// OPS: a scratch server with mgr, mod, mod2 (recommend-only) and a queued preprint: the read-only
// control (no recommendation buttons, no "Notify Editors", no Review tab, no Payments tab).
//
//   PROBE_FEATURE=U34 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U34/K4/k4.js
//   PHASES=seed,flag,rec,change,choice,min,confirm,default,pay,waive2,extra,omppay,thank,ops   (default all; later phases reuse k4-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const ALL = ['seed', 'flag', 'rec', 'change', 'choice', 'min', 'confirm', 'default', 'pay', 'waive2', 'extra', 'omppay', 'thank', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);

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
// Every visible dialog as data: its accessible name, text and its buttons with their classes (the
// warning styling is a class), plus its radios with their labels and checked state.
const dialogTexts = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => ({text: (b.getAttribute('aria-label') || b.innerText || b.value || '').trim(), className: b.className.slice(0, 160)})).filter((b) => b.text).slice(0, 40),
        radios: [...d.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: (r.id && document.querySelector(`label[for="${r.id}"]`)?.innerText || r.closest('label')?.innerText || r.parentElement?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200)})),
        headings: [...d.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.getClientRects().length).map((h) => h.innerText.trim()).filter(Boolean).slice(0, 30),
    }))).catch(() => []);
// The workflow dialog as data: headings, the action-region buttons with their emphasis, every heading's
// following block (the "Recommendation", "Notification" and "Status" boxes), the tables and their row buttons.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 240)),
        rowButtons: [...t.querySelectorAll('tbody tr button, tbody tr a')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter(Boolean).slice(0, 30),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const headings = hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const boxes = hs.map((h) => ({h: h.innerText.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 400) : null, outer: (h.parentElement?.parentElement?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 500)})).filter((x) => /Recommendation|Notification|Status|Discussion/i.test(x.h)).slice(0, 12);
    const btnEls = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis);
    const buttons = btnEls.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const actionRegion = root.querySelector('[data-cy="workflow-action-items"]');
    const actionButtons = actionRegion ? [...actionRegion.querySelectorAll('button')].filter(vis).map((b) => ({text: b.innerText.trim(), primary: /\bbg-primary\b/.test(b.className), warnable: /negative/.test(b.className)})) : null;
    const links = [...root.querySelectorAll('a, button')].filter(vis).map((a) => a.innerText.trim()).filter((t) => /Change decision|Recommend/i.test(t)).slice(0, 20);
    const lines = (dlgs[0] ? dlgs[0].innerText : '').split('\n').map((l) => l.trim()).filter(Boolean);
    const closeAt = lines.indexOf('Close');
    const header = dlgs[0] ? lines.slice(closeAt >= 0 ? closeAt + 1 : 0, (closeAt >= 0 ? closeAt + 1 : 0) + 6).join(' | ') : null;
    return {dialogCount: dlgs.length, headings, boxes, buttons, actionButtons, recommendControls: links, tables, header};
});
// The decision wizard page as data: the steps rail, headings, buttons, checkboxes, radios, the recipients'
// chips, every TinyMCE editor's text, and the page's text.
const decisionInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const main = document.querySelector('main') || document.body;
    const labelOf = (i) => {
        const l = i.id && document.querySelector(`label[for="${i.id}"]`);
        return (l ? l.innerText : (i.closest('label') || i.parentElement || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    };
    return {
        url: location.href,
        steps: [...main.querySelectorAll('[role=tab], .pkpSteps__step, [class*="steps__step"], ol li button')].filter(vis).map((e) => ({text: e.innerText.trim().replace(/\s+/g, ' '), current: e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') != null || /current/.test(e.className)})).slice(0, 12),
        headings: [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40),
        buttons: [...main.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || '').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})).filter((b) => b.text).slice(0, 60),
        checkboxes: [...main.querySelectorAll('input[type=checkbox]')].map((i) => ({label: labelOf(i), checked: i.checked, visible: vis(i), name: i.name || null, id: i.id || null})).slice(0, 40),
        radios: [...main.querySelectorAll('input[type=radio]')].map((i) => ({label: labelOf(i), checked: i.checked, visible: vis(i), name: i.name || null, value: i.value})).slice(0, 20),
        chips: [...main.querySelectorAll('[class*="utosuggest"] [class*="election"], [class*="utosuggest"] .pkpBadge, [class*="utosuggest"] li')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 20),
        editors: (window.tinymce ? (window.tinymce.get() || window.tinymce.editors || []) : []).map((e) => ({id: e.id, text: (e.getContent({format: 'text'}) || '').replace(/\s+/g, ' ').trim().slice(0, 1500)})),
        inputs: [...main.querySelectorAll('input[type=text], input:not([type])')].filter(vis).map((i) => ({label: labelOf(i), value: i.value.slice(0, 200)})).filter((i) => i.value).slice(0, 10),
        attachments: [...main.querySelectorAll('[class*="ttachment"], [class*="composer__attachment"], [class*="fileAttach"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)).filter(Boolean).slice(0, 10),
        text: main.innerText.slice(0, 8000),
    };
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
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
    const isOJS = app.name === 'ojs';
    const ctxUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const workflow = (ctx, id, key) => ctxUrl(ctx, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const roundKey = (s) => `workflow_${s.reviewRounds[0].stageId}_${s.reviewRounds[0].id}`;
    const signInAs = async (page, ctx, u) => { await signIn(page, u, {contextPath: ctx}); await idle(page); };
    const mailOf = (u) => `${u}@mail.test`;

    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.text), text: d.text.slice(0, 1500)})), ...(extra || {})});
        log(`[${label}]`, app.name, 'header:', flat(info.header, 90), '| actions:', JSON.stringify((info.actionButtons || []).map((b) => `${b.text}${b.primary ? '*' : ''}`)), '| rec:', JSON.stringify(info.recommendControls), '| boxes:', JSON.stringify((info.boxes || []).map((b) => `${b.h}: ${flat(b.next || b.outer, 120)}`)), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)));
        return {info, dialogs, s, url: page.url()};
    }
    // Press a workflow button and read what follows: a dialog (recorded with its buttons' classes), a side
    // window, or the wizard page (recorded as its first page). Returns {dialogs, url, page1}.
    async function press(page, name, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        let btn = dlg.getByRole('button', {name, exact: true}).first();
        if (!(await btn.count())) btn = dlg.getByRole('link', {name, exact: true}).first();
        if (!(await btn.count())) { record(`${label}-absent`, {button: name, absent: true}); log(`[${label}] "${name}" absent`); return {absent: true}; }
        await loc(page, `${label}: "${name}"`, btn);
        await btn.click(); await idle(page);
        await page.waitForTimeout(1200); await idle(page);
        const dialogs = await dialogTexts(page);
        const url = page.url();
        const out = {pressed: name, url, onWizard: /\/decision\//.test(url), dialogs: dialogs.map((d) => ({name: d.name, headings: d.headings, text: d.text.slice(0, 1200), buttons: d.buttons, radios: d.radios}))};
        if (out.onWizard) out.page1 = await readWizardPage(page, `${label}-wizard`);
        else await snap(page, label, out);
        log(`[${label}]`, name, '→', out.onWizard ? `wizard ${flat(out.page1 && out.page1.headings.join(' / '), 120)}` : JSON.stringify(dialogs.slice(1).map((d) => `${d.name}: ${flat(d.text, 100)} [${d.buttons.map((b) => b.text).join('|')}]`)));
        return out;
    }
    async function readWizardPage(page, label) {
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !window.tinymce || !document.querySelector('textarea[id]') || (window.tinymce.editors || []).every((e) => e.initialized), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        await page.waitForTimeout(600);
        const d = await decisionInfo(page);
        await snap(page, label, {decision: d});
        return d;
    }
    // A dialog's button by name: the confirmation dialogs are stacked on the workflow dialog.
    const dialogButton = (page, name) => page.locator('[role="dialog"]:visible').last().getByRole('button', {name, exact: true}).first();
    // The Participants panel: the row of <familyName> → its menu → "Edit" → tick recommendOnly → OK (U32 K1's idiom).
    async function setRecommendOnly(page, familyName, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const row = dlg.locator('li, tr, div').filter({hasText: new RegExp(familyName)}).filter({has: page.locator('button')}).last();
        const more = row.getByRole('button', {name: /More Actions|Options|Edit/}).first();
        if (!(await more.count())) { record(`${label}-participants-row`, {absent: true}); log(`[${label}] no row menu for ${familyName}`); return false; }
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-participants-row-menu`, {items});
        const edit = page.getByRole('menuitem', {name: /^Edit/}).first();
        if (!(await edit.count())) return false;
        await edit.click(); await idle(page);
        const form = topWin(page);
        await form.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.querySelector('input[name="recommendOnly"]'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const before = (await dialogTexts(page)).slice(-1)[0];
        const box = form.locator('input[name="recommendOnly"]');
        const present = await box.count();
        const labelText = present ? await form.locator(`label[for="${await box.getAttribute('id')}"]`).innerText().catch(() => null) : null;
        record(`${label}-participants-edit-form`, {title: before && before.name, text: flat(before && before.text, 800), recommendOnlyPresent: present, checked: present ? await box.isChecked() : null, label: flat(labelText, 200)});
        await shot(page, `${label}-participants-edit-form`).catch(() => {});
        if (!present) { await closeTop(page); return false; }
        await box.check();
        const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
        await ok.click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        record(`${label}-participants-after-save`, {tables: info.tables.filter((t) => /Participant/i.test(t.name || '')), dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 400)}))});
        log(`[${label}] recommend-only set for ${familyName}`);
        return true;
    }
    // The discussions table on the workflow dialog: its rows, and the window a row opens (participants).
    async function readDiscussions(page, label, subjectRe) {
        const info = await wfInfo(page);
        const tables = info.tables.filter((t) => /Discussion/i.test(t.name || '') || t.columns.some((c) => /Name|From|Last Reply|Replies/i.test(c)));
        record(`${label}-discussions`, {headings: info.headings, tables});
        log(`[${label}] discussions:`, JSON.stringify(tables.map((t) => `${t.name}: ${t.rows.join(' || ')}`)).slice(0, 700));
        const dlg = page.locator('[role="dialog"]:visible').first();
        const rowLink = dlg.locator('table tbody tr').filter({hasText: subjectRe}).first().locator('a, button').first();
        if (!(await rowLink.count())) { record(`${label}-discussion-window`, {absent: true, subjectRe: String(subjectRe)}); return {tables, window: null}; }
        await loc(page, `${label}: the discussion row's first control`, rowLink);
        await rowLink.click(); await idle(page);
        await topWin(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 40; }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(600);
        const win = (await dialogTexts(page)).slice(-1)[0];
        const s = await snap(page, `${label}-discussion-window`, {window: win && {name: win.name, headings: win.headings, buttons: win.buttons.map((b) => b.text), text: win.text.slice(0, 3000)}});
        log(`[${label}] window:`, win && win.name, '|', flat(win && win.text, 500));
        await closeTop(page);
        return {tables, window: win, url: s.url};
    }
    // Attach the fixture PDF through the wizard's "Attach Files" window (upload source). Best effort, recorded.
    async function attachFile(page, label) {
        const att = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
        if (!(await att.count())) { record(`${label}-attach`, {absent: true}); return false; }
        await att.click(); await idle(page);
        const win = topWin(page);
        await win.waitFor({timeout: 30000});
        await page.waitForTimeout(600); await idle(page);
        const first = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-attach-window`, {name: first && first.name, buttons: first && first.buttons.map((b) => b.text), text: flat(first && first.text, 1500)});
        const up = win.getByRole('button', {name: /Upload File/}).first();
        if (!(await up.count())) { await closeTop(page); return false; }
        await up.click(); await idle(page); await page.waitForTimeout(400);
        const input = win.locator('input[type="file"]').first();
        await input.waitFor({state: 'attached', timeout: 15000});
        await input.setInputFiles(PDF);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /article\.pdf/.test(d.innerText); }, null, {timeout: 30000}).catch(() => {});
        await idle(page); await page.waitForTimeout(800);
        const mid = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-attach-uploaded`, {buttons: mid && mid.buttons.map((b) => b.text), text: flat(mid && mid.text, 1500)});
        // the window's own "Attach Files" attaches the uploaded file ("Add Files" is the upload source's other control)
        const add = win.getByRole('button', {name: 'Attach Files', exact: true}).last();
        if (await add.count()) { await loc(page, `${label}: the upload source's "Attach Files"`, add); await add.click(); await idle(page); }
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length === 0, null, {timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(400);
        const left = await dialogTexts(page);
        if (left.length) { record(`${label}-attach-window-still-open`, {dialogs: left.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.text), text: flat(d.text, 600)}))}); await closeTop(page); }
        const d = await decisionInfo(page);
        record(`${label}-attach-after`, {text: flat(d.text, 3000), buttons: d.buttons.map((b) => b.text), attachments: d.attachments});
        return /article\.pdf/.test(d.text);
    }
    // "Record Decision" from the current wizard page, then the closing window and the landing.
    async function recordDecision(page, label) {
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        await rec.click(); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const done = await dialogTexts(page);
        await snap(page, `${label}-recorded`, {dialogs: done.map((x) => ({name: x.name, headings: x.headings, text: flat(x.text, 800), buttons: x.buttons.map((b) => b.text)}))});
        log(`[${label} recorded]`, JSON.stringify(done.map((x) => ({name: x.name, text: flat(x.text, 200)}))));
        const dlg = page.locator('[role="dialog"]:visible').first();
        let leave = dlg.getByRole('link', {name: /View|Back|Return|Submission|Dashboard/}).first();
        if (!(await leave.count())) leave = dlg.getByRole('button', {name: /View|Back|Return|Submission|Dashboard|OK|Close/}).first();
        let landed = null;
        if (await leave.count()) {
            const lt = (await leave.innerText().catch(() => '')).trim();
            await leave.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            const info = await wfInfo(page).catch(() => ({}));
            landed = {pressed: lt, url: page.url(), header: info.header, boxes: info.boxes, actionButtons: info.actionButtons, recommendControls: info.recommendControls};
            await snap(page, `${label}-landed`, {landed, info});
            log(`[${label} landed]`, lt, '|', flat(info.header, 100), '| boxes:', JSON.stringify((info.boxes || []).map((b) => `${b.h}: ${flat(b.next || b.outer, 120)}`)));
        }
        return {done, landed};
    }
    // Walk the wizard's remaining pages with "Continue" (ticking any file offered) up to "Record Decision".
    async function walkToRecord(page, label) {
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        const cont = page.getByRole('button', {name: 'Continue', exact: true});
        const pages = [];
        for (let i = 2; i < 8 && !(await rec.isVisible().catch(() => false)); i++) {
            await cont.first().click(); await idle(page);
            const d = await readWizardPage(page, `${label}-page${i}`);
            for (const c of d.checkboxes.filter((c) => c.visible && !c.checked && c.id)) { await page.locator(`#${c.id}`).check({force: true}).catch(() => {}); }
            pages.push({n: i, headings: d.headings, steps: d.steps.map((s) => `${s.text}${s.current ? '*' : ''}`), buttons: d.buttons.map((b) => b.text)});
        }
        return pages;
    }
    async function seedContext(prefix, opts) {
        const t = tag(prefix);
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Maya', familyName: 'Managerson'},
            {username: `${t}se1`, roles: ['sectionEditor'], givenName: 'Dana', familyName: 'Decider'},
            {username: `${t}au`, roles: ['author'], givenName: 'Alex', familyName: 'Authorson'},
            {username: `${t}rv1`, roles: ['externalReviewer'], givenName: 'Rita', familyName: 'Reviewerone'},
            {username: `${t}rv2`, roles: ['externalReviewer'], givenName: 'Rob', familyName: 'Reviewertwo'},
            {username: `${t}rv3`, roles: ['externalReviewer'], givenName: 'Rae', familyName: 'Reviewerthree'},
        ];
        if (opts.full) {
            users.push({username: `${t}se2`, roles: ['sectionEditor'], givenName: 'Selma', familyName: 'Recommender'});
            users.push({username: `${t}ed`, roles: ['editor'], givenName: 'Eve', familyName: 'Journaleditor'});
            if (isOMP) users.push({username: `${t}ri1`, roles: ['internalReviewer'], givenName: 'Ian', familyName: 'Internalrev'});
        }
        const body = {tag: t, context: {contactName: `Principal Contact ${t}`, contactEmail: `${t}contact@mail.test`}, users};
        if (opts.review) body.review = {numReviewsPerSubmission: opts.review};
        const ctx = await app.api.createContext(body);
        log(`[seed] context ${t} (#${ctx.contextId})`);
        return t;
    }
    const ext = () => (isOMP ? {decisions: ['skipInternalReview'], stage: 'external'} : {decisions: ['sendExternalReview'], stage: undefined});
    async function seedSub(t, name, {reviewers, participants, decisions, stage, title}) {
        const e = ext();
        const body = {tag: `${t}${name}`, context: t, submitter: `${t}au`, title: title || `${name.toUpperCase()} recommend ${t}`, participants: participants.map((p) => ({username: `${t}${p[0]}`, role: p[1]}))};
        if (decisions !== null) {
            body.decisions = decisions || e.decisions;
            const round = {reviewers: (reviewers || []).map((r) => ({username: `${t}${r[0]}`, status: r[1]}))};
            if (stage || e.stage) round.stage = stage || e.stage;
            body.reviewRounds = [round];
        }
        const s = await app.api.createSubmission(body);
        log(`[seed] ${name} #${s.submissionId} stage ${s.stageId} rounds ${JSON.stringify(s.reviewRounds)}`);
        return {id: s.submissionId, title: body.title, stageId: s.stageId, reviewRounds: s.reviewRounds};
    }

    const {page, close} = await launch(app);
    page.on('dialog', async (d) => { record(`native-dialog-${Date.now()}`, {type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    try {
        // ---------------------------------------------------------------- OPS: the read-only control
        if (isOPS) {
            if (!on('ops')) return;
            await sect('ops', async () => {
                if (!sc.t) {
                    const t = tag('u34k4o');
                    await app.api.createContext({tag: t, users: [
                        {username: `${t}mgr`, roles: ['manager'], givenName: 'Maya', familyName: 'Managerson'},
                        {username: `${t}mod`, roles: ['sectionEditor'], givenName: 'Dana', familyName: 'Decider'},
                        {username: `${t}mod2`, roles: ['sectionEditor'], givenName: 'Selma', familyName: 'Recommender'},
                        {username: `${t}au`, roles: ['author'], givenName: 'Alex', familyName: 'Authorson'},
                    ]});
                    const q = await app.api.createSubmission({tag: `${t}q1`, context: t, submitter: `${t}au`, title: `Q1 preprint ${t}`, participants: [{username: `${t}mod`, role: 'sectionEditor'}, {username: `${t}mod2`, role: 'sectionEditor'}]});
                    sc.t = t; sc.q1 = {id: q.submissionId, stageId: q.stageId}; save();
                }
                const t = sc.t;
                await signInAs(page, t, `${t}mgr`);
                await openWorkflow(page, workflow(t, sc.q1.id, `workflow_${sc.q1.stageId}`), 'ops-mgr-q1');
                await setRecommendOnly(page, 'Recommender', 'ops-mgr-q1');
                await signInAs(page, t, `${t}mod2`);
                await openWorkflow(page, workflow(t, sc.q1.id, `workflow_${sc.q1.stageId}`), 'ops-mod2-q1-recommendonly');
                await signInAs(page, t, `${t}mod`);
                await openWorkflow(page, workflow(t, sc.q1.id, `workflow_${sc.q1.stageId}`), 'ops-mod-q1');
                await signInAs(page, t, `${t}mgr`);
                for (const [name, p] of [['workflow', '/management/settings/workflow'], ['distribution', '/management/settings/distribution']]) {
                    await page.goto(ctxUrl(t, p)); await idle(page);
                    const tabs = await page.locator('[role="tab"]:visible').allInnerTexts();
                    await snap(page, `ops-mgr-settings-${name}`, {tabs: tabs.map((x) => x.trim())});
                    log(`[ops settings ${name}] tabs:`, JSON.stringify(tabs.map((x) => x.trim())));
                }
                await page.goto(ctxUrl(t, '/payments')); await idle(page);
                await snap(page, 'ops-mgr-payments-url');
                await signOut(page);
            });
            return;
        }

        // ---------------------------------------------------------------- seed
        if (on('seed') && !sc.t) await sect('seed', async () => {
            const t = await seedContext('u34k4', {full: true, review: 2});
            sc.t = t;
            sc.S1 = await seedSub(t, 's1', {reviewers: [['rv1', 'completed'], ['rv2', 'accepted']], participants: [['se1', 'sectionEditor'], ['se2', 'sectionEditor']]});
            sc.S2 = await seedSub(t, 's2', {reviewers: [['rv3', 'invited']], participants: [['se1', 'sectionEditor'], ['ed', 'editor']]});
            sc.S3 = await seedSub(t, 's3', {reviewers: [['rv1', 'completed'], ['rv2', 'completed']], participants: [['se1', 'sectionEditor']]});
            if (isOMP) sc.M2 = await seedSub(t, 'm2', {decisions: ['sendInternalReview'], stage: 'internal', reviewers: [['ri1', 'invited']], participants: [['se1', 'sectionEditor'], ['se2', 'sectionEditor']]});
            save();
        });
        const t = sc.t;
        const u = (n) => `${t}${n}`;

        // ---------------------------------------------------------------- flag: the recommend-only assignments (Settings bullet "Limit to recommendations")
        if (on('flag') && !sc.flagged) await sect('flag', async () => {
            await signInAs(page, t, u('mgr'));
            await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-mgr-round-before-flag');
            await setRecommendOnly(page, 'Recommender', 's1-mgr');
            await openWorkflow(page, workflow(t, sc.S2.id, roundKey(sc.S2)), 's2-mgr-round-before-flag');
            await setRecommendOnly(page, 'Journaleditor', 's2-mgr');
            if (isOMP) {
                await openWorkflow(page, workflow(t, sc.M2.id, roundKey(sc.M2)), 'm2-mgr-round-before-flag');
                await setRecommendOnly(page, 'Recommender', 'm2-mgr');
            }
            // the default end of the bullet: se1 is assigned with the box off and decides (S1 as se1 below shows the decisions)
            await signOut(page);
            sc.flagged = true; save();
        });

        // ---------------------------------------------------------------- rec: Rule 13, Side effects "A recommendation", A4
        if (on('rec')) await sect('rec', async () => {
            await signInAs(page, t, u('se2'));
            const r0 = await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-se2-round-recommendonly');
            // the recommending editor's buttons (never ask the minimum-reviews question: the dialog list is recorded)
            const p = await press(page, 'Recommend Accept', 's1-se2-recommend-accept');
            if (!p.onWizard) throw new Error(`Recommend Accept did not open the wizard: ${JSON.stringify(p.dialogs).slice(0, 300)}`);
            const attached = await attachFile(page, 's1-se2-recommend-accept');
            const page1 = await readWizardPage(page, 's1-se2-recommend-accept-page1-final');
            record('s1-se2-recommend-accept-summary', {attached, headings: page1.headings, steps: page1.steps, buttons: page1.buttons.map((b) => b.text), chips: page1.chips, editors: page1.editors, hasSkip: page1.buttons.some((b) => /Skip this email/i.test(b.text))});
            const rec = await recordDecision(page, 's1-se2-recommend-accept');
            // the round as the recommending editor: the Recommendation box, "Change decision", the discussions panel
            await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-se2-round-after-accept');
            const d2 = await readDiscussions(page, 's1-se2-after-accept', /Recommendation|recommend/i);
            const change = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Change decision', exact: true}).first();
            record('s1-se2-change-decision-link', {present: await change.count()});
            if (await change.count()) {
                await loc(page, 's1-se2: "Change decision"', change);
                await change.click(); await idle(page); await page.waitForTimeout(500);
                const info = await wfInfo(page);
                await snap(page, 's1-se2-after-change-decision', {info});
                log('[s1-se2 change decision]', JSON.stringify(info.recommendControls), JSON.stringify(info.boxes.map((b) => `${b.h}: ${flat(b.next, 100)}`)));
            }
            // the deciding editor: the box, the discussion and its participants, the email's From
            await signInAs(page, t, u('se1'));
            await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-se1-round-after-accept');
            await readDiscussions(page, 's1-se1-after-accept', /Recommendation|recommend/i);
            const mail = await app.mail.find({to: mailOf(u('se1')), contains: 'recommendation', timeoutMs: 30000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const full = mail && mail.ID ? await app.mail.fullMessage(mail.ID).catch(() => null) : null;
            record('s1-se1-recommendation-mail', {summary: mail && {From: mail.From, To: mail.To, Cc: mail.Cc, Subject: mail.Subject, Attachments: mail.Attachments}, error: mail && mail.error, text: full && flat(full.Text, 1500), attachments: full && (full.Attachments || []).map((a) => a.FileName)});
            log('[s1-se1 mail]', JSON.stringify(mail && {From: mail.From, Subject: mail.Subject, Attachments: mail.Attachments}));
            const mail2 = await app.mail.count({to: mailOf(u('se2')), contains: 'recommendation'}).catch(() => null);
            record('s1-se2-recommendation-mail-count', {count: mail2});
            // the manager (unassigned, manager level): the box on their round
            await signInAs(page, t, u('mgr'));
            await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-mgr-round-after-accept');
            await readDiscussions(page, 's1-mgr-after-accept', /Recommendation|recommend/i);
            await signOut(page);
            sc.recorded = true; save();
        });

        // ---------------------------------------------------------------- change: "Change decision" brings the buttons back; a second recording replaces the first
        if (on('change')) await sect('change', async () => {
            await signInAs(page, t, u('se2'));
            await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-se2-round-before-decline');
            const ch = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Change decision', exact: true}).first();
            if (await ch.count()) { await ch.click(); await idle(page); await page.waitForTimeout(500); await snap(page, 's1-se2-after-change-decision-2', {info: await wfInfo(page)}); }
            const pd = await press(page, 'Recommend Decline', 's1-se2-recommend-decline');
            if (pd.onWizard) {
                await recordDecision(page, 's1-se2-recommend-decline');
                await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-se2-round-after-decline');
                await readDiscussions(page, 's1-se2-after-decline', /Recommendation|recommend/i);
                await signInAs(page, t, u('se1'));
                await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-se1-round-after-decline');
                await readDiscussions(page, 's1-se1-after-decline', /Recommendation|recommend/i);
            }
            await signOut(page);
        });

        // ---------------------------------------------------------------- choice: Rule 14, the recommendation variant (and the internal round on OMP)
        if (on('choice')) await sect('choice', async () => {
            await signInAs(page, t, u('se2'));
            await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-se2-round-choice');
            const ch = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Change decision', exact: true}).first();
            if (await ch.count()) { await ch.click(); await idle(page); await page.waitForTimeout(500); }
            // the window, then its close control
            const w1 = await press(page, 'Recommend Revisions', 's1-se2-recommend-revisions-window');
            if (!w1.onWizard) {
                const win = topWin(page);
                const closeBtn = win.getByRole('button', {name: /^Close$/}).first();
                record('s1-se2-recommend-revisions-close-control', {present: await closeBtn.count(), buttons: (w1.dialogs.slice(-1)[0] || {}).buttons});
                if (await closeBtn.count()) { await loc(page, 's1-se2: the choice window\'s close control', closeBtn); await closeBtn.click(); } else { await page.keyboard.press('Escape'); }
                await idle(page); await page.waitForTimeout(800);
                await snap(page, 's1-se2-recommend-revisions-after-close', {url: page.url(), dialogs: (await dialogTexts(page)).map((d) => d.name)});
                // again: the second option, "Next", the wizard's heading, then leave it with the letter changed
                const ch2 = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Change decision', exact: true}).first();
                if (await ch2.count()) { await ch2.click(); await idle(page); await page.waitForTimeout(500); }
                const w2 = await press(page, 'Recommend Revisions', 's1-se2-recommend-revisions-window-2');
                const radios = topWin(page).locator('input[type=radio]');
                await radios.nth(1).check({force: true}); await idle(page);
                record('s1-se2-recommend-revisions-second-chosen', {radios: (await dialogTexts(page)).slice(-1)[0]?.radios});
                const next = topWin(page).getByRole('button', {name: 'Next', exact: true});
                await loc(page, 's1-se2: the choice window\'s "Next"', next);
                await next.click(); await idle(page);
                await page.waitForURL(/\/decision\//, {timeout: 30000}).catch(() => {});
                const d = await readWizardPage(page, 's1-se2-recommend-resubmit-wizard');
                log('[s1-se2 resubmit wizard]', JSON.stringify(d.headings), JSON.stringify(d.editors.map((e) => flat(e.text, 200))));
                // leave with something changed and unsaved
                await page.evaluate(() => { const e = window.tinymce && window.tinymce.editors && window.tinymce.editors[0]; if (e) e.insertContent('<p>Unsaved words from the claim check.</p>'); });
                const cancel = page.getByRole('button', {name: /^Cancel$/}).first();
                const cancelLink = page.locator('main a, main button').filter({hasText: /Cancel|Back to|Return/i}).first();
                const leaveBtn = (await cancel.count()) ? cancel : cancelLink;
                record('s1-se2-resubmit-wizard-leave-control', {present: await leaveBtn.count(), text: await leaveBtn.innerText().catch(() => null)});
                if (await leaveBtn.count()) {
                    await leaveBtn.click(); await idle(page); await page.waitForTimeout(1000);
                    await snap(page, 's1-se2-resubmit-wizard-left', {url: page.url(), dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 400), buttons: x.buttons.map((b) => b.text)}))});
                    const confirm = topWin(page).getByRole('button', {name: /Yes|OK|Leave|Continue|Discard/}).first();
                    if (await confirm.count()) { await confirm.click(); await idle(page); await page.waitForTimeout(800); await snap(page, 's1-se2-resubmit-wizard-left-confirmed', {url: page.url()}); }
                }
            }
            if (isOMP) {
                // the internal round's recommendation buttons: "Recommend Send to External Review" and its letter
                await openWorkflow(page, workflow(t, sc.M2.id, roundKey(sc.M2)), 'm2-se2-internal-round-recommendonly');
                const ps = await press(page, 'Recommend Send to External Review', 'm2-se2-recommend-send-external');
                if (ps.onWizard) { await page.goto(workflow(t, sc.M2.id, roundKey(sc.M2))); await idle(page); }
                const pr = await press(page, 'Recommend Revisions', 'm2-se2-recommend-revisions-window');
                if (!pr.onWizard) await closeTop(page);
            }
            await signOut(page);
        });

        // ---------------------------------------------------------------- min: Rule 15 and Rule 14's decision variant, as the deciding Section editor
        if (on('min')) await sect('min', async () => {
            await signInAs(page, t, u('se1'));
            const back = async (s) => { await page.goto(workflow(t, s.id, roundKey(s))); await idle(page); await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {}); await page.waitForTimeout(500); await idle(page); };
            await openWorkflow(page, workflow(t, sc.S1.id, roundKey(sc.S1)), 's1-se1-round-min');
            // "Accept Submission": the dialog, Cancel, the round unchanged, again and "Yes, Continue"
            let a = await press(page, 'Accept Submission', 's1-se1-accept-dialog');
            if (!a.onWizard && a.dialogs.length > 1) {
                await dialogButton(page, 'Cancel').click(); await idle(page); await page.waitForTimeout(600);
                const info = await wfInfo(page);
                await snap(page, 's1-se1-accept-cancelled', {url: page.url(), info, dialogs: (await dialogTexts(page)).map((d) => d.name)});
                a = await press(page, 'Accept Submission', 's1-se1-accept-dialog-2');
                await dialogButton(page, 'Yes, Continue').click(); await idle(page);
                await page.waitForURL(/\/decision\//, {timeout: 30000}).catch(() => {});
                const d = await readWizardPage(page, 's1-se1-accept-wizard-after-yes');
                log('[s1-se1 accept wizard]', JSON.stringify(d.headings), JSON.stringify(d.steps));
                await back(sc.S1);
            }
            // "Request Revisions": the dialog, then the choice window (Rule 14 decision variant), its close, the two headings
            let r = await press(page, 'Request Revisions', 's1-se1-request-revisions-dialog');
            if (!r.onWizard && r.dialogs.length > 1 && r.dialogs.slice(-1)[0].buttons.some((b) => /Yes, Continue/.test(b.text))) {
                await dialogButton(page, 'Yes, Continue').click(); await idle(page); await page.waitForTimeout(800);
                const w = await dialogTexts(page);
                await snap(page, 's1-se1-request-revisions-window', {dialogs: w.map((d) => ({name: d.name, headings: d.headings, text: flat(d.text, 800), buttons: d.buttons, radios: d.radios}))});
                log('[s1-se1 choice window]', JSON.stringify(w.slice(-1)[0] && {name: w.slice(-1)[0].name, radios: w.slice(-1)[0].radios, buttons: w.slice(-1)[0].buttons.map((b) => b.text)}));
                const closeBtn = topWin(page).getByRole('button', {name: /^Close$/}).first();
                if (await closeBtn.count()) await closeBtn.click(); else await page.keyboard.press('Escape');
                await idle(page); await page.waitForTimeout(800);
                await snap(page, 's1-se1-request-revisions-after-close', {url: page.url(), dialogs: (await dialogTexts(page)).map((d) => d.name)});
                for (const [nth, label] of [[0, 'first'], [1, 'second']]) {
                    await press(page, 'Request Revisions', `s1-se1-request-revisions-dialog-${label}`);
                    if (await dialogButton(page, 'Yes, Continue').count()) { await dialogButton(page, 'Yes, Continue').click(); await idle(page); await page.waitForTimeout(800); }
                    const radios = topWin(page).locator('input[type=radio]');
                    if (await radios.count()) { await radios.nth(nth).check({force: true}); await idle(page); }
                    record(`s1-se1-request-revisions-${label}-chosen`, {radios: (await dialogTexts(page)).slice(-1)[0]?.radios});
                    await topWin(page).getByRole('button', {name: 'Next', exact: true}).click(); await idle(page);
                    await page.waitForURL(/\/decision\//, {timeout: 30000}).catch(() => {});
                    const d = await readWizardPage(page, `s1-se1-request-revisions-${label}-wizard`);
                    log(`[s1-se1 revisions ${label} wizard]`, JSON.stringify(d.headings));
                    await back(sc.S1);
                }
            }
            // "Create New Review Round": the dialog, Cancel
            const n = await press(page, 'Create New Review Round', 's1-se1-new-round-dialog');
            if (!n.onWizard && n.dialogs.length > 1) { await dialogButton(page, 'Cancel').click(); await idle(page); await page.waitForTimeout(500); }
            else if (n.onWizard) await back(sc.S1);
            // "Decline Submission": never asks
            const dd = await press(page, 'Decline Submission', 's1-se1-decline');
            if (dd.onWizard) await back(sc.S1);
            // S2 (no completed review): "Cancel Review Round" never asks; the recommend-only Journal editor's view
            await openWorkflow(page, workflow(t, sc.S2.id, roundKey(sc.S2)), 's2-se1-round');
            const c = await press(page, 'Cancel Review Round', 's2-se1-cancel-round');
            if (c.onWizard) await back(sc.S2);
            else if (c.dialogs.length > 1) await closeTop(page);
            const a2 = await press(page, 'Accept Submission', 's2-se1-accept-dialog');
            if (!a2.onWizard && a2.dialogs.length > 1) { await dialogButton(page, 'Cancel').click(); await idle(page); }
            // S3 (two completed of two): "Accept Submission" opens the wizard at once
            await openWorkflow(page, workflow(t, sc.S3.id, roundKey(sc.S3)), 's3-se1-round');
            const a3 = await press(page, 'Accept Submission', 's3-se1-accept');
            if (a3.onWizard) await back(sc.S3);
            else if (a3.dialogs.length > 1) await closeTop(page);
            // the recommend-only Journal editor (manager level) on S2
            await signInAs(page, t, u('ed'));
            await openWorkflow(page, workflow(t, sc.S2.id, roundKey(sc.S2)), 's2-ed-round-recommendonly');
            const pe = await press(page, 'Recommend Accept', 's2-ed-recommend-accept');
            if (pe.onWizard) await back(sc.S2);
            if (isOMP) {
                await signInAs(page, t, u('se1'));
                await openWorkflow(page, workflow(t, sc.M2.id, roundKey(sc.M2)), 'm2-se1-internal-round');
                for (const name of ['Accept Submission', 'Request Revisions', 'Resubmit for Review', 'Send to External Review', 'Create New Review Round', 'Decline Submission', 'Cancel Review Round']) {
                    const x = await press(page, name, `m2-se1-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`);
                    if (x.absent) continue;
                    if (x.onWizard) { await back(sc.M2); continue; }
                    if (x.dialogs.length > 1) {
                        const yes = dialogButton(page, 'Yes, Continue');
                        if (await yes.count()) { await yes.click(); await idle(page); await page.waitForTimeout(800); await snap(page, `m2-se1-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-after-yes`, {url: page.url(), dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, radios: d.radios, buttons: d.buttons.map((b) => b.text)}))}); }
                        if (/\/decision\//.test(page.url())) await back(sc.M2); else { await closeTop(page); await back(sc.M2); }
                    }
                }
            }
            await signOut(page);
        });

        // ---------------------------------------------------------------- confirm: S3's two submitted reviews marked "Complete" on screen, then "Accept Submission" at once
        if (on('confirm')) await sect('confirm', async () => {
            await signInAs(page, t, u('se1'));
            await openWorkflow(page, workflow(t, sc.S3.id, roundKey(sc.S3)), 's3-se1-round-before-confirm');
            const dlg = page.locator('[role="dialog"]:visible').first();
            for (let n = 0; n < 2; n++) {
                const rows = dlg.getByRole('table', {name: /Reviewers/}).locator('tbody tr').filter({hasText: 'Review Submitted'});
                if (!(await rows.count())) break;
                const row = rows.first();
                const read = row.getByRole('button', {name: 'Read Review', exact: true});
                await loc(page, `s3-se1 confirm ${n}: "Read Review"`, read);
                await read.click(); await idle(page);
                const modal = page.getByRole('dialog', {name: /Review Details/}).last();
                await modal.waitFor({timeout: 30000});
                await modal.getByRole('button', {name: 'Modify Review', exact: true}).waitFor({timeout: 30000}).catch(() => {});
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Modify Review'); return b && !b.disabled; }, null, {timeout: 30000}).catch(() => {});
                await idle(page);
                const win = (await dialogTexts(page)).slice(-1)[0];
                await snap(page, `s3-se1-review-details-${n}`, {window: win && {name: win.name, buttons: win.buttons.map((b) => b.text), text: flat(win.text, 1500)}});
                const mark = modal.getByRole('button', {name: 'Mark as Complete', exact: true});
                await loc(page, `s3-se1 confirm ${n}: "Mark as Complete"`, mark);
                await mark.click(); await idle(page);
                const confirm = page.locator('[data-cy="dialog"]').filter({hasText: 'Mark this review as complete?'});
                await confirm.waitFor({timeout: 30000});
                record(`s3-se1-mark-complete-dialog-${n}`, {dialogs: (await dialogTexts(page)).slice(-1).map((d) => ({name: d.name, text: flat(d.text, 400), buttons: d.buttons.map((b) => b.text)}))});
                await confirm.getByRole('button', {name: 'Mark as Complete', exact: true}).click(); await idle(page);
                await page.getByText('The review has been marked as complete.').first().waitFor({timeout: 30000}).catch(() => {});
                await page.waitForTimeout(500);
                const closeBtn = modal.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
                if (await closeBtn.count()) { await closeBtn.click().catch(() => {}); await idle(page); }
                await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length <= 1, null, {timeout: 15000}).catch(() => {});
                await page.waitForTimeout(800); await idle(page);
                const info = await wfInfo(page);
                record(`s3-se1-after-confirm-${n}`, {reviewers: info.tables.filter((x) => /Reviewer/.test(x.name || '')).map((x) => x.rows), boxes: info.boxes});
                log(`[s3 confirm ${n}]`, JSON.stringify(info.tables.filter((x) => /Reviewer/.test(x.name || '')).map((x) => x.rows)));
            }
            await openWorkflow(page, workflow(t, sc.S3.id, roundKey(sc.S3)), 's3-se1-round-confirmed');
            const a3 = await press(page, 'Accept Submission', 's3-se1-accept-confirmed');
            if (a3.onWizard) { await page.goto(workflow(t, sc.S3.id, roundKey(sc.S3))); await idle(page); }
            else if (a3.dialogs.length > 1) await closeTop(page);
            const r3 = await press(page, 'Request Revisions', 's3-se1-request-revisions-confirmed');
            if (!r3.onWizard && r3.dialogs.length > 1) await closeTop(page);
            await signOut(page);
        });

        // ---------------------------------------------------------------- default: the install default (0) end of "Minimum Confirmed Reviews Required"; the payments journal on OJS
        if (on('default') && !sc.t2) await sect('default-seed', async () => {
            const t2 = await seedContext('u34k4d', {full: false});
            sc.t2 = t2;
            sc.D1 = await seedSub(t2, 'd1', {reviewers: [['rv1', 'completed']], participants: [['se1', 'sectionEditor']], title: `D1 fee ${t2}`});
            if (isOJS) {
                sc.P2 = await seedSub(t2, 'p2', {reviewers: [['rv2', 'completed']], participants: [['se1', 'sectionEditor']], title: `P2 waive ${t2}`});
                sc.P3 = await seedSub(t2, 'p3', {decisions: null, participants: [['se1', 'sectionEditor']], title: `P3 skip ${t2}`});
            }
            save();
        });
        if (on('default')) await sect('default', async () => {
            const t2 = sc.t2;
            await signInAs(page, t2, `${t2}se1`);
            await openWorkflow(page, workflow(t2, sc.D1.id, roundKey(sc.D1)), 'd1-se1-round-default');
            const a = await press(page, 'Accept Submission', 'd1-se1-accept-default');
            if (a.onWizard) { await page.goto(workflow(t2, sc.D1.id, roundKey(sc.D1))); await idle(page); }
            else if (a.dialogs.length > 1) await closeTop(page);
            await signOut(page);
        });

        // ---------------------------------------------------------------- pay: Rule 16, Side effects "The publication fee", Settings "Payments" (OJS)
        if (on('pay') && isOJS) await sect('pay', async () => {
            const t2 = sc.t2;
            const u2 = (n) => `${t2}${n}`;
            if (!sc.payConfigured) {
                await signInAs(page, t2, u2('mgr'));
                await page.goto(ctxUrl(t2, '/management/settings/distribution')); await idle(page);
                const tab = page.locator('#payments-button');
                await loc(page, 'settings: the Payments tab', tab);
                await tab.click(); await idle(page); await page.waitForTimeout(500);
                await snap(page, 'pay-mgr-settings-payments-default');
                const panel = page.locator('#payments');
                const enable = panel.getByRole('checkbox').first();
                if (!(await enable.isChecked())) { await enable.check(); await idle(page); await page.waitForTimeout(400); }
                const currency = panel.getByRole('combobox', {name: 'Currency'});
                await currency.waitFor({timeout: 15000});
                const method = panel.getByRole('combobox').nth(1);
                const methodLabel = await panel.locator('label, legend').filter({hasText: /Payment|Method|Plugin/}).allInnerTexts().catch(() => []);
                record('pay-mgr-settings-payments-enabled-fields', {methodLabel: methodLabel.map((x) => flat(x, 120)), methodOptions: await method.locator('option').allInnerTexts(), currencyOptionCount: await currency.locator('option').count()});
                await snap(page, 'pay-mgr-settings-payments-enabled');
                await currency.selectOption({label: 'US Dollar'});
                await method.selectOption({label: 'Manual Fee Payment'});
                await idle(page); await page.waitForTimeout(600);
                const instr = panel.locator('textarea').first();
                await instr.waitFor({timeout: 15000}).catch(() => {});
                const instrLabel = (await instr.count()) ? await panel.locator(`label[for="${await instr.getAttribute('id')}"]`).innerText().catch(() => null) : null;
                if (await instr.count()) await instr.fill('Pay by bank transfer to the journal (claim check).');
                await snap(page, 'pay-mgr-settings-payments-filled', {instrLabel: flat(instrLabel, 200), instrPresent: await instr.count()});
                await panel.getByRole('button', {name: 'Save', exact: true}).click(); await idle(page);
                await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15000}).catch(() => {});
                await snap(page, 'pay-mgr-settings-payments-saved', {statuses: await page.locator('[role="status"], [role="alert"], .pkpFormPage__status, .pkpFieldError').allInnerTexts().then((a) => a.map((x) => flat(x, 200)).filter(Boolean)).catch(() => [])});
                await page.reload(); await idle(page);
                await page.locator('#payments-button').click(); await idle(page); await page.waitForTimeout(800);
                const cur2 = page.locator('#payments').getByRole('combobox', {name: 'Currency'});
                const met2 = page.locator('#payments').getByRole('combobox').nth(1);
                const reloaded = {enabled: await page.locator('#payments').getByRole('checkbox').first().isChecked().catch(() => null), currency: await cur2.inputValue().catch(() => null), method: await met2.inputValue().catch(() => null), instructions: await page.locator('#payments textarea').first().inputValue().catch(() => null), navLinks: await page.locator('nav a, aside a').allInnerTexts().then((a) => a.map((x) => x.trim()).filter((x) => /Payment/i.test(x))).catch(() => [])};
                await snap(page, 'pay-mgr-settings-payments-reloaded', reloaded);
                log('[pay settings reloaded]', JSON.stringify(reloaded));
                // the Payments page: "Payment Types" holds the Article Processing Charge
                await page.goto(ctxUrl(t2, '/payments')); await idle(page);
                await snap(page, 'pay-mgr-payments-page', {tabs: await page.locator('#subscriptionsTabs a, [role="tab"]').allInnerTexts().catch(() => [])});
                const pt = page.locator('a[name="paymentTypes"]');
                await loc(page, 'payments: the "Payment Types" tab', pt);
                await pt.click(); await idle(page);
                const form = page.locator('#paymentTypesForm');
                await form.waitFor({timeout: 30000});
                await page.waitForTimeout(500); await idle(page);
                const labels = await form.locator('label').allInnerTexts();
                record('pay-mgr-payment-types-labels', {labels: labels.map((x) => x.trim()), sections: await form.locator('legend, h3, h4, .section > label').allInnerTexts().catch(() => [])});
                await snap(page, 'pay-mgr-payment-types-default', {fee: await form.locator('input[name="publicationFee"]').inputValue().catch(() => null)});
                const fee = form.locator('input[name="publicationFee"]');
                await loc(page, 'payment types: the publication fee box', fee);
                if ((await fee.inputValue()) !== '100') {
                    await fee.fill('100');
                    await form.getByRole('button', {name: 'Save', exact: true}).click(); await idle(page);
                    await page.waitForTimeout(1000); await idle(page);
                    await snap(page, 'pay-mgr-payment-types-saved', {value: await fee.inputValue().catch(() => null), notifications: await page.locator('.pkp_notification, [role="status"], [role="alert"]').allInnerTexts().catch(() => [])});
                }
                sc.payConfigured = true; save();
                await signOut(page);
            }
            if (!sc.P4) {
                sc.P4 = await seedSub(t2, 'p4', {reviewers: [['rv1', 'completed']], participants: [['se1', 'sectionEditor']], title: `P4 fee ${t2}`});
                sc.P5 = await seedSub(t2, 'p5', {reviewers: [['rv2', 'completed']], participants: [['se1', 'sectionEditor']], title: `P5 waive ${t2}`});
                save();
            }
            // P1: "Accept Submission" with the fee requested
            await signInAs(page, t2, u2('se1'));
            await openWorkflow(page, workflow(t2, sc.P4.id, roundKey(sc.P4)), 'p1-se1-round-payments');
            const a = await press(page, 'Accept Submission', 'p1-se1-accept');
            if (a.onWizard) {
                const pages = await walkToRecord(page, 'p1-se1-accept');
                record('p1-se1-accept-pages', {page1: {headings: a.page1.headings, steps: a.page1.steps, radios: a.page1.radios, buttons: a.page1.buttons.map((b) => b.text)}, pages});
                await recordDecision(page, 'p1-se1-accept');
                // the workflow after: any payment status shown to the editor
                await openWorkflow(page, workflow(t2, sc.P4.id), 'p1-se1-workflow-after');
            }
            // the author: the Tasks panel row and the email
            await signInAs(page, t2, u2('au'));
            await page.goto(ctxUrl(t2, '/dashboard/mySubmissions')); await idle(page);
            const bell = page.getByRole('button', {name: /^Tasks/}).first();
            await loc(page, 'author dashboard: the Tasks bell', bell);
            await bell.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            const tasks = await dialogTexts(page);
            await snap(page, 'p1-au-tasks', {rows: await page.locator('[role="dialog"]:visible').last().locator('tr.gridRow').allInnerTexts().then((r) => r.map((x) => flat(x, 300))).catch(() => []), dialogs: tasks.map((d) => ({name: d.name, text: flat(d.text, 1500)}))});
            const payRow = page.locator('[role="dialog"]:visible').last().locator('tr.gridRow').filter({hasText: /payment|fee/i}).first();
            if (await payRow.count()) {
                const link = payRow.locator('a').first();
                await loc(page, 'author tasks: the payment row link', link);
                await link.click(); await idle(page); await page.waitForTimeout(800);
                await snap(page, 'p1-au-payment-row-followed', {url: page.url()});
            }
            const m = await app.mail.find({to: mailOf(u2('au')), subject: 'Payment Request Notification', timeoutMs: 30000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const full = m && m.ID ? await app.mail.fullMessage(m.ID).catch(() => null) : null;
            record('p1-au-payment-mail', {summary: m && {From: m.From, To: m.To, Subject: m.Subject}, error: m && m.error, text: full && flat(full.Text, 1200)});
            log('[p1 au mail]', JSON.stringify(m && {From: m.From, Subject: m.Subject}));
            // P2: "Waive"
            await signInAs(page, t2, u2('se1'));
            await openWorkflow(page, workflow(t2, sc.P5.id, roundKey(sc.P5)), 'p2-se1-round-payments');
            const w = await press(page, 'Accept Submission', 'p2-se1-accept');
            if (w.onWizard) {
                const waive = page.getByRole('radio', {name: /Waive/}).first();
                if (await waive.count()) await waive.check({force: true});
                await readWizardPage(page, 'p2-se1-accept-page1-waive');
                const pages = await walkToRecord(page, 'p2-se1-accept');
                record('p2-se1-accept-pages', {pages});
                await recordDecision(page, 'p2-se1-accept');
            }
            await signInAs(page, t2, u2('au'));
            await page.goto(ctxUrl(t2, '/dashboard/mySubmissions')); await idle(page);
            await page.getByRole('button', {name: /^Tasks/}).first().click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            await snap(page, 'p2-au-tasks', {rows: await page.locator('[role="dialog"]:visible').last().locator('tr.gridRow').allInnerTexts().then((r) => r.map((x) => flat(x, 300))).catch(() => [])});
            const control = await app.mail.find({to: mailOf(u2('au')), contains: sc.P5.title, timeoutMs: 30000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const payCount = await app.mail.count({to: mailOf(u2('au')), subject: 'Payment Request Notification'}).catch(() => null);
            record('p2-au-mail', {control: control && {Subject: control.Subject, From: control.From, error: control.error}, paymentRequestCount: payCount});
            // P3: "Accept and Skip Review" from the Submission stage
            await signInAs(page, t2, u2('se1'));
            await openWorkflow(page, workflow(t2, sc.P3.id, `workflow_${sc.P3.stageId}`), 'p3-se1-submission-stage');
            const s = await press(page, 'Accept and Skip Review', 'p3-se1-accept-skip');
            if (s.onWizard) { await page.goto(workflow(t2, sc.P3.id)); await idle(page); }
            await signOut(page);
        });
        // ---------------------------------------------------------------- extra: a Guest Editor decides (OJS), the Submission stage for a recommend-only editor, the Review settings screen, the press's Distribution tabs
        if (on('extra')) await sect('extra', async () => {
            if (!sc.S5) {
                if (isOJS) {
                    await app.api.createContext({tag: t, users: [{username: u('ge'), roles: ['guestEditor'], givenName: 'Gus', familyName: 'Guesteditor'}]}).catch(async () => null);
                }
                sc.S5 = await seedSub(t, 's5', {decisions: null, participants: [['se1', 'sectionEditor'], ['se2', 'sectionEditor']], title: `S5 submission stage ${t}`});
                save();
            }
            await signInAs(page, t, u('mgr'));
            await openWorkflow(page, workflow(t, sc.S5.id, `workflow_${sc.S5.stageId}`), 's5-mgr-submission-stage');
            await setRecommendOnly(page, 'Recommender', 's5-mgr');
            // the Review settings screen: the field that names the minimum
            await page.goto(ctxUrl(t, '/management/settings/workflow')); await idle(page);
            const rtab = page.locator('#review-button');
            if (await rtab.count()) { await rtab.click(); await idle(page); await page.waitForTimeout(500); }
            const minBox = page.getByLabel(/Minimum Confirmed Reviews Required/).first();
            await snap(page, 'settings-review-minimum', {tabs: await page.locator('[role="tab"]:visible').allInnerTexts().then((a) => a.map((x) => x.trim())), minPresent: await minBox.count(), minValue: (await minBox.count()) ? await minBox.inputValue().catch(() => null) : null});
            if (await minBox.count()) await loc(page, 'Settings › Workflow › Review: "Minimum Confirmed Reviews Required"', minBox);
            log('[settings review]', JSON.stringify({minPresent: await minBox.count(), minValue: (await minBox.count()) ? await minBox.inputValue().catch(() => null) : null}));
            if (isOMP) {
                await page.goto(ctxUrl(t, '/management/settings/distribution')); await idle(page);
                const tabs = await page.locator('[role="tab"]:visible').allInnerTexts();
                await snap(page, 'omp-mgr-settings-distribution', {tabs: tabs.map((x) => x.trim())});
                log('[omp distribution tabs]', JSON.stringify(tabs.map((x) => x.trim())));
                await page.goto(ctxUrl(t, '/payments')); await idle(page);
                await snap(page, 'omp-mgr-payments-url');
            }
            // the recommend-only editor on the Submission stage
            await signInAs(page, t, u('se2'));
            await openWorkflow(page, workflow(t, sc.S5.id, `workflow_${sc.S5.stageId}`), 's5-se2-submission-stage-recommendonly');
            const sendName = isOMP ? 'Send to Internal Review' : 'Send for Review';
            const sf = await press(page, sendName, 's5-se2-send-for-review');
            if (sf.onWizard) { await page.goto(workflow(t, sc.S5.id, `workflow_${sc.S5.stageId}`)); await idle(page); }
            else if (sf.dialogs.length > 1) await closeTop(page);
            for (const name of ['Accept and Skip Review', 'Decline Submission', 'Recommend Accept', 'Recommend Decline']) {
                const x = await press(page, name, `s5-se2-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`);
                if (x.absent) continue;
                if (x.onWizard) { await page.goto(workflow(t, sc.S5.id, `workflow_${sc.S5.stageId}`)); await idle(page); }
                else if (x.dialogs.length > 1) await closeTop(page);
            }
            if (isOJS) {
                // the Guest Editor decides too: a small journal of its own (a context tag cannot be reused to add a user)
                if (!sc.t3) {
                    const t3 = tag('u34k4g');
                    await app.api.createContext({tag: t3, users: [
                        {username: `${t3}mgr`, roles: ['manager'], givenName: 'Maya', familyName: 'Managerson'},
                        {username: `${t3}ge`, roles: ['guestEditor'], givenName: 'Gus', familyName: 'Guesteditor'},
                        {username: `${t3}au`, roles: ['author'], givenName: 'Alex', familyName: 'Authorson'},
                        {username: `${t3}rv1`, roles: ['externalReviewer'], givenName: 'Rita', familyName: 'Reviewerone'},
                    ]});
                    const s4 = await app.api.createSubmission({tag: `${t3}s4`, context: t3, submitter: `${t3}au`, title: `S4 guest editor ${t3}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: `${t3}rv1`, status: 'completed'}]}], participants: [{username: `${t3}ge`, role: 'guestEditor'}]});
                    sc.t3 = t3; sc.S4 = {id: s4.submissionId, stageId: s4.stageId, reviewRounds: s4.reviewRounds}; save();
                }
                await signInAs(page, sc.t3, `${sc.t3}ge`);
                await openWorkflow(page, workflow(sc.t3, sc.S4.id, roundKey(sc.S4)), 's4-ge-round');
                const g = await press(page, 'Accept Submission', 's4-ge-accept');
                if (!g.onWizard && g.dialogs.length > 1) { await dialogButton(page, 'Cancel').click().catch(() => {}); await idle(page); }
                else if (g.onWizard) { await page.goto(workflow(sc.t3, sc.S4.id, roundKey(sc.S4))); await idle(page); }
            }
            await signOut(page);
        });

        // ---------------------------------------------------------------- omppay: the press's Distribution › Payments tab, enabled, and "Accept Submission" after it (the {OJS} control)
        if (on('omppay') && isOMP) await sect('omppay', async () => {
            const t2 = sc.t2;
            const u2 = (n) => `${t2}${n}`;
            await signInAs(page, t2, u2('mgr'));
            await page.goto(ctxUrl(t2, '/management/settings/distribution')); await idle(page);
            await page.locator('#payments-button').click(); await idle(page); await page.waitForTimeout(500);
            const panel = page.locator('#payments');
            await snap(page, 'omppay-mgr-settings-payments-default', {labels: await panel.locator('label, legend').allInnerTexts().then((a) => a.map((x) => flat(x, 160))).catch(() => [])});
            const enable = panel.getByRole('checkbox').first();
            if (!(await enable.isChecked())) { await enable.check(); await idle(page); await page.waitForTimeout(400); }
            const currency = panel.getByRole('combobox', {name: 'Currency'});
            await currency.waitFor({timeout: 15000});
            const method = panel.getByRole('combobox').nth(1);
            record('omppay-mgr-settings-payments-enabled-fields', {labels: await panel.locator('label, legend').allInnerTexts().then((a) => a.map((x) => flat(x, 160))).catch(() => []), methodOptions: await method.locator('option').allInnerTexts()});
            await currency.selectOption({label: 'US Dollar'});
            await method.selectOption({label: 'Manual Fee Payment'}).catch(async () => { await method.selectOption({index: 0}); });
            await idle(page); await page.waitForTimeout(600);
            const instr = panel.locator('textarea').first();
            if (await instr.count()) await instr.fill('Pay by bank transfer to the press (claim check).');
            await snap(page, 'omppay-mgr-settings-payments-filled');
            await panel.getByRole('button', {name: 'Save', exact: true}).click(); await idle(page);
            await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15000}).catch(() => {});
            await page.reload(); await idle(page);
            await page.locator('#payments-button').click(); await idle(page); await page.waitForTimeout(800);
            const reloaded = {enabled: await page.locator('#payments').getByRole('checkbox').first().isChecked().catch(() => null), currency: await page.locator('#payments').getByRole('combobox', {name: 'Currency'}).inputValue().catch(() => null), method: await page.locator('#payments').getByRole('combobox').nth(1).inputValue().catch(() => null), navLinks: await page.locator('nav a, aside a').allInnerTexts().then((a) => a.map((x) => x.trim()).filter((x) => /Payment/i.test(x))).catch(() => [])};
            await snap(page, 'omppay-mgr-settings-payments-reloaded', reloaded);
            log('[omppay reloaded]', JSON.stringify(reloaded));
            await page.goto(ctxUrl(t2, '/payments')); await idle(page);
            await snap(page, 'omppay-mgr-payments-url');
            await signInAs(page, t2, u2('se1'));
            await openWorkflow(page, workflow(t2, sc.D1.id, roundKey(sc.D1)), 'omppay-se1-round');
            const a = await press(page, 'Accept Submission', 'omppay-se1-accept');
            if (a.onWizard) { await page.goto(workflow(t2, sc.D1.id, roundKey(sc.D1))); await idle(page); }
            else if (a.dialogs.length > 1) await closeTop(page);
            await signOut(page);
        });

        // ---------------------------------------------------------------- thank: S3's confirmed reviews thanked ("Reviewer Thanked" counts as confirmed too)
        if (on('thank')) await sect('thank', async () => {
            await signInAs(page, t, u('se1'));
            await openWorkflow(page, workflow(t, sc.S3.id, roundKey(sc.S3)), 's3-se1-round-before-thank');
            const dlg = page.locator('[role="dialog"]:visible').first();
            for (let n = 0; n < 2; n++) {
                const btn = dlg.getByRole('table', {name: /Reviewers/}).getByRole('button', {name: 'Thank Reviewer', exact: true}).first();
                if (!(await btn.count())) break;
                await loc(page, `s3-se1 thank ${n}: "Thank Reviewer"`, btn);
                await btn.click(); await idle(page);
                await topWin(page).waitFor({timeout: 30000});
                await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await page.waitForTimeout(800); await idle(page);
                const win = (await dialogTexts(page)).slice(-1)[0];
                await snap(page, `s3-se1-thank-window-${n}`, {window: win && {name: win.name, buttons: win.buttons.map((b) => b.text), text: flat(win.text, 1200)}});
                const send = topWin(page).getByRole('button', {name: /^(Thank Reviewer|Send|OK|Save)$/}).last();
                if (await send.count()) { await send.click(); await idle(page); }
                await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length <= 1, null, {timeout: 20000}).catch(() => {});
                await page.waitForTimeout(800); await idle(page);
                const info = await wfInfo(page);
                record(`s3-se1-after-thank-${n}`, {reviewers: info.tables.filter((x) => /Reviewer/.test(x.name || '')).map((x) => x.rows)});
                log(`[s3 thank ${n}]`, JSON.stringify(info.tables.filter((x) => /Reviewer/.test(x.name || '')).map((x) => x.rows)));
            }
            await openWorkflow(page, workflow(t, sc.S3.id, roundKey(sc.S3)), 's3-se1-round-thanked');
            const a3 = await press(page, 'Accept Submission', 's3-se1-accept-thanked');
            if (a3.onWizard) { await page.goto(workflow(t, sc.S3.id, roundKey(sc.S3))); await idle(page); }
            else if (a3.dialogs.length > 1) await closeTop(page);
            await signOut(page);
        });

        // ---------------------------------------------------------------- waive2: the "Waive" choice re-driven on a fresh submission (a one-run fact is never corrects)
        if (on('waive2') && isOJS) await sect('waive2', async () => {
            const t2 = sc.t2;
            const u2 = (n) => `${t2}${n}`;
            const n = (sc.waiveRuns || 0) + 1;
            const P = await seedSub(t2, `p${5 + n}`, {reviewers: [['rv3', 'completed']], participants: [['se1', 'sectionEditor']], title: `P${5 + n} waive again ${t2}`});
            sc[`P${5 + n}`] = P; sc.waiveRuns = n; save();
            const before = await app.mail.count({to: mailOf(u2('au')), subject: 'Payment Request Notification'}).catch(() => null);
            await signInAs(page, t2, u2('se1'));
            await openWorkflow(page, workflow(t2, P.id, roundKey(P)), `waive${n}-se1-round`);
            const a = await press(page, 'Accept Submission', `waive${n}-se1-accept`);
            if (!a.onWizard) throw new Error('no wizard');
            const waive = page.getByLabel('Waive', {exact: true});
            await loc(page, `waive${n}: the "Waive" radio by label`, waive);
            await waive.click(); await idle(page); await page.waitForTimeout(300);
            const d1 = await readWizardPage(page, `waive${n}-se1-page1-chosen`);
            log(`[waive${n}] chosen:`, JSON.stringify(d1.radios));
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const d2 = await readWizardPage(page, `waive${n}-se1-page2`);
            // back to the first page through the rail, to see whether the choice survived
            const rail = page.getByRole('button', {name: /Request Payment/}).first();
            if (await rail.count()) { await rail.click(); await idle(page); await page.waitForTimeout(400); }
            const d3 = await readWizardPage(page, `waive${n}-se1-page1-again`);
            log(`[waive${n}] after back:`, JSON.stringify(d3.radios), d3.headings);
            const pages = await walkToRecord(page, `waive${n}-se1-accept`);
            record(`waive${n}-se1-accept-pages`, {pages, page2: {headings: d2.headings}});
            await recordDecision(page, `waive${n}-se1-accept`);
            await signInAs(page, t2, u2('au'));
            await page.goto(ctxUrl(t2, '/dashboard/mySubmissions')); await idle(page);
            await page.getByRole('button', {name: /^Tasks/}).first().click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            const rows = await page.locator('[role="dialog"]:visible').last().locator('tr.gridRow').allInnerTexts().then((r) => r.map((x) => flat(x, 300))).catch(() => []);
            await snap(page, `waive${n}-au-tasks`, {rows});
            const control = await app.mail.find({to: mailOf(u2('au')), contains: P.title, timeoutMs: 30000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const after = await app.mail.count({to: mailOf(u2('au')), subject: 'Payment Request Notification'}).catch(() => null);
            const list = await app.mail.inboxFor(mailOf(u2('au'))).catch(() => []);
            record(`waive${n}-au-mail`, {before, after, control: control && {Subject: control.Subject, From: control.From, error: control.error}, inbox: (list || []).map((m) => ({Subject: m.Subject, snippet: flat(m.Snippet, 120)})).slice(0, 12)});
            log(`[waive${n}] tasks:`, JSON.stringify(rows), '| payment mails before/after:', before, after);
            await signOut(page);
        });
    } finally {
        await close();
    }
});
