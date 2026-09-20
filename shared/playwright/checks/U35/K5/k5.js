// U35 claim check, chunk K5: the drive footnote t16 left open — the automatic assignment at
// submit on the seeded journal with four settings flipped and restored: the Section editor
// role's "This role is only allowed to recommend…" (Settings bullet 1, Rule 11b, Coverage row
// 597), a person ticked in two roles under "Editorial Assignments" (Side effects 424, row 598),
// the recipient's "Do not send me an email…" under "A new article, …" (425–427, 505–506, row 610)
// and the "Editor Assigned (Auto)" subject prefixed (491, row 609).
// Spec: docs/specs/U35-stage-participants.md lines 372–373, 424–427, 448–449, 491–492, 505–506, 595–598, 609–610.
//
// Runs on the seeded `publicknowledge` (a scratch context never auto-assigns, app-changes row 3):
// the four settings are flipped by the seeded manager, one wizard submission is made by
// author.alex, the reads are taken, and every setting is restored to its recorded value
// (phase `restore`, snapshots restore-*). Nothing else on the seeded journal is changed.
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U35/K5/k5.js
//   PHASES=baseline,flip,submit,read,restore,notify,notes   (default all; later phases reuse k5-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const FIXTURES = {ojs: path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf'), ops: path.join(REPO, 'apps/ops/playwright/fixtures/files/preprint.pdf')};
const ALL = ['baseline', 'flip', 'submit', 'read', 'restore', 'notify', 'notes'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stateFile = (app) => path.join(outDir(), `k5-state-${app.name}.json`);

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
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 20);
    const head = root.innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
    const header = (document.querySelector('header') || {}).innerText || '';
    return {dialogCount: dlgs.length, head, headings, buttons, actions, notices, url: location.href, header: header.replace(/\s+/g, ' ').slice(0, 300)};
});
const participantsPanel = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const pm = dlg.querySelector('[data-cy="participant-manager"]');
    if (!pm) return {absent: true, headings: [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => e.innerText.trim())};
    const items = [...pm.querySelectorAll(':scope > ul > li, li')].filter(vis).map((li) => ({
        text: li.innerText.trim().replace(/\s+/g, ' ').slice(0, 220),
        lines: li.innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6),
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
const formBoxes = (locator) => locator.evaluate((root) => {
    const vis = (e) => e.getClientRects().length > 0;
    const labelOf = (i) => {
        const l = i.id && root.querySelector(`label[for="${i.id}"]`);
        return (l ? l.innerText : (i.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 260);
    };
    return {
        boxes: [...root.querySelectorAll('input[type=checkbox]')].map((i) => ({name: i.name, value: i.value, checked: i.checked, visible: vis(i), disabled: i.disabled, label: labelOf(i)})),
        sections: [...root.querySelectorAll('legend, .section > label, label.sub_label, h3, h4, .pkp_form .label, .label')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 120)).filter(Boolean).slice(0, 30),
        text: root.innerText.replace(/\s+/g, ' ').slice(0, 2500),
        buttons: [...root.querySelectorAll('button, a.pkp_button, input[type=submit], a')].filter(vis).map((b) => (b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 20),
    };
}).catch((e) => ({error: String(e.message).slice(0, 200)}));
const mailTo = (u) => `${u}@mail.test`;
async function mailFind(app, to, contains, ms = 20000) {
    try { const m = await app.mail.find({to, contains, timeoutMs: ms}); const full = await app.mail.fullMessage(m.ID).catch(() => null); return {found: true, subject: m.Subject, from: m.From, to: m.To, date: m.Date, text: full ? flat(full.Text, 700) : null}; }
    catch (e) { return {found: false, error: String(e.message).slice(0, 160)}; }
}
const mailCount = (app, to, contains) => app.mail.count({to, contains}).catch((e) => ({error: String(e.message)}));
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

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOPS = app.name === 'ops', isOJS = app.name === 'ojs', isOMP = app.name === 'omp';
    const cp = app.contextPath;
    const ctxUrl = (p) => app.url(`/index.php/${cp}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: cp}); await idle(page); };
    if (!sc.tag) sc.tag = tag('u35k5');
    const SE_ROLE = isOPS ? 'Moderator' : isOMP ? 'Series editor' : 'Section editor';
    const SECTION_RE = isOMP ? /Monographs/ : isOPS ? /Preprints/ : /Articles/;
    const STAGE_KEY = isOPS ? 'workflow_5' : 'workflow_1';
    const TEMPLATE_NAME = isOPS ? 'Moderator Assigned (Auto)' : 'Editor Assigned (Auto)';
    const PREFIX = `[${sc.tag}] `;
    const TITLE = `U35 K5 auto ${sc.tag}`;
    const NAMES = {ana: 'Ana Section Editor', omar: 'Omar Section Editor', ravi: 'Ravi Section Editor', diana: 'Diana Editor', alex: 'Alex Author', maya: 'Maya Manager'};
    const k4 = (() => { try { return JSON.parse(fs.readFileSync(path.join(outDir(), '..', 'ccK4', `k4-state-${app.name}.json`), 'utf8')); } catch { return null; } })();
    const browserDialogs = [];
    const armDialogs = (page) => page.on('dialog', async (d) => { browserDialogs.push({type: d.type(), message: d.message(), url: page.url()}); log('[browser dialog]', d.type(), d.message()); await d.accept().catch(() => {}); });

    // ---- workflow helpers (K4's) -----------------------------------------------
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
        log(`[${label}]`, app.name, 'url:', page.url(), 'actions:', JSON.stringify(info.actions), 'panel:', JSON.stringify((panel.items || []).map((i) => i.text.slice(0, 90))));
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
    // A row's "Edit" → the "Edit Assignment" window (K3's reader), read and cancelled.
    async function editWindowRead(page, name, label) {
        const {items, more, absent} = await rowMenu(page, name, label);
        if (absent) return {absent: true};
        const edit = page.getByRole('menuitem', {name: /^Edit$/}).first();
        if (!(await edit.count())) { await closeMenu(page, more); return {noEdit: true, items: items.map((i) => i.text)}; }
        await edit.click(); await idle(page);
        const win = topWin(page);
        await win.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && (d.querySelector('input[name=recommendOnly], input[name=canChangeMetadata]') || /No changes can be made/.test(d.innerText)); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const dl = (await dialogTexts(page)).slice(-1)[0] || {};
        const form = await formBoxes(win);
        const out = {row: name, title: dl.name, text: flat(dl.text, 1200), boxes: (form.boxes || []).map((b) => ({name: b.name, checked: b.checked, disabled: b.disabled, label: b.label})), buttons: dl.buttons, links: form.buttons};
        await snap(page, `${label}-edit`, {editAssignment: out});
        log(`[${label}] Edit "${name}":`, JSON.stringify(out.boxes.map((b) => `${b.name}${b.checked ? ' [x]' : ' [ ]'}`)));
        const cancel = win.getByRole('link', {name: 'Cancel', exact: true}).or(win.getByRole('button', {name: /^Cancel$/})).first();
        if (await cancel.count()) await cancel.click(); else await win.getByRole('button', {name: /^Close$/}).first().click().catch(() => {});
        await page.waitForTimeout(700); await idle(page);
        return out;
    }
    async function activityLog(page, label) {
        const btn = page.getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); log(`[${label}] no Activity Log button`); return null; }
        await btn.click();
        const dlg = topWin(page);
        await dlg.waitFor({timeout: 30000}).catch(() => {});
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ').slice(0, 200))).filter((r) => r.length > 1)).catch(() => []);
        const head = await dlg.locator('table thead th').allInnerTexts().catch(() => []);
        await snap(page, label, {head, rows});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 10)).slice(0, 1500));
        const close = dlg.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        await page.waitForTimeout(600); await idle(page);
        return rows;
    }
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
        const rows = await d.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => ({rowText: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 400)}))).catch(() => []);
        const dlg = (await dialogTexts(page)).slice(-1)[0];
        const out = {bellLabel, rows, title: dlg && dlg.name, text: flat(dlg && dlg.text, 2500)};
        await snap(page, label, out);
        log(`[${label}]`, bellLabel, '| rows:', JSON.stringify(rows.map((r) => r.rowText.slice(0, 140))));
        const close = d.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return out;
    }

    // ---- Settings › Users & Roles › Roles (K3's driver) ---------------------------
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
    async function readRole(page, roleName, label) {
        const {form, reason, row} = await openRoleEdit(page, roleName);
        if (!form) { record(label, {role: roleName, noForm: reason, row}); return null; }
        const r = await readRoleForm(page, form);
        await snap(page, label, {role: roleName, recommendOnly: r.recommendOnly, permitMetadataEdit: r.permitMetadataEdit, stages: r.stages});
        await cancelRoleForm(page, form);
        return r;
    }
    async function setRole(page, roleName, changes, label) {
        const {form, reason, row} = await openRoleEdit(page, roleName);
        if (!form) { record(label, {role: roleName, noForm: reason, row}); log(`[${label}] ${roleName}: ${reason}`); return null; }
        const before = await readRoleForm(page, form);
        for (const [k, v] of Object.entries(changes)) {
            const box = form.locator(`input[name="${k}"]`);
            if (await box.count()) { if (v) await box.check(); else await box.uncheck(); }
        }
        const saveBtn = form.locator('button[type=submit], input[type=submit], button').filter({hasText: /^(Save|OK)$/}).last();
        await loc(page, `${label}: the role form's Save`, saveBtn);
        await saveBtn.click();
        const t = await waitToast(page, /saved|Saved|error|Error|cannot|must/);
        await idle(page); await page.waitForTimeout(800); await idle(page);
        const stillOpen = await form.count();
        const out = {role: roleName, changes, before: {recommendOnly: before.recommendOnly, permitMetadataEdit: before.permitMetadataEdit, stages: before.stages}, toasts: t, formStillOpen: !!stillOpen, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))};
        if (stillOpen) { out.formAfter = await readRoleForm(page, form); await cancelRoleForm(page, form); }
        const re = await openRoleEdit(page, roleName);
        if (re.form) { out.reread = await readRoleForm(page, re.form); await snap(page, `${label}-reread`, {recommendOnly: out.reread.recommendOnly, permitMetadataEdit: out.reread.permitMetadataEdit}); await cancelRoleForm(page, re.form); }
        record(label, {setRole: out});
        log(`[${label}] ${roleName} set`, JSON.stringify(changes), '→ toasts:', JSON.stringify(t.map((x) => x.text)), '| reread recommendOnly:', JSON.stringify(out.reread && out.reread.recommendOnly && out.reread.recommendOnly.checked));
        return out;
    }

    // ---- Settings › Journal › Sections (OMP: Series) › the section's form -----------
    async function openSectionForm(page) {
        await page.goto(ctxUrl('/management/settings/context')); await idle(page);
        await page.getByRole('tab', {name: /^(Sections|Series)$/}).first().click(); await idle(page);
        const grid = page.locator('#sectionsGridContainer, #seriesGridContainer').first();
        await grid.waitFor({timeout: 20000});
        const target = grid.locator('tr.gridRow').filter({hasText: SECTION_RE}).first();
        await target.locator('a.show_extras').first().click(); await idle(page);
        await target.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).first().click().catch(async () => { await grid.getByRole('link', {name: 'Edit', exact: true}).first().click(); });
        const form = page.locator('form#sectionForm, form#seriesForm').first();
        await form.locator('input[name^="subEditors"]').first().waitFor({timeout: 20000});
        await idle(page);
        return form;
    }
    const sectionBoxes = (form) => form.locator('input[name^="subEditors"]').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, checked: e.checked, disabled: e.disabled, label: (e.labels && e.labels[0] ? e.labels[0].innerText : (e.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ')})));
    async function readSection(page, label) {
        const form = await openSectionForm(page);
        const boxes = await sectionBoxes(form);
        const groupText = await form.evaluate((f) => { const el = [...f.querySelectorAll('.section, fieldset, div')].find((x) => /Editorial Assignments/.test(x.innerText) && x.innerText.length < 1500); return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 1200) : null; });
        const dl = (await dialogTexts(page)).slice(-1)[0] || {};
        const out = {title: dl.name, boxes, groupText, buttons: dl.buttons, links: dl.links};
        await snap(page, label, out);
        log(`[${label}]`, JSON.stringify(boxes.map((b) => `${b.label}${b.checked ? ' [x]' : ''}`)));
        return {form, out};
    }
    async function cancelSectionForm(page, form) {
        const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(topWin(page).getByRole('button', {name: /^(Cancel|Close)$/})).first();
        if (await cancel.count()) await cancel.click();
        await form.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await page.waitForTimeout(600); await idle(page);
    }
    // Tick or untick the box whose label matches; Save; reread. Returns {absent} when no such box.
    async function setSectionBox(page, labelRe, want, label) {
        const {form, out} = await readSection(page, `${label}-before`);
        const box = out.boxes.find((b) => labelRe.test(b.label));
        if (!box) { record(label, {absent: true, wanted: String(labelRe), boxes: out.boxes.map((b) => b.label)}); log(`[${label}] no box matching ${labelRe}`); await cancelSectionForm(page, form); return {absent: true, boxes: out.boxes}; }
        const input = form.locator(`input[name="${box.name}"][value="${box.value}"]`).first();
        if (want) await input.check(); else await input.uncheck();
        const saveBtn = form.locator('button[type=submit], input[type=submit], button').filter({hasText: /^(Save|OK)$/}).last();
        await loc(page, `${label}: the section form's Save`, saveBtn);
        await saveBtn.click();
        const t = await waitToast(page, /saved|Saved|error|Error/);
        await idle(page); await page.waitForTimeout(800); await idle(page);
        const stillOpen = await form.count();
        const res = {box: box.label, want, toasts: t, formStillOpen: !!stillOpen, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))};
        if (stillOpen) { res.formText = flat(await form.innerText(), 800); await cancelSectionForm(page, form); }
        const re = await readSection(page, `${label}-reread`);
        res.reread = re.out.boxes.map((b) => `${b.label}${b.checked ? ' [x]' : ''}`);
        await cancelSectionForm(page, re.form);
        record(label, res);
        log(`[${label}]`, JSON.stringify(res.toasts.map((x) => x.text)), '| reread:', JSON.stringify(res.reread));
        return res;
    }

    // ---- Settings › Workflow › Emails › "Editor Assigned (Auto)" › Edit Template -------
    async function openTemplate(page, label) {
        await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
        const main = page.locator('main');
        await main.locator('.listPanel__item').first().waitFor({timeout: 30000}).catch(() => {});
        const search = main.getByRole('searchbox').or(main.locator('input[type="search"]')).first();
        await search.fill('Assigned'); await search.press('Enter'); await idle(page);
        await page.waitForFunction(() => [...document.querySelectorAll('.listPanel__item')].some((i) => /Assigned/.test(i.innerText)) || document.body.innerText.includes('No items'), null, {timeout: 10000}).catch(() => {});
        const items = await main.locator('.listPanel__item').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)));
        await snap(page, `${label}-list`, {items});
        const item = main.locator('.listPanel__item').filter({hasText: new RegExp(esc(TEMPLATE_NAME))}).first();
        if (!(await item.count())) { record(`${label}-no-item`, {items}); return null; }
        await item.getByRole('button', {name: /^Edit/}).first().click(); await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input:not([type=hidden])'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(800);
        const w = topWin(page);
        // the Subject box: by its label, else the input whose name starts with "subject"
        let subject = w.getByRole('textbox', {name: /^Subject/}).first();
        if (!(await subject.count())) subject = w.locator('input[name^="subject"], input[id*="subject" i]').first();
        await subject.waitFor({timeout: 15000}).catch(() => {});
        const fields = await w.locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, value: (e.value || '').slice(0, 300), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 80)})));
        const body = await page.evaluate(() => { const ed = window.tinymce && window.tinymce.activeEditor; return ed ? ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 1200) : null; }).catch(() => null);
        const dl = (await dialogTexts(page)).slice(-1)[0] || {};
        const out = {title: dl.name, fields, body, buttons: dl.buttons, subjectValue: await subject.inputValue().catch(() => null)};
        await snap(page, label, out);
        log(`[${label}]`, dl.name, '| subject:', out.subjectValue, '| fields:', JSON.stringify(fields.map((f) => `${f.label || f.name}=${f.value.slice(0, 60)}`)));
        return {w, subject, out};
    }
    async function closeTemplate(page) {
        const c = topWin(page).getByRole('button', {name: /^(Close|Cancel)$/}).first();
        if (await c.count()) await c.click().catch(() => {});
        await page.waitForTimeout(800); await idle(page);
    }
    async function setTemplateSubject(page, value, label) {
        const t = await openTemplate(page, `${label}-open`);
        if (!t) return null;
        await t.subject.fill(value);
        const saveBtn = t.w.getByRole('button', {name: /^Save$/}).first();
        await loc(page, `${label}: Edit Template's Save`, saveBtn);
        await saveBtn.click();
        const toast = await waitToast(page, /saved|Saved|error|Error/);
        await idle(page); await page.waitForTimeout(1000); await idle(page);
        const res = {value, toasts: toast, dialogsAfter: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))};
        await snap(page, `${label}-saved`, res);
        if (res.dialogsAfter.length) await closeTemplate(page);
        const re = await openTemplate(page, `${label}-reread`);
        res.reread = re && re.out.subjectValue;
        if (re) await closeTemplate(page);
        record(label, res);
        log(`[${label}] subject set →`, JSON.stringify(res.toasts.map((x) => x.text)), '| reread:', res.reread);
        return res;
    }

    // ---- Profile › Notifications (as the signed-in user) ---------------------------
    const notifRows = (page) => page.evaluate(() => {
        const out = [];
        for (const i of document.querySelectorAll('form#notificationSettingsForm input[type=checkbox]')) {
            if (!i.getClientRects().length) continue;
            const lab = (i.labels && i.labels[0] ? i.labels[0].innerText : (i.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160);
            let h = i.closest('li, fieldset, div'); let heading = '';
            while (h && h !== document.body) { const t = h.innerText.trim().split('\n')[0].trim(); if (t && !/^(Enable|Do not)/.test(t)) { heading = t.slice(0, 160); break; } h = h.parentElement; }
            out.push({name: i.name, checked: i.checked, disabled: i.disabled, label: lab, heading});
        }
        return out;
    });
    async function readNotifications(page, label) {
        await page.goto(ctxUrl('/user/profile/notificationSettings')); await idle(page);
        await page.locator('form#notificationSettingsForm').waitFor({timeout: 20000});
        await page.waitForFunction(() => document.querySelectorAll('form#notificationSettingsForm input[type=checkbox]').length > 3, null, {timeout: 15000}).catch(() => {});
        const rows = await notifRows(page);
        const rel = rows.filter((r) => /submitted|Discussion|discussion/.test(r.heading));
        await snap(page, label, {rows: rel, all: rows.length});
        log(`[${label}]`, JSON.stringify(rel.map((r) => `${r.heading} · ${r.name}${r.checked ? ' [x]' : ' [ ]'}`)));
        return rows;
    }
    async function setNotification(page, name, want, label) {
        const before = await readNotifications(page, `${label}-before`);
        const box = page.locator(`form#notificationSettingsForm input[name="${name}"]`).first();
        if (!(await box.count())) { record(label, {absent: name}); return {absent: true}; }
        if (want) await box.check(); else await box.uncheck();
        const saveBtn = page.locator('form#notificationSettingsForm').getByRole('button', {name: /^Save$/}).first();
        await loc(page, `${label}: the Notifications form's Save`, saveBtn);
        await saveBtn.click();
        const t = await waitToast(page, /saved|Saved|error|Error/);
        await idle(page); await page.waitForTimeout(800); await idle(page);
        const res = {name, want, toasts: t, before: before.find((r) => r.name === name)};
        await snap(page, `${label}-saved`, res);
        const after = await readNotifications(page, `${label}-reread`);
        res.reread = after.find((r) => r.name === name);
        record(label, res);
        log(`[${label}] ${name} → ${want}:`, JSON.stringify(t.map((x) => x.text)), '| reread:', JSON.stringify(res.reread));
        return res;
    }

    // ---- the submission wizard from the start page (U05 K1's driver via K4) ----------
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
    async function wizardFromStart(page, title, name, {sectionRe} = {}) {
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
    // baseline: the four settings at their seeded values (read only), the default end of each axis
    if (on('baseline')) {
        const {page, close} = await launch(app);
        armDialogs(page);
        try {
            sc.baseline = sc.baseline || {};
            await signInAs(page, 'manager.maya');
            await sect('role form default', async () => {
                const r = await readRole(page, SE_ROLE, 'b-maya-role-form');
                sc.baseline.role = r && {recommendOnly: r.recommendOnly, permitMetadataEdit: r.permitMetadataEdit, stages: r.stages};
                save();
            });
            await sect('section form default', async () => {
                const {form, out} = await readSection(page, 'b-maya-section-form');
                sc.baseline.section = out.boxes.map((b) => ({name: b.name, value: b.value, label: b.label, checked: b.checked}));
                // the sweep: a box changed, then Cancel — what asks on the way out
                const first = out.boxes.find((b) => !b.checked);
                if (first) {
                    await form.locator(`input[name="${first.name}"][value="${first.value}"]`).first().check();
                    const n0 = browserDialogs.length;
                    await cancelSectionForm(page, form);
                    sc.baseline.sectionCancelWithChange = {box: first.label, browserDialogs: browserDialogs.slice(n0), dialogsAfter: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 200)}))};
                    await snap(page, 'b-maya-section-form-cancel-with-change', sc.baseline.sectionCancelWithChange);
                    const re = await readSection(page, 'b-maya-section-form-after-cancel');
                    sc.baseline.sectionAfterCancel = re.out.boxes.map((b) => `${b.label}${b.checked ? ' [x]' : ''}`);
                    await cancelSectionForm(page, re.form);
                } else await cancelSectionForm(page, form);
                save();
            });
            await sect('template default', async () => {
                const t = await openTemplate(page, 'b-maya-template');
                if (t) {
                    sc.baseline.template = {subject: t.out.subjectValue, fields: t.out.fields, body: t.out.body, buttons: t.out.buttons};
                    // the sweep: the subject changed, then "Close" — what asks on the way out
                    await t.subject.fill(`${PREFIX}${t.out.subjectValue}`);
                    const n0 = browserDialogs.length;
                    await closeTemplate(page);
                    sc.baseline.templateCloseWithChange = {browserDialogs: browserDialogs.slice(n0), dialogsAfter: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300), buttons: d.buttons}))};
                    await snap(page, 'b-maya-template-close-with-change', sc.baseline.templateCloseWithChange);
                    // a confirm window may sit there: take its "leave" answer, then reread
                    const leave = topWin(page).getByRole('button', {name: /^(Yes|OK|Leave|Continue|Close)$/}).first();
                    if ((await page.locator('[role="dialog"]:visible').count()) && (await leave.count())) { await leave.click().catch(() => {}); await page.waitForTimeout(800); await idle(page); }
                    const re = await openTemplate(page, 'b-maya-template-after-close');
                    sc.baseline.templateAfterClose = re && re.out.subjectValue;
                    if (re) await closeTemplate(page);
                }
                save();
            });
            await sect('ana notifications default', async () => {
                await signInAs(page, 'sectioneditor.ana');
                const rows = await readNotifications(page, 'b-ana-notifications');
                sc.baseline.anaNotifications = rows.filter((r) => /submitted|Discussion/.test(r.heading)).map((r) => ({name: r.name, checked: r.checked, heading: r.heading}));
                save();
            });
            await sect('default end: K4 submission rows and mails', async () => {
                if (!(k4 && k4.auto && k4.auto.wizard && k4.auto.wizard.submissionId)) { sc.baseline.k4 = {absent: true}; save(); return; }
                const id = k4.auto.wizard.submissionId, t = k4.auto.wizard.title;
                await signInAs(page, 'manager.maya');
                const r = await openWorkflow(page, workflow(id, STAGE_KEY), 'b-maya-k4-submission-panel');
                sc.baseline.k4 = {submissionId: id, title: t, panel: (r.panel.items || []).map((i) => i.lines), actions: r.info.actions, mails: {}};
                for (const p of ['sectioneditor.ana', 'sectioneditor.omar', 'editor.diana', 'sectioneditor.ravi', 'manager.maya', 'author.alex']) sc.baseline.k4.mails[p] = await mailCount(app, mailTo(p), t);
                const omar = await mailFind(app, mailTo(isOPS ? 'author.alex' : 'sectioneditor.omar'), t, 4000);
                sc.baseline.k4.subjectSeen = omar.found ? omar.subject : null;
                save();
                log('[baseline k4]', JSON.stringify(sc.baseline.k4));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // flip: the four settings of t16, each saved on screen and reread
    if (on('flip')) {
        const {page, close} = await launch(app);
        armDialogs(page);
        try {
            sc.flip = sc.flip || {};
            await signInAs(page, 'manager.maya');
            await sect('role recommendOnly on', async () => { sc.flip.role = await setRole(page, SE_ROLE, {recommendOnly: true}, 'f-maya-role-recommendonly-on'); save(); });
            await sect('diana second role box', async () => {
                sc.flip.diana = await setSectionBox(page, new RegExp(`Assign Diana Editor as ${SE_ROLE}`), true, 'f-maya-section-diana-second-role'); save();
            });
            await sect('template subject prefixed', async () => {
                const original = sc.baseline && sc.baseline.template && sc.baseline.template.subject;
                if (!original) { const t = await openTemplate(page, 'f-maya-template-read'); sc.baseline = sc.baseline || {}; sc.baseline.template = t && {subject: t.out.subjectValue}; if (t) await closeTemplate(page); }
                const base = sc.baseline.template.subject;
                sc.flip.template = await setTemplateSubject(page, `${PREFIX}${base}`, 'f-maya-template-prefix'); save();
            });
            await sect('ana unsubscribes', async () => {
                await signInAs(page, 'sectioneditor.ana');
                sc.flip.ana = await setNotification(page, 'emailNotificationSubmissionSubmitted', true, 'f-ana-unsubscribe'); save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // submit: one wizard submission by author.alex on the seeded journal
    if (on('submit')) {
        const {page, close} = await launch(app);
        armDialogs(page);
        try {
            await sect('author submits', async () => {
                if (sc.wizard && sc.wizard.submissionId) return;
                await signInAs(page, 'author.alex');
                sc.wizard = await wizardFromStart(page, TITLE, 'w-alex-wizard', {sectionRe: SECTION_RE});
                save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // read: the mails, the rows' third line at three levels, the Edit window's box, the log, the Tasks panel, the stage's actions
    if (on('read')) {
        const {page, close} = await launch(app);
        armDialogs(page);
        try {
            sc.read = sc.read || {};
            const id = sc.wizard && sc.wizard.submissionId;
            await sect('mails', async () => {
                // the positive control first: Omar's (OPS: the author's acknowledgement), then the counts
                const control = isOPS ? 'author.alex' : 'sectioneditor.omar';
                sc.read.control = await mailFind(app, mailTo(control), TITLE, 30000);
                sc.read.mails = {};
                for (const p of ['sectioneditor.ana', 'sectioneditor.omar', 'editor.diana', 'sectioneditor.ravi', 'manager.maya', 'author.alex']) {
                    const f = await mailFind(app, mailTo(p), TITLE, 2500);
                    sc.read.mails[p] = {count: await mailCount(app, mailTo(p), TITLE), subject: f.found ? f.subject : null, from: f.found ? f.from : null, text: f.found ? f.text : null};
                }
                save();
                log('[mails]', JSON.stringify(Object.fromEntries(Object.entries(sc.read.mails).map(([k, v]) => [k, `${v.count}× ${v.subject}`]))));
            });
            if (!id) { log('[read] no submission id; run the submit phase first'); return; }
            await sect('manager reads', async () => {
                await signInAs(page, 'manager.maya');
                const r = await openWorkflow(page, workflow(id, STAGE_KEY), 'r-maya-panel');
                sc.read.maya = {panel: (r.panel.items || []).map((i) => i.lines), actions: r.info.actions, head: r.info.head};
                sc.read.maya.anaEdit = await editWindowRead(page, NAMES.ana, 'r-maya-ana');
                await openWorkflow(page, workflow(id, STAGE_KEY), 'r-maya-panel-2');
                sc.read.maya.omarEdit = await editWindowRead(page, NAMES.omar, 'r-maya-omar');
                if (!isOPS) { await openWorkflow(page, workflow(id, STAGE_KEY), 'r-maya-panel-3'); sc.read.maya.dianaMenu = (await rowMenu(page, NAMES.diana, 'r-maya-diana')).items; await closeMenu(page, page.getByRole('button', {name: new RegExp(`^${esc(NAMES.diana)}.*More Actions$`)}).first()); }
                await openWorkflow(page, workflow(id, STAGE_KEY), 'r-maya-panel-4');
                sc.read.maya.log = await activityLog(page, 'r-maya-log');
                sc.read.maya.mailLogRows = (sc.read.maya.log || []).filter((row) => row.some((c) => /email has been sent/.test(c))).map((row) => row.find((c) => /email has been sent/.test(c)));
                // the review stage entry too: is the third line on every stage's row?
                if (!isOPS) { const r3 = await openWorkflow(page, workflow(id, 'workflow_3'), 'r-maya-panel-review'); sc.read.maya.reviewPanel = (r3.panel.items || []).map((i) => i.lines); }
                sc.read.maya.tasks = await tasksPanel(page, 'r-maya-tasks');
                save();
            });
            await sect('ana reads', async () => {
                await signInAs(page, 'sectioneditor.ana');
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                sc.read.ana = {tasks: await tasksPanel(page, 'r-ana-tasks')};
                const r = await openWorkflow(page, workflow(id, STAGE_KEY), 'r-ana-panel');
                sc.read.ana.panel = (r.panel.items || []).map((i) => i.lines); sc.read.ana.actions = r.info.actions; sc.read.ana.head = r.info.head;
                sc.read.ana.ownMenu = (await rowMenu(page, NAMES.ana, 'r-ana-own')).items;
                save();
            });
            await sect('omar reads', async () => {
                await signInAs(page, 'sectioneditor.omar');
                const r = await openWorkflow(page, workflow(id, STAGE_KEY), 'r-omar-panel');
                sc.read.omar = {panel: (r.panel.items || []).map((i) => i.lines), actions: r.info.actions};
                save();
            });
            if (!isOPS) await sect('diana reads', async () => {
                await signInAs(page, 'editor.diana');
                const r = await openWorkflow(page, workflow(id, STAGE_KEY), 'r-diana-panel');
                sc.read.diana = {panel: (r.panel.items || []).map((i) => i.lines), actions: r.info.actions};
                save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // restore: every flipped setting back to its recorded value, reread and snapshotted
    if (on('restore')) {
        const {page, close} = await launch(app);
        armDialogs(page);
        try {
            sc.restore = sc.restore || {};
            await signInAs(page, 'manager.maya');
            await sect('role recommendOnly back', async () => {
                const want = !!(sc.baseline && sc.baseline.role && sc.baseline.role.recommendOnly && sc.baseline.role.recommendOnly.checked);
                sc.restore.role = await setRole(page, SE_ROLE, {recommendOnly: want}, 'restore-maya-role-recommendonly'); save();
            });
            await sect('diana box back', async () => {
                if (sc.flip && sc.flip.diana && sc.flip.diana.absent) { sc.restore.diana = {nothingToRestore: true}; const r = await readSection(page, 'restore-maya-section-form'); sc.restore.sectionBoxes = r.out.boxes.map((b) => `${b.label}${b.checked ? ' [x]' : ''}`); await cancelSectionForm(page, r.form); save(); return; }
                const before = (sc.baseline && sc.baseline.section || []).find((b) => new RegExp(`Assign Diana Editor as ${SE_ROLE}`).test(b.label));
                sc.restore.diana = await setSectionBox(page, new RegExp(`Assign Diana Editor as ${SE_ROLE}`), !!(before && before.checked), 'restore-maya-section-diana'); save();
            });
            await sect('template subject back', async () => {
                const original = sc.baseline && sc.baseline.template && sc.baseline.template.subject;
                if (!original) { sc.restore.template = {noBaseline: true}; save(); return; }
                sc.restore.template = await setTemplateSubject(page, original, 'restore-maya-template'); save();
            });
            await sect('ana resubscribes', async () => {
                const before = (sc.baseline && sc.baseline.anaNotifications || []).find((r) => r.name === 'emailNotificationSubmissionSubmitted');
                await signInAs(page, 'sectioneditor.ana');
                sc.restore.ana = await setNotification(page, 'emailNotificationSubmissionSubmitted', !!(before && before.checked), 'restore-ana-notifications'); save();
            });
            sc.restore.browserDialogs = browserDialogs.slice();
            sc.restore.summary = {
                role: sc.restore.role && sc.restore.role.reread && sc.restore.role.reread.recommendOnly && sc.restore.role.reread.recommendOnly.checked,
                diana: sc.restore.diana && (sc.restore.diana.reread || sc.restore.diana),
                template: sc.restore.template && sc.restore.template.reread,
                ana: sc.restore.ana && sc.restore.ana.reread && sc.restore.ana.reread.checked,
            };
            record('restore-summary', sc.restore.summary);
            save();
            log('[restore]', JSON.stringify(sc.restore.summary));
            await signOut(page);
        } finally { await close(); }
    }

    // =========================================================================
    // notify: line 506 — the "Discussion added." / "Discussion activity." boxes and the "Notify" email, on a scratch context
    // (recipient se1 flips the boxes; mgr sends "Notify" to se1 and, as the control, to se2 with the same marker)
    async function notifyWindow(page, name, label, opts = {}) {
        const {items, more, absent} = await rowMenu(page, name, label);
        if (absent) return {absent: true};
        const notify = page.getByRole('menuitem', {name: /^Notify$/}).first();
        if (!(await notify.count())) { await closeMenu(page, more); return {noNotify: true, items: items.map((i) => i.text)}; }
        await notify.click(); await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('select[name="template"], textarea[name="message"]'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const w = topWin(page);
        const dl = (await dialogTexts(page)).slice(-1)[0] || {};
        const tsel = w.locator('select[name="template"]');
        const templates = (await tsel.count()) ? await selectOptions(tsel) : null;
        const out = {row: name, title: dl.name, templates: templates && templates.map((t) => t.text)};
        await snap(page, `${label}-notify`, out);
        const opt = (templates || []).find((t) => opts.template.test(t.text));
        if (opt) { await tsel.selectOption(opt.value); await idle(page); await page.waitForTimeout(800); await idle(page); out.chosen = opt.text; }
        const prefilled = (await messageContent(page)).content || '';
        out.set = await setMessage(page, `${prefilled}<p>${opts.message}</p>`);
        const send = w.getByRole('button', {name: /^(Notify|OK|Send)$/}).last();
        await send.click();
        out.toasts = await waitToast(page, /Notification sent|Please ensure|error|Error/);
        await page.waitForTimeout(1200); await idle(page);
        const after = (await dialogTexts(page)).slice(-1)[0] || {};
        out.stillOpen = /^Notify$/.test(after.name || '') || /Start Discussion/.test(after.text || '');
        await snap(page, `${label}-notify-sent`, {stillOpen: out.stillOpen, toasts: out.toasts, dialogAfter: flat(after.text, 600)});
        if (out.stillOpen) { const c = topWin(page).getByRole('button', {name: /^Close$/}).first(); if (await c.count()) await c.click(); await page.waitForTimeout(600); await idle(page); }
        await waitRows(page, ''); await page.waitForTimeout(600); await idle(page);
        log(`[${label}] Notify "${name}": chosen ${out.chosen} | sent:`, JSON.stringify(out.toasts.map((t) => t.text)), '| still open:', out.stillOpen);
        return out;
    }
    if (on('notify')) {
        sc.notify = sc.notify || {};
        const n = sc.notify;
        if (!n.contextPath) {
            const t = tag('u35k5n');
            const users = [
                {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: `${t}se1`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Sectionone'},
                {username: `${t}se2`, roles: ['sectionEditor'], givenName: 'Sue', familyName: 'Sectiontwo'},
                {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            ];
            const ctx = await app.api.createContext({tag: t, users});
            n.tag = t; n.contextPath = ctx.path || t;
            const r = await app.api.createSubmission({tag: `${t}S1`, context: n.contextPath, submitter: `${t}au`, title: `U35 K5 notify ${t}`, participants: [{username: `${t}se1`, role: 'sectionEditor'}, {username: `${t}se2`, role: 'sectionEditor'}]});
            n.S1 = r.submissionId; save();
            log('[notify seed]', JSON.stringify({tag: t, S1: n.S1}));
        }
        const nUrl = (p) => app.url(`/index.php/${n.contextPath}${p}`);
        const nWorkflow = () => nUrl(`/dashboard/editorial?workflowSubmissionId=${n.S1}&workflowMenuKey=${isOPS ? 'workflow_5' : 'workflow_1'}`);
        const U = (k) => `${n.tag}${k}`;
        const nSignIn = async (page, u) => { await signIn(page, u, {contextPath: n.contextPath}); await idle(page); };
        async function nSetNotif(page, changes, label) {
            await page.goto(nUrl('/user/profile/notificationSettings')); await idle(page);
            await page.locator('form#notificationSettingsForm').waitFor({timeout: 20000});
            for (const [name, want] of Object.entries(changes)) { const box = page.locator(`form#notificationSettingsForm input[name="${name}"]`).first(); if (want) await box.check(); else await box.uncheck(); }
            await page.locator('form#notificationSettingsForm').getByRole('button', {name: /^Save$/}).first().click();
            const t = await waitToast(page, /saved|Saved|error|Error/);
            await idle(page); await page.waitForTimeout(600);
            await page.goto(nUrl('/user/profile/notificationSettings')); await idle(page);
            await page.locator('form#notificationSettingsForm').waitFor({timeout: 20000});
            const rows = (await notifRows(page)).filter((r) => /Discussion/.test(r.heading)).map((r) => `${r.heading} · ${r.name}${r.checked ? ' [x]' : ' [ ]'}`);
            await snap(page, label, {changes, toasts: t, rows});
            log(`[${label}]`, JSON.stringify(rows));
            return rows;
        }
        async function nRound(page, key, marker) {
            await nSignIn(page, U('mgr'));
            await openWorkflow(page, nWorkflow(), `n-mgr-${key}`);
            const a = await notifyWindow(page, 'Sid Sectionone', `n-mgr-${key}-se1`, {template: /^Discussion \(/, message: marker});
            await openWorkflow(page, nWorkflow(), `n-mgr-${key}-2`);
            const b = await notifyWindow(page, 'Sue Sectiontwo', `n-mgr-${key}-se2`, {template: /^Discussion \(/, message: marker});
            const control = await mailFind(app, mailTo(U('se2')), marker, 30000);
            const se1 = await mailFind(app, mailTo(U('se1')), marker, 3000);
            const out = {marker, se1Sent: a.toasts.map((t) => t.text), se2Sent: b.toasts.map((t) => t.text), control: {found: control.found, subject: control.subject}, se1: {found: se1.found, subject: se1.subject, count: await mailCount(app, mailTo(U('se1')), marker)}};
            record(`n-${key}-mails`, out);
            log(`[n-${key}]`, JSON.stringify(out));
            return out;
        }
        const {page, close} = await launch(app);
        armDialogs(page);
        try {
            await sect('rounds', async () => {
                await nSignIn(page, U('se1'));
                n.rows0 = await nSetNotif(page, {}, 'n-se1-notifications-default');
                // end 1: "Discussion added." mail off
                n.rows1 = await nSetNotif(page, {emailNotificationNewQuery: true}, 'n-se1-newquery-off');
                n.round1 = await nRound(page, 'r1-newquery-off', `k5n-added-off-${n.tag}`);
                // end 2: "Discussion added." back on, "Discussion activity." mail off
                await nSignIn(page, U('se1'));
                n.rows2 = await nSetNotif(page, {emailNotificationNewQuery: false, emailNotificationQueryActivity: true}, 'n-se1-activity-off');
                n.round2 = await nRound(page, 'r2-activity-off', `k5n-activity-off-${n.tag}`);
                // both on again (the default): the mail arrives
                await nSignIn(page, U('se1'));
                n.rows3 = await nSetNotif(page, {emailNotificationQueryActivity: false}, 'n-se1-both-on');
                n.round3 = await nRound(page, 'r3-both-on', `k5n-both-on-${n.tag}`);
                save();
            });
            await signOut(page);
        } finally { await close(); }
    }

    if (on('notes')) {
        note(`ccK5 [${app.name}]: t16 drive on publicknowledge — Roles › ${SE_ROLE} › Edit (form#userGroupForm input[name=recommendOnly], Save → "Your changes have been saved."); Settings › ${isOMP ? 'Press › Series' : isOPS ? 'Server › Sections' : 'Journal › Sections'} › ${isOMP ? 'Monographs' : isOPS ? 'Preprints' : 'Articles'} › Edit (form#${isOMP ? 'seriesForm' : 'sectionForm'}, boxes input[name^=subEditors]); Settings › Workflow › Emails › "${TEMPLATE_NAME}" › Edit → "Edit Template" (Subject textbox by label); Profile › Notifications (form#notificationSettingsForm input[name=emailNotificationSubmissionSubmitted], the form's Save). Every flip restored in phase restore (restore-* snapshots).`);
    }
    if (browserDialogs.length) record('browser-dialogs', browserDialogs);
});
