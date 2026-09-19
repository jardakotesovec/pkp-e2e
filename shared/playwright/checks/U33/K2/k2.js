// U33 claim check, chunk K2: the notice box, the assignee's tasks and the file
// list on OJS and OMP (OPS as the read-only control). Rule 3 (the notice box,
// 3a–3e), Rule 4 ("Production Ready Files"), Rule 5 (the panels), the side
// effects of assigning with "Ready for Production" / "Index Requested", of a
// discussion, a participant or a galley, and of publishing a monograph; register
// A2, OJS1, OMP1.
// Spec: docs/specs/U33-production-stage.md lines 110–166, 276–297, 469–484, 498–528.
//
// OJS/OMP: one scratch context per app; users mgr, ed, se, le, le2, pr, au (OMP also ix);
// submissions, every one at Production through the skip path (K1: the notice shows on both paths):
//   N1  se assigned                     → 3a as se, none as mgr; Assign le with "Ready for Production" (mail, Tasks, 3b);
//                                         le sends "Galleys Complete" from the Participants row (mail, log, task stays);
//                                         Galleys page: add a galley (3c, task stays), delete it (t1); le deletes the task (A2)
//   N2  se assigned                     → Assign le2 with the message box empty: 3a stands, no mail (OJS1)
//   N3  se assigned                     → a discussion from the panel's "Add" with no Layout Editor: 3b (OJS1, t1)
//   N4  se, le, pr assigned             → Rule 4: the list empty then with files; row menu; Delete (Cancel, OK); downloads;
//                                         the wizard left mid-way; le and pr reads (t4); the notice unchanged
//   N5  {OMP} se, le, ix assigned       → 3d by role (se, mgr, le, au); "Index Requested" → ix's task and mail; "Index Completed";
//                                         publish on screen → "Catalog Management", task stays (A2)
//   N6  published, se assigned          → OJS: no notice once published; OMP: "Catalog Management", then Unpublish → "Awaiting approval."
// OPS: a scratch server (mgr, mod, au), one queued preprint: no notice box, the Assign form's message list (control).
//
//   PROBE_FEATURE=U33 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U33/K2/k2.js
//   PHASES=seed,notice,assign,galleys,files,press,published,ops   (default all; later phases reuse k2-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
const ALL = ['seed', 'notice', 'assign', 'log', 'galleys', 'files', 'press', 'published', 'unpublish5', 'tasklink', 'notes', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

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
        links: [...d.querySelectorAll('a')].filter((a) => a.getClientRects().length).map((a) => a.innerText.trim()).filter(Boolean).slice(0, 40),
    }))).catch(() => []);
// The workflow dialog as data (K1's reader): headings, buttons, tables, the notice box (OJS: a level-3 "Notification"
// heading then the text; OMP: the heading IS the text, so the box is read as the first heading after "Status"/"WORKFLOW"
// that is not a panel title), the discussions rows, the participants' menu buttons, the header line.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
        rowButtons: [...t.querySelectorAll('tbody tr button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).slice(0, 20),
        rowLinks: [...t.querySelectorAll('tbody tr a')].filter(vis).map((a) => ({text: a.innerText.trim(), href: (a.getAttribute('href') || '').replace(/^.*\/index\.php/, '').slice(0, 160)})).slice(0, 20),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const headings = hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const btnEls = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis);
    const buttons = btnEls.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const actionRegion = root.querySelector('[data-cy="workflow-action-items"]');
    const actionButtons = actionRegion ? [...actionRegion.querySelectorAll('button')].filter(vis).map((b) => ({text: b.innerText.trim(), primary: /\bbg-primary\b/.test(b.className), warnable: /negative/.test(b.className)})) : null;
    const byHeading = (re) => { const h = hs.find((x) => re.test(x.innerText.trim())); return h && h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null; };
    const panelTitles = /^(Production Ready Files|Production Tasks & Discussions|PARTICIPANTS|Participants|WORKFLOW: PRODUCTION|Status|Notification|Author|Draft Files|Copyedited Files|Copyediting Tasks & Discussions)$/i;
    const wfIdx = headings.findIndex((h) => /^WORKFLOW:/i.test(h));
    const pressBox = hs.slice(wfIdx >= 0 ? wfIdx + 1 : 0).find((h) => !panelTitles.test(h.innerText.trim()) && /\.$|Management$/.test(h.innerText.trim()));
    const notice = byHeading(/^Notification$/i);
    const noticeBox = notice ? {heading: 'Notification', text: notice} : (pressBox ? {heading: pressBox.innerText.trim(), text: pressBox.nextElementSibling ? pressBox.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null} : null);
    const discussions = [...root.querySelectorAll('[data-cy="discussion-manager"] tbody tr, [data-cy="discussion-manager"] li')].filter(vis).map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200));
    const participants = [...root.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter((t) => /More Actions$/.test(t));
    const lines = (dlgs[0] ? dlgs[0].innerText : '').split('\n').map((l) => l.trim()).filter(Boolean);
    const closeAt = lines.indexOf('Close');
    const header = dlgs[0] ? lines.slice(closeAt >= 0 ? closeAt + 1 : 0, (closeAt >= 0 ? closeAt + 1 : 0) + 6).join(' | ') : null;
    const descriptions = hs.map((h) => ({h: h.innerText.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 200) : null})).filter((x) => /Files|Discussions|Participants|Notification|Status|Awaiting|Catalog/i.test(x.h)).slice(0, 12);
    return {url: location.href, dialogCount: dlgs.length, headings, buttons, actionButtons, tables, notice, noticeBox, status: byHeading(/^Status$/i), discussions, participants, header, descriptions};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const selectOptions = (sel) => sel.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected}))).catch(() => []);
const messageContent = (page) => page.evaluate(() => {
    const ta = [...document.querySelectorAll('[role=dialog] textarea[name="message"], [role=dialog] textarea[id^="message"]')].pop();
    if (!ta) return {present: false};
    const ed = window.tinymce && window.tinymce.get(ta.id);
    return {present: true, id: ta.id, editor: !!ed, content: ed ? ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 1500) : ta.value.slice(0, 1500)};
}).catch((e) => ({error: String(e.message)}));
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
async function closeTop(page) {
    const top = topWin(page);
    const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
    if (await c.count()) { await c.click({timeout: 5000}).catch(() => {}); await idle(page); await page.waitForTimeout(400); }
}
async function waitTopForm(page, selector) {
    await topWin(page).waitFor({timeout: 30000});
    await page.waitForFunction((sel) => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector(sel); }, selector, {timeout: 20000}).catch(() => {});
    await idle(page);
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
    const mailOf = (u) => `${u}@mail.test`;

    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 1500)})), ...(extra || {})});
        log(`[${label}]`, app.name, 'header:', flat(info.header, 90), '| notice:', JSON.stringify(info.noticeBox), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)), '| disc:', JSON.stringify((info.discussions || []).filter((d) => !/^(Yet to begin|In progress|Closed|No Items)/.test(d))), '| part:', JSON.stringify(info.participants));
        return {info, dialogs, s, url: page.url()};
    }
    // Re-read the notice box without leaving the page (the same-page state) and after a re-landing.
    async function noticeNow(page, id, label) {
        const same = await wfInfo(page).catch(() => ({}));
        record(`${label}-samepage`, {noticeBox: same.noticeBox, discussions: same.discussions, participants: same.participants, tables: (same.tables || []).map((t) => ({name: t.name, rows: t.rows}))});
        const r = await openWorkflow(page, workflow(id, 'workflow_5'), `${label}-relanded`);
        return {samePage: same.noticeBox, relanded: r.info.noticeBox, discussions: r.info.discussions, participants: r.info.participants};
    }
    // The legacy three-step upload wizard (already open, possibly under another title).
    async function driveWizard(page, file, label, {stopAfterStep} = {}) {
        const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        await wiz.waitFor({timeout: 30000});
        await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        await idle(page);
        const w0 = (await dialogTexts(page)).slice(-1)[0];
        const steps = await wiz.locator('[role=tab], .ui-tabs-nav li, .pkp_controllers_wizard li').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
        record(`${label}-wizard-open`, {title: w0 && w0.name, steps, text: flat(w0 && w0.text, 800), buttons: w0 && w0.buttons});
        log(`[${label} wizard]`, JSON.stringify(w0 && w0.name), JSON.stringify(steps));
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
        if (stopAfterStep === 1) return {stopped: 1};
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        const w2 = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-wizard-step2`, {title: w2 && w2.name, text: flat(w2 && w2.text, 600), buttons: w2 && w2.buttons});
        if (stopAfterStep === 2) return {stopped: 2};
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        const w3 = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-wizard-step3`, {title: w3 && w3.name, text: flat(w3 && w3.text, 600), buttons: w3 && w3.buttons});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        return {done: true};
    }
    // "Upload" above the Vue "Production Ready Files" list.
    async function uploadProductionReady(page, file, label, opts) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const up = dlg.getByRole('button', {name: 'Upload', exact: true}).first();
        await loc(page, `${label}: "Upload" above Production Ready Files`, up);
        await up.click(); await idle(page);
        const r = await driveWizard(page, file, label, opts);
        if (r.stopped) return r;
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables, noticeBox: info.noticeBox, buttons: info.buttons});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 500), '| notice:', JSON.stringify(info.noticeBox));
        return info;
    }
    // The Participants panel's "Assign" form: record the lists, pick a group/user, optionally a template, then OK or Cancel.
    async function assignForm(page, label, {group, user, template, how = 'ok'} = {}) {
        const assign = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /^Assign$/}).first();
        if (!(await assign.count())) { record(`${label}-assign`, {absent: true}); log(`[${label}] no Assign button`); return {absent: true}; }
        await loc(page, `${label}: Participants "Assign"`, assign);
        await assign.click(); await idle(page);
        const form = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        await form.waitFor({timeout: 30000});
        await idle(page);
        const sel = form.locator('select[name="filterUserGroupId"]');
        const groups = await selectOptions(sel);
        const top = (await dialogTexts(page)).slice(-1)[0];
        const tsel = form.locator('select[name="template"]');
        const templates = (await tsel.count()) ? await selectOptions(tsel) : null;
        const out = {title: top && top.name, groups: groups.map((g) => g.text), templates: templates && templates.map((t) => t.text), message0: await messageContent(page), text: flat(top && top.text, 800)};
        if (group) {
            const g = groups.find((o) => (group instanceof RegExp ? group.test(o.text) : o.text === group));
            if (!g) record(`${label}-group-missing`, {group: String(group), groups});
            else { await sel.selectOption(g.value); await idle(page); }
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
            else record(`${label}-user-missing`, {user, radios});
            if (template && templates) {
                const t = templates.find((o) => (template instanceof RegExp ? template.test(o.text) : o.text === template));
                if (t) {
                    await tsel.selectOption(t.value); await idle(page);
                    const id = await form.locator('textarea[name="message"]').getAttribute('id').catch(() => null);
                    await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).getContent().length > 20, id, {timeout: 20000}).catch(() => {});
                    out.picked = t.text; out.message = await messageContent(page);
                } else record(`${label}-template-missing`, {template: String(template), templates});
            } else if (template === null) {
                out.picked = null; out.message = await messageContent(page);   // the box left as it is (empty)
            }
        }
        const filled = (await dialogTexts(page)).slice(-1)[0];
        out.filledText = flat(filled && filled.text, 1200); out.buttons = filled && filled.buttons; out.links = filled && filled.links;
        record(`${label}-assign-form`, out);
        await shot(page, `${label}-assign-form`).catch(() => {});
        log(`[${label} assign]`, JSON.stringify(out.groups), '| templates:', JSON.stringify(out.templates), '| picked:', JSON.stringify(out.picked), '| msg:', flat(out.message && out.message.content, 120));
        let ctl = how === 'ok' ? form.getByRole('button', {name: 'OK', exact: true}).last() : form.getByRole('link', {name: /^\s*Cancel\s*$/}).last();
        if (!(await ctl.count())) ctl = how === 'ok' ? form.getByRole('button', {name: /^(OK|Save)$/}).last() : form.getByRole('button', {name: /^Cancel$/}).last();
        await ctl.click(); await idle(page);
        await form.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const after = await dialogTexts(page);
        const info = await wfInfo(page);
        out.after = {dialogs: after.map((d) => ({name: d.name, text: flat(d.text, 400)})), participants: info.participants, noticeBox: info.noticeBox, discussions: info.discussions};
        record(`${label}-assign-after-${how}`, out.after);
        log(`[${label} assign after ${how}]`, 'dialogs:', after.length, '| participants:', JSON.stringify(info.participants), '| notice (same page):', JSON.stringify(info.noticeBox));
        return out;
    }
    // The Participants row's menu → "Notify": the legacy notify window with the template list and the message box.
    async function notifyFromRow(page, name, template, label, {how = 'ok'} = {}) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const more = dlg.getByRole('button', {name: new RegExp(`^${name}.*More Actions$`)}).first();
        if (!(await more.count())) { record(`${label}-notify`, {rowAbsent: name, participants: (await wfInfo(page)).participants}); log(`[${label}] no row for ${name}`); return {absent: true}; }
        await loc(page, `${label}: Participants row "${name}" menu`, more);
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-row-menu`, {name, items});
        const notify = page.getByRole('menuitem', {name: /^Notify/}).first();
        if (!(await notify.count())) { await more.click().catch(() => {}); return {items, notifyAbsent: true}; }
        await notify.click(); await idle(page);
        await waitTopForm(page, 'select[name="template"], textarea[name="message"]');
        const form = topWin(page);
        const tsel = form.locator('select[name="template"]');
        const templates = (await tsel.count()) ? await selectOptions(tsel) : null;
        const top = (await dialogTexts(page)).slice(-1)[0];
        const out = {items, title: top && top.name, templates: templates && templates.map((t) => t.text), text: flat(top && top.text, 1200), buttons: top && top.buttons, links: top && top.links};
        if (template && templates) {
            const t = templates.find((o) => (template instanceof RegExp ? template.test(o.text) : o.text === template));
            if (t) {
                await tsel.selectOption(t.value); await idle(page);
                const id = await form.locator('textarea[name="message"]').getAttribute('id').catch(() => null);
                await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).getContent().length > 20, id, {timeout: 20000}).catch(() => {});
                out.picked = t.text; out.message = await messageContent(page);
            } else record(`${label}-notify-template-missing`, {template: String(template), templates});
        }
        record(`${label}-notify-form`, out);
        await shot(page, `${label}-notify-form`).catch(() => {});
        log(`[${label} notify]`, JSON.stringify(out.title), '| templates:', JSON.stringify(out.templates), '| picked:', JSON.stringify(out.picked));
        let ctl = how === 'ok' ? form.getByRole('button', {name: /^(OK|Send|Notify)$/}).last() : form.getByRole('link', {name: /^\s*Cancel\s*$/}).last();
        if (!(await ctl.count())) ctl = form.locator('button[type=submit], input[type=submit]').last();
        out.pressed = flat(await ctl.innerText().catch(() => ''), 40) || 'submit';
        await ctl.click(); await idle(page);
        await form.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        out.after = {dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)})), noticeBox: info.noticeBox, discussions: info.discussions};
        record(`${label}-notify-after`, out.after);
        return out;
    }
    // The header's Tasks panel (U32 K2's reader), optionally deleting the row that matches.
    async function tasksPanel(page, label, {deleteAbout} = {}) {
        const bell = page.getByRole('button', {name: /Tasks/}).first();
        if (!(await bell.count())) { record(label, {absent: true}); log(`[${label}] no Tasks button`); return null; }
        const bellLabel = flat(await bell.innerText().catch(() => ''), 60);
        await bell.click();
        const d = page.locator('[role="dialog"]:visible').last();
        await d.waitFor({timeout: 30000}).catch(() => {});
        await d.locator('.pkp_controllers_grid, table').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return x && !/Loading/.test(x.innerText); }, null, {timeout: 15000}).catch(() => {});
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
                if ((await conf.count()) && (await ok.count()) && /sure|delete/i.test(confText) && !(await conf.locator('tr.gridRow').count())) { confirmed = confText; await ok.click(); await idle(page); }
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
    // The discussions panel's "Add" (U32 K2's driver): title, one more participant, message, Save.
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
        await snap(page, `${label}-form`, {participants, title: dlg && dlg.name, text: flat(dlg && dlg.text, 2000)});
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
        log(`[${label}-after-save]`, outcome, '| disc:', JSON.stringify(info.discussions.filter((d) => !/^(Yet to begin|In progress|Closed|No Items)/.test(d))), '| notice (same page):', JSON.stringify(info.noticeBox));
        return {outcome, info};
    }
    // The header's "Activity Log" window: the rows.
    async function activityLog(page, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const btn = dlg.getByRole('button', {name: /^Activity Log$/}).first();
        if (!(await btn.count())) { record(`${label}-activity-log`, {absent: true}); return null; }
        await btn.click(); await idle(page);
        await waitTopForm(page, 'table, .pkp_controllers_grid, tr');
        await page.waitForTimeout(500); await idle(page);
        const top = (await dialogTexts(page)).slice(-1)[0];
        const rows = await topWin(page).locator('tr.gridRow, tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 240))).catch(() => []);
        const out = {title: top && top.name, rows, text: flat(top && top.text, 2500)};
        await snap(page, `${label}-activity-log`, out);
        log(`[${label} activity log]`, JSON.stringify(rows.slice(0, 8)));
        await closeTop(page);
        return out;
    }
    // The mail: the newest message to `to` mentioning `contains`.
    async function readMail(to, contains, label, timeoutMs = 25000) {
        let out;
        try {
            const m = await app.mail.find({to, contains, timeoutMs});
            const f = await app.mail.fullMessage(m.ID).catch(() => null);
            const text = f ? String(f.Text || '') : '';
            const links = f ? [...String(f.HTML || '').matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/^.*\/index\.php/, '').slice(0, 200)) : [];
            out = {found: true, id: m.ID, subject: f ? f.Subject : m.Subject, from: f ? f.From : null, to: f ? f.To : null, text: flat(text, 2500), tail: flat(text.slice(-500), 500), links};
        } catch (e) { out = {found: false, error: String(e.message).slice(0, 300)}; }
        record(`${label}-mail`, out);
        log(`[${label} mail]`, JSON.stringify({found: out.found, subject: out.subject, from: out.from, tail: flat(out.tail, 200)}));
        return out;
    }
    // A download triggered by a click: the suggested file name.
    async function download(page, locator, label) {
        const dl = page.waitForEvent('download', {timeout: 30000}).catch(() => null);
        await locator.click();
        const d = await dl;
        const out = d ? {fileName: d.suggestedFilename(), url: d.url().replace(/^.*\/index\.php/, '').slice(0, 200)} : {noDownload: true, url: page.url(), dialogs: (await dialogTexts(page)).map((x) => x.name)};
        if (d) await d.cancel().catch(() => {});
        record(`${label}-download`, out);
        log(`[${label} download]`, JSON.stringify(out));
        return out;
    }
    // The first row of the named table whose text matches: its menu's entries, then one entry pressed.
    async function rowMenu(page, tableName, rowText, label, {press} = {}) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const table = dlg.getByRole('table', {name: tableName}).first();
        if (!(await table.count())) { record(`${label}-rowmenu`, {table: 'absent'}); return {table: 'absent'}; }
        const row = rowText ? table.locator('tbody tr').filter({hasText: rowText}).first() : table.locator('tbody tr').first();
        const btn = row.locator('button').first();
        if (!(await btn.count())) { record(`${label}-rowmenu`, {rowButton: 'absent', rows: await table.locator('tbody tr').allInnerTexts()}); return {rowButton: 'absent'}; }
        const name = await btn.getAttribute('aria-label').catch(() => null) || flat(await btn.innerText(), 60);
        await btn.click(); await idle(page);
        const items = await menuItems(page);
        const out = {button: name, items};
        log(`[${label} row menu]`, JSON.stringify(items.map((i) => i.text)));
        if (press) {
            const it = page.getByRole('menuitem', {name: press}).first();
            if (await it.count()) {
                await it.click(); await idle(page);
                await page.waitForTimeout(600); await idle(page);
                await waitTopForm(page, 'form, table, p, .pkp_modal_panel, [class*=modal]').catch(() => {});
                const top = (await dialogTexts(page)).slice(-1)[0];
                out.opened = {title: top && top.name, text: flat(top && top.text, 1200), buttons: top && top.buttons, links: top && top.links};
                await snap(page, `${label}-${String(press).replace(/[^a-z]+/gi, '-').toLowerCase()}`, out.opened);
                log(`[${label} ${press}]`, JSON.stringify(out.opened && out.opened.title), '|', flat(out.opened && out.opened.text, 200));
            } else out.pressMissing = String(press);
        } else { await btn.click().catch(() => {}); await page.waitForTimeout(200); }
        record(`${label}-rowmenu`, out);
        return out;
    }
    // The publication's Galleys page from the workflow: the side menu's "Galleys".
    async function openGalleys(page, id, label) {
        const r = await openWorkflow(page, workflow(id, `publication_${id}_galleys`), `${label}-galleys`);
        const dlg = page.locator('[role="dialog"]:visible').first();
        const gm = await dlg.evaluate((d) => {
            const vis = (e) => e.getClientRects().length > 0;
            const heads = [...d.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((h) => h.innerText.trim());
            const tables = [...d.querySelectorAll('table')].filter(vis).map((t) => ({name: t.getAttribute('aria-label') || null, columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()), rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))}));
            const buttons = [...d.querySelectorAll('button')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 60);
            return {heads: heads.slice(0, 20), tables, buttons};
        }).catch(() => null);
        record(`${label}-galleys-page`, gm);
        log(`[${label} galleys]`, JSON.stringify(gm && gm.heads.slice(0, 6)), '| tables:', JSON.stringify(gm && gm.tables.map((t) => `${t.name}:${t.rows.join('|')}`)), '| buttons:', JSON.stringify(gm && gm.buttons.filter((b) => /galley|Add|Publish|Schedule/i.test(b))));
        return {r, gm};
    }
    async function addGalley(page, id, labelName, file, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const add = dlg.getByRole('button', {name: /^Add galley$/i}).first();
        if (!(await add.count())) { record(`${label}-addgalley`, {absent: true, buttons: (await wfInfo(page)).buttons}); return {absent: true}; }
        await loc(page, `${label}: "Add galley"`, add);
        await add.click(); await idle(page);
        await waitTopForm(page, 'input[name="label"]');
        const form = topWin(page);
        const top = (await dialogTexts(page)).slice(-1)[0];
        const out = {title: top && top.name, text: flat(top && top.text, 800), buttons: top && top.buttons};
        await form.locator('input[name="label"]').fill(labelName);
        const lang = form.locator('select[name="galleyLocale"], select[name="locale"]').first();
        if (await lang.count()) out.locales = (await selectOptions(lang)).map((o) => o.text);
        const save = form.getByRole('button', {name: /^(Save|OK)$/}).last();
        await save.click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        // the upload wizard for the galley's file opens next
        const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        const hasWiz = await wiz.count();
        out.wizardOpened = !!hasWiz;
        if (hasWiz) { out.wizard = await driveWizard(page, file, `${label}-galleyfile`); }
        await page.waitForTimeout(800); await idle(page);
        const after = await dlg.evaluate((d) => [...d.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({name: t.getAttribute('aria-label') || null, rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))}))).catch(() => null);
        out.after = {tables: after, dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)}))};
        record(`${label}-addgalley`, out);
        await snap(page, `${label}-addgalley-after`);
        log(`[${label} add galley]`, JSON.stringify(out.title), '| wizard:', out.wizardOpened, '| after:', JSON.stringify(after));
        return out;
    }
    async function deleteGalley(page, labelName, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const row = dlg.locator('tbody tr').filter({hasText: labelName}).first();
        if (!(await row.count())) { record(`${label}-delgalley`, {rowAbsent: true}); return {absent: true}; }
        const btn = row.locator('button').filter({hasText: /More Actions|Options/}).first();
        const b = (await btn.count()) ? btn : row.locator('button').last();
        await b.click(); await idle(page);
        const items = await menuItems(page);
        const del = page.getByRole('menuitem', {name: /^Delete$/}).first();
        const out = {items};
        if (!(await del.count())) { record(`${label}-delgalley`, {items, deleteAbsent: true}); return out; }
        await del.click(); await idle(page); await page.waitForTimeout(500);
        const conf = (await dialogTexts(page)).slice(-1)[0];
        out.dialog = {title: conf && conf.name, text: flat(conf && conf.text, 400), buttons: conf && conf.buttons};
        const ok = topWin(page).getByRole('button', {name: /^(OK|Yes|Delete|Confirm)$/}).first();
        if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); }
        out.after = await dlg.evaluate((d) => [...d.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({name: t.getAttribute('aria-label') || null, rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))}))).catch(() => null);
        record(`${label}-delgalley`, out);
        log(`[${label} delete galley]`, JSON.stringify(out.dialog), '| after:', JSON.stringify(out.after));
        return out;
    }
    // Publish / Unpublish from the Title & Abstract page (the shortcut's landing).
    async function publishOnScreen(page, id, label, {action = 'Publish'} = {}) {
        await openWorkflow(page, workflow(id, `publication_${id}_titleAbstract`), `${label}-titleabstract`);
        const dlg = page.locator('[role="dialog"]:visible').first();
        await page.waitForFunction((a) => [...document.querySelectorAll('[role=dialog] button')].some((b) => b.innerText.trim() === a && b.getClientRects().length), action, {timeout: 20000}).catch(() => {});
        const btn = dlg.getByRole('button', {name: action, exact: true}).first();
        const out = {action, present: await btn.count()};
        if (!out.present) { record(`${label}-${action.toLowerCase()}`, {...out, buttons: (await wfInfo(page)).buttons}); log(`[${label}] no ${action} button`); return out; }
        await loc(page, `${label}: "${action}"`, btn);
        await btn.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
        const conf = (await dialogTexts(page)).slice(-1)[0];
        out.dialog = {title: conf && conf.name, text: flat(conf && conf.text, 1500), buttons: conf && conf.buttons};
        await snap(page, `${label}-${action.toLowerCase()}-dialog`, out.dialog);
        const go = topWin(page).getByRole('button', {name: action, exact: true}).last();
        if (await go.count()) {
            const resp = page.waitForResponse((r) => /\/(publish|unpublish)\b/.test(r.url()), {timeout: 30000}).catch(() => null);
            await go.click();
            const r = await resp; out.response = r ? {url: r.url().replace(/^.*\/index\.php/, ''), status: r.status()} : null;
            await idle(page); await page.waitForTimeout(1000); await idle(page);
        } else out.noConfirmControl = true;
        out.after = {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 300)})), buttons: (await wfInfo(page)).buttons.slice(0, 30)};
        record(`${label}-${action.toLowerCase()}`, out);
        log(`[${label} ${action}]`, JSON.stringify(out.dialog && out.dialog.title), '|', flat(out.dialog && out.dialog.text, 200), '| resp:', JSON.stringify(out.response));
        return out;
    }

    // ---- OPS: the read-only control -----------------------------------------------
    if (isOPS) {
        if (!on('ops')) return;
        if (!sc.contextPath) {
            const t = tag('u33k2');
            const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['mod', 'sectionEditor', 'Mo', 'Moderator'], ['au', 'author', 'Ava', 'Author']];
            const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
            const ctx = await app.api.createContext({tag: t, context: {name: `U33 K2 ${t}`, acronym: 'U33K2', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`])); sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
            const r = await app.api.createSubmission({tag: `${t}q1`, context: sc.contextPath, submitter: sc.users.au, title: `K2 Q1 queued ${t}`, participants: [{username: sc.users.mod, role: 'sectionEditor'}]});
            sc.subs = {q1: {id: r.submissionId, title: `K2 Q1 queued ${t}`}};
            save(); record('seed', sc);
        }
        const u = sc.users; const S = sc.subs;
        const {page, close} = await launch(app);
        try {
            const summary = {};
            for (const k of ['mgr', 'mod']) await sect(`ops ${k}`, async () => {
                await signInAs(page, u[k]);
                const r = await openWorkflow(page, workflow(S.q1.id, 'workflow_5'), `q1-${k}-workflow_5`);
                summary[k] = {noticeBox: r.info.noticeBox, headings: r.info.headings, tables: r.info.tables.map((t) => t.name), participants: r.info.participants};
                if (k === 'mgr') summary[k].assign = await assignForm(page, `q1-${k}`, {how: 'cancel'});
            });
            await sect('ops author', async () => {
                await signInAs(page, u.au);
                const r = await openWorkflow(page, authorWorkflow(S.q1.id, 'workflow_5'), 'q1-au-workflow_5');
                summary.au = {url: r.url, noticeBox: r.info.noticeBox, headings: r.info.headings};
            });
            record('ops-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
        return;
    }

    // ---- seed (OJS / OMP) ---------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u33k2');
        const roleUsers = [
            ['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Edda', 'Editor'], ['se', 'sectionEditor', 'Sid', 'Section'],
            ['le', 'layoutEditor', 'Leo', 'Layout'], ['le2', 'layoutEditor', 'Lena', 'Layouttwo'], ['pr', 'proofreader', 'Pia', 'Proof'],
            ['au', 'author', 'Ava', 'Author'], ...(isOMP ? [['ix', 'indexer', 'Ida', 'Indexer']] : []),
        ];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U33 K2 ${t}`, acronym: 'U33K2', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.roleKeys = Object.fromEntries(roleUsers.map(([k, role]) => [k, role]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        const u = sc.users;
        const part = (k) => ({username: u[k], role: sc.roleKeys[k]});
        const toProd = ['skipExternalReview', 'sendToProduction'];
        const seeds = {
            n1: {title: `K2 N1 notice ${t}`, decisions: toProd, participants: [part('se')]},
            n2: {title: `K2 N2 empty message ${t}`, decisions: toProd, participants: [part('se')]},
            n3: {title: `K2 N3 discussion only ${t}`, decisions: toProd, participants: [part('se')]},
            n4: {title: `K2 N4 files ${t}`, decisions: toProd, participants: [part('se'), part('le'), part('pr')]},
            ...(isOMP ? {n5: {title: `K2 N5 press notice ${t}`, decisions: toProd, participants: [part('se'), part('le'), part('ix')]}} : {}),
            n6: {title: `K2 N6 published ${t}`, decisions: toProd, published: true, participants: [part('se')]},
        };
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, publicationId: r.publicationId, title: spec.title, stageId: r.stageId, status: r.status}; log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'status', r.status); }
            catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
        }
        save(); record('seed', sc);
    }
    const u = sc.users; const S = sc.subs || {}; const N = sc.names || {};
    if (!u) { log('[k2] no state; run the seed phase first'); return; }

    // ---- notice: 3a as se, none as mgr / le; N2 the empty-message assignment (OJS1); N3 a discussion alone ----
    if (on('notice')) {
        const {page, close} = await launch(app);
        try {
            const summary = {};
            await sect('n1 reads', async () => {
                await signInAs(page, u.se);
                const r = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-se-1-initial');
                summary.n1se = {noticeBox: r.info.noticeBox, headings: r.info.headings, descriptions: r.info.descriptions};
                await signInAs(page, u.mgr);
                const r2 = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-mgr-1-initial');
                summary.n1mgr = {noticeBox: r2.info.noticeBox, headings: r2.info.headings};
                await signInAs(page, u.ed);
                const r3 = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-ed-1-initial');
                summary.n1ed = {noticeBox: r3.info.noticeBox};
                await signInAs(page, u.au);
                const r4 = await openWorkflow(page, authorWorkflow(S.n1.id, 'workflow_5'), 'n1-au-1-initial');
                summary.n1au = {noticeBox: r4.info.noticeBox, headings: r4.info.headings, url: r4.url};
            });
            // N2: le2 assigned with the message box left empty (no template chosen)
            await sect('n2 empty-message assign', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n2.id, 'workflow_5'), 'n2-se-1-before');
                const a = await assignForm(page, 'n2-se', {group: /Layout Editor/i, user: N.le2, template: null, how: 'ok'});
                summary.n2assign = {picked: a.picked, message: a.message, after: a.after};
                summary.n2notice = await noticeNow(page, S.n2.id, 'n2-se-2-after-empty-assign');
                await signInAs(page, u.mgr);
                const r = await openWorkflow(page, workflow(S.n2.id, 'workflow_5'), 'n2-mgr-2-after-empty-assign');
                summary.n2mgr = {noticeBox: r.info.noticeBox, participants: r.info.participants};
                await signInAs(page, u.le2);
                const r2 = await openWorkflow(page, workflow(S.n2.id, 'workflow_5'), 'n2-le2-2-after-empty-assign');
                summary.n2le2 = {noticeBox: r2.info.noticeBox, headings: r2.info.headings, buttons: r2.info.buttons.filter((b) => /Upload|Assign|Add|Schedule|Move/.test(b))};
                summary.n2le2tasks = await tasksPanel(page, 'n2-le2-tasks');
            });
            // N3: a discussion from the panel with the author, no Layout Editor
            await sect('n3 discussion only', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n3.id, 'workflow_5'), 'n3-se-1-before');
                const d = await addDiscussion(page, `K2 N3 discussion ${sc.tag}`, `Opening message ${sc.tag}`, [/Author|Ava/], 'n3-se-discussion');
                summary.n3discussion = {outcome: d.outcome, discussions: d.info.discussions, noticeSamePage: d.info.noticeBox};
                summary.n3notice = await noticeNow(page, S.n3.id, 'n3-se-2-after-discussion');
                await signInAs(page, u.mgr);
                const r = await openWorkflow(page, workflow(S.n3.id, 'workflow_5'), 'n3-mgr-2-after-discussion');
                summary.n3mgr = {noticeBox: r.info.noticeBox};
            });
            record('notice-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- assign: N1 "Ready for Production" to le (mail, Tasks, 3b); "Galleys Complete" back (mail, log, task stays) ----
    if (on('assign')) {
        const {page, close} = await launch(app);
        try {
            const summary = {};
            await sect('n1 ready for production', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-se-2-before-assign');
                const a = await assignForm(page, 'n1-se', {group: /Layout Editor/i, user: N.le, template: 'Ready for Production', how: 'ok'});
                summary.assign = {picked: a.picked, message: a.message, after: a.after, templates: a.templates, groups: a.groups};
                sc.n1Assigned = true; save();
                summary.notice = await noticeNow(page, S.n1.id, 'n1-se-3-after-assign');
                await signInAs(page, u.mgr);
                const r = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-mgr-3-after-assign');
                summary.mgrNotice = r.info.noticeBox;
            });
            await sect('n1 le mail and tasks', async () => {
                summary.leMail = await readMail(mailOf(u.le), S.n1.title, 'n1-le-ready');
                // N2's le2 got no mail: the control is N1's mail to le, which was sent after N2's assignment
                let none;
                try { await app.mail.expectNone({to: mailOf(u.le2), contains: S.n2.title, afterControl: {to: mailOf(u.le), contains: S.n1.title}}); none = {none: true}; }
                catch (e) { none = {none: false, error: String(e.message).slice(0, 300)}; }
                const le2Inbox = await app.mail.inboxFor(mailOf(u.le2), {timeout: 3000}).catch(() => []);
                summary.le2NoMail = {...none, inbox: (le2Inbox || []).map((m) => m.Subject).slice(0, 10)};
                record('n2-le2-nomail', summary.le2NoMail);
                await signInAs(page, u.le);
                const r = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-le-3-after-assign');
                summary.leEntry = {noticeBox: r.info.noticeBox, headings: r.info.headings, participants: r.info.participants, discussions: r.info.discussions, buttons: r.info.buttons.filter((b) => /Upload|Assign|Add|Schedule|Move|Download/.test(b))};
                summary.leTasks = await tasksPanel(page, 'n1-le-tasks-after-assign');
                if (summary.leTasks && summary.leTasks.rows.length) {
                    const task = summary.leTasks.rows.find((x) => /asked to review layouts/i.test(x.rowText));
                    if (task && task.href) {
                        await page.goto(app.url(`/index.php${task.href}`)).catch(() => {}); await idle(page); await page.waitForTimeout(800); await idle(page);
                        const info = await wfInfo(page).catch(() => ({}));
                        await snap(page, 'n1-le-task-link-landed', {info});
                        summary.taskLink = {href: task.href, landedUrl: page.url(), header: flat(info.header, 100), headings: info.headings};
                    }
                }
            });
            await sect('n1 galleys complete', async () => {
                await signInAs(page, u.le);
                await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-le-4-before-complete');
                const n = await notifyFromRow(page, N.se, 'Galleys Complete', 'n1-le-complete');
                summary.complete = {items: n.items, title: n.title, templates: n.templates, picked: n.picked, message: n.message, pressed: n.pressed, after: n.after};
                summary.completeMail = await readMail(mailOf(u.se), S.n1.title, 'n1-se-complete');
                summary.leTasksAfterComplete = await tasksPanel(page, 'n1-le-tasks-after-complete');
                await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-le-5-after-complete');
                summary.leHeaderButtons = (await wfInfo(page)).buttons.slice(0, 12);
                await signInAs(page, u.se);
                const r = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-se-5-after-complete');
                summary.seAfterComplete = {noticeBox: r.info.noticeBox, discussions: r.info.discussions};
                summary.log = await activityLog(page, 'n1-se-5');
                summary.seTasks = await tasksPanel(page, 'n1-se-tasks-after-complete');
            });
            record('assign-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- log: the Activity Log as the assigned editor (the assistants' header has no "Activity Log") ----
    if (on('log')) {
        const {page, close} = await launch(app);
        try {
            await sect('n1 log', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-se-log-reland');
                record('log-n1', await activityLog(page, 'n1-se-log'));
            });
            if (isOMP && S.n5) await sect('n5 log', async () => {
                await openWorkflow(page, workflow(S.n5.id, 'workflow_5'), 'n5-se-log-reland');
                record('log-n5', await activityLog(page, 'n5-se-log'));
            });
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- galleys: N1 add a galley (3c; the task stays), delete it (t1); le deletes the task (A2) ----
    if (on('galleys') && !isOMP) {
        const {page, close} = await launch(app);
        try {
            const summary = {};
            await sect('n1 add galley', async () => {
                await signInAs(page, u.se);
                const g = await openGalleys(page, S.n1.id, 'n1-se-6');
                summary.galleysPage = g.gm;
                summary.added = await addGalley(page, S.n1.id, `K2 galley ${sc.tag}`, PDF, 'n1-se-6');
                summary.noticeAfterGalley = await noticeNow(page, S.n1.id, 'n1-se-7-after-galley');
                await signInAs(page, u.mgr);
                const r = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-mgr-7-after-galley');
                summary.mgrAfterGalley = r.info.noticeBox;
                await signInAs(page, u.le);
                summary.leTasksAfterGalley = await tasksPanel(page, 'n1-le-tasks-after-galley');
            });
            await sect('n1 delete galley', async () => {
                await signInAs(page, u.se);
                await openGalleys(page, S.n1.id, 'n1-se-8');
                summary.deleted = await deleteGalley(page, `K2 galley ${sc.tag}`, 'n1-se-8');
                summary.noticeAfterDelete = await noticeNow(page, S.n1.id, 'n1-se-9-after-galley-deleted');
                // a second look a little later, in case the row is written after the response
                await page.waitForTimeout(3000);
                const r = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-se-9b-after-galley-deleted-later');
                summary.noticeAfterDeleteLater = r.info.noticeBox;
            });
            await sect('n1 le deletes the task', async () => {
                await signInAs(page, u.le);
                summary.leTasksDelete = await tasksPanel(page, 'n1-le-tasks-delete', {deleteAbout: 'asked to review layouts'});
                summary.leTasksAfter = await tasksPanel(page, 'n1-le-tasks-after-delete-reopened');
                const r = await openWorkflow(page, workflow(S.n1.id, 'workflow_5'), 'n1-le-10-after-task-delete');
                summary.leDiscussionsAfter = r.info.discussions;
            });
            record('galleys-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- files: N4 Rule 4 / t4 ---------------------------------------------------------
    if (on('files')) {
        const {page, close} = await launch(app);
        try {
            const summary = {};
            await sect('n4 se list', async () => {
                await signInAs(page, u.se);
                const r0 = await openWorkflow(page, workflow(S.n4.id, 'workflow_5'), 'n4-se-1-empty');
                summary.empty = {tables: r0.info.tables.map((t) => ({name: t.name, columns: t.columns, rows: t.rows})), buttons: r0.info.buttons.filter((b) => /Upload|Download/.test(b)), noticeBox: r0.info.noticeBox, descriptions: r0.info.descriptions};
                const dl0 = page.locator('[role="dialog"]:visible').first().getByText('Download All Files', {exact: true});
                summary.empty.downloadAllCount = await dl0.count();
                // the wizard left mid-way (a file chosen, step 2 reached, then the page left)
                const dialogs = []; const onDialog = (d) => { dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); };
                page.on('dialog', onDialog);
                await uploadProductionReady(page, MD, 'n4-se-2-wizard-leave', {stopAfterStep: 2});
                let navError = null;
                try { await page.goto(ctxUrl('/dashboard/editorial'), {timeout: 20000}); } catch (e) { navError = String(e.message).slice(0, 200); }
                await page.waitForTimeout(800); await idle(page).catch(() => {});
                page.off('dialog', onDialog);
                const rl = await openWorkflow(page, workflow(S.n4.id, 'workflow_5'), 'n4-se-3-after-wizard-left');
                summary.wizardLeft = {browserDialogs: dialogs, navError, tables: rl.info.tables.map((t) => ({name: t.name, rows: t.rows})), noticeBox: rl.info.noticeBox};
                record('n4-se-wizard-left', summary.wizardLeft);
                log('[n4 wizard left]', JSON.stringify(summary.wizardLeft));
                // the full upload
                const i1 = await uploadProductionReady(page, PDF, 'n4-se-4-upload-pdf');
                summary.afterUpload1 = {tables: i1.tables.map((t) => ({name: t.name, columns: t.columns, rows: t.rows, rowLinks: t.rowLinks})), noticeBox: i1.noticeBox, downloadAll: i1.buttons.filter((b) => /Download/.test(b))};
                const i2 = await uploadProductionReady(page, MD, 'n4-se-5-upload-md');
                summary.afterUpload2 = {tables: i2.tables.map((t) => ({name: t.name, rows: t.rows})), noticeBox: i2.noticeBox};
                summary.noticeAfterUploads = await noticeNow(page, S.n4.id, 'n4-se-6-after-uploads');
                const dlg = page.locator('[role="dialog"]:visible').first();
                const table = dlg.getByRole('table', {name: 'Production Ready Files'}).first();
                summary.columns = await table.locator('thead th').allInnerTexts().catch(() => null);
                summary.rows = await table.locator('tbody tr').allInnerTexts().catch(() => null);
                // the file name link downloads
                const link = table.locator('tbody tr').first().locator('a').first();
                await loc(page, 'n4-se: the file name link', link);
                summary.fileLinkDownload = await download(page, link, 'n4-se-6-filename');
                // "Download All Files"
                const dla = dlg.getByText('Download All Files', {exact: true}).first();
                await loc(page, 'n4-se: "Download All Files"', dla);
                summary.downloadAll = {count: await dla.count(), tag: await dla.evaluate((e) => e.tagName + (e.closest('a,button') ? '/' + e.closest('a,button').tagName : '')).catch(() => null)};
                if (await dla.count()) summary.downloadAll.download = await download(page, dla, 'n4-se-6-downloadall');
                // the row menu: Update File Details, More Information, Delete (Cancel), Delete (OK)
                await openWorkflow(page, workflow(S.n4.id, 'workflow_5'), 'n4-se-7-reland');
                summary.rowMenu = await rowMenu(page, 'Production Ready Files', 'article.pdf', 'n4-se-7-menu');
                summary.updateDetails = await rowMenu(page, 'Production Ready Files', 'article.pdf', 'n4-se-7', {press: /^Update File Details$/});
                await closeTop(page);
                await openWorkflow(page, workflow(S.n4.id, 'workflow_5'), 'n4-se-8-reland');
                summary.moreInfo = await rowMenu(page, 'Production Ready Files', 'article.pdf', 'n4-se-8', {press: /^More Information$/});
                await closeTop(page);
                await openWorkflow(page, workflow(S.n4.id, 'workflow_5'), 'n4-se-9-reland');
                summary.deleteCancel = await rowMenu(page, 'Production Ready Files', 'notes.md', 'n4-se-9', {press: /^Delete$/});
                const cancel = topWin(page).getByRole('button', {name: /^Cancel$/}).first();
                if (await cancel.count()) { await cancel.click(); await idle(page); await page.waitForTimeout(500); }
                const afterCancel = await wfInfo(page);
                summary.deleteCancel.after = {tables: afterCancel.tables.map((t) => ({name: t.name, rows: t.rows})), dialogs: (await dialogTexts(page)).map((d) => d.name)};
                record('n4-se-9-delete-cancel-after', summary.deleteCancel.after);
                summary.deleteOk = await rowMenu(page, 'Production Ready Files', 'notes.md', 'n4-se-10', {press: /^Delete$/});
                const ok = topWin(page).getByRole('button', {name: /^(OK|Delete)$/}).first();
                if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); }
                const afterOk = await wfInfo(page);
                summary.deleteOk.after = {tables: afterOk.tables.map((t) => ({name: t.name, rows: t.rows})), noticeBox: afterOk.noticeBox, downloadAll: afterOk.buttons.filter((b) => /Download/.test(b)), dialogs: (await dialogTexts(page)).map((d) => d.name)};
                record('n4-se-10-delete-ok-after', summary.deleteOk.after);
                summary.noticeAfterDelete = await noticeNow(page, S.n4.id, 'n4-se-11-after-delete');
                // delete the last file: the link goes
                summary.deleteLast = await rowMenu(page, 'Production Ready Files', 'article.pdf', 'n4-se-12', {press: /^Delete$/});
                const ok2 = topWin(page).getByRole('button', {name: /^(OK|Delete)$/}).first();
                if (await ok2.count()) { await ok2.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); }
                const afterLast = await wfInfo(page);
                summary.deleteLast.after = {tables: afterLast.tables.map((t) => ({name: t.name, rows: t.rows})), noticeBox: afterLast.noticeBox, downloadAll: afterLast.buttons.filter((b) => /Download/.test(b))};
                record('n4-se-12-delete-last-after', summary.deleteLast.after);
                summary.noticeAfterLastDelete = await noticeNow(page, S.n4.id, 'n4-se-13-after-last-delete');
                // one file back for the assistants' reads
                await uploadProductionReady(page, PDF, 'n4-se-14-upload-again');
            });
            for (const k of ['le', 'pr', 'mgr', 'au']) await sect(`n4 ${k} list`, async () => {
                await signInAs(page, u[k]);
                const r = await openWorkflow(page, k === 'au' ? authorWorkflow(S.n4.id, 'workflow_5') : workflow(S.n4.id, 'workflow_5'), `n4-${k}-15-list`);
                const dlg = page.locator('[role="dialog"]:visible').first();
                summary[`${k}List`] = {tables: r.info.tables.map((t) => ({name: t.name, columns: t.columns, rows: t.rows, rowButtons: t.rowButtons})), upload: await dlg.getByRole('button', {name: 'Upload', exact: true}).count(), downloadAll: await dlg.getByText('Download All Files', {exact: true}).count(), noticeBox: r.info.noticeBox, buttons: r.info.buttons.filter((b) => /Upload|Download|Assign|Add|Schedule|Move/.test(b))};
                if (k !== 'au' && k !== 'mgr') {
                    summary[`${k}Menu`] = await rowMenu(page, 'Production Ready Files', 'article.pdf', `n4-${k}-15-menu`);
                    if (k === 'le') {
                        const i = await uploadProductionReady(page, MD, `n4-${k}-16-upload`);
                        summary[`${k}Upload`] = {tables: i.tables.map((t) => ({name: t.name, rows: t.rows}))};
                    }
                }
                log(`[n4 ${k}]`, JSON.stringify(summary[`${k}List`]).slice(0, 400));
            });
            record('files-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- press: N5 3d by role; "Index Requested" / "Index Completed"; publish on screen ----
    if (on('press') && isOMP) {
        const {page, close} = await launch(app);
        try {
            const summary = {};
            for (const k of ['se', 'mgr', 'le', 'ix', 'au']) await sect(`n5 ${k} read`, async () => {
                await signInAs(page, u[k]);
                const r = await openWorkflow(page, k === 'au' ? authorWorkflow(S.n5.id, 'workflow_5') : workflow(S.n5.id, 'workflow_5'), `n5-${k}-1-unpublished`);
                summary[`${k}Unpublished`] = {noticeBox: r.info.noticeBox, headings: r.info.headings, descriptions: r.info.descriptions, status: r.info.status};
            });
            await sect('n5 index requested', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n5.id, 'workflow_5'), 'n5-se-2-before-index');
                // ix is already a participant: the message goes through the row's Notify
                const n = await notifyFromRow(page, N.ix, 'Index Requested', 'n5-se-index-requested');
                summary.indexRequested = {items: n.items, title: n.title, templates: n.templates, picked: n.picked, message: n.message, after: n.after};
                summary.ixMail = await readMail(mailOf(u.ix), S.n5.title, 'n5-ix-index-requested');
                await signInAs(page, u.ix);
                summary.ixTasks = await tasksPanel(page, 'n5-ix-tasks-after-request');
                await openWorkflow(page, workflow(S.n5.id, 'workflow_5'), 'n5-ix-3-before-complete');
                const c = await notifyFromRow(page, N.se, 'Index Completed', 'n5-ix-index-completed');
                summary.indexCompleted = {picked: c.picked, message: c.message, after: c.after};
                summary.seMailCompleted = await readMail(mailOf(u.se), S.n5.title, 'n5-se-index-completed');
                summary.ixTasksAfterComplete = await tasksPanel(page, 'n5-ix-tasks-after-complete');
                await openWorkflow(page, workflow(S.n5.id, 'workflow_5'), 'n5-ix-4-after-complete');
                summary.log = await activityLog(page, 'n5-ix-4');
            });
            await sect('n5 publish on screen', async () => {
                await signInAs(page, u.mgr);
                summary.publish = await publishOnScreen(page, S.n5.id, 'n5-mgr-5', {action: 'Publish'});
                sc.n5Published = !!(summary.publish.response && summary.publish.response.status < 300); save();
                for (const k of ['se', 'mgr', 'au']) {
                    await signInAs(page, u[k]);
                    const r = await openWorkflow(page, k === 'au' ? authorWorkflow(S.n5.id, 'workflow_5') : workflow(S.n5.id, 'workflow_5'), `n5-${k}-6-published`);
                    summary[`${k}Published`] = {noticeBox: r.info.noticeBox, headings: r.info.headings, status: r.info.status, actions: r.info.actionButtons};
                }
                await signInAs(page, u.ix);
                summary.ixTasksAfterPublish = await tasksPanel(page, 'n5-ix-tasks-after-publish');
                summary.ixTasksDelete = await tasksPanel(page, 'n5-ix-tasks-delete', {deleteAbout: 'asked to create an index'});
            });
            record('press-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- unpublish5: the monograph published on screen (N5) unpublished on screen: does the box flip back? ----
    if (on('unpublish5') && isOMP && S.n5) {
        const {page, close} = await launch(app);
        try {
            const summary = {};
            await sect('n5 unpublish', async () => {
                await signInAs(page, u.mgr);
                summary.unpublish = await publishOnScreen(page, S.n5.id, 'n5-mgr-7', {action: 'Unpublish'});
                for (const k of ['se', 'mgr', 'au']) {
                    await signInAs(page, u[k]);
                    const r = await openWorkflow(page, k === 'au' ? authorWorkflow(S.n5.id, 'workflow_5') : workflow(S.n5.id, 'workflow_5'), `n5-${k}-8-unpublished`);
                    summary[`${k}Unpublished`] = {noticeBox: r.info.noticeBox, headings: r.info.headings, status: r.info.status, actions: r.info.actionButtons, header: r.info.header};
                }
                await page.waitForTimeout(5000);
                const r2 = await openWorkflow(page, authorWorkflow(S.n5.id, 'workflow_5'), 'n5-au-9-unpublished-later');
                summary.auLater = r2.info.noticeBox;
            });
            record('unpublish5-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- tasklink: the Tasks row's link pressed on the panel itself; the file list's column headers as rendered ----
    if (on('tasklink')) {
        const {page, close} = await launch(app);
        try {
            const summary = {};
            await sect('tasks row link', async () => {
                await signInAs(page, u.le);
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                const bell = page.getByRole('button', {name: /Tasks/}).first();
                await bell.click();
                const d = page.locator('[role="dialog"]:visible').last();
                await d.locator('tr.gridRow').first().waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                const rows = await d.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => ({text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), links: [...tr.querySelectorAll('a')].map((a) => ({text: a.innerText.trim().slice(0, 60), href: (a.getAttribute('href') || '').replace(/^.*\/index\.php/, '').slice(0, 160), cls: a.className.slice(0, 80)}))})));
                summary.rows = rows;
                const link = d.locator('tr.gridRow a').first();
                await loc(page, 'tasks: the row link', link);
                const linkText = flat(await link.innerText().catch(() => ''), 80);
                await link.click(); await idle(page); await page.waitForTimeout(1500); await idle(page).catch(() => {});
                await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                const info = await wfInfo(page).catch(() => ({}));
                const s = await snap(page, 'tasks-row-link-landed', {info, linkText});
                summary.landed = {linkText, url: page.url(), header: flat(info.header, 120), headings: (info.headings || []).slice(0, 8), main: flat(s.text && s.text.main, 200), dialog: flat(s.text && s.text.dialog, 200)};
                log('[tasks row link]', JSON.stringify(summary.landed));
            });
            await sect('file list headers', async () => {
                await signInAs(page, u.se);
                await openWorkflow(page, workflow(S.n4.id, 'workflow_5'), 'n4-se-headers');
                const hs = await page.locator('[role="dialog"]:visible').first().getByRole('table', {name: 'Production Ready Files'}).first().locator('thead th').evaluateAll((ths) => ths.map((th) => { const r = th.getBoundingClientRect(); const inner = th.querySelector('span, div'); const ir = inner ? inner.getBoundingClientRect() : null; return {textContent: th.textContent.trim(), innerText: th.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height), innerW: ir ? Math.round(ir.width) : null, innerCls: inner ? inner.className.slice(0, 80) : null, transform: getComputedStyle(th).textTransform}; }));
                summary.headers = hs;
                record('n4-se-headers-cells', hs);
                log('[headers]', JSON.stringify(hs));
            });
            record('tasklink-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }
    // ---- notes: what this chunk learned, appended to screen-notes.md once per app ----
    if (on('notes') && !isOMP) {
        note('ccK2 · Production notice box after the Assign form\'s message: the SAME page already reads "Awaiting Galleys." once the legacy "Assign Participant" window closes (the panel refetches), whereas a discussion added through the Vue "Add" window flips it only on the next landing (U32 K2 saw the same on Copyediting). Deleting the only galley on the Galleys page brings the notice back on the next landing ("Awaiting Galleys." when a discussion exists).');
        note('ccK2 · Galleys page (workflowMenuKey=publication_{id}_galleys): a Vue table (no aria-label; "No Items" when empty) with "Add galley" → legacy window "Create New Galley" (input[name=label], the language list) whose Save opens the upload wizard "Upload a File Ready for Publication" (steps 1. Upload File / 2. Review Details / 3. Confirm, Complete) at once; the row menu (the row\'s last button) offers Edit / View / Change File / More Information / Delete; Delete is the Vue dialog "Delete" / "Are you sure you wish to delete this item? This action cannot be undone." with OK / Cancel.');
        note('ccK2 · Participants row menu → "Notify" opens the legacy window "Notify" with the same "Choose a predefined message" list as the Assign form (select[name=template], TinyMCE textarea[name=message]) and its submit button reads "Notify" (not OK); the message opens a discussion whose row reads "Discussion <template name> Created by: <the RECIPIENT\'s username>" and lands in the recipient\'s Tasks panel as "<sender> started a discussion: <template name>: <body…>". An assistant\'s header has Preview + Library, no "Activity Log": read the log as the editor.');
        note('ccK2 · The upload wizard "Upload a Production Ready File" stores the file at step 1: leaving the page at step 2 (no browser prompt, no app dialog) leaves the file in the list with the uploaded name and the first genre ("Article Text" on OJS, "Appendix" on OMP), both apps. The file name link GETs api/file/file-api/download-file; "Download All Files" is a BUTTON under the list that downloads "<id>--production-ready-files.zip"; the empty list reads "No Items" and has no such button.');
        note('ccK2 · OMP: "Unpublish" (Title & Abstract page, dialog "Unpublish / Are you sure you don\'t want this to be published?", POST …/unpublish 200) does NOT flip the Production entry\'s box back: every role keeps reading "Catalog Management / The monograph has been approved…" after the unpublish, on a seed-published and a screen-published monograph alike, minutes later too. The publish dialog on a press is titled "Schedule For Publication" with the button "Publish".');
        note('ccK2 · Tasks panel: rows tr.gridRow, the task sentence span.message; the bulk "Delete" (a link, on the ticked boxes) removes the row with no confirmation on OJS and OMP; the header bell reads "Tasks N" only while unread rows exist.');
    }

    // ---- published: N6 the seeded published state (OJS: no notice; OMP: "Catalog Management", then Unpublish) ----
    if (on('published')) {
        const {page, close} = await launch(app);
        try {
            const summary = {};
            await sect('n6 reads', async () => {
                for (const k of ['se', 'mgr', 'au']) {
                    await signInAs(page, u[k]);
                    const r = await openWorkflow(page, k === 'au' ? authorWorkflow(S.n6.id, 'workflow_5') : workflow(S.n6.id, 'workflow_5'), `n6-${k}-1-published`);
                    summary[`${k}Published`] = {noticeBox: r.info.noticeBox, headings: r.info.headings, status: r.info.status, actions: r.info.actionButtons, descriptions: r.info.descriptions};
                }
            });
            await sect('n6 unpublish', async () => {
                await signInAs(page, u.mgr);
                summary.unpublish = await publishOnScreen(page, S.n6.id, 'n6-mgr-2', {action: 'Unpublish'});
                for (const k of ['se', 'mgr']) {
                    await signInAs(page, u[k]);
                    const r = await openWorkflow(page, workflow(S.n6.id, 'workflow_5'), `n6-${k}-3-unpublished`);
                    summary[`${k}Unpublished`] = {noticeBox: r.info.noticeBox, headings: r.info.headings, status: r.info.status, actions: r.info.actionButtons};
                }
                if (isOMP) {
                    await signInAs(page, u.mgr);
                    summary.republish = await publishOnScreen(page, S.n6.id, 'n6-mgr-4', {action: 'Publish'});
                    const r = await openWorkflow(page, workflow(S.n6.id, 'workflow_5'), 'n6-mgr-5-republished');
                    summary.mgrRepublished = {noticeBox: r.info.noticeBox, status: r.info.status};
                }
            });
            record('published-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }
});
