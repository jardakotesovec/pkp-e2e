// U35 claim check, chunk K1: the Participants panel by role and stage on all
// three apps, who is listed, and the screenless sections. Purpose, Actors &
// permissions (Terms and the nine rows), Rule 1 (the panel), Rule 2 (one
// assignment, every stage of the role), Rule 3 (who is listed), the Coverage
// table, register A4 (a role ended) and OPS1 (the preprint server's manager
// role in "Assign Participant").
// Spec: docs/specs/U35-stage-participants.md lines 10–62, 88–119, 415–527, 559–570, 617–631.
//
// OJS/OMP: scratch context A with one account per role of the registry, plus
// context B holding one of A's copyeditors as a Layout Editor (a role held in
// another journal only). Submissions on A:
//   P1  at Production through review, every role assigned, two reviewers → the panel by role and stage, the menus, the windows' boxes
//   P3  in review, one reviewer invited, se assigned                    → Rule 3 (a pending reviewer is not listed)
//   P4  participants: [] (the Author's row alone)                        → the Author row removed by hand: the empty panel (t2)
//   P5  cx assigned as Copyeditor                                        → cx's Copyeditor role ended on Users & Roles (t3, A4)
//   P6  participants with a recommendOnly key                            → footnote s: "there is no recommendOnly key"
// OPS: a scratch server; Q1 with mod, mod2, eb, au2 and admin assigned (OPS1: mgr2 assigned through the window), Q2 for the empty panel.
// The seeded journal: the Roles grid and the ART section's editors as manager.maya (read-only).
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U35/K1/k1.js
//   PHASES=seed,roles,menus,windows,assign,rule3,extra,omp2,empty,ended,ops,seeded   (default all; later phases reuse k1-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'roles', 'menus', 'windows', 'assign', 'rule3', 'extra', 'omp2', 'empty', 'ended', 'ops', 'seeded'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const REFUSED = /The current role does not have access|do not have access|don't currently have access|sufficient privileges|not authorized/i;

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
        text: d.innerText.slice(0, 4000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 40),
    }))).catch(() => []);
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
// The Participants panel as data: where it sits in the workflow dialog, its heading and header buttons, every row's avatar,
// lines (name, role, the recommend-only line), its menu button's accessible name; or, absent, the dialog's headings and any refusal.
const panelInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const headings = [...root.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => h.innerText.trim()).filter(Boolean).slice(0, 30);
    const err = dlgs.map((d) => d.innerText).find((t) => /Error|does not have access|do not have access|don't currently have access/i.test(t));
    const pm = [...root.querySelectorAll('[data-cy="participant-manager"]')].filter(vis)[0];
    const lines = (dlgs[0] ? dlgs[0].innerText : '').split('\n').map((l) => l.trim()).filter(Boolean);
    const closeAt = lines.indexOf('Close');
    const header = dlgs[0] ? lines.slice(closeAt >= 0 ? closeAt + 1 : 0, (closeAt >= 0 ? closeAt + 1 : 0) + 5).join(' | ') : null;
    const base = {dialogCount: dlgs.length, headings, header, refusal: err ? err.replace(/\s+/g, ' ').slice(0, 300) : null, bodyStart: root.innerText.replace(/\s+/g, ' ').slice(0, 300)};
    if (!pm) return {present: false, ...base};
    const rr = root.getBoundingClientRect(); const r = pm.getBoundingClientRect();
    const h3 = pm.querySelector('h3');
    const topButtons = [...pm.querySelectorAll(':scope > div:first-child button')].filter(vis).map((b) => b.innerText.trim());
    const rows = [...pm.querySelectorAll(':scope > ul > li')].map((li) => {
        const avatar = li.querySelector('.rounded-full');
        const nameEl = li.querySelector('.text-base-bold');
        const col = li.querySelector('.flex-col');
        const btn = li.querySelector('button[aria-label]');
        return {
            text: li.innerText.trim().split('\n').map((x) => x.trim()).filter(Boolean).join(' | '),
            initials: avatar ? avatar.innerText.trim() : null,
            avatarCircle: avatar ? /rounded-full/.test(avatar.className) : false,
            nameWeight: nameEl ? getComputedStyle(nameEl).fontWeight : null,
            lines: col ? [...col.children].map((e) => e.innerText.trim()) : [],
            menuLabel: btn ? btn.getAttribute('aria-label') : null,
            buttons: [...li.querySelectorAll('button')].filter(vis).map((b) => b.getAttribute('aria-label') || b.innerText.trim()),
        };
    });
    const textBelowHeader = pm.innerText.replace(h3 ? h3.innerText : '', '').replace(/\s+/g, ' ').trim();
    return {present: true, ...base, heading: h3 ? h3.innerText.trim() : null, topButtons, rowCount: rows.length, rows,
        textBelowHeader: textBelowHeader.slice(0, 300), panelX: Math.round(r.x - rr.x), dialogWidth: Math.round(rr.width), inRightHalf: r.x - rr.x > rr.width / 2};
});
async function closeTop(page) {
    const top = topWin(page);
    const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
    if (await c.count()) { await c.click({timeout: 5000}).catch(() => {}); await idle(page); await page.waitForTimeout(500); }
    else { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
}
async function waitLegacyForm(page, selector) {
    await topWin(page).waitFor({timeout: 30000});
    await page.waitForFunction((sel) => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && (d.querySelector(sel) || /No changes can be made/.test(d.innerText)); }, selector, {timeout: 20000}).catch(() => {});
    await idle(page);
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const ctxUrl = (p, ctx) => app.url(`/index.php/${ctx || sc.contextPath}${p}`);
    const workflow = (id, stage) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}&workflowMenuKey=workflow_${stage}`);
    const authorWorkflow = (id, stage) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}&workflowMenuKey=workflow_${stage}`);
    const signInAs = async (page, u, ctx) => { await signIn(page, u, {contextPath: ctx || sc.contextPath}); await idle(page); };

    async function openWorkflow(page, url, label) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await panelInfo(page).catch((e) => ({error: String(e.message)}));
        await snap(page, label, {panel: info});
        log(`[${label}]`, app.name, info.present ? `panel: ${info.heading} [${(info.topButtons || []).join(',')}] right=${info.inRightHalf} rows=${info.rowCount}: ${JSON.stringify((info.rows || []).map((r) => r.lines.join('/')))}` : `NO PANEL; headings=${JSON.stringify(info.headings)}${info.refusal ? ' REFUSED: ' + flat(info.refusal, 100) : ''}`);
        return info;
    }
    // Every row's "…" menu: open, read the items, close by pressing the button again (Escape would close the workflow dialog).
    async function readRowMenus(page, label) {
        const rows = page.locator('[role="dialog"]:visible').first().locator('[data-cy="participant-manager"] > ul > li');
        const n = await rows.count(); const out = [];
        for (let i = 0; i < n; i++) {
            const li = rows.nth(i); const btn = li.locator('button[aria-label]').first();
            const text = flat(await li.innerText(), 120);
            if (!(await btn.count())) { out.push({row: text, noMenu: true}); continue; }
            const menuLabel = await btn.getAttribute('aria-label');
            if (i === 0) await loc(page, `${label}: first row's menu button`, btn);
            await btn.click(); await page.waitForTimeout(250);
            const items = await menuItems(page);
            out.push({row: text, menuLabel, items: items.map((x) => x.text + (x.disabled ? ' (disabled)' : ''))});
            await btn.click().catch(() => {}); await page.waitForTimeout(150);
            if (await page.locator('[role="menuitem"]:visible').count()) { await page.mouse.click(2, 2); await page.waitForTimeout(150); }
        }
        record(`${label}-menus`, out);
        log(`[${label}-menus]`, JSON.stringify(out.map((o) => `${o.row.split(' ')[0]} ${o.row.split(' ')[1] || ''}: ${o.noMenu ? '-' : o.items.join('/')}`)));
        return out;
    }
    // A row's menu entry pressed: the window or dialog it opens, recorded, then left by Cancel/Close.
    async function pressRowMenu(page, rowName, item, label, {confirm} = {}) {
        const rows = page.locator('[role="dialog"]:visible').first().locator('[data-cy="participant-manager"] > ul > li').filter({hasText: rowName});
        if (!(await rows.count())) { record(label, {absent: `no row ${rowName}`}); return null; }
        const btn = rows.first().locator('button[aria-label]').first();
        await btn.click(); await page.waitForTimeout(250);
        const mi = page.getByRole('menuitem', {name: new RegExp(`^${item}$`)}).first();
        if (!(await mi.count())) { record(label, {absent: `no "${item}" on ${rowName}`, items: (await menuItems(page)).map((x) => x.text)}); await btn.click().catch(() => {}); return null; }
        await mi.click(); await idle(page);
        if (item === 'Edit') await waitLegacyForm(page, 'input[name="recommendOnly"], input[name="canChangeMetadata"], form input[type=submit], form button[type=submit]');
        else if (item === 'Notify') await waitLegacyForm(page, 'select[name="template"], textarea[name="message"]');
        else await topWin(page).waitFor({timeout: 15000}).catch(() => {});
        await page.waitForTimeout(400);
        const dlgs = await dialogTexts(page);
        const top = dlgs[dlgs.length - 1] || null;
        const boxes = await topWin(page).locator('input[type=checkbox]').evaluateAll((els) => els.map((i) => ({name: i.name, checked: i.checked, visible: i.getClientRects().length > 0, label: (document.querySelector(`label[for="${i.id}"]`) || i.closest('label') || i.parentElement || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 120)}))).catch(() => []);
        const sections = await topWin(page).locator('.section, fieldset, .pkp_form .section').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 160))).catch(() => []);
        const out = {row: rowName, item, window: top ? {name: top.name, text: flat(top.text, 1200), buttons: top.buttons} : null, dialogCount: dlgs.length, boxes, sections};
        await snap(page, label, out);
        log(`[${label}]`, top ? `${top.name}: ${flat(top.text, 160)} | buttons ${JSON.stringify(top.buttons)} | boxes ${JSON.stringify(boxes.filter((b) => b.visible).map((b) => `${b.name}=${b.checked}`))}` : 'no window');
        if (confirm) {
            const ok = topWin(page).getByRole('button', {name: /^(OK|Confirm|Remove)$/}).last();
            await ok.click(); await idle(page); await page.waitForTimeout(1000); await idle(page);
            out.after = {dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)})), panel: await panelInfo(page)};
            record(`${label}-after`, out.after);
        } else {
            await closeTop(page);
            out.afterClose = {dialogs: (await dialogTexts(page)).map((d) => d.name)};
        }
        return out;
    }
    // The "Assign" button pressed: the "Assign Participant" window's group list; optionally a group and a user chosen and the boxes read.
    async function assignWindow(page, label, {group, user, keep, save: doSave} = {}) {
        const assign = page.locator('[role="dialog"]:visible').first().locator('[data-cy="participant-manager"]').getByRole('button', {name: /^Assign$/}).first();
        if (!(await assign.count())) { record(label, {absent: true}); log(`[${label}] no Assign`); return {absent: true}; }
        await loc(page, `${label}: Participants "Assign"`, assign);
        await assign.click(); await idle(page);
        const form = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        await form.waitFor({timeout: 30000}); await idle(page);
        const sel = form.locator('select[name="filterUserGroupId"]');
        const groups = await sel.locator('option').evaluateAll((els) => els.map((o) => o.text.trim()).filter(Boolean));
        const top = (await dialogTexts(page)).slice(-1)[0];
        const out = {title: top && top.name, groups, text: flat(top && top.text, 500)};
        if (group) {
            const has = groups.includes(group);
            out.groupChosen = has ? group : null;
            if (has) {
                await sel.selectOption({label: group}); await idle(page);
                const searchBox = form.locator('input[id^="namegrid-users-userselect-userselectgrid-"], input[name="name"]').first();
                await searchBox.fill(user || '');
                const submit = form.locator('form[id^="searchUserFilter"] button[id^="submitFormButton-"], form[id^="searchUserFilter"] button').first();
                if (await submit.count()) await submit.click(); else await searchBox.press('Enter');
                await idle(page); await page.waitForTimeout(600); await idle(page);
                out.users = await form.locator('input[name="userId"]').evaluateAll((els) => els.map((r) => ({value: r.value, row: (r.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 100)})));
                out.gridText = flat(await form.locator('[id^="grid-users-userselect"]').first().innerText().catch(() => ''), 400);
                if (user && out.users.length) {
                    const radio = form.locator('tr').filter({hasText: user}).locator('input[name="userId"]').first();
                    if (await radio.count()) { await radio.check(); await idle(page); await page.waitForTimeout(400); out.userChosen = user; }
                }
                out.boxes = await form.locator('input[type=checkbox]').evaluateAll((els) => els.map((i) => ({name: i.name, checked: i.checked, visible: i.getClientRects().length > 0, label: (document.querySelector(`label[for="${i.id}"]`) || i.closest('label') || i.parentElement || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 120)})));
                out.sectionTitles = await form.locator('.section_title, .section .label, .pkp_form .section > *:first-child').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                const tsel = form.locator('select[name="template"]');
                out.templates = (await tsel.count()) ? await tsel.locator('option').evaluateAll((els) => els.map((o) => o.text.trim())) : null;
            }
        }
        await snap(page, label, out);
        log(`[${label}]`, `groups ${JSON.stringify(groups)}${out.users ? ` | ${group} users ${JSON.stringify(out.users.map((u) => u.row))}` : ''}${out.boxes ? ` | boxes ${JSON.stringify(out.boxes.filter((b) => b.visible).map((b) => `${b.name}=${b.checked}`))}` : ''}`);
        if (doSave) {
            const ok = form.getByRole('button', {name: /^(OK|Save)$/}).last();
            await ok.click(); await idle(page); await page.waitForTimeout(1200); await idle(page);
            out.after = {dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)})), panel: await panelInfo(page)};
            record(`${label}-after`, out.after);
            log(`[${label}-after]`, JSON.stringify((out.after.panel.rows || []).map((r) => r.lines.join('/'))), JSON.stringify(out.after.dialogs.map((d) => d.name)));
        } else if (!keep) {
            await closeTop(page);
            out.afterClose = {dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 200)}))};
            record(`${label}-closed`, out.afterClose);
        }
        return out;
    }

    // ============================== OPS ==============================
    if (isOPS) {
        if (on('seed') && !sc.contextPath) await sect('seed', async () => {
            const t = tag('u35k1');
            const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['mgr2', 'manager', 'Max', 'Second'], ['mod', 'sectionEditor', 'Mo', 'Moderator'], ['mod2', 'sectionEditor', 'Rec', 'Recommender'], ['mod3', 'sectionEditor', 'Sol', 'Spare'], ['eb', 'editorialBoardMember', 'Eb', 'Board'], ['au', 'author', 'Ava', 'Author'], ['au2', 'author', 'Bo', 'Coauthor']];
            const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
            const ctx = await app.api.createContext({tag: t, context: {name: `U35 K1 ${t}`, acronym: 'U35K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
            sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`])); sc.users.admin = 'admin';
            sc.roleKeys = Object.fromEntries(roleUsers.map(([k, role]) => [k, role]));
            sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`])); sc.names.admin = 'Site Admin';
            const u = sc.users; const part = (k, role) => ({username: u[k], role: role || sc.roleKeys[k]});
            const seeds = {
                q1: {title: `K1 Q1 every role ${t}`, participants: [part('mod'), part('mod2'), part('eb'), part('au2'), part('admin', 'manager')]},
                q2: {title: `K1 Q2 nobody ${t}`, participants: []},
                q6: {title: `K1 Q6 recommendOnly key ${t}`, participants: [{username: u.mod, role: 'sectionEditor', recommendOnly: true}]},
            };
            sc.subs = {};
            for (const [k, spec] of Object.entries(seeds)) {
                try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, status: r.status}; log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId); }
                catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 500)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
            }
            save(); record('seed', sc);
        });
        const u = sc.users; const S = sc.subs || {}; const N = sc.names;
        if (!u) { log('[k1 ops] no state; run the seed phase first'); return; }
        const {page, close} = await launch(app);
        try {
            if (on('ops')) {
                // OPS1: the manager's "Assign" at Production lists the manager group; mgr2 assigned through it is listed like any participant.
                await sect('ops1', async () => {
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.q1.id, 5), 'q1-mgr-wf5-before');
                    await assignWindow(page, 'q1-mgr-assign-manager', {group: 'Preprint Server manager', user: 'Max', save: true});
                    await openWorkflow(page, workflow(S.q1.id, 5), 'q1-mgr-wf5');
                    await readRowMenus(page, 'q1-mgr-wf5');
                    // the sweep as the manager: each menu entry pressed once on a Moderator's row, then left
                    await pressRowMenu(page, N.mod, 'Edit', 'q1-mgr-edit-mod');
                    await pressRowMenu(page, N.mod, 'Notify', 'q1-mgr-notify-mod');
                    await pressRowMenu(page, N.mod, 'Login As', 'q1-mgr-loginas-mod');
                    await pressRowMenu(page, N.mod, 'Remove', 'q1-mgr-remove-mod');
                    await pressRowMenu(page, N.mgr2, 'Edit', 'q1-mgr-edit-mgr2');
                    await pressRowMenu(page, N.au2, 'Edit', 'q1-mgr-edit-au2');
                    // mod2 made recommend-only through "Edit" (the row's third line, Rule 1)
                    const rows = page.locator('[role="dialog"]:visible').first().locator('[data-cy="participant-manager"] > ul > li').filter({hasText: N.mod2});
                    await rows.first().locator('button[aria-label]').first().click(); await page.waitForTimeout(250);
                    await page.getByRole('menuitem', {name: /^Edit$/}).first().click(); await idle(page);
                    await waitLegacyForm(page, 'input[name="recommendOnly"]');
                    const box = topWin(page).locator('input[name="recommendOnly"]');
                    if (await box.count()) { await box.check(); await topWin(page).getByRole('button', {name: /^(OK|Save)$/}).last().click(); await idle(page); await page.waitForTimeout(1000); }
                    await openWorkflow(page, workflow(S.q1.id, 5), 'q1-mgr-wf5-mod2-recommend-only');
                    // the "Assign" group lists at the stage, then Cancel; Moderator list (mod assigned → absent, mod3 → offered)
                    await assignWindow(page, 'q1-mgr-assign-moderator-list', {group: 'Moderator'});
                    await assignWindow(page, 'q1-mgr-assign-manager-list', {group: 'Preprint Server manager'});
                    // the "Preprint" address of the panel: the workflow menu's other entries carry no panel
                    await openWorkflow(page, ctxUrl(`/dashboard/editorial?workflowSubmissionId=${S.q1.id}&workflowMenuKey=publication_${S.q1.id}_titleAbstract`), 'q1-mgr-publication-titleAbstract');
                });
                await sect('ops-roles', async () => {
                    for (const k of ['admin', 'mgr2', 'mod', 'mod2']) {
                        await signInAs(page, u[k]);
                        await openWorkflow(page, workflow(S.q1.id, 5), `q1-${k}-wf5`);
                        await readRowMenus(page, `q1-${k}-wf5`);
                        if (k === 'mod' || k === 'mod2') {
                            await pressRowMenu(page, N.mod2 === N[k] ? N.mod : N.mod2, 'Edit', `q1-${k}-edit-other-moderator`);
                            await pressRowMenu(page, N.mgr2, 'Edit', `q1-${k}-edit-mgr2`);
                            await pressRowMenu(page, N.au2, 'Edit', `q1-${k}-edit-au2`);
                            await pressRowMenu(page, N[k], 'Edit', `q1-${k}-edit-own`);
                            await assignWindow(page, `q1-${k}-assign-moderator`, {group: 'Moderator', user: 'Sol'});
                        }
                        if (k === 'admin') { await pressRowMenu(page, N.mgr2, 'Edit', 'q1-admin-edit-mgr2'); await pressRowMenu(page, N.mod, 'Login As', 'q1-admin-loginas-mod'); }
                    }
                    // the assistant-level Editorial Board Member (no stage) and the authors
                    await signInAs(page, u.eb);
                    await openWorkflow(page, workflow(S.q1.id, 5), 'q1-eb-wf5');
                    await snap(page, 'q1-eb-dashboard-landing');
                    await signInAs(page, u.au);
                    await openWorkflow(page, authorWorkflow(S.q1.id, 5), 'q1-au-author-wf5');
                    await openWorkflow(page, workflow(S.q1.id, 5), 'q1-au-editorial-wf5');
                    await signInAs(page, u.au2);
                    await openWorkflow(page, authorWorkflow(S.q1.id, 5), 'q1-au2-author-wf5');
                    await openWorkflow(page, workflow(S.q1.id, 5), 'q1-au2-editorial-wf5');
                    // the unassigned Moderator (mod3): the panel is not reached
                    await signInAs(page, u.mod3);
                    await openWorkflow(page, workflow(S.q1.id, 5), 'q1-mod3-unassigned-wf5');
                });
                await sect('ops-empty', async () => {
                    if (!S.q2 || !S.q2.id) return;
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.q2.id, 5), 'q2-mgr-wf5-before');
                    await pressRowMenu(page, N.au, 'Remove', 'q2-mgr-remove-author', {confirm: true});
                    await openWorkflow(page, workflow(S.q2.id, 5), 'q2-mgr-wf5-empty');
                    await assignWindow(page, 'q2-mgr-empty-assign');
                });
                await sect('ops-q6', async () => {
                    if (!S.q6 || !S.q6.id) { record('q6-recommendOnly-key', {seed: S.q6}); return; }
                    await signInAs(page, u.mgr);
                    await openWorkflow(page, workflow(S.q6.id, 5), 'q6-mgr-wf5-recommendOnly-key');
                });
            }
            if (on('seeded')) await sect('seeded', async () => {
                await signInAs(page, 'manager.maya', app.contextPath);
                await page.goto(ctxUrl('/management/settings/access', app.contextPath)); await idle(page);
                const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
                if (await rolesTab.count()) { await rolesTab.click(); await idle(page); }
                const m = await page.evaluate(() => {
                    const table = [...document.querySelectorAll('table')].find((t) => [...t.querySelectorAll('thead th')].some((th) => /Role Name/.test(th.innerText)));
                    if (!table) return null;
                    const cols = [...table.querySelectorAll('thead th')].map((th) => th.innerText.trim());
                    const rows = [...table.querySelectorAll('tbody tr.gridRow')].map((tr) => { const cells = [...tr.querySelectorAll('td')]; return {name: (cells[0] || {}).innerText?.trim().replace(/\s+/g, ' ').replace(/^Settings\s+/, ''), level: (cells[1] || {}).innerText?.trim(), boxes: cells.slice(2).map((td, i) => { const b = td.querySelector('input[type=checkbox]'); return b ? `${cols[i + 2]}${b.checked ? ' [x]' : ' [ ]'}${b.disabled ? ' (disabled)' : ''}` : null; }).filter(Boolean)}; });
                    return {cols, rows};
                });
                await snap(page, 'seeded-roles-grid', {matrix: m});
                log('[seeded-roles-grid]', JSON.stringify(m && m.rows.map((r) => `${r.name} (${r.level}): ${r.boxes.join(', ')}`)));
            });
        } finally { await close(); }
        return;
    }

    // ============================== OJS / OMP ==============================
    if (on('seed') && !sc.contextPath) await sect('seed', async () => {
        const t = tag('u35k1');
        const roleUsers = [
            ['mgr', ['manager'], 'Mira', 'Manager'], ['ed', ['editor'], 'Edda', 'Editor'], ['pe', ['productionEditor'], 'Pat', 'Production'],
            ['se', ['sectionEditor'], 'Sid', 'Section'], ['se2', ['sectionEditor'], 'Rec', 'Recommender'], ['se3', ['sectionEditor'], 'Sol', 'Spare'],
            ...(isOMP ? [] : [['ge', ['guestEditor'], 'Gus', 'Guest']]),
            ['ce', ['copyeditor'], 'Cora', 'Copyeditor'], ['ce2', ['copyeditor'], 'Cleo', 'Unassigned'], ['le', ['layoutEditor'], 'Leo', 'Layout'], ['pr', ['proofreader'], 'Pia', 'Proof'], ['fu', ['funding'], 'Fay', 'Funding'],
            ['dual', ['sectionEditor', 'copyeditor'], 'Dua', 'Twice'], ['rc', ['externalReviewer', 'copyeditor'], 'Rowan', 'Both'], ['rev', ['externalReviewer'], 'Ria', 'Reviewer'],
            ['au', ['author'], 'Ava', 'Author'], ['au2', ['author'], 'Bo', 'Coauthor'], ['cx', ['copyeditor', 'reader'], 'Cy', 'Ending'], ['xj', ['copyeditor'], 'Xen', 'Elsewhere'],
        ];
        const users = roleUsers.map(([k, roles, g, f]) => ({username: `${t}${k}`, roles, givenName: g, familyName: f}));
        users.push({username: 'admin', roles: ['productionEditor']});
        const ctx = await app.api.createContext({tag: t, context: {name: `U35 K1 ${t}`, acronym: 'U35K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`])); sc.users.admin = 'admin';
        sc.roleKeys = Object.fromEntries(roleUsers.map(([k, roles]) => [k, roles[0]]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`])); sc.names.admin = 'Site Admin';
        // context B: xj holds Layout Editor there and nothing else
        try { const b = await app.api.createContext({tag: `${t}b`, context: {name: `U35 K1 other ${t}`, acronym: 'U35K1B', contactName: 'K1 Contact', contactEmail: `${t}bcontact@mail.test`}, users: [{username: `${t}xj`, roles: ['layoutEditor']}]}); sc.contextB = b.path || `${t}b`; }
        catch (e) { sc.contextBError = String(e.message).slice(0, 400); log('[seed ctx B FAILED]', sc.contextBError); }
        const u = sc.users; const part = (k, role) => ({username: u[k], role: role || sc.roleKeys[k]});
        const viaReview = isOMP ? ['skipInternalReview', 'sendExternalReview', 'accept'] : ['sendExternalReview', 'accept'];
        const seeds = {
            p1: {title: `K1 P1 every role ${t}`, decisions: [...viaReview, 'sendToProduction'], reviewRounds: [{reviewers: [{username: u.rev, status: 'completed'}, {username: u.rc, status: 'completed'}]}],
                participants: [part('ed'), part('pe'), part('admin', 'productionEditor'), part('se'), part('se2'), ...(isOMP ? [] : [part('ge')]), part('dual', 'sectionEditor'), part('dual', 'copyeditor'), part('ce'), part('rc', 'copyeditor'), part('xj'), part('le'), part('pr'), part('fu'), part('au2')]},
            p3: {title: `K1 P3 in review ${t}`, decisions: isOMP ? ['skipInternalReview', 'sendExternalReview'] : ['sendExternalReview'], reviewRounds: [{reviewers: [{username: u.rev}]}], participants: [part('se')]},
            p4: {title: `K1 P4 nobody ${t}`, participants: []},
            p5: {title: `K1 P5 role ended ${t}`, participants: [part('cx')]},
            p6: {title: `K1 P6 recommendOnly key ${t}`, participants: [{username: u.se, role: 'sectionEditor', recommendOnly: true}]},
        };
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, status: r.status, rounds: r.reviewRounds || []}; log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'status', r.status); }
            catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 700)); sc.subs[k] = {error: String(e.message).slice(0, 700)}; }
        }
        save(); record('seed', sc);
    });
    const u = sc.users; const S = sc.subs || {}; const N = sc.names;
    if (!u || !S.p1 || !S.p1.id) { log('[k1] no state or no P1; run the seed phase first'); return; }
    const STAGES = isOMP ? [1, 2, 3, 4, 5] : [1, 3, 4, 5];
    const editorStages = STAGES;
    // the stages each role's group holds (registry/userGroups.xml), and one stage it does not (the other end)
    const ROLES = {
        admin: {stages: editorStages, home: 5}, mgr: {stages: editorStages, home: 5}, ed: {stages: editorStages, home: 5},
        pe: {stages: [4, 5], off: 1, home: 5}, se: {stages: editorStages, home: 5}, se2: {stages: editorStages, home: 5},
        ...(isOMP ? {} : {ge: {stages: editorStages, home: 5}}), dual: {stages: editorStages, home: 4},
        ce: {stages: [4], off: 5, home: 4}, xj: {stages: [4], home: 4}, rc: {stages: [4], off: 3, home: 4},
        le: {stages: [5], off: 4, home: 5}, pr: {stages: [5], home: 5}, fu: {stages: isOMP ? [1, 2, 3] : [1, 3], off: 4, home: 1},
    };

    const {page, close} = await launch(app);
    try {
        // ---- roles: P1's panel at every stage for every account; the recommend-only line on se2 first ----
        if (on('roles')) await sect('roles', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-mgr-wf5-before');
            // se2 recommend-only through "Edit" (its own probe is K3's; the row's line is Rule 1's)
            const rows = page.locator('[role="dialog"]:visible').first().locator('[data-cy="participant-manager"] > ul > li').filter({hasText: N.se2});
            await rows.first().locator('button[aria-label]').first().click(); await page.waitForTimeout(250);
            await page.getByRole('menuitem', {name: /^Edit$/}).first().click(); await idle(page);
            await waitLegacyForm(page, 'input[name="recommendOnly"]');
            const box = topWin(page).locator('input[name="recommendOnly"]');
            record('p1-mgr-edit-se2-form', {boxes: await topWin(page).locator('input[type=checkbox]').evaluateAll((els) => els.map((i) => ({name: i.name, checked: i.checked, visible: i.getClientRects().length > 0}))), text: flat((await dialogTexts(page)).slice(-1)[0]?.text, 600)});
            if (await box.count()) { await box.check(); await topWin(page).getByRole('button', {name: /^(OK|Save)$/}).last().click(); await idle(page); await page.waitForTimeout(1000); }
            record('p1-mgr-edit-se2-after', {dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))});
            for (const [k, r] of Object.entries(ROLES)) {
                await signInAs(page, u[k]);
                for (const st of r.stages) await openWorkflow(page, workflow(S.p1.id, st), `p1-${k}-wf${st}`);
                if (r.off) await openWorkflow(page, workflow(S.p1.id, r.off), `p1-${k}-wf${r.off}-off`);
            }
            // the accounts the spec says never see the panel: the reviewer (P1 completed), the unassigned copyeditor, the authors
            await signInAs(page, u.rev);
            await snap(page, 'p1-rev-landing');
            await openWorkflow(page, workflow(S.p1.id, 3), 'p1-rev-editorial-wf3');
            await openWorkflow(page, authorWorkflow(S.p1.id, 3), 'p1-rev-mysubmissions-wf3');
            await signInAs(page, u.ce2);
            await openWorkflow(page, workflow(S.p1.id, 4), 'p1-ce2-unassigned-wf4');
            await signInAs(page, u.se3);
            await openWorkflow(page, workflow(S.p1.id, 1), 'p1-se3-unassigned-wf1');
            await signInAs(page, u.au);
            for (const st of STAGES) await openWorkflow(page, authorWorkflow(S.p1.id, st), `p1-au-author-wf${st}`);
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-au-editorial-wf5');
            await signInAs(page, u.au2);
            await openWorkflow(page, authorWorkflow(S.p1.id, 5), 'p1-au2-author-wf5');
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-au2-editorial-wf5');
            // the unassigned manager-level accounts on P3 (nobody but se assigned): mgr and ed by role alone
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.p3.id, 3), 'p3-ed-unassigned-wf3');
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p3.id, 3), 'p3-mgr-unassigned-wf3');
        });
        // ---- menus: every row's "…" menu as every account, at the account's home stage ----
        if (on('menus')) await sect('menus', async () => {
            for (const [k, r] of Object.entries(ROLES)) {
                await signInAs(page, u[k]);
                await openWorkflow(page, workflow(S.p1.id, r.home), `p1-${k}-wf${r.home}-menus-page`);
                await readRowMenus(page, `p1-${k}-wf${r.home}`);
                if (k === 'dual') await openWorkflow(page, workflow(S.p1.id, 5), 'p1-dual-wf5-menus-page'), await readRowMenus(page, 'p1-dual-wf5');
            }
        });
        // ---- windows: each menu entry pressed once as the manager (the sweep), the "Edit" boxes by role and row ----
        if (on('windows')) await sect('windows', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-mgr-wf5-windows');
            await pressRowMenu(page, N.se, 'Edit', 'p1-mgr-edit-se');
            await pressRowMenu(page, N.le, 'Edit', 'p1-mgr-edit-le');
            await pressRowMenu(page, N.pe, 'Edit', 'p1-mgr-edit-pe');
            await pressRowMenu(page, N.au2, 'Edit', 'p1-mgr-edit-au2');
            await pressRowMenu(page, N.se, 'Notify', 'p1-mgr-notify-se');
            await pressRowMenu(page, N.se, 'Login As', 'p1-mgr-loginas-se');
            await pressRowMenu(page, N.se, 'Remove', 'p1-mgr-remove-se');
            for (const k of ['ed', 'pe', 'se', 'se2', ...(isOMP ? [] : ['ge'])]) {
                await signInAs(page, u[k]);
                await openWorkflow(page, workflow(S.p1.id, 5), `p1-${k}-wf5-windows`);
                const other = k === 'se' ? N.se2 : N.se;
                await pressRowMenu(page, other, 'Edit', `p1-${k}-edit-other-se`);
                await pressRowMenu(page, N.le, 'Edit', `p1-${k}-edit-le`);
                await pressRowMenu(page, N.pe, 'Edit', `p1-${k}-edit-pe`);
                await pressRowMenu(page, N[k], 'Edit', `p1-${k}-edit-own`);
                if (k === 'ed') await pressRowMenu(page, N.se, 'Login As', 'p1-ed-loginas-se');
            }
            await signInAs(page, u.admin);
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-admin-wf5-windows');
            await pressRowMenu(page, N.pe, 'Edit', 'p1-admin-edit-pe');
            await pressRowMenu(page, N.se, 'Login As', 'p1-admin-loginas-se');
        });
        // ---- assign: the "Assign Participant" window's group list per stage as the manager; the person lists; the boxes as mgr and se2 ----
        if (on('assign')) await sect('assign', async () => {
            await signInAs(page, u.mgr);
            for (const st of STAGES) {
                await openWorkflow(page, workflow(S.p1.id, st), `p1-mgr-wf${st}-assign-page`);
                await assignWindow(page, `p1-mgr-wf${st}-assign-groups`);
            }
            await openWorkflow(page, workflow(S.p1.id, 4), 'p1-mgr-wf4-assign-page-2');
            await assignWindow(page, 'p1-mgr-wf4-assign-copyeditor-list', {group: 'Copyeditor'});
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-mgr-wf5-assign-page-2');
            await assignWindow(page, 'p1-mgr-wf5-assign-layout-list', {group: 'Layout Editor'});
            await openWorkflow(page, workflow(S.p1.id, 1), 'p1-mgr-wf1-assign-page-2');
            await assignWindow(page, 'p1-mgr-wf1-assign-se-list', {group: isOMP ? 'Series editor' : 'Section editor'});
            await openWorkflow(page, workflow(S.p1.id, 1), 'p1-mgr-wf1-assign-page-3');
            await assignWindow(page, 'p1-mgr-wf1-assign-author-list', {group: 'Author'});
            // the boxes with a user chosen: the manager (both) and the recommend-only Section Editor (Rule 5c: no privileges box)
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-mgr-wf5-assign-page-3');
            await assignWindow(page, 'p1-mgr-wf5-assign-se3-boxes', {group: isOMP ? 'Series editor' : 'Section editor', user: 'Sol'});
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-mgr-wf5-assign-page-4');
            await assignWindow(page, 'p1-mgr-wf5-assign-ce2-boxes', {group: 'Layout Editor', user: 'Leo'});
            // the sweep: the window left by navigation with a group and a person chosen
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-mgr-wf5-assign-page-5');
            const dlg = [];
            page.on('dialog', async (d) => { dlg.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
            await assignWindow(page, 'p1-mgr-wf5-assign-leave', {group: isOMP ? 'Series editor' : 'Section editor', user: 'Sol', keep: true});
            await page.goto(ctxUrl('/dashboard/editorial')).catch((e) => dlg.push({gotoError: String(e.message).slice(0, 200)}));
            await idle(page); await page.waitForTimeout(500);
            await snap(page, 'p1-mgr-wf5-assign-leave-after', {browserDialogs: dlg, url: page.url()});
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-mgr-wf5-after-leave');
            await signInAs(page, u.se2);
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-se2-wf5-assign-page');
            await assignWindow(page, 'p1-se2-wf5-assign-se3-boxes', {group: isOMP ? 'Series editor' : 'Section editor', user: 'Sol'});
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-se2-wf5-assign-page-2');
            await assignWindow(page, 'p1-se2-wf5-assign-le-boxes', {group: 'Layout Editor', user: 'Leo'});
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.p1.id, 5), 'p1-se-wf5-assign-page');
            await assignWindow(page, 'p1-se-wf5-assign-se3-boxes', {group: isOMP ? 'Series editor' : 'Section editor', user: 'Sol'});
        });
        // ---- rule3: the pending reviewer on P3, the recommendOnly seed key on P6 ----
        if (on('rule3')) await sect('rule3', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p3.id, 3), 'p3-mgr-wf3');
            await openWorkflow(page, workflow(S.p3.id, 1), 'p3-mgr-wf1');
            if (S.p6 && S.p6.id) await openWorkflow(page, workflow(S.p6.id, 1), 'p6-mgr-wf1-recommendOnly-key');
            else record('p6-recommendOnly-key', {seed: S.p6});
        });
        // ---- extra: manager-level accounts and the stages of an assignment (P3: nobody but se assigned); "Login As" on a row whose user holds a role in context B ----
        if (on('extra')) await sect('extra', async () => {
            await signInAs(page, u.pe);
            await openWorkflow(page, workflow(S.p3.id, 4), 'p3-pe-unassigned-wf4');
            await openWorkflow(page, workflow(S.p3.id, 1), 'p3-pe-unassigned-wf1');
            await signInAs(page, u.admin);
            await openWorkflow(page, workflow(S.p3.id, 1), 'p3-admin-unassigned-wf1');
            await openWorkflow(page, workflow(S.p3.id, 3), 'p3-admin-unassigned-wf3');
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p3.id, 1), 'p3-mgr-unassigned-wf1');
            await openWorkflow(page, workflow(S.p1.id, 4), 'p3-mgr-wf4-menus-page');
            await readRowMenus(page, 'p1-mgr-wf4');
            // the manager assigned as Production editor on P3 through the window, then P3's Submission and Review entries as that manager
            await openWorkflow(page, workflow(S.p3.id, 4), 'p3-mgr-wf4-assign-page');
            await assignWindow(page, 'p3-mgr-wf4-assign-self-pe', {group: 'Production editor', user: 'Mira', save: true});
            await openWorkflow(page, workflow(S.p3.id, 1), 'p3-mgr-assigned-pe-wf1');
            await openWorkflow(page, workflow(S.p3.id, 3), 'p3-mgr-assigned-pe-wf3');
            await openWorkflow(page, workflow(S.p3.id, 4), 'p3-mgr-assigned-pe-wf4');
            await openWorkflow(page, ctxUrl('/dashboard/editorial?currentViewId=assigned-to-me'), 'p3-mgr-assigned-pe-dashboard');
        });
        // ---- omp2: a press's Internal Review entry once the stage has begun (P7 seeded sendInternalReview), against the skipped stage's entry on P1 ----
        if (isOMP && on('omp2')) await sect('omp2', async () => {
            if (!S.p7 || !S.p7.id) {
                try { const r = await app.api.createSubmission({tag: `${sc.tag}p7`, context: sc.contextPath, submitter: u.au, title: `K1 P7 internal review ${sc.tag}`, decisions: ['sendInternalReview'], participants: [{username: u.se, role: 'sectionEditor'}]}); S.p7 = {id: r.submissionId, title: `K1 P7 internal review ${sc.tag}`, stageId: r.stageId, rounds: r.reviewRounds || []}; sc.subs = S; save(); log('[seed p7]', r.submissionId, 'stage', r.stageId); }
                catch (e) { log('[seed p7 FAILED]', String(e.message).slice(0, 500)); record('p7-seed-FAILED', {error: String(e.message).slice(0, 600)}); return; }
            }
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p7.id, 2), 'p7-mgr-wf2-internal-review');
            await assignWindow(page, 'p7-mgr-wf2-assign-groups');
            await openWorkflow(page, workflow(S.p7.id, 3), 'p7-mgr-wf3-not-begun');
            await openWorkflow(page, workflow(S.p7.id, 1), 'p7-mgr-wf1');
            // the ROUND entry of the internal review (workflow_2_<roundId>): the panel is mounted there only (workflowConfigEditorialOMP.js getSecondaryItems needs selectedReviewRound)
            const round = (S.p7.rounds || [])[0];
            if (round) {
                await openWorkflow(page, workflow(S.p7.id, `2_${round.id}`), 'p7-mgr-wf2-round-entry');
                await assignWindow(page, 'p7-mgr-wf2-round-assign-groups');
                await readRowMenus(page, 'p7-mgr-wf2-round');
            }
            const p1round = (S.p1.rounds || [])[0];
            if (p1round) await openWorkflow(page, workflow(S.p1.id, `3_${p1round.id}`), 'p1-mgr-wf3-round-entry');
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.p7.id, 2), 'p7-se-wf2-internal-review');
            await readRowMenus(page, 'p7-se-wf2');
            if (round) { await openWorkflow(page, workflow(S.p7.id, `2_${round.id}`), 'p7-se-wf2-round-entry'); await readRowMenus(page, 'p7-se-wf2-round'); }
        });
        // ---- empty: P4's Author row removed by hand, then every stage's panel ----
        if (on('empty')) await sect('empty', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p4.id, 1), 'p4-mgr-wf1-before');
            await pressRowMenu(page, N.au, 'Remove', 'p4-mgr-remove-author', {confirm: true});
            for (const st of STAGES) await openWorkflow(page, workflow(S.p4.id, st), `p4-mgr-wf${st}-empty`);
            await assignWindow(page, 'p4-mgr-empty-assign');
        });
        // ---- ended: cx's Copyeditor role ended on Users & Roles, then P5's Copyediting panel and its "Assign" ----
        if (on('ended')) await sect('ended', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.p5.id, 4), 'p5-mgr-wf4-before');
            await page.goto(ctxUrl('/management/settings/access')); await idle(page);
            const table = page.locator('table').filter({hasText: u.cx}).first();
            await table.waitFor({state: 'visible', timeout: 20000}).catch(() => {});
            const row = table.locator('tr').filter({hasText: u.cx}).first();
            const out = {rowBefore: flat(await row.innerText().catch(() => ''), 200)};
            await row.locator('button').last().click(); await idle(page);
            out.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
            await page.getByRole('menuitem', {name: /^Edit$/}).first().click();
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 20000}).catch(() => {});
            await idle(page);
            await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15000}).catch(() => {});
            out.editUrl = page.url();
            out.roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
            await snap(page, 'p5-mgr-cx-edit-page', out);
            const roleRow = page.locator('tr').filter({hasText: /Copyeditor/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
            if (await roleRow.count()) {
                await roleRow.getByRole('button', {name: /Remove Role/i}).click(); await idle(page);
                const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
                await dlg.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
                out.removeRoleDialog = flat(await dlg.innerText().catch(() => ''), 400);
                await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
                await idle(page); await page.waitForTimeout(1500);
                out.roleRowsAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
                await snap(page, 'p5-mgr-cx-edit-page-after', out);
            }
            log('[ended]', JSON.stringify(out).slice(0, 600));
            await openWorkflow(page, workflow(S.p5.id, 4), 'p5-mgr-wf4-after-role-ended');
            await readRowMenus(page, 'p5-mgr-wf4-after-role-ended');
            await assignWindow(page, 'p5-mgr-wf4-assign-copyeditor-after-ended', {group: 'Copyeditor', user: 'Cy'});
            await openWorkflow(page, workflow(S.p5.id, 1), 'p5-mgr-wf1-after-role-ended');
            await signInAs(page, u.cx);
            await snap(page, 'p5-cx-landing');
            await openWorkflow(page, workflow(S.p5.id, 4), 'p5-cx-wf4-after-role-ended');
        });
        // ---- notes: what this chunk learned, appended once to the feature's screen-notes (run with PHASES=notes on one app) ----
        if (on('notes')) {
            note('ccK1 · Participants panel: [data-cy="participant-manager"] inside the workflow dialog, h3 "Participants" (CSS-uppercased), header buttons in its first child div ("Assign" for admin/manager/editor-level, none for assistants), rows are `> ul > li` each with a .rounded-full avatar (initials), .text-base-bold name, .flex-col lines [name, role, optional "Only allowed to recommend an editorial decision"], and one button aria-label "<Given Family> More Actions" (headlessui: items role=menuitem at the document root; close the menu by pressing the button again, Escape closes the workflow dialog). A user in two roles has two rows with the same button name: iterate the li elements, never getByRole by name.');
            note('ccK1 · The panel sits on every stage entry (workflow_1/3/4/5) whether or not the stage has begun, EXCEPT a press\'s Internal Review: workflow_2 (the stage entry) shows the round\'s files, Reviewers and discussions but no Participants panel and no "Assign", live or skipped; the panel is on the ROUND entry workflow_2_<roundId> only (workflowConfigEditorialOMP.js getSecondaryItems returns [] without selectedReviewRound). Read a press\'s internal-review participants at workflow_2_<roundId>.');
            note('ccK1 · Refusals seen from the panel drives: a role ASSIGNED on the submission whose group lacks the stage (Copyeditor at Production, Funding coordinator at Copyediting, Production editor at Submission, and a Site Admin/manager ASSIGNED as Production editor at Submission/Review) gets the workflow dialog with "You don\'t currently have access to that stage of the workflow." and no panel; an unassigned Section editor/Copyeditor/Moderator or an assigned OPS Editorial Board Member gets the dashboard with the "Error / The current role does not have access to this operation. / OK" dialog; a reviewer or an author typing dashboard/editorial lands on the full page user/authorizationDenied?message=user.authorization.roleBasedAccessDenied.');
            note('ccK1 · "Assign Participant" (legacy window): select[name=filterUserGroupId] (first group preselected), the user grid refetches only on the search form\'s submit (form[id^=searchUserFilter] button), rows carry input[name=userId] radios with "<name> <assignments count>"; the two boxes (input[name=recommendOnly] under "Assignment privileges", input[name=canChangeMetadata] under "Permissions") render only after a radio is checked; leaving by page.goto with a group and a person chosen fires beforeunload (empty message) and nothing is saved; the FBV Cancel is a link, closeTop() matches "Cancel|Close" among a:visible.');
            note('ccK1 · Users & Roles › Users › row menu "Edit" leaves the modal for management/settings/user/{id}; the role rows are tr with a "Remove Role" button and the dialog "Remove Role / Are you sure you want to remove this role? The user will lose access and permissions associated with it. / Remove Role / Cancel"; a user\'s last role cannot be removed there, so seed the user with a second role (reader). After the removal the ended user lands on the journal front page at sign-in and gets user/authorizationDenied on the workflow address.');
            note('ccK1 · Seed: POST scenarios/submission answers 400 "Unsupported spec key participants.0.recommendOnly" (no recommendOnly key, footnote s holds); a participants[] entry whose group holds no stage (OPS editorialBoardMember) writes a row that no panel lists; a manager cannot be assigned through the window unless they hold the Production editor group (the person list is by group membership), and the scratch manager IS offered under "Preprint Server manager" on OPS.');
        }
        // ---- seeded: the Roles grid and the ART section's editors on the seeded journal (read-only) ----
        if (on('seeded')) await sect('seeded', async () => {
            await signInAs(page, 'manager.maya', app.contextPath);
            await page.goto(ctxUrl('/management/settings/access', app.contextPath)); await idle(page);
            const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
            if (await rolesTab.count()) { await rolesTab.click(); await idle(page); }
            const m = await page.evaluate(() => {
                const table = [...document.querySelectorAll('table')].find((t) => [...t.querySelectorAll('thead th')].some((th) => /Role Name/.test(th.innerText)));
                if (!table) return null;
                const cols = [...table.querySelectorAll('thead th')].map((th) => th.innerText.trim());
                const rows = [...table.querySelectorAll('tbody tr.gridRow')].map((tr) => { const cells = [...tr.querySelectorAll('td')]; return {name: (cells[0] || {}).innerText?.trim().replace(/\s+/g, ' ').replace(/^Settings\s+/, ''), level: (cells[1] || {}).innerText?.trim(), boxes: cells.slice(2).map((td, i) => { const b = td.querySelector('input[type=checkbox]'); return b ? `${cols[i + 2]}${b.checked ? ' [x]' : ' [ ]'}${b.disabled ? ' (disabled)' : ''}` : null; }).filter(Boolean)}; });
                return {cols, rows};
            });
            await snap(page, 'seeded-roles-grid', {matrix: m});
            log('[seeded-roles-grid]', JSON.stringify(m && m.rows.map((r) => `${r.name} (${r.level}): ${r.boxes.join(', ')}`)));
            if (!isOMP) {
                await page.goto(ctxUrl('/management/settings/context', app.contextPath)); await idle(page);
                const secTab = page.getByRole('tab', {name: 'Sections', exact: true}).or(page.locator('#sections-button')).first();
                if (await secTab.count()) { await secTab.click(); await idle(page); }
                const artRow = page.locator('tr.gridRow').filter({hasText: /Articles/}).first();
                if (await artRow.count()) {
                    const arrow = artRow.locator('a.show_extras').first();
                    if (await arrow.count()) { await arrow.click(); await idle(page); }
                    const edit = page.getByRole('link', {name: 'Edit', exact: true}).first();
                    if (await edit.count()) {
                        await edit.click(); await idle(page);
                        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[type=checkbox], form'); }, null, {timeout: 20000}).catch(() => {});
                        await page.waitForTimeout(800);
                        const boxes = await topWin(page).locator('input[type=checkbox]').evaluateAll((els) => els.map((i) => ({name: i.name, value: i.value, checked: i.checked, label: (document.querySelector(`label[for="${i.id}"]`) || i.closest('label') || i.parentElement || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 80)})));
                        await snap(page, 'seeded-section-articles-edit', {boxes, dialog: flat((await dialogTexts(page)).slice(-1)[0]?.text, 1500)});
                        log('[seeded-section-articles-edit]', JSON.stringify(boxes.filter((b) => /editor|Editor/i.test(b.label) || b.checked).map((b) => `${b.label}=${b.checked}`)));
                        await closeTop(page);
                    }
                }
            }
        });
    } finally { await close(); }
});
