// U35 claim check, chunk K4: "Edit Assignment", the two limits, "Remove",
// "Notify" (all three apps).
// Spec: docs/specs/U35-stage-participants.md — Fields "Edit Assignment" and
// "Notify" (100–118), Rules 8–11 (227–279), Side effects "On Edit" and "On
// Remove" (331–341), Settings bullets "recommend only" and "Permit submission
// metadata edit." (354–367), register A1, A2, A5, A7.
//
// Context A (one per app), users (OPS: no ed/pe/ge/ce; mgr2 and edr are Preprint Server managers):
//   mgr manager · ed editor · edr editor (recommend-only on E and D) · pe productionEditor · ge guestEditor (OJS)
//   se, se2, ser (recommend-only), seA, seB sectionEditor · ce copyeditor · dual sectionEditor+copyeditor
//   (OPS: +author) · au author (submitter of everything)
// Submissions (OJS/OMP; OPS all at Production):
//   E  Copyediting: ed, edr(ro), pe, se, se2, ser(ro), ge, ce       → Rule 8 by role (mgr, se, ser, edr, ge, pe), A1, 8d, 8f, gate
//   A  Submission:  none                                               → td1, td4, td8/A7, td11, Notify (A3, A5)
//   R  Copyediting via accept: ed, se, ce, dual(se+ce)                 → Rule 10 as mgr: Cancel, OK, every stage, discussions, notice box, log
//   N  Submission:  se only                                            → removing the last editor → "Needs editor"
//   T  Submission:  ed, se                                             → td10: se removes ed, then own row
//   Q  Review round: se, ser(ro)                                       → A2: ser removes the deciding se (Rule 9 both ends)
//   D  Review round: edr(ro), se                                       → td9: recommending Editor; control ed unassigned
//   D2 Review round: edr(ro) only                                      → td9 other end: no deciding editor
// Context B (settings): mgr, sea (sectionEditor on the first section), seb, au; X0, X1 carry sea before the
//   Roles change, X2 after (Assign pre-ticks), X3 (OJS, OPS) a draft the author submits through the wizard after
//   the change (automatic assignment; none happens on a scratch context, see cc-K4.md) → Settings bullets
// Context C (OJS/OMP): ed, ce, le; C1 at Copyediting (accept path), C2 at Production → the notice box after Remove
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U35/K4/k4.js
//   PHASES=seed,mgr,mgr8f,se,ser,edr,ge,pe,gate,assign,notify,remove,notice,needs,seremove,a2,td9,roles,settings
//   (default all; state in .reports/U35/ccK4/k4-state-<app>.json, so a phase re-run reuses the seed;
//   notifyleave and remove2 re-run single legs of notify and remove)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'mgr', 'mgr8f', 'se', 'ser', 'edr', 'ge', 'pe', 'gate', 'assign', 'notify', 'remove', 'notice', 'needs', 'seremove', 'a2', 'td9', 'roles', 'settings'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);

async function sect(name, fn) {
    try { return await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
        record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1200)});
        return null;
    }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

// A page-level watcher for notices and toasts: every added node whose text matches a known notice
// phrase is logged with its time and ancestry, so a toast that vanishes is still seen.
const NOTICE_WATCH = () => {
    window.__k4n = [];
    const re = /stage assignment has been changed|added as a stage participant|Notification sent|removed|Please ensure|required|not saved|error|Error/i;
    const start = Date.now();
    const obs = new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
            const el = n.nodeType === 1 ? n : n.parentElement;
            if (!el) continue;
            const t = (el.innerText || el.textContent || '').trim();
            if (!t || t.length > 400 || !re.test(t)) continue;
            const chain = [];
            let p = el;
            for (let i = 0; p && i < 6; i++, p = p.parentElement) chain.push(`${p.tagName.toLowerCase()}${p.id ? '#' + p.id : ''}${p.getAttribute && p.getAttribute('role') ? '[role=' + p.getAttribute('role') + ']' : ''}${p.className && typeof p.className === 'string' ? '.' + p.className.split(/\s+/).slice(0, 3).join('.') : ''}`);
            window.__k4n.push({ms: Date.now() - start, at: Date.now(), text: t.replace(/\s+/g, ' ').slice(0, 200), chain});
        }
    });
    const go = () => obs.observe(document.documentElement, {childList: true, subtree: true, characterData: false});
    if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go);
};
const noticesSince = (page, t0) => page.evaluate((t) => (window.__k4n || []).filter((x) => x.at >= t).map((x) => ({...x, afterPressMs: x.at - t})), t0).catch(() => []);
const nowIn = (page) => page.evaluate(() => Date.now()).catch(() => Date.now());

const wf = (page) => page.locator('[role="dialog"]:visible').first();
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
const dialogTexts = (page) => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        role: d.getAttribute('role'),
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 4000),
    }))).catch(() => []);

// The Participants panel as data: every row's lines and its menu button, the panel's own buttons.
const panelRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.innerText.trim()));
    if (!h) return {present: false};
    let box = h.parentElement;
    for (let i = 0; i < 4 && box && !box.querySelector('ul, [role=list]'); i++) box = box.parentElement;
    const items = box ? [...box.querySelectorAll('li')].filter(vis).map((li) => ({
        lines: li.innerText.split('\n').map((s) => s.trim()).filter(Boolean),
        button: [...li.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()),
    })) : [];
    const buttons = box ? [...box.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter((t) => !/More Actions$/.test(t)) : [];
    return {present: true, heading: h.innerText.trim(), items, buttons};
});
// The discussions panel (the stage's "… Tasks & Discussions") as text rows.
const discussionsRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /Tasks & Discussions|Discussions/i.test(x.innerText.trim()));
    if (!h) return null;
    let box = h.parentElement;
    for (let i = 0; i < 4 && box && !box.querySelector('table'); i++) box = box.parentElement;
    const rows = box ? [...box.querySelectorAll('tbody tr')].filter(vis).map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter((t) => t && !/^(Yet to begin|In progress|Closed|No Items)$/.test(t)) : [];
    return {heading: h.innerText.trim(), rows};
});
// The workflow page's action buttons (decisions, recommendations) and header line.
const actionsRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const region = dlg.querySelector('[data-cy="workflow-action-items"]');
    const buttons = region ? [...region.querySelectorAll('button, a')].filter(vis).map((b) => b.innerText.trim()).filter(Boolean) : null;
    const hs = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((h) => ({h: h.innerText.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null})).filter((x) => /Recommendation|Notification|Status|WORKFLOW|Workflow|access/i.test(x.h));
    const text = dlg.innerText;
    const noAccess = /You don't currently have access to that stage of the workflow\.|do not have access|not authorized/i.test(text) ? text.split('\n').filter((l) => /access|authori/i.test(l)).slice(0, 5) : null;
    return {actionButtons: buttons, boxes: hs.slice(0, 12), noAccess};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), color: getComputedStyle(e).color, cls: String(e.className).slice(0, 160)}))).catch(() => []);

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const L = {
        editor: isOMP ? 'Press editor' : 'Journal editor',
        se: isOMP ? 'Series editor' : isOPS ? 'Moderator' : 'Section editor',
        mgrRole: isOMP ? 'Press manager' : isOPS ? 'Preprint Server manager' : 'Journal manager',
        stageE: isOPS ? 'workflow_5' : 'workflow_4',
        stageA: isOPS ? 'workflow_5' : 'workflow_1',
        discTemplateA: isOPS ? 'Discussion (Production)' : 'Discussion (Submission)',
        discTemplateE: isOPS ? 'Discussion (Production)' : 'Discussion (Copyediting)',
    };

    // ---- seeding -------------------------------------------------------------------------------
    if (on('seed') && !sc.ctx) {
        const t = tag('u35k4');
        const U = (k, roles, g, f, extra) => ({username: `${t}${k}`, roles, givenName: g, familyName: f, ...(extra || {})});
        const users = [U('mgr', ['manager'], 'Mira', 'Manager'), U('au', ['author'], 'Ava', 'Author'),
            U('se', ['sectionEditor'], 'Sam', 'Section'), U('se2', ['sectionEditor'], 'Sue', 'Second'),
            U('ser', ['sectionEditor'], 'Rex', 'Recommender'), U('sea', ['sectionEditor'], 'Ann', 'Assignee'),
            U('seb', ['sectionEditor'], 'Ben', 'Bystander')];
        if (isOPS) {
            users.push(U('mgr2', ['manager'], 'Mona', 'Othermanager'), U('edr', ['manager'], 'Erin', 'Recmanager'), U('dual', ['sectionEditor', 'author'], 'Dana', 'Dual'));
        } else {
            users.push(U('ed', ['editor'], 'Eddie', 'Editor'), U('edr', ['editor'], 'Erin', 'Receditor'), U('pe', ['productionEditor'], 'Pat', 'Production'),
                U('ce', ['copyeditor'], 'Cora', 'Copy'), U('dual', ['sectionEditor', 'copyeditor'], 'Dana', 'Dual'));
            if (isOJS) users.push(U('ge', ['guestEditor'], 'Gil', 'Guest'));
        }
        const ctx = await app.api.createContext({tag: t, context: {name: `U35 K4 ${t}`, contactName: 'K4 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.ctx = ctx.path || t; sc.t = t;
        sc.u = Object.fromEntries(users.map((u) => [u.username.slice(t.length), {username: u.username, name: `${u.givenName} ${u.familyName}`}]));
        save();
        const P = (k, role, extra) => ({username: `${t}${k}`, role, ...(extra || {})});
        const mk = async (key, title, decisionsList, participants, extra) => {
            let lastErr = null;
            for (const decisions of decisionsList) {
                try {
                    const body = {tag: `${t}${key.toLowerCase()}`, context: sc.ctx, submitter: `${t}au`, title: `${title} ${t}`, participants, ...(extra || {})};
                    if (decisions.length) body.decisions = decisions;
                    const s = await app.api.createSubmission(body);
                    sc[key] = {id: s.submissionId, pub: s.publicationId, stage: s.stageId, rounds: s.reviewRounds, title: body.title, decisions};
                    save();
                    log(`[seed] ${key} #${s.submissionId} stage ${s.stageId} rounds ${JSON.stringify(s.reviewRounds)}`);
                    return;
                } catch (e) { lastErr = e; log(`[seed ${key} try ${JSON.stringify(decisions)}]`, String(e.message).slice(0, 300)); }
            }
            sc[`${key}err`] = String(lastErr && lastErr.message).slice(0, 600); save();
        };
        const toCopy = [['skipExternalReview'], ['acceptAndSkipReview'], ['skipReview']];
        const toReview = [['sendExternalReview']];
        const toCopyAccept = [['sendExternalReview', 'accept'], ['sendExternalReview', 'acceptFromReview']];
        if (isOPS) {
            await mk('E', 'K4 edit', [[]], [P('mgr2', 'manager'), P('edr', 'manager', {recommendOnly: true}), P('se', 'sectionEditor'), P('se2', 'sectionEditor'), P('ser', 'sectionEditor', {recommendOnly: true})]);
            await mk('A', 'K4 assign', [[]], []);
            await mk('R', 'K4 remove', [[]], [P('mgr2', 'manager'), P('se', 'sectionEditor'), P('dual', 'sectionEditor'), P('dual', 'author')]);
            await mk('N', 'K4 needs', [[]], [P('se', 'sectionEditor')]);
            await mk('T', 'K4 seremove', [[]], [P('mgr2', 'manager'), P('se', 'sectionEditor')]);
            await mk('Q', 'K4 recremove', [[]], [P('se', 'sectionEditor'), P('ser', 'sectionEditor', {recommendOnly: true})]);
            await mk('D', 'K4 receditor', [[]], [P('edr', 'manager', {recommendOnly: true}), P('se', 'sectionEditor')]);
            await mk('D2', 'K4 receditor alone', [[]], [P('edr', 'manager', {recommendOnly: true})]);
        } else {
            const eParts = [P('ed', 'editor'), P('edr', 'editor', {recommendOnly: true}), P('pe', 'productionEditor'), P('se', 'sectionEditor'), P('se2', 'sectionEditor'), P('ser', 'sectionEditor', {recommendOnly: true}), P('ce', 'copyeditor')];
            if (isOJS) eParts.push(P('ge', 'guestEditor'));
            await mk('E', 'K4 edit', toCopy, eParts);
            await mk('A', 'K4 assign', [[]], []);
            await mk('R', 'K4 remove', toCopyAccept, [P('ed', 'editor'), P('se', 'sectionEditor'), P('ce', 'copyeditor'), P('dual', 'sectionEditor'), P('dual', 'copyeditor')]);
            await mk('N', 'K4 needs', [[]], [P('se', 'sectionEditor')]);
            await mk('T', 'K4 seremove', [[]], [P('ed', 'editor'), P('se', 'sectionEditor')]);
            await mk('Q', 'K4 recremove', toReview, [P('se', 'sectionEditor'), P('ser', 'sectionEditor', {recommendOnly: true})]);
            await mk('D', 'K4 receditor', toReview, [P('edr', 'editor', {recommendOnly: true}), P('se', 'sectionEditor')]);
            await mk('D2', 'K4 receditor alone', toReview, [P('edr', 'editor', {recommendOnly: true})]);
        }
        record('seed', sc);
    }
    if (!sc.ctx) { log('[k4] no context; run the seed phase'); return; }
    const t = sc.t;
    const u = sc.u;
    const ctxUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (id, key, ctx = sc.ctx) => ctxUrl(ctx, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const roundKey = (s) => (s.rounds && s.rounds[0] ? `workflow_${s.rounds[0].stageId}_${s.rounds[0].id}` : 'workflow_3');
    const mailOf = (k) => `${u[k].username}@mail.test`;

    // ---- browser helpers ---------------------------------------------------------------------------
    const dialogsSeen = [];
    let dialogAnswer = 'accept';
    async function session() {
        const {page, context, close} = await launch(app);
        await context.addInitScript(NOTICE_WATCH);
        page.on('dialog', async (d) => {
            dialogsSeen.push({at: new Date().toISOString(), type: d.type(), message: d.message(), answer: dialogAnswer});
            if (dialogAnswer === 'accept') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
        });
        return {page, close};
    }
    const as = async (page, k, ctx = sc.ctx) => { await signIn(page, u[k].username, {contextPath: ctx}); await idle(page); };
    async function openWf(page, id, key, label, ctx) {
        await page.goto(wfUrl(id, key, ctx)); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const panel = await panelRead(page).catch((e) => ({error: String(e.message)}));
        const disc = await discussionsRead(page).catch(() => null);
        const actions = await actionsRead(page).catch(() => null);
        await snap(page, label, {panel, discussions: disc, actions});
        log(`[${label}]`, JSON.stringify((panel.items || []).map((i) => i.lines.join('/'))), '| actions:', JSON.stringify(actions && actions.actionButtons), actions && actions.noAccess ? `| noAccess ${JSON.stringify(actions.noAccess)}` : '');
        return {panel, disc, actions};
    }
    const moreBtn = (page, k) => wf(page).getByRole('button', {name: `${u[k].name} More Actions`, exact: true});
    async function openMenu(page, k, nth = 0) {
        const btn = moreBtn(page, k);
        if ((await btn.count()) <= nth) return {absent: true};
        await btn.nth(nth).click();
        await page.locator('[role="menuitem"]').first().waitFor({timeout: 10000}).catch(() => {});
        return {btn: btn.nth(nth), items: await menuItems(page)};
    }
    async function closeMenu(page, m) {
        if (m && m.btn && (await page.locator('[role="menuitem"]:visible').count())) { await m.btn.click().catch(() => {}); await sleep(250); }
    }
    // Every row's menu, as data.
    async function allMenus(page, label, keys) {
        const out = {};
        for (const k of keys) {
            const m = await openMenu(page, k);
            out[k] = m.absent ? 'no row' : m.items.map((i) => i.text);
            if (!m.absent) { if (k === keys[0]) out._colors = m.items; await closeMenu(page, m); }
        }
        record(`${label}-menus`, out);
        log(`[${label} menus]`, JSON.stringify(out));
        return out;
    }
    const editWinLoc = (page) => page.getByRole('dialog').filter({hasText: 'Edit Assignment'}).last();
    async function readEditForm(page) {
        const win = editWinLoc(page);
        return win.evaluate((d) => {
            const vis = (e) => e.getClientRects().length > 0;
            const box = (n) => { const i = d.querySelector(`input[name="${n}"]`); if (!i) return null; const l = (i.id && d.querySelector(`label[for="${i.id}"]`)) || i.closest('label'); return {visible: vis(i), checked: i.checked, disabled: i.disabled, label: l ? l.innerText.trim().replace(/\s+/g, ' ') : null}; };
            const bold = [...d.querySelectorAll('b, strong')].filter(vis).map((b) => b.innerText.trim());
            const headings = [...d.querySelectorAll('h1,h2,h3,h4,legend,label.pkp_form_label, .label')].filter(vis).map((h) => h.innerText.trim()).filter(Boolean);
            const controls = [...d.querySelectorAll('button, a, input[type=submit]')].filter(vis).map((b) => ({tag: b.tagName, text: (b.innerText || b.value || b.getAttribute('aria-label') || '').trim()})).filter((x) => x.text);
            const textareas = [...d.querySelectorAll('textarea, select')].map((x) => x.name);
            return {text: d.innerText.slice(0, 2000), recommendOnly: box('recommendOnly'), canChangeMetadata: box('canChangeMetadata'), bold, headings, controls, fields: textareas};
        }).catch((e) => ({error: String(e.message)}));
    }
    // Row menu → "Edit"; read the window; optionally change boxes and press OK / Cancel / the close control.
    async function editRow(page, k, label, {set, press = 'cancel', answer = 'accept'} = {}) {
        const m = await openMenu(page, k);
        if (m.absent) { record(`${label}-edit`, {rowAbsent: true}); return {rowAbsent: true}; }
        const edit = page.getByRole('menuitem', {name: 'Edit', exact: true});
        if (!(await edit.count())) { await closeMenu(page, m); record(`${label}-edit`, {editOffered: false, menu: m.items.map((i) => i.text)}); log(`[${label}] Edit not offered`, JSON.stringify(m.items.map((i) => i.text))); return {editOffered: false, menu: m.items.map((i) => i.text)}; }
        await edit.click();
        const win = editWinLoc(page);
        await win.waitFor({timeout: 30000});
        await win.locator('form').getByRole('button', {name: 'OK', exact: true}).waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        const before = await readEditForm(page);
        const s = await snap(page, `${label}-edit-open`, {menu: m.items, form: before});
        await loc(page, `Edit Assignment window (${label})`, win);
        log(`[${label} edit]`, JSON.stringify({ro: before.recommendOnly, md: before.canChangeMetadata, bold: before.bold, text: flat(before.text, 220)}));
        const out = {menu: m.items.map((i) => i.text), before, title: (s.aria.dialogs || []).length};
        if (set) {
            for (const [n, v] of Object.entries(set)) {
                const i = win.locator(`input[name="${n}"]`);
                if (await i.count() && await i.isVisible()) { if (v) await i.check(); else await i.uncheck(); } else out[`cannotSet_${n}`] = true;
            }
        }
        const t0 = await nowIn(page);
        const nDialogs = dialogsSeen.length;
        dialogAnswer = answer;
        if (press === 'ok') {
            const resp = page.waitForResponse((r) => /saveParticipant|save-participant/i.test(r.url()), {timeout: 20000}).catch(() => null);
            await win.locator('form').getByRole('button', {name: 'OK', exact: true}).click();
            const r = await resp;
            out.saveStatus = r ? r.status() : null;
            out.saveUrl = r ? r.url().replace(/^.*index\.php/, '') : null;
            if (r) { const b = await r.text().catch(() => ''); out.saveAnswer = {status: (b.match(/"status":\s*(true|false)/) || [])[1], hasContent: /"content":\s*"</.test(b), event: (b.match(/"event":\s*\{[^}]*"name":\s*"([^"]+)"/) || [])[1] || null, len: b.length}; }
        } else if (press === 'cancel') {
            const c = win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).or(win.locator('form').getByRole('button', {name: 'Cancel', exact: true})).first();
            await c.click();
        } else if (press === 'close') {
            await win.getByRole('button', {name: /^Close/}).first().click();
        }
        if (press) {
            await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
            await sleep(1500); await idle(page);
            out.windowStillOpen = await editWinLoc(page).isVisible().catch(() => false);
            out.browserDialogs = dialogsSeen.slice(nDialogs);
            out.notices = await noticesSince(page, t0);
            if (out.windowStillOpen) {
                out.after = await readEditForm(page);
                await snap(page, `${label}-edit-after-${press}`, {form: out.after, notices: out.notices});
            }
            out.panel = await panelRead(page).catch(() => null);
            await snap(page, `${label}-edit-${press}-panel`, {panel: out.panel, notices: out.notices, browserDialogs: out.browserDialogs});
            log(`[${label} edit ${press}]`, JSON.stringify({still: out.windowStillOpen, save: out.saveStatus, ans: out.saveAnswer, notices: out.notices.map((x) => `${x.ms}:${x.text}`), dlg: out.browserDialogs}));
        }
        dialogAnswer = 'accept';
        record(`${label}-edit`, out);
        return out;
    }
    // Leave a still-open Edit window (A1's redraw) by its Cancel.
    async function closeEditIfOpen(page) {
        const win = editWinLoc(page);
        if (await win.isVisible().catch(() => false)) {
            const c = win.getByRole('link', {name: /^\s*Cancel\s*$/}).or(win.getByRole('button', {name: 'Cancel', exact: true})).first();
            if (await c.count()) await c.click().catch(() => {}); else await win.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
            await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
            await idle(page);
        }
    }
    const removeDlg = (page) => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: 'Remove Participant'}).last();
    async function removeRow(page, k, label, {press = 'ok', nth = 0} = {}) {
        const m = await openMenu(page, k, nth);
        if (m.absent) { record(`${label}-remove`, {rowAbsent: true}); return {rowAbsent: true}; }
        const rem = page.getByRole('menuitem', {name: 'Remove', exact: true});
        if (!(await rem.count())) { await closeMenu(page, m); record(`${label}-remove`, {removeOffered: false, menu: m.items}); log(`[${label}] Remove not offered`); return {removeOffered: false, menu: m.items.map((i) => i.text)}; }
        const remItem = m.items.find((i) => i.text === 'Remove');
        await rem.click();
        const d = removeDlg(page);
        await d.waitFor({timeout: 15000}).catch(() => {});
        const dd = await d.evaluate((el) => ({role: el.getAttribute('role'), text: el.innerText, buttons: [...el.querySelectorAll('button')].map((b) => ({text: b.innerText.trim(), color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor, cls: String(b.className).slice(0, 160)}))})).catch((e) => ({error: String(e.message)}));
        await snap(page, `${label}-remove-dialog`, {dialog: dd, menuItem: remItem});
        await loc(page, `Remove Participant dialog (${label})`, d);
        const t0 = await nowIn(page);
        const out = {menu: m.items.map((i) => i.text), menuItem: remItem, dialog: dd};
        const btn = d.getByRole('button', {name: press === 'ok' ? 'OK' : 'Cancel', exact: true});
        const resp = press === 'ok' ? page.waitForResponse((r) => /deleteParticipant|delete-participant/i.test(r.url()), {timeout: 20000}).catch(() => null) : null;
        await btn.click();
        if (resp) { const r = await resp; out.status = r ? r.status() : null; if (r) { const b = await r.text().catch(() => ''); out.answer = flat(b, 300); } }
        await d.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await sleep(1500); await idle(page);
        out.notices = await noticesSince(page, t0);
        out.dialogsAfter = (await dialogTexts(page)).map((x) => ({role: x.role, name: x.name, text: flat(x.text, 300)}));
        out.panel = await panelRead(page).catch(() => null);
        out.actions = await actionsRead(page).catch(() => null);
        await snap(page, `${label}-remove-${press}`, {panel: out.panel, notices: out.notices, actions: out.actions});
        log(`[${label} remove ${press}]`, JSON.stringify({status: out.status, rows: out.panel && out.panel.items && out.panel.items.map((i) => i.lines.join('/')), notices: out.notices.map((x) => x.text)}));
        record(`${label}-remove`, out);
        return out;
    }
    const notifyWinLoc = (page) => page.getByRole('dialog').filter({has: page.locator('form select[name="template"]')}).filter({hasNotText: 'Locate a User'}).last();
    async function typeMessage(page, win, text) {
        const ta = win.locator('textarea[name="message"]');
        const id = await ta.getAttribute('id').catch(() => null);
        if (!id) return {typed: false};
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: 20000}).catch(() => {});
        const body = page.frameLocator(`#${id}_ifr`).locator('body');
        if (await body.count().catch(() => 0)) {
            await body.click();
            await page.keyboard.press('ControlOrMeta+a');
            await page.keyboard.press('Delete');
            if (text) await page.keyboard.type(text);
        } else {
            await page.evaluate(([i, v]) => { const e = window.tinymce.get(i); e.focus(); e.setContent(v); e.save(); e.fire('change'); }, [id, text]);
        }
        await sleep(300);
        return {typed: true, content: await page.evaluate((i) => window.tinymce.get(i).getContent({format: 'text'}), id).catch(() => null)};
    }
    async function readMsg(page, win) {
        const id = await win.locator('textarea[name="message"]').getAttribute('id').catch(() => null);
        if (!id) return null;
        return page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent({format: 'text'}) : document.getElementById(i).value), id).catch(() => null);
    }
    // Row menu → "Notify"; read; optionally choose a template, type a message; press Notify or the close control.
    async function notifyRow(page, k, label, {template, message, press = 'notify', answer = 'accept'} = {}) {
        const m = await openMenu(page, k);
        if (m.absent) { record(`${label}-notify`, {rowAbsent: true}); return {rowAbsent: true}; }
        const it = page.getByRole('menuitem', {name: 'Notify', exact: true});
        if (!(await it.count())) { await closeMenu(page, m); record(`${label}-notify`, {notifyOffered: false}); return {notifyOffered: false}; }
        await it.click();
        const win = notifyWinLoc(page);
        await win.waitFor({timeout: 30000});
        await win.locator('textarea[name="message"]').waitFor({state: 'attached', timeout: 20000}).catch(() => {});
        await idle(page);
        const read = await win.evaluate((d) => {
            const vis = (e) => e.getClientRects().length > 0;
            return {
                text: d.innerText.slice(0, 2000),
                headings: [...d.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((h) => h.innerText.trim()),
                options: [...d.querySelectorAll('select[name="template"] option')].map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected})),
                controls: [...d.querySelectorAll('button, a, input[type=submit]')].filter(vis).map((b) => ({tag: b.tagName, text: (b.innerText || b.value || b.getAttribute('aria-label') || '').trim()})).filter((x) => x.text),
                required: [...d.querySelectorAll('.req, .required, [required], label')].filter(vis).map((x) => x.innerText.trim()).filter(Boolean).slice(0, 12),
            };
        }).catch((e) => ({error: String(e.message)}));
        read.messageAtOpen = await readMsg(page, win);
        await snap(page, `${label}-notify-open`, {form: read});
        await loc(page, `Notify window (${label})`, win);
        const out = {menu: m.items.map((i) => i.text), open: read};
        if (template) {
            const opt = (read.options || []).find((o) => o.text === template);
            if (opt) { await win.locator('select[name="template"]').selectOption(opt.value); await idle(page); await sleep(1200); out.messageAfterTemplate = await readMsg(page, win); } else out.templateMissing = template;
        }
        if (message !== undefined) out.typed = await typeMessage(page, win, message);
        const t0 = await nowIn(page);
        const n0 = dialogsSeen.length;
        dialogAnswer = answer;
        if (press === 'notify') {
            const resp = page.waitForResponse((r) => /sendNotification|send-notification/i.test(r.url()), {timeout: 15000}).catch(() => null);
            await win.locator('form').getByRole('button', {name: 'Notify', exact: true}).click();
            const r = await resp;
            out.sendStatus = r ? r.status() : null;
            if (r) { const b = await r.text().catch(() => ''); out.sendAnswer = flat(b, 400); }
        } else if (press === 'close') {
            await win.getByRole('button', {name: /^Close/}).first().click();
        }
        if (press) {
            await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
            await sleep(1500); await idle(page);
            out.windowStillOpen = await notifyWinLoc(page).isVisible().catch(() => false);
            out.notices = await noticesSince(page, t0);
            out.browserDialogs = dialogsSeen.slice(n0);
            if (out.windowStillOpen) {
                out.after = await notifyWinLoc(page).evaluate((d) => ({text: d.innerText.slice(0, 1500), errors: [...d.querySelectorAll('.error, label.error, .pkp_form_error, [class*=rror]')].filter((e) => e.getClientRects().length).map((e) => ({text: e.innerText.trim(), cls: String(e.className).slice(0, 80), tag: e.tagName}))})).catch(() => null);
            }
            out.discussions = await discussionsRead(page).catch(() => null);
            await snap(page, `${label}-notify-${press}`, {notices: out.notices, after: out.after, discussions: out.discussions});
            log(`[${label} notify ${press}]`, JSON.stringify({still: out.windowStillOpen, status: out.sendStatus, ans: out.sendAnswer && out.sendAnswer.slice(0, 120), notices: out.notices.map((x) => x.text), errors: out.after && out.after.errors, disc: out.discussions && out.discussions.rows}));
        }
        dialogAnswer = 'accept';
        record(`${label}-notify`, out);
        return out;
    }
    async function closeNotifyIfOpen(page) {
        const win = notifyWinLoc(page);
        if (await win.isVisible().catch(() => false)) { dialogAnswer = 'accept'; await win.getByRole('button', {name: /^Close/}).first().click().catch(() => {}); await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {}); await idle(page); }
    }
    // "Assign" (the panel's button): choose the role, search, choose the person, a template, a message; OK.
    async function assign(page, label, {role, k, template, message, press = 'ok'}) {
        const btn = page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true});
        await btn.click();
        const modal = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
        await modal.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
        await idle(page);
        await modal.locator('select[name="filterUserGroupId"]').selectOption({label: role});
        await idle(page);
        await modal.getByRole('textbox', {name: 'Search User By Name'}).fill(u[k].username);
        await modal.getByRole('button', {name: 'Search', exact: true}).click();
        await idle(page);
        await modal.getByRole('row').filter({hasText: u[k].name}).locator('input[name="userId"]').check();
        await idle(page);
        const out = {boxes: {recommendOnly: await modal.locator('input[name="recommendOnly"]').evaluate((i) => ({visible: i.getClientRects().length > 0, checked: i.checked})).catch(() => null), canChangeMetadata: await modal.locator('input[name="canChangeMetadata"]').evaluate((i) => ({visible: i.getClientRects().length > 0, checked: i.checked})).catch(() => null)}};
        if (template) {
            const opts = await modal.locator('select[name="template"] option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
            out.templates = opts.map((o) => o.text);
            const o = opts.find((x) => x.text === template);
            if (o) { await modal.locator('select[name="template"]').selectOption(o.value); await idle(page); await sleep(1200); }
        }
        if (message !== undefined) out.typed = await typeMessage(page, modal, message);
        await snap(page, `${label}-assign-filled`, {assign: out});
        const t0 = await nowIn(page);
        if (press === 'ok') {
            const resp = page.waitForResponse((r) => /saveParticipant|save-participant/i.test(r.url()), {timeout: 20000}).catch(() => null);
            await modal.getByRole('button', {name: 'OK', exact: true}).click();
            const r = await resp;
            out.saveStatus = r ? r.status() : null;
            await modal.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        }
        await sleep(1500); await idle(page);
        out.notices = await noticesSince(page, t0);
        out.windowStillOpen = await modal.isVisible().catch(() => false);
        if (out.windowStillOpen && press === 'ok') {
            out.windowText = flat(await modal.innerText().catch(() => ''), 1500);
            await snap(page, `${label}-assign-still-open`, {assign: out});
            dialogAnswer = 'accept';
            const c = modal.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first();
            await c.click().catch(() => {});
            await modal.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
            await page.goto(page.url()); await idle(page);
            await wf(page).waitFor({timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
        }
        out.panel = await panelRead(page).catch(() => null);
        out.discussions = await discussionsRead(page).catch(() => null);
        await snap(page, `${label}-assign-after`, {notices: out.notices, panel: out.panel, discussions: out.discussions});
        log(`[${label} assign]`, JSON.stringify({boxes: out.boxes, notices: out.notices.map((x) => `${x.ms}:${x.text}:${x.chain.slice(0, 3).join('<')}`), rows: out.panel && out.panel.items && out.panel.items.map((i) => i.lines.join('/')), disc: out.discussions && out.discussions.rows}));
        record(`${label}-assign`, out);
        return out;
    }
    async function activityLog(page, label) {
        const btn = wf(page).getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); return null; }
        await btn.click();
        const dlg = page.locator('[role="dialog"]:visible').last();
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))).catch(() => []);
        await snap(page, label, {rows});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 8)).slice(0, 1600));
        // the log window's close leaves the workflow's rows unreadable behind it: land the page afresh
        await page.goto(page.url()); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        return rows;
    }
    async function tasksPanel(page, label) {
        const bell = page.getByRole('button', {name: /Tasks/}).first();
        if (!(await bell.count())) { record(label, {absent: true}); return null; }
        await bell.click();
        const d = page.locator('[role="dialog"]:visible').last();
        await d.locator('.pkp_controllers_grid, table').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return x && !/Loading/.test(x.innerText); }, null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const rows = await d.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 300))).catch(() => []);
        await snap(page, label, {rows});
        log(`[${label}]`, JSON.stringify(rows).slice(0, 1200));
        const close = d.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return rows;
    }
    // Open a discussion by its name from the stage's panel and read the window.
    async function openDiscussion(page, name, label, nth = 0) {
        const dlg = wf(page);
        const all = dlg.getByRole('button', {name: new RegExp(name)}).or(dlg.getByRole('link', {name: new RegExp(name)}));
        const link = (await all.count()) > nth ? all.nth(nth) : all.first();
        if (!(await link.count())) { record(label, {absent: name}); return null; }
        await link.click();
        await sleep(1500); await idle(page);
        const s = await snap(page, label, {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 2500)}))});
        const top = topWin(page);
        const c = top.getByRole('button', {name: 'Close', exact: true}).first();
        if (await c.count()) { await c.click().catch(() => {}); await idle(page); }
        await page.goto(page.url()); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        return s;
    }
    async function mailCount(k, contains) { return app.mail.count({to: mailOf(k), contains}).catch(() => null); }
    async function mailFind(k, contains, ms = 15000) { return app.mail.find({to: mailOf(k), contains, timeoutMs: ms}).then((m) => ({id: m.ID, subject: m.Subject, from: m.From && (m.From.Address || m.From), snippet: flat(m.Snippet, 200)})).catch((e) => ({none: String(e.message).slice(0, 160)})); }

    // ---- mgr: Rule 8 by row as Journal Manager, 8d, 8f, A7/td8, no email ----------------------
    if (on('mgr')) await sect('mgr', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const keys = isOPS ? ['mgr2', 'edr', 'se', 'se2', 'ser', 'au'] : ['ed', 'edr', 'pe', 'se', 'se2', 'ser', ...(isOJS ? ['ge'] : []), 'ce', 'au'];
            await openWf(page, sc.E.id, L.stageE, 'e-mgr');
            await allMenus(page, 'e-mgr', keys);
            for (const k of keys) await editRow(page, k, `e-mgr-${k}`, {press: 'cancel'});
            // 8d: tick the recommend-only box on se2 → OK (gain), then untick (lose); 8d notice; A7 log; no email
            await editRow(page, 'se2', 'e-mgr-se2-gain', {set: {recommendOnly: true}, press: 'ok'});
            await openWf(page, sc.E.id, L.stageE, 'e-mgr-after-gain');
            await editRow(page, 'se2', 'e-mgr-se2-lose', {set: {recommendOnly: false}, press: 'ok'});
            await openWf(page, sc.E.id, L.stageE, 'e-mgr-after-lose');
            await activityLog(page, 'e-mgr-log-after-edits');
            record('e-mgr-mail-se2', {se2: await mailCount('se2')});
            await signOut(page);
        } finally { await close(); }
    });
    if (on('mgr8f')) await sect('mgr8f', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await openWf(page, sc.E.id, L.stageE, 'e-mgr8f');
            // 8f: Cancel after a change: the prompt, dismissed (stay) then accepted (leave), then reopened
            await editRow(page, 'se2', 'e-mgr-se2-cancel-dismiss', {set: {recommendOnly: true}, press: 'cancel', answer: 'dismiss'});
            await closeEditIfOpen(page);
            await editRow(page, 'se2', 'e-mgr-se2-close-dismiss', {set: {recommendOnly: true}, press: 'close', answer: 'dismiss'});
            await closeEditIfOpen(page);
            await editRow(page, 'se2', 'e-mgr-se2-close-accept', {set: {recommendOnly: true}, press: 'close', answer: 'accept'});
            await editRow(page, 'se2', 'e-mgr-se2-reopen', {press: 'cancel'});
            record('e-mgr-browser-dialogs', dialogsSeen);
            await signOut(page);
        } finally { await close(); }
    });

    // ---- se: Rule 8 as the plain assigned Section Editor, A1 (td3) ------------------------------
    if (on('se')) await sect('se', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'se');
            const keys = isOPS ? ['mgr2', 'edr', 'se', 'se2', 'ser', 'au'] : ['ed', 'edr', 'pe', 'se', 'se2', 'ser', ...(isOJS ? ['ge'] : []), 'ce', 'au'];
            await openWf(page, sc.E.id, L.stageE, 'e-se');
            await allMenus(page, 'e-se', keys);
            for (const k of keys) if (k !== 'au') await editRow(page, k, `e-se-${k}`, {press: 'cancel'});
            // A1: the Author's row, tick Permissions, OK; then reopen
            await editRow(page, 'au', 'e-se-au-tick', {set: {canChangeMetadata: true}, press: 'ok'});
            await closeEditIfOpen(page);
            await openWf(page, sc.E.id, L.stageE, 'e-se-after-a1');
            await editRow(page, 'au', 'e-se-au-reopen', {press: 'cancel'});
            // A1 on an editor row too: untick se2's Permissions
            await editRow(page, 'se2', 'e-se-se2-untick', {set: {canChangeMetadata: false}, press: 'ok'});
            await closeEditIfOpen(page);
            await editRow(page, 'se2', 'e-se-se2-reopen', {press: 'cancel'});
            await signOut(page);
        } finally { await close(); }
    });

    // ---- ser: the recommending Section Editor ---------------------------------------------------
    if (on('ser')) await sect('ser', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'ser');
            const keys = isOPS ? ['mgr2', 'edr', 'se', 'se2', 'ser', 'au'] : ['ed', 'edr', 'pe', 'se', 'se2', 'ser', ...(isOJS ? ['ge'] : []), 'ce', 'au'];
            await openWf(page, sc.E.id, L.stageE, 'e-ser');
            await allMenus(page, 'e-ser', keys);
            for (const k of keys) await editRow(page, k, `e-ser-${k}`, {press: 'cancel'});
            await signOut(page);
        } finally { await close(); }
    });

    // ---- edr: the recommending Editor (manager-level): 8c ----------------------------------------
    if (on('edr')) await sect('edr', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'edr');
            const keys = isOPS ? ['mgr2', 'edr', 'se', 'se2', 'ser', 'au'] : ['ed', 'edr', 'pe', 'se', 'se2', 'ser', ...(isOJS ? ['ge'] : []), 'ce', 'au'];
            await openWf(page, sc.E.id, L.stageE, 'e-edr');
            await allMenus(page, 'e-edr', keys);
            for (const k of keys) await editRow(page, k, `e-edr-${k}`, {press: 'cancel'});
            // the "No changes" window's OK
            await editRow(page, isOPS ? 'mgr2' : 'ed', 'e-edr-nochange-ok', {press: 'ok'});
            await closeEditIfOpen(page);
            await signOut(page);
        } finally { await close(); }
    });

    // ---- ge (OJS): A1 as Guest Editor -----------------------------------------------------------
    if (on('ge') && isOJS) await sect('ge', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'ge');
            await openWf(page, sc.E.id, L.stageE, 'e-ge');
            await allMenus(page, 'e-ge', ['ed', 'se', 'ge', 'ce', 'au']);
            await editRow(page, 'ge', 'e-ge-own', {press: 'cancel'});
            await editRow(page, 'au', 'e-ge-au-tick', {set: {canChangeMetadata: true}, press: 'ok'});
            await closeEditIfOpen(page);
            await editRow(page, 'au', 'e-ge-au-reopen', {press: 'cancel'});
            await signOut(page);
        } finally { await close(); }
    });

    // ---- gate: the Author's publication edit, the permission off (default) then on --------------
    async function authorTitleSave(page, label) {
        await page.goto(ctxUrl(sc.ctx, `/dashboard/mySubmissions?workflowSubmissionId=${sc.E.id}`)); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        const entry = wf(page).getByRole('link', {name: 'Title & Abstract', exact: true}).first();
        if (!(await entry.count())) { await snap(page, `${label}-no-entry`); return {entry: false}; }
        await entry.click(); await idle(page);
        const start = Date.now();
        while (Date.now() - start < 20000 && !(await page.locator('iframe[id^="titleAbstract-title-control"]').count())) await sleep(250);
        await idle(page);
        const iframe = page.locator('iframe[id^="titleAbstract-title-control"]').first();
        const id = ((await iframe.getAttribute('id').catch(() => null)) || '').replace(/_ifr$/, '');
        const saveBtn = wf(page).getByRole('button', {name: 'Save', exact: true});
        const out = {saveOffered: await saveBtn.count(), saveEnabled: (await saveBtn.count()) ? await saveBtn.first().isEnabled() : null};
        const banner = ((await wf(page).innerText().catch(() => '')) || '').split('\n').filter((l) => /cannot|can not|permission|not allowed|read.only/i.test(l)).slice(0, 5);
        out.banner = banner;
        if (id && out.saveOffered && out.saveEnabled) {
            await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: 20000}).catch(() => {});
            await page.frameLocator(`#${id}_ifr`).locator('body').click();
            await page.keyboard.press('End');
            await page.keyboard.type(` ${label}`);
            const resp = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: 20000}).catch(() => null);
            await saveBtn.first().click();
            const r = await resp;
            out.apiStatus = r ? r.status() : null;
            await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 8000}).catch(() => {});
            out.status = await wf(page).locator('[role="status"]').allInnerTexts().catch(() => []);
            out.errors = await page.locator('[role="dialog"]:visible').evaluateAll((els) => els.map((e) => e.innerText).filter((x) => /not authori|error/i.test(x)).map((x) => x.slice(0, 300))).catch(() => []);
        }
        await snap(page, label, {gate: out});
        log(`[${label}]`, JSON.stringify(out).slice(0, 500));
        return out;
    }
    if (on('gate')) await sect('gate', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'au');
            await authorTitleSave(page, 'e-au-gate-before');
            await signOut(page);
            await as(page, 'mgr');
            await openWf(page, sc.E.id, L.stageE, 'e-mgr-gate');
            const cur = await editRow(page, 'au', 'e-mgr-au-state', {press: 'cancel'});
            const was = cur.before && cur.before.canChangeMetadata && cur.before.canChangeMetadata.checked;
            await editRow(page, 'au', 'e-mgr-au-flip', {set: {canChangeMetadata: !was}, press: 'ok'});
            await openWf(page, sc.E.id, L.stageE, 'e-mgr-gate-after');
            await editRow(page, 'au', 'e-mgr-au-reopen', {press: 'cancel'});
            record('e-gate-flip', {was, now: !was});
            await signOut(page);
            await as(page, 'au');
            await authorTitleSave(page, 'e-au-gate-after');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- pe (OJS/OMP): the Production editor's OK (manager-level; A1's control) -------------------
    if (on('pe') && !isOPS) await sect('pe', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'pe');
            await openWf(page, sc.E.id, L.stageE, 'e-pe');
            await allMenus(page, 'e-pe', ['ed', 'pe', 'se', 'ce', 'au']);
            await editRow(page, 'pe', 'e-pe-own', {press: 'cancel'});
            const cur = await editRow(page, 'ce', 'e-pe-ce-state', {press: 'cancel'});
            const was = cur.before && cur.before.canChangeMetadata && cur.before.canChangeMetadata.checked;
            await editRow(page, 'ce', 'e-pe-ce-flip', {set: {canChangeMetadata: !was}, press: 'ok'});
            await closeEditIfOpen(page);
            await editRow(page, 'ce', 'e-pe-ce-reopen', {press: 'cancel'});
            record('e-pe-flip', {was});
            await signOut(page);
        } finally { await close(); }
    });

    // ---- assign: td1 (notices), td4 (Assign with the blank list), td8/A7 ---------------------------
    if (on('assign')) await sect('assign', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const first = await openWf(page, sc.A.id, L.stageA, 'a-mgr');
            const has = (k) => ((first.panel && first.panel.items) || []).some((i) => i.lines.includes(u[k].name));
            // td1: an assignment with no message at all (the notice)
            if (!has('se')) await assign(page, 'a-mgr-se-plain', {role: L.se, k: 'se'});
            // td4: the list left blank, a message typed
            if (!has('sea')) await assign(page, 'a-mgr-sea-blank', {role: L.se, k: 'sea', message: `Hello from assign ${t}`});
            await openWf(page, sc.A.id, L.stageA, 'a-mgr-after-assigns');
            // td1/td8: Edit, untick Permissions, OK; the notice; the log
            await editRow(page, 'se', 'a-mgr-se-untick', {set: {canChangeMetadata: false}, press: 'ok'});
            await openWf(page, sc.A.id, L.stageA, 'a-mgr-after-edit');
            await editRow(page, 'se', 'a-mgr-se-reopen', {press: 'cancel'});
            await activityLog(page, 'a-mgr-log');
            // td4 control: a predefined message chosen
            if (!has('seb')) await assign(page, 'a-mgr-seb-template', {role: L.se, k: 'seb', template: L.discTemplateA, message: `Hello with template ${t}`});
            await openWf(page, sc.A.id, L.stageA, 'a-mgr-after-seb');
            const seb = await mailFind('seb', `Hello with template ${t}`);
            record('a-mail', {seb, seaAssignAfterControl: await mailCount('sea', `Hello from assign ${t}`), seaAny: await mailCount('sea'), seAny: await mailCount('se')});
            await activityLog(page, 'a-mgr-log-2');
            await signOut(page);
        } finally { await close(); }
    });

    // the leave prompt on "Notify": a typed message, then the window's close control (dismiss, then accept)
    async function notifyLeave(page) {
        await notifyRow(page, 'seb', 'n-mgr-seb-close-dismiss', {message: 'unsent text', press: 'close', answer: 'dismiss'});
        await closeNotifyIfOpen(page);
        record('n-browser-dialogs', dialogsSeen);
        record('n-mail-seb-unsent', {unsent: await mailCount('seb', 'unsent text')});
    }
    if (on('notifyleave')) await sect('notifyleave', async () => {
        const {page, close} = await session();
        try { await as(page, 'mgr'); await openWf(page, sc.A.id, L.stageA, 'n-mgr-leave'); await notifyLeave(page); await signOut(page); } finally { await close(); }
    });
    // ---- notify: the window, td11, A3 (blank list), a template sent, A5, the leave prompt ---------
    if (on('notify')) await sect('notify', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await openWf(page, sc.A.id, L.stageA, 'n-mgr');
            await notifyRow(page, 'au', 'n-mgr-au-empty', {press: 'notify'});
            await closeNotifyIfOpen(page);
            await notifyRow(page, 'au', 'n-mgr-au-blanklist', {message: `Hello from notify ${t}`, press: 'notify'});
            await closeNotifyIfOpen(page);
            await notifyRow(page, 'au', 'n-mgr-au-template', {template: L.discTemplateA, message: `Notify with template ${t}`, press: 'notify'});
            await closeNotifyIfOpen(page);
            await openWf(page, sc.A.id, L.stageA, 'n-mgr-after');
            await openDiscussion(page, L.discTemplateA.replace(/[()]/g, '.'), 'n-mgr-discussion-window');
            await notifyLeave(page);
            record('n-mail', {
                blank: await mailCount('au', `Hello from notify ${t}`),
                template: await mailFind('au', `Notify with template ${t}`),
                blankAfterControl: await mailCount('au', `Hello from notify ${t}`),
            });
            await activityLog(page, 'n-mgr-log');
            await signOut(page);
            await as(page, 'au');
            await tasksPanel(page, 'n-au-tasks');
            await signOut(page);
            // the assistant level (OJS/OMP): ce's menu and Notify on E's Copyediting
            if (!isOPS) {
                await as(page, 'ce');
                await openWf(page, sc.E.id, L.stageE, 'n-ce');
                await allMenus(page, 'n-ce', ['ed', 'se', 'ce', 'au']);
                await notifyRow(page, 'ce', 'n-ce-own', {press: null});
                await closeNotifyIfOpen(page);
                await notifyRow(page, 'se', 'n-ce-se-template', {template: L.discTemplateE, message: `From the copyeditor ${t}`, press: 'notify'});
                await closeNotifyIfOpen(page);
                record('n-ce-mail', {se: await mailFind('se', `From the copyeditor ${t}`)});
                await signOut(page);
            }
        } finally { await close(); }
    });

    // ---- remove: Rule 10 as Journal Manager on R ---------------------------------------------------
    if (on('remove')) await sect('remove', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const st = L.stageE;
            await openWf(page, sc.R.id, st, 'r-mgr-before');
            // a discussion with se and (OJS/OMP) the editor as participants, for the "leaves the discussions" line
            await notifyRow(page, 'se', 'r-mgr-notify-se', {template: L.discTemplateE, message: `Discussion for se ${t}`, press: 'notify'});
            await closeNotifyIfOpen(page);
            await notifyRow(page, isOPS ? 'mgr2' : 'ed', 'r-mgr-notify-ed', {template: L.discTemplateE, message: `Discussion for editor ${t}`, press: 'notify'});
            await closeNotifyIfOpen(page);
            await openWf(page, sc.R.id, st, 'r-mgr-before2');
            if (!isOPS) await openWf(page, sc.R.id, 'workflow_1', 'r-mgr-before-stage1');
            await openWf(page, sc.R.id, st, 'r-mgr-before3');
            // Cancel first, then OK, on the dual person's second-role row
            const dualRow = isOPS ? 'dual' : 'dual';
            await removeRow(page, dualRow, 'r-mgr-dual-cancel', {press: 'cancel'});
            if (!isOPS) {
                await removeRow(page, 'ce', 'r-mgr-ce-ok', {press: 'ok'});
                await openWf(page, sc.R.id, st, 'r-mgr-after-ce');
            }
            await removeRow(page, 'se', 'r-mgr-se-ok', {press: 'ok'});
            await removeRow(page, isOPS ? 'mgr2' : 'ed', 'r-mgr-ed-ok', {press: 'ok'});
            await openWf(page, sc.R.id, st, 'r-mgr-after');
            if (!isOPS) { await openWf(page, sc.R.id, 'workflow_1', 'r-mgr-after-stage1'); await openWf(page, sc.R.id, 'workflow_5', 'r-mgr-after-stage5'); await openWf(page, sc.R.id, st, 'r-mgr-after-back'); }
            await openDiscussion(page, 'Discussion', 'r-mgr-discussion-after');
            await openDiscussion(page, 'Discussion', 'r-mgr-discussion-after-2', 1);
            await removeRow(page, 'dual', 'r-mgr-dual-second-ok', {press: 'ok', nth: 1});
            await openWf(page, sc.R.id, st, 'r-mgr-after-dual');
            await activityLog(page, 'r-mgr-log');
            record('r-mail', {se: await mailCount('se'), ce: isOPS ? null : await mailCount('ce'), seDiscussion: await mailFind('se', `Discussion for se ${t}`, 5000)});
            await signOut(page);
            // the removed se: what the workflow shows
            await as(page, 'se');
            await openWf(page, sc.R.id, st, 'r-se-after-removed');
            await tasksPanel(page, 'r-se-tasks');
            await signOut(page);
        } finally { await close(); }
    });

    // (re-run helper: the two later reads of the remove phase alone)
    if (on('remove2')) await sect('remove2', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await openWf(page, sc.R.id, L.stageE, 'r-mgr-before-2');
            await openDiscussion(page, 'Discussion', 'r-mgr-discussion-after-2', 1);
            await removeRow(page, 'dual', 'r-mgr-dual-second-ok', {press: 'ok', nth: 1});
            await openWf(page, sc.R.id, L.stageE, 'r-mgr-after-dual');
            await signOut(page);
        } finally { await close(); }
    });
    // ---- notice: Remove re-reads the Copyediting and Production notice box (OJS/OMP; context C) -------------
    const noticeRead = (page) => page.evaluate(() => {
        const vis = (e) => e.getClientRects().length > 0;
        const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
        const t = dlg.innerText;
        const hits = ['Assign a copyeditor using the Assign link in the Participants list.', 'Awaiting Copyedits.', 'Assign a user to create galleys using the Assign link in the Participants list.', 'Awaiting Galleys.', 'Awaiting approval.', 'Catalog Management'].filter((x) => t.includes(x));
        return hits;
    }).catch(() => null);
    if (on('notice') && !isOPS) await sect('notice', async () => {
        if (!sc.C) {
            const tc = tag('u35k4c');
            const users = [{username: `${tc}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: `${tc}ed`, roles: ['editor'], givenName: 'Eddie', familyName: 'Editor'},
                {username: `${tc}ce`, roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copy'},
                {username: `${tc}le`, roles: ['layoutEditor'], givenName: 'Leo', familyName: 'Layout'},
                {username: `${tc}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}];
            const c = await app.api.createContext({tag: tc, context: {name: `U35 K4 C ${tc}`, contactName: 'K4 Contact', contactEmail: `${tc}contact@mail.test`}, users});
            sc.C = {ctx: c.path || tc, t: tc};
            for (const k of ['mgr', 'ed', 'ce', 'le', 'au']) u[`C${k}`] = {username: `${tc}${k}`, name: users.find((x) => x.username === `${tc}${k}`).givenName + ' ' + users.find((x) => x.username === `${tc}${k}`).familyName};
            let s1 = null;
            for (const decisions of [['sendExternalReview', 'accept'], ['sendExternalReview', 'acceptFromReview']]) {
                try { s1 = await app.api.createSubmission({tag: `${tc}c1`, context: sc.C.ctx, submitter: `${tc}au`, title: `K4 C copy ${tc}`, decisions, participants: [{username: `${tc}ed`, role: 'editor'}]}); break; } catch (e) { log('[seed C1]', String(e.message).slice(0, 200)); }
            }
            let s2 = null;
            for (const decisions of [['skipExternalReview', 'sendToProduction'], ['skipExternalReview', 'sendtoproduction']]) {
                try { s2 = await app.api.createSubmission({tag: `${tc}c2`, context: sc.C.ctx, submitter: `${tc}au`, title: `K4 C prod ${tc}`, decisions, participants: [{username: `${tc}ed`, role: 'editor'}]}); break; } catch (e) { log('[seed C2]', String(e.message).slice(0, 200)); }
            }
            sc.C.C1 = s1 && s1.submissionId; sc.C.C2 = s2 && s2.submissionId; save();
        }
        const C = sc.C;
        const {page, close} = await session();
        try {
            await as(page, 'Ced', C.ctx);
            // the notice follows the request discussion, so each assignment carries the stage's request message
            for (const [id, st, role, k, lab, tpl] of [[C.C1, 'workflow_4', 'Copyeditor', 'Cce', 'c1', 'Request Copyedit'], [C.C2, 'workflow_5', 'Layout Editor', 'Cle', 'c2', 'Ready for Production']]) {
                if (!id) continue;
                await openWf(page, id, st, `${lab}-ed-before`, C.ctx);
                const n0 = await noticeRead(page);
                await assign(page, `${lab}-ed-assign`, {role, k, template: tpl});
                const n1 = await noticeRead(page);
                await openWf(page, id, st, `${lab}-ed-after-assign`, C.ctx);
                const n2 = await noticeRead(page);
                await removeRow(page, k, `${lab}-ed-remove`, {press: 'ok'});
                const n3 = await noticeRead(page);
                await openWf(page, id, st, `${lab}-ed-after-remove`, C.ctx);
                const n4 = await noticeRead(page);
                record(`${lab}-notices`, {before: n0, afterAssignSamePage: n1, afterAssignRelanded: n2, afterRemoveSamePage: n3, afterRemoveRelanded: n4});
                log(`[${lab} notices]`, JSON.stringify({n0, n1, n2, n3, n4}));
            }
            await signOut(page);
        } finally { await close(); }
    });
    // ---- needs: removing the last editor → "Needs editor" ------------------------------------------
    async function needsView(page, label) {
        await page.goto(ctxUrl(sc.ctx, '/dashboard/editorial')); await idle(page);
        const link = page.locator('a[href*="dashboard/editorial"]').filter({has: page.getByText('Needs editor', {exact: true})}).first();
        const has = await link.count();
        if (has) { await link.click(); await idle(page); }
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const s = await snap(page, label);
        const main = (s.text && s.text.main) || '';
        const row = page.getByRole('row').filter({hasText: sc.N.title});
        const out = {viewLink: has, listed: main.includes(sc.N.title), heading: flat((main.match(/Needs editor[^\n]*/) || [])[0], 80), rowText: (await row.count()) ? flat(await row.first().innerText(), 300) : null, assignEditor: (await row.count()) ? await row.first().getByRole('button', {name: /Assign Editor/}).count() : null};
        record(`${label}-summary`, out);
        log(`[${label}]`, JSON.stringify(out));
        return out;
    }
    if (on('needs')) await sect('needs', async () => {
        if (sc.Ndone) {
            const s = await app.api.createSubmission({tag: `${t}n${Date.now() % 100000}`, context: sc.ctx, submitter: `${t}au`, title: `K4 needs again ${t}`, participants: [{username: `${t}se`, role: 'sectionEditor'}]});
            sc.N = {id: s.submissionId, title: `K4 needs again ${t}`}; save();
        }
        sc.Ndone = true; save();
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await needsView(page, 'nd-mgr-before');
            await openWf(page, sc.N.id, L.stageA, 'nd-mgr-wf');
            await removeRow(page, 'se', 'nd-mgr-se-ok', {press: 'ok'});
            await needsView(page, 'nd-mgr-after');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- seremove: td10 as the assigned Section Editor on T ----------------------------------------
    if (on('seremove')) await sect('seremove', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'se');
            await openWf(page, sc.T.id, L.stageA, 't-se-before');
            await allMenus(page, 't-se', [isOPS ? 'mgr2' : 'ed', 'se', 'au']);
            await removeRow(page, isOPS ? 'mgr2' : 'ed', 't-se-ed-ok', {press: 'ok'});
            await openWf(page, sc.T.id, L.stageA, 't-se-after-ed');
            await removeRow(page, 'se', 't-se-own-ok', {press: 'ok'});
            await openWf(page, sc.T.id, L.stageA, 't-se-after-own-reland');
            await openWf(page, sc.T.id, null, 't-se-after-own-nokey');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- a2: the recommending editor removes the deciding one (Q); Rule 9 both ends --------------
    if (on('a2')) await sect('a2', async () => {
        const {page, close} = await session();
        try {
            const key = isOPS ? 'workflow_5' : roundKey(sc.Q);
            await as(page, 'ser');
            await openWf(page, sc.Q.id, key, 'q-ser-before');
            await allMenus(page, 'q-ser', ['se', 'ser', 'au']);
            await removeRow(page, 'se', 'q-ser-se-ok', {press: 'ok'});
            await openWf(page, sc.Q.id, key, 'q-ser-after');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- td9: the recommending Editor on a review round; control an unassigned Editor ------------
    if (on('td9')) await sect('td9', async () => {
        const {page, close} = await session();
        try {
            const k1 = isOPS ? 'workflow_5' : roundKey(sc.D);
            const k2 = isOPS ? 'workflow_5' : roundKey(sc.D2);
            await as(page, 'edr');
            await openWf(page, sc.D.id, k1, 'd-edr-with-deciding');
            await openWf(page, sc.D2.id, k2, 'd2-edr-alone');
            await signOut(page);
            await as(page, isOPS ? 'mgr' : 'ed');
            await openWf(page, sc.D.id, k1, 'd-ed-unassigned-control');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- roles: the Roles form's two boxes, per role, on a fresh context B --------------------------
    async function rolesTab(page, ctx) {
        await page.goto(ctxUrl(ctx, '/management/settings/access')); await idle(page);
        await page.getByRole('tab', {name: 'Roles'}).click(); await idle(page);
        await page.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
    }
    async function roleForm(page, ctx, roleName, label, {set} = {}) {
        const row = page.getByRole('row').filter({has: page.getByText(roleName, {exact: true})}).first();
        if (!(await row.count())) return {rowAbsent: true};
        const settings = row.getByRole('link', {name: 'Settings'});
        if (!(await settings.count())) return {settingsAbsent: true};
        await settings.click();
        const edit = page.getByRole('link', {name: 'Edit', exact: true}).first();
        await edit.waitFor({timeout: 10000}).catch(() => {});
        if (!(await edit.count())) return {editAbsent: true};
        await edit.click();
        const form = page.getByRole('dialog').filter({has: page.locator('input[name="permitMetadataEdit"]')}).last();
        await form.locator('input[name="permitMetadataEdit"]').waitFor({state: 'attached', timeout: 30000});
        await idle(page);
        const read = await form.evaluate((d) => {
            const vis = (e) => e.getClientRects().length > 0;
            const box = (n) => { const i = d.querySelector(`input[name="${n}"]`); if (!i) return null; const l = (i.id && d.querySelector(`label[for="${i.id}"]`)) || i.closest('label'); return {visible: vis(i), checked: i.checked, disabled: i.disabled, label: l ? l.innerText.trim().replace(/\s+/g, ' ') : null}; };
            const level = d.querySelector('select[name="roleId"]');
            return {recommendOnly: box('recommendOnly'), permitMetadataEdit: box('permitMetadataEdit'), level: level ? level.options[level.selectedIndex].text : null, roleOptions: [...d.querySelectorAll('input[type=checkbox]')].filter(vis).map((i) => { const l = (i.id && d.querySelector(`label[for="${i.id}"]`)) || i.closest('label'); return `${i.name}:${i.checked ? 'on' : 'off'}${i.disabled ? ':disabled' : ''}:${l ? l.innerText.trim().slice(0, 60) : ''}`; })};
        }).catch((e) => ({error: String(e.message)}));
        await snap(page, label, {form: read});
        const out = {read};
        if (set) {
            for (const [n, v] of Object.entries(set)) { const i = form.locator(`input[name="${n}"]`); if (v) await i.check(); else await i.uncheck(); }
            await form.getByRole('button', {name: 'OK', exact: true}).click();
            await form.waitFor({state: 'detached', timeout: 30000}).catch(() => {});
            await idle(page);
            out.saved = true;
        } else {
            const c = form.getByRole('link', {name: /^\s*Cancel\s*$/}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
            await c.click().catch(() => {});
            await form.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
            await idle(page);
        }
        log(`[${label}]`, JSON.stringify(read));
        return out;
    }
    if ((on('roles') || on('settings')) && !sc.B) {
        const tb = tag('u35k4b');
        const users = [{username: `${tb}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${tb}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${tb}seb`, roles: ['sectionEditor'], givenName: 'Ben', familyName: 'Bystander'}];
        const body = {tag: tb, context: {name: `U35 K4 B ${tb}`, contactName: 'K4 Contact', contactEmail: `${tb}contact@mail.test`}, users};
        if (isOPS) { body.sections = [{abbrev: 'PRE', title: 'Preprints'}]; users.push({username: `${tb}sea`, roles: ['sectionEditor'], givenName: 'Auto', familyName: 'Assigned', sections: ['PRE']}); }
        else if (isOJS) { body.sections = [{abbrev: 'ART', title: 'Articles'}]; users.push({username: `${tb}sea`, roles: ['sectionEditor'], givenName: 'Auto', familyName: 'Assigned', sections: ['ART']}); }
        else users.push({username: `${tb}sea`, roles: ['sectionEditor'], givenName: 'Auto', familyName: 'Assigned'});
        const c = await app.api.createContext(body);
        sc.B = {ctx: c.path || tb, t: tb};
        for (const k of ['mgr', 'au', 'seb', 'sea']) u[`B${k}`] = {username: `${tb}${k}`, name: users.find((x) => x.username === `${tb}${k}`).givenName + ' ' + users.find((x) => x.username === `${tb}${k}`).familyName};
        // X0, X1: the Section Editor assigned before the Roles change; X3 (OJS, OPS): a draft the author submits
        // through the wizard after the change, so the section's editor arrives by the automatic assignment.
        const parts = [{username: `${tb}sea`, role: 'sectionEditor'}];
        for (const key of ['X0', 'X1']) {
            const s = await app.api.createSubmission({tag: `${tb}${key.toLowerCase()}`, context: sc.B.ctx, submitter: `${tb}au`, title: `K4 B ${key} ${tb}`, participants: parts});
            sc.B[key] = {id: s.submissionId, title: `K4 B ${key} ${tb}`};
        }
        if (!isOMP) {
            const s = await app.api.createSubmission({tag: `${tb}x3`, context: sc.B.ctx, submitter: `${tb}au`, title: `K4 B X3 ${tb}`, submitted: false});
            sc.B.X3 = {id: s.submissionId, title: `K4 B X3 ${tb}`};
        }
        save();
    }
    if (on('roles')) await sect('roles', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'Bmgr', sc.B.ctx);
            await rolesTab(page, sc.B.ctx);
            const names = await page.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => (tr.querySelector('td') || {}).innerText?.trim()).filter(Boolean));
            record('b-roles-names', {names});
            const out = {};
            for (const n of names) { out[n] = await roleForm(page, sc.B.ctx, n, `b-role-${n.replace(/[^a-z0-9]+/gi, '')}`); await rolesTab(page, sc.B.ctx); }
            record('b-roles-forms', out);
            await signOut(page);
        } finally { await close(); }
    });
    // ---- settings: flip the Section Editor role (recommend only on, metadata edit off) --------------
    if (on('settings')) await sect('settings', async () => {
        const {page, close} = await session();
        try {
            const B = sc.B;
            const stage = isOPS ? 'workflow_5' : 'workflow_1';
            await as(page, 'Bmgr', B.ctx);
            for (const key of ['X0', 'X1']) { await openWf(page, B[key].id, stage, `b-${key}-before`, B.ctx); await editRow(page, 'Bsea', `b-${key}-sea-before`, {press: 'cancel'}); }
            await rolesTab(page, B.ctx);
            await roleForm(page, B.ctx, L.se, 'b-role-se-flip', {set: {recommendOnly: true, permitMetadataEdit: false}});
            await rolesTab(page, B.ctx);
            await roleForm(page, B.ctx, L.se, 'b-role-se-after');
            for (const key of ['X0', 'X1']) { await openWf(page, B[key].id, stage, `b-${key}-after`, B.ctx); await editRow(page, 'Bsea', `b-${key}-sea-after`, {press: 'cancel'}); }
            if (!B.X2) {
                const s2 = await app.api.createSubmission({tag: `${B.t}x2`, context: B.ctx, submitter: `${B.t}au`, title: `K4 B X2 ${B.t}`});
                B.X2 = {id: s2.submissionId, title: `K4 B X2 ${B.t}`}; save();
            }
            await openWf(page, B.X2.id, stage, 'b-X2-after', B.ctx);
            await assign(page, 'b-X2-seb', {role: L.se, k: 'Bseb', press: null});
            await snap(page, 'b-X2-seb-assign-open');
            await signOut(page);
            // the automatic assignment after the change: the author submits X3 through the wizard
            if (B.X3 && !B.X3.submitted) {
                await as(page, 'Bau', B.ctx);
                if (isOJS) {
                    const {SubmissionWizardPage} = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPage.js'));
                    const w = new SubmissionWizardPage(page, B.ctx);
                    await w.goto(B.X3.id);
                    await snap(page, 'b-X3-wizard-open');
                    const filed = await page.locator('.listPanel__item--submissionFile').filter({hasText: 'Article Text'}).count();
                    if (!filed) await w.uploadFile();
                    else { const g = page.getByRole('button', {name: 'Article Text', exact: true}); if (await g.count()) { await g.first().click(); await idle(page); } }
                    for (let i = 0; i < 6; i++) {
                        const cur = await w.currentStepLabel().innerText().catch(() => '');
                        if (/^\s*Review\s*$/.test(cur) || /(^|\s)Review$/.test(cur.trim())) break;
                        await w.continueButton().click(); await idle(page); await sleep(800);
                    }
                    await w.submitAndConfirm();
                } else {
                    const W = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPages.js'));
                    await page.goto(W.wizardUrl(B.ctx, B.X3.id)); await idle(page);
                    await W.completeAndSubmitDraft(page);
                }
                B.X3.submitted = true; save();
                await snap(page, 'b-X3-submitted');
                await signOut(page);
            }
            if (B.X3) {
                await as(page, 'Bmgr', B.ctx);
                await openWf(page, B.X3.id, stage, 'b-X3-auto', B.ctx);
                await editRow(page, 'Bsea', 'b-X3-sea', {press: 'cancel'});
                await activityLog(page, 'b-X3-log');
                await signOut(page);
            }
        } finally { await close(); }
    });
    save();
});
