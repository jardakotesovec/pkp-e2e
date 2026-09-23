// U35 claim check, chunk K1: the Participants panel by role, who sees what on
// each stage, the roles each stage offers (all three apps).
// Spec: docs/specs/U35-stage-participants.md — Purpose 10–44; Actors &
// permissions 45–71; Fields "Roles offered by Assign" 89–99; Rules 1–2
// 119–150; Settings "Stage Assignment" 345–353; Canonical preamble and
// Coverage 423–480; register headings 481–501; OPS1 588–597.
//
// One scratch context per app with one account per role of the registry, and
//   S1  at Production through review, every level assigned (+ a reviewer)  → the by-role reads, row menus, row order
//   S2  submitted only, se1 assigned                                      → the panel on stages not reached
//   S3  at Production, se1 assigned                                       → Rule 2 on screen (assign, second role, Edit, Remove on every stage)
//   S4  at Production, ed/pe/se1/se4/le assigned                          → td3: a Section Editor's "Edit" on the Author row, control as manager
//   S5  as S4                                                             → td10: a Section Editor's "Remove" on a Journal editor row, then their own
//   S6  at Review (OPS Production), se1 deciding + serec and ed2 recommend-only → recommending editors' menus and boxes
// plus a seeded submission on `publicknowledge` (the automatic participants and
// the "Editor Assigned" log lines) and a second scratch context for the
// "Stage Assignment" boxes at both ends.
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U35/K1/k1.js
//   PHASES=seed,view,menus,strangers,offered,rule2,edit,remove,rec,auto,settings,leave,leftover,extra   (default all; later phases reuse k1-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'view', 'menus', 'strangers', 'offered', 'rule2', 'edit', 'remove', 'rec', 'auto', 'settings', 'leave', 'leftover', 'extra'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | ')); record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1200)}); }
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
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);

// The Participants box of the open workflow stage, as data.
const panelInfo = (page) => page.evaluate(() => {
    const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const heads = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const h = heads.find((x) => x.textContent.trim() === "Participants");
    const stageHeading = (heads.find((x) => /^Workflow:/i.test(x.textContent.trim())) || {}).textContent || null;
    const out = {stageHeading: stageHeading && stageHeading.trim(), headings: heads.map((x) => x.textContent.trim()).slice(0, 30)};
    if (!h) { out.panel = false; out.bodyStart = dlg.innerText.replace(/\s+/g, ' ').slice(0, 600); return out; }
    let c = h.parentElement;
    while (c && !c.querySelector('ul,[role=list]') && c !== dlg) c = c.parentElement;
    const sec = document.querySelector('[data-cy="workflow-secondary-items"]');
    out.panel = true;
    out.inSecondaryColumn = !!(sec && sec.contains(h));
    const hRect = h.getBoundingClientRect();
    out.headingX = Math.round(hRect.left);
    out.dialogWidth = Math.round(dlg.getBoundingClientRect().width);
    const btns = [...c.querySelectorAll('button')].filter(vis);
    const topButtons = btns.filter((b) => !b.closest('li')).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || '').trim(), x: Math.round(b.getBoundingClientRect().left), y: Math.round(b.getBoundingClientRect().top)}));
    out.headingY = Math.round(hRect.top);
    out.topButtons = topButtons;
    out.rows = [...c.querySelectorAll('li')].filter(vis).map((li) => {
        const lines = li.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
        const more = [...li.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim());
        return {lines, more};
    });
    out.text = c.innerText.slice(0, 2000);
    return out;
});

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const L = {
        se: isOJS ? 'Section editor' : isOMP ? 'Series editor' : 'Moderator',
        ed: isOJS ? 'Journal editor' : 'Press editor',
        mgr: isOJS ? 'Journal manager' : isOMP ? 'Press manager' : 'Preprint Server manager',
        ce: 'Copyeditor',
        au: 'Author',
    };

    // ---- seed ------------------------------------------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u35k1');
        const U = (k) => `${t}${k}`;
        const person = (k, roles, given) => ({username: U(k), roles, givenName: given, familyName: 'Kay'});
        let users;
        if (isOPS) {
            users = [
                person('mgr', ['manager'], 'Mgr'), person('mgr2', ['manager'], 'Mgrtwo'),
                person('se1', ['sectionEditor'], 'Seone'), person('se2', ['sectionEditor'], 'Setwo'),
                person('se3', ['sectionEditor', 'author'], 'Sethree'), person('se4', ['sectionEditor'], 'Sefour'),
                person('serec', ['sectionEditor'], 'Serec'),
                person('au', ['author'], 'Auone'), person('au2', ['author'], 'Autwo'),
                person('rd', ['reader'], 'Reader'), person('ebm', ['editorialBoardMember'], 'Board'),
            ];
        } else {
            users = [
                person('mgr', ['manager'], 'Mgr'), person('ed', ['editor'], 'Edone'), person('ed2', ['editor'], 'Edtwo'),
                person('se1', ['sectionEditor'], 'Seone'), person('se2', ['sectionEditor'], 'Setwo'),
                person('se3', ['sectionEditor', 'copyeditor'], 'Sethree'), person('se4', ['sectionEditor'], 'Sefour'),
                person('serec', ['sectionEditor'], 'Serec'),
                person('pe', ['productionEditor'], 'Prodone'), person('pe2', ['productionEditor'], 'Prodtwo'),
                person('ce', ['copyeditor'], 'Copyone'), person('ce2', ['copyeditor'], 'Copytwo'),
                person('le', ['layoutEditor'], 'Layout'), person('fc', ['funding'], 'Funding'),
                person('des', ['designer'], 'Designer'), person('idx', ['indexer'], 'Indexer'),
                person('pr', ['proofreader'], 'Proof'), person('mk', ['marketing'], 'Market'),
                person('tr', ['translator'], 'Transl'),
                person('au', ['author'], 'Auone'), person('au2', ['author'], 'Autwo'),
                person('rev', ['externalReviewer'], 'Reviewer'), person('rd', ['reader'], 'Reader'),
                person('ebm', ['editorialBoardMember'], 'Board'),
            ];
            if (isOJS) users.push(person('ge', ['guestEditor'], 'Guest'), person('ge2', ['guestEditor'], 'Guesttwo'));
            if (isOMP) users.push(person('ve', ['volumeEditor'], 'Volume'), person('ca', ['chapterAuthor'], 'Chapter'));
        }
        const ctx = await app.api.createContext({tag: t, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.users = {};
        for (const u of users) sc.users[u.username.slice(t.length)] = {username: u.username, name: `${u.givenName} Kay`};
        const P = (k, role, extra) => ({username: U(k), role, ...(extra || {})});
        const toProd = isOPS ? [] : isOMP ? ['sendInternalReview', 'sendExternalReview', 'accept', 'sendToProduction'] : ['sendExternalReview', 'accept', 'sendToProduction'];
        const rounds = isOPS ? undefined : isOMP ? [{stage: 'internal', reviewers: []}, {stage: 'external', reviewers: [{username: U('rev')}]}] : [{reviewers: [{username: U('rev')}]}];
        sc.subs = {};
        const sub = async (k, spec) => {
            const body = {tag: `${t}${k}`, context: sc.contextPath, submitter: U('au'), title: `K1 ${k.toUpperCase()} ${t}`, ...spec};
            try {
                const r = await app.api.createSubmission(body);
                sc.subs[k] = {id: r.submissionId, title: body.title, stageId: r.stageId, rounds: r.reviewRounds || []};
            } catch (e) {
                sc.subs[k] = {error: String(e.message).slice(0, 600)};
                if (isOMP && body.decisions && body.decisions[0] === 'sendInternalReview') {
                    const alt = {...body, decisions: ['skipInternalReview', ...body.decisions.slice(2)], reviewRounds: body.reviewRounds ? [body.reviewRounds[1]] : undefined};
                    if (!alt.reviewRounds) delete alt.reviewRounds;
                    const r = await app.api.createSubmission(alt);
                    sc.subs[k] = {id: r.submissionId, title: body.title, stageId: r.stageId, rounds: r.reviewRounds || [], firstError: sc.subs[k].error};
                }
            }
            save();
        };
        if (isOPS) {
            await sub('s1', {participants: [P('mgr2', 'manager'), P('se1', 'sectionEditor'), P('se4', 'sectionEditor')]});
            await sub('s3', {participants: [P('se1', 'sectionEditor')]});
            await sub('s4', {participants: [P('mgr2', 'manager'), P('se1', 'sectionEditor'), P('se4', 'sectionEditor')]});
            await sub('s5', {participants: [P('mgr2', 'manager'), P('se1', 'sectionEditor'), P('se4', 'sectionEditor')]});
            await sub('s6', {participants: [P('se1', 'sectionEditor'), P('serec', 'sectionEditor', {recommendOnly: true}), P('mgr2', 'manager', {recommendOnly: true})]});
        } else {
            const s1p = [P('ed', 'editor'), P('pe', 'productionEditor'), P('se1', 'sectionEditor')];
            if (isOJS) s1p.push(P('ge', 'guestEditor'));
            s1p.push(P('se4', 'sectionEditor'), P('ce', 'copyeditor'), P('le', 'layoutEditor'), P('fc', 'funding'), P('tr', 'translator'));
            await sub('s1', {decisions: toProd, reviewRounds: rounds, participants: s1p});
            await sub('s2', {participants: [P('se1', 'sectionEditor')]});
            await sub('s3', {decisions: toProd, participants: [P('se1', 'sectionEditor')], reviewRounds: isOMP ? [{stage: 'internal', reviewers: []}, {stage: 'external', reviewers: []}] : undefined});
            const s4p = [P('ed', 'editor'), P('pe', 'productionEditor'), P('se1', 'sectionEditor'), P('se4', 'sectionEditor'), P('le', 'layoutEditor')];
            await sub('s4', {decisions: toProd, participants: s4p, reviewRounds: isOMP ? [{stage: 'internal', reviewers: []}, {stage: 'external', reviewers: []}] : undefined});
            await sub('s5', {decisions: toProd, participants: s4p, reviewRounds: isOMP ? [{stage: 'internal', reviewers: []}, {stage: 'external', reviewers: []}] : undefined});
            await sub('s6', {decisions: isOMP ? ['skipInternalReview'] : ['sendExternalReview'],
                participants: [P('se1', 'sectionEditor'), P('serec', 'sectionEditor', {recommendOnly: true}), P('ed2', 'editor', {recommendOnly: true}), P('ed', 'editor'), P('le', 'layoutEditor')]});
        }
        save();
        log('[seed]', app.name, JSON.stringify(sc.subs));
    }
    if (!sc.contextPath) { log('no state; run the seed phase'); return; }
    const u = (k) => sc.users[k] && sc.users[k].username;
    const nm = (k) => sc.users[k] && sc.users[k].name;
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const stagesOf = (s) => {
        if (isOPS) return [{n: 'Production', id: 5, key: 'workflow_5'}];
        const r = (st) => { const list = (s.rounds || []).filter((x) => x.stageId === st); const x = list[list.length - 1]; return x ? `workflow_${st}_${x.id}` : null; };
        const out = [{n: 'Submission', id: 1, key: 'workflow_1'}];
        if (isOMP) out.push({n: 'Internal Review', id: 2, key: r(2)});
        out.push({n: isOMP ? 'External Review' : 'Review', id: 3, key: r(3)});
        out.push({n: 'Copyediting', id: 4, key: 'workflow_4'}, {n: 'Production', id: 5, key: 'workflow_5'});
        return out;
    };
    const wfUrl = (id, key, author) => ctxUrl(`/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);

    const {page, close} = await launch(app);
    const jsDialogs = [];
    const calls = [];
    page.on('response', (r) => {
        const url = r.url();
        if (!(/\/api\/|\$\$\$call\$\$\$/.test(url))) return;
        if (r.request().method() === 'GET' && r.status() < 400) return;
        calls.push({m: r.request().method(), url: url.replace(/^https?:\/\/[^/]+/, '').slice(0, 200), status: r.status()});
    });
    page.on('dialog', async (d) => { jsDialogs.push({at: page.url(), type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    const signInAs = async (k) => { await signIn(page, u(k) || k, {contextPath: u(k) ? sc.contextPath : 'publicknowledge'}); await idle(page); };

    async function openStage(subId, stage, label, {author = false} = {}) {
        await page.goto(wfUrl(subId, stage && stage.key, author));
        await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => { const d = document.querySelector('[role=dialog]'); return d && !/Loading/.test(d.innerText); }, null, {timeout: 15000}).catch(() => {});
        await page.locator('[data-cy="workflow-secondary-items"] li').first().waitFor({timeout: 8000}).catch(() => {});
        await idle(page);
        const info = await panelInfo(page).catch((e) => ({error: String(e.message)}));
        await snap(page, label, {panelInfo: info});
        log(`[${label}]`, flat(info.stageHeading, 40), '| panel:', info.panel, '| top:', JSON.stringify((info.topButtons || []).map((b) => b.text)), '| rows:', JSON.stringify((info.rows || []).map((r) => r.lines.join(' / '))));
        return info;
    }
    // Open "More Actions" on the i-th panel row and read the menu, then close it.
    async function rowMenu(i) {
        const rows = page.locator('[data-cy="workflow-secondary-items"] li').filter({has: page.getByRole('button', {name: /More Actions$/})});
        const row = rows.nth(i);
        const btn = row.getByRole('button', {name: /More Actions$/}).first();
        await btn.click();
        await page.locator('[role="menuitem"]:visible').first().waitFor({timeout: 5000}).catch(() => {});
        const items = await menuItems(page);
        // Escape closes the workflow dialog too (patterns.md pitfall 7): toggle the menu shut with its own button.
        await btn.click({force: true}).catch(() => {});
        await page.locator('[role="menuitem"]:visible').first().waitFor({state: 'hidden', timeout: 3000}).catch(() => {});
        await page.waitForTimeout(150);
        if (!(await page.locator('[data-cy="workflow-secondary-items"]').count())) return {items, closedWorkflow: true};
        return {items};
    }
    async function allMenus(label, info) {
        const out = [];
        for (let i = 0; i < (info.rows || []).length; i++) {
            const r = info.rows[i];
            if (!r.more.length) { out.push({row: r.lines.join(' / '), items: null}); continue; }
            const m = await rowMenu(i).catch((e) => ({error: String(e.message).slice(0, 200)}));
            out.push({row: r.lines.join(' / '), ...m});
            if (m.closedWorkflow) break;
        }
        record(`${label}-menus`, out);
        log(`[${label} menus]`, JSON.stringify(out.map((o) => `${o.row.split(' / ').slice(1).join('/')}: ${(o.items || []).join(',')}`)));
        return out;
    }
    async function clickMenu(rowMatch, item) {
        const rows = page.locator('[data-cy="workflow-secondary-items"] li').filter({has: page.getByRole('button', {name: /More Actions$/})}).filter({hasText: rowMatch});
        await rows.first().getByRole('button', {name: /More Actions$/}).click();
        const mi = page.getByRole('menuitem', {name: item, exact: true});
        await mi.waitFor({timeout: 5000});
        await mi.click();
        await idle(page);
    }
    async function legacyWindow(nameRe) {
        const w = page.getByRole('dialog', {name: nameRe}).last();
        await w.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.querySelector('form') && !/Loading/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        return w;
    }
    // The Edit Assignment window's state.
    async function editFormInfo(w) {
        return w.evaluate((d) => {
            const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
            const box = (n) => { const i = d.querySelector(`input[name="${n}"]`); return i ? {visible: vis(i), checked: i.checked} : null; };
            return {text: d.innerText.replace(/\s+/g, ' ').slice(0, 900), recommendOnly: box('recommendOnly'), canChangeMetadata: box('canChangeMetadata')};
        });
    }
    async function pressCancel(w) {
        const c = w.getByRole('link', {name: /^\s*Cancel\s*$/}).last();
        if (await c.count()) { await c.click(); await idle(page); await page.waitForTimeout(400); return 'cancel-link'; }
        const b = w.getByRole('button', {name: /^(Cancel|Close)$/}).last();
        if (await b.count()) { await b.click(); await idle(page); return 'button'; }
        return 'none';
    }
    // Assign window helpers.
    async function openAssign() {
        const a = page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true});
        await a.click();
        const w = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        await w.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
        await idle(page);
        return w;
    }
    async function searchAs(w, roleLabel, name) {
        const sel = w.locator('select[name="filterUserGroupId"]');
        if (roleLabel) { await sel.selectOption({label: roleLabel}); await idle(page); }
        await w.getByRole('textbox', {name: 'Search User By Name'}).fill(name || '');
        await w.getByRole('button', {name: 'Search', exact: true}).click();
        await idle(page); await page.waitForTimeout(300); await idle(page);
        return w.locator('input[name="userId"]').evaluateAll((els) => els.map((r) => ({value: r.value, row: (r.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 100)})));
    }
    async function boxesOf(w) {
        return w.evaluate((d) => {
            const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
            const b = (n) => { const i = d.querySelector(`input[name="${n}"]`); return i ? {visible: vis(i), checked: i.checked} : null; };
            return {recommendOnly: b('recommendOnly'), canChangeMetadata: b('canChangeMetadata')};
        });
    }
    async function assignOnScreen(roleLabel, who, label) {
        const w = await openAssign();
        const people = await searchAs(w, roleLabel, who);
        const pick = people.find((p) => p.row && p.row.includes(who));
        if (!pick) { record(`${label}-notfound`, {people}); await pressCancel(w); return {assigned: false, people}; }
        await w.locator(`input[name="userId"][value="${pick.value}"]`).check({force: true});
        await idle(page);
        const boxes = await boxesOf(w);
        await snap(page, `${label}-chosen`, {boxes});
        const ok = w.getByRole('button', {name: 'OK', exact: true}).last();
        await loc(page, 'Assign Participant: OK', ok);
        await ok.click();
        await w.waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(600);
        return {assigned: true, boxes};
    }

    try {
        // ---- view: every level on every stage of S1 (read-only), the row menus on one stage each ----------------------
        if (on('view')) await sect('view', async () => {
            const s1 = sc.subs.s1;
            const viewers = isOPS ? ['admin', 'mgr', 'se1', 'se4'] : ['admin', 'mgr', 'ed', 'ed2', 'se1', ...(isOJS ? ['ge'] : []), 'pe', 'ce', 'le', 'fc', 'tr'];
            sc.view = {};
            for (const v of viewers) {
                await signInAs(v);
                sc.view[v] = {};
                for (const st of stagesOf(s1)) {
                    const info = await openStage(s1.id, st, `view-${v}-s1-${st.id}`);
                    sc.view[v][st.id] = {panel: info.panel, stageHeading: info.stageHeading, top: (info.topButtons || []).map((b) => b.text), rows: (info.rows || []).map((r) => r.lines.join(' / ')), bodyStart: info.panel ? undefined : info.bodyStart};
                }
                save();
            }
            await loc(page, 'Participants panel (secondary column)', page.locator('[data-cy="workflow-secondary-items"]'));
        });
        if (on('menus')) await sect('menus', async () => {
            const s1 = sc.subs.s1;
            const plan = isOPS ? {admin: 5, mgr: 5, se1: 5} : {admin: 5, mgr: 5, ed: 5, se1: 5, ...(isOJS ? {ge: 5} : {}), pe: 5, ce: 4, le: 5, fc: 1, tr: 5};
            if (!isOPS) plan.pe1 = 1; // the production editor on a stage outside its set
            sc.menus = {};
            for (const [vk, stId] of Object.entries(plan)) {
                const v = vk === 'pe1' ? 'pe' : vk;
                await signInAs(v);
                const st = stagesOf(s1).find((x) => x.id === stId);
                const info = await openStage(s1.id, st, `menus-${vk}-s1-${stId}`);
                sc.menus[vk] = await allMenus(`menus-${vk}-s1-${stId}`, info);
                save();
            }
            const more = page.locator('[data-cy="workflow-secondary-items"] li').getByRole('button', {name: /More Actions$/}).first();
            await loc(page, 'Participants row "More Actions"', more);
        });

        // ---- strangers: author, reviewer, reader, an unassigned Section Editor, OPS board member -----------------------------
        if (on('strangers')) await sect('strangers', async () => {
            const s1 = sc.subs.s1;
            sc.strangers = {};
            const who = isOPS ? ['au', 'rd', 'se2', 'ebm'] : ['au', 'rev', 'rd', 'se2', 'ebm', 'pe2'];
            for (const k of who) {
                await signInAs(k);
                const a = await openStage(s1.id, null, `str-${k}-editorial`);
                sc.strangers[k] = {editorial: {url: page.url(), panel: a.panel, headings: (a.headings || []).slice(0, 8), bodyStart: flat(a.bodyStart, 300)}};
                if (k === 'pe2') {
                    for (const st of stagesOf(s1)) {
                        const c = await openStage(s1.id, st, `str-pe2-${st.id}`);
                        sc.strangers.pe2[`stage${st.id}`] = {panel: c.panel, top: (c.topButtons || []).map((b) => b.text), rows: (c.rows || []).length, bodyStart: flat(c.bodyStart, 200)};
                        if (st.id === 5 && c.panel) sc.strangers.pe2.menus5 = await allMenus('str-pe2-5', c);
                    }
                }
                if (k === 'au' || k === 'rev') {
                    const b = await openStage(s1.id, null, `str-${k}-mysubmissions`, {author: true});
                    sc.strangers[k].mySubmissions = {url: page.url(), panel: b.panel, headings: (b.headings || []).slice(0, 12), bodyStart: flat(b.bodyStart, 300)};
                    if (k === 'au') {
                        for (const st of stagesOf(s1)) {
                            const c = await openStage(s1.id, st, `str-au-mysub-${st.id}`, {author: true});
                            sc.strangers.au[`stage${st.id}`] = {panel: c.panel, heading: c.stageHeading, headings: (c.headings || []).slice(0, 10)};
                        }
                    }
                }
                save();
            }
            log('[strangers]', JSON.stringify(sc.strangers).slice(0, 2500));
        });

        // ---- offered: the role list of every stage's "Assign" and the two boxes per role (manager, S1 and S2) ---------------
        if (on('offered')) await sect('offered', async () => {
            await signInAs('mgr');
            sc.offered = {};
            for (const st of stagesOf(sc.subs.s1)) {
                await openStage(sc.subs.s1.id, st, `off-s1-${st.id}`);
                const w = await openAssign();
                const sel = w.locator('select[name="filterUserGroupId"]');
                const opts = await sel.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), selected: o.selected})));
                const initial = await boxesOf(w);
                await snap(page, `off-s1-${st.id}-open`, {opts, initial});
                const perRole = [];
                for (const o of opts) {
                    const people = await searchAs(w, o.text, '');
                    const afterSearch = await boxesOf(w);
                    let chosen = null;
                    if (people.length) {
                        await w.locator(`input[name="userId"][value="${people[0].value}"]`).check({force: true});
                        await idle(page);
                        chosen = {who: people[0].row, boxes: await boxesOf(w)};
                    }
                    perRole.push({role: o.text, people: people.map((p) => p.row), beforePick: afterSearch, chosen});
                }
                // role switch after a pick: the boxes hide and untick, the people list stays until "Search"
                let switchCheck = null;
                if (opts.length > 1) {
                    const peopleBefore = await w.locator('input[name="userId"]').evaluateAll((els) => els.map((r) => (r.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 60)));
                    await sel.selectOption({label: opts[0].text}); await idle(page);
                    const peopleAfter = await w.locator('input[name="userId"]').evaluateAll((els) => els.map((r) => (r.closest('tr') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 60)));
                    switchCheck = {from: opts[opts.length - 1].text, to: opts[0].text, boxes: await boxesOf(w), peopleBefore, peopleAfter};
                }
                await snap(page, `off-s1-${st.id}-last`, {perRole, switchCheck});
                sc.offered[st.id] = {stage: st.n, opts: opts.map((o) => o.text + (o.selected ? ' (selected)' : '')), perRole, switchCheck};
                const how = await pressCancel(w);
                sc.offered[st.id].closedBy = how;
                save();
                log(`[offered ${st.n}]`, JSON.stringify(opts.map((o) => o.text)));
            }
            // the "Permissions" box for the Author picked in a fresh window, and picked after a Section Editor was picked
            {
                const st = stagesOf(sc.subs.s1)[0];
                await openStage(sc.subs.s1.id, st, 'off-fresh-before');
                let w = await openAssign();
                let people = await searchAs(w, L.au, '');
                if (people.length) { await w.locator(`input[name="userId"][value="${people[0].value}"]`).check({force: true}); await idle(page); }
                const fresh = await boxesOf(w);
                await snap(page, 'off-fresh-author', {fresh});
                await pressCancel(w);
                await openStage(sc.subs.s1.id, st, 'off-fresh-before2');
                w = await openAssign();
                people = await searchAs(w, L.se, '');
                if (people.length) { await w.locator(`input[name="userId"][value="${people[0].value}"]`).check({force: true}); await idle(page); }
                const afterSe = await boxesOf(w);
                people = await searchAs(w, L.au, '');
                const afterSwitch = await boxesOf(w);
                if (people.length) { await w.locator(`input[name="userId"][value="${people[0].value}"]`).check({force: true}); await idle(page); }
                const authorAfterSe = await boxesOf(w);
                await snap(page, 'off-author-after-se', {afterSe, afterSwitch, authorAfterSe});
                await pressCancel(w);
                sc.offeredFresh = {fresh, afterSe, afterSwitch, authorAfterSe};
                log('[fresh author]', JSON.stringify(sc.offeredFresh));
                save();
            }
            // stages not reached (S2 at Submission): what the side menu opens and whether its panel offers "Assign"
            if (!isOPS && sc.subs.s2) {
                sc.notReached = {};
                await openStage(sc.subs.s2.id, {key: 'workflow_1'}, 'nr-s2-1');
                const names = isOMP ? ['Internal Review', 'External Review', 'Copyediting', 'Production'] : ['Review', 'Copyediting', 'Production'];
                for (const n of names) {
                    await page.getByRole('treeitem', {name: n, exact: true}).first().click().catch((e) => log('treeitem', n, e.message));
                    await idle(page); await page.waitForTimeout(500); await idle(page);
                    const info = await panelInfo(page);
                    await snap(page, `nr-s2-${n.replace(/\s+/g, '')}`, {panelInfo: info});
                    let opts = null;
                    if ((info.topButtons || []).some((b) => b.text === 'Assign')) {
                        const w = await openAssign();
                        opts = await w.locator('select[name="filterUserGroupId"] option').evaluateAll((els) => els.map((o) => o.text.trim()));
                        await pressCancel(w);
                    }
                    sc.notReached[n] = {url: page.url(), stageHeading: info.stageHeading, panel: info.panel, top: (info.topButtons || []).map((b) => b.text), rows: (info.rows || []).map((r) => r.lines.join(' / ')), opts, bodyStart: flat(info.bodyStart, 200)};
                    log(`[not reached ${n}]`, JSON.stringify(sc.notReached[n]));
                }
                save();
            }
        });

        // ---- rule2: assign from one stage, see it on every stage of the role's set; second role; Edit and Remove on every stage ----
        if (on('rule2')) await sect('rule2', async () => {
            const s3 = sc.subs.s3;
            const stages = stagesOf(s3);
            const first = stages[0];
            await signInAs('mgr');
            sc.rule2 = {};
            await openStage(s3.id, first, 'r2-before');
            const a1 = await assignOnScreen(L.se, nm('se3'), 'r2-assign-se3');
            sc.rule2.assignSE = a1;
            sc.rule2.afterAssign = {};
            for (const st of stages) {
                const info = await openStage(s3.id, st, `r2-after-se-${st.id}`);
                sc.rule2.afterAssign[st.n] = (info.rows || []).map((r) => r.lines.join(' / '));
            }
            // leaves the role's list; still in the other role's list
            await openStage(s3.id, first, 'r2-list-check');
            {
                const w = await openAssign();
                const asSE = await searchAs(w, L.se, nm('se3'));
                const asSEall = await searchAs(w, L.se, '');
                const other = isOPS ? L.au : (first.id === 1 ? null : L.ce);
                const asOther = other ? await searchAs(w, other, nm('se3')) : null;
                sc.rule2.listAfter = {asSEbyName: asSE.map((p) => p.row), asSEall: asSEall.map((p) => p.row), other, asOther: asOther && asOther.map((p) => p.row)};
                await snap(page, 'r2-list-check-window', {listAfter: sc.rule2.listAfter});
                await pressCancel(w);
            }
            // second role
            const secondStage = isOPS ? first : stages.find((s) => s.id === 4);
            await openStage(s3.id, secondStage, 'r2-before-second');
            sc.rule2.assignSecond = await assignOnScreen(isOPS ? L.au : L.ce, nm('se3'), 'r2-assign-se3-second');
            sc.rule2.afterSecond = {};
            for (const st of stages) {
                const info = await openStage(s3.id, st, `r2-after-second-${st.id}`);
                sc.rule2.afterSecond[st.n] = (info.rows || []).map((r) => r.lines.join(' / '));
            }
            save();
            // Edit the SE row on the last stage: tick recommend-only; read it on the first stage
            const last = stages[stages.length - 1];
            await openStage(s3.id, last, 'r2-before-edit');
            await clickMenu(new RegExp(`${nm('se3')}[\\s\\S]*${L.se}`), 'Edit');
            {
                const w = await legacyWindow(/Edit Assignment/);
                const before = await editFormInfo(w);
                await w.locator('input[name="recommendOnly"]').check();
                await w.getByRole('button', {name: 'OK', exact: true}).last().click();
                await w.waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await idle(page); await page.waitForTimeout(600);
                sc.rule2.edit = {before};
            }
            sc.rule2.afterEdit = {};
            for (const st of stages) {
                const info = await openStage(s3.id, st, `r2-after-edit-${st.id}`);
                sc.rule2.afterEdit[st.n] = (info.rows || []).map((r) => r.lines.join(' / '));
            }
            // Remove the SE row on Copyediting (OPS: the one stage)
            const rmStage = isOPS ? first : stages.find((s) => s.id === 4);
            await openStage(s3.id, rmStage, 'r2-before-remove');
            await clickMenu(new RegExp(`${nm('se3')}[\\s\\S]*${L.se}`), 'Remove');
            {
                const d = page.getByRole('dialog', {name: /Remove Participant/}).last();
                await d.waitFor({timeout: 10000}).catch(() => {});
                await snap(page, 'r2-remove-dialog');
                sc.rule2.removeDialog = flat(await d.innerText().catch(() => null), 300);
                await d.getByRole('button', {name: 'OK', exact: true}).click();
                await idle(page); await page.waitForTimeout(800);
            }
            sc.rule2.afterRemove = {};
            for (const st of stages) {
                const info = await openStage(s3.id, st, `r2-after-remove-${st.id}`);
                sc.rule2.afterRemove[st.n] = (info.rows || []).map((r) => r.lines.join(' / '));
            }
            // mail: an on-screen Assign of an editor sends no "Editor Assigned" email
            sc.rule2.mailToSe3 = await app.mail.count({to: `${u('se3')}@mail.test`}).catch((e) => String(e.message));
            sc.rule2.mailAssignedEditor = await app.mail.count({to: `${u('se3')}@mail.test`, subject: 'assigned as'}).catch((e) => String(e.message));
            save();
            log('[rule2]', JSON.stringify(sc.rule2).slice(0, 3000));
        });

        // ---- edit (td3): a Section Editor's "Edit" on the Author row; the manager's control -------------------------------
        if (on('edit')) await sect('edit', async () => {
            const s4 = sc.subs.s4;
            const st = stagesOf(s4).find((x) => x.id === 5);
            sc.edit = {};
            for (const who of ['se1', 'mgr']) {
                await signInAs(who);
                const info = await openStage(s4.id, st, `ed-${who}-panel`);
                sc.edit[who] = {menus: await allMenus(`ed-${who}-panel`, info)};
                await clickMenu(new RegExp(nm('au')), 'Edit');
                const w = await legacyWindow(/Edit Assignment/);
                const before = await editFormInfo(w);
                await snap(page, `ed-${who}-author-form`, {before});
                const box = w.locator('input[name="canChangeMetadata"]');
                const want = !(before.canChangeMetadata && before.canChangeMetadata.checked);
                if (before.canChangeMetadata) await box.setChecked(want);
                calls.length = 0;
                await w.getByRole('button', {name: 'OK', exact: true}).last().click();
                await page.waitForTimeout(1500); await idle(page);
                const stillOpen = await w.isVisible().catch(() => false);
                const after = stillOpen ? await editFormInfo(w).catch(() => null) : null;
                const notices = await page.locator('[role="status"], [role="alert"], .pkpNotification, [class*="notification"]').evaluateAll((els) => els.map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                await snap(page, `ed-${who}-author-after-ok`, {stillOpen, after, notices, calls: calls.slice()});
                if (stillOpen) await pressCancel(w);
                await openStage(s4.id, st, `ed-${who}-panel-reopen`);
                await clickMenu(new RegExp(nm('au')), 'Edit');
                const w2 = await legacyWindow(/Edit Assignment/);
                const reopened = await editFormInfo(w2);
                await snap(page, `ed-${who}-author-reopen`, {reopened});
                await pressCancel(w2);
                sc.edit[who] = {...sc.edit[who], before, wanted: want, stillOpen, after, notices, calls: calls.slice(), reopened};
                save();
                log(`[edit ${who}]`, JSON.stringify({before: before.canChangeMetadata, want, stillOpen, notices, reopened: reopened.canChangeMetadata}));
            }
        });

        // ---- remove (td10): a Section Editor removes a Journal editor (OPS: server manager) row, then their own -------------
        if (on('remove')) await sect('remove', async () => {
            const s5 = sc.subs.s5;
            const st = stagesOf(s5).find((x) => x.id === 5);
            sc.remove = {};
            await signInAs('se1');
            const target = isOPS ? 'mgr2' : 'ed';
            let info = await openStage(s5.id, st, 'rm-se1-before');
            sc.remove.before = (info.rows || []).map((r) => r.lines.join(' / '));
            await clickMenu(new RegExp(nm(target)), 'Remove');
            let d = page.getByRole('dialog', {name: /Remove Participant/}).last();
            await d.waitFor({timeout: 10000});
            sc.remove.dialog = flat(await d.innerText(), 300);
            calls.length = 0;
            await d.getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page); await page.waitForTimeout(1000); await idle(page);
            info = await panelInfo(page);
            await snap(page, 'rm-se1-after-other', {panelInfo: info, calls: calls.slice()});
            sc.remove.afterOther = {rows: (info.rows || []).map((r) => r.lines.join(' / ')), calls: calls.slice()};
            info = await openStage(s5.id, st, 'rm-se1-after-other-reload');
            sc.remove.afterOtherReload = (info.rows || []).map((r) => r.lines.join(' / '));
            await clickMenu(new RegExp(nm('se1')), 'Remove');
            d = page.getByRole('dialog', {name: /Remove Participant/}).last();
            await d.waitFor({timeout: 10000});
            calls.length = 0;
            await d.getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page); await page.waitForTimeout(1500); await idle(page);
            info = await panelInfo(page).catch(() => ({}));
            await snap(page, 'rm-se1-after-own', {panelInfo: info, calls: calls.slice()});
            sc.remove.afterOwn = {url: page.url(), rows: (info.rows || []).map((r) => r.lines.join(' / ')), top: (info.topButtons || []).map((b) => b.text), panel: info.panel, calls: calls.slice(), bodyStart: flat(info.bodyStart, 300)};
            for (const s of stagesOf(s5)) {
                const i2 = await openStage(s5.id, s, `rm-se1-after-own-reload-${s.id}`);
                sc.remove[`afterOwnReload${s.id}`] = {url: page.url(), panel: i2.panel, rows: (i2.rows || []).map((r) => r.lines.join(' / ')), top: (i2.topButtons || []).map((b) => b.text), headings: (i2.headings || []).slice(0, 8), bodyStart: flat(i2.bodyStart, 300)};
            }
            await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
            await snap(page, 'rm-se1-dashboard-after-own');
            save();
            log('[remove]', JSON.stringify(sc.remove).slice(0, 3000));
        });

        // ---- rec: recommending editors (serec; ed2 a recommend-only Journal editor; OPS mgr2) ------------------------------
        if (on('rec')) await sect('rec', async () => {
            const s6 = sc.subs.s6;
            const st = isOPS ? stagesOf(s6)[0] : (isOMP ? {n: 'External Review', id: 3, key: `workflow_3_${((s6.rounds || []).find((r) => r.stageId === 3) || {}).id}`} : {n: 'Review', id: 3, key: `workflow_3_${((s6.rounds || [])[0] || {}).id}`});
            if (!isOPS && /undefined/.test(st.key)) st.key = null;
            sc.rec = {};
            const viewers = isOPS ? ['serec', 'mgr2', 'se1'] : ['serec', 'ed2', 'se1', 'ed'];
            for (const v of viewers) {
                await signInAs(v);
                const info = await openStage(s6.id, st, `rec-${v}`);
                sc.rec[v] = {rows: (info.rows || []).map((r) => r.lines.join(' / ')), top: (info.topButtons || []).map((b) => b.text), menus: await allMenus(`rec-${v}`, info)};
                // the recommend-only box on the "Edit" of an editor-role row other than one's own
                const tgt = v === 'se1' ? 'serec' : 'se1';
                const m = sc.rec[v].menus.find((x) => x.row.includes(nm(tgt)));
                if (m && (m.items || []).includes('Edit')) {
                    await clickMenu(new RegExp(nm(tgt)), 'Edit');
                    const w = await legacyWindow(/Edit Assignment/);
                    sc.rec[v].editOn = {row: tgt, form: await editFormInfo(w)};
                    await snap(page, `rec-${v}-edit-${tgt}`, {form: sc.rec[v].editOn});
                    await pressCancel(w);
                }
                // and on the layout editor's row (a non-editor role)
                const ml = sc.rec[v].menus.find((x) => x.row.includes(nm('le') || '~~'));
                if (!isOPS && ml && (ml.items || []).includes('Edit')) {
                    await openStage(s6.id, st, `rec-${v}-2`);
                    await clickMenu(new RegExp(nm('le')), 'Edit');
                    const w = await legacyWindow(/Edit Assignment/);
                    sc.rec[v].editOnLe = await editFormInfo(w);
                    await pressCancel(w);
                }
                save();
                log(`[rec ${v}]`, JSON.stringify(sc.rec[v]).slice(0, 1500));
            }
        });

        // ---- auto: a seeded submission on the seeded journal gets its section's editors; the Activity Log -------------------
        if (on('auto')) await sect('auto', async () => {
            const t = sc.tag;
            // S3's Activity Log after the on-screen "Assign" of a Section Editor (rule2 phase): no "Editor Assigned" email line
            if (sc.rule2) {
                await signInAs('mgr');
                await openStage(sc.subs.s3.id, stagesOf(sc.subs.s3)[0], 'auto-s3-before-log');
                const al0 = page.getByRole('button', {name: 'Activity Log', exact: true}).first();
                if (await al0.count()) {
                    await al0.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
                    const s = await snap(page, 'auto-s3-activity-log');
                    sc.s3log = flat(s.text && s.text.dialog, 2500);
                }
            }
            if (!sc.auto) {
                const spec = {tag: `${t}pk`, context: 'publicknowledge', submitter: 'author.alex', title: `K1 auto ${t}`};
                if (isOMP) spec.series = 'monographs';
                const r = await app.api.createSubmission(spec);
                sc.auto = {id: r.submissionId, stageId: r.stageId};
                save();
            }
            await signIn(page, 'manager.maya', {contextPath: 'publicknowledge'}); await idle(page);
            await page.goto(app.url(`/index.php/publicknowledge/dashboard/editorial?workflowSubmissionId=${sc.auto.id}&workflowMenuKey=${isOPS ? 'workflow_5' : 'workflow_1'}`));
            await idle(page);
            await page.locator('[data-cy="workflow-secondary-items"] li').first().waitFor({timeout: 20000}).catch(() => {});
            const info = await panelInfo(page);
            await snap(page, 'auto-panel', {panelInfo: info});
            sc.auto.rows = (info.rows || []).map((r) => r.lines.join(' / '));
            const al = page.getByRole('button', {name: 'Activity Log', exact: true}).first();
            if (await al.count()) {
                await al.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
                const s = await snap(page, 'auto-activity-log');
                sc.auto.log = flat(s.text && s.text.dialog, 2500);
            }
            sc.auto.mailDiana = await app.mail.count({to: 'editor.diana@mail.test', contains: `K1 auto ${t}`}).catch((e) => String(e.message));
            save();
            log('[auto]', JSON.stringify(sc.auto).slice(0, 2500));
        });

        // ---- settings: a role's "Stage Assignment" boxes, both ends, in a second scratch context ------------------------------
        if (on('settings')) await sect('settings', async () => {
            if (!sc.set) {
                const t = tag('u35k1s');
                const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mgr', familyName: 'Ess'},
                    {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Seone', familyName: 'Ess'},
                    {username: `${t}au`, roles: ['author'], givenName: 'Auone', familyName: 'Ess'}];
                if (isOPS) users.push({username: `${t}ebm`, roles: ['editorialBoardMember'], givenName: 'Board', familyName: 'Ess'});
                else users.push({username: `${t}ce`, roles: ['copyeditor'], givenName: 'Copyone', familyName: 'Ess'});
                await app.api.createContext({tag: t, users});
                const parts = [{username: `${t}se`, role: 'sectionEditor'}];
                if (!isOPS) parts.push({username: `${t}ce`, role: 'copyeditor'});
                const r = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `K1 settings ${t}`,
                    decisions: isOPS ? [] : isOMP ? ['skipInternalReview', 'accept', 'sendToProduction'] : ['skipExternalReview', 'sendToProduction'], participants: parts});
                sc.set = {tag: t, id: r.submissionId, stageId: r.stageId};
                save();
            }
            const t = sc.set.tag;
            const surl = (p) => app.url(`/index.php/${t}${p}`);
            await signIn(page, `${t}mgr`, {contextPath: t}); await idle(page);
            const rolesGrid = async (label) => {
                await page.goto(surl('/management/settings/access')); await idle(page);
                await page.getByRole('tab', {name: 'Roles'}).click(); await idle(page);
                await page.locator('[id^="component-grid-settings-roles-usergroupgrid"] tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
                const grid = await page.locator('[id^="component-grid-settings-roles-usergroupgrid"]').first().evaluate((g) => {
                    const heads = [...g.querySelectorAll('thead th')].map((th) => th.innerText.trim());
                    const rows = [...g.querySelectorAll('tr.gridRow')].map((tr) => ({cells: [...tr.querySelectorAll('td')].map((td) => { const i = td.querySelector('input[type=checkbox]'); return i ? (i.checked ? '[x]' : '[ ]') + (i.disabled ? 'd' : '') : td.innerText.trim().replace(/\s+/g, ' '); })}));
                    return {heads, rows};
                }).catch((e) => ({error: String(e.message)}));
                await snap(page, label, {grid});
                return grid;
            };
            const openRoleEdit = async (roleName) => {
                const row = page.getByRole('row').filter({has: page.getByText(roleName, {exact: true})}).first();
                await row.getByRole('link', {name: 'Settings'}).click();
                await page.getByRole('link', {name: 'Edit', exact: true}).first().click();
                const form = page.getByRole('dialog').filter({has: page.locator('input[name="permitMetadataEdit"]')}).last();
                await form.locator('input[name="permitMetadataEdit"]').waitFor({timeout: 30000});
                await idle(page);
                return form;
            };
            const stageBoxes = (form) => form.locator('input[type=checkbox]').evaluateAll((els) => els.map((i) => ({name: i.name, value: i.value, label: (i.closest('li,label') || {}).innerText?.trim(), checked: i.checked})));
            const setStage = async (roleName, stageLabel, want, label) => {
                const form = await openRoleEdit(roleName);
                const before = await stageBoxes(form);
                const cb = form.getByRole('checkbox', {name: stageLabel, exact: true});
                await cb.setChecked(want);
                await snap(page, `${label}-form`, {before});
                await form.getByRole('button', {name: 'OK', exact: true}).last().click();
                await idle(page); await page.waitForTimeout(800);
                const msg = await page.locator('.pkp_notification, [role=status], [role=alert]').evaluateAll((els) => els.map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                record(`${label}-saved`, {msg});
                return {before: before.filter((b) => /Stage|stage|Submission|Review|Copyediting|Production/.test(b.label || '')), msg};
            };
            const prodRead = async (label) => {
                await page.goto(app.url(`/index.php/${t}/dashboard/editorial?workflowSubmissionId=${sc.set.id}&workflowMenuKey=workflow_5`)); await idle(page);
                await page.locator('[data-cy="workflow-secondary-items"] li').first().waitFor({timeout: 15000}).catch(() => {});
                const info = await panelInfo(page);
                const w = await openAssign();
                const opts = await w.locator('select[name="filterUserGroupId"] option').evaluateAll((els) => els.map((o) => o.text.trim()));
                await snap(page, label, {panelInfo: info, opts});
                await pressCancel(w);
                return {rows: (info.rows || []).map((r) => r.lines.join(' / ')), opts};
            };
            const first = async (label) => {
                if (isOPS) return null;
                await page.goto(app.url(`/index.php/${t}/dashboard/editorial?workflowSubmissionId=${sc.set.id}&workflowMenuKey=workflow_1`)); await idle(page);
                await page.locator('[data-cy="workflow-secondary-items"] li').first().waitFor({timeout: 15000}).catch(() => {});
                const info = await panelInfo(page);
                await snap(page, label, {panelInfo: info});
                return (info.rows || []).map((r) => r.lines.join(' / '));
            };
            sc.set.gridBefore = await rolesGrid('set-grid-before');
            sc.set.prodBefore = await prodRead('set-prod-before');
            sc.set.subBefore = await first('set-sub-before');
            // untick end: the Section editor's Production (OJS/OMP); OPS: the Moderator's only stage
            await rolesGrid('set-grid-pre-untick');
            sc.set.untick = await setStage(L.se, 'Production', false, 'set-untick-se-prod');
            sc.set.gridAfterUntick = await rolesGrid('set-grid-after-untick');
            sc.set.prodAfterUntick = await prodRead('set-prod-after-untick');
            sc.set.subAfterUntick = await first('set-sub-after-untick');
            // tick end: the Copyeditor's (OPS: Editorial Board Member's) Production
            await rolesGrid('set-grid-pre-tick');
            sc.set.tick = await setStage(isOPS ? 'Editorial Board Member' : L.ce, 'Production', true, 'set-tick-prod');
            sc.set.gridAfterTick = await rolesGrid('set-grid-after-tick');
            sc.set.prodAfterTick = await prodRead('set-prod-after-tick');
            // leave the Roles "Edit" window with a change unsaved
            await rolesGrid('set-grid-pre-leave');
            {
                const form = await openRoleEdit(L.au);
                const cb = form.getByRole('checkbox', {name: 'Production', exact: true});
                await cb.setChecked(!(await cb.isChecked()));
                const n0 = jsDialogs.length;
                const how = await pressCancel(form);
                const stillOpen = await form.isVisible().catch(() => false);
                await snap(page, 'set-role-edit-left-unsaved', {how, stillOpen, dialogs: jsDialogs.slice(n0)});
                sc.set.leave = {how, stillOpen, dialogs: jsDialogs.slice(n0)};
                if (stillOpen) await page.keyboard.press('Escape');
            }
            sc.set.gridAfterLeave = await rolesGrid('set-grid-after-leave');
            save();
            log('[settings]', JSON.stringify({untick: sc.set.untick, prodBefore: sc.set.prodBefore, prodAfterUntick: sc.set.prodAfterUntick, subAfterUntick: sc.set.subAfterUntick, prodAfterTick: sc.set.prodAfterTick, leave: sc.set.leave}).slice(0, 3500));
        });

        // ---- leave: the workflow left with a person chosen in "Assign" (the stage menu, then the window's close) ------------
        if (on('leave')) await sect('leave', async () => {
            await signInAs('mgr');
            const s1 = sc.subs.s1;
            const st = stagesOf(s1)[0];
            sc.leave = {};
            await openStage(s1.id, st, 'lv-before');
            let w = await openAssign();
            await searchAs(w, L.se, nm('se2'));
            await w.locator('input[name="userId"]').first().check({force: true});
            await idle(page);
            let n0 = jsDialogs.length;
            const closeBtn = w.getByRole('button', {name: 'Close', exact: true}).first();
            await closeBtn.click().catch(() => {});
            await idle(page); await page.waitForTimeout(600);
            sc.leave.closeButton = {dialogs: jsDialogs.slice(n0), stillOpen: await w.isVisible().catch(() => false)};
            await snap(page, 'lv-after-close', {leave: sc.leave.closeButton});
            await openStage(s1.id, st, 'lv-before2');
            w = await openAssign();
            await searchAs(w, L.se, nm('se2'));
            await w.locator('input[name="userId"]').first().check({force: true});
            await idle(page);
            n0 = jsDialogs.length;
            await page.goto(ctxUrl('/dashboard/editorial')).catch((e) => log('goto', e.message));
            await idle(page);
            sc.leave.navigate = {dialogs: jsDialogs.slice(n0), url: page.url()};
            await snap(page, 'lv-after-navigate', {leave: sc.leave.navigate});
            // nothing saved: the panel still lacks se2
            const info = await openStage(s1.id, st, 'lv-after-check');
            sc.leave.rowsAfter = (info.rows || []).map((r) => r.lines.join(' / '));
            save();
            log('[leave]', JSON.stringify(sc.leave));
        });
        // ---- leftover: "Permissions" ticked by a Section Editor pick survives a switch to Author and is saved (S2) ----------
        if (on('leftover')) await sect('leftover', async () => {
            const s2 = sc.subs[isOPS ? 's3' : 's2'];
            const st = stagesOf(s2)[0];
            await signInAs('mgr');
            sc.leftover = {};
            await openStage(s2.id, st, 'lo-before');
            const w = await openAssign();
            let people = await searchAs(w, L.se, nm('se2'));
            await w.locator(`input[name="userId"][value="${people[0].value}"]`).check({force: true}); await idle(page);
            sc.leftover.afterSe = await boxesOf(w);
            people = await searchAs(w, L.au, nm('au2'));
            await w.locator(`input[name="userId"][value="${people[0].value}"]`).check({force: true}); await idle(page);
            sc.leftover.afterAuthor = await boxesOf(w);
            await snap(page, 'lo-author-chosen', {boxes: sc.leftover.afterAuthor});
            await w.getByRole('button', {name: 'OK', exact: true}).last().click();
            await w.waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
            await idle(page); await page.waitForTimeout(600);
            const info = await openStage(s2.id, st, 'lo-after');
            sc.leftover.rows = (info.rows || []).map((r) => r.lines.join(' / '));
            await clickMenu(new RegExp(nm('au2')), 'Edit');
            const e = await legacyWindow(/Edit Assignment/);
            sc.leftover.saved = await editFormInfo(e);
            await snap(page, 'lo-author-edit', {saved: sc.leftover.saved});
            await pressCancel(e);
            save();
            log('[leftover]', JSON.stringify({afterSe: sc.leftover.afterSe, afterAuthor: sc.leftover.afterAuthor, saved: sc.leftover.saved && sc.leftover.saved.canChangeMetadata, rows: sc.leftover.rows}));
        });
        // ---- extra: a recommending Section Editor on a Guest editor's row (OJS); the manager's "Edit" on manager-level rows;
        //      unassigned Guest editor and assistant opening the submission ------------------------------------------------
        if (on('extra')) await sect('extra', async () => {
            sc.extra = sc.extra || {};
            if (isOJS && !sc.subs.s7) {
                const r = await app.api.createSubmission({tag: `${sc.tag}s7`, context: sc.contextPath, submitter: u('au'), title: `K1 S7 ${sc.tag}`,
                    participants: [{username: u('serec'), role: 'sectionEditor', recommendOnly: true}, {username: u('ge'), role: 'guestEditor'}]});
                sc.subs.s7 = {id: r.submissionId, stageId: r.stageId, rounds: []};
                save();
            }
            if (isOJS) {
                await signInAs('serec');
                const info = await openStage(sc.subs.s7.id, {key: 'workflow_1'}, 'ex-serec-s7');
                sc.extra.serecOnGe = await allMenus('ex-serec-s7', info);
            }
            // the manager's "Edit" on a manager-level row: which boxes the window shows
            await signInAs('mgr');
            const st5 = stagesOf(sc.subs.s1).find((x) => x.id === 5);
            for (const k of isOPS ? ['mgr2'] : ['ed', 'pe']) {
                await openStage(sc.subs.s1.id, st5, `ex-mgr-edit-${k}-panel`);
                await clickMenu(new RegExp(nm(k)), 'Edit');
                const w = await legacyWindow(/Edit Assignment/);
                sc.extra[`mgrEdit_${k}`] = await editFormInfo(w);
                await snap(page, `ex-mgr-edit-${k}`, {form: sc.extra[`mgrEdit_${k}`]});
                await pressCancel(w);
            }
            // unassigned Guest editor (OJS) and assistant (OJS/OMP) opening S1
            for (const k of isOPS ? [] : [...(isOJS ? ['ge2'] : []), 'ce2']) {
                await signInAs(k);
                const a = await openStage(sc.subs.s1.id, stagesOf(sc.subs.s1).find((x) => x.id === (k === 'ce2' ? 4 : 1)), `ex-${k}-s1`);
                sc.extra[`open_${k}`] = {url: page.url(), panel: a.panel, bodyStart: flat(a.bodyStart, 300)};
            }
            save();
            log('[extra]', JSON.stringify(sc.extra).slice(0, 3000));
        });
    } finally {
        record('k1-js-dialogs', jsDialogs);
        await close();
    }
});
