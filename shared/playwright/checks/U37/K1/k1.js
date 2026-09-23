// U37 claim check, chunk K1: the "Tasks & Discussions" panel on each stage and the reviewer's panel,
// where an item sits, a row's cells, "Activity", the row menu, who sees what, anonymity in roles,
// languages (all three apps).
// Spec: docs/specs/U37-tasks-and-discussions.md lines 10–74, 113–159, 406–411, 449–454, 620–705, 833–841.
//
// One scratch context per app (French under "UI"), with a copyediting template limited to one role
// (OPS: production, limited to the Author) and an auto-added task template. Accounts:
//   OJS/OMP: mg manager, ed editor, pe productionEditor, se sectionEditor, s2 sectionEditor,
//            ge guestEditor {OJS}, ce copyeditor, au author (the submitter), rv/r2 externalReviewer
//   OPS:     mg manager, se sectionEditor (Moderator), s2 sectionEditor, au author, eb editorialBoardMember
// Submissions:
//   main  OJS/OMP at Copyediting (OPS: Production), a dozen items seeded on the stage (and one on
//         Submission): discussions and tasks of every state and owner, overdue ones, one due today
//   rev   OJS/OMP: external review, rv accepted, r2 declined, two items on the review stage
//   prod  OJS/OMP: Production, one item          irev  OMP: internal review, one item
// Phases (PHASES=a,b; later phases reuse k1-state-<app>.json):
//   seed     the context and submissions
//   heads    each stage's panel as the manager (headings, description, columns, groups)
//   roles    the main panel as every account: rows, cells, boxes, every row menu; one window each
//   parts    a window its reader is not in, read three times over six seconds (ROLES=mg,ed,admin)
//   add      the "Add" window per account: badge, templates, "Attach Files"; left with a typed name
//   reply    se replies on D1 today: the "Activity" cell (td17), Mailpit, the Tasks count
//   states   mg closes D3 and T5, ce starts T1; the groups, the boxes, the menus, the badges, History
//   order    mg adds two discussions a second apart; the order in "In progress"
//   rev      the reviewer's wizard: step 1, step 3's panel, its window and "Add"; the declined reviewer;
//            the Author on the review stage
//   pe       an assigned Production editor (seeds its own submission): Copyediting and Submission
//   cancel   a reviewer replies on a review item, the manager's "Cancel Reviewer", the reviewer again
//   sys      a second scratch context with an auto-added discussion: "Created by: system", Activity, History
//   author   the Author's panels (OPS: the "Production Tasks & Discussions" page of the preprint)
//   tpl      Settings › Workflow › "Tasks and Discussions" as mg, ed, admin, se
//   fr       the panel, a window and "Add" with the interface in French; the reviewer's panel in French
//
//   PROBE_FEATURE=U37 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U37/K1/k1.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'heads', 'roles', 'parts', 'add', 'reply', 'states', 'order', 'rev', 'pe', 'cancel', 'sys', 'author', 'tpl', 'fr'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | ')); record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1500)}); }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({
    text: e.textContent.trim().replace(/\s+/g, ' '),
    disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('data-disabled'),
    color: getComputedStyle(e).color,
    cls: (e.className || '').toString().slice(0, 160),
}))).catch(() => []);

// Every discussion panel on the page, as data.
const panelsRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    return [...document.querySelectorAll('[data-cy="discussion-manager"]')].filter(vis).map((p) => {
        const t = p.querySelector('table');
        const rows = [];
        let group = null;
        for (const tr of t ? t.querySelectorAll('tbody tr') : []) {
            const tds = [...tr.querySelectorAll('td, th')];
            const txt = tr.innerText.trim().replace(/\s+/g, ' ');
            if (tds.length <= 1) { // a group heading or the empty text
                if (/^(Yet to begin|In progress|Closed|No Items|Loading)$/.test(txt) || tds.length === 1) {
                    if (txt === 'No Items' || /##grid\.noItems##/.test(txt)) rows.push({group, empty: txt}); else { group = txt; rows.push({groupHeading: txt, icon: !!tr.querySelector('svg')}); }
                }
                continue;
            }
            const cells = tds.map((td) => {
                const cb = td.querySelector('input[type=checkbox]');
                const btns = [...td.querySelectorAll('button')].filter(vis).map((b) => ({name: (b.getAttribute('aria-label') || b.innerText || '').trim(), tag: b.tagName}));
                return {
                    text: td.innerText.trim(),
                    lines: td.innerText.split('\n').map((l) => l.trim()).filter(Boolean),
                    checkbox: cb ? {checked: cb.checked, disabled: cb.disabled, label: [...(cb.getAttribute('aria-labelledby') || '').split(' ')].map((id) => (document.getElementById(id) || {}).innerText || '').join(' | ')} : null,
                    buttons: btns,
                    ol: td.querySelector('ol') ? [...td.querySelectorAll('ol li')].map((li) => li.innerText.trim()) : null,
                    clamp: (() => { const c = td.querySelector('[class*="line-clamp"]'); return c ? {cls: c.className, lineClamp: getComputedStyle(c).webkitLineClamp || getComputedStyle(c).getPropertyValue('-webkit-line-clamp')} : null; })(),
                    icon: !!td.querySelector('svg'),
                };
            });
            const nameBtn = tr.querySelector('[id^="discussion_name_"]');
            rows.push({group, text: txt.slice(0, 300), cells, nameRole: nameBtn ? (nameBtn.closest('button, a') || {}).tagName : null});
        }
        const h = p.querySelector('h3');
        const top = [...p.querySelectorAll('button')].filter(vis).filter((b) => !b.closest('tbody')).map((b) => ({name: (b.getAttribute('aria-label') || b.innerText || '').trim(), rect: (() => { const r = b.getBoundingClientRect(); const pr = p.getBoundingClientRect(); return {x: Math.round(r.x - pr.x), y: Math.round(r.y - pr.y), pw: Math.round(pr.width)}; })()}));
        return {
            heading: h ? h.innerText.trim() : null,
            description: (() => { const d = p.querySelector('p'); return d ? d.innerText.trim() : null; })(),
            columns: t ? [...t.querySelectorAll('thead th')].map((th) => ({text: th.innerText.trim(), srOnly: !!th.querySelector('.sr-only'), raw: th.textContent.trim()})) : [],
            topButtons: top,
            rows,
        };
    });
});

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const ctxUrl = (p, loc_ = 'en') => app.url(`/index.php/${sc.contextPath}/${loc_}${p}`);
    const wf = (id, key, loc_) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}&workflowMenuKey=${key}`, loc_);
    const awf = (id, key, loc_) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}&workflowMenuKey=${key}`, loc_);
    const mainKey = isOPS ? 'workflow_5' : 'workflow_4';
    const U = sc.users || {};
    const S = sc.subs || {};
    const who = (k) => (k === 'admin' ? 'admin' : U[k]);
    const signInAs = async (page, k) => { await signIn(page, who(k), {contextPath: sc.contextPath}); await idle(page); };

    // ---------------- seed ----------------
    if (on('seed')) {
        const t = tag('u37k1');
        const keys = isOPS
            ? [['mg', 'manager'], ['se', 'sectionEditor'], ['s2', 'sectionEditor'], ['au', 'author'], ['eb', 'editorialBoardMember']]
            : [['mg', 'manager'], ['ed', 'editor'], ['pe', 'productionEditor'], ['se', 'sectionEditor'], ['s2', 'sectionEditor'], ...(isOJS ? [['ge', 'guestEditor']] : []), ['ce', 'copyeditor'], ['au', 'author'], ['rv', 'externalReviewer'], ['r2', 'externalReviewer']];
        const names = {mg: ['Maya', 'Manager'], ed: ['Edda', 'Editor'], pe: ['Pete', 'Prodeditor'], se: ['Sam', 'Sectioned'], s2: ['Sue', 'Second'], ge: ['Gil', 'Guest'], ce: ['Cody', 'Copyed'], au: ['Ada', 'Author'], rv: ['Rex', 'Reviewer'], r2: ['Rhea', 'Declined'], eb: ['Ebo', 'Board']};
        const users = keys.map(([k, role]) => ({username: `${t}${k}`, roles: [role], givenName: names[k][0], familyName: names[k][1]}));
        const stage = isOPS ? 'production' : 'copyediting';
        const ctx = await app.api.createContext({
            tag: t,
            context: {name: `U37 K1 ${t}`, acronym: 'KONE', contactName: 'K1 Contact', contactEmail: `${t}c@mail.test`, supportedLocales: ['en', 'fr_CA']},
            users,
            taskTemplates: [
                {stage, title: 'K1 limited template', roles: [isOPS ? 'author' : 'copyeditor'], message: 'Limited template text.'},
                {stage, title: 'K1 auto task', type: 'task', dueInterval: 'P1W', include: true, message: 'Auto task text.'},
            ],
        });
        sc.tag = t; sc.contextPath = ctx.path || t; sc.users = Object.fromEntries(keys.map(([k]) => [k, `${t}${k}`])); sc.templates = ctx.taskTemplates;
        save();
        const u = sc.users;
        const part = (k, role) => ({username: u[k], role});
        const subs = {};
        const mk = async (k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, title: `K1 ${k} ${t}`, ...spec});
                subs[k] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, rounds: r.reviewRounds, ras: r.reviewAssignments, tasks: r.tasks};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'rounds', JSON.stringify(r.reviewRounds), 'tasks', JSON.stringify(r.tasks));
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 800)); subs[k] = {error: String(e.message).slice(0, 800)}; }
        };
        const D = (title, creator, parts, extra = {}) => ({title, creator: u[creator], participants: parts.map((p) => u[p]), message: `${title} first message.`, ...extra});
        const T = (title, creator, parts, owner, due, extra = {}) => D(title, creator, parts, {type: 'task', owner: u[owner], dateDue: day(due), ...extra});
        if (isOPS) {
            await mk('main', {participants: [part('se', 'sectionEditor'), part('s2', 'sectionEditor')], tasks: [
                D('K1 D1 all', 'mg', ['mg', 'se', 'au']),
                D('K1 D2 se-au', 'se', ['se', 'au']),
                D('K1 D5 s2-se', 's2', ['s2', 'se']),
                T('K1 T1 pending', 'mg', ['mg', 'se'], 'se', 10, {started: false}),
                T('K1 T2 started', 'se', ['se', 'au'], 'au', 12),
                T('K1 T3 overdue', 'mg', ['mg', 'se'], 'se', -2),
                T('K1 T4 due today', 'mg', ['mg', 'se'], 'se', 0),
                T('K1 T5 closeme', 'mg', ['mg', 'se'], 'se', -1),
                D('K1 D3 closeme', 'mg', ['mg', 'se']),
                T('K1 T6 pending overdue', 'mg', ['mg', 'se'], 'se', -3, {started: false}),
            ]});
        } else {
            await mk('main', {decisions: ['skipExternalReview'], participants: [part('se', 'sectionEditor'), part('s2', 'sectionEditor'), ...(isOJS ? [part('ge', 'guestEditor')] : []), part('ce', 'copyeditor')], tasks: [
                D('K1 D0 desk', 'mg', ['mg', 'se', 'au'], {stage: 'submission'}),
                D('K1 D1 all', 'mg', ['mg', 'se', 'ce', 'au']),
                D('K1 D2 se-ce', 'se', ['se', 'ce']),
                D('K1 D5 s2-se', 's2', ['s2', 'se']),
                ...(isOJS ? [D('K1 D4 ge-se', 'ge', ['ge', 'se'])] : []),
                T('K1 T1 pending', 'mg', ['mg', 'ce'], 'ce', 10, {started: false}),
                T('K1 T2 started', 'se', ['se', 'au'], 'au', 12),
                T('K1 T3 overdue', 'mg', ['mg', 'se'], 'se', -2),
                T('K1 T4 due today', 'mg', ['mg', 'se'], 'se', 0),
                T('K1 T5 closeme', 'mg', ['mg', 'ce'], 'ce', -1),
                D('K1 D3 closeme', 'mg', ['mg', 'se']),
                T('K1 T6 pending overdue', 'mg', ['mg', 'ce'], 'ce', -3, {started: false}),
            ]});
            await mk('rev', {decisions: ['sendExternalReview'], participants: [part('se', 'sectionEditor')],
                reviewRounds: [{reviewers: [{username: u.rv, status: 'accepted'}, {username: u.r2, status: 'declined'}]}],
                tasks: [D('K1 DR1 mg-se-rv', 'mg', ['mg', 'se', 'rv'], {stage: 'review'}), D('K1 DR2 se-au', 'se', ['se', 'au'], {stage: 'review'})]});
            await mk('prod', {decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se', 'sectionEditor')],
                tasks: [D('K1 DP1 mg-se', 'mg', ['mg', 'se'], {stage: 'production'})]});
            if (isOMP) await mk('irev', {decisions: ['sendInternalReview'], participants: [part('se', 'sectionEditor')], tasks: [D('K1 DI1 mg-se', 'mg', ['mg', 'se'], {stage: 'internalReview'})]});
        }
        sc.subs = subs; save();
        record('seed', sc);
        return;
    }
    if (!sc.contextPath) { log('[no state: run PHASES=seed first]'); return; }

    async function openPanel(page, url, label, {extra} = {}) {
        await page.goto(url); await idle(page);
        await page.locator('[data-cy="discussion-manager"]').first().waitFor({timeout: 25000}).catch(() => {});
        await page.waitForFunction(() => { const p = document.querySelector('[data-cy="discussion-manager"]'); return p && !/Loading/.test(p.innerText); }, null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const panels = await panelsRead(page).catch((e) => ({error: String(e.message)}));
        const s = await snap(page, label, {panels, ...(extra || {})});
        const p0 = Array.isArray(panels) ? panels : [];
        log(`[${label}]`, page.url().replace(/^.*\/index\.php/, '').slice(0, 110), '|', p0.map((p) => `${p.heading} :: ${(p.rows || []).map((r) => r.groupHeading ? `#${r.groupHeading}` : r.empty ? '(empty)' : (r.cells ? r.cells[0].lines.slice(1).join('/') : '')).join(' ; ')}`).join(' || ') || flat(s.text && (s.text.dialog || s.text.main), 300));
        return p0;
    }
    const panel = (page) => page.locator('[data-cy="discussion-manager"]:visible').first();
    const rowOf = (page, title) => panel(page).locator('tbody tr').filter({hasText: title}).first();

    async function menuOf(page, title) {
        const row = rowOf(page, title);
        const btn = row.getByRole('button', {name: 'More Actions'});
        if (!(await btn.count())) return null;
        await btn.click(); await page.waitForTimeout(300);
        const items = await menuItems(page);
        await btn.click().catch(() => {}); await page.waitForTimeout(250);
        if (await page.locator('[role="menuitem"]:visible').count()) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(200); }
        return items;
    }
    async function allMenus(page, label) {
        const titles = await panel(page).locator('[id^="discussion_name_"]').allInnerTexts();
        const out = {};
        for (const tt of titles) out[tt.trim()] = await menuOf(page, tt.trim());
        record(`${label}-menus`, out);
        log(`[${label} menus]`, JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k.replace(/^K1 /, ''), v ? v.map((x) => x.text + (x.disabled ? '(off)' : '')).join(',') : '-']))));
        return out;
    }
    async function winRead(page) {
        return page.evaluate(() => {
            const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const d = [...document.querySelectorAll('[role=dialog]')].filter(vis).pop();
            if (!d) return null;
            const cbs = [...d.querySelectorAll('input[type=checkbox], input[type=radio]')].map((c) => ({type: c.type, label: (c.closest('label') || {}).innerText?.trim() || (c.getAttribute('aria-labelledby') || '').split(' ').map((id) => (document.getElementById(id) || {}).innerText || '').join(' ').trim(), checked: c.checked, disabled: c.disabled}));
            return {
                text: d.innerText.slice(0, 6000),
                heading: (d.querySelector('h1, h2') || {}).innerText || null,
                buttons: [...d.querySelectorAll('button')].filter(vis).map((b) => ({name: (b.getAttribute('aria-label') || b.innerText || '').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})).filter((b) => b.name),
                boxes: cbs,
                badges: [...d.querySelectorAll('[class*="badge"], [class*="Badge"], span.rounded-full, span[class*="rounded"]')].filter(vis).map((b) => b.innerText.trim()).filter((x) => x && x.length < 40).slice(0, 10),
            };
        });
    }
    async function waitWin(page, re) {
        await page.waitForFunction((src) => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && new RegExp(src).test(d.innerText) && !/Loading/.test(d.innerText); }, re.source, {timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(400);
    }
    async function openItem(page, title, label) {
        await panel(page).getByRole('button', {name: title, exact: true}).first().click();
        await waitWin(page, /Message from|Add New Message|assign yourself/);
        const w = await winRead(page);
        await snap(page, label, {win: w});
        log(`[${label}]`, flat(w && w.text, 700));
        return w;
    }
    async function closeWin(page) {
        const top = topWin(page);
        const c = top.getByRole('button', {name: 'Close', exact: true}).first();
        if (await c.count()) await c.click({timeout: 5000}).catch(() => {});
        else await top.getByRole('button', {name: 'Cancel', exact: true}).last().click({timeout: 5000}).catch(() => {});
        await page.waitForTimeout(700); await idle(page);
    }
    async function history(page, title, label) {
        const row = rowOf(page, title);
        await row.getByRole('button', {name: 'More Actions'}).click(); await page.waitForTimeout(300);
        await page.getByRole('menuitem', {name: 'History'}).click();
        await waitWin(page, /History|created/);
        const w = await winRead(page);
        await snap(page, label, {win: w});
        log(`[${label}]`, flat(w && w.text, 900));
        await closeWin(page);
        return w;
    }
    // Tick a row's "Started" or "Closed" box and answer the confirmation.
    async function tickBox(page, title, col, answer, label) {
        const row = rowOf(page, title);
        const idx = col === 'Started' ? 3 : 4;
        const cell = row.locator('td').nth(idx);
        const input = cell.locator('input[type=checkbox]');
        const before = await input.evaluate((c) => ({checked: c.checked, disabled: c.disabled})).catch(() => null);
        if (!before || before.disabled) { log(`[${label}] box`, JSON.stringify(before)); return {before}; }
        await cell.locator('label').click();
        await page.waitForTimeout(500);
        const dlg = page.getByRole('dialog').filter({hasText: /\?/}).last();
        const d = await dlg.innerText().catch(() => null);
        const dbuttons = await dlg.getByRole('button').allInnerTexts().catch(() => []);
        await snap(page, `${label}-confirm`, {dialogText: d, dbuttons});
        const resp = page.waitForResponse((r) => /\/tasks\/\d+\/(close|open|start)/.test(r.url()), {timeout: 15000}).catch(() => null);
        await dlg.getByRole('button', {name: answer, exact: true}).click();
        const r = await resp;
        await idle(page); await page.waitForTimeout(800); await idle(page);
        const out = {before, dialogText: d, dbuttons, response: r ? {status: r.status(), url: r.url().replace(/^.*\/api\/v1/, '')} : null};
        log(`[${label}]`, JSON.stringify(out));
        return out;
    }

    const mainOf = () => S.main;
    // ---------------- heads: each stage's panel (manager) ----------------
    if (on('heads')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, 'mg');
            if (isOPS) {
                await openPanel(page, wf(S.main.id, 'workflow_5'), 'heads-mg-production');
                await openPanel(page, wf(S.main.id, 'workflow_1'), 'heads-mg-typed-workflow1');
            } else {
                await openPanel(page, wf(S.main.id, 'workflow_1'), 'heads-mg-submission');
                const rr = S.rev.rounds[0];
                await openPanel(page, wf(S.rev.id, `workflow_${rr.stageId}_${rr.id}`), 'heads-mg-review');
                await openPanel(page, wf(S.main.id, 'workflow_4'), 'heads-mg-copyediting');
                await openPanel(page, wf(S.prod.id, 'workflow_5'), 'heads-mg-production');
                if (isOMP) {
                    const ir = S.irev.rounds[0];
                    await openPanel(page, wf(S.irev.id, `workflow_${ir.stageId}_${ir.id}`), 'heads-mg-internal');
                }
            }
            await loc(page, 'discussion panel', page.locator('[data-cy="discussion-manager"]'));
            await loc(page, 'panel "Add"', panel(page).getByRole('button', {name: 'Add', exact: true}));
        } finally { await close(); }
    }

    // ---------------- roles: the main panel as every account ----------------
    if (on('roles')) {
        const roleList = isOPS ? ['admin', 'mg', 'se', 's2', 'au', 'eb'] : ['admin', 'mg', 'ed', 'pe', 'se', 's2', ...(isOJS ? ['ge'] : []), 'ce', 'au'];
        const opens = isOPS
            ? {mg: ['K1 D2 se-au', 'K1 T1 pending', 'K1 T3 overdue', 'K1 T2 started'], admin: ['K1 D2 se-au'], se: ['K1 D1 all', 'K1 T1 pending', 'K1 D5 s2-se'], s2: ['K1 D5 s2-se'], au: ['K1 T2 started', 'K1 D1 all']}
            : {mg: ['K1 D2 se-ce', 'K1 T1 pending', 'K1 T3 overdue', 'K1 T2 started', 'K1 T4 due today'], admin: ['K1 D2 se-ce'], ed: ['K1 D2 se-ce'], pe: ['K1 D2 se-ce'], se: ['K1 D1 all', 'K1 T3 overdue', 'K1 D2 se-ce', 'K1 T1 pending'], s2: ['K1 D5 s2-se'], ge: ['K1 D4 ge-se'], ce: ['K1 T1 pending', 'K1 D1 all'], au: ['K1 T2 started', 'K1 D1 all']};
        for (const k of (process.env.ROLES ? process.env.ROLES.split(',') : roleList)) {
            const {page, close} = await launch(app);
            try {
                await sect(`roles ${k}`, async () => {
                    await signInAs(page, k);
                    const url = k === 'au' ? awf(S.main.id, isOPS ? `publication_${S.main.publicationId}_discussions` : mainKey) : wf(S.main.id, mainKey);
                    const p = await openPanel(page, url, `roles-${k}-main`);
                    if (!p.length) return;
                    await allMenus(page, `roles-${k}-main`);
                    for (const tt of (opens[k] || [])) {
                        if (!(await panel(page).getByRole('button', {name: tt, exact: true}).count())) { log(`[roles ${k}] no row ${tt}`); continue; }
                        await openItem(page, tt, `roles-${k}-win-${tt.split(' ')[1]}`);
                        await closeWin(page);
                    }
                });
                if (!isOPS && k === 'ce') {
                    await sect('roles ce submission', async () => { await openPanel(page, wf(S.main.id, 'workflow_1'), 'roles-ce-submission'); });
                }
                if (k === 'au' && !isOPS) {
                    await sect('roles au submission', async () => { await openPanel(page, awf(S.main.id, 'workflow_1'), 'roles-au-submission'); });
                }
                if (isOPS && k === 'au') {
                    await sect('roles au editorial url', async () => { await openPanel(page, wf(S.main.id, 'workflow_5'), 'roles-au-editorial-url'); });
                }
            } finally { await close(); }
        }
    }

    // ---------------- parts: the participants of a window its reader is not in, read over time ----------------
    if (on('parts')) {
        for (const k of (process.env.ROLES ? process.env.ROLES.split(',') : ['mg', 'ed'])) {
            const {page, close} = await launch(app);
            try {
                await sect(`parts ${k}`, async () => {
                    await signInAs(page, k);
                    const item = isOPS ? 'K1 D2 se-au' : 'K1 D2 se-ce';
                    // 0: first window after a fresh load; 1: after another window was opened; 2: a fresh load again
                    for (const i of [0, 1, 2]) {
                        await openPanel(page, wf(S.main.id, mainKey), `parts-${k}-panel-${i}`);
                        if (i === 1) { await openItem(page, 'K1 D1 all', `parts-${k}-win-D1-before`); await closeWin(page); }
                        await panel(page).getByRole('button', {name: item, exact: true}).first().click();
                        const reads = [];
                        for (const ms of [500, 2000, 6000]) {
                            await page.waitForTimeout(ms);
                            const txt = await topWin(page).innerText().catch(() => '');
                            const m = txt.match(/Participants\n([\s\S]*?)\nTask Information/);
                            reads.push({afterMs: ms, participants: m ? m[1] : null});
                        }
                        await snap(page, `parts-${k}-win-${i}`, {reads});
                        log(`[parts ${k} ${i}]`, JSON.stringify(reads));
                        await closeWin(page);
                    }
                });
            } finally { await close(); }
        }
    }

    // ---------------- add: the "Add" window per account ----------------
    async function addWindow(page, label, {leave = true} = {}) {
        await panel(page).getByRole('button', {name: 'Add', exact: true}).click();
        await waitWin(page, /Participants/);
        await page.waitForTimeout(800); await idle(page);
        const w = await winRead(page);
        const tpl = await topWin(page).evaluate((d) => {
            const h = [...d.querySelectorAll('*')].find((e) => /Templates to get you started/.test(e.textContent) && e.children.length === 0);
            const box = h ? h.closest('fieldset, section, div') : null;
            return box ? [...(box.parentElement || box).querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean) : null;
        }).catch(() => null);
        await snap(page, `${label}-window`, {win: w, templates: tpl});
        log(`[${label} window]`, 'templates:', JSON.stringify(tpl), '|', flat(w && w.text, 500));
        // "Attach Files" in the message box's toolbar
        const att = topWin(page).getByRole('button', {name: 'Attach Files'}).first();
        await loc(page, `${label}: "Attach Files"`, att);
        if (await att.count()) {
            await att.click(); await page.waitForTimeout(800); await idle(page);
            const a = await winRead(page);
            await snap(page, `${label}-attach`, {win: a});
            log(`[${label} attach]`, flat(a && a.text, 500), JSON.stringify((a && a.buttons || []).map((b) => b.name)));
            const x = topWin(page).getByRole('button', {name: /^(Close|Cancel)$/}).last();
            await x.click({timeout: 5000}).catch(() => {}); await page.waitForTimeout(700); await idle(page);
        }
        if (leave) {
            // leave once with something changed: a typed name, then the close control
            const name = topWin(page).locator('input[name="title"]');
            if (await name.count()) await name.fill('K1 unsaved name');
            let dlgMsg = null;
            page.once('dialog', async (d) => { dlgMsg = `${d.type()}: ${d.message()}`; await d.dismiss().catch(() => {}); });
            await topWin(page).getByRole('button', {name: 'Close', exact: true}).first().click({timeout: 5000}).catch(() => {});
            await page.waitForTimeout(800);
            const after = await winRead(page);
            await snap(page, `${label}-leave`, {browserDialog: dlgMsg, win: after});
            log(`[${label} leave]`, dlgMsg, '|', flat(after && after.text, 300));
            // answer a confirmation if one is up, keeping the typing out
            const yes = topWin(page).getByRole('button', {name: /^(Yes|OK|Discard|Leave)$/});
            if (await yes.count()) { await yes.first().click().catch(() => {}); await page.waitForTimeout(700); }
            if (await topWin(page).locator('input[name="title"]').count()) await closeWin(page);
        }
        return {w, tpl};
    }
    if (on('add')) {
        const roleList = isOPS ? ['mg', 'se', 'au'] : ['mg', 'ed', 'se', 'ce', 'au'];
        for (const k of roleList) {
            const {page, close} = await launch(app);
            try {
                await sect(`add ${k}`, async () => {
                    await signInAs(page, k);
                    const url = k === 'au' ? awf(S.main.id, isOPS ? `publication_${S.main.publicationId}_discussions` : mainKey) : wf(S.main.id, mainKey);
                    await openPanel(page, url, `add-${k}-panel`);
                    await addWindow(page, `add-${k}`);
                });
            } finally { await close(); }
        }
    }

    // ---------------- reply: se replies on D1 today ----------------
    if (on('reply')) {
        const {page, close} = await launch(app);
        try {
            await sect('reply', async () => {
                await signInAs(page, 'mg');
                await openPanel(page, wf(S.main.id, mainKey), 'reply-mg-before');
                await signInAs(page, 'se');
                await openPanel(page, wf(S.main.id, mainKey), 'reply-se-before');
                await openItem(page, 'K1 D1 all', 'reply-se-win');
                await topWin(page).getByRole('button', {name: 'Add New Message'}).click();
                await page.waitForTimeout(800);
                const fr = topWin(page).frameLocator('iframe').last().locator('body');
                await fr.click(); await fr.fill(`K1 reply by se ${sc.tag}`);
                const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /\/tasks\/\d+\/notes/.test(r.url()) || (r.request().method() === 'POST' && /\/notes/.test(r.url())), {timeout: 20000}).catch(() => null);
                await topWin(page).getByRole('button', {name: 'Save', exact: true}).click();
                const r = await resp;
                log('[reply save]', r ? `${r.status()} ${r.url().replace(/^.*\/api\/v1/, '')}` : 'no response');
                await page.waitForTimeout(1500); await idle(page);
                await snap(page, 'reply-se-after-save', {win: await winRead(page)});
                if (await topWin(page).getByText('Message from').count()) await closeWin(page);
                await openPanel(page, wf(S.main.id, mainKey), 'reply-se-after');
                await signInAs(page, 'mg');
                await openPanel(page, wf(S.main.id, mainKey), 'reply-mg-after');
                await history(page, 'K1 D1 all', 'reply-mg-history-D1');
                // mail
                const mail = {};
                const subj = 'K1 D1 all';
                for (const k of (isOPS ? ['mg', 'se', 'au'] : ['mg', 'se', 'ce', 'au'])) {
                    const to = `${U[k]}@mail.test`;
                    try { await app.mail.find({to, contains: `K1 reply by se`, timeoutMs: k === 'mg' ? 20000 : 6000}); } catch (e) { /* counted below */ }
                    mail[k] = {count: await app.mail.count({to}), withReply: await app.mail.count({to, contains: 'K1 reply by se'}), subjects: ((await app.mail._search({to})).messages || []).map((m) => m.Subject).slice(0, 5)};
                }
                record('reply-mail', mail);
                log('[reply mail]', JSON.stringify(mail));
                // ce's header
                await signInAs(page, isOPS ? 'au' : 'ce');
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                await snap(page, `reply-${isOPS ? 'au' : 'ce'}-header`);
            });
        } finally { await close(); }
    }

    // ---------------- states: close D3 and T5, start T1 ----------------
    if (on('states')) {
        const {page, close} = await launch(app);
        try {
            await sect('states', async () => {
                const owner = isOPS ? 'se' : 'ce';
                await signInAs(page, owner);
                await openPanel(page, wf(S.main.id, mainKey), `states-${owner}-before`);
                await tickBox(page, 'K1 T1 pending', 'Started', 'Yes', `states-${owner}-start-T1`);
                await openPanel(page, wf(S.main.id, mainKey), `states-${owner}-after-start`);
                await openItem(page, 'K1 T1 pending', `states-${owner}-win-T1-started`);
                await closeWin(page);
                await signInAs(page, 'mg');
                await openPanel(page, wf(S.main.id, mainKey), 'states-mg-before');
                await tickBox(page, 'K1 D3 closeme', 'Closed', 'Yes', 'states-mg-close-D3');
                await tickBox(page, 'K1 T5 closeme', 'Closed', 'Yes', 'states-mg-close-T5');
                await openPanel(page, wf(S.main.id, mainKey), 'states-mg-after');
                await allMenus(page, 'states-mg-after');
                await openItem(page, 'K1 D3 closeme', 'states-mg-win-D3-closed'); await closeWin(page);
                await openItem(page, 'K1 T5 closeme', 'states-mg-win-T5-closed'); await closeWin(page);
                await openItem(page, 'K1 T6 pending overdue', 'states-mg-win-T6'); await closeWin(page);
                await history(page, 'K1 T3 overdue', 'states-mg-history-T3');
                await history(page, 'K1 T5 closeme', 'states-mg-history-T5');
                // the closed discussion's box: reopen offered? answer "No"
                await tickBox(page, 'K1 D3 closeme', 'Closed', 'No', 'states-mg-reopen-D3-no');
                await tickBox(page, 'K1 T5 closeme', 'Closed', 'No', 'states-mg-reopen-T5');
                // the creator of the closed discussion (se) sees it
                await signInAs(page, 'se');
                await openPanel(page, wf(S.main.id, mainKey), 'states-se-after');
                await allMenus(page, 'states-se-after');
                // the "New" badge of the Add window
                await signInAs(page, 'mg');
                await openPanel(page, wf(S.main.id, mainKey), 'states-mg-add');
                await panel(page).getByRole('button', {name: 'Add', exact: true}).click();
                await waitWin(page, /Participants/);
                await snap(page, 'states-mg-add-window', {win: await winRead(page)});
                await closeWin(page);
            });
        } finally { await close(); }
    }

    // ---------------- order: two discussions added a second apart ----------------
    if (on('order')) {
        const {page, close} = await launch(app);
        try {
            await sect('order', async () => {
                await signInAs(page, 'mg');
                await openPanel(page, wf(S.main.id, mainKey), 'order-mg-before');
                for (const name of ['K1 Zeta added first', 'K1 Alpha added second']) {
                    await panel(page).getByRole('button', {name: 'Add', exact: true}).click();
                    await waitWin(page, /Participants/);
                    const w = topWin(page);
                    await w.locator('input[name="title"]').fill(name);
                    const box = w.getByRole('checkbox', {name: new RegExp(`\\(${U.se}\\)`)});
                    await box.waitFor({timeout: 20000}); await box.check();
                    const body = w.frameLocator('iframe').first().locator('body');
                    await body.click(); await body.fill(`${name} message.`);
                    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && /\/submissions\/\d+\/tasks$/.test(r.url()), {timeout: 30000}).catch(() => null);
                    await w.getByRole('button', {name: 'Save', exact: true}).click();
                    const r = await saved;
                    log(`[order ${name}]`, r ? r.status() : 'no response');
                    await page.waitForTimeout(1500); await idle(page);
                    await openPanel(page, wf(S.main.id, mainKey), `order-mg-after-${name.split(' ')[1].toLowerCase()}`);
                    await page.waitForTimeout(1200);
                }
            });
        } finally { await close(); }
    }

    // ---------------- rev: the reviewer's panel ----------------
    if (on('rev') && !isOPS) {
        const {page, close} = await launch(app);
        try {
            await sect('rev rv', async () => {
                await signInAs(page, 'rv');
                await page.goto(ctxUrl(`/reviewer/submission/${S.rev.id}`)); await idle(page);
                await page.waitForTimeout(800);
                await snap(page, 'rev-rv-step1', {panels: await panelsRead(page)});
                log('[rev rv step1] panels', (await panelsRead(page)).length);
                const sc1 = page.getByRole('button', {name: 'Save and continue'});
                if (await sc1.count()) { await sc1.click(); await idle(page); await page.waitForTimeout(1200); await idle(page); }
                await snap(page, 'rev-rv-step2', {panels: await panelsRead(page)});
                const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
                if (await c3.count()) { await c3.click(); await idle(page); await page.waitForTimeout(1500); await idle(page); }
                await page.locator('[data-cy="discussion-manager"]').first().waitFor({timeout: 20000}).catch(() => {});
                await idle(page);
                const p = await panelsRead(page);
                await snap(page, 'rev-rv-step3', {panels: p});
                log('[rev rv step3]', JSON.stringify(p).slice(0, 1200));
                await allMenus(page, 'rev-rv-step3');
                if (await panel(page).getByRole('button', {name: 'K1 DR1 mg-se-rv', exact: true}).count()) {
                    await openItem(page, 'K1 DR1 mg-se-rv', 'rev-rv-win-DR1');
                    await closeWin(page);
                }
                await addWindow(page, 'rev-rv-add');
            });
            await sect('rev r2', async () => {
                await signInAs(page, 'r2');
                await page.goto(ctxUrl(`/reviewer/submission/${S.rev.id}`)); await idle(page);
                await page.waitForTimeout(800);
                await snap(page, 'rev-r2-declined', {panels: await panelsRead(page)});
                await page.goto(ctxUrl(`/reviewer/submission/${S.rev.id}?step=3`)); await idle(page);
                await snap(page, 'rev-r2-declined-step3', {panels: await panelsRead(page)});
            });
            await sect('rev mg', async () => {
                await signInAs(page, 'mg');
                const rr = S.rev.rounds[0];
                await openPanel(page, wf(S.rev.id, `workflow_${rr.stageId}_${rr.id}`), 'rev-mg-panel');
                await openItem(page, 'K1 DR1 mg-se-rv', 'rev-mg-win-DR1');
                await closeWin(page);
                await history(page, 'K1 DR1 mg-se-rv', 'rev-mg-history-DR1');
                // "Edit" lists the participants with their roles
                const row = rowOf(page, 'K1 DR1 mg-se-rv');
                await row.getByRole('button', {name: 'More Actions'}).click(); await page.waitForTimeout(300);
                await page.getByRole('menuitem', {name: 'Edit'}).click();
                await waitWin(page, /Participants/); await page.waitForTimeout(1000); await idle(page);
                await snap(page, 'rev-mg-edit-DR1', {win: await winRead(page)});
                await closeWin(page);
            });
            await sect('rev au', async () => {
                await signInAs(page, 'au');
                const rr = S.rev.rounds[0];
                await openPanel(page, awf(S.rev.id, `workflow_${rr.stageId}_${rr.id}`), 'rev-au-panel');
                await openPanel(page, awf(S.rev.id, 'workflow_3'), 'rev-au-panel-stagekey');
            });
        } finally { await close(); }
    }

    // ---------------- a6: the owner of a task someone else wrote: "Edit" › "Save" (Actors row 5) ----------------
    if (on('a6')) {
        const owner = isOPS ? 'se' : 'ce';
        const {page, close} = await launch(app);
        try {
            await sect('a6', async () => {
                await signInAs(page, owner);
                await openPanel(page, wf(S.main.id, mainKey), `a6-${owner}-panel`);
                const row = rowOf(page, 'K1 T6 pending overdue');
                await row.getByRole('button', {name: 'More Actions'}).click(); await page.waitForTimeout(300);
                await page.getByRole('menuitem', {name: 'Edit'}).click();
                await waitWin(page, /Participants/); await page.waitForTimeout(1000); await idle(page);
                const w = topWin(page);
                await w.locator('input[name="title"]').fill('K1 T6 pending overdue (edited)');
                const resp = page.waitForResponse((r) => r.request().method() !== 'GET' && /\/tasks\/\d+$/.test(r.url()), {timeout: 20000}).catch(() => null);
                await w.getByRole('button', {name: 'Save', exact: true}).click();
                const r = await resp;
                await page.waitForTimeout(1200); await idle(page);
                const after = await winRead(page);
                await snap(page, `a6-${owner}-save`, {win: after, response: r ? {status: r.status(), url: r.url().replace(/^.*\/api\/v1/, '')} : null});
                log(`[a6 ${owner}]`, r ? r.status() : 'no response', '|', flat(after && after.text, 400));
            });
        } finally { await close(); }
    }

    // ---------------- pe: an assigned Production editor (OJS, OMP) ----------------
    if (on('pe') && !isOPS) {
        if (!S.pas) {
            const r = await app.api.createSubmission({tag: `${sc.tag}pas`, context: sc.contextPath, submitter: U.au, title: `K1 pas ${sc.tag}`, decisions: ['skipExternalReview'],
                participants: [{username: U.se, role: 'sectionEditor'}, {username: U.pe, role: 'productionEditor'}],
                tasks: [{title: 'K1 DPE mg-se', creator: U.mg, participants: [U.mg, U.se], message: 'K1 DPE first message.'}, {title: 'K1 DPE0 desk', creator: U.mg, participants: [U.mg, U.se], stage: 'submission'}]});
            S.pas = {id: r.submissionId, tasks: r.tasks}; sc.subs = S; save();
        }
        const {page, close} = await launch(app);
        try {
            await sect('pe assigned', async () => {
                await signInAs(page, 'pe');
                await openPanel(page, wf(S.pas.id, 'workflow_4'), 'pe-assigned-copyediting');
                await allMenus(page, 'pe-assigned-copyediting');
                await openPanel(page, wf(S.pas.id, 'workflow_1'), 'pe-assigned-submission');
            });
        } finally { await close(); }
    }

    // ---------------- cancel: a reviewer who replied, then "Cancel Reviewer" (OJS, OMP) ----------------
    if (on('cancel') && !isOPS) {
        if (!S.revc) {
            const r = await app.api.createSubmission({tag: `${sc.tag}rvc`, context: sc.contextPath, submitter: U.au, title: `K1 revc ${sc.tag}`, decisions: ['sendExternalReview'],
                participants: [{username: U.se, role: 'sectionEditor'}], reviewRounds: [{reviewers: [{username: U.rv, status: 'accepted'}]}],
                tasks: [{title: 'K1 DRC mg-se-rv', creator: U.mg, participants: [U.mg, U.se, U.rv], stage: 'review', message: 'K1 DRC first message.'}]});
            S.revc = {id: r.submissionId, rounds: r.reviewRounds, ras: r.reviewAssignments, tasks: r.tasks}; sc.subs = S; save();
        }
        const rr = S.revc.rounds[0];
        const {page, close} = await launch(app);
        try {
            await sect('cancel rv reply', async () => {
                await signInAs(page, 'rv');
                await page.goto(ctxUrl(`/reviewer/submission/${S.revc.id}`)); await idle(page);
                const sc1 = page.getByRole('button', {name: 'Save and continue'});
                if (await sc1.count()) { await sc1.click(); await idle(page); await page.waitForTimeout(1200); await idle(page); }
                const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
                if (await c3.count()) { await c3.click(); await idle(page); await page.waitForTimeout(1500); await idle(page); }
                await page.locator('[data-cy="discussion-manager"]').first().waitFor({timeout: 20000}).catch(() => {});
                await snap(page, 'cancel-rv-step3-before', {panels: await panelsRead(page)});
                await openItem(page, 'K1 DRC mg-se-rv', 'cancel-rv-win');
                await topWin(page).getByRole('button', {name: 'Add New Message'}).click();
                await page.waitForTimeout(800);
                const fr = topWin(page).frameLocator('iframe').last().locator('body');
                await fr.click(); await fr.fill(`K1 reply by rv ${sc.tag}`);
                const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /\/notes$/.test(r.url()), {timeout: 20000}).catch(() => null);
                await topWin(page).getByRole('button', {name: 'Save', exact: true}).click();
                const r = await resp;
                log('[cancel rv reply]', r ? `${r.status()} ${r.url().replace(/^.*\/api\/v1/, '')}` : 'no response');
                await page.waitForTimeout(1500); await idle(page);
            });
            await sect('cancel mg', async () => {
                await signInAs(page, 'mg');
                await openPanel(page, wf(S.revc.id, `workflow_${rr.stageId}_${rr.id}`), 'cancel-mg-before');
                await history(page, 'K1 DRC mg-se-rv', 'cancel-mg-history-before');
                await page.waitForTimeout(700);
                const row = page.getByRole('row').filter({hasText: 'Rex Reviewer'}).first();
                const more = row.getByRole('button', {name: /More Actions/}).first();
                await more.click(); await idle(page);
                const items = await menuItems(page);
                log('[cancel reviewer menu]', JSON.stringify(items.map((x) => x.text)));
                await page.getByRole('menuitem', {name: 'Cancel Reviewer', exact: true}).click(); await idle(page);
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 60; }, null, {timeout: 15000}).catch(() => {});
                await page.waitForFunction(() => { const ta = [...document.querySelectorAll('textarea')].pop(); const mce = window.tinyMCE || window.tinymce; return !ta || !!mce?.get(ta.id)?.initialized; }, null, {timeout: 20000}).catch(() => {});
                await idle(page);
                const dlg = topWin(page);
                await snap(page, 'cancel-mg-dialog');
                const btn = dlg.getByRole('button', {name: 'Cancel Reviewer', exact: true}).last();
                if (await btn.count()) await btn.click(); else await dlg.getByRole('button', {name: /^(OK|Yes|Confirm)$/}).last().click();
                await idle(page); await page.waitForTimeout(1200); await idle(page);
                await openPanel(page, wf(S.revc.id, `workflow_${rr.stageId}_${rr.id}`), 'cancel-mg-after');
                await openItem(page, 'K1 DRC mg-se-rv', 'cancel-mg-win-after'); await closeWin(page);
            });
            await sect('cancel rv after', async () => {
                await signInAs(page, 'rv');
                await page.goto(ctxUrl(`/reviewer/submission/${S.revc.id}`)); await idle(page);
                await page.waitForTimeout(1000); await idle(page);
                await snap(page, 'cancel-rv-after', {panels: await panelsRead(page)});
                await page.goto(ctxUrl(`/reviewer/submission/${S.revc.id}?step=3`)); await idle(page);
                await page.waitForTimeout(1000); await idle(page);
                await snap(page, 'cancel-rv-after-step3', {panels: await panelsRead(page)});
            });
        } finally { await close(); }
    }

    // ---------------- sys: an auto-added discussion on a second scratch context ----------------
    if (on('sys')) {
        if (!sc.sys) {
            const t2 = `${sc.tag}y`;
            const stage = isOPS ? 'production' : 'copyediting';
            const c = await app.api.createContext({tag: t2, context: {name: `U37 K1 sys ${t2}`, acronym: 'KSYS', contactName: 'K1 Contact', contactEmail: `${t2}c@mail.test`},
                users: [{username: `${t2}mg`, roles: ['manager']}, {username: `${t2}au`, roles: ['author']}],
                taskTemplates: [{stage, title: 'K1 auto discussion', include: true, message: 'Auto discussion text.'}]});
            const r = await app.api.createSubmission({tag: `${t2}s`, context: c.path || t2, submitter: `${t2}au`, title: `K1 sys ${t2}`, ...(isOPS ? {} : {decisions: ['skipExternalReview']})});
            sc.sys = {path: c.path || t2, id: r.submissionId, mg: `${t2}mg`, publicationId: r.publicationId}; save();
        }
        const {page, close} = await launch(app);
        try {
            await sect('sys', async () => {
                await signIn(page, sc.sys.mg, {contextPath: sc.sys.path}); await idle(page);
                const url = app.url(`/index.php/${sc.sys.path}/en/dashboard/editorial?workflowSubmissionId=${sc.sys.id}&workflowMenuKey=${mainKey}`);
                await openPanel(page, url, 'sys-mg-panel');
                await allMenus(page, 'sys-mg-panel');
                await openItem(page, 'K1 auto discussion', 'sys-mg-win'); await closeWin(page);
                await history(page, 'K1 auto discussion', 'sys-mg-history');
            });
        } finally { await close(); }
    }

    // ---------------- tpl: the template screen by role ----------------
    if (on('tpl')) {
        for (const k of (isOPS ? ['admin', 'mg', 'se'] : ['admin', 'mg', 'ed', 'se'])) {
            const {page, close} = await launch(app);
            try {
                await sect(`tpl ${k}`, async () => {
                    await signInAs(page, k);
                    await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
                    const tab = page.getByRole('tab', {name: 'Tasks and Discussions'});
                    const n = await tab.count();
                    if (n) { await tab.first().click(); await idle(page); await page.waitForTimeout(800); await idle(page); }
                    const s = await snap(page, `tpl-${k}`);
                    const add = page.getByRole('button', {name: /Add template/i});
                    log(`[tpl ${k}]`, 'tab', n, 'add', await add.count(), '|', flat(s.text && s.text.main, 400));
                });
            } finally { await close(); }
        }
    }

    // ---------------- fr: the interface in French ----------------
    if (on('fr')) {
        const {page, close} = await launch(app);
        try {
            await sect('fr mg', async () => {
                await signInAs(page, 'mg');
                await openPanel(page, wf(S.main.id, mainKey, 'fr_CA'), 'fr-mg-main');
                const first = panel(page).locator('[id^="discussion_name_"]').first();
                if (await first.count()) {
                    await first.click();
                    await waitWin(page, /##|Message|message/);
                    await snap(page, 'fr-mg-win', {win: await winRead(page)});
                    await closeWin(page);
                }
                await openPanel(page, wf(S.main.id, mainKey, 'fr_CA'), 'fr-mg-main-again'); // a closed side modal's shell swallows the next click: land afresh
                const addB = panel(page).locator('button').filter({hasText: /^\s*(Ajouter|Add)\s*$/}).first();
                if (await addB.count()) {
                    await addB.click(); await page.waitForTimeout(1500); await idle(page);
                    await snap(page, 'fr-mg-add', {win: await winRead(page)});
                    await closeWin(page);
                }
                await page.goto(ctxUrl('/dashboard/editorial', 'en')); await idle(page);
            });
            if (!isOPS) {
                await sect('fr heads', async () => {
                    await signInAs(page, 'mg');
                    await openPanel(page, wf(S.prod.id, 'workflow_5', 'fr_CA'), 'fr-mg-production');
                    await openPanel(page, wf(S.main.id, 'workflow_1', 'fr_CA'), 'fr-mg-submission');
                    await page.goto(ctxUrl('/dashboard/editorial', 'en')); await idle(page);
                });
                await sect('fr rv', async () => {
                    await signInAs(page, 'rv');
                    await page.goto(ctxUrl(`/reviewer/submission/${S.rev.id}?step=3`, 'fr_CA')); await idle(page);
                    await page.locator('[data-cy="discussion-manager"]').first().waitFor({timeout: 20000}).catch(() => {});
                    await idle(page);
                    await snap(page, 'fr-rv-step3', {panels: await panelsRead(page)});
                    await page.goto(ctxUrl('/dashboard/editorial', 'en')).catch(() => {}); await idle(page);
                });
            }
        } finally { await close(); }
    }

    // ---------------- author ----------------
    if (on('author') && isOPS) {
        const {page, close} = await launch(app);
        try {
            await sect('author ops', async () => {
                await signInAs(page, 'au');
                await page.goto(ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${S.main.id}`)); await idle(page);
                await page.waitForTimeout(1500); await idle(page);
                const s = await snap(page, 'author-au-landing');
                const menu = await page.locator('[role=dialog]:visible nav a, [role=dialog]:visible nav button').allInnerTexts().catch(() => []);
                record('author-au-menu', {menu});
                log('[author au menu]', JSON.stringify(menu));
                const link = page.getByRole('link', {name: 'Production Tasks & Discussions'}).or(page.getByRole('button', {name: 'Production Tasks & Discussions'})).first();
                await loc(page, 'OPS author menu "Production Tasks & Discussions"', link);
                if (await link.count()) { await link.click(); await idle(page); await page.waitForTimeout(1000); }
                await openPanel(page, page.url(), 'author-au-discussions-page');
            });
        } finally { await close(); }
    }
});
