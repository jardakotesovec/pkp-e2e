// U37 claim check, chunk K7 — "History" and "Delete", items other screens
// open, a disabled account, leaving the submission, and the cross-feature
// pointers (docs/specs/U37-tasks-and-discussions.md, Rules 18, 19, 21–23,
// Cross-feature interactions, register A1 and A9; to-drive notes td13,
// td14, td19, td10 through f-a9).
//
// Seeds its own scratch contexts per app (nothing on publicknowledge):
//   C — users mg (manager), ed (manager-level: "editor", OPS "manager"),
//       se, s2, dz, as (section editors / moderators), au (author);
//       OJS/OMP rv1, rv2, rv3 (reviewers), rc (recommending section editor),
//       ce (copyeditor). OJS/OMP review mode "Open". UI languages en, fr_CA.
//       S1   first stage (OPS: Production), se s2 dz ed assigned, seeded items
//       SR   review round (OJS/OMP): rv1 accepted, rv2 invited, rv3 completed
//       SRec review round (OJS/OMP): rc recommend-only, se deciding
//       SC   copyediting (OJS/OMP): se, ce
//   W — the wizard context: the first stage's "Discussion (…)" template with
//       "Auto-add at stage" on, a draft with se, (OJS/OMP funding) and a
//       manager-level editor assigned, submitted on screen with a comment.
//
//   PROBE_FEATURE=U37 PROBE_AGENT=ccK7 node bin/probe.js all shared/playwright/checks/U37/K7/k7.js
//   PHASES=hist,del,notify,disabled,xref,leave,wizard,rec,dis2,leave2 (default all);
//   REUSE=1 reuses the last seeded contexts (x-<app>.json).
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app phase]); facts-<app>.json
// collects the structured reads.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'hist,del,notify,disabled,xref,leave,wizard,rec,dis2,leave2';
const PHASES = (process.env.PHASES || ALL).split(',');
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const rnd = () => Math.random().toString(36).slice(2, 6);
const FIX = {ojs: 'notes.md', omp: 'notes.md', ops: 'not-an-image.txt'};
const fixturePath = (app, f) => path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files/${f || FIX[app.name]}`);

// ---------------------------------------------------------------------------
// Seeding

const NAMES = {mg: 'Mona Manager', ed: 'Eddie Chief', se: 'Sean Editor', s2: 'Sofia Second', dz: 'Dana Zed', as: 'Asa Assigned', au: 'Ava Author',
    rv1: 'Rex Reviewer', rv2: 'Rhea Invitee', rv3: 'Rolf Done', rc: 'Rico Recommender', ce: 'Cora Copy'};
const person = (k, t, role) => { const [g, f] = NAMES[k].split(' '); return {username: `${t}${k}`, roles: [role], givenName: g, familyName: f}; };

async function seed(app) {
    const t = tag('u37k7');
    const u = (s) => `${t}${s}`;
    const ops = app.name === 'ops';
    const users = [person('mg', t, 'manager'), person('ed', t, ops ? 'manager' : 'editor'), person('se', t, 'sectionEditor'), person('s2', t, 'sectionEditor'),
        person('dz', t, 'sectionEditor'), person('as', t, 'sectionEditor'), person('au', t, 'author')];
    if (!ops) users.push(person('rv1', t, 'externalReviewer'), person('rv2', t, 'externalReviewer'), person('rv3', t, 'externalReviewer'), person('rc', t, 'sectionEditor'), person('ce', t, 'copyeditor'));
    const C = await app.api.createContext({tag: t, context: {supportedLocales: ['en', 'fr_CA']}, users, ...(ops ? {} : {review: {defaultReviewMode: 'open'}})});
    const X = {t, path: C.path, names: {}, ids: {}};
    const T = (title, creator, parts, owner, due, started = true) => ({title, type: 'task', creator: u(creator), participants: parts.map(u), owner: u(owner), dateDue: day(due), started, message: `${title} first message`});
    const D = (title, creator, parts) => ({title, creator: u(creator), participants: parts.map(u), message: `${title} first message`});
    const eds = [{username: u('se'), role: 'sectionEditor'}, {username: u('s2'), role: 'sectionEditor'}, {username: u('dz'), role: 'sectionEditor'}, {username: u('ed'), role: ops ? 'manager' : 'editor'}];
    X.S1 = await app.api.createSubmission({tag: `${t}a`, context: C.path, submitter: u('au'), title: `K7 S1 ${t}`, participants: eds, tasks: [
        D('K7 Del', 'mg', ['mg', 'se', 'au']),
        D('K7 DelNo', 'mg', ['mg', 'se']),
        T('K7 Over', 'mg', ['mg', 'se'], 'se', -3),
        D('K7 Dis', 'mg', ['mg', 'dz', 'se']),
        T('K7 DisT', 'mg', ['mg', 'dz'], 'dz', 7),
        D('K7 DisC', 'dz', ['dz', 'se']),
        D('K7 Rm', 'mg', ['mg', 's2', 'ed', 'se']),
        T('K7 RmT', 'mg', ['mg', 's2'], 's2', 7),
        D('K7 Hist2', 'mg', ['mg', 'se']),
    ]});
    for (const x of X.S1.tasks || []) X.ids[x.title] = x.id;
    if (!ops) {
        const base = {context: C.path, submitter: u('au'), decisions: ['sendExternalReview']};
        const rev = [{username: u('rv1'), status: 'accepted'}, {username: u('rv2'), status: 'invited'}, {username: u('rv3'), status: 'completed'}];
        try {
            X.SR = await app.api.createSubmission({...base, tag: `${t}r`, title: `K7 SR ${t}`, participants: [{username: u('se'), role: 'sectionEditor'}], reviewRounds: [{reviewers: rev}],
                tasks: [{...D('K7 Rev1', 'mg', ['mg', 'se', 'rv1']), stage: 'review'}, {...D('K7 Rev2', 'mg', ['mg', 'se', 'rv2']), stage: 'review'}]});
        } catch (e) {
            X.seedRefusal = String(e.message).slice(0, 600);
            X.SR = await app.api.createSubmission({...base, tag: `${t}r2`, title: `K7 SR ${t}`, participants: [{username: u('se'), role: 'sectionEditor'}], reviewRounds: [{reviewers: rev}],
                tasks: [{...D('K7 Rev1', 'mg', ['mg', 'se', 'rv1']), stage: 'review'}]});
        }
        X.SRec = await app.api.createSubmission({...base, tag: `${t}q`, title: `K7 SRec ${t}`,
            participants: [{username: u('se'), role: 'sectionEditor'}, {username: u('rc'), role: 'sectionEditor', recommendOnly: true}]});
        X.SC = await app.api.createSubmission({tag: `${t}c`, context: C.path, submitter: u('au'), title: `K7 SC ${t}`,
            participants: [{username: u('se'), role: 'sectionEditor'}, {username: u('ce'), role: 'copyeditor'}],
            decisions: app.name === 'omp' ? ['skipInternalReview', 'accept'] : ['skipExternalReview']});
    }
    // W: the wizard context.
    const w = tag('u37k7w');
    const wu = (s) => `${w}${s}`;
    const wusers = [person('mg', w, 'manager'), person('se', w, 'sectionEditor'), person('au', w, 'author'), person('ed', w, ops ? 'manager' : 'editor')];
    if (!ops) wusers.push({username: wu('fu'), roles: ['funding'], givenName: 'Fern', familyName: 'Funding'});
    const tpl = ops ? {stage: 'production', title: 'Discussion (Production)', include: true} : {stage: 'submission', title: 'Discussion (Submission)', include: true};
    const W = await app.api.createContext({tag: w, users: wusers, taskTemplates: [tpl]});
    const wparts = [{username: wu('se'), role: 'sectionEditor'}, {username: wu('ed'), role: ops ? 'manager' : 'editor'}];
    if (!ops) wparts.push({username: wu('fu'), role: 'funding'});
    X.W = {t: w, path: W.path, tpl: tpl.title};
    X.W.draft = await app.api.createSubmission({tag: `${w}d`, context: W.path, submitter: wu('au'), title: `K7 W ${w}`, submitted: false, participants: wparts,
        ...(ops ? {} : {files: [{file: 'article.pdf'}]})});
    console.log(`[${app.name} seed]`, JSON.stringify({path: X.path, S1: X.S1.submissionId, SR: X.SR && X.SR.submissionId, SRec: X.SRec && X.SRec.submissionId, SC: X.SC && X.SC.submissionId, W: X.W.path, draft: X.W.draft.submissionId, refusal: X.seedRefusal, ids: X.ids}));
    return X;
}

// ---------------------------------------------------------------------------
// Screen helpers (the K6 set, plus reply, Tasks panel, mail, Participants)

function helpers(app, page, X, facts) {
    const h = {ops: app.name === 'ops', ojs: app.name === 'ojs'};
    const u = (s) => `${X.t}${s}`;
    h.u = u;
    const L = (...a) => console.log(`[${app.name}${h.phase ? ' ' + h.phase : ''}]`, ...a);
    h.L = L;
    h.fact = (k, v) => { facts[`${h.phase}: ${k}`] = v; L(k, JSON.stringify(v).slice(0, 3000)); };
    h.key1 = h.ops ? 'workflow_5' : 'workflow_1';
    h.edUrl = (id, key, ctx = X.path, loc = 'en') => app.url(`/index.php/${ctx}/${loc}/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.auUrl = (id, key, ctx = X.path) => app.url(`/index.php/${ctx}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.roundKey = (S) => `workflow_${S.reviewRounds[0].stageId}_${S.reviewRounds[0].id}`;
    h.panel = () => page.locator('[data-cy="discussion-manager"]:visible').first();
    h.snap = async (name, extra) => { const s = await screen(page); record(name, extra ? {...s, extra} : s); await shot(page, name).catch(() => {}); return s; };
    h.waitPanel = async () => {
        await h.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => L('no Add button'));
        await page.waitForFunction(() => { const p = [...document.querySelectorAll('[data-cy="discussion-manager"]')].find((e) => e.getClientRects().length); return p && !/Loading/.test(p.innerText); }, null, {timeout: 15000}).catch(() => {});
        await idle(page);
    };
    h.open = async (url, step) => { h.step = step || `open ${url.replace(/^.*index.php/, '')}`; await page.goto(url); await h.waitPanel(); };
    h.openS1 = async (who, S = X.S1, ctx = X.path) => {
        if (who === 'au') {
            if (!h.ops) return h.open(h.auUrl(S.submissionId, null, ctx));
            await page.goto(h.auUrl(S.submissionId, null, ctx)); await idle(page);
            await page.getByRole('link', {name: 'Production Tasks & Discussions'}).first().click().catch(() => L('no author link'));
            return h.waitPanel();
        }
        return h.open(h.edUrl(S.submissionId, h.key1, ctx));
    };
    h.answers = [];
    page.on('response', async (r) => {
        if (!/\/api\/v1\/.*(tasks|participants|users)|send-notification|fetch-template-body|temporaryFiles|Participant|signInAsUser|decision/.test(r.url())) return;
        const req = r.request();
        const e = {t: Date.now(), method: `${req.method()}${req.headers()['x-http-method-override'] ? '→' + req.headers()['x-http-method-override'] : ''}`, url: r.url().replace(/^.*\/api\/v1/, '').replace(/^.*\$\$\$call\$\$\$/, ''), status: r.status()};
        if (r.status() >= 400) e.body = await r.text().catch(() => null);
        h.answers.push(e);
    });
    h.since = (t0) => h.answers.filter((a) => a.t >= t0 && !/^GET/.test(a.method)).map((a) => `${a.method} ${a.url} ${a.status}${a.body ? ' ' + a.body.slice(0, 400) : ''}`);
    h.browserDialogs = [];
    page.on('dialog', async (d) => {
        h.browserDialogs.push({type: d.type(), message: d.message(), step: h.step || '-', phase: h.phase});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    h.dialogs = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length > 0).map((d) => ({name: d.getAttribute('aria-label') || (d.querySelector('h1,h2') || {}).innerText || '', text: d.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 1500)})));
    h.top = () => page.locator('[role="dialog"]:visible').last();
    h.row = (name) => h.panel().locator('tbody tr').filter({has: page.getByRole('button', {name, exact: true})}).first();
    h.panelRead = () => h.panel().evaluate((p) => [...p.querySelectorAll('tbody tr')].map((tr) => {
        const tds = [...tr.querySelectorAll('td, th')];
        const box = (td) => { const i = td && td.querySelector('input[type=checkbox]'); return i ? {checked: i.checked, disabled: i.disabled} : null; };
        return tds.length < 3 ? {group: tr.innerText.trim()} : {cells: tds.map((td) => td.innerText.trim().replace(/\s+/g, ' ')), started: box(tds[3]), closed: box(tds[4])};
    }));
    h.groupOf = (rows, name) => { let g = null; for (const r of rows) { if (r.group !== undefined) g = r.group; else if (r.cells && new RegExp(`^(Discussion|Task) ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (Created by|Task Owner)`).test(r.cells[0])) return {group: g, cells: r.cells, started: r.started, closed: r.closed}; } return null; };
    h.rowState = async (name) => h.groupOf(await h.panelRead().catch(() => []), name);
    h.rowMenu = async (name, entry) => {
        const btn = h.row(name).getByRole('button', {name: /More Actions/});
        if (!(await btn.count())) return null;
        await btn.click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
        const items = await page.getByRole('menuitem').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), disabled: e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('data-disabled'), cls: String(e.className).slice(0, 120), color: getComputedStyle(e).color})));
        if (entry) await page.getByRole('menuitem', {name: entry, exact: true}).click();
        else { await btn.click().catch(() => {}); await page.waitForTimeout(250); }
        return items;
    };
    h.win = () => page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    h.editorReady = async () => {
        await page.waitForFunction(() => window.tinymce && window.tinymce.get().some((e) => e.initialized && e.getContainer() && e.getContainer().offsetParent !== null), null, {timeout: 20000}).catch(() => L('tinymce not initialized'));
    };
    h.mce = () => page.evaluate(() => (window.tinymce ? window.tinymce.get().filter((e) => e.getContainer() && e.getContainer().offsetParent !== null).map((e) => e.getContent({format: 'text'})) : []));
    h.typeMsg = async (w, text, {replace = false} = {}) => {
        await h.editorReady();
        const body = w.frameLocator('iframe').last().locator('body');
        await body.click();
        if (replace) { await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Delete'); }
        await page.keyboard.type(text);
    };
    h.openEdit = async (name, entry = 'Edit') => {
        h.step = `${entry} ${name}`;
        const items = await h.rowMenu(name, entry);
        const w = h.win();
        await w.waitFor({timeout: 30000});
        await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('edit: no participant boxes'));
        await idle(page);
        await h.editorReady();
        await page.waitForTimeout(600);
        return {w, items};
    };
    h.box = (w, username) => w.locator('label', {hasText: `(${username})`}).locator('input[name="participants"]');
    h.tick = async (w, username, on = true) => { const b = h.box(w, username); if ((await b.count()) === 0) { L('no box for', username); return false; } await b.first().setChecked(on); return true; };
    h.owner = (w, username) => w.locator('label', {hasText: `(${username})`}).locator('input[name="taskInfoAssignee"]');
    h.editRead = (w) => w.evaluate((d) => {
        const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const lab = (e) => ((e.closest('label') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120);
        const sel = d.querySelector('select');
        return {
            heading: [...d.querySelectorAll('h1, h2')].filter(vis).map((x) => x.innerText.trim()).slice(0, 4),
            name: (d.querySelector('input[name=title]') || {}).value,
            participants: [...d.querySelectorAll('input[name=participants]')].map((e) => ({label: lab(e), checked: e.checked, disabled: e.disabled})),
            dateDue: (d.querySelector('input[name=dateDue]') || {}).value || null,
            owners: [...d.querySelectorAll('input[name=taskInfoAssignee]')].map((e) => ({label: lab(e), checked: e.checked, disabled: e.disabled})),
            startSelect: sel ? {options: [...sel.options].map((o) => o.text.trim()), selected: sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text.trim()} : null,
            buttons: [...d.querySelectorAll('button')].filter(vis).map((b) => `${(b.getAttribute('aria-label') || b.innerText || '').trim().replace(/\s+/g, ' ')}${b.disabled ? '(dis)' : ''}`).filter((x) => x && x !== '(dis)'),
            text: d.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 3000),
        };
    });
    h.errors = (w) => w.evaluate((root) => [...root.querySelectorAll('.pkpFieldError, .pkpFormErrors, .pkpFormField__error, [role="alert"]')]
        .filter((e) => e.offsetParent !== null && e.innerText.trim()).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)));
    h.save = async (w, label) => {
        const t0 = Date.now();
        h.step = `save ${label}`;
        await w.getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForResponse((r) => /\/tasks(\/\d+)?(\/start)?$/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).catch(() => null);
        await idle(page);
        await page.waitForTimeout(500);
        if (h.answers.some((a) => a.t >= t0 && !/^GET/.test(a.method) && a.status < 300)) await w.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
        const closed = !(await w.isVisible().catch(() => false));
        const errs = closed ? [] : await h.errors(w).catch(() => []);
        const res = {label, closed, errors: errs, answers: h.since(t0)};
        if (!closed) res.dialogText = flat((await h.dialogs()).slice(-1).map((d) => d.text).join(''), 600);
        L('save', label, JSON.stringify(res));
        return res;
    };
    h.cancel = async (w) => {
        if (!(await w.isVisible().catch(() => false))) return null;
        await w.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
        const warn = page.getByRole('dialog', {name: 'Warning'});
        let warned = null;
        await warn.waitFor({timeout: 1500}).then(async () => { warned = flat(await warn.innerText(), 200); await warn.getByRole('button', {name: 'Yes', exact: true}).click(); }).catch(() => {});
        await w.waitFor({state: 'hidden', timeout: 10000}).catch(() => L('window did not close on Cancel'));
        await idle(page);
        return warned;
    };
    h.openItem = async (name) => {
        h.step = `open item ${name}`;
        await h.row(name).getByRole('button', {name, exact: true}).first().click();
        const w = page.getByRole('dialog', {name, exact: true}).last();
        await w.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /Message from|assign yourself/.test(d.innerText) && !/Loading/.test(d.innerText); }, null, {timeout: 30000}).catch(() => L('window text never settled'));
        await idle(page);
        await w.getByRole('group', {name: 'Details'}).getByText(/^1\. /).first().waitFor({timeout: 10000}).catch(() => {});
        await page.waitForTimeout(600);
        return w;
    };
    h.winRead = (w) => w.evaluate((d) => {
        const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const details = [...d.querySelectorAll('[role=group]')].find((g) => /Details/.test(g.getAttribute('aria-label') || g.innerText.slice(0, 30)));
        return {
            title: (d.querySelector('h1, h2') || {}).innerText || null,
            badges: [...d.querySelectorAll('[class*="badge"], [class*="Badge"]')].filter(vis).map((b) => b.innerText.trim()).filter((x) => x && x.length < 40),
            details: details ? details.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 1500) : null,
            text: d.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 5000),
            messages: d.innerText.split('Message from').slice(1).map((m) => m.replace(/\s*\n+\s*/g, ' | ').slice(0, 300)),
            files: [...d.querySelectorAll('a[href*="download-file"]')].map((a) => ({text: a.innerText.trim(), href: a.href})),
        };
    });
    h.closeItem = async (w) => {
        await w.getByRole('button', {name: 'Close', exact: true}).last().click({timeout: 5000}).catch(() => {});
        const warn = page.getByRole('dialog', {name: 'Warning'});
        await warn.waitFor({timeout: 1200}).then(() => warn.getByRole('button', {name: 'Yes', exact: true}).click()).catch(() => {});
        await page.waitForTimeout(600);
    };
    h.tickRow = async (name, col, answer, label) => {
        const cell = h.row(name).locator('td').nth(col === 'Started' ? 3 : 4);
        const input = cell.locator('input[type=checkbox]');
        const before = await input.evaluate((c) => ({checked: c.checked, disabled: c.disabled})).catch(() => null);
        const t0 = Date.now();
        await cell.locator('label').click({timeout: 5000}).catch((e) => L('row box click', e.message.slice(0, 120)));
        await page.waitForTimeout(700);
        const dlg = page.getByRole('dialog').filter({hasText: /\?/}).filter({hasNot: page.locator('[data-cy="discussion-manager"]')}).last();
        const shown = await dlg.count() && await dlg.isVisible().catch(() => false);
        const d = shown ? await dlg.innerText().catch(() => null) : null;
        if (shown) {
            await dlg.getByRole('button', {name: answer, exact: true}).click();
            await page.waitForResponse((r) => /\/tasks\/\d+\/(close|open|start)$/.test(r.url()), {timeout: answer === 'Yes' ? 15000 : 2000}).catch(() => null);
        }
        await idle(page); await page.waitForTimeout(800); await idle(page);
        const out = {label, col, before, confirm: d ? flat(d, 300) : null, answers: h.since(t0)};
        h.fact(label, out);
        return out;
    };
    h.history = async (name, label) => {
        h.step = `history ${name}`;
        await h.rowMenu(name, 'History');
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /History/.test(d.innerText) && /created| by |No Items/.test(d.innerText) && !/Loading/.test(d.innerText); }, null, {timeout: 20000}).catch(() => L('history never filled'));
        await idle(page); await page.waitForTimeout(500);
        const top = h.top();
        const table = await top.evaluate((d) => {
            const t = d.querySelector('table');
            const heads = t ? [...t.querySelectorAll('thead th')].map((th) => ({text: th.innerText.trim(), srOnly: /sr-only|visually-hidden/.test(th.className) || th.getClientRects().length === 0 || th.innerText.trim() === ''})) : [];
            const rows = t ? [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => { const a = td.querySelector('a'); return a ? `${td.innerText.trim()} [link ${a.getAttribute('href') ? 'href' : 'nohref'}]` : td.innerText.trim(); })) : [];
            const hs = [...d.querySelectorAll('h1, h2, h3, p')].slice(0, 4).map((x) => x.innerText.trim());
            return {heads, rows, hs, text: d.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 2500)};
        }).catch((e) => ({error: e.message}));
        await h.snap(label, {table});
        h.fact(label, table);
        await top.getByRole('button', {name: 'Close', exact: true}).first().click({timeout: 5000}).catch(() => {});
        await page.waitForTimeout(700);
        return table;
    };
    h.attachUpload = async (w, label) => {
        await w.getByRole('button', {name: 'Attach Files'}).last().click();
        await idle(page); await page.waitForTimeout(400);
        await h.top().getByRole('button', {name: 'Upload File', exact: true}).first().click();
        await idle(page); await page.waitForTimeout(400);
        await page.locator('input[type="file"]').last().setInputFiles(fixturePath(app));
        await h.top().getByRole('button', {name: /Remove/}).first().waitFor({timeout: 20000}).catch(() => L('upload shows no Remove'));
        await idle(page);
        await h.top().getByRole('button', {name: 'Attach Files', exact: true}).last().click();
        await idle(page); await page.waitForTimeout(500);
    };
    h.add = async ({title, parts = [], untick = [], message, upload, label, readOnly}) => {
        await h.panel().getByRole('button', {name: 'Add', exact: true}).first().click();
        const w = h.win();
        await w.waitFor({timeout: 30000});
        await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('add: no participant boxes'));
        await idle(page);
        if (readOnly) { const r = await h.editRead(w); await h.snap(`${label}-add-window`); await h.cancel(w); return r; }
        await w.locator('input[name="title"]').fill(title);
        for (const p of parts) await h.tick(w, p);
        for (const p of untick) await h.tick(w, p, false);
        await h.typeMsg(w, message || `${title} first message`);
        if (upload) await h.attachUpload(w, label);
        await h.snap(`${label}-filled`);
        const r = await h.save(w, label);
        if (!r.closed) { await h.snap(`${label}-refused`); await h.cancel(w); }
        return r;
    };
    h.reply = async (w, text, label, {upload} = {}) => {
        const t0 = Date.now();
        await w.getByRole('button', {name: 'Add New Message'}).click();
        await idle(page);
        await h.editorReady();
        if (upload) await h.attachUpload(w, label);
        await h.typeMsg(w, text);
        await w.getByRole('button', {name: 'Save', exact: true}).last().click();
        await page.waitForResponse((r) => /\/tasks\/\d+\/notes/.test(r.url()) && r.request().method() === 'POST', {timeout: 15000}).catch(() => L('no notes POST'));
        await idle(page); await page.waitForTimeout(800);
        const res = {label, answers: h.since(t0), dialogs: (await h.dialogs()).slice(2).map((d) => d.text.slice(0, 300))};
        L('reply', label, JSON.stringify(res));
        return res;
    };
    h.tasksPanel = async (label) => {
        const bell = page.getByRole('button', {name: /^Tasks/}).first();
        if (!(await bell.count())) return {absent: true};
        const bellName = await bell.innerText().catch(() => null);
        await bell.click();
        const d = page.locator('[role="dialog"]:visible').last();
        await d.waitFor({timeout: 15000}).catch(() => {});
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return x && !/Loading/.test(x.innerText) && (x.querySelector('tbody tr, tr.gridRow') || /No Items/.test(x.innerText)); }, null, {timeout: 20000}).catch(() => L('tasks panel never filled'));
        await idle(page); await page.waitForTimeout(800);
        const rows = await d.locator('tr.gridRow, tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 300)).filter(Boolean)).catch(() => []);
        await h.snap(label, {rows, bellName});
        const c = d.getByRole('button', {name: /^Close$/}).first();
        if (await c.count()) { await c.click().catch(() => {}); await idle(page); }
        return {bellName, rows};
    };
    h.wf = () => page.locator('[role="dialog"]:visible').first();
    h.partMenu = async (k, entry, full) => {
        const name = full || NAMES[k];
        const btn = page.getByRole('button', {name: `${name} More Actions`, exact: true}).first();
        if (!(await btn.count())) return {absent: true};
        await btn.click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
        const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
        if (entry) await page.getByRole('menuitem', {name: entry, exact: true}).click();
        else { await btn.click().catch(() => {}); await page.waitForTimeout(250); }
        return {items};
    };
    h.em = (k) => `${u(k)}@mail.test`;
    h.mailCount = (k, opts = {}) => app.mail.count({to: h.em(k), ...opts}).catch(() => -1);
    h.mailFind = async (k, opts = {}) => { try { const m = await app.mail.find({to: h.em(k), timeoutMs: 15000, ...opts}); const f = await app.mail.fullMessage(m.ID); const html = f.HTML || ''; return {subject: f.Subject, from: f.From && f.From.Address, text: (f.Text || '').replace(/\s+/g, ' ').slice(0, 1500), unsubscribe: (html.match(/href=["']([^"']*unsubscribe[^"']*)["']/i) || [])[1] || null}; } catch (e) { return {none: String(e.message).slice(0, 160)}; } };
    return h;
}

// ---------------------------------------------------------------------------
// Phase hist (Rule 18): every History event on one item, newest first; Login As.

async function phaseHist(app, X, h, page) {
    h.phase = 'hist';
    const u = h.u;
    const H = 'K7 Hist';
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.openS1('mg');
    await h.snap('hist-panel-mg', {panel: await h.panelRead()});
    // 1. created (with a file on the first message).
    h.fact('add', await h.add({title: H, parts: [u('se'), u('au')], message: 'K7 Hist first message', upload: true, label: 'hist-add'}));
    await h.openS1('mg');
    let w0 = await h.openItem(H);
    h.fact('window after add', await h.winRead(w0));
    await h.closeItem(w0);
    // 2. se replies with a file.
    await signIn(page, u('se'), {contextPath: X.path});
    await h.openS1('se');
    let w = await h.openItem(H);
    h.fact('se reply', await h.reply(w, 'K7 Hist reply by se', 'hist-se-reply', {upload: true}));
    await h.closeItem(w);
    // 3. mg edits: s2 added, au removed.
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.openS1('mg');
    let e = await h.openEdit(H);
    await h.tick(e.w, u('s2')); await h.tick(e.w, u('au'), false);
    h.fact('edit participants', await h.save(e.w, 'hist-edit-participants'));
    // 4. mg removes the first message's file.
    await h.openS1('mg');
    e = await h.openEdit(H);
    h.fact('edit window before file removal', await h.editRead(e.w));
    const rm = e.w.getByRole('button', {name: /Remove/}).first();
    h.fact('remove button count', await rm.count());
    if (await rm.count()) { await rm.click(); await page.waitForTimeout(500); }
    h.fact('edit remove file', await h.save(e.w, 'hist-edit-remove-file'));
    // 5. Add Task Details: owner se, due +7.
    await h.openS1('mg');
    e = await h.openEdit(H, 'Add Task Details');
    await page.waitForTimeout(800);
    const tb = e.w.getByRole('checkbox', {name: 'Enter task information'});
    if (await tb.count() && !(await tb.isChecked())) await tb.check();
    await page.waitForTimeout(300);
    await e.w.locator('input[name="dateDue"]').fill(day(7));
    await h.owner(e.w, u('se')).first().check().catch((x) => h.L('owner se', x.message.slice(0, 100)));
    h.fact('task details window', await h.editRead(e.w));
    h.fact('convert', await h.save(e.w, 'hist-convert'));
    // 6. Edit: owner s2, due +10.
    await h.openS1('mg');
    e = await h.openEdit(H);
    await e.w.locator('input[name="dateDue"]').fill(day(10));
    await h.owner(e.w, u('s2')).first().check().catch((x) => h.L('owner s2', x.message.slice(0, 100)));
    h.fact('edit owner+due', await h.save(e.w, 'hist-edit-owner-due'));
    await h.openS1('mg');
    h.fact('row after edits', await h.rowState(H));
    // 7. Login As se (Participants row menu), reply as se.
    const la = await h.partMenu('se', 'Login As');
    h.fact('se participant menu', la);
    const conf = page.getByRole('dialog').filter({hasText: /Log in as this user/}).last();
    await conf.waitFor({timeout: 10000}).catch(() => h.L('no Login As confirm'));
    h.fact('login as confirm', flat(await conf.innerText().catch(() => null), 300));
    await conf.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
    await page.waitForLoadState('load').catch(() => {}); await page.waitForTimeout(1500);
    await h.openS1('se');
    await h.snap('hist-loginas-se-panel');
    w = await h.openItem(H);
    h.fact('reply while impersonating', await h.reply(w, 'K7 Hist reply during Login As', 'hist-loginas-reply'));
    h.fact('window during Login As', (await h.winRead(w)).messages);
    await h.snap('hist-loginas-window');
    await h.closeItem(w);
    await h.openS1('se');
    h.fact('row during Login As', await h.rowState(H));
    // 8. back as mg: the window's messages, then start, close.
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.openS1('mg');
    w = await h.openItem(H);
    h.fact('window as mg after Login As reply', (await h.winRead(w)).messages);
    await h.closeItem(w);
    await h.openS1('mg');
    const st = await h.rowState(H);
    h.fact('row before start', st);
    if (st && st.started && !st.started.checked && !st.started.disabled) await h.tickRow(H, 'Started', 'Yes', 'hist-start');
    await h.openS1('mg');
    await h.tickRow(H, 'Closed', 'Yes', 'hist-close');
    // Hist2: a discussion closed and reopened.
    await h.openS1('mg');
    await h.tickRow('K7 Hist2', 'Closed', 'Yes', 'hist2-close');
    await h.openS1('mg');
    await h.tickRow('K7 Hist2', 'Closed', 'Yes', 'hist2-reopen');
    await h.openS1('mg');
    h.fact('rows at the end', {hist: await h.rowState(H), hist2: await h.rowState('K7 Hist2')});
    await h.history(H, 'hist-history-mg');
    await h.history('K7 Hist2', 'hist2-history-mg');
    await h.history('K7 Over', 'hist-over-history-mg');
    await loc(page, 'History window (last dialog)', h.top());
    // The Download link: press it.
    await h.rowMenu(H, 'History');
    await page.waitForTimeout(1500); await idle(page);
    const dl = h.top().getByRole('link', {name: /Download/}).first();
    h.fact('download links', await h.top().getByRole('link', {name: /Download/}).count());
    if (await dl.count()) {
        await loc(page, 'History row "Download" link', dl);
        const href = await dl.getAttribute('href');
        const [popup, dlev] = await Promise.all([page.context().waitForEvent('page', {timeout: 8000}).catch(() => null), page.waitForEvent('download', {timeout: 8000}).catch(() => null), dl.click().catch(() => {})]);
        let pd = null;
        if (popup) pd = await popup.waitForEvent('download', {timeout: 8000}).then((d) => d.suggestedFilename()).catch(() => null);
        h.fact('download press', {href: href && href.replace(/^.*index.php/, ''), target: await dl.getAttribute('target'), popup: popup ? popup.url().replace(/^.*index.php/, '') : null, download: dlev ? dlev.suggestedFilename() : pd});
        if (popup) await popup.close().catch(() => {});
    }
    await h.top().getByRole('button', {name: 'Close', exact: true}).first().click({timeout: 5000}).catch(() => {});
    // The same History as se and as au (au was removed).
    await signIn(page, u('se'), {contextPath: X.path});
    await h.openS1('se');
    h.fact('se menu on Hist', await h.rowMenu(H));
    // Submission files: do message files show on the file lists? (OJS/OMP)
    if (!h.ops) {
        await signIn(page, u('mg'), {contextPath: X.path});
        await page.goto(h.edUrl(X.S1.submissionId, h.key1)); await idle(page); await page.waitForTimeout(800);
        const s = await h.snap('xref-files-s1-mg');
        h.fact('Submission Files list mentions the message files', {fixture: FIX[app.name], present: (s.text.dialog || '').includes(FIX[app.name]), excerpt: flat((s.text.dialog || '').match(/Submission Files[\s\S]{0,400}/) ? (s.text.dialog || '').match(/Submission Files[\s\S]{0,400}/)[0] : '', 400)});
    }
}

// ---------------------------------------------------------------------------
// Phase del (Rule 19)

async function phaseDel(app, X, h, page) {
    h.phase = 'del';
    const u = h.u;
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.openS1('mg');
    let w = await h.openItem('K7 Del');
    h.fact('reply with file', await h.reply(w, 'K7 Del reply with a file', 'del-reply', {upload: true}));
    const before = await h.winRead(w);
    h.fact('window before', {files: before.files, messages: before.messages});
    X.delFile = before.files[0] && before.files[0].href;
    await h.closeItem(w);
    const mailsBefore = {se: await h.mailCount('se'), au: await h.mailCount('au'), mg: await h.mailCount('mg')};
    // se and au Tasks panels before.
    const tp = {};
    for (const k of ['se', 'au']) {
        await signIn(page, u(k), {contextPath: X.path});
        await page.goto(app.url(`/index.php/${X.path}/en/dashboard/${k === 'au' ? 'mySubmissions' : 'editorial'}`)); await idle(page);
        const p = await h.tasksPanel(`del-tasks-${k}-before`);
        tp[k] = {before: (p.rows || []).filter((r) => /K7 Del\b/.test(r) && !/DelNo/.test(r))};
    }
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.openS1('mg');
    // Cancel first (on DelNo), then OK (on Del).
    const menu = await h.rowMenu('K7 DelNo', 'Delete');
    h.fact('menu', menu);
    let dlg = page.getByRole('dialog').filter({hasText: 'Are you sure'}).last();
    await dlg.waitFor({timeout: 10000}).catch(() => h.L('no delete dialog'));
    const dd = await dlg.evaluate((el) => ({name: el.getAttribute('aria-label'), heading: (el.querySelector('h1,h2,h3,[class*=title]') || {}).innerText, text: el.innerText, buttons: [...el.querySelectorAll('button')].map((b) => ({text: b.innerText.trim(), color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor, cls: String(b.className).slice(0, 160)}))})).catch((x) => ({error: x.message}));
    await h.snap('del-dialog', {dialog: dd});
    await loc(page, 'Delete dialog', dlg);
    h.fact('dialog', dd);
    let t0 = Date.now();
    await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
    await page.waitForTimeout(800); await idle(page);
    h.fact('cancel', {answers: h.since(t0), row: await h.rowState('K7 DelNo')});
    await h.openS1('mg');
    h.fact('after cancel reload', await h.rowState('K7 DelNo'));
    await h.rowMenu('K7 Del', 'Delete');
    dlg = page.getByRole('dialog').filter({hasText: 'Are you sure'}).last();
    await dlg.waitFor({timeout: 10000}).catch(() => {});
    t0 = Date.now();
    await dlg.getByRole('button', {name: 'OK', exact: true}).click();
    await page.waitForResponse((r) => /\/tasks\/\d+$/.test(r.url()), {timeout: 15000}).catch(() => null);
    await idle(page); await page.waitForTimeout(800);
    await h.snap('del-after-ok', {panel: await h.panelRead()});
    h.fact('ok', {answers: h.since(t0), row: await h.rowState('K7 Del')});
    await h.openS1('mg');
    h.fact('after ok reload', {row: await h.rowState('K7 Del'), rows: (await h.panelRead()).filter((r) => r.cells).map((r) => r.cells[0])});
    // The file link the window gave, pressed again.
    if (X.delFile) {
        const p2 = await page.context().newPage();
        const resp = await p2.goto(X.delFile).catch((x) => ({err: x.message}));
        h.fact('file link after delete', {status: resp && resp.status ? resp.status() : resp, text: flat(await p2.locator('body').innerText().catch(() => ''), 300)});
        await p2.close();
    }
    await page.waitForTimeout(3000);
    const mailsAfter = {se: await h.mailCount('se'), au: await h.mailCount('au'), mg: await h.mailCount('mg')};
    h.fact('mail counts', {before: mailsBefore, after: mailsAfter});
    for (const k of ['se', 'au']) {
        await signIn(page, u(k), {contextPath: X.path});
        await page.goto(app.url(`/index.php/${X.path}/en/dashboard/${k === 'au' ? 'mySubmissions' : 'editorial'}`)); await idle(page);
        const p = await h.tasksPanel(`del-tasks-${k}-after`);
        tp[k].after = (p.rows || []).filter((r) => /K7 Del\b/.test(r) && !/DelNo/.test(r));
    }
    h.fact('Tasks rows', tp);
}

// ---------------------------------------------------------------------------
// Phase notify (Rule 21 first bullet, A9 on a Participants message, 595–598)

async function phaseNotify(app, X, h, page) {
    h.phase = 'notify';
    const u = h.u;
    const tplName = h.ops ? 'Discussion (Production)' : 'Discussion (Submission)';
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.openS1('mg');
    const rowsOf = async () => (await h.panelRead()).filter((r) => r.cells).map((r) => r.cells[0]);
    const before = await rowsOf();
    const m = await h.partMenu('se', 'Notify');
    h.fact('se menu', m);
    const nw = page.getByRole('dialog').filter({has: page.locator('form select[name="template"]')}).last();
    await nw.waitFor({timeout: 30000}); await idle(page);
    const opts = await nw.locator('select[name="template"] option').evaluateAll((els) => els.map((o) => o.text.trim()));
    h.fact('notify options', opts);
    await nw.locator('select[name="template"]').selectOption({label: tplName}).catch((x) => h.L('select', x.message.slice(0, 100)));
    await page.waitForResponse((r) => r.url().includes('fetch-template-body'), {timeout: 20000}).catch(() => {});
    await idle(page); await page.waitForTimeout(800);
    const id = await nw.locator('textarea[name="message"]').getAttribute('id');
    await page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, id, {timeout: 20000}).catch(() => {});
    await page.evaluate(([i, t]) => { window.tinymce.get(i).setContent(`<p>${t}</p>`); window.tinymce.get(i).fire('change'); }, [id, 'K7 notify first text']);
    await h.snap('notify-window');
    let t0 = Date.now();
    await nw.getByRole('button', {name: 'Notify', exact: true}).click();
    await page.waitForResponse((r) => r.url().includes('send-notification'), {timeout: 30000}).catch(() => h.L('no send-notification'));
    await idle(page);
    h.fact('notify answers', h.since(t0));
    await h.openS1('mg');
    const added = (await rowsOf()).filter((r) => !before.includes(r));
    h.fact('added rows', added);
    const nm = added[0] ? (await h.panel().locator('tbody tr').filter({hasText: added[0]}).first().locator('[id^="discussion_name_"]').innerText().catch(() => '')).trim() : null;
    X.names.notify = nm;
    h.fact('se mail', await h.mailFind('se', {contains: 'K7 notify first text'}));
    if (nm) {
        await h.snap('notify-panel', {panel: await h.panelRead()});
        let w = await h.openItem(nm);
        await h.snap('notify-window-item');
        h.fact('window', await h.winRead(w));
        await h.closeItem(w);
        await h.openS1('mg');
        await h.history(nm, 'notify-history');
        // A9: Edit › message box › replace › Save.
        const e = await h.openEdit(nm);
        await h.snap('a9-notify-edit');
        h.fact('A9 notify edit window', {read: await h.editRead(e.w), mce: await h.mce()});
        await h.typeMsg(e.w, 'K7 notify edited text', {replace: true});
        h.fact('A9 notify save', await h.save(e.w, 'a9-notify'));
        await h.openS1('mg');
        w = await h.openItem(nm);
        await h.snap('a9-notify-after');
        h.fact('A9 notify window after', (await h.winRead(w)).messages);
        await h.closeItem(w);
    }
    // "Assign" with a predefined message.
    await h.openS1('mg');
    const before2 = await rowsOf();
    await page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true}).click();
    const aw = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
    await aw.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
    await idle(page);
    const roleOpts = await aw.locator('select[name="filterUserGroupId"] option').evaluateAll((els) => els.map((o) => o.text.trim()));
    const roleLabel = roleOpts.find((o) => /Section editor|Series editor|Moderator/i.test(o));
    await aw.locator('select[name="filterUserGroupId"]').selectOption({label: roleLabel});
    await idle(page);
    await aw.getByRole('textbox', {name: 'Search User By Name'}).fill(u('as'));
    await aw.getByRole('button', {name: 'Search', exact: true}).click();
    await idle(page); await page.waitForTimeout(600);
    await aw.getByRole('row').filter({hasText: NAMES.as}).locator('input[name="userId"]').check().catch((x) => h.L('pick as', x.message.slice(0, 100)));
    await idle(page);
    const aopts = await aw.locator('select[name="template"] option').evaluateAll((els) => els.map((o) => o.text.trim())).catch(() => []);
    h.fact('assign options', {roles: roleOpts, templates: aopts});
    await aw.locator('select[name="template"]').selectOption({label: tplName}).catch((x) => h.L('assign select', x.message.slice(0, 100)));
    await page.waitForTimeout(1500); await idle(page);
    const aid = await aw.locator('textarea[name="message"]').getAttribute('id').catch(() => null);
    if (aid) {
        await page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, aid, {timeout: 20000}).catch(() => {});
        await page.evaluate(([i, t]) => { window.tinymce.get(i).setContent(`<p>${t}</p>`); window.tinymce.get(i).fire('change'); }, [aid, 'K7 assign text']);
    }
    await h.snap('assign-filled');
    t0 = Date.now();
    await aw.getByRole('button', {name: 'OK', exact: true}).click();
    await page.waitForTimeout(2500); await idle(page);
    h.fact('assign answers', h.since(t0));
    await h.openS1('mg');
    const added2 = (await rowsOf()).filter((r) => !before2.includes(r));
    h.fact('assign added rows', added2);
    await h.snap('assign-panel', {panel: await h.panelRead()});
    h.fact('as mail', await h.mailFind('as', {contains: 'K7 assign text'}));
    if (added2[0]) {
        const an = (await h.panel().locator('tbody tr').filter({hasText: added2[0]}).first().locator('[id^="discussion_name_"]').innerText().catch(() => '')).trim();
        X.names.assign = an;
        await h.panel().locator('tbody tr').filter({hasText: `Created by: ${u('as')}`}).first().getByRole('button', {name: an, exact: true}).click();
        const w = page.getByRole('dialog', {name: an, exact: true}).last();
        await w.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /Message from/.test(d.innerText) && !/Loading/.test(d.innerText); }, null, {timeout: 30000}).catch(() => {});
        await idle(page); await page.waitForTimeout(800);
        await h.snap('assign-window-item');
        h.fact('assign window', await h.winRead(w));
        await h.closeItem(w);
    }
}

// ---------------------------------------------------------------------------
// Phase disabled (Rule 22, td14)

async function phaseDisabled(app, X, h, page) {
    h.phase = 'disabled';
    const u = h.u;
    // dz replies first.
    await signIn(page, u('dz'), {contextPath: X.path});
    await h.openS1('dz');
    let w = await h.openItem('K7 Dis');
    h.fact('dz reply', await h.reply(w, 'K7 Dis reply by dz', 'dis-dz-reply'));
    await h.closeItem(w);
    // mg disables dz.
    await signIn(page, u('mg'), {contextPath: X.path});
    const accessUrl = app.url(`/index.php/${X.path}/en/management/settings/access`);
    const usersTable = page.getByRole('table', {name: /Current Users \(/});
    const flip = async (re, label) => {
        await page.goto(accessUrl); await usersTable.waitFor({timeout: 20000}).catch(() => {}); await idle(page);
        await usersTable.getByRole('row').filter({hasText: h.em('dz')}).getByRole('button', {name: /options/i}).click();
        await page.getByRole('menuitem').first().waitFor({timeout: 5000}).catch(() => {});
        const menu = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
        await page.getByRole('menuitem', {name: re}).first().click();
        const dlg = page.getByRole('dialog').last();
        await dlg.waitFor({timeout: 10000}).catch(() => {});
        await idle(page);
        const text = await dlg.innerText().catch(() => null);
        await dlg.getByRole('button', {name: /^(OK|Yes|Save|Disable|Enable)/}).first().click().catch((x) => h.L('flip', x.message.slice(0, 120)));
        await dlg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page);
        await page.goto(accessUrl); await usersTable.waitFor({timeout: 20000}).catch(() => {}); await idle(page);
        const row = await usersTable.getByRole('row').filter({hasText: h.em('dz')}).innerText().catch(() => null);
        await h.snap(`dis-${label}`);
        h.fact(label, {menu, dialog: flat(text, 300), row: flat(row, 300)});
    };
    await flip(/^Disable/, 'disable-dz');
    await h.openS1('mg');
    await h.snap('dis-panel-mg', {panel: await h.panelRead()});
    h.fact('rows', {DisT: await h.rowState('K7 DisT'), DisC: await h.rowState('K7 DisC'), Dis: await h.rowState('K7 Dis')});
    w = await h.openItem('K7 Dis');
    await h.snap('dis-window-mg');
    h.fact('window', await h.winRead(w));
    await h.closeItem(w);
    await h.openS1('mg');
    w = await h.openItem('K7 DisT');
    h.fact('task window', await h.winRead(w));
    await h.closeItem(w);
    await h.openS1('mg');
    let e = await h.openEdit('K7 Dis');
    await h.snap('dis-edit-mg');
    h.fact('edit list', (await h.editRead(e.w)).participants);
    // sweep: Save with a rename only; does dz stay?
    await e.w.locator('input[name="title"]').fill('K7 Dis renamed');
    h.fact('rename save', await h.save(e.w, 'dis-rename'));
    await h.openS1('mg');
    const disName = (await h.rowState('K7 Dis renamed')) ? 'K7 Dis renamed' : 'K7 Dis';
    X.names.dis = disName;
    e = await h.openEdit(disName);
    h.fact('edit list after rename', (await h.editRead(e.w)).participants);
    await h.cancel(e.w);
    await h.openS1('mg');
    await h.history(disName, 'dis-history-mg');
    // New item: is dz offered?
    await h.openS1('mg');
    const add = await h.add({label: 'dis-add', readOnly: true});
    h.fact('add window participants', add.participants.map((p) => p.label));
    // Reply once more; dz's mail.
    await h.openS1('mg');
    w = await h.openItem(disName);
    const txt = `K7 while disabled ${rnd()}`;
    h.fact('mg reply', await h.reply(w, txt, 'dis-mg-reply'));
    await h.closeItem(w);
    h.fact('mails for the reply', {se: await h.mailCount('se', {contains: txt}), dz: await h.mailCount('dz', {contains: txt})});
    // Enable again; dz's Tasks panel.
    await flip(/^Enable/, 'enable-dz');
    await signIn(page, u('dz'), {contextPath: X.path});
    await page.goto(app.url(`/index.php/${X.path}/en/dashboard/editorial`)); await idle(page);
    const p = await h.tasksPanel('dis-tasks-dz');
    h.fact('dz Tasks rows', (p.rows || []).filter((r) => /K7 Dis/.test(r)));
    await signIn(page, u('se'), {contextPath: X.path});
    await page.goto(app.url(`/index.php/${X.path}/en/dashboard/editorial`)); await idle(page);
    const p2 = await h.tasksPanel('dis-tasks-se');
    h.fact('se Tasks rows (control)', (p2.rows || []).filter((r) => /K7 Dis/.test(r)));
}

// ---------------------------------------------------------------------------
// Phase xref (Cross-feature interactions): stage access, author and reviewer
// views, the decision composer, notifications, activity log, French.

async function phaseXref(app, X, h, page) {
    h.phase = 'xref';
    const u = h.u;
    // Author view (584–592).
    await signIn(page, u('au'), {contextPath: X.path});
    await h.openS1('au');
    await h.snap('xref-author-panel', {panel: await h.panelRead().catch(() => null)});
    h.fact('author panel heading', flat(await h.panel().innerText().catch(() => null), 200));
    // Stage access: the copyeditor (OJS/OMP).
    if (!h.ops) {
        await signIn(page, u('ce'), {contextPath: X.path});
        await page.goto(h.edUrl(X.SC.submissionId)); await idle(page); await page.waitForTimeout(1000);
        const s = await h.snap('xref-ce-workflow');
        h.fact('ce workflow menu', flat((s.text.dialog || '').slice(0, 600), 600));
        await page.goto(h.edUrl(X.SC.submissionId, 'workflow_1')); await idle(page); await page.waitForTimeout(1000);
        const s2 = await h.snap('xref-ce-typed-submission-stage');
        h.fact('ce typed workflow_1', {panel: await page.locator('[data-cy="discussion-manager"]:visible').count(), text: flat((s2.text.dialog || '').slice(0, 500), 500)});
        await page.goto(h.edUrl(X.SC.submissionId, 'workflow_4')); await idle(page); await page.waitForTimeout(1000);
        await h.snap('xref-ce-copyediting');
        h.fact('ce copyediting panel', {panel: await page.locator('[data-cy="discussion-manager"]:visible').count(), heading: flat(await h.panel().innerText().catch(() => ''), 120)});
    }
    // Reviewer steps 3 and 4 (OJS/OMP).
    if (!h.ops && X.SR) {
        await signIn(page, u('rv1'), {contextPath: X.path});
        await page.goto(app.url(`/index.php/${X.path}/en/reviewer/submission/${X.SR.submissionId}`)); await idle(page);
        const sc1 = page.getByRole('button', {name: 'Save and continue'});
        if (await sc1.count()) { await sc1.first().click(); await idle(page); await page.waitForTimeout(800); }
        const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
        await c3.waitFor({timeout: 15000}).catch(() => {});
        if (await c3.count()) { await c3.click(); await idle(page); await page.waitForTimeout(1200); }
        await page.locator('[data-cy="discussion-manager"]').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        await h.snap('xref-rv1-step3');
        h.fact('rv1 step 3 panel', flat(await page.locator('[data-cy="discussion-manager"]:visible').first().innerText().catch(() => null), 300));
        await signIn(page, u('rv3'), {contextPath: X.path});
        await page.goto(app.url(`/index.php/${X.path}/en/reviewer/submission/${X.SR.submissionId}`)); await idle(page); await page.waitForTimeout(1200);
        await h.snap('xref-rv3-completed');
        h.fact('rv3 landing', {url: page.url().replace(/^.*index.php/, ''), current: await page.locator('[role=tab][aria-selected=true]').allInnerTexts().catch(() => []), panels: await page.locator('[data-cy="discussion-manager"]:visible').count(), heads: flat(await page.locator('[data-cy="discussion-manager"]:visible').first().innerText().catch(() => ''), 160)});
        await page.goto(app.url(`/index.php/${X.path}/en/reviewer/submission/${X.SR.submissionId}?step=4`)); await idle(page); await page.waitForTimeout(1200);
        await h.snap('xref-rv3-step4');
        h.fact('rv3 step 4', {current: await page.locator('[role=tab][aria-selected=true]').allInnerTexts().catch(() => []), panels: await page.locator('[data-cy="discussion-manager"]:visible').count()});
        await page.goto(app.url(`/index.php/${X.path}/en/reviewer/submission/${X.SR.submissionId}?step=3`)); await idle(page); await page.waitForTimeout(1200);
        await h.snap('xref-rv3-step3');
        h.fact('rv3 step 3', {current: await page.locator('[role=tab][aria-selected=true]').allInnerTexts().catch(() => []), panels: await page.locator('[data-cy="discussion-manager"]:visible').count()});
    }
    // The decision composer: "Find Template" and "Attach Files".
    await signIn(page, u('mg'), {contextPath: X.path});
    const S = h.ops ? X.S1 : X.SR;
    await page.goto(h.ops ? h.edUrl(S.submissionId, h.key1) : h.edUrl(S.submissionId, h.roundKey(S))); await idle(page); await page.waitForTimeout(1000);
    const acts = await page.locator('[data-cy="workflow-action-items"]').getByRole('button').allInnerTexts().catch(() => []);
    h.fact('decision buttons', acts);
    const pick = ['Decline Submission', 'Decline', 'Accept Submission', 'Accept and Skip Review', 'Send to Production'].find((b) => acts.map((a) => a.trim()).includes(b)) || acts[0];
    if (pick) {
        await page.locator('[data-cy="workflow-action-items"]').getByRole('button', {name: pick.trim(), exact: true}).first().click();
        await page.waitForURL(/\/decision\//, {timeout: 20000}).catch(() => {});
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page); await page.waitForTimeout(1000);
        // walk to the first page with an email composer
        for (let i = 0; i < 4 && !(await page.getByRole('searchbox', {name: /Find Template/}).count()); i++) {
            const cont = page.getByRole('button', {name: 'Continue', exact: true});
            if (!(await cont.count())) break;
            await cont.first().click(); await idle(page); await page.waitForTimeout(800);
        }
        await h.snap('xref-decision-composer');
        const fs1 = page.getByRole('searchbox', {name: /Find Template/}).first();
        const res = {decision: pick, url: page.url().replace(/^.*index.php/, ''), findTemplate: await fs1.count()};
        if (res.findTemplate) {
            await loc(page, 'decision composer Find Template', fs1);
            for (const q of ['Decline', 'Discussion', h.ops ? 'Assign Editor' : 'Request Copyedit']) {
                await fs1.fill(q); await fs1.press('Enter');
                await page.waitForTimeout(1500); await idle(page);
                const box = await page.evaluate(() => { const t = (document.querySelector('main') || document.body).innerText; const i = t.indexOf('Find Template'); const j = t.indexOf('To:', i); return i < 0 ? null : t.slice(i, j > i ? j : i + 900).replace(/\s*\n+\s*/g, ' | ').slice(0, 900); });
                res[`search ${q}`] = box;
                await h.snap(`xref-decision-find-${q.replace(/\W+/g, '')}`);
            }
        }
        const att = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
        if (await att.count()) {
            await att.click(); await idle(page); await page.waitForTimeout(800);
            res.attachSources = await h.top().getByRole('button').allInnerTexts().catch(() => []);
            await h.snap('xref-decision-attach');
            await h.top().getByRole('button', {name: /^(Cancel|Close)$/}).last().click().catch(() => {});
        }
        h.fact('decision composer', res);
    }
    // Notifications: se's Profile › Notifications, the Tasks panel, an email's footer and unsubscribe page.
    await signIn(page, u('se'), {contextPath: X.path});
    await page.goto(app.url(`/index.php/${X.path}/en/user/profile/notificationSettings`)); await idle(page); await page.waitForTimeout(800);
    let s = await h.snap('xref-se-notification-settings');
    const txt = s.text.main || '';
    h.fact('profile notifications', {url: page.url().replace(/^.*index.php/, ''), discussionAdded: (txt.match(/[^\n]*Discussion added[^\n]*/g) || []).slice(0, 4), discussionActivity: (txt.match(/[^\n]*Discussion activity[^\n]*/g) || []).slice(0, 4)});
    await page.goto(app.url(`/index.php/${X.path}/en/dashboard/editorial`)); await idle(page);
    const tp = await h.tasksPanel('xref-se-tasks');
    h.fact('se Tasks rows (K7)', {rows: (tp.rows || []).filter((r) => /K7/.test(r)).slice(0, 12), activity: (tp.rows || []).filter((r) => /Discussion activity/i.test(r)).length});
    const mail = await h.mailFind('se', {contains: 'K7 Hist'});
    h.fact('se discussion email', mail);
    if (mail.unsubscribe) {
        await page.goto(mail.unsubscribe.replace(/&amp;/g, '&')).catch(() => {}); await idle(page);
        await h.snap('xref-unsubscribe-page');
        const ub = await page.locator('body').innerText().catch(() => '');
        h.fact('unsubscribe page', {head: flat(ub, 300), discussionLines: (ub.match(/[^\n]*[Dd]iscussion[^\n]*/g) || []).slice(0, 6), boxes: await page.locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => `${e.checked ? '[x]' : '[ ]'} ${((e.closest('label') || e.parentElement || {}).innerText || '').trim().slice(0, 80)}`)).catch(() => [])});
    }
    // Activity log (OJS/OMP: the workflow's "Activity Log"; all: whatever the page offers).
    await signIn(page, u('mg'), {contextPath: X.path});
    await page.goto(h.edUrl(X.S1.submissionId, h.key1)); await idle(page); await page.waitForTimeout(800);
    const al = page.getByRole('button', {name: /Activity Log/}).or(page.getByRole('link', {name: /Activity Log/})).first();
    if (await al.count()) {
        await al.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
        s = await h.snap('xref-activity-log');
        const t = s.text.dialog || '';
        h.fact('activity log', {emailLines: (t.match(/[^|\n]*email has been sent[^|\n]*/gi) || []).slice(0, 10), k7Lines: (t.match(/[^|\n]*K7[^|\n]*/g) || []).slice(0, 12)});
    } else h.fact('activity log', 'no Activity Log control');
    // French (618): the panel with the interface in French.
    await page.goto(h.edUrl(X.S1.submissionId, h.key1, X.path, 'fr_CA')); await h.waitPanel(); await page.waitForTimeout(600);
    await h.snap('xref-fr-panel');
    h.fact('fr panel', flat(await h.panel().innerText().catch(() => ''), 400));
    await page.goto(h.edUrl(X.S1.submissionId, h.key1)); await idle(page);
}

// ---------------------------------------------------------------------------
// Phase leave (Rule 23, td13)

async function phaseLeave(app, X, h, page) {
    h.phase = 'leave';
    const u = h.u;
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.openS1('mg');
    const read = async (name, label) => { await h.openS1('mg'); const st = await h.rowState(name); if (!st) return {absent: true}; const w = await h.openItem(name); const r = await h.winRead(w); await h.snap(label); await h.closeItem(w); return {row: st.cells, details: r.details}; };
    h.fact('Rm before', await read('K7 Rm', 'leave-rm-before'));
    h.fact('RmT before', await read('K7 RmT', 'leave-rmt-before'));
    const remove = async (k, label) => {
        await h.openS1('mg');
        const m = await h.partMenu(k, 'Remove');
        const d = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: 'Remove Participant'}).last();
        await d.waitFor({timeout: 15000}).catch(() => h.L('no remove dialog'));
        const t0 = Date.now();
        await d.getByRole('button', {name: 'OK', exact: true}).click().catch((x) => h.L('remove ok', x.message.slice(0, 100)));
        await page.waitForTimeout(2000); await idle(page);
        await h.snap(`leave-${label}`);
        h.fact(`remove ${k}`, {menu: m.items, answers: h.since(t0)});
    };
    await remove('s2', 'remove-s2');
    h.fact('Rm after s2', await read('K7 Rm', 'leave-rm-after-s2'));
    h.fact('RmT after s2', await read('K7 RmT', 'leave-rmt-after-s2'));
    await remove('ed', 'remove-ed');
    h.fact('Rm after ed', await read('K7 Rm', 'leave-rm-after-ed'));
    await h.openS1('mg');
    await h.history('K7 Rm', 'leave-rm-history');
    await h.history('K7 RmT', 'leave-rmt-history');
    // Reviewers (OJS/OMP).
    if (!h.ops && X.SR) {
        const url = h.edUrl(X.SR.submissionId, h.roundKey(X.SR));
        const readR = async (name, label) => { await h.open(url); if (!(await h.rowState(name))) return {absent: true}; const w = await h.openItem(name); const r = await h.winRead(w); await h.snap(label); await h.closeItem(w); return r.details; };
        h.fact('Rev1 before', await readR('K7 Rev1', 'leave-rev1-before'));
        if (!X.seedRefusal) h.fact('Rev2 before', await readR('K7 Rev2', 'leave-rev2-before'));
        const revAction = async (k, entry, label) => {
            await h.open(url);
            const row = page.getByRole('row').filter({hasText: NAMES[k]}).first();
            await row.getByRole('button', {name: /More Actions/}).first().click();
            await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
            const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
            if (!items.includes(entry)) { h.fact(`${label} menu`, items); await page.keyboard.press('Escape'); return; }
            await page.getByRole('menuitem', {name: entry, exact: true}).click(); await idle(page);
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 60; }, null, {timeout: 15000}).catch(() => {});
            await page.waitForFunction(() => { const ta = [...document.querySelectorAll('textarea')].pop(); const mce = window.tinyMCE || window.tinymce; return !ta || !!mce?.get(ta.id)?.initialized; }, null, {timeout: 20000}).catch(() => {});
            await idle(page);
            await h.snap(`leave-${label}-dialog`);
            const dlg = h.top();
            const btns = await dlg.getByRole('button').allInnerTexts().catch(() => []);
            const t0 = Date.now();
            const b = dlg.getByRole('button', {name: entry, exact: true}).last();
            if (await b.count()) await b.click(); else await dlg.getByRole('button', {name: /^(OK|Yes|Confirm)$/}).last().click().catch(() => {});
            await idle(page); await page.waitForTimeout(1500); await idle(page);
            h.fact(`${label}`, {menu: items, buttons: btns, answers: h.since(t0)});
        };
        await revAction('rv1', 'Cancel Reviewer', 'cancel-rv1');
        h.fact('Rev1 after cancel', await readR('K7 Rev1', 'leave-rev1-after'));
        if (!X.seedRefusal) {
            await revAction('rv2', 'Unassign Reviewer', 'unassign-rv2');
            h.fact('Rev2 after unassign', await readR('K7 Rev2', 'leave-rev2-after'));
        }
        await h.open(url);
        await h.history('K7 Rev1', 'leave-rev1-history');
    }
}

// ---------------------------------------------------------------------------
// Phase wizard (Rule 21 comments box and auto-add, td19, A9 comments path, 601–603)

async function phaseWizard(app, X, h, page) {
    h.phase = 'wizard';
    const W = X.W;
    const wu = (s) => `${W.t}${s}`;
    const id = W.draft.submissionId;
    const comment = `K7 comment for the editor ${W.t}`;
    const mailBefore = {};
    for (const k of ['se', 'ed', 'fu', 'au', 'mg']) mailBefore[k] = await app.mail.count({to: `${wu(k)}@mail.test`}).catch(() => -1);
    if (!W.submitted) {
        await signIn(page, wu('au'), {contextPath: W.path});
        await page.goto(app.url(`/index.php/${W.path}/en/submission?id=${id}`)); await idle(page);
        await page.locator('.pkpSteps').waitFor({timeout: 30000}).catch(() => {});
        const cur = () => page.locator('.pkpSteps__step__label--current').innerText().catch(() => '');
        const steps = [];
        for (let i = 0; i < 9; i++) {
            const c = (await cur()).trim();
            steps.push(c);
            if (/Review$/.test(c)) break;
            if (h.ops && /Upload Files/.test(c) && !(await page.locator('.submissionWizard').getByRole('link', {name: 'PDF'}).count())) {
                const {addGalleyFile} = require(path.resolve(__dirname, '../../../../../apps/ops/playwright/pages/SubmissionWizardPages.js'));
                await addGalleyFile(page, {label: 'PDF', file: fixturePath(app, 'preprint.pdf')}).catch((x) => h.L('galley', x.message.slice(0, 200)));
            }
            const ifr = page.locator('#commentsForTheEditors-commentsForTheEditors-control_ifr');
            if (await ifr.isVisible().catch(() => false)) {
                await page.waitForFunction(() => window.tinymce && window.tinymce.get('commentsForTheEditors-commentsForTheEditors-control') && window.tinymce.get('commentsForTheEditors-commentsForTheEditors-control').initialized, null, {timeout: 20000}).catch(() => {});
                const body = page.frameLocator('#commentsForTheEditors-commentsForTheEditors-control_ifr').locator('body');
                await body.click(); await body.fill(comment);
                await h.snap('wiz-comments-step');
                steps.push(`comments filled on ${c}`);
            }
            const rel = page.getByRole('radio', {name: 'This preprint has not been published elsewhere.'});
            if (await rel.count()) await rel.check().catch(() => {});
            await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click();
            await page.waitForTimeout(1500); await idle(page);
        }
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        await page.waitForTimeout(1000);
        const cb = page.getByRole('checkbox', {name: /agree to the copyright statement|agree/}).first();
        if (await cb.count() && !(await cb.isChecked().catch(() => true))) await cb.check().catch(() => {});
        const rv = await h.snap('wiz-review');
        h.fact('wizard steps', {steps, problems: flat(await page.locator('.submissionWizard__review_errors').innerText().catch(() => ''), 500), commentOnReview: (rv.text.main || '').includes(comment)});
        const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
        await submit.click().catch((x) => h.L('submit', x.message.slice(0, 100)));
        const dlg = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Submit', exact: true})}).last();
        await dlg.waitFor({timeout: 15000}).catch(() => h.L('no submit dialog'));
        await dlg.getByRole('button', {name: 'Submit', exact: true}).click().catch(() => {});
        await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000}).catch(() => h.L('no Submission complete'));
        await h.snap('wiz-complete');
        W.submitted = true;
    }
    await page.waitForTimeout(3000);
    // Mail since the submit.
    const mails = {};
    for (const k of ['se', 'ed', 'fu', 'au', 'mg']) {
        const all = await app.mail.count({to: `${wu(k)}@mail.test`}).catch(() => -1);
        const f = await app.mail.find({to: `${wu(k)}@mail.test`, contains: 'K7 comment for the editor', timeoutMs: 4000}).then(async (m) => { const x = await app.mail.fullMessage(m.ID); return {subject: x.Subject, from: x.From && x.From.Address, text: (x.Text || '').replace(/\s+/g, ' ').slice(0, 500)}; }).catch(() => null);
        mails[k] = {before: mailBefore[k], after: all, withComment: f};
    }
    h.fact('mail', mails);
    // The panel as the manager.
    await signIn(page, wu('mg'), {contextPath: W.path});
    await h.open(h.edUrl(id, h.key1, W.path));
    await h.snap('wiz-panel-mg', {panel: await h.panelRead()});
    const rows = await h.panelRead();
    h.fact('panel rows mg', rows);
    const names = await h.panel().locator('[id^="discussion_name_"]').allInnerTexts().catch(() => []);
    h.fact('item names', names);
    const cmt = names.find((n) => /Comments for|Cover Note/.test(n));
    const auto = names.find((n) => n.trim() === W.tpl);
    W.cmt = cmt && cmt.trim(); W.auto = auto && auto.trim();
    for (const [k, n] of [['comments', W.cmt], ['auto', W.auto]]) {
        if (!n) continue;
        await h.open(h.edUrl(id, h.key1, W.path));
        const w = await h.openItem(n);
        await h.snap(`wiz-${k}-window-mg`);
        h.fact(`${k} window`, await h.winRead(w));
        await h.closeItem(w);
        await h.open(h.edUrl(id, h.key1, W.path));
        await h.history(n, `wiz-${k}-history`);
    }
    // Tasks rows of each participant; the panel as se, fu, ed, au.
    const who = h.ops ? ['se', 'ed', 'au'] : ['se', 'fu', 'ed', 'au'];
    const views = {};
    for (const k of who) {
        await signIn(page, wu(k), {contextPath: W.path});
        if (k === 'au') await h.openS1('au', {submissionId: id}, W.path); else await h.open(h.edUrl(id, h.key1, W.path));
        const r = (await h.panelRead().catch(() => [])).filter((x) => x.cells).map((x) => x.cells[0]);
        await h.snap(`wiz-panel-${k}`);
        await page.goto(app.url(`/index.php/${W.path}/en/dashboard/${k === 'au' ? 'mySubmissions' : 'editorial'}`)); await idle(page);
        const tp = await h.tasksPanel(`wiz-tasks-${k}`);
        views[k] = {panel: r, tasks: (tp.rows || []).slice(0, 8)};
    }
    h.fact('views', views);
    // A9 on the comments discussion.
    if (W.cmt) {
        await signIn(page, wu('mg'), {contextPath: W.path});
        await h.open(h.edUrl(id, h.key1, W.path));
        const e = await h.openEdit(W.cmt);
        await h.snap('a9-comments-edit');
        h.fact('A9 comments edit window', {read: await h.editRead(e.w), mce: await h.mce()});
        await h.typeMsg(e.w, 'K7 comments edited text', {replace: true});
        h.fact('A9 comments save', await h.save(e.w, 'a9-comments'));
        await h.open(h.edUrl(id, h.key1, W.path));
        const w = await h.openItem(W.cmt);
        await h.snap('a9-comments-after');
        h.fact('A9 comments window after', (await h.winRead(w)).messages);
        await h.closeItem(w);
    }
    // td19 end: participants added through Edit on the auto item.
    if (W.auto) {
        await h.open(h.edUrl(id, h.key1, W.path));
        const e = await h.openEdit(W.auto);
        h.fact('auto edit window', await h.editRead(e.w));
        await h.tick(e.w, wu('se'));
        const r1 = await h.save(e.w, 'wiz-auto-add-se');
        h.fact('auto add se only', r1);
        if (!r1.closed) {
            await h.cancel(e.w);
            await h.open(h.edUrl(id, h.key1, W.path));
            const e2 = await h.openEdit(W.auto);
            await h.tick(e2.w, wu('se')); await h.tick(e2.w, wu('ed'));
            h.fact('auto add se+ed', await h.save(e2.w, 'wiz-auto-add-se-ed'));
        }
        await signIn(page, wu('se'), {contextPath: W.path});
        await h.open(h.edUrl(id, h.key1, W.path));
        h.fact('se panel after', (await h.panelRead().catch(() => [])).filter((x) => x.cells).map((x) => x.cells[0]));
    }
}

// ---------------------------------------------------------------------------
// Phase rec (OJS/OMP; Rule 21 recommendation, A9 recommendation path)

async function phaseRec(app, X, h, page) {
    h.phase = 'rec';
    if (h.ops || !X.SRec) return;
    const u = h.u;
    const url = h.edUrl(X.SRec.submissionId, h.roundKey(X.SRec));
    const before = await h.mailCount('se');
    if (!X.recDone) {
        await signIn(page, u('rc'), {contextPath: X.path});
        await h.open(url);
        const acts = await page.locator('[data-cy="workflow-action-items"]').getByRole('button').allInnerTexts().catch(() => []);
        h.fact('rc buttons', acts);
        await page.locator('[data-cy="workflow-action-items"]').getByRole('button', {name: 'Recommend Accept', exact: true}).first().click();
        await page.waitForURL(/\/decision\//, {timeout: 20000}).catch(() => {});
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page); await page.waitForTimeout(1000);
        await h.snap('rec-wizard');
        const rec = page.getByRole('button', {name: /^Record (Decision|Recommendation)$/});
        for (let i = 0; i < 5 && !(await rec.isVisible().catch(() => false)); i++) { await page.getByRole('button', {name: 'Continue', exact: true}).first().click().catch(() => {}); await idle(page); await page.waitForTimeout(800); }
        await rec.first().click();
        await page.waitForTimeout(2500); await idle(page);
        await h.snap('rec-recorded');
        X.recDone = true;
    }
    await page.waitForTimeout(2000);
    h.fact('se mail count', {before, after: await h.mailCount('se')});
    h.fact('se mail about the recommendation', await h.mailFind('se', {contains: 'ecommend'}));
    await signIn(page, u('se'), {contextPath: X.path});
    await h.open(url);
    await h.snap('rec-panel-se', {panel: await h.panelRead()});
    const names = await h.panel().locator('[id^="discussion_name_"]').allInnerTexts().catch(() => []);
    h.fact('items', {names, rows: (await h.panelRead()).filter((r) => r.cells).map((r) => r.cells.slice(0, 2))});
    const nm = names.map((x) => x.trim()).find((n) => /ecommend/i.test(n)) || names[0] && names[0].trim();
    if (nm) {
        let w = await h.openItem(nm);
        await h.snap('rec-window-se');
        h.fact('window', await h.winRead(w));
        await h.closeItem(w);
        h.fact('se menu on the recommendation', await h.rowMenu(nm));
        // The recommender's own view.
        await signIn(page, u('rc'), {contextPath: X.path});
        await h.open(url);
        await h.snap('rec-panel-rc');
        h.fact('rc panel', (await h.panelRead().catch(() => [])).filter((r) => r.cells).map((r) => r.cells[0]));
        // A9 as the manager.
        await signIn(page, u('mg'), {contextPath: X.path});
        await h.open(url);
        await h.history(nm, 'rec-history');
        let e = await h.openEdit(nm);
        await h.snap('a9-rec-edit');
        h.fact('A9 rec edit window', {read: await h.editRead(e.w), mce: await h.mce()});
        await h.typeMsg(e.w, 'K7 recommendation edited text', {replace: true});
        const r1 = await h.save(e.w, 'a9-rec');
        h.fact('A9 rec save', r1);
        if (!r1.closed) {
            // The same edit with the recommender ticked back in.
            await h.cancel(e.w);
            await h.open(url);
            e = await h.openEdit(nm);
            await h.tick(e.w, u('rc'));
            await h.typeMsg(e.w, 'K7 recommendation edited text', {replace: true});
            h.fact('A9 rec save with rc ticked', await h.save(e.w, 'a9-rec-rc'));
        }
        await h.open(url);
        w = await h.openItem(nm);
        await h.snap('a9-rec-after');
        h.fact('A9 rec window after', (await h.winRead(w)).messages);
        await h.closeItem(w);
    }
}


// ---------------------------------------------------------------------------
// Phase dis2 (Rule 22, the Tasks row): dz's Tasks rows for one item before and
// after a reply sent while dz is disabled.

async function phaseDis2(app, X, h, page) {
    h.phase = 'dis2';
    const u = h.u;
    const N = 'K7 DisT';
    const dzRows = async (label) => {
        await signIn(page, u('dz'), {contextPath: X.path});
        await page.goto(app.url(`/index.php/${X.path}/en/dashboard/editorial`)); await idle(page);
        const p = await h.tasksPanel(label);
        return (p.rows || []).filter((r) => r.includes(`${N}:`)).length;
    };
    const before = await dzRows('dis2-tasks-dz-before');
    await signIn(page, u('mg'), {contextPath: X.path});
    const accessUrl = app.url(`/index.php/${X.path}/en/management/settings/access`);
    const usersTable = page.getByRole('table', {name: /Current Users \(/});
    const flip = async (re) => {
        await page.goto(accessUrl); await usersTable.waitFor({timeout: 20000}).catch(() => {}); await idle(page);
        await usersTable.getByRole('row').filter({hasText: h.em('dz')}).getByRole('button', {name: /options/i}).click();
        await page.getByRole('menuitem', {name: re}).first().click();
        const dlg = page.getByRole('dialog').last();
        await dlg.waitFor({timeout: 10000}).catch(() => {});
        await dlg.getByRole('button', {name: /^(OK|Yes|Save|Disable|Enable)/}).first().click().catch(() => {});
        await dlg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page);
    };
    await flip(/^Disable/);
    await h.openS1('mg');
    let w = await h.openItem(N);
    const txt = `K7 dis2 ${rnd()}`;
    await h.reply(w, txt, 'dis2-mg-reply-disabled');
    await h.closeItem(w);
    await page.waitForTimeout(2000);
    const mailDisabled = await h.mailCount('dz', {contains: txt});
    await flip(/^Enable/);
    const afterDisabledReply = await dzRows('dis2-tasks-dz-after-disabled-reply');
    // Control: a reply while dz is enabled.
    await signIn(page, u('mg'), {contextPath: X.path});
    await h.openS1('mg');
    w = await h.openItem(N);
    const txt2 = `K7 dis2 enabled ${rnd()}`;
    await h.reply(w, txt2, 'dis2-mg-reply-enabled');
    await h.closeItem(w);
    await page.waitForTimeout(2000);
    const afterEnabledReply = await dzRows('dis2-tasks-dz-after-enabled-reply');
    h.fact('dz Tasks rows for the item', {before, afterDisabledReply, afterEnabledReply, mailWhileDisabled: mailDisabled, mailWhileEnabled: await h.mailCount('dz', {contains: txt2})});
}

// ---------------------------------------------------------------------------
// Phase leave2 (Rule 23, "last request"): a reviewer on two rounds; cancel the
// round-2 request, then the round-1 request (OJS/OMP).

async function phaseLeave2(app, X, h, page) {
    h.phase = 'leave2';
    if (h.ops) return;
    const u = h.u;
    if (!X.S2R) {
        X.S2R = await app.api.createSubmission({tag: `${X.t}z`, context: X.path, submitter: u('au'), title: `K7 S2R ${X.t}`, decisions: ['sendExternalReview'],
            participants: [{username: u('se'), role: 'sectionEditor'}],
            reviewRounds: [{reviewers: [{username: u('rv2'), status: 'accepted'}]}, {reviewers: [{username: u('rv2'), status: 'accepted'}]}],
            tasks: [{title: 'K7 Two', creator: u('mg'), participants: [u('mg'), u('se'), u('rv2')], stage: 'review', message: 'K7 Two first message'}]});
        h.L('S2R', JSON.stringify({id: X.S2R.submissionId, rounds: X.S2R.reviewRounds}));
    }
    const rk = (i) => `workflow_${X.S2R.reviewRounds[i].stageId}_${X.S2R.reviewRounds[i].id}`;
    const url = (i) => h.edUrl(X.S2R.submissionId, rk(i));
    await signIn(page, u('mg'), {contextPath: X.path});
    const parts = async (label) => {
        for (const i of [1, 0]) {
            await h.open(url(i));
            if (await h.rowState('K7 Two')) { const w = await h.openItem('K7 Two'); const r = await h.winRead(w); await h.snap(label); await h.closeItem(w); return r.details; }
        }
        return 'item not found';
    };
    const cancel = async (i, label) => {
        await h.open(url(i));
        const row = page.getByRole('row').filter({hasText: NAMES.rv2}).first();
        await row.getByRole('button', {name: /More Actions/}).first().click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
        const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
        await page.getByRole('menuitem', {name: 'Cancel Reviewer', exact: true}).click(); await idle(page);
        await page.waitForFunction(() => { const ta = [...document.querySelectorAll('textarea')].pop(); const mce = window.tinyMCE || window.tinymce; return !ta || !!mce?.get(ta.id)?.initialized; }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(600);
        await h.top().getByRole('button', {name: 'Cancel Reviewer', exact: true}).last().click().catch((x) => h.L('cancel btn', x.message.slice(0, 100)));
        await idle(page); await page.waitForTimeout(1500); await idle(page);
        await h.snap(`leave2-${label}`);
        return items;
    };
    h.fact('participants before', await parts('leave2-before'));
    h.fact('cancel round 2 menu', await cancel(1, 'cancel-r2'));
    h.fact('participants after round-2 cancel', await parts('leave2-after-r2'));
    h.fact('cancel round 1 menu', await cancel(0, 'cancel-r1'));
    h.fact('participants after both cancels', await parts('leave2-after-r1'));
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const xFile = path.join(outDir(), `x-${app.name}.json`);
    let X;
    if (process.env.REUSE && fs.existsSync(xFile)) X = JSON.parse(fs.readFileSync(xFile, 'utf8'));
    else { X = await seed(app); fs.writeFileSync(xFile, JSON.stringify(X, null, 2)); }
    X.names = X.names || {};
    const facts = {};
    const {page, close} = await launch(app);
    const h = helpers(app, page, X, facts);
    const guard = async (name, fn) => {
        try { await fn(); } catch (e) {
            console.log(`[${app.name} ${name}] FAILED at step "${h.step}": ${String(e.message).split('\n').slice(0, 3).join(' ')}`);
            await h.snap(`fail-${name}`).catch(() => {});
        }
    };
    try {
        for (const [name, fn] of [['hist', phaseHist], ['del', phaseDel], ['notify', phaseNotify], ['disabled', phaseDisabled], ['xref', phaseXref], ['leave', phaseLeave], ['wizard', phaseWizard], ['rec', phaseRec], ['dis2', phaseDis2], ['leave2', phaseLeave2]]) {
            if (PHASES.includes(name)) { await guard(name, () => fn(app, X, h, page)); fs.writeFileSync(xFile, JSON.stringify(X, null, 2)); }
        }
    } finally {
        const fFile = path.join(outDir(), `facts-${app.name}.json`);
        const prev = fs.existsSync(fFile) ? JSON.parse(fs.readFileSync(fFile, 'utf8')) : {};
        fs.writeFileSync(fFile, JSON.stringify({...prev, ...facts}, null, 2));
        fs.writeFileSync(path.join(outDir(), `answers-${app.name}.json`), JSON.stringify(h.answers, null, 2));
        record('browser-dialogs', h.browserDialogs);
        await close();
    }
});
