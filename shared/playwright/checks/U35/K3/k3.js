// U35 claim check, chunk K3: "Assignment privileges" (Rule 5), "Permissions"
// (Rule 6), "Edit" and the "Edit Assignment" window (Rule 7), Side effects
// "On Edit", the Roles settings ("This role is only allowed to recommend…",
// "Permit submission metadata edit.", "Stage Assignment"), register A3 and A7.
// Spec: docs/specs/U35-stage-participants.md lines 180–238, 347–348, 366–392, 551–558, 594–605.
//
// One scratch context per app (tag u35k3…), throwaway users, and submissions
//   S1  review stage (OJS/OMP) / Production (OPS): se1, se2, ed, fund, mgrse-as-SE (+ge on OJS; +mgr-as-manager on OPS)
//   S2  Copyediting (OJS/OMP): se1, se2, pe, ce, ed
//   S3  review stage (OJS/OMP): se2 alone (the "no deciding editor" end)
//   S4  OJS: a draft (submitted: false) for t8
//   S6  Submission stage: se1 (the "Stage Assignment" drive)
//   S5/S7/P2  seeded after a Roles setting is flipped on screen
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U35/K3/k3.js
//   PHASES=seed,roles,mgr,se2,se1,mgrse,s3,s2,draft,flip,stage,notes   (default all; later phases reuse k3-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'roles', 'mgr', 'se2', 'se1', 'mgrse', 's3', 'round', 's2', 'draft', 'flip', 'auto', 'stage', 'se2assign', 'notes'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

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
// Visible dialogs as data (the workflow dialog is position:fixed, so visibility is getClientRects()).
const dialogTexts = (page) => page.locator('[role="dialog"]').evaluateAll((els) =>
    els.filter((d) => d.getClientRects().length).map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
// The workflow dialog as data: head lines, headings, the action buttons, notices.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const headings = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const actions = [...root.querySelectorAll('[data-cy="workflow-action-items"] button, [data-cy="workflow-action-items"] a')].filter(vis).map((b) => (b.innerText || '').trim()).filter(Boolean);
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 20);
    const head = root.innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
    return {dialogCount: dlgs.length, head, headings, buttons, actions, notices, url: location.href};
});
// The Participants panel as data: its rows (text and menu button names) and its header buttons.
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
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
// The notifications on screen right now (text and where they sit).
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[role=status], [role=alert], .pkp_notification, [class*="pkpNotification"], [class*="notification"]')]
    .filter((e) => e.getClientRects().length && e.innerText.trim())
    .map((e) => { const r = e.getBoundingClientRect(); return {text: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200), top: Math.round(r.top), left: Math.round(r.left), right: Math.round(innerWidth - r.right)}; }).slice(0, 10)).catch(() => []);
async function waitToast(page, re, ms = 6000) {
    await page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, {timeout: ms}).catch(() => {});
    return toasts(page);
}
// A form's checkboxes as data (name, checked, visible, label), plus the form's headings/labels.
const formBoxes = (locator) => locator.evaluate((root) => {
    const vis = (e) => e.getClientRects().length > 0;
    const labelOf = (i) => {
        const l = i.id && root.querySelector(`label[for="${i.id}"]`);
        return (l ? l.innerText : (i.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 260);
    };
    return {
        boxes: [...root.querySelectorAll('input[type=checkbox]')].map((i) => ({name: i.name, checked: i.checked, visible: vis(i), disabled: i.disabled, label: labelOf(i)})),
        sections: [...root.querySelectorAll('legend, .section > label, label.sub_label, h3, h4, .pkp_form .label, .label')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 120)).filter(Boolean).slice(0, 30),
        text: root.innerText.replace(/\s+/g, ' ').slice(0, 2500),
        buttons: [...root.querySelectorAll('button, a.pkp_button, input[type=submit], a')].filter(vis).map((b) => (b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 20),
    };
}).catch((e) => ({error: String(e.message).slice(0, 200)}));

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOPS = app.name === 'ops';
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };
    const U = (k) => `${sc.tag}${k}`;
    const NAMES = {mgr: 'Mira Manager', mgrse: 'Mona Managersub', ed: 'Ed Editor', ed2: 'Eda Editortwo', pe: 'Pat Prodeditor', se1: 'Sid Sectionone', se2: 'Sue Sectiontwo', se3: 'Sam Sectionthree', ge: 'Gus Guest', ce: 'Cal Copyeditor', ce2: 'Cam Copytwo', fund: 'Fay Funding', fund2: 'Fern Fundtwo', au: 'Ava Author', au2: 'Abe Authortwo', ebm: 'Eli Board'};
    const SE_ROLE = isOPS ? 'Moderator' : isOMP ? 'Series editor' : 'Section editor';
    const ED_ROLE = isOMP ? 'Press editor' : 'Journal editor';
    const REVIEW_KEY = 'workflow_3';
    const P1_KEY = isOPS ? 'workflow_5' : REVIEW_KEY;

    // ---- helpers on the workflow page -------------------------------------
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
        await waitRows(page, '');
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const panel = await participantsPanel(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, panel, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)})), ...(extra || {})});
        log(`[${label}]`, app.name, 'url:', page.url(), 'head:', JSON.stringify((info.head || []).slice(0, 4)), 'actions:', JSON.stringify(info.actions || []), 'panel:', JSON.stringify((panel.items || []).map((i) => i.text.slice(0, 60))), 'panel buttons:', JSON.stringify(panel.buttons || []));
        return {info, panel, dialogs, s};
    }
    // A row's "…" menu: the items; returns {items, more} with the menu left open when it has an item, else closed.
    // The panel re-renders after every legacy window closes and after the Activity Log: wait for the rows before reading them.
    // A role query, because the workflow dialog stays aria-hidden for 450 ms after an inner window closes (patterns.md pitfall 4 and 6).
    async function waitRows(page, name) {
        await page.getByRole('button', {name: new RegExp(`^${name || ''}.*More Actions$`)}).first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
    }
    async function rowMenu(page, name, label) {
        await waitRows(page, esc(name));
        // page-level: a closed window's shell counts as a visible dialog for 450 ms (patterns.md pitfall 4), so a dialog-scoped read right after a close finds nothing
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
    // Open a row's "Edit" → the "Edit Assignment" window; read it; then set boxes and OK, or Cancel. opts: {set: {recommendOnly, canChangeMetadata}, leave: 'ok'|'cancel'|'navigate'}
    async function editWindow(page, name, label, opts = {}) {
        const {items, more, absent} = await rowMenu(page, name, label);
        if (absent) return {absent: true};
        const edit = page.getByRole('menuitem', {name: /^Edit$/}).first();
        if (!(await edit.count())) { await closeMenu(page, more); record(`${label}-edit`, {row: name, noEdit: true, items: items.map((i) => i.text)}); log(`[${label}] no "Edit" for ${name}`); return {noEdit: true, items}; }
        await edit.click(); await idle(page);
        const win = topWin(page);
        await win.waitFor({timeout: 30000});
        // the legacy window's form arrives by AJAX after it opens: wait for a box or the "No changes" sentence
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && (d.querySelector('input[name=recommendOnly], input[name=canChangeMetadata]') || /No changes can be made/.test(d.innerText)); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const dl = (await dialogTexts(page)).slice(-1)[0] || {};
        const form = await formBoxes(win);
        const out = {row: name, title: dl.name, text: flat(dl.text, 1500), boxes: form.boxes, sections: form.sections, buttons: dl.buttons, links: form.buttons};
        await snap(page, `${label}-edit`, {editAssignment: out});
        log(`[${label}] Edit "${name}":`, dl.name, '| boxes:', JSON.stringify((form.boxes || []).map((b) => `${b.name}${b.checked ? ' [x]' : ' [ ]'}${b.visible ? '' : ' (hidden)'}`)), '| text:', flat(dl.text, 200));
        if (opts.set) {
            for (const [k, v] of Object.entries(opts.set)) {
                const box = win.locator(`input[name="${k}"]`);
                if (await box.count()) { if (v) await box.check(); else await box.uncheck(); out.set = {...(out.set || {}), [k]: v}; }
            }
        }
        const leave = opts.leave || 'cancel';
        if (leave === 'ok') {
            const ok = win.getByRole('button', {name: /^(OK|Save)$/}).last();
            await loc(page, `${label}: Edit Assignment's OK`, ok);
            const seen = [];
            const onResp = (r) => { if (/saveParticipant|stage-participant|participant/i.test(r.url())) seen.push({method: r.request().method(), status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 140)}); };
            page.on('response', onResp);
            await ok.click();
            out.toasts = await waitToast(page, /stage assignment has been changed|added as a stage participant|error|Error/);
            await idle(page); await page.waitForTimeout(700); await idle(page);
            page.off('response', onResp);
            out.requests = seen;
            out.dialogsAfter = (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300), buttons: d.buttons}));
            out.windowStillOpen = out.dialogsAfter.some((d) => d.name === 'Edit Assignment' || /Edit Assignment/.test(d.text));
            if (out.windowStillOpen) {
                out.windowAfterOK = await formBoxes(topWin(page));
                await shot(page, `${label}-edit-still-open`).catch(() => {});
                const c = topWin(page).getByRole('button', {name: /^Close$/}).last();
                if (await c.count()) await c.click().catch(() => {}); else await topWin(page).getByRole('link', {name: 'Cancel', exact: true}).click().catch(() => {});
                await page.waitForTimeout(600); await idle(page);
            }
            out.panelAfter = await participantsPanel(page);
            record(`${label}-edit-saved`, out);
            log(`[${label}] saved:`, JSON.stringify(out.toasts), '| requests:', JSON.stringify(seen), '| rows:', JSON.stringify((out.panelAfter.items || []).map((i) => i.text.slice(0, 90))));
        } else if (leave === 'navigate') {
            const dialogs = [];
            const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onDialog);
            await page.goto(ctxUrl('/dashboard/editorial')).catch((e) => dialogs.push({gotoError: String(e.message).slice(0, 120)}));
            await page.waitForTimeout(800); await idle(page);
            page.off('dialog', onDialog);
            out.leaveByNavigation = {browserDialogs: dialogs, landed: page.url()};
            record(`${label}-edit-left-by-navigation`, out);
            log(`[${label}] left by navigation:`, JSON.stringify(dialogs));
        } else {
            const cancel = win.getByRole('link', {name: 'Cancel', exact: true}).or(win.getByRole('button', {name: /^(Cancel|Close)$/})).first();
            await loc(page, `${label}: Edit Assignment's Cancel`, cancel);
            const browserDialogs = [];
            const onDialog = async (d) => { browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onDialog);
            if (await cancel.count()) { await cancel.click().catch(() => {}); } else { await page.keyboard.press('Escape'); }
            await page.waitForTimeout(600); await idle(page);
            page.off('dialog', onDialog);
            out.cancel = {browserDialogs, dialogsAfter: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 120)}))};
            out.cancel.windowStillOpen = out.cancel.dialogsAfter.some((d) => d.name === 'Edit Assignment');
            if (out.cancel.windowStillOpen) { const c = topWin(page).getByRole('button', {name: /^Close$/}).last(); if (await c.count()) await c.click().catch(() => {}); await page.waitForTimeout(600); await idle(page); }
            if (browserDialogs.length || out.cancel.windowStillOpen) { record(`${label}-edit-cancelled`, out.cancel); log(`[${label}] cancel:`, JSON.stringify(out.cancel)); }
        }
        return out;
    }
    // Select a side-menu entry of the open workflow dialog by its visible text.
    async function selectEntry(page, name, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const entry = dlg.locator('nav button, nav a, [class*="sideMenu"] button, [class*="sideMenu"] a').filter({hasText: new RegExp(`^\\s*${esc(name)}\\s*$`)}).first();
        if (!(await entry.count())) { log(`[${label}] no menu entry "${name}"`); record(label, {noEntry: name}); return null; }
        await entry.click(); await idle(page);
        await page.waitForTimeout(500); await idle(page);
        const info = await wfInfo(page);
        const s = await snap(page, label, {info, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)}))});
        log(`[${label}]`, 'url:', page.url(), 'actions:', JSON.stringify(info.actions), 'buttons:', JSON.stringify(info.buttons.filter((b) => /Recommend|Accept|Decline|Revisions|Send|Request|Cancel Review|Skip/i.test(b))));
        return {info, s};
    }
    // The Activity Log window's rows (the header's "Activity Log").
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
        log(`[${label}]`, JSON.stringify(rows.map((r) => r.slice(-1)[0]).slice(0, 12)).slice(0, 1200));
        const close = dlg.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return rows;
    }
    // The "Assign" form: pick each {group, user} in turn and read the boxes that appear; then Cancel (or OK when keep).
    // One fresh window per pick (the boxes' arrival state), unless {sequential} asks for one window with the role changed between picks.
    async function assignForm(page, label, picks = [], opts = {}) {
        if (picks.length > 1 && !opts.sequential) {
            const outs = [];
            for (const p of picks) outs.push(await assignFormOnce(page, `${label}-${p.group.replace(/\W+/g, '')}`, [p], opts));
            record(`${label}-assign-form`, outs);
            return outs;
        }
        return assignFormOnce(page, label, picks, opts);
    }
    async function assignFormOnce(page, label, picks = [], {keep} = {}) {
        await waitRows(page, '');
        const assign = page.getByRole('button', {name: /^Assign$/}).first();
        await assign.waitFor({timeout: 10000}).catch(() => {});
        if (!(await assign.count())) { record(`${label}-assign`, {absent: true, panel: await participantsPanel(page)}); log(`[${label}] no Assign button`); return {absent: true}; }
        await loc(page, `${label}: Participants "Assign"`, assign);
        await assign.click(); await idle(page);
        const form = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        await form.waitFor({timeout: 30000}); await idle(page);
        const sel = form.locator('select[name="filterUserGroupId"]');
        const groups = await sel.locator('option').evaluateAll((els) => els.map((o) => o.text.trim()).filter(Boolean));
        const out = {title: ((await dialogTexts(page)).slice(-1)[0] || {}).name, groups, picks: []};
        for (const {group, user} of picks) {
            const p = {group, user};
            if (!groups.includes(group)) { p.groupAbsent = true; out.picks.push(p); continue; }
            await sel.selectOption({label: group}); await idle(page);
            const searchBox = form.locator('input[name="name"]').first();
            await searchBox.fill(user.split(' ')[0]);
            const submit = form.locator('form[id^="searchUserFilter"] button').first();
            if (await submit.count()) await submit.click(); else await searchBox.press('Enter');
            await idle(page);
            await page.waitForFunction((n) => [...document.querySelectorAll('[role=dialog] tr')].some((tr) => tr.innerText.includes(n)), user, {timeout: 20000}).catch(() => {});
            await idle(page);
            const radios = await form.locator('input[name="userId"]').evaluateAll((els) => els.map((r) => ({value: r.value, row: (r.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 80)})));
            p.users = radios.map((r) => r.row);
            const pick = radios.find((r) => r.row && r.row.includes(user));
            if (pick) { await form.locator(`input[name="userId"][value="${pick.value}"]`).check({force: true}); await idle(page); await page.waitForTimeout(400); }
            else p.userAbsent = true;
            const f = await formBoxes(form);
            p.boxes = (f.boxes || []).filter((b) => /recommendOnly|canChangeMetadata/.test(b.name));
            p.sections = (f.sections || []).filter((s) => /privileges|Permissions/i.test(s));
            out.picks.push(p);
            await snap(page, `${label}-assign-${group.replace(/\W+/g, '')}-${user.split(' ')[0]}`, {pick: p});
            log(`[${label} assign] ${group} / ${user}:`, JSON.stringify(p.boxes.map((b) => `${b.name}${b.checked ? ' [x]' : ' [ ]'}${b.visible ? '' : ' (hidden)'}`)), p.userAbsent ? '(user not listed)' : '');
        }
        record(`${label}-assign-form`, out);
        if (keep) {
            const ok = form.getByRole('button', {name: 'OK', exact: true}).last();
            await ok.click(); out.toasts = await waitToast(page, /added as a stage participant|Please ensure/); await idle(page); await page.waitForTimeout(600); await idle(page);
            out.panelAfter = await participantsPanel(page);
            record(`${label}-assign-saved`, out);
        } else {
            const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: /^Cancel$/})).first();
            const dialogs = [];
            const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onDialog);
            if (await cancel.count()) await cancel.click().catch(() => {}); else await page.keyboard.press('Escape');
            await page.waitForTimeout(500); await idle(page);
            page.off('dialog', onDialog);
            out.cancel = {browserDialogs: dialogs, dialogsAfter: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 100)}))};
            record(`${label}-assign-cancelled`, out.cancel);
        }
        return out;
    }
    // ---- Settings › Users & Roles › Roles -----------------------------------
    async function gotoRoles(page) {
        await page.goto(ctxUrl('/management/settings/access')); await idle(page);
        const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
        if (await rolesTab.count()) await rolesTab.click();
        await idle(page);
        await page.locator('tr.gridRow').first().waitFor({timeout: 30000}).catch(() => {});
    }
    const rolesRows = (page) => page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => ({name: (e.querySelector('td') || {}).innerText?.trim().replace(/\s+/g, ' ').replace(/^Settings\s+/, ''), level: (e.querySelectorAll('td')[1] || {}).innerText?.trim(), hasArrow: !!e.querySelector('a.show_extras')})));
    async function openRoleEdit(page, roleName) {
        await gotoRoles(page);
        const rows = await rolesRows(page);
        const i = rows.findIndex((r) => r.name === roleName);
        if (i < 0) return {form: null, reason: 'no such row', rows};
        const row = page.locator('tr.gridRow').nth(i);
        const arrow = row.locator('a.show_extras');
        if (!(await arrow.count())) return {form: null, reason: 'no arrow (no Edit)', row: rows[i]};
        await arrow.click(); await idle(page);
        const edit = page.getByRole('link', {name: 'Edit', exact: true}).last();
        if (!(await edit.count())) return {form: null, reason: 'no Edit link', row: rows[i]};
        await edit.click();
        const form = page.locator('form#userGroupForm');
        await form.waitFor({state: 'visible', timeout: 30000});
        await form.locator('input[name="assignedStages[]"]').first().waitFor({state: 'attached', timeout: 15000}).catch(() => {});
        await idle(page);
        return {form, row: rows[i]};
    }
    async function readRoleForm(page, form) {
        const f = await formBoxes(form);
        const title = ((await dialogTexts(page)).slice(-1)[0] || {}).name;
        const named = (n) => (f.boxes || []).find((b) => b.name === n) || null;
        return {title, recommendOnly: named('recommendOnly'), permitMetadataEdit: named('permitMetadataEdit'), stages: (f.boxes || []).filter((b) => b.name === 'assignedStages[]').map((b) => `${b.label}${b.checked ? ' [x]' : ' [ ]'}${b.disabled ? ' (disabled)' : ''}`), sections: f.sections, text: f.text, buttons: f.buttons};
    }
    async function cancelRoleForm(page, form) {
        const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
        await cancel.click().catch(() => {});
        await form.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await idle(page);
    }
    // Set boxes on a role's form and Save; record the answer.
    async function setRole(page, roleName, changes, label) {
        const {form, reason, row} = await openRoleEdit(page, roleName);
        if (!form) { record(label, {role: roleName, noForm: reason, row}); log(`[${label}] ${roleName}: ${reason}`); return null; }
        const before = await readRoleForm(page, form);
        for (const [k, v] of Object.entries(changes)) {
            if (k === 'stages') { for (const [stageLabel, want] of Object.entries(v)) { const boxes = form.locator('input[name="assignedStages[]"]'); const n = await boxes.count(); for (let i = 0; i < n; i++) { const b = boxes.nth(i); const id = await b.getAttribute('id'); const l = id ? await form.locator(`label[for="${id}"]`).innerText().catch(() => '') : ''; if (l.trim() === stageLabel) { if (want) await b.check(); else await b.uncheck(); } } } continue; }
            const box = form.locator(`input[name="${k}"]`);
            if (await box.count()) { if (v) await box.check(); else await box.uncheck(); }
        }
        const saveBtn = form.locator('button[type=submit], input[type=submit], button').filter({hasText: /^(Save|OK)$/}).last();
        await loc(page, `${label}: the role form's Save`, saveBtn);
        const seen = [];
        const onResp = (r) => { if (/user-group|userGroup|roles/i.test(r.url())) seen.push({method: r.request().method(), status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 140)}); };
        page.on('response', onResp);
        await saveBtn.click();
        const t = await waitToast(page, /saved|Saved|error|Error|cannot|must/);
        await idle(page); await page.waitForTimeout(800); await idle(page);
        page.off('response', onResp);
        const stillOpen = await form.count();
        const out = {role: roleName, changes, before: {recommendOnly: before.recommendOnly, permitMetadataEdit: before.permitMetadataEdit, stages: before.stages}, toasts: t, requests: seen, formStillOpen: !!stillOpen, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))};
        if (stillOpen) { out.formAfter = await readRoleForm(page, form); await cancelRoleForm(page, form); }
        const re = await openRoleEdit(page, roleName);
        if (re.form) { out.reread = await readRoleForm(page, re.form); await cancelRoleForm(page, re.form); }
        await snap(page, label, {setRole: out});
        log(`[${label}] ${roleName} set`, JSON.stringify(changes), '→ toasts:', JSON.stringify(t.map((x) => x.text)), '| reread:', JSON.stringify(out.reread && {recommendOnly: out.reread.recommendOnly && out.reread.recommendOnly.checked, permitMetadataEdit: out.reread.permitMetadataEdit && out.reread.permitMetadataEdit.checked, stages: out.reread.stages}));
        return out;
    }

    // =========================================================================
    // seed
    if (on('seed') && !sc.contextPath) {
        const t = tag('u35k3');
        const nm = (k, roles, extra) => { const [g, f] = NAMES[k].split(' '); return {username: `${t}${k}`, roles, givenName: g, familyName: f, ...(extra || {})}; };
        const users = isOPS
            ? [nm('mgr', ['manager']), nm('mgrse', ['manager', 'sectionEditor']), nm('se1', ['sectionEditor']), nm('se2', ['sectionEditor']), nm('se3', ['sectionEditor'], {sections: ['PRE']}), nm('au', ['author']), nm('au2', ['author']), nm('ebm', ['editorialBoardMember'])]
            : [nm('mgr', ['manager']), nm('mgrse', ['manager', 'sectionEditor']), nm('ed', ['editor']), nm('ed2', ['editor']), nm('pe', ['productionEditor']), nm('se1', ['sectionEditor']), nm('se2', ['sectionEditor']), nm('se3', ['sectionEditor'], isOJS ? {sections: ['ART']} : {}), ...(isOJS ? [nm('ge', ['guestEditor'])] : []), nm('ce', ['copyeditor']), nm('ce2', ['copyeditor']), nm('fund', ['funding']), nm('fund2', ['funding']), nm('au', ['author']), nm('au2', ['author'])];
        const spec = {tag: t, users};
        if (isOJS) spec.sections = [{abbrev: 'ART', title: {en: 'Articles'}, policy: {en: 'Policy'}}];
        if (isOPS) spec.sections = [{abbrev: 'PRE', title: {en: 'Preprints'}, policy: {en: 'Policy'}}];
        const ctx = await app.api.createContext(spec);
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId; save();
        const P = (k, role) => ({username: `${t}${k}`, role});
        const sub = async (k, extra) => { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: `${t}au`, title: `U35 K3 ${k} ${t}`, ...extra}); sc[k] = r.submissionId; save(); log(`[seed] ${k} → ${r.submissionId} stage ${r.stageId}`); return r; };
        if (isOPS) {
            await sub('S1', {participants: [P('se1', 'sectionEditor'), P('se2', 'sectionEditor'), P('mgrse', 'sectionEditor'), P('mgr', 'manager')]});
        } else {
            await sub('S1', {decisions: ['sendExternalReview'], participants: [P('se1', 'sectionEditor'), P('se2', 'sectionEditor'), P('ed', 'editor'), P('fund', 'funding'), P('mgrse', 'sectionEditor'), ...(isOJS ? [P('ge', 'guestEditor')] : [])]});
            await sub('S2', {decisions: ['skipExternalReview'], participants: [P('se1', 'sectionEditor'), P('se2', 'sectionEditor'), P('pe', 'productionEditor'), P('ce', 'copyeditor'), P('ed', 'editor')]}).catch(async (e) => { log('[seed S2 skipExternalReview failed]', String(e.message).slice(0, 300)); await sub('S2', {decisions: ['accept'], participants: [P('se1', 'sectionEditor'), P('se2', 'sectionEditor'), P('pe', 'productionEditor'), P('ce', 'copyeditor'), P('ed', 'editor')]}); });
            await sub('S3', {decisions: ['sendExternalReview'], participants: [P('se2', 'sectionEditor')]});
            if (isOJS) await sub('S4', {submitted: false, participants: []});
            await sub('S6', {participants: [P('se1', 'sectionEditor')]});
        }
        record('seed', {...sc, users: users.map((u) => u.username)});
    }
    if (!sc.contextPath) { log('[k3] no scratch context; run the seed phase first'); return; }
    log('[k3]', app.name, JSON.stringify(sc));

    // =========================================================================
    // roles: every role's "Edit" form at the install defaults (Settings lines 368–391)
    if (on('roles')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await gotoRoles(page);
            const rows = await rolesRows(page);
            await snap(page, 'roles-grid', {rows});
            const seen = [];
            for (const r of rows) {
                if (!r.name) continue;
                const {form, reason} = await openRoleEdit(page, r.name);
                if (!form) { seen.push({role: r.name, level: r.level, noForm: reason}); continue; }
                const f = await readRoleForm(page, form);
                seen.push({role: r.name, level: r.level, title: f.title, recommendOnly: f.recommendOnly && {checked: f.recommendOnly.checked, visible: f.recommendOnly.visible, disabled: f.recommendOnly.disabled, label: f.recommendOnly.label}, permitMetadataEdit: f.permitMetadataEdit && {checked: f.permitMetadataEdit.checked, visible: f.permitMetadataEdit.visible, disabled: f.permitMetadataEdit.disabled, label: f.permitMetadataEdit.label}, stages: f.stages, sections: f.sections});
                if (/Section editor|Series editor|Moderator|Author|Journal editor|Press editor|Copyeditor|Guest editor/.test(r.name)) await snap(page, `roles-form-${r.name.replace(/\W+/g, '')}`, {form: f});
                await loc(page, `Roles › ${r.name} › Edit: "recommendOnly" box`, form.locator('input[name="recommendOnly"]'));
                await cancelRoleForm(page, form);
            }
            record('roles-forms', seen);
            log('[roles]', JSON.stringify(seen.map((s) => `${s.role} (${s.level}): rec=${s.recommendOnly ? (s.recommendOnly.checked ? '[x]' : '[ ]') + (s.recommendOnly.disabled ? '(disabled)' : '') : '—'} meta=${s.permitMetadataEdit ? (s.permitMetadataEdit.checked ? '[x]' : '[ ]') + (s.permitMetadataEdit.disabled ? '(disabled)' : '') : '—'} stages=${(s.stages || []).join(',')}${s.noForm ? ' ' + s.noForm : ''}`)));
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // mgr: S1's panel as the manager; every row's menu and window; the Activity Log around one save; the Assign window's boxes by role
    if (on('mgr')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S1, P1_KEY), 'mgr-s1');
            const logBefore = await activityLog(page, 'mgr-s1-log-before');
            const rows = isOPS ? ['se1', 'se2', 'mgrse', 'mgr', 'au'] : ['se1', 'se2', 'ed', 'fund', 'mgrse', 'au', ...(isOJS ? ['ge'] : [])];
            for (const k of rows) await sect(`mgr edit ${k}`, async () => { await editWindow(page, NAMES[k], `mgr-s1-${k}`); });
            // sweep: a change then Cancel; a change then leaving by navigation
            await sect('mgr cancel with change', async () => {
                await editWindow(page, NAMES.se1, 'mgr-s1-se1-changed-cancel', {set: {recommendOnly: true}, leave: 'cancel'});
                const again = await editWindow(page, NAMES.se1, 'mgr-s1-se1-after-cancel');
                log('[cancel kept?]', JSON.stringify((again.boxes || []).map((b) => `${b.name}${b.checked ? ' [x]' : ' [ ]'}`)));
            });
            await sect('mgr leave by navigation', async () => {
                await editWindow(page, NAMES.se1, 'mgr-s1-se1-changed-navigate', {set: {recommendOnly: true}, leave: 'navigate'});
                await openWorkflow(page, workflow(sc.S1, P1_KEY), 'mgr-s1-after-navigate');
                await editWindow(page, NAMES.se1, 'mgr-s1-se1-after-navigate');
            });
            // Rule 7 / A3: tick "Assignment privileges" on se2, OK; toast, row line, the Activity Log
            await sect('mgr set se2 recommendOnly', async () => {
                await editWindow(page, NAMES.se2, 'mgr-s1-se2-tick', {set: {recommendOnly: true}, leave: 'ok'});
                await editWindow(page, NAMES.se2, 'mgr-s1-se2-reopened');
                const logAfter = await activityLog(page, 'mgr-s1-log-after');
                const count = (rows) => (rows || []).filter((r) => /was assigned to this submission/.test(r.join(' '))).length;
                record('mgr-s1-log-compare', {before: count(logBefore), after: count(logAfter), newLines: (logAfter || []).slice(0, Math.max(0, (logAfter || []).length - (logBefore || []).length)).map((r) => r.join(' | '))});
                log('[A3] assigned lines before/after:', count(logBefore), count(logAfter));
            });
            // Assign window: the boxes by role (5b, 6, Rule 4c) as a manager
            await sect('mgr assign picks', async () => {
                const picks = isOPS ? [{group: SE_ROLE, user: NAMES.se3}, {group: 'Author', user: NAMES.au2}, {group: 'Preprint Server manager', user: NAMES.mgrse}]
                    : [{group: SE_ROLE, user: NAMES.se3}, {group: ED_ROLE, user: NAMES.ed2}, {group: 'Funding coordinator', user: NAMES.fund2}, {group: 'Author', user: NAMES.au2}];
                await assignForm(page, 'mgr-s1', picks);
                // sweep: one window, the role changed after a person was chosen (does the earlier pick's box state carry over?)
                await assignForm(page, 'mgr-s1-sequential', picks, {sequential: true});
                await assignForm(page, 'mgr-s1-sequential-reverse', [...picks].reverse(), {sequential: true});
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // se2: the recommending editor's view (5c, t7, A7)
    if (on('se2')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('se2'));
            const {info} = await openWorkflow(page, workflow(sc.S1, P1_KEY), 'se2-s1');
            log('[se2 review actions]', JSON.stringify(info.actions), JSON.stringify((info.buttons || []).filter((b) => /Recommend|Accept|Decline|Revisions|Review|Post|Assign/i.test(b))));
            const rows = isOPS ? ['se1', 'mgrse', 'mgr', 'au', 'se2'] : ['se1', 'ed', 'fund', 'mgrse', 'au', 'se2', ...(isOJS ? ['ge'] : [])];
            for (const k of rows) await sect(`se2 edit ${k}`, async () => { await editWindow(page, NAMES[k], `se2-s1-${k}`); });
            await sect('se2 assign picks', async () => {
                const picks = isOPS ? [{group: SE_ROLE, user: NAMES.se3}, {group: 'Author', user: NAMES.au2}] : [{group: SE_ROLE, user: NAMES.se3}, {group: 'Funding coordinator', user: NAMES.fund2}];
                await assignForm(page, 'se2-s1', picks);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // se1: the deciding editor's view (5c, t7): "Edit" on se2's row with the box; none on own, none on manager-level rows; mgrse's SE row
    if (on('se1')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('se1'));
            const {info} = await openWorkflow(page, workflow(sc.S1, P1_KEY), 'se1-s1');
            log('[se1 review actions]', JSON.stringify(info.actions));
            const rows = isOPS ? ['se2', 'se1', 'mgr', 'au'] : ['se2', 'se1', 'ed', 'fund', 'au', ...(isOJS ? ['ge'] : [])];
            for (const k of rows) await sect(`se1 edit ${k}`, async () => { await editWindow(page, NAMES[k], `se1-s1-${k}`); });
            // the Journal Manager assigned as Section Editor: is "Edit" offered to a Section Editor, and does a save go through?
            await sect('se1 edit mgrse', async () => {
                const w = await editWindow(page, NAMES.mgrse, 'se1-s1-mgrse', {set: {canChangeMetadata: false}, leave: 'ok'});
                if (!w.noEdit && !w.absent) await editWindow(page, NAMES.mgrse, 'se1-s1-mgrse-reopened');
            });
            await sect('se1 assign picks', async () => {
                await assignForm(page, 'se1-s1', [{group: SE_ROLE, user: NAMES.se3}]);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // mgrse: a Journal Manager opening their own Section Editor row (Rule 7, A7)
    if (on('mgrse')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgrse'));
            await openWorkflow(page, workflow(sc.S1, P1_KEY), 'mgrse-s1');
            await sect('mgrse own row', async () => {
                const before = await activityLog(page, 'mgrse-s1-log-before');
                const w = await editWindow(page, NAMES.mgrse, 'mgrse-s1-own', {leave: 'ok'});
                const after = await activityLog(page, 'mgrse-s1-log-after');
                const count = (rows) => (rows || []).filter((r) => /was assigned to this submission/.test(r.join(' '))).length;
                record('mgrse-s1-log-compare', {before: count(before), after: count(after)});
                log('[mgrse No changes OK → log lines]', count(before), count(after));
                log('[mgrse own row]', flat(w.text, 300), JSON.stringify(w.buttons));
            });
            await sect('mgrse se1 row', async () => { await editWindow(page, NAMES.se1, 'mgrse-s1-se1'); });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // s3 (OJS/OMP): se2 alone on a review stage, made recommend-only: the other end of "only while a deciding editor is also assigned"
    if (on('s3') && !isOPS) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S3, REVIEW_KEY), 'mgr-s3');
            await sect('mgr s3 set se2', async () => { await editWindow(page, NAMES.se2, 'mgr-s3-se2-tick', {set: {recommendOnly: true}, leave: 'ok'}); });
            await signInAs(page, U('se2'));
            const {info} = await openWorkflow(page, workflow(sc.S3, REVIEW_KEY), 'se2-s3');
            log('[se2 s3 actions (no deciding editor)]', JSON.stringify(info.actions));
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // s2 (OJS/OMP): Copyediting: the Production editor's and Copyeditor's windows; the recommending editor's Copyediting entry
    if (on('s2') && !isOPS) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S2, 'workflow_4'), 'mgr-s2');
            for (const k of ['pe', 'ce', 'ed', 'au']) await sect(`mgr s2 edit ${k}`, async () => { await editWindow(page, NAMES[k], `mgr-s2-${k}`); });
            await sect('mgr s2 set se2', async () => { await editWindow(page, NAMES.se2, 'mgr-s2-se2-tick', {set: {recommendOnly: true}, leave: 'ok'}); });
            await sect('mgr s2 assign copyeditor pick', async () => { await assignForm(page, 'mgr-s2', [{group: 'Copyeditor', user: NAMES.ce2}, {group: 'Production editor', user: NAMES.pe}]); });
            await signInAs(page, U('se2'));
            const {info} = await openWorkflow(page, workflow(sc.S2, 'workflow_4'), 'se2-s2');
            log('[se2 copyediting actions]', JSON.stringify(info.actions), 'panel buttons:', JSON.stringify(((await participantsPanel(page)).buttons) || []));
            for (const k of ['ce', 'pe', 'se1']) await sect(`se2 s2 edit ${k}`, async () => { await editWindow(page, NAMES[k], `se2-s2-${k}`); });
            await signInAs(page, U('pe'));
            await openWorkflow(page, workflow(sc.S2, 'workflow_4'), 'pe-s2');
            for (const k of ['se1', 'ce', 'ed', 'pe']) await sect(`pe s2 edit ${k}`, async () => { await editWindow(page, NAMES[k], `pe-s2-${k}`); });
            await signInAs(page, U('ce'));
            await openWorkflow(page, workflow(sc.S2, 'workflow_4'), 'ce-s2');
            await sect('ce s2 rows', async () => { for (const k of ['se1', 'ce']) { const {more, absent} = await rowMenu(page, NAMES[k], `ce-s2-${k}`); if (!absent) await closeMenu(page, more); } });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // draft (OJS): t8 — the draft's panel as a manager, the Author's box ticked, the draft submitted by the Author, the box read again
    if (on('draft') && isOJS && sc.S4) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            const r = await openWorkflow(page, workflow(sc.S4), 'mgr-s4-draft');
            let ticked = false;
            if (!r.panel.absent) {
                await sect('mgr draft tick author', async () => {
                    const w = await editWindow(page, NAMES.au, 'mgr-s4-au-tick', {set: {canChangeMetadata: true}, leave: 'ok'});
                    ticked = !!(w.set && w.set.canChangeMetadata);
                    await editWindow(page, NAMES.au, 'mgr-s4-au-reopened');
                });
            }
            record('mgr-s4-draft-reachable', {panelPresent: !r.panel.absent, ticked, head: r.info.head, dialogs: r.dialogs.map((d) => ({name: d.name, text: flat(d.text, 300)}))});
            // the Author submits the draft through the wizard
            await sect('author submits draft', async () => {
                await signInAs(page, U('au'));
                const {SubmissionWizardPage, FIXTURE_PDF} = require('../../../../../apps/ojs/playwright/pages/SubmissionWizardPage.js');
                const wiz = new SubmissionWizardPage(page, sc.contextPath);
                await wiz.goto(sc.S4);
                await snap(page, 'au-s4-wizard-open');
                await wiz.uploadFile(FIXTURE_PDF, 'Article Text');
                await wiz.continueTo('Details');
                await wiz.continueTo('Contributors');
                await wiz.continueTo('For the Editors');
                await wiz.continueToReview(sc.S4);
                await snap(page, 'au-s4-wizard-review');
                await wiz.submitAndConfirm();
                await snap(page, 'au-s4-wizard-complete');
                sc.S4submitted = true; save();
            });
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S4, 'workflow_1'), 'mgr-s4-submitted');
            await sect('mgr draft author box after submit', async () => { await editWindow(page, NAMES.au, 'mgr-s4-au-after-submit'); });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // flip: the Roles settings' other ends (368–383): recommendOnly on the SE role → the Assign window's box and an automatic assignment; permitMetadataEdit on Copyeditor / Author
    if (on('flip')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await sect('flip SE recommendOnly on', async () => {
                await setRole(page, SE_ROLE, {recommendOnly: true}, 'flip-se-recommendonly-on');
                await openWorkflow(page, workflow(sc.S1, P1_KEY), 'flip-mgr-s1');
                await assignForm(page, 'flip-se-on', [{group: SE_ROLE, user: NAMES.se3}]);
                if (isOJS || isOPS) {
                    // an automatic assignment in that role (the section's editor) after the flip: seeded to the section se3 edits
                    const r = await app.api.createSubmission({tag: `${sc.tag}S5`, context: sc.contextPath, submitter: U('au'), title: `U35 K3 S5 auto ${sc.tag}`, section: isOJS ? 'ART' : 'PRE'});
                    sc.S5 = r.submissionId; save();
                    await openWorkflow(page, workflow(sc.S5, isOPS ? 'workflow_5' : 'workflow_1'), 'flip-mgr-s5-auto');
                    await editWindow(page, NAMES.se3, 'flip-mgr-s5-se3');
                }
                await setRole(page, SE_ROLE, {recommendOnly: false}, 'flip-se-recommendonly-off');
                await openWorkflow(page, workflow(sc.S1, P1_KEY), 'flip-mgr-s1-restored');
                await assignForm(page, 'flip-se-off', [{group: SE_ROLE, user: NAMES.se3}]);
            });
            if (!isOPS) await sect('flip Copyeditor permitMetadataEdit on', async () => {
                await setRole(page, 'Copyeditor', {permitMetadataEdit: true}, 'flip-ce-permit-on');
                await openWorkflow(page, workflow(sc.S2, 'workflow_4'), 'flip-mgr-s2');
                await assignForm(page, 'flip-ce-on', [{group: 'Copyeditor', user: NAMES.ce2}]);
                await setRole(page, 'Copyeditor', {permitMetadataEdit: false}, 'flip-ce-permit-off');
            });
            await sect('flip Author permitMetadataEdit', async () => {
                // the other end of the Author's default: on a journal/press tick it, on a preprint server untick it; then a submitted seed's Author row
                await setRole(page, 'Author', {permitMetadataEdit: !isOPS}, 'flip-au-permit-flipped');
                const r = await app.api.createSubmission({tag: `${sc.tag}S7`, context: sc.contextPath, submitter: U('au2'), title: `U35 K3 S7 author-flag ${sc.tag}`});
                sc.S7 = r.submissionId; save();
                await openWorkflow(page, workflow(sc.S7, isOPS ? 'workflow_5' : 'workflow_1'), 'flip-mgr-s7');
                await editWindow(page, NAMES.au2, 'flip-mgr-s7-au2');
                await assignForm(page, 'flip-au-flipped', [{group: 'Author', user: NAMES.au}]);
                await setRole(page, 'Author', {permitMetadataEdit: isOPS}, 'flip-au-permit-restored');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // stage: "Stage Assignment" (386–391): untick the SE role's Submission box → the Submission-stage panel and Assign window; OPS: the Moderator's only stage
    if (on('stage')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            if (isOPS) {
                await sect('ops moderator last stage', async () => {
                    await setRole(page, SE_ROLE, {stages: {Production: false}}, 'stage-ops-moderator-untick-production');
                    await openWorkflow(page, workflow(sc.S1, 'workflow_5'), 'stage-ops-s1-after');
                    await assignForm(page, 'stage-ops-s1-after', []);
                });
            } else {
                await sect('SE submission stage off', async () => {
                    await openWorkflow(page, workflow(sc.S6, 'workflow_1'), 'stage-s6-before');
                    await assignForm(page, 'stage-s6-before', []);
                    await setRole(page, SE_ROLE, {stages: {Submission: false}}, 'stage-se-submission-off');
                    await openWorkflow(page, workflow(sc.S6, 'workflow_1'), 'stage-s6-off');
                    await assignForm(page, 'stage-s6-off', []);
                    await openWorkflow(page, workflow(sc.S1, REVIEW_KEY), 'stage-s1-review-while-off');
                    await setRole(page, SE_ROLE, {stages: {Submission: true}}, 'stage-se-submission-on');
                    await openWorkflow(page, workflow(sc.S6, 'workflow_1'), 'stage-s6-restored');
                    await assignForm(page, 'stage-s6-restored', []);
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // round (OJS/OMP): the review ROUND entry's action buttons (the stage entry carries none, U24 Rule 8) as the deciding editor, the recommending editor and on S3 (se2 alone)
    if (on('round') && !isOPS) {
        const {page, close} = await launch(app);
        try {
            for (const [u, sub, label] of [['se1', sc.S1, 'round-se1-s1'], ['se2', sc.S1, 'round-se2-s1'], ['mgr', sc.S1, 'round-mgr-s1'], ['se2', sc.S3, 'round-se2-s3']]) {
                await sect(label, async () => {
                    await signInAs(page, U(u));
                    await openWorkflow(page, workflow(sub, REVIEW_KEY), `${label}-stage`);
                    await selectEntry(page, 'Review Round 1', label);
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // auto (OJS): Rule 11b's end of the recommend-only setting — the section's editor auto-assigned by a WIZARD submit while the role's box is ticked
    if (on('auto') && isOJS) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('mgr'));
            await setRole(page, SE_ROLE, {recommendOnly: true}, 'auto-se-recommendonly-on');
            const r = await app.api.createSubmission({tag: `${sc.tag}S8`, context: sc.contextPath, submitter: U('au'), title: `U35 K3 S8 wizard-auto ${sc.tag}`, section: 'ART', submitted: false, participants: []});
            sc.S8 = r.submissionId; save();
            await sect('author submits S8', async () => {
                await signInAs(page, U('au'));
                const {SubmissionWizardPage, FIXTURE_PDF} = require('../../../../../apps/ojs/playwright/pages/SubmissionWizardPage.js');
                const wiz = new SubmissionWizardPage(page, sc.contextPath);
                await wiz.goto(sc.S8);
                await wiz.uploadFile(FIXTURE_PDF, 'Article Text');
                await wiz.continueTo('Details'); await wiz.continueTo('Contributors'); await wiz.continueTo('For the Editors');
                await wiz.continueToReview(sc.S8);
                await wiz.submitAndConfirm();
                await snap(page, 'au-s8-wizard-complete');
            });
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S8, 'workflow_1'), 'auto-mgr-s8');
            await editWindow(page, NAMES.se3, 'auto-mgr-s8-se3');
            await setRole(page, SE_ROLE, {recommendOnly: false}, 'auto-se-recommendonly-off');
            await signOut(page);
        } finally { await close(); }
    }

    // se2assign: the recommending editor's "Assign" with the "Assignment privileges" box ticked (the box the spec says is never shown): is the tick honoured? Plus the recipient's mailbox after the Edit saves (Side effects "On Edit").
    if (on('se2assign')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, U('se2'));
            await openWorkflow(page, workflow(sc.S1, P1_KEY), 'se2assign-s1');
            await sect('se2 assigns se3 ticked', async () => {
                const assign = page.getByRole('button', {name: /^Assign$/}).first();
                await assign.click(); await idle(page);
                const form = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
                await form.waitFor({timeout: 30000}); await idle(page);
                await form.locator('select[name="filterUserGroupId"]').selectOption({label: SE_ROLE}); await idle(page);
                await form.locator('input[name="name"]').first().fill('Sam');
                await form.locator('form[id^="searchUserFilter"] button').first().click(); await idle(page);
                await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] tr')].some((tr) => tr.innerText.includes('Sam Sectionthree')), null, {timeout: 20000}).catch(() => {});
                const radios = await form.locator('input[name="userId"]').evaluateAll((els) => els.map((r) => ({value: r.value, row: (r.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 80)})));
                const pick = radios.find((r) => r.row && r.row.includes('Sam Sectionthree'));
                await form.locator(`input[name="userId"][value="${pick.value}"]`).check({force: true}); await idle(page); await page.waitForTimeout(400);
                const box = form.locator('input[name="recommendOnly"]');
                const boxVisible = await box.isVisible().catch(() => false);
                if (boxVisible) await box.check();
                await snap(page, 'se2assign-form-ticked', {boxVisible, boxes: (await formBoxes(form)).boxes.filter((b) => /recommendOnly|canChangeMetadata/.test(b.name))});
                const seen = [];
                const onResp = (r) => { if (/save-participant|participants/i.test(r.url())) seen.push({method: r.request().method(), status: r.status(), url: r.url().replace(/^.*\/index\.php/, '').slice(0, 140)}); };
                page.on('response', onResp);
                await form.getByRole('button', {name: 'OK', exact: true}).last().click();
                const t = await waitToast(page, /added as a stage participant|Please ensure|error|Error/);
                await idle(page); await page.waitForTimeout(800); await idle(page);
                page.off('response', onResp);
                const dialogs = (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}));
                const stillOpen = dialogs.some((d) => /Assign Participant/.test(d.name || '') || /Assign Participant/.test(d.text));
                if (stillOpen) { const c = topWin(page).getByRole('button', {name: /^Close$/}).last(); if (await c.count()) await c.click().catch(() => {}); await page.waitForTimeout(600); await idle(page); }
                await waitRows(page, 'Sam');
                const panel = await participantsPanel(page);
                await snap(page, 'se2assign-saved', {boxVisible, toasts: t, requests: seen, dialogs, stillOpen, panel});
                log('[se2assign]', app.name, 'box visible:', boxVisible, '| toasts:', JSON.stringify(t.map((x) => x.text)), '| requests:', JSON.stringify(seen), '| Sam row:', JSON.stringify((panel.items || []).filter((i) => /Sam/.test(i.text)).map((i) => i.text)));
            });
            await signInAs(page, U('mgr'));
            await openWorkflow(page, workflow(sc.S1, P1_KEY), 'se2assign-mgr-s1');
            await sect('mgr reads se3 row', async () => { await editWindow(page, NAMES.se3, 'se2assign-mgr-s1-se3'); });
            await sect('mailbox after edits', async () => {
                const out = {};
                for (const k of ['se2', 'mgrse']) {
                    const list = await app.mail.inboxFor(`${U(k)}@mail.test`, {timeout: 5000}).catch(() => []);
                    out[k] = (list || []).slice(0, 10).map((m) => m.Subject);
                }
                record('se2assign-mailboxes', out);
                log('[mailboxes after Edit saves]', JSON.stringify(out));
            });
            await signOut(page);
        } finally { await close(); }
    }

    if (on('notes')) {
        note('ccK3 · Participants panel rows are listitems with a "<Given Family> More Actions" button each; read them by page-level getByRole, never scoped to the first visible dialog: for ~450 ms after an inner legacy window or the Activity Log closes the workflow dialog is aria-hidden and a dialog-scoped role query finds nothing (three reruns). The panel refetches (GET api/v1/submissions/{id}/participants/{stageId}) after every inner window closes; the "Participants" heading\'s innerText is uppercased by CSS ("PARTICIPANTS"), match it /i.');
        note('ccK3 · "Edit Assignment" (row menu › "Edit") is a legacy window whose form arrives by AJAX: wait for input[name=recommendOnly] / input[name=canChangeMetadata] or the sentence "No changes can be made to this participant"; "OK" is a button, "Cancel" a link. Cancel with a changed box fires a browser confirm "The data on this form has changed. Do you wish to continue without saving?" (Playwright dismisses it and the window stays open: register page.on("dialog") first); leaving the page with a change fires beforeunload. The save POSTs $$$call$$$/grid/users/stage-participant/stage-participant-grid/save-participant (200) and the toast "The stage assignment has been changed." sits top right (top 56 px, right 8 px). A refused save (a Section Editor on a Journal Manager\'s Section-Editor row) also answers 200 but leaves the window open with no message and no toast.');
        note('ccK3 · Review stage: the decision and recommendation buttons live on the ROUND entry (workflowMenuKey=workflow_3_<roundId>, side menu "Review Round 1"); the stage entry workflow_3 shows "The submission has been advanced to the next round of review" and no buttons (U24 Rule 8). A recommend-only editor alone on a round (no deciding editor assigned) gets no buttons at all.');
        note('ccK3 · Settings › Users & Roles › Roles › Edit: form#userGroupForm with input[name=recommendOnly], input[name=permitMetadataEdit], input[name="assignedStages[]"] (labels Submission/Review/…); the recommend-only box is present on EVERY role\'s form, greyed (disabled) outside the Journal Manager and Section Editor levels; the JE/PE "Permit submission metadata edit." box is ticked and greyed; Save is the form\'s OK, toast "Your changes have been saved."; a role\'s last stage box (OPS Moderator › Production) says saved and stays ticked. The manager row has no arrow/Edit.');
        note('ccK3 · "Assign Participant": one window keeps the "Permissions" box state across role changes (choose a Section editor, then a Funding coordinator or Author: the box stays ticked although those roles\' setting is clear; the reverse order leaves it clear for the Section editor as well? no: the Section editor pick re-ticks it), so an arrival-state read needs a fresh window per pick (k3.js assignForm opens one per pick unless {sequential}).');
        note('ccK3 · Seed premise: on a scratch journal the section editor named by users[].sections (subeditor_submission_group row present) is NOT auto-assigned by POST scenarios/submission nor by a wizard submit (docs/tracking/app-changes.md row 3, the AssignEditors keys() bug); an automatic-assignment given needs publicknowledge.');
        note('ccK3 · A draft (submitted: false) opens for a manager at dashboard/editorial?workflowSubmissionId=<id> with the "Incomplete" badge, the Participants panel (the Author\'s row with "Edit") and the Submission-stage decision buttons; the Author\'s wizard at submission?id=<id> submits with SubmissionWizardPage.uploadFile + continueTo(Details, Contributors, For the Editors) + continueToReview + submitAndConfirm.');
        // appended by hand after the run's reading; kept as a phase so a re-run does not duplicate notes
    }
});
