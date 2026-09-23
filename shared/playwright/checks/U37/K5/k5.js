// U37 claim check, chunk K5 — the discussion window, replying, attaching
// files, and the side effects of an item and a message (notices, the
// discussion email in Mailpit, the event log)
// (docs/specs/U37-tasks-and-discussions.md, Rules 12–14, Side effects,
// register A3).
//
// Seeds its own scratch contexts per app (nothing on publicknowledge):
//   X — manager mg; section editors se, s2, n1 (will untick "Enable these
//       types of notifications." for "Discussion added."), n2 (will tick
//       "Do not send me an email…"), dz (disabled on screen later); author
//       au; OJS/OMP copyeditor ce, layout editor le, reviewer r1; OJS guest
//       editor ge. Submissions: S1 (Submission stage; OPS Production) with a
//       seeded "Submission Files" file on OJS/OMP; SR (review, r1 accepted;
//       OJS/OMP). The notice phase seeds its own Copyediting and Production
//       submissions (accepted from review) on each run.
//   Y — "Auto-add at stage" switched on for a Production discussion and task
//       template; OJS/OMP: SY at Copyediting, sent to Production on screen;
//       OPS: SY a draft the author submits through the wizard.
//
//   PROBE_FEATURE=U37 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U37/K5/k5.js
//   PHASES=prefs,create,window,replies,states,boxes,edit,log,wfmenu,disabled,tasks,reviewer,notice,auto (default all);
//   REUSE=1 reuses the last seeded X/Y (x-<app>.json) and the item names saved there.
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app phase]); facts-<app>.json
// collects the structured reads (mail, windows, lists).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'prefs,create,window,replies,states,boxes,edit,log,wfmenu,disabled,tasks,reviewer,notice,auto';
const PHASES = (process.env.PHASES || ALL).split(',');
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const rnd = () => Math.random().toString(36).slice(2, 7);
const FIX = {ojs: 'notes.md', omp: 'notes.md', ops: 'not-an-image.txt'};
const fixturePath = (app) => path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files/${FIX[app.name]}`);

// ---------------------------------------------------------------------------
// Seeding

async function seedX(app) {
    const t = tag('u37k5x');
    const u = (s) => `${t}${s}`;
    const ops = app.name === 'ops';
    const ojs = app.name === 'ojs';
    const users = [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Editor'},
        {username: u('s2'), roles: ['sectionEditor'], givenName: 'Sofia', familyName: 'Second'},
        {username: u('n1'), roles: ['sectionEditor'], givenName: 'Nina', familyName: 'Nothing'},
        {username: u('n2'), roles: ['sectionEditor'], givenName: 'Noah', familyName: 'Rowonly'},
        {username: u('dz'), roles: ['sectionEditor'], givenName: 'Dana', familyName: 'Disabled'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ];
    if (!ops) {
        users.push({username: u('ce'), roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copy'});
        users.push({username: u('le'), roles: ['layoutEditor'], givenName: 'Leo', familyName: 'Layout'});
        users.push({username: u('r1'), roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'Reviewer'});
    }
    if (ojs) users.push({username: u('ge'), roles: ['guestEditor'], givenName: 'Gil', familyName: 'Guest'});
    const C = await app.api.createContext({tag: t, users});
    const base = {context: C.path, submitter: u('au')};
    const eds = ['se', 's2', 'n1', 'n2', 'dz'].map((k) => ({username: u(k), role: 'sectionEditor'}));
    if (ojs) eds.push({username: u('ge'), role: 'guestEditor'});
    const X = {t, path: C.path};
    const s1 = {...base, tag: `${t}a`, title: `K5 S1 ${t}`, participants: eds};
    if (!ops) s1.files = [{file: 'article.pdf'}];
    X.S1 = await app.api.createSubmission(s1);
    if (!ops) {
        X.SR = await app.api.createSubmission({...base, tag: `${t}r`, title: `K5 SR ${t}`, participants: [{username: u('se'), role: 'sectionEditor'}],
            decisions: [app.name === 'omp' ? 'skipInternalReview' : 'sendExternalReview'], reviewRounds: [{reviewers: [{username: u('r1'), status: 'accepted'}]}]});
    }
    X.names = {};
    const ids = {};
    for (const k of ['S1', 'SR', 'SC1', 'SC2', 'SP1', 'SP2']) if (X[k]) ids[k] = X[k].submissionId;
    console.log(`[${app.name} seed X]`, JSON.stringify({path: X.path, ids, files: X.S1.files, rounds: X.SR && X.SR.reviewRounds}));
    return X;
}

async function seedY(app) {
    const t = tag('u37k5y');
    const u = (s) => `${t}${s}`;
    const ops = app.name === 'ops';
    const users = [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Editor'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ];
    const C = await app.api.createContext({tag: t, users, taskTemplates: [
        {stage: 'production', title: `K5 auto discussion ${t}`, type: 'discussion', include: true, message: 'K5 auto discussion text'},
        {stage: 'production', title: `K5 auto task ${t}`, type: 'task', dueInterval: 'P1W', include: true, message: 'K5 auto task text'},
    ]});
    const Y = {t, path: C.path};
    const base = {context: C.path, submitter: u('au'), tag: `${t}y`, title: `K5 SY ${t}`};
    if (ops) Y.SY = await app.api.createSubmission({...base, submitted: false});
    else Y.SY = await app.api.createSubmission({...base, participants: [{username: u('se'), role: 'sectionEditor'}],
        decisions: app.name === 'omp' ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept']});
    console.log(`[${app.name} seed Y]`, JSON.stringify({path: Y.path, SY: Y.SY.submissionId}));
    return Y;
}

// ---------------------------------------------------------------------------
// Screen helpers

function helpers(app, page, facts) {
    const h = {facts};
    const L = (...a) => console.log(`[${app.name}${h.phase ? ' ' + h.phase : ''}]`, ...a);
    h.L = L;
    h.fact = (k, v) => { facts[k] = v; L(k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 2500)); };
    h.edUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.auUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.panel = () => page.locator('[data-cy="discussion-manager"]').first();
    h.snap = async (name, extra) => { const s = await screen(page); record(name, extra ? {...s, extra} : s); await shot(page, name).catch(() => {}); return s; };
    h.open = async (url, step) => {
        h.step = step || `open ${url.replace(/^.*index.php/, '')}`;
        await page.goto(url);
        await h.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => L('no Add button on', url));
        await idle(page);
    };
    // The Author's view; a preprint server's Author reaches the panel through the
    // publication menu's "Production Tasks & Discussions" link.
    h.openAu = async (p, id, key) => {
        if (app.name !== 'ops') return h.open(h.auUrl(p, id, key));
        h.step = `author view ${id}`;
        await page.goto(h.auUrl(p, id));
        await idle(page);
        await page.getByRole('link', {name: 'Production Tasks & Discussions'}).first().click();
        await h.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => L('no Add button in the author view'));
        await idle(page);
    };
    // Every tasks-API answer.
    h.answers = [];
    page.on('response', async (r) => {
        if (!/\/api\/v1\/.*(tasks|participants|temporaryFiles|submissionFiles|files)/.test(r.url())) return;
        const req = r.request();
        const e = {t: Date.now(), method: req.method(), override: req.headers()['x-http-method-override'] || null, url: r.url().replace(/^.*\/api\/v1/, ''), status: r.status()};
        if (r.status() >= 400 && r.status() < 500) e.body = (await r.text().catch(() => '')).slice(0, 300);
        h.answers.push(e);
    });
    h.since = (t0) => h.answers.filter((a) => a.t >= t0 && a.method !== 'GET').map((a) => `${a.method}${a.override ? '→' + a.override : ''} ${a.url} ${a.status}${a.body ? ' ' + a.body : ''}`);
    h.browserDialogs = [];
    page.on('dialog', async (d) => {
        h.browserDialogs.push({type: d.type(), message: d.message(), step: h.step || '-', phase: h.phase});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    // Visible dialogs as data (name, text, buttons with state, selects with options, boxes).
    h.dialogs = () => page.evaluate(() => {
        const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        return [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter(vis).map((d) => ({
            name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && (document.getElementById(d.getAttribute('aria-labelledby')) || {}).innerText) || null,
            text: d.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 2500),
            buttons: [...d.querySelectorAll('button, a[href]')].filter(vis).map((b) => `${(b.getAttribute('aria-label') || b.innerText || '').trim()}${b.disabled || b.getAttribute('aria-disabled') === 'true' ? '(dis)' : ''}`).filter((x) => x && x !== '(dis)'),
            selects: [...d.querySelectorAll('select')].filter(vis).map((s) => ({label: (s.labels && s.labels[0] ? s.labels[0].innerText : s.getAttribute('aria-label') || s.name || '').trim(), value: s.value, options: [...s.options].map((o) => `${o.value}=${o.text.trim()}`)})),
            boxes: [...d.querySelectorAll('input[type=checkbox], input[type=radio]')].filter((c) => vis(c.closest('label') || c.parentElement || c)).map((c) => ({label: ((c.closest('label') || c.parentElement || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120), checked: c.checked, disabled: c.disabled})),
        }));
    });
    h.top = () => page.locator('[role="dialog"]:visible').last();
    h.win = () => page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    h.openAdd = async (scope) => {
        await (scope || h.panel()).getByRole('button', {name: 'Add', exact: true}).first().click();
        const w = h.win();
        await w.waitFor({timeout: 30000});
        await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('no participant box arrived'));
        await idle(page);
        return w;
    };
    h.box = (w, username) => w.locator('label', {hasText: `(${username})`}).locator('input[name="participants"]');
    h.tick = async (w, username, on = true) => { const b = h.box(w, username); if ((await b.count()) === 0) { L('no box for', username); return false; } await b.first().setChecked(on); return true; };
    h.editorReady = async () => {
        await page.waitForFunction(() => window.tinymce && window.tinymce.get().some((e) => e.initialized && e.getContainer() && e.getContainer().offsetParent !== null), null, {timeout: 20000}).catch(() => L('tinymce not initialized'));
    };
    h.typeMsg = async (w, text) => {
        await h.editorReady();
        const body = w.frameLocator('iframe').last().locator('body');
        await body.click();
        await page.keyboard.type(text);
    };
    h.errors = (w) => w.evaluate((root) => [...root.querySelectorAll('.pkpFieldError, .pkpFormErrors, .pkpFormField__error, [role="alert"]')]
        .filter((e) => e.offsetParent !== null && e.innerText.trim()).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)));
    // "Add" window: press Save; report the answer and whether the window closed.
    h.saveAdd = async (w, label) => {
        const t0 = Date.now();
        await w.getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForResponse((r) => /\/tasks(\/\d+)?$/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).catch(() => null);
        await idle(page);
        await w.waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
        const closed = !(await w.isVisible().catch(() => false));
        const errs = closed ? [] : await h.errors(w).catch(() => []);
        const res = {label, closed, errors: errs, answers: h.since(t0), dialogs: closed ? null : (await h.dialogs()).map((d) => d.text.slice(0, 200))};
        L('save', label, JSON.stringify(res));
        return res;
    };
    h.closeAdd = async (w) => {
        if (!(await w.isVisible().catch(() => false))) return;
        await w.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
        const warn = page.getByRole('dialog', {name: 'Warning'});
        await warn.waitFor({timeout: 1500}).then(() => warn.getByRole('button', {name: 'Yes', exact: true}).click()).catch(() => {});
        await w.waitFor({state: 'hidden', timeout: 10000}).catch(() => L('window did not close on Cancel'));
        await idle(page);
    };
    h.panelText = async () => flat(await h.panel().innerText().catch(() => ''), 3000);
    h.row = (name) => h.panel().getByRole('row').filter({hasText: name}).first();
    h.rowCells = (name) => h.row(name).locator('td').evaluateAll((tds) => tds.map((td) => td.innerText.trim().replace(/\s+/g, ' ')));
    // Open an item's discussion window from its name.
    h.openItem = async (name) => {
        h.step = `open item ${name}`;
        await h.row(name).getByRole('button', {name, exact: true}).first().click();
        const w = page.getByRole('dialog', {name, exact: true}).last();
        await w.waitFor({timeout: 30000});
        await page.waitForFunction((n) => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /Message from|assign yourself/.test(d.innerText) && !/Loading/.test(d.innerText); }, name, {timeout: 30000}).catch(() => L('window text never settled'));
        await idle(page);
        await w.getByRole('group', {name: 'Details'}).getByText(/^1\. /).first().waitFor({timeout: 10000}).catch(() => {});
        return w;
    };
    // The discussion window as data.
    h.winRead = (w) => w.evaluate((d) => {
        const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const btn = (b) => ({name: (b.getAttribute('aria-label') || b.innerText || '').trim().replace(/\s+/g, ' '), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'});
        const groups = [...d.querySelectorAll('fieldset, [role=group]')].filter(vis).map((g) => ({legend: ((g.querySelector('legend') || {}).innerText || g.getAttribute('aria-label') || '').trim(), text: g.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 1200)}));
        return {
            title: (d.querySelector('h1, h2') || {}).innerText || null,
            text: d.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 5000),
            buttons: [...d.querySelectorAll('button')].filter(vis).map(btn).filter((b) => b.name),
            boxes: [...d.querySelectorAll('input[type=checkbox]')].map((c) => ({label: ((c.closest('label') || c.parentElement || {}).innerText || '').trim().slice(0, 80), checked: c.checked, disabled: c.disabled})),
            links: [...d.querySelectorAll('a[href]')].filter(vis).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), download: a.getAttribute('download'), target: a.getAttribute('target')})),
            groups,
        };
    });
    h.closeItem = async (w) => {
        const c = w.getByRole('button', {name: 'Close', exact: true}).last();
        await c.click({timeout: 5000}).catch(() => {});
        // A changed window asks first.
        const warn = page.getByRole('dialog', {name: 'Warning'});
        await warn.waitFor({timeout: 1200}).then(() => warn.getByRole('button', {name: 'Yes', exact: true}).click()).catch(() => {});
        await page.waitForTimeout(600); await idle(page);
    };
    // "Add New Message", type, Save — in an open discussion window.
    h.reply = async (w, text, label, {attach} = {}) => {
        const t0 = Date.now();
        await w.getByRole('button', {name: 'Add New Message'}).click();
        await idle(page);
        await h.editorReady();
        if (attach) await attach(w);
        await h.typeMsg(w, text);
        const save = w.getByRole('button', {name: 'Save', exact: true}).last();
        const saveState = await save.isDisabled().catch(() => null);
        await save.click();
        await page.waitForResponse((r) => /\/tasks\/\d+\/notes/.test(r.url()) && r.request().method() === 'POST', {timeout: 15000}).catch(() => L('no notes POST'));
        await idle(page); await page.waitForTimeout(800);
        const after = await h.winRead(w).catch(() => null);
        const res = {label, saveDisabledBeforeClick: saveState, answers: h.since(t0), windowOpen: await w.isVisible().catch(() => false),
            lastMessages: after ? after.text.split('Message from').slice(-3).map((x) => flat(x, 260)) : null,
            addNewMessage: after ? after.buttons.filter((b) => /Add New Message|Save/.test(b.name)) : null,
            dialogs: (await h.dialogs()).slice(2).map((d) => d.text.slice(0, 200))};
        L('reply', label, JSON.stringify(res));
        return res;
    };
    // Attach Files › Upload File › Attach Files (in the window w).
    h.attachUpload = async (w, label) => {
        await w.getByRole('button', {name: 'Attach Files'}).last().click();
        await idle(page); await page.waitForTimeout(400);
        const win1 = await h.dialogs();
        await h.snap(`${label}-attach-window`, {dialogs: win1.slice(-1)});
        const top = h.top();
        await top.getByRole('button', {name: 'Upload File', exact: true}).first().click();
        await idle(page); await page.waitForTimeout(400);
        await h.snap(`${label}-attach-upload-window`, {dialogs: (await h.dialogs()).slice(-1)});
        await page.locator('input[type="file"]').last().setInputFiles(fixturePath(app));
        await h.top().getByRole('button', {name: /Remove/}).first().waitFor({timeout: 20000}).catch(() => L('upload shows no Remove'));
        await idle(page);
        const upl = (await h.dialogs()).slice(-1)[0];
        await h.top().getByRole('button', {name: 'Attach Files', exact: true}).last().click();
        await idle(page); await page.waitForTimeout(500);
        return {attachWindow: win1.slice(-1)[0], uploaded: upl};
    };
    // Attach Files › Workflow Files (in the window w): record the source panel, the stage list, the file list; attach the first file of `stageLabel`.
    h.attachWorkflow = async (w, label, {stageLabel, pick = true} = {}) => {
        await w.getByRole('button', {name: 'Attach Files'}).last().click();
        await idle(page); await page.waitForTimeout(400);
        const win1 = (await h.dialogs()).slice(-1)[0];
        const out = {attachWindow: win1};
        const wfBtn = h.top().getByRole('button', {name: 'Attach Workflow Files', exact: true});
        out.workflowOffered = await wfBtn.count();
        if (!out.workflowOffered) { await h.snap(`${label}-attach-window`, {dialogs: [win1]}); await h.closeTop(); return out; }
        await wfBtn.first().click();
        await idle(page); await page.waitForTimeout(600);
        out.workflowWindow = (await h.dialogs()).slice(-1)[0];
        await h.snap(`${label}-attach-workflow-window`, {dialogs: [out.workflowWindow]});
        const sel = h.top().locator('select').first();
        if (await sel.count()) {
            const opts = await sel.locator('option').allInnerTexts();
            out.stages = opts.map((o) => o.trim());
            out.perStage = {};
            for (const o of out.stages) {
                if (!o || /select/i.test(o)) continue;
                await sel.selectOption({label: o}).catch(() => {});
                await idle(page); await page.waitForTimeout(700);
                const d = (await h.dialogs()).slice(-1)[0];
                out.perStage[o] = {text: d.text.slice(0, 600), boxes: d.boxes.map((b) => b.label.slice(0, 80))};
            }
            if (stageLabel) {
                await sel.selectOption({label: out.stages.find((o) => o.startsWith(stageLabel)) || stageLabel}).catch((e) => L('stage select', e.message.slice(0, 120)));
                await idle(page); await page.waitForTimeout(800);
            }
        }
        const boxes = h.top().locator('input[type=checkbox]');
        out.boxCount = await boxes.count();
        await h.snap(`${label}-attach-workflow-list`, {dialogs: (await h.dialogs()).slice(-1)});
        if (pick && out.boxCount) {
            await boxes.first().check({force: true});
            await page.waitForTimeout(300);
            const d = (await h.dialogs()).slice(-1)[0];
            out.afterTick = d.buttons;
            const attach = h.top().getByRole('button', {name: /^Attach Selected|^Attach/}).last();
            await attach.click();
            await idle(page); await page.waitForTimeout(500);
            out.attached = true;
        } else {
            await h.closeTop();
        }
        return out;
    };
    // Close the top side window without touching the one under it.
    h.closeTop = async () => {
        for (let i = 0; i < 3; i++) {
            const d = (await h.dialogs()).slice(-1)[0];
            if (!d || !/Attach|Upload|Workflow/.test(d.name || d.text.slice(0, 80))) return;
            const back = h.top().getByRole('button', {name: /^(Back|Close|Cancel)$/}).last();
            if (!(await back.count())) return;
            await back.click().catch(() => {});
            await idle(page); await page.waitForTimeout(400);
        }
    };
    // The files listed under the message box (name + remove control).
    h.chips = (w) => w.evaluate((root) => {
        const vis = (e) => e.getClientRects().length > 0;
        return [...root.querySelectorAll('button')].filter((b) => vis(b) && /Remove/i.test(b.getAttribute('aria-label') || b.innerText)).map((b) => {
            const row = b.closest('li, tr, div');
            return {row: row ? row.innerText.trim().replace(/\s+/g, ' ').slice(0, 120) : null, button: (b.getAttribute('aria-label') || b.innerText).trim()};
        });
    });
    // A row's "Started" (3) / "Closed" (4) box: press and answer the confirm.
    h.tickBox = async (name, col, answer = 'Yes') => {
        const cell = h.row(name).locator('td').nth(col === 'Started' ? 3 : 4);
        const input = cell.locator('input[type=checkbox]');
        const before = await input.evaluate((c) => ({checked: c.checked, disabled: c.disabled})).catch(() => null);
        if (!before || before.disabled) { L(`${name} ${col} box`, JSON.stringify(before)); return {before}; }
        const t0 = Date.now();
        await cell.locator('label').click();
        await page.waitForTimeout(500);
        const dlg = page.getByRole('dialog').filter({has: page.getByRole('button', {name: answer, exact: true})}).last();
        const text = await dlg.innerText().catch(() => null);
        await dlg.getByRole('button', {name: answer, exact: true}).click().catch(() => {});
        await page.waitForResponse((r) => /\/tasks\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).catch(() => null);
        await idle(page); await page.waitForTimeout(600);
        const res = {name, col, before, confirm: flat(text, 300), answers: h.since(t0)};
        L('row box', JSON.stringify(res));
        return res;
    };
    h.rowMenu = async (name, entry) => {
        await h.row(name).getByRole('button', {name: /More Actions/}).click();
        await page.getByRole('menuitem').first().waitFor({timeout: 5000}).catch(() => {});
        const items = await page.getByRole('menuitem').allInnerTexts();
        if (entry) await page.getByRole('menuitem', {name: entry, exact: true}).click();
        else await page.keyboard.press('Escape');
        return items.map((x) => x.trim());
    };
    h.history = async (name, label) => {
        await h.rowMenu(name, 'History');
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /History/.test(d.innerText) && /created|posted/.test(d.innerText); }, null, {timeout: 20000}).catch(() => L('history never filled'));
        await idle(page);
        const d = h.top();
        const rows = await d.locator('table tbody tr, [role=row]').evaluateAll((trs) => trs.map((tr) => tr.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
        await h.snap(label, {rows});
        await d.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
        await page.waitForTimeout(600); await idle(page);
        return rows;
    };
    // The header's Tasks panel: its rows' texts.
    h.tasksPanel = async (label) => {
        const bell = page.getByRole('button', {name: /^Tasks/}).first();
        if (!(await bell.count())) return {absent: true};
        const bellName = await bell.innerText().catch(() => null);
        await bell.click();
        const d = page.locator('[role="dialog"]:visible').last();
        await d.waitFor({timeout: 15000}).catch(() => {});
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return x && !/Loading/.test(x.innerText) && x.querySelector('tbody tr, tr.gridRow, .pkp_controllers_grid'); }, null, {timeout: 20000}).catch(() => L('tasks panel never filled'));
        await idle(page); await page.waitForTimeout(800);
        const rows = await d.locator('tr.gridRow, tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 300)).filter(Boolean)).catch(() => []);
        await h.snap(label, {rows, bellName});
        const c = d.getByRole('button', {name: /^Close$/}).first();
        if (await c.count()) { await c.click().catch(() => {}); await idle(page); }
        return {bellName, rows};
    };
    return h;
}

// Mail helpers (Mailpit, scoped by the scratch recipient).
function mailer(app, X) {
    const em = (k) => `${X.t}${k}@mail.test`;
    const m = {em};
    m.find = async (k, {subject, contains, timeoutMs = 20000} = {}) => { try { return await app.mail.find({to: em(k), subject, contains, timeoutMs}); } catch (e) { return null; } };
    m.count = (k, {subject, contains} = {}) => app.mail.count({to: em(k), subject, contains});
    m.full = async (msg) => {
        if (!msg) return null;
        const f = await app.mail.fullMessage(msg.ID);
        const html = f.HTML || '';
        return {from: f.From, to: (f.To || []).map((x) => x.Address), cc: (f.Cc || []).map((x) => x.Address), subject: f.Subject,
            text: (f.Text || '').replace(/\s+/g, ' ').slice(0, 1400), attachments: (f.Attachments || []).map((a) => `${a.FileName} (${a.ContentType}, ${a.Size})`),
            unsubscribeLink: (html.match(/<a[^>]+href=["']([^"']*unsubscribe[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i) || []).slice(1, 3).map((x) => x.replace(/<[^>]+>/g, '').trim())};
    };
    return m;
}

// ---------------------------------------------------------------------------
// Phase prefs: n1 unticks "Enable these types of notifications." and n2 ticks
// "Do not send me an email for these types of notifications." on "Discussion added."

async function readPrefs(page) {
    const form = page.locator('form#notificationSettingsForm');
    await form.waitFor({timeout: 15000});
    return form.evaluate((f) => [...f.querySelectorAll('input[type=checkbox]')].map((i) => {
        const sec = i.closest('.section') || i.parentElement;
        const lab = sec ? (sec.querySelector(':scope > ul > label:not([for]), :scope > .label, :scope > label:not([for])') || {}).innerText : null;
        const own = i.id ? (f.querySelector(`label[for="${i.id}"]`) || {}).innerText : null;
        return {row: (lab || '').trim(), box: (own || '').trim(), id: i.id, checked: i.checked};
    }));
}

async function phasePrefs(app, X, h, page) {
    h.phase = 'prefs';
    for (const [k, which] of [['n1', 0], ['n2', 1]]) {
        await signIn(page, `${X.t}${k}`, {contextPath: X.path});
        const url = app.url(`/index.php/${X.path}/user/profile/notificationSettings`);
        await page.goto(url); await idle(page);
        const before = (await readPrefs(page)).filter((b) => /Discussion added/.test(b.row));
        await h.snap(`prefs-${k}-before`, {row: before});
        const target = before[which];
        if (!target) { h.fact(`prefs ${k}`, {noRow: true}); continue; }
        const box = page.locator(`#${target.id}`);
        if (which === 0) await box.uncheck(); else await box.check();
        const resp = page.waitForResponse((r) => r.request().method() === 'POST', {timeout: 20000}).catch(() => null);
        await page.locator('form#notificationSettingsForm').getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        await idle(page);
        await page.goto(url); await idle(page);
        const after = (await readPrefs(page)).filter((b) => /Discussion added/.test(b.row));
        await h.snap(`prefs-${k}-after`, {row: after, status: r && r.status()});
        h.fact(`prefs ${k}`, {before, after, status: r && r.status()});
    }
}

// ---------------------------------------------------------------------------
// Phase create: the manager opens D1 (six participants, an uploaded and a
// workflow file), T1 (a task not started), D3 (two participants); emails.

async function phaseCreate(app, X, h, page, M) {
    h.phase = 'create';
    const u = (s) => `${X.t}${s}`;
    const ops = app.name === 'ops';
    const id = X.S1.submissionId;
    X.names.D1 = `K5 D1 ${X.t}`; X.names.T1 = `K5 T1 ${X.t}`; X.names.D3 = `K5 D3 ${X.t}`;
    X.msg = X.msg || {};
    X.msg.D1 = `K5first${rnd()}`;
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id));
    await h.snap('create-mg-panel');
    let w = await h.openAdd();
    await w.locator('input[name="title"]').fill(X.names.D1);
    for (const k of ['se', 'au', 'n1', 'n2', 'dz']) await h.tick(w, u(k));
    await h.editorReady();
    // Attach Files › Upload File; then the chosen file's line and its remove control.
    const up = await h.attachUpload(w, 'create-mg-add');
    h.fact('create attach window (Add, manager)', up.attachWindow);
    h.fact('create upload window after upload', up.uploaded);
    h.fact('create chips after upload', await h.chips(w));
    await h.snap('create-mg-add-chip');
    // Remove it again (removable until Save), then upload once more.
    const rm = w.getByRole('button', {name: /Remove/}).first();
    if (await rm.count()) { await loc(page, 'Add window › attached file remove control', rm); await rm.click(); await page.waitForTimeout(400); }
    h.fact('create chips after remove', await h.chips(w));
    await h.attachUpload(w, 'create-mg-add2');
    // Attach Files › Workflow Files.
    const wf = await h.attachWorkflow(w, 'create-mg-add', {stageLabel: ops ? 'Production' : 'Submission'});
    h.fact('create workflow files (manager, Add window)', wf);
    h.fact('create chips before save', await h.chips(w));
    await h.snap('create-mg-add-ready');
    await h.typeMsg(w, `${X.msg.D1} opening message`);
    const r1 = await h.saveAdd(w, 'D1');
    h.fact('create D1 save', r1);
    if (!r1.closed) await h.closeAdd(w);
    // T1: a task, not started, owner se.
    await h.open(h.edUrl(X.path, id));
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill(X.names.T1);
    for (const k of ['se', 'au']) await h.tick(w, u(k));
    await w.getByRole('checkbox', {name: 'Enter task information'}).check();
    await w.locator('input[name="dateDue"]').fill(day(7));
    await w.getByRole('radio', {name: new RegExp(`\\(${u('se')}\\)`)}).check().catch((e) => h.L('owner radio', e.message.slice(0, 120)));
    await w.locator('select').first().selectOption({label: 'Create Task (Do Not Start)'}).catch((e) => h.L('start select', e.message.slice(0, 120)));
    X.msg.T1 = `K5task${rnd()}`;
    await h.typeMsg(w, `${X.msg.T1} task message`);
    h.fact('create T1 save', await h.saveAdd(w, 'T1'));
    // D3: two participants (Edit adds s2 later).
    await h.open(h.edUrl(X.path, id));
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill(X.names.D3);
    await h.tick(w, u('se'));
    X.msg.D3 = `K5third${rnd()}`;
    await h.typeMsg(w, `${X.msg.D3} first message`);
    h.fact('create D3 save', await h.saveAdd(w, 'D3'));
    await h.open(h.edUrl(X.path, id));
    await h.snap('create-mg-panel-after');
    h.fact('create panel after', await h.panelText());
    // The emails of D1's opening: every participant, the writer included.
    const mails = {};
    for (const k of ['se', 'au', 'dz', 'mg', 'n2', 'n1']) {
        const found = await M.find(k, {subject: X.names.D1, timeoutMs: ['n1', 'n2'].includes(k) ? 3000 : 20000});
        mails[k] = found ? await M.full(found) : null;
    }
    mails.countSe = await M.count('se', {subject: X.names.D1});
    h.fact('create D1 mails', mails);
    const tMails = {};
    for (const k of ['se', 'au', 'mg']) { const f = await M.find(k, {subject: X.names.T1}); tMails[k] = f ? (await M.full(f)).subject : null; }
    h.fact('create T1 mails', tMails);
}

// ---------------------------------------------------------------------------
// Phase window: the manager's discussion window on D1 and T1 (Rule 12), a
// reply (13, 13a, 13b), the file links, Activity, History, the Activity Log.

async function phaseWindow(app, X, h, page, M) {
    h.phase = 'window';
    const u = (s) => `${X.t}${s}`;
    const id = X.S1.submissionId;
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id));
    let w = await h.openItem(X.names.D1);
    await h.snap('window-mg-D1');
    const r = await h.winRead(w);
    h.fact('window mg D1', r);
    await loc(page, 'discussion window (dialog named by the item)', w);
    await loc(page, 'discussion window › Edit', w.getByRole('button', {name: 'Edit', exact: true}));
    await loc(page, 'discussion window › Add New Message', w.getByRole('button', {name: 'Add New Message'}));
    await loc(page, 'discussion window › Save', w.getByRole('button', {name: 'Save', exact: true}).last());
    await loc(page, 'discussion window › a file link', w.getByRole('link').first());
    // Save greyed on landing; the "Close this Discussion" box pressed; then untouched.
    const save = w.getByRole('button', {name: 'Save', exact: true}).last();
    const s0 = await save.isDisabled().catch(() => null);
    const cb = w.getByRole('checkbox', {name: 'Close this Discussion'});
    let s1 = null; let cbState = null;
    if (await cb.count()) {
        await cb.click().catch((e) => h.L('close box click', e.message.slice(0, 120)));
        await page.waitForTimeout(600);
        cbState = await cb.isChecked().catch(() => null);
        s1 = await save.isDisabled().catch(() => null);
        await h.snap('window-mg-D1-closebox-pressed');
        if (cbState) { await cb.click().catch(() => {}); await page.waitForTimeout(300); }
    }
    h.fact('window Save greyed: landing / after the Close box', {landing: s0, closeBoxChecked: cbState, afterBox: s1});
    // A file link: what a press does.
    const links = r.links.filter((l) => l.href && /download-file/.test(l.href));
    if (links.length) {
        const ctx = page.context();
        const dl = ctx.waitForEvent('page', {timeout: 8000}).then((p) => p.waitForEvent('download', {timeout: 8000}).then((d) => ({popup: true, file: d.suggestedFilename()})).catch(() => ({popup: true, url: p.url()}))).catch(() => null);
        const dl2 = page.waitForEvent('download', {timeout: 8000}).then((d) => ({popup: false, file: d.suggestedFilename()})).catch(() => null);
        const resp = ctx.waitForEvent('response', {predicate: (x) => /download-file/.test(x.url()), timeout: 8000}).catch(() => null);
        await w.locator(`a[href*="download-file"]`).first().click().catch((e) => h.L('link click', e.message.slice(0, 120)));
        const [d, d2, rr] = await Promise.all([dl, dl2, resp]);
        h.fact('window file link press', {links: links.map((l) => `${l.text} → ${l.href.replace(/^.*index.php/, '')} target=${l.target}`), popupOrDownload: d || d2, response: rr ? `${rr.status()} ${(rr.headers()['content-disposition'] || '').slice(0, 80)}` : null});
        for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
    }
    // "Add New Message": the button greys; Save state; empty Save (13a).
    const t0 = Date.now();
    await w.getByRole('button', {name: 'Add New Message'}).click();
    await idle(page); await h.editorReady();
    const afterAdd = await h.winRead(w);
    await h.snap('window-mg-D1-new-message');
    h.fact('window after Add New Message (buttons)', afterAdd.buttons);
    await save.click();
    await page.waitForTimeout(1000);
    h.fact('window empty Save (13a)', {errors: await h.errors(w), answers: h.since(t0)});
    await h.snap('window-mg-D1-empty-save');
    // Type and save (13b).
    X.msg.mgReply = `K5mgreply${rnd()}`;
    await h.typeMsg(w, `${X.msg.mgReply} manager reply`);
    const t1 = Date.now();
    await save.click();
    await page.waitForResponse((x) => /\/tasks\/\d+\/notes/.test(x.url()) && x.request().method() === 'POST', {timeout: 15000}).catch(() => h.L('no notes POST'));
    await idle(page); await page.waitForTimeout(1000);
    const afterSave = await h.winRead(w);
    await h.snap('window-mg-D1-after-reply');
    h.fact('window reply save', {answers: h.since(t1), open: await w.isVisible(), text: afterSave.text.slice(-900), buttons: afterSave.buttons, dialogs: (await h.dialogs()).map((d) => d.text.slice(0, 120))});
    await h.closeItem(w);
    // Emails of the reply.
    const rm = {};
    for (const k of ['se', 'au', 'dz', 'mg']) { const f = await M.find(k, {contains: X.msg.mgReply}); rm[k] = f ? await M.full(f) : null; }
    rm.n1 = await M.count('n1', {contains: X.msg.mgReply}); rm.n2 = await M.count('n2', {contains: X.msg.mgReply});
    h.fact('window reply mails', rm);
    // Activity, History, the Activity Log.
    await h.open(h.edUrl(X.path, id));
    h.fact('window D1 row after reply', await h.rowCells(X.names.D1));
    h.fact('window D1 history', await h.history(X.names.D1, 'window-mg-D1-history'));
    h.fact('window activity log', await activityLog(h, page, 'window-mg-activity-log'));
    // T1 before it starts.
    await h.open(h.edUrl(X.path, id));
    w = await h.openItem(X.names.T1);
    await h.snap('window-mg-T1-yet');
    h.fact('window mg T1 (yet to begin)', await h.winRead(w));
    await h.closeItem(w);
}

async function activityLog(h, page, label) {
    const btn = page.getByRole('button', {name: /Activity Log/}).first();
    if (!(await btn.count())) return {absent: true};
    await btn.click();
    const dlg = page.locator('[role="dialog"]:visible').last();
    await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
    await idle(page); await page.waitForTimeout(500);
    const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.split('$(function')[0].trim().replace(/\s+/g, ' ')).join(' ¦ '))).catch(() => []);
    const tabs = await dlg.getByRole('tab').allInnerTexts().catch(() => []);
    await h.snap(label, {rows, tabs});
    // The first "View Email": what it shows.
    let view = null;
    const toggle = dlg.locator('tr.gridRow').filter({hasText: 'An email has been sent'}).first().locator('a.show_extras');
    if (await toggle.count()) { await toggle.click().catch(() => {}); await page.waitForTimeout(500); }
    const ve = dlg.getByRole('link', {name: 'View Email'}).or(dlg.getByRole('button', {name: 'View Email'})).first();
    if (await ve.count() && await ve.isVisible()) {
        await ve.click().catch(() => {});
        await page.waitForTimeout(1200); await idle(page);
        const d = (await h.dialogs()).slice(-1)[0];
        view = d && {name: d.name, text: d.text.slice(0, 900)};
        await h.snap(`${label}-view-email`);
        await h.top().getByRole('button', {name: /^(Close|OK)$/}).last().click().catch(() => {});
        await page.waitForTimeout(600);
    }
    if (view) h.fact(`${label} view email`, view);
    await dlg.getByRole('button', {name: /^Close$/}).last().click().catch(() => {});
    await page.waitForTimeout(600); await idle(page);
    return {tabs, rows};
}

// ---------------------------------------------------------------------------
// Phase replies: the section editor (workflow file), the Author (two replies,
// td12; upload), the guest editor's Attach Files (OJS), D2 by se.

async function phaseReplies(app, X, h, page, M) {
    h.phase = 'replies';
    const u = (s) => `${X.t}${s}`;
    const ops = app.name === 'ops';
    const id = X.S1.submissionId;
    X.names.D2 = `K5 D2 ${X.t}`;
    // se: reply to D1 with a workflow file.
    await signIn(page, u('se'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id));
    let w = await h.openItem(X.names.D1);
    await h.snap('replies-se-D1');
    const seWin = await h.winRead(w);
    h.fact('replies se D1 window (Edit? boxes?)', {buttons: seWin.buttons, boxes: seWin.boxes, groups: seWin.groups.map((g) => g.legend)});
    X.msg.seReply = `K5sereply${rnd()}`;
    let wf = null;
    const rs = await h.reply(w, `${X.msg.seReply} section editor reply`, 'se D1', {attach: async (ww) => {
        wf = await h.attachWorkflow(ww, 'replies-se-D1', {stageLabel: ops ? 'Production' : 'Submission'});
        h.fact('replies se chips', await h.chips(ww));
    }});
    h.fact('replies se workflow files', wf);
    h.fact('replies se reply', rs);
    await h.snap('replies-se-D1-after');
    await h.closeItem(w);
    // The file stays where it was: the Submission stage's "Submission Files" list (OJS, OMP).
    if (!ops) {
        await page.goto(h.edUrl(X.path, id, 'workflow_1')); await idle(page);
        await page.waitForTimeout(800);
        const s = await h.snap('replies-se-submission-files');
        h.fact('replies Submission Files after the copy', flat((s.text.dialog || '').split(/Desk Review Tasks|Tasks & Discussions/)[0], 900));
    }
    // se opens D2 (se + au): the creator's window.
    await h.open(h.edUrl(X.path, id));
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill(X.names.D2);
    await h.tick(w, u('au'));
    X.msg.D2 = `K5second${rnd()}`;
    await h.typeMsg(w, `${X.msg.D2} first message`);
    h.fact('replies D2 save (se)', await h.saveAdd(w, 'D2'));
    await h.open(h.edUrl(X.path, id));
    w = await h.openItem(X.names.D2);
    await h.snap('replies-se-D2-creator');
    const d2 = await h.winRead(w);
    h.fact('replies se D2 (creator) buttons/boxes', {buttons: d2.buttons, boxes: d2.boxes});
    await h.closeItem(w);
    const seMails = {};
    for (const k of ['mg', 'au', 'dz']) { const f = await M.find(k, {contains: X.msg.seReply}); seMails[k] = f ? await M.full(f) : null; }
    h.fact('replies se reply mails', seMails);
    // Author: two replies in a row (td12), an uploaded file on the first.
    await signIn(page, u('au'), {contextPath: X.path});
    await h.openAu(X.path, id);
    w = await h.openItem(X.names.D1);
    await h.snap('replies-au-D1');
    const auWin = await h.winRead(w);
    h.fact('replies au D1 window', {buttons: auWin.buttons, boxes: auWin.boxes, links: auWin.links});
    X.msg.au1 = `K5authorOne${rnd()}`; X.msg.au2 = `K5authorTwo${rnd()}`;
    let auAttach = null;
    const a1 = await h.reply(w, `One ${X.msg.au1}`, 'au One', {attach: async (ww) => {
        // The Author's "Attach Files" window: which sources.
        await ww.getByRole('button', {name: 'Attach Files'}).last().click();
        await idle(page); await page.waitForTimeout(400);
        auAttach = (await h.dialogs()).slice(-1)[0];
        await h.snap('replies-au-attach-window', {dialogs: [auAttach]});
        await h.top().getByRole('button', {name: 'Upload File', exact: true}).first().click();
        await idle(page);
        await page.locator('input[type="file"]').last().setInputFiles(fixturePath(app));
        await h.top().getByRole('button', {name: /Remove/}).first().waitFor({timeout: 20000}).catch(() => {});
        await h.top().getByRole('button', {name: 'Attach Files', exact: true}).last().click();
        await idle(page); await page.waitForTimeout(400);
        h.fact('replies au chips', await h.chips(ww));
    }});
    h.fact('replies au attach window', auAttach);
    h.fact('replies au One', a1);
    const a2 = await h.reply(w, `Two ${X.msg.au2}`, 'au Two');
    h.fact('replies au Two', a2);
    await h.snap('replies-au-D1-after-two');
    await h.closeItem(w);
    // Re-open: both there?
    await h.openAu(X.path, id);
    w = await h.openItem(X.names.D1);
    const re = await h.winRead(w);
    await h.snap('replies-au-D1-reopened');
    h.fact('replies au D1 reopened: messages', re.text.split('Message from').slice(1).map((x) => flat(x, 200)));
    h.fact('replies au D1 reopened: file links', re.links);
    await h.closeItem(w);
    const auMails = {};
    for (const k of ['mg', 'se']) {
        const f1 = await M.find(k, {contains: X.msg.au1}); const f2 = await M.find(k, {contains: X.msg.au2});
        auMails[k] = {one: f1 ? await M.full(f1) : null, two: f2 ? (await M.full(f2)).subject : null};
    }
    h.fact('replies au mails', auMails);
    // Guest editor (OJS): the "Add" window's Attach Files sources.
    if (app.name === 'ojs') {
        await signIn(page, u('ge'), {contextPath: X.path});
        await h.open(h.edUrl(X.path, id));
        w = await h.openAdd();
        await h.editorReady();
        const g = await h.attachWorkflow(w, 'replies-ge-add', {pick: false});
        h.fact('replies guest editor attach (Add window)', {offered: g.workflowOffered, window: g.attachWindow, stages: g.stages});
        await h.closeTop();
        await h.closeAdd(w);
    }
}

// ---------------------------------------------------------------------------
// Phase states: start/close T1, close/reply/reopen D1, delete D2 — and the
// mail that does (not) follow each; the closed windows (12, 13c).

async function phaseStates(app, X, h, page, M) {
    h.phase = 'states';
    const u = (s) => `${X.t}${s}`;
    const id = X.S1.submissionId;
    const counts = async (label) => {
        const c = {D1se: await M.count('se', {subject: X.names.D1}), T1se: await M.count('se', {subject: X.names.T1}), D2au: await M.count('au', {subject: X.names.D2}), D1au: await M.count('au', {subject: X.names.D1})};
        h.fact(`states mail counts ${label}`, c);
        return c;
    };
    await counts('before');
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id));
    // Start T1 (row box), read the window.
    h.fact('states start T1', await h.tickBox(X.names.T1, 'Started'));
    await h.open(h.edUrl(X.path, id));
    let w = await h.openItem(X.names.T1);
    await h.snap('states-mg-T1-started');
    h.fact('states T1 started window', await h.winRead(w));
    await h.closeItem(w);
    // Close T1 (row box), read the window, reply on the closed task (13c).
    await h.open(h.edUrl(X.path, id));
    h.fact('states close T1', await h.tickBox(X.names.T1, 'Closed'));
    await h.open(h.edUrl(X.path, id));
    w = await h.openItem(X.names.T1);
    await h.snap('states-mg-T1-closed');
    h.fact('states T1 closed window', await h.winRead(w));
    X.msg.T1closed = `K5closedtask${rnd()}`;
    h.fact('states reply on closed T1', await h.reply(w, `${X.msg.T1closed} reply on a closed task`, 'mg closed T1'));
    await h.closeItem(w);
    // Close D1, read the window (hint, Edit), reply (13c), reopen.
    await h.open(h.edUrl(X.path, id));
    h.fact('states close D1', await h.tickBox(X.names.D1, 'Closed'));
    await h.open(h.edUrl(X.path, id));
    w = await h.openItem(X.names.D1);
    await h.snap('states-mg-D1-closed');
    h.fact('states D1 closed window', await h.winRead(w));
    X.msg.D1closed = `K5closeddisc${rnd()}`;
    h.fact('states reply on closed D1', await h.reply(w, `${X.msg.D1closed} reply on a closed discussion`, 'mg closed D1'));
    await h.closeItem(w);
    await h.open(h.edUrl(X.path, id));
    h.fact('states reopen D1', await h.tickBox(X.names.D1, 'Closed'));
    // Delete D2.
    await h.open(h.edUrl(X.path, id));
    const items = await h.rowMenu(X.names.D2, 'Delete');
    await page.waitForTimeout(500);
    const dlg = page.getByRole('dialog').filter({hasText: /delete/i}).last();
    const dtext = await dlg.innerText().catch(() => null);
    const t0 = Date.now();
    await dlg.getByRole('button', {name: /^(Yes|OK|Delete)$/}).first().click().catch((e) => h.L('delete confirm', e.message.slice(0, 120)));
    await page.waitForTimeout(1500); await idle(page);
    h.fact('states delete D2', {menu: items, confirm: flat(dtext, 300), answers: h.since(t0)});
    await h.snap('states-mg-after-delete');
    // Control: a reply on D1 (open again) reaches se and au; then the counts.
    await h.open(h.edUrl(X.path, id));
    w = await h.openItem(X.names.D1);
    X.msg.ctl = `K5control${rnd()}`;
    await h.reply(w, `${X.msg.ctl} control reply`, 'mg control');
    await h.closeItem(w);
    const seCtl = await M.find('se', {contains: X.msg.ctl});
    const auCtl = await M.find('au', {contains: X.msg.ctl});
    const seClosedTask = await M.find('se', {contains: X.msg.T1closed});
    const auClosedDisc = await M.find('au', {contains: X.msg.D1closed});
    h.fact('states control arrived', {se: !!seCtl, au: !!auCtl, closedTaskReplyToSe: !!seClosedTask, closedDiscReplyToAu: !!auClosedDisc});
    await counts('after');
    await h.open(h.edUrl(X.path, id));
    h.fact('states panel after', await h.panelText());
}

// ---------------------------------------------------------------------------
// Phase boxes: the window's "Start this task" / "Complete this task" boxes and
// "Save" (Rule 12's Save); the owner's window (Edit); T4 is created here.

async function phaseBoxes(app, X, h, page, M) {
    h.phase = 'boxes';
    const u = (s) => `${X.t}${s}`;
    const id = X.S1.submissionId;
    X.names.T4 = `K5 T4 ${X.t}`;
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id));
    let w = await h.openAdd();
    await w.locator('input[name="title"]').fill(X.names.T4);
    await h.tick(w, u('se'));
    await w.getByRole('checkbox', {name: 'Enter task information'}).check();
    await w.locator('input[name="dateDue"]').fill(day(5));
    await w.getByRole('radio', {name: new RegExp(`\\(${u('se')}\\)`)}).check().catch(() => {});
    await w.locator('select').first().selectOption({label: 'Create Task (Do Not Start)'}).catch(() => {});
    await h.typeMsg(w, `K5T4${rnd()} task message`);
    h.fact('boxes T4 save', await h.saveAdd(w, 'T4'));
    const before = await M.count('se', {subject: X.names.T4});
    for (const box of ['Start this task', 'Complete this task']) {
        await h.open(h.edUrl(X.path, id));
        w = await h.openItem(X.names.T4);
        const cb = w.getByRole('checkbox', {name: box});
        const saveBtn = w.getByRole('button', {name: 'Save', exact: true}).last();
        const st = {box, present: await cb.count(), saveBefore: await saveBtn.isDisabled().catch(() => null)};
        if (st.present) {
            await cb.click().catch((e) => h.L('box', e.message.slice(0, 120)));
            await page.waitForTimeout(700);
            st.checked = await cb.isChecked().catch(() => null);
            st.saveAfter = await saveBtn.isDisabled().catch(() => null);
            st.dialogs = (await h.dialogs()).slice(2).map((d) => d.text.slice(0, 200));
            await h.snap(`boxes-mg-T4-${box.split(' ')[0].toLowerCase()}-pressed`);
            const t0 = Date.now();
            if (st.saveAfter === false) {
                await saveBtn.click();
                await page.waitForTimeout(1500); await idle(page);
                st.answers = h.since(t0);
                const r = await h.winRead(w);
                st.after = {badge: r.text.slice(0, 200), boxes: r.boxes, saved: /Saved/.test(r.text), started: /Task started by/.test(r.text)};
                await h.snap(`boxes-mg-T4-${box.split(' ')[0].toLowerCase()}-saved`);
            }
        }
        h.fact(`boxes ${box}`, st);
        await h.closeItem(w);
        await h.open(h.edUrl(X.path, id));
        h.fact(`boxes row after ${box}`, await h.rowCells(X.names.T4));
    }
    // Control reply, then se's count for T4.
    w = await h.openItem(X.names.T4);
    const ctl = `K5T4ctl${rnd()}`;
    await h.reply(w, `${ctl} control`, 'mg T4 control');
    await h.closeItem(w);
    const c = await M.find('se', {contains: ctl});
    h.fact('boxes T4 mails', {before, control: !!c, after: await M.count('se', {subject: X.names.T4})});
    // T5 (owner se, started): the owner's and the Author's window.
    X.names.T5 = `K5 T5 ${X.t}`;
    await h.open(h.edUrl(X.path, id));
    w = await h.openAdd();
    await w.locator('input[name="title"]').fill(X.names.T5);
    await h.tick(w, u('se')); await h.tick(w, u('au'));
    await w.getByRole('checkbox', {name: 'Enter task information'}).check();
    await w.locator('input[name="dateDue"]').fill(day(5));
    await w.getByRole('radio', {name: new RegExp(`\\(${u('se')}\\)`)}).check().catch(() => {});
    await h.typeMsg(w, `K5T5${rnd()} task message`);
    await h.saveAdd(w, 'T5');
    for (const k of ['se', 'au']) {
        await signIn(page, u(k), {contextPath: X.path});
        await (k === 'au' ? h.openAu(X.path, id) : h.open(h.edUrl(X.path, id)));
        w = await h.openItem(X.names.T5).catch(() => null);
        if (!w) { h.fact(`boxes ${k} T5`, 'no item'); continue; }
        await h.snap(`boxes-${k}-T5`);
        const r = await h.winRead(w);
        h.fact(`boxes ${k} T5 window`, {buttons: r.buttons.filter((b) => /Edit|Save|Add New/.test(b.name)), boxes: r.boxes});
        await h.closeItem(w);
    }
}

// ---------------------------------------------------------------------------
// Phase wfmenu: (OJS, OMP) the "Workflow Files" list's row controls — the
// file name and the row's "More Actions" — pressed; (all) the window left
// with a typed, unsaved new message.

async function phaseWfmenu(app, X, h, page) {
    h.phase = 'wfmenu';
    await signIn(page, `${X.t}mg`, {contextPath: X.path});
    await h.open(h.edUrl(X.path, X.S1.submissionId));
    const w = await h.openItem(X.names.D1);
    await w.getByRole('button', {name: 'Add New Message'}).click();
    await idle(page); await h.editorReady();
    const out = {};
    if (app.name !== 'ops') {
    await w.getByRole('button', {name: 'Attach Files'}).last().click();
    await idle(page);
    await h.top().getByRole('button', {name: 'Attach Workflow Files', exact: true}).click();
    await idle(page);
    await h.top().locator('select').first().selectOption({label: 'Submission'});
    await idle(page); await page.waitForTimeout(800);
    const top = h.top();
    const more = top.getByRole('button', {name: /More Actions/}).first();
    out.moreCount = await top.getByRole('button', {name: /More Actions/}).count();
    await loc(page, 'Workflow Files › a row\'s More Actions', more);
    if (out.moreCount) {
        await more.click().catch((e) => h.L('more', e.message.slice(0, 120)));
        await page.waitForTimeout(600);
        out.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
        await h.snap('wfmenu-mg-more-actions', {menu: out.menu});
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
    }
    const link = top.getByRole('link', {name: 'article.pdf'}).first();
    out.linkCount = await link.count();
    if (out.linkCount) {
        out.linkHref = (await link.getAttribute('href') || '').replace(/^.*index.php/, '');
        const pop = page.context().waitForEvent('page', {timeout: 6000}).catch(() => null);
        const resp = page.context().waitForEvent('response', {predicate: (x) => /download/.test(x.url()), timeout: 6000}).catch(() => null);
        await link.click().catch(() => {});
        const [pp, rr] = await Promise.all([pop, resp]);
        out.linkPress = {popup: !!pp, response: rr ? `${rr.status()} ${(rr.headers()['content-disposition'] || '').slice(0, 60)}` : null};
        for (const x of page.context().pages()) if (x !== page) await x.close().catch(() => {});
    }
    out.dialogs = (await h.dialogs()).map((d) => d.name);
    h.fact('wfmenu', out);
    }
    // Leave with the attach windows and the new message open, unsaved: close the discussion window.
    await h.closeTop();
    await h.closeTop();
    await h.typeMsg(w, 'K5 unsaved text');
    await w.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
    await page.waitForTimeout(800);
    const warn = (await h.dialogs()).slice(-1)[0];
    h.fact('wfmenu leave with an unsaved message', {topDialog: warn && warn.text.slice(-200), browserDialogs: h.browserDialogs.slice(-2)});
    await h.snap('wfmenu-mg-leave');
    const yes = page.getByRole('dialog', {name: 'Warning'}).getByRole('button', {name: 'Yes', exact: true});
    if (await yes.count()) await yes.click();
    await page.goto(h.edUrl(X.path, X.S1.submissionId)); await idle(page);
    h.fact('wfmenu browser dialogs after leaving', h.browserDialogs.slice(-2));
}

// ---------------------------------------------------------------------------
// Phase log: the Activity Log's email lines and one "View Email".

async function phaseLog(app, X, h, page) {
    h.phase = 'log';
    await signIn(page, `${X.t}mg`, {contextPath: X.path});
    await h.open(h.edUrl(X.path, X.S1.submissionId));
    h.fact('log activity log', await activityLog(h, page, 'log-mg-activity-log'));
}

// ---------------------------------------------------------------------------
// Phase edit: "Edit" on D3 adds s2 — who is emailed.

async function phaseEdit(app, X, h, page, M) {
    h.phase = 'edit';
    const u = (s) => `${X.t}${s}`;
    const id = X.S1.submissionId;
    const before = {se: await M.count('se', {subject: X.names.D3}), mg: await M.count('mg', {subject: X.names.D3}), s2: await M.count('s2', {subject: X.names.D3})};
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.open(h.edUrl(X.path, id));
    let w = await h.openItem(X.names.D3);
    await w.getByRole('button', {name: 'Edit', exact: true}).click();
    const ew = h.win();
    await ew.waitFor({timeout: 20000});
    await ew.locator('input[name="participants"]').first().waitFor({timeout: 20000}).catch(() => {});
    await idle(page);
    await h.tick(ew, u('s2'));
    await h.snap('edit-mg-D3-edit');
    const t0 = Date.now();
    await ew.getByRole('button', {name: 'Save', exact: true}).click();
    await page.waitForResponse((r) => /\/tasks\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).catch(() => null);
    await idle(page); await page.waitForTimeout(800);
    h.fact('edit D3 save', {answers: h.since(t0), dialogs: (await h.dialogs()).map((d) => d.text.slice(0, 150))});
    const s2 = await M.find('s2', {subject: X.names.D3});
    const after = {se: await M.count('se', {subject: X.names.D3}), mg: await M.count('mg', {subject: X.names.D3}), s2: await M.count('s2', {subject: X.names.D3})};
    h.fact('edit D3 mails', {before, after, s2: s2 ? await M.full(s2) : null});
    // The window's own "Close this Discussion" box, then "Save" (Rule 12's Save; the result).
    await h.open(h.edUrl(X.path, id));
    w = await h.openItem(X.names.D3);
    const cb = w.getByRole('checkbox', {name: 'Close this Discussion'});
    await cb.click().catch(() => {});
    await page.waitForTimeout(500);
    const saveBtn = w.getByRole('button', {name: 'Save', exact: true}).last();
    const st = {checked: await cb.isChecked().catch(() => null), saveDisabled: await saveBtn.isDisabled().catch(() => null)};
    const t1 = Date.now();
    if (st.saveDisabled === false) {
        await saveBtn.click();
        await page.waitForTimeout(1500); await idle(page);
        st.answers = h.since(t1);
        st.after = await h.winRead(w);
        await h.snap('edit-mg-D3-closebox-saved');
    }
    h.fact('edit D3 window Close box + Save', st);
    await h.closeItem(w);
    await h.open(h.edUrl(X.path, id));
    h.fact('edit D3 row after window close', await h.rowCells(X.names.D3));
    const ctlMsg = `K5ctlD3${rnd()}`;
    w = await h.openItem(X.names.D3);
    await h.reply(w, `${ctlMsg} control`, 'mg D3 control');
    await h.closeItem(w);
    const c = await M.find('se', {contains: ctlMsg});
    h.fact('edit D3 mails after window close', {control: !!c, se: await M.count('se', {subject: X.names.D3})});
}

// ---------------------------------------------------------------------------
// Phase disabled: disable dz on Users & Roles, reply on D1, enable dz again.

async function phaseDisabled(app, X, h, page, M) {
    h.phase = 'disabled';
    const u = (s) => `${X.t}${s}`;
    const id = X.S1.submissionId;
    const accessUrl = app.url(`/index.php/${X.path}/management/settings/access`);
    const usersTable = page.getByRole('table', {name: /Current Users \(/});
    const userRow = () => usersTable.getByRole('row').filter({hasText: M.em('dz')});
    const gotoAccess = async () => { await page.goto(accessUrl); await usersTable.waitFor({timeout: 20000}).catch(() => {}); await idle(page); };
    const flip = async (re, label) => {
        await gotoAccess();
        await userRow().getByRole('button', {name: /options/i}).click();
        await page.getByRole('menuitem').first().waitFor({timeout: 5000}).catch(() => {});
        const menu = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
        await page.getByRole('menuitem', {name: re}).first().click();
        const dlg = page.getByRole('dialog').last();
        await dlg.waitFor({timeout: 10000}).catch(() => {});
        await idle(page);
        const text = await dlg.innerText().catch(() => null);
        const t0 = Date.now();
        await dlg.getByRole('button', {name: /^(OK|Yes|Save|Disable|Enable)/}).first().click().catch((e) => h.L('flip', e.message.slice(0, 120)));
        await dlg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page);
        await gotoAccess();
        const row = await userRow().innerText().catch(() => null);
        await h.snap(`disabled-${label}`);
        h.fact(`disabled ${label}`, {menu, dialog: flat(text, 300), row: flat(row, 300), t0});
    };
    await signIn(page, u('mg'), {contextPath: X.path});
    await flip(/^Disable/, 'disable-dz');
    await h.open(h.edUrl(X.path, id));
    const w = await h.openItem(X.names.D1);
    X.msg.dis = `K5whiledisabled${rnd()}`;
    h.fact('disabled reply', await h.reply(w, `${X.msg.dis} reply while dz is disabled`, 'mg while dz disabled'));
    await h.closeItem(w);
    const ctl = await M.find('se', {contains: X.msg.dis});
    h.fact('disabled mails', {controlSe: !!ctl, dz: await M.count('dz', {contains: X.msg.dis}), dzAllD1: await M.count('dz', {subject: X.names.D1})});
    await signIn(page, u('mg'), {contextPath: X.path});
    await flip(/^Enable/, 'enable-dz');
}

// ---------------------------------------------------------------------------
// Phase tasks: each person's header Tasks panel.

async function phaseTasks(app, X, h, page) {
    h.phase = 'tasks';
    const u = (s) => `${X.t}${s}`;
    const out = {};
    for (const k of ['mg', 'se', 'au', 'n1', 'n2', 'dz', 's2']) {
        try {
            await signIn(page, u(k), {contextPath: X.path});
            await page.goto(app.url(`/index.php/${X.path}/en/dashboard/${k === 'au' ? 'mySubmissions' : 'editorial'}`)); await idle(page);
            const p = await h.tasksPanel(`tasks-${k}`);
            const rows = p.rows || [];
            out[k] = {bell: p.bellName, total: rows.length, D1: rows.filter((r) => r.includes(X.names.D1)).length, T1: rows.filter((r) => r.includes(X.names.T1)).length, D2: rows.filter((r) => r.includes(X.names.D2)).length, D3: rows.filter((r) => r.includes(X.names.D3)).length, sample: rows.slice(0, 4)};
        } catch (e) { out[k] = {error: e.message.slice(0, 200)}; }
    }
    h.fact('tasks panels', out);
}

// ---------------------------------------------------------------------------
// Phase reviewer (OJS, OMP): the reviewer's "Attach Files" (Add window and a
// reply); the manager's stage list on the review stage.

async function toStep3(page, h) {
    const sc1 = page.getByRole('button', {name: 'Save and continue'});
    if (await sc1.count()) { await sc1.first().click(); await idle(page); }
    const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
    await c3.waitFor({timeout: 15000}).catch(() => {});
    if (await c3.count() && !(await c3.isDisabled())) { await c3.click(); await idle(page); }
    await page.getByRole('tabpanel', {name: '3. Download & Review'}).getByRole('button', {name: 'Add', exact: true}).waitFor({timeout: 30000}).catch(() => h.L('no Add on step 3'));
    await idle(page);
}

async function phaseReviewer(app, X, h, page, M) {
    h.phase = 'reviewer';
    if (app.name === 'ops') return;
    const u = (s) => `${X.t}${s}`;
    const id = X.SR.submissionId;
    X.names.R1 = `K5 R1 ${X.t}`;
    await signIn(page, u('r1'), {contextPath: X.path});
    await page.goto(app.url(`/index.php/${X.path}/en/reviewer/submission/${id}`));
    await idle(page);
    await toStep3(page, h);
    const tp = page.getByRole('tabpanel', {name: '3. Download & Review'});
    let w = await h.openAdd(tp);
    await h.editorReady();
    const a = await h.attachWorkflow(w, 'reviewer-r1-add', {pick: false});
    h.fact('reviewer attach (Add window)', {offered: a.workflowOffered, window: a.attachWindow});
    await h.closeTop();
    await w.locator('input[name="title"]').fill(X.names.R1);
    await h.tick(w, u('se'));
    X.msg.R1 = `K5reviewer${rnd()}`;
    await h.typeMsg(w, `${X.msg.R1} reviewer message`);
    h.fact('reviewer R1 save', await h.saveAdd(w, 'R1'));
    await page.goto(app.url(`/index.php/${X.path}/en/reviewer/submission/${id}?step=3`));
    await idle(page);
    await tp.getByRole('button', {name: 'Add', exact: true}).waitFor({timeout: 30000}).catch(() => {});
    w = await h.openItem(X.names.R1).catch(() => null);
    if (w) {
        await h.snap('reviewer-r1-R1-window');
        await w.getByRole('button', {name: 'Add New Message'}).click().catch(() => {});
        await idle(page); await h.editorReady();
        const b = await h.attachWorkflow(w, 'reviewer-r1-reply', {pick: false});
        h.fact('reviewer attach (reply box)', {offered: b.workflowOffered, window: b.attachWindow});
        await h.closeTop();
        await h.closeItem(w);
    }
    // The manager on the review stage: the stage list of "Workflow Files".
    await signIn(page, u('mg'), {contextPath: X.path});
    const round = X.SR.reviewRounds && X.SR.reviewRounds[0];
    await h.open(h.edUrl(X.path, id, round ? `workflow_${round.stageId}_${round.id}` : null));
    w = await h.openAdd();
    await h.editorReady();
    const m = await h.attachWorkflow(w, 'reviewer-mg-add', {pick: false});
    h.fact('reviewer stage: manager workflow files', {offered: m.workflowOffered, stages: m.stages, perStage: m.perStage});
    await h.closeTop();
    await h.closeAdd(w);
}

// ---------------------------------------------------------------------------
// Phase notice: the stage's notice box before and after an item, with and
// without the Copyeditor / Layout Editor (OJS, OMP; OPS Production control).

async function noticeText(page) {
    return page.evaluate(() => {
        const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length)[0] || document.body;
        const t = d.innerText.replace(/\s*\n+\s*/g, ' | ');
        const i = t.indexOf('Current Submission Language');
        const seg = i >= 0 ? t.slice(i, i + 420) : t.slice(0, 420);
        return seg.replace(/^Current Submission Language: [^|]*\| /, '');
    });
}

async function phaseNotice(app, X, h, page, M) {
    h.phase = 'notice';
    const u = (s) => `${X.t}${s}`;
    const ops = app.name === 'ops';
    await signIn(page, u('se'), {contextPath: X.path});
    // Fresh submissions per run (the notice follows the stage's discussions).
    const N = {};
    if (!ops) {
        const base = {context: X.path, submitter: u('au')};
        const toCopy = app.name === 'omp' ? ['skipInternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        const cp = [{username: u('se'), role: 'sectionEditor'}, {username: u('ce'), role: 'copyeditor'}];
        const pp = [{username: u('se'), role: 'sectionEditor'}, {username: u('le'), role: 'layoutEditor'}];
        const r = rnd();
        N.SC1 = await app.api.createSubmission({...base, tag: `${X.t}n${r}1`, title: `K5 NC1 ${X.t}`, participants: cp, decisions: toCopy});
        N.SC2 = await app.api.createSubmission({...base, tag: `${X.t}n${r}2`, title: `K5 NC2 ${X.t}`, participants: cp, decisions: toCopy});
        N.SP1 = await app.api.createSubmission({...base, tag: `${X.t}n${r}3`, title: `K5 NP1 ${X.t}`, participants: pp, decisions: [...toCopy, 'sendToProduction']});
        N.SP2 = await app.api.createSubmission({...base, tag: `${X.t}n${r}4`, title: `K5 NP2 ${X.t}`, participants: pp, decisions: [...toCopy, 'sendToProduction']});
    } else N.S1 = X.S1;
    const legs = ops ? [['S1', 'workflow_5', null]] : [['SC1', 'workflow_4', 'ce'], ['SC2', 'workflow_4', 'au'], ['SP1', 'workflow_5', 'le'], ['SP2', 'workflow_5', 'au']];
    for (const [k, key, who] of legs) {
        const id = N[k].submissionId;
        await h.open(h.edUrl(X.path, id, key));
        const s0 = await h.snap(`notice-se-${k}-before`);
        const before = await noticeText(page);
        const head = flat((s0.text.dialog || '').split(/Tasks & Discussions/)[0], 600);
        let after = null; let afterReload = null; let res = null;
        if (who) {
            const w = await h.openAdd();
            const nm = `K5 N ${k} ${X.t}`;
            X.names[`N${k}`] = nm;
            await w.locator('input[name="title"]').fill(nm);
            await h.tick(w, u(who));
            await h.typeMsg(w, `K5 notice ${k}`);
            X.noticeIds = X.noticeIds || {};
            X.noticeIds[k] = id;
            res = await h.saveAdd(w, nm);
            await page.waitForTimeout(800);
            after = await noticeText(page);
            await h.snap(`notice-se-${k}-after-save`);
            await h.open(h.edUrl(X.path, id, key));
            afterReload = await noticeText(page);
            await h.snap(`notice-se-${k}-after-reload`);
        }
        h.fact(`notice ${k} (${key}, with ${who})`, {head, before, after, afterReload, save: res && {closed: res.closed, answers: res.answers}});
    }
    // The copyeditor on SC1: the discussion's "Attach Files" sources and stage list.
    if (!ops) {
        await signIn(page, u('ce'), {contextPath: X.path});
        await h.open(h.edUrl(X.path, X.noticeIds.SC1, 'workflow_4'));
        const w = await h.openItem(X.names.NSC1).catch(() => null);
        if (w) {
            await h.snap('notice-ce-SC1-window');
            await w.getByRole('button', {name: 'Add New Message'}).click().catch(() => {});
            await idle(page); await h.editorReady();
            const c = await h.attachWorkflow(w, 'notice-ce-reply', {pick: false});
            h.fact('notice copyeditor attach (reply box)', {offered: c.workflowOffered, window: c.attachWindow, stages: c.stages, perStage: c.perStage});
            await h.closeTop();
            await h.closeItem(w);
        }
        // The layout editor on SP1 likewise.
        await signIn(page, u('le'), {contextPath: X.path});
        await h.open(h.edUrl(X.path, X.noticeIds.SP1, 'workflow_5'));
        const w2 = await h.openItem(X.names.NSP1).catch(() => null);
        if (w2) {
            await w2.getByRole('button', {name: 'Add New Message'}).click().catch(() => {});
            await idle(page); await h.editorReady();
            const c = await h.attachWorkflow(w2, 'notice-le-reply', {pick: false});
            h.fact('notice layout editor attach (reply box)', {offered: c.workflowOffered, window: c.attachWindow, stages: c.stages});
            await h.closeTop();
            await h.closeItem(w2);
        }
    }
}

// ---------------------------------------------------------------------------
// Phase auto: an auto-added item after a stage change made on screen.

async function phaseAuto(app, Y, h, page) {
    h.phase = 'auto';
    const u = (s) => `${Y.t}${s}`;
    const MY = mailer(app, Y);
    const id = Y.SY.submissionId;
    const names = [`K5 auto discussion ${Y.t}`, `K5 auto task ${Y.t}`];
    if (app.name === 'ops') {
        await signIn(page, u('au'), {contextPath: Y.path});
        const W = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPages.js'));
        await page.goto(app.url(W.wizardUrl(Y.path, id))); await idle(page);
        await h.snap('auto-au-wizard');
        await W.completeAndSubmitDraft(page).catch((e) => h.L('wizard', e.message.slice(0, 300)));
        await idle(page);
        await h.snap('auto-au-submitted');
    } else {
        await signIn(page, u('se'), {contextPath: Y.path});
        await page.goto(app.url(`/index.php/${Y.path}/en/decision/record/${id}?decision=7`)); await idle(page);
        await h.snap('auto-se-decision-open');
        for (let i = 0; i < 8; i++) {
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
            if (await rec.count() && await rec.isVisible()) break;
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: 20000}).catch(() => {});
            await page.getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
            await idle(page); await page.waitForTimeout(700);
        }
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: 20000}).catch(() => {});
        await page.getByRole('button', {name: 'Record Decision', exact: true}).click().catch((e) => h.L('record', e.message.slice(0, 200)));
        await page.getByRole('link', {name: /^View Submission/}).first().waitFor({timeout: 30000}).catch(() => h.L('no completion'));
        await h.snap('auto-se-decision-recorded');
    }
    // Control: some mail to the author after the stage change.
    const ctl = await MY.find('au', {timeoutMs: 25000});
    const ctlFull = ctl ? await MY.full(ctl) : null;
    const counts = {};
    for (const k of ['au', 'se', 'mg']) counts[k] = {discussion: await MY.count(k, {subject: names[0]}), task: await MY.count(k, {subject: names[1]}), all: await MY.count(k)};
    h.fact('auto mails', {control: ctlFull && {subject: ctlFull.subject, from: ctlFull.from}, counts});
    // The panel on Production, the items' windows, and each person's Tasks panel.
    await signIn(page, u('mg'), {contextPath: Y.path});
    await h.open(h.edUrl(Y.path, id, 'workflow_5'));
    await h.snap('auto-mg-production-panel');
    h.fact('auto panel', await h.panelText());
    const w = await h.openItem(names[0]).catch(() => null);
    if (w) { await h.snap('auto-mg-discussion-window'); h.fact('auto discussion window', (await h.winRead(w)).text.slice(0, 900)); await h.closeItem(w); }
    const tp = {};
    for (const k of ['mg', 'se', 'au']) {
        await signIn(page, u(k), {contextPath: Y.path});
        await page.goto(app.url(`/index.php/${Y.path}/en/dashboard/${k === 'au' ? 'mySubmissions' : 'editorial'}`)); await idle(page);
        const p = await h.tasksPanel(`auto-tasks-${k}`);
        tp[k] = {bell: p.bellName, rows: (p.rows || []).map((r) => r.slice(0, 160))};
    }
    h.fact('auto tasks panels', tp);
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const facts = {};
    const h = helpers(app, page, facts);
    const guard = async (name, fn) => {
        try { await fn(); } catch (e) {
            h.L(`[error in ${name}]`, String(e.stack || e.message).slice(0, 1200));
            await shot(page, `error-${name}`).catch(() => {});
        }
    };
    const xFile = path.join(outDir(), `x-${app.name}.json`);
    const save = (X, Y) => fs.writeFileSync(xFile, JSON.stringify({X, Y}, null, 2));
    try {
        let X; let Y;
        if (process.env.REUSE && fs.existsSync(xFile)) ({X, Y} = JSON.parse(fs.readFileSync(xFile, 'utf8')));
        else { X = await seedX(app); Y = PHASES.includes('auto') ? await seedY(app) : null; save(X, Y); }
        if (PHASES.includes('auto') && !Y) { Y = await seedY(app); save(X, Y); }
        const M = mailer(app, X);
        for (const [name, fn] of [['prefs', phasePrefs], ['create', phaseCreate], ['window', phaseWindow], ['replies', phaseReplies],
            ['states', phaseStates], ['boxes', phaseBoxes], ['edit', phaseEdit], ['log', phaseLog], ['wfmenu', phaseWfmenu], ['disabled', phaseDisabled], ['tasks', phaseTasks], ['reviewer', phaseReviewer], ['notice', phaseNotice]]) {
            if (PHASES.includes(name)) { await guard(name, () => fn(app, X, h, page, M)); save(X, Y); }
        }
        if (PHASES.includes('auto')) await guard('auto', () => phaseAuto(app, Y, h, page));
    } finally {
        const fFile = path.join(outDir(), `facts-${app.name}.json`);
        const prev = fs.existsSync(fFile) ? JSON.parse(fs.readFileSync(fFile, 'utf8')) : {};
        fs.writeFileSync(fFile, JSON.stringify({...prev, ...facts}, null, 2));
        fs.writeFileSync(path.join(outDir(), `answers-${app.name}.json`), JSON.stringify(h.answers, null, 2));
        record('browser-dialogs', h.browserDialogs);
        await close();
    }
});
