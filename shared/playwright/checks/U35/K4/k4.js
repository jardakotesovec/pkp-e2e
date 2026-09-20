// U35 claim check, chunk K4: "Notify" (Rule 8), "Login As" (Rule 9), "Remove" (Rule 10),
// the assignments the journal makes by itself (Rule 11), Side effects "On Remove", "On an
// automatic editor assignment at submit", "On Login As", the Settings lines "Editorial
// Assignments", "Editor Assigned (Auto)" and the recipient's notification settings, register A5, A8.
// Spec: docs/specs/U35-stage-participants.md lines 239–323, 349–365, 393–414, 571–580, 606–616.
//
// One scratch context per app (tag u35k4…), throwaway users, and submissions
//   S1  Copyediting (OJS/OMP) / Production (OPS): se1, se2, ce, ce2, ed, pe, mgrse-as-SE, admin-as-SE (+ OPS: no assistants)
//   S2  Production (OJS/OMP): se1, le                       (Ready for Production; se1 removes own row)
//   S3  Submission stage: se1, se2                          ("Assign Editor"; the last editors removed)
//   S5  Submission stage: nobody                            (the "needs an editor" control)
//   the seeded journal: a wizard submission by author.alex (the automatic assignment, t15)
//   OJS/OPS scratch: a wizard submission by au (nobody assigned on a later journal, the managers' task)
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U35/K4/k4.js
//   PHASES=seed,notify,typed,own,loginas,remove,auto,settings,scratchauto,notes   (default all; later phases reuse k4-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const FIXTURES = {ojs: path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf'), ops: path.join(REPO, 'apps/ops/playwright/fixtures/files/preprint.pdf')};
const ALL = ['seed', 'notify', 'typed', 'own', 'loginas', 'levels2', 'remove', 'lasteditor', 'auto', 'contact', 'settings', 'scratchauto', 'opsauto2', 'notes'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); record(`${name}-FAILED`, {error: String(e.stack || e).slice(0, 1200)}); }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const dialogTexts = (page) => page.locator('[role="dialog"]').evaluateAll((els) =>
    els.filter((d) => d.getClientRects().length).map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
        links: [...d.querySelectorAll('a')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 40),
    }))).catch(() => []);
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const headings = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const actions = [...root.querySelectorAll('[data-cy="workflow-action-items"] button, [data-cy="workflow-action-items"] a')].filter(vis).map((b) => (b.innerText || '').trim()).filter(Boolean);
    const discussions = [...root.querySelectorAll('[data-cy="discussion-manager"] tbody tr, [data-cy="discussion-manager"] li')].filter(vis).map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200));
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 20);
    const head = root.innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
    const header = (document.querySelector('header') || {}).innerText || '';
    return {dialogCount: dlgs.length, head, headings, buttons, actions, discussions, notices, url: location.href, header: header.replace(/\s+/g, ' ').slice(0, 300)};
});
const participantsPanel = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const pm = dlg.querySelector('[data-cy="participant-manager"]');
    if (!pm) return {absent: true, headings: [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => e.innerText.trim())};
    const items = [...pm.querySelectorAll(':scope > ul > li, li')].filter(vis).map((li) => ({
        text: li.innerText.trim().replace(/\s+/g, ' ').slice(0, 220),
        buttons: [...li.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean),
    }));
    const buttons = [...pm.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean).filter((t) => !/More Actions/.test(t));
    return {items, buttons, text: pm.innerText.replace(/\s+/g, ' ').slice(0, 3000)};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[role=status], [role=alert], .pkp_notification, [class*="pkpNotification"], [class*="notification"]')]
    .filter((e) => e.getClientRects().length && e.innerText.trim())
    .map((e) => { const r = e.getBoundingClientRect(); return {text: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200), top: Math.round(r.top), left: Math.round(r.left), right: Math.round(innerWidth - r.right)}; }).slice(0, 10)).catch(() => []);
async function waitToast(page, re, ms = 6000) {
    await page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, {timeout: ms}).catch(() => {});
    return toasts(page);
}
const selectOptions = (sel) => sel.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected}))).catch(() => []);
const messageContent = (page) => page.evaluate(() => {
    const ta = [...document.querySelectorAll('[role=dialog] textarea[name="message"], [role=dialog] textarea[id^="message"]')].pop();
    if (!ta) return {present: false};
    const ed = window.tinymce && window.tinymce.get(ta.id);
    return {present: true, id: ta.id, editor: !!ed, content: ed ? ed.getContent().replace(/\s+/g, ' ').slice(0, 2500) : ta.value.slice(0, 2500)};
}).catch((e) => ({error: String(e.message)}));
async function setMessage(page, html) {
    await page.waitForFunction(() => { const ta = [...document.querySelectorAll('[role=dialog] textarea[name="message"], [role=dialog] textarea[id^="message"]')].pop(); return ta && window.tinymce && window.tinymce.get(ta.id) && window.tinymce.get(ta.id).initialized; }, null, {timeout: 20000}).catch(() => {});
    return page.evaluate((html) => {
        const ta = [...document.querySelectorAll('[role=dialog] textarea[name="message"], [role=dialog] textarea[id^="message"]')].pop();
        const ed = ta && window.tinymce && window.tinymce.get(ta.id);
        if (!ed) return {set: false};
        ed.setContent(html); ed.save(); ed.fire('change');
        return {set: true, content: ed.getContent().slice(0, 500)};
    }, html).catch((e) => ({error: String(e.message)}));
}
const mailTo = (u) => `${u}@mail.test`;
async function mailFind(app, to, contains, ms = 20000) {
    try { const m = await app.mail.find({to, contains, timeoutMs: ms}); const full = await app.mail.fullMessage(m.ID).catch(() => null); return {found: true, subject: m.Subject, from: m.From, to: m.To, date: m.Date, text: full ? flat(full.Text, 700) : null}; }
    catch (e) { return {found: false, error: String(e.message).slice(0, 160)}; }
}
const mailCount = (app, to, contains) => app.mail.count({to, contains}).catch((e) => ({error: String(e.message)}));

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOPS = app.name === 'ops', isOJS = app.name === 'ojs', isOMP = app.name === 'omp';
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.contextPath}${p}`);
    const workflow = (id, key, cp) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const signInAs = async (page, u, cp) => { await signIn(page, u, {contextPath: cp || sc.contextPath}); await idle(page); };
    const U = (k) => `${sc.tag}${k}`;
    const NAMES = {mgr: 'Mira Manager', mgrse: 'Mona Managersub', ed: 'Ed Editor', pe: 'Pat Prodeditor', se1: 'Sid Sectionone', se2: 'Sue Sectiontwo', se3: 'Sam Sectionthree', ce: 'Cal Copyeditor', ce2: 'Cam Copytwo', le: 'Lea Layout', fund: 'Fay Funding', au: 'Ava Author', au2: 'Abe Authortwo', admin: 'admin admin'};
    const SE_ROLE = isOPS ? 'Moderator' : isOMP ? 'Series editor' : 'Section editor';
    const S1_KEY = isOPS ? 'workflow_5' : 'workflow_4';
    const S2_KEY = 'workflow_5';
    const S3_KEY = isOPS ? 'workflow_5' : 'workflow_1';
    const STAGE_KEYS = isOPS ? ['workflow_5'] : isOMP ? ['workflow_1', 'workflow_2', 'workflow_3', 'workflow_4', 'workflow_5'] : ['workflow_1', 'workflow_3', 'workflow_4', 'workflow_5'];
    const DISC_TEMPLATE = isOPS ? /^Discussion \(Production\)/ : /^Discussion \(Copyediting\)/;
    const DISC_ROW = isOPS ? /Discussion \(Production\)/ : /Discussion \(Copyediting\)/;

    // ---- workflow helpers ---------------------------------------------------------
    async function waitPanel(page) {
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => {
            const dlgs = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length);
            return dlgs.length > 1 || (dlgs[0] && (dlgs[0].querySelector('nav button, nav a, [class*="sideMenu"] button') || /error|Error|not found/.test(dlgs[0].innerText)));
        }, null, {timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
    }
    async function waitRows(page, name) {
        await page.getByRole('button', {name: new RegExp(`^${name || ''}.*More Actions$`)}).first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
    }
    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await waitPanel(page);
        await waitRows(page, '');
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const panel = await participantsPanel(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, panel, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)})), ...(extra || {})});
        log(`[${label}]`, app.name, 'url:', page.url(), 'head:', JSON.stringify((info.head || []).slice(0, 3)), 'panel:', JSON.stringify((panel.items || []).map((i) => i.text.slice(0, 60))), 'disc:', JSON.stringify((info.discussions || []).slice(0, 6)));
        return {info, panel, dialogs, s};
    }
    async function rowMenu(page, name, label) {
        await waitRows(page, esc(name));
        const more = page.getByRole('button', {name: new RegExp(`^${esc(name)}.*More Actions$`)}).first();
        await loc(page, `${label}: row "${name}" menu`, more);
        if (!(await more.count())) { record(`${label}-row-${name.split(' ')[0]}-menu`, {row: name, absent: true}); log(`[${label}] no row menu for ${name}`); return {absent: true, items: []}; }
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-row-${name.split(' ')[0]}-menu`, {row: name, items});
        log(`[${label}] ${name} menu:`, JSON.stringify(items.map((i) => i.text)));
        return {items, more};
    }
    async function closeMenu(page, more) {
        if (await page.locator('[role="menuitem"]:visible').count()) { await more.click().catch(() => {}); await page.waitForTimeout(200); }
        if (await page.locator('[role="menuitem"]:visible').count()) { await page.locator('[role="dialog"]:visible').first().locator('h1, h2').first().click({force: true}).catch(() => {}); await page.waitForTimeout(200); }
    }
    // A row's "Notify": read the window; then send with {template: /re/|null, message: html|null} or leave by {leave:'close'}.
    async function notifyWindow(page, name, label, opts = {}) {
        const {items, more, absent} = await rowMenu(page, name, label);
        if (absent) return {absent: true};
        const notify = page.getByRole('menuitem', {name: /^Notify$/}).first();
        if (!(await notify.count())) { await closeMenu(page, more); record(`${label}-notify`, {row: name, noNotify: true, items: items.map((i) => i.text)}); log(`[${label}] no "Notify" for ${name}`); return {noNotify: true, items}; }
        await notify.click(); await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('select[name="template"], textarea[name="message"]'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const w = topWin(page);
        const dl = (await dialogTexts(page)).slice(-1)[0] || {};
        const tsel = w.locator('select[name="template"]');
        const templates = (await tsel.count()) ? await selectOptions(tsel) : null;
        const sections = await w.locator('legend, h3, h4, h5, label').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 160)).filter(Boolean)).catch(() => []);
        const out = {row: name, title: dl.name, text: flat(dl.text, 1500), templates: templates && templates.map((t) => t.text), sections, message: await messageContent(page), buttons: dl.buttons, links: dl.links};
        await snap(page, `${label}-notify`, out);
        log(`[${label}] Notify "${name}":`, dl.name, '| templates:', JSON.stringify(out.templates), '| buttons:', JSON.stringify(dl.buttons), '| links:', JSON.stringify(dl.links));
        if (opts.leave === 'close') {
            const c = w.getByRole('button', {name: /^Close$/}).first();
            if (await c.count()) await c.click(); await page.waitForTimeout(600); await idle(page);
            return out;
        }
        if (opts.template) {
            const opt = (templates || []).find((t) => opts.template.test(t.text));
            if (opt) { await tsel.selectOption(opt.value); await idle(page); await page.waitForTimeout(800); await idle(page); out.chosen = opt.text; out.prefilled = await messageContent(page); }
            else out.templateAbsent = String(opts.template);
        }
        if (opts.message != null) {
            const prefilled = (await messageContent(page)).content || '';
            out.set = await setMessage(page, opts.append ? `${prefilled}<p>${opts.message}</p>` : opts.message);
        }
        const send = w.getByRole('button', {name: /^(Notify|OK|Send)$/}).last();
        await loc(page, `${label}: Notify window's submit`, send);
        const seen = [];
        const onResp = (r) => { if (/notify|participant|tasks|discussion/i.test(r.url()) && r.request().method() === 'POST') seen.push({method: 'POST', status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 140)}); };
        page.on('response', onResp);
        // a mutation observer catches a toast that comes and goes between two reads
        await page.evaluate(() => { window.__k4toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const t = (n.innerText || n.textContent || '').trim().replace(/\s+/g, ' '); if (/Notification sent|Please ensure|error/i.test(t)) window.__k4toasts.push(t.slice(0, 200)); } }).observe(document.body, {childList: true, subtree: true}); }).catch(() => {});
        await send.click();
        out.toasts = await waitToast(page, /Notification sent|Please ensure|error|Error/);
        out.observedToasts = await page.evaluate(() => [...new Set(window.__k4toasts || [])].slice(0, 6)).catch(() => []);
        await page.waitForTimeout(1200); await idle(page);
        page.off('response', onResp);
        out.requests = seen;
        const after = (await dialogTexts(page)).slice(-1)[0] || {};
        out.stillOpen = /^Notify$/.test(after.name || '') || /Start Discussion/.test(after.text || '');
        out.errors = out.stillOpen ? await topWin(page).locator('.error, .pkp_form_error, [class*="error"]:not(input)').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)).filter(Boolean)).catch(() => []) : [];
        await snap(page, `${label}-notify-sent`, {stillOpen: out.stillOpen, errors: out.errors, toasts: out.toasts, requests: seen, dialogAfter: flat(after.text, 800)});
        if (out.stillOpen && opts.closeAfter !== false) { const c = topWin(page).getByRole('button', {name: /^Close$/}).first(); if (await c.count()) await c.click(); await page.waitForTimeout(600); await idle(page); }
        await waitRows(page, '');
        await page.waitForTimeout(600); await idle(page);
        out.after = {panel: await participantsPanel(page), discussions: (await wfInfo(page)).discussions};
        record(`${label}-notify-after`, out);
        log(`[${label}] sent:`, JSON.stringify(out.toasts.map((t) => t.text)), '| still open:', out.stillOpen, '| errors:', JSON.stringify(out.errors), '| disc:', JSON.stringify(out.after.discussions));
        return out;
    }
    // Open a discussion row by its title (the panel's link button) and read the side window (participants, messages).
    async function openDiscussion(page, titleRe, label) {
        const panel = page.locator('[data-cy="discussion-manager"]').first();
        await panel.waitFor({timeout: 20000}).catch(() => {});
        const rows = panel.locator('tbody tr').filter({hasText: titleRe});
        const n = await rows.count();
        if (!n) { record(label, {absent: true, rows: (await wfInfo(page)).discussions}); log(`[${label}] no discussion row for ${titleRe}`); return {absent: true}; }
        const row = rows.last();
        const rowText = flat(await row.innerText(), 300);
        const link = row.locator('button, a').filter({hasText: titleRe}).first();
        await loc(page, `${label}: discussion row's title link`, link);
        await link.click(); await idle(page);
        const modal = page.locator('[data-cy="active-modal"]').last();
        await modal.waitFor({timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 80; }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(500);
        const dl = (await dialogTexts(page)).slice(-1)[0] || {};
        const out = {rowText, title: dl.name, text: flat(dl.text, 3000), buttons: dl.buttons};
        await snap(page, label, out);
        log(`[${label}]`, dl.name, '|', flat(dl.text, 500));
        const close = topWin(page).getByRole('button', {name: /^(Close|Cancel)$/}).last();
        if (await close.count()) await close.click().catch(() => {}); else await page.keyboard.press('Escape');
        await page.waitForTimeout(700); await idle(page);
        return out;
    }
    // The discussions panel's "Add": title, participants matching the regexes, message, Save.
    async function addDiscussion(page, title, message, participantRes, label) {
        const panel = page.locator('[data-cy="discussion-manager"]').first();
        await panel.waitFor({timeout: 30000});
        const add = panel.getByRole('button', {name: 'Add', exact: true}).first();
        await add.click(); await idle(page);
        const modal = page.locator('[data-cy="active-modal"]').last();
        await modal.locator('input[name="title"]').waitFor({timeout: 30000});
        await modal.locator('input[name="participants"]').first().waitFor({timeout: 30000});
        const participants = await modal.locator('input[name="participants"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText || null})));
        await modal.locator('input[name="title"]').fill(title);
        for (const p of participants) if (participantRes.some((re) => re.test(p.label || '')) && !p.checked) await modal.locator(`input[name="participants"][value="${p.value}"]`).check();
        const frame = modal.frameLocator('iframe').last();
        await frame.locator('body').click();
        await frame.locator('body').fill(message);
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        const outcome = await Promise.race([
            page.getByRole('dialog', {name: 'Error'}).waitFor({timeout: 30000}).then(() => 'error'),
            modal.waitFor({state: 'hidden', timeout: 30000}).then(() => 'saved'),
        ]).catch(() => 'timeout');
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        await snap(page, `${label}-after-save`, {outcome, participants: participants.map((p) => `${flat(p.label, 40)}${p.checked ? ' [x]' : ''}`), discussions: info.discussions});
        log(`[${label}]`, outcome, '| disc:', JSON.stringify(info.discussions));
        return {outcome, info, participants};
    }
    async function activityLog(page, label) {
        const btn = page.getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); log(`[${label}] no Activity Log button`); return null; }
        await btn.click();
        const dlg = topWin(page);
        await dlg.waitFor({timeout: 30000}).catch(() => {});
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))).catch(() => []);
        const head = await dlg.locator('table thead th').allInnerTexts().catch(() => []);
        await snap(page, label, {head, rows});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 8)).slice(0, 1500));
        const close = dlg.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        await page.waitForTimeout(600); await idle(page);
        return rows;
    }
    // The header's Tasks panel (U32 K2's reader).
    async function tasksPanel(page, label) {
        const bell = page.getByRole('button', {name: /Tasks/}).first();
        if (!(await bell.count())) { record(label, {absent: true}); log(`[${label}] no Tasks button`); return null; }
        const bellLabel = flat(await bell.innerText().catch(() => ''), 60);
        await bell.click();
        const d = page.locator('[role="dialog"]:visible').last();
        await d.waitFor({timeout: 30000}).catch(() => {});
        await d.locator('.pkp_controllers_grid, table').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return x && !/Loading/.test(x.innerText); }, null, {timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(300);
        const rows = await d.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => {
            const msg = tr.querySelector('span.message'); const a = tr.querySelector('a'); const task = tr.querySelector('div.task');
            return {unread: !!(task && task.classList.contains('unread')), sentence: msg ? msg.innerText.trim() : null, title: tr.querySelector('span.submission') ? tr.querySelector('span.submission').innerText.trim() : null, rowText: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 400), href: a ? a.getAttribute('href').replace(/^.*\/index\.php/, '') : null};
        })).catch(() => []);
        const dlg = (await dialogTexts(page)).slice(-1)[0];
        const out = {bellLabel, rows, title: dlg && dlg.name, text: flat(dlg && dlg.text, 2500)};
        await snap(page, label, out);
        log(`[${label}]`, bellLabel, '| rows:', JSON.stringify(rows.map((r) => r.rowText.slice(0, 140))));
        const close = d.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return out;
    }
    // A row's "Login As" / "Remove": the dialog, then Cancel or OK.
    async function rowDialog(page, name, item, label, {leave = 'cancel'} = {}) {
        const {items, more, absent} = await rowMenu(page, name, label);
        if (absent) return {absent: true};
        const mi = page.getByRole('menuitem', {name: new RegExp(`^${item}$`)}).first();
        if (!(await mi.count())) { await closeMenu(page, more); record(`${label}-${item.replace(/\W/g, '')}`, {row: name, noItem: item, items: items.map((i) => i.text)}); log(`[${label}] no "${item}" on ${name}`); return {noItem: true, items}; }
        await mi.click(); await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); return d.length > 1; }, null, {timeout: 15000}).catch(() => {});
        await page.waitForTimeout(400);
        const dl = (await dialogTexts(page)).slice(-1)[0] || {};
        const out = {row: name, item, title: dl.name, text: flat(dl.text, 600), buttons: dl.buttons};
        await snap(page, `${label}-${item.replace(/\W/g, '')}-dialog`, out);
        log(`[${label}] ${item} on ${name}:`, dl.name, '|', flat(dl.text, 200), '|', JSON.stringify(dl.buttons));
        const btn = topWin(page).getByRole('button', {name: leave === 'ok' ? /^(OK|Confirm|Remove)$/ : /^Cancel$/}).last();
        await loc(page, `${label}: ${item} dialog's ${leave === 'ok' ? 'OK' : 'Cancel'}`, btn);
        if (await btn.count()) await btn.click(); else await page.keyboard.press('Escape');
        return out;
    }
    // The Participants "Assign" window: group, person (by first name), optional message (typed html, or {template} chosen), then OK.
    async function assignParticipant(page, group, first, label, {message, template} = {}) {
        await waitRows(page, '');
        const assign = page.getByRole('button', {name: /^Assign$/}).first();
        await assign.waitFor({timeout: 10000}).catch(() => {});
        if (!(await assign.count())) { record(`${label}-assign`, {absent: true}); log(`[${label}] no Assign button`); return {absent: true}; }
        await assign.click(); await idle(page);
        await page.waitForFunction(() => { const s = document.querySelector('select[name="filterUserGroupId"]'); return s && s.getClientRects().length && s.options.length; }, null, {timeout: 30000});
        await idle(page);
        const form = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        const sel = form.locator('select[name="filterUserGroupId"]');
        const groups = await sel.locator('option').evaluateAll((els) => els.map((o) => o.text.trim()).filter(Boolean));
        const out = {group, first, groups, title: ((await dialogTexts(page)).slice(-1)[0] || {}).name};
        if (!groups.includes(group)) { out.groupAbsent = true; await snap(page, `${label}-assign-form`, out); const c = form.getByRole('link', {name: 'Cancel', exact: true}).first(); if (await c.count()) await c.click(); await page.waitForTimeout(600); await idle(page); return out; }
        await sel.selectOption({label: group}); await idle(page);
        await form.locator('input[name="name"]').first().fill(first);
        const submit = form.locator('form[id^="searchUserFilter"] button').first();
        if (await submit.count()) await submit.click(); else await form.locator('input[name="name"]').first().press('Enter');
        await idle(page);
        await page.waitForFunction((n) => [...document.querySelectorAll('[role=dialog] tr')].some((tr) => tr.innerText.includes(n)), first, {timeout: 20000}).catch(() => {});
        await idle(page);
        const radios = await form.locator('input[name="userId"]').evaluateAll((els) => els.map((r) => ({value: r.value, row: (r.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 80)})));
        out.users = radios.map((r) => r.row);
        const pick = radios.find((r) => r.row && r.row.includes(first));
        if (!pick) { out.userAbsent = true; await snap(page, `${label}-assign-form`, out); const c = form.getByRole('link', {name: 'Cancel', exact: true}).first(); if (await c.count()) await c.click(); await page.waitForTimeout(600); await idle(page); return out; }
        await form.locator(`input[name="userId"][value="${pick.value}"]`).check({force: true}); await idle(page); await page.waitForTimeout(500);
        const tsel = form.locator('select[name="template"]');
        out.templates = (await tsel.count()) ? await selectOptions(tsel) : null;
        if (template) { const opt = (out.templates || []).find((t) => template.test(t.text)); if (opt) { await tsel.selectOption(opt.value); await idle(page); await page.waitForTimeout(800); out.chosen = opt.text; } }
        if (message != null) out.set = await setMessage(page, message);
        out.message = await messageContent(page);
        await snap(page, `${label}-assign-form`, out);
        const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
        const seen = [];
        const onResp = (r) => { if (/participant|notif/i.test(r.url()) && r.request().method() === 'POST') seen.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 140)}); };
        page.on('response', onResp);
        await ok.click();
        out.toasts = await waitToast(page, /added as a stage participant|Notification sent|Please ensure|error|Error/);
        await page.waitForTimeout(1500); await idle(page);
        page.off('response', onResp);
        out.requests = seen;
        const after = (await dialogTexts(page)).slice(-1)[0] || {};
        out.stillOpen = /Assign Participant/.test(after.name || '') || !!(await page.locator('select[name="filterUserGroupId"]:visible').count());
        if (out.stillOpen) { const c = topWin(page).getByRole('button', {name: /^Close$/}).first(); if (await c.count()) await c.click().catch(() => {}); await page.waitForTimeout(600); await idle(page); }
        await waitRows(page, '');
        out.after = {panel: (await participantsPanel(page)).items.map((i) => i.text.slice(0, 60)), discussions: (await wfInfo(page)).discussions};
        await snap(page, `${label}-assign-after`, out);
        log(`[${label}] assign ${group}/${first}:`, JSON.stringify(out.toasts.map((t) => t.text)), '| still open:', out.stillOpen, '| reqs:', JSON.stringify(seen), '| disc:', JSON.stringify(out.after.discussions));
        return out;
    }
    // ---- the submission wizard from the start page (U05 K1's driver) ------------------------
    const currentStep = (page) => page.locator('.pkpSteps__step__label--current');
    async function continueTo(page, label) {
        const button = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
        for (let attempt = 0; ; attempt++) {
            await button.click();
            try { await currentStep(page).filter({hasText: label}).waitFor({timeout: 5000}); return; } catch (e) { if (attempt >= 2) throw e; }
        }
    }
    async function uploadWizardFile(page, marker) {
        if (isOJS) {
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', {name: 'Add File', exact: true}).click()]);
            await chooser.setFiles(FIXTURES.ojs);
            await page.getByRole('button', {name: 'Article Text', exact: true}).click();
            await page.locator('.listPanel__item--submissionFile').filter({hasText: 'article.pdf'}).getByText('Article Text').waitFor({timeout: 30000});
        } else if (isOMP) {
            await page.locator('.submissionFilesListPanel input[type="file"]').setInputFiles({name: `ms-${marker}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Manuscript ${marker}`)});
            const genreButton = page.locator('.listPanel--submissionFiles__setGenre').getByRole('button', {name: 'Book Manuscript', exact: true});
            await genreButton.waitFor({timeout: 30000});
            const saved = page.waitForResponse((r) => r.url().includes('/files/') && r.ok());
            await genreButton.click();
            await saved;
            await page.locator('.listPanel--submissionFiles__itemGenre').filter({hasText: 'Book Manuscript'}).first().waitFor({timeout: 20000});
        } else {
            const labelDialog = page.getByRole('dialog').filter({has: page.locator('#preprintGalleyForm')});
            await idle(page);
            for (let attempt = 0; ; attempt++) {
                await page.getByRole('link', {name: 'Add File', exact: true}).click();
                try { await labelDialog.first().waitFor({timeout: 5000}); break; } catch (e) { if (attempt >= 2) throw e; }
            }
            await labelDialog.locator('input[name="label"]').fill('PDF');
            await labelDialog.getByRole('button', {name: 'Save', exact: true}).click();
            const upload = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
            const genreSelect = upload.locator('select[name="genreId"]').first();
            await genreSelect.waitFor({timeout: 30000});
            await genreSelect.selectOption({label: 'Preprint Text'});
            await upload.locator('input[type="file"]').setInputFiles(FIXTURES.ops);
            const cont = upload.getByRole('button', {name: 'Continue', exact: true});
            await cont.waitFor({timeout: 30000});
            await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.innerText.trim() === 'Continue'); return b && !b.disabled; }, null, {timeout: 30000});
            await cont.click();
            await upload.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: 30000});
            await upload.getByRole('button', {name: 'Continue', exact: true}).click();
            await upload.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: 30000});
            await upload.getByRole('button', {name: 'Complete', exact: true}).click();
            await upload.waitFor({state: 'hidden', timeout: 30000});
            await idle(page);
            await page.locator('.submissionWizard').getByRole('link', {name: 'PDF'}).first().waitFor({timeout: 20000});
        }
    }
    async function wizardFromStart(page, cp, title, name, {sectionRe} = {}) {
        const out = {title, steps: []};
        await page.goto(app.url(`/index.php/${cp}/submission`));
        await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: 30000});
        await idle(page);
        out.start = {url: page.url(), radios: await page.getByRole('radio').evaluateAll((els) => els.map((e) => ({name: e.name, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim(), checked: e.checked})))};
        await snap(page, `${name}-start`, out.start);
        const body = page.frameLocator('iframe.tox-edit-area__iframe').first().locator('body');
        await body.click(); await body.fill(title);
        for (const box of [page.getByRole('checkbox', {name: /meets all of these requirements/}), page.getByRole('checkbox', {name: /agree to have my data collected/}), page.getByRole('checkbox', {name: /copyright/i})]) {
            if (await box.count()) await box.check().catch(() => {});
        }
        const groups = {};
        for (const r of out.start.radios) { (groups[r.name] ||= []).push(r); }
        for (const [groupName, list] of Object.entries(groups)) {
            const wanted = sectionRe && list.find((r) => sectionRe.test(r.label));
            if (wanted) { await page.locator(`input[type=radio][name="${groupName}"]`).nth(list.indexOf(wanted)).check(); out.sectionPicked = wanted.label; }
            else if (!list.some((r) => r.checked)) await page.locator(`input[type=radio][name="${groupName}"]`).first().check();
        }
        await page.getByRole('button', {name: 'Begin Submission'}).click();
        await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 45000});
        out.submissionId = Number(new URL(page.url()).searchParams.get('id'));
        await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: 30000});
        await currentStep(page).filter({hasText: 'Upload Files'}).waitFor({timeout: 30000});
        await uploadWizardFile(page, cp);
        await continueTo(page, 'Details');
        const abstractFrame = page.locator('iframe[id*="-abstract-"]');
        if (await abstractFrame.count()) { const b = page.frameLocator('iframe[id*="-abstract-"]').first().locator('body'); await b.click(); await b.fill(`Abstract for ${title}.`); }
        await continueTo(page, 'Contributors');
        if (isOPS) { await continueTo(page, 'For Readers'); await page.getByRole('radio', {name: 'This preprint has not been published elsewhere.'}).check(); }
        else await continueTo(page, 'For the Editors');
        if (isOMP) {
            // a press's series is a radio group ("seriesId") on the "For the Editors" step: pick "Monographs"
            const radio = page.getByRole('radio', {name: /Monographs/}).first();
            if (await radio.count()) { await radio.check(); out.seriesPicked = 'Monographs'; }
            else out.seriesRadios = await page.getByRole('radio').evaluateAll((els) => els.map((e) => (e.labels && e.labels[0] ? e.labels[0].innerText : e.name).trim().slice(0, 60)));
            await snap(page, `${name}-for-the-editors`, {seriesPicked: out.seriesPicked, seriesRadios: out.seriesRadios});
        }
        const validated = page.waitForResponse((r) => r.url().includes('/submit') && r.request().method() === 'POST' && r.status() < 500, {timeout: 45000});
        await continueTo(page, 'Review');
        await validated;
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
        out.submitDisabled = await submit.isDisabled();
        if (out.submitDisabled) { out.reviewText = flat(await page.locator('.submissionWizard').innerText().catch(() => ''), 1500); throw new Error(`Submit disabled at Review: ${out.reviewText.slice(0, 600)}`); }
        await submit.click();
        const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
        await d.waitFor({timeout: 30000});
        out.dialogText = flat(await d.innerText(), 400);
        await d.getByRole('button', {name: 'Submit', exact: true}).click();
        await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000});
        await snap(page, `${name}-complete`);
        log(`[${name}] submitted`, out.submissionId, title);
        return out;
    }

    // =========================================================================
    // seed
    if (on('seed') && !sc.contextPath) {
        const t = tag('u35k4');
        const nm = (k, roles, extra) => { const [g, f] = NAMES[k].split(' '); return {username: `${t}${k}`, roles, givenName: g, familyName: f, ...(extra || {})}; };
        const users = isOPS
            ? [nm('mgr', ['manager']), nm('mgrse', ['manager', 'sectionEditor']), nm('se1', ['sectionEditor']), nm('se2', ['sectionEditor']), nm('se3', ['sectionEditor'], {sections: ['PRE']}), nm('au', ['author']), nm('au2', ['author']), {username: 'admin', roles: ['sectionEditor']}]
            : [nm('mgr', ['manager']), nm('mgrse', ['manager', 'sectionEditor']), nm('ed', ['editor']), nm('pe', ['productionEditor']), nm('se1', ['sectionEditor']), nm('se2', ['sectionEditor']), nm('se3', ['sectionEditor'], isOJS ? {sections: ['ART']} : {}), nm('ce', ['copyeditor']), nm('ce2', ['copyeditor']), nm('le', ['layoutEditor']), nm('fund', ['funding']), nm('au', ['author']), nm('au2', ['author']), {username: 'admin', roles: ['sectionEditor']}];
        const spec = {tag: t, users};
        if (isOJS) spec.sections = [{abbrev: 'ART', title: {en: 'Articles'}, policy: {en: 'Policy'}}];
        if (isOPS) spec.sections = [{abbrev: 'PRE', title: {en: 'Preprints'}, policy: {en: 'Policy'}}];
        const ctx = await app.api.createContext(spec);
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId; save();
        const P = (k, role) => ({username: k === 'admin' ? 'admin' : `${t}${k}`, role});
        const sub = async (k, extra) => { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: `${t}au`, title: `U35 K4 ${k} ${t}`, ...extra}); sc[k] = r.submissionId; save(); log(`[seed] ${k} → ${r.submissionId} stage ${r.stageId}`); return r; };
        if (isOPS) {
            await sub('S1', {participants: [P('se1', 'sectionEditor'), P('se2', 'sectionEditor'), P('mgrse', 'sectionEditor'), P('admin', 'sectionEditor')]});
            await sub('S3', {participants: [P('se1', 'sectionEditor'), P('se2', 'sectionEditor')]});
            await sub('S5', {participants: []});
        } else {
            const toCE = {decisions: ['skipExternalReview']};
            const s1parts = [P('se1', 'sectionEditor'), P('se2', 'sectionEditor'), P('ce', 'copyeditor'), P('ce2', 'copyeditor'), P('ed', 'editor'), P('pe', 'productionEditor'), P('mgrse', 'sectionEditor'), P('admin', 'sectionEditor')];
            await sub('S1', {...toCE, participants: s1parts}).catch(async (e) => { log('[seed S1 skipExternalReview failed]', String(e.message).slice(0, 300)); await sub('S1', {decisions: ['accept'], participants: s1parts}); });
            await sub('S2', {decisions: ['skipExternalReview', 'sendToProduction'], participants: [P('se1', 'sectionEditor'), P('le', 'layoutEditor')]});
            await sub('S3', {participants: [P('se1', 'sectionEditor'), P('se2', 'sectionEditor')]});
            await sub('S5', {participants: []});
        }
        record('seed', {...sc, users: users.map((u) => u.username)});
    }
    if (!sc.contextPath) { log('[k4] no scratch context; run the seed phase first'); return; }
    log('[k4]', app.name, JSON.stringify(sc));
    const S1 = () => workflow(sc.S1, S1_KEY);

    // =========================================================================
    // notify: Rule 8, 8a, 8b, A8 as the manager on S1 (Copyediting / OPS Production), S2 (Production), S3 (Submission)
    if (on('notify')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            const recip = isOPS ? 'se2' : 'ce';
            await openWorkflow(page, S1(), 'n-mgr-s1');
            const m1 = `k4-8a-${sc.tag}`;
            await sect('8a discussion template', async () => {
                const r = await notifyWindow(page, NAMES[recip], 'n-mgr-s1-8a', {template: DISC_TEMPLATE, message: m1, append: true});
                sc.n8a = {chosen: r.chosen, toasts: r.toasts, stillOpen: r.stillOpen, discussions: r.after && r.after.discussions}; save();
                if (r.chosen) sc.n8a.discussion = await openDiscussion(page, new RegExp(esc(r.chosen.split(' ')[0])), 'n-mgr-s1-8a-discussion');
                sc.n8a.mail = await mailFind(app, mailTo(U(recip)), m1); save();
                log('[8a mail]', JSON.stringify(sc.n8a.mail));
                await activityLog(page, 'n-mgr-s1-8a-log');
            });
            if (!isOPS) {
                await sect('8b request copyedit', async () => {
                    await openWorkflow(page, S1(), 'n-mgr-s1-r2');
                    const r = await notifyWindow(page, NAMES.ce, 'n-mgr-s1-8b-copyedit', {template: /^Request Copyedit/, message: `k4-8b-ce-${sc.tag}`, append: true});
                    sc.n8bce = {chosen: r.chosen, toasts: r.toasts, discussions: r.after && r.after.discussions, mail: await mailFind(app, mailTo(U('ce')), `k4-8b-ce-${sc.tag}`)}; save();
                });
                await sect('8b ready for production', async () => {
                    await openWorkflow(page, workflow(sc.S2, S2_KEY), 'n-mgr-s2');
                    const r = await notifyWindow(page, NAMES.le, 'n-mgr-s2-8b-layout', {template: /^Ready for Production/, message: `k4-8b-le-${sc.tag}`, append: true});
                    sc.n8ble = {chosen: r.chosen, templates: r.templates, toasts: r.toasts, discussions: r.after && r.after.discussions, mail: await mailFind(app, mailTo(U('le')), `k4-8b-le-${sc.tag}`)}; save();
                });
            }
            await sect('8b assign editor', async () => {
                await openWorkflow(page, workflow(sc.S3, S3_KEY), 'n-mgr-s3');
                const r = await notifyWindow(page, NAMES.se2, 'n-mgr-s3-8b-editor', {template: /^Assign Editor/, message: `k4-8b-se2-${sc.tag}`, append: true});
                sc.n8bse2 = {chosen: r.chosen, templates: r.templates, toasts: r.toasts, discussions: r.after && r.after.discussions, mail: await mailFind(app, mailTo(U('se2')), `k4-8b-se2-${sc.tag}`)}; save();
                if (r.chosen) await openDiscussion(page, /Assign Editor/, 'n-mgr-s3-8b-editor-discussion');
            });
            // the recipients' Tasks panels
            await sect('recipients tasks', async () => {
                await signInAs(page, U(recip));
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.n8aTasks = await tasksPanel(page, `n-${recip}-tasks`); save();
                await openWorkflow(page, S1(), `n-${recip}-s1`);
                if (!isOPS) {
                    await signInAs(page, U('le'));
                    await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                    sc.n8bleTasks = await tasksPanel(page, 'n-le-tasks'); save();
                }
                await signInAs(page, U('se2'));
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.n8bse2Tasks = await tasksPanel(page, 'n-se2-tasks'); save();
                await openWorkflow(page, workflow(sc.S3, S3_KEY), 'n-se2-s3');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // typed: 8c (t10, A2) as the assigned editor se1 on S1: typed text with the list blank, from "Notify" and from "Assign"
    if (on('typed')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('se1'));
            const recip = isOPS ? 'se2' : 'ce';
            await openWorkflow(page, S1(), 't-se1-s1');
            const typed = `k4-8c-typed-${sc.tag}`;
            await sect('8c typed notify', async () => {
                const before = await mailCount(app, mailTo(U(recip)), '');
                const r = await notifyWindow(page, NAMES[recip], 't-se1-s1-8c-notify', {message: `<p>${typed}</p>`});
                sc.t8c = {toasts: r.toasts, stillOpen: r.stillOpen, errors: r.errors, requests: r.requests, discussionsAfter: r.after && r.after.discussions, mailBefore: before};
                sc.t8c.log = await activityLog(page, 't-se1-s1-8c-log');
                // the control: a predefined message afterwards, then the typed marker must be absent
                await openWorkflow(page, S1(), 't-se1-s1-r2');
                const c = await notifyWindow(page, NAMES[recip], 't-se1-s1-8c-control', {template: DISC_TEMPLATE, message: `k4-8c-control-${sc.tag}`, append: true});
                sc.t8c.control = {chosen: c.chosen, toasts: c.toasts, mail: await mailFind(app, mailTo(U(recip)), `k4-8c-control-${sc.tag}`)};
                sc.t8c.typedMailCount = await mailCount(app, mailTo(U(recip)), typed);
                sc.t8c.mailAfter = await mailCount(app, mailTo(U(recip)), '');
                save();
                log('[8c]', JSON.stringify({toasts: sc.t8c.toasts, stillOpen: sc.t8c.stillOpen, typedMail: sc.t8c.typedMailCount, control: sc.t8c.control.mail && sc.t8c.control.mail.subject}));
            });
            await sect('8c typed assign', async () => {
                await openWorkflow(page, S1(), 't-se1-s1-r3');
                const typedA = `k4-8c-assign-typed-${sc.tag}`;
                const a = await assignParticipant(page, 'Author', 'Abe', 't-se1-s1-8c', {message: `<p>${typedA}</p>`});
                sc.t8cAssign = {groups: a.groups, templates: a.templates && a.templates.map((t) => `${t.text}${t.selected ? ' [selected]' : ''}`), toasts: a.toasts, stillOpen: a.stillOpen, requests: a.requests, after: a.after};
                sc.t8cAssign.log = await activityLog(page, 't-se1-s1-8c-assign-log');
                // control: a Notify with a template to the same person, then the typed marker must be absent
                await openWorkflow(page, S1(), 't-se1-s1-r4');
                const c = await notifyWindow(page, NAMES.au2, 't-se1-s1-8c-assign-control', {template: DISC_TEMPLATE, message: `k4-8c-assign-control-${sc.tag}`, append: true});
                sc.t8cAssign.control = {chosen: c.chosen, mail: await mailFind(app, mailTo(U('au2')), `k4-8c-assign-control-${sc.tag}`)};
                sc.t8cAssign.typedMailCount = await mailCount(app, mailTo(U('au2')), typedA);
                save();
                log('[8c assign]', JSON.stringify({toasts: sc.t8cAssign.toasts.map((x) => x.text), stillOpen: sc.t8cAssign.stillOpen, typedMail: sc.t8cAssign.typedMailCount, disc: sc.t8cAssign.after && sc.t8cAssign.after.discussions}));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // own: 8d / A5 (t11) as the Journal Manager assigned to S1 (mgrse's own Section-editor row)
    if (on('own')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgrse'));
            await openWorkflow(page, S1(), 'o-mgrse-s1');
            await sect('8d own row empty send', async () => {
                const r = await notifyWindow(page, NAMES.mgrse, 'o-mgrse-s1-own-empty', {message: '', closeAfter: true});
                sc.own = {items: r.items, emptySend: {toasts: r.toasts, stillOpen: r.stillOpen, errors: r.errors, text: r.text}}; save();
            });
            await sect('8d own row send', async () => {
                await openWorkflow(page, S1(), 'o-mgrse-s1-r2');
                const m = `k4-8d-own-${sc.tag}`;
                const r = await notifyWindow(page, NAMES.mgrse, 'o-mgrse-s1-own', {template: DISC_TEMPLATE, message: m, append: true});
                sc.own.send = {chosen: r.chosen, toasts: r.toasts, stillOpen: r.stillOpen, discussions: r.after && r.after.discussions};
                if (r.chosen) sc.own.discussion = await openDiscussion(page, new RegExp(esc(r.chosen.split(' ')[0])), 'o-mgrse-s1-own-discussion');
                sc.own.mail = await mailFind(app, mailTo(U('mgrse')), m); save();
                log('[8d]', JSON.stringify({toasts: sc.own.send.toasts, mail: sc.own.mail, disc: sc.own.send.discussions}));
                sc.own.tasks = await tasksPanel(page, 'o-mgrse-tasks'); save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // loginas: Rule 9 (t12) and Side effects "On Login As"
    if (on('loginas')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await openWorkflow(page, S1(), 'l-mgr-s1');
            await sect('login as dialog cancel', async () => {
                const d = await rowDialog(page, NAMES.se1, 'Login As', 'l-mgr-s1-se1', {leave: 'cancel'});
                await page.waitForTimeout(600); await idle(page);
                sc.loginas = {dialog: d, afterCancel: {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name})), url: page.url(), panel: await participantsPanel(page)}}; save();
            });
            await sect('login as se1 ok', async () => {
                await rowDialog(page, NAMES.se1, 'Login As', 'l-mgr-s1-se1-ok', {leave: 'ok'});
                await page.waitForURL(/dashboard|login|signInAsUser|index/, {timeout: 30000}).catch(() => {});
                await page.waitForTimeout(1500); await idle(page);
                await waitPanel(page);
                const r = await openWorkflow(page, page.url(), 'l-as-se1-landing');
                sc.loginas.se1Landing = {url: page.url(), header: r.info.header, firstItems: (r.panel.items || []).slice(0, 2), panelButtons: r.panel.buttons}; save();
                // a Notify while impersonating, for the Activity Log's naming
                const m = `k4-loginas-${sc.tag}`;
                const n = await notifyWindow(page, NAMES[isOPS ? 'se2' : 'ce'], 'l-as-se1-notify', {template: DISC_TEMPLATE, message: m, append: true});
                sc.loginas.notifyWhileImpersonating = {chosen: n.chosen, toasts: n.toasts, mail: await mailFind(app, mailTo(U(isOPS ? 'se2' : 'ce')), m)};
                const disc = n.chosen ? await openDiscussion(page, new RegExp(esc(n.chosen.split(' ')[0])), 'l-as-se1-notify-discussion') : null;
                sc.loginas.notifyWhileImpersonating.discussion = disc && disc.text;
                // the "Logout as" entry
                await waitRows(page, '');
                const li = page.locator('[data-cy="participant-manager"] li').filter({hasText: /Logout as/}).first();
                await loc(page, 'Participants panel: the "Logout as" entry', li);
                const entry = (await li.count()) ? flat(await li.innerText(), 120) : null;
                sc.loginas.logoutEntry = entry;
                const userMenu = await page.evaluate(() => [...document.querySelectorAll('header button, header a')].map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter(Boolean).slice(0, 30));
                await snap(page, 'l-as-se1-panel', {logoutEntry: entry, headerControls: userMenu});
                if (await li.count()) {
                    const btn = li.locator('button, a').first();
                    if (await btn.count()) await btn.click(); else await li.click();
                    await page.waitForTimeout(1500); await idle(page);
                    await waitPanel(page);
                    const back = await openWorkflow(page, page.url(), 'l-mgr-after-logout-as');
                    sc.loginas.afterLogoutAs = {url: page.url(), header: back.info.header, firstItems: (back.panel.items || []).slice(0, 2)};
                }
                save();
                log('[login as se1]', JSON.stringify({landing: sc.loginas.se1Landing, entry, after: sc.loginas.afterLogoutAs}));
            });
            await sect('login as author', async () => {
                await signInAs(page, U('mgr'));
                await openWorkflow(page, S1(), 'l-mgr-s1-r2');
                await rowDialog(page, NAMES.au, 'Login As', 'l-mgr-s1-au-ok', {leave: 'ok'});
                await page.waitForURL(/dashboard|login|signInAsUser|index/, {timeout: 30000}).catch(() => {});
                await page.waitForTimeout(1500); await idle(page);
                await waitPanel(page);
                const info = await wfInfo(page);
                const userMenu = await page.evaluate(() => [...document.querySelectorAll('header button, header a, nav a')].map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter(Boolean).slice(0, 40));
                await snap(page, 'l-as-au-landing', {info, headerControls: userMenu, panel: await participantsPanel(page)});
                sc.loginas.auLanding = {url: page.url(), header: info.header, head: info.head, headerControls: userMenu}; save();
                log('[login as au]', page.url(), JSON.stringify(info.head));
            });
            await sect('login as as other levels', async () => {
                const reads = {};
                for (const k of isOPS ? ['mgrse', 'se1'] : ['ed', 'pe', 'se1', 'fund']) {
                    await signInAs(page, U(k));
                    await openWorkflow(page, S1(), `l-${k}-s1`);
                    const {items, more, absent} = await rowMenu(page, NAMES[isOPS ? 'se2' : 'ce'], `l-${k}-s1`);
                    reads[k] = absent ? 'absent' : items.map((i) => i.text);
                    if (!absent) await closeMenu(page, more);
                    if (k === 'ed' || k === 'mgrse') { const a = await rowMenu(page, NAMES.admin, `l-${k}-s1-adminrow`); reads[`${k}-adminrow`] = a.absent ? 'absent' : a.items.map((i) => i.text); if (!a.absent) await closeMenu(page, a.more); }
                }
                await signInAs(page, U('mgr'));
                await openWorkflow(page, S1(), 'l-mgr-s1-r3');
                const a = await rowMenu(page, NAMES.admin, 'l-mgr-s1-adminrow'); reads['mgr-adminrow'] = a.absent ? 'absent' : a.items.map((i) => i.text); if (!a.absent) await closeMenu(page, a.more);
                const own = await rowMenu(page, NAMES.mgr, 'l-mgr-s1-ownrow'); reads['mgr-ownrow'] = own.absent ? 'absent (not assigned)' : own.items.map((i) => i.text); if (!own.absent) await closeMenu(page, own.more);
                sc.loginas.levels = reads; save();
                log('[login as levels]', JSON.stringify(reads));
                sc.loginas.log = await activityLog(page, 'l-mgr-s1-log'); save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // remove: Rule 10 (t13) and Side effects "On Remove"
    if (on('remove')) {
        const {page, close} = await launch(app);
        try {
            const victim = isOPS ? 'se2' : 'ce';
            await signInAs(page, U('mgr'));
            await openWorkflow(page, S1(), 'r-mgr-s1');
            await sect('discussion with victim and ed', async () => {
                const parts = isOPS ? [new RegExp(NAMES.se2.split(' ')[0]), new RegExp(NAMES.mgrse.split(' ')[0])] : [new RegExp(NAMES.ce.split(' ')[0]), new RegExp(NAMES.ed.split(' ')[0])];
                const d = await addDiscussion(page, `K4 remove disc ${sc.tag}`, `Opening message ${sc.tag}`, parts, 'r-mgr-s1-discussion');
                sc.remove = {discussion: {outcome: d.outcome, participants: d.participants.map((p) => `${flat(p.label, 50)}${p.checked ? ' [x]' : ''}`)}};
                sc.remove.discussionBefore = await openDiscussion(page, /K4 remove disc/, 'r-mgr-s1-discussion-before'); save();
            });
            await sect('remove cancel', async () => {
                await openWorkflow(page, S1(), 'r-mgr-s1-r2');
                const d = await rowDialog(page, NAMES[victim], 'Remove', `r-mgr-s1-${victim}`, {leave: 'cancel'});
                await page.waitForTimeout(700); await idle(page); await waitRows(page, '');
                sc.remove.dialog = d; sc.remove.afterCancel = {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name})), panel: (await participantsPanel(page)).items.map((i) => i.text.slice(0, 60))}; save();
            });
            await sect('remove ok', async () => {
                sc.remove.mailBefore = await mailCount(app, mailTo(U(victim)), '');
                const seen = [];
                const onResp = (r) => { if (/deleteParticipant|participant/i.test(r.url()) && r.request().method() === 'POST') seen.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 140)}); };
                page.on('response', onResp);
                await rowDialog(page, NAMES[victim], 'Remove', `r-mgr-s1-${victim}-ok`, {leave: 'ok'});
                const t = await waitToast(page, /removed|Removed|error|Error/, 4000);
                await page.waitForTimeout(1500); await idle(page); await waitRows(page, '');
                page.off('response', onResp);
                const p = await participantsPanel(page);
                sc.remove.afterOk = {toasts: t, requests: seen, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 200)})), panel: p.items.map((i) => i.text.slice(0, 60))};
                await snap(page, `r-mgr-s1-${victim}-removed`, sc.remove.afterOk);
                sc.remove.otherStages = {};
                for (const key of STAGE_KEYS.filter((k) => k !== S1_KEY)) { const r = await openWorkflow(page, workflow(sc.S1, key), `r-mgr-s1-${key}-after`); sc.remove.otherStages[key] = (r.panel.items || []).map((i) => i.text.slice(0, 60)); }
                await openWorkflow(page, S1(), 'r-mgr-s1-r3');
                sc.remove.discussionAfter = await openDiscussion(page, /K4 remove disc/, 'r-mgr-s1-discussion-after');
                sc.remove.notifyDiscussionAfter = await openDiscussion(page, DISC_ROW, 'r-mgr-s1-notify-discussion-after');
                sc.remove.log = await activityLog(page, 'r-mgr-s1-log');
                // a control mail after the removal, then the victim's mailbox count
                await openWorkflow(page, S1(), 'r-mgr-s1-r4');
                const c = await notifyWindow(page, NAMES.se1, 'r-mgr-s1-control', {template: DISC_TEMPLATE, message: `k4-remove-control-${sc.tag}`, append: true});
                sc.remove.control = {chosen: c.chosen, mail: await mailFind(app, mailTo(U('se1')), `k4-remove-control-${sc.tag}`)};
                sc.remove.mailAfter = await mailCount(app, mailTo(U(victim)), '');
                save();
                log('[remove]', JSON.stringify({after: sc.remove.afterOk.panel, other: sc.remove.otherStages, mail: [sc.remove.mailBefore, sc.remove.mailAfter]}));
            });
            await sect('remove manager-level ed', async () => {
                if (isOPS) return;
                await openWorkflow(page, S1(), 'r-mgr-s1-r5');
                await rowDialog(page, NAMES.ed, 'Remove', 'r-mgr-s1-ed-ok', {leave: 'ok'});
                await page.waitForTimeout(1500); await idle(page); await waitRows(page, '');
                const p = await participantsPanel(page);
                sc.remove.edRemoved = {panel: p.items.map((i) => i.text.slice(0, 60))};
                sc.remove.edDiscussionAfter = await openDiscussion(page, /K4 remove disc/, 'r-mgr-s1-discussion-after-ed');
                sc.remove.edLog = await activityLog(page, 'r-mgr-s1-log-after-ed'); save();
            });
            await sect('removed person reaches', async () => {
                await signInAs(page, U(victim));
                await page.goto(S1()); await idle(page); await page.waitForTimeout(1500); await idle(page);
                await waitPanel(page);
                const info = await wfInfo(page);
                await snap(page, `r-${victim}-s1-after-removal`, {info, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}))});
                sc.remove.victimLanding = {url: page.url(), head: info.head, dialogs: (await dialogTexts(page)).map((x) => flat(x.text, 200))}; save();
                if (!isOPS) {
                    await signInAs(page, U('ed'));
                    const r = await openWorkflow(page, S1(), 'r-ed-s1-after-removal');
                    sc.remove.edLanding = {url: page.url(), head: r.info.head, panel: (r.panel.items || []).map((i) => i.text.slice(0, 60))}; save();
                }
            });
            await sect('section editor removes own row', async () => {
                await signInAs(page, U('se1'));
                const key = isOPS ? S1_KEY : S2_KEY, id = isOPS ? sc.S1 : sc.S2;
                await openWorkflow(page, workflow(id, key), 'r-se1-own');
                await rowDialog(page, NAMES.se1, 'Remove', 'r-se1-own-ok', {leave: 'ok'});
                await page.waitForTimeout(2000); await idle(page);
                const info = await wfInfo(page).catch(() => ({}));
                const dialogs = (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300), buttons: x.buttons}));
                const panel = await participantsPanel(page).catch(() => ({}));
                await snap(page, 'r-se1-own-after', {info, dialogs, panel, toasts: await toasts(page)});
                sc.remove.seOwn = {url: page.url(), head: info.head, dialogs, panel: (panel.items || []).map((i) => i.text.slice(0, 60)), toasts: await toasts(page)};
                // press the dialog's OK if an Error dialog sits there, then re-land
                const ok = topWin(page).getByRole('button', {name: /^OK$/}).last();
                if (dialogs.length > 1 && (await ok.count())) { await ok.click(); await page.waitForTimeout(1000); await idle(page); sc.remove.seOwn.afterOk = {url: page.url(), dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 200)}))}; }
                await page.goto(workflow(id, key)); await idle(page); await page.waitForTimeout(1500); await idle(page); await waitPanel(page);
                const re = await wfInfo(page).catch(() => ({}));
                await snap(page, 'r-se1-own-relanded', {info: re, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}))});
                sc.remove.seOwn.relanded = {url: page.url(), head: re.head, dialogs: (await dialogTexts(page)).map((x) => flat(x.text, 200))}; save();
                log('[se own remove]', JSON.stringify(sc.remove.seOwn));
            });
            await sect('last editors removed', async () => {
                await signInAs(page, U('mgr'));
                await openWorkflow(page, workflow(sc.S3, S3_KEY), 'r-mgr-s3');
                await rowDialog(page, NAMES.se2, 'Remove', 'r-mgr-s3-se2-ok', {leave: 'ok'});
                await page.waitForTimeout(1500); await idle(page); await waitRows(page, '');
                await rowDialog(page, NAMES.se1, 'Remove', 'r-mgr-s3-se1-ok', {leave: 'ok'});
                await page.waitForTimeout(1500); await idle(page); await waitRows(page, '');
                const r = await openWorkflow(page, workflow(sc.S3, S3_KEY), 'r-mgr-s3-after');
                sc.remove.s3Panel = (r.panel.items || []).map((i) => i.text.slice(0, 60));
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.remove.mgrTasks = await tasksPanel(page, 'r-mgr-tasks-after-last-editor');
                await signInAs(page, U('mgrse'));
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.remove.mgrseTasks = await tasksPanel(page, 'r-mgrse-tasks-after-last-editor');
                sc.remove.mgrseMail = {S3: await mailCount(app, mailTo(U('mgrse')), `U35 K4 S3 ${sc.tag}`), S5: await mailCount(app, mailTo(U('mgrse')), `U35 K4 S5 ${sc.tag}`)};
                save();
                log('[last editor]', JSON.stringify({panel: sc.remove.s3Panel, mgrTasks: sc.remove.mgrTasks && sc.remove.mgrTasks.rows.map((x) => x.rowText.slice(0, 100)), mail: sc.remove.mgrseMail}));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // lasteditor: Rule 10's last line on S3 (whose editors the remove phase took off): assign a Section editor through "Assign" (clears the seeded "needs an editor" row), then remove them and read the managers' Tasks panels
    if (on('lasteditor')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            sc.lastEditor = {};
            await sect('assign then remove the only editor', async () => {
                await openWorkflow(page, workflow(sc.S3, S3_KEY), 'e-mgr-s3');
                sc.lastEditor.assign = await assignParticipant(page, SE_ROLE, 'Sid', 'e-mgr-s3-se1');
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.lastEditor.tasksAfterAssign = await tasksPanel(page, 'e-mgr-tasks-after-assign');
                await openWorkflow(page, workflow(sc.S3, S3_KEY), 'e-mgr-s3-r2');
                await rowDialog(page, NAMES.se1, 'Remove', 'e-mgr-s3-se1-ok', {leave: 'ok'});
                await page.waitForTimeout(1500); await idle(page); await waitRows(page, '');
                const r = await openWorkflow(page, workflow(sc.S3, S3_KEY), 'e-mgr-s3-after');
                sc.lastEditor.panelAfter = (r.panel.items || []).map((i) => i.text.slice(0, 60));
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.lastEditor.tasksAfterRemove = await tasksPanel(page, 'e-mgr-tasks-after-remove');
                await signInAs(page, U('mgrse'));
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.lastEditor.mgrseTasksAfterRemove = await tasksPanel(page, 'e-mgrse-tasks-after-remove');
                sc.lastEditor.mgrMailS3 = await mailCount(app, mailTo(U('mgr')), `U35 K4 S3 ${sc.tag}`);
                save();
                const s3 = (t) => t && t.rows.filter((x) => /S3/.test(x.rowText)).map((x) => x.rowText.slice(0, 100));
                log('[last editor]', JSON.stringify({afterAssign: s3(sc.lastEditor.tasksAfterAssign), afterRemove: s3(sc.lastEditor.tasksAfterRemove), mgrse: s3(sc.lastEditor.mgrseTasksAfterRemove), panel: sc.lastEditor.panelAfter}));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // auto: Rule 11b/11c, Side effects "On an automatic editor assignment" (t15), Settings "Editorial Assignments" on the seeded journal (reads only, plus one wizard submission by author.alex)
    if (on('auto')) {
        const {page, close} = await launch(app);
        const cp = app.contextPath;
        try {
            const title = `U35 K4 auto ${sc.tag}`;
            sc.auto = sc.auto || {};
            await sect('section form read', async () => {
                await signInAs(page, 'manager.maya', cp);
                await page.goto(app.url(`/index.php/${cp}/management/settings/context`)); await idle(page);
                await page.getByRole('tab', {name: /^(Sections|Series)$/}).first().click(); await idle(page);
                const grid = page.locator('#sectionsGridContainer, #seriesGridContainer').first();
                await grid.waitFor({timeout: 20000});
                await snap(page, 'a-maya-sections-grid');
                const rows = await grid.locator('tr.gridRow').evaluateAll((els) => els.map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 100)));
                sc.auto.sectionsGrid = rows;
                const target = grid.locator('tr.gridRow').filter({hasText: isOMP ? /Monographs/ : isOPS ? /Preprints/ : /Articles/}).first();
                await target.locator('a.show_extras').first().click(); await idle(page);
                await target.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).first().click().catch(async () => { await grid.getByRole('link', {name: 'Edit', exact: true}).first().click(); });
                const form = page.locator('form#sectionForm, form#seriesForm').first();
                await form.locator('input[name^="subEditors"]').first().waitFor({timeout: 20000});
                await idle(page);
                const boxes = await form.locator('input[name^="subEditors"]').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : (e.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ')})));
                const groupText = await form.evaluate((f) => { const el = [...f.querySelectorAll('.section, fieldset, div')].find((x) => /Editorial Assignments/.test(x.innerText) && x.innerText.length < 1500); return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 1200) : null; });
                const dl = (await dialogTexts(page)).slice(-1)[0] || {};
                sc.auto.sectionForm = {title: dl.name, boxes, groupText, buttons: dl.buttons, links: dl.links};
                await snap(page, 'a-maya-section-form', sc.auto.sectionForm);
                log('[section form]', JSON.stringify(boxes.map((b) => `${b.label}${b.checked ? ' [x]' : ''}`)), '|', groupText);
                const cancel = topWin(page).getByRole('link', {name: 'Cancel', exact: true}).or(topWin(page).getByRole('button', {name: /^(Cancel|Close)$/})).first();
                if (await cancel.count()) await cancel.click(); await page.waitForTimeout(600); await idle(page);
                save();
            });
            await sect('category form read', async () => {
                await page.goto(app.url(`/index.php/${cp}/management/settings/context`)); await idle(page);
                const catTab = page.locator('#categories-button').first();
                await catTab.waitFor({timeout: 15000}); await catTab.click(); await idle(page);
                await page.waitForFunction(() => /Applied Science|Add Category/.test(document.body.innerText), null, {timeout: 15000}).catch(() => {});
                await snap(page, 'a-maya-categories');
                const row = page.locator('main').locator('tr, li, [class*="listPanel__item"]').filter({hasText: /Applied Science/}).first();
                let opened = false;
                const more = row.getByRole('button', {name: /More Actions|Options/}).first();
                if (await more.count()) { await more.click(); await idle(page); const e = page.getByRole('menuitem', {name: /^Edit/}).first(); if (await e.count()) { await e.click(); opened = true; } }
                else { const e = row.getByRole('button', {name: /^Edit/}).or(row.getByRole('link', {name: /^Edit/})).first(); if (await e.count()) { await e.click(); opened = true; } }
                if (!opened) { const a = page.locator('main').getByRole('button', {name: /Applied Science/}).or(page.locator('main').getByRole('link', {name: /Applied Science/})).first(); if (await a.count()) { await a.click(); opened = true; } }
                await idle(page);
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /Editorial Assignments|Assign/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
                await idle(page); await page.waitForTimeout(500);
                const dl = (await dialogTexts(page)).slice(-1)[0] || {};
                const boxes = await topWin(page).locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : (e.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120)}))).catch(() => []);
                const m = (dl.text || '').match(/Editorial Assignments[\s\S]{0,900}/);
                sc.auto.categoryForm = {opened, title: dl.name, groupText: m ? flat(m[0], 900) : null, boxes: boxes.filter((b) => /Assign/.test(b.label)), buttons: dl.buttons};
                await snap(page, 'a-maya-category-form', sc.auto.categoryForm);
                log('[category form]', JSON.stringify(sc.auto.categoryForm).slice(0, 800));
                const cancel = topWin(page).getByRole('button', {name: /^(Cancel|Close)$/}).first();
                if (await cancel.count()) await cancel.click(); await page.waitForTimeout(600); await idle(page);
                save();
            });
            await sect('author submits on the seeded journal', async () => {
                if (sc.auto.wizard && sc.auto.wizard.submissionId) return;
                await signInAs(page, 'author.alex', cp);
                sc.auto.wizard = await wizardFromStart(page, cp, title, 'a-alex-wizard', {sectionRe: /Articles|Preprints/});
                save();
            });
            await sect('mails', async () => {
                const people = isOPS ? ['sectioneditor.ana', 'sectioneditor.ravi', 'sectioneditor.omar', 'manager.maya'] : ['sectioneditor.ana', 'sectioneditor.omar', 'editor.diana', 'sectioneditor.ravi', 'manager.maya'];
                sc.auto.mails = {};
                for (const p of people) { sc.auto.mails[p] = await mailFind(app, mailTo(p), title, p === 'sectioneditor.ana' ? 25000 : 4000); sc.auto.mails[p].count = await mailCount(app, mailTo(p), title); }
                save();
                log('[auto mails]', JSON.stringify(Object.fromEntries(Object.entries(sc.auto.mails).map(([k, v]) => [k, v.found ? `${v.count}× ${v.subject} | From ${v.from && (v.from.Name || v.from.Address)}` : 'none']))));
            });
            await sect('manager reads panel and log', async () => {
                await signInAs(page, 'manager.maya', cp);
                const r = await openWorkflow(page, workflow(sc.auto.wizard.submissionId, isOPS ? 'workflow_5' : 'workflow_1', cp), 'a-maya-auto-wf1');
                sc.auto.panel = (r.panel.items || []).map((i) => i.text.slice(0, 80));
                sc.auto.log = await activityLog(page, 'a-maya-auto-log');
                sc.auto.mayaTasks = await tasksPanel(page, 'a-maya-tasks');
                save();
            });
            await sect('section editor tasks', async () => {
                await signInAs(page, 'sectioneditor.ana', cp);
                await page.goto(app.url(`/index.php/${cp}/dashboard/editorial`)); await idle(page);
                sc.auto.anaTasks = await tasksPanel(page, 'a-ana-tasks');
                const r = await openWorkflow(page, workflow(sc.auto.wizard.submissionId, isOPS ? 'workflow_5' : 'workflow_1', cp), 'a-ana-auto-wf1');
                sc.auto.anaPanel = (r.panel.items || []).map((i) => i.text.slice(0, 80));
                save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // contact: the seeded context's principal contact (Settings › Contact), read-only, for the automatic email's From line
    if (on('contact')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, 'manager.maya', app.contextPath);
            await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/context`)); await idle(page);
            const tab = page.getByRole('tab', {name: /^Contact$/}).or(page.locator('#contact-button')).first();
            if (await tab.count()) { await tab.click(); await idle(page); }
            await page.waitForFunction(() => document.querySelectorAll('input').length > 3, null, {timeout: 15000}).catch(() => {});
            const fields = await page.locator('main input:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, value: (e.value || '').slice(0, 120), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 60)})));
            sc.contact = fields.filter((x) => /contact|mailing|support/i.test(x.name + x.label));
            await snap(page, 'c-maya-contact', {fields: sc.contact});
            log('[contact]', JSON.stringify(sc.contact));
            save();
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // levels2 (OJS, OMP): an assigned Copyeditor's menu on S1 (the assistant level for "Login As" at a stage the role works in)
    if (on('levels2') && !isOPS) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('ce2'));
            await openWorkflow(page, S1(), 'l-ce2-s1');
            const a = await rowMenu(page, NAMES.se1, 'l-ce2-s1'); if (!a.absent) await closeMenu(page, a.more);
            const b = await rowMenu(page, NAMES.au, 'l-ce2-s1-au'); if (!b.absent) await closeMenu(page, b.more);
            sc.loginas = sc.loginas || {}; sc.loginas.ce2 = {se1: a.absent ? 'absent' : a.items.map((i) => i.text), au: b.absent ? 'absent' : b.items.map((i) => i.text)}; save();
            log('[levels2]', JSON.stringify(sc.loginas.ce2));
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // settings: the email template "Editor Assigned (Auto)", the "Tasks and Discussions" templates (a rename, then the Notify list and the mail's subject), Profile › Notifications
    if (on('settings')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            sc.settings = sc.settings || {};
            await sect('emails template', async () => {
                await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
                const tab = page.getByRole('tab', {name: 'Emails', exact: true}).or(page.locator('#emails-button')).first();
                if (await tab.count()) { await tab.click(); await idle(page); }
                await snap(page, 's-mgr-workflow-emails-tab');
                await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
                const main = page.locator('main');
                await main.locator('.listPanel__item').first().waitFor({timeout: 30000}).catch(() => {});
                const search = main.getByRole('searchbox').or(main.locator('input[type="search"]')).first();
                await search.fill('Assigned'); await search.press('Enter'); await idle(page);
                await page.waitForFunction(() => [...document.querySelectorAll('.listPanel__item')].some((i) => /Assigned/.test(i.innerText)) || document.body.innerText.includes('No items'), null, {timeout: 10000}).catch(() => {});
                const items = await main.locator('.listPanel__item').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)));
                await snap(page, 's-mgr-manage-emails-assigned', {items});
                sc.settings.emailsList = items;
                const item = main.locator('.listPanel__item').filter({hasText: /Assigned \(Auto\)|Editor Assigned|Moderator Assigned/}).first();
                if (await item.count()) {
                    const editBtn = item.getByRole('button', {name: /^Edit/}).first();
                    await editBtn.click(); await idle(page);
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.innerText.length > 100; }, null, {timeout: 20000}).catch(() => {});
                    await idle(page);
                    const outer = (await dialogTexts(page)).slice(-1)[0] || {};
                    sc.settings.mailableWindow = {title: outer.name, text: flat(outer.text, 1500), buttons: outer.buttons};
                    await snap(page, 's-mgr-mailable-window', sc.settings.mailableWindow);
                    const inner = topWin(page).getByRole('button', {name: /^Edit$/}).first();
                    if (await inner.count()) {
                        await inner.click(); await idle(page);
                        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[name="subject"], input[id*="subject" i]'); }, null, {timeout: 20000}).catch(() => {});
                        await idle(page); await page.waitForTimeout(800);
                        const fields = await topWin(page).locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, value: (e.value || '').slice(0, 300), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 80)})));
                        const body = await page.evaluate(() => { const ed = window.tinymce && window.tinymce.activeEditor; return ed ? ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 1200) : null; }).catch(() => null);
                        const w = (await dialogTexts(page)).slice(-1)[0] || {};
                        sc.settings.templateWindow = {title: w.name, fields, body, buttons: w.buttons};
                        await snap(page, 's-mgr-template-window', sc.settings.templateWindow);
                        log('[template]', JSON.stringify(sc.settings.templateWindow).slice(0, 900));
                        const cancel = topWin(page).getByRole('button', {name: /^(Cancel|Close)$/}).first();
                        if (await cancel.count()) await cancel.click(); await page.waitForTimeout(600); await idle(page);
                    }
                    const close2 = topWin(page).getByRole('button', {name: /^(Close|Cancel)$/}).first();
                    if (await close2.count()) await close2.click().catch(() => {}); await page.waitForTimeout(600); await idle(page);
                }
                save();
            });
            await sect('tasks and discussions templates', async () => {
                await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
                const tab = page.getByRole('tab', {name: /Tasks and Discussions|Tasks & Discussions/}).first();
                sc.settings.tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
                if (!(await tab.count())) { record('s-mgr-task-templates', {absent: true, tabs: sc.settings.tabs}); return; }
                await tab.click(); await idle(page);
                await page.waitForFunction(() => /Stage/.test(document.body.innerText), null, {timeout: 15000}).catch(() => {});
                await idle(page);
                const s = await snap(page, 's-mgr-task-templates-tab');
                sc.settings.taskTemplatesText = flat(s.text && s.text.main, 3000);
                // rename the stage's plain discussion template
                const name = isOPS ? 'Discussion (Production)' : 'Discussion (Copyediting)';
                const newName = `${name} ${sc.tag}`;
                const target = isOPS ? NAMES.mgrse : NAMES.se1;
                if (await page.locator('main tr').filter({hasText: newName}).count()) {
                    // already renamed on an earlier run: the Notify list and the mail's subject only
                    await openWorkflow(page, S1(), 's-mgr-s1');
                    const r = await notifyWindow(page, target, 's-mgr-s1-renamed', {template: new RegExp(esc(newName)), message: `k4-renamed-${sc.tag}`, append: true});
                    sc.settings.renamedNotify = {templates: r.templates, chosen: r.chosen, prefilled: r.prefilled && r.prefilled.content, toasts: r.toasts, discussions: r.after && r.after.discussions, mail: await mailFind(app, mailTo(U(isOPS ? 'mgrse' : 'se1')), `k4-renamed-${sc.tag}`)};
                    log('[renamed]', JSON.stringify(sc.settings.renamedNotify).slice(0, 800)); save(); return;
                }
                const row = page.locator('main tr').filter({hasText: name}).first();
                if (!(await row.count())) { sc.settings.renameAbsent = name; save(); return; }
                const more = row.getByRole('button', {name: /More Actions|Options/}).first();
                if (await more.count()) { await more.click(); await idle(page); sc.settings.rowMenu = (await menuItems(page)).map((x) => x.text); await page.getByRole('menuitem', {name: /^Edit/}).first().click(); }
                else await row.getByRole('button', {name: /^Edit/}).first().click();
                await idle(page);
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input:not([type=hidden])'); }, null, {timeout: 20000}).catch(() => {});
                await idle(page); await page.waitForTimeout(600);
                const w = topWin(page);
                const dl = (await dialogTexts(page)).slice(-1)[0] || {};
                const fields = await w.locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, type: e.type, value: (e.value || '').slice(0, 200), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 80)})));
                sc.settings.templateEdit = {title: dl.name, fields, text: flat(dl.text, 1200), buttons: dl.buttons};
                await snap(page, 's-mgr-task-template-edit', sc.settings.templateEdit);
                const nameInput = w.locator('input[name="title"], input[id*="title" i], input[name*="name" i]').filter({visible: true}).first();
                if (await nameInput.count()) {
                    await nameInput.fill(newName);
                    const saveBtn = w.getByRole('button', {name: /^Save$/}).first();
                    await saveBtn.click(); await idle(page); await page.waitForTimeout(1200); await idle(page);
                    sc.settings.renamed = {to: newName, dialogsAfter: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 200)})), rows: await page.locator('main tr').filter({hasText: sc.tag}).allInnerTexts().catch(() => [])};
                    await snap(page, 's-mgr-task-template-renamed', sc.settings.renamed);
                    // the Notify list and a mail's subject with the renamed template
                    await openWorkflow(page, S1(), 's-mgr-s1');
                    const r = await notifyWindow(page, target, 's-mgr-s1-renamed', {template: new RegExp(esc(newName)), message: `k4-renamed-${sc.tag}`, append: true});
                    sc.settings.renamedNotify = {templates: r.templates, chosen: r.chosen, prefilled: r.prefilled && r.prefilled.content, toasts: r.toasts, discussions: r.after && r.after.discussions, mail: await mailFind(app, mailTo(U(isOPS ? 'mgrse' : 'se1')), `k4-renamed-${sc.tag}`)};
                    log('[renamed]', JSON.stringify(sc.settings.renamedNotify).slice(0, 800));
                } else sc.settings.renameNoNameInput = fields;
                save();
            });
            await sect('profile notifications', async () => {
                await signInAs(page, U('se1'));
                await page.goto(ctxUrl('/user/profile/notificationSettings')); await idle(page);
                await page.waitForFunction(() => document.querySelectorAll('input[type=checkbox]').length > 3, null, {timeout: 15000}).catch(() => {});
                const rows = await page.evaluate(() => {
                    const out = [];
                    for (const i of document.querySelectorAll('input[type=checkbox]')) {
                        if (!i.getClientRects().length) continue;
                        const lab = (i.labels && i.labels[0] ? i.labels[0].innerText : (i.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160);
                        let h = i.closest('li, fieldset, div');
                        let heading = '';
                        while (h && h !== document.body) { const t = h.innerText.trim().split('\n')[0].trim(); if (t && !/^(Enable|Do not)/.test(t)) { heading = t.slice(0, 160); break; } h = h.parentElement; }
                        out.push({name: i.name, checked: i.checked, disabled: i.disabled, label: lab, heading});
                    }
                    return out;
                });
                sc.settings.notificationRows = rows.filter((r) => /submitted|discussion|Discussion|Task|task/i.test(r.heading + r.label));
                await snap(page, 's-se1-profile-notifications', {rows: sc.settings.notificationRows, all: rows.length});
                log('[profile notifications]', JSON.stringify(sc.settings.notificationRows).slice(0, 1200));
                save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // scratchauto (OJS, OPS): a wizard submission on the scratch journal whose section names se3 under "Editorial Assignments": who is assigned, the managers' task (Rule 11b's "first journal only", Rule 10's control)
    if (on('scratchauto') && !isOMP) {
        const {page, close} = await launch(app);
        try {
            sc.scratchAuto = sc.scratchAuto || {};
            await sect('scratch section form', async () => {
                await signInAs(page, U('mgr'));
                await page.goto(ctxUrl('/management/settings/context')); await idle(page);
                await page.getByRole('tab', {name: /^Sections$/}).first().click(); await idle(page);
                const grid = page.locator('#sectionsGridContainer').first();
                await grid.waitFor({timeout: 20000});
                await grid.locator('tr.gridRow a.show_extras').first().click(); await idle(page);
                await grid.getByRole('link', {name: 'Edit', exact: true}).first().click();
                const form = page.locator('form#sectionForm');
                await form.locator('input[name^="subEditors"]').first().waitFor({timeout: 20000});
                const boxes = await form.locator('input[name^="subEditors"]').evaluateAll((els) => els.map((e) => ({checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().replace(/\s+/g, ' ')})));
                const groupText = await form.evaluate((f) => { const el = [...f.querySelectorAll('.section, fieldset, div')].find((x) => /Editorial Assignments/.test(x.innerText) && x.innerText.length < 1500); return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 800) : null; });
                sc.scratchAuto.sectionForm = {boxes, groupText};
                await snap(page, 'sa-mgr-section-form', sc.scratchAuto.sectionForm);
                log('[scratch section form]', JSON.stringify(boxes));
                const cancel = topWin(page).getByRole('link', {name: 'Cancel', exact: true}).or(topWin(page).getByRole('button', {name: /^(Cancel|Close)$/})).first();
                if (await cancel.count()) await cancel.click(); await page.waitForTimeout(600); await idle(page);
                save();
            });
            await sect('scratch wizard', async () => {
                if (sc.scratchAuto.wizard && sc.scratchAuto.wizard.submissionId) return;
                await signInAs(page, U('au'));
                sc.scratchAuto.wizard = await wizardFromStart(page, sc.contextPath, `U35 K4 scratch auto ${sc.tag}`, 'sa-au-wizard');
                save();
            });
            await sect('scratch reads', async () => {
                const title = `U35 K4 scratch auto ${sc.tag}`;
                sc.scratchAuto.mails = {se3: await mailFind(app, mailTo(U('se3')), title, 6000), mgr: await mailFind(app, mailTo(U('mgr')), title, 15000), mgrse: await mailFind(app, mailTo(U('mgrse')), title, 6000)};
                await signInAs(page, U('mgr'));
                const r = await openWorkflow(page, workflow(sc.scratchAuto.wizard.submissionId, isOPS ? 'workflow_5' : 'workflow_1'), 'sa-mgr-wf1');
                sc.scratchAuto.panel = (r.panel.items || []).map((i) => i.text.slice(0, 80));
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.scratchAuto.mgrTasks = await tasksPanel(page, 'sa-mgr-tasks');
                await signInAs(page, U('se3'));
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.scratchAuto.se3Tasks = await tasksPanel(page, 'sa-se3-tasks');
                save();
                log('[scratch auto]', JSON.stringify({panel: sc.scratchAuto.panel, mails: Object.fromEntries(Object.entries(sc.scratchAuto.mails).map(([k, v]) => [k, v.found ? v.subject : 'none'])), mgrTasks: sc.scratchAuto.mgrTasks && sc.scratchAuto.mgrTasks.rows.map((x) => x.rowText.slice(0, 120))}));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // opsauto2 (OPS): a second wizard submission on the seeded preprint server, for the "no Moderator Assigned (Auto) email" observation and a second read of the category form
    if (on('opsauto2') && isOPS) {
        const {page, close} = await launch(app);
        const cp = app.contextPath;
        try {
            sc.opsAuto2 = {};
            await sect('second preprint', async () => {
                await signInAs(page, 'author.alex', cp);
                const title = `U35 K4 auto2 ${sc.tag}`;
                sc.opsAuto2.wizard = await wizardFromStart(page, cp, title, 'a2-alex-wizard');
                sc.opsAuto2.mails = {};
                for (const p of ['sectioneditor.ana', 'sectioneditor.ravi', 'manager.maya']) { sc.opsAuto2.mails[p] = await mailFind(app, mailTo(p), title, p === 'sectioneditor.ana' ? 30000 : 5000); }
                await signInAs(page, 'manager.maya', cp);
                const r = await openWorkflow(page, workflow(sc.opsAuto2.wizard.submissionId, 'workflow_5', cp), 'a2-maya-wf5');
                sc.opsAuto2.panel = (r.panel.items || []).map((i) => i.text.slice(0, 80));
                sc.opsAuto2.log = await activityLog(page, 'a2-maya-log');
                save();
                log('[opsauto2]', JSON.stringify({panel: sc.opsAuto2.panel, mails: Object.fromEntries(Object.entries(sc.opsAuto2.mails).map(([k, v]) => [k, v.found ? v.subject : null])), log: sc.opsAuto2.log.map((x) => x.slice(0, 3).join(' | ').slice(0, 120)).slice(0, 6)}));
            });
            await sect('category form again', async () => {
                await page.goto(app.url(`/index.php/${cp}/management/settings/context`)); await idle(page);
                const catTab = page.locator('#categories-button').first();
                await catTab.waitFor({timeout: 15000}); await catTab.click(); await idle(page);
                await page.waitForFunction(() => /Applied Science|Add Category/.test(document.body.innerText), null, {timeout: 15000}).catch(() => {});
                const row = page.locator('main').locator('tr, li, [class*="listPanel__item"]').filter({hasText: /Applied Science/}).first();
                const more = row.getByRole('button', {name: /More Actions|Options/}).first();
                if (await more.count()) { await more.click(); await idle(page); const e = page.getByRole('menuitem', {name: /^Edit/}).first(); if (await e.count()) await e.click(); }
                else { const e = row.getByRole('button', {name: /^Edit/}).or(row.getByRole('link', {name: /^Edit/})).first(); if (await e.count()) await e.click(); }
                await idle(page);
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /Editorial Assignments/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
                await page.waitForTimeout(3000); await idle(page);
                const dl = (await dialogTexts(page)).slice(-1)[0] || {};
                const boxes = await topWin(page).locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : (e.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120)}))).catch(() => []);
                const m = (dl.text || '').match(/Editorial Assignments[\s\S]{0,900}/);
                sc.opsAuto2.categoryForm = {title: dl.name, groupText: m ? flat(m[0], 900) : null, boxes};
                await snap(page, 'a2-maya-category-form', sc.opsAuto2.categoryForm);
                log('[catform2]', JSON.stringify(sc.opsAuto2.categoryForm).slice(0, 600));
                const cancel = topWin(page).getByRole('button', {name: /^(Cancel|Close)$/}).first();
                if (await cancel.count()) await cancel.click(); await page.waitForTimeout(600); await idle(page);
                save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    if (on('notes')) {
        record('k4-summary', sc);
    }
});
