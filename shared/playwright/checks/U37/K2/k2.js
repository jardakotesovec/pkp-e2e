// U37 claim check, chunk K2 — the "Add" window of "Tasks & Discussions":
// its fields, who is offered under "Participants", what "Save" refuses
// about participants, "Task Information"; the discussion window's boxes
// and new message; the template window's fields
// (docs/specs/U37-tasks-and-discussions.md, Fields & validation, Rules 6–9,
// register A2, A10, A14).
//
// Seeds its own scratch contexts per app (nothing on publicknowledge):
//   X  — the default review type; manager mg, editor ed (manager-level),
//        section editors se, se2, a manager who is also a section editor ms,
//        copyeditor ce, author au; submissions SA (first stage, clean
//        panel), SE (items to edit), SW (items for the discussion window),
//        SC (copyediting, OJS/OMP) with an auto-added ownerless task.
//   D/A/O (OJS, OMP) — review type double-anonymous / anonymous / open,
//        one submission in external review with reviewers r1..r4.
//
//   PROBE_FEATURE=U37 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U37/K2/k2.js
//   PHASES=addwin,roles,review,edit,window,templates,leave (default all); REUSE=1 reuses the
//   last X context (x-<app>.json) instead of seeding a new one
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app phase]).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const PHASES = (process.env.PHASES || 'addwin,roles,review,edit,window,templates,leave').split(',');
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const FIX = {ojs: 'notes.md', omp: 'notes.md', ops: 'not-an-image.txt'};

// ---------------------------------------------------------------------------
// Seeding

async function seedX(app) {
    const t = tag('u37k2x');
    const u = (s) => `${t}${s}`;
    const ops = app.name === 'ops';
    const users = [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Editor'},
        {username: u('sf'), roles: ['sectionEditor'], givenName: 'Sofia', familyName: 'Second'},
        {username: u('ms'), roles: ['manager', 'sectionEditor'], givenName: 'Milo', familyName: 'Both'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ];
    if (!ops) {
        users.push({username: u('ed'), roles: ['editor'], givenName: 'Edith', familyName: 'Chief'});
        users.push({username: u('ce'), roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copy'});
    }
    const C = await app.api.createContext({tag: t, users, taskTemplates: [
        {stage: ops ? 'production' : 'copyediting', title: 'K2 auto task', type: 'task', dueInterval: 'P1W', include: true, message: 'K2 auto text'},
    ]});
    const base = {context: C.path, submitter: u('au')};
    const eds = [{username: u('se'), role: 'sectionEditor'}, {username: u('sf'), role: 'sectionEditor'}, {username: u('ms'), role: 'sectionEditor'}];
    const X = {t, u, path: C.path, ctx: C};
    // SA: clean first-stage panel; a copyeditor assigned where the stage allows it.
    try {
        X.SA = await app.api.createSubmission({...base, tag: `${t}a`, participants: ops ? eds : [...eds, {username: u('ce'), role: 'copyeditor'}]});
        X.SAce = !ops;
    } catch (e) {
        console.log(`[${app.name} seed] SA with a copyeditor refused: ${String(e.message).slice(0, 300)}`);
        X.SA = await app.api.createSubmission({...base, tag: `${t}a`, participants: eds});
        X.SAce = false;
    }
    X.SE = await app.api.createSubmission({...base, tag: `${t}e`, participants: eds, tasks: [
        {title: 'K2 se discussion', creator: u('se'), participants: [u('se'), u('au')], message: 'K2 se first message'},
        {title: 'K2 mg task', type: 'task', creator: u('mg'), participants: [u('mg'), u('se')], owner: u('se'), dateDue: day(7), message: 'K2 mg task message'},
        {title: 'K2 left discussion', creator: u('mg'), participants: [u('mg'), u('sf')], message: 'K2 left message'},
        {title: 'K2 author discussion', creator: u('au'), participants: [u('au'), u('se')], message: 'K2 author message'},
        {title: 'K2 author with manager', creator: u('au'), participants: [u('au'), u('se'), u('mg')], message: 'K2 author with manager message'},
    ]});
    X.SW = await app.api.createSubmission({...base, tag: `${t}w`, participants: eds, tasks: [
        {title: 'K2 T1 yet', type: 'task', creator: u('mg'), participants: [u('mg'), u('se'), u('au')], owner: u('se'), dateDue: day(7), started: false},
        {title: 'K2 T2 started', type: 'task', creator: u('mg'), participants: [u('mg'), u('se'), u('au')], owner: u('se'), dateDue: day(7), started: true},
        {title: 'K2 D1', creator: u('mg'), participants: [u('mg'), u('se'), u('au')], message: 'K2 D1 message'},
    ]});
    if (!ops) {
        X.SC = await app.api.createSubmission({...base, tag: `${t}c`, participants: [...eds, {username: u('ce'), role: 'copyeditor'}],
            decisions: app.name === 'omp' ? ['skipInternalReview', 'accept'] : ['skipExternalReview']});
    }
    console.log(`[${app.name} seed X]`, JSON.stringify({path: X.path, SA: X.SA.submissionId, SE: X.SE.submissionId, SW: X.SW.submissionId, SC: X.SC && X.SC.submissionId, SAce: X.SAce}));
    return X;
}

async function seedReview(app, mode) {
    const t = tag(`u37k2${mode[0]}`);
    const u = (s) => `${t}${s}`;
    const users = [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Editor'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ];
    for (const [k, g] of [['r1', 'Rhea'], ['r2', 'Remy'], ['r3', 'Rosa'], ['r4', 'Rufus'], ['r5', 'Rita']]) {
        users.push({username: u(k), roles: ['externalReviewer'], givenName: g, familyName: 'Reviewer'});
    }
    const spec = {tag: t, users};
    if (mode !== 'doubleAnonymous') spec.review = {defaultReviewMode: mode};
    const C = await app.api.createContext(spec);
    const reviewers = mode === 'doubleAnonymous'
        ? [{username: u('r1'), status: 'accepted'}, {username: u('r2'), status: 'invited'}, {username: u('r3'), status: 'declined'}, {username: u('r4'), status: 'accepted'}, {username: u('r5'), status: 'accepted'}]
        : [{username: u('r1'), status: 'accepted'}, {username: u('r2'), status: 'accepted'}];
    const SR = await app.api.createSubmission({tag: `${t}r`, context: C.path, submitter: u('au'),
        participants: [{username: u('se'), role: 'sectionEditor'}],
        decisions: [app.name === 'omp' ? 'skipInternalReview' : 'sendExternalReview'],
        reviewRounds: [{reviewers}]});
    console.log(`[${app.name} seed ${mode}]`, JSON.stringify({path: C.path, SR: SR.submissionId, ra: SR.reviewAssignments}));
    return {t, u, path: C.path, SR, mode};
}

// ---------------------------------------------------------------------------
// Screen helpers

function helpers(app, page) {
    const out = {};
    const L = (...a) => console.log(`[${app.name}${out.phase ? ' ' + out.phase : ''}]`, ...a);
    out.L = L;
    out.edUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    out.auUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    out.panel = () => page.locator('[data-cy="discussion-manager"]').first();
    // The Author's view; a preprint server's Author reaches the panel through the
    // publication menu's "Production Tasks & Discussions" link.
    out.openAu = async (p, id) => {
        if (app.name !== 'ops') return out.open(out.auUrl(p, id));
        out.step = `author view ${id}`;
        await page.goto(out.auUrl(p, id));
        await idle(page);
        await page.getByRole('link', {name: 'Production Tasks & Discussions'}).first().click();
        await out.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => L('no Add button in the author view'));
        await idle(page);
    };
    out.snap = async (name) => { const s = await screen(page); record(name, s); await shot(page, name).catch(() => {}); return s; };
    out.open = async (url, step) => {
        out.step = step || `open ${url.replace(/^.*index.php/, '')}`;
        await page.goto(url);
        await out.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => L('no Add button on', url));
        await idle(page);
    };
    // Every tasks-API answer (status and, for a refusal, the JSON the browser got).
    out.answers = [];
    page.on('response', async (r) => {
        if (!/\/api\/v1\/.*(tasks|participants|editTaskTemplates)/.test(r.url())) return;
        const e = {t: Date.now(), method: r.request().method(), url: r.url().replace(/^.*\/api\/v1/, ''), status: r.status()};
        if (r.status() >= 400) e.body = await r.text().catch(() => null);
        out.answers.push(e);
    });
    // A browser box: logged with the step that raised it; "Leave" on beforeunload, Cancel otherwise.
    out.browserDialogs = [];
    page.on('dialog', async (d) => {
        L('browser dialog:', d.type(), JSON.stringify(d.message()), 'during', out.step || '-');
        out.browserDialogs.push({type: d.type(), message: d.message(), step: out.step || '-', phase: out.phase});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    out.win = () => page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    out.openAdd = async (scope) => {
        const add = (scope || out.panel()).getByRole('button', {name: 'Add', exact: true}).first();
        const t0 = Date.now();
        await add.click();
        const w = out.win();
        await w.waitFor({timeout: 30000});
        const tOpen = Date.now();
        await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('no participant box arrived'));
        const tList = Date.now();
        await idle(page);
        out.lastOpenTiming = {windowMs: tOpen - t0, listMs: tList - t0, participantsCall: out.answers.filter((a) => a.t >= t0 && /participants/.test(a.url)).map((a) => `${a.method} ${a.url} ${a.status} +${a.t - t0}ms`)};
        return w;
    };
    out.participants = (w) => w.locator('input[name="participants"]').evaluateAll((els) => els.map((e, i) => {
        const lab = e.closest('label');
        return {i, label: lab ? lab.innerText.replace(/\s*\n+\s*/g, ' | ') : '', checked: e.checked, disabled: e.disabled};
    }));
    out.owners = (w) => w.locator('input[name="taskInfoAssignee"]').evaluateAll((els) => els.map((e) => ({label: (e.closest('label') || e.parentElement).innerText.trim().replace(/\s*\n+\s*/g, ' | '), checked: e.checked})));
    out.box = (w, username) => w.locator('label', {hasText: `(${username})`}).locator('input[name="participants"]');
    out.tick = async (w, username, on = true) => { const b = out.box(w, username); if ((await b.count()) === 0) { L('no box for', username); return false; } await b.first().setChecked(on); return true; };
    out.editorReady = async (w) => {
        await page.waitForFunction(() => window.tinymce && window.tinymce.get().some((e) => e.initialized && e.getContainer() && e.getContainer().offsetParent !== null), null, {timeout: 20000}).catch(() => L('tinymce not initialized'));
    };
    out.typeMsg = async (w, text) => {
        await out.editorReady(w);
        const body = w.frameLocator('iframe').first().locator('body');
        await body.click();
        await page.keyboard.type(text);
    };
    out.errors = (w) => w.evaluate((root) => [...root.querySelectorAll('.pkpFieldError, .pkpFormErrors, .pkpFormField__error, [class*="errorSummary"], [role="alert"]')]
        .filter((e) => e.offsetParent !== null && e.innerText.trim())
        .map((e) => {
            const f = e.closest('.pkpFormField, fieldset, .pkpFormGroup');
            const lab = f ? (f.querySelector('legend, label, .pkpFormFieldLabel, .pkpFormGroup__heading') || {}).innerText : null;
            return {text: e.innerText.trim(), cls: e.className, field: (lab || '').trim().split('\n')[0]};
        }));
    // Press Save; report the answer, the errors and whether the window closed.
    out.save = async (w, label) => {
        const t0 = Date.now();
        await w.getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForResponse((r) => /\/tasks(\/\d+)?(\/start)?$/.test(r.url()) && r.request().method() !== 'GET', {timeout: 6000}).catch(() => null);
        await idle(page);
        await page.waitForTimeout(300);
        if (out.answers.some((a) => a.t >= t0 && a.method !== 'GET' && a.status < 300)) await w.waitFor({state: 'hidden', timeout: 5000}).catch(() => L('window still open 5 s after a 2xx answer'));
        const closed = (await w.count()) === 0 || !(await w.isVisible().catch(() => false));
        const errs = closed ? [] : await out.errors(w).catch(() => []);
        const ans = out.answers.filter((a) => a.t >= t0 && a.method !== 'GET').map((a) => `${a.method} ${a.url} ${a.status}${a.body ? ' ' + a.body.slice(0, 400) : ''}`);
        const res = {label, closed, errors: errs, answers: ans};
        L('save', label, JSON.stringify(res));
        return res;
    };
    out.closeWin = async (w) => {
        if ((await w.count()) === 0) return;
        await w.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
        // A changed form asks first (the Vue "Warning" dialog): answer "Yes".
        const warn = page.getByRole('dialog', {name: 'Warning'});
        await warn.waitFor({timeout: 1500}).then(async () => {
            out.cancelWarnings = (out.cancelWarnings || 0) + 1;
            await warn.getByRole('button', {name: 'Yes', exact: true}).click();
        }).catch(() => {});
        await w.waitFor({state: 'hidden', timeout: 10000}).catch(() => L('window did not close on Cancel'));
        await idle(page);
    };
    out.panelText = async () => flat(await out.panel().innerText().catch(() => ''), 3000);
    // An item's row: "More Actions" › entry
    out.rowMenu = async (name, entry) => {
        const row = out.panel().getByRole('row').filter({hasText: name}).first();
        await row.getByRole('button', {name: /More Actions/}).click();
        const items = await page.getByRole('menuitem').allInnerTexts();
        if (entry) await page.getByRole('menuitem', {name: entry, exact: true}).click();
        return items;
    };
    out.openItem = async (name) => {
        const row = out.panel().getByRole('row').filter({hasText: name}).first();
        await row.getByRole('button', {name, exact: true}).or(row.getByRole('link', {name, exact: true})).first().click();
        const w = page.getByRole('dialog', {name, exact: true}).last();
        await w.waitFor({timeout: 30000});
        await w.getByText('Message from').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        return w;
    };
    return out;
}

// ---------------------------------------------------------------------------
// Phase addwin: the "Add" window as the manager (Fields table, Rules 6, 8, 9)

async function phaseAddwin(app, X, h, page) {
    h.phase = 'addwin';
    const u = X.u; const L = h.L;
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, X.SA.submissionId));
    await h.snap('addwin-panel');
    await loc(page, 'panel › Add', h.panel().getByRole('button', {name: 'Add', exact: true}));
    let w = await h.openAdd();
    L('open timing', JSON.stringify(h.lastOpenTiming));
    const s = await h.snap('addwin-mg');
    L('window text', flat(s.text.dialog, 2500));
    L('participants', JSON.stringify(await h.participants(w)));
    L('participants fieldset numbered?', JSON.stringify(await w.locator('fieldset').first().evaluate((f) => ({attr: f.getAttribute('shownumberedlist'), ol: !!f.querySelector('ol'), listStyle: getComputedStyle(f.querySelector('label') || f).listStyleType, text: f.innerText.slice(0, 300)}))));
    await loc(page, 'Add window (dialog with input[name=title])', w);
    await loc(page, 'Add window › Name', w.locator('input[name="title"]'));
    await loc(page, 'Add window › a participant box by username', h.box(w, u('se')));
    await loc(page, 'Add window › "Enter task information"', w.getByRole('checkbox', {name: 'Enter task information'}));
    await loc(page, 'Add window › Save', w.getByRole('button', {name: 'Save', exact: true}));
    await loc(page, 'Add window › Cancel', w.getByRole('button', {name: 'Cancel', exact: true}));
    await loc(page, 'Add window › "Open for What?…" line', w.getByText('Open for What? Open to What? Beyond Content'));
    await loc(page, 'Add window › badge New', w.getByText('New', {exact: true}));
    L('toolbar', JSON.stringify(await w.getByRole('toolbar').getByRole('button').allInnerTexts().catch(() => [])),
        JSON.stringify(await w.getByRole('toolbar').getByRole('button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label') || x.innerText.trim()))));

    // Empty Save.
    await h.editorReady(w);
    const r0 = await h.save(w, 'empty');
    await h.snap('addwin-empty-save');
    L('Save disabled after refusal?', await w.getByRole('button', {name: 'Save', exact: true}).isDisabled().catch(() => null));

    // 256 characters, then 255.
    await w.locator('input[name="title"]').fill('N'.repeat(256));
    await h.tick(w, u('se'));
    await h.typeMsg(w, 'K2 long name message');
    const r256 = await h.save(w, 'name 256');
    await h.snap('addwin-name256');
    if (!r256.closed) {
        await w.locator('input[name="title"]').fill('M'.repeat(255));
        const r255 = await h.save(w, 'name 255');
        await h.snap('addwin-name255');
        if (!r255.closed) await h.closeWin(w);
    }
    await h.open(h.edUrl(X.path, X.SA.submissionId));

    // 8a: a discussion with only the manager.
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill('K2 solo discussion');
    await h.typeMsg(w, 'K2 solo message');
    await h.save(w, 'discussion, self only');
    await h.snap('addwin-solo-discussion');
    // 8b end: the manager unticks themselves and saves with two others.
    await h.tick(w, u('mg'), false);
    await h.tick(w, u('se'));
    await h.tick(w, u('au'));
    await w.locator('input[name="title"]').fill('K2 no-self discussion');
    const rNoSelf = await h.save(w, 'discussion, manager unticked, se + au');
    if (!rNoSelf.closed) await h.closeWin(w);
    // The name is the subject of the email.
    try {
        const m = await app.mail.find({to: `${u('se')}@mail.test`, contains: 'K2 no-self', timeoutMs: 15000});
        L('email to se: subject', JSON.stringify(m.Subject));
    } catch (e) { L('email to se: none', e.message.slice(0, 200)); }
    await h.open(h.edUrl(X.path, X.SA.submissionId));
    L('panel after no-self', await h.panelText());

    // Rule 9: task information.
    w = await h.openAdd();
    const taskBox = w.getByRole('checkbox', {name: 'Enter task information'});
    await taskBox.check();
    await idle(page);
    const st = await h.snap('addwin-task-fields');
    L('task fields text', flat(st.text.dialog, 3000));
    L('owners (mg only ticked)', JSON.stringify(await h.owners(w)));
    await h.tick(w, u('se'));
    L('owners (mg + se ticked)', JSON.stringify(await h.owners(w)));
    await h.tick(w, u('se'), false);
    L('owners (se unticked again)', JSON.stringify(await h.owners(w)));
    const date = w.locator('input[type="date"], input[name="dateDue"]').first();
    L('date input', JSON.stringify(await date.evaluate((e) => ({type: e.type, name: e.name, min: e.min, value: e.value})).catch((e) => String(e))));
    const sel = w.locator('select').first();
    L('drop-down', JSON.stringify(await sel.evaluate((e) => ({options: [...e.options].map((o) => o.text), selected: e.options[e.selectedIndex] && e.options[e.selectedIndex].text, disabled: e.disabled, label: (e.closest('.pkpFormField') || e.parentElement).innerText.slice(0, 200)})).catch((e) => String(e))));
    await loc(page, 'Add window › Due Date input', date);
    await loc(page, 'Add window › owner radio by username', w.getByRole('radio', {name: new RegExp(`\\(${u('mg')}\\)`)}));
    await loc(page, 'Add window › start drop-down', sel);
    await h.closeWin(w);
    // A fresh window per refusal (a refused Save stays disabled until the flagged field changes).
    const taskWin = async ({name, boxes = [], unboxes = [], owner, due, start}) => {
        await h.open(h.edUrl(X.path, X.SA.submissionId), `task window ${name}`);
        const tw = await h.openAdd();
        await tw.getByRole('checkbox', {name: 'Enter task information'}).check();
        await tw.locator('input[name="title"]').fill(name);
        for (const b of boxes) await h.tick(tw, u(b));
        if (owner) await tw.getByRole('radio', {name: new RegExp(`\\(${u(owner)}\\)`)}).check();
        for (const b of unboxes) await h.tick(tw, u(b), false);
        if (due !== undefined) await tw.locator('input[name="dateDue"]').fill(due);
        if (start) await tw.locator('select').first().selectOption({label: start});
        await h.typeMsg(tw, `${name} message`);
        return tw;
    };
    // 8c: no owner chosen.
    w = await taskWin({name: 'K2 task no owner', due: day(0)});
    await h.save(w, 'task, no owner');
    await h.snap('addwin-task-no-owner');
    // 8c: the owner chosen, then their box unticked.
    w = await taskWin({name: 'K2 task owner unticked', boxes: ['se'], owner: 'se', unboxes: ['se'], due: day(0)});
    L('owners after the owner was unticked', JSON.stringify(await h.owners(w)));
    const rOU = await h.save(w, 'task, owner se chosen then unticked');
    await h.snap('addwin-task-owner-unticked');
    if (!rOU.closed) await h.closeWin(w);
    // 8a task end: nobody ticked (the manager unticks themselves after choosing themselves).
    w = await taskWin({name: 'K2 task nobody', owner: 'mg', unboxes: ['mg'], due: day(0)});
    L('owners with nobody ticked', JSON.stringify(await h.owners(w)));
    const rNb = await h.save(w, 'task, nobody ticked');
    await h.snap('addwin-task-nobody');
    if (!rNb.closed) await h.closeWin(w);
    // A10: yesterday.
    w = await taskWin({name: 'K2 task yesterday', owner: 'mg', due: day(-1)});
    L('date value after typing yesterday', await w.locator('input[name="dateDue"]').inputValue().catch(() => null));
    const rY = await h.save(w, 'task, due yesterday');
    await h.snap('addwin-task-yesterday');
    if (!rY.closed) await h.closeWin(w);
    // No due date.
    w = await taskWin({name: 'K2 task no date', owner: 'mg'});
    const rND = await h.save(w, 'task, no due date');
    await h.snap('addwin-task-no-date');
    if (!rND.closed) await h.closeWin(w);
    // Today, "Create Task (Do Not Start)", the manager alone: a private to-do.
    w = await taskWin({name: 'K2 todo not started', owner: 'mg', due: day(0), start: 'Create Task (Do Not Start)'});
    const rTodo = await h.save(w, 'task, self only, today, do not start');
    if (!rTodo.closed) await h.closeWin(w);
    // A task with "Begin Task Upon Saving".
    w = await taskWin({name: 'K2 task begun', boxes: ['se'], owner: 'se', due: day(7)});
    const rBegin = await h.save(w, 'task, begin upon saving');
    if (!rBegin.closed) await h.closeWin(w);
    await h.open(h.edUrl(X.path, X.SA.submissionId));
    const sp = await h.snap('addwin-panel-after');
    L('panel after saves', await h.panelText());

    // The message box: "Attach Files" › "Upload File", the file under the box.
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill('K2 unsaved');
    await h.editorReady(w);
    await w.getByRole('button', {name: 'Attach Files'}).click();
    await idle(page);
    const sa = await h.snap('addwin-attach-window');
    L('attach window', flat(sa.text.dialog, 1500));
    const up = page.getByRole('dialog').last();
    const upBtn = up.getByRole('button', {name: /Upload File/}).or(up.getByRole('tab', {name: /Upload File/})).first();
    if (await upBtn.count()) { await upBtn.click().catch(() => {}); await idle(page); }
    const fileInput = page.locator('input[type="file"]').last();
    const fixture = path.join(app.root || '', 'playwright', 'fixtures', 'files', FIX[app.name]);
    const fx = fs.existsSync(fixture) ? fixture : path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files/${FIX[app.name]}`);
    await fileInput.setInputFiles(fx).catch((e) => L('file input', e.message.slice(0, 200)));
    await page.waitForTimeout(1500); await idle(page);
    const su = await h.snap('addwin-attach-uploaded');
    L('attach after upload', flat(su.text.dialog, 1500));
    const attachBtn = page.getByRole('dialog').last().getByRole('button', {name: /^Attach/});
    L('attach buttons', JSON.stringify(await page.getByRole('dialog').last().getByRole('button').allInnerTexts()));
    if (await attachBtn.count()) { await attachBtn.last().click().catch((e) => L('attach click', e.message.slice(0, 100))); await idle(page); }
    await page.waitForTimeout(500);
    const sf = await h.snap('addwin-attached');
    L('window with file', flat(sf.text.dialog, 2500));
    L('attached area', JSON.stringify(await w.evaluate((root) => { const el = root.querySelector('[class*="ttached"], [class*="FileAttacher"]'); return el ? {cls: el.className, text: el.innerText.slice(0, 300), buttons: [...el.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim())} : null; })));
    // Leave with changes: the window's close control.
    const closeCtl = w.getByRole('button', {name: 'Close', exact: true}).last();
    L('close controls in window', await w.getByRole('button', {name: 'Close', exact: true}).count());
    await closeCtl.click().catch((e) => L('close click', e.message.slice(0, 100)));
    await page.waitForTimeout(800);
    const sc = await h.snap('addwin-leave-with-changes');
    L('after close control: dialogs', JSON.stringify(sc.aria.dialogs.map((d) => d.slice(0, 300))));
    const warn = page.getByRole('dialog').filter({hasText: 'The data on this form has changed'});
    if (await warn.count()) { L('warning dialog', flat(await warn.last().innerText(), 300)); await warn.last().getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {}); }
}

// ---------------------------------------------------------------------------
// Phase roles: who is offered, per role (Rule 7, 7a; 8b; A2)

async function addAs(h, page, user, url, name, X, scope) {
    await signIn(page, user, {contextPath: X.path});
    if (url.au) await h.openAu(X.path, url.id); else await h.open(url);
    const w = await h.openAdd(scope);
    const s = await h.snap(name);
    const p = await h.participants(w);
    h.L(name, 'title/desc:', flat((s.text.dialog || '').split('Details')[0], 300));
    h.L(name, 'offered:', JSON.stringify(p));
    return w;
}

async function phaseRoles(app, X, h, page) {
    h.phase = 'roles';
    const u = X.u; const L = h.L;
    const sa = X.SA.submissionId;
    // Section editor (assigned): the manager-level people who are not assigned.
    let w = await addAs(h, page, u('se'), h.edUrl(X.path, sa), 'roles-se-SA', X);
    await h.tick(w, u('se'), false); await h.tick(w, u('au')); await h.tick(w, u('sf'));
    await w.locator('input[name="title"]').fill('K2 se unticked self');
    await h.typeMsg(w, 'K2 se message');
    await h.save(w, 'se, self unticked, au + sf');
    await h.snap('roles-se-creator-refusal');
    await h.tick(w, u('se'));
    const r = await h.save(w, 'se, self ticked again');
    if (!r.closed) await h.closeWin(w);
    // Author.
    w = await addAs(h, page, u('au'), {au: true, id: sa}, 'roles-au-SA', X);
    await h.closeWin(w);
    // Manager also a section editor, and the site administrator.
    w = await addAs(h, page, u('ms'), h.edUrl(X.path, sa), 'roles-ms-SA', X);
    await h.closeWin(w);
    w = await addAs(h, page, 'admin', h.edUrl(X.path, sa), 'roles-admin-SA', X);
    await h.closeWin(w);
    if (app.name !== 'ops') {
        // Editor (manager-level, not assigned).
        w = await addAs(h, page, u('ed'), h.edUrl(X.path, sa), 'roles-ed-SA', X);
        await h.closeWin(w);
        // Copyeditor on copyediting; the same submission's first stage as the manager.
        w = await addAs(h, page, u('ce'), h.edUrl(X.path, X.SC.submissionId, 'workflow_4'), 'roles-ce-SC-copyediting', X);
        await h.closeWin(w);
        w = await addAs(h, page, u('mg'), h.edUrl(X.path, X.SC.submissionId, 'workflow_1'), 'roles-mg-SC-submission', X);
        await h.closeWin(w);
        w = await addAs(h, page, u('mg'), h.edUrl(X.path, X.SC.submissionId, 'workflow_4'), 'roles-mg-SC-copyediting', X);
        await h.closeWin(w);
    }
}

// ---------------------------------------------------------------------------
// Phase review: reviewers offered, anonymity refusals (7b–7d, 8d, A14)

async function toStep3(page, h) {
    const sc1 = page.getByRole('button', {name: 'Save and continue'});
    if (await sc1.count()) { await sc1.first().click(); await idle(page); }
    const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
    await c3.waitFor({timeout: 15000}).catch(() => {});
    if (await c3.count() && !(await c3.isDisabled())) { await c3.click(); await idle(page); }
    await page.getByRole('tabpanel', {name: '3. Download & Review'}).getByRole('button', {name: 'Add', exact: true}).waitFor({timeout: 30000}).catch(() => h.L('no Add on step 3'));
    await idle(page);
}

async function phaseReview(app, R, h, page) {
    h.phase = `review-${R.mode}`;
    const {L} = h;
    const u = R.u;
    const id = R.SR.submissionId;
    const tryAdd = async (w, label, boxes, name) => {
        for (const b of boxes) await h.tick(w, b);
        await w.locator('input[name="title"]').fill(name);
        await h.typeMsg(w, `${name} message`);
        const res = await h.save(w, label);
        await h.snap(`review-${R.mode}-${name.replace(/\W+/g, '-')}`);
        return res;
    };
    // The manager.
    await signIn(page, u('mg'), {contextPath: R.path});
    if (R.mode === 'doubleAnonymous') {
        // Cancel r4 on the Reviewers panel.
        await page.goto(h.edUrl(R.path, id));
        await idle(page);
        const row = page.locator('[data-cy="reviewer-manager"]').getByRole('row').filter({hasText: 'Rufus'}).first();
        try {
            await row.getByRole('button', {name: /More Actions/}).click();
            await page.getByRole('menuitem', {name: 'Cancel Reviewer', exact: true}).click();
            const m = page.locator('[data-cy="active-modal"]').last();
            await m.getByText('Choose a predefined message to use').waitFor({timeout: 20000}).catch(() => {});
            await page.frameLocator('iframe[id^="personalMessage"]').last().locator('body').filter({hasText: /\w/}).waitFor({timeout: 20000}).catch(() => {});
            await m.getByRole('button', {name: 'Cancel Reviewer', exact: true}).click();
            await row.filter({hasText: 'Request Cancelled'}).waitFor({timeout: 20000}).catch(() => L('r4 row did not read Request Cancelled'));
            L('r4 row', flat(await row.innerText().catch(() => ''), 200));
        } catch (e) { L('cancel r4 failed', e.message.slice(0, 200)); }
    }
    await h.open(h.edUrl(R.path, id));
    let w = await h.openAdd();
    await h.snap(`review-${R.mode}-mg-add`);
    L('mg offered', JSON.stringify(await h.participants(w)));
    const second = R.mode === 'doubleAnonymous' ? 'r5' : 'r2';
    let res = await tryAdd(w, `mg: r1 + ${second}`, [u('r1'), u(second)], 'K2 two reviewers');
    if (res.closed) { await h.open(h.edUrl(R.path, id)); w = await h.openAdd(); } else { await h.tick(w, u(second), false); }
    res = await tryAdd(w, 'mg: r1 + author', [u('r1'), u('au')], 'K2 reviewer and author');
    if (!res.closed) await h.closeWin(w);
    // The author.
    await signIn(page, u('au'), {contextPath: R.path});
    await h.open(h.auUrl(R.path, id));
    w = await h.openAdd();
    await h.snap(`review-${R.mode}-au-add`);
    L('au offered', JSON.stringify(await h.participants(w)));
    await h.closeWin(w);
    // Reviewer r1, step 3.
    await signIn(page, u('r1'), {contextPath: R.path});
    await page.goto(app.url(`/index.php/${R.path}/en/reviewer/submission/${id}`));
    await idle(page);
    await toStep3(page, h);
    const tp = page.getByRole('tabpanel', {name: '3. Download & Review'});
    w = await h.openAdd(tp);
    const s = await h.snap(`review-${R.mode}-r1-add`);
    L('r1 add window', flat(s.text.dialog, 1500));
    const offered = await h.participants(w);
    L('r1 offered', JSON.stringify(offered));
    if (offered.some((o) => o.label.includes(`(${u('au')})`))) {
        res = await tryAdd(w, 'r1: + author + se', [u('au'), u('se')], 'K2 reviewer with author');
        if (!res.closed) { await h.tick(w, u('au'), false); res = await tryAdd(w, 'r1: se only', [], 'K2 reviewer with editor'); }
    } else {
        res = await tryAdd(w, 'r1: + se', [u('se')], 'K2 reviewer with editor');
    }
    if (!res.closed) await h.closeWin(w);
    // The reviewer's own item: its row menu and "Edit".
    try {
        await page.goto(app.url(`/index.php/${R.path}/en/reviewer/submission/${id}?step=3`));
        await idle(page);
        await tp.getByRole('button', {name: 'Add', exact: true}).waitFor({timeout: 30000});
        await idle(page);
        const row = tp.getByRole('row').filter({hasText: 'K2 reviewer with'}).first();
        await row.getByRole('button', {name: /More Actions/}).click();
        L('r1 row menu', JSON.stringify(await page.getByRole('menuitem').allInnerTexts()));
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        w = h.win(); await w.waitFor({timeout: 30000}); await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => {}); await idle(page);
        const se = await h.snap(`review-${R.mode}-r1-edit`);
        L('r1 edit window head', flat((se.text.dialog || '').split('Details')[0], 300));
        L('r1 edit offered', JSON.stringify(await h.participants(w)));
        await h.closeWin(w);
    } catch (e) { L('r1 edit failed', e.message.slice(0, 200)); }
}

// ---------------------------------------------------------------------------
// Phase edit: the "Edit" window (Fields rows, 7e, 8b on an edit, A2)

async function phaseEdit(app, X, h, page) {
    h.phase = 'edit';
    const u = X.u; const L = h.L;
    const id = X.SE.submissionId;
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id));
    // 7e: remove sf from the stage (Participants panel › Remove), then edit the item that names sf.
    try {
        const li = page.locator('[data-cy="workflow-secondary-items"] li').filter({hasText: 'Sofia Second'}).first();
        await li.getByRole('button', {name: /More Actions/}).click();
        await page.getByRole('menuitem', {name: 'Remove', exact: true}).click();
        const dlg = page.getByRole('dialog', {name: 'Remove Participant', exact: true});
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        await dlg.waitFor({state: 'hidden', timeout: 30000});
        L('sf removed from the stage');
    } catch (e) { L('remove sf failed', e.message.slice(0, 200)); }
    await h.open(h.edUrl(X.path, id));
    let w = await h.openAdd();
    L('Add after removal offered', JSON.stringify(await h.participants(w)));
    await h.closeWin(w);
    await h.open(h.edUrl(X.path, id));
    L('menu of left discussion', JSON.stringify(await h.rowMenu('K2 left discussion', 'Edit')));
    w = h.win(); await w.waitFor({timeout: 30000}); await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('edit: no participant boxes')); await idle(page);
    let s = await h.snap('edit-left-discussion');
    L('edit left discussion', flat(s.text.dialog, 2000));
    L('edit left offered', JSON.stringify(await h.participants(w)));
    await h.closeWin(w);
    // The item's own participants, before and after an unchanged "Save" of "Edit".
    const partsOf = async (name) => {
        await h.open(h.edUrl(X.path, id));
        const iw = await h.openItem(name);
        await iw.getByRole('group', {name: 'Details'}).getByText(/^1\. /).first().waitFor({timeout: 15000}).catch(() => L('no numbered participant in the window'));
        const txt = await iw.getByRole('group', {name: 'Details'}).innerText().catch(() => '');
        await iw.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
        await page.waitForTimeout(500);
        return flat(txt, 600);
    };
    L('left discussion participants (window)', await partsOf('K2 left discussion'));
    await h.open(h.edUrl(X.path, id));
    await h.rowMenu('K2 left discussion', 'Edit');
    w = h.win(); await w.waitFor({timeout: 30000}); await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => {}); await idle(page);
    await h.editorReady(w);
    L('left edit: Save disabled untouched?', await w.getByRole('button', {name: 'Save', exact: true}).isDisabled());
    const rl = await h.save(w, 'edit left discussion, unchanged');
    if (!rl.closed) await h.closeWin(w);
    L('left discussion participants after the edit save (window)', await partsOf('K2 left discussion'));
    // The se-created discussion: the manager removes the creator.
    await h.open(h.edUrl(X.path, id));
    await h.rowMenu('K2 se discussion', 'Edit');
    w = h.win(); await w.waitFor({timeout: 30000}); await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('edit: no participant boxes')); await idle(page);
    s = await h.snap('edit-se-discussion');
    L('edit se discussion', flat(s.text.dialog, 2000));
    L('edit se offered', JSON.stringify(await h.participants(w)));
    L('task box on a discussion edit', JSON.stringify(await w.getByRole('checkbox', {name: 'Enter task information'}).evaluate((e) => ({checked: e.checked, disabled: e.disabled})).catch((e) => String(e))));
    await h.editorReady(w);
    L('message box content', JSON.stringify(await page.evaluate(() => window.tinymce && window.tinymce.get().map((e) => ({id: e.id, text: e.getContent({format: 'text'})}))).catch(() => null)));
    await h.tick(w, u('se'), false);
    await h.tick(w, u('mg'));
    const r1 = await h.save(w, 'edit: manager unticks the creator se, ticks self');
    await h.snap('edit-creator-removed');
    if (!r1.closed) await h.closeWin(w);
    // The manager's task: task box and drop-down greyed.
    await h.open(h.edUrl(X.path, id));
    await h.rowMenu('K2 mg task', 'Edit');
    w = h.win(); await w.waitFor({timeout: 30000}); await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('edit: no participant boxes')); await idle(page);
    s = await h.snap('edit-mg-task');
    L('edit task', flat(s.text.dialog, 2500));
    L('task box on a task edit', JSON.stringify(await w.getByRole('checkbox', {name: 'Enter task information'}).evaluate((e) => ({checked: e.checked, disabled: e.disabled})).catch((e) => String(e))));
    L('drop-down on a task edit', JSON.stringify(await w.locator('select').first().evaluate((e) => ({selected: e.options[e.selectedIndex] && e.options[e.selectedIndex].text, disabled: e.disabled})).catch((e) => String(e))));
    L('owners on a task edit', JSON.stringify(await h.owners(w)));
    await h.closeWin(w);
    // The author edits their own discussion.
    await signIn(page, u('au'), {contextPath: X.path});
    await h.openAu(X.path, id);
    L('author menu', JSON.stringify(await h.rowMenu('K2 author discussion', 'Edit').catch((e) => e.message.slice(0, 100))));
    w = h.win(); await w.waitFor({timeout: 30000}).catch(() => {}); await idle(page);
    s = await h.snap('edit-author-discussion');
    L('author edit window', flat(s.text.dialog, 1200));
    await h.closeWin(w);
    // 7e: an item holding a manager-level participant the Author is not offered.
    await h.openAu(X.path, id);
    w = await h.openAdd();
    L('author Add offered', JSON.stringify(await h.participants(w)));
    await h.closeWin(w);
    await h.openAu(X.path, id);
    await h.rowMenu('K2 author with manager', 'Edit').catch((e) => L('author with manager menu', e.message.slice(0, 100)));
    w = h.win(); await w.waitFor({timeout: 30000}).catch(() => {}); await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => {}); await idle(page);
    await h.snap('edit-author-with-manager');
    L('author Edit offered (item holds the manager)', JSON.stringify(await h.participants(w)));
    await h.closeWin(w);
    // The section editor edits their own discussion.
    await signIn(page, u('se'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id, app.name === 'ops' ? 'workflow_5' : null));
    L('se menu', JSON.stringify(await h.rowMenu('K2 se discussion', 'Edit').catch((e) => e.message.slice(0, 100))));
    w = h.win(); await w.waitFor({timeout: 30000}).catch(() => {}); await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => {}); await idle(page);
    s = await h.snap('edit-se-own-discussion');
    L('se edit window head', flat((s.text.dialog || '').split('Details')[0], 300));
    L('se edit offered', JSON.stringify(await h.participants(w)));
    await h.closeWin(w);
}

// ---------------------------------------------------------------------------
// Phase window: the discussion window's boxes and new message

async function winBoxes(h, w) {
    return w.getByRole('checkbox').evaluateAll((els) => els.map((e) => ({label: ((e.closest('label') || e.parentElement).innerText || e.getAttribute('aria-label') || '').trim().slice(0, 80), checked: e.checked, disabled: e.disabled})));
}

async function phaseWindow(app, X, h, page) {
    h.phase = 'window';
    const u = X.u; const L = h.L;
    const id = X.SW.submissionId;
    const closeItem = async (w) => { await w.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {}); await page.waitForTimeout(500); await idle(page); };
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id));
    L('panel', await h.panelText());
    for (const name of ['K2 T1 yet', 'K2 T2 started', 'K2 D1']) {
        const w = await h.openItem(name);
        const s = await h.snap(`window-mg-${name.replace(/\W+/g, '-')}`);
        L(`mg window ${name}`, flat(s.text.dialog, 1500));
        L(`mg boxes ${name}`, JSON.stringify(await winBoxes(h, w)));
        if (name === 'K2 D1') {
            // New message, empty Save.
            await w.getByRole('button', {name: 'Add New Message'}).click();
            await idle(page);
            await h.editorReady(w);
            const btns = await w.getByRole('button').allInnerTexts();
            L('buttons after Add New Message', JSON.stringify(btns));
            await h.snap('window-new-message');
            await w.getByRole('button', {name: 'Save', exact: true}).last().click();
            await page.waitForTimeout(800);
            L('empty new message errors', JSON.stringify(await h.errors(w)));
            await h.snap('window-new-message-empty-save');
            L('toolbar new message', JSON.stringify(await w.getByRole('toolbar').getByRole('button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label') || x.innerText.trim()))));
        }
        await closeItem(w);
        await h.open(h.edUrl(X.path, id));
    }
    // Press each window box: what happens (a confirm, the box, "Save", the answer).
    for (const [name, box] of [['K2 T1 yet', 'Start this task'], ['K2 T2 started', 'Complete this task'], ['K2 D1', 'Close this Discussion']]) {
        h.step = `window box ${box}`;
        const w = await h.openItem(name);
        const t0 = Date.now();
        const cb = w.getByRole('checkbox', {name: box});
        await cb.click().catch((e) => L('box click', e.message.slice(0, 120)));
        await page.waitForTimeout(1000);
        const conf = page.getByRole('dialog').filter({hasNotText: 'Message from'});
        const confText = (await conf.count()) ? flat(await conf.last().innerText().catch(() => ''), 300) : null;
        const saveBtn = w.getByRole('button', {name: 'Save', exact: true}).last();
        const st = {box, checked: await cb.isChecked().catch(() => null), confirm: confText, saveDisabled: await saveBtn.isDisabled().catch(() => null)};
        if (confText) await conf.last().getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
        if (st.saveDisabled === false) {
            await saveBtn.click();
            await page.waitForTimeout(1500); await idle(page);
            st.afterSaveBoxes = await winBoxes(h, w);
        }
        st.answers = h.answers.filter((a) => a.t >= t0 && a.method !== 'GET').map((a) => `${a.method} ${a.url} ${a.status}${a.body ? ' ' + a.body.slice(0, 200) : ''}`);
        L('window box press', JSON.stringify(st));
        await h.snap(`window-press-${name.replace(/\W+/g, '-')}`);
        await closeItem(w);
        await h.open(h.edUrl(X.path, id));
        const w2 = await h.openItem(name);
        L(`reopened ${name}`, JSON.stringify(await winBoxes(h, w2)));
        await closeItem(w2);
        await h.open(h.edUrl(X.path, id));
    }
    L('panel after window presses', await h.panelText());
    // Close T2 and D1 through the row's "Closed" box (Rule 17), then read the window boxes.
    for (const name of ['K2 T2 started', 'K2 D1']) {
        h.step = `row Closed box ${name}`;
        const row = h.panel().getByRole('row').filter({hasText: name}).first();
        const closedBox = row.locator('input[type="checkbox"]').last();
        L(`row ${name} Closed box before`, JSON.stringify(await closedBox.evaluate((e) => ({checked: e.checked, disabled: e.disabled}))));
        if (!(await closedBox.isChecked())) {
            await closedBox.locator('xpath=..').click();
            const conf = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Yes', exact: true})}).last();
            await conf.waitFor({timeout: 10000}).catch(() => L('no confirm on the row box'));
            L(`row confirm ${name}`, flat(await conf.innerText().catch(() => ''), 300));
            await conf.getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
            await idle(page); await page.waitForTimeout(800);
        }
        await h.open(h.edUrl(X.path, id));
        const w = await h.openItem(name);
        const s = await h.snap(`window-closed-${name.replace(/\W+/g, '-')}`);
        L(`closed ${name} window`, flat(s.text.dialog, 900));
        L(`closed ${name} boxes`, JSON.stringify(await winBoxes(h, w)));
        L(`closed ${name} Edit button`, JSON.stringify(await w.getByRole('button', {name: 'Edit', exact: true}).evaluateAll((b) => b.map((x) => ({disabled: x.disabled})))));
        await closeItem(w);
        await h.open(h.edUrl(X.path, id));
    }
    L('panel after closing', await h.panelText());
    // The ownerless auto task (Created by: system).
    const autoUrl = app.name === 'ops' ? h.edUrl(X.path, id) : h.edUrl(X.path, X.SC.submissionId, 'workflow_4');
    await h.open(autoUrl);
    L('auto panel', await h.panelText());
    try {
        const w = await h.openItem('K2 auto task');
        await h.snap('window-mg-auto-task');
        L('auto task boxes', JSON.stringify(await winBoxes(h, w)));
        await closeItem(w);
    } catch (e) { L('auto task window', e.message.slice(0, 200)); }
    // Participant who may not manage (the Author), and the owner (se).
    for (const who of ['au', 'se']) {
        await signIn(page, u(who), {contextPath: X.path});
        await (who === 'au' ? h.openAu(X.path, id) : h.open(h.edUrl(X.path, id)));
        L(`${who} panel`, await h.panelText());
        for (const name of ['K2 T1 yet', 'K2 D1']) {
            try {
                const w = await h.openItem(name);
                const s = await h.snap(`window-${who}-${name.replace(/\W+/g, '-')}`);
                L(`${who} window ${name}`, flat(s.text.dialog, 1000));
                L(`${who} boxes ${name}`, JSON.stringify(await winBoxes(h, w)));
                await closeItem(w);
                await (who === 'au' ? h.openAu(X.path, id) : h.open(h.edUrl(X.path, id)));
            } catch (e) { L(`${who} window ${name} failed`, e.message.slice(0, 200)); }
        }
    }
}

// ---------------------------------------------------------------------------
// Phase templates: Settings › Workflow › "Tasks and Discussions" windows

async function phaseTemplates(app, X, h, page) {
    h.phase = 'templates';
    const u = X.u; const L = h.L;
    await signIn(page, u('mg'), {contextPath: X.path});
    await page.goto(app.url(`/index.php/${X.path}/en/management/settings/workflow`));
    await idle(page);
    await page.getByRole('tab', {name: 'Tasks and Discussions'}).click().catch((e) => L('tab', e.message.slice(0, 100)));
    await idle(page);
    const s0 = await h.snap('templates-tab');
    L('tab text', flat(s0.text.main, 2500));
    const adds = page.locator('button:visible', {hasText: 'Add template'});
    const n = await adds.count();
    L('Add template buttons', n);
    const tw = () => page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    for (let i = 0; i < n; i++) {
        await adds.nth(i).click();
        const w = tw(); await w.waitFor({timeout: 30000}); await idle(page);
        const title = await w.getByRole('heading').first().innerText().catch(() => '');
        await w.getByRole('radio', {name: 'Limit access to specific roles'}).check().catch((e) => L('limit radio', e.message.slice(0, 100)));
        await w.locator('input[name="userGroupIds"]').first().waitFor({timeout: 15000}).catch(() => L('no role boxes arrived'));
        await idle(page);
        const roles = await w.locator('input[name="userGroupIds"]').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText.trim())).catch(() => []);
        L(`stage ${i} "${title}" role boxes`, JSON.stringify(roles));
        if (i === 0) {
            await w.getByRole('radio', {name: 'Mark as unrestricted'}).check().catch(() => {});
            const s = await h.snap('templates-add-window');
            L('add template window', flat(s.text.dialog, 3000));
            L('radios', JSON.stringify(await w.getByRole('radio').evaluateAll((els) => els.map((e) => ({label: (e.closest('label') || e.parentElement).innerText.trim(), checked: e.checked})))));
            L('auto-add box', JSON.stringify(await w.getByRole('checkbox', {name: /Automatically add/}).evaluate((e) => ({checked: e.checked})).catch((e) => String(e))));
            await h.editorReady(w);
            L('toolbar', JSON.stringify(await w.getByRole('toolbar').getByRole('button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label') || x.innerText.trim()))));
            // Empty Save.
            await w.getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForTimeout(1000); await idle(page);
            L('empty template save errors', JSON.stringify(await h.errors(w)));
            await h.snap('templates-empty-save');
            // Limit access with no role; a task with no due date.
            await w.locator('input[name="title"]').fill('K2 template');
            await h.typeMsg(w, 'K2 template text');
            await w.getByRole('radio', {name: 'Limit access to specific roles'}).check();
            await w.getByRole('checkbox', {name: 'Enter task information'}).check();
            await idle(page);
            const s2 = await h.snap('templates-task-fields');
            L('template task fields', flat(s2.text.dialog, 3000));
            L('due select', JSON.stringify(await w.locator('select').first().evaluate((e) => ({options: [...e.options].map((o) => o.text), selected: e.options[e.selectedIndex] && e.options[e.selectedIndex].text})).catch((e) => String(e))));
            await w.getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForTimeout(1000); await idle(page);
            L('limit-no-role + task-no-due errors', JSON.stringify(await h.errors(w)));
            await h.snap('templates-limit-task-save');
            // Insert Content.
            const ins = w.getByRole('button', {name: 'Insert Content'});
            if (await ins.count()) {
                await ins.first().click(); await idle(page);
                const si = await h.snap('templates-insert-content');
                L('insert content', flat(si.text.dialog, 1500));
                const closeIns = page.getByRole('dialog').last().getByRole('button', {name: /Close|Cancel/}).first();
                await closeIns.click().catch(() => {});
                await idle(page);
            } else L('no Insert Content button');
            // Leave with changes via the window's close control.
            await w.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
            await page.waitForTimeout(800);
            const sl = await h.snap('templates-leave-with-changes');
            L('after close with changes: dialogs', JSON.stringify(sl.aria.dialogs.map((d) => d.slice(0, 300))));
            const warn = page.getByRole('dialog').filter({hasText: 'The data on this form has changed'});
            if (await warn.count()) await warn.last().getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
            await w.waitFor({state: 'hidden', timeout: 10000}).catch(() => L('template window still open after Warning Yes'));
            await page.waitForTimeout(600);
            await idle(page);
        } else {
            await h.closeWin(w);
            await page.waitForTimeout(600);
        }
    }
    // A row's "Edit".
    const row = page.getByRole('row').filter({hasText: 'Assign Editor'}).first();
    try {
        await row.getByRole('button', {name: /More Actions/}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const w = tw(); await w.waitFor({timeout: 30000}); await idle(page);
        await h.editorReady(w);
        const s = await h.snap('templates-edit-window');
        L('edit template window', flat(s.text.dialog, 3000));
        L('edit radios', JSON.stringify(await w.getByRole('radio').evaluateAll((els) => els.map((e) => ({label: (e.closest('label') || e.parentElement).innerText.trim(), checked: e.checked})))));
        await w.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
    } catch (e) { L('template row edit', e.message.slice(0, 200)); }
    // The seeded auto-add template: the list's box and the window's box.
    try {
        await page.goto(app.url(`/index.php/${X.path}/en/management/settings/workflow`));
        await idle(page);
        await page.getByRole('tab', {name: 'Tasks and Discussions'}).click();
        await idle(page);
        const arow = page.getByRole('row').filter({hasText: 'K2 auto task'}).first();
        L('auto template row boxes', JSON.stringify(await arow.locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => ({checked: e.checked, disabled: e.disabled})))));
        await arow.getByRole('button', {name: /More Actions/}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const w = tw(); await w.waitFor({timeout: 30000}); await idle(page);
        L('auto template window box', JSON.stringify(await w.getByRole('checkbox', {name: /Automatically add/}).evaluate((e) => ({checked: e.checked})).catch((e) => String(e))));
        await h.snap('templates-auto-edit-window');
        await h.closeWin(w);
    } catch (e) { L('auto template read', e.message.slice(0, 200)); }
}


// ---------------------------------------------------------------------------
// Phase leave: does leaving the page raise the browser's "Leave site?" box
// after the "Add" window was closed (untouched, discarded, saved)?

async function phaseLeave(app, X, h, page) {
    h.phase = 'leave';
    const u = X.u; const L = h.L;
    const url = h.edUrl(X.path, X.SA.submissionId);
    const leave = async (label) => {
        const before = h.browserDialogs.length;
        h.step = `leave after: ${label}`;
        await page.goto(app.url(`/index.php/${X.path}/en/dashboard/editorial`)).catch(() => {});
        await idle(page);
        L(`leave after "${label}":`, JSON.stringify(h.browserDialogs.slice(before).map((d) => d.type)));
    };
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(url);
    let w = await h.openAdd();
    await h.closeWin(w);
    await leave('untouched, Cancel');
    await h.open(url);
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill('Leave probe');
    await h.closeWin(w);
    await leave('name typed, Cancel, Warning Yes');
    await h.open(url);
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill('Leave probe saved');
    await h.tick(w, u('se'));
    await h.typeMsg(w, 'Leave probe message');
    await h.save(w, 'leave probe');
    await leave('saved');
    await h.open(url);
    await leave('page opened, no window');
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const h = helpers(app, page);
    const guard = async (name, fn) => {
        try { await fn(); } catch (e) {
            h.L(`[error in ${name}]`, String(e.stack || e.message).slice(0, 1200));
            await shot(page, `error-${name}`).catch(() => {});
        }
    };
    try {
        const needX = PHASES.some((p) => ['addwin', 'roles', 'edit', 'window', 'templates', 'leave'].includes(p));
        let X = null;
        const xFile = path.join(outDir(), `x-${app.name}.json`);
        if (needX && process.env.REUSE && fs.existsSync(xFile)) {
            X = JSON.parse(fs.readFileSync(xFile, 'utf8'));
            X.u = (s) => `${X.t}${s}`;
        } else if (needX) {
            X = await seedX(app);
            fs.writeFileSync(xFile, JSON.stringify(X, null, 2));
        }
        if (PHASES.includes('addwin')) await guard('addwin', () => phaseAddwin(app, X, h, page));
        if (PHASES.includes('roles')) await guard('roles', () => phaseRoles(app, X, h, page));
        if (PHASES.includes('edit')) await guard('edit', () => phaseEdit(app, X, h, page));
        if (PHASES.includes('window')) await guard('window', () => phaseWindow(app, X, h, page));
        if (PHASES.includes('templates')) await guard('templates', () => phaseTemplates(app, X, h, page));
        if (PHASES.includes('leave')) await guard('leave', () => phaseLeave(app, X, h, page));
        if (PHASES.includes('review') && app.name !== 'ops') {
            for (const mode of ['doubleAnonymous', 'anonymous', 'open']) {
                const R = await seedReview(app, mode);
                await guard(`review-${mode}`, () => phaseReview(app, R, h, page));
            }
        }
        if (PHASES.includes('review') && app.name === 'ops') {
            try { await seedReview(app, 'doubleAnonymous'); } catch (e) { h.L('[ops review seed]', String(e.message).slice(0, 300)); }
        }
    } finally {
        fs.writeFileSync(path.join(outDir(), `answers-${app.name}.json`), JSON.stringify(h.answers, null, 2));
        record('browser-dialogs', h.browserDialogs);
        await close();
    }
});
