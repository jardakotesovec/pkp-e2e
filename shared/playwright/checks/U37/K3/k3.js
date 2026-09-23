// U37 claim check, chunk K3 — templates inside the "Add" window
// ("Templates to get you started!", "Find Template", pressing a template,
// "Apply Template" on an existing item, placeholders) and "Save"/"Cancel"
// (docs/specs/U37-tasks-and-discussions.md Rules 10–11, register A4, A5, A11).
//
// Seeds its own scratch context per app (nothing on publicknowledge):
//   manager mg, section editor se, author au, copyeditor ce (OJS/OMP);
//   templates on stage S (copyediting; OPS production): "K3 Scratch template"
//   (discussion, added in Settings), "K3 task week" (task, P1W), "K3 task
//   quarter" (task, P3M, text holding "zebra"), and the installed
//   "Request Copyedit" (OPS: "Discussion (Production)") limited to the
//   copyeditor (OPS: the section editor/Moderator);
//   submissions SC (stage S, with an existing discussion and task), SS (first
//   stage, OJS/OMP), SI (OMP internal review: a stage without templates).
//
//   PROBE_FEATURE=U37 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U37/K3/k3.js
//   PHASES=list,fill,placeholders,edit,save,cancel,leave,roles,none,ph2,ops1 (default all); REUSE=1 keeps x-<app>.json
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app phase]).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, tag, outDir} = require('../../../probe');

const ALL = 'list,fill,placeholders,edit,save,cancel,leave,roles,none,ph2,ops1';
const PHASES = (process.env.PHASES || ALL).split(',');
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n) => ymd(new Date(Date.now() + n * 86400000));
const months = (n) => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() + n, d.getDate())); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const t = tag('u37k3');
    const u = (s) => `${t}${s}`;
    const ops = app.name === 'ops';
    const S = ops ? 'production' : 'copyediting';
    const users = [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Editor'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ];
    if (!ops) users.push({username: u('ce'), roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copy'});
    const limited = ops ? 'Discussion (Production)' : 'Request Copyedit';
    const C = await app.api.createContext({tag: t, users, taskTemplates: [
        {stage: S, title: 'K3 Scratch template', message: 'Scratch text'},
        {stage: S, title: 'K3 task week', type: 'task', dueInterval: 'P1W', message: 'K3 week text'},
        {stage: S, title: 'K3 task quarter', type: 'task', dueInterval: 'P3M', message: 'K3 quarter text zebra'},
        {stage: S, title: limited, roles: [ops ? 'sectionEditor' : 'copyeditor']},
    ]});
    const base = {context: C.path, submitter: u('au')};
    const parts = [{username: u('se'), role: 'sectionEditor'}];
    if (!ops) parts.push({username: u('ce'), role: 'copyeditor'});
    const X = {t, path: C.path, S, limited, templates: C.taskTemplates};
    X.SC = await app.api.createSubmission({...base, tag: `${t}c`, participants: parts,
        decisions: app.name === 'omp' ? ['skipInternalReview', 'accept'] : app.name === 'ojs' ? ['skipExternalReview'] : undefined,
        tasks: [
            {title: 'K3 existing discussion', creator: u('mg'), participants: [u('mg'), u('se')], message: 'K3 existing discussion message'},
            {title: 'K3 existing task', type: 'task', creator: u('mg'), participants: [u('mg'), u('se')], owner: u('se'), dateDue: day(7), message: 'K3 existing task message'},
        ]});
    if (!ops) X.SS = await app.api.createSubmission({...base, tag: `${t}s`, participants: [{username: u('se'), role: 'sectionEditor'}]});
    if (app.name === 'omp') X.SI = await app.api.createSubmission({...base, tag: `${t}i`, participants: [{username: u('se'), role: 'sectionEditor'}], decisions: ['sendInternalReview']});
    console.log(`[${app.name} seed]`, JSON.stringify({path: X.path, SC: X.SC.submissionId, SS: X.SS && X.SS.submissionId, SI: X.SI && X.SI.submissionId, templates: X.templates}));
    return X;
}

// ---------------------------------------------------------------------------
// Screen helpers

function helpers(app, page, X) {
    const h = {};
    const L = (...a) => console.log(`[${app.name}${h.phase ? ' ' + h.phase : ''}]`, ...a);
    h.L = L;
    h.u = (s) => `${X.t}${s}`;
    h.edUrl = (id, key) => app.url(`/index.php/${X.path}/en/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.auUrl = (id, key) => app.url(`/index.php/${X.path}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.panel = () => page.locator('[data-cy="discussion-manager"]').first();
    h.snap = async (name) => { const s = await screen(page); record(name, s); await shot(page, name).catch(() => {}); return s; };
    h.open = async (url) => {
        h.step = `open ${url.replace(/^.*index.php/, '')}`;
        await page.goto(url);
        await h.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => L('no Add button on', url));
        await idle(page);
    };
    h.answers = [];
    page.on('response', async (r) => {
        if (!/\/api\/v1\/.*(tasks|editTaskTemplates|fromTemplate)/.test(r.url())) return;
        const e = {t: Date.now(), phase: h.phase, method: r.request().method(), url: r.url().replace(/^.*\/api\/v1/, ''), status: r.status()};
        if (r.status() >= 400) e.body = (await r.text().catch(() => '')).slice(0, 600);
        h.answers.push(e);
    });
    h.pageErrors = [];
    page.on('pageerror', (e) => { h.pageErrors.push({phase: h.phase, step: h.step, msg: String(e.message).slice(0, 300)}); L('PAGE ERROR', String(e.message).slice(0, 200)); });
    h.browserDialogs = [];
    page.on('dialog', async (d) => {
        L('browser dialog:', d.type(), JSON.stringify(d.message()), 'during', h.step || '-');
        h.browserDialogs.push({type: d.type(), message: d.message(), step: h.step || '-', phase: h.phase});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    h.since = (t0, re) => h.answers.filter((a) => a.t >= t0 && (!re || re.test(a.url))).map((a) => `${a.method} ${a.url} ${a.status}${a.body ? ' ' + a.body.slice(0, 300) : ''}`);
    h.win = () => page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    h.openAdd = async () => {
        await h.panel().getByRole('button', {name: 'Add', exact: true}).first().click();
        const w = h.win();
        await w.waitFor({timeout: 30000});
        await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('no participant box arrived'));
        await idle(page);
        await h.editorReady();
        return w;
    };
    h.editorReady = async () => {
        await page.waitForFunction(() => window.tinymce && window.tinymce.get().some((e) => e.initialized && e.getContainer() && e.getContainer().offsetParent !== null), null, {timeout: 20000}).catch(() => L('tinymce not initialized'));
    };
    h.typeMsg = async (w, text) => {
        await h.editorReady();
        await w.frameLocator('iframe').first().locator('body').click();
        await page.keyboard.type(text);
    };
    h.msg = () => page.evaluate(() => { const e = (window.tinymce ? window.tinymce.get() : []).filter((x) => x.getContainer() && x.getContainer().offsetParent !== null); return e.length ? e[e.length - 1].getContent() : null; });
    h.tplList = (w) => w.evaluate((root) => {
        const list = root.querySelector('[role="list"]');
        const items = list ? [...list.querySelectorAll('button')].map((b) => ({text: b.innerText.replace(/\s*\n+\s*/g, ' | '), disabled: b.disabled})) : [];
        const none = [...root.querySelectorAll('span')].some((s) => s.innerText.trim() === 'No items found.' && s.offsetParent !== null);
        return {items, none};
    });
    h.tplBtn = (w, title) => w.getByRole('listitem').getByRole('button', {name: new RegExp(`^(Discussion|Task) - ${esc(title)}\\s+This`, 'i')});
    h.participants = (w) => w.locator('input[name="participants"]').evaluateAll((els) => els.map((e) => ({label: (e.closest('label') || e.parentElement).innerText.replace(/\s*\n+\s*/g, ' | '), checked: e.checked})));
    h.state = async (w) => ({
        title: await w.locator('input[name="title"]').inputValue().catch(() => null),
        message: await h.msg().catch(() => null),
        taskInfo: await w.getByRole('checkbox', {name: 'Enter task information'}).isChecked().catch(() => null),
        dateDue: (await w.locator('input[name="dateDue"]').count()) ? await w.locator('input[name="dateDue"]').inputValue() : '(no field)',
        owners: await w.locator('input[name="taskInfoAssignee"]').evaluateAll((els) => els.map((e) => `${(e.closest('label') || e.parentElement).innerText.trim().split('\n')[0]}${e.checked ? ' [x]' : ''}`)).catch(() => []),
        startSelect: (await w.locator('select').count()) ? await w.locator('select').first().evaluate((e) => e.options[e.selectedIndex] && e.options[e.selectedIndex].text) : null,
        participants: (await h.participants(w)).filter((p) => p.checked).map((p) => p.label.split(' | ')[0]),
    });
    h.press = async (w, title, label) => {
        const t0 = Date.now();
        const b = h.tplBtn(w, title);
        if (!(await b.count())) { L('no template button', title); return null; }
        h.step = `press ${title}`;
        await b.first().click();
        await page.waitForResponse((r) => /fromTemplate/.test(r.url()), {timeout: 8000}).catch(() => L('no fromTemplate answer'));
        await idle(page);
        await page.waitForTimeout(600);
        const st = await h.state(w);
        const ans = h.since(t0, /fromTemplate/);
        const errs = h.pageErrors.filter((e) => e.step === h.step).map((e) => e.msg);
        L('pressed', title, JSON.stringify({st, ans, errs}));
        if (label) await h.snap(label);
        return {st, ans, errs};
    };
    h.warnDlg = () => page.getByRole('dialog').filter({hasText: 'The data on this form has changed'});
    h.closeWin = async (w) => {
        if (!(await w.count())) return;
        await w.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
        await h.warnDlg().last().waitFor({timeout: 1500}).then(async () => {
            await h.warnDlg().last().getByRole('button', {name: 'Yes', exact: true}).click();
        }).catch(() => {});
        await w.waitFor({state: 'hidden', timeout: 10000}).catch(() => L('window did not close on Cancel'));
        await idle(page);
    };
    h.errors = (w) => w.evaluate((root) => [...root.querySelectorAll('.pkpFieldError, .pkpFormErrors, .pkpFormField__error, [class*="errorSummary"], [role="alert"]')]
        .filter((e) => e.offsetParent !== null && e.innerText.trim())
        .map((e) => {
            const f = e.closest('.pkpFormField, fieldset, .pkpFormGroup');
            const lab = f ? (f.querySelector('legend, label, .pkpFormFieldLabel, .pkpFormGroup__heading') || {}).innerText : null;
            return {text: e.innerText.trim().replace(/\s*\n+\s*/g, ' | '), field: (lab || '').trim().split('\n')[0]};
        }));
    h.rowMenu = async (name, entry) => {
        const row = h.panel().getByRole('row').filter({hasText: name}).first();
        await row.getByRole('button', {name: /More Actions/}).click();
        const items = await page.getByRole('menuitem').allInnerTexts();
        if (entry) await page.getByRole('menuitem', {name: entry, exact: true}).click();
        return items;
    };
    h.openItem = async (name) => {
        const row = h.panel().getByRole('row').filter({hasText: name}).first();
        await row.getByRole('button', {name, exact: true}).first().click();
        const w = page.getByRole('dialog', {name, exact: true}).last();
        await w.waitFor({timeout: 30000});
        await w.getByText(/Message from/).first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        return w;
    };
    return h;
}

// ---------------------------------------------------------------------------
// Phase list: the list, "Find Template" (Rule 10, 10a, A4)

async function phaseList(app, X, h, page) {
    h.phase = 'list';
    const L = h.L; const ops = app.name === 'ops';
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.SC.submissionId));
    const w = await h.openAdd();
    const s = await h.snap('k3-list-mg');
    L('window text', flat(s.text.dialog, 1800));
    L('list', JSON.stringify(await h.tplList(w)));
    L('templates heading visible', await w.getByText('Templates to get you started!', {exact: true}).isVisible().catch(() => false));
    const box = w.getByRole('searchbox', {name: 'Find Template'});
    await loc(page, 'Add window › "Find Template" searchbox', box);
    await loc(page, 'Add window › template list (role=list "Search Results")', w.getByRole('list', {name: 'Search Results'}));
    await loc(page, 'Add window › a template button by title', h.tplBtn(w, 'K3 task week'));
    // As one types (no Enter).
    const word1 = ops ? 'Production' : 'Copyedit';
    let t0 = Date.now();
    h.step = `type ${word1} without Enter`;
    await box.click();
    await box.pressSequentially(word1, {delay: 80});
    await page.waitForTimeout(2000); await idle(page);
    L(`typed "${word1}", no Enter:`, JSON.stringify(await h.tplList(w)), 'calls', JSON.stringify(h.since(t0, /editTaskTemplates/)));
    await h.snap('k3-list-typed-no-enter');
    t0 = Date.now();
    await box.press('Enter');
    await page.waitForResponse((r) => /editTaskTemplates/.test(r.url()), {timeout: 8000}).catch(() => L('no search answer after Enter'));
    await idle(page); await page.waitForTimeout(400);
    L(`"${word1}" + Enter:`, JSON.stringify(await h.tplList(w)), 'calls', JSON.stringify(h.since(t0, /editTaskTemplates/)));
    await h.snap('k3-list-search-word');
    L('window still open after Enter?', await w.isVisible());
    const clearBtn = w.getByRole('button', {name: /Clear search/i});
    await loc(page, 'Add window › "Find Template" clear button', clearBtn);
    const searches = ['discussion', 'discussions', 'task', 'tasks', 'Task', 'task K3', 'K3', 'K3 task', 'task week', 'zebra', 'Please', 'Dear', 'qqqzz'];
    if (!ops) searches.push('Request Copyedit', 'Request zebra');
    else searches.push('Assign Editor');
    for (const q of searches) {
        t0 = Date.now();
        h.step = `search ${q}`;
        await box.fill(q);
        await box.press('Enter');
        await page.waitForResponse((r) => /editTaskTemplates/.test(r.url()), {timeout: 8000}).catch(() => L('no search answer for', q));
        await idle(page); await page.waitForTimeout(400);
        const dlgs = (await screen(page)).aria.dialogs.map((d) => d.slice(0, 200));
        const errDlg = await page.getByRole('dialog').filter({hasText: /Error|error occurred/}).count();
        L(`search "${q}":`, JSON.stringify(await h.tplList(w)), 'calls', JSON.stringify(h.since(t0, /editTaskTemplates/)), 'errorDialogs', errDlg);
        if (['discussion', 'task', 'zebra', 'qqqzz', 'Please'].includes(q)) { const sn = await h.snap(`k3-search-${q}`); if (errDlg) L('dialogs', JSON.stringify(dlgs)); void sn; }
        if (errDlg) {
            const e = page.getByRole('dialog').filter({hasText: /Error|error occurred/}).last();
            L('error dialog text', flat(await e.innerText().catch(() => ''), 300));
            await e.getByRole('button', {name: /OK|Close/}).first().click().catch(() => {});
            await idle(page);
        }
    }
    // Clear with the control.
    t0 = Date.now();
    await clearBtn.first().click().catch((e) => L('clear click', e.message.slice(0, 100)));
    await page.waitForTimeout(800); await idle(page);
    L('after clear control:', JSON.stringify(await h.tplList(w)), 'box value', JSON.stringify(await box.inputValue()), 'calls', JSON.stringify(h.since(t0, /editTaskTemplates/)));
    // Emptying the box by hand without Enter.
    await box.fill('qqqzz'); await box.press('Enter'); await page.waitForTimeout(800); await idle(page);
    await box.fill(''); await page.waitForTimeout(1500); await idle(page);
    L('box emptied by hand, no Enter:', JSON.stringify(await h.tplList(w)));
    h.step = 'cancel after search';
    await w.getByRole('button', {name: 'Cancel', exact: true}).click();
    await page.waitForTimeout(800);
    L('Cancel after only a search: Warning?', await h.warnDlg().count());
    await h.closeWin(w);
}

// ---------------------------------------------------------------------------
// Phase fill: pressing a template in the "Add" window (10b, A5, td4, td7)

async function phaseFill(app, X, h, page) {
    h.phase = 'fill';
    const L = h.L; const ops = app.name === 'ops';
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.SC.submissionId));
    let w = await h.openAdd();
    // Change everything first: a name, a participant, task information with an owner and a date, a message.
    await w.locator('input[name="title"]').fill('K3 typed name');
    await w.locator('label', {hasText: `(${h.u('se')})`}).locator('input[name="participants"]').check();
    await w.getByRole('checkbox', {name: 'Enter task information'}).check();
    await w.locator('input[name="taskInfoAssignee"]').first().waitFor({timeout: 10000}).catch(() => L('no owner radios'));
    await w.locator('label', {hasText: 'Sean Editor'}).locator('input[name="taskInfoAssignee"]').check().catch((e) => L('owner check', e.message.slice(0, 120)));
    await w.locator('input[name="dateDue"]').fill(day(3)).catch((e) => L('date fill', e.message.slice(0, 120)));
    await h.typeMsg(w, 'Hello typed');
    const before = await h.state(w);
    L('before', JSON.stringify(before));
    L('list while "Enter task information" ticked (Add window)', JSON.stringify(await h.tplList(w)));
    await h.snap('k3-fill-before');
    L('expected week', day(7), 'expected quarter', months(3), 'today', day(0));
    await h.press(w, 'K3 task week', 'k3-fill-task-week');
    await h.press(w, 'K3 task quarter', 'k3-fill-task-quarter');
    // Tick a participant after the template, then another template: does "Participants" move?
    await h.press(w, X.limited, 'k3-fill-limited');
    await h.press(w, 'K3 Scratch template', 'k3-fill-scratch');
    await h.press(w, ops ? 'Assign Editor' : 'Discussion (Copyediting)', ops ? 'k3-fill-assign-editor' : 'k3-fill-discussion-copyediting');
    // A task template when nothing was changed on a fresh window.
    await h.closeWin(w);
    w = await h.openAdd();
    const r = await h.press(w, 'K3 task week', 'k3-fill-fresh-task-week');
    L('owner radios after template on fresh window', JSON.stringify(r && r.st.owners));
    // Save the template-filled task without an owner.
    const t0 = Date.now();
    await w.getByRole('button', {name: 'Save', exact: true}).click();
    await page.waitForTimeout(1500); await idle(page);
    L('save template task (no owner picked):', 'closed?', !(await w.isVisible().catch(() => false)), 'errors', JSON.stringify(await h.errors(w).catch(() => [])), 'answers', JSON.stringify(h.since(t0)));
    await h.snap('k3-fill-save-no-owner');
    await h.closeWin(w);
    // td4: the copyeditor-limited template on the fresh window: is the copyeditor ticked? (A5)
    w = await h.openAdd();
    const before2 = (await h.participants(w)).map((p) => `${p.label.split(' | ')[0]}${p.checked ? ' [x]' : ''}`);
    const r2 = await h.press(w, X.limited, 'k3-fill-fresh-limited');
    L('participants before limited template', JSON.stringify(before2), 'after', JSON.stringify(r2 && r2.st.participants));
    // Save the limited template with nobody else ticked (does the app add the role's people?).
    const t1 = Date.now();
    await w.getByRole('button', {name: 'Save', exact: true}).click();
    await page.waitForTimeout(1500); await idle(page);
    L('save limited template as is:', 'closed?', !(await w.isVisible().catch(() => false)), 'errors', JSON.stringify(await h.errors(w).catch(() => [])), 'answers', JSON.stringify(h.since(t1)));
    await h.snap('k3-fill-save-limited-as-is');
    await h.closeWin(w);
}

// ---------------------------------------------------------------------------
// Phase placeholders: 10d (td5), OPS1 control (td6 first half)

async function phasePlaceholders(app, X, h, page) {
    h.phase = 'placeholders';
    const L = h.L; const ops = app.name === 'ops';
    await signIn(page, h.u('mg'), {contextPath: X.path});
    const sub = ops ? X.SC : X.SS;
    await h.open(h.edUrl(sub.submissionId));
    const runs = [
        {name: 'K3 AE one', tick: ['se']},
        {name: 'K3 AE two', tick: ['se', 'au']},
    ];
    for (const run of runs) {
        const w = await h.openAdd();
        await h.typeMsg(w, 'Hello');
        L('message before', JSON.stringify(await h.msg()));
        const r = await h.press(w, 'Assign Editor', `k3-ph-${run.tick.length}-pressed`);
        if (!r) { await h.closeWin(w); continue; }
        await w.locator('input[name="title"]').fill(run.name);
        for (const k of run.tick) await w.locator('label', {hasText: `(${h.u(k)})`}).locator('input[name="participants"]').check().catch((e) => L('tick', k, e.message.slice(0, 100)));
        const msgNow = await h.msg();
        if (!msgNow || msgNow === '<p>Hello</p>') { L('message box not filled by the template; typing a placeholder text by hand'); }
        const t0 = Date.now();
        h.step = `save ${run.name}`;
        await w.getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForTimeout(1500); await idle(page);
        const closed = !(await w.isVisible().catch(() => false));
        L('save', run.name, 'closed?', closed, 'errors', JSON.stringify(await h.errors(w).catch(() => [])), 'answers', JSON.stringify(h.since(t0)));
        if (!closed) { await h.snap(`k3-ph-${run.tick.length}-save-refused`); await h.closeWin(w); continue; }
        const iw = await h.openItem(run.name);
        const s = await h.snap(`k3-ph-${run.tick.length}-item`);
        L('item window', flat(s.text.dialog, 1500));
        await iw.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
        await page.waitForTimeout(600);
        await h.open(h.edUrl(sub.submissionId));
        for (const k of run.tick) {
            const to = `${h.u(k)}@mail.test`;
            try {
                await h.mailFind(to, run.name);
            } catch (e) { L('no email for', k, e.message.slice(0, 120)); }
        }
    }
}

// ---------------------------------------------------------------------------
// Phase edit: 10c — "Apply Template" on an existing item; greyed discussion templates

async function phaseEdit(app, X, h, page) {
    h.phase = 'edit';
    const L = h.L; const ops = app.name === 'ops';
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.SC.submissionId));
    const disc = ops ? 'Discussion (Production)' : 'Discussion (Copyediting)';
    for (const item of ['K3 existing discussion', 'K3 existing task']) {
        const menu = await h.rowMenu(item, 'Edit');
        L(item, 'row menu', JSON.stringify(menu));
        const w = h.win();
        await w.waitFor({timeout: 30000}); await idle(page); await h.editorReady();
        const tag2 = item.endsWith('task') ? 'task' : 'disc';
        const s = await h.snap(`k3-edit-${tag2}`);
        L(item, 'edit window', flat(s.text.dialog, 1500));
        L(item, 'list', JSON.stringify(await h.tplList(w)));
        L(item, 'state', JSON.stringify(await h.state(w)));
        const target = item.endsWith('task') ? 'K3 task week' : disc;
        // Press, answer "No".
        h.step = `edit press ${target}`;
        await h.tplBtn(w, target).first().click();
        const ad = page.getByRole('dialog').filter({hasText: 'Applying this template'});
        const appeared = await ad.last().waitFor({timeout: 5000}).then(() => true).catch(() => false);
        L(item, 'Apply Template dialog?', appeared);
        if (appeared) {
            const sa = await h.snap(`k3-edit-${tag2}-apply-dialog`);
            L(item, 'apply dialog text', flat(await ad.last().innerText(), 400), 'buttons', JSON.stringify(await ad.last().getByRole('button').allInnerTexts()));
            void sa;
            await ad.last().getByRole('button', {name: 'No', exact: true}).click();
            await page.waitForTimeout(600); await idle(page);
            L(item, 'after No', JSON.stringify(await h.state(w)));
            await h.tplBtn(w, target).first().click();
            await ad.last().waitFor({timeout: 5000});
            const t0 = Date.now();
            await ad.last().getByRole('button', {name: 'Yes', exact: true}).click();
            await page.waitForResponse((r) => /fromTemplate/.test(r.url()), {timeout: 8000}).catch(() => {});
            await page.waitForTimeout(800); await idle(page);
            L(item, 'after Yes', JSON.stringify(await h.state(w)), JSON.stringify(h.since(t0)));
            await h.snap(`k3-edit-${tag2}-after-yes`);
        }
        if (item.endsWith('discussion')) {
            // A task template on a discussion being edited: enabled? what does it do?
            const tb = h.tplBtn(w, 'K3 task quarter');
            L('discussion edit: task template disabled?', await tb.first().isDisabled().catch(() => null));
            h.step = 'edit discussion press task template';
            await tb.first().click();
            await ad.last().waitFor({timeout: 5000}).catch(() => L('no Apply Template dialog for a task template'));
            if (await ad.count()) await ad.last().getByRole('button', {name: 'Yes', exact: true}).click();
            await page.waitForResponse((r) => /fromTemplate/.test(r.url()), {timeout: 8000}).catch(() => {});
            await page.waitForTimeout(800); await idle(page);
            L('discussion edit after a task template + Yes', JSON.stringify(await h.state(w)));
            L('list now', JSON.stringify(await h.tplList(w)));
            await h.snap('k3-edit-disc-task-template');
        }
        await h.closeWin(w);
        await h.open(h.edUrl(X.SC.submissionId));
    }
}

// ---------------------------------------------------------------------------
// Phase save: 11a, 11b

async function phaseSave(app, X, h, page) {
    h.phase = 'save';
    const L = h.L;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.SC.submissionId));
    const trySave = async (label, prep) => {
        const w = await h.openAdd();
        await prep(w);
        const t0 = Date.now();
        await w.getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForTimeout(1200); await idle(page);
        const open = await w.isVisible().catch(() => false);
        const errs = open ? await h.errors(w) : [];
        const s = await h.snap(`k3-save-${label}`);
        L('save', label, JSON.stringify({open, errs, answers: h.since(t0), status: await page.locator('[role="status"]').allInnerTexts().catch(() => [])}));
        return {w, open, s};
    };
    // Everything empty (the window pre-ticks the manager only).
    let r = await trySave('all-empty', async () => {});
    await h.closeWin(r.w);
    r = await trySave('name-only-empty', async (w) => { await w.locator('label', {hasText: `(${h.u('se')})`}).locator('input[name="participants"]').check(); await h.typeMsg(w, 'K3 message'); });
    await h.closeWin(r.w);
    r = await trySave('message-only-empty', async (w) => { await w.locator('input[name="title"]').fill('K3 name only'); await w.locator('label', {hasText: `(${h.u('se')})`}).locator('input[name="participants"]').check(); });
    await h.closeWin(r.w);
    r = await trySave('task-all-empty', async (w) => { await w.getByRole('checkbox', {name: 'Enter task information'}).check(); await page.waitForTimeout(400); });
    await h.closeWin(r.w);
    r = await trySave('participants-unticked', async (w) => { await w.locator('input[name="title"]').fill('K3 nobody'); await w.locator('input[name="participants"]:checked').uncheck(); await h.typeMsg(w, 'K3 nobody message'); });
    await h.closeWin(r.w);
    // A successful save.
    const t0 = Date.now();
    r = await trySave('ok', async (w) => { await w.locator('input[name="title"]').fill('K3 saved'); await w.locator('label', {hasText: `(${h.u('se')})`}).locator('input[name="participants"]').check(); await h.typeMsg(w, 'K3 saved message'); });
    const toasts = await page.locator('.pkpNotify, [class*="notify"], [role="alert"]').allInnerTexts().catch(() => []);
    L('after ok save: window open?', r.open, 'toasts/alerts', JSON.stringify(toasts));
    L('panel after save', flat(await h.panel().innerText().catch(() => ''), 1500));
    await h.mailFind(`${h.u('se')}@mail.test`, 'K3 saved', t0);
}

// ---------------------------------------------------------------------------
// Phase cancel: 11c (td2, A11)

async function phaseCancel(app, X, h, page) {
    h.phase = 'cancel';
    const L = h.L;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    const url = h.edUrl(X.SC.submissionId);
    await h.open(url);
    const results = {};
    const way = async (label, change, how) => {
        const w = await h.openAdd();
        if (change) await change(w);
        h.step = `${label}`;
        if (how === 'cancel') await w.getByRole('button', {name: 'Cancel', exact: true}).click();
        else if (how === 'close') await w.getByRole('button', {name: 'Close', exact: true}).last().click();
        else if (how === 'escape') { await w.locator('input[name="title"]').focus(); await page.keyboard.press('Escape'); }
        await page.waitForTimeout(1200);
        const warn = await h.warnDlg().count();
        let warnText = null;
        if (warn) warnText = flat(await h.warnDlg().last().innerText(), 300);
        const s = await h.snap(`k3-cancel-${label}`);
        const winOpen = await w.isVisible().catch(() => false);
        const wfOpen = await page.getByRole('dialog').first().isVisible().catch(() => false);
        results[label] = {warn, warnText, winOpen, workflowDialogOpen: wfOpen, dialogs: s.aria.dialogs.map((d) => d.split('\n')[0])};
        L(label, JSON.stringify(results[label]));
        return {w, warn};
    };
    const typeName = async (w) => w.locator('input[name="title"]').fill('Draft');
    // Untouched: each way.
    for (const how of ['cancel', 'close', 'escape']) {
        await way(`untouched-${how}`, null, how);
        await h.open(url);
    }
    // Name typed: Cancel, then "No", then Cancel "Yes", reopen.
    let r = await way('name-cancel', typeName, 'cancel');
    if (r.warn) {
        await h.warnDlg().last().getByRole('button', {name: 'No', exact: true}).click();
        await page.waitForTimeout(600);
        L('after No: window open', await r.w.isVisible(), 'name', JSON.stringify(await r.w.locator('input[name="title"]').inputValue().catch(() => null)));
        await r.w.getByRole('button', {name: 'Cancel', exact: true}).click();
        await h.warnDlg().last().getByRole('button', {name: 'Yes', exact: true}).click();
        await page.waitForTimeout(800);
        L('after Yes: window open', await r.w.isVisible().catch(() => false));
    }
    await idle(page);
    const w2 = await h.openAdd();
    L('reopened after discard: name', JSON.stringify(await w2.locator('input[name="title"]').inputValue()), 'message', JSON.stringify(await h.msg()));
    await h.closeWin(w2);
    await h.open(url);
    for (const how of ['close', 'escape']) {
        r = await way(`name-${how}`, typeName, how);
        if (r.warn) await h.warnDlg().last().getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
        await h.open(url);
    }
    // Other kinds of change, pressed with Cancel.
    r = await way('message-cancel', async (w) => h.typeMsg(w, 'Draft message'), 'cancel');
    if (r.warn) await h.warnDlg().last().getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
    await h.open(url);
    r = await way('participant-cancel', async (w) => w.locator('label', {hasText: `(${h.u('se')})`}).locator('input[name="participants"]').check(), 'cancel');
    if (r.warn) await h.warnDlg().last().getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
    await h.open(url);
    r = await way('template-cancel', async (w) => { await h.press(w, 'K3 task week'); }, 'cancel');
    if (r.warn) await h.warnDlg().last().getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
    await h.open(url);
    // The Edit window of an existing item: Cancel after a change.
    await h.rowMenu('K3 existing discussion', 'Edit');
    const ew = h.win(); await ew.waitFor({timeout: 30000}); await idle(page);
    await ew.locator('input[name="title"]').fill('K3 existing discussion changed');
    h.step = 'edit-name-cancel';
    await ew.getByRole('button', {name: 'Cancel', exact: true}).click();
    await page.waitForTimeout(1200);
    results['edit-name-cancel'] = {warn: await h.warnDlg().count(), winOpen: await ew.isVisible().catch(() => false)};
    L('edit-name-cancel', JSON.stringify(results['edit-name-cancel']));
    await h.snap('k3-cancel-edit-name-cancel');
    if (results['edit-name-cancel'].warn) await h.warnDlg().last().getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
    record('k3-cancel-results', results);
}

// ---------------------------------------------------------------------------
// Phase leave: 11d (td16)

async function phaseLeave(app, X, h, page) {
    h.phase = 'leave';
    const L = h.L;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    const url = h.edUrl(X.SC.submissionId);
    const results = {};
    const reload = async (label) => {
        const n0 = h.browserDialogs.length;
        h.step = `reload ${label}`;
        await page.reload().catch((e) => L('reload error', e.message.slice(0, 100)));
        await idle(page);
        results[label] = h.browserDialogs.slice(n0).map((d) => d.type);
        L('reload', label, JSON.stringify(results[label]));
    };
    await h.open(url);
    await reload('page, no window opened');
    await h.open(url);
    let w = await h.openAdd();
    await w.locator('input[name="title"]').fill('K3 leave name');
    await reload('window open, name typed');
    await h.open(url);
    w = await h.openAdd();
    await reload('window open, untouched');
    await h.open(url);
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill('K3 leave saved');
    await w.locator('label', {hasText: `(${h.u('se')})`}).locator('input[name="participants"]').check();
    await h.typeMsg(w, 'K3 leave message');
    await w.getByRole('button', {name: 'Save', exact: true}).click();
    await w.waitFor({state: 'hidden', timeout: 20000}).catch(() => L('save did not close'));
    await idle(page);
    await reload('after a save');
    await h.open(url);
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill('K3 leave discarded');
    await h.closeWin(w);
    await reload('after Cancel with a change, Warning Yes');
    await h.open(url);
    w = await h.openAdd();
    await h.closeWin(w);
    await reload('after Cancel untouched');
    record('k3-leave-results', results);
}

// ---------------------------------------------------------------------------
// Phase roles: the list per permission level (Rule 10 "a person may use", Actors)

async function phaseRoles(app, X, h, page) {
    h.phase = 'roles';
    const L = h.L; const ops = app.name === 'ops';
    const who = ops ? ['mg', 'se', 'au'] : ['mg', 'se', 'ce', 'au'];
    for (const k of who) {
        await signIn(page, h.u(k), {contextPath: X.path});
        if (k === 'au' && ops) {
            // A preprint server's author reaches the panel through the publication menu's "Production Tasks & Discussions".
            await page.goto(h.auUrl(X.SC.submissionId)); await idle(page);
            const link = page.getByRole('link', {name: 'Production Tasks & Discussions'}).or(page.getByRole('button', {name: 'Production Tasks & Discussions'})).first();
            await loc(page, 'OPS author menu "Production Tasks & Discussions"', link);
            await link.click(); await idle(page);
            await h.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => L('no Add on the OPS author page'));
        } else {
            await h.open(k === 'au' ? h.auUrl(X.SC.submissionId, ops ? 'workflow_5' : 'workflow_4') : h.edUrl(X.SC.submissionId, ops ? 'workflow_5' : 'workflow_4'));
        }
        if (!(await h.panel().count())) { L(k, 'no panel'); await h.snap(`k3-roles-${k}-nopanel`); continue; }
        const w = await h.openAdd();
        await h.snap(`k3-roles-${k}`);
        L(k, 'list', JSON.stringify(await h.tplList(w)));
        // Search as this role (A4 is not role-bound; the fetch is).
        await w.getByRole('searchbox', {name: 'Find Template'}).fill('task');
        const t0 = Date.now();
        await w.getByRole('searchbox', {name: 'Find Template'}).press('Enter');
        await page.waitForResponse((r) => /editTaskTemplates/.test(r.url()), {timeout: 8000}).catch(() => {});
        await idle(page);
        L(k, 'search "task"', JSON.stringify(await h.tplList(w)), JSON.stringify(h.since(t0, /editTaskTemplates/)));
        await h.closeWin(w);
    }
}

// ---------------------------------------------------------------------------
// Phase none: a stage without templates (OMP internal review)

async function phaseNone(app, X, h, page) {
    h.phase = 'none';
    const L = h.L;
    if (!X.SI) { L('no stage without templates on this app'); return; }
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.SI.submissionId));
    const w = await h.openAdd();
    const s = await h.snap('k3-none-internal-review');
    L('internal review window', flat(s.text.dialog, 800));
    L('list', JSON.stringify(await h.tplList(w)));
    await h.closeWin(w);
}

// ---------------------------------------------------------------------------
// Phase ph2: placeholders in a template added in Settings, on every app (10d on OPS, 10e)

async function phasePh2(app, X, h, page) {
    h.phase = 'ph2';
    const L = h.L; const ops = app.name === 'ops';
    const t = tag('u37k3p');
    const u = (s) => `${t}${s}`;
    const C = await app.api.createContext({tag: t, users: [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Editor'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ], taskTemplates: [{stage: ops ? 'production' : 'submission', title: 'K3 placeholder template', message: 'Dear {$recipientName}, about {$submissionTitle} at {$contextName}.'}]});
    const S = await app.api.createSubmission({context: C.path, submitter: u('au'), tag: `${t}s`, participants: [{username: u('se'), role: 'sectionEditor'}]});
    L('seed', C.path, S.submissionId);
    await signIn(page, u('mg'), {contextPath: C.path});
    await h.open(app.url(`/index.php/${C.path}/en/dashboard/editorial?workflowSubmissionId=${S.submissionId}`));
    const w = await h.openAdd();
    await h.press(w, 'K3 placeholder template', 'k3-ph2-pressed');
    await w.locator('label', {hasText: `(${u('se')})`}).locator('input[name="participants"]').check();
    const t0 = Date.now();
    await w.getByRole('button', {name: 'Save', exact: true}).click();
    await page.waitForTimeout(1500); await idle(page);
    const open = await w.isVisible().catch(() => false);
    L('save', 'open?', open, JSON.stringify(open ? await h.errors(w) : []), JSON.stringify(h.since(t0)));
    if (open) { await h.snap('k3-ph2-refused'); await h.closeWin(w); return; }
    await h.openItem('K3 placeholder template');
    const s = await h.snap('k3-ph2-item');
    L('item window', flat(s.text.dialog, 900));
    await h.mailFind(`${u('se')}@mail.test`, 'K3 placeholder template');
    // 11b: the recipient's Tasks row (a fresh context, so the count is this item's).
    await signIn(page, u('se'), {contextPath: C.path});
    await page.goto(app.url(`/index.php/${C.path}/en/dashboard/editorial`)); await idle(page);
    const tasksBtn = page.getByRole('button', {name: /^Tasks/}).first();
    await loc(page, 'header "Tasks" button', tasksBtn);
    L('se header Tasks button', JSON.stringify(await tasksBtn.innerText().catch(() => null)));
    await tasksBtn.click().catch(() => {});
    await page.waitForTimeout(1000); await idle(page);
    const st = await h.snap('k3-ph2-se-tasks');
    L('se Tasks window', flat(st.text.dialog, 700));
}

// ---------------------------------------------------------------------------
// Phase ops1b: OPS "Assign Editor" in the "Add" window, then typing into the box (td6 first half)

async function phaseOps1b(app, X, h, page) {
    h.phase = 'ops1b';
    const L = h.L;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.SC.submissionId));
    const w = await h.openAdd();
    const r = await h.press(w, 'Assign Editor', 'k3-ops1b-fresh-pressed');
    L('fresh window after Assign Editor', JSON.stringify(r && r.st));
    await w.locator('label', {hasText: `(${h.u('se')})`}).locator('input[name="participants"]').check();
    let t0 = Date.now();
    await w.getByRole('button', {name: 'Save', exact: true}).click();
    await page.waitForTimeout(1200); await idle(page);
    L('save as filled', 'open?', await w.isVisible().catch(() => false), JSON.stringify(await h.errors(w).catch(() => [])), JSON.stringify(h.since(t0)));
    await h.snap('k3-ops1b-save-as-filled');
    await h.typeMsg(w, 'Typed after');
    L('box after typing', JSON.stringify(await h.msg()));
    t0 = Date.now();
    await w.getByRole('button', {name: 'Save', exact: true}).click();
    await page.waitForTimeout(1500); await idle(page);
    const open = await w.isVisible().catch(() => false);
    L('save after typing', 'open?', open, JSON.stringify(open ? await h.errors(w) : []), JSON.stringify(h.since(t0)));
    await h.snap('k3-ops1b-save-after-typing');
    if (open) { await h.closeWin(w); return; }
    const iw = await h.openItem('Assign Editor');
    const s = await h.snap('k3-ops1b-item');
    L('item window', flat(s.text.dialog, 900));
    void iw;
}

// ---------------------------------------------------------------------------
// Phase ops1: Settings › Workflow › "Tasks and Discussions" › "Assign Editor" (td6 second half)

async function phaseOps1(app, X, h, page) {
    h.phase = 'ops1';
    const L = h.L;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await page.goto(app.url(`/index.php/${X.path}/en/management/settings/workflow`));
    await idle(page);
    await page.getByRole('tab', {name: 'Tasks and Discussions'}).click();
    await idle(page);
    const rows = page.getByRole('row').filter({hasText: 'Assign Editor'});
    L('Assign Editor rows', await rows.count());
    const row = rows.last();
    await row.getByRole('button', {name: /More Actions/}).click();
    await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
    const w = page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    await w.waitFor({timeout: 30000}); await idle(page); await h.editorReady();
    await page.waitForTimeout(800);
    const s = await h.snap('k3-ops1-template-edit');
    L('template window', flat(s.text.dialog, 1500));
    L('Discussion box content', JSON.stringify(await h.msg()));
    const t0 = Date.now();
    h.step = 'template save unchanged';
    await w.getByRole('button', {name: 'Save', exact: true}).click();
    await page.waitForTimeout(1500); await idle(page);
    const open = await w.isVisible().catch(() => false);
    L('save unchanged: window open?', open, 'errors', JSON.stringify(open ? await h.errors(w) : []), 'answers', JSON.stringify(h.answers.filter((a) => a.t >= t0).map((a) => `${a.method} ${a.url} ${a.status}`)));
    await h.snap('k3-ops1-template-save');
    if (open) await h.closeWin(w);
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const xFile = path.join(outDir(), `x-${app.name}.json`);
    let X;
    if (process.env.REUSE && fs.existsSync(xFile)) X = JSON.parse(fs.readFileSync(xFile, 'utf8'));
    else { X = await seed(app); fs.writeFileSync(xFile, JSON.stringify(X, null, 2)); }
    const h = helpers(app, page, X);
    h.mailFind = async (to, contains, since) => {
        const m = await app.mail.find({to, contains, timeoutMs: 15000});
        const full = await app.mail.fullMessage(m.ID);
        h.L('email to', to, 'subject', JSON.stringify(full.Subject), 'text', JSON.stringify(flat(full.Text, 800)));
        return full;
    };
    const guard = async (name, fn) => {
        try { await fn(); } catch (e) {
            h.L(`[error in ${name}]`, String(e.stack || e.message).slice(0, 1200));
            await shot(page, `error-${name}`).catch(() => {});
        }
    };
    try {
        if (PHASES.includes('list')) await guard('list', () => phaseList(app, X, h, page));
        if (PHASES.includes('fill')) await guard('fill', () => phaseFill(app, X, h, page));
        if (PHASES.includes('placeholders')) await guard('placeholders', () => phasePlaceholders(app, X, h, page));
        if (PHASES.includes('edit')) await guard('edit', () => phaseEdit(app, X, h, page));
        if (PHASES.includes('save')) await guard('save', () => phaseSave(app, X, h, page));
        if (PHASES.includes('cancel')) await guard('cancel', () => phaseCancel(app, X, h, page));
        if (PHASES.includes('leave')) await guard('leave', () => phaseLeave(app, X, h, page));
        if (PHASES.includes('roles')) await guard('roles', () => phaseRoles(app, X, h, page));
        if (PHASES.includes('none')) await guard('none', () => phaseNone(app, X, h, page));
        if (PHASES.includes('ph2')) await guard('ph2', () => phasePh2(app, X, h, page));
        if (PHASES.includes('ops1') && app.name === 'ops') await guard('ops1b', () => phaseOps1b(app, X, h, page));
        if (PHASES.includes('ops1')) await guard('ops1', () => phaseOps1(app, X, h, page));
    } finally {
        record('k3-answers', h.answers);
        record('k3-page-errors', h.pageErrors);
        record('k3-browser-dialogs', h.browserDialogs);
        await close();
    }
});
