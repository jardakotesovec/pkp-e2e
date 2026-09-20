// U35 claim check, chunk K2: the "Assign Participant" window (Fields & validation, Rule 4a–4f),
// the "Edit Assignment" and "Notify" windows' fields, Rule 12 (the managers' "needs an editor"
// task), Side effects "On Assign" and "On a message sent from Assign or Notify", register A1, A2, A6.
// Spec: docs/specs/U35-stage-participants.md lines 63–87, 120–179, 324–346, 528–550, 581–593.
//
// One scratch context per app (tag u35k2…) plus, on OJS and OMP, a second context whose default
// review method is "open" (tag u35k2o…). Throwaway users and submissions:
//   S1  Submission stage, no editor (the needs-editor task): se1 seeded in a second role (Funding coordinator / OPS Author)
//   S2  review stage (OJS/OMP): rse accepted (anonymous), rse2 declined; se2, se3 assigned
//   S3  Copyediting (OJS/OMP): rse3's completed review; se3 as Copyeditor, se2
//   S4  Production (OJS/OMP): se2;  S5 (OMP) Internal Review: se2;  OPS S2/S3 plain (se3's count)
//   O1  (open context) review stage: rse4 accepted, review method open
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U35/K2/k2.js
//   PHASES=seed,window,rule12,a2,review,stages,notes   (default all; later phases reuse k2-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'window', 'rule12', 'a2', 'review', 'fourd', 'a6round', 'stages', 'tpl', 'notes'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); record(`${name.replace(/\W+/g, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1200)}); }
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
        text: d.innerText.slice(0, 6000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
        links: [...d.querySelectorAll('a')].filter((a) => a.getClientRects().length).map((a) => a.innerText.trim()).filter(Boolean).slice(0, 40),
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
    return {dialogCount: dlgs.length, head, headings, buttons, actions, discussions, notices, url: location.href};
});
const participantsPanel = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].find((e) => vis(e) && /^\s*Participants\s*$/i.test(e.innerText));
    if (!h) return {absent: true, headings: [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => e.innerText.trim())};
    let box = h.parentElement;
    while (box && box !== dlg && !box.querySelector('li, [role=listitem]')) box = box.parentElement;
    const items = [...box.querySelectorAll('li, [role=listitem]')].filter(vis).map((li) => ({
        text: li.innerText.trim().replace(/\s+/g, ' ').slice(0, 220),
        buttons: [...li.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean),
    }));
    const buttons = [...box.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean).filter((t) => !/More Actions/.test(t));
    return {items, buttons, text: box.innerText.replace(/\s+/g, ' ').slice(0, 3000)};
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
const formBoxes = (locator) => locator.evaluate((root) => {
    const vis = (e) => e.getClientRects().length > 0;
    const labelOf = (i) => { const l = i.id && root.querySelector(`label[for="${i.id}"]`); return (l ? l.innerText : (i.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 260); };
    return {
        boxes: [...root.querySelectorAll('input[type=checkbox]')].map((i) => ({name: i.name, checked: i.checked, visible: vis(i), disabled: i.disabled, label: labelOf(i)})),
        sections: [...root.querySelectorAll('legend, .section > label, label.sub_label, h3, h4, h5, .pkp_form .label, .label')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 120)).filter(Boolean).slice(0, 30),
        text: root.innerText.replace(/\s+/g, ' ').slice(0, 3000),
        buttons: [...root.querySelectorAll('button, a.pkp_button, input[type=submit], a')].filter(vis).map((b) => (b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 20),
    };
}).catch((e) => ({error: String(e.message).slice(0, 200)}));
// The user-select grid inside the Assign window as data: heading, columns, rows (radio + cells), the "No Items" line.
const userGrid = (form) => form.evaluate((root) => {
    const vis = (e) => e.getClientRects().length > 0;
    const grid = root.querySelector('.pkp_controllers_grid') || root;
    const table = grid.querySelector('table');
    const headings = [...grid.querySelectorAll('h1,h2,h3,h4,h5,.header h4, .pkp_controllers_grid > .header')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 8);
    const columns = table ? [...table.querySelectorAll('thead th')].map((th) => th.innerText.trim().replace(/\s+/g, ' ')) : [];
    const rows = table ? [...table.querySelectorAll('tbody tr')].filter(vis).map((tr) => ({
        text: tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 160),
        cells: [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ').slice(0, 60)),
        radio: !!tr.querySelector('input[type=radio][name="userId"]'),
        checked: !!(tr.querySelector('input[type=radio][name="userId"]') || {}).checked,
        value: (tr.querySelector('input[type=radio][name="userId"]') || {}).value || null,
    })) : [];
    const scroller = (() => { let e = table; while (e && e !== root) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight) return {cls: e.className.slice(0, 60), scrollHeight: e.scrollHeight, clientHeight: e.clientHeight}; e = e.parentElement; } return null; })();
    const filterLabels = [...root.querySelectorAll('form[id^="searchUserFilter"] label, form[id^="searchUserFilter"] button, form[id^="searchUserFilter"] a, form[id^="searchUserFilter"] input')].filter(vis).map((e) => ({tag: e.tagName, text: (e.innerText || e.getAttribute('placeholder') || e.value || '').trim().slice(0, 60), name: e.name || null, type: e.type || null}));
    return {headings, columns, rows: rows.filter((r) => r.radio || /No Items|No Matches|Loading/i.test(r.text)), rowCount: rows.filter((r) => r.radio).length, scroller, filterLabels, gridText: grid.innerText.replace(/\s+/g, ' ').slice(0, 600)};
}).catch((e) => ({error: String(e.message).slice(0, 200)}));

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOPS = app.name === 'ops', isOJS = app.name === 'ojs', isOMP = app.name === 'omp';
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.contextPath}${p}`);
    const workflow = (id, key, cp) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const signInAs = async (page, u, cp) => { await signIn(page, u, {contextPath: cp || sc.contextPath}); await idle(page); };
    const U = (k) => `${sc.tag}${k}`;
    const mail = (k) => `${U(k)}@mail.test`;
    const NAMES = {mgr: 'Mira Manager', mgr2: 'Mona Managertwo', mgrse: 'Mia Managersub', ed: 'Ed Editor', se1: 'Sid Sectionone', se2: 'Sue Sectiontwo', se3: 'Sam Sectionthree', ge: 'Gus Guest', ve: 'Val Volume', tr: 'Tia Translator', fund: 'Fay Funding', ce: 'Cal Copyeditor', le: 'Leo Layout', pe: 'Pat Prodeditor', rse: 'Rae Revsec', rse2: 'Rod Revdecl', rse3: 'Rex Revcopy', rse4: 'Ria Revopen', au: 'Ava Author', au2: 'Abe Authortwo', ebm: 'Eli Board'};
    const SE_ROLE = isOPS ? 'Moderator' : isOMP ? 'Series editor' : 'Section editor';
    const ED_ROLE = isOMP ? 'Press editor' : 'Journal editor';
    const REVIEW_KEY = 'workflow_3';
    const viaReview = isOMP ? ['skipInternalReview', 'sendExternalReview'] : ['sendExternalReview'];

    // ---- workflow page helpers ------------------------------------------------
    async function waitPanel(page) {
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
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
        log(`[${label}]`, app.name, 'head:', JSON.stringify((info.head || []).slice(0, 3)), 'panel:', JSON.stringify((panel.items || []).map((i) => i.text.slice(0, 70))), 'buttons:', JSON.stringify(panel.buttons || []), 'disc:', JSON.stringify(info.discussions || []));
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
        if (await page.locator('[role="menuitem"]:visible').count()) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(200); }
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
        await snap(page, label, {rows});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 8).map((r) => r.join(' | ').slice(0, 160))));
        const close = dlg.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        await page.waitForTimeout(500); await idle(page);
        return rows;
    }
    // The header's Tasks panel (U32/U33 K2's reader).
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
            return {id: tr.id, unread: !!(task && task.classList.contains('unread')), sentence: msg ? msg.innerText.trim() : null, title: tr.querySelector('span.submission') ? tr.querySelector('span.submission').innerText.trim() : null, rowText: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 400), href: a ? a.getAttribute('href').replace(/^.*\/index\.php/, '') : null};
        })).catch(() => []);
        const dlg = (await dialogTexts(page)).slice(-1)[0];
        const out = {bellLabel, rows, title: dlg && dlg.name, controls: dlg && dlg.links, buttons: dlg && dlg.buttons, text: flat(dlg && dlg.text, 2500)};
        await snap(page, label, out);
        log(`[${label}]`, bellLabel, '| rows:', JSON.stringify(rows.map((r) => r.rowText.slice(0, 120))));
        const close = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return out;
    }
    const needsEditor = (t, title) => !!(t && (t.rows || []).some((r) => /editor needs to be assigned/i.test(r.rowText) && (!title || r.rowText.includes(title))));

    // ---- the "Assign Participant" window ------------------------------------------
    // Opens "Assign" and reads the window as it lands: title, the role list (options, the selected one), the grid, the template list, the message box, buttons and links.
    async function openAssign(page, label) {
        await waitRows(page, '');
        const assign = page.getByRole('button', {name: /^Assign$/}).first();
        await assign.waitFor({timeout: 10000}).catch(() => {});
        if (!(await assign.count())) { record(`${label}-assign-absent`, {panel: await participantsPanel(page)}); log(`[${label}] no Assign button`); return null; }
        await loc(page, `${label}: Participants "Assign"`, assign);
        await assign.click(); await idle(page);
        const form = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        await form.waitFor({timeout: 30000}); await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[name="userId"], .pkp_controllers_grid tbody tr') && !/Loading/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const sel = form.locator('select[name="filterUserGroupId"]');
        const tmpl = form.locator('select[name="template"], select[id^="template"]').first();
        const groups = await selectOptions(sel);
        const templates = (await tmpl.count()) ? await selectOptions(tmpl) : null;
        const grid = await userGrid(form);
        const dlg = (await dialogTexts(page)).slice(-1)[0] || {};
        const boxes = await formBoxes(form);
        const out = {title: dlg.name, groups, selectedGroup: (groups.find((g) => g.selected) || {}).text, templates: templates && templates.map((t) => ({text: t.text, value: t.value, selected: t.selected})), grid, message: await messageContent(page), boxes: (boxes.boxes || []).map((b) => ({name: b.name, checked: b.checked, visible: b.visible, label: b.label.slice(0, 80)})), sections: boxes.sections, buttons: dlg.buttons, links: dlg.links, text: flat(dlg.text, 3000)};
        await snap(page, `${label}-assign-open`, {assign: out});
        await loc(page, `${label}: role list`, sel);
        await loc(page, `${label}: "Search User By Name"`, form.locator('input[name="name"]').first());
        if (templates) await loc(page, `${label}: predefined message list`, tmpl);
        log(`[${label} assign]`, 'title:', JSON.stringify(out.title), '| groups:', JSON.stringify(groups.map((g) => `${g.text}${g.selected ? '*' : ''}`)), '| heading:', JSON.stringify(grid.headings), '| columns:', JSON.stringify(grid.columns), '| rows:', grid.rowCount, '| templates:', JSON.stringify(templates && templates.map((t) => t.text)), '| buttons:', JSON.stringify(dlg.buttons), '| links:', JSON.stringify(dlg.links));
        return {form, sel, tmpl, out};
    }
    // Watch the grid's own requests (the user-select grid fetch) around an action.
    async function gridRequests(page, fn) {
        const seen = [];
        const onResp = (r) => { const u = r.url(); if (/userSelect|user-select|userselect|fetchGrid|stageParticipant|stage-participant|addParticipant|fetchTemplateBody|saveParticipant|save-participant/i.test(u)) seen.push({method: r.request().method(), status: r.status(), url: u.replace(/^.*\/index\.php/, '').replace(/[?&]_=\d+/, '').slice(0, 200)}); };
        page.on('response', onResp);
        try { await fn(); } finally { await idle(page); page.off('response', onResp); }
        return seen;
    }
    async function chooseGroup(page, form, sel, groupName) {
        const groups = await selectOptions(sel);
        const g = groups.find((o) => o.text === groupName);
        if (!g) return {groupAbsent: groupName, groups: groups.map((x) => x.text)};
        const reqs = await gridRequests(page, async () => { await sel.selectOption(g.value); await idle(page); await page.waitForTimeout(500); });
        return {group: groupName, requests: reqs, grid: await userGrid(form)};
    }
    async function search(page, form, text) {
        const box = form.locator('input[name="name"]').first();
        await box.fill(text == null ? '' : text);
        const submit = form.locator('form[id^="searchUserFilter"] button').first();
        const reqs = await gridRequests(page, async () => {
            if (await submit.count()) await submit.click(); else await box.press('Enter');
            await idle(page);
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && !/Loading/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
            await page.waitForTimeout(400); await idle(page);
        });
        return {typed: text, requests: reqs, grid: await userGrid(form)};
    }
    async function pickUser(page, form, name) {
        const grid = await userGrid(form);
        const row = (grid.rows || []).find((r) => r.radio && r.text.includes(name));
        if (!row) return {userAbsent: name, rows: (grid.rows || []).map((r) => r.text.slice(0, 60))};
        const dialogsBefore = (await dialogTexts(page)).length;
        await form.locator(`input[name="userId"][value="${row.value}"]`).check({force: true});
        await idle(page); await page.waitForTimeout(600); await idle(page);
        const dialogs = await dialogTexts(page);
        const warn = dialogs.length > dialogsBefore ? dialogs.slice(-1)[0] : null;
        const boxes = await formBoxes(form);
        const winText = flat(((await dialogTexts(page)).find((d) => /Assign Participant/.test(d.name || '')) || {}).text, 6000) || '';
        return {picked: name, value: row.value, headings: {assignmentPrivileges: /Assignment privileges/.test(winText), permissions: /Permissions/.test(winText)}, warning: warn && {name: warn.name, text: flat(warn.text, 800), buttons: warn.buttons, links: warn.links}, boxes: (boxes.boxes || []).filter((b) => /recommendOnly|canChangeMetadata/.test(b.name)).map((b) => ({name: b.name, checked: b.checked, visible: b.visible})), sections: (boxes.sections || []).filter((s) => /privileges|Permissions/i.test(s))};
    }
    async function chooseTemplate(page, form, tmpl, text) {
        const options = await selectOptions(tmpl);
        const t = options.find((o) => (text instanceof RegExp ? text.test(o.text) : o.text === text));
        if (!t) return {templateAbsent: String(text), options: options.map((o) => o.text)};
        const reqs = await gridRequests(page, async () => {
            await tmpl.selectOption(t.value); await idle(page);
            await page.waitForFunction(() => { const ta = [...document.querySelectorAll('[role=dialog] textarea[name="message"], [role=dialog] textarea[id^="message"]')].pop(); const ed = ta && window.tinymce && window.tinymce.get(ta.id); return ed && ed.getContent().length > 20; }, null, {timeout: 20000}).catch(() => {});
            await idle(page);
        });
        return {picked: t.text, requests: reqs, message: await messageContent(page)};
    }
    // Press the window's OK and read what follows: toasts, the window's state, the panel; or Cancel; or leave by navigation.
    async function leaveAssign(page, form, how, label) {
        const out = {how};
        if (how === 'ok') {
            const ok = form.getByRole('button', {name: 'OK', exact: true}).last();
            await loc(page, `${label}: the window's OK`, ok);
            const dialogs = [];
            const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onDialog);
            const bodies = [];
            const onBody = async (r) => { if (/save-participant|saveParticipant/.test(r.url())) { try { const j = await r.json(); bodies.push({status: j.status, content: typeof j.content === 'string' ? j.content.replace(/\s+/g, ' ').slice(0, 600) : j.content, events: j.events && j.events.map((e) => ({name: e.name, data: typeof e.data === 'string' ? e.data.slice(0, 300) : e.data}))}); } catch (e) { bodies.push({error: String(e.message).slice(0, 100)}); } } };
            page.on('response', onBody);
            out.requests = await gridRequests(page, async () => {
                await ok.click();
                out.toasts = await waitToast(page, /added as a stage participant|Please ensure|Notification sent|error|Error/);
                await idle(page); await page.waitForTimeout(900); await idle(page);
            });
            page.off('response', onBody);
            out.responseBodies = bodies;
            page.off('dialog', onDialog);
            out.browserDialogs = dialogs;
            const after = await dialogTexts(page);
            out.dialogsAfter = after.map((d) => ({name: d.name, text: flat(d.text, 500), buttons: d.buttons}));
            out.windowStillOpen = after.some((d) => /Assign Participant/.test(d.name || ''));
            if (out.windowStillOpen) {
                const w = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
                out.windowAfterOK = {text: flat(await w.innerText().catch(() => ''), 2500), errors: await w.locator('.error, .pkp_form_error, [class*="error"]:not(input)').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)).filter(Boolean)).catch(() => [])};
                await shot(page, `${label}-still-open`).catch(() => {});
            }
            out.toastsLater = await toasts(page);
        } else if (how === 'navigate') {
            const dialogs = [];
            const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onDialog);
            await page.goto(ctxUrl('/dashboard/editorial')).catch((e) => dialogs.push({gotoError: String(e.message).slice(0, 120)}));
            await page.waitForTimeout(800); await idle(page);
            page.off('dialog', onDialog);
            out.browserDialogs = dialogs; out.landed = page.url();
        } else {
            const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: /^Cancel$/})).first();
            await loc(page, `${label}: the window's Cancel`, cancel);
            const dialogs = [];
            const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onDialog);
            if (await cancel.count()) await cancel.click().catch(() => {}); else await page.keyboard.press('Escape');
            await page.waitForTimeout(600); await idle(page);
            page.off('dialog', onDialog);
            out.browserDialogs = dialogs;
            out.dialogsAfter = (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 120)}));
            out.windowStillOpen = out.dialogsAfter.some((d) => /Assign Participant/.test(d.name || ''));
        }
        if (how !== 'navigate') { await waitRows(page, ''); out.panelAfter = await participantsPanel(page); out.discussionsAfter = (await wfInfo(page)).discussions; }
        record(`${label}-assign-${how}`, out);
        log(`[${label} assign ${how}]`, 'toasts:', JSON.stringify((out.toasts || []).map((t) => `${t.text} @top${t.top}/right${t.right}`)), '| dialogs:', JSON.stringify(out.browserDialogs), '| still open:', out.windowStillOpen, '| rows:', JSON.stringify(((out.panelAfter || {}).items || []).map((i) => i.text.slice(0, 70))));
        return out;
    }
    async function closeWindowIfOpen(page) {
        const open = async () => (await dialogTexts(page)).some((d) => /Assign Participant/.test(d.name || ''));
        if (!(await open())) return;
        const w = topWin(page);
        const dialogs = [];
        const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
        page.on('dialog', onDialog);
        const cancel = w.getByRole('link', {name: 'Cancel', exact: true}).last();
        if (await cancel.count()) { await cancel.click().catch(() => {}); await page.waitForTimeout(700); await idle(page); }
        if (await open()) { const x = topWin(page).getByRole('button', {name: /^Close$/}).first(); if (await x.count()) { await x.click().catch(() => {}); await page.waitForTimeout(700); await idle(page); } }
        page.off('dialog', onDialog);
        if (dialogs.length) record(`close-window-dialogs-${Date.now()}`, dialogs);
    }
    // One full assignment: open, group, search, pick, template and/or typed message, OK. Returns the reads.
    async function assignUser(page, label, {group, user, searchText, template, message, how = 'ok'}) {
        const a = await openAssign(page, label);
        if (!a) return {absent: true};
        const out = {open: a.out};
        out.group = await chooseGroup(page, a.form, a.sel, group);
        out.search = await search(page, a.form, searchText == null ? user.split(' ')[0] : searchText);
        out.pick = await pickUser(page, a.form, user);
        if (out.pick.warning) {
            const w = topWin(page);
            const ok = w.getByRole('button', {name: /^(OK|Yes)$/}).last();
            await shot(page, `${label}-reviewer-warning`).catch(() => {});
            if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(400); }
            out.pick.afterWarningOK = {dialogs: (await dialogTexts(page)).map((d) => d.name), stillChecked: await a.form.locator(`input[name="userId"][value="${out.pick.value}"]`).isChecked().catch(() => null)};
        }
        if (template) out.template = await chooseTemplate(page, a.form, a.tmpl, template);
        if (message != null) out.typed = await setMessage(page, message);
        out.messageBeforeLeave = await messageContent(page);
        await snap(page, `${label}-assign-filled`, {group, user, template: out.template && out.template.picked, typed: !!message, pick: out.pick, boxes: out.pick.boxes});
        log(`[${label}] pick:`, JSON.stringify(out.pick.picked || out.pick.userAbsent), 'warning:', JSON.stringify(out.pick.warning && flat(out.pick.warning.text, 120)), '| template:', JSON.stringify(out.template && (out.template.picked || out.template.templateAbsent)), '| msg:', flat(out.messageBeforeLeave.content, 160));
        out.leave = await leaveAssign(page, a.form, how, label);
        await closeWindowIfOpen(page);
        return out;
    }

    // =========================================================================
    if (on('seed') && !sc.contextPath) {
        const t = tag('u35k2');
        const nm = (k, roles, extra) => { const [g, f] = NAMES[k].split(' '); return {username: `${t}${k}`, roles, givenName: g, familyName: f, ...(extra || {})}; };
        let users;
        if (isOPS) users = [nm('mgr', ['manager']), nm('mgr2', ['manager']), nm('mgrse', ['manager', 'sectionEditor']), nm('se1', ['sectionEditor', 'author']), nm('se2', ['sectionEditor']), nm('se3', ['sectionEditor', 'author']), nm('au', ['author']), nm('au2', ['author']), nm('ebm', ['editorialBoardMember'])];
        else users = [nm('mgr', ['manager']), nm('mgr2', ['manager']), nm('mgrse', ['manager', 'sectionEditor']), nm('ed', ['editor']), nm('se1', ['sectionEditor', 'funding']), nm('se2', ['sectionEditor']), nm('se3', ['sectionEditor', 'copyeditor']), ...(isOJS ? [nm('ge', ['guestEditor'])] : [nm('ve', ['volumeEditor'])]), nm('tr', ['translator']), nm('fund', ['funding']), nm('ce', ['copyeditor']), nm('le', ['layoutEditor']), nm('pe', ['productionEditor']), nm('rse', ['sectionEditor', 'externalReviewer']), nm('rse2', ['sectionEditor', 'externalReviewer']), nm('rse3', ['sectionEditor', 'externalReviewer']), nm('au', ['author']), nm('au2', ['author'])];
        if (isOJS) for (let i = 1; i <= 22; i++) users.push({username: `${t}a${String(i).padStart(2, '0')}`, roles: ['author'], givenName: 'Zed', familyName: `Author${String(i).padStart(2, '0')}`});
        const spec = {tag: t, users};
        if (isOJS) spec.sections = [{abbrev: 'ART', title: {en: 'Articles'}, policy: {en: 'Policy'}}];
        if (isOPS) spec.sections = [{abbrev: 'PRE', title: {en: 'Preprints'}, policy: {en: 'Policy'}}];
        const ctx = await app.api.createContext(spec);
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId; sc.titles = {}; save();
        const P = (k, role) => ({username: `${t}${k}`, role});
        const sub = async (k, extra) => { const title = `U35 K2 ${k} ${t}`; const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: `${t}au`, title, ...extra}); sc[k] = r.submissionId; sc.titles[k] = title; save(); log(`[seed] ${k} → ${r.submissionId} stage ${r.stageId}`); return r; };
        if (isOPS) {
            await sub('S1', {participants: [P('se1', 'author')]});
            await sub('S2', {participants: [P('se3', 'sectionEditor')]});
            await sub('S3', {participants: [P('se3', 'author')]});
        } else {
            await sub('S1', {participants: [P('se1', 'funding')]});
            await sub('S2', {decisions: viaReview, reviewRounds: [{reviewers: [{username: `${t}rse`, status: 'accepted'}, {username: `${t}rse2`, status: 'declined'}]}], participants: [P('se3', 'sectionEditor'), P('se2', 'sectionEditor')]});
            await sub('S3', {decisions: [...viaReview, 'accept'], reviewRounds: [{reviewers: [{username: `${t}rse3`, status: 'completed'}]}], participants: [P('se3', 'copyeditor'), P('se2', 'sectionEditor')]});
            await sub('S4', {decisions: [...viaReview, 'accept', 'sendToProduction'], reviewRounds: [{reviewers: [{username: `${t}rse3`, status: 'completed'}]}], participants: [P('se2', 'sectionEditor')]});
            if (isOMP) await sub('S5', {decisions: ['sendInternalReview'], participants: [P('se2', 'sectionEditor')]});
            // the open-review context (4d's "Open" end)
            const t2 = tag('u35k2o');
            const ctx2 = await app.api.createContext({tag: t2, review: {defaultReviewMode: 'open'}, users: [nm('mgr', ['manager']), nm('rse4', ['sectionEditor', 'externalReviewer']), nm('au', ['author'])].map((u) => ({...u, username: u.username.replace(t, t2)}))});
            sc.tag2 = t2; sc.contextPath2 = ctx2.path || t2; save();
            const r = await app.api.createSubmission({tag: `${t2}O1`, context: sc.contextPath2, submitter: `${t2}au`, title: `U35 K2 O1 open ${t2}`, decisions: viaReview, reviewRounds: [{reviewers: [{username: `${t2}rse4`, status: 'accepted'}]}]});
            sc.O1 = r.submissionId; save(); log(`[seed] O1 → ${r.submissionId} stage ${r.stageId}`);
        }
        record('seed', {...sc, users: users.map((u) => u.username)});
    }
    if (!sc.contextPath) { log('[k2] no scratch context; run the seed phase first'); return; }
    log('[k2]', app.name, JSON.stringify(sc));

    // =========================================================================
    // window: the "Assign Participant" window on S1's Submission stage as the manager (Fields, 4a–4c, 4e, 4f's Cancel and leave; t1, t4), plus the "Edit Assignment" and "Notify" windows' fields
    if (on('window')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S1, 'workflow_1'), 'w-s1');
            // 4a, 4b, 4e: the window as it lands; then the role changed alone (no reload?), Search (reload), a nobody search, the assistant role's list (se1 absent), the Author list (twenty rows, scroll)
            await sect('window landing', async () => {
                const a = await openAssign(page, 'w-s1');
                const out = {};
                out.changeRoleAlone = await chooseGroup(page, a.form, a.sel, SE_ROLE);
                out.searchEmpty = await search(page, a.form, '');
                out.searchNobody = await search(page, a.form, 'zzznobodyzzz');
                out.searchSe1 = await search(page, a.form, 'Sid');
                await snap(page, 'w-s1-assign-se-list', {selected: SE_ROLE, rows: out.searchEmpty.grid.rows, nobody: out.searchNobody.grid});
                // the assistant role se1 already holds on this submission: se1 not offered
                const other = isOPS ? 'Author' : 'Funding coordinator';
                out.otherRole = await chooseGroup(page, a.form, a.sel, other);
                out.otherSearch = await search(page, a.form, '');
                out.otherSe1 = (out.otherSearch.grid.rows || []).some((r) => r.text.includes(NAMES.se1));
                await snap(page, 'w-s1-assign-other-list', {selected: other, rows: out.otherSearch.grid.rows});
                // the Author list: twenty rows at a time, more on scroll
                out.authorRole = await chooseGroup(page, a.form, a.sel, 'Author');
                out.authorSearch = await search(page, a.form, '');
                const before = out.authorSearch.grid.rowCount;
                const footer = async () => a.form.locator('.pkp_controllers_grid').first().evaluate((g) => ({footer: (g.querySelector('.gridPagingScrolling, .footer, [class*=Paging]') || {}).innerText?.replace(/\s+/g, ' ').trim() || null, moreLink: [...g.querySelectorAll('a')].filter((x) => x.getClientRects().length && /more/i.test(x.innerText)).map((x) => x.innerText.trim())})).catch(() => null);
                out.footerBefore = await footer();
                const lastRow = a.form.locator('.pkp_controllers_grid tbody tr').last();
                const reqs = await gridRequests(page, async () => {
                    await lastRow.scrollIntoViewIfNeeded().catch(() => {});
                    await lastRow.hover().catch(() => {});
                    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(400); }
                    await page.waitForTimeout(1500); await idle(page);
                });
                const afterWheel = await userGrid(a.form);
                out.scroll = {rowsBefore: before, rowsAfterWheel: afterWheel.rowCount, wheelRequests: reqs, footerBefore: out.footerBefore, footerAfterWheel: await footer()};
                if (afterWheel.rowCount === before) {
                    const more = a.form.getByRole('link', {name: /Load more/i}).first();
                    await loc(page, 'w-s1: the grid\'s "Load more" link', more);
                    if (await more.count()) {
                        out.scroll.moreRequests = await gridRequests(page, async () => { await more.click(); await page.waitForTimeout(1500); await idle(page); });
                        const afterMore = await userGrid(a.form);
                        out.scroll.rowsAfterMore = afterMore.rowCount; out.scroll.footerAfterMore = await footer(); out.scroll.lastRows = (afterMore.rows || []).slice(-3).map((r) => r.text.slice(0, 60));
                    }
                }
                const afterGrid = await userGrid(a.form);
                await snap(page, 'w-s1-assign-author-list', {selected: 'Author', scroll: out.scroll});
                log('[w-s1 lists]', 'role change alone reqs:', JSON.stringify(out.changeRoleAlone.requests), '| search reqs:', JSON.stringify(out.searchEmpty.requests), '| SE rows:', JSON.stringify(out.searchEmpty.grid.rows.map((r) => r.cells.join(' / ').slice(0, 70))), '| nobody:', JSON.stringify(out.searchNobody.grid.rows.map((r) => r.text)), '| se1 in other list:', out.otherSe1, '| author rows before/after scroll:', before, afterGrid.rowCount);
                record('w-s1-lists', out);
                // 4c: choose a person in an editor-level role → both sections; change the role → hidden; choose an assistant → Permissions alone
                const c = {};
                c.seRole = await chooseGroup(page, a.form, a.sel, SE_ROLE);
                c.seSearch = await search(page, a.form, 'Sue');
                c.sePick = await pickUser(page, a.form, NAMES.se2);
                await snap(page, 'w-s1-assign-se2-picked', {pick: c.sePick});
                c.roleChanged = await chooseGroup(page, a.form, a.sel, other);
                c.boxesAfterRoleChange = (await formBoxes(a.form)).boxes.filter((b) => /recommendOnly|canChangeMetadata/.test(b.name)).map((b) => ({name: b.name, checked: b.checked, visible: b.visible}));
                c.otherSearch = await search(page, a.form, isOPS ? 'Abe' : 'Fay');
                c.otherPick = await pickUser(page, a.form, isOPS ? NAMES.au2 : NAMES.fund);
                await snap(page, 'w-s1-assign-assistant-picked', {pick: c.otherPick});
                log('[w-s1 4c]', 'SE pick boxes:', JSON.stringify(c.sePick.boxes), 'sections:', JSON.stringify(c.sePick.sections), '| after role change:', JSON.stringify(c.boxesAfterRoleChange), '| assistant pick:', JSON.stringify(c.otherPick.boxes));
                record('w-s1-4c', c);
                // 4e: the template list's entries and "Assign Editor"'s body (or the first template on a preprint server's Submission stage)
                const e = {templates: a.out.templates};
                if (a.out.templates && a.out.templates.some((t) => /Assign Editor/.test(t.text))) e.assignEditor = await chooseTemplate(page, a.form, a.tmpl, /^Assign Editor$/);
                else if (a.out.templates && a.out.templates.length > 1) e.first = await chooseTemplate(page, a.form, a.tmpl, a.out.templates[1].text);
                const back = await selectOptions(a.tmpl);
                e.blankFirst = back[0] && {text: back[0].text, value: back[0].value};
                await snap(page, 'w-s1-assign-template-filled', e);
                log('[w-s1 4e]', JSON.stringify(e.templates && e.templates.map((t) => t.text)), '| body:', flat(((e.assignEditor || e.first || {}).message || {}).content, 400));
                record('w-s1-4e', e);
                // 4f: Cancel after a person was chosen (and a template filled): nobody assigned
                const l = await leaveAssign(page, a.form, 'cancel', 'w-s1-chosen');
                record('w-s1-cancel-after-pick', l);
            });
            const reland = async (label) => { await closeWindowIfOpen(page); await openWorkflow(page, workflow(sc.S1, 'workflow_1'), label); };
            // t1: OK with no row chosen
            await sect('window t1 no row', async () => {
                await reland('w-s1-r1');
                const a = await openAssign(page, 'w-s1-t1');
                await chooseGroup(page, a.form, a.sel, SE_ROLE);
                const l = await leaveAssign(page, a.form, 'ok', 'w-s1-t1');
                log('[t1]', 'still open:', l.windowStillOpen, '| errors:', JSON.stringify(l.windowAfterOK && l.windowAfterOK.errors), '| toasts:', JSON.stringify((l.toasts || []).map((t) => t.text)));
                await closeWindowIfOpen(page);
            });
            // t1 second end: a person chosen, the message typed, no template: is "Message" a blocker without a person? (the person chosen, OK goes through: driven in a2). Here: the message typed and no person.
            await sect('window t1 message no row', async () => {
                await reland('w-s1-r2');
                const a = await openAssign(page, 'w-s1-t1b');
                await chooseGroup(page, a.form, a.sel, SE_ROLE);
                await setMessage(page, `<p>U35 K2 no-row ${sc.tag}</p>`);
                const l = await leaveAssign(page, a.form, 'ok', 'w-s1-t1b');
                log('[t1b]', 'still open:', l.windowStillOpen, '| errors:', JSON.stringify(l.windowAfterOK && l.windowAfterOK.errors));
                await closeWindowIfOpen(page);
            });
            // 4f: leaving the window another way with a change made
            await sect('window leave by navigation', async () => {
                await reland('w-s1-r3');
                const a = await openAssign(page, 'w-s1-nav');
                await chooseGroup(page, a.form, a.sel, SE_ROLE);
                await search(page, a.form, 'Sue');
                await pickUser(page, a.form, NAMES.se2);
                const l = await leaveAssign(page, a.form, 'navigate', 'w-s1-nav');
                log('[navigate]', JSON.stringify(l.browserDialogs), l.landed);
                const r = await openWorkflow(page, workflow(sc.S1, 'workflow_1'), 'w-s1-after-nav');
                record('w-s1-after-nav-panel', {items: r.panel.items});
            });
            // sweep: the window's Close (X) with a change made
            await sect('window close X', async () => {
                await reland('w-s1-r4');
                const a = await openAssign(page, 'w-s1-x');
                await chooseGroup(page, a.form, a.sel, SE_ROLE);
                await search(page, a.form, 'Sue');
                await pickUser(page, a.form, NAMES.se2);
                const x = a.form.getByRole('button', {name: /^Close$/}).first();
                const dialogs = [];
                const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
                page.on('dialog', onDialog);
                if (await x.count()) { await x.click(); await page.waitForTimeout(700); await idle(page); }
                page.off('dialog', onDialog);
                const after = (await dialogTexts(page)).map((d) => d.name);
                await waitRows(page, '');
                record('w-s1-x-close', {hadX: !!(await x.count()), browserDialogs: dialogs, dialogsAfter: after, panel: await participantsPanel(page)});
                log('[close X]', JSON.stringify(dialogs), JSON.stringify(after));
                await closeWindowIfOpen(page);
            });
            // The "Edit Assignment" window (77–80) on se1's assistant row, and the "Notify" window (82–86) on it: fields, then an empty send
            await sect('edit window fields', async () => {
                await reland('w-s1-r5');
                const {items, more, absent} = await rowMenu(page, NAMES.se1, 'w-s1-se1');
                if (absent) return;
                const edit = page.getByRole('menuitem', {name: /^Edit$/}).first();
                if (!(await edit.count())) { await closeMenu(page, more); record('w-s1-se1-edit', {noEdit: true, items}); return; }
                await edit.click(); await idle(page);
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && (d.querySelector('input[name=recommendOnly], input[name=canChangeMetadata]') || /No changes can be made/.test(d.innerText)); }, null, {timeout: 20000}).catch(() => {});
                await idle(page);
                const dl = (await dialogTexts(page)).slice(-1)[0] || {};
                const f = await formBoxes(topWin(page));
                const bold = await topWin(page).locator('strong, b').evaluateAll((els) => els.map((e) => e.innerText.trim())).catch(() => []);
                await snap(page, 'w-s1-se1-edit', {title: dl.name, text: flat(dl.text, 1500), boxes: f.boxes, sections: f.sections, bold, buttons: dl.buttons, links: dl.links});
                log('[edit window]', dl.name, '| bold:', JSON.stringify(bold), '| boxes:', JSON.stringify(f.boxes.map((b) => `${b.name}${b.checked ? '[x]' : '[ ]'}`)), '| text:', flat(dl.text, 200));
                const cancel = topWin(page).getByRole('link', {name: 'Cancel', exact: true}).first();
                if (await cancel.count()) await cancel.click(); else await topWin(page).getByRole('button', {name: /^Close$/}).first().click();
                await page.waitForTimeout(600); await idle(page);
            });
            await sect('notify window fields', async () => {
                await reland('w-s1-r6');
                const {items, more, absent} = await rowMenu(page, NAMES.se1, 'w-s1-se1-n');
                if (absent) return;
                const notify = page.getByRole('menuitem', {name: /^Notify$/}).first();
                if (!(await notify.count())) { await closeMenu(page, more); record('w-s1-se1-notify', {noNotify: true, items}); return; }
                await notify.click(); await idle(page);
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('select[name="template"], textarea[name="message"]'); }, null, {timeout: 20000}).catch(() => {});
                await idle(page);
                const w = topWin(page);
                const dl = (await dialogTexts(page)).slice(-1)[0] || {};
                const tsel = w.locator('select[name="template"]');
                const templates = (await tsel.count()) ? await selectOptions(tsel) : null;
                const sections = await w.locator('legend, h3, h4, h5, label').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 160)).filter(Boolean)).catch(() => []);
                await snap(page, 'w-s1-se1-notify', {title: dl.name, text: flat(dl.text, 1500), templates: templates && templates.map((t) => t.text), sections, message: await messageContent(page), buttons: dl.buttons, links: dl.links});
                await loc(page, 'Notify window: the template list', tsel);
                log('[notify window]', dl.name, '| templates:', JSON.stringify(templates && templates.map((t) => t.text)), '| buttons:', JSON.stringify(dl.buttons), '| links:', JSON.stringify(dl.links), '| text:', flat(dl.text, 300));
                // send with the message empty
                const send = w.getByRole('button', {name: /^(Notify|OK|Send)$/}).last();
                await loc(page, 'Notify window: the submit button', send);
                const reqs = await gridRequests(page, async () => { await send.click(); await page.waitForTimeout(1200); await idle(page); });
                const after = (await dialogTexts(page)).slice(-1)[0] || {};
                const stillOpen = /^Notify$/.test(after.name || '') || /Start Discussion/.test(after.text || '');
                const errors = stillOpen ? await topWin(page).locator('.error, .pkp_form_error, [class*="error"]:not(input)').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)).filter(Boolean)).catch(() => []) : [];
                await snap(page, 'w-s1-se1-notify-empty-send', {stillOpen, errors, toasts: await toasts(page), requests: reqs, text: flat(after.text, 1500)});
                log('[notify empty send]', 'still open:', stillOpen, '| errors:', JSON.stringify(errors), '| reqs:', JSON.stringify(reqs));
                if (stillOpen) { const c = topWin(page).getByRole('button', {name: /^Close$/}).first(); if (await c.count()) await c.click(); await page.waitForTimeout(600); await idle(page); }
                await waitRows(page, '');
                record('w-s1-se1-notify-after', {panel: await participantsPanel(page), discussions: (await wfInfo(page)).discussions});
            });
            // the Journal Manager's own Section-editor row: "No changes can be made to this participant" (79–80): assign mgrse as SE? that clears the needs-editor task, so this read comes after rule12 (phase a2 does it on S2/S4).
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // rule12: the managers' "needs an editor" task; Side effects "On Assign" and "On a message sent"; A1
    if (on('rule12')) {
        const {page, close} = await launch(app);
        try {
            const title = sc.titles.S1;
            const readManagers = async (label) => {
                const out = {};
                await signInAs(page, U('mgr')); out.mgr = needsEditor(await tasksPanel(page, `${label}-tasks-mgr`), title);
                await signInAs(page, U('mgr2')); out.mgr2 = needsEditor(await tasksPanel(page, `${label}-tasks-mgr2`), title);
                record(`${label}-needs-editor`, out); log(`[${label}] needs-editor task: mgr ${out.mgr} mgr2 ${out.mgr2}`);
                return out;
            };
            sc.r12 = {};
            sc.r12.before = await readManagers('r12-before');
            // 1. an assistant (OJS/OMP: Funding coordinator; OPS: Author), no message → the task stays
            await sect('r12 assistant', async () => {
                await signInAs(page, U('mgr'));
                await openWorkflow(page, workflow(sc.S1, 'workflow_1'), 'r12-s1');
                const logBefore = await activityLog(page, 'r12-log-before');
                const r = await assignUser(page, 'r12-asst', isOPS ? {group: 'Author', user: NAMES.au2} : {group: 'Funding coordinator', user: NAMES.fund});
                sc.r12.asst = {toasts: r.leave.toasts, rows: (r.leave.panelAfter.items || []).map((i) => i.text)};
                const logAfter = await activityLog(page, 'r12-log-after-asst');
                sc.r12.asstLogNew = (logAfter || []).slice(0, Math.max(0, (logAfter || []).length - (logBefore || []).length)).map((x) => x.join(' | '));
                save();
            });
            sc.r12.afterAsst = await readManagers('r12-after-asst');
            // OMP: a Press editor (manager-level) with "Assign Editor" → cleared; then the Series editor for A1. OJS: the Section editor with "Assign Editor". OPS: a Moderator on the Submission stage (no template there), then on Production with "Assign Editor".
            await sect('r12 editor', async () => {
                await signInAs(page, U('mgr'));
                await openWorkflow(page, workflow(sc.S1, 'workflow_1'), 'r12-s1-b');
                if (isOMP) {
                    const r = await assignUser(page, 'r12-ed', {group: ED_ROLE, user: NAMES.ed, template: /^Assign Editor$/});
                    sc.r12.ed = {toasts: r.leave.toasts, rows: (r.leave.panelAfter.items || []).map((i) => i.text), discussions: r.leave.discussionsAfter, body: r.template && r.template.message};
                    save();
                    sc.r12.afterEd = await readManagers('r12-after-ed');
                    await signInAs(page, U('mgr'));
                    await openWorkflow(page, workflow(sc.S1, 'workflow_1'), 'r12-s1-c');
                }
                if (isOPS) {
                    const r0 = await assignUser(page, 'r12-se2-submission', {group: SE_ROLE, user: NAMES.se2});
                    sc.r12.se2 = {toasts: r0.leave.toasts, rows: (r0.leave.panelAfter.items || []).map((i) => i.text), templates: r0.open.templates};
                    save();
                    sc.r12.afterSe2 = await readManagers('r12-after-se2');
                    await signInAs(page, U('mgr'));
                    await openWorkflow(page, workflow(sc.S1, 'workflow_5'), 'r12-s1-prod');
                }
                const logBefore = await activityLog(page, 'r12-log-before-se1');
                const r = await assignUser(page, 'r12-se1', {group: SE_ROLE, user: NAMES.se1, template: /^Assign Editor$/});
                sc.r12.se1 = {toasts: r.leave.toasts, rows: (r.leave.panelAfter.items || []).map((i) => i.text), discussions: r.leave.discussionsAfter, body: r.template && r.template.message, templateAbsent: r.template && r.template.templateAbsent};
                const logAfter = await activityLog(page, 'r12-log-after-se1');
                sc.r12.se1LogNew = (logAfter || []).slice(0, Math.max(0, (logAfter || []).length - (logBefore || []).length)).map((x) => x.join(' | '));
                save();
                // Rule 2 / 4f: the row on another stage of the role
                await openWorkflow(page, workflow(sc.S1, isOPS ? 'workflow_1' : REVIEW_KEY), 'r12-s1-other-stage');
            });
            sc.r12.afterSe1 = await readManagers('r12-after-se1');
            // the recipient: mail, Tasks (A1), the discussion
            await sect('r12 recipient', async () => {
                const m = {};
                try { const msg = await app.mail.find({to: mail('se1'), contains: title, timeoutMs: 20000}); m.se1 = {subject: msg.Subject, from: msg.From, to: msg.To}; const full = await app.mail.fullMessage(msg.ID); m.se1.text = flat(full.Text, 1200); } catch (e) { m.se1 = {error: String(e.message).slice(0, 200)}; }
                m.se1Count = await app.mail.count({to: mail('se1'), contains: title}).catch((e) => String(e.message));
                m.asstCount = await app.mail.count({to: mail(isOPS ? 'au2' : 'fund'), contains: title}).catch((e) => String(e.message));
                record('r12-mail', m); log('[r12 mail]', JSON.stringify(m));
                await signInAs(page, U('se1'));
                const t = await tasksPanel(page, 'r12-se1-tasks');
                sc.r12.se1Tasks = t && t.rows.map((r) => r.rowText.slice(0, 200));
                await openWorkflow(page, workflow(sc.S1, isOPS ? 'workflow_5' : 'workflow_1'), 'r12-se1-s1');
                if (!isOPS) {
                    await signInAs(page, U(isOPS ? 'au2' : 'fund'));
                    const t2 = await tasksPanel(page, 'r12-asst-tasks');
                    sc.r12.asstTasks = t2 && t2.rows.map((r) => r.rowText.slice(0, 200));
                }
                save();
            });
            // "Nothing brings it back": remove se1 (the editor) and read both managers again
            await sect('r12 remove', async () => {
                await signInAs(page, U('mgr'));
                await openWorkflow(page, workflow(sc.S1, isOPS ? 'workflow_5' : 'workflow_1'), 'r12-s1-d');
                const {more, absent} = await rowMenu(page, NAMES.se1, 'r12-remove');
                if (absent) return;
                const rm = page.getByRole('menuitem', {name: /^Remove$/}).first();
                if (!(await rm.count())) { await closeMenu(page, more); return; }
                await rm.click(); await idle(page); await page.waitForTimeout(500);
                const conf = (await dialogTexts(page)).slice(-1)[0] || {};
                record('r12-remove-confirm', {name: conf.name, text: flat(conf.text, 500), buttons: conf.buttons});
                const ok = topWin(page).getByRole('button', {name: /^(OK|Yes|Remove)$/}).last();
                if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(900); await idle(page); }
                await waitRows(page, '');
                record('r12-removed', {panel: await participantsPanel(page), toasts: await toasts(page)});
            });
            sc.r12.afterRemove = await readManagers('r12-after-remove');
            save();
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // a2: typed text with the list blank (A2); a template chosen and the text edited (547); an empty message (no mail); OMP Internal Review (A6); the mgrse own-row window
    if (on('a2')) {
        const {page, close} = await launch(app);
        try {
            const title = sc.titles.S1;
            await signInAs(page, U('mgr'));
            const stageKey = isOPS ? 'workflow_5' : 'workflow_1';
            await openWorkflow(page, workflow(sc.S1, stageKey), 'a2-s1');
            const logBefore = await activityLog(page, 'a2-log-before');
            const marker = `U35K2typed${sc.tag.slice(-5)}`;
            await sect('a2 typed no template', async () => {
                const who = isOPS ? {group: SE_ROLE, user: NAMES.mgrse} : {group: SE_ROLE, user: NAMES.se2};
                const r = await assignUser(page, 'a2-typed', {...who, message: `<p>${marker} typed with no predefined message.</p>`});
                sc.a2 = {who: who.user, toasts: r.leave.toasts, toastsLater: r.leave.toastsLater, rows: (r.leave.panelAfter.items || []).map((i) => i.text), discussions: r.leave.discussionsAfter, requests: r.leave.requests};
                const logAfter = await activityLog(page, 'a2-log-after-typed');
                sc.a2.logNew = (logAfter || []).slice(0, Math.max(0, (logAfter || []).length - (logBefore || []).length)).map((x) => x.join(' | '));
                save();
                log('[a2]', JSON.stringify(sc.a2.toasts.map((t) => t.text)), '| log new:', JSON.stringify(sc.a2.logNew), '| disc:', JSON.stringify(sc.a2.discussions));
            });
            // 547: a template chosen, then the text replaced by our own
            const marker2 = `U35K2edited${sc.tag.slice(-5)}`;
            await sect('a2 template then edited', async () => {
                const who = isOPS ? {group: SE_ROLE, user: NAMES.se3} : {group: 'Translator', user: NAMES.tr};
                const tpl = isOPS ? /^Discussion \(Production\)$/ : /^Discussion \(Submission\)$/;
                const r = await assignUser(page, 'a2-edited', {...who, template: tpl, message: `<p>${marker2} replaces the template text entirely.</p>`});
                sc.a2e = {who: who.user, template: r.template && r.template.picked, toasts: r.leave.toasts, rows: (r.leave.panelAfter.items || []).map((i) => i.text), discussions: r.leave.discussionsAfter};
                save();
            });
            await sect('a2 mail and tasks', async () => {
                const m = {};
                const who2 = isOPS ? 'se3' : 'tr';
                try { const msg = await app.mail.find({to: mail(who2), contains: marker2, timeoutMs: 25000}); m.edited = {subject: msg.Subject, snippet: msg.Snippet}; const full = await app.mail.fullMessage(msg.ID); m.edited.text = flat(full.Text, 1000); m.edited.hasMarker = /U35K2edited/.test(full.Text || '') || /U35K2edited/.test(full.HTML || ''); } catch (e) { m.edited = {error: String(e.message).slice(0, 200)}; }
                const who1 = isOPS ? 'mgrse' : 'se2';
                m.typedCount = await app.mail.count({to: mail(who1), contains: title}).catch((e) => String(e.message));
                m.typedMarkerAnywhere = await app.mail.count({to: mail(who1), contains: marker}).catch((e) => String(e.message));
                record('a2-mail', m); log('[a2 mail]', JSON.stringify(m));
                await signInAs(page, U(who1));
                const t = await tasksPanel(page, 'a2-typed-recipient-tasks');
                sc.a2.recipientTasks = t && t.rows.map((r) => r.rowText.slice(0, 200));
                await openWorkflow(page, workflow(sc.S1, stageKey), 'a2-typed-recipient-s1');
                await signInAs(page, U(who2));
                const t2 = await tasksPanel(page, 'a2-edited-recipient-tasks');
                sc.a2e.recipientTasks = t2 && t2.rows.map((r) => r.rowText.slice(0, 200));
                save();
            });
            // OMP: the Internal Review stage's window (A6): the list, a typed message there
            if (isOMP) await sect('a6 internal review', async () => {
                await signInAs(page, U('mgr'));
                await openWorkflow(page, workflow(sc.S5, 'workflow_2'), 'a6-s5');
                const r = await assignUser(page, 'a6-internal', {group: SE_ROLE, user: NAMES.rse2, message: `<p>U35K2internal${sc.tag.slice(-5)} typed on Internal Review.</p>`});
                sc.a6 = {templates: r.open.templates, toasts: r.leave.toasts, rows: (r.leave.panelAfter.items || []).map((i) => i.text), discussions: r.leave.discussionsAfter};
                sc.a6.mailCount = await app.mail.count({to: mail('rse2'), contains: sc.titles.S5}).catch((e) => String(e.message));
                save();
                // the Notify window there too
                const {more, absent} = await rowMenu(page, NAMES.rse2, 'a6-s5-rse2');
                if (!absent) {
                    const notify = page.getByRole('menuitem', {name: /^Notify$/}).first();
                    if (await notify.count()) {
                        await notify.click(); await idle(page);
                        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('select[name="template"], textarea[name="message"]'); }, null, {timeout: 20000}).catch(() => {});
                        const tsel = topWin(page).locator('select[name="template"]');
                        const templates = (await tsel.count()) ? await selectOptions(tsel) : null;
                        await snap(page, 'a6-s5-notify', {templates: templates && templates.map((t) => t.text)});
                        sc.a6.notifyTemplates = templates && templates.map((t) => t.text); save();
                        const c = topWin(page).getByRole('button', {name: /^Close$/}).first(); if (await c.count()) await c.click(); await page.waitForTimeout(600); await idle(page);
                    } else await closeMenu(page, more);
                }
            });
            // 79–80: the Journal Manager's own Section-editor row → "No changes can be made to this participant"
            await sect('mgrse own row', async () => {
                await signInAs(page, U('mgr'));
                const sub = isOPS ? sc.S2 : sc.S4;
                const key = isOPS ? 'workflow_5' : 'workflow_5';
                await openWorkflow(page, workflow(sub, key), 'own-s4');
                await assignUser(page, 'own-mgrse', {group: SE_ROLE, user: NAMES.mgrse});
                await signInAs(page, U('mgrse'));
                await openWorkflow(page, workflow(sub, key), 'own-s4-mgrse');
                const {more, absent} = await rowMenu(page, NAMES.mgrse, 'own-mgrse');
                if (absent) return;
                const edit = page.getByRole('menuitem', {name: /^Edit$/}).first();
                if (!(await edit.count())) { await closeMenu(page, more); record('own-mgrse-edit', {noEdit: true}); return; }
                await edit.click(); await idle(page);
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && (d.querySelector('input[name=recommendOnly], input[name=canChangeMetadata]') || /No changes can be made/.test(d.innerText)); }, null, {timeout: 20000}).catch(() => {});
                const dl = (await dialogTexts(page)).slice(-1)[0] || {};
                const f = await formBoxes(topWin(page));
                await snap(page, 'own-mgrse-edit', {title: dl.name, text: flat(dl.text, 800), boxes: f.boxes, buttons: dl.buttons, links: dl.links});
                log('[own row]', flat(dl.text, 200), JSON.stringify(f.boxes.map((b) => b.name)));
                const cancel = topWin(page).getByRole('link', {name: 'Cancel', exact: true}).first();
                if (await cancel.count()) await cancel.click(); else await topWin(page).getByRole('button', {name: /^Close$/}).first().click();
                await page.waitForTimeout(600); await idle(page);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // review (OJS/OMP): 4d on S2 (anonymous accepted → dialog; declined → none), on S3 Copyediting (none), on O1 open (none); the Review stage's role and template lists
    if (on('review') && !isOPS) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S2, REVIEW_KEY), 'rv-s2');
            await sect('4d anonymous accepted', async () => {
                const r = await assignUser(page, 'rv-s2-rse', {group: SE_ROLE, user: NAMES.rse});
                sc.rv = {s2: {groups: r.open.groups.map((g) => g.text), templates: r.open.templates && r.open.templates.map((t) => t.text), warning: r.pick.warning, afterWarningOK: r.pick.afterWarningOK, toasts: r.leave.toasts, rows: (r.leave.panelAfter.items || []).map((i) => i.text)}};
                save();
                log('[4d accepted]', JSON.stringify(r.pick.warning), '| rows:', JSON.stringify(sc.rv.s2.rows));
            });
            await sect('4d declined', async () => {
                const r = await assignUser(page, 'rv-s2-rse2', {group: SE_ROLE, user: NAMES.rse2, how: 'cancel'});
                sc.rv.declined = {warning: r.pick.warning, picked: r.pick.picked || r.pick.userAbsent}; save();
                log('[4d declined]', JSON.stringify(r.pick.warning), JSON.stringify(sc.rv.declined));
            });
            // the review ROUND entry's window too (the panel is the stage's; the round entry may carry its own)
            await sect('4d round entry', async () => {
                const dlg = page.locator('[role="dialog"]:visible').first();
                const entry = dlg.locator('nav button, nav a, [class*="sideMenu"] button, [class*="sideMenu"] a').filter({hasText: /^\s*Review Round 1\s*$/}).first();
                if (!(await entry.count())) { record('rv-s2-round-entry', {absent: true}); return; }
                await entry.click(); await idle(page); await page.waitForTimeout(500);
                await snap(page, 'rv-s2-round', {panel: await participantsPanel(page)});
            });
            await sect('4d copyediting', async () => {
                await openWorkflow(page, workflow(sc.S3, 'workflow_4'), 'rv-s3');
                const r = await assignUser(page, 'rv-s3-rse3', {group: SE_ROLE, user: NAMES.rse3, how: 'cancel'});
                sc.rv.copyediting = {warning: r.pick.warning, picked: r.pick.picked || r.pick.userAbsent, groups: r.open.groups.map((g) => g.text), templates: r.open.templates && r.open.templates.map((t) => t.text)}; save();
                log('[4d copyediting]', JSON.stringify(r.pick.warning), JSON.stringify(sc.rv.copyediting));
            });
            await sect('4d open review', async () => {
                await signInAs(page, `${sc.tag2}mgr`, sc.contextPath2);
                await openWorkflow(page, workflow(sc.O1, REVIEW_KEY, sc.contextPath2), 'rv-o1');
                const r = await assignUser(page, 'rv-o1-rse4', {group: SE_ROLE, user: NAMES.rse4, how: 'cancel'});
                sc.rv.open = {warning: r.pick.warning, picked: r.pick.picked || r.pick.userAbsent}; save();
                log('[4d open]', JSON.stringify(r.pick.warning), JSON.stringify(sc.rv.open));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // fourd (OJS/OMP): 4d again with the window's own script options captured (anonymousReviewerIds) and a real click on the reviewer's radio; Rae removed from S2 first so she is offered again
    if (on('fourd') && !isOPS) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S2, REVIEW_KEY), 'fd-s2');
            await sect('4d remove rae', async () => {
                const {more, absent} = await rowMenu(page, NAMES.rse, 'fd-remove');
                if (absent) return;
                const rm = page.getByRole('menuitem', {name: /^Remove$/}).first();
                if (!(await rm.count())) { await closeMenu(page, more); return; }
                await rm.click(); await idle(page); await page.waitForTimeout(500);
                const ok = topWin(page).getByRole('button', {name: /^(OK|Yes|Remove)$/}).last();
                if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(900); await idle(page); }
                await waitRows(page, '');
                record('fd-removed', {panel: await participantsPanel(page)});
            });
            for (const [label, key] of [['fd-stage', REVIEW_KEY], ['fd-round', null]]) await sect(`4d ${label}`, async () => {
                if (key) await openWorkflow(page, workflow(sc.S2, key), label);
                else {
                    const dlg = page.locator('[role="dialog"]:visible').first();
                    const entry = dlg.locator('nav button, nav a, [class*="sideMenu"] button, [class*="sideMenu"] a').filter({hasText: /^\s*Review Round 1\s*$/}).first();
                    if (!(await entry.count())) { record(label, {noEntry: true}); return; }
                    await entry.click(); await idle(page); await page.waitForTimeout(600); await waitRows(page, '');
                    await snap(page, label, {panel: await participantsPanel(page)});
                }
                const scripts = [];
                const onResp = async (r) => { if (/addParticipant|add-participant/i.test(r.url())) { try { const t = await r.text(); const m = t.match(/anonymousReviewerIds:\s*(\[[^\]]*\])/); scripts.push({url: r.url().replace(/^.*\/index\.php/, '').slice(0, 160), status: r.status(), anonymousReviewerIds: m ? m[1] : null, hasWarningText: /anonymousReviewerWarning/.test(t)}); } catch (e) { scripts.push({error: String(e.message).slice(0, 100)}); } } };
                page.on('response', onResp);
                const a = await openAssign(page, label);
                page.off('response', onResp);
                record(`${label}-window-script`, {scripts});
                log(`[${label}] window script:`, JSON.stringify(scripts));
                await chooseGroup(page, a.form, a.sel, SE_ROLE);
                await search(page, a.form, 'Rae');
                const grid = await userGrid(a.form);
                const row = (grid.rows || []).find((r) => r.radio && r.text.includes(NAMES.rse));
                if (!row) { record(`${label}-rae-absent`, {rows: grid.rows.map((r) => r.text)}); await leaveAssign(page, a.form, 'cancel', label); return; }
                const before = (await dialogTexts(page)).length;
                const radio = a.form.locator(`input[name="userId"][value="${row.value}"]`);
                await radio.click({force: true}); await page.waitForTimeout(1500); await idle(page);
                const dialogs = await dialogTexts(page);
                const extra = await page.locator('.ui-dialog:visible, .pkp_modal:visible, [data-cy="dialog"]:visible, .modal:visible').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 400))).catch(() => []);
                const hidden = await a.form.locator('input[name="userIdSelected"], input[name="userGroupId"]').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value}))).catch(() => []);
                const out = {dialogsBefore: before, dialogsAfter: dialogs.length, newDialog: dialogs.length > before ? {name: dialogs.slice(-1)[0].name, text: flat(dialogs.slice(-1)[0].text, 600), buttons: dialogs.slice(-1)[0].buttons} : null, otherModals: extra, hidden, scripts};
                await snap(page, `${label}-rae-picked`, out);
                log(`[${label}] rae picked →`, JSON.stringify(out));
                if (out.newDialog) { const ok = topWin(page).getByRole('button', {name: /^(OK|Yes)$/}).last(); if (await ok.count()) { await ok.click(); await idle(page); } }
                await leaveAssign(page, a.form, 'cancel', label);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // a6round (OMP): the Internal Review ROUND entry's panel and window (the stage entry has no Participants panel)
    if (on('a6round') && isOMP) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            const r0 = await openWorkflow(page, workflow(sc.S5, 'workflow_2'), 'a6-s5-stage');
            await sect('a6 round entry', async () => {
                const dlg = page.locator('[role="dialog"]:visible').first();
                const entry = dlg.locator('nav button, nav a, [class*="sideMenu"] button, [class*="sideMenu"] a').filter({hasText: /^\s*Review Round 1\s*$/}).first();
                await entry.click(); await idle(page); await page.waitForTimeout(600); await waitRows(page, '');
                const r = await openWorkflow(page, page.url(), 'a6-s5-round');
                record('a6-panel-by-entry', {stage: r0.panel, round: r.panel, roundUrl: page.url()});
                const a = await assignUser(page, 'a6-internal', {group: SE_ROLE, user: NAMES.rse2, message: `<p>U35K2internal${sc.tag.slice(-5)} typed on Internal Review.</p>`});
                sc.a6 = {templates: a.open && a.open.templates, groups: a.open && a.open.groups.map((g) => g.text), toasts: a.leave && a.leave.toasts, requests: a.leave && a.leave.requests, stillOpen: a.leave && a.leave.windowStillOpen, rows: a.leave && (a.leave.panelAfter.items || []).map((i) => i.text), discussions: a.leave && a.leave.discussionsAfter};
                save();
                await openWorkflow(page, page.url(), 'a6-s5-round-after');
                sc.a6.mailCount = await app.mail.count({to: mail('rse2'), contains: sc.titles.S5}).catch((e) => String(e.message));
                sc.a6.rowsRelanded = (await participantsPanel(page)).items;
                const {more, absent} = await rowMenu(page, NAMES.rse2, 'a6-s5-rse2');
                if (!absent) {
                    const notify = page.getByRole('menuitem', {name: /^Notify$/}).first();
                    if (await notify.count()) {
                        await notify.click(); await idle(page);
                        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('select[name="template"], textarea[name="message"]'); }, null, {timeout: 20000}).catch(() => {});
                        const tsel = topWin(page).locator('select[name="template"]');
                        const templates = (await tsel.count()) ? await selectOptions(tsel) : null;
                        await snap(page, 'a6-s5-notify', {templates: templates && templates.map((t) => t.text)});
                        sc.a6.notifyTemplates = templates && templates.map((t) => t.text); save();
                        const c = topWin(page).getByRole('button', {name: /^Close$/}).first(); if (await c.count()) await c.click(); await page.waitForTimeout(600); await idle(page);
                    } else await closeMenu(page, more);
                }
                save();
                log('[a6]', JSON.stringify(sc.a6));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // stages: the template list per stage (4e, t6): Copyediting with "Request Copyedit" to ce (A1's control: the Copyeditor's task), Production (OMP: Index…), OPS Production
    if (on('stages')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            sc.stages = sc.stages || {};
            if (!isOPS) {
                await sect('copyediting request copyedit', async () => {
                    await openWorkflow(page, workflow(sc.S3, 'workflow_4'), 'st-s3');
                    const r = await assignUser(page, 'st-s3-ce', {group: 'Copyeditor', user: NAMES.ce, template: /^Request Copyedit$/});
                    sc.stages.copyediting = {groups: r.open.groups.map((g) => g.text), templates: r.open.templates && r.open.templates.map((t) => t.text), body: r.template && r.template.message, toasts: r.leave.toasts, discussions: r.leave.discussionsAfter};
                    save();
                });
                await sect('production list', async () => {
                    await openWorkflow(page, workflow(sc.S4, 'workflow_5'), 'st-s4');
                    const a = await openAssign(page, 'st-s4');
                    const tp = a.out.templates && a.out.templates.some((t) => /Assign Editor/.test(t.text)) ? await chooseTemplate(page, a.form, a.tmpl, /^Assign Editor$/) : null;
                    sc.stages.production = {groups: a.out.groups.map((g) => g.text), templates: a.out.templates && a.out.templates.map((t) => t.text), assignEditorBody: tp && tp.message};
                    save();
                    await leaveAssign(page, a.form, 'cancel', 'st-s4');
                });
                await sect('copyeditor tasks and mail', async () => {
                    const m = {};
                    try { const msg = await app.mail.find({to: mail('ce'), contains: sc.titles.S3, timeoutMs: 25000}); m.ce = {subject: msg.Subject}; const full = await app.mail.fullMessage(msg.ID); m.ce.text = flat(full.Text, 800); } catch (e) { m.ce = {error: String(e.message).slice(0, 200)}; }
                    record('st-ce-mail', m);
                    await signInAs(page, U('ce'));
                    const t = await tasksPanel(page, 'st-ce-tasks');
                    sc.stages.ceTasks = t && t.rows.map((r) => r.rowText.slice(0, 200)); save();
                });
            } else {
                await sect('ops production list', async () => {
                    await openWorkflow(page, workflow(sc.S2, 'workflow_5'), 'st-ops-s2');
                    const a = await openAssign(page, 'st-ops-s2');
                    const tp = a.out.templates && a.out.templates.some((t) => /Assign Editor/.test(t.text)) ? await chooseTemplate(page, a.form, a.tmpl, /^Assign Editor$/) : null;
                    sc.stages.production = {groups: a.out.groups.map((g) => g.text), templates: a.out.templates && a.out.templates.map((t) => t.text), assignEditorBody: tp && tp.message};
                    save();
                    await leaveAssign(page, a.form, 'cancel', 'st-ops-s2');
                    await openWorkflow(page, workflow(sc.S2, 'workflow_1'), 'st-ops-s2-submission');
                    const b = await openAssign(page, 'st-ops-s2-submission');
                    sc.stages.submission = {groups: b.out.groups.map((g) => g.text), templates: b.out.templates && b.out.templates.map((t) => t.text)}; save();
                    await leaveAssign(page, b.form, 'cancel', 'st-ops-s2-submission');
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // tpl: the template body fetch per stage with its request recorded (t6): Review's "Assign Editor" (OJS/OMP), the Copyediting notice after the Copyeditor's assignment, OPS's two Production templates
    if (on('tpl')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            sc.tpl = {};
            if (!isOPS) {
                await sect('tpl review assign editor', async () => {
                    await openWorkflow(page, workflow(sc.S2, REVIEW_KEY), 'tpl-s2');
                    const a = await openAssign(page, 'tpl-s2');
                    sc.tpl.review = {templates: a.out.templates && a.out.templates.map((t) => t.text), assignEditor: await chooseTemplate(page, a.form, a.tmpl, /^Assign Editor$/)};
                    sc.tpl.review.discussion = await chooseTemplate(page, a.form, a.tmpl, /^Discussion \(Review\)$/);
                    await snap(page, 'tpl-s2-assign-editor-filled', sc.tpl.review);
                    save();
                    await leaveAssign(page, a.form, 'cancel', 'tpl-s2');
                });
                await sect('tpl copyediting notice', async () => {
                    const r = await openWorkflow(page, workflow(sc.S3, 'workflow_4'), 'tpl-s3-after-ce');
                    const notice = await page.evaluate(() => { const vis = (e) => e.getClientRects().length > 0; const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body; const hs = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis); const h = hs.find((x) => /^Notification$/i.test(x.innerText.trim())); return {notification: h && h.nextElementSibling ? h.nextElementSibling.innerText.trim() : null, headings: hs.map((x) => x.innerText.trim()).slice(0, 30)}; });
                    sc.tpl.copyeditingNoticeAfter = notice; save();
                    log('[tpl s3 notice]', JSON.stringify(notice));
                });
            } else {
                await sect('tpl ops production templates', async () => {
                    await openWorkflow(page, workflow(sc.S2, 'workflow_5'), 'tpl-ops-s2');
                    const a = await openAssign(page, 'tpl-ops-s2');
                    sc.tpl.production = {templates: a.out.templates && a.out.templates.map((t) => t.text), discussion: await chooseTemplate(page, a.form, a.tmpl, /^Discussion \(Production\)$/)};
                    sc.tpl.production.assignEditor = await chooseTemplate(page, a.form, a.tmpl, /^Assign Editor$/);
                    sc.tpl.production.discussionAgain = await chooseTemplate(page, a.form, a.tmpl, /^Discussion \(Production\)$/);
                    await snap(page, 'tpl-ops-s2-filled', sc.tpl.production);
                    save();
                    await leaveAssign(page, a.form, 'cancel', 'tpl-ops-s2');
                    // the Submission entry's window: which stage does it post?
                    await openWorkflow(page, workflow(sc.S2, 'workflow_1'), 'tpl-ops-s2-submission');
                    const b = await openAssign(page, 'tpl-ops-s2-submission');
                    const r = await search(page, b.form, '');
                    sc.tpl.submissionEntryRequests = r.requests; save();
                    await leaveAssign(page, b.form, 'cancel', 'tpl-ops-s2-submission');
                });
            }
            log('[tpl]', JSON.stringify(sc.tpl).slice(0, 1500));
            await signOut(page);
        } finally { await close(); }
    }

    if (on('notes')) {
        note('ccK2 · "Assign Participant" (legacy window over the workflow dialog): select[name=filterUserGroupId] (the role list), input[name=name] + the search form\'s "Search" button (form[id^=searchUserFilter]), the user grid .pkp_controllers_grid with input[type=radio][name=userId] per row and a "Load more" link + "20 of 23 items" footer (wheel-scrolling loads nothing: the modal scroll container is not the grid\'s div.scrollable), select[name=template] and TinyMCE over textarea[name=message]; "OK" a button, "Cancel" a link, no X. Changing the role fires no request; only "Search" posts fetch-grid. A refused OK (no person chosen) answers 200 with the form re-rendered and no message: k2.js closeWindowIfOpen presses the Cancel link, then the "Close" arrow, and the window phase re-lands the workflow page between sections. k2.js openAssign/assignUser drive it.');
        note('ccK2 · Typing into the window\'s TinyMCE and pressing OK with the template list blank answers HTTP 500 on this Postgres install (edit_task_templates.edit_task_template_id = \'\'): the window stays open with no message, but the stage assignment IS written (the row shows on the next landing, no Activity Log line, no mail). A template chosen first (then the text replaced) sends fine. The same 500 hits "Notify" with the list blank (ccK4\'s send-notification). OPS: choosing "Assign Editor" posts fetch-template-body which answers 500 (TypeError in Mailer::compileParams), the box keeps its previous content; "Discussion (Production)" fills "Please enter your message.".');
        note('ccK2 · The needs-editor task ("A new article has been submitted to which an editor needs to be assigned." / OMP "A new monograph…" / OPS "A new preprint has been submitted to which a moderator needs to be assigned.") is read from the header\'s "Tasks" button panel (tr.gridRow rows, span.message), scoped by the submission title; a seeded submitted submission carries it for every manager of the scratch context, and a seeded participants[] editor does NOT clear it (only an on-screen Assign does).');
        note('ccK2 · The reviewer warning of "Assign Participant" (a reviewer with an anonymous review chosen as an editor) never opens on OJS or OMP: the window\'s script receives anonymousReviewerIds [<id>] and the warning text, the radio sets userIdSelected to the same id, no dialog follows (stage and round entries, real click, 1.5 s wait). On OPS the "Submission" entry\'s Assign window posts stageId=5 for a submitted preprint (the Production window). A press\'s Internal Review stage entry (workflow_2) has no Participants panel; its round entry (workflow_2_<roundId>) has it, with an empty template list.');
    }
});
