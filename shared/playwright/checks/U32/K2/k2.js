// U32 claim check, chunk K2: the notice box and the Copyeditor's task and email.
// Rule 3 (the framed notice above "Draft Files" for an assigned editor: 3a
// "Assign a copyeditor…" / 3b "Awaiting Copyedits." / 3c none; it follows the
// discussion, not the assignment, A3; gone with the first copyedited file and
// back on its removal; gone once the submission left the stage, K4-2; the
// unassigned manager sees none), the Side effects "On assigning a Copyeditor
// with the 'Request Copyedit' message" (the email, the Tasks-panel row, the
// task outliving the copyedits and "Send To Production", A4, the Copyeditor's
// own delete) and "On adding or removing a copyedited file" (every assigned
// editor's notice recomputed).
// Spec: docs/specs/U32-copyediting-stage.md lines 97–114, 159–160, 212–222, 368–393.
//
// OJS/OMP: one scratch context per app with a manager (mgr, unassigned), two
// Section/Series editors (se, se2, both assigned), two Copyeditors (ce, ce2)
// and the submitting author (au); `admin` (a manager of every scratch
// context) stands for the Site Administrator level. Submissions, all at
// Copyediting through review:
//   N1  se + se2 assigned → ce assigned with NO message (A3), ce2 with "Request Copyedit" (3b, the mail, the task),
//       a copyedited file added and removed (3c and back), "Send To Production" (K4-2 at the 3b end, A4)
//   N2  se assigned → a copyedited file added and removed while 3a stands; "Send To Production" at the 3a end
//   N3  se assigned → a discussion opened with no Copyeditor (A3's other half); "Move to Review" (the other decision)
// OPS: a scratch server with one preprint; the Participants "Assign" form's
// groups and message templates, and the Tasks panel, as the cross-app control.
//
// Run: PROBE_FEATURE=U32 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U32/K2/k2.js
// PHASES=seed,base,assign,message,files,filesreq,decision,ends,n3,ops narrows (state in k2-state-<app>.json).
'use strict';

const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
const ALL = ['seed', 'base', 'assign', 'message', 'files', 'filesreq', 'decision', 'ends', 'n3', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); record(`FAILED-${name}`, {error: String(e.stack || e).slice(0, 1500)}); }
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
        text: d.innerText.slice(0, 6000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.offsetParent !== null).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
        links: [...d.querySelectorAll('a')].filter((b) => b.offsetParent !== null).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
// The workflow dialog as data: headings (in DOM order), visible buttons, tables (name → rows), the notice boxes.
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
    // The Rule 3 box renders as a level-3 heading "Notification" followed by a paragraph (K3's snapshot).
    const notices = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis).filter((h) => /^Notification$/i.test(h.innerText.trim())).map((h) => {
        const next = h.nextElementSibling;
        const box = h.parentElement;
        return {heading: h.innerText.trim(), text: (next ? next.innerText : '').trim().replace(/\s+/g, ' ').slice(0, 300), boxText: box ? box.innerText.trim().replace(/\s+/g, ' ').slice(0, 400) : null, before: headings.indexOf('Draft Files') > headings.indexOf(h.innerText.trim())};
    });
    const discussions = [...root.querySelectorAll('[data-cy="discussion-manager"] tbody tr, [data-cy="discussion-manager"] li')].filter(vis).map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200));
    const participants = [...root.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter((t) => /More Actions$/.test(t));
    return {url: location.href, dialogCount: dlgs.length, headings, buttons, tables, notices, discussions, participants};
});
// The decision page (a full page, not a dialog): steps, headings, buttons, checkboxes with labels, main text.
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
const selectOptions = (sel) => sel.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected}))).catch(() => []);
// The message box of a legacy form (TinyMCE over textarea[name=message]).
const messageContent = (page) => page.evaluate(() => {
    const ta = [...document.querySelectorAll('[role=dialog] textarea[name="message"], [role=dialog] textarea[id^="message"]')].pop();
    if (!ta) return {present: false};
    const ed = window.tinymce && window.tinymce.get(ta.id);
    return {present: true, id: ta.id, editor: !!ed, content: ed ? ed.getContent().replace(/\s+/g, ' ').slice(0, 1500) : ta.value.slice(0, 1500)};
}).catch((e) => ({error: String(e.message)}));

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
    const mail = (u) => `${u}@mail.test`;

    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const s = await snap(page, label, {info, ...(extra || {})});
        log(`[${label}]`, app.name, 'notice:', JSON.stringify((info.notices || []).map((n) => n.text)), 'headings:', JSON.stringify((info.headings || []).filter((h) => /Notification|Draft|Copyedit|Status|PARTICIPANTS/i.test(h))), 'buttons:', JSON.stringify((info.buttons || []).filter((b) => /Send|Move|Assign|Upload|Add$/.test(b))), 'disc:', JSON.stringify(info.discussions || []));
        return {info, s};
    }
    // The notice read again on the page as it stands (no re-landing), for "refreshed whenever something on the screen changes".
    async function noticeNow(page, label) {
        await idle(page);
        const info = await wfInfo(page);
        record(label, {notices: info.notices, headings: info.headings, discussions: info.discussions, participants: info.participants, url: page.url()});
        log(`[${label}] same page → notice:`, JSON.stringify(info.notices.map((n) => n.text)));
        return info;
    }
    const table = (page, name) => page.getByRole('table', {name, exact: true});
    const topWin = (page) => page.locator('[role="dialog"]:visible').last();
    async function waitWindow(page) {
        await topWin(page).waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
    }
    const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);

    // ---- the Participants panel's "Assign" form --------------------------------
    // Opens "Assign", records the form (groups, templates, message box), picks the group and user, optionally a
    // template (its body loads into the message box), then OK or Cancel; records the screen after.
    async function assignForm(page, {group, name, search, template, how = 'ok'}, label) {
        const btn = page.getByRole('button', {name: 'Assign', exact: true}).first();
        await loc(page, `${label}: Participants "Assign"`, btn);
        await btn.click(); await idle(page);
        const modal = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        await modal.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
        await idle(page);
        const groupSel = modal.locator('select[name="filterUserGroupId"]');
        const tmplSel = modal.locator('select[name="template"], select[id^="template"]').first();
        const groups = await selectOptions(groupSel);
        const templates = (await tmplSel.count()) ? await selectOptions(tmplSel) : null;
        const dlg = (await dialogTexts(page)).slice(-1)[0];
        const form0 = {title: dlg && dlg.name, groups, templates, message: await messageContent(page), buttons: dlg && dlg.buttons, links: dlg && dlg.links, text: flat(dlg && dlg.text, 2500)};
        await snap(page, `${label}-form`, {form: form0});
        log(`[${label}-form]`, 'title:', JSON.stringify(form0.title), 'groups:', JSON.stringify(groups.map((g) => g.text)), 'templates:', JSON.stringify(templates && templates.map((t) => t.text)), 'message:', JSON.stringify(form0.message));
        const g = groups.find((o) => (group instanceof RegExp ? group.test(o.text) : o.text === group));
        if (!g) { record(`${label}-group-missing`, {group: String(group), groups}); }
        else { await groupSel.selectOption(g.value); await idle(page); }
        const searchBox = modal.locator('input[id^="namegrid-users-userselect-userselectgrid-"], input[name="name"]').first();
        if (await searchBox.count()) {
            await searchBox.fill(search);
            const submit = modal.locator('form[id^="searchUserFilter"] button[id^="submitFormButton-"], form[id^="searchUserFilter"] button').first();
            if (await submit.count()) { await submit.click(); } else { await searchBox.press('Enter'); }
            await idle(page);
        }
        const rows = await modal.locator('tr').filter({has: page.locator('input[name="userId"]')}).evaluateAll((trs) => trs.map((tr) => ({text: tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 120), checked: tr.querySelector('input[name="userId"]').checked})));
        record(`${label}-users`, {rows});
        const row = modal.getByRole('row').filter({hasText: name}).first();
        const radio = row.locator('input[name="userId"]');
        if (await radio.count()) { await radio.check(); await idle(page); } else { record(`${label}-user-missing`, {name, rows}); }
        let picked = null, body = null;
        if (template && templates) {
            const t = templates.find((o) => (template instanceof RegExp ? template.test(o.text) : o.text === template));
            if (t) {
                await tmplSel.selectOption(t.value); await idle(page);
                await page.waitForFunction(() => { const ta = [...document.querySelectorAll('[role=dialog] textarea[name="message"], [role=dialog] textarea[id^="message"]')].pop(); const ed = ta && window.tinymce && window.tinymce.get(ta.id); return ed && ed.getContent().length > 20; }, null, {timeout: 20000}).catch(() => {});
                await idle(page);
                picked = t.text; body = await messageContent(page);
            } else { record(`${label}-template-missing`, {template: String(template), templates}); }
        }
        const filled = (await dialogTexts(page)).slice(-1)[0];
        await snap(page, `${label}-form-filled`, {picked, body, text: flat(filled && filled.text, 2500), buttons: filled && filled.buttons, links: filled && filled.links});
        log(`[${label}-form-filled]`, 'template:', JSON.stringify(picked), 'body:', JSON.stringify(body && flat(body.content, 300)));
        let ctl = how === 'ok' ? modal.getByRole('button', {name: 'OK', exact: true}).last() : modal.getByRole('link', {name: /^\s*Cancel\s*$/}).last();
        if (!(await ctl.count())) ctl = how === 'ok' ? modal.getByRole('button', {name: /^(OK|Save)$/}).last() : modal.getByRole('button', {name: /^Cancel$/}).last();
        await loc(page, `${label}: the form's ${how === 'ok' ? '"OK"' : '"Cancel"'}`, ctl);
        await ctl.click(); await idle(page);
        await modal.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const after = await dialogTexts(page);
        const info = await wfInfo(page);
        await snap(page, `${label}-after-${how}`, {info, dialogs: after.map((d) => ({name: d.name, buttons: d.buttons, text: flat(d.text, 600)}))});
        log(`[${label}-after-${how}]`, 'dialogs:', after.length, 'participants:', JSON.stringify(info.participants), 'notice:', JSON.stringify(info.notices.map((n) => n.text)), 'disc:', JSON.stringify(info.discussions));
        return {form: form0, picked, body, info, dialogsAfter: after.length};
    }

    // ---- the header's Tasks panel -----------------------------------------------
    async function tasksPanel(page, label, {deleteAbout} = {}) {
        const bell = page.getByRole('button', {name: /Tasks/}).first();
        if (!(await bell.count())) { record(label, {absent: true}); log(`[${label}] no Tasks button`); return null; }
        const bellLabel = flat(await bell.innerText().catch(() => ''), 60);
        await bell.click();
        const d = page.locator('[role="dialog"]:visible').last();
        await d.waitFor({timeout: 30000}).catch(() => {});
        await d.locator('.pkp_controllers_grid, table').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return x && !/Loading/.test(x.innerText); }, null, {timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(300);
        const readRows = () => d.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => {
            const msg = tr.querySelector('span.message'); const a = tr.querySelector('a'); const task = tr.querySelector('div.task');
            return {id: tr.id, unread: !!(task && task.classList.contains('unread')), sentence: msg ? msg.innerText.trim() : null, title: tr.querySelector('span.submission') ? tr.querySelector('span.submission').innerText.trim() : null, rowText: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 400), href: a ? a.getAttribute('href').replace(/^.*\/index\.php/, '') : null, hasBox: !!tr.querySelector('input[type=checkbox]')};
        })).catch(() => []);
        const rows = await readRows();
        const dlg = (await dialogTexts(page)).slice(-1)[0];
        const out = {bellLabel, rows, title: dlg && dlg.name, controls: dlg && dlg.links, buttons: dlg && dlg.buttons, text: flat(dlg && dlg.text, 2500)};
        await snap(page, label, out);
        log(`[${label}]`, bellLabel, '| rows:', JSON.stringify(rows.map((r) => r.rowText.slice(0, 140))), '| controls:', JSON.stringify(out.controls));
        if (deleteAbout) {
            const row = d.locator('tr.gridRow').filter({hasText: deleteAbout.slice(0, 60)}).first();
            if (await row.count()) {
                const box = row.locator('input[type=checkbox]').first();
                await loc(page, `${label}: the task row's box`, box);
                await box.check();
                let del = d.getByRole('link', {name: 'Delete', exact: true}).first();
                if (!(await del.count())) del = d.getByRole('button', {name: 'Delete', exact: true}).first();
                await loc(page, `${label}: the panel's "Delete"`, del);
                await del.click(); await idle(page);
                await page.waitForTimeout(600);
                const conf = page.locator('[role="dialog"]:visible').last();
                const confText = flat(await conf.innerText().catch(() => ''), 300);
                const ok = conf.getByRole('button', {name: /^(OK|Yes|Delete)$/}).first();
                let confirmed = null;
                if ((await conf.count()) && (await ok.count()) && conf !== d && /sure|delete/i.test(confText) && !(await conf.locator('tr.gridRow').count())) { confirmed = confText; await ok.click(); await idle(page); }
                await page.waitForTimeout(800); await idle(page);
                const rowsAfter = await readRows();
                const s2 = (await dialogTexts(page)).slice(-1)[0];
                await snap(page, `${label}-after-delete`, {rowsAfter, confirmed, text: flat(s2 && s2.text, 1500)});
                log(`[${label}-after-delete]`, 'confirm:', JSON.stringify(confirmed), 'rows:', JSON.stringify(rowsAfter.map((r) => r.rowText.slice(0, 120))));
                out.deleted = {confirmed, rowsAfter};
            } else { record(`${label}-delete-norow`, {deleteAbout, rows}); }
        }
        const close = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return out;
    }

    // ---- files: the legacy select window on "Copyedited Files" (K3's idioms) ----
    async function uploadCopyedited(page, file, label) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        await btns.nth(1).click(); await idle(page);
        await waitWindow(page);
        const win = topWin(page);
        let up = win.getByRole('link', {name: /Upload|Add/}).first();
        if (!(await up.count())) up = win.getByRole('button', {name: /Upload|Add/}).first();
        await up.click(); await idle(page);
        const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        await wiz.waitFor({timeout: 30000});
        await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        const genre = wiz.locator('select[id^="genreId"]');
        if (await genre.count()) {
            const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
            const pick = opts.find((o) => o.value && !/^(Select|Choose)/i.test(o.text));
            if (pick) await genre.selectOption(pick.value);
        }
        await wiz.locator('input[type="file"]').setInputFiles(file);
        await wiz.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000}); await idle(page);
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('tab', {name: /2\./}).waitFor({timeout: 30000}).catch(() => {});
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await topWin(page).locator(`tr:has-text("${path.basename(file)}") input[type=checkbox]:checked`).first().waitFor({timeout: 15000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        let ok = topWin(page).getByRole('button', {name: /^(OK|Save)$/}).last();
        await ok.click(); await idle(page);
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).length <= 1, null, {timeout: 15000}).catch(() => {});
        await page.waitForTimeout(500); await idle(page);
        const info = await wfInfo(page);
        await snap(page, `${label}-after-upload`, {info});
        log(`[${label}-after-upload]`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 500), 'notice (same page):', JSON.stringify(info.notices.map((n) => n.text)));
        return info;
    }
    async function deleteCopyedited(page, rowText, label) {
        const t = table(page, 'Copyedited Files');
        const row = t.locator('tbody tr').filter({hasText: rowText}).first();
        const more = row.getByRole('button', {name: /More Actions/}).first();
        await more.click(); await idle(page);
        const items = await menuItems(page);
        const del = page.getByRole('menuitem', {name: 'Delete', exact: true}).first();
        await del.click(); await idle(page);
        await page.waitForTimeout(600); await idle(page);
        const conf = topWin(page);
        const confText = flat(await conf.innerText().catch(() => ''), 300);
        const ok = conf.getByRole('button', {name: /^(OK|Delete|Yes)$/}).first();
        if (await ok.count()) { await ok.click(); await idle(page); }
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        await snap(page, `${label}-after-delete`, {info, items, confText});
        log(`[${label}-after-delete]`, JSON.stringify(info.tables.map((x) => `${x.name}: ${x.rows.join(' | ')}`)).slice(0, 500), 'notice (same page):', JSON.stringify(info.notices.map((n) => n.text)));
        return info;
    }

    // ---- the decision wizard (K4's idioms) ---------------------------------------
    async function runDecision(page, name, label, opts = {}) {
        const btn = page.getByRole('button', {name, exact: true}).first();
        await loc(page, `${label}: "${name}"`, btn);
        await btn.click(); await idle(page);
        await page.waitForURL(/decision/, {timeout: 30000}).catch(() => {});
        await idle(page);
        const pages = [];
        const readPage = async (n) => {
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page);
            const d = await decisionInfo(page);
            await snap(page, `${label}-page${n}`, {decision: d});
            pages.push({n, steps: d.steps, headings: d.headings, buttons: d.buttons.map((b) => b.text), checkboxes: d.checkboxes, subject: d.subject});
            log(`[${label} page ${n}]`, 'steps:', JSON.stringify(d.steps.map((x) => `${x.text}${x.current ? '*' : ''}`)), 'boxes:', JSON.stringify(d.checkboxes.map((c) => `${c.label}${c.checked ? ' [x]' : ' [ ]'}`)));
            return d;
        };
        let d = await readPage(1);
        if (opts.skipEmail) {
            const skip = page.getByRole('button', {name: /Skip this email/i}).first();
            if (await skip.count()) { await skip.click(); await idle(page); await page.waitForTimeout(500); d = await readPage('1-skipped'); }
        }
        const cont = page.getByRole('button', {name: 'Continue', exact: true});
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        for (let i = 2; i < 8 && !(await rec.isVisible().catch(() => false)); i++) { await cont.first().click(); await idle(page); d = await readPage(i); }
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
            const lt = await leave.innerText().catch(() => '');
            await leave.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
            landed = {pressed: lt.trim(), url: page.url()};
            const info = await wfInfo(page);
            await snap(page, `${label}-recorded-landed`, {landed, info});
            log(`[${label} landed]`, JSON.stringify(landed), 'notice:', JSON.stringify(info.notices.map((n) => n.text)));
        }
        return {pages, done: doneDialogs.map((x) => ({name: x.name, text: flat(x.text, 400)})), landed};
    }

    // ---- the discussion "Add" form (Copyediting Tasks & Discussions) ---------------
    async function addDiscussion(page, title, message, participantRes, label) {
        const panel = page.locator('[data-cy="discussion-manager"]').first();
        await panel.waitFor({timeout: 30000});
        const add = panel.getByRole('button', {name: 'Add', exact: true}).first();
        await loc(page, `${label}: discussions "Add"`, add);
        await add.click(); await idle(page);
        const modal = page.locator('[data-cy="active-modal"]').last();
        await modal.locator('input[name="title"]').waitFor({timeout: 30000});
        await modal.locator('input[name="participants"]').first().waitFor({timeout: 30000});
        const participants = await modal.locator('input[name="participants"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText || null})));
        const dlg = (await dialogTexts(page)).slice(-1)[0];
        await snap(page, `${label}-form`, {participants, title: dlg && dlg.name, text: flat(dlg && dlg.text, 2500)});
        log(`[${label}-form]`, JSON.stringify(dlg && dlg.name), 'participants:', JSON.stringify(participants.map((p) => `${flat(p.label, 40)}${p.checked ? ' [x]' : ' [ ]'}`)));
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
        await snap(page, `${label}-after-save`, {outcome, info, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 400)}))});
        log(`[${label}-after-save]`, outcome, 'disc:', JSON.stringify(info.discussions), 'notice (same page):', JSON.stringify(info.notices.map((n) => n.text)));
        return {outcome, info};
    }

    // ---- OPS: the control read ----------------------------------------------------
    if (isOPS) {
        if (!on('ops')) return;
        if (!sc.contextPath) {
            const t = tag('u32k2');
            const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}];
            const ctx = await app.api.createContext({tag: t, context: {name: `U32 K2 ${t}`, acronym: 'U32K2', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.users = {mgr: `${t}mgr`, au: `${t}au`};
            const s = await app.api.createSubmission({tag: `${t}p`, context: sc.contextPath, submitter: sc.users.au, title: `K2 OPS preprint ${t}`});
            sc.p = s.submissionId; save();
        }
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await sect('ops', async () => {
                await openWorkflow(page, workflow(sc.p), 'ops-mgr-landing');
                await tasksPanel(page, 'ops-mgr-tasks');
                // the "Assign" form's groups and message templates on the one stage a preprint has
                await assignForm(page, {group: /Author|Moderator|Manager/, name: 'Ava Author', search: 'Ava', how: 'cancel'}, 'ops-assign');
            });
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ---- seed ---------------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u32k2');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Section'},
            {username: `${t}se2`, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Second'},
            {username: `${t}ce`, roles: ['copyeditor'], givenName: 'Cora', familyName: 'Quiet'},
            {username: `${t}ce2`, roles: ['copyeditor'], givenName: 'Cato', familyName: 'Mailed'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
        ];
        const ctx = await app.api.createContext({tag: t, context: {name: `U32 K2 ${t}`, acronym: 'U32K2', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]));
        const u = sc.users;
        const se = {username: u.se, role: 'sectionEditor'}, se2 = {username: u.se2, role: 'sectionEditor'};
        const viaReview = isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        const seeds = {
            n1: {title: `K2 N1 notice and task ${t}`, decisions: viaReview, participants: [se, se2]},
            n2: {title: `K2 N2 assign-notice end ${t}`, decisions: viaReview, participants: [se]},
            n3: {title: `K2 N3 discussion only ${t}`, decisions: viaReview, participants: [se]},
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
    if (!u || !S.n1 || !S.n1.id) { log('[k2] no state; run the seed phase first'); return; }
    const N1 = S.n1.id, N2 = S.n2 && S.n2.id, N3 = S.n3 && S.n3.id;

    // ---- base: Rule 3a and "the editor's own" at every permission level on the fresh N1 ----
    if (on('base')) {
        const {page, close} = await launch(app);
        try {
            for (const [who, user, author] of [['se', u.se, false], ['se2', u.se2, false], ['mgr', u.mgr, false], ['admin', 'admin', false], ['ce', u.ce, false], ['au', u.au, true]]) {
                await sect(`base-${who}`, async () => {
                    await signInAs(page, user);
                    await openWorkflow(page, author ? authorWorkflow(N1, 'workflow_4') : workflow(N1, 'workflow_4'), `n1-${who}-0-fresh`);
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- assign: as the assigned editor, "Assign" a Copyeditor with no message (A3); the form's sweep ----
    if (on('assign')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.se);
            await sect('assign-cancel', async () => {
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se-1-before-assign');
                // the sweep: leave the form with a user chosen and nothing saved
                await assignForm(page, {group: /Copyeditor/i, name: 'Cora Quiet', search: 'Cora', how: 'cancel'}, 'n1-se-assign-cancel');
                await noticeNow(page, 'n1-se-1b-after-cancel-samepage');
            });
            await sect('assign-nomessage', async () => {
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se-2-before-assign');
                const r = await assignForm(page, {group: /Copyeditor/i, name: 'Cora Quiet', search: 'Cora', how: 'ok'}, 'n1-se-assign-nomsg');
                sc.assignNoMsg = {participants: r.info.participants, notice: r.info.notices, discussions: r.info.discussions}; save();
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se-3-after-assign-nomsg');
            });
            await sect('assign-reads', async () => {
                await signInAs(page, u.se2);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se2-3-after-assign-nomsg');
                await signInAs(page, u.ce);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-ce-3-after-assign-nomsg');
                await tasksPanel(page, 'n1-ce-3-tasks');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- message: "Assign" ce2 with the "Request Copyedit" message: 3b, the email, the task ----
    // R is the submission that carries the "Request Copyedit" assignment: N1, unless an earlier run assigned ce2 on N1
    // with another template (the OJS run of 2026-09-18 picked "Discussion (Copyediting)"), then N2.
    const R = sc.reqSub || ((sc.assignMsg && sc.assignMsg.template && sc.assignMsg.template !== 'Request Copyedit') ? 'n2' : 'n1');
    if (on('message')) {
        const {page, close} = await launch(app);
        try {
            const RS = S[R].id;
            await sect('message-assign', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(RS, 'workflow_4'), `${R}-se-4-before-assign-msg`);
                const r = await assignForm(page, {group: /Copyeditor/i, name: 'Cato Mailed', search: 'Cato', template: /^Request Copyedit$/, how: 'ok'}, `${R}-se-assign-msg`);
                sc.reqSub = R; sc.reqAssign = {template: r.picked, body: r.body, participants: r.info.participants, notice: r.info.notices, discussions: r.info.discussions}; save();
                await openWorkflow(page, workflow(RS, 'workflow_4'), `${R}-se-5-after-assign-msg`);
            });
            await sect('message-mail', async () => {
                const full = async (m) => { const f = await app.mail.fullMessage(m.ID).catch(() => null); return {id: m.ID, subject: f ? f.Subject : m.Subject, from: f ? f.From : null, to: f ? f.To : null, text: f ? flat(f.Text, 1500) : null}; };
                let found = null;
                try { const m = await app.mail.find({to: mail(u.ce2), contains: S[R].title, timeoutMs: 25000}); found = {found: true, ...(await full(m))}; }
                catch (e) {
                    const list = await app.mail.inboxFor(mail(u.ce2), {timeout: 5000}).catch(() => []);
                    found = {found: false, error: String(e.message).slice(0, 300), inbox: []};
                    for (const m of (list || []).slice(0, 5)) found.inbox.push(await full(m));
                }
                record(`${R}-ce2-mail`, found);
                log(`[${R}-ce2-mail]`, JSON.stringify(found).slice(0, 900));
                // the Copyeditor assigned with no message on N1: no email (the control is ce2's newest mail)
                const control = found.found ? {to: mail(u.ce2), contains: S[R].title} : {to: mail(u.ce2), contains: (found.inbox[0] && found.inbox[0].subject) || 'Copyedit'};
                let none = null;
                try { await app.mail.expectNone({to: mail(u.ce), contains: S.n1.title, afterControl: control}); none = {none: true, control}; }
                catch (e) { none = {none: false, control, error: String(e.message).slice(0, 300)}; }
                const ceInbox = await app.mail.inboxFor(mail(u.ce), {timeout: 3000}).catch(() => []);
                none.ceInboxSubjects = (ceInbox || []).map((m) => m.Subject);
                record('n1-ce-mail-none', none);
                log('[n1-ce-mail-none]', JSON.stringify(none));
            });
            await sect('message-reads', async () => {
                await signInAs(page, u.ce2);
                await openWorkflow(page, workflow(RS, 'workflow_4'), `${R}-ce2-5-after-assign-msg`);
                await tasksPanel(page, `${R}-ce2-5-tasks`);
                if (R === 'n1') { await signInAs(page, u.se2); await openWorkflow(page, workflow(RS, 'workflow_4'), `${R}-se2-5-after-assign-msg`); }
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(RS, 'workflow_4'), `${R}-mgr-5-after-assign-msg`);
                await signInAs(page, u.au);
                await openWorkflow(page, authorWorkflow(RS, 'workflow_4'), `${R}-au-5-after-assign-msg`);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- files: a copyedited file added and removed on N1 (3b end) and N2 (3a end); the task after the upload ----
    if (on('files')) {
        const {page, close} = await launch(app);
        try {
            const md = path.basename(MD);
            await sect('files-n1', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-mgr-6-before-upload');
                await uploadCopyedited(page, MD, 'n1-mgr-6');
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se-6-after-upload');
                await signInAs(page, u.se2);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se2-6-after-upload');
                await signInAs(page, u.ce2);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-ce2-6-after-upload');
                await tasksPanel(page, 'n1-ce2-6-tasks');
                // the removal, by the assigned editor this time (the other permission level on the same control)
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se-7-before-delete');
                await deleteCopyedited(page, md, 'n1-se-7');
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se-7-after-delete');
                await signInAs(page, u.se2);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-se2-7-after-delete');
            });
            await sect('files-n2', async () => {
                if (!N2) return;
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(N2, 'workflow_4'), 'n2-se-0-fresh');
                await uploadCopyedited(page, MD, 'n2-se-1');
                await openWorkflow(page, workflow(N2, 'workflow_4'), 'n2-se-1-after-upload');
                await deleteCopyedited(page, md, 'n2-se-2');
                await openWorkflow(page, workflow(N2, 'workflow_4'), 'n2-se-2-after-delete');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- filesreq: when R is not N1, a copyedited file added on R after the "Request Copyedit" assignment (A4: the task after the upload) ----
    if (on('filesreq') && R !== 'n1') {
        const {page, close} = await launch(app);
        try {
            const RS = S[R].id;
            await sect('filesreq', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(RS, 'workflow_4'), `${R}-mgr-6-before-upload`);
                await uploadCopyedited(page, MD, `${R}-mgr-6`);
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(RS, 'workflow_4'), `${R}-se-6-after-upload`);
                await signInAs(page, u.ce2);
                await openWorkflow(page, workflow(RS, 'workflow_4'), `${R}-ce2-6-after-upload`);
                await tasksPanel(page, `${R}-ce2-6-tasks`);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- decision: "Send To Production" on N1 and N2 (and N4 when N2 carries the request); the task after; the Copyeditor's own delete ----
    if (on('decision')) {
        if (R !== 'n1' && !S.n4) {
            try {
                const viaReview = isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
                const title = `K2 N4 assign-notice end ${sc.tag}`;
                const r = await app.api.createSubmission({tag: `${sc.tag}n4`, context: sc.contextPath, submitter: u.au, title, decisions: viaReview, participants: [{username: u.se, role: 'sectionEditor'}]});
                sc.subs.n4 = {id: r.submissionId, title, stageId: r.stageId}; save();
                log('[seed n4]', r.submissionId);
            } catch (e) { log('[seed n4 FAILED]', String(e.message).slice(0, 400)); }
        }
        const {page, close} = await launch(app);
        try {
            const afterStp = async (k, who) => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-se-8-copyediting-after-stp`);
                await openWorkflow(page, workflow(S[k].id, 'workflow_5'), `${k}-se-8-production-after-stp`);
                if (k === R) {
                    await signInAs(page, u.ce2);
                    await openWorkflow(page, workflow(S[k].id, 'workflow_4'), `${k}-ce2-8-after-stp`);
                    await tasksPanel(page, `${k}-ce2-8-tasks`, {deleteAbout: 'copyedits'});
                    await tasksPanel(page, `${k}-ce2-9-tasks-reopened`);
                }
            };
            await sect('decision-n1', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(N1, 'workflow_4'), 'n1-mgr-8-before-stp');
                record('n1-stp-summary', await runDecision(page, 'Send To Production', 'n1-stp'));
                await afterStp('n1');
            });
            await sect('decision-n2', async () => {
                if (!N2) return;
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(N2, 'workflow_4'), 'n2-se-3-before-stp');
                record('n2-stp-summary', await runDecision(page, 'Send To Production', 'n2-stp', {skipEmail: true}));
                await afterStp('n2');
            });
            await sect('decision-n4', async () => {
                if (!S.n4 || !S.n4.id) return;
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n4.id, 'workflow_4'), 'n4-se-0-fresh');
                record('n4-stp-summary', await runDecision(page, 'Send To Production', 'n4-stp', {skipEmail: true}));
                await afterStp('n4');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- ends: "Send To Production" from a clean 3a (N4) and a clean 3b (N5, a discussion opened by the editor, no file ever added) ----
    if (on('ends')) {
        const viaReview = isOMP ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        const seedOne = async (k, title) => {
            try {
                const r = await app.api.createSubmission({tag: `${sc.tag}${k}`, context: sc.contextPath, submitter: u.au, title, decisions: viaReview, participants: [{username: u.se, role: 'sectionEditor'}]});
                sc.subs[k] = {id: r.submissionId, title, stageId: r.stageId}; save(); log(`[seed ${k}]`, r.submissionId);
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 400)); }
        };
        if (!S.n4) await seedOne('n4', `K2 N4 assign-notice end ${sc.tag}`);
        if (!S.n5) await seedOne('n5', `K2 N5 awaiting end ${sc.tag}`);
        const {page, close} = await launch(app);
        try {
            await sect('ends-n4', async () => {
                if (!S.n4 || !S.n4.id || sc.n4Done) return;
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n4.id, 'workflow_4'), 'n4-se-0-fresh');
                record('n4-stp-summary', await runDecision(page, 'Send To Production', 'n4-stp', {skipEmail: true}));
                await openWorkflow(page, workflow(S.n4.id, 'workflow_4'), 'n4-se-8-copyediting-after-stp');
                await openWorkflow(page, workflow(S.n4.id, 'workflow_5'), 'n4-se-8-production-after-stp');
                sc.n4Done = true; save();
            });
            await sect('ends-n5', async () => {
                if (!S.n5 || !S.n5.id) return;
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n5.id, 'workflow_4'), 'n5-se-0-fresh');
                await addDiscussion(page, `K2 N5 discussion ${sc.tag}`, `Opening message ${sc.tag}`, [/Author|Ava/], 'n5-se-1-discussion');
                await openWorkflow(page, workflow(S.n5.id, 'workflow_4'), 'n5-se-1-after-discussion');
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.n5.id, 'workflow_4'), 'n5-mgr-1-before-stp');
                record('n5-stp-summary', await runDecision(page, 'Send To Production', 'n5-stp'));
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n5.id, 'workflow_4'), 'n5-se-2-copyediting-after-stp');
                await openWorkflow(page, workflow(S.n5.id, 'workflow_5'), 'n5-se-2-production-after-stp');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- n3: a discussion opened with no Copyeditor assigned (A3), then "Move to Review" ----
    if (on('n3') && N3) {
        const {page, close} = await launch(app);
        try {
            await sect('n3-discussion', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(N3, 'workflow_4'), 'n3-se-0-fresh');
                await addDiscussion(page, `K2 N3 discussion ${sc.tag}`, `Opening message ${sc.tag}`, [/Author|Ava/], 'n3-se-1-discussion');
                await openWorkflow(page, workflow(N3, 'workflow_4'), 'n3-se-1-after-discussion');
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(N3, 'workflow_4'), 'n3-mgr-1-after-discussion');
            });
            await sect('n3-move', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(N3, 'workflow_4'), 'n3-mgr-2-before-mtr');
                const r = await runDecision(page, 'Move to Review', 'n3-mtr', {skipEmail: true});
                record('n3-mtr-summary', r);
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(N3, 'workflow_4'), 'n3-se-2-copyediting-after-mtr');
            });
            await signOut(page);
        } finally { await close(); }
    }
});
