// U37 claim check, chunk K4 — Settings › Workflow › "Tasks and Discussions" (the template
// screen), "Auto-add at stage", and the settings that modify behavior
// (docs/specs/U37-tasks-and-discussions.md Rules 25–26, "Settings that modify behavior",
// register OPS1).
//
// Seeds its own scratch context per app (nothing on publicknowledge is changed; its template
// list is only read):
//   manager mg, section editor se, author au, copyeditor ce (OJS/OMP), reviewers r1..r3 (OJS/OMP).
//   Stage C = copyediting (OPS production), first stage F = submission (OPS production).
//   Templates made ON SCREEN (phase window): "K4 limited" (C, limited to the Copyeditor; OPS the
//   Moderator; later renamed "K4 limited renamed"), "K4 auto copyedit" (C, task P3M, auto-add off,
//   switched on in the list in phase toggle), "K4 auto task" (F, task P2W, the window's
//   auto-add box ticked), "K4 toggled" (F, discussion, switched on then off in the list), and the
//   installed "Discussion (Production)" switched on in the list.
//   Submissions seeded AFTER those settings (phase seed): S1 (just submitted), S2 (OJS/OMP at
//   copyediting; OPS published), SC (C, with se and ce assigned), SR (OJS/OMP external review,
//   r1 and r2 accepted).
//
//   PROBE_FEATURE=U37 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U37/K4/k4.js
//   PHASES=screen,window,toggle,seed,auto,restrict,taskinfo,delete,letter,review,prefs,ops1 (default all)
//   REUSE=1 keeps x-<app>.json (the context and, once seeded, the submissions)
//
// No assertions: every screen is recorded with screen()/shot(); the console log carries the
// facts the report cites (prefix [app phase]).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, tag, outDir} = require('../../../probe');

const ALL = 'screen,window,toggle,seed,auto,restrict,taskinfo,delete,letter,review,prefs,ops1';
const PHASES = (process.env.PHASES || ALL).split(',');
const flat = (s, n = 1500) => (s == null ? null : String(s).replace(/\s*\n+\s*/g, ' | ').slice(0, n));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n) => ymd(new Date(Date.now() + n * 86400000));
const months = (n) => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() + n, d.getDate())); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const STAGE_NAMES = {
    ojs: {1: 'Submission Stage', 3: 'Review Stage', 4: 'Copyediting Stage', 5: 'Production Stage'},
    omp: {1: 'Submission Stage', 2: 'Internal Review Stage', 3: 'External Review Stage', 4: 'Copyediting Stage', 5: 'Production Stage'},
    ops: {5: 'Production Stage'},
};

// ---------------------------------------------------------------------------
// Seeding: the context only (the submissions come after the on-screen settings)

async function seedContext(app) {
    const t = tag('u37k4');
    const u = (s) => `${t}${s}`;
    const ops = app.name === 'ops';
    const users = [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Editor'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ];
    if (!ops) {
        users.push({username: u('ce'), roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copy'});
        for (const [k, g] of [['r1', 'Rhea'], ['r2', 'Remy'], ['r3', 'Rory']]) users.push({username: u(k), roles: ['externalReviewer'], givenName: g, familyName: 'Reviewer'});
    }
    const C = await app.api.createContext({tag: t, users});
    const X = {t, path: C.path, contextId: C.contextId, C: ops ? 5 : 4, F: ops ? 5 : 1};
    console.log(`[${app.name} seed-context]`, JSON.stringify(X));
    return X;
}

async function seedSubmissions(app, X) {
    const u = (s) => `${X.t}${s}`;
    const ops = app.name === 'ops';
    const base = {context: X.path, submitter: u('au')};
    X.S1 = await app.api.createSubmission({...base, tag: `${X.t}a`, participants: [{username: u('se'), role: 'sectionEditor'}]});
    const toC = app.name === 'omp' ? ['skipInternalReview', 'accept'] : app.name === 'ojs' ? ['skipExternalReview'] : undefined;
    const partsC = [{username: u('se'), role: 'sectionEditor'}];
    if (!ops) partsC.push({username: u('ce'), role: 'copyeditor'});
    if (ops) X.S2 = await app.api.createSubmission({...base, tag: `${X.t}b`, participants: partsC, published: true});
    else X.S2 = await app.api.createSubmission({...base, tag: `${X.t}b`, participants: partsC, decisions: toC});
    X.SC = await app.api.createSubmission({...base, tag: `${X.t}c`, participants: partsC, decisions: toC});
    if (!ops) {
        X.SR = await app.api.createSubmission({...base, tag: `${X.t}r`, participants: [{username: u('se'), role: 'sectionEditor'}],
            decisions: [app.name === 'omp' ? 'skipInternalReview' : 'sendExternalReview'],
            reviewRounds: [{reviewers: [{username: u('r1'), status: 'accepted'}, {username: u('r2'), status: 'accepted'}]}]});
    }
    const ids = (s) => s && {id: s.submissionId, stageId: s.stageId, tasks: s.tasks};
    console.log(`[${app.name} seed-subs]`, JSON.stringify({S1: ids(X.S1), S2: ids(X.S2), SC: ids(X.SC), SR: ids(X.SR)}));
}

// ---------------------------------------------------------------------------
// Helpers

function helpers(app, page, X) {
    const h = {};
    const L = (...a) => console.log(`[${app.name}${h.phase ? ' ' + h.phase : ''}]`, ...a);
    h.L = L;
    h.u = (s) => `${X.t}${s}`;
    h.ops = app.name === 'ops';
    h.ctx = (p, ctx = X.path) => app.url(`/index.php/${ctx}/en${p}`);
    h.edUrl = (id, key) => h.ctx(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.auUrl = (id, key) => h.ctx(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.settingsUrl = (ctx = X.path) => h.ctx('/management/settings/workflow', ctx);
    h.snap = async (name) => { const s = await screen(page); record(name, s); await shot(page, name).catch(() => {}); return s; };
    // The browser's own traffic on the templates/tasks endpoints (bodies of the list GETs kept).
    h.answers = [];
    h.tplBodies = [];
    page.on('response', async (r) => {
        const url = r.url();
        if (!/\/api\/v1\/.*(editTaskTemplates|tasks|decisions|publish|unpublish|userGroups|contexts)/.test(url)) return;
        const method = r.request().method();
        const override = r.request().headers()['x-http-method-override'];
        const e = {t: Date.now(), phase: h.phase, method: override ? `${method}(${override})` : method, url: url.replace(/^.*\/api\/v1/, ''), status: r.status()};
        if (r.status() >= 400) e.body = (await r.text().catch(() => '')).slice(0, 800);
        else if (method === 'GET' && /editTaskTemplates(\?|$)/.test(url)) {
            try { h.tplBodies.push({t: Date.now(), url: e.url, body: await r.json()}); } catch (err) { /* ignore */ }
        }
        h.answers.push(e);
    });
    h.since = (t0, re) => h.answers.filter((a) => a.t >= t0 && (!re || re.test(a.url))).map((a) => `${a.method} ${a.url} ${a.status}${a.body ? ' ' + a.body.slice(0, 400) : ''}`);
    h.pageErrors = [];
    page.on('pageerror', (e) => { h.pageErrors.push({phase: h.phase, step: h.step, msg: String(e.message).slice(0, 300)}); L('PAGE ERROR', String(e.message).slice(0, 200)); });
    h.browserDialogs = [];
    page.on('dialog', async (d) => {
        L('browser dialog:', d.type(), JSON.stringify(d.message()), 'during', h.step || '-');
        h.browserDialogs.push({type: d.type(), message: d.message(), step: h.step || '-', phase: h.phase});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    h.toasts = () => page.locator('.pkpNotification').evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return {text: e.innerText.trim(), cls: e.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), vw: window.innerWidth};
    })).catch(() => []);
    h.editorReady = async () => {
        await page.waitForFunction(() => window.tinymce && window.tinymce.get().some((e) => e.initialized && e.getContainer() && e.getContainer().offsetParent !== null), null, {timeout: 20000}).catch(() => L('tinymce not initialized'));
    };
    h.msg = () => page.evaluate(() => { const e = (window.tinymce ? window.tinymce.get() : []).filter((x) => x.getContainer() && x.getContainer().offsetParent !== null); return e.length ? e[e.length - 1].getContent() : null; });
    h.typeMsg = async (w, text) => {
        await h.editorReady();
        await w.frameLocator('iframe').first().locator('body').click();
        await page.keyboard.type(text);
    };
    h.warnDlg = () => page.getByRole('dialog').filter({hasText: 'The data on this form has changed'});
    h.errors = (w) => w.evaluate((root) => [...root.querySelectorAll('.pkpFieldError, .pkpFormErrors, .pkpFormField__error, [class*="errorSummary"], [role="alert"]')]
        .filter((e) => e.offsetParent !== null && e.innerText.trim())
        .map((e) => {
            const f = e.closest('.pkpFormField, fieldset, .pkpFormGroup');
            const lab = f ? (f.querySelector('legend, label, .pkpFormFieldLabel, .pkpFormGroup__heading') || {}).innerText : null;
            return {text: e.innerText.trim().replace(/\s*\n+\s*/g, ' | '), field: (lab || '').trim().split('\n')[0]};
        })).catch(() => []);

    // ---- The template screen ----
    h.gotoTemplates = async (ctx = X.path) => {
        h.step = 'goto templates';
        await page.goto(h.settingsUrl(ctx));
        await idle(page);
        const tab = page.getByRole('tab', {name: 'Tasks and Discussions'});
        if (!(await tab.count())) { L('no "Tasks and Discussions" tab'); return false; }
        await tab.click();
        await page.getByText('Tasks and Discussions Templates').first().waitFor({timeout: 30000}).catch(() => L('no table title'));
        await page.getByRole('button', {name: /More Actions/}).first().waitFor({timeout: 30000}).catch(() => L('no template row arrived'));
        await idle(page);
        return true;
    };
    h.tplPanel = () => page.getByRole('tabpanel', {name: 'Tasks and Discussions'});
    h.tplRead = () => h.tplPanel().evaluate((p) => {
        const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const t = p.querySelector('table');
        const out = {
            title: (p.querySelector('h3') || {}).innerText || null,
            description: (p.querySelector('p') || {}).innerText || null,
            columns: t ? [...t.querySelectorAll('thead th')].map((th) => ({text: th.innerText.trim(), raw: th.textContent.trim(), srOnly: !!th.querySelector('.sr-only')})) : [],
            groups: [],
        };
        let g = null;
        for (const tr of t ? t.querySelectorAll('tbody tr') : []) {
            const txt = tr.innerText.trim().replace(/\s+/g, ' ');
            const btns = [...tr.querySelectorAll('button')].filter(vis);
            const add = btns.find((b) => /Add template/.test(b.innerText));
            const cb = tr.querySelector('input[type=checkbox]');
            if (add) {
                g = {name: txt.replace(/\s*Add template\s*$/, '').trim(), addControl: {tag: add.tagName, text: add.innerText.trim(), cls: add.className.slice(0, 120), labelledby: add.getAttribute('aria-labelledby'), name: (add.getAttribute('aria-labelledby') || '').split(' ').map((id) => (document.getElementById(id) || {}).innerText || '').join(' ')}, rows: [], empty: null};
                out.groups.push(g);
            } else if (cb || btns.length) {
                const cells = [...tr.querySelectorAll('td, th')];
                (g ? g.rows : (out.orphans = out.orphans || [])).push({
                    name: cells[0] ? cells[0].innerText.trim() : txt,
                    autoAdd: cb ? {checked: cb.checked, disabled: cb.disabled, ariaLabel: (cb.closest('label') || {}).getAttribute ? cb.closest('label').getAttribute('aria-label') : null, inputAriaLabelledby: cb.getAttribute('aria-labelledby'), inputAriaLabel: cb.getAttribute('aria-label')} : null,
                    actions: btns.map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()),
                    cells: cells.map((c) => c.innerText.trim()),
                });
            } else if (g) g.empty = txt;
            else (out.other = out.other || []).push(txt);
        }
        return out;
    });
    h.tplRow = (name) => h.tplPanel().getByRole('row').filter({has: page.getByText(name, {exact: true})}).first();
    h.tplRowMenu = async (name, entry) => {
        const row = h.tplRow(name);
        await row.getByRole('button', {name: /More Actions/}).click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
        const items = await page.getByRole('menuitem').allInnerTexts();
        if (entry) await page.getByRole('menuitem', {name: entry, exact: true}).click();
        else await page.keyboard.press('Escape');
        return items.map((s) => s.trim());
    };
    h.tplWin = () => page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    h.openTplWin = async (how) => {
        // how: {add: stageName} or {edit: templateName}
        if (how.add) {
            const grpRow = h.tplPanel().getByRole('row').filter({hasText: how.add}).filter({has: page.getByRole('button', {name: /Add template/})}).first();
            await grpRow.getByRole('button', {name: /Add template/}).click();
        } else {
            await h.tplRowMenu(how.edit, 'Edit');
        }
        const w = h.tplWin();
        await w.waitFor({timeout: 30000});
        await idle(page);
        await h.editorReady();
        await page.waitForTimeout(500);
        return w;
    };
    h.winRead = (w) => w.evaluate((root) => {
        const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const labOf = (i) => { const l = i.closest('label') || (i.id && root.querySelector(`label[for="${i.id}"]`)); return l ? l.innerText.trim().replace(/\s+/g, ' ') : null; };
        const fields = [...root.querySelectorAll('input, select, textarea')].filter((i) => i.type !== 'hidden').map((i) => ({
            name: i.name, type: i.type || i.tagName, value: i.tagName === 'SELECT' ? (i.options[i.selectedIndex] || {}).text : i.value.slice(0, 200), checked: i.checked, disabled: i.disabled, visible: vis(i) || vis(i.parentElement), label: labOf(i),
            options: i.tagName === 'SELECT' ? [...i.options].map((o) => `${o.value}=${o.text}`) : undefined,
        }));
        const heads = [...root.querySelectorAll('legend, .pkpFormGroup__heading, .pkpFormFieldLabel, h2, h3')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' '));
        const descs = [...root.querySelectorAll('.pkpFormGroup__description, .pkpFormField__description')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' '));
        const buttons = [...root.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
        return {heads, descs, fields, buttons};
    });
    h.saveTpl = async (w, label) => {
        const t0 = Date.now();
        h.step = `save ${label}`;
        await w.getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForResponse((r) => /editTaskTemplates/.test(r.url()) && r.request().method() !== 'GET', {timeout: 6000}).catch(() => {});
        await page.waitForTimeout(1200); await idle(page);
        const open = await w.isVisible().catch(() => false);
        const res = {closed: !open, errors: open ? await h.errors(w) : [], calls: h.since(t0, /editTaskTemplates/), toasts: await h.toasts()};
        L('save', label, JSON.stringify(res));
        return res;
    };
    h.closeTpl = async (w, how = 'cancel', answer = 'Yes') => {
        const n0 = h.browserDialogs.length;
        h.step = `close ${how}`;
        if (how === 'cancel') await w.getByRole('button', {name: 'Cancel', exact: true}).click();
        else if (how === 'close') await w.getByRole('button', {name: 'Close', exact: true}).last().click();
        else if (how === 'escape') { await w.locator('input[name="title"]').focus(); await page.keyboard.press('Escape'); }
        const warned = await h.warnDlg().last().waitFor({timeout: 2000}).then(() => true).catch(() => false);
        let warnText = null;
        if (warned) {
            warnText = flat(await h.warnDlg().last().innerText(), 300);
            await h.warnDlg().last().getByRole('button', {name: answer, exact: true}).click();
        }
        await page.waitForTimeout(900);
        const open = await w.isVisible().catch(() => false);
        const workflowOrSettingsVisible = await page.getByText('Tasks and Discussions Templates').first().isVisible().catch(() => null);
        const res = {how, warned, warnText, answer: warned ? answer : null, windowOpen: open, pageBehindVisible: workflowOrSettingsVisible, browserDialogs: h.browserDialogs.slice(n0)};
        L('close', JSON.stringify(res));
        return res;
    };
    h.setRoles = async (w, labels) => {
        await w.getByRole('radio', {name: 'Limit access to specific roles'}).check();
        await w.locator('input[name="userGroupIds"]').first().waitFor({timeout: 15000}).catch(() => L('no role boxes'));
        await page.waitForTimeout(400);
        for (const lab of labels) await w.locator('label').filter({hasText: new RegExp(`^\\s*${esc(lab)}\\s*$`)}).locator('input[name="userGroupIds"]').check().catch((e) => L('role tick', lab, e.message.slice(0, 120)));
    };
    h.autoBox = (name) => h.tplRow(name).locator('input[type=checkbox]');
    h.confirmDlg = () => page.getByRole('dialog').filter({hasText: 'Confirm Automatic Addition'});
    h.toggleAuto = async (name, answer, label) => {
        const box = h.autoBox(name);
        const before = await box.isChecked();
        const t0 = Date.now();
        h.step = `toggle ${name} ${answer}`;
        await box.locator('xpath=ancestor::label[1]').click();
        const dlg = h.confirmDlg().last();
        const asked = await dlg.waitFor({timeout: 5000}).then(() => true).catch(() => false);
        let dlgText = null; let dlgButtons = null;
        if (asked) {
            dlgText = flat(await dlg.innerText(), 400);
            dlgButtons = (await dlg.getByRole('button').allInnerTexts()).map((s) => s.trim());
            if (label) await h.snap(`${label}-confirm`);
            await dlg.getByRole('button', {name: answer, exact: true}).click();
        }
        await page.waitForTimeout(1500); await idle(page);
        const res = {name, answer, before, asked, dlgText, dlgButtons, afterDom: await box.isChecked().catch(() => null), calls: h.since(t0, /editTaskTemplates/), toasts: await h.toasts()};
        if (label) await h.snap(`${label}-after`);
        L('toggle', JSON.stringify(res));
        return res;
    };

    // ---- The workflow panel ----
    h.panel = () => page.locator('[data-cy="discussion-manager"]:visible').first();
    h.open = async (url) => {
        h.step = `open ${url.replace(/^.*index.php/, '')}`;
        await page.goto(url);
        await h.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => L('no Add button on', url.replace(/^.*index.php/, '')));
        await idle(page);
    };
    h.panelRead = () => page.evaluate(() => {
        const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        return [...document.querySelectorAll('[data-cy="discussion-manager"]')].filter(vis).map((p) => {
            const rows = [];
            let group = null;
            for (const tr of p.querySelectorAll('tbody tr')) {
                const tds = [...tr.querySelectorAll('td, th')];
                const txt = tr.innerText.trim().replace(/\s+/g, ' ');
                if (tds.length <= 1) { if (txt === 'No Items') rows.push({group, empty: txt}); else { group = txt; } continue; }
                rows.push({group, cells: tds.map((td) => td.innerText.trim().replace(/\s*\n+\s*/g, ' | ')).filter((s, i) => i < 5)});
            }
            return {heading: (p.querySelector('h3') || {}).innerText || null, rows};
        });
    });
    h.win = () => page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    h.openAdd = async (scope) => {
        await (scope || h.panel()).getByRole('button', {name: 'Add', exact: true}).first().click();
        const w = h.win();
        await w.waitFor({timeout: 30000});
        await w.locator('input[name="participants"]').first().waitFor({timeout: 30000}).catch(() => L('no participant box arrived'));
        await idle(page);
        await h.editorReady();
        return w;
    };
    h.tplList = (w) => w.evaluate((root) => {
        const list = root.querySelector('[role="list"]');
        const items = list ? [...list.querySelectorAll('button')].map((b) => ({text: b.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 90), disabled: b.disabled})) : [];
        const none = [...root.querySelectorAll('span')].some((s) => s.innerText.trim() === 'No items found.' && s.offsetParent !== null);
        return {items, none};
    }).catch(() => null);
    h.tplBtn = (w, title) => w.getByRole('listitem').getByRole('button', {name: new RegExp(`^(Discussion|Task) - ${esc(title)}\\s+This`, 'i')});
    h.participants = (w) => w.locator('input[name="participants"]').evaluateAll((els) => els.map((e) => ({label: (e.closest('label') || e.parentElement).innerText.replace(/\s*\n+\s*/g, ' | '), checked: e.checked}))).catch(() => []);
    h.tick = async (w, username, on = true) => {
        const box = w.locator('label', {hasText: `(${username})`}).locator('input[name="participants"]');
        if (on) await box.check(); else await box.uncheck();
    };
    h.state = async (w) => ({
        title: await w.locator('input[name="title"]').inputValue().catch(() => null),
        message: await h.msg().catch(() => null),
        taskInfo: await w.getByRole('checkbox', {name: 'Enter task information'}).isChecked().catch(() => null),
        dateDue: (await w.locator('input[name="dateDue"]').count()) ? await w.locator('input[name="dateDue"]').inputValue() : '(no field)',
        owners: await w.locator('input[name="taskInfoAssignee"]').evaluateAll((els) => els.map((e) => `${(e.closest('label') || e.parentElement).innerText.trim().split('\n')[0]}${e.checked ? ' [x]' : ''}`)).catch(() => []),
    });
    h.press = async (w, title, label) => {
        const t0 = Date.now();
        const b = h.tplBtn(w, title);
        if (!(await b.count())) { L('no template button', title); return null; }
        h.step = `press ${title}`;
        await b.first().click();
        await page.waitForResponse((r) => /fromTemplate/.test(r.url()), {timeout: 8000}).catch(() => L('no fromTemplate answer'));
        await idle(page);
        await page.waitForTimeout(700);
        const st = await h.state(w);
        const ans = h.since(t0, /fromTemplate/);
        L('pressed', title, JSON.stringify({st, ans}));
        if (label) await h.snap(label);
        return {st, ans};
    };
    h.closeWin = async (w) => {
        if (!(await w.count())) return;
        await w.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
        await h.warnDlg().last().waitFor({timeout: 1500}).then(async () => {
            await h.warnDlg().last().getByRole('button', {name: 'Yes', exact: true}).click();
        }).catch(() => {});
        await w.waitFor({state: 'hidden', timeout: 10000}).catch(() => L('window did not close on Cancel'));
        await idle(page);
    };
    h.saveItem = async (w, label) => {
        const t0 = Date.now();
        h.step = `save item ${label}`;
        await w.getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForResponse((r) => /\/tasks/.test(r.url()) && r.request().method() === 'POST', {timeout: 8000}).catch(() => {});
        await page.waitForTimeout(1200); await idle(page);
        const open = await w.isVisible().catch(() => false);
        const res = {closed: !open, errors: open ? await h.errors(w) : [], calls: h.since(t0, /tasks/)};
        L('save item', label, JSON.stringify(res));
        return res;
    };
    h.itemRow = (name) => h.panel().locator('tbody tr').filter({hasText: name});
    h.openItem = async (name) => {
        const row = h.itemRow(name).first();
        await row.getByRole('button', {name, exact: true}).first().click();
        const w = page.getByRole('dialog', {name, exact: true}).last();
        await w.waitFor({timeout: 30000});
        await w.getByText(/Message from/).first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        await page.getByText(/^1\. /).first().waitFor({timeout: 5000}).catch(() => {});
        return w;
    };
    h.deleteItem = async (name) => {
        const row = h.itemRow(name).first();
        await row.getByRole('button', {name: /More Actions/}).click();
        await page.getByRole('menuitem', {name: 'Delete', exact: true}).click();
        const d = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete'}).last();
        await d.waitFor({timeout: 10000});
        const t0 = Date.now();
        await d.getByRole('button', {name: 'OK', exact: true}).click();
        await page.waitForTimeout(1500); await idle(page);
        L('item deleted', name, JSON.stringify(h.since(t0, /tasks/)));
    };

    // ---- Decisions (the workflow's own buttons) ----
    h.actionLabels = async () => (await page.locator('[data-cy="workflow-action-items"]').getByRole('button').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
    h.decide = async (label, snapName) => {
        h.step = `decision ${label}`;
        const labels = await h.actionLabels();
        L('action buttons', JSON.stringify(labels));
        const btn = page.locator('[data-cy="workflow-action-items"]').getByRole('button', {name: label, exact: true});
        if (!(await btn.count())) { L('no decision button', label); return false; }
        await btn.first().click();
        await page.waitForURL(/decision\/record/, {timeout: 30000}).catch(() => L('no decision page'));
        await idle(page);
        const t0 = Date.now();
        for (let i = 0; i < 8; i++) {
            await page.locator('.composer__loadingTemplateMask').first().waitFor({state: 'detached', timeout: 30000}).catch(() => {});
            await page.waitForTimeout(500);
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
            if (await rec.isVisible().catch(() => false)) {
                await rec.click();
                break;
            }
            await page.getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
            await idle(page);
        }
        const done = page.getByRole('link', {name: 'View Submission Summary'});
        const ok = await done.waitFor({timeout: 30000}).then(() => true).catch(() => false);
        if (snapName) await h.snap(snapName);
        L('decision', label, ok ? 'recorded' : 'NOT recorded', JSON.stringify(h.since(t0, /decisions/)));
        return ok;
    };
    return h;
}

// ---------------------------------------------------------------------------
// Phase screen: the template screen of an untouched context (25, 25a, td15, Settings bullet 1)

async function phaseScreen(app, X, h, page) {
    h.phase = 'screen';
    const {L} = h;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.gotoTemplates();
    const s = await h.snap('k4-screen-mg');
    const r = await h.tplRead();
    record('k4-screen-read', r);
    L('title', JSON.stringify(r.title), 'description', JSON.stringify(r.description));
    L('columns', JSON.stringify(r.columns));
    for (const g of r.groups) L('group', JSON.stringify(g.name), 'add', JSON.stringify(g.addControl), 'rows', JSON.stringify(g.rows.map((x) => `${x.name}${x.autoAdd ? (x.autoAdd.checked ? ' [on]' : ' [off]') : ''}`)), 'empty', JSON.stringify(g.empty));
    L('first row detail', JSON.stringify(r.groups[0] && r.groups[0].rows[0]));
    L('workflow tabs', JSON.stringify((await page.locator('main').getByRole('tablist').first().getByRole('tab').allInnerTexts()).map((x) => x.trim())));
    L('panel text', flat(s.text.main, 1500));
    // The list's own GET (ids, order, fields) as the screen fetched it.
    const last = h.tplBodies[h.tplBodies.length - 1];
    if (last) {
        const items = Array.isArray(last.body) ? last.body : (last.body.items || last.body.data || []);
        const summary = items.map((x) => ({id: x.id, stageId: x.stageId, title: x.title, type: x.type, include: x.include, restrict: x.restrictToUserGroups, dueInterval: x.dueInterval, desc: flat((x.description || '').replace(/<[^>]+>/g, ' '), 80)}));
        record('k4-screen-list-get', {url: last.url, summary});
        L('list GET', last.url, JSON.stringify(summary));
    } else L('no list GET body captured');
    await loc(page, 'Settings › Workflow › "Tasks and Discussions" tab', page.getByRole('tab', {name: 'Tasks and Discussions'}));
    await loc(page, 'template screen › a row by name', h.tplRow(h.ops ? 'Assign Editor' : 'Request Copyedit'));
    await loc(page, 'template screen › a row\'s auto-add box (sr-only input; press its label)', h.autoBox(h.ops ? 'Assign Editor' : 'Request Copyedit'));
    await loc(page, 'template screen › "Add template" (group row)', h.tplPanel().getByRole('button', {name: /Add template/}));
    // The row menu.
    const menu = await h.tplRowMenu(h.ops ? 'Assign Editor' : 'Request Copyedit');
    L('row menu', JSON.stringify(menu));
    // Every installed template's Edit window, untouched, closed again.
    const names = [];
    for (const g of r.groups) for (const row of g.rows) names.push({stage: g.name, name: row.name});
    const seen = {};
    for (const n of names) {
        const key = `${n.stage}/${n.name}`;
        try {
            await h.gotoTemplates();
            // A name that repeats across stages ("Assign Editor"): pick the row under its own stage.
            const idx = names.filter((x) => x.name === n.name).findIndex((x) => x.stage === n.stage);
            const row = h.tplPanel().getByRole('row').filter({has: page.getByText(n.name, {exact: true})}).nth(idx);
            await row.getByRole('button', {name: /More Actions/}).click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const w = h.tplWin();
            await w.waitFor({timeout: 30000}); await idle(page); await h.editorReady(); await page.waitForTimeout(600);
            const ws = await screen(page);
            const rd = await h.winRead(w);
            const msg = await h.msg();
            const title = flat((ws.text.dialog || '').split('\n')[0], 120);
            seen[key] = {title, message: flat((msg || '').replace(/<[^>]+>/g, ' '), 260), radios: rd.fields.filter((f) => f.name === 'restrictToUserGroups').map((f) => `${f.label}${f.checked ? ' [x]' : ''}`), task: rd.fields.filter((f) => f.label === 'Enter task information').map((f) => f.checked), include: rd.fields.filter((f) => /Automatically add/.test(f.label || '')).map((f) => f.checked), due: rd.fields.filter((f) => f.name === 'dueInterval').map((f) => `${f.value}|visible=${f.visible}`)};
            L('installed', key, JSON.stringify(seen[key]));
            if (Object.keys(seen).length <= 2 || /Assign Editor/.test(n.name)) { record(`k4-screen-edit-${n.name.replace(/\W+/g, '-')}-${n.stage.split(' ')[0]}`, ws); await shot(page, `k4-screen-edit-${n.name.replace(/\W+/g, '-')}-${n.stage.split(' ')[0]}`).catch(() => {}); }
            const c = await h.closeTpl(w, 'cancel');
            if (c.windowOpen) await h.closeTpl(w, 'close');
        } catch (e) { L('installed read failed', key, e.message.slice(0, 200)); }
    }
    record('k4-screen-installed', seen);
    // The same list on publicknowledge (read only) as manager.maya: the seeded context.
    try {
        await signIn(page, 'manager.maya');
        await h.gotoTemplates('publicknowledge');
        await h.snap('k4-screen-pk');
        const rp = await h.tplRead();
        for (const g of rp.groups) L('pk group', JSON.stringify(g.name), JSON.stringify(g.rows.map((x) => `${x.name}${x.autoAdd ? (x.autoAdd.checked ? ' [on]' : ' [off]') : ''}`)), 'empty', JSON.stringify(g.empty));
    } catch (e) { L('pk read failed', e.message.slice(0, 200)); }
    // Other levels: the site administrator (manager-level everywhere), a Section Editor by address.
    await signIn(page, 'admin', {contextPath: X.path});
    await h.gotoTemplates();
    await h.snap('k4-screen-admin');
    const ra = await h.tplRead();
    L('admin groups', JSON.stringify(ra.groups.map((g) => `${g.name}:${g.rows.length}`)));
    await signIn(page, h.u('se'), {contextPath: X.path});
    h.step = 'se typed settings address';
    const resp = await page.goto(h.settingsUrl());
    await idle(page);
    const ss = await h.snap('k4-screen-se-by-address');
    L('se by address: status', resp && resp.status(), 'url', page.url().replace(/^.*index.php/, ''), 'text', flat(ss.text.main, 400));
    L('se: Tasks and Discussions tab present?', await page.getByRole('tab', {name: 'Tasks and Discussions'}).count());
}

// ---------------------------------------------------------------------------
// Phase window: "Add template", its fields, refusals, leaving, saving (25b, Fields' last table)

async function phaseWindow(app, X, h, page) {
    h.phase = 'window';
    const {L} = h;
    const Cname = STAGE_NAMES[app.name][X.C];
    const Fname = STAGE_NAMES[app.name][X.F];
    const limitRole = h.ops ? 'Moderator' : 'Copyeditor';
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.gotoTemplates();
    // 1. The window as it opens.
    let w = await h.openTplWin({add: Cname});
    let s = await h.snap('k4-window-add-open');
    L('add window title line', flat((s.text.dialog || '').split('\n').slice(0, 3).join(' / '), 200));
    L('add window', JSON.stringify(await h.winRead(w)));
    L('add window text', flat(s.text.dialog, 1800));
    await loc(page, 'template window (dialog holding input[name=title])', w);
    await loc(page, 'template window › "Limit access to specific roles" radio', w.getByRole('radio', {name: 'Limit access to specific roles'}));
    await loc(page, 'template window › "Enter task information"', w.getByRole('checkbox', {name: 'Enter task information'}));
    await loc(page, 'template window › auto-add box', w.getByRole('checkbox', {name: 'Automatically add this task and/or discussion when a submission reaches the stage'}));
    // 2. Untouched: each way out closes at once.
    let c = await h.closeTpl(w, 'cancel');
    if (c.windowOpen) await h.closeTpl(w, 'close');
    w = await h.openTplWin({add: Cname});
    c = await h.closeTpl(w, 'close');
    w = await h.openTplWin({add: Cname});
    c = await h.closeTpl(w, 'escape');
    // 3. The shown fields: limit access, task information.
    w = await h.openTplWin({add: Cname});
    await w.getByRole('radio', {name: 'Limit access to specific roles'}).check();
    await w.locator('input[name="userGroupIds"]').first().waitFor({timeout: 15000}).catch(() => L('no role boxes'));
    await page.waitForTimeout(600);
    await w.getByRole('checkbox', {name: 'Enter task information'}).check();
    await page.waitForTimeout(400);
    s = await h.snap('k4-window-fields-shown');
    const rd = await h.winRead(w);
    L('role boxes', JSON.stringify(rd.fields.filter((f) => f.name === 'userGroupIds').map((f) => f.label)));
    L('due select', JSON.stringify(rd.fields.filter((f) => f.name === 'dueInterval')));
    L('descs', JSON.stringify(rd.descs));
    // "Insert Content".
    try {
        await w.getByRole('button', {name: 'Insert Content'}).first().click();
        const iw = page.getByRole('dialog', {name: 'Insert Content'}).last();
        await iw.waitFor({timeout: 10000});
        await idle(page);
        const is = await screen(page);
        record('k4-window-insert-content', is);
        L('insert content window', flat(is.text.dialog, 1500));
        await iw.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
        await page.waitForTimeout(500);
    } catch (e) { L('insert content failed', e.message.slice(0, 200)); }
    // 4. Refusals: Save with everything empty (limit + task on, nothing chosen).
    let res = await h.saveTpl(w, 'all empty (limit, task on)');
    await h.snap('k4-window-save-empty');
    // Leave it changed: close control, answer No, then Yes.
    c = await h.closeTpl(w, 'close', 'No');
    c = await h.closeTpl(w, 'cancel', 'Yes');
    await h.snap('k4-window-after-cancel-yes');
    // 5. The name only.
    w = await h.openTplWin({add: Cname});
    await w.locator('input[name="title"]').fill('K4 name only');
    res = await h.saveTpl(w, 'name only');
    await h.snap('k4-window-save-name-only');
    c = await h.closeTpl(w, 'escape', 'Yes');
    // 6. Leaving the page with a changed window (beforeunload?) — the one tabbed screen left changed.
    w = await h.openTplWin({add: Cname});
    await w.locator('input[name="title"]').fill('K4 unsaved');
    const n0 = h.browserDialogs.length;
    h.step = 'leave settings with changed template window';
    await page.goto(h.ctx('/dashboard/editorial')).catch((e) => L('goto after change', e.message.slice(0, 120)));
    await idle(page);
    L('left the page with a changed window: browser dialogs', JSON.stringify(h.browserDialogs.slice(n0)), 'url', page.url().replace(/^.*index.php/, ''));
    // Back: "K4 unsaved" must not exist.
    await h.gotoTemplates();
    L('K4 unsaved in list?', await h.tplRow('K4 unsaved').count(), 'K4 name only in list?', await h.tplRow('K4 name only').count());
    // 7. Saves: "K4 limited" (C, limited), "K4 auto copyedit" (C, task P3M), "K4 auto task" (F, task P2W, auto on), "K4 toggled" (F).
    w = await h.openTplWin({add: Cname});
    await w.locator('input[name="title"]').fill('K4 limited');
    await h.setRoles(w, []);
    await h.typeMsg(w, 'K4 limited text');
    res = await h.saveTpl(w, 'limited, no role ticked');
    await h.snap('k4-window-limit-no-role');
    await h.setRoles(w, [limitRole]);
    res = await h.saveTpl(w, `limited to ${limitRole}`);
    await h.snap('k4-window-limited-saved');
    if (!res.closed) await h.closeTpl(w, 'cancel');
    L('list after limited save', JSON.stringify((await h.tplRead()).groups.map((g) => `${g.name}: ${g.rows.map((x) => x.name).join(', ')}`)));
    w = await h.openTplWin({add: Cname});
    await w.locator('input[name="title"]').fill('K4 auto copyedit');
    await w.getByRole('checkbox', {name: 'Enter task information'}).check();
    await h.typeMsg(w, 'K4 auto copyedit text');
    res = await h.saveTpl(w, 'task without due date');
    await h.snap('k4-window-task-no-due');
    await w.locator('select[name="dueInterval"]').selectOption('P3M');
    res = await h.saveTpl(w, 'task P3M');
    if (!res.closed) await h.closeTpl(w, 'cancel');
    w = await h.openTplWin({add: Fname});
    s = await h.snap('k4-window-add-first-stage');
    L('first stage window title', flat((s.text.dialog || '').split('\n')[0], 150));
    await w.locator('input[name="title"]').fill('K4 auto task');
    await w.getByRole('checkbox', {name: 'Enter task information'}).check();
    await w.locator('select[name="dueInterval"]').selectOption('P2W');
    await h.typeMsg(w, 'K4 auto task text for {$recipientName}');
    await w.getByRole('checkbox', {name: 'Automatically add this task and/or discussion when a submission reaches the stage'}).check();
    res = await h.saveTpl(w, 'task P2W, auto on in the window');
    if (!res.closed) await h.closeTpl(w, 'cancel');
    w = await h.openTplWin({add: Fname});
    await w.locator('input[name="title"]').fill('K4 toggled');
    await h.typeMsg(w, 'K4 toggled text');
    res = await h.saveTpl(w, 'toggled (discussion)');
    if (!res.closed) await h.closeTpl(w, 'cancel');
    await page.reload(); await h.gotoTemplates();
    const after = await h.tplRead();
    record('k4-window-list-after-saves', after);
    await h.snap('k4-window-list-after-saves');
    for (const g of after.groups) L('after saves', JSON.stringify(g.name), JSON.stringify(g.rows.map((x) => `${x.name}${x.autoAdd ? (x.autoAdd.checked ? ' [on]' : ' [off]') : ''}`)));
    // 8. "Edit": the window holds what was saved; rename "K4 limited".
    w = await h.openTplWin({edit: 'K4 limited'});
    s = await h.snap('k4-window-edit-limited');
    L('edit window title', flat((s.text.dialog || '').split('\n')[0], 150));
    L('edit window fields', JSON.stringify((await h.winRead(w)).fields.filter((f) => ['restrictToUserGroups', 'userGroupIds', 'title'].includes(f.name)).map((f) => `${f.name}:${f.label || f.value}${f.checked ? ' [x]' : ''}`)));
    L('edit window message', JSON.stringify(await h.msg()));
    await w.locator('input[name="title"]').fill('K4 limited renamed');
    res = await h.saveTpl(w, 'rename');
    L('list shows renamed?', await h.tplRow('K4 limited renamed').count(), 'old name?', await h.tplRow('K4 limited').count());
    await h.snap('k4-window-after-rename');
    w = await h.openTplWin({edit: 'K4 auto task'});
    await h.snap('k4-window-edit-auto-task');
    L('edit auto task fields', JSON.stringify((await h.winRead(w)).fields.filter((f) => f.name && !/participants/.test(f.name)).map((f) => `${f.name}:${f.label || ''}=${f.value}${f.checked ? ' [x]' : ''}`)));
    // Edit, change, Cancel -> Warning; the list unchanged.
    await w.locator('input[name="title"]').fill('K4 auto task CHANGED');
    c = await h.closeTpl(w, 'cancel', 'Yes');
    L('after Cancel on changed Edit: CHANGED in list?', await h.tplRow('K4 auto task CHANGED').count());
}

// ---------------------------------------------------------------------------
// Phase toggle: the list's "Auto-add at stage" box (26a)

async function phaseToggle(app, X, h, page) {
    h.phase = 'toggle';
    const {L} = h;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.gotoTemplates();
    await loc(page, 'template screen › "Confirm Automatic Addition" dialog', h.confirmDlg());
    // "No" first.
    let r = await h.toggleAuto('K4 auto copyedit', 'No', 'k4-toggle-no');
    await page.reload(); await h.gotoTemplates();
    L('after No + reload: box', await h.autoBox('K4 auto copyedit').isChecked());
    // Then "Yes".
    r = await h.toggleAuto('K4 auto copyedit', 'Yes', 'k4-toggle-yes');
    await page.reload(); await h.gotoTemplates();
    L('after Yes + reload: box', await h.autoBox('K4 auto copyedit').isChecked());
    // The window's box reads the same switch.
    let w = await h.openTplWin({edit: 'K4 auto copyedit'});
    L('Edit window auto box after list Yes', await w.getByRole('checkbox', {name: 'Automatically add this task and/or discussion when a submission reaches the stage'}).isChecked());
    await h.closeTpl(w, 'cancel');
    // An installed template.
    r = await h.toggleAuto('Discussion (Production)', 'Yes', 'k4-toggle-installed');
    // On, then off ("…to stop automatically adding…").
    r = await h.toggleAuto('K4 toggled', 'Yes');
    r = await h.toggleAuto('K4 toggled', 'No', 'k4-toggle-off-no');
    r = await h.toggleAuto('K4 toggled', 'Yes', 'k4-toggle-off-yes');
    await page.reload(); await h.gotoTemplates();
    const rd = await h.tplRead();
    record('k4-toggle-final', rd);
    for (const g of rd.groups) L('final', JSON.stringify(g.name), JSON.stringify(g.rows.map((x) => `${x.name}${x.autoAdd ? (x.autoAdd.checked ? ' [on]' : ' [off]') : ''}`)));
    await h.snap('k4-toggle-final');
}

// ---------------------------------------------------------------------------
// Phase auto: what a submission reaching a stage gets (26b, 26c, Settings bullets 2 and 4)

async function readStage(h, page, id, key, label, {author = false} = {}) {
    if (author) await h.open(h.auUrl(id, key)); else await h.open(h.edUrl(id, key));
    const s = await h.snap(label);
    const p = await h.panelRead();
    h.L(label, JSON.stringify(p.map((x) => ({heading: x.heading, rows: x.rows}))));
    return {s, p};
}

async function phaseAuto(app, X, h, page) {
    h.phase = 'auto';
    const {L} = h;
    const F = h.ops ? 'workflow_5' : 'workflow_1';
    L('expected due dates: P2W', day(14), 'P3M', months(3));
    await signIn(page, h.u('mg'), {contextPath: X.path});
    // S1: just submitted.
    await readStage(h, page, X.S1.submissionId, F, 'k4-auto-s1-first-mg');
    // The auto-added task's window.
    try {
        const w = await h.openItem('K4 auto task');
        const s = await h.snap('k4-auto-s1-item-window');
        L('auto task window', flat(s.text.dialog, 1200));
        await w.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
        await page.waitForTimeout(600);
    } catch (e) { L('open auto item failed', e.message.slice(0, 200)); }
    // The row menu of an auto-added item: Edit window (participants, owner).
    try {
        await h.open(h.edUrl(X.S1.submissionId, F));
        const row = h.itemRow('K4 auto task').first();
        await row.getByRole('button', {name: /More Actions/}).click();
        L('auto item row menu', JSON.stringify(await page.getByRole('menuitem').allInnerTexts()));
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const w = h.win(); await w.waitFor({timeout: 30000}); await idle(page); await page.waitForTimeout(800);
        await h.snap('k4-auto-s1-item-edit');
        L('auto item Edit', JSON.stringify(await h.state(w)), 'participants', JSON.stringify(await h.participants(w)));
        await h.closeWin(w);
    } catch (e) { L('auto item edit failed', e.message.slice(0, 200)); }
    // The Author's view of the same stage.
    await signIn(page, h.u('au'), {contextPath: X.path});
    if (h.ops) {
        await page.goto(h.auUrl(X.S1.submissionId)); await idle(page);
        const link = page.getByRole('link', {name: 'Production Tasks & Discussions'}).or(page.getByRole('button', {name: 'Production Tasks & Discussions'})).first();
        await link.click().catch(() => L('no author link'));
        await h.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        await h.snap('k4-auto-s1-first-au');
        L('k4-auto-s1-first-au', JSON.stringify(await h.panelRead()));
    } else await readStage(h, page, X.S1.submissionId, F, 'k4-auto-s1-first-au', {author: true});
    await signIn(page, h.u('mg'), {contextPath: X.path});
    if (!h.ops) {
        // S2 at copyediting: its first stage and its copyediting stage.
        await readStage(h, page, X.S2.submissionId, 'workflow_1', 'k4-auto-s2-first');
        await readStage(h, page, X.S2.submissionId, 'workflow_4', 'k4-auto-s2-copyediting-1');
        // Send To Production on screen.
        await h.open(h.edUrl(X.S2.submissionId, 'workflow_4'));
        await h.decide('Send To Production', 'k4-auto-s2-decision-production');
        await readStage(h, page, X.S2.submissionId, 'workflow_5', 'k4-auto-s2-production-1');
        // Back to copyediting: no second copyediting item.
        await h.open(h.edUrl(X.S2.submissionId, 'workflow_5'));
        L('production action buttons', JSON.stringify(await h.actionLabels()));
        await h.decide('Move To Copyediting', 'k4-auto-s2-decision-back');
        await readStage(h, page, X.S2.submissionId, 'workflow_4', 'k4-auto-s2-copyediting-2-returned');
        // Delete the copyediting item, then production and back again.
        await h.open(h.edUrl(X.S2.submissionId, 'workflow_4'));
        await h.deleteItem('K4 auto copyedit');
        await readStage(h, page, X.S2.submissionId, 'workflow_4', 'k4-auto-s2-copyediting-3-deleted');
        await h.open(h.edUrl(X.S2.submissionId, 'workflow_4'));
        await h.decide('Send To Production', null);
        await readStage(h, page, X.S2.submissionId, 'workflow_5', 'k4-auto-s2-production-2-returned');
        await h.open(h.edUrl(X.S2.submissionId, 'workflow_5'));
        await h.decide('Move To Copyediting', null);
        await readStage(h, page, X.S2.submissionId, 'workflow_4', 'k4-auto-s2-copyediting-4-after-delete');
    } else {
        // S2 is posted (Done). Its production panel, then Unpost (back to Production).
        await readStage(h, page, X.S2.submissionId, 'workflow_5', 'k4-auto-s2-posted');
        await page.goto(h.edUrl(X.S2.submissionId)); await idle(page);
        const unpost = async (label) => {
            h.step = 'unpost';
            await page.getByRole('button', {name: 'Unpost', exact: true}).first().click();
            const d = page.getByRole('dialog').filter({hasText: "Are you sure you don't want this to be posted?"}).last();
            await d.waitFor({timeout: 30000});
            const un = page.waitForResponse((r) => /\/unpublish/.test(r.url()), {timeout: 30000}).catch(() => null);
            await d.getByRole('button', {name: 'Unpost', exact: true}).last().click();
            const r = await un;
            L(label, 'unpublish', r && r.status());
            await idle(page);
        };
        const post = async (label) => {
            h.step = 'post';
            const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
            const postCtl = page.getByRole('button', {name: 'Post', exact: true});
            await stageAction.or(postCtl).first().waitFor({timeout: 30000});
            if (await stageAction.isVisible()) await stageAction.click();
            await postCtl.first().waitFor({timeout: 30000});
            await postCtl.first().click();
            const d = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'}).last();
            await d.waitFor({timeout: 30000});
            const pr = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()), {timeout: 30000}).catch(() => null);
            await d.getByRole('button', {name: 'Post', exact: true}).last().click();
            const r = await pr;
            L(label, 'publish', r && r.status());
            await idle(page);
        };
        try { await unpost('first unpost'); } catch (e) { L('unpost failed', e.message.slice(0, 200)); }
        await readStage(h, page, X.S2.submissionId, 'workflow_5', 'k4-auto-s2-unposted-1');
        await h.open(h.edUrl(X.S2.submissionId, 'workflow_5'));
        await h.deleteItem('K4 auto task');
        await readStage(h, page, X.S2.submissionId, 'workflow_5', 'k4-auto-s2-deleted');
        try {
            await page.goto(h.edUrl(X.S2.submissionId)); await idle(page);
            await post('post again');
            await page.goto(h.edUrl(X.S2.submissionId)); await idle(page);
            await unpost('second unpost');
        } catch (e) { L('post/unpost failed', e.message.slice(0, 200)); }
        await readStage(h, page, X.S2.submissionId, 'workflow_5', 'k4-auto-s2-unposted-2');
    }
}

// ---------------------------------------------------------------------------
// Phase letter: an installed letter template switched on; the item it makes (placeholders)

async function phaseLetter(app, X, h, page) {
    h.phase = 'letter';
    const {L} = h;
    const tpl = h.ops ? 'Assign Editor' : 'Galleys Complete';
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.gotoTemplates();
    await h.toggleAuto(tpl, 'Yes', 'k4-letter-toggle');
    const decisions = app.name === 'omp' ? ['skipInternalReview', 'accept', 'sendToProduction'] : app.name === 'ojs' ? ['skipExternalReview', 'sendToProduction'] : undefined;
    X.S3 = await app.api.createSubmission({context: X.path, submitter: h.u('au'), tag: `${X.t}p`, participants: [{username: h.u('se'), role: 'sectionEditor'}], decisions});
    L('S3', X.S3.submissionId);
    await readStage(h, page, X.S3.submissionId, 'workflow_5', 'k4-letter-panel');
    try {
        const w = await h.openItem(tpl);
        const s = await h.snap('k4-letter-item-window');
        L('letter item window', flat(s.text.dialog, 1500));
        await w.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
    } catch (e) { L('open letter item failed', e.message.slice(0, 200)); }
}

// ---------------------------------------------------------------------------
// Phase restrict: "Limit access to specific roles" per level, in "Add" and in "Notify" (Settings bullet 3)

async function phaseRestrict(app, X, h, page) {
    h.phase = 'restrict';
    const {L} = h;
    const key = h.ops ? 'workflow_5' : 'workflow_4';
    const who = h.ops ? ['mg', 'se', 'au'] : ['mg', 'se', 'ce', 'au'];
    const names = {mg: 'Mona Manager', se: 'Sean Editor', ce: 'Cora Copy', au: 'Ava Author'};
    for (const k of who) {
        await signIn(page, h.u(k), {contextPath: X.path});
        if (k === 'au' && h.ops) {
            await page.goto(h.auUrl(X.SC.submissionId)); await idle(page);
            await page.getByRole('link', {name: 'Production Tasks & Discussions'}).or(page.getByRole('button', {name: 'Production Tasks & Discussions'})).first().click().catch(() => L('no author link'));
            await h.panel().getByRole('button', {name: 'Add', exact: true}).first().waitFor({timeout: 30000}).catch(() => {});
            await idle(page);
        } else if (k === 'au') await h.open(h.auUrl(X.SC.submissionId, key));
        else await h.open(h.edUrl(X.SC.submissionId, key));
        let w;
        try { w = await h.openAdd(); } catch (e) { L(k, 'no Add window', e.message.slice(0, 120)); continue; }
        await h.snap(`k4-restrict-add-${k}`);
        const list = await h.tplList(w);
        L(k, 'Add window templates', JSON.stringify(list && list.items.map((i) => i.text.split(' | ')[0])));
        await h.closeWin(w);
        // The Participants panel's predefined messages ("Notify" on another person's row).
        if (k === 'au') continue;
        try {
            await page.goto(h.edUrl(X.SC.submissionId, key)); await idle(page);
            const target = k === 'mg' || k === 'ce' ? names.se : (h.ops ? names.au : names.ce);
            const more = page.getByRole('button', {name: `${target} More Actions`, exact: true}).first();
            await more.click();
            await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
            const items = (await page.getByRole('menuitem').allInnerTexts()).map((s) => s.trim());
            const it = page.getByRole('menuitem', {name: 'Notify', exact: true});
            if (!(await it.count())) { L(k, 'no Notify on', target, JSON.stringify(items)); await page.keyboard.press('Escape'); continue; }
            await it.click();
            const nw = page.getByRole('dialog').filter({has: page.locator('form select[name="template"]')}).last();
            await nw.waitFor({timeout: 30000}); await idle(page);
            const opts = await nw.locator('select[name="template"] option').evaluateAll((els) => els.map((o) => o.text.trim()));
            await h.snap(`k4-restrict-notify-${k}`);
            L(k, 'Notify on', target, 'predefined messages', JSON.stringify(opts));
            await nw.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click().catch(() => {});
            await page.waitForTimeout(800);
        } catch (e) { L(k, 'notify read failed', e.message.slice(0, 200)); }
    }
    // A reviewer on the review stage: the review stage's templates (unrestricted) in the reviewer's "Add".
    if (!h.ops) {
        try {
            await signIn(page, h.u('r1'), {contextPath: X.path});
            await page.goto(h.ctx(`/reviewer/submission/${X.SR.submissionId}`)); await idle(page);
            await toStep3(page, h);
            const tp = page.getByRole('tabpanel', {name: '3. Download & Review'});
            const w = await h.openAdd(tp);
            await h.snap('k4-restrict-add-r1');
            const list = await h.tplList(w);
            L('r1 Add window templates', JSON.stringify(list && list.items.map((i) => i.text.split(' | ')[0])));
            await h.closeWin(w);
        } catch (e) { L('reviewer templates failed', e.message.slice(0, 200)); }
    }
}

async function toStep3(page, h) {
    const sc1 = page.getByRole('button', {name: 'Save and continue'});
    if (await sc1.count()) { await sc1.first().click(); await idle(page); }
    const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
    await c3.waitFor({timeout: 15000}).catch(() => {});
    if (await c3.count() && !(await c3.isDisabled())) { await c3.click(); await idle(page); }
    await page.getByRole('tabpanel', {name: '3. Download & Review'}).getByRole('button', {name: 'Add', exact: true}).waitFor({timeout: 30000}).catch(() => h.L('no Add on step 3'));
    await idle(page);
}

// ---------------------------------------------------------------------------
// Phase taskinfo: a task template pressed in "Add" (Settings bullet 4), both ends of the interval

async function phaseTaskinfo(app, X, h, page) {
    h.phase = 'taskinfo';
    const {L} = h;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    const C = h.ops ? 'workflow_5' : 'workflow_4';
    await h.open(h.edUrl(X.SC.submissionId, C));
    const w = await h.openAdd();
    L('before', JSON.stringify(await h.state(w)));
    await h.press(w, 'K4 auto copyedit', 'k4-taskinfo-p3m');
    if (h.ops) await h.press(w, 'K4 auto task', 'k4-taskinfo-p2w');
    await h.press(w, 'K4 limited renamed', 'k4-taskinfo-discussion');
    L('expected: P2W', day(14), 'P3M', months(3));
    await h.closeWin(w);
    if (!h.ops) {
        await h.open(h.edUrl(X.SC.submissionId, 'workflow_1'));
        const w2 = await h.openAdd();
        await h.press(w2, 'K4 auto task', 'k4-taskinfo-p2w');
        await h.closeWin(w2);
    }
}

// ---------------------------------------------------------------------------
// Phase delete: a template with items (25c)

async function phaseDelete(app, X, h, page) {
    h.phase = 'delete';
    const {L} = h;
    const victim = 'K4 auto copyedit';
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.gotoTemplates();
    // Cancel first.
    await h.tplRowMenu(victim, 'Delete');
    let d = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete'}).last();
    await d.waitFor({timeout: 10000});
    const s = await h.snap('k4-delete-dialog');
    L('delete dialog', flat(s.text.dialog, 300), 'buttons', JSON.stringify(await d.getByRole('button').evaluateAll((els) => els.map((b) => ({text: b.innerText.trim(), cls: b.className.slice(0, 160), color: getComputedStyle(b).backgroundColor})))));
    await d.getByRole('button', {name: 'Cancel', exact: true}).click();
    await page.waitForTimeout(800);
    L('after Cancel: still listed?', await h.tplRow(victim).count());
    // OK.
    await h.tplRowMenu(victim, 'Delete');
    d = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete'}).last();
    await d.waitFor({timeout: 10000});
    const t0 = Date.now();
    await d.getByRole('button', {name: 'OK', exact: true}).click();
    await page.waitForTimeout(1500); await idle(page);
    L('after OK: still listed?', await h.tplRow(victim).count(), 'calls', JSON.stringify(h.since(t0, /editTaskTemplates/)), 'toasts', JSON.stringify(await h.toasts()));
    await h.snap('k4-delete-after');
    await page.reload(); await h.gotoTemplates();
    L('after reload: still listed?', await h.tplRow(victim).count());
    // The "Add" window on the stage no longer lists it; the items made from it stay.
    const C = h.ops ? 'workflow_5' : 'workflow_4';
    await h.open(h.edUrl(X.SC.submissionId, C));
    L('SC panel after delete', JSON.stringify(await h.panelRead()));
    const w = await h.openAdd();
    await h.snap('k4-delete-add-window');
    const list = await h.tplList(w);
    L('Add window after delete', JSON.stringify(list && list.items.map((i) => i.text.split(' | ')[0])));
    await h.closeWin(w);
    await readStage(h, page, X.S2.submissionId, C, 'k4-delete-s2-items');
    // The item made from the deleted template still opens.
    try {
        const iw = await h.openItem(victim);
        const is = await h.snap('k4-delete-item-window');
        L('item window after template delete', flat(is.text.dialog, 600));
        await iw.getByRole('button', {name: 'Close', exact: true}).last().click().catch(() => {});
    } catch (e) { L('open item after delete failed', e.message.slice(0, 200)); }
}

// ---------------------------------------------------------------------------
// Phase review: the review type setting, journal default and a request's own (Settings bullet 5)

async function phaseReview(app, X, h, page) {
    h.phase = 'review';
    const {L} = h;
    if (h.ops) {
        await signIn(page, h.u('mg'), {contextPath: X.path});
        await page.goto(h.settingsUrl()); await idle(page);
        L('OPS workflow tabs', JSON.stringify((await page.locator('main').getByRole('tablist').first().getByRole('tab').allInnerTexts()).map((x) => x.trim())));
        await h.snap('k4-review-ops-tabs');
        return;
    }
    const u = h.u;
    const id = X.SR.submissionId;
    await signIn(page, u('mg'), {contextPath: X.path});
    await page.goto(h.settingsUrl()); await idle(page);
    await page.getByRole('tab', {name: 'Review', exact: true}).click();
    await page.locator('#reviewSetup').waitFor({timeout: 30000}).catch(() => {});
    await idle(page);
    await h.snap('k4-review-setup-default');
    const modes = await page.locator('#reviewSetup').getByRole('radio').evaluateAll((els) => els.map((e) => `${(e.closest('label') || e.parentElement).innerText.trim()}${e.checked ? ' [x]' : ''}`));
    L('Default Review Mode radios', JSON.stringify(modes));
    const who = async (k, label) => {
        if (k === 'au') { await signIn(page, u('au'), {contextPath: X.path}); await h.open(h.auUrl(id)); }
        else { await signIn(page, u(k), {contextPath: X.path}); await page.goto(h.ctx(`/reviewer/submission/${id}`)); await idle(page); await toStep3(page, h); }
        const scope = k === 'au' ? undefined : page.getByRole('tabpanel', {name: '3. Download & Review'});
        const w = await h.openAdd(scope);
        await h.snap(label);
        const offered = await h.participants(w);
        L(label, 'offered', JSON.stringify(offered.map((o) => o.label.split(' | ')[0])));
        return {w, offered};
    };
    // Install default (double-anonymous requests).
    let {w} = await who('au', 'k4-review-default-au');
    await h.closeWin(w);
    ({w} = await who('r1', 'k4-review-default-r1'));
    await h.closeWin(w);
    // The editor changes r1's request to "Open" (the reviewer row's Edit).
    await signIn(page, u('mg'), {contextPath: X.path});
    await page.goto(h.edUrl(id)); await idle(page);
    try {
        const row = page.locator('[data-cy="reviewer-manager"]').getByRole('row').filter({hasText: 'Rhea'}).first();
        await row.getByRole('button', {name: /More Actions/}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const edit = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
        await edit.locator('input[name="reviewMethod"]').first().waitFor({timeout: 30000});
        await idle(page);
        L('r1 request radios before', JSON.stringify(await edit.locator('input[name="reviewMethod"]').evaluateAll((els) => els.map((e) => `${e.value}:${e.checked}:${(e.labels && e.labels[0] ? e.labels[0].textContent.trim() : '')}`))));
        await edit.locator('input[name="reviewMethod"][value="3"]').check();
        await edit.getByRole('button', {name: 'OK', exact: true}).click();
        await edit.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 30000}).catch(() => L('edit review form did not close'));
        await idle(page);
        await page.reload(); await idle(page);
        const r2 = page.locator('[data-cy="reviewer-manager"]').getByRole('row').filter({hasText: 'Rhea'}).first();
        L('r1 row after Open', flat(await r2.innerText().catch(() => ''), 200));
    } catch (e) { L('edit r1 request failed', e.message.slice(0, 200)); }
    // After the request is "Open": the Author and r1.
    let res;
    ({w} = await who('au', 'k4-review-r1open-au'));
    const offeredAu = await h.participants(w);
    if (offeredAu.some((o) => o.label.includes(`(${u('r1')})`))) {
        await h.tick(w, u('r1'));
        await w.locator('input[name="title"]').fill('K4 author with open reviewer');
        await h.typeMsg(w, 'K4 author with open reviewer message');
        res = await h.saveItem(w, 'au + r1 (open request)');
        await h.snap('k4-review-r1open-au-saved');
        if (!res.closed) await h.closeWin(w);
    } else await h.closeWin(w);
    ({w} = await who('r1', 'k4-review-r1open-r1'));
    await h.closeWin(w);
    // The journal's default to "Open" on screen, then a new request.
    await signIn(page, u('mg'), {contextPath: X.path});
    await page.goto(h.settingsUrl()); await idle(page);
    await page.getByRole('tab', {name: 'Review', exact: true}).click();
    await page.locator('#reviewSetup').waitFor({timeout: 30000}).catch(() => {});
    await idle(page);
    await page.locator('#reviewSetup').getByRole('radio', {name: 'Open', exact: true}).check();
    await page.locator('#reviewSetup').getByRole('button', {name: 'Save', exact: true}).click();
    await page.locator('#reviewSetup .pkpFormPage__status', {hasText: 'Saved'}).waitFor({timeout: 30000}).catch(() => L('no Saved'));
    await h.snap('k4-review-setup-open');
    X.SR2 = await app.api.createSubmission({tag: `${X.t}o`, context: X.path, submitter: u('au'), participants: [{username: u('se'), role: 'sectionEditor'}],
        decisions: [app.name === 'omp' ? 'skipInternalReview' : 'sendExternalReview'],
        reviewRounds: [{reviewers: [{username: u('r3'), status: 'accepted'}]}]});
    L('SR2', X.SR2.submissionId);
    const id2 = X.SR2.submissionId;
    await signIn(page, u('au'), {contextPath: X.path});
    await h.open(h.auUrl(id2));
    w = await h.openAdd();
    await h.snap('k4-review-journalopen-au');
    const off2 = await h.participants(w);
    L('journal open: au offered', JSON.stringify(off2.map((o) => o.label.split(' | ')[0])));
    if (off2.some((o) => o.label.includes(`(${u('r3')})`))) {
        await h.tick(w, u('r3'));
        await w.locator('input[name="title"]').fill('K4 author with reviewer, journal open');
        await h.typeMsg(w, 'K4 journal open message');
        res = await h.saveItem(w, 'au + r3 (journal open)');
        if (!res.closed) await h.closeWin(w);
    } else await h.closeWin(w);
    await signIn(page, u('r3'), {contextPath: X.path});
    await page.goto(h.ctx(`/reviewer/submission/${id2}`)); await idle(page);
    await toStep3(page, h);
    w = await h.openAdd(page.getByRole('tabpanel', {name: '3. Download & Review'}));
    await h.snap('k4-review-journalopen-r3');
    L('journal open: r3 offered', JSON.stringify((await h.participants(w)).map((o) => o.label.split(' | ')[0])));
    await h.closeWin(w);
    await signIn(page, u('au'), {contextPath: X.path});
    await h.open(h.auUrl(id2));
    await h.snap('k4-review-journalopen-au-panel');
    L('journal open: author panel', JSON.stringify(await h.panelRead()));
}

// ---------------------------------------------------------------------------
// Phase prefs: Profile › Notifications, the "Discussion added." row (Settings bullet 6)

async function phasePrefs(app, X, h, page) {
    h.phase = 'prefs';
    const {L} = h;
    for (const k of ['mg', 'au']) {
        await signIn(page, h.u(k), {contextPath: X.path});
        await page.goto(app.url(`/index.php/${X.path}/user/profile/notificationSettings`)); await idle(page);
        const form = page.locator('form#notificationSettingsForm');
        await form.waitFor({timeout: 15000}).catch(() => L('no notification settings form'));
        const rows = await form.evaluate((f) => [...f.querySelectorAll('input[type=checkbox]')].map((i) => {
            const sec = i.closest('.section') || i.parentElement;
            const lab = sec ? (sec.querySelector(':scope > ul > label:not([for]), :scope > .label, :scope > label:not([for])') || {}).innerText : null;
            const own = i.id ? (f.querySelector(`label[for="${i.id}"]`) || {}).innerText : null;
            return {row: (lab || '').trim(), box: (own || '').trim(), checked: i.checked};
        })).catch(() => []);
        await h.snap(`k4-prefs-${k}`);
        L(k, 'Discussion added. row', JSON.stringify(rows.filter((r) => /Discussion added/.test(r.row))));
        L(k, 'all rows', JSON.stringify(rows.map((r) => `${r.row.slice(0, 40)} / ${r.box.slice(0, 40)}: ${r.checked}`)));
    }
}

// ---------------------------------------------------------------------------
// Phase ops1: "Assign Editor" under Settings on all three apps; in "Add" on OPS

async function phaseOps1(app, X, h, page) {
    h.phase = 'ops1';
    const {L} = h;
    await signIn(page, h.u('mg'), {contextPath: X.path});
    await h.gotoTemplates();
    const rows = h.tplPanel().getByRole('row').filter({has: page.getByText('Assign Editor', {exact: true})});
    const n = await rows.count();
    L('Assign Editor rows', n);
    for (let i = 0; i < n; i++) {
        await h.gotoTemplates();
        await h.tplPanel().getByRole('row').filter({has: page.getByText('Assign Editor', {exact: true})}).nth(i).getByRole('button', {name: /More Actions/}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const w = h.tplWin();
        await w.waitFor({timeout: 30000}); await idle(page); await h.editorReady(); await page.waitForTimeout(800);
        const s = await h.snap(`k4-ops1-edit-${i}`);
        L(`Assign Editor #${i}`, 'box', JSON.stringify(flat(await h.msg(), 300)), 'window head', flat((s.text.dialog || '').slice(0, 200), 200));
        const res = await h.saveTpl(w, `Assign Editor #${i} unchanged`);
        await h.snap(`k4-ops1-save-${i}`);
        if (!res.closed) await h.closeTpl(w, 'cancel');
    }
    if (h.ops) {
        // In "Add": a fresh window, then a window holding typed text.
        await h.open(h.edUrl(X.SC.submissionId, 'workflow_5'));
        let w = await h.openAdd();
        const r1 = await h.press(w, 'Assign Editor', 'k4-ops1-add-fresh');
        await w.locator('input[name="participants"]').nth(1).check().catch(() => {});
        let res = await h.saveItem(w, 'Assign Editor as pressed (fresh)');
        await h.snap('k4-ops1-add-fresh-save');
        if (!res.closed) await h.closeWin(w);
        await h.open(h.edUrl(X.SC.submissionId, 'workflow_5'));
        w = await h.openAdd();
        await h.typeMsg(w, 'K4 typed before');
        const r2 = await h.press(w, 'Assign Editor', 'k4-ops1-add-typed');
        L('ops1 add', JSON.stringify({fresh: r1 && r1.st.message, typed: r2 && r2.st.message}));
        await h.closeWin(w);
    }
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const xFile = path.join(outDir(), `x-${app.name}.json`);
    let X;
    if (process.env.REUSE && fs.existsSync(xFile)) X = JSON.parse(fs.readFileSync(xFile, 'utf8'));
    else { X = await seedContext(app); fs.writeFileSync(xFile, JSON.stringify(X, null, 2)); }
    const h = helpers(app, page, X);
    const guard = async (name, fn) => {
        const t0 = Date.now();
        try { await fn(); } catch (e) {
            h.L(`[error in ${name}]`, String(e.stack || e.message).slice(0, 1200));
            await shot(page, `error-${name}`).catch(() => {});
        }
        h.L(`[phase ${name} took ${Math.round((Date.now() - t0) / 1000)} s]`);
    };
    try {
        if (PHASES.includes('screen')) await guard('screen', () => phaseScreen(app, X, h, page));
        if (PHASES.includes('window')) await guard('window', () => phaseWindow(app, X, h, page));
        if (PHASES.includes('toggle')) await guard('toggle', () => phaseToggle(app, X, h, page));
        if (PHASES.includes('seed')) { await seedSubmissions(app, X); fs.writeFileSync(xFile, JSON.stringify(X, null, 2)); }
        if (PHASES.includes('auto')) await guard('auto', () => phaseAuto(app, X, h, page));
        if (PHASES.includes('restrict')) await guard('restrict', () => phaseRestrict(app, X, h, page));
        if (PHASES.includes('taskinfo')) await guard('taskinfo', () => phaseTaskinfo(app, X, h, page));
        if (PHASES.includes('delete')) await guard('delete', () => phaseDelete(app, X, h, page));
        if (PHASES.includes('letter')) await guard('letter', () => phaseLetter(app, X, h, page));
        if (PHASES.includes('review')) await guard('review', () => phaseReview(app, X, h, page));
        if (PHASES.includes('prefs')) await guard('prefs', () => phasePrefs(app, X, h, page));
        if (PHASES.includes('ops1')) await guard('ops1', () => phaseOps1(app, X, h, page));
    } finally {
        fs.writeFileSync(xFile, JSON.stringify(X, null, 2));
        record('k4-answers', h.answers);
        record('k4-page-errors', h.pageErrors);
        record('k4-browser-dialogs', h.browserDialogs);
        await close();
    }
});
